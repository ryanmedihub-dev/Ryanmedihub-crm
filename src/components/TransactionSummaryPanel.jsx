"use client";

import { computeTaxBreakdown } from "@/lib/taxMath";
import { Receipt, TrendingDown, TrendingUp, CheckCircle2, Link2 } from "lucide-react";

const formatCurrency = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function TransactionSummaryPanel({
  category,
  amount,
  discount = 0,
  method,
  who = {},
  taxDetails,
  externalParty,
  linkedReceivable,
  linkedPayable,
  className = "",
}) {
  const isExpense = category === "EXPENSE";
  const baseAmount = (parseFloat(amount) || 0) - (isExpense ? 0 : parseFloat(discount) || 0);
  const isExternal = method === "paid_to_external" || method === "paid_by_other";

  const tax =
    !isExpense || !taxDetails || (!taxDetails.includeGST && !taxDetails.includeTDS)
      ? null
      : computeTaxBreakdown({ baseAmount, ...taxDetails });

  const netAmount = tax ? tax.vendorPayable : baseAmount;
  const invoiceTotal = tax ? tax.invoiceTotal : baseAmount;

  let consequence = null;
  if (tax?.tdsAmount > 0) {
    consequence = {
      icon: TrendingDown,
      tone: "amber",
      lines: [
        `Vendor payable: ${formatCurrency(tax.vendorPayable)}`,
        `TDS payable (Taxes): ${formatCurrency(tax.tdsAmount)}${taxDetails.tdsCategory ? ` — ${taxDetails.tdsCategory}` : ""}`,
      ],
    };
  } else if (isExternal && externalParty?.name) {
    const owedBy = !isExpense;
    consequence = {
      icon: owedBy ? TrendingUp : TrendingDown,
      tone: owedBy ? "emerald" : "amber",
      lines: [
        owedBy
          ? `Receivable created: ${formatCurrency(amount)} owed BY ${externalParty.name}`
          : `Payable created: ${formatCurrency(amount)} owed TO ${externalParty.name}`,
      ],
    };
  } else if (linkedReceivable) {
    const remaining = Math.max(0, (linkedReceivable.pending || 0) - baseAmount);
    consequence = {
      icon: Link2,
      tone: "indigo",
      lines: [
        `Settles ${formatCurrency(baseAmount)} against Receivable — ${linkedReceivable.label}`,
        `Pending after this: ${formatCurrency(remaining)}`,
      ],
    };
  } else if (linkedPayable) {
    const remaining = Math.max(0, (linkedPayable.pending || 0) - baseAmount);
    consequence = {
      icon: Link2,
      tone: "indigo",
      lines: [
        `Settles ${formatCurrency(baseAmount)} against Payable — ${linkedPayable.label}`,
        `Pending after this: ${formatCurrency(remaining)}`,
      ],
    };
  } else {
    consequence = {
      icon: CheckCircle2,
      tone: "gray",
      lines: ["Recorded in full — no payable or receivable is created."],
    };
  }

  const toneClasses = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-500" /> Summary
        </h3>
      </div>

      <div className="p-5 space-y-3 text-sm">
        {(who.patientLabel || who.payeeLabel) && (
          <div className="pb-3 border-b border-gray-100 space-y-1">
            {who.patientLabel && (
              <div className="flex justify-between">
                <span className="text-gray-500">Patient</span>
                <span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{who.patientLabel}</span>
              </div>
            )}
            {who.payeeLabel && (
              <div className="flex justify-between">
                <span className="text-gray-500">Paid To</span>
                <span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{who.payeeLabel}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-gray-500">{tax ? "Base Amount" : "Amount"}</span>
          <span className="font-medium text-gray-900">{formatCurrency(isExpense ? amount : baseAmount)}</span>
        </div>

        {!isExpense && parseFloat(discount) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Discount</span>
            <span className="font-medium text-rose-600">−{formatCurrency(discount)}</span>
          </div>
        )}

        {tax && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">
                GST{tax.gstRate ? ` @${tax.gstRate}%` : ""}
                <span className="text-gray-400 text-xs"> · display only</span>
              </span>
              <span className="font-medium text-gray-900">{formatCurrency(tax.gstAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2">
              <span className="text-gray-600 font-medium">Invoice Total</span>
              <span className="font-semibold text-gray-900">{formatCurrency(invoiceTotal)}</span>
            </div>
            {tax.tdsAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">TDS{tax.tdsRate ? ` @${tax.tdsRate}%` : ""} on base</span>
                <span className="font-medium text-rose-600">−{formatCurrency(tax.tdsAmount)}</span>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between border-t-2 border-gray-200 pt-3">
          <span className="font-semibold text-gray-900">{tax ? "Net Payable" : "Total"}</span>
          <span className="text-xl font-semibold text-indigo-700">{formatCurrency(netAmount)}</span>
        </div>

        <div className={`rounded-lg border p-3 mt-2 ${toneClasses[consequence.tone]}`}>
          <div className="flex items-start gap-2">
            <consequence.icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              {consequence.lines.map((line, i) => (
                <p key={i} className={i === 0 ? "font-semibold text-xs" : "text-xs opacity-90"}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
