import { ALL_BRANCHES } from "@/lib/branches";

export const OWNER_BRANCHES = ["All", ...ALL_BRANCHES];

export const DATE_RANGES = [
  "Today", "Yesterday", "This Week", "This Month", "Last 7 Days", "Last 30 Days", "Custom",
];

export const DEFAULT_DATE_RANGE = "Today";

export const FORWARD_DATE_RANGES = ["Today", "Next 7 Days", "Next 30 Days", "Custom"];

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
    
    from = new Date(now);
    const dow = (from.getDay() + 6) % 7; 
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
