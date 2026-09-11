import { ALL_BRANCHES } from "@/lib/branches";

// One branch list for every owner filter bar (was copy-pasted as BRANCHES / BRANCH_OPTIONS
// in 9 pages).
export const OWNER_BRANCHES = ["All", ...ALL_BRANCHES];

// Backward-looking ranges — used by dashboard, marketing, finance, conversion,
// counsellor-conversion. (Was an identical 20-line copy in each; consolidated here.)
export const DATE_RANGES = [
  "Today", "Yesterday", "This Week", "This Month", "Last 7 Days", "Last 30 Days", "Custom",
];

// Every owner list page defaults to today (Owner Panel v2, F3).
export const DEFAULT_DATE_RANGE = "Today";

// Forward-looking ranges — surgery-planner only (it plans surgeries ahead, not behind).
export const FORWARD_DATE_RANGES = ["Today", "Next 7 Days", "Next 30 Days", "Custom"];

/**
 * A [from, to] window (ISO strings, day-boundary aligned) for a backward range label.
 * Identical to the five copies it replaces.
 */
export function buildDateRange(range, custom = {}) {
  const now = new Date();
  let from = new Date();
  let to = new Date();
  to.setHours(23, 59, 59, 999);

  if (range === "Today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "Yesterday") {
    from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (range === "This Week") {
    // Week starts Monday (India convention).
    from = new Date(now);
    const dow = (from.getDay() + 6) % 7; // 0 = Monday
    from.setDate(from.getDate() - dow);
    from.setHours(0, 0, 0, 0);
  } else if (range === "This Month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
  } else if (range === "Last 7 Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (range === "Last 30 Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  } else if (range === "Custom" && custom.from) {
    from = new Date(custom.from);
    from.setHours(0, 0, 0, 0);
    to = custom.to ? new Date(custom.to) : new Date(custom.from);
    to.setHours(23, 59, 59, 999);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Forward window for surgery-planner: from = today start, to = today + N. */
export function buildForwardDateRange(range, custom = {}) {
  const now = new Date();
  let from = new Date(now);
  let to = new Date(now);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  if (range === "Next 7 Days") {
    to = new Date(now);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (range === "Next 30 Days") {
    to = new Date(now);
    to.setDate(to.getDate() + 29);
    to.setHours(23, 59, 59, 999);
  } else if (range === "Custom" && custom.from) {
    from = new Date(custom.from);
    from.setHours(0, 0, 0, 0);
    to = custom.to ? new Date(custom.to) : new Date(custom.from);
    to.setHours(23, 59, 59, 999);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}
