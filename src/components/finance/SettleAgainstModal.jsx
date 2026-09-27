"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Link2, Unlink, Loader2, Plus, Trash2, Search, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { settlementLinesFor } from "@/lib/advanceSettlements";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const uniqById = (arr) => {
  const seen = new Set();
  return arr.filter((o) => {
    const id = String(o?._id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export default function SettleAgainstModal({ kind, row, onClose, onSuccess, toast }) {
  const isAdvance = kind === "advance";
  return isAdvance ? (
    <AdvanceSettle row={row} onClose={onClose} onSuccess={onSuccess} toast={toast} />
  ) : (
    <BorrowingSettle row={row} onClose={onClose} onSuccess={onSuccess} toast={toast} />
  );
}

function AdvanceSettle({ row, onClose, onSuccess, toast }) {
  const endpoint = `/api/advances/${row._id}`;

  const [advanceDoc, setAdvanceDoc] = useState(row);
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [metaById, setMetaById] = useState({}); 
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState({}); 
  const [busyLine, setBusyLine] = useState(null); 
  const [submitting, setSubmitting] = useState(false);
  
  
  
  const canScopeToParty = !!(row.party?.refId && ["EMPLOYEE", "VENDOR", "PATIENT"].includes(row.party?.kind));
  const [scopeToParty, setScopeToParty] = useState(false);

  const amount = round2(advanceDoc.amount);
  
  
  
  const cashRecovered = useMemo(() => round2(row.cashRecovered || 0), [row._id]); 
  const existingLines = useMemo(() => settlementLinesFor(advanceDoc), [advanceDoc]);
  const settledTotal = round2(existingLines.reduce((s, l) => s + (l.amount || 0), 0));
  const stagedList = Object.values(staged);
  const stagedTotal = round2(stagedList.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const remaining = round2(amount - settledTotal - cashRecovered - stagedTotal);
  const consumed = round2(amount - Math.max(remaining, 0));
  const pct = amount > 0 ? Math.min(100, Math.max(0, (consumed / amount) * 100)) : 0;

  const partyKind = advanceDoc.party?.kind || "";
  const partyRefId = advanceDoc.party?.refId ? String(advanceDoc.party.refId) : "";
  const partyLabel = advanceDoc.party?.label || "the party";

  
  useEffect(() => {
    const ctrl = new AbortController();
    setOptionsLoading(true);
    (async () => {
      try {
        const base = new URLSearchParams({ outstanding: "true", limit: "200" });
        if (scopeToParty && partyRefId && ["EMPLOYEE", "VENDOR", "PATIENT"].includes(partyKind)) {
          base.set("payeeKind", partyKind);
          base.set("payeeRefId", partyRefId);
        }
        const all = [];
        for (let page = 1; page <= 25; page += 1) {
          const res = await fetch(`/api/payables/list?${base}&page=${page}`, { signal: ctrl.signal });
          const data = await res.json();
          const batch = data.payables || [];
          all.push(...batch);
          const total = data.total || all.length;
          if (batch.length === 0 || all.length >= total) break;
        }
        setOptions(uniqById(all).filter((o) => (o.pending || 0) > 0 && !o.isCancelled));
      } catch (e) {
        if (e.name !== "AbortError") setOptions([]);
      } finally {
        setOptionsLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [partyKind, partyRefId, scopeToParty]);

  
  const subtitle = (m) => {
    if (!m) return "";
    const bits = [];
    if (m.purpose) bits.push(String(m.purpose).replace(/_/g, " "));
    if (m.period?.month && m.period?.year) bits.push(`${m.period.month}/${m.period.year}`);
    if (m.payeeCode) bits.push(`#${m.payeeCode}`);
    return bits.join(" · ");
  };

  
  const metaFromOpt = (o) => ({
    label: o.payee?.label || "—",
    purpose: o.purpose || "",
    period: o.period,
    payeeCode: o.payeeCode || "",
    pending: o.pending ?? 0,
  });
  useEffect(() => {
    
    const fromOptions = {};
    options.forEach((o) => {
      fromOptions[String(o._id)] = metaFromOpt(o);
    });
    if (Object.keys(fromOptions).length) {
      setMetaById((prev) => ({ ...fromOptions, ...prev }));
    }

    
    
    const need = existingLines
      .map((l) => String(l.payableId))
      .filter((id) => !fromOptions[id] && !metaById[id]);
    if (need.length === 0) return;

    let cancelled = false;
    Promise.all(
      need.map(async (id) => {
        try {
          const res = await fetch(`/api/payables/${id}`);
          if (res.status === 404) {
            return [id, { label: "Payable no longer exists", purpose: "", missing: true }];
          }
          const data = await res.json();
          if (res.ok && data.payable) {
            const p = data.payable;
            return [
              id,
              {
                label: p.payee?.label || "—",
                purpose: p.purpose || "",
                period: p.period,
                payeeCode: p.payeeCode || "",
                pending: p.pending ?? 0,
              },
            ];
          }
        } catch {
          
        }
        return null;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setMetaById((prev) => {
        const next = { ...prev };
        pairs.forEach((pair) => {
          if (pair && !next[pair[0]]) next[pair[0]] = pair[1];
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [existingLines, options]); 

  const takenIds = useMemo(
    () => new Set([...existingLines.map((l) => String(l.payableId)), ...Object.keys(staged)]),
    [existingLines, staged],
  );

  const addable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options
      .filter((o) => !takenIds.has(String(o._id)))
      .filter((o) =>
        !q
          ? true
          : [o.payee?.label, o.purpose, o.expenseSubType, o.expenseCategory]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [options, takenIds, search]);

  const addLine = (opt) => {
    if (remaining <= 0.005) {
      toast.error(`Nothing left of this advance to settle (${formatCurrency(remaining)} remaining)`);
      return;
    }
    const amt = round2(Math.min(remaining, opt.pending || 0));
    setStaged((prev) => ({
      ...prev,
      [String(opt._id)]: {
        payableId: String(opt._id),
        label: opt.payee?.label || "—",
        purpose: opt.purpose || "",
        period: opt.period,
        payeeCode: opt.payeeCode || "",
        pending: round2(opt.pending || 0),
        amount: amt,
      },
    }));
  };

  const setLineAmount = (payableId, value) =>
    setStaged((prev) => ({ ...prev, [payableId]: { ...prev[payableId], amount: value } }));

  const removeLine = (payableId) =>
    setStaged((prev) => {
      const next = { ...prev };
      delete next[payableId];
      return next;
    });

  const lineError = (line) => {
    const amt = Number(line.amount);
    if (!Number.isFinite(amt) || amt <= 0) return "Enter an amount";
    if (amt > line.pending + 0.005) return `Over this payable's ${formatCurrency(line.pending)} outstanding`;
    return null;
  };
  const overAdvance = round2(settledTotal + stagedTotal) > amount - cashRecovered + 0.005;
  const anyLineError = stagedList.some((l) => lineError(l));
  const canSubmit = stagedList.length > 0 && !anyLineError && !overAdvance && !submitting;

  const refreshAdvance = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (res.ok && data.advance) setAdvanceDoc((cur) => ({ ...cur, ...data.advance }));
    } catch {
      
    }
  }, [endpoint]);

  const submit = async () => {
    setSubmitting(true);
    const lines = stagedList;
    const done = [];
    let firstError = null;
    for (const line of lines) {
      try {
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "settle",
            settlesPayableId: line.payableId,
            amount: round2(line.amount),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          firstError = data.error || "Failed to link settlement";
          break;
        }
        done.push(line.payableId);
      } catch {
        firstError = "Failed to link settlement";
        break;
      }
    }
    if (done.length) {
      setStaged((prev) => {
        const next = { ...prev };
        done.forEach((id) => delete next[id]);
        return next;
      });
      await refreshAdvance();
    }
    setSubmitting(false);
    if (firstError) {
      toast.error(done.length ? `${done.length} settled, then failed: ${firstError}` : firstError);
      return;
    }
    toast.success(lines.length > 1 ? `Settled against ${lines.length} payables` : "Settlement linked");
    onSuccess();
  };

  const unlink = async (line) => {
    setBusyLine(String(line.payableId));
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unsettle", ...(line._id ? { settlementId: String(line._id) } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Settlement unlinked");
        await refreshAdvance();
        onSuccess();
      } else {
        toast.error(data.error || "Failed to unlink settlement");
      }
    } catch {
      toast.error("Failed to unlink settlement");
    } finally {
      setBusyLine(null);
    }
  };

  const footer = (
    <Footer onClose={onClose}>
      <button
        onClick={submit}
        disabled={!canSubmit}
        className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : stagedList.length > 1 ? (
          `Settle ${stagedList.length} lines · ${formatCurrency(stagedTotal)}`
        ) : (
          `Settle ${formatCurrency(stagedTotal || 0)}`
        )}
      </button>
    </Footer>
  );

  return (
    <Shell onClose={onClose} title="Settle advance against payables" wide footer={footer}>
      {}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-gray-800 truncate">{partyLabel}</p>
          <p className="text-xs text-gray-400 shrink-0">Advance {formatCurrency(amount)}</p>
        </div>
        <div className="mt-2.5 h-2 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span>Settled <strong className="text-gray-800">{formatCurrency(settledTotal)}</strong></span>
          {cashRecovered > 0 && (
            <span>Cash recovered <strong className="text-gray-800">{formatCurrency(cashRecovered)}</strong></span>
          )}
          {stagedTotal > 0 && (
            <span>Staging <strong className="text-indigo-700">{formatCurrency(stagedTotal)}</strong></span>
          )}
          <span>Remaining <strong className={remaining < -0.005 ? "text-rose-600" : "text-emerald-700"}>{formatCurrency(remaining)}</strong></span>
        </div>
      </div>

      {}
      {existingLines.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Currently settled against</p>
          {existingLines.map((line, i) => {
            const meta = metaById[String(line.payableId)];
            const id = String(line.payableId);
            return (
              <div key={line._id || `legacy-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/70 p-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${meta?.missing ? "text-rose-600" : "text-gray-800"}`}>
                    {meta ? meta.label : "Resolving…"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{subtitle(meta) || (meta?.missing ? "linked payable was deleted" : " ")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-teal-700">{formatCurrency(line.amount)}</span>
                  <button
                    onClick={() => unlink(line)}
                    disabled={busyLine === id}
                    title="Unlink this settlement"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                  >
                    {busyLine === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {}
      {stagedList.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">To settle now</p>
          {stagedList.map((line) => {
            const err = lineError(line);
            return (
              <div key={line.payableId} className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{line.label}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {[subtitle(line), `${formatCurrency(line.pending)} outstanding`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.amount}
                        onChange={(e) => setLineAmount(line.payableId, e.target.value)}
                        className={`w-28 rounded-lg border py-1.5 pl-5 pr-2 text-sm ${err ? "border-rose-300 bg-rose-50" : "border-gray-200"}`}
                      />
                    </div>
                    <button
                      onClick={() => removeLine(line.payableId)}
                      title="Remove"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {err && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{err}</p>}
              </div>
            );
          })}
          {overAdvance && (
            <p className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> These lines exceed what&apos;s left of the advance.
            </p>
          )}
        </section>
      )}

      {}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
            Add a payable {scopeToParty && canScopeToParty ? `for ${partyLabel}` : ""}
          </p>
          {canScopeToParty && (
            <button
              onClick={() => setScopeToParty((v) => !v)}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {scopeToParty ? "Show all parties" : `Only ${partyLabel}`}
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by party or purpose…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
            disabled={remaining <= 0.005}
          />
        </div>

        {remaining <= 0.005 ? (
          <p className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-400">
            The full advance is settled or staged — unlink a line to free some up.
          </p>
        ) : optionsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : addable.length === 0 ? (
          <p className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-400">
            {options.length === 0
              ? scopeToParty
                ? `No open payables for ${partyLabel}.`
                : "No open payables."
              : search
                ? `No open payables match "${search}".`
                : "Every open payable is already staged or settled."}
          </p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {addable.map((opt) => (
              <button
                key={opt._id}
                onClick={() => addLine(opt)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {opt.payee?.label || "—"}
                    {opt.payeeRole ? <span className="text-gray-400 font-normal"> · {opt.payeeRole}</span> : null}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {[subtitle(opt), opt.expenseSubType || opt.expenseCategory].filter(Boolean).join(" · ") ||
                      (opt.purpose || "").replace(/_/g, " ")}
                  </p>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-amber-700">{formatCurrency(opt.pending)}</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

function BorrowingSettle({ row, onClose, onSuccess, toast }) {
  const endpoint = `/api/borrowings/${row._id}`;
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(row.settlesReceivableId ? String(row.settlesReceivableId) : "");
  const [submitting, setSubmitting] = useState(false);
  const alreadySettling = !!row.settlesReceivableId;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const all = [];
        for (let page = 1; page <= 25; page += 1) {
          const res = await fetch(`/api/receivables/list?outstanding=true&limit=200&page=${page}`, { signal: ctrl.signal });
          const data = await res.json();
          const batch = data.receivables || [];
          all.push(...batch);
          const total = data.total || all.length;
          if (batch.length === 0 || all.length >= total) break;
        }
        setOptions(uniqById(all).filter((o) => (o.pending || 0) > 0 && !o.isCancelled));
      } catch (e) {
        if (e.name !== "AbortError") setOptions([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.payer?.label, o.purpose, o.revenueSubType].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [options, search]);

  const act = async (body, okMsg) => {
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(okMsg);
        onSuccess();
      } else {
        toast.error(data.error || "Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const footer = alreadySettling ? null : (
    <Footer onClose={onClose}>
      <button
        onClick={() => act({ action: "settle", settlesReceivableId: selectedId }, "Settlement linked")}
        disabled={submitting || !selectedId}
        className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link settlement"}
      </button>
    </Footer>
  );

  return (
    <Shell onClose={onClose} title="Settle borrowing against a receivable" footer={footer}>
      <p className="text-sm text-gray-600">
        Links this {formatCurrency(row.amount)} borrowing — <strong>{row.party?.label}</strong> — against an
        open receivable. Nets live against what you&apos;re owed; never changes the receivable&apos;s amount.
      </p>

      {alreadySettling ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>Already settling a receivable — unlink first to pick a different one.</span>
          <button
            onClick={() => act({ action: "unsettle" }, "Settlement unlinked")}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 shrink-0"
          >
            <Unlink className="w-3.5 h-3.5" /> Unlink
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receivables by party or purpose…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400">{options.length === 0 ? "No open receivables." : `No matches for "${search}".`}</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {filtered.map((opt) => (
                <label
                  key={opt._id}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                    selectedId === String(opt._id) ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name="settleTarget"
                      checked={selectedId === String(opt._id)}
                      onChange={() => setSelectedId(String(opt._id))}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-800">{opt.payer?.label || "—"}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {(opt.purpose || "").replace(/_/g, " ")}
                        {opt.revenueSubType ? ` — ${opt.revenueSubType}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-amber-700">{formatCurrency(opt.pending)}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ title, wide = false, onClose, footer = null, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-2xl ${wide ? "max-w-lg" : "max-w-md"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-5">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Link2 className="w-5 h-5 text-indigo-600" /> {title}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        {footer}
      </div>
    </div>
  );
}

function Footer({ onClose, children }) {
  return (
    <div className="flex shrink-0 gap-3 border-t border-gray-100 p-5">
      <button
        onClick={onClose}
        className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50"
      >
        Close
      </button>
      {children}
    </div>
  );
}
