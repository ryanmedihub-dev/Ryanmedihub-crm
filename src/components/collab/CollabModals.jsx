"use client";

// Shared modal shell + the two settlement-adjacent modals (Record Collection, Settle) used by
// both /admin/collab-settlement (clinic-first view) and /admin/collab-settlement/patient
// (patient-first view). Extracted verbatim from the clinic-view page so neither view can drift
// from the other's settlement logic — there is exactly one place a collab settlement is written.

import { useEffect, useState } from "react";
import { Building2, Wallet, X, Loader2 } from "lucide-react";
import BankRoutingFields from "@/components/BankRoutingFields";
import { REVENUE_METHODS } from "@/constants/paymentMethods";
import { formatCurrency } from "@/lib/financeUI";

export const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
export const labelCls = "mb-1.5 block text-sm font-semibold text-gray-700";

// ========== MODAL SHELL (shared header/frame) ==========
export function ModalShell({ icon: Icon, iconBg, iconFg, title, subtitle, onClose, children, maxWidth = "max-w-2xl", notice }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className={`flex max-h-[95vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconFg}`} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">{title}</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {notice && (
          <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-3 sm:px-6">
            <p className="text-xs font-semibold text-amber-800 sm:text-sm">{notice.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-amber-700">{notice.body}</p>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">{children}</div>
      </div>
    </div>
  );
}

