"use client";

import BankRoutingFields from "@/components/BankRoutingFields";
import ExternalPartyFields from "@/components/ExternalPartyFields";
import useMasterData from "@/lib/useMasterData";

function paymentIdConfig(method) {
  if (method === "card") return { placeholder: "Please enter card last no.", required: true };
  if (method?.toLowerCase() === "bajaj_loan" || method?.toLowerCase() === "fibe_loan")
    return { placeholder: "Please add the reference id", required: true };
  if (method === "cash") return { placeholder: "Please add transaction id", required: false };
  if (method === "including-package") return { placeholder: "N/A — included in package", required: false };
  return { placeholder: "Please add transaction id", required: true };
}

export default function MethodField({
  category,
  branch,
  value,
  onChange,
  disabled = false,
  methodOptions,
  forEdit = false,
  collapsibleRouting = false,
}) {
  const { getMethodOptions, withLegacyMethod } = useMasterData();
  const isExpense = category === "EXPENSE";
  const externalMethod = isExpense ? "paid_by_other" : "paid_to_external";
  const idConfig = paymentIdConfig(value.method);

  const options = withLegacyMethod(
    methodOptions || getMethodOptions(category, { forEdit }),
    value.method,
  );

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
        <select
          value={value.method}
          onChange={(e) => onChange({ method: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
        {value.method === "offset_settlement" && (
          <p className="text-xs text-amber-600 mt-1">
            No cash movement; settles against an existing balance
          </p>
        )}
      </div>

      {value.method === externalMethod && (
        <ExternalPartyFields
          direction={isExpense ? "PAID_BY" : "RECEIVED_BY"}
          value={value.externalParty}
          onChange={(externalParty) => onChange({ externalParty })}
        />
      )}

      <BankRoutingFields
        costType={isExpense ? "Expenses" : "Revenue"}
        branch={branch}
        transactionCategory={category}
        method={value.method}
        receiptMode={value.receiptMode}
        furtherMode={value.furtherMode}
        onChange={(patch) => onChange(patch)}
        forEdit={forEdit}
        collapsible={collapsibleRouting}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Transaction ID {idConfig.required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={value.paymentId || ""}
          onChange={(e) => onChange({ paymentId: e.target.value })}
          placeholder={idConfig.placeholder}
          disabled={disabled || value.method === "including-package"}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
            value.method === "including-package" ? "bg-gray-50 cursor-not-allowed text-gray-400" : ""
          }`}
        />
      </div>
    </>
  );
}

export { paymentIdConfig as getPaymentIdConfig };
