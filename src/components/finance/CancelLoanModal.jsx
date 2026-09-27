"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { formatCurrency, formatDate } from "@/lib/financeUI";

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-red-500 focus:ring-2 focus:ring-red-100";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function CancelLoanModal({ transaction, onClose, onDone }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [loanState, setLoanState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState("Loan cancelled");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [done, setDone] = useState(null);

  const id = transaction?._id;
  const account = transaction?.furtherMode;
  const patientName = transaction?.patient?.personal?.name || transaction?.patientName || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [reverseRes, loanRes] = await Promise.all([
          fetch(`/api/transactions/${id}/reverse`).then((r) => r.json()),
          fetch(`/api/transactions/${id}/cancel-loan`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setState(reverseRes);
        setLoanState(loanRes);
      } catch {
        if (!cancelled) setError("Could not read this loan's cancellation state");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const settlementTransfers = loanState?.settlementTransfers || [];
  const isCaseB = settlementTransfers.length > 0;
  const totalSettled = loanState?.totalSettled || 0;
  const blocked = state?.blockedReason;
  const amount = state?.remaining ?? transaction?.amount ?? 0;

  const submit = async () => {
    if (!reason.trim()) return toast.error("A reason is required");
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${id}/cancel-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: reason.trim(), date }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError([d.error, ...(d.reasons || []), d.hint].filter(Boolean).join(" "));
        return;
      }
      toast.success(d.message || "Loan cancelled");
      setDone(d);
      onDone?.(d);
    } catch {
      setError("Failed to cancel this loan");
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
              <Ban className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">Cancel Loan</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Reverse this loan and its settlements</p>
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
          ) : done ? (
            <div className="space-y-3 p-4 sm:p-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                {done.message}
              </div>
              {done.patientStatus && done.patientStatus.before !== done.patientStatus.after && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Patient status changed: <b>{done.patientStatus.before || "—"}</b> →{" "}
                  <b>{done.patientStatus.after || "—"}</b> (amount received now{" "}
                  {formatCurrency(done.patientStatus.amountReceived)})
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date</span>
                  <span className="text-slate-700">{formatDate(transaction?.date)}</span>
                </div>
                {account && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account</span>
                    <span className="text-slate-700">{account}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-500">Status</span>
                  <span className={`font-medium ${isCaseB ? "text-sky-700" : "text-slate-700"}`}>
                    {isCaseB
                      ? settlementTransfers.length > 1
                        ? `Settled in ${settlementTransfers.length} parts → ${formatCurrency(totalSettled)}`
                        : `Settled → ${settlementTransfers[0].toAccount}`
                      : "Not yet settled"}
                  </span>
                </div>
              </div>

              {blocked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
                  {blocked}
                </div>
              ) : (
                <>
                  <section>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Cancellation date</label>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Reason <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </section>

                  <div className="space-y-1.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-4 w-4" /> What this will do
                    </div>
                    {isCaseB ? (
                      <p>
                        This will reverse <b>{formatCurrency(amount)}</b>
                        {patientName ? (
                          <>
                            {" "}
                            for <b>{patientName}</b>
                          </>
                        ) : null}{" "}
                        and undo{" "}
                        {settlementTransfers.length > 1 ? (
                          <>
                            <b>{settlementTransfers.length}</b> settlement transfers totalling{" "}
                            <b>{formatCurrency(totalSettled)}</b> out of <b>{account}</b>
                          </>
                        ) : (
                          <>
                            the transfer of <b>{formatCurrency(settlementTransfers[0].amount)}</b> from{" "}
                            <b>{account}</b> to <b>{settlementTransfers[0].toAccount}</b>
                          </>
                        )}
                        . Revenue drops by {formatCurrency(amount)}; every account balance involved
                        returns to where it was before settlement.
                      </p>
                    ) : (
                      <p>
                        This will reverse <b>{formatCurrency(amount)}</b>
                        {patientName ? (
                          <>
                            {" "}
                            for <b>{patientName}</b>
                          </>
                        ) : null}
                        . Revenue and the <b>{account}</b> balance both drop by {formatCurrency(amount)}.
                      </p>
                    )}
                    <p className="pt-1 text-xs text-red-600">
                      Both/all rows stay visible. Nothing is deleted or hidden — the pair (or
                      quartet) is the audit trail.
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
        {!loading && !done && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !!blocked || !reason.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  Cancel Loan
                </>
              )}
            </button>
          </div>
        )}
        {done && (
          <div className="flex shrink-0 border-t border-slate-200 bg-white p-4 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
