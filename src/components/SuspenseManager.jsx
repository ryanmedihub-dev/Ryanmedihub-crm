"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import {
  Loader2, Edit2, Trash2, Link2, CheckCircle2, RotateCcw, Ban, X, HelpCircle, FileDown,
} from "lucide-react";

const STATUS_TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const emptyEdit = () => ({
  account: "", direction: "IN", amount: "", date: "", branch: "", reference: "", remarks: "",
});

export default function SuspenseManager() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ count: 0, netAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("open");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyEdit);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ status, limit: "200" });
      if (account) p.set("account", account);
      if (branch) p.set("branch", branch);
      if (dateFrom) p.set("from", dateFrom);
      if (dateTo) p.set("to", dateTo);
      const res = await fetch(`/api/suspense?${p}`);
      const d = await res.json();
      if (res.ok) {
        setEntries(d.entries || []);
        setSummary(d.openSummary || { count: 0, netAmount: 0 });
      } else toast.error(d.error || "Failed to load suspense entries");
    } catch {
      toast.error("Failed to load suspense entries");
    } finally {
      setLoading(false);
    }
  }, [status, account, branch, dateFrom, dateTo, toast]);

  useEffect(() => { load(); }, [load]);

  const act = async (entry, body, successMsg) => {
    setBusy(entry._id);
    try {
      const res = await fetch(`/api/suspense/${entry._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Action failed");
      toast.success(successMsg);
      load();
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy("");
    }
  };

  const resolve = (entry) => {
    const transactionId = window.prompt(
      `Resolving ${formatCurrency(entry.amount)} in ${entry.account}.\n\n` +
        `Create the real transaction first, then paste its ID here.\n` +
        `This entry will stop counting toward the balance — the real transaction takes over.`,
    );
    if (!transactionId) return;
    act(entry, { action: "resolve", transactionId: transactionId.trim() }, "Resolved");
  };

  const cancel = (entry) => {
    const note = window.prompt("Cancel this entry — why? (e.g. duplicate, already recorded)");
    if (note === null) return;
    act(entry, { action: "cancel", note }, "Cancelled — kept for audit, no longer counted");
  };

  const reopen = (entry) =>
    act(entry, { action: "reopen" }, "Reopened — counting toward the balance again");

  const remove = async (entry) => {
    const counting = !entry.isResolved && !entry.isCancelled;
    const ok = window.confirm(
      `Permanently delete this suspense entry?\n\n` +
        `  ${entry.direction === "OUT" ? "−" : "+"}${formatCurrency(entry.amount)} · ${entry.account}\n` +
        `  ${formatDate(entry.date)}${entry.reference ? ` · ${entry.reference}` : ""}\n\n` +
        (counting
          ? `This entry is currently counted in the ${entry.account} balance — deleting it will reduce that balance by ${formatCurrency(entry.amount)}.\n\n`
          : "") +
        `Cancelling instead keeps the record and the audit trail. Delete cannot be undone.`,
    );
    if (!ok) return;

    setBusy(entry._id);
    try {
      const res = await fetch(`/api/suspense/${entry._id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Delete failed");
      toast.success("Suspense entry deleted");
      load();
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy("");
    }
  };

  const openEdit = (entry) => {
    setEditing(entry);
    setForm({
      account: entry.account || "",
      direction: entry.direction || "IN",
      amount: String(entry.amount ?? ""),
      date: entry.date ? new Date(entry.date).toISOString().slice(0, 10) : "",
      branch: entry.branch || "",
      reference: entry.reference || "",
      remarks: entry.remarks || "",
    });
  };

  const saveEdit = async () => {
    if (!(parseFloat(form.amount) > 0)) return toast.error("Amount must be greater than zero");
    setBusy(editing._id);
    try {
      const res = await fetch(`/api/suspense/${editing._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Update failed");
      toast.success("Suspense entry updated");
      setEditing(null);
      load();
    } catch {
      toast.error("Update failed");
    } finally {
      setBusy("");
    }
  };

  const exportExcel = async () => {
    if (!entries.length) return toast.error("Nothing to export");
    const { utils, writeFile } = await import("xlsx");
    const rows = entries.map((e) => ({
      Date: formatDate(e.date),
      Account: e.account,
      Branch: e.branch || "",
      Direction: e.direction === "OUT" ? "Money out" : "Money in",
      "Money In": e.direction === "OUT" ? null : e.amount,
      "Money Out": e.direction === "OUT" ? e.amount : null,
      Reference: e.reference || "",
      Remarks: e.remarks || "",
      Status: e.isCancelled ? "Cancelled" : e.isResolved ? "Resolved" : "Open",
      "Counts toward balance": !e.isResolved && !e.isCancelled ? "Yes" : "No",
      "Resolved by txn": e.resolvedTransactionId?._id || e.resolvedTransactionId || "",
      "Recorded by": e.createdBy?.name || "",
    }));
    const ws = utils.json_to_sheet(rows);
    ws["!cols"] = [13, 20, 12, 12, 13, 13, 22, 30, 11, 20, 18].map((wch) => ({ wch }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Suspense");
    writeFile(wb, `suspense-entries_${status}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Unexplained money still in the accounts</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatCurrency(summary.netAmount)}
                <span className="text-sm font-medium text-gray-400 ml-2">
                  across {summary.count} open {summary.count === 1 ? "entry" : "entries"}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700"
          >
            <FileDown className="w-4 h-4" />
            Download Excel
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
            <div className="flex gap-1">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setStatus(t.value)}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                    status === t.value
                      ? "bg-amber-500 text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Account</label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
            >
              <option value="">All accounts</option>
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Branch</label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
            >
              <option value="">All branches</option>
              {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Reference / Remarks</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Money In</th>
                <th className="px-4 py-3 text-right">Money Out</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  {status === "open"
                    ? "Nothing unexplained — the books agree with the bank."
                    : "No entries match these filters."}
                </td></tr>
              ) : (
                entries.map((e) => (
                  <tr key={e._id} className={`hover:bg-gray-50/60 ${e.isCancelled ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(e.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{e.account}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {e.reference || "—"}
                      {e.remarks && <span className="text-gray-400"> · {e.remarks}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.branch || "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">
                      {e.direction === "OUT" ? "" : formatCurrency(e.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-rose-700">
                      {e.direction === "OUT" ? formatCurrency(e.amount) : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill entry={e} />
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        entry={e} busy={busy === e._id}
                        onResolve={() => resolve(e)} onReopen={() => reopen(e)}
                        onCancel={() => cancel(e)} onEdit={() => openEdit(e)} onDelete={() => remove(e)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : entries.length === 0 ? (
            <p className="py-12 text-center text-gray-500 text-sm">No entries.</p>
          ) : (
            entries.map((e) => (
              <div key={e._id} className={`p-4 ${e.isCancelled ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {e.direction === "OUT" ? "−" : "+"}{formatCurrency(e.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {e.account}{e.branch ? ` · ${e.branch}` : ""} · {formatDate(e.date)}
                    </p>
                    {(e.reference || e.remarks) && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {[e.reference, e.remarks].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <StatusPill entry={e} />
                </div>
                <div className="mt-3">
                  <RowActions
                    entry={e} busy={busy === e._id}
                    onResolve={() => resolve(e)} onReopen={() => reopen(e)}
                    onCancel={() => cancel(e)} onEdit={() => openEdit(e)} onDelete={() => remove(e)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Suspense entries move an account balance in Close Book so the CRM matches the bank, and are
        deliberately excluded from every sales, revenue and expense report. Resolving one links it
        to the real transaction, which then carries the money instead — so it is never counted twice.
      </p>

      {editing && (
        <EditModal
          form={form} setForm={setForm} entry={editing} busy={busy === editing._id}
          onClose={() => setEditing(null)} onSave={saveEdit}
        />
      )}
    </div>
  );
}

function StatusPill({ entry }) {
  const [cls, label] = entry.isCancelled
    ? ["bg-gray-100 text-gray-500 border-gray-200 line-through", "Cancelled"]
    : entry.isResolved
      ? ["bg-emerald-100 text-emerald-700 border-emerald-200", "Resolved"]
      : ["bg-amber-100 text-amber-700 border-amber-200", "Open"];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function RowActions({ entry, busy, onResolve, onReopen, onCancel, onEdit, onDelete }) {
  const btn = "p-2 rounded-lg transition-colors disabled:opacity-40";
  return (
    <div className="flex items-center justify-end gap-1">
      {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-1" />}
      {!entry.isResolved && !entry.isCancelled && (
        <button onClick={onResolve} disabled={busy} title="Resolve — link the real transaction"
          className={`${btn} text-emerald-600 hover:bg-emerald-50`}>
          <Link2 size={16} />
        </button>
      )}
      {entry.isResolved && (
        <button onClick={onReopen} disabled={busy} title="Reopen — source unknown again"
          className={`${btn} text-amber-600 hover:bg-amber-50`}>
          <RotateCcw size={16} />
        </button>
      )}
      <button onClick={onEdit} disabled={busy} title="Edit"
        className={`${btn} text-indigo-600 hover:bg-indigo-50`}>
        <Edit2 size={16} />
      </button>
      {!entry.isCancelled && (
        <button onClick={onCancel} disabled={busy} title="Cancel — keeps the record, stops counting"
          className={`${btn} text-gray-500 hover:bg-gray-100`}>
          <Ban size={16} />
        </button>
      )}
      <button onClick={onDelete} disabled={busy} title="Delete permanently"
        className={`${btn} text-red-600 hover:bg-red-50`}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function EditModal({ form, setForm, entry, busy, onClose, onSave }) {
  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  const counting = !entry.isResolved && !entry.isCancelled;
  return (
    <div className="fixed inset-0 overlay-in bg-gray-950/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold text-gray-900">Edit Suspense Entry</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {counting && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This entry is currently counted in the <b>{entry.account}</b> balance. Changing the
              amount or account moves that money in Close Book.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Fld label="Account">
              <select value={form.account} onChange={(e) => set({ account: e.target.value })} className={inp}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Fld>
            <Fld label="Direction">
              <select value={form.direction} onChange={(e) => set({ direction: e.target.value })} className={inp}>
                <option value="IN">Money in</option>
                <option value="OUT">Money out</option>
              </select>
            </Fld>
            <Fld label="Amount (₹)">
              <input type="number" min="0" value={form.amount}
                onChange={(e) => set({ amount: e.target.value })} className={inp} />
            </Fld>
            <Fld label="Date">
              <input type="date" value={form.date}
                onChange={(e) => set({ date: e.target.value })} className={inp} />
            </Fld>
            <Fld label="Branch">
              <select value={form.branch} onChange={(e) => set({ branch: e.target.value })} className={inp}>
                <option value="">Company-level</option>
                {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Fld>
            <Fld label="Reference">
              <input type="text" value={form.reference}
                onChange={(e) => set({ reference: e.target.value })} className={inp}
                placeholder="UTR / narration" />
            </Fld>
            <div className="sm:col-span-2">
              <Fld label="Remarks">
                <input type="text" value={form.remarks}
                  onChange={(e) => set({ remarks: e.target.value })} className={inp} />
              </Fld>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={onSave} disabled={busy}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm";
function Fld({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
