"use client";

import { useCallback, useEffect, useState } from "react";
import TransactionSectionCard from "@/components/TransactionSectionCard";
import ReceiptUpload from "@/components/ReceiptUpload";
import { useToast } from "@/components/Toast";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { HelpCircle, Loader2, Save, CheckCircle2, Link2 } from "lucide-react";

const emptyForm = () => ({
  account: "",
  direction: "IN",
  amount: "",
  date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  branch: "",
  reference: "",
  remarks: "",
  receipts: [],
});

export default function SuspenseEntryForm({ onSaved }) {
  const toast = useToast();
  const [data, setData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ count: 0, netAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("open");
  const [resolving, setResolving] = useState("");

  const set = (patch) => setData((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suspense?status=${status}&limit=50`);
      const d = await res.json();
      if (res.ok) {
        setEntries(d.entries || []);
        setSummary(d.openSummary || { count: 0, netAmount: 0 });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!data.account) return toast.error("Select which account the money moved through");
    if (!(parseFloat(data.amount) > 0)) return toast.error("Enter an amount greater than zero");

    setSaving(true);
    try {
      const res = await fetch("/api/suspense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Failed to record entry");
      toast.success("Suspense entry recorded");
      setData(emptyForm());
      load();
      onSaved?.(d.entry);
    } catch {
      toast.error("Failed to record entry");
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (entry) => {
    const transactionId = window.prompt(
      `Resolving ${formatCurrency(entry.amount)} in ${entry.account}.\n\n` +
        `Create the real transaction first, then paste its ID here.\n` +
        `(Open the transaction and copy the id from the URL.)`,
    );
    if (!transactionId) return;

    setResolving(entry._id);
    try {
      const res = await fetch(`/api/suspense/${entry._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", transactionId: transactionId.trim() }),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Failed to resolve");
      toast.success("Resolved — the real transaction now carries this money");
      load();
    } catch {
      toast.error("Failed to resolve");
    } finally {
      setResolving("");
    }
  };

  const cancel = async (entry) => {
    const note = window.prompt("Cancel this entry — why? (e.g. duplicate, already recorded)");
    if (note === null) return;
    setResolving(entry._id);
    try {
      const res = await fetch(`/api/suspense/${entry._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", note }),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Failed to cancel");
      toast.success("Entry cancelled");
      load();
    } catch {
      toast.error("Failed to cancel");
    } finally {
      setResolving("");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <TransactionSectionCard title="Unexplained Bank Entry" icon={HelpCircle}>
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            For money on the bank statement that isn&apos;t in the CRM and whose source you
            don&apos;t know yet. It will show in the close book so your books match the bank, but
            is deliberately <b>excluded from sales and revenue totals</b> until you identify it.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account <span className="text-red-500">*</span>
              </label>
              <select
                value={data.account}
                onChange={(e) => set({ account: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
              >
                <option value="">Which account did it move through?</option>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Direction</label>
              <select
                value={data.direction}
                onChange={(e) => set({ direction: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
              >
                <option value="IN">Money in — unexplained credit</option>
                <option value="OUT">Money out — unexplained debit</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={data.amount}
                onChange={(e) => set({ amount: e.target.value })}
                min="0"
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date on statement</label>
              <input
                type="date"
                value={data.date}
                onChange={(e) => set({ date: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={data.branch}
                onChange={(e) => set({ branch: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
              >
                <option value="">Company-level (no branch)</option>
                {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank reference <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={data.reference}
                onChange={(e) => set({ reference: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                placeholder="UTR / narration from the statement"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Usually the only clue that lets someone identify this later — worth capturing.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
              <input
                type="text"
                value={data.remarks}
                onChange={(e) => set({ remarks: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                placeholder="Anything known about it so far"
              />
            </div>
          </div>
        </TransactionSectionCard>

        <TransactionSectionCard title="Statement / Supporting Document">
          <ReceiptUpload
            receipts={data.receipts || []}
            onChange={(receipts) => set({ receipts })}
            section="suspense"
          />
        </TransactionSectionCard>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Unidentified entries</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {summary.count} open · {formatCurrency(summary.netAmount)} unexplained
              </p>
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-gray-500 text-sm">
              {status === "open"
                ? "Nothing unexplained — the books agree with the bank."
                : "No entries."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map((e) => (
                <div key={e._id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium">
                      {e.direction === "OUT" ? "−" : "+"}{formatCurrency(e.amount)}
                      <span className="text-gray-400 font-normal"> · {e.account}</span>
                      {e.branch && <span className="text-gray-400 font-normal"> · {e.branch}</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {formatDate(e.date)}
                      {e.reference && ` · ${e.reference}`}
                      {e.remarks && ` · ${e.remarks}`}
                    </p>
                  </div>

                  {e.isResolved ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      Resolved
                      {e.resolvedTransactionId?.amount != null &&
                        ` · ${formatCurrency(e.resolvedTransactionId.amount)}`}
                    </span>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => resolve(e)}
                        disabled={resolving === e._id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {resolving === e._id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Link2 className="w-3 h-3" />}
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => cancel(e)}
                        disabled={resolving === e._id}
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Summary
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Account</dt>
                <dd className="font-medium text-gray-900">{data.account || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Direction</dt>
                <dd className="font-medium text-gray-900">
                  {data.direction === "OUT" ? "Money out" : "Money in"}
                </dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <dt className="text-gray-500">Amount</dt>
                <dd className="font-semibold text-gray-900">
                  {formatCurrency(parseFloat(data.amount) || 0)}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
              Affects the {data.account || "account"} balance in close book. Does not affect sales,
              revenue or expense reports.
            </p>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Record Suspense Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
