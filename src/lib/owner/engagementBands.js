// Mirrors callby's `backend/lib/engagement.js` BANDS table exactly (same keys, scores,
// labels, second boundaries) so a "band" means the same thing on both sides of the join.
// If that file changes, this one needs to change with it — there's a comment pointing back
// here in callby's copy. Bands are derived purely from call duration/type on callby's side,
// never from Lead.status.
export const BANDS = [
  { key: "NOT_CONNECTED", score: 0, label: "Not Connected", minSec: 0, maxSec: 0 },
  { key: "LOW", score: 1, label: "Low", minSec: 1, maxSec: 30 },
  { key: "CONTACTED", score: 2, label: "Contacted", minSec: 30, maxSec: 60 },
  { key: "ENGAGED", score: 3, label: "Engaged", minSec: 60, maxSec: 120 },
  { key: "INTERESTED", score: 4, label: "Interested", minSec: 120, maxSec: 180 },
  { key: "WARM", score: 5, label: "Warm", minSec: 180, maxSec: 300 },
  { key: "HOT", score: 6, label: "Hot", minSec: 300, maxSec: 480 },
  { key: "HIGH_ENGAGEMENT", score: 7, label: "High Engagement", minSec: 480, maxSec: Infinity },
];

export const ENGAGEMENT_KEYS = BANDS.map((b) => b.key);

// A lead an agent spoke to for three-plus minutes is behaving like an interested lead
// whether or not anyone tagged it — this is a duration signal, not Lead.status.
export const INTEREST_MIN_SCORE = 4;

const INTERESTED_KEYS = BANDS.filter((b) => b.score >= INTEREST_MIN_SCORE).map((b) => b.key);

/** Sum of the byEngagement counts for bands scoring >= INTEREST_MIN_SCORE. */
export function sumInterestedBands(byEngagement) {
  if (!byEngagement) return 0;
  return INTERESTED_KEYS.reduce((sum, key) => sum + (byEngagement[key] || 0), 0);
}
