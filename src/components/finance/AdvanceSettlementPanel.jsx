"use client";

import { formatCurrency, formatDate } from "@/lib/financeUI";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Tick an advance to apply it against the selected payable. `net = payable.pending − applied`.
 *
 * @param advances        rows from GET /api/advances/open-for-party (each has `remaining`,
 *                        `settledTotal`, `settlements`)
 * @param selectedPayable the open payable being paid (needs `.pending`, `.payee`)
 * @param allocations     { [advanceId]: number } — only ticked advances are present
 * @param onChange        (nextAllocationsObject) => void
 * @param disabled        block all interaction (e.g. while submitting)
 */
export default function AdvanceSettlementPanel({ advances = [], selectedPayable, allocations = {}, onChange, disabled }) {
  if (!advances.length || !selectedPayable) return null;

  const pending = round2(selectedPayable.pending || 0);
  const partyLabel = selectedPayable.payee?.label || "this party";
  const totalAvailable = round2(advances.reduce((s, a) => s + (a.remaining || 0), 0));

  const applied = round2(
    Object.entries(allocations).reduce((s, [, v]) => s + (Number(v) || 0), 0),
  );
  const net = round2(pending - applied);

  const setAmount = (advanceId, raw) => {
    const next = { ...allocations };
    if (raw === "" || raw == null) next[advanceId] = "";
    else next[advanceId] = raw;
    onChange(next);
  };

  const toggle = (adv, checked) => {
    const next = { ...allocations };
    if (checked) {
      // Auto-fill: the smaller of what this advance has left and what the payable still needs
      // after the advances already ticked.
      const otherApplied = round2(
        Object.entries(allocations).reduce((s, [id, v]) => (id === adv._id ? s : s + (Number(v) || 0)), 0),
      );
      const stillNeeded = Math.max(0, round2(pending - otherApplied));
      next[adv._id] = round2(Math.min(adv.remaining, stillNeeded)) || round2(adv.remaining);
    } else {
      delete next[adv._id];
    }
    onChange(next);
  };

  return (
    <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50/60 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-teal-900">
          Advances with {partyLabel} — {formatCurrency(totalAvailable)} available
        </p>
        <p className="mt-0.5 text-xs text-teal-700">
          Tick an advance to apply it here. It reduces both this payable and what {partyLabel} owes back —
          you only pay the remainder.
        </p>
      </div>

      <div className="space-y-1.5">
        {advances.map((adv) => {
          const rawVal = allocations[adv._id];
          const ticked = rawVal !== undefined;
          const amt = round2(Number(rawVal) || 0);
          const overRemaining = ticked && amt > round2(adv.remaining) + 0.005;
          const zeroWhenTicked = ticked && !(amt > 0);

          return (
            <div
              key={adv._id}
              className={`rounded-lg border bg-white p-2.5 ${
                ticked ? "border-teal-300 ring-1 ring-teal-200" : "border-gray-200"
              }`}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ticked}
                  disabled={disabled}
                  onChange={(e) => toggle(adv, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-gray-500">
                    {formatDate(adv.date)}
                    {adv.account ? ` · ${adv.account}` : ""}
                    {adv.reference ? ` · ${adv.reference}` : ""}
                  </span>
                  <span className="block text-sm text-gray-800">
                    Advance {formatCurrency(adv.amount)}
                    {adv.settledTotal > 0 && (
                      <span className="text-gray-400"> · {formatCurrency(adv.settledTotal)} already used</span>
                    )}
                    {adv.cashRecovered > 0 && (
                      <span className="text-gray-400"> · {formatCurrency(adv.cashRecovered)} recovered in cash</span>
                    )}
                    <span className="font-semibold text-teal-700"> · {formatCurrency(adv.remaining)} available</span>
                  </span>
                </span>
              </label>

              {ticked && (
                <div className="mt-2 pl-7">
                  <div className="relative w-40">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={adv.remaining}
                      value={rawVal}
                      disabled={disabled}
                      onChange={(e) => setAmount(adv._id, e.target.value)}
                      className={`w-full rounded-lg border py-1.5 pl-5 pr-2 text-sm ${
                        overRemaining || zeroWhenTicked ? "border-rose-300" : "border-gray-200"
                      }`}
                    />
                  </div>
                  {overRemaining && (
                    <p className="mt-1 text-xs text-rose-600">
                      Only {formatCurrency(adv.remaining)} left on this advance.
                    </p>
                  )}
                  {zeroWhenTicked && (
                    <p className="mt-1 text-xs text-rose-600">Enter how much to apply, or untick.</p>
                  )}
                  {adv.settlements?.length > 0 && (
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-gray-400 cursor-pointer">
                        Used against {adv.settlements.length} payable
                        {adv.settlements.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                        {adv.settlements.map((s, i) => (
                          <li key={i}>
                            {formatCurrency(s.amount)} — {formatDate(s.settledAt)}
                            {s.note ? ` · ${s.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer summary — the number that actually matters */}
      <div className="rounded-lg bg-white border border-teal-200 p-2.5 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Payable pending</span>
          <span className="tabular-nums">{formatCurrency(pending)}</span>
        </div>
        <div className="flex justify-between text-teal-700">
          <span>Advance applied</span>
          <span className="tabular-nums">−{formatCurrency(applied)}</span>
        </div>
        <div className="my-1 border-t border-dashed border-gray-200" />
        <div className={`flex justify-between font-bold ${net < 0 ? "text-rose-600" : "text-gray-900"}`}>
          <span>Net to pay</span>
          <span className="tabular-nums">{formatCurrency(net)}</span>
        </div>
        {applied > 0 && net === 0 && (
          <p className="mt-2 rounded bg-teal-50 px-2 py-1.5 text-xs font-medium text-teal-800">
            This advance fully covers the payable. Booking this closes the payable with no cash movement.
          </p>
        )}
        {applied > pending + 0.005 && (
          <p className="mt-2 text-xs text-rose-600">
            Advance applied is more than this payable&apos;s outstanding.
          </p>
        )}
      </div>
    </div>
  );
}
