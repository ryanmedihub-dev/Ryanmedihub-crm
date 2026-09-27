

import { parseExcelDate } from "@/lib/uploads/payableRowMapper";

export const HEADERS = ["Name", "Phone", "Email", "City", "Lead Date"];

export const MAX_ROWS = 5000;

export const EXAMPLE_ROWS = [
  { Name: "Rohit Sharma", Phone: "+91 98765 43210", Email: "rohit@example.com", City: "Delhi", "Lead Date": "14-09-2026", "Interested In": "FUE Hair Transplant" },
  { Name: "Priya Singh", Phone: "9876500000", Email: "", City: "Noida", "Lead Date": "14-09-2026", "Interested In": "PRP" },
];

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

  
  const extraDetails = Object.keys(raw || {})
    .filter((h) => !HEADERS.includes(h))
    .map((label) => ({ label, value: String(raw[label] ?? "").trim() }))
    .filter((d) => d.value !== "");

  return { rowNumber, name, phone, email, city, leadDate, extraDetails, errors };
}
