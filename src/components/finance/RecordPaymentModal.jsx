"use client";

import { useState } from "react";
import { X, Loader2, Banknote } from "lucide-react";
import TransactionFieldSet, { validateTransactionFields } from "@/components/TransactionFieldSet";
import useMasterData from "@/lib/useMasterData";
import { formatCurrency } from "@/lib/financeUI";

const PURPOSE_LABELS = {
  SALARY: "Salary",
  INCENTIVE: "Incentive",
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  COLLAB_CLINIC: "Collab Clinic",
  PATIENT_COMMISSION: "Patient Commission",
  TAX: "Taxes",
  MEDICAL_CONSUMABLES: "Medical Consumables",
  MEDICINE_PROCUREMENT: "Medicine Procurement",
  PROFESSIONAL_EXPENSES: "Professional Expenses",
  LAB_EXPENSES: "Lab Expenses",
  INTEREST_EXPENSES: "Interest Expenses",
  SOFTWARE_RENTAL: "Software Rental",
  HARDWARE_RENTAL: "Hardware Rental",
  OTHER: "Other",
};

export function buildGiverForPayable(payable) {
  const { kind, refId, label } = payable.payee || {};
  if (kind === "EMPLOYEE") return { type: "EMPLOYEE", refId, name: label };
  if (kind === "PATIENT") return { type: "PATIENT", refId, name: label };
  if (kind === "VENDOR") return { type: "VENDOR", vendorId: refId, name: label };
  return { type: "MANUAL", name: label };
}

export default function RecordPaymentModal({ payable, onClose, onSuccess, toast }) {
  const { nonCashMethods, unsettledMethods } = useMasterData();
  const [fields, setFields] = useState({
    amount: String(payable.pending || ""),
    date: new Date().toISOString().split("T")[0],
    method: "cash",
    paymentId: "",
    branch: payable.branch || "",
    receiptMode: "",
    furtherMode: "",
    remarks: "",
    receipts: [],
    externalParty: {},
  });
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const overBalance = parseFloat(fields.amount || 0) > payable.pending;

  const handleSubmit = async () => {
    const invalid = validateTransactionFields(fields, "payable-payment", { nonCashMethods, unsettledMethods });
    if (invalid) {
      toast.error(invalid);
      return;
    }
    if (overBalance && !allowOverpayment) {
      toast.error("Amount exceeds pending balance — check 'Allow overpayment' to proceed anyway");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions/expense/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseCategory: payable.expenseCategory,
          expenseType: payable.expenseSubType,
          amount: fields.amount,
          method: fields.method,
          paymentId: fields.paymentId,
          branch: fields.branch,
          date: fields.date,
          receiptMode: fields.receiptMode,
          furtherMode: fields.furtherMode,
          receipts: fields.receipts,
          externalParty: fields.externalParty?.name ? fields.externalParty : undefined,
          remarks: fields.remarks || `Payment against payable — ${payable.payee?.label}`,
          patientId: payable.relatedPatient || undefined,
          expenseGiver: buildGiverForPayable(payable),
          payableId: payable._id,
          allowOverpayment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Payment recorded");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to record payment");
      }
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error("Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Banknote className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">Record Payment</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Pay down an outstanding payable</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
          <div className="space-y-5 p-4 sm:p-6">

            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                    {PURPOSE_LABELS[payable.purpose] || payable.purpose}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-base">
                    {payable.payee?.label}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">Pending</p>
                  <p className="mt-1 text-lg font-bold text-rose-600 sm:text-xl">
                    {formatCurrency(payable.pending)}
                  </p>
                </div>
              </div>
            </div>

            <TransactionFieldSet
              context="payable-payment"
              value={fields}
              onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
              transactionCategory="EXPENSE"
              patientId={payable.relatedPatient || undefined}
            />

            {overBalance && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={allowOverpayment}
                  onChange={(e) => setAllowOverpayment(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Allow overpayment</p>
                  <p className="mt-0.5 text-xs leading-5 text-amber-700">
                    The entered amount exceeds the pending balance. Enable this option if you intentionally
                    want to record the excess amount.
                  </p>
                </div>
              </label>
            )}

          </div>
        </div>

        {/* FOOTER */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Payment"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
