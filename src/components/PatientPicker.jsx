"use client";

import { useSession } from "next-auth/react";
import SearchableSelect from "@/components/SearchableSelect";
import { maskPhone } from "@/utils/phoneUtils";
import { formatCurrency } from "@/lib/financeUI";

export default function PatientPicker({
  picker,
  value,
  onChange,
  allowWalkIn = false,
  required = true,
}) {
  const { data: session } = useSession();

  const formatPatientOption = (patient) =>
    `${patient.personal?.name || "N/A"} - ${maskPhone(patient.personal?.phone, session?.user?.role) || "N/A"} | Package: ${formatCurrency(patient?.payments?.totalAmount)} | Received: ${formatCurrency(patient?.payments?.amountReceived)} | Pending: ${formatCurrency(patient?.payments?.pendingAmount)}`;

  return (
    <div>
      {allowWalkIn && (
        <div className="mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value.isWalkIn}
              onChange={(e) => onChange({ ...value, isWalkIn: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm font-medium text-gray-700">Walk-in Patient</span>
          </label>
        </div>
      )}

      {allowWalkIn && value.isWalkIn ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Patient Name {required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={value.patientName || ""}
              onChange={(e) => onChange({ ...value, patientName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Enter patient name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number {required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="tel"
              value={value.patientPhone || ""}
              onChange={(e) => onChange({ ...value, patientPhone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Enter phone number"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Patient {required && <span className="text-red-500">*</span>}
          </label>
          <SearchableSelect
            options={picker.options}
            value={value.patient}
            onChange={(v, obj) => {
              picker.addToCache(obj);
              onChange({ ...value, patient: v });
            }}
            placeholder="Search and select a patient..."
            valueKey="_id"
            formatOption={formatPatientOption}
            onSearch={picker.onSearch}
            searching={picker.searching}
          />
        </div>
      )}
    </div>
  );
}
