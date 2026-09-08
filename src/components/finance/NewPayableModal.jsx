"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Receipt } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import useMasterData from "@/lib/useMasterData";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches";
import {
  PURPOSE_TO_CATEGORY,
  PURPOSE_LABELS,
  GENERIC_SUBTYPE_PURPOSES,
} from "@/lib/uploads/payableRowMapper";

// Dropdown order for this modal only (the shared module keys by purpose, not order).
const PURPOSES = [
  "SALARY",
  "INCENTIVE",
  "RENT",
  "ELECTRICITY",
  "COLLAB_CLINIC",
  "PATIENT_COMMISSION",
  "TAX",
  "MEDICAL_CONSUMABLES",
  "MEDICINE_PROCUREMENT",
  "PROFESSIONAL_EXPENSES",
  "LAB_EXPENSES",
  "INTEREST_EXPENSES",
  "SOFTWARE_RENTAL",
  "HARDWARE_RENTAL",
];

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function NewPayableModal({ onClose, onSuccess, toast }) {
  const { getExpenseTypes } = useMasterData();
  const [purpose, setPurpose] = useState("");
  const [subType, setSubType] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [branch, setBranch] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [collabBranch, setCollabBranch] = useState("");
  const [taxType, setTaxType] = useState("");

  const [patients, setPatients] = useState([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const patientDebounce = useRef(null);
  const [relatedPatient, setRelatedPatient] = useState("");

  const [employees, setEmployees] = useState([]);
  const [employeeSearching, setEmployeeSearching] = useState(false);
  const employeeDebounce = useRef(null);

  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetchPatients = async (term = "") => {
    setPatientSearching(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (term) params.set("search", term);
      const res = await fetch(`/api/patients/get-patient?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients || []);
      }
    } finally {
      setPatientSearching(false);
    }
  };
  const handlePatientSearch = (term) => {
    clearTimeout(patientDebounce.current);
    patientDebounce.current = setTimeout(() => fetchPatients(term), 350);
  };
  const formatPatientOption = (p) => `${p.personal?.name || "N/A"} — ${p.personal?.phone || "N/A"}`;

  const fetchEmployees = async (term = "") => {
    setEmployeeSearching(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (term) params.set("search", term);
      const res = await fetch(`/api/employees/get?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } finally {
      setEmployeeSearching(false);
    }
  };
  const handleEmployeeSearch = (term) => {
    clearTimeout(employeeDebounce.current);
    employeeDebounce.current = setTimeout(() => fetchEmployees(term), 350);
  };
  const formatEmployeeOption = (e) => `${e.name}${e.employeeId ? ` (${e.employeeId})` : ""} — ${e.role}`;

  const fetchVendors = async () => {
    try {
      const res = await fetch("/api/vendors/get");
      if (res.ok) {
        const data = await res.json();
        setVendors(data.data || data.vendors || []);
      }
    } catch {
    }
  };
  const formatVendorOption = (v) => (v.DealsIn ? `${v.name} — ${v.DealsIn}` : v.name);

  useEffect(() => {
    fetchPatients("");
    fetchEmployees("");
    fetchVendors();
  }, []);

  const needsPeriod = ["SALARY", "RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"].includes(purpose);
  const needsPatient = ["INCENTIVE", "PATIENT_COMMISSION"].includes(purpose);
  const hasPayeeSection = !!purpose;

  const buildPayee = () => {
    if (purpose === "SALARY" || purpose === "INCENTIVE") {
      return { kind: "EMPLOYEE", refId: employeeId, label: employeeName };
    }
    if (purpose === "RENT") return { kind: "RENT_UNIT", refId: null, label: unitLabel };
    if (purpose === "ELECTRICITY") return { kind: "UTILITY_UNIT", refId: null, label: unitLabel };
    if (purpose === "COLLAB_CLINIC") return { kind: "COLLAB_CLINIC", refId: null, label: collabBranch };
    if (purpose === "PATIENT_COMMISSION") {
      const pat = patients.find((p) => p._id === relatedPatient);
      return { kind: "PATIENT", refId: relatedPatient, label: pat?.personal?.name || "Patient" };
    }
    if (purpose === "TAX") return { kind: "OTHER", refId: null, label: taxType };
    if (GENERIC_SUBTYPE_PURPOSES.includes(purpose)) {
      if (vendorId && vendorName) return { kind: "VENDOR", refId: vendorId, label: vendorName };
      return { kind: "OTHER", refId: null, label: subType };
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!purpose || !totalAmount || parseFloat(totalAmount) <= 0) {
      toast.error("Purpose and a valid amount are required");
      return;
    }
    const payee = buildPayee();
    if (!payee?.label) {
      toast.error("Complete the payee details for this purpose");
      return;
    }
    if (GENERIC_SUBTYPE_PURPOSES.includes(purpose) && !subType) {
      toast.error("Select the expense sub-type");
      return;
    }
    if (needsPeriod && (!month || !year)) {
      toast.error("Select the month and year this payable is for");
      return;
    }
    if (needsPatient && !relatedPatient) {
      toast.error("Related patient is required for this purpose");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/payables/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payee,
          purpose,
          expenseCategory: PURPOSE_TO_CATEGORY[purpose],
          expenseSubType: subType || (purpose === "SALARY" ? "Salary" : purpose === "COLLAB_CLINIC" ? "Collab Clinic Payment" : subType),
          period: needsPeriod ? { month: parseInt(month), year: parseInt(year) } : undefined,
          relatedPatient: needsPatient ? relatedPatient : undefined,
          totalAmount,
          dueDate: dueDate || undefined,
          branch: branch || undefined,
          remarks,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Payable created");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to create payable");
      }
    } catch (error) {
      console.error("Error creating payable:", error);
      toast.error("Failed to create payable");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">New Payable</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Record a new outstanding obligation</p>
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

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
          <div className="space-y-5 p-4 sm:p-6">

            {/* PURPOSE */}
            <section>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">Purpose</h4>
                <p className="mt-0.5 text-xs text-slate-500">What kind of payable is this?</p>
              </div>
              <label className={labelClass}>
                Purpose <span className="text-red-500">*</span>
              </label>
              <select
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setSubType("");
                }}
                className={inputClass}
              >
                <option value="">Select purpose…</option>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </option>
                ))}
              </select>
            </section>

            {/* PAYEE DETAILS */}
            {hasPayeeSection && (
              <section>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Payee Details</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Who this payable is owed to</p>
                </div>

                <div className="space-y-4">
                  {(purpose === "SALARY" || purpose === "INCENTIVE") && (
                    <div>
                      <label className={labelClass}>
                        Employee <span className="text-red-500">*</span>
                      </label>
                      <SearchableSelect
                        options={employees}
                        value={employeeId}
                        onChange={(v, obj) => {
                          setEmployeeId(v);
                          setEmployeeName(obj?.name || "");
                        }}
                        placeholder="Search and select an employee..."
                        valueKey="_id"
                        formatOption={formatEmployeeOption}
                        onSearch={handleEmployeeSearch}
                        searching={employeeSearching}
                      />
                    </div>
                  )}

                  {purpose === "INCENTIVE" && (
                    <div>
                      <label className={labelClass}>Incentive Type</label>
                      <select value={subType} onChange={(e) => setSubType(e.target.value)} className={inputClass}>
                        <option value="">Select type…</option>
                        {getExpenseTypes("Incentive").map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {purpose === "RENT" && (
                    <div>
                      <label className={labelClass}>
                        Rent Unit <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={unitLabel}
                        onChange={(e) => {
                          setUnitLabel(e.target.value);
                          setSubType(e.target.value);
                        }}
                        className={inputClass}
                      >
                        <option value="">Select unit…</option>
                        {getExpenseTypes("Rent").map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {purpose === "ELECTRICITY" && (
                    <div>
                      <label className={labelClass}>
                        Utility Unit <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={unitLabel}
                        onChange={(e) => {
                          setUnitLabel(e.target.value);
                          setSubType(e.target.value);
                        }}
                        className={inputClass}
                      >
                        <option value="">Select unit…</option>
                        {getExpenseTypes("Electricity Bill").map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {purpose === "COLLAB_CLINIC" && (
                    <div>
                      <label className={labelClass}>
                        Clinic <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={collabBranch}
                        onChange={(e) => setCollabBranch(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Select clinic…</option>
                        {COLLAB_BRANCHES.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {purpose === "PATIENT_COMMISSION" && (
                    <>
                      <div>
                        <label className={labelClass}>
                          Related Patient <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect
                          options={patients}
                          value={relatedPatient}
                          onChange={(v) => setRelatedPatient(v)}
                          placeholder="Search and select a patient..."
                          valueKey="_id"
                          formatOption={formatPatientOption}
                          onSearch={handlePatientSearch}
                          searching={patientSearching}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Commission Type</label>
                        <select value={subType} onChange={(e) => setSubType(e.target.value)} className={inputClass}>
                          <option value="">Select type…</option>
                          {getExpenseTypes("Commision").map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {purpose === "TAX" && (
                    <div>
                      <label className={labelClass}>
                        Tax Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={taxType}
                        onChange={(e) => {
                          setTaxType(e.target.value);
                          setSubType(e.target.value);
                        }}
                        className={inputClass}
                      >
                        <option value="">Select type…</option>
                        {getExpenseTypes("Taxes").map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {GENERIC_SUBTYPE_PURPOSES.includes(purpose) && (
                    <>
                      <div>
                        <label className={labelClass}>
                          {PURPOSE_LABELS[purpose]} Sub-type <span className="text-red-500">*</span>
                        </label>
                        <select value={subType} onChange={(e) => setSubType(e.target.value)} className={inputClass}>
                          <option value="">Select…</option>
                          {getExpenseTypes(PURPOSE_TO_CATEGORY[purpose]).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Vendor <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <SearchableSelect
                          options={vendors}
                          value={vendorId}
                          onChange={(v, obj) => {
                            setVendorId(v);
                            setVendorName(obj?.name || "");
                          }}
                          placeholder="Search and select a vendor..."
                          valueKey="_id"
                          formatOption={formatVendorOption}
                        />
                        <p className="mt-1.5 text-xs leading-4 text-slate-400">
                          Naming the vendor links this payable — and the expense it pays — to their
                          record. Leave blank to file it under the sub-type alone.{" "}
                          <a
                            href="/admin/vendors/create"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-indigo-600 hover:underline"
                          >
                            Add a vendor
                          </a>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* PERIOD */}
            {needsPeriod && (
              <section>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Billing Period</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Which month this payable is for</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Month</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {new Date(2000, m - 1).toLocaleString("en", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Year</label>
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* AMOUNT / DUE DATE */}
            <section>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">Amount &amp; Due Date</h4>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    Total Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      min="0"
                      placeholder="0"
                      className={`${inputClass} pl-8`}
                    />
                  </div>
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
              </div>
            </section>

            {/* ADDITIONAL */}
            <section>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">Additional Information</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Branch</label>
                  <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass}>
                    <option value="">Select branch…</option>
                    {ALL_BRANCHES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </section>

          </div>
        </div>

        {/* FOOTER */}
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Payable"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
