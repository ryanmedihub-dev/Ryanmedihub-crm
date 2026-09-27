

import { HEADERS, EXAMPLE_ROWS } from "@/lib/uploads/campaignLeadRowMapper";
export { downloadBytes } from "@/lib/uploads/excelTemplate";

const SHEET = "Campaign Leads";

export async function readCampaignLeadWorkbook(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[SHEET] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], missingHeaders: [...HEADERS] };

  const headerMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const fileHeaders = (headerMatrix[0] || []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const fileHeaderSet = new Set(fileHeaders.map((h) => h.toLowerCase()));
  const missingHeaders = HEADERS.filter((h) => !fileHeaderSet.has(h.toLowerCase()));

  const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, blankrows: false });
  const rows = raw
    .map((r) => {
      const trimmed = {};
      for (const [k, v] of Object.entries(r)) trimmed[k] = typeof v === "string" ? v.trim() : v;
      return trimmed;
    })
    .filter((r) => HEADERS.some((h) => String(r[h] ?? "").trim() !== ""));

  return { rows, missingHeaders };
}

export async function buildCampaignLeadTemplateBytes({ withExamples = true } = {}) {
  const XLSX = await import("xlsx");
  const rows = withExamples ? EXAMPLE_ROWS : [];
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS, "Interested In"] });
  ws["!cols"] = HEADERS.map(() => ({ wch: 20 }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Column", "What to write"],
    ["Name", "Optional. Lead's name."],
    ["Phone", "REQUIRED. Must normalize to a 10-digit Indian mobile number."],
    ["Email", "Optional."],
    ["City", "Optional."],
    ["Lead Date", "REQUIRED. DD-MM-YYYY (day first), or the platform's own date export."],
    ["Anything else", "Any other column (e.g. 'Interested In') is kept as a per-lead answer — campaigns ask different questions."],
    ["Before you upload", "Delete the example rows."],
  ]);
  instructions["!cols"] = [{ wch: 16 }, { wch: 110 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}
