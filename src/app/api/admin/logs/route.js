import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Stock from "@/models/Stock";
import DeleteLog from "@/models/DeleteLog";

import "@/models/Vendor";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { cacheKey, cached } from "@/lib/cache";

const LOG_TYPES = ["patient-changes-log", "transaction-changes-log", "stock-changes-log", "delete-log"];

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function inRange(date, dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return true;
  if (!date) return false;
  const d = new Date(date);
  return d >= dateFrom && d <= dateTo;
}

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "");
const id = (v) => (v ? String(v?._id ?? v) : "");

function transactionDetailColumns(tx) {
  return {
    "Txn ID": String(tx._id || ""),
    "Batch ID": tx.batchId || "",
    "Txn Date": fmtDay(tx.date),
    "Category": tx.transactionCategory || "",
    "Cost Type": tx.costType || "",
    "Branch": tx.branch || "",
    "Patient Name": tx.patient?.personal?.name || tx.patientName || "",
    "Patient Phone": tx.patient?.personal?.phone || tx.patientPhone || "",
    "Procedure": tx.procedure || "",
    "Payment Type": tx.paymentType || "",
    "Payment ID": tx.paymentId || "",
    "Expense Head": tx.expense || "",
    "Expense Sub-type": tx.expenseType || "",
    "Expense Giver": tx.expenseGiver?.name || tx.expenseGiverOld || "",
    "Expense Giver Kind": tx.expenseGiver?.type || "",
    "Method": tx.method || "",
    "Receipt Mode": tx.receiptMode || "",
    "Account (Further Mode)": tx.furtherMode || "",
    "Amount (₹)": tx.amount ?? 0,
    "Discount (₹)": tx.discount ?? 0,
    "Quantity": tx.quantity ?? "",
    "Per Unit Cost (₹)": tx.perUnitCost ?? "",
    "Per Session Cost (₹)": tx.perSessionCost ?? "",
    "Vendor": tx.vendor?.name || "",
    "Stock Item": tx.stock?.name || "",
    "Commission Receiver": tx.commissionReceiver?.name || "",
    "Commission Receiver Kind": tx.commissionReceiver?.type || "",
    "Remarks": tx.remarks || "",
    "Approval Status": tx.approvalStatus || "",
    "Approved By": tx.approvalActionBy?.name || "",
    "Approved On": fmtDate(tx.approvalActionBy?.date),
    "Payable ID": id(tx.payableId),
    "Receivable ID": id(tx.receivableId),
    "Receivable Allocations": (tx.receivableAllocations || [])
      .map((a) => `${id(a.receivableId)}: ${a.amount}`)
      .join("; "),
    "Is Settlement": tx.isSettlement ? "Yes" : "No",
    "Reversal Of": id(tx.reversalOf),
    "Is Reversed": tx.isReversed ? "Yes" : "No",
    "Reversal Reason": tx.reversalReason || "",
    "Collab Case ID": id(tx.collabRef?.caseId),
    "Collab Settlement ID": id(tx.collabRef?.settlementId),
    "External Party": tx.externalParty?.name || "",
    "External Party Direction": tx.externalParty?.direction || "",
    "GST Amount (₹)": tx.taxDetails?.gstAmount ?? "",
    "TDS Amount (₹)": tx.taxDetails?.tdsAmount ?? "",
    "Record Created At": fmtDate(tx.createdAt),
    "Record Updated At": fmtDate(tx.updatedAt),
  };
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin", "super-admin"].includes(session?.user?.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    
    
    
    
    const sessionBranch = session.user.branch;
    const sessionLocked = sessionBranch && sessionBranch !== "All" && sessionBranch !== "all";
    const requestedBranch = searchParams.get("branch") || "";

    const branch = sessionLocked ? sessionBranch : requestedBranch;
    const hasBranch = !!branch && branch !== "All" && branch !== "all";

    
    
    const dateFrom = from ? getISTStartOfDay(from) : null;
    const dateTo = to ? getISTEndOfDay(to) : null;

    if (!LOG_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, message: "Invalid log type" },
        { status: 400 }
      );
    }

    const meta = {};
    const key = cacheKey("admin-logs", { type, hasBranch, branch, from, to });
    const { data } = await cached(key, 30, () => computeLogs({ type, hasBranch, branch, dateFrom, dateTo }), meta);

    const res = NextResponse.json({ success: true, data });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("Admin logs API error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}

async function computeLogs({ type, hasBranch, branch, dateFrom, dateTo }) {
    let data = [];

    switch (type) {
      case "patient-changes-log": {
        const query = hasBranch ? { "personal.branch": branch } : {};

        const patients = await Patient.find(query)
          .select("personal.name personal.phone personal.branch editors createdBy createdAt")
          .lean();

        for (const patient of patients) {
          const name = patient.personal?.name || "Unknown";
          const phone = patient.personal?.phone || "";
          const patientBranch = patient.personal?.branch || "";

          const createdAt = patient.createdBy?.date
            ? new Date(patient.createdBy.date)
            : patient.createdAt
            ? new Date(patient.createdAt)
            : null;

          if (inRange(createdAt, dateFrom, dateTo)) {
            data.push({
              _sortTs: createdAt ? createdAt.getTime() : 0,
              "Action": "Created",
              "Patient Name": name,
              "Patient Phone": phone,
              "Branch": patientBranch,
              "Changed By": patient.createdBy?.name || "System",
              "Changed By Email": patient.createdBy?.email || "",
              "Changed By Branch": patient.createdBy?.branch || patientBranch,
              "Date & Time": fmtDate(createdAt),
              "Fields Changed": "New patient record created",
            });
          }

          for (const editor of patient.editors || []) {
            const editDate = editor.date ? new Date(editor.date) : null;
            if (!inRange(editDate, dateFrom, dateTo)) continue;

            data.push({
              _sortTs: editDate ? editDate.getTime() : 0,
              "Action": "Updated",
              "Patient Name": name,
              "Patient Phone": phone,
              "Branch": patientBranch,
              "Changed By": editor.name || "",
              "Changed By Email": editor.email || "",
              "Changed By Branch": editor.branch || "",
              "Date & Time": fmtDate(editDate),
              "Fields Changed": editor.updatedFields?.length
                ? editor.updatedFields
                    .map((f) => `${f.name}: ${f.previousValue} → ${f.newValue}`)
                    .join("; ")
                : "Record updated",
            });
          }
        }

        data.sort((a, b) => b._sortTs - a._sortTs);
        data = data.map(({ _sortTs, ...rest }) => rest);
        break;
      }

      case "transaction-changes-log": {
        const txQuery = hasBranch ? { branch } : {};

        
        
        
        
        if (dateFrom && dateTo) {
          const eventWindow = { $gte: dateFrom, $lte: dateTo };
          txQuery.$or = [
            { "createdBy.date": eventWindow },
            { createdAt: eventWindow },
            { "editors.date": eventWindow },
          ];
        }

        const transactions = await Transactions.find(txQuery)
          .populate("patient", "personal.name personal.phone")
          .populate("vendor", "name")
          .populate("stock", "name")
          .sort({ createdAt: -1 })
          .lean();

        for (const tx of transactions) {
          
          
          const details = transactionDetailColumns(tx);

          const createdAt = tx.createdBy?.date
            ? new Date(tx.createdBy.date)
            : tx.createdAt
            ? new Date(tx.createdAt)
            : null;

          if (inRange(createdAt, dateFrom, dateTo)) {
            data.push({
              _sortTs: createdAt ? createdAt.getTime() : 0,
              "Action": "Created",
              "Event ID": `${tx._id}-created`,
              "Changed On": fmtDate(createdAt),
              "Changed By": tx.createdBy?.name || "System",
              "Changed By Email": tx.createdBy?.email || "",
              "Changed By Branch": tx.createdBy?.branch || tx.branch || "",
              "Field Changed": "(record created)",
              "Previous Value": "",
              "New Value": "",
              "Change #": 1,
              "Changes In Event": 1,
              ...details,
            });
          }

          (tx.editors || []).forEach((editor, editIdx) => {
            const editDate = editor.date ? new Date(editor.date) : null;
            if (!inRange(editDate, dateFrom, dateTo)) return;

            const eventId = `${tx._id}-edit-${editIdx + 1}`;
            const fields = editor.updatedFields?.length ? editor.updatedFields : null;
            const auditBase = {
              _sortTs: editDate ? editDate.getTime() : 0,
              "Action": "Updated",
              "Event ID": eventId,
              "Changed On": fmtDate(editDate),
              "Changed By": editor.name || "",
              "Changed By Email": editor.email || "",
              "Changed By Branch": editor.branch || "",
            };

            if (!fields) {
              
              data.push({
                ...auditBase,
                "Field Changed": "(not recorded)",
                "Previous Value": "",
                "New Value": "",
                "Change #": 1,
                "Changes In Event": 1,
                ...details,
              });
              return;
            }

            
            
            fields.forEach((f, i) => {
              data.push({
                ...auditBase,
                "Field Changed": f.name || "",
                "Previous Value": f.previousValue ?? "",
                "New Value": f.newValue ?? "",
                "Change #": i + 1,
                "Changes In Event": fields.length,
                ...details,
              });
            });
          });
        }

        data.sort((a, b) => b._sortTs - a._sortTs);
        data = data.map(({ _sortTs, ...rest }) => rest);
        break;
      }

      case "stock-changes-log": {
        const stockQuery = hasBranch ? { location: branch } : {};

        const stocks = await Stock.find(stockQuery)
          .select("name location totalQuantity unit mrp createdBy editors createdAt")
          .lean();

        for (const stock of stocks) {
          const stockBranch = stock.location || "";

          const createdAt = stock.createdBy?.date
            ? new Date(stock.createdBy.date)
            : stock.createdAt
            ? new Date(stock.createdAt)
            : null;

          if (inRange(createdAt, dateFrom, dateTo)) {
            data.push({
              _sortTs: createdAt ? createdAt.getTime() : 0,
              "Action": "Created",
              "Stock Item": stock.name || "",
              "Location": stockBranch,
              "Current Qty": stock.totalQuantity || 0,
              "Unit": stock.unit || "",
              "MRP (₹)": stock.mrp || 0,
              "Changed By": stock.createdBy?.name || "System",
              "Changed By Email": stock.createdBy?.email || "",
              "Changed By Branch": stock.createdBy?.branch || stockBranch,
              "Date & Time": fmtDate(createdAt),
              "Fields Changed": "New stock item created",
            });
          }

          for (const editor of stock.editors || []) {
            const editDate = editor.date ? new Date(editor.date) : null;
            if (!inRange(editDate, dateFrom, dateTo)) continue;

            data.push({
              _sortTs: editDate ? editDate.getTime() : 0,
              "Action": "Updated",
              "Stock Item": stock.name || "",
              "Location": stockBranch,
              "Current Qty": stock.totalQuantity || 0,
              "Unit": stock.unit || "",
              "MRP (₹)": stock.mrp || 0,
              "Changed By": editor.name || "",
              "Changed By Email": editor.email || "",
              "Changed By Branch": editor.branch || "",
              "Date & Time": fmtDate(editDate),
              "Fields Changed": editor.updatedFields?.length
                ? editor.updatedFields
                    .map((f) => `${f.name}: ${f.previousValue} → ${f.newValue}`)
                    .join("; ")
                : "Record updated",
            });
          }
        }

        data.sort((a, b) => b._sortTs - a._sortTs);
        data = data.map(({ _sortTs, ...rest }) => rest);
        break;
      }

      case "delete-log": {
        const deleteQuery = {};
        if (hasBranch) deleteQuery.branch = branch;
        if (dateFrom && dateTo) {
          deleteQuery.deletedAt = { $gte: dateFrom, $lte: dateTo };
        }

        const deleteLogs = await DeleteLog.find(deleteQuery)
          .sort({ deletedAt: -1 })
          .lean();

        data = deleteLogs.map((log) => ({
          "Entity Type": log.entityType || "",
          "Record Name": log.entityName || "",
          "Record ID": log.entityId || "",
          "Branch": log.branch || "",
          "Deleted By": log.deletedBy?.name || "",
          "Deleted By Email": log.deletedBy?.email || "",
          "Deleted By Branch": log.deletedBy?.branch || "",
          "Date & Time": fmtDate(log.deletedAt),
          "Details": log.entityDetails
            ? Object.entries(log.entityDetails)
                .filter(([, v]) => v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ")
            : "",
        }));
        break;
      }
    }

    return { data };
}
