"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import {
  Loader2, Edit2, Trash2, Ban, RotateCcw, X, ArrowLeftRight, ArrowRight, FileDown, CheckCircle2,
} from "lucide-react";

const STATUS_TABS = [
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export default function ContraManager() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("active");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "200" });
      if (status === "all") p.set("includeCancelled", "true");
      if (status === "cancelled") p.set("onlyCancelled", "true");
      if (account) p.set("account", account);
      if (branch) p.set("branch", branch);
      if (dateFrom) p.set("from", dateFrom);
      if (dateTo) p.set("to", dateTo);
      const res = await fetch(`/api/account-transfers/list?${p}`);
      const d = await res.json();
      if (res.ok) setRows(d.transfers || []);
      else toast.error(d.error || "Failed to load contra entries");
    } catch {
      toast.error("Failed to load contra entries");
    } finally {
      setLoading(false);
    }
  }, [status, account, branch, dateFrom, dateTo, toast]);

  useEffect(() => { load(); }, [load]);

  const activeRows = rows.filter((r) => !r.isCancelled);
  const moved = activeRows.reduce((t, r) => t + (r.amount || 0), 0);

  const act = async (row, body, msg) => {
    setBusy(row._id);
    try {
      const res = await fetch(`/api/account-transfers/${row._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Action failed");
      toast.success(msg);
      load();
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy("");
    }
  };

  const cancel = (row) => {
    const note = window.prompt(
      `Cancel this transfer?\n\n  ${row.fromAccount} → ${row.toAccount}  ${formatCurrency(row.amount)}\n\n` +
        `It will stop moving both balances but stays on record. Reason?`,
    );
    if (note === null) return;
    act(row, { action: "cancel", note }, "Cancelled — balances no longer affected");
  };

  const reinstate = (row) =>
    act(row, { action: "reinstate" }, "Reinstated — moving balances again");

  const remove = async (row) => {
    const ok = window.confirm(
      `Permanently delete this contra entry?\n\n` +
        `  ${row.fromAccount} → ${row.toAccount}\n  ${formatCurrency(row.amount)} · ${formatDate(row.date)}\n\n` +
        (!row.isCancelled
          ? `This transfer is currently moving both balances — deleting it will add ${formatCurrency(row.amount)} back to ${row.fromAccount} and remove it from ${row.toAccount}.\n\n`
          : "") +
        `Cancelling instead keeps the record. Delete cannot be undone.`,
    );
    if (!ok) return;
    setBusy(row._id);
    try {
      const res = await fetch(`/api/account-transfers/${row._id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Delete failed");
      toast.success("Contra entry deleted");
      load();
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy("");
    }
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      fromAccount: row.fromAccount || "",
      toAccount: row.toAccount || "",
      amount: String(row.amount ?? ""),
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
      branch: row.branch || "",
      reference: row.reference || "",
      remarks: row.remarks || "",
    });
  };

  const saveEdit = async () => {
    if (form.fromAccount === form.toAccount) {
      return toast.error("A contra entry must move money between two different accounts");
    }
    if (!(parseFloat(form.amount) > 0)) return toast.error("Amount must be greater than zero");
    setBusy(editing._id);
    try {
      const res = await fetch(`/api/account-transfers/${editing._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Update failed");
      toast.success("Contra entry updated");
      if (d.warning) toast.error(d.warning);
      setEditing(null);
      load();
    } catch {
      toast.error("Update failed");
    } finally {
      setBusy("");
    }
  };

  const exportExcel = async () => {
    if (!rows.length) return toast.error("Nothing to export");
    const { utils, writeFile } = await import("xlsx");
    const sheet = rows.map((r) => ({
      Date: formatDate(r.date),
      From: r.fromAccount,
      To: r.toAccount,
      Amount: r.amount,
      Branch: r.branch || "",
      Reference: r.reference || "",
      Remarks: r.remarks || "",
      Status: r.isCancelled ? "Cancelled" : "Active",
      "Moves balances": r.isCancelled ? "No" : "Yes",
      "Recorded by": r.createdBy?.name || "",
    }));
    const ws = utils.json_to_sheet(sheet);
    ws["!cols"] = [13, 20, 20, 14, 12, 22, 30, 11, 15, 18].map((wch) => ({ wch }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Contra Entries");
    writeFile(wb, `contra-entries_${status}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Moved between own accounts</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatCurrency(moved)}
                <span className="text-sm font-medium text-gray-400 ml-2">
                  across {activeRows.length} active {activeRows.length === 1 ? "transfer" : "transfers"}
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
                      ? "bg-violet-500 text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Account (either side)</label>
            <select value={account} onChange={(e) => setAccount(e.target.value)}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150">
              <option value="">All accounts</option>
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150">
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
                <th className="px-4 py-3">Transfer</th>
                <th className="px-4 py-3">Reference / Remarks</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No contra entries match these filters.
                </td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id} className={`hover:bg-gray-50/60 ${r.isCancelled ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-900 font-medium whitespace-nowrap">
                        {r.fromAccount}
                        <ArrowRight className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        {r.toAccount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {r.reference || "—"}
                      {r.remarks && <span className="text-gray-400"> · {r.remarks}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.branch || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="px-4 py-3"><StatusPill row={r} /></td>
                    <td className="px-4 py-3">
                      <RowActions row={r} busy={busy === r._id}
                        onEdit={() => openEdit(r)} onCancel={() => cancel(r)}
                        onReinstate={() => reinstate(r)} onDelete={() => remove(r)} />
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
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-gray-500 text-sm">No contra entries.</p>
          ) : (
            rows.map((r) => (
              <div key={r._id} className={`p-4 ${r.isCancelled ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{formatCurrency(r.amount)}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {r.fromAccount} → {r.toAccount}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(r.date)}{r.branch ? ` · ${r.branch}` : ""}
                      {r.reference ? ` · ${r.reference}` : ""}
                    </p>
                  </div>
                  <StatusPill row={r} />
                </div>
                <div className="mt-3">
                  <RowActions row={r} busy={busy === r._id}
                    onEdit={() => openEdit(r)} onCancel={() => cancel(r)}
                    onReinstate={() => reinstate(r)} onDelete={() => remove(r)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        A contra entry moves money between your own accounts. It has no profit-and-loss impact —
        never revenue, never an expense — so it changes account balances in Close Book while the
        total across all accounts stays exactly the same. Cancelling one stops it moving balances
        but keeps the record.
      </p>

      {editing && (
        <EditModal form={form} setForm={setForm} row={editing} busy={busy === editing._id}
          onClose={() => setEditing(null)} onSave={saveEdit} />
      )}
    </div>
  );
}

function StatusPill({ row }) {
  const [cls, label] = row.isCancelled
    ? ["bg-gray-100 text-gray-500 border-gray-200 line-through", "Cancelled"]
    : ["bg-violet-100 text-violet-700 border-violet-200", "Active"];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function RowActions({ row, busy, onEdit, onCancel, onReinstate, onDelete }) {
  const btn = "p-2 rounded-lg transition-colors disabled:opacity-40";
  return (
    <div className="flex items-center justify-end gap-1">
      {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-1" />}
      <button onClick={onEdit} disabled={busy} title="Edit"
        className={`${btn} text-indigo-600 hover:bg-indigo-50`}>
        <Edit2 size={16} />
      </button>
      {row.isCancelled ? (
        <button onClick={onReinstate} disabled={busy} title="Reinstate — moves balances again"
          className={`${btn} text-violet-600 hover:bg-violet-50`}>
          <RotateCcw size={16} />
        </button>
      ) : (
        <button onClick={onCancel} disabled={busy} title="Cancel — keeps the record, stops moving balances"
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

function EditModal({ form, setForm, row, busy, onClose, onSave }) {
  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  const sameAccount = form.fromAccount && form.fromAccount === form.toAccount;
  return (
    <div className="fixed inset-0 overlay-in bg-gray-950/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold text-gray-900">Edit Contra Entry</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!row.isCancelled && (
            <div className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              This transfer is moving both balances. Changing the amount or either account shifts
              money between them in Close Book.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Fld label="From account">
              <select value={form.fromAccount} onChange={(e) => set({ fromAccount: e.target.value })} className={inp}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Fld>
            <Fld label="To account">
              <select value={form.toAccount} onChange={(e) => set({ toAccount: e.target.value })} className={inp}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Fld>
            {sameAccount && (
              <p className="sm:col-span-2 text-xs text-red-600 -mt-2">
                A contra entry must move money between two different accounts.
              </p>
            )}
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
                placeholder="UTR / cheque no." />
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
            <button onClick={onSave} disabled={busy || sameAccount}
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
