"use client";

import { useState } from "react";
import { X, Loader2, Ban, Trash2, PenSquare } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function ReviseReceivableModal({ receivable, onClose, onSuccess, toast }) {
  const [totalAmount, setTotalAmount] = useState(String(receivable.totalAmount));
  const [dueDate, setDueDate] = useState(receivable.dueDate ? receivable.dueDate.split("T")[0] : "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const save = async (extra = {}) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/receivables/${receivable._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount: totalAmount !== String(receivable.totalAmount) ? totalAmount : undefined,
          dueDate: dueDate || null,
          note,
          ...extra,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Receivable updated");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to update receivable");
      }
    } catch (error) {
      console.error("Error updating receivable:", error);
      toast.error("Failed to update receivable");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm(
      `Permanently delete this receivable?\n\n` +
        `  ${receivable.payer?.label || "Receivable"} · ${formatCurrency(receivable.totalAmount)}\n\n` +
        `Cancelling instead keeps the record and the audit trail. Delete cannot be undone.`,
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/receivables/${receivable._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || "Failed to delete receivable");
      toast.success("Receivable deleted");
      onSuccess();
    } catch (error) {
      console.error("Error deleting receivable:", error);
      toast.error("Failed to delete receivable");
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <PenSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">Revise Receivable</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Adjust amount, due date, or lifecycle</p>
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
              <p className="truncate text-sm font-bold text-slate-900">{receivable.payer?.label}</p>
              <p className="mt-1 text-xs text-slate-500">
                Already received:{" "}
                <span className="font-semibold text-emerald-700">{formatCurrency(receivable.received)}</span>
              </p>
            </div>

            <div>
              <label className={labelClass}>Total Amount Expected (₹)</label>
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                min="0"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
                placeholder="Reason for the change (optional)"
              />
            </div>
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
            <button
              type="button"
              onClick={() => save()}
              disabled={submitting}
              className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => save({ isCancelled: !receivable.isCancelled })}
            disabled={submitting}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              receivable.isCancelled
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            <Ban className="h-4 w-4" />
            {receivable.isCancelled ? "Reinstate Receivable" : "Cancel Receivable"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
