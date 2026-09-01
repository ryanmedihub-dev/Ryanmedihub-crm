"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";
import { formatCurrency } from "@/lib/financeUI";
import useMasterData from "@/lib/useMasterData";
import { ALL_BRANCHES } from "@/lib/branches";

const PARTY_KINDS = [
  { value: "VENDOR", label: "Vendor" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "PATIENT", label: "Patient" },
  { value: "OTHER", label: "Other" },
];

export default function RecordBorrowingModal({ open, onClose, onSuccess, mode, payable = null, toast }) {
  const { accounts, getExpenseTypes } = useMasterData();
  const SUBTYPES = getExpenseTypes("Borrowings");
  const isRepayment = mode === "OUT";
  const isTranche = mode === "IN" && !!payable;
  const isNewLoan = mode === "IN" && !payable;
  const partyLocked = !!payable;

  const [partyKind, setPartyKind] = useState(payable?.payee?.kind || "VENDOR");
  const [partyId, setPartyId] = useState(payable?.payee?.refId || "");
  const [partyLabel, setPartyLabel] = useState(payable?.payee?.label || "");

  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [subType, setSubType] = useState(payable?.expenseSubType || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [branch, setBranch] = useState(payable?.branch || "");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [periodLocked, setPeriodLocked] = useState(false);

  const pending = payable?.pending ?? 0;
  const overBalance = isRepayment && parseFloat(amount || 0) > pending;

  const fetchOptions = async (term = "") => {
    if (partyKind === "OTHER") return;

    setSearching(true);

    try {
      const endpoint =
        partyKind === "VENDOR"
          ? "/api/vendors/get"
          : partyKind === "EMPLOYEE"
            ? `/api/employees/get?limit=30${term ? `&search=${encodeURIComponent(term)}` : ""}`
            : `/api/patients/get-patient?limit=30${term ? `&search=${encodeURIComponent(term)}` : ""}`;

      const res = await fetch(endpoint);

      if (res.ok) {
        const data = await res.json();
        setOptions(data.data || data.vendors || data.employees || data.patients || []);
      }
    } catch {
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!partyLocked) fetchOptions("");
  }, [partyKind]);

  const handlePartySearch = (term) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOptions(term), 350);
  };

  const formatOption = (o) =>
    partyKind === "VENDOR"
      ? o.DealsIn
        ? `${o.name} — ${o.DealsIn}`
        : o.name
      : partyKind === "EMPLOYEE"
        ? `${o.name} — ${o.role}`
        : `${o.personal?.name || "N/A"} — ${o.personal?.phone || "N/A"}`;

  const title = isRepayment ? "Record Repayment" : isTranche ? "Add Tranche" : "Record Borrowing";

  const handleSubmit = async () => {
    setError("");
    setPeriodLocked(false);

    if (!account) return setError("Select which account this movement is through");

    const parsedAmount = parseFloat(amount);
    if (!(parsedAmount > 0)) return setError("Enter a valid amount");

    if (isNewLoan) {
      if (!subType) return setError("Select what this borrowing is");
      if (partyKind !== "OTHER" && !partyId) return setError("Select the party");
      if (partyKind === "OTHER" && !partyLabel.trim()) return setError("Enter who this is from");
    }

    if (isRepayment && overBalance && !allowOverpayment) {
      return setError("Amount exceeds the outstanding balance — check 'Allow overpayment' to proceed anyway");
    }

    const party = partyLocked
      ? payable.payee
      : partyKind === "OTHER"
        ? { kind: "OTHER", refId: null, label: partyLabel.trim() }
        : (() => {
            const obj = options.find((o) => o._id === partyId);
            const label =
              partyKind === "VENDOR" ? obj?.name : partyKind === "EMPLOYEE" ? obj?.name : obj?.personal?.name;
            return { kind: partyKind, refId: partyId, label: label || partyLabel };
          })();

    setSubmitting(true);

    try {
      const res = await fetch("/api/borrowings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: isRepayment ? "OUT" : "IN",
          account,
          amount: parsedAmount,
          party,
          payableId: payable?._id || undefined,
          subType: isNewLoan ? subType : undefined,
          branch: branch || undefined,
          date,
          reference,
          remarks,
          allowOverpayment,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast?.success(isRepayment ? "Repayment recorded" : isTranche ? "Tranche recorded" : "Borrowing recorded");
        onSuccess?.(data);
      } else if (res.status === 423) {
        setPeriodLocked(true);
        setError(data.error || "This period is closed");
      } else {
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Failed to save — check your connection and try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">

      {/* MODAL */}
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* =====================================================
            HEADER
        ====================================================== */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">

          <div className="flex min-w-0 items-center gap-3">

            {/* ICON */}
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isRepayment ? "bg-rose-100 text-rose-600" : "bg-violet-100 text-violet-600"
              }`}
            >
              {isRepayment ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-2.21 0-4 1.343-4 3s1.79 3 4 3 4 1.343 4 3-1.79 3-4 3m0-14v2m0 12v2"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </div>

            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">{title}</h3>

              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                {isRepayment
                  ? "Record money paid back against a borrowing"
                  : isTranche
                    ? "Add another instalment to this borrowing"
                    : "Create a new loan or party borrowing"}
              </p>
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

        {/* =====================================================
            BODY
        ====================================================== */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">

          <div className="space-y-5 p-4 sm:p-6">

            {/* =================================================
                PAYABLE SUMMARY
            ================================================== */}
            {payable && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500">
                      Outstanding Borrowing
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-base">
                      {payable.payee?.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{payable.expenseSubType}</p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500">Remaining</p>
                    <p className="mt-1 text-lg font-bold text-violet-600 sm:text-xl">{formatCurrency(pending)}</p>
                  </div>

                </div>
              </div>
            )}

            {/* =================================================
                PARTY SECTION
            ================================================== */}
            {!partyLocked && (
              <section>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Party Details</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Select who this borrowing is associated with</p>
                </div>

                {/* PARTY TYPE */}
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">
                    Party Type <span className="text-red-500">*</span>
                  </label>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PARTY_KINDS.map((kind) => {
                      const selected = partyKind === kind.value;

                      return (
                        <button
                          key={kind.value}
                          type="button"
                          onClick={() => {
                            setPartyKind(kind.value);
                            setPartyId("");
                            setPartyLabel("");
                          }}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                            selected
                              ? "border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${selected ? "bg-violet-600" : "bg-slate-300"}`} />
                            {kind.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PARTY INPUT */}
                {partyKind === "OTHER" ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={partyLabel}
                      onChange={(e) => setPartyLabel(e.target.value)}
                      placeholder="Enter the person or organization name"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Select Party <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      options={options}
                      value={partyId}
                      onChange={(v, obj) => {
                        setPartyId(v);
                        setPartyLabel((partyKind === "PATIENT" ? obj?.personal?.name : obj?.name) || "");
                      }}
                      placeholder="Search and select..."
                      valueKey="_id"
                      formatOption={formatOption}
                      onSearch={partyKind !== "VENDOR" ? handlePartySearch : undefined}
                      searching={searching}
                    />
                  </div>
                )}
              </section>
            )}

            {/* =================================================
                BORROWING TYPE
            ================================================== */}
            {isNewLoan && (
              <section>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Borrowing Information</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Specify what this borrowing is for</p>
                </div>

                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Borrowing Type <span className="text-red-500">*</span>
                </label>

                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                >
                  <option value="">Select borrowing type...</option>
                  {SUBTYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </section>
            )}

            {/* =================================================
                PAYMENT SECTION
            ================================================== */}
            <section>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">
                  {isRepayment ? "Repayment Details" : "Borrowing Details"}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">Enter the account and amount involved</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                {/* ACCOUNT */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    {isRepayment ? "Paid From" : "Received In"} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="">Select account...</option>
                    {accounts.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* AMOUNT */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-300 py-2.5 pl-8 pr-3 text-sm outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>

                  {isRepayment && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      Outstanding: <span className="font-semibold text-violet-600">{formatCurrency(pending)}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* OVER PAYMENT */}
              {overBalance && (
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <input
                    type="checkbox"
                    checked={allowOverpayment}
                    onChange={(e) => setAllowOverpayment(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Allow overpayment</p>
                    <p className="mt-0.5 text-xs leading-5 text-amber-700">
                      The entered amount exceeds the outstanding balance. Enable this option if you intentionally
                      want to record the excess amount.
                    </p>
                  </div>
                </label>
              )}
            </section>

            {/* =================================================
                DATE / BRANCH
            ================================================== */}
            <section>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">Transaction Details</h4>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                {/* DATE */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Date</label>
                  <DebouncedDateInput
                    value={date}
                    onCommit={setDate}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </div>

                {/* BRANCH */}
                {!partyLocked && (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Branch</label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    >
                      <option value="">Company-level</option>
                      {ALL_BRANCHES.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs leading-4 text-slate-400">
                      Leave blank for a company-level transaction.
                    </p>
                  </div>
                )}

              </div>
            </section>

            {/* =================================================
                REFERENCE
            ================================================== */}
            <section>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">Additional Information</h4>
                <p className="mt-0.5 text-xs text-slate-500">Optional transaction references and notes</p>
              </div>

              <div className="space-y-4">

                {/* REFERENCE */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Reference <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="UTR / cheque number / transaction ID"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </div>

                {/* REMARKS */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    placeholder="Add any additional information..."
                    className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </div>

              </div>
            </section>

            {/* =================================================
                ERROR
            ================================================== */}
            {error && (
              <div
                className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                  periodLocked ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    periodLocked ? "bg-amber-100" : "bg-red-100"
                  }`}
                >
                  <span className={`text-xs font-bold ${periodLocked ? "text-amber-700" : "text-red-700"}`}>!</span>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${periodLocked ? "text-amber-800" : "text-red-800"}`}>
                    {periodLocked ? "Period Locked" : "Unable to save"}
                  </p>
                  <p className={`mt-0.5 text-xs leading-5 ${periodLocked ? "text-amber-700" : "text-red-700"}`}>
                    {error}
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* =====================================================
            FOOTER
        ====================================================== */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end sm:px-6">

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
              isRepayment
                ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-500"
                : "bg-violet-600 hover:bg-violet-700 focus:ring-violet-500"
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>{isRepayment ? "Save Repayment" : isTranche ? "Save Tranche" : "Save Borrowing"}</>
            )}
          </button>

        </div>
      </div>
    </div>
  );
}
