"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Link2, Unlink, Loader2, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { settlementLinesFor } from "@/lib/advanceSettlements";

export default function SettleAgainstModal({ kind, row, onClose, onSuccess, toast }) {
  const isAdvance = kind === "advance";
  const endpoint = isAdvance ? `/api/advances/${row._id}` : `/api/borrowings/${row._id}`;
  const listEndpoint = isAdvance ? "/api/payables/list" : "/api/receivables/list";
  const settledField = isAdvance ? "settlesPayableId" : "settlesReceivableId";
  const targetLabel = isAdvance ? "payable" : "receivable";

  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Borrowing side is unchanged: one settlement, single select + amount.
  const [selectedId, setSelectedId] = useState(row[settledField] ? String(row[settledField]) : "");
  const [amount, setAmount] = useState("");

  // Advance side: this advance can now settle several payables at once — lines already
  // saved on the document (refreshed locally after each partial submit, without needing the
  // parent to re-fetch), plus lines staged in this session but not yet submitted.
  const [advanceDoc, setAdvanceDoc] = useState(row);
  const [stagedLines, setStagedLines] = useState([]);
  const [lineMeta, setLineMeta] = useState({});

  const advanceCap = isAdvance ? Number(advanceDoc.amount) || 0 : 0;

  useEffect(() => {
    let cancelled = false;
    const key = isAdvance ? "payables" : "receivables";

    (async () => {
      try {
        const all = [];
        let page = 1;
        // Page through every open document so nothing (e.g. a current-month salary or
        // incentive payable) is dropped by the server's 200-row page cap.
        for (;;) {
          const res = await fetch(`${listEndpoint}?outstanding=true&limit=200&page=${page}`);
          const data = await res.json();
          const batch = data[key] || [];
          all.push(...batch);
          const total = data.total || all.length;
          if (batch.length === 0 || all.length >= total || page >= 25) break;
          page += 1;
        }
        if (!cancelled) {
          setOptions(all.filter((o) => o.pending > 0 && !o.isCancelled));
        }
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listEndpoint, isAdvance]);

  const partyLabel = (opt) => (isAdvance ? opt.payee?.label : opt.payer?.label) || "—";

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      [partyLabel(opt), opt.purpose, opt.expenseSubType, opt.revenueSubType]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [options, search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------------- */
  /* Advance → multiple payables                                            */
  /* ---------------------------------------------------------------------- */

  const existingLines = useMemo(() => (isAdvance ? settlementLinesFor(advanceDoc) : []), [isAdvance, advanceDoc]);
  const existingTotal = existingLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  const stagedTotal = stagedLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  const remainingCap = Math.max(0, Math.round((advanceCap - existingTotal - stagedTotal) * 100) / 100);

  // Fill in party label / purpose for existing lines — from the open-payables list when
  // possible, or a one-off fetch when the payable is already fully settled (and so dropped
  // out of that "outstanding only" list).
  useEffect(() => {
    if (!isAdvance || existingLines.length === 0) return;
    const need = existingLines
      .map((l) => String(l.payableId))
      .filter((id) => !lineMeta[id] && !options.some((o) => String(o._id) === id));
    if (need.length === 0) {
      // Everything resolvable from `options` — copy those over.
      setLineMeta((prev) => {
        const next = { ...prev };
        let changed = false;
        existingLines.forEach((l) => {
          const id = String(l.payableId);
          if (next[id]) return;
          const opt = options.find((o) => String(o._id) === id);
          if (opt) {
            next[id] = { label: partyLabel(opt), purpose: opt.purpose, pending: opt.pending };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(
        need.map(async (id) => {
          try {
            const res = await fetch(`/api/payables/${id}`);
            const data = await res.json();
            if (res.ok && data.payable) {
              return [id, { label: data.payable.payee?.label || "—", purpose: data.payable.purpose, pending: data.payable.pending }];
            }
          } catch {
            /* ignore */
          }
          return [id, { label: "—", purpose: "", pending: 0 }];
        }),
      );
      if (cancelled) return;
      setLineMeta((prev) => {
        const next = { ...prev };
        existingLines.forEach((l) => {
          const id = String(l.payableId);
          const opt = options.find((o) => String(o._id) === id);
          if (opt && !next[id]) next[id] = { label: partyLabel(opt), purpose: opt.purpose, pending: opt.pending };
        });
        fetched.forEach(([id, meta]) => {
          if (!next[id]) next[id] = meta;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdvance, existingLines, options]);

  // Payables still pickable to add — not already an existing or staged line.
  const addableOptions = useMemo(() => {
    if (!isAdvance) return filteredOptions;
    const taken = new Set([
      ...existingLines.map((l) => String(l.payableId)),
      ...stagedLines.map((l) => String(l.payableId)),
    ]);
    return filteredOptions.filter((o) => !taken.has(String(o._id)));
  }, [isAdvance, filteredOptions, existingLines, stagedLines]);

  const addStagedLine = (opt) => {
    if (remainingCap <= 0) {
      toast.error(`The full advance (${formatCurrency(advanceCap)}) is already settled or staged`);
      return;
    }
    const amt = Math.round(Math.min(remainingCap, Number(opt.pending) || 0) * 100) / 100;
    setStagedLines((prev) => [
      ...prev,
      { payableId: opt._id, label: partyLabel(opt), purpose: opt.purpose, pending: Number(opt.pending) || 0, amount: amt },
    ]);
  };

  const updateStagedAmount = (payableId, value) => {
    setStagedLines((prev) =>
      prev.map((l) => (l.payableId === payableId ? { ...l, amount: value } : l)),
    );
  };

  const removeStagedLine = (payableId) => {
    setStagedLines((prev) => prev.filter((l) => l.payableId !== payableId));
  };

  const stagedLinesValid =
    stagedLines.length > 0 &&
    stagedLines.every((l) => {
      const amt = Number(l.amount) || 0;
      return amt > 0 && amt <= l.pending + 1e-6;
    }) &&
    stagedTotal <= advanceCap - existingTotal + 1e-6;

  const refreshAdvanceDoc = async () => {
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (res.ok && data.advance) setAdvanceDoc(data.advance);
    } catch {
      /* keep showing the last-known state */
    }
  };

  const handleSettleAll = async () => {
    if (stagedLines.length === 0) {
      toast.error("Add at least one payable to settle against");
      return;
    }
    const attempting = stagedLines;
    setSubmitting(true);
    const succeeded = [];
    let firstError = null;
    for (const line of attempting) {
      try {
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "settle",
            settlesPayableId: line.payableId,
            amount: Math.round((Number(line.amount) || 0) * 100) / 100,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          firstError = data.error || "Failed to link settlement";
          break;
        }
        succeeded.push(line.payableId);
      } catch {
        firstError = "Failed to link settlement";
        break;
      }
    }
    if (succeeded.length > 0) {
      setStagedLines((prev) => prev.filter((l) => !succeeded.includes(l.payableId)));
      await refreshAdvanceDoc();
    }
    setSubmitting(false);
    if (firstError) {
      toast.error(
        succeeded.length > 0 ? `${succeeded.length} settled, then failed: ${firstError}` : firstError,
      );
      return;
    }
    toast.success(attempting.length > 1 ? `Settled against ${attempting.length} payables` : "Settlement linked");
    onSuccess();
  };

  const handleUnlinkLine = async (line) => {
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unsettle", ...(line._id ? { settlementId: line._id } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Settlement unlinked");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to unlink settlement");
      }
    } catch {
      toast.error("Failed to unlink settlement");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Borrowing → single receivable (unchanged behaviour)                    */
  /* ---------------------------------------------------------------------- */

  const alreadySettling = !isAdvance && !!row[settledField];

  const handleSettle = async () => {
    if (!selectedId) {
      toast.error(`Select a ${targetLabel} to settle against`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", [settledField]: selectedId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Settlement linked");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to link settlement");
      }
    } catch {
      toast.error("Failed to link settlement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnsettle = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unsettle" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Settlement unlinked");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to unlink settlement");
      }
    } catch {
      toast.error("Failed to unlink settlement");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  if (!isAdvance) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-indigo-600" /> Settle Against…
            </h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              Links this {formatCurrency(row.amount)} borrowing — <strong>{row.party?.label}</strong> — against
              any open receivable. Nets against what you&apos;re owed live — never changes the target
              document&apos;s own amount.
            </p>

            {alreadySettling && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center justify-between gap-3">
                <span>Already settling a {targetLabel} — unlink first to pick a different one.</span>
                <button
                  onClick={handleUnsettle}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 shrink-0"
                >
                  <Unlink className="w-3.5 h-3.5" /> Unlink
                </button>
              </div>
            )}

            {!alreadySettling && (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${targetLabel}s by party, purpose…`}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />

                {loading ? (
                  <p className="text-sm text-gray-400">Loading open {targetLabel}s…</p>
                ) : filteredOptions.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    {options.length === 0 ? `No open ${targetLabel}s.` : `No open ${targetLabel}s match "${search}".`}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {filteredOptions.map((opt) => (
                      <label
                        key={opt._id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer ${
                          selectedId === opt._id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="radio"
                            name="settleTarget"
                            checked={selectedId === opt._id}
                            onChange={() => setSelectedId(opt._id)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-800 truncate">{partyLabel(opt)}</span>
                            <span className="block text-xs text-gray-500 truncate">
                              {(opt.purpose || "").replace(/_/g, " ")}
                              {(opt.expenseSubType || opt.revenueSubType) ? ` — ${opt.expenseSubType || opt.revenueSubType}` : ""}
                            </span>
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-amber-700 shrink-0">
                          {formatCurrency(opt.pending)} outstanding
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {!alreadySettling && (
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSettle}
                disabled={submitting || !selectedId}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link Settlement"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-600" /> Settle Against…
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-600">
            Splits this {formatCurrency(advanceCap)} advance — <strong>{advanceDoc.party?.label}</strong> — across
            one or more open payables. Each line nets against both that payable&apos;s outstanding and what{" "}
            {advanceDoc.party?.label || "the party"} owes back — the rest stays recoverable.
          </p>

          {existingLines.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Already settling</p>
              {existingLines.map((line, i) => {
                const meta = lineMeta[String(line.payableId)];
                return (
                  <div
                    key={line._id || `legacy-${i}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-teal-200 bg-teal-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">
                        {meta?.label || "Loading…"}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {(meta?.purpose || "").replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-teal-700">{formatCurrency(line.amount)}</span>
                      <button
                        onClick={() => handleUnlinkLine(line)}
                        disabled={submitting}
                        title="Unlink"
                        className="p-1.5 rounded-lg bg-white border border-teal-300 text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {stagedLines.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Staged (not saved yet)</p>
              {stagedLines.map((line) => (
                <div
                  key={line.payableId}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800 truncate">{line.label}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {(line.purpose || "").replace(/_/g, " ")} · {formatCurrency(line.pending)} outstanding
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={line.pending}
                        value={line.amount}
                        onChange={(e) => updateStagedAmount(line.payableId, e.target.value)}
                        className="w-24 pl-5 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <button
                      onClick={() => removeStagedLine(line.payableId)}
                      title="Remove"
                      className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Advance <strong>{formatCurrency(advanceCap)}</strong>
            </span>
            <span>
              Settled <strong>{formatCurrency(existingTotal)}</strong>
            </span>
            {stagedLines.length > 0 && (
              <span>
                Staging <strong>{formatCurrency(stagedTotal)}</strong>
              </span>
            )}
            <span>
              Remaining <strong>{formatCurrency(remainingCap)}</strong>
            </span>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Add a payable</p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search payables by party, purpose…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              disabled={remainingCap <= 0}
            />

            {remainingCap <= 0 ? (
              <p className="text-sm text-gray-400">The full advance is settled or staged.</p>
            ) : loading ? (
              <p className="text-sm text-gray-400">Loading open payables…</p>
            ) : addableOptions.length === 0 ? (
              <p className="text-sm text-gray-400">
                {options.length === 0 ? "No open payables." : `No more open payables match "${search}".`}
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {addableOptions.map((opt) => (
                  <div
                    key={opt._id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{partyLabel(opt)}</span>
                      <span className="block text-xs text-gray-500 truncate">
                        {(opt.purpose || "").replace(/_/g, " ")}
                        {(opt.expenseSubType || opt.revenueSubType) ? ` — ${opt.expenseSubType || opt.revenueSubType}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-amber-700">{formatCurrency(opt.pending)} outstanding</span>
                      <button
                        onClick={() => addStagedLine(opt)}
                        title="Add"
                        className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={handleSettleAll}
            disabled={submitting || !stagedLinesValid}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : stagedLines.length > 1 ? (
              `Settle ${stagedLines.length} Lines`
            ) : (
              "Link Settlement"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
