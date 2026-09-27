

export function campaignSourceLabel(campaign) {
  const name = String(campaign?.name || "").trim().slice(0, 100);
  return `${campaign.platform} · ${name}`;
}
