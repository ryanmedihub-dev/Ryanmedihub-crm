"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ArrowLeft, Banknote, Pencil, Ban, History, Eye } from "lucide-react";
import AccountingTable from "./AccountingTable";
import { formatCurrency, formatDate, StatusBadge } from "@/lib/financeUI";
import { AGEING_TONE_CLASSES, formatAgeing } from "@/lib/ageing";
import { useToast } from "@/components/Toast";
import LockedBadge from "./LockedBadge";
import { ReversalBadge, ReversedBadge } from "./StatusBadges";
import RecordPaymentModal from "./RecordPaymentModal";
import RevisePayableModal from "./RevisePayableModal";
import DocumentHistory from "./DocumentHistory";
import DocumentDetailModal from "./DocumentDetailModal";
import TransactionDetailModal from "./TransactionDetailModal";

export default function VendorLedgerModal({ vendor, scope, onClose }) {
  const toast = useToast();
  const [level, setLevel] = useState(1);
  const [bill, setBill] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [payModal, setPayModal] = useState(null);
  const [reviseModal, setReviseModal] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [historyTx, setHistoryTx] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewDocId, setViewDocId] = useState(null);
  const [viewTxId, setViewTxId] = useState(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (scope?.branch) p.set("branch", scope.branch);
    if (scope?.dateFrom) p.set("from", scope.dateFrom);
    if (scope?.dateTo) p.set("to", scope.dateTo);
    return p.toString();
  }, [scope]);

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetch(
        `/api/payables/grouped?level=3&groupBy=vendor&vendorId=${vendor._id}&page=1&limit=200&${qs()}`,
      ).then((r) => r.json());
      setRows(json.rows || []);
    } finally {
      setLoading(false);
    }
  }, [vendor._id, qs]);

  const loadTransactions = useCallback(async () => {
    if (!bill) return;
    setLoading(true);
    try {
      const json = await fetch(
        `/api/payables/grouped?level=4&documentId=${bill._id}&page=1&limit=200&${qs()}`,
      ).then((r) => r.json());
      setRows(json.rows || []);
    } finally {
      setLoading(false);
    }
  }, [bill, qs]);

  useEffect(() => {
    if (level === 1) loadBills();
    else loadTransactions();
  }, [level, loadBills, loadTransactions]);

  const openHistory = async (row) => {
    setHistoryDoc(row);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/transactions/get-all?payableId=${row._id}&limit=50`);
      const data = await res.json();
      setHistoryTx(data.success ? data.transactions || [] : []);
    } finally {
      setHistoryLoading(false);
    }
  };

  const cancelBill = async (row) => {
    const ok = window.confirm(
      `Permanently delete this bill?\n\n${formatCurrency(row.totalAmount)} · nothing has been paid against it yet.\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    const res = await fetch(`/api/payables/${row._id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      toast.success("Bill deleted");
      loadBills();
    } else {
      toast.error(data.error || "Failed to delete");
    }
  };

  const billColumns = [
    {
      key: "purpose",
      label: "Purpose / Category",
      render: (r) => (
        <div>
          <p className="font-medium text-gray-800">{(r.purpose || "").replace(/_/g, " ")}</p>
          <p className="text-xs text-gray-500">{r.expenseCategory}{r.expenseSubType ? ` / ${r.expenseSubType}` : ""}</p>
        </div>
      ),
    },
    { key: "totalAmount", label: "Owed", numeric: true },
    { key: "paid", label: "Paid", numeric: true, render: (r) => formatCurrency(r.paid) },
    { key: "pending", label: "Pending", numeric: true },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.isCancelled ? "Cancelled" : r.status} /> },
    {
      key: "ageing",
      label: "Due",
      render: (r) => {
        const info = formatAgeing(r.daysOverdue);
        return (
          <div>
            <p className="text-xs text-gray-600">{formatDate(r.dueDate)}</p>
            <p className={`text-[11px] ${AGEING_TONE_CLASSES[info.tone]}`}>{info.text}</p>
          </div>
        );
      },
    },
  ];

  const billActions = (row) => {
    const pendingAmt = row.pending ?? Math.max((row.totalAmount || 0) - (row.paid || 0), 0);
    return (
      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {row.isCancelled ? (
          <StatusBadge status="Cancelled" />
        ) : row.lockReason ? (
          <LockedBadge reason={row.lockReason} />
        ) : (
          <>
            {pendingAmt > 0 && (
              <button onClick={() => setPayModal(row)} title="Record Payment" className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                <Banknote className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setReviseModal(row)} title="Revise" className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {!(row.paid > 0) && (
              <button onClick={() => cancelBill(row)} title="Cancel (delete — nothing paid yet)" className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
        <button onClick={() => setViewDocId(row._id)} title="View full details" className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => openHistory(row)} title="View History" className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
          <History className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const txColumns = [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "narration", label: "Narration" },
    { key: "amount", label: "Amount", numeric: true },
    { key: "method", label: "Method" },
    { key: "account", label: "Account" },
    { key: "runningBalance", label: "Paid so far", numeric: true, render: (r) => (r.runningBalance == null ? "—" : formatCurrency(r.runningBalance)) },
  ];

  const txActions = (row) => {
    if (row.lockReason) return <LockedBadge reason={row.lockReason} />;
    if (row.reversalOf) return <ReversalBadge reason={row.reversalReason} />;
    if (row.isReversed) return <ReversedBadge />;
    return (
      <button onClick={() => setViewTxId(row._id)} title="View full details" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
        <Eye className="w-3.5 h-3.5" />
      </button>
    );
  };

  return (
    <div className="fixed inset-0 overlay-in bg-gray-950/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            {level === 2 && (
              <button onClick={() => { setLevel(1); setBill(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {vendor.name || "Vendor"}
                {level === 2 && <span className="text-gray-400 font-normal"> / {(bill?.purpose || "").replace(/_/g, " ")}</span>}
              </h3>
              <p className="text-xs text-gray-500">{level === 1 ? "Bills" : "Settling transactions"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          {level === 1 ? (
            <AccountingTable
              columns={billColumns}
              rows={rows}
              loading={loading}
              filterConfig={{ showSearch: false, showBranch: false, showDateRange: false }}
              urlSync={false}
              getRowKey={(r) => r._id}
              onRowClick={(row) => {
                if (!(row.paid > 0)) return;
                setBill(row);
                setLevel(2);
              }}
              renderRowActions={billActions}
              emptyMessage="No bills recorded for this vendor yet"
            />
          ) : (
            <AccountingTable
              columns={txColumns}
              rows={rows}
              loading={loading}
              filterConfig={{ showSearch: false, showBranch: false, showDateRange: false }}
              urlSync={false}
              getRowKey={(r) => r._id}
              renderRowActions={txActions}
              emptyMessage="No settling transactions for this bill"
            />
          )}
        </div>
      </div>

      {payModal && (
        <RecordPaymentModal
          payable={payModal}
          toast={toast}
          onClose={() => setPayModal(null)}
          onSuccess={() => {
            setPayModal(null);
            loadBills();
          }}
        />
      )}

      {reviseModal && (
        <RevisePayableModal
          payable={reviseModal}
          toast={toast}
          onClose={() => setReviseModal(null)}
          onSuccess={() => {
            setReviseModal(null);
            loadBills();
          }}
        />
      )}

      {viewDocId && <DocumentDetailModal documentId={viewDocId} kind="payable" onClose={() => setViewDocId(null)} />}
      {viewTxId && <TransactionDetailModal transactionId={viewTxId} onClose={() => setViewTxId(null)} />}

      {historyDoc && (
        <div className="fixed inset-0 overlay-in bg-gray-950/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">History — {historyDoc.payee?.label || vendor.name}</h3>
              <button type="button" onClick={() => setHistoryDoc(null)} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <DocumentHistory doc={historyDoc} kind="payable" transactions={historyTx} loading={historyLoading} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
