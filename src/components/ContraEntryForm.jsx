"use client";

import { useEffect, useState } from "react";
import TransactionSectionCard from "@/components/TransactionSectionCard";
import ReceiptUpload from "@/components/ReceiptUpload";
import { useToast } from "@/components/Toast";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency } from "@/lib/financeUI";
import { ArrowRight, Loader2, Save, Wallet } from "lucide-react";

const emptyForm = () => ({
  fromAccount: "",
  toAccount: "",
  amount: "",
  date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  branch: "",
  reference: "",
  remarks: "",
  receipts: [],
});

export default function ContraEntryForm({ onSaved }) {
  const toast = useToast();
  const [data, setData] = useState(emptyForm);
  const [balances, setBalances] = useState(null);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setData((prev) => ({ ...prev, ...patch }));

  const loadBalances = async (asOf) => {
    setBalancesLoading(true);
    try {
      const res = await fetch(`/api/account-transfers/balances?asOf=${encodeURIComponent(asOf)}`);
      const d = await res.json();
      if (res.ok) setBalances(d.balances);
    } catch (error) {
      console.error("Error loading account balances:", error);
    } finally {
      setBalancesLoading(false);
    }
  };

  useEffect(() => {
    loadBalances(data.date);
  }, [data.date]);

  const amount = parseFloat(data.amount) || 0;
  const sameAccount = data.fromAccount && data.fromAccount === data.toAccount;
  const fromBalance = balances?.[data.fromAccount];
  const toBalance = balances?.[data.toAccount];
  const wouldGoNegative =
    data.fromAccount && fromBalance !== undefined && amount > 0 && fromBalance - amount < 0;

  const handleSave = async () => {
    if (!data.fromAccount || !data.toAccount) {
      toast.error("Pick both accounts");
      return;
    }
    if (sameAccount) {
      toast.error("A contra entry must move money between two different accounts");
      return;
    }
    if (!(amount > 0)) {
      toast.error("Enter an amount greater than zero");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account-transfers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("Contra entry recorded");
        if (d.warning) toast.info(d.warning);
        setData(emptyForm());
        loadBalances(emptyForm().date);
        onSaved?.(d.transfer);
      } else {
        toast.error(d.error || "Failed to record contra entry");
      }
    } catch (error) {
      console.error("Error saving contra entry:", error);
      toast.error("Failed to record contra entry");
    } finally {
      setSaving(false);
    }
  };

  const AccountBalance = ({ account, label }) => {
    if (!account) return null;
    const value = balances?.[account];
    return (
      <p className="text-xs text-gray-500 mt-1.5">
        {label}:{" "}
        {balancesLoading || value === undefined ? (
          <span className="text-gray-400">loading…</span>
        ) : (
          <span className={`font-semibold ${value < 0 ? "text-rose-600" : "text-gray-900"}`}>
            {formatCurrency(value)}
          </span>
        )}
      </p>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <TransactionSectionCard
          title="Contra Entry"
          subtitle="Transfer between your own accounts"
          icon={Wallet}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Account <span className="text-red-500">*</span>
              </label>
              <select
                value={data.fromAccount}
                onChange={(e) => set({ fromAccount: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
              >
                <option value="">Select account…</option>
                {ACCOUNTS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <AccountBalance account={data.fromAccount} label="Balance now" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Account <span className="text-red-500">*</span>
              </label>
              <select
                value={data.toAccount}
                onChange={(e) => set({ toAccount: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
              >
                <option value="">Select account…</option>
                {ACCOUNTS.map((a) => (
                  <option key={a} value={a} disabled={a === data.fromAccount}>
                    {a}
                  </option>
                ))}
              </select>
              <AccountBalance account={data.toAccount} label="Balance now" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={data.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
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
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                {data.branch
                  ? `Shows in ${data.branch}'s close book as well as the unfiltered view.`
                  : "Shows only in the unfiltered close book — branch views can't attribute company money."}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reference</label>
              <input
                type="text"
                value={data.reference}
                onChange={(e) => set({ reference: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                placeholder="UTR / cheque no. (optional)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
              <input
                type="text"
                value={data.remarks}
                onChange={(e) => set({ remarks: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                placeholder="Optional"
              />
            </div>
          </div>

          {sameAccount && (
            <p className="mt-3 text-sm text-rose-600">
              From and To must be different accounts.
            </p>
          )}
        </TransactionSectionCard>

        <TransactionSectionCard title="Receipts / Documents">
          <ReceiptUpload
            receipts={data.receipts || []}
            onChange={(receipts) => set({ receipts })}
            section="contra"
          />
        </TransactionSectionCard>
      </div>

      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">What this will do</h3>

            {data.fromAccount && data.toAccount && amount > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 text-sm mb-4">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">From</p>
                    <p className="font-semibold text-gray-900 truncate">{data.fromAccount}</p>
                    <p className="text-rose-600 font-medium">−{formatCurrency(amount)}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0 text-right">
                    <p className="text-xs text-gray-500">To</p>
                    <p className="font-semibold text-gray-900 truncate">{data.toAccount}</p>
                    <p className="text-emerald-700 font-medium">+{formatCurrency(amount)}</p>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
                  No effect on revenue or expenses — this only moves cash between your own
                  accounts. Your total across all {ACCOUNTS.length} accounts is unchanged.
                </div>

                {wouldGoNegative && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    {data.fromAccount} would go to{" "}
                    <span className="font-semibold">{formatCurrency(fromBalance - amount)}</span>{" "}
                    after this. Saving is still allowed — you may be entering transactions out
                    of order.
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">
                Pick both accounts and an amount to see the effect.
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || sameAccount}
            className="w-full h-10 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors press disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Record Contra Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
