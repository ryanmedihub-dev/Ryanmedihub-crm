"use client";

import { useEffect, useState } from "react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import AccountMultiSelect from "@/components/finance/AccountMultiSelect";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

export default function LiabilitiesSuspensePage() {
  const { scope, setScope, scopeQS } = useLedgerScope();
  const [accounts, setAccounts] = useState([]);
  const [picked, setPicked] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const accountsParam = picked.length && picked.length !== accounts.length ? picked.join(",") : "";
  const extraParams = accountsParam ? { accounts: accountsParam } : undefined;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/suspense?groupBy=account&${scopeQS(accountsParam ? { accounts: accountsParam } : {})}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        const rows = json.rows || [];
        if (!accounts.length) setAccounts(rows.map((r) => r.label));
        setMetrics({
          received: rows.reduce((s, r) => s + (r.movement || 0), 0),
          reclassified: rows.reduce((s, r) => s + (r.settled || 0), 0),
          unresolved: rows.reduce((s, r) => s + (r.closing || 0), 0),
        });
      })
      .catch((e) => e.name !== "AbortError" && console.error(e))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [scopeQS, accountsParam]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <LedgerScopeBar actions={<LedgerExportButton pageKey="suspense" extraParams={extraParams} />} />
      <LedgerMetrics
        loading={loading}
        items={[
          { label: "Received", value: metrics?.received ?? 0, tone: "text-emerald-600" },
          { label: "Reclassified", value: metrics?.reclassified ?? 0 },
          { label: "Unresolved", value: metrics?.unresolved ?? 0, tone: "text-amber-600" },
        ]}
      />
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <AccountMultiSelect options={accounts} selected={picked} onChange={setPicked} label="Accounts" />
        </div>
      )}
      <DrillDownTable
        levels={2}
        sectionConfig={{
          key: "suspense",
          apiBase: "/api/suspense",
          title: "Suspense",
          columnLabels: {
            opening: "Opening",
            movement: "Received",
            settled: "Reclassified",
            closing: "Unresolved",
          },
        }}
        scope={scope}
        onScopeChange={setScope}
        extraParams={extraParams}
      />
    </div>
  );
}
