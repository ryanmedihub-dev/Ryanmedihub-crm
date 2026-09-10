"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";
import { exportLedgerPage } from "@/lib/finance/ledgerExport";

/** Download-Excel button for a ledger inner page. Disables + spins while the workbook builds. */
export default function LedgerExportButton({ pageKey, extraParams }) {
  const toast = useToast();
  const { scope } = useLedgerScope();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await exportLedgerPage({ pageKey, scope, extraParams, toast });
    } catch (err) {
      console.error("Ledger export failed:", err);
      toast.error("Failed to export");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      Download Excel
    </button>
  );
}
