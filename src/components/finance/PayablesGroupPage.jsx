"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DrillDownTable from "@/components/finance/DrillDownTable";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { AGEING_BUCKETS } from "@/lib/ageing";
import { PAYABLE_GROUP_PURPOSES, PAYABLE_GROUP_LABELS } from "@/constants/payableGroups";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);

// SALARY / RENT / ELECTRICITY are monthly — offer a period picker on those groups.
const MONTHLY_GROUPS = new Set(["rent", "employees"]);

// Employees keeps its original Salary/Incentive-category-first layout, but its level-2 list
// (normally the expense sub-type, which is always the fixed "Salary"/"Incentive" value and
// tells you nothing) instead breaks down into the employees who hold payables in that category.
const SUB_PARTY_GROUPED = new Set(["employees"]);

const useDebounced = (value, delay = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
};

export default function PayablesGroupPage({ group }) {
  const purposes = PAYABLE_GROUP_PURPOSES[group];
  const label = PAYABLE_GROUP_LABELS[group];
  const purposeCSV = purposes.join(",");
  const subGroupByParty = SUB_PARTY_GROUPED.has(group);

  const { scope, setScope, scopeQS } = useLedgerScope();
  const searchParams = useSearchParams();

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ageing, setAgeing] = useState(searchParams.get("ageing") || "");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const debouncedEmployeeSearch = useDebounced(employeeSearch);
  const [initialDrill, setInitialDrill] = useState(undefined);

  useEffect(() => {
    const doc = searchParams.get("doc");
    const head = searchParams.get("head");
    const sub = searchParams.get("sub");
    if (doc) {
      fetch(`/api/payables/${doc}`)
        .then((r) => r.json())
        .then((json) => {
          const p = json.payable;
          if (!p) return setInitialDrill(null);
          const subKey = subGroupByParty ? p.payee?.label || "" : p.expenseSubType || "";
          setInitialDrill({
            level: 3,
            headKey: p.expenseCategory,
            headLabel: p.expenseCategory,
            subKey,
            subLabel: subKey,
          });
        })
        .catch(() => setInitialDrill(null));
    } else if (sub) {
      setInitialDrill({ level: 3, headKey: head, headLabel: head, subKey: sub, subLabel: sub });
    } else if (head) {
      setInitialDrill({ level: 2, headKey: head, headLabel: head });
    } else {
      setInitialDrill(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const employeeParty = subGroupByParty ? debouncedEmployeeSearch : "";

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(
      `/api/payables/grouped?level=1&purpose=${purposeCSV}&${scopeQS(employeeParty ? { party: employeeParty } : {})}`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((json) => {
        const rows = json.rows || [];
        setMetrics({
          opening: rows.reduce((s, r) => s + (r.opening || 0), 0),
          raised: rows.reduce((s, r) => s + (r.movement || 0), 0),
          paid: rows.reduce((s, r) => s + (r.settled || 0), 0),
          owed: rows.reduce((s, r) => s + (r.closing || 0), 0),
          count: rows.reduce((s, r) => s + (r.count || 0), 0),
        });
      })
      .catch((e) => e.name !== "AbortError" && console.error(e))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [purposeCSV, scopeQS, employeeParty]);

  const extraParams = useMemo(() => {
    const p = { purpose: purposeCSV };
    if (ageing) p.ageing = ageing;
    if (month) p.periodMonth = month;
    if (year) p.periodYear = year;
    if (employeeParty) p.party = employeeParty;
    return p;
  }, [purposeCSV, ageing, month, year, employeeParty]);

  return (
    <div className="space-y-4">
      <LedgerScopeBar actions={<LedgerExportButton pageKey={`payables-${group}`} extraParams={{ ...extraParams }} />} />

      <LedgerMetrics
        loading={loading}
        items={[
          { label: "Opening due", value: metrics?.opening ?? 0 },
          { label: "Raised", value: metrics?.raised ?? 0 },
          { label: "Paid", value: metrics?.paid ?? 0, tone: "text-emerald-600" },
          { label: "Still owed", value: metrics?.owed ?? 0, tone: "text-rose-600" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {subGroupByParty && (
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search employee (name or ID)…"
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white shadow-sm w-52"
          />
        )}
        {AGEING_BUCKETS.map((b) => (
          <button
            key={b.value}
            onClick={() => setAgeing((cur) => (cur === b.value ? "" : b.value))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              ageing === b.value
                ? "bg-rose-600 text-white border-rose-600"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {b.label}
          </button>
        ))}
        {MONTHLY_GROUPS.has(group) && (
          <>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
            >
              <option value="">Any month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
            >
              <option value="">Any year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {initialDrill !== undefined && (
        <DrillDownTable
          levels={3}
          sectionConfig={{
            key: "payables",
            mode: "documents",
            subGroupBy: subGroupByParty ? "party" : undefined,
            partyLabel: subGroupByParty ? "Employee" : undefined,
            apiBase: "/api/payables",
            title: label,
            columnLabels: {
              opening: "Opening due",
              movement: "Raised",
              settled: "Paid",
              closing: "Still owed",
            },
          }}
          initialDrill={initialDrill || undefined}
          scope={scope}
          onScopeChange={setScope}
          extraParams={extraParams}
        />
      )}
    </div>
  );
}
