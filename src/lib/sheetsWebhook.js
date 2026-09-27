import { after } from "next/server";
import Employee from "@/models/Employee";

const TIMEOUT_MS = 8000;

const fmtDay = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "");
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");

async function employeeCode(refId) {
  if (!refId) return "";
  const emp = await Employee.findById(refId).select("employeeId").lean();
  return emp?.employeeId || "";
}

const shape = ({
  type, ts, entryDate, party = "", employeeIdCode = "", purpose = "", subType = "", direction = "",
  amount = 0, cash = "—", branch = "", account = "", method = "", reference = "",
  status = "", remarks = "", createdBy = "", id,
}) => ({
  "Entry Type": type,
  "Created On": fmtDateTime(ts),
  "Entry Date": fmtDay(entryDate),
  "Party": party || "",
  "Employee ID": employeeIdCode || "",
  "Purpose  Category": purpose || "",
  "Sub-type": subType || "",
  "Direction": direction || "",
  "Amount": Number(amount) || 0,
  "Cash Impact": cash,
  "Branch": branch || "",
  "Account": account || "",
  "Method": method || "",
  "Reference": reference || "",
  "Status": status || "",
  "Remarks": remarks || "",
  "Created By": createdBy || "",
  "Entry ID": String(id),
});

async function rowForPayable(p) {
  return shape({
    type: "Payable", ts: p.createdAt, entryDate: p.dueDate || p.createdAt,
    party: p.payee?.label,
    employeeIdCode: p.payee?.kind === "EMPLOYEE" ? await employeeCode(p.payee?.refId) : "",
    purpose: (p.purpose || "").replace(/_/g, " "),
    subType: p.expenseSubType || p.expenseCategory || "", direction: "Payable raised",
    amount: p.totalAmount, cash: "—", branch: p.branch, remarks: p.remarks,
    status: p.isCancelled ? "Cancelled" : "Open",
    createdBy: p.createdBy?.name, id: p._id,
  });
}

async function rowForReceivable(r) {
  return shape({
    type: "Receivable", ts: r.createdAt, entryDate: r.dueDate || r.createdAt,
    party: r.payer?.label,
    employeeIdCode: r.payer?.kind === "EMPLOYEE" ? await employeeCode(r.payer?.refId) : "",
    purpose: (r.purpose || "").replace(/_/g, " "),
    subType: r.revenueSubType || r.revenueCategory || "", direction: "Receivable raised",
    amount: r.totalAmount, cash: "—", branch: r.branch, remarks: r.remarks,
    status: r.isCancelled ? "Cancelled" : "Open",
    createdBy: r.createdBy?.name, id: r._id,
  });
}

async function rowForAdvance(a) {
  const out = a.direction === "OUT";
  return shape({
    type: "Advance", ts: a.createdAt, entryDate: a.date,
    party: a.party?.label,
    employeeIdCode: a.party?.kind === "EMPLOYEE" ? await employeeCode(a.party?.refId) : "",
    purpose: "Advance",
    direction: out ? "Advance paid out" : "Advance recovered",
    amount: a.amount, cash: out ? "Outflow" : "Inflow", branch: a.branch,
    account: a.account, reference: a.reference, remarks: a.remarks,
    status: a.isCancelled ? "Cancelled" : "Active",
    createdBy: a.createdBy?.name, id: a._id,
  });
}

async function rowForTransaction(t) {
  const isExpense = t.costType === "Expenses";
  return shape({
    type: isExpense ? "Expense" : "Revenue", ts: t.createdAt, entryDate: t.date,
    party: isExpense ? (t.expenseGiver?.name || "") : (t.patientName || ""),
    employeeIdCode:
      isExpense && t.expenseGiver?.type === "EMPLOYEE" ? await employeeCode(t.expenseGiver?.refId) : "",
    purpose: isExpense ? (t.expenseType || t.expense || "Expense") : (t.transactionCategory || "Revenue"),
    subType: isExpense ? (t.expense || "") : (t.procedure || ""),
    direction: isExpense ? "Expense" : "Revenue",
    amount: t.amount, cash: isExpense ? "Outflow" : "Inflow", branch: t.branch,
    account: t.furtherMode || "", method: t.method || "", reference: t.paymentId || "",
    remarks: t.remarks,
    status: `${t.approvalStatus || "APPROVED"}${t.isReversed ? " · Reversed" : ""}${t.reversalOf ? " · Reversal" : ""}`,
    createdBy: t.createdBy?.name, id: t._id,
  });
}

const ROW_BUILDERS = {
  Transactions: rowForTransaction,
  Payable: rowForPayable,
  Receivable: rowForReceivable,
  Advance: rowForAdvance,
};

async function sendRow(row) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return; 

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET || "", row }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[sheetsWebhook] non-OK response", res.status, text.slice(0, 300));
    }
  } finally {
    clearTimeout(timer);
  }
}

async function buildAndSend(entryType, doc) {
  try {
    const build = ROW_BUILDERS[entryType];
    if (!build) return;
    const row = await build(doc);
    await sendRow(row);
  } catch (err) {
    console.error(`[sheetsWebhook] failed to log ${entryType} ${doc?._id}:`, err.message);
  }
}

export function fireSheetWebhook(entryType, doc) {
  const task = buildAndSend(entryType, doc);
  try {
    after(task);
  } catch {
    
  }
}
