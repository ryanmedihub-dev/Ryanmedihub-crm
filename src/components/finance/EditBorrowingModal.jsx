"use client";

import { useState } from "react";
import { X, Loader2, Ban, Trash2, HandCoins } from "lucide-react";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";
import { formatCurrency } from "@/lib/financeUI";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function EditBorrowingModal({ borrowing, onClose, onSuccess, toast }) {
  const isRepayment = borrowing.direction === "OUT";

  const [amount, setAmount] = useState(String(borrowing.amount));
  const [date, setDate] = useState(new Date(borrowing.date).toISOString().split("T")[0]);
  const [account, setAccount] = useState(borrowing.account);
  const [branch, setBranch] = useState(borrowing.branch || "");
  const [reference, setReference] = useState(borrowing.reference || "");
  const [remarks, setRemarks] = useState(borrowing.remarks || "");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/borrowings/${borrowing._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          date,
          account,
          branch: branch || null,
          reference,
          remarks,
          allowOverpayment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Borrowing updated");
        onSuccess();
      } else {
        setError(data.error || "Failed to update");
      }
    } catch {
      setError("Failed to update — check your connection and try again");
    } finally {
      setSubmitting(false);
    }
  };

  const setLifecycle = async (action) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/borrowings/${borrowing._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(action === "cancel" ? "Borrowing cancelled" : "Borrowing reinstated");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to update");
      }
    } catch {
      toast.error("Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm(
      `Permanently delete this ${isRepayment ? "repayment" : "borrowing"} row (${formatCurrency(borrowing.amount)})?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/borrowings/${borrowing._id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Borrowing deleted");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <HandCoins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                Edit {isRepayment ? "Repayment" : "Borrowing"}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Update amount, account, or lifecycle</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
          <div className="space-y-5 p-4 sm:p-6">

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-bold text-slate-900">{borrowing.party?.label}</p>
                {borrowing.isCancelled ? (
                  <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                    Cancelled
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{isRepayment ? "Repayment" : "Received"}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={borrowing.isCancelled}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Account</label>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  disabled={borrowing.isCancelled}
                  className={inputClass}
                >
                  {ACCOUNTS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Date</label>
              <DebouncedDateInput value={date} onCommit={setDate} className={inputClass} />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <input
                type="checkbox"
                checked={allowOverpayment}
                onChange={(e) => setAllowOverpayment(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <p className="text-xs leading-5 text-amber-700">
                Allow overpayment (only matters if this is a repayment amount increase)
              </p>
            </label>

            <div>
              <label className={labelClass}>Branch</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={borrowing.isCancelled}
                className={inputClass}
              >
                <option value="">Company-level (no branch)</option>
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Reference</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={borrowing.isCancelled}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={borrowing.isCancelled}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <span className="text-xs font-bold text-red-700">!</span>
                </div>
                <p className="text-xs leading-5 text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>

        {}
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white p-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Close
            </button>
            {!borrowing.isCancelled && (
              <button
                type="button"
                onClick={save}
                disabled={submitting}
                className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setLifecycle(borrowing.isCancelled ? "reinstate" : "cancel")}
            disabled={submitting}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              borrowing.isCancelled
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            <Ban className="h-4 w-4" />
            {borrowing.isCancelled ? "Reinstate" : "Cancel"}
          </button>
          {borrowing.isCancelled && (
            <button
              type="button"
              onClick={remove}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete Permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
