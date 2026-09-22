// The label written to callby's Lead.source for leads from a campaign upload.
// "<Platform> · <Campaign name>" — callby filters source with a case-insensitive regex in its
// lead and call reports, so the campaign name finds this campaign's leads while "meta" /
// "google" still finds every lead from that platform, exactly as it does today.
export function campaignSourceLabel(campaign) {
  const name = String(campaign?.name || "").trim().slice(0, 100);
  return `${campaign.platform} · ${name}`;
}
