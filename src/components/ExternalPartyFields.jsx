"use client";

import { useEffect, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";

const METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "banking", label: "Bank Transfer" },
  { value: "bajaj_loan", label: "Bajaj Loan" },
  { value: "fibe_loan", label: "Fibe Loan" },
  { value: "hdfc_skin_bank_transfer", label: "HDFC Skin Bank Transfer" },
  { value: "hdfc_ryan_medihub_bank_transfer", label: "HDFC Ryan Medihub Bank Transfer" },
  { value: "icici_medihub_bank_transfer", label: "ICICI Medihub Bank Transfer" },
  { value: "other", label: "Other" },
];

const KIND_OPTIONS = [
  { id: "VENDOR", label: "Vendor" },
  { id: "EMPLOYEE", label: "Employee" },
  { id: "PATIENT", label: "Patient" },
  { id: "MANUAL", label: "Other / Manual" },
];

const SEARCH_ENDPOINT = {
  VENDOR: "/api/vendors/get",
  EMPLOYEE: "/api/employees/get",
  PATIENT: "/api/patients/get-patient",
};

const OPTIONS_KEY = { VENDOR: "vendors", EMPLOYEE: "employees", PATIENT: "patients" };

const formatOptionFor = (kind, item) =>
  kind === "PATIENT"
    ? item.personal?.name || "Unnamed patient"
    : `${item.name || "Unnamed"}${kind === "EMPLOYEE" && item.employeeId ? ` (${item.employeeId})` : ""}`;

export default function ExternalPartyFields({ direction, value, onChange }) {
  const who = direction === "RECEIVED_BY" ? "Receiver" : "Sender";
  const partyKind = value?.partyKind || "MANUAL";
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const runSearch = async (kind, term = "") => {
    if (kind === "MANUAL") return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (term) params.set("search", term);
      const res = await fetch(`${SEARCH_ENDPOINT[kind]}?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOptions(data[OPTIONS_KEY[kind]] || data.data || []);
      }
    } catch {
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    setOptions([]);
    runSearch(partyKind, "");
  }, [partyKind]);

  const handleSearch = (term) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(partyKind, term), 350);
  };

  const setKind = (kind) => {
    if (kind === partyKind) return;
    onChange({ ...value, partyKind: kind, partyRefId: "", name: "" });
  };

  return (
    <div className="md:col-span-2 bg-indigo-50/60 border border-indigo-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-indigo-900">{who} Details</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {KIND_OPTIONS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              partyKind === k.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {who} name <span className="text-red-500">*</span>
          </label>
          {partyKind === "MANUAL" ? (
            <input
              type="text"
              value={value?.name || ""}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder={`${who} name`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          ) : (
            <SearchableSelect
              options={options}
              value={value?.partyRefId || ""}
              onChange={(v, obj) =>
                onChange({ ...value, partyRefId: v, name: obj ? formatOptionFor(partyKind, obj) : "" })
              }
              placeholder={`Search ${partyKind.toLowerCase()}s…`}
              valueKey="_id"
              formatOption={(item) => formatOptionFor(partyKind, item)}
              onSearch={handleSearch}
              searching={searching}
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {who} payment method <span className="text-red-500">*</span>
          </label>
          <select
            value={value?.method || ""}
            onChange={(e) => onChange({ ...value, method: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">Select method</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
