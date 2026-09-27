"use client";

import { useEffect, useState } from "react";
import { X, Landmark, Loader2 } from "lucide-react";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency } from "@/lib/financeUI";
import { useToast } from "@/components/Toast";

const LOAN_ACCOUNTS = ["Bajaj Loan", "Fibe Loan"];
const BANK_OPTIONS = ACCOUNTS.filter((a) => !LOAN_ACCOUNTS.includes(a));

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function LoanSettlementModal({
  fromAccount,
  defaultAmount,
  contextLabel,
  sourceTransactionId,
  branch: defaultBranch,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const [toAccount, setToAccount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(defaultAmount != null ? String(defaultAmount) : "");
  const [settlementId, setSettlementId] = useState("");
  const [branch, setBranch] = useState(defaultBranch || "");
  const [noBranch, setNoBranch] = useState(!defaultBranch);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [alreadySettled, setAlreadySettled] = useState(0);
  const [overSettlement, setOverSettlement] = useState(null);
  const [allowOverSettlement, setAllowOverSettlement] = useState(false);

  useEffect(() => {
    if (!sourceTransactionId) return;
    fetch(`/api/transactions/${sourceTransactionId}/cancel-loan`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        setAlreadySettled(json.totalSettled || 0);
        const rem = json.remaining ?? defaultAmount ?? 0;
        setRemaining(rem);
        if (json.totalSettled > 0) setAmount(String(Math.max(rem, 0)));
      })
      .catch(() => {});
  }, [sourceTransactionId]);

  const handleSubmit = async () => {
    if (!toAccount) return toast.error("Select the settlement bank");
    if (!(parseFloat(amount) > 0)) return toast.error("Enter a settlement amount greater than zero");
    if (!settlementId.trim()) return toast.error("Enter a settlement ID");
    if (!noBranch && !branch) return toast.error("Select a branch, or tick company-level");

    setSubmitting(true);
    setOverSettlement(null);
    try {
      const res = await fetch("/api/account-transfers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromAccount,
          toAccount,
          amount: parseFloat(amount),
          date,
          branch: noBranch ? undefined : branch,
          reference: settlementId.trim(),
          remarks: `Loan settlement — ${fromAccount} → ${toAccount}`,
          sourceTransactionId: sourceTransactionId || undefined,
          transferKind: sourceTransactionId ? "LOAN_SETTLEMENT" : "MANUAL",
          allowOverSettlement,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.remaining !== undefined) {
          setOverSettlement({ alreadySettled: json.alreadySettled, remaining: json.remaining });
          setSubmitting(false);
          return;
        }
        throw new Error(json.error || "Failed to record settlement");
      }
      toast.success("Loan settlement recorded");
      setDone(true);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">Settle {fromAccount}</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Record a bank settlement for this loan</p>
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

            {contextLabel && (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-500">
                Settling: <span className="font-semibold text-slate-700">{contextLabel}</span>
              </div>
            )}

            {sourceTransactionId && remaining != null && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 text-xs text-slate-600">
                Loan amount <b>{formatCurrency(defaultAmount)}</b> · Already settled{" "}
                <b>{formatCurrency(alreadySettled)}</b> · Remaining <b>{formatCurrency(remaining)}</b>
              </div>
            )}

            <section>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Settlement date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={submitting || done}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Settlement amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={submitting || done}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <div>
              <label className={labelClass}>Settlement ID</label>
              <input
                type="text"
                value={settlementId}
                onChange={(e) => setSettlementId(e.target.value)}
                disabled={submitting || done}
                placeholder="UTR / reference number"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Settlement bank</label>
              <select
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
                disabled={submitting || done}
                className={inputClass}
              >
                <option value="">Select account</option>
                {BANK_OPTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Branch</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={submitting || done || noBranch}
                className={inputClass}
              >
                <option value="">Select branch</option>
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={noBranch}
                  onChange={(e) => setNoBranch(e.target.checked)}
                  disabled={submitting || done}
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                Company-level (no branch)
              </label>
            </div>

            {overSettlement && (
              <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                <p>
                  This would exceed the loan amount — {formatCurrency(overSettlement.alreadySettled)} already
                  settled, {formatCurrency(overSettlement.remaining)} remaining.
                </p>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowOverSettlement}
                    onChange={(e) => setAllowOverSettlement(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  Record it anyway (fee/short settlement)
                </label>
              </div>
            )}

          </div>
        </div>

        {}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (!!overSettlement && !allowOverSettlement)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Settlement"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
