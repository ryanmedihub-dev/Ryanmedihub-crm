
const IST = "Asia/Kolkata";

export const AGEING_BUCKETS = [
  { value: "current", label: "Current (not yet due)", min: null, max: 0 },
  { value: "1-30", label: "1–30 days", min: 1, max: 30 },
  { value: "31-60", label: "31–60 days", min: 31, max: 60 },
  { value: "61-90", label: "61–90 days", min: 61, max: 90 },
  { value: "90+", label: "90+ days", min: 91, max: null },
];

const BUCKET_VALUES = new Set(AGEING_BUCKETS.map((b) => b.value));

/**
 * "current" means not yet due, so it is the one bucket that is NOT overdue.
 * An unrecognised bucket is not counted as overdue — better to under-report
 * than to call a healthy balance late.
 */
export function isOverdueBucket(bucket) {
  return BUCKET_VALUES.has(bucket) && bucket !== "current";
}

/** Human label for a bucket value, falling back to the raw value. */
export function bucketLabel(bucket) {
  return AGEING_BUCKETS.find((b) => b.value === bucket)?.label || bucket || "—";
}

/** Badge tone for a bucket value: good / warn / bad. */
export function bucketTone(bucket) {
  if (bucket === "current") return "good";
  if (bucket === "1-30" || bucket === "31-60") return "warn";
  if (bucket === "61-90" || bucket === "90+") return "bad";
  return "neutral";
}

export function buildAgeingStages() {
  const hasDueDate = { $ne: [{ $ifNull: ["$dueDate", null] }, null] };

  return [
    {
      $addFields: {
        daysOverdue: {
          $cond: [
            hasDueDate,
            { $dateDiff: { startDate: "$dueDate", endDate: "$$NOW", unit: "day", timezone: IST } },
            null,
          ],
        },
      },
    },
    {
      $addFields: {
        daysToDue: {
          $cond: [{ $ne: ["$daysOverdue", null] }, { $multiply: ["$daysOverdue", -1] }, null],
        },
        ageingBucket: {
          $switch: {
            branches: [
              { case: { $eq: ["$daysOverdue", null] }, then: null },
              { case: { $lte: ["$daysOverdue", 0] }, then: "current" },
              { case: { $lte: ["$daysOverdue", 30] }, then: "1-30" },
              { case: { $lte: ["$daysOverdue", 60] }, then: "31-60" },
              { case: { $lte: ["$daysOverdue", 90] }, then: "61-90" },
            ],
            default: "90+",
          },
        },
      },
    },
  ];
}

export const AGEING_SORT = { daysOverdue: -1, createdAt: -1 };

export function formatAgeing(daysOverdue) {
  if (daysOverdue === null || daysOverdue === undefined) {
    return { text: "—", tone: "none" };
  }
  if (daysOverdue > 0) {
    return { text: `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`, tone: "overdue" };
  }
  if (daysOverdue === 0) return { text: "due today", tone: "today" };
  const inDays = -daysOverdue;
  return { text: `due in ${inDays} day${inDays === 1 ? "" : "s"}`, tone: "upcoming" };
}

export const AGEING_TONE_CLASSES = {
  overdue: "text-red-600 font-semibold",
  today: "text-amber-600 font-semibold",
  upcoming: "text-gray-500",
  none: "text-gray-400",
};
