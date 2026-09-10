"use client";

import { useEffect, useState } from "react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import LoanRowActions from "@/components/finance/LoanRowActions";
import LoanSettlementModal from "@/components/finance/LoanSettlementModal";
import CancelLoanModal from "@/components/finance/CancelLoanModal";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerExportButton from "@/components/finance/LedgerExportButton";
import LedgerMetrics from "@/components/finance/LedgerMetrics";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

export default function LoanAccountsPage() {
  const { scope, setScope, scopeQS } = useLedgerScope();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [settleTx, setSettleTx] = useState(null);
  const [cancelTx, setCancelTx] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/close-book/accounts?filter=loans&${scopeQS()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        const rows = json.rows || [];
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
  }, [scopeQS, refreshKey]);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <LedgerScopeBar actions={<LedgerExportButton pageKey="loan-accounts" />} />
      <LedgerMetrics
        loading={loading}
        items={[
          { label: "Opening", value: metrics?.opening ?? 0 },
          { label: "Drawn", value: metrics?.movement ?? 0, tone: "text-emerald-600" },
          { label: "Repaid", value: metrics?.settled ?? 0, tone: "text-rose-600" },
          { label: "Balance", value: metrics?.closing ?? 0 },
        ]}
      />
      <DrillDownTable
        key={refreshKey}
        levels={2}
        sectionConfig={{
          key: "loans",
          apiBase: "/api/close-book/accounts",
          title: "Loan Accounts",
          columnLabels: {
            opening: "Opening balance",
            movement: "Money in",
            settled: "Money out",
            closing: "Balance",
          },
        }}
        scope={scope}
        onScopeChange={setScope}
        renderLeafRowActions={(row) => (
          <LoanRowActions
            row={row}
            onSettle={() =>
              setSettleTx({
                transactionId: row._id,
                account: row.account,
                amount: row.amount,
                narration: row.narration,
                date: row.date,
                branch: row.branch,
              })
            }
            onCancel={() => setCancelTx(row)}
          />
        )}
      />

      {settleTx && (
        <LoanSettlementModal
          fromAccount={settleTx.account}
          defaultAmount={settleTx.amount}
          contextLabel={settleTx.narration}
          sourceTransactionId={settleTx.transactionId}
          branch={settleTx.branch}
          onClose={() => setSettleTx(null)}
          onSuccess={() => {
            bump();
            setTimeout(() => setSettleTx(null), 1200);
          }}
        />
      )}
      {cancelTx && (
        <CancelLoanModal
          transaction={{
            _id: cancelTx._id,
            amount: cancelTx.amount,
            date: cancelTx.date,
            furtherMode: cancelTx.account,
            patientName: cancelTx.patientName,
            patient: cancelTx.patient,
          }}
          onClose={() => setCancelTx(null)}
          onDone={bump}
        />
      )}
    </div>
  );
}
