"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DrillDownTable from "@/components/finance/DrillDownTable";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { AGEING_BUCKETS } from "@/lib/ageing";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

export default function AssetsReceivablesPage() {
  const { scope, setScope, scopeQS } = useLedgerScope();
  const searchParams = useSearchParams();

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ageing, setAgeing] = useState(searchParams.get("ageing") || "");
  const [initialDrill, setInitialDrill] = useState(undefined);

  
  useEffect(() => {
    const doc = searchParams.get("doc");
    const head = searchParams.get("head");
    if (doc) {
      fetch(`/api/receivables/${doc}`)
        .then((r) => r.json())
        .then((json) => {
          const rec = json.receivable;
          setInitialDrill(
            rec
              ? { level: 3, headKey: rec.payer?.label || "", headLabel: rec.payer?.label || "", subKey: "", subLabel: "" }
              : null,
          );
        })
        .catch(() => setInitialDrill(null));
    } else if (head) {
      setInitialDrill({ level: 3, headKey: head, headLabel: head, subKey: "", subLabel: "" });
    } else {
      setInitialDrill(null);
    }
  }, []); 

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/receivables/summary?ageing=1${scope.branch ? `&branch=${scope.branch}` : ""}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => setMetrics(json.overall || null))
      .catch((e) => e.name !== "AbortError" && console.error(e))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [scope.branch]);

  const extraParams = ageing ? { ageing } : undefined;

  return (
    <div className="space-y-4">
      <LedgerScopeBar actions={<LedgerExportButton pageKey="receivables" extraParams={extraParams} />} />
      <LedgerMetrics
        loading={loading}
        items={[
          { label: "Total Receivable", value: metrics?.totalReceivable ?? 0 },
          { label: "Received To Date", value: metrics?.totalReceived ?? 0, tone: "text-emerald-600" },
          { label: "Open (Pending)", value: metrics?.totalPending ?? 0, tone: "text-amber-600" },
          { label: "Active Receivables", value: String(metrics?.count ?? 0) },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {AGEING_BUCKETS.map((b) => (
          <button
            key={b.value}
            onClick={() => setAgeing((cur) => (cur === b.value ? "" : b.value))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              ageing === b.value
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {initialDrill !== undefined && (
        <DrillDownTable
          levels={3}
          sectionConfig={{
            key: "receivables",
            mode: "documents",
            groupBy: "party",
            apiBase: "/api/receivables",
            title: "Receivables",
            columnLabels: {
              opening: "Opening due",
              movement: "Raised",
              settled: "Received",
              closing: "Still due",
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
