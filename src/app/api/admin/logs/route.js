import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Stock from "@/models/Stock";
import DeleteLog from "@/models/DeleteLog";
// Registers the Vendor schema so the transaction log's .populate("vendor") resolves.
import "@/models/Vendor";

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

// A single edited transaction can emit one row per changed field, so cap the documents
// pulled rather than the rows emitted — the caller is told when this bites.
const TX_LOG_DOC_LIMIT = 5000;

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "");
const id = (v) => (v ? String(v?._id ?? v) : "");

/**
 * Every business field on a transaction, flattened for one spreadsheet row. Repeated on
 * each audit row so the export stands alone — no cross-referencing another report to work
 * out what the changed record actually was.
 */
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

    // The reports page sends a branch filter for log reports too, but this route only ever
    // honoured the session's own branch — so picking "Delhi" silently returned every
    // branch. Take the requested branch when the session isn't already locked to one, and
    // never widen past the session's scope.
    const sessionBranch = session.user.branch;
    const sessionLocked = sessionBranch && sessionBranch !== "All" && sessionBranch !== "all";
    const requestedBranch = searchParams.get("branch") || "";

    const branch = sessionLocked ? sessionBranch : requestedBranch;
    const hasBranch = !!branch && branch !== "All" && branch !== "all";

    const dateFrom = from ? new Date(from) : null;
    const dateTo = to ? new Date(to) : null;

    let data = [];
    let truncated = false;

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

        // Only pull documents that could contribute an event in range. An audit event lives
        // on one of three paths, so a doc qualifies if any of them falls in the window —
        // per-event filtering still happens below, this just avoids loading the whole
        // collection into memory the way this used to.
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
          .limit(TX_LOG_DOC_LIMIT)
          .lean();

        truncated = transactions.length >= TX_LOG_DOC_LIMIT;

        for (const tx of transactions) {
          // Every audit row repeats this block, so the sheet is self-contained: you can
          // read what the transaction is without cross-referencing another export.
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
              // An edit was recorded but the field-level diff wasn't captured.
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

            // One row per changed field, so the sheet can be filtered by field name and
            // pivoted on who changed what.
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

      default:
        return NextResponse.json(
          { success: false, message: "Invalid log type" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data,
      truncated,
      ...(truncated ? { docLimit: TX_LOG_DOC_LIMIT } : {}),
    });
  } catch (err) {
    console.error("Admin logs API error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
