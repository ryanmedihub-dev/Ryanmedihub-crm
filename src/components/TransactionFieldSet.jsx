"use client";

import { useMemo } from "react";
import MethodField from "@/components/MethodField";
import BankRoutingFields from "@/components/BankRoutingFields";
import ExternalPartyFields from "@/components/ExternalPartyFields";
import ReceiptUpload from "@/components/ReceiptUpload";
import TaxBreakdownFields from "@/components/TaxBreakdownFields";
import useMasterData from "@/lib/useMasterData";
import { deriveClinicSettlement } from "@/lib/collabFormula";
import {
  NON_CASH_METHODS as LITERAL_NON_CASH_METHODS,
  UNSETTLED_METHODS as LITERAL_UNSETTLED_METHODS,
} from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";

export const TRANSACTION_CONTEXTS = [
  "transplant",
  "service",
  "medicine",
  "expense",
  "receivable-receipt",
  "payable-payment",
  "collab-settlement",
  "voucher",
];

const SETTLEMENT_CONTEXTS = new Set([
  "receivable-receipt",
  "payable-payment",
  "collab-settlement",
]);

const HIDE_PAYMENT_FIELDS_CONTEXTS = new Set(["voucher"]);

const CONTEXT_CATEGORY = {
  transplant: "TRANSPLANT",
  service: "SERVICE",
  medicine: "MEDICINE",
  expense: "EXPENSE",
};

const isExpenseSide = (context, categoryOverride) =>
  context === "expense" ||
  context === "payable-payment" ||
  categoryOverride === "EXPENSE";

export const fieldInputClass =
  "w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-400";
export const fieldLabelClass = "block text-sm font-semibold text-gray-700 mb-1.5";

