"use client";

import { useState } from "react";
import { X, Loader2, Gift } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import { INCENTIVE_PURPOSES, purposeForRole } from "@/constants/incentivePurposes";

const getTodayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function AddIncentiveModal({ patientId, onClose, onSuccess }) {
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

  const searchEmployees = async (term) => {
    setEmployeeSearching(true);
    try {
      const json = await fetch(`/api/employees/get?search=${encodeURIComponent(term)}`).then((r) => r.json());
      setEmployeeOptions(json.employees || []);
    } catch {
      setEmployeeOptions([]);
    } finally {
      setEmployeeSearching(false);
    }
  };

  const canSubmit = employeeId && purpose && parseFloat(amount) > 0 && !submitting;

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/incentives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      onSuccess?.(data);
    } catch {
      setError("Failed to record incentive");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Gift className="w-5 h-5 text-indigo-600" /> Add Incentive
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
              formatOption={(e) => `${e.name}${e.employeeId ? ` (${e.employeeId})` : ""} — ${e.role}${e.phone ? " · " + e.phone : ""}`}
              onSearch={searchEmployees}
              searching={employeeSearching}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Purpose <span className="text-red-500">*</span>
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Select</option>
                {INCENTIVE_PURPOSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
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

          {employeeId && (
            <p className="text-xs text-gray-400">
              Tops up {employeeLabel || "this employee"}&apos;s Incentive payable for this month —
              a real amount owed, not just a note on this patient.
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
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
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
