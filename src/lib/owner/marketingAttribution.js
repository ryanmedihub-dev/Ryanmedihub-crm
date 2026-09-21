import AdSpend from "@/models/AdSpend";
import Leads from "@/models/Leads";
import Patient from "@/models/Patient";
import { normalizePhone } from "@/lib/phone";
import { CONVERTED_STATUSES } from "@/lib/owner/patientStatus";

// Shared attribution logic for the Marketing section (Owner Panel v2, Part 4).
// Pulled out of the original src/app/api/owner/marketing-summary/route.js
// inline copy so the landing page, the Ad Spend return picture, and the
// Comparison page all compute the same numbers the same way — one
// implementation, not three.
//
// IMPORTANT — this is 100% local data, not callby. The brief assumed lead
// source came from callby's Lead.tag; it doesn't — src/models/Leads.js is a
// ryan-crm-local inquiry table (website form / Collab intake) with its own
// `tag` field. callby's Lead/CallLog (the telecalling workflow) plays no part
// in ad attribution. See the Part 4 report for the full finding.
//
// ATTRIBUTION WINDOW (stated once here, shown on every page that uses this):
//   - Spend counts in the period it was entered for (AdSpend.date in [from,to]).
//   - A Leads row counts in the period if Leads.createdAt falls in [from,to].
//   - Conversion/revenue count WHENEVER THEY HAPPENED — not bounded to the
//     period — because a patient's payment can land months after the lead.
//     So "Converted"/"Revenue"/"CAC"/"ROAS" answer "of the leads this
//     period's spend produced, what have they generated SO FAR", not
//     "revenue collected this period".
//   - "Converted" uses the panel-wide CONVERTED_STATUSES (paid in full or
//     surgery done) so marketing CAC/ROAS agree with every other page.
//
// PER-CAMPAIGN LIMIT: Leads.tag only distinguishes platform (Meta/Google/
// Form/Collab), never campaign — the per-platform attribution below still can't go finer
// than that. Per-campaign attribution NOW EXISTS via a different path: CampaignLead
// (src/models/CampaignLead.js) is uploaded against a specific campaign, so campaign is
// captured on the lead itself. See src/lib/owner/campaignAttribution.js — a separate
// implementation, not an extension of this one, because CampaignLead and Leads are
// different intake sources with different lifecycles. Campaign-scoped spend/clicks/CPC
// here (computeCampaignSpend below) is reused by that implementation rather than rebuilt.

export const TAG_BY_PLATFORM = { Meta: "Meta Leads", Google: "Google Leads" };
export const MARKETING_CONVERTED_STATUSES = CONVERTED_STATUSES;
const PLATFORM_BY_TAG = Object.fromEntries(Object.entries(TAG_BY_PLATFORM).map(([p, t]) => [t, p]));

/**
 * Full platform-level attribution: spend, clicks, leads, conversions, revenue.
 * @param {{platforms?: string[], branch?: string, from: Date, to: Date}} opts
 */
export async function attributeSpendToOutcomes({ platforms = ["Meta", "Google"], branch, from, to }) {
  const spendMatch = { platform: { $in: platforms }, date: { $gte: from, $lte: to } };
  if (branch && branch !== "All") spendMatch.branch = branch;

  const spendRows = await AdSpend.aggregate([
    { $match: spendMatch },
    {
      $group: {
        _id: { platform: "$platform", campaignName: "$campaignName", campaignId: "$campaignId" },
        spend: { $sum: "$amount" },
        clicks: { $sum: { $ifNull: ["$clicks", 0] } },
        clicksEntered: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$clicks", null] }, null] }, 1, 0] } },
      },
    },
  ]);

  const spendByPlatform = {};
  for (const p of platforms) spendByPlatform[p] = [];
  for (const r of spendRows) {
    spendByPlatform[r._id.platform].push({
      campaignName: r._id.campaignName || "",
      campaignId: r._id.campaignId ? String(r._id.campaignId) : null,
      spend: r.spend,
      clicks: r.clicks,
      clicksEntered: r.clicksEntered > 0,
    });
  }

  // Leads attribution ignores branch (Leads has no branch field) and campaign
  // (see the per-campaign limit above).
  const tags = platforms.map((p) => TAG_BY_PLATFORM[p]).filter(Boolean);
  const leadsInRange = tags.length
    ? await Leads.find({ tag: { $in: tags }, createdAt: { $gte: from, $lte: to } }).select("phone tag").lean()
    : [];

  const platformPhones = {};
  const platformLeadCount = {};
  for (const p of platforms) {
    platformPhones[p] = new Set();
    platformLeadCount[p] = 0;
  }
  for (const lead of leadsInRange) {
    const platform = PLATFORM_BY_TAG[lead.tag];
    if (!platform || !platformPhones[platform]) continue;
    platformLeadCount[platform] += 1;
    const norm = normalizePhone(lead.phone);
    if (norm) platformPhones[platform].add(norm);
  }

  const allPhones = [...new Set(platforms.flatMap((p) => [...platformPhones[p]]))];
  const patients = allPhones.length
    ? await Patient.find({ "personal.phoneNormalized": { $in: allPhones } })
        .select("personal.phoneNormalized ops.status payments.totalAmount")
        .lean()
    : [];
  const patientByPhone = new Map();
  for (const p of patients) if (p.personal?.phoneNormalized) patientByPhone.set(p.personal.phoneNormalized, p);

  function outcomesFor(platform) {
    const counted = new Set();
    let converted = 0;
    let revenue = 0;
    for (const phone of platformPhones[platform]) {
      const patient = patientByPhone.get(phone);
      if (!patient || !MARKETING_CONVERTED_STATUSES.includes(patient.ops?.status)) continue;
      const pid = String(patient._id);
      if (counted.has(pid)) continue;
      counted.add(pid);
      converted += 1;
      revenue += patient.payments?.totalAmount || 0;
    }
    return { converted, revenue };
  }

  const byPlatform = {};
  for (const platform of platforms) {
    const campaigns = spendByPlatform[platform];
    const spend = campaigns.reduce((s, c) => s + c.spend, 0);
    const clicksEntered = campaigns.some((c) => c.clicksEntered);
    const clicks = clicksEntered ? campaigns.reduce((s, c) => s + c.clicks, 0) : null;
    const leads = platformLeadCount[platform];
    const { converted, revenue } = outcomesFor(platform);

    byPlatform[platform] = {
      spend,
      clicks,
      leads,
      converted,
      revenue,
      cpl: leads > 0 ? spend / leads : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cac: converted > 0 ? spend / converted : null,
      roas: spend > 0 ? revenue / spend : null,
      campaigns,
    };
  }

  return { byPlatform };
}

/**
 * Campaign-scoped spend/clicks/CPC only — leads/conversions/revenue cannot be
 * attributed per campaign with current data (see the per-campaign limit
 * above), so this deliberately does not attempt it.
 */
export async function computeCampaignSpend({ campaignId, from, to }) {
  const match = { campaignId, date: { $gte: from, $lte: to } };
  const [row] = await AdSpend.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        spend: { $sum: "$amount" },
        clicks: { $sum: { $ifNull: ["$clicks", 0] } },
        clicksEntered: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$clicks", null] }, null] }, 1, 0] } },
      },
    },
  ]);
  const spend = row?.spend || 0;
  const clicks = row?.clicksEntered > 0 ? row.clicks : null;
  return { spend, clicks, cpc: clicks > 0 ? spend / clicks : null };
}
