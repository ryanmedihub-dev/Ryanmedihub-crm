"use client";

import { useEffect, useState } from "react";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { EXPENSE_METHODS } from "@/constants/paymentMethods";
import { Loader2, TrendingDown, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const METHOD_OPTIONS = EXPENSE_METHODS;

const getTodayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function CollabSettlementPanel({ onSaved }) {
  const [clinic, setClinic] = useState("");
  const [payables, setPayables] = useState([]);
  const [loadingPayables, setLoadingPayables] = useState(false);

  const [selectedPayableId, setSelectedPayableId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paymentId, setPaymentId] = useState("");
  const [date, setDate] = useState(getTodayIST());
  const [remarks, setRemarks] = useState("");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!clinic) {
      setPayables([]);
      setSelectedPayableId("");
      return;
    }
    setLoadingPayables(true);
    const params = new URLSearchParams({
      purpose: "COLLAB_CLINIC",
      payeeKind: "COLLAB_CLINIC",
      payeeLabel: clinic,
      limit: "50",
    });
    fetch(`/api/payables/list?${params}`)
      .then((r) => r.json())
      .then((d) => setPayables(d.success ? d.payables || [] : []))
      .catch(() => setPayables([]))
      .finally(() => setLoadingPayables(false));
  }, [clinic]);

  const open = payables.filter((p) => p.status !== "Paid");
  const selected = payables.find((p) => p._id === selectedPayableId);
  const overBalance = selected && parseFloat(amount || 0) > selected.pending;
  const totalOutstanding = open.reduce((sum, p) => sum + (p.pending || 0), 0);

  const canSave =
    clinic && selectedPayableId && parseFloat(amount) > 0 && (!overBalance || allowOverpayment) && !saving;

  const handleSave = async () => {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const res = await fetch("/api/transactions/expense/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseCategory: "Collab Clinic Payment",
          expenseType: "Collab Clinic Payment",
          amount,
          method,
          paymentId,
          branch: clinic,
          date,
          remarks,
          payableId: selectedPayableId,
          allowOverpayment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record settlement");
        return;
      }
      setNotice(`Settlement of ${formatCurrency(amount)} recorded for ${clinic}.`);
      setAmount("");
      setPaymentId("");
      setRemarks("");
      setAllowOverpayment(false);
      setSelectedPayableId("");
      setClinic((c) => c);
      const params = new URLSearchParams({
        purpose: "COLLAB_CLINIC",
        payeeKind: "COLLAB_CLINIC",
        payeeLabel: clinic,
        limit: "50",
      });
      const refreshed = await fetch(`/api/payables/list?${params}`).then((r) => r.json());
      setPayables(refreshed.success ? refreshed.payables || [] : []);
      onSaved?.(data);
    } catch {
      setError("Failed to record settlement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Clinic Settlement</h3>
          <p className="text-sm text-gray-500 mb-4">
            Record money paid to a partner clinic against what we owe them. This is the only
            expense entry available from the collab panel.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Clinic <span className="text-red-500">*</span>
              </label>
              <select
                value={clinic}
                onChange={(e) => {
                  setClinic(e.target.value);
                  setSelectedPayableId("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select clinic</option>
                {COLLAB_BRANCHES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Outstanding to this clinic
              </label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-rose-600">
                {loadingPayables ? "…" : formatCurrency(totalOutstanding)}
              </div>
            </div>
          </div>

          {clinic && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Settle against <span className="text-red-500">*</span>
              </label>
              {loadingPayables ? (
                <p className="text-sm text-gray-400">Loading payables…</p>
              ) : open.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                  Nothing outstanding for {clinic}. A payable appears here when a collab case
                  leaves us owing the clinic.
                </p>
              ) : (
                <select
                  value={selectedPayableId}
                  onChange={(e) => setSelectedPayableId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select an open payable…</option>
                  {open.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.expenseSubType || p.expenseCategory}
                      {p.period ? ` (${p.period.month}/${p.period.year})` : ""} — Pending{" "}
                      {formatCurrency(p.pending)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {selectedPayableId && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transaction ID
                </label>
                <input
                  type="text"
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {overBalance && (
              <label className="flex items-center gap-2 text-xs text-amber-700 mt-3">
                <input
                  type="checkbox"
                  checked={allowOverpayment}
                  onChange={(e) => setAllowOverpayment(e.target.checked)}
                />
                Amount exceeds pending balance ({formatCurrency(selected.pending)}) — allow
                overpayment
              </label>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-gray-500" /> Summary
          </h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">Clinic</span>
            <span className="font-semibold text-gray-900">{clinic || "—"}</span>
          </div>
          <div className="flex justify-between text-sm mb-4">
            <span className="text-gray-500">Outstanding</span>
            <span className="font-semibold text-rose-600">{formatCurrency(totalOutstanding)}</span>
          </div>
          <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
            <span className="text-lg font-bold text-gray-900">Paying now</span>
            <span className="text-2xl font-bold text-indigo-600">{formatCurrency(amount)}</span>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full mt-6 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Recording…
              </>
            ) : (
              <>
                <TrendingDown className="w-4 h-4" /> Record Settlement
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
