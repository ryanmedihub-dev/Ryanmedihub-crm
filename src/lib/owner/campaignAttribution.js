import CampaignLead from "@/models/CampaignLead";
import AdCampaign from "@/models/AdCampaign";
import Patient from "@/models/Patient";
import { computeCampaignSpend } from "@/lib/owner/marketingAttribution";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { CONVERTED_STATUSES, VISITED_EXCLUDED_STATUSES } from "@/lib/owner/patientStatus";
import { BANDS, INTEREST_MIN_SCORE } from "@/lib/owner/engagementBands";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { parsePageParams, pageMeta } from "@/lib/owner/pagination";

const BAND_LABEL_BY_KEY = Object.fromEntries(BANDS.map((b) => [b.key, b.label]));

// ATTRIBUTION WINDOW (matches src/lib/owner/marketingAttribution.js's rule — the two must
// never disagree):
//   - Spend counts in the period it was entered for (AdSpend.date in [from, to]).
//   - A CampaignLead counts in the period if its leadDate falls in [from, to].
//   - Calls count in the period (callby is queried with the same dateFrom/dateTo)...
//   - ...but conversion and revenue count WHENEVER THEY HAPPENED, unbounded. A patient's
//     payment can land months after the lead. So "Converted"/"Revenue"/"CAC"/"ROAS" answer
//     "of the leads this period's spend produced, what have they generated SO FAR" — never
//     "revenue collected this period".
//   - "Converted" uses the panel-wide CONVERTED_STATUSES so marketing CAC/ROAS agree with
//     every other page in the panel.
export const ATTRIBUTION_WINDOW_NOTE = [
  "Spend counts in the period it was entered for. A lead counts in the period it arrived (leadDate).",
  "Calls are queried from callby for the same date range.",
  "Converted / Revenue / CAC / ROAS are unbounded — a patient's payment can land months after the lead, so these answer \"what has this period's leads generated so far\", not \"revenue collected this period\".",
];

const PHONE_MATCH_BATCH = 1000;
const PHONE_MATCH_CONCURRENCY = 4;
const PATIENT_IN_CHUNK = 5000;

const ratio = (num, den) => (den > 0 ? num / den : null);

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Batches callby's POST /api/leads/phone-match at 1000 phones/request, 4-way concurrent.
 * @returns { matches: Map<phone, matchRow>|null, callbyError: string|null }
 *   matches is null (not an empty Map) when the call failed entirely — callers must
 *   distinguish "callby said nothing about this phone" (0 calls, matches present) from
 *   "we couldn't ask callby" (— , matches null).
 */
async function fetchPhoneMatchesBatched(phones, { dateFrom, dateTo }) {
  if (phones.length === 0) return { matches: new Map(), callbyError: null };

  const chunks = [];
  for (let i = 0; i < phones.length; i += PHONE_MATCH_BATCH) chunks.push(phones.slice(i, i + PHONE_MATCH_BATCH));

  const matches = new Map();
  try {
    await mapWithConcurrency(chunks, PHONE_MATCH_CONCURRENCY, async (chunk) => {
      const body = { phones: chunk };
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      const result = await fetchCallby("/api/leads/phone-match", { method: "POST", body });
      const data = result?.data || result;
      for (const [phone, m] of Object.entries(data?.matches || {})) matches.set(phone, m);
    });
  } catch (err) {
    return { matches: null, callbyError: err instanceof CallbyError ? err.message : "Failed to load callby data" };
  }
  return { matches, callbyError: null };
}

/** One query, $in chunked at 5000 — never one query per campaign. */
async function fetchPatientsByPhone(phones) {
  const byPhone = new Map();
  for (let i = 0; i < phones.length; i += PATIENT_IN_CHUNK) {
    const chunk = phones.slice(i, i + PATIENT_IN_CHUNK);
    const rows = await Patient.find({ "personal.phoneNormalized": { $in: chunk } })
      .select("personal.phoneNormalized ops.status payments.amountReceived payments.totalAmount personal.branch")
      .lean();
    for (const p of rows) {
      const key = p.personal?.phoneNormalized;
      if (key && !byPhone.has(key)) byPhone.set(key, p);
    }
  }
  return byPhone;
}

