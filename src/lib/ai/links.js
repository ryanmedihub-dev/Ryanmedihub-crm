// Link allow-list for AI-generated hrefs. The route list itself lives in
// src/lib/owner/navTree.js — the same tree the sidebar and breadcrumbs read.
import { OWNER_NAV_ITEMS } from "@/lib/owner/navTree";

export const OWNER_LINK_ITEMS = OWNER_NAV_ITEMS;
export const OWNER_LINKS = OWNER_NAV_ITEMS.map((i) => i.href);

const DETAIL_PATTERNS = [
  /^\/owner\/employees\/[a-z-]+\/[a-zA-Z0-9]+$/,
  /^\/owner\/patients\/[a-zA-Z0-9]+$/,
];

const LINK_SET = new Set(OWNER_LINKS);

export function isAllowedLink(href) {
  if (typeof href !== "string" || !href) return false;
  const path = href.split("?")[0];
  if (LINK_SET.has(path)) return true;
  return DETAIL_PATTERNS.some((re) => re.test(path));
}
