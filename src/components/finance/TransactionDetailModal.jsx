"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/financeUI";

export default function TransactionDetailModal({ transactionId, onClose }) {
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/transactions/get-by-id?id=${transactionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setTx(json.transaction);
        else setError(json.error || "Failed to load transaction");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load transaction");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  const Row = ({ label, value }) =>
    value === undefined || value === null || value === "" ? null : (
      <div className="flex justify-between gap-4 py-1 text-sm">
        <dt className="text-gray-500">{label}</dt>
        <dd className="text-gray-800 font-medium text-right">{value}</dd>
      </div>
    );

  const Section = ({ title, children }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-medium text-gray-500 mb-2">{title}</h4>
      <dl>{children}</dl>
    </div>
  );

  return (
    <div className="fixed inset-0 overlay-in bg-gray-950/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold text-gray-900">Transaction Details</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="p-10 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
                <div>
                  <p className={`text-xl font-semibold tracking-tight ${tx.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                    {formatCurrency(tx.amount)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(tx.date)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      tx.costType === "Revenue"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {tx.costType || "—"}
                  </span>
                  {tx.reversalOf && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border bg-orange-50 text-orange-700 border-orange-200">
                      Reversal
                    </span>
                  )}
                  {tx.isReversed && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                      Reversed
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Section title="Identification">
                  <Row label="Transaction ID" value={tx._id} />
                  <Row label="Payment ID" value={tx.paymentId} />
                  <Row label="Category" value={tx.transactionCategory} />
                  <Row label="Branch" value={tx.branch} />
                  <Row label="Approval Status" value={tx.approvalStatus} />
                </Section>

                <Section title="Money & Method">
                  <Row label="Method" value={tx.method?.replace(/_/g, " ")} />
                  <Row label="Receipt Mode" value={tx.receiptMode} />
                  <Row label="Further Mode" value={tx.furtherMode} />
                  <Row label="Payment Type" value={tx.paymentType} />
                </Section>

                {(tx.patient || tx.patientName) && (
                  <Section title="Patient">
                    <Row label="Name" value={tx.patient?.personal?.name || tx.patientName} />
                    <Row label="Phone" value={tx.patient?.personal?.phone || tx.patientPhone} />
                    <Row label="Procedure" value={tx.procedure} />
                  </Section>
                )}

                {tx.costType === "Expenses" && (
                  <Section title="Expense">
                    <Row label="Category" value={tx.expense} />
                    <Row label="Type" value={tx.expenseType} />
                    <Row
                      label="Paid To"
                      value={tx.expenseGiver?.name || tx.expenseGiver?.vendorId?.name || tx.expenseGiverOld}
                    />
                    <Row label="Giver Type" value={tx.expenseGiver?.type} />
                  </Section>
                )}

                {tx.taxDetails && (tx.taxDetails.gstAmount || tx.taxDetails.tdsAmount) && (
                  <Section title="Tax Breakdown">
                    <Row label="Base" value={formatCurrency(tx.taxDetails.baseAmount)} />
                    <Row
                      label={`GST (${tx.taxDetails.gstRate || 0}%)`}
                      value={tx.taxDetails.gstAmount != null ? formatCurrency(tx.taxDetails.gstAmount) : null}
                    />
                    <Row label="Invoice Total" value={tx.taxDetails.invoiceTotal != null ? formatCurrency(tx.taxDetails.invoiceTotal) : null} />
                    {tx.taxDetails.tdsApplied && (
                      <Row label={`TDS (${tx.taxDetails.tdsRate || 0}%)`} value={`-${formatCurrency(tx.taxDetails.tdsAmount)}`} />
                    )}
                  </Section>
                )}

                {tx.externalParty?.name && (
                  <Section title="External Party">
                    <Row label="Name" value={tx.externalParty.name} />
                    <Row label="Their Method" value={tx.externalParty.method} />
                    <Row label="Type" value={tx.externalParty.partyKind} />
                  </Section>
                )}

                {(tx.collabSplit?.ourShare || tx.collabSplit?.clinicShare) && (
                  <Section title="Collab Split">
                    <Row label="Our Share" value={formatCurrency(tx.collabSplit.ourShare)} />
                    <Row label="Clinic Share" value={formatCurrency(tx.collabSplit.clinicShare)} />
                    <Row label="Received by Us" value={formatCurrency(tx.collabSplit.ourReceived)} />
                    <Row label="Received by Clinic" value={formatCurrency(tx.collabSplit.clinicReceived)} />
                  </Section>
                )}

                {(tx.payableId || tx.receivableId) && (
                  <Section title="Linked Document">
                    <Row label="Payable ID" value={tx.payableId} />
                    <Row label="Receivable ID" value={tx.receivableId} />
                  </Section>
                )}

                {tx.reversalOf && (
                  <Section title="Reversal">
                    <Row label="Reverses" value={tx.reversalOf} />
                    <Row label="Reason" value={tx.reversalReason} />
                  </Section>
                )}

                <Section title="Created By">
                  <Row label="Name" value={tx.createdBy?.name} />
                  <Row label="Email" value={tx.createdBy?.email} />
                  <Row label="Branch" value={tx.createdBy?.branch} />
                  <Row label="Date" value={tx.createdBy?.date ? formatDate(tx.createdBy.date) : null} />
                </Section>
              </div>

              {tx.remarks && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{tx.remarks}</p>
                </div>
              )}

              {tx.editors?.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Edit History ({tx.editors.length})
                  </p>
                  <ul className="space-y-2">
                    {[...tx.editors].reverse().map((e, i) => (
                      <li key={i} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{e.name || "—"}</span>
                          <span className="text-xs text-gray-500">{formatDate(e.date)}</span>
                        </div>
                        {(e.updatedFields || []).map((f, j) => (
                          <p key={j} className="text-xs text-gray-500">
                            {f.name}: {f.previousValue} → {f.newValue}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