/**
 * @param {{from: string, to: string, platform?: string, branch?: string, campaignId?: string}} opts
 *   from/to are plain YYYY-MM-DD strings (owner filter convention).
 */
export async function getCampaignPerformance({ from, to, platform, branch, campaignId }) {
  const campaignMatch = {};
  if (platform) campaignMatch.platform = platform;
  if (branch && branch !== "All") campaignMatch.branch = branch;
  if (campaignId) campaignMatch._id = campaignId;

  const campaigns = await AdCampaign.find(campaignMatch).select("name platform branch status").lean();
  if (campaigns.length === 0) {
    return { campaigns: [], overlapCount: 0, callbyError: null, window: ATTRIBUTION_WINDOW_NOTE };
  }
  const campaignIds = campaigns.map((c) => c._id);

  const leadDateBounds = {};
  if (from) leadDateBounds.$gte = getISTStartOfDay(from);
  if (to) leadDateBounds.$lte = getISTEndOfDay(to);
  const leadMatch = { campaign: { $in: campaignIds } };
  if (Object.keys(leadDateBounds).length) leadMatch.leadDate = leadDateBounds;

  const leadRows = await CampaignLead.find(leadMatch).select("campaign phoneNormalized").lean();

  const leadsByCampaign = new Map();
  for (const id of campaignIds) leadsByCampaign.set(String(id), []);
  const phoneToCampaigns = new Map(); // phoneNormalized -> Set(campaignIdStr) — for overlap
  for (const l of leadRows) {
    const key = String(l.campaign);
    if (!leadsByCampaign.has(key)) leadsByCampaign.set(key, []);
    leadsByCampaign.get(key).push(l);
    if (l.phoneNormalized) {
      if (!phoneToCampaigns.has(l.phoneNormalized)) phoneToCampaigns.set(l.phoneNormalized, new Set());
      phoneToCampaigns.get(l.phoneNormalized).add(key);
    }
  }
  const overlapCount = [...phoneToCampaigns.values()].filter((s) => s.size > 1).length;

  const allPhones = [...new Set(leadRows.map((l) => l.phoneNormalized).filter(Boolean))];
  const [{ matches: callbyMatches, callbyError }, patientByPhone] = await Promise.all([
    fetchPhoneMatchesBatched(allPhones, { dateFrom: from, dateTo: to }),
    fetchPatientsByPhone(allPhones),
  ]);

  const spendFrom = from ? new Date(from) : new Date(0);
  const spendTo = to ? new Date(to) : new Date();

  const results = await Promise.all(
    campaigns.map(async (campaign) => {
      const key = String(campaign._id);
      const leads = leadsByCampaign.get(key) || [];
      const uniquePhones = [...new Set(leads.map((l) => l.phoneNormalized).filter(Boolean))];

      const spendInfo = await computeCampaignSpend({ campaignId: campaign._id, from: spendFrom, to: spendTo });

      let leadsCalled = null, leadsConnected = null, totalCalls = null, totalDurationSeconds = null, leadsInterested = null;
      const byEngagement = callbyMatches ? Object.fromEntries(BANDS.map((b) => [b.key, 0])) : null;
      if (callbyMatches) {
        leadsCalled = 0; leadsConnected = 0; totalCalls = 0; totalDurationSeconds = 0; leadsInterested = 0;
        for (const p of uniquePhones) {
          const m = callbyMatches.get(p);
          if (!m) continue;
          if (m.calls > 0) { leadsCalled += 1; totalCalls += m.calls; totalDurationSeconds += m.totalDurationSeconds || 0; }
          if (m.connected > 0) leadsConnected += 1;
          if (typeof m.bestEngagementScore === "number" && m.bestEngagementScore >= INTEREST_MIN_SCORE) leadsInterested += 1;
          if (m.bestEngagement && byEngagement[m.bestEngagement] !== undefined) byEngagement[m.bestEngagement] += 1;
        }
      }
      const avgCallSeconds = totalCalls ? Math.round(totalDurationSeconds / totalCalls) : null;

      let patientsMatched = 0, visited = 0, converted = 0, revenue = 0, packageValue = 0;
      for (const p of uniquePhones) {
        const patient = patientByPhone.get(p);
        if (!patient) continue;
        patientsMatched += 1;
        if (!VISITED_EXCLUDED_STATUSES.includes(patient.ops?.status)) visited += 1;
        if (CONVERTED_STATUSES.includes(patient.ops?.status)) converted += 1;
        // Revenue = money actually received, not the package value (which includes what's
        // still pending) — the honest figure for ROAS against real spend. packageValue is
        // exposed separately so the two are never silently conflated.
        revenue += patient.payments?.amountReceived || 0;
        packageValue += patient.payments?.totalAmount || 0;
      }

      const sharedWithCampaigns = uniquePhones.filter((p) => (phoneToCampaigns.get(p)?.size || 0) > 1).length;

      return {
        campaignId: key,
        campaignName: campaign.name,
        platform: campaign.platform,
        branch: campaign.branch,
        status: campaign.status,
        spend: spendInfo.spend,
        clicks: spendInfo.clicks,
        cpc: spendInfo.cpc,
        leadsUploaded: leads.length,
        leadsCalled, leadsConnected, totalCalls, avgCallSeconds, leadsInterested, byEngagement,
        patientsMatched, visited, converted, revenue, packageValue,
        cpl: ratio(spendInfo.spend, leads.length),
        costPerConnectedLead: leadsConnected != null ? ratio(spendInfo.spend, leadsConnected) : null,
        cac: ratio(spendInfo.spend, converted),
        roas: ratio(revenue, spendInfo.spend),
        sharedWithCampaigns,
      };
    }),
  );

  return { campaigns: results, overlapCount, callbyError, window: ATTRIBUTION_WINDOW_NOTE };
}

