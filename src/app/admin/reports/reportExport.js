import { payablePurposeLabel } from "@/constants/payablePurposes";

// Indian grouping, no decimals — matches how money reads everywhere else in the app.
const INR_FORMAT = '₹#,##,##0';
const MONEY_COL_RE = /(amount|paid|pending|total|salary|mrp|revenue|expense|profit|value|₹|money in|money out|\bin\b|\bout\b)/i;

// Emit the plain calendar day the user is thinking about (YYYY-MM-DD), NOT an ISO instant.
// The server's getISTStartOfDay/getISTEndOfDay bracket a bare date to the IST day; handing
// them a browser-local-shifted `.toISOString()` made them convert a second time and pull
// the `from` boundary a full day earlier (a "31 Aug" download also returned 30 Aug).
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function buildDateRange(preset, custom) {
  const now = new Date();

  if (preset === "today") {
    return { from: ymd(now), to: ymd(now) };
  }
  if (preset === "yesterday") {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    return { from: ymd(d), to: ymd(d) };
  }
  if (preset === "last7") {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: ymd(from), to: ymd(now) };
  }
  if (preset === "last30") {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from: ymd(from), to: ymd(now) };
  }
  if (preset === "thisMonth") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  }
  if (preset === "lastMonth") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === "custom" && custom.from) {
    // date inputs are already YYYY-MM-DD
    return { from: custom.from, to: custom.to || custom.from };
  }
  return { from: null, to: null };
}

/**
 * Fetches one report's rows and saves them as an .xlsx (Report sheet + an Info sheet of
 * run metadata). Throws on a failed/empty response; the caller shows the error as a toast.
 * Returns `{ rowCount, truncated, docLimit, fileName }` on success.
 */
export async function downloadReport(report, { datePreset, customDates, filters }) {
  const { from, to } = buildDateRange(datePreset, customDates);
  const isLogReport = !!report.apiPath;

  const params = new URLSearchParams({ type: report.type });

  if (from) params.append("from", from);
  if (to) params.append("to", to);

  if (filters.branch && filters.branch !== "All") params.append("branch", filters.branch);
  if (!isLogReport) {
    if (filters.status) params.append("statusFilter", filters.status);
    if (filters.technique) params.append("techniqueFilter", filters.technique);
    if (filters.staff) params.append("staffFilter", filters.staff);
    if (filters.procedure) params.append("procedureFilter", filters.procedure);
    if (filters.paymentType) params.append("paymentTypeFilter", filters.paymentType);
    if (filters.payableType) params.append("payableTypeFilter", filters.payableType);
  }

  const endpoint = report.apiPath || "/api/admin/reports";
  const res = await fetch(`${endpoint}?${params.toString()}`, {
    credentials: "include",
  });
  const result = await res.json();

  if (!res.ok || !result.success) {
    throw new Error(result.message || `Request failed (${res.status})`);
  }

  if (!result.data || result.data.length === 0) {
    return { empty: true };
  }

  const { utils, writeFile } = await import("xlsx");
  const wb = utils.book_new();
  const ws = utils.json_to_sheet(result.data);

  // Width off the widest of the header and the first 200 values, so wide audit sheets
  // stay readable without hand-resizing every column.
  const cols = Object.keys(result.data[0] || {});
  const sample = result.data.slice(0, 200);
  ws["!cols"] = cols.map((k) => {
    const widest = sample.reduce(
      (max, row) => Math.max(max, String(row[k] ?? "").length),
      k.length,
    );
    return { wch: Math.min(Math.max(widest + 2, 12), 45) };
  });

  // Audit sheets are meant to be sliced — turn on the filter row.
  if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };

  // Money columns render as ₹ with Indian grouping instead of bare numbers.
  const moneyCols = cols.filter((k) => MONEY_COL_RE.test(k));
  moneyCols.forEach((k) => {
    const idx = cols.indexOf(k);
    if (idx === -1) return;
    const colLetter = utils.encode_col(idx);
    for (let r = 0; r < result.data.length; r++) {
      const cell = ws[`${colLetter}${r + 2}`];
      if (cell && cell.t === "n") cell.z = INR_FORMAT;
    }
  });

  utils.book_append_sheet(wb, ws, "Report");

  // For the payables statement, summarise the obligation lines only — the payment
  // lines are detail beneath them and would double-count.
  const payableLines =
    report.type === "payables-all"
      ? result.data.filter((r) => r.Row === "Payable")
      : [];
  const sum = (key) => payableLines.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const meta = [
    { Field: "Report Name", Value: report.name },
    { Field: "Category", Value: report.category },
    { Field: "Date Range", Value: datePreset === "custom" ? `${customDates.from} — ${customDates.to}` : datePreset },
    { Field: "Branch Filter", Value: filters.branch || "All" },
    ...(report.filters.includes("payableType")
      ? [{ Field: "Payable Type", Value: filters.payableType ? payablePurposeLabel(filters.payableType) : "All types" }]
      : []),
    ...(payableLines.length
      ? [
          { Field: "Payables", Value: payableLines.length },
          { Field: "Total Amount", Value: sum("Total Amount") },
          { Field: "Paid", Value: sum("Paid") },
          { Field: "Pending", Value: sum("Pending") },
        ]
      : []),
    { Field: "Total Records", Value: result.data.length },
    { Field: "Generated At", Value: new Date().toLocaleString("en-IN") },
    ...(result.truncated
      ? [{
          Field: "⚠ Truncated",
          Value: `Capped at the ${result.docLimit} most recent records — narrow the date range for a complete export.`,
        }]
      : []),
  ];
  const metaWs = utils.json_to_sheet(meta);
  metaWs["!cols"] = [{ wch: 22 }, { wch: 46 }];
  meta.forEach((m, i) => {
    const cell = metaWs[`B${i + 2}`];
    if (cell && cell.t === "n" && MONEY_COL_RE.test(m.Field)) cell.z = INR_FORMAT;
  });
  utils.book_append_sheet(wb, metaWs, "Info");

  const fileName = `${report.name.replace(/\s+/g, "_")}_${new Date()
    .toISOString()
    .split("T")[0]}.xlsx`;

  writeFile(wb, fileName);

  return { rowCount: result.data.length, truncated: !!result.truncated, docLimit: result.docLimit, fileName };
}
