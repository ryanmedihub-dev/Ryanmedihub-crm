"use client";

import { formatCurrency, formatDate } from "@/lib/financeUI";

export default function DocumentHistory({ doc, kind, transactions = [], loading = false }) {
  const log = doc.log || [];
  const isPayable = kind === "payable";
  const listTitle = isPayable ? "Payments" : "Revenue Received";
  const emptyText = isPayable ? "No payments recorded yet." : "No revenue logged against this yet.";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-xs font-medium text-gray-500 mb-3">
          {listTitle} ({transactions.length})
        </h4>
        {!isPayable && (
          <p className="text-xs text-gray-400 mb-3">
            Recorded by tagging a normal Transplant/Services/Medicine transaction with this
            receivable — there is no separate "receive" action.
          </p>
        )}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-400">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {transactions.map((tx) => (
              <li key={tx._id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{formatCurrency(tx.amount)}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(tx.date)} · {(tx.method || "—").replace(/_/g, " ").toUpperCase()}
                    {tx.paymentId ? ` · ${tx.paymentId}` : ""}
                  </p>
                </div>
                <p className="text-xs text-gray-500 text-right shrink-0 ml-3">{tx.createdBy?.name || "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-xs font-medium text-gray-500 mb-3">
          Activity Log ({log.length})
        </h4>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...log].reverse().map((entry, i) => (
              <li key={i} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{entry.action}</span>
                  <span className="text-xs text-gray-500">{formatDate(entry.performedAt)}</span>
                </div>
                {entry.previousValue && (
                  <p className="text-xs text-gray-500">
                    {entry.previousValue} → {entry.newValue}
                  </p>
                )}
                {entry.note && <p className="text-xs text-gray-400 italic mt-0.5">{entry.note}</p>}
                <p className="text-xs text-gray-400 mt-0.5">by {entry.performedBy?.name || "—"}</p>
              </li>
            ))}
          </ul>
        )}
        {doc.remarks && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
            <p className="text-sm text-gray-700">{doc.remarks}</p>
          </div>
        )}
      </div>
    </div>
  );
}
