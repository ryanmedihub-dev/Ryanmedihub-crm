"use client";

import { createContext, useContext, useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/financeUI";

const LedgerScopeContext = createContext(null);

const today = () => new Date().toISOString().slice(0, 10);

export function LedgerScopeProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const scope = useMemo(
    () => ({
      branch: searchParams.get("branch") || "",
      dateFrom: searchParams.get("from") || "",
      dateTo: searchParams.get("to") || "",
    }),
    [searchParams],
  );

  const setScope = useCallback(
    (patch) => {
      const next = typeof patch === "function" ? patch(scope) : { ...scope, ...patch };
      const params = new URLSearchParams(searchParams.toString());
      const apply = (key, value) => {
        if (value) params.set(key, value);
        else params.delete(key);
      };
      apply("branch", next.branch);
      apply("from", next.dateFrom);
      apply("to", next.dateTo);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [scope, searchParams, router, pathname],
  );

  
  
  const scopeQS = useCallback(
    (extra = {}) => {
      const p = new URLSearchParams();
      if (scope.branch) p.set("branch", scope.branch);
      if (scope.dateFrom) p.set("from", scope.dateFrom);
      p.set("to", scope.dateTo || today());
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") p.set(k, v);
      });
      return p.toString();
    },
    [scope],
  );

  const asOfLabel = useMemo(
    () => `As of ${formatDate(scope.dateTo || new Date())}${scope.branch ? ` · ${scope.branch}` : ""}`,
    [scope.dateTo, scope.branch],
  );

  const value = useMemo(
    () => ({ scope, setScope, scopeQS, asOfLabel }),
    [scope, setScope, scopeQS, asOfLabel],
  );

  return <LedgerScopeContext.Provider value={value}>{children}</LedgerScopeContext.Provider>;
}

export function useLedgerScope() {
  const ctx = useContext(LedgerScopeContext);
  if (!ctx) throw new Error("useLedgerScope must be used inside <LedgerScopeProvider>");
  return ctx;
}
