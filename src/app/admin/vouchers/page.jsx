"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import TransactionFieldSet, { validateTransactionFields } from "@/components/TransactionFieldSet";
import useMasterData from "@/lib/useMasterData";
import { useToast } from "@/components/Toast";

const RECEIVABLE_PURPOSE_VALUES = ["PATIENT_DUE", "COLLAB_SETTLEMENT", "REFUND_DUE", "ADVANCE_RECOVERY", "OTHER"];

const CATEGORY_TO_PURPOSE = {
  Rent: "RENT",
  "Medical Consumables": "MEDICAL_CONSUMABLES",
  "Medicine Procurement": "MEDICINE_PROCUREMENT",
  "Professional Expenses": "PROFESSIONAL_EXPENSES",
  "Electricity Bill": "ELECTRICITY",
  "Lab Expenses": "LAB_EXPENSES",
  "Interest Expenses": "INTEREST_EXPENSES",
  Taxes: "TAX",
  "Hardware Rental Expenses": "HARDWARE_RENTAL",
  "Collab Clinic Payment": "COLLAB_CLINIC",
};

function VouchersPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const {
    payableExpenseDropdownCategories: PAYABLE_EXPENSE_DROPDOWN_CATEGORIES,
    getExpenseTypes,
    nonCashMethods,
    unsettledMethods,
  } = useMasterData();

  const [type, setType] = useState(searchParams.get("type") === "Receivable" ? "Receivable" : "Payable");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [subType, setSubType] = useState(searchParams.get("subType") || "");
  const [purpose, setPurpose] = useState("");

  const [partyMode, setPartyMode] = useState("VENDOR");
  const [partyId, setPartyId] = useState("");
  const [partyLabel, setPartyLabel] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const [vendorManual, setVendorManual] = useState(false);
  const [vendorManualLabel, setVendorManualLabel] = useState("");
  const [vendorOptions, setVendorOptions] = useState([]);
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [patientOptions, setPatientOptions] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [searching, setSearching] = useState(false);

  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fields, setFields] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    branch: "",
    remarks: "",
    receipts: [],
  });
  const [taxValue, setTaxValue] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [costAlreadyRecognised, setCostAlreadyRecognised] = useState(false);

  const [revenueCategory, setRevenueCategory] = useState("");

  const [secondaryPatientId, setSecondaryPatientId] = useState("");
  const [secondaryPatientOptions, setSecondaryPatientOptions] = useState([]);
  const [secondaryPatientSearching, setSecondaryPatientSearching] = useState(false);

  const role = session?.user?.role;
  const authorized = role === "admin" || role === "super-admin";

  useEffect(() => {
    fetch("/api/vendors/get")
      .then((r) => r.json())
      .then((json) => setVendorOptions(json.data || json.vendors || []))
      .catch(() => setVendorOptions([]));
  }, []);

  useEffect(() => {
    const sessionBranch = session?.user?.branch;
    if (sessionBranch && sessionBranch !== "All" && sessionBranch !== "Collab") {
      setFields((f) => (f.branch ? f : { ...f, branch: sessionBranch }));
    }
  }, [session?.user?.branch]);

  const searchSecondaryPatients = async (term) => {
    setSecondaryPatientSearching(true);
    try {
      const json = await fetch(`/api/patients/get-patient?search=${encodeURIComponent(term)}`).then((r) => r.json());
      setSecondaryPatientOptions(json.data || json.patients || []);
    } catch {
      setSecondaryPatientOptions([]);
    } finally {
      setSecondaryPatientSearching(false);
    }
  };

  const searchEmployees = async (term) => {
    setSearching(true);
    try {
      const json = await fetch(`/api/employees/get?search=${encodeURIComponent(term)}`).then((r) => r.json());
      setEmployeeOptions(json.data || json.employees || []);
    } catch {
      setEmployeeOptions([]);
    } finally {
      setSearching(false);
    }
  };

  const searchPatients = async (term) => {
    setSearching(true);
    try {
      const json = await fetch(`/api/patients/get-patient?search=${encodeURIComponent(term)}`).then((r) => r.json());
      setPatientOptions(json.data || json.patients || []);
    } catch {
      setPatientOptions([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (partyMode !== "VENDOR" || !partyId) {
      setSelectedVendor(null);
      return;
    }
    setSelectedVendor(vendorOptions.find((v) => v._id === partyId) || null);
  }, [partyMode, partyId, vendorOptions]);

  const subTypeOptions = useMemo(() => (category ? getExpenseTypes(category) : []), [category]);

  const needsSecondaryPatient =
    partyMode !== "PATIENT" &&
    (type === "Payable" ? category === "Collab Clinic Payment" : ["REFUND_DUE", "COLLAB_SETTLEMENT"].includes(purpose));

  const dueDateInPast = dueDate && dueDate < new Date().toISOString().slice(0, 10);

  const handleSubmit = async () => {
    if (!authorized) return;

    const vendorEnteredManually = partyMode === "VENDOR" && vendorManual;
    const payeeLabel =
      partyMode === "MANUAL"
        ? manualLabel.trim()
        : vendorEnteredManually
          ? vendorManualLabel.trim()
          : partyLabel;
    if (!payeeLabel) {
      toast.error("Select or enter a party");
      return;
    }
    if (!fields.amount || parseFloat(fields.amount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    const fieldError = validateTransactionFields(fields, "voucher", { nonCashMethods, unsettledMethods });
    if (fieldError) {
      toast.error(fieldError);
      return;
    }

    const kind = partyMode === "MANUAL" || vendorEnteredManually ? "OTHER" : partyMode;

    setSubmitting(true);
    try {
      if (type === "Payable") {
        if (!category) {
          toast.error("Select a category");
          setSubmitting(false);
          return;
        }
        const body = {
          payee: { kind, refId: partyId || undefined, label: payeeLabel },
          purpose: CATEGORY_TO_PURPOSE[category] || "OTHER",
          expenseCategory: category,
          expenseSubType: subType || undefined,
          relatedPatient: partyMode === "PATIENT" ? partyId : needsSecondaryPatient ? secondaryPatientId || undefined : undefined,
          totalAmount: parseFloat(fields.amount),
          dueDate: dueDate || undefined,
          branch: fields.branch,
          remarks,
          costAlreadyRecognised,
          receipts: fields.receipts,
          includeGST: taxValue.includeGST,
          gstRate: taxValue.gstRate,
          gstAmount: taxValue.gstAmount,
          includeTDS: taxValue.includeTDS,
          tdsCategory: taxValue.tdsCategory,
          tdsRate: taxValue.tdsRate,
          tdsAmount: taxValue.tdsAmount,
        };
        const res = await fetch("/api/payables/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create payable");
        toast.success("Payable created");
        router.push("/admin/liabilities");
      } else {
        if (!purpose) {
          toast.error("Select a purpose");
          setSubmitting(false);
          return;
        }
        const body = {
          payer: { kind, refId: partyId || undefined, label: payeeLabel },
          purpose,
          revenueCategory: revenueCategory || undefined,
          relatedPatient: partyMode === "PATIENT" ? partyId : needsSecondaryPatient ? secondaryPatientId || undefined : undefined,
          totalAmount: parseFloat(fields.amount),
          dueDate: dueDate || undefined,
          branch: fields.branch,
          remarks,
          costAlreadyRecognised,
          receipts: fields.receipts,
        };
        const res = await fetch("/api/receivables/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create receivable");
        toast.success("Receivable created");
        router.push("/admin/assets");
      }
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (session && !authorized) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-gray-600 font-medium">Admin access required</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Voucher</h1>
            <p className="text-sm text-gray-500 mt-1">Raise a payable or receivable obligation.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
              {["Payable", "Receivable"].map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setCategory(""); setSubType(""); setPurpose(""); }}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                    type === t ? "bg-white shadow-sm text-indigo-700" : "text-gray-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Party</label>
              <div className="flex gap-1.5 mb-2">
                {["VENDOR", "EMPLOYEE", "PATIENT", "MANUAL"].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setPartyMode(m);
                      setPartyId("");
                      setPartyLabel("");
                      setVendorManual(false);
                      setVendorManualLabel("");
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                      partyMode === m ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {m === "MANUAL" ? "Manual entry" : m.charAt(0) + m.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {partyMode === "VENDOR" && (
                <div>
                  {vendorManual ? (
                    <input
                      type="text"
                      value={vendorManualLabel}
                      onChange={(e) => setVendorManualLabel(e.target.value)}
                      placeholder="Vendor name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  ) : (
                    <SearchableSelect
                      options={vendorOptions}
                      value={partyId}
                      onChange={(v, obj) => { setPartyId(v); setPartyLabel(obj?.name || ""); }}
                      placeholder="Search vendors…"
                      valueKey="_id"
                      formatOption={(v) => v.name}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !vendorManual;
                      setVendorManual(next);
                      setPartyId("");
                      setPartyLabel("");
                      setVendorManualLabel("");
                    }}
                    className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    {vendorManual ? "← Pick from vendor list instead" : "Can't find them? Type the name manually"}
                  </button>
                </div>
              )}
              {partyMode === "EMPLOYEE" && (
                <SearchableSelect
                  options={employeeOptions}
                  value={partyId}
                  onChange={(v, obj) => { setPartyId(v); setPartyLabel(obj?.name || ""); }}
                  placeholder="Search employees by name, phone or ID…"
                  valueKey="_id"
                  formatOption={(e) => `${e.name}${e.employeeId ? ` (${e.employeeId})` : ""}${e.role ? ` — ${e.role}` : ""}`}
                  onSearch={searchEmployees}
                  searching={searching}
                />
              )}
              {partyMode === "PATIENT" && (
                <SearchableSelect
                  options={patientOptions}
                  value={partyId}
                  onChange={(v, obj) => { setPartyId(v); setPartyLabel(obj?.personal?.name || ""); }}
                  placeholder="Search patients…"
                  valueKey="_id"
                  formatOption={(p) => `${p.personal?.name || ""} — ${p.personal?.phone || ""}`}
                  onSearch={searchPatients}
                  searching={searching}
                />
              )}
              {partyMode === "MANUAL" && (
                <input
                  type="text"
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  placeholder="Party name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              )}

              {selectedVendor && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-0.5">
                  <p><strong>GST:</strong> {selectedVendor.gstNumber || "—"}</p>
                  <p><strong>Contact:</strong> {selectedVendor.contact || "—"}</p>
                  <p><strong>Address:</strong> {selectedVendor.address || "—"}</p>
                </div>
              )}
            </div>

            {type === "Payable" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                  <select
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); setSubType(""); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select category</option>
                    {PAYABLE_EXPENSE_DROPDOWN_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Sub-type</label>
                  <select
                    value={subType}
                    onChange={(e) => setSubType(e.target.value)}
                    disabled={!category}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="">Select sub-type</option>
                    {subTypeOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Purpose</label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select purpose</option>
                    {RECEIVABLE_PURPOSE_VALUES.map((p) => (
                      <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Revenue Category <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={revenueCategory}
                    onChange={(e) => setRevenueCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Not specific to one category</option>
                    {["Transplant", "Services", "Medicine"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {needsSecondaryPatient && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Related Patient</label>
                <SearchableSelect
                  options={secondaryPatientOptions}
                  value={secondaryPatientId}
                  onChange={(v) => setSecondaryPatientId(v)}
                  placeholder="Search patients…"
                  valueKey="_id"
                  formatOption={(p) => `${p.personal?.name || ""} — ${p.personal?.phone || ""}`}
                  onSearch={searchSecondaryPatients}
                  searching={secondaryPatientSearching}
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Who this {type === "Payable" ? "payment" : "amount"} is for, even though the
                  party above is who it's {type === "Payable" ? "paid to" : "owed by"}.
                </p>
              </div>
            )}

            <TransactionFieldSet
              context="voucher"
              value={fields}
              onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
              transactionCategory={type === "Payable" ? "EXPENSE" : "SERVICE"}
              taxValue={taxValue}
              onTaxChange={setTaxValue}
              showRemarks={false}
              showReceipts={true}
              patientId={partyMode === "PATIENT" ? partyId : secondaryPatientId || undefined}
            />
            <p className="text-xs text-gray-500 -mt-2">
              This creates a new obligation. It will count as a real expense/income when it is
              eventually settled.
            </p>

            <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={costAlreadyRecognised}
                onChange={(e) => setCostAlreadyRecognised(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-amber-900">
                <span className="font-semibold">Already booked elsewhere.</span> Tick only if the
                expense/revenue for this amount has already been booked by another transaction.
                Leave unticked for a normal voucher.
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                {dueDateInPast && (
                  <p className="mt-1.5 text-xs text-amber-600">This due date is in the past.</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                placeholder="Optional"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Creating…" : `Create ${type}`}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function VouchersPage() {
  return (
    <Suspense fallback={null}>
      <VouchersPageInner />
    </Suspense>
  );
}