// ========== RECORD CLINIC COLLECTION MODAL ==========
export function RecordCollectionModal({ collabCase, onClose, onSuccess, toast }) {
  // Which side actually took the money — the same split collabDerivation.js's
  // createCollectionTransaction makes for the amounts entered at case creation. Defaults to
  // CLINIC, the original and still most common case: the patient paying the clinic directly is
  // why this modal existed in the first place.
  const [collectedBy, setCollectedBy] = useState("CLINIC");
  const [amount, setAmount] = useState("");
  // Pre-fills `amount` to the patient's full remaining outstanding and locks it — the shortcut
  // for "this collection completes the case", mirroring CollabCaseForm's own checkbox.
  const [fullPackage, setFullPackage] = useState(false);
  // A waiver granted at the time of this collection — reduces the patient's outstanding the
  // same as a payment would, but is never money collected (see the model comment on
  // clinicCollections.discount).
  const [discount, setDiscount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  // Sent as `mode` (collectedBy:"CLINIC" — descriptive only) or `method` (collectedBy:"US" — the
  // real payment method) depending on which side is selected; one field covers both since they
  // draw from the same REVENUE_METHODS list.
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  // collectedBy:"CLINIC" — descriptive routing detail only (which instrument, which account, on
  // the CLINIC's side); never touches our own accounts/books, though it DOES book real revenue
  // (a paid_to_external Transaction, see collabDerivation.js). collectedBy:"US" — this is a real
  // cash-in, exactly like a direct payment, so these fields route it into one of OUR OWN
  // accounts the normal way.
  const [receiptMode, setReceiptMode] = useState("");
  const [furtherMode, setFurtherMode] = useState("");
  const [note, setNote] = useState("");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Deliberate override, not a continuous lock: checking pre-fills once; unchecking just leaves
  // the current value editable rather than resetting it.
  // Caps against the CASE's own remaining balance (package − collected − discount), not the
  // patient's whole-ledger outstanding — a patient with several cases must not be able to
  // over-collect one of them just because another is unpaid.
  useEffect(() => {
    if (fullPackage) setAmount(String(collabCase.caseOutstanding || 0));
  }, [fullPackage, collabCase.caseOutstanding]);

  const overBalance =
    parseFloat(amount || 0) + parseFloat(discount || 0) >
    collabCase.caseOutstanding;

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Enter a valid collection amount");
      return;
    }
    if (parseFloat(discount || 0) < 0) {
      toast.error("Discount cannot be negative");
      return;
    }
    if (overBalance && !allowOverpayment) {
      toast.error(
        "Amount + discount exceeds patient's remaining outstanding — check the box to proceed anyway",
      );
      return;
    }
    // Same requirement as every other payment-entry form in the app — cash is the only method
    // with no independently-verifiable trail, everything else needs one.
    if (paymentMethod !== "cash" && !reference.trim()) {
      toast.error("Enter the transaction ID / reference for this collection");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/collab-settlement/cases/${collabCase._id}/collection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            discount,
            date,
            collectedBy,
            method: collectedBy === "US" ? paymentMethod : undefined,
            mode: collectedBy === "CLINIC" ? paymentMethod : undefined,
            reference,
            receiptMode,
            furtherMode,
            note,
            allowOverpayment,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success("Collection recorded");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to record collection");
      }
    } catch (error) {
      console.error("Error recording collection:", error);
      toast.error("Failed to record collection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      icon={Wallet}
      iconBg="bg-indigo-100"
      iconFg="text-indigo-600"
      title="Record Collection"
      subtitle="Record a patient payment or collection"
      onClose={onClose}
    >
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        {/* Patient summary */}
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Patient</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900 sm:text-base">
                {collabCase.patientName || "Patient"}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Outstanding on this case
              </p>
              <p className="mt-0.5 text-base font-bold text-amber-600 sm:text-lg">
                {formatCurrency(collabCase.caseOutstanding)}
              </p>
            </div>
          </div>
        </div>

        {/* Collection source */}
        <section className="mb-5">
          <div className="mb-2.5">
            <h4 className="text-sm font-bold text-slate-900">Collection Source</h4>
            <p className="mt-0.5 text-xs text-slate-500">Who received the payment?</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCollectedBy("CLINIC")}
              className={`rounded-xl border p-3 text-left transition ${
                collectedBy === "CLINIC"
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      collectedBy === "CLINIC" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{collabCase.clinic}</p>
                    <p className="text-xs text-slate-500">Collected by clinic</p>
                  </div>
                </div>
                {collectedBy === "CLINIC" && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600">
                    <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCollectedBy("US")}
              className={`rounded-xl border p-3 text-left transition ${
                collectedBy === "US"
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      collectedBy === "US" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Us Directly</p>
                    <p className="text-xs text-slate-500">Paid directly to us</p>
                  </div>
                </div>
                {collectedBy === "US" && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
                    <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          </div>

          <div
            className={`mt-3 rounded-xl border p-3 text-xs leading-5 sm:text-sm ${
              collectedBy === "CLINIC"
                ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {collectedBy === "CLINIC" ? (
              <>
                This records money{" "}
                <strong>
                  {collabCase.patientName || "the patient"} paid directly to {collabCase.clinic}
                </strong>
                . It is recorded as revenue but does not enter one of our own cash or bank accounts.
              </>
            ) : (
              <>
                This records money <strong>{collabCase.patientName || "the patient"} paid us directly</strong>.
                The payment will be recorded in one of our own accounts and update the patient's payment record.
              </>
            )}
          </div>
        </section>

        {/* Payment details */}
        <section className="mb-5">
          <div className="mb-3">
            <h4 className="text-sm font-bold text-slate-900">Payment Details</h4>
            <p className="mt-0.5 text-xs text-slate-500">Enter the amount and payment information</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Amount Paid <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  disabled={fullPackage}
                  placeholder="0"
                  className={`${inputCls} pl-8 disabled:bg-slate-50 disabled:text-slate-500`}
                />
              </div>

              <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <input
                  type="checkbox"
                  checked={fullPackage}
                  onChange={(e) => setFullPackage(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-600 sm:text-sm">
                  <strong className="font-semibold text-slate-700">Complete the case</strong> — pay the full remaining outstanding balance.
                </span>
              </label>

              {overBalance && (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <input
                    type="checkbox"
                    checked={allowOverpayment}
                    onChange={(e) => setAllowOverpayment(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs text-amber-700 sm:text-sm">
                    Amount exceeds the patient's outstanding balance. Allow overpayment.
                  </span>
                </label>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Discount / Waiver</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">₹</span>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  min="0"
                  placeholder="0"
                  className={`${inputCls} pl-8`}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Reduces the patient's outstanding balance without recording it as collected money.
              </p>
            </div>

            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                {[...REVENUE_METHODS, { value: "other", label: "Other" }].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Bank details */}
        <section className="mb-5">
          <div className="mb-3">
            <h4 className="text-sm font-bold text-slate-900">Account / Routing Details</h4>
            <p className="mt-0.5 text-xs text-slate-500">Select where the payment was received</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <BankRoutingFields
              costType="Revenue"
              branch={collabCase.clinic}
              transactionCategory="TRANSPLANT"
              method={paymentMethod}
              receiptMode={receiptMode}
              furtherMode={furtherMode}
              onChange={(patch) => {
                if (patch.receiptMode !== undefined) setReceiptMode(patch.receiptMode);
                if (patch.furtherMode !== undefined) setFurtherMode(patch.furtherMode);
              }}
            />
          </div>
          {collectedBy === "US" && (
            <p className="mt-2 text-xs text-slate-400">
              This is where the money actually lands — the same account fields used for direct payments.
            </p>
          )}
        </section>

        {/* Reference */}
        <section className="mb-1">
          <div className="mb-3">
            <h4 className="text-sm font-bold text-slate-900">Transaction Information</h4>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>
                Transaction ID / Reference{" "}
                {paymentMethod !== "cash" && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={paymentMethod === "cash" ? "Optional" : "Required for non-cash payments"}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Add an optional note about this collection..."
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        </section>
      </div>

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
          onClick={handleSubmit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>Save Collection</>
          )}
        </button>
      </div>
    </ModalShell>
  );
}

// ========== SETTLE MODAL ==========
// `balance` only needs a `netPosition` — the clinic view passes the clinic's whole net; the
// patient view (collab-settlement/patient) passes just this one patient's net at this clinic,
// so the prefilled amount and the "current position" text are scoped to what's on screen.
// `openCases` is whatever case list should be eligible for per-case allocation — the clinic
// view passes every open case at the clinic, the patient view passes only this patient's.
export function SettleModal({ clinic, balance, openCases, onClose, onSuccess, toast }) {
  const netPosition = balance?.netPosition || 0;
  const [direction, setDirection] = useState(netPosition < 0 ? "WE_PAID" : "THEY_PAID");
  const [amount, setAmount] = useState(String(Math.abs(netPosition)) || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [mode, setMode] = useState("banking");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptMode, setReceiptMode] = useState("");
  const [furtherMode, setFurtherMode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligibleCases = openCases.filter(
    (c) => c.clinicShareSettledAt && (direction === "THEY_PAID" ? c.caseNet > 0 : c.caseNet < 0),
  );
  const [allocations, setAllocations] = useState({});

  const allocatedTotal = Object.values(allocations).reduce(
    (sum, v) => sum + (parseFloat(v) || 0),
    0,
  );
  const unallocated = (parseFloat(amount) || 0) - allocatedTotal;

  const setAllocation = (caseId, value) => {
    setAllocations((prev) => ({ ...prev, [caseId]: value }));
  };

  useEffect(() => {
    setAllocations({});
  }, [direction]);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Enter a valid settlement amount");
      return;
    }
    if (allocatedTotal > parseFloat(amount)) {
      toast.error("Allocated amounts across cases exceed the settlement amount");
      return;
    }
    if (mode !== "cash" && !reference.trim()) {
      toast.error("Enter the transaction ID / reference for this settlement");
      return;
    }
    setSubmitting(true);
    try {
      const coveredCases = Object.entries(allocations)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([caseId, v]) => ({ case: caseId, amount: parseFloat(v) }));

      const res = await fetch("/api/collab-settlement/settlements/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic,
          direction,
          amount,
          date,
          mode,
          reference,
          remarks,
          receiptMode: direction === "THEY_PAID" ? receiptMode : "",
          furtherMode,
          coveredCases,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Settlement recorded");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to record settlement");
      }
    } catch (error) {
      console.error("Error recording settlement:", error);
      toast.error("Failed to record settlement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      icon={Wallet}
      iconBg="bg-slate-100"
      iconFg="text-slate-700"
      title={`Settle ${clinic}`}
      subtitle="Record a net settlement with this clinic"
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 p-4 sm:p-6">
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <p className="text-gray-600">
            Current position:{" "}
            {netPosition > 0 && (
              <span className="font-bold text-emerald-700">Clinic owes us {formatCurrency(netPosition)}</span>
            )}
            {netPosition < 0 && (
              <span className="font-bold text-rose-600">We owe clinic {formatCurrency(Math.abs(netPosition))}</span>
            )}
            {netPosition === 0 && <span className="font-bold text-gray-500">Square</span>}
          </p>
        </div>

        <div>
          <label className={labelCls}>Direction</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("THEY_PAID")}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                direction === "THEY_PAID"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              {clinic} paid us
            </button>
            <button
              type="button"
              onClick={() => setDirection("WE_PAID")}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                direction === "WE_PAID"
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              }`}
            >
              We paid {clinic}
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>
            {direction === "THEY_PAID" ? `Amount ${clinic} paid us (₹)` : `Amount we paid ${clinic} (₹)`} *
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            className={inputCls}
            placeholder="0"
          />
        </div>

        <div
          className={`rounded-lg p-3 text-sm font-medium ${
            direction === "THEY_PAID" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {direction === "THEY_PAID"
            ? `You are recording that ${clinic} paid you ${formatCurrency(amount || 0)}.`
            : `You are recording that you paid ${clinic} ${formatCurrency(amount || 0)}.`}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
              {["banking", "upi", "cash", "card", "other"].map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Transaction ID / Reference {mode !== "cash" && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputCls}
            placeholder={mode === "cash" ? "Optional" : "UTR / cheque no. / transaction ID"}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Collab branches have no entry in BANK_ROUTING_MAP by design (see bankRouting.js),
              so transactionCategory has nothing to key a pre-fill off here — the field just
              starts blank and gets picked manually, same as it already does for any collab
              branch on the normal transaction forms. */}
          <BankRoutingFields
            costType={direction === "WE_PAID" ? "Expenses" : "Revenue"}
            branch={clinic}
            method={mode}
            receiptMode={receiptMode}
            furtherMode={furtherMode}
            onChange={(patch) => {
              if (patch.receiptMode !== undefined) setReceiptMode(patch.receiptMode);
              if (patch.furtherMode !== undefined) setFurtherMode(patch.furtherMode);
            }}
          />
        </div>

        {eligibleCases.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Attribute to cases (optional)</p>
            <p className="text-xs text-gray-500 mb-3">
              {direction === "THEY_PAID"
                ? "Only allocated amounts settle that case's receivable and recognise revenue. Unallocated amount just settles the balance with no revenue recognised."
                : "Only allocated amounts pay down that case's own payable. Unallocated amount just settles the balance without closing any specific case."}
            </p>
            <div className="space-y-2 max-h-50 overflow-y-auto">
              {eligibleCases.map((c) => (
                <div key={c._id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700 truncate flex-1">
                    {c.patientName || "Unknown"}{" "}
                    <span className="text-gray-400">(case net {formatCurrency(c.caseNet)})</span>
                  </span>
                  <input
                    type="number"
                    value={allocations[c._id] || ""}
                    onChange={(e) => setAllocation(c._id, e.target.value)}
                    min="0"
                    max={Math.abs(c.caseNet)}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <p className={`text-xs mt-2 ${unallocated < 0 ? "text-red-600" : "text-gray-500"}`}>
              Unallocated: {formatCurrency(unallocated)}
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="flex gap-3 p-5 border-t border-gray-100">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${
            direction === "THEY_PAID" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Settlement"}
        </button>
      </div>
    </ModalShell>
  );
}
