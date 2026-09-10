"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Landmark,
  HandCoins,
  Wallet,
  Banknote,
  Home,
  Users,
  HelpCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { AGEING_BUCKETS } from "@/lib/ageing";
import { payableGroupForPurpose } from "@/constants/payableGroups";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";
import LedgerScopeBar from "@/components/finance/LedgerScopeBar";
import LedgerSummaryCard from "@/components/finance/LedgerSummaryCard";

const ICONS = {
  "cash-book": Landmark,
  receivables: HandCoins,
  advances: Wallet,
  "loan-accounts": Banknote,
  rent: Home,
  employees: Users,
  other: Wallet,
  suspense: HelpCircle,
  borrowings: HandCoins,
};
const TONES = {
  "cash-book": "indigo",
  receivables: "emerald",
  advances: "teal",
  "loan-accounts": "orange",
  rent: "rose",
  employees: "rose",
  other: "rose",
  suspense: "amber",
  borrowings: "violet",
};

/**
 * The overview dashboard for /admin/assets and /admin/liabilities — a summary, not a stack of
 * tables. Also carries the backward-compat redirect resolver for the old `?section=…` deep
 * links.
 */
export default function LedgerOverview({ side }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { scope, scopeQS, asOfLabel } = useLedgerScope();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  // ---- backward-compat: bounce old ?section= deep links to the new sub-pages ----
  useEffect(() => {
    const section = searchParams.get("section");
    if (!section) {
      setRedirecting(false);
      return;
    }
    setRedirecting(true);
    const carry = scopeQS();
    const go = (path, extra = "") => {
      const qs = [carry, extra].filter(Boolean).join("&");
      router.replace(qs ? `${path}?${qs}` : path);
    };

    if (side === "liabilities") {
      if (section === "borrowings") return go("/admin/liabilities/borrowings");
      if (section === "suspense") return go("/admin/liabilities/suspense");
      if (section === "payables") {
        const doc = searchParams.get("doc");
        const head = searchParams.get("head");
        const sub = searchParams.get("sub");
        if (doc) {
          fetch(`/api/payables/${doc}`)
            .then((r) => r.json())
            .then((json) => {
              const grp = payableGroupForPurpose(json?.payable?.purpose);
              go(`/admin/liabilities/payables/${grp}`, `doc=${doc}`);
            })
            .catch(() => go("/admin/liabilities/payables/rent"));
          return;
        }
        const extra = [head && `head=${encodeURIComponent(head)}`, sub && `sub=${encodeURIComponent(sub)}`]
          .filter(Boolean)
          .join("&");
        return go("/admin/liabilities/payables/rent", extra);
      }
    } else {
      if (section === "receivables") {
        const doc = searchParams.get("doc");
        const head = searchParams.get("head");
        const extra = [doc && `doc=${doc}`, head && `head=${encodeURIComponent(head)}`]
          .filter(Boolean)
          .join("&");
        return go("/admin/assets/receivables", extra);
      }
    }
    setRedirecting(false);
  }, [searchParams, side, router, scopeQS]);

  useEffect(() => {
    if (redirecting) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/close-book/overview?side=${side}&${scopeQS()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("overview load failed:", err);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [side, scopeQS, redirecting]);

  const heroLabel = side === "liabilities" ? "Total Liabilities" : "Total Assets";
  const splitKeys =
    side === "liabilities"
      ? ["rent", "employees", "other", "suspense"]
      : ["cash-book", "receivables", "loan-accounts"];
  const split = useMemo(() => {
    const bySection = new Map((data?.sections || []).map((s) => [s.key, s]));
    return splitKeys.map((k) => bySection.get(k)).filter(Boolean);
  }, [data, side]);

  const ageingChip = (bucket) => {
    const found = (data?.ageing || []).find((b) => b._id === bucket.value);
    return { count: found?.count || 0, totalPending: found?.totalPending || 0 };
  };
  const ageingHref = (bucketValue) => {
    const base = side === "liabilities" ? "/admin/liabilities/payables/rent" : "/admin/assets/receivables";
    const qs = [scopeQS(), `ageing=${bucketValue}`].filter(Boolean).join("&");
    return `${base}?${qs}`;
  };

  if (redirecting) {
    return <p className="py-16 text-center text-sm text-gray-400">Opening…</p>;
  }

  return (
    <div className="space-y-5">
      <LedgerScopeBar />

      {/* hero */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{heroLabel}</p>
        {loading || !data ? (
          <div className="h-9 w-48 bg-gray-100 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(data.total)}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">{asOfLabel}</p>
        {data && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-gray-500">
            {split.map((s) => (
              <span key={s.key}>
                {s.label}: <strong className="text-gray-800">{formatCurrency(s.amount)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* unattributed (assets only) */}
      {side !== "liabilities" && data?.unattributed?.count > 0 && (
        <Link
          href="/admin/transactions?furtherMode=__UNTRACKED__"
          className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>{formatCurrency(data.unattributed.amount)}</strong> across{" "}
            <strong>{data.unattributed.count}</strong> transactions is missing account
            attribution and is excluded from this total.
          </p>
        </Link>
      )}

      {/* section cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(data?.sections || Array.from({ length: 4 })).map((s, i) =>
          s ? (
            <LedgerSummaryCard
              key={s.key}
              href={s.href}
              label={s.label}
              amount={s.amount}
              count={s.count}
              icon={ICONS[s.key]}
              tone={TONES[s.key]}
              loading={loading}
            />
          ) : (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
            </div>
          ),
        )}
      </div>

      {/* ageing chips → link through */}
      {data?.ageing?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {AGEING_BUCKETS.map((b) => {
            const chip = ageingChip(b);
            return (
              <Link
                key={b.value}
                href={ageingHref(b.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {b.label} · {chip.count} · {formatCurrency(chip.totalPending)}
              </Link>
            );
          })}
        </div>
      )}

      {/* top 5 outstanding */}
      {data?.topDocuments?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Top outstanding {side === "liabilities" ? "payables" : "receivables"}
            </h2>
            <Link
              href={
                side === "liabilities"
                  ? `/admin/liabilities/payables/other?${scopeQS()}`
                  : `/admin/assets/receivables?${scopeQS()}`
              }
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-800"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {data.topDocuments.map((doc) => (
              <li key={doc._id}>
                <Link
                  href={`${doc.href}${scopeQS() ? `&${scopeQS()}` : ""}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-gray-50 -mx-2 px-2 rounded-lg"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-gray-800 truncate">{doc.label}</span>
                    {doc.subLabel ? (
                      <span className="text-gray-400"> · {doc.subLabel}</span>
                    ) : null}
                    {doc.ageingDays > 0 ? (
                      <span className="text-rose-500 text-xs"> · {doc.ageingDays}d overdue</span>
                    ) : null}
                  </span>
                  <span className="font-semibold text-gray-900 shrink-0">
                    {formatCurrency(doc.pending)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
