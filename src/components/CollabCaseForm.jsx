"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import BankRoutingFields from "@/components/BankRoutingFields";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { deriveCrystallisation } from "@/lib/collabFormula";
import { REVENUE_METHODS } from "@/constants/paymentMethods";
import { Building2, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const PROCEDURE_OPTIONS = [
  "Sapphire FUE",
  "DHI",
  "Turkish DHI",
  "Beard Transplant",
  "PRP",
  "Alopecia",
  "Headwash",
  "Canacot",
  "GFC",
  "Medicine",
  "Other",
];

const METHOD_OPTIONS = REVENUE_METHODS;

const PAYMENT_SOURCES = [
  { id: "us", label: "Patient paid us" },
  { id: "clinic", label: "Patient paid the clinic" },
];


const getTodayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function CollabCaseForm({
  defaultClinic = "",
  onSuccess,
  onCancel,
  submitLabel = "Create Collab Case",
}) {
  const [patients, setPatients] = useState([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [patientCache, setPatientCache] = useState({});
  const patientDebounceRef = useRef(null);

  const [patientId, setPatientId] = useState("");
  const [clinic, setClinic] = useState(defaultClinic);
  const [procedure, setProcedure] = useState("Sapphire FUE");
  const [clinicShare, setClinicShare] = useState(20000);
  const [discount, setDiscount] = useState(0);
  const [paymentSource, setPaymentSource] = useState("us");
  const [fullPackage, setFullPackage] = useState(false);
  const [amount, setAmount] = useState(0);
  const [amountsTouched, setAmountsTouched] = useState(false);
  const [method, setMethod] = useState("cash");
  const [paymentId, setPaymentId] = useState("");
  const [receiptMode, setReceiptMode] = useState("");
  const [furtherMode, setFurtherMode] = useState("");
  const [date, setDate] = useState(getTodayIST());
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchPatients = async (term = "") => {
    setPatientSearching(true);
    try {
      const params = new URLSearchParams({ limit: 30 });
      if (term) params.set("search", term);
      const res = await fetch(`/api/patients/get-patient?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients || []);
      }
    } catch {
    } finally {
      setPatientSearching(false);
    }
  };

  useEffect(() => {
    fetchPatients("");
  }, []);

  const handlePatientSearch = (term) => {
    clearTimeout(patientDebounceRef.current);
    patientDebounceRef.current = setTimeout(() => fetchPatients(term), 350);
  };

  const patientOptions = useMemo(() => {
    const resultIds = new Set(patients.map((p) => p._id));
    const cached = Object.values(patientCache).filter((p) => !resultIds.has(p._id));
    return [...cached, ...patients];
  }, [patients, patientCache]);

  const selectedPatient = patientCache[patientId] || patients.find((p) => p._id === patientId);

  const grossPackage = selectedPatient?.payments?.totalAmount || 0;
  const discountNum = Number(discount) || 0;
  const totalPackage = Math.round((grossPackage - discountNum) * 100) / 100;
  const ourShare = Math.round((totalPackage - (Number(clinicShare) || 0)) * 100) / 100;
  const discountInvalid = discountNum < 0 || discountNum > grossPackage;

  useEffect(() => {
    if (amountsTouched) return;
    if (!fullPackage || !totalPackage) return;
    setAmount(totalPackage);
  }, [fullPackage, totalPackage, amountsTouched]);

  useEffect(() => {
    setAmountsTouched(false);
    setFullPackage(false);
  }, [patientId]);

  const amountNum = Number(amount) || 0;
  const ourReceived = paymentSource === "us" ? amountNum : 0;
  const clinicReceived = paymentSource === "clinic" ? amountNum : 0;

  const totalCollected = amountNum;
  const overCollected = totalPackage > 0 && totalCollected - totalPackage > 0.01;
  const shareMismatch = totalPackage > 0 && ourShare < 0;

  const isCompleting = totalPackage > 0 && totalPackage - totalCollected <= 0.01;
  const crystallisation = isCompleting
    ? deriveCrystallisation({ clinicReceived: Number(clinicReceived) || 0, clinicShare: Number(clinicShare) || 0 })
    : null;

  const formatPatientOption = (p) =>
    `${p.personal?.name || "N/A"} — Package: ${formatCurrency(p?.payments?.totalAmount)}`;

  const paymentIdMissing = method !== "cash" && !paymentId.trim();

  const canSubmit =
    patientId &&
    clinic &&
    procedure &&
    totalPackage > 0 &&
    !overCollected &&
    !shareMismatch &&
    !discountInvalid &&
    !paymentIdMissing &&
    !submitting;

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/collab-settlement/cases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: patientId,
          clinic,
          clinicShare: Number(clinicShare) || 0,
          discount: discountNum,
          ourReceived: Number(ourReceived) || 0,
          clinicReceived: Number(clinicReceived) || 0,
          procedure,
          method,
          paymentId: paymentId.trim(),
          receiptMode,
          furtherMode,
          date,
          remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create collab case");
        return;
      }
      onSuccess?.(data);
    } catch {
      setError("Failed to create collab case");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Patient <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            options={patientOptions}
            value={patientId}
            onChange={(v, obj) => {
              if (obj) setPatientCache((prev) => ({ ...prev, [obj._id]: obj }));
              setPatientId(v);
            }}
            placeholder="Search and select a patient..."
            valueKey="_id"
            formatOption={formatPatientOption}
            onSearch={handlePatientSearch}
            searching={patientSearching}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Partner Clinic <span className="text-red-500">*</span>
          </label>
          <select
            value={clinic}
            onChange={(e) => setClinic(e.target.value)}
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
      </div>

      {patientId && grossPackage <= 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          This patient has no final package set. Set the patient&apos;s package (counselling →
          final package) before creating a collab case.
        </div>
      )}

      {grossPackage > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Package</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(grossPackage)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Net Chargeable</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(totalPackage)}
                {discountNum > 0 && (
                  <span className="block text-[11px] font-medium text-amber-600">
                    after −{formatCurrency(discountNum)}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Our Share</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(ourShare)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Clinic Share</p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(clinicShare)}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-3 text-center">
            Package is read from the patient record and never modified here — a discount is
            applied on top instead. Our share is always the remainder of the net, so the split
            always equals what is actually chargeable.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Clinic Share</label>
          <input
            type="number"
            min="0"
            value={clinicShare}
            onChange={(e) => setClinicShare(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          {shareMismatch && (
            <p className="text-xs text-red-600 mt-1">
              Clinic share cannot exceed the net chargeable amount ({formatCurrency(totalPackage)}).
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
          <input
            type="number"
            min="0"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          {discountInvalid && (
            <p className="text-xs text-red-600 mt-1">
              Discount must be between 0 and the package total ({formatCurrency(grossPackage)}).
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Procedure</label>
          <select
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            {PROCEDURE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Who did the patient pay?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PAYMENT_SOURCES.map((src) => (
            <button
              key={src.id}
              type="button"
              onClick={() => setPaymentSource(src.id)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                paymentSource === src.id
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Amount paid {paymentSource === "us" ? "to us" : `to ${clinic || "the clinic"}`} (₹)
        </label>
        <input
          type="number"
          min="0"
          value={amount}
          disabled={fullPackage}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountsTouched(true);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-50 disabled:text-gray-500"
        />
        <label className="flex items-center gap-2 mt-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={fullPackage}
            onChange={(e) => {
              const checked = e.target.checked;
              setFullPackage(checked);
              if (checked) setAmountsTouched(false);
            }}
          />
          Patient paid the full package
        </label>
      </div>

      {overCollected && (
        <p className="text-xs text-red-600">
          Collected {formatCurrency(totalCollected)} exceeds the package{" "}
          {formatCurrency(totalPackage)}.
        </p>
      )}

      {totalPackage > 0 && (
        <div
          className={`rounded-lg border p-4 ${
            !isCompleting
              ? "bg-gray-50 border-gray-200"
              : crystallisation.kind === "CLINIC_RETAINS"
                ? "bg-emerald-50 border-emerald-200"
                : "bg-amber-50 border-amber-200"
          }`}
        >
          {!isCompleting ? (
            <div className="text-sm text-gray-800 space-y-1">
              <p className="font-semibold">Revenue booked now: {formatCurrency(totalCollected)}</p>
              <p>Still owed by the patient: {formatCurrency(totalPackage - totalCollected)}</p>
              <p className="text-gray-600">
                Clinic share ({formatCurrency(clinicShare)}): not yet booked — it is settled when
                the patient&apos;s balance reaches zero
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                {crystallisation.kind === "CLINIC_RETAINS" ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-amber-600" />
                )}
                <p className="text-sm font-semibold text-gray-900">
                  {crystallisation.kind === "CLINIC_RETAINS"
                    ? `This completes the package — ${clinic || "the clinic"} keeps its ${formatCurrency(clinicShare)} fee out of the ${formatCurrency(clinicReceived)} it collected`
                    : `This completes the package — ${clinic || "the clinic"} collected ${formatCurrency(clinicReceived)} of its ${formatCurrency(clinicShare)} fee`}
                </p>
              </div>
              <div className="text-[11px] text-gray-600 mt-2 space-y-0.5">
                <p className="font-semibold text-gray-800">
                  Revenue booked now: {formatCurrency(totalCollected)}
                </p>
                {crystallisation.kind === "CLINIC_RETAINS" ? (
                  <p>
                    {formatCurrency(crystallisation.pendingAfter)} still owed to us by the clinic.
                    No payable created.
                  </p>
                ) : (
                  <>
                    <p>
                      We owe {clinic || "the clinic"} {formatCurrency(crystallisation.payable)} — a
                      Payable will be created.
                    </p>
                    {crystallisation.expenseFromRetained > 0 && (
                      <p>
                        {formatCurrency(crystallisation.expenseFromRetained)} is expensed
                        immediately, offsetting what the clinic already holds.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {paymentSource === "us" ? "Payment Method" : "Collection Mode"}
          </label>
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
          {paymentSource === "clinic" && (
            <p className="text-[11px] text-gray-400 mt-1">Which instrument {clinic || "the clinic"} collected with.</p>
          )}
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transaction ID / Reference{" "}
            {method === "cash" ? (
              <span className="text-gray-400 font-normal">(optional)</span>
            ) : (
              <span className="text-red-500">*</span>
            )}
          </label>
          <input
            type="text"
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder="UTR / reference / cheque no."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          {paymentIdMissing && (
            <p className="mt-1.5 text-xs text-red-600">Required for any method other than cash.</p>
          )}
        </div>
        {paymentSource === "us" ? (
          <BankRoutingFields
            costType="Revenue"
            branch={clinic}
            transactionCategory={procedure === "Medicine" ? "MEDICINE" : undefined}
            method={method}
            receiptMode={receiptMode}
            furtherMode={furtherMode}
            onChange={(patch) => {
              if (patch.receiptMode !== undefined) setReceiptMode(patch.receiptMode);
              if (patch.furtherMode !== undefined) setFurtherMode(patch.furtherMode);
            }}
          />
        ) : (
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
            This money never lands in one of our own accounts — booked as revenue collected by{" "}
            {clinic || "the clinic"} on the patient&apos;s behalf.
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating…
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4" /> {submitLabel}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
