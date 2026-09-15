"use client";

import { useEffect, useRef, useState } from "react";
import useMasterData from "@/lib/useMasterData";

export default function BankRoutingFields({
  costType,
  branch,
  transactionCategory,
  method,
  receiptMode,
  furtherMode,
  onChange,
  forEdit = false,
  collapsible = false,
}) {
  const { accounts, receiptModes, getBankRoutingDefaults, getExpenseFurtherModeDefault } =
    useMasterData();
  const isExpense = costType === "Expenses";
  const mounted = useRef(false);
  const [showRouting, setShowRouting] = useState(false);

  useEffect(() => {
    const defaults = isExpense
      ? { receiptMode: "", furtherMode: getExpenseFurtherModeDefault(method) }
      : getBankRoutingDefaults(branch, transactionCategory, method);
    const firstRun = !mounted.current;
    mounted.current = true;

    if (firstRun && (forEdit || receiptMode || furtherMode)) return;

    // No known default for this method — reveal the manual picker instead of silently
    // submitting an empty furtherMode (the server requires it whenever a payment is
    // recorded against a payable).
    if (collapsible && !defaults.furtherMode) setShowRouting(true);

    onChange(
      isExpense
        ? { furtherMode: defaults.furtherMode }
        : { receiptMode: defaults.receiptMode, furtherMode: defaults.furtherMode },
    );
  }, [isExpense, branch, transactionCategory, method]);

  const furtherModeField = (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {isExpense ? "Paid From Account" : "Received In Account"}
      </label>
      <select
        value={furtherMode || ""}
        onChange={(e) =>
          onChange(
            isExpense
              ? { furtherMode: e.target.value }
              : { receiptMode, furtherMode: e.target.value },
          )
        }
        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
      >
        <option value="">Select account</option>
        {accounts.map((account) => (
          <option key={account} value={account}>
            {account}
          </option>
        ))}
        {furtherMode && !accounts.includes(furtherMode) && (
          <option value={furtherMode}>{furtherMode}</option>
        )}
      </select>
    </div>
  );

  const fields = isExpense ? (
    furtherModeField
  ) : (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Mode</label>
        <select
          value={receiptMode || ""}
          onChange={(e) => onChange({ receiptMode: e.target.value, furtherMode })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">Select receipt mode</option>
          {receiptModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
          {receiptMode && !receiptModes.includes(receiptMode) && (
            <option value={receiptMode}>{receiptMode}</option>
          )}
        </select>
      </div>
      {furtherModeField}
    </>
  );

  if (!collapsible) return fields;

  return (
    <>
      <div className="md:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showRouting}
            onChange={(e) => setShowRouting(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          {isExpense
            ? "Set paid-from account manually"
            : "Set receipt mode & account manually"}
        </label>
      </div>
      {showRouting && fields}
    </>
  );
}
