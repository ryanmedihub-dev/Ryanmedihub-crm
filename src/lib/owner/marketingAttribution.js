import AdSpend from "@/models/AdSpend";
import Leads from "@/models/Leads";
import Patient from "@/models/Patient";
import { normalizePhone } from "@/lib/phone";
import { CONVERTED_STATUSES } from "@/lib/owner/patientStatus";

export const TAG_BY_PLATFORM = { Meta: "Meta Leads", Google: "Google Leads" };
export const MARKETING_CONVERTED_STATUSES = CONVERTED_STATUSES;
const PLATFORM_BY_TAG = Object.fromEntries(Object.entries(TAG_BY_PLATFORM).map(([p, t]) => [t, p]));

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
