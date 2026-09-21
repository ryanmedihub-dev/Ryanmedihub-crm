// Pure, dependency-free row logic for the campaign-lead bulk upload (Owner > Marketing >
// Campaign Leads). Imported by BOTH the browser preview and the server validator — no
// mongoose, no DB, no NextAuth, not even xlsx. Mirrors src/lib/uploads/payableRowMapper.js's
// shape; reuses its parseExcelDate rather than duplicating date parsing.
//
// Phone normalization is NOT done here — that needs @/lib/phone, which is fine to import
// (it's DB-free too), but is deliberately left to the server validator so this file's only
// job stays "shape a raw sheet row", same division of labour as payableRowMapper/resolveRefs.

import { parseExcelDate } from "@/lib/uploads/payableRowMapper";

// Same order as the template sheet. Any column in the file NOT in this list becomes an
// extraDetails entry instead of being discarded — campaigns ask different questions and
// those answers are the qualification data.
export const HEADERS = ["Name", "Phone", "Email", "City", "Lead Date"];

// Lives here (not in validateCampaignLeads.js) so the client upload page can import it
// without pulling mongoose into the browser bundle — this file has zero imports beyond
// the other pure mapper. payableRowMapper.js's MAX_ROWS isn't reused this way; the admin
// uploads page hardcodes 500 instead, which is the actual anti-pattern to avoid repeating.
export const MAX_ROWS = 5000;

export const EXAMPLE_ROWS = [
  { Name: "Rohit Sharma", Phone: "+91 98765 43210", Email: "rohit@example.com", City: "Delhi", "Lead Date": "14-09-2026", "Interested In": "FUE Hair Transplant" },
  { Name: "Priya Singh", Phone: "9876500000", Email: "", City: "Noida", "Lead Date": "14-09-2026", "Interested In": "PRP" },
];

/**
 * @param raw        one sheet row: header -> cell value (string/number/Date, xlsx read with cellDates:true)
 * @param rowNumber  1-based sheet row (header is row 1, so first data row is 2)
 * @returns { rowNumber, name, phone, email, city, leadDate: Date|null, extraDetails: [{label,value}], errors: [] }
 */
export function parseCampaignLeadRow(raw, rowNumber) {
  const errors = [];
  const get = (h) => String(raw?.[h] ?? "").trim();

  const name = get("Name");
  const phone = get("Phone");
  if (!phone) errors.push("Phone is required.");

  const email = get("Email").toLowerCase();
  const city = get("City");

  let leadDate = null;
  const leadDateRaw = raw?.["Lead Date"];
  if (leadDateRaw === undefined || leadDateRaw === null || String(leadDateRaw).trim() === "") {
    errors.push("Lead Date is required.");
  } else {
    try {
      leadDate = parseExcelDate(leadDateRaw);
    } catch (err) {
      errors.push(`Lead Date: ${err.message}`);
    }
  }

  // Anything not in HEADERS is a per-campaign form answer, in file column order.
  const extraDetails = Object.keys(raw || {})
    .filter((h) => !HEADERS.includes(h))
    .map((label) => ({ label, value: String(raw[label] ?? "").trim() }))
    .filter((d) => d.value !== "");

  return { rowNumber, name, phone, email, city, leadDate, extraDetails, errors };
}
