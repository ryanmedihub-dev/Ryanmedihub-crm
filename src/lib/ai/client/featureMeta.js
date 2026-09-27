

export const AI_FEATURE_META = {
  "marketing.performance": { long: true },
  "marketing.campaignLeads": { long: true },
};

export function isLongFeature(feature) {
  return !!AI_FEATURE_META[feature]?.long;
}
