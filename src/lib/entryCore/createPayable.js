// Extracted from payables/create/route.js's POST handler — used by "payable.raise".

import mongoose from "mongoose";
import Payable, { PAYABLE_KIND_VALUES, PAYABLE_PURPOSE_VALUES } from "@/models/Payable";
import { TDS_TAX_TYPES } from "@/constants/expenseCategories";
import { expenseTypesSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { computeTaxBreakdown } from "@/lib/taxMath";

const PATIENT_REQUIRED_PURPOSES = ["INCENTIVE", "PATIENT_COMMISSION"];

export async function createPayable({ payload, session: authSession }) {
  const {
    payee, purpose, expenseCategory, expenseSubType, period, relatedPatient, totalAmount,
    dueDate, branch, remarks, costAlreadyRecognised, excludeFromPnl, uploadBatch, receipts,
    includeGST, gstRate, gstAmount, includeTDS, tdsCategory, tdsRate, tdsAmount,
  } = payload;

  if (!payee?.kind || !payee?.label || !purpose || !totalAmount || totalAmount <= 0) {
    return { error: "Missing required fields", status: 400 };
  }
  if (!PAYABLE_KIND_VALUES.includes(payee.kind)) return { error: "Invalid payee.kind", status: 400 };
  if (!PAYABLE_PURPOSE_VALUES.includes(purpose)) return { error: "Invalid purpose", status: 400 };
  const REFID_REQUIRED_KINDS = ["EMPLOYEE", "PATIENT", "VENDOR"];
  if (REFID_REQUIRED_KINDS.includes(payee.kind) && !payee.refId) {
    return { error: `payee.refId is required when payee.kind is "${payee.kind}"`, status: 400 };
  }
  if (PATIENT_REQUIRED_PURPOSES.includes(purpose) && !relatedPatient) {
    return { error: "relatedPatient is required for this purpose", status: 400 };
  }
  if (branch && !ALL_BRANCHES.includes(branch)) return { error: "Invalid branch", status: 400 };
  if (expenseCategory) {
    const validTypes = expenseTypesSync(expenseCategory);
    if (validTypes.length > 0 && expenseSubType && !validTypes.includes(expenseSubType)) {
      return { error: "Invalid expense sub-type for this category", status: 400 };
    }
  }

  const baseAmount = parseFloat(totalAmount);
  if (includeTDS) {
    if (!tdsCategory || !TDS_TAX_TYPES.includes(tdsCategory)) return { error: "Invalid TDS category", status: 400 };
    const hasTdsAmount = tdsAmount !== undefined && tdsAmount !== null && tdsAmount !== "";
    const hasTdsRate = tdsRate !== undefined && tdsRate !== null && tdsRate !== "";
    if (!hasTdsAmount && !hasTdsRate) return { error: "Provide a TDS rate or a TDS amount", status: 400 };
  }
  if (includeGST) {
    const hasGstAmount = gstAmount !== undefined && gstAmount !== null && gstAmount !== "";
    const hasGstRate = gstRate !== undefined && gstRate !== null && gstRate !== "";
    if (!hasGstAmount && !hasGstRate) return { error: "Provide a GST rate or a GST amount", status: 400 };
  }

  const tax = computeTaxBreakdown({ baseAmount, includeGST, gstRate, gstAmount, includeTDS, tdsRate, tdsAmount, tdsCategory });
  const resolvedTdsAmount = tax.tdsAmount;
  if (includeGST && !(tax.gstAmount > 0)) return { error: "GST amount must be positive", status: 400 };
  if (includeTDS && (!(resolvedTdsAmount > 0) || resolvedTdsAmount >= tax.invoiceTotal)) {
    return { error: "TDS amount must be positive and less than the invoice total", status: 400 };
  }

  const performedBy = { name: authSession.user.name, email: authSession.user.email };
  const periodStartDate = purpose === "RENT" && period?.month && period?.year
    ? new Date(Date.UTC(period.year, period.month - 1, 1))
    : undefined;

  const commonFields = {
    period: period?.month && period?.year ? period : undefined,
    relatedPatient: relatedPatient || undefined,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    branch: branch || authSession.user.branch,
    remarks: remarks || "",
    costAlreadyRecognised: costAlreadyRecognised === true,
    excludeFromPnl: excludeFromPnl === true,
    ...(uploadBatch ? { uploadBatch } : {}),
    receipts: receipts || [],
    ...(periodStartDate ? { createdAt: periodStartDate } : {}),
    createdBy: { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() },
  };

  const vendorPayableAmount = tax.vendorPayable;
  const taxNote = includeGST || includeTDS
    ? `Base ${tax.baseAmount} + GST ${tax.gstAmount} = invoice ${tax.invoiceTotal}; TDS ${resolvedTdsAmount} on base`
    : undefined;

  const buildVendorPayable = () => {
    const doc = new Payable({
      ...commonFields,
      payee: { kind: payee.kind, refId: payee.refId || null, label: payee.label },
      purpose, expenseCategory, expenseSubType: expenseSubType || "", totalAmount: vendorPayableAmount,
      ...(includeTDS ? { tdsLink: { role: "PARENT", tdsRate: tax.tdsRate, tdsAmount: resolvedTdsAmount, grossAmount: tax.invoiceTotal } } : {}),
    });
    doc.log.push({ action: "Created", newValue: String(doc.totalAmount), note: taxNote, performedBy, performedAt: new Date() });
    return doc;
  };

  if (!includeTDS) {
    const payable = buildVendorPayable();
    await payable.save();
    return { data: payable, status: 201 };
  }

  const dbSession = await mongoose.startSession();
  let payable;
  let tdsPayable;
  try {
    await dbSession.withTransaction(async () => {
      payable = buildVendorPayable();
      await payable.save({ session: dbSession });

      tdsPayable = new Payable({
        ...commonFields,
        payee: { kind: "OTHER", refId: null, label: tdsCategory },
        purpose: "TAX", expenseCategory: "Taxes", expenseSubType: tdsCategory, totalAmount: resolvedTdsAmount,
        tdsLink: { role: "TDS", linkedId: payable._id, tdsRate: tax.tdsRate, tdsAmount: resolvedTdsAmount, grossAmount: tax.invoiceTotal },
      });
      tdsPayable.log.push({
        action: "Created", newValue: String(tdsPayable.totalAmount),
        note: `TDS split from payable ${payable._id}. ${taxNote || ""}`.trim(), performedBy, performedAt: new Date(),
      });
      await tdsPayable.save({ session: dbSession });

      payable.tdsLink.linkedId = tdsPayable._id;
      await payable.save({ session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }

  return { data: payable, tdsPayable, status: 201 };
}
