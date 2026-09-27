"use client";

import { useEffect, useState } from "react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import AccountMultiSelect from "@/components/finance/AccountMultiSelect";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

export default function CashBookPage() {
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
    fetch(`/api/close-book/accounts?filter=cash&${scopeQS(extraParams || {})}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        const rows = json.rows || [];
        if (!accounts.length) setAccounts(rows.map((r) => r.label));
        setMetrics({
          opening: rows.reduce((s, r) => s + (r.opening || 0), 0),
          movement: rows.reduce((s, r) => s + (r.movement || 0), 0),
          settled: rows.reduce((s, r) => s + (r.settled || 0), 0),
          closing: rows.reduce((s, r) => s + (r.closing || 0), 0),
        });
      })
      .catch((e) => e.name !== "AbortError" && console.error(e))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [scopeQS, accountsParam]); 

  return (
    <div className="space-y-4">
      <LedgerScopeBar actions={<LedgerExportButton pageKey="cash-book" extraParams={extraParams} />} />
      <LedgerMetrics
        loading={loading}
        items={[
          { label: "Opening", value: metrics?.opening ?? 0 },
          { label: "Money In", value: metrics?.movement ?? 0, tone: "text-emerald-600" },
          { label: "Money Out", value: metrics?.settled ?? 0, tone: "text-rose-600" },
          { label: "Closing", value: metrics?.closing ?? 0 },
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
          key: "cash-bank",
          apiBase: "/api/close-book/accounts",
          title: "Cash & Bank",
          columnLabels: {
            opening: "Opening balance",
            movement: "Money in",
            settled: "Money out",
            closing: "Balance",
          },
        }}
        scope={scope}
        onScopeChange={setScope}
        extraParams={extraParams}
      />
    </div>
  );
}
