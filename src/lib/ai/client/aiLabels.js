

export const VERDICT_LABELS = {
  star: "Star performer",
  solid: "Solid",
  watch: "Watch",
  at_risk: "At risk",
  insufficient_data: "Not enough data",
};

export const VERDICT_TONE = {
  star: "good",
  solid: "info",
  watch: "warn",
  at_risk: "bad",
  insufficient_data: "neutral",
};

export const VERDICT_LABEL_SETS = {
  performance: VERDICT_LABELS,
  followUp: {
    star: "Call today",
    solid: "Follow up this week",
    watch: "Low priority",
    at_risk: "Likely lost",
    insufficient_data: "Not enough data",
  },
  campaign: {
    star: "Scale",
    solid: "Keep",
    watch: "Optimise",
    at_risk: "Pause candidate",
    insufficient_data: "Too early",
  },
};

export const SEVERITY_TONE = { good: "good", info: "info", warn: "warn", crit: "bad" };

export const SENTIMENT_LABELS = {
  positive: "Positive",
  neutral: "Neutral",
  concerning: "Concerning",
  critical: "Critical",
};

export const SENTIMENT_TONE = { positive: "good", neutral: "info", concerning: "warn", critical: "bad" };

export const DIRECTION_ARROW = { up: "↑", down: "↓", flat: "→", improving: "↗", stable: "→", declining: "↘", unclear: "?" };

export function relativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
