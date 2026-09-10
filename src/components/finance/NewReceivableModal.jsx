"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, FileCheck2 } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches";

const PURPOSES = ["PATIENT_DUE", "COLLAB_SETTLEMENT", "REFUND_DUE", "ADVANCE_RECOVERY", "OTHER"];

const PURPOSE_LABELS = {
  PATIENT_DUE: "Patient Due",
  COLLAB_SETTLEMENT: "Collab Settlement",
  REFUND_DUE: "Refund Due",
  ADVANCE_RECOVERY: "Advance Recovery",
  OTHER: "Other",
};

const PURPOSE_TO_FIXED_KIND = {
  PATIENT_DUE: "PATIENT",
  COLLAB_SETTLEMENT: "COLLAB_CLINIC",
  OTHER: "OTHER",
};

const REVENUE_CATEGORIES = ["Transplant", "Services", "Medicine"];

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function NewReceivableModal({ onClose, onSuccess, toast }) {
  const [purpose, setPurpose] = useState("");
  const [kind, setKind] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [branch, setBranch] = useState("");
  const [remarks, setRemarks] = useState("");
  const [revenueCategory, setRevenueCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [collabBranch, setCollabBranch] = useState("");
  const [manualLabel, setManualLabel] = useState("");

  const [patients, setPatients] = useState([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const patientDebounce = useRef(null);
  const [relatedPatient, setRelatedPatient] = useState("");

  const [employees, setEmployees] = useState([]);
  const [employeeSearching, setEmployeeSearching] = useState(false);
  const employeeDebounce = useRef(null);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

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

  const needsKindPicker = ["REFUND_DUE", "ADVANCE_RECOVERY"].includes(purpose);
  const effectiveKind = PURPOSE_TO_FIXED_KIND[purpose] || kind;
  const needsPeriod = purpose === "COLLAB_SETTLEMENT";
  const needsPatient = purpose === "PATIENT_DUE" || (needsKindPicker && effectiveKind === "PATIENT");
  const hasPayerSection = !!purpose;

  const buildPayer = () => {
    if (effectiveKind === "PATIENT") {
      const pat = patients.find((p) => p._id === relatedPatient);
      return { kind: "PATIENT", refId: relatedPatient, label: pat?.personal?.name || "Patient" };
    }
    if (effectiveKind === "EMPLOYEE") {
      return { kind: "EMPLOYEE", refId: employeeId, label: employeeName };
    }
    if (effectiveKind === "COLLAB_CLINIC") {
      return { kind: "COLLAB_CLINIC", refId: null, label: collabBranch };
    }
    if (effectiveKind === "VENDOR") {
      return { kind: "VENDOR", refId: vendorId || null, label: vendorName };
    }
    if (effectiveKind === "OTHER") {
      return { kind: "OTHER", refId: null, label: manualLabel };
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!purpose || !totalAmount || parseFloat(totalAmount) <= 0) {
      toast.error("Purpose and a valid amount are required");
      return;
    }
    const payer = buildPayer();
    if (!payer?.label) {
      toast.error("Complete the payer details for this purpose");
      return;
    }
    if (needsPeriod && (!month || !year)) {
      toast.error("Select the month and year this settlement is for");
      return;
    }
    if (purpose === "PATIENT_DUE" && !relatedPatient) {
      toast.error("Select the related patient first");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/receivables/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payer,
          purpose,
          revenueCategory: revenueCategory || undefined,
          period: needsPeriod ? { month: parseInt(month), year: parseInt(year) } : undefined,
          relatedPatient: relatedPatient || undefined,
          totalAmount,
          dueDate: dueDate || undefined,
          branch: branch || undefined,
          remarks,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Receivable created");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to create receivable");
      }
    } catch (error) {
      console.error("Error creating receivable:", error);
      toast.error("Failed to create receivable");
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">New Receivable</h3>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Record a new outstanding amount owed to us</p>
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
                <p className="mt-0.5 text-xs text-slate-500">What kind of receivable is this?</p>
              </div>
              <label className={labelClass}>
                Purpose <span className="text-red-500">*</span>
              </label>
              <select
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setKind("");
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

            {/* PAYER DETAILS */}
            {hasPayerSection && (
              <section>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Payer Details</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Who owes this amount</p>
                </div>

                <div className="space-y-4">
                  {needsKindPicker && (
                    <div>
                      <label className={labelClass}>
                        Who owes this? <span className="text-red-500">*</span>
                      </label>
                      <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
                        <option value="">Select…</option>
                        <option value="PATIENT">Patient</option>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="VENDOR">Vendor</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  )}

                  {needsPatient && (
                    <div>
                      <label className={labelClass}>
                        Patient <span className="text-red-500">*</span>
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
                  )}

                  {effectiveKind === "EMPLOYEE" && (
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

                  {effectiveKind === "VENDOR" && (
                    <div>
                      <label className={labelClass}>
                        Vendor <span className="text-red-500">*</span>
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
                        Not listed?{" "}
                        <a
                          href="/admin/vendors/create"
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-emerald-600 hover:underline"
                        >
                          Add a vendor
                        </a>
                        , then reopen this form.
                      </p>
                    </div>
                  )}

                  {effectiveKind === "OTHER" && (
                    <div>
                      <label className={labelClass}>
                        Payer Label <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={manualLabel}
                        onChange={(e) => setManualLabel(e.target.value)}
                        className={inputClass}
                        placeholder="Enter a name"
                      />
                    </div>
                  )}

                  {purpose === "COLLAB_SETTLEMENT" && (
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

                  <div>
                    <label className={labelClass}>Revenue Category</label>
                    <select
                      value={revenueCategory}
                      onChange={(e) => setRevenueCategory(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Not specific to one category</option>
                      {REVENUE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            )}

            {/* PERIOD */}
            {needsPeriod && (
              <section>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Settlement Period</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Which month this settlement is for</p>
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
                    <option value="">Default (your branch)</option>
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Receivable"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
