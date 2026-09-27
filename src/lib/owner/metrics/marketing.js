import AdSpend from "@/models/AdSpend";
import { attributeSpendToOutcomes } from "@/lib/owner/marketingAttribution";

const PLATFORMS = ["Meta", "Google"];

export async function getMarketingSummary({ branch = "All", from, to }) {
  const { byPlatform } = await attributeSpendToOutcomes({
    platforms: PLATFORMS, branch, from: new Date(from), to: new Date(to),
  });

  const rows = [];
  for (const platform of PLATFORMS) {
    const outcome = byPlatform[platform];
    const campaigns = outcome.campaigns;
    if (campaigns.length === 0) continue;

    if (campaigns.length === 1) {
      rows.push({
        platform,
        campaignName: campaigns[0].campaignName || null,
        isPlatformTotal: false,
        spend: outcome.spend, leads: outcome.leads, cpl: outcome.cpl,
        converted: outcome.converted, cac: outcome.cac, revenue: outcome.revenue, roas: outcome.roas,
      });
    } else {
      campaigns.forEach((c) => {
        rows.push({
          platform, campaignName: c.campaignName || "(unnamed)", isPlatformTotal: false,
          spend: c.spend, leads: null, cpl: null, converted: null, cac: null, revenue: null, roas: null,
        });
      });
      rows.push({
        platform, campaignName: null, isPlatformTotal: true,
        spend: outcome.spend, leads: outcome.leads, cpl: outcome.cpl,
        converted: outcome.converted, cac: outcome.cac, revenue: outcome.revenue, roas: outcome.roas,
      });
    }
  }

  
  const lastEntry = await AdSpend.findOne(branch !== "All" ? { branch } : {})
    .sort({ createdAt: -1 })
    .select("createdAt enteredBy")
    .lean();

  return {
    branch,
    note:
      branch !== "All"
        ? `Spend is scoped to ${branch}. Leads/CPL/Converted/Revenue/CAC/ROAS reflect all branches — the Leads collection has no branch field to scope them by.`
        : null,
    rows,
    lastUpdatedAt: lastEntry?.createdAt || null,
    lastUpdatedBy: lastEntry?.enteredBy?.name || null,
  };
}