/**
 * Lead-level drill-through for one campaign — paginated server-side, never the whole
 * campaign's leads shipped to the browser. The per-lead callby/patient join only runs over
 * this page's phones (25-200), not the whole campaign, so it stays cheap regardless of how
 * many leads the campaign has in total.
 */
export async function getCampaignLeadDetail({ campaignId, from, to, searchParams }) {
  const { page, pageSize, skip, limit } = parsePageParams(searchParams);

  const leadDateBounds = {};
  if (from) leadDateBounds.$gte = getISTStartOfDay(from);
  if (to) leadDateBounds.$lte = getISTEndOfDay(to);
  const match = { campaign: campaignId };
  if (Object.keys(leadDateBounds).length) match.leadDate = leadDateBounds;

  const [leads, total] = await Promise.all([
    CampaignLead.find(match).sort({ leadDate: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    CampaignLead.countDocuments(match),
  ]);

  const phones = [...new Set(leads.map((l) => l.phoneNormalized).filter(Boolean))];
  const [{ matches: callbyMatches, callbyError }, patientByPhone] = await Promise.all([
    fetchPhoneMatchesBatched(phones, { dateFrom: from, dateTo: to }),
    fetchPatientsByPhone(phones),
  ]);

  const rows = leads.map((l) => {
    const m = callbyMatches ? callbyMatches.get(l.phoneNormalized) : null;
    const patient = patientByPhone.get(l.phoneNormalized) || null;
    return {
      id: String(l._id),
      name: l.name || "",
      phone: l.phone || "",
      uploadedAt: l.createdAt,
      leadDate: l.leadDate,
      calls: m ? m.calls || 0 : null,
      lastEngagementBand: m?.lastEngagement ? (BAND_LABEL_BY_KEY[m.lastEngagement] || m.lastEngagement) : (callbyMatches ? "—" : null),
      lastAgent: m?.lastEmployeeName || (callbyMatches ? "—" : null),
      patientStatus: patient?.ops?.status || null,
      amountReceived: patient?.payments?.amountReceived || 0,
    };
  });

  return { rows, ...pageMeta({ page, pageSize, total }), callbyError };
}
