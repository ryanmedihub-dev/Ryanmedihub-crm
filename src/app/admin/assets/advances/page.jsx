"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HandCoins, ChevronRight, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { settlementLinesFor } from "@/lib/advanceSettlements";
import { useToast } from "@/components/Toast";
import RecordAdvanceModal from "@/components/finance/RecordAdvanceModal";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";
import { useDebounced } from "@/lib/useDebounced";

export default function AssetsAdvancesPage() {
  const { scope, scopeQS } = useLedgerScope();
  const toast = useToast();

  const [party, setParty] = useState("");
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ advances: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [advanceModal, setAdvanceModal] = useState(null);

  const debouncedParty = useDebounced(party);

  const params = useCallback(() => {
    const p = new URLSearchParams({ direction: "OUT", page: String(page), limit: "50" });
    if (scope.branch) p.set("branch", scope.branch);
    if (scope.dateFrom) p.set("from", scope.dateFrom);
    if (scope.dateTo) p.set("to", scope.dateTo);
    if (debouncedParty) p.set("party", debouncedParty);
    if (account) p.set("account", account);
    if (status) p.set("status", status);
    return p.toString();
  }, [scope, page, debouncedParty, account, status]);

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/advances/list?${params()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData({ advances: json.advances || [], total: json.total || 0, totalPages: json.totalPages || 1 });
      })
      .catch((e) => e.name !== "AbortError" && console.error(e))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [params]);

  useEffect(load, [load]);
  useEffect(() => setPage(1), [debouncedParty, account, status, scope.branch, scope.dateFrom, scope.dateTo]);

  const rows = data.advances;
  const totalRemaining = rows.reduce((s, r) => s + (r.remaining ?? 0), 0);
  const totalGiven = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalSettled = rows.reduce((s, r) => s + (r.settledTotal ?? 0), 0);
  const totalRecovered = rows.reduce((s, r) => s + (r.cashRecovered ?? 0), 0);

  return (
    <div className="space-y-4">
      <LedgerScopeBar
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdvanceModal({ mode: "OUT", receivable: null })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-teal-700"
            >
              <HandCoins className="w-3.5 h-3.5" /> Record Advance
            </button>
            <LedgerExportButton
              pageKey="advances"
              extraParams={{
                ...(account ? { account } : {}),
                ...(status ? { status } : {}),
                ...(debouncedParty ? { party: debouncedParty } : {}),
              }}
            />
          </div>
        }
      />

      <LedgerMetrics
        loading={loading}
        items={[
          { label: "Given (page)", value: totalGiven },
          { label: "Settled vs payables", value: totalSettled, tone: "text-indigo-600" },
          { label: "Cash recovered", value: totalRecovered, tone: "text-emerald-600" },
          { label: "Remaining", value: totalRemaining, tone: "text-amber-600" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={party}
          onChange={(e) => setParty(e.target.value)}
          placeholder="Search party (name or employee ID)…"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm w-44"
        />
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="Account"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm w-36"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
        >
          <option value="open">Open (remaining &gt; 0)</option>
          <option value="settled">Fully settled</option>
          <option value="">All</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Party</th>
                <th className="px-4 py-2.5">Account</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-right">Settled</th>
                <th className="px-4 py-2.5 text-right">Recovered</th>
                <th className="px-4 py-2.5 text-right">Remaining</th>
                <th className="px-4 py-2.5">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <HandCoins className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-gray-700">No advances match this view</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Money advanced OUT to a party shows here until it&apos;s recovered or settled.
                    </p>
                    <button
                      onClick={() => setAdvanceModal({ mode: "OUT", receivable: null })}
                      className="mt-3 text-xs font-semibold text-teal-700 hover:text-teal-800"
                    >
                      Record an advance
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const lines = settlementLinesFor(r);
                  const open = expanded === r._id;
                  return (
                    <Fragment key={r._id}>
                      <tr
                        className={`hover:bg-gray-50 ${lines.length ? "cursor-pointer" : ""}`}
                        onClick={() => lines.length && setExpanded(open ? null : r._id)}
                      >
                        <td className="px-4 py-3 text-gray-600">{formatDate(r.date)}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {lines.length ? (
                            <ChevronRight className={`inline w-3.5 h-3.5 text-gray-400 mr-1 transition-transform ${open ? "rotate-90" : ""}`} />
                          ) : null}
                          {r.party?.label || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.account || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-indigo-700">{formatCurrency(r.settledTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatCurrency(r.cashRecovered)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-700">{formatCurrency(r.remaining)}</td>
                        <td className="px-4 py-3 text-gray-500">{r.reference || "—"}</td>
                      </tr>
                      {open && lines.length > 0 && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={8} className="px-6 py-2">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">
                              Settled against {lines.length} payable{lines.length === 1 ? "" : "s"}
                            </p>
                            <ul className="space-y-1">
                              {lines.map((l, i) => (
                                <li key={i} className="flex items-center justify-between text-xs">
                                  <Link
                                    href={`/admin/liabilities/payables/rent?doc=${l.payableId}`}
                                    className="text-indigo-600 hover:underline"
                                  >
                                    Payable {String(l.payableId).slice(-6)}
                                  </Link>
                                  <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
            <span>{data.total} advances</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">
                Prev
              </button>
              <span>{page} / {data.totalPages}</span>
              <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {advanceModal && (
        <RecordAdvanceModal
          open
          mode={advanceModal.mode}
          receivable={advanceModal.receivable}
          toast={toast}
          onClose={() => setAdvanceModal(null)}
          onSuccess={() => {
            setAdvanceModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