export default function TransactionFieldSet({
  context,
  value,
  onChange,
  transactionCategory,
  branchLocked = false,
  showAmount = true,
  showBranch = true,
  showRemarks = true,
  showReceipts = true,
  amountLabel = "Amount (₹)",
  disabled = false,
  patientId,
  
  taxValue,
  onTaxChange,
  
  clinicLabel,
  clinicReceived,
  clinicShare,
}) {
  const { nonCashMethods, unsettledMethods } = useMasterData();
  const category = transactionCategory || CONTEXT_CATEGORY[context] || "TRANSPLANT";
  const expenseSide = isExpenseSide(context, transactionCategory);
  const isSettlement = SETTLEMENT_CONTEXTS.has(context);
  const hidePaymentFields = HIDE_PAYMENT_FIELDS_CONTEXTS.has(context);

  const set = (patch) => onChange({ ...patch });

  const furtherModeRequired = useMemo(
    () => isSettlement && !nonCashMethods.includes(value.method),
    [isSettlement, value.method, nonCashMethods],
  );

  const externalDirection = expenseSide ? "PAID_BY" : "RECEIVED_BY";
  const showExternal = !hidePaymentFields && unsettledMethods.includes(value.method);

  return (
    <div className="space-y-4">
      {showAmount && (
        <div>
          <label className={fieldLabelClass}>
            {amountLabel} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
            <input
              type="number"
              min="0"
              value={value.amount ?? ""}
              onChange={(e) => set({ amount: e.target.value })}
              disabled={disabled}
              className={`${fieldInputClass} pl-7 text-base font-semibold`}
              placeholder="0"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={fieldLabelClass}>Date</label>
          <input
            type="date"
            value={value.date || ""}
            onChange={(e) => set({ date: e.target.value })}
            disabled={disabled}
            className={fieldInputClass}
          />
        </div>
        {showBranch && (
          <div>
            <label className={fieldLabelClass}>
              Branch {branchLocked && <span className="text-xs font-normal text-gray-400">(fixed)</span>}
            </label>
            <select
              value={value.branch || ""}
              onChange={(e) => set({ branch: e.target.value })}
              disabled={disabled || branchLocked}
              className={fieldInputClass}
            >
              <option value="">Select branch</option>
              {ALL_BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!hidePaymentFields && (
        <>
          <MethodField
            category={category}
            branch={value.branch}
            value={{ method: value.method, paymentId: value.paymentId }}
            onChange={(patch) => set(patch)}
            disabled={disabled}
          />

          <BankRoutingFields
            costType={expenseSide ? "Expenses" : "Revenue"}
            branch={value.branch}
            transactionCategory={category}
            method={value.method}
            receiptMode={value.receiptMode}
            furtherMode={value.furtherMode}
            onChange={(patch) => set(patch)}
          />

          {furtherModeRequired && !value.furtherMode && (
            <p className="text-xs text-red-600 -mt-2 flex items-start gap-1.5">
              <span className="mt-0.5">⚠</span>
              <span>
                Select the account this money {expenseSide ? "left from" : "landed in"} — without it this
                settlement can&apos;t be reconciled in Close Book.
              </span>
            </p>
          )}
        </>
      )}

      {showExternal && (
        <ExternalPartyFields
          direction={externalDirection}
          value={value.externalParty || {}}
          onChange={(patch) => set({ externalParty: { ...(value.externalParty || {}), ...patch } })}
        />
      )}

      {context === "voucher" && (
        <TaxBreakdownFields
          value={taxValue || {}}
          baseAmount={value.amount}
          onChange={onTaxChange}
          allowTDS
        />
      )}

      {context === "collab-settlement" && clinicLabel && (
        <CollabDirectionLine
          clinicLabel={clinicLabel}
          clinicReceived={clinicReceived}
          clinicShare={clinicShare}
        />
      )}

      {showRemarks && (
        <div>
          <label className={fieldLabelClass}>Remarks</label>
          <textarea
            value={value.remarks || ""}
            onChange={(e) => set({ remarks: e.target.value })}
            rows={2}
            disabled={disabled}
            className={`${fieldInputClass} resize-none`}
            placeholder="Optional"
          />
        </div>
      )}

      {showReceipts && (
        <div>
          <label className={fieldLabelClass}>Receipts</label>
          <ReceiptUpload
            receipts={value.receipts || []}
            onChange={(receipts) => set({ receipts })}
            section={context}
            patientId={patientId}
          />
        </div>
      )}
    </div>
  );
}

export function validateTransactionFields(
  value,
  context,
  {
    requireAmount = true,
    nonCashMethods = LITERAL_NON_CASH_METHODS,
    unsettledMethods = LITERAL_UNSETTLED_METHODS,
  } = {},
) {
  const isSettlement = SETTLEMENT_CONTEXTS.has(context);
  const hidePaymentFields = HIDE_PAYMENT_FIELDS_CONTEXTS.has(context);

  if (requireAmount && !(parseFloat(value.amount) > 0)) {
    return "Enter an amount greater than zero";
  }
  if (!hidePaymentFields && !value.method) return "Select a payment method";
  if (!value.branch) return "Select a branch";

  if (hidePaymentFields) return null;

  if (isSettlement && !nonCashMethods.includes(value.method) && !value.furtherMode) {
    return "Select the account this money moved through — a settlement without account attribution can't be reconciled in Close Book";
  }

  if (unsettledMethods.includes(value.method)) {
    const p = value.externalParty || {};
    if (!p.name?.trim()) return "Enter the name of the party who handled the money";
    if (!p.method) return "Select the method the external party used";
  }

  return null;
}

function CollabDirectionLine({ clinicLabel, clinicReceived, clinicShare }) {
  const { kind, amount } = deriveClinicSettlement({
    clinicReceived: Number(clinicReceived) || 0,
    clinicShare: Number(clinicShare) || 0,
  });
  const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  if (kind === "NONE") {
    return (
      <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        {clinicLabel} collected exactly its share — nothing to settle.
      </p>
    );
  }

  const text =
    kind === "RECEIVABLE"
      ? `You are recording that ${clinicLabel} paid you ${fmt(amount)}`
      : `You are recording that you paid ${clinicLabel} ${fmt(amount)}`;

  return (
    <p className="text-sm font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
      {text}
    </p>
  );
}

export { SETTLEMENT_CONTEXTS };
