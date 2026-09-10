"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import RecordBorrowingModal from "@/components/finance/RecordBorrowingModal";
import BorrowingDocumentActions from "@/components/finance/BorrowingDocumentActions";
import DocumentHistory from "@/components/finance/DocumentHistory";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { useToast } from "@/components/Toast";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

export default function LiabilitiesBorrowingsPage() {
  const { scope, setScope, scopeQS } = useLedgerScope();
  const toast = useToast();

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [borrowModal, setBorrowModal] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/borrowings/grouped?level=1&${scopeQS()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        const rows = json.rows || [];
        setMetrics({
          opening: rows.reduce((s, r) => s + (r.opening || 0), 0),
          raised: rows.reduce((s, r) => s + (r.movement || 0), 0),
          repaid: rows.reduce((s, r) => s + (r.settled || 0), 0),
          owed: rows.reduce((s, r) => s + (r.closing || 0), 0),
        });
      })
      .catch((e) => e.name !== "AbortError" && console.error(e))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [scopeQS, refreshKey]);

  const openHistory = async (row) => {
    setHistoryDoc(row);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/borrowings/grouped?level=4&documentId=${row._id}&limit=200`);
      const data = await res.json();
      setHistoryRows(
        (data.rows || []).map((r) => ({
          _id: r._id,
          amount: r.amount,
          date: r.date,
          method: `${r.direction === "OUT" ? "Repayment" : "Received"} · ${r.account}`,
          paymentId: r.reference,
          createdBy: r.createdBy,
        })),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <LedgerScopeBar
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBorrowModal({ mode: "IN", payable: null })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-violet-700"
            >
              Record Borrowing
            </button>
            <LedgerExportButton pageKey="borrowings" />
          </div>
        }
      />

      <div className="flex items-center justify-between">
        <LedgerMetrics
          loading={loading}
          items={[
            { label: "Opening owed", value: metrics?.opening ?? 0 },
            { label: "Raised", value: metrics?.raised ?? 0 },
            { label: "Repaid", value: metrics?.repaid ?? 0, tone: "text-emerald-600" },
            { label: "Still owed", value: metrics?.owed ?? 0, tone: "text-rose-600" },
          ]}
        />
      </div>
      <Link
        href="/admin/financing?tab=borrowings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-800"
      >
        Manage all loans <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>

      <DrillDownTable
        key={refreshKey}
        levels={3}
        sectionConfig={{
          key: "borrowings",
          mode: "documents",
          documentShape: "payable",
          hideCreateButtons: true,
          apiBase: "/api/borrowings",
          title: "Borrowings",
          columnLabels: {
            opening: "Opening owed",
            movement: "Raised",
            settled: "Repaid",
            closing: "Still owed",
          },
        }}
        renderDocumentActions={(row) => (
          <BorrowingDocumentActions
            row={row}
            onRepay={(r) => setBorrowModal({ mode: "OUT", payable: r })}
            onTranche={(r) => setBorrowModal({ mode: "IN", payable: r })}
            onHistory={openHistory}
          />
        )}
        scope={scope}
        onScopeChange={setScope}
      />

      {borrowModal && (
        <RecordBorrowingModal
          open
          mode={borrowModal.mode}
          payable={borrowModal.payable}
          toast={toast}
          onClose={() => setBorrowModal(null)}
          onSuccess={() => {
            setBorrowModal(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {historyDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-gray-900">
                History — {historyDoc.payee?.label || "Borrowing"}
              </h3>
              <button onClick={() => setHistoryDoc(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <DocumentHistory doc={historyDoc} kind="payable" transactions={historyRows} loading={historyLoading} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
