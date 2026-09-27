"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const TILE_TONES = {
  gray: "text-gray-900",
  emerald: "text-emerald-700",
  rose: "text-rose-700",
  sky: "text-sky-700",
  amber: "text-amber-700",
  violet: "text-violet-700",
  teal: "text-teal-700",
};

function Tile({ label, value, tone = "gray" }) {
  return (
    <div className="flex-1 min-w-[126px] bg-gray-50 rounded-xl border border-gray-100 px-3.5 py-2.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${TILE_TONES[tone] || TILE_TONES.gray}`}>{formatCurrency(value)}</p>
    </div>
  );
}

export default function CashReconciliation({ from, to, branch }) {
  const [recon, setRecon] = useState(null);
  const [receiptsTotal, setReceiptsTotal] = useState(null);
  const [paymentsTotal, setPaymentsTotal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const reconP = new URLSearchParams({ from, to });
    const groupedP = new URLSearchParams({ level: "1", from, to });
    if (branch) {
      reconP.set("branch", branch);
      groupedP.set("branch", branch);
    }
    Promise.all([
      fetch(`/api/receipts-payments/reconciliation?${reconP}`).then((r) => r.json()),
      fetch(`/api/receipts/grouped?${groupedP}`).then((r) => r.json()),
      fetch(`/api/payments/grouped?${groupedP}`).then((r) => r.json()),
    ])
      .then(([r, receipts, payments]) => {
        setRecon(r.success ? r : null);
        setReceiptsTotal((receipts.rows || []).reduce((s, x) => s + (x.movement || 0), 0));
        setPaymentsTotal((payments.rows || []).reduce((s, x) => s + (x.movement || 0), 0));
      })
      .catch(() => setRecon(null))
      .finally(() => setLoading(false));
  }, [from, to, branch]);

  const expected =
    recon && receiptsTotal !== null && paymentsTotal !== null
      ? round2(
          recon.opening +
            receiptsTotal -
            paymentsTotal +
            recon.contraNet +
            recon.suspenseNet +
            (recon.borrowingNet || 0) +
            (recon.advanceNet || 0),
        )
      : null;
  const delta = recon && expected !== null ? round2(expected - recon.closing) : 0;
  const matches = recon && Math.abs(delta) < 0.01;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cash Reconciliation</span>
        {!loading && recon && (
          matches ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Matches Close Book
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Off by {formatCurrency(Math.abs(delta))}
            </span>
          )
        )}
      </div>

      {loading ? (
        <div className="flex flex-wrap gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 min-w-[126px] h-14 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : recon ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Tile label="Opening" value={recon.opening} />
            <Tile label="+ Receipts" value={receiptsTotal} tone="emerald" />
            <Tile label="− Payments" value={paymentsTotal} tone="rose" />
            {recon.contraNet !== 0 && <Tile label="± Contra" value={recon.contraNet} tone="sky" />}
            {recon.suspenseNet !== 0 && <Tile label="± Suspense" value={recon.suspenseNet} tone="amber" />}
            {recon.borrowingNet !== 0 && <Tile label="± Borrowing" value={recon.borrowingNet} tone="violet" />}
            {recon.advanceNet !== 0 && <Tile label="± Advance" value={recon.advanceNet} tone="teal" />}
            <Tile label="= Closing" value={recon.closing} />
          </div>
          {!matches && (
            <Link
              href="/admin/transactions?furtherMode=__UNTRACKED__"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Review untracked transactions
            </Link>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-400">Reconciliation unavailable.</p>
      )}
    </div>
  );
}
