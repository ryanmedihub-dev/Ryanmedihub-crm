"use client";

import { useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { useToast } from "@/components/Toast";
import { INCENTIVE_PURPOSES, purposeForRole } from "@/constants/incentivePurposes";
import { Gift, Loader2, User, Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const getTodayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

/**
 * Shared "Incentive" panel for the role transaction-create pages. Records a per-patient
 * incentive against an employee, which tops up that employee's monthly Incentive payable.
 *
 * `picker` is the patient picker object the page already owns:
 *   { options, searching, onSearch, addToCache }
 */
export default function IncentiveEntryForm({ picker }) {
  const toast = useToast();

  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");

  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeSearching, setEmployeeSearching] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeLabel, setEmployeeLabel] = useState("");

  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayIST());
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);

  const searchEmployees = async (term) => {
    setEmployeeSearching(true);
    try {
      const json = await fetch(
        `/api/employees/get?search=${encodeURIComponent(term || "")}`,
      ).then((r) => r.json());
      setEmployeeOptions(json.employees || []);
    } catch {
      setEmployeeOptions([]);
    } finally {
      setEmployeeSearching(false);
    }
  };

  const canSubmit =
    patientId && employeeId && purpose && parseFloat(amount) > 0 && !submitting;

  const handleSubmit = async () => {
    setError("");
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: patientId,
          employee: employeeId,
          purpose,
          amount: parseFloat(amount),
          date,
          remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record incentive");
        return;
      }
      setRecent((prev) => [
        {
          id: data.incentive?._id || `${Date.now()}`,
          patientLabel,
          employeeLabel,
          purpose,
          amount: parseFloat(amount),
        },
        ...prev,
      ]);
      toast.success(`Incentive of ${formatCurrency(amount)} recorded for ${employeeLabel}`);
      // Keep employee + purpose for fast repeat entry; clear the per-patient bits.
      setPatientId("");
      setPatientLabel("");
      setAmount("");
      setRemarks("");
    } catch {
      setError("Failed to record incentive");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">Incentive Entry</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Record an incentive earned by an employee against a patient. This tops up that
        employee&apos;s Incentive payable for the month — a real amount owed, paid later
        through the normal payable flow.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>
            Patient <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            options={picker.options}
            value={patientId}
            onChange={(v, obj) => {
              if (obj) picker.addToCache?.(obj);
              setPatientId(v);
              setPatientLabel(obj?.personal?.name || "");
            }}
            placeholder="Search and select a patient..."
            valueKey="_id"
            formatOption={(p) =>
              `${p.personal?.name || "N/A"}${p.personal?.phone ? " · " + p.personal.phone : ""}`
            }
            onSearch={picker.onSearch}
            searching={picker.searching}
          />
        </div>

        <div>
          <label className={labelCls}>
            Employee <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            options={employeeOptions}
            value={employeeId}
            onChange={(v, obj) => {
              setEmployeeId(v);
              setEmployeeLabel(obj?.name || "");
              if (obj?.incentiveRate) setAmount(String(obj.incentiveRate));
              setPurpose(purposeForRole(obj?.role));
            }}
            placeholder="Search and select an employee..."
            valueKey="_id"
            formatOption={(e) =>
              `${e.name}${e.employeeId ? ` (${e.employeeId})` : ""} — ${e.role}${e.phone ? " · " + e.phone : ""}`
            }
            onSearch={searchEmployees}
            searching={employeeSearching}
          />
        </div>

        <div>
          <label className={labelCls}>
            Purpose <span className="text-red-500">*</span>
          </label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className={inputCls}
          >
            <option value="">Select</option>
            {INCENTIVE_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>
            Amount (₹) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
            placeholder="0"
          />
        </div>

        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Remarks</label>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className={inputCls}
            placeholder="Optional"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Gift className="w-4 h-4" /> Record Incentive
            </>
          )}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Recorded this session ({recent.length})
          </p>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-1.5 text-gray-700">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {r.employeeLabel}
                  <span className="text-gray-400">·</span>
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  {r.patientLabel || "Patient"}
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{r.purpose}</span>
                </span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
