"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { formatCurrency, formatDate } from "@/lib/financeUI";

const todayISO = () => new Date().toLocaleDateString("en-CA");
const asInputDate = (d) => (d ? new Date(d).toLocaleDateString("en-CA") : todayISO());

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function ReverseTransactionModal({ transaction, onClose, onDone }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());
  const [remarks, setRemarks] = useState("");

  const id = transaction?._id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/transactions/${id}/reverse`);
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(d.error || "Could not read this transaction's reversal state");
        } else {
          setState(d);
          setAmount(String(d.remaining ?? ""));
          setDate(d.originalPeriodLocked ? todayISO() : asInputDate(transaction?.date));
        }
      } catch {
        if (!cancelled) setError("Could not read this transaction's reversal state");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, transaction?.date]);

  const requested = Number(amount) || 0;
  const remaining = state?.remaining ?? 0;
  const isPartial = requested > 0 && requested < remaining - 0.01;

  const patientName = transaction?.patient?.personal?.name || transaction?.patientName || null;
  const receivedNow = Number(transaction?.patient?.payments?.amountReceived ?? NaN);
  const receivedAfter = Number.isFinite(receivedNow) ? Math.max(0, receivedNow - requested) : null;
  const isRevenue = transaction?.costType === "Revenue";
  const account = transaction?.furtherMode;
  const blocked = state?.blockedReason;

  const submit = async () => {
    if (!reason.trim()) return toast.error("A reason is required");
    if (!(requested > 0)) return toast.error("Enter an amount greater than zero");
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: requested,
          reason: reason.trim(),
          date,
          remarks: remarks.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError([d.error, ...(d.reasons || []), d.hint].filter(Boolean).join(" "));
        return;
      }
      toast.success(d.message || "Reversal recorded");
      onDone?.(d);
      onClose();
    } catch {
      setError("Failed to record the reversal");
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">Reverse / Refund</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Undo all or part of this transaction</p>
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
          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <Loader2 className="inline h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Original</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(state?.originalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date</span>
                  <span className="text-slate-700">{formatDate(transaction?.date)}</span>
                </div>
                {account ? (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account</span>
                    <span className="text-slate-700">{account}</span>
                  </div>
                ) : null}
                {state?.alreadyReversed > 0 ? (
                  <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                    <span className="font-medium text-purple-700">Already reversed</span>
                    <span className="font-semibold text-purple-700">
                      {formatCurrency(state.alreadyReversed)} · {formatCurrency(state.remaining)} left
                    </span>
                  </div>
                ) : null}
              </div>

              {blocked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
                  {blocked}
                </div>
              ) : (
                <>
                  {!account && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
                      This transaction names no account, so the reversal cannot put the money back
                      into one either. Both rows will be missing from Cash &amp; Bank.
                    </div>
                  )}

                  {state?.originalPeriodLocked && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 text-xs text-indigo-800">
                      The original sits in a closed period, so this reversal is dated <b>today</b>. A
                      closed period stays closed and the correction lands in the open one.
                    </div>
                  )}

                  <section>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Amount to reverse <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          max={remaining}
                          min={0}
                          className={inputClass}
                        />
                        <p className="mt-1.5 text-xs text-slate-400">
                          Up to {formatCurrency(remaining)}. Lower it for a partial refund.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>Date</label>
                        <input
                          type="date"
                          value={date}
                          disabled={state?.originalPeriodLocked}
                          onChange={(e) => setDate(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </section>

                  <div>
                    <label className={labelClass}>
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Loan cancelled · Patient refund · Duplicate entry"
                      className={inputClass}
                    />
                    <p className="mt-1.5 text-xs text-slate-400">
                      Goes into the narration, so this row explains itself in a bank reconciliation
                      months later.
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Remarks</label>
                    <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} />
                  </div>

                  <div className="space-y-1.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-4 w-4" /> What this will do
                    </div>
                    <p>
                      Creates a <b>−{formatCurrency(requested)}</b> entry
                      {patientName ? (
                        <>
                          {" "}
                          for <b>{patientName}</b>
                        </>
                      ) : null}
                      , dated {formatDate(date)}.
                    </p>
                    <p>
                      {isRevenue ? "Revenue" : "Expenses"}
                      {account ? (
                        <>
                          {" "}
                          and <b>{account}</b> both drop
                        </>
                      ) : (
                        " drops"
                      )}{" "}
                      by {formatCurrency(requested)}.
                    </p>
                    {isRevenue && patientName && receivedAfter !== null ? (
                      <p>
                        {patientName}&apos;s received amount goes from {formatCurrency(receivedNow)} to{" "}
                        <b>{formatCurrency(receivedAfter)}</b>
                        {receivedAfter === 0 ? ", which will move their status backward." : "."}
                      </p>
                    ) : null}
                    {isPartial ? (
                      <p className="text-red-700">
                        Partial — the original stays open, with{" "}
                        {formatCurrency(remaining - requested)} still reversible.
                      </p>
                    ) : (
                      <p className="text-red-700">Full reversal — the original will be marked Reversed.</p>
                    )}
                    <p className="pt-1 text-xs text-red-600">
                      Both rows stay visible. Nothing is deleted or hidden — the pair is the audit
                      trail.
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <span className="text-xs font-bold text-red-700">!</span>
                  </div>
                  <p className="text-xs leading-5 text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {}
        {!loading && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !!blocked || !reason.trim() || !(requested > 0)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Reverse {formatCurrency(requested)}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
