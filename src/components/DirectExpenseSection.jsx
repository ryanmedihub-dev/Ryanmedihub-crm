"use client";

import TransactionSectionCard from "@/components/TransactionSectionCard";
import MethodField from "@/components/MethodField";
import ReceiptUpload from "@/components/ReceiptUpload";
import SearchableSelect from "@/components/SearchableSelect";
import TransactionSummaryPanel from "@/components/TransactionSummaryPanel";
import { BranchDateRemarks } from "@/components/RevenueSection";
import useMasterData from "@/lib/useMasterData";
import { Wallet, Save, Loader2 } from "lucide-react";

export default function DirectExpenseSection({
  data, onChange, vendors, branches, onSave, saving = false, saveLabel = "Save Expense",
  methodOptions,
  forEdit = false,
  collapsibleRouting = !forEdit,
}) {
  const { expenseCategories, payableExpenseCategories, getExpenseTypes } = useMasterData();
  // This section is only rendered in non-admin panels (sales / reception / stocks), where
  // payable-type expense categories are managed elsewhere, so hide them here. Incentive is
  // never a direct expense — it must go through a payable (patient-based or target-based).
  const DIRECT_EXPENSE_CATEGORY_OPTIONS = expenseCategories.filter(
    (cat) => !payableExpenseCategories.includes(cat) && cat !== "Incentive",
  );
  const set = (patch) => onChange({ ...data, ...patch });
  const vendor = vendors.find((v) => v._id === data.vendorId);
  const payeeLabel = data.isVendor ? vendor?.name : data.expenseGiverName;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <TransactionSectionCard title="Vendor Information">
          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!data.isVendor}
                onChange={(e) => set({ isVendor: !e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Enter Manually</span>
            </label>
          </div>

          {data.isVendor ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Vendor <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={vendors}
                value={data.vendorId}
                onChange={(v) => set({ vendorId: v })}
                placeholder="Choose a vendor"
                valueKey="_id"
                formatOption={(v) => `${v.name} - ${v.contact}`}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payee Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.expenseGiverName}
                onChange={(e) => set({ expenseGiverName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200"
                placeholder="Enter payee name"
              />
            </div>
          )}
        </TransactionSectionCard>

        <TransactionSectionCard title="Expense Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expense Category <span className="text-red-500">*</span>
              </label>
              <select
                value={data.expenseCategory}
                onChange={(e) => set({ expenseCategory: e.target.value, expenseType: "" })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select Category</option>
                {data.expenseCategory && !DIRECT_EXPENSE_CATEGORY_OPTIONS.includes(data.expenseCategory) && (
                  <option value={data.expenseCategory}>{data.expenseCategory} (existing)</option>
                )}
                {DIRECT_EXPENSE_CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expense Type <span className="text-red-500">*</span>
              </label>
              <select
                value={data.expenseType}
                onChange={(e) => set({ expenseType: e.target.value })}
                disabled={!data.expenseCategory}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
              >
                <option value="">Select Type</option>
                {data.expenseType && !getExpenseTypes(data.expenseCategory).includes(data.expenseType) && (
                  <option value={data.expenseType}>{data.expenseType} (existing)</option>
                )}
                {getExpenseTypes(data.expenseCategory).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={data.amount}
                onChange={(e) => set({ amount: e.target.value })}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Enter amount"
              />
            </div>
          </div>
        </TransactionSectionCard>

        <TransactionSectionCard title="Transaction Details" icon={Wallet}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MethodField
              category="EXPENSE"
              branch={data.branch}
              value={data}
              onChange={set}
              methodOptions={methodOptions}
              forEdit={forEdit}
              collapsibleRouting={collapsibleRouting}
            />
          </div>
        </TransactionSectionCard>

        <TransactionSectionCard title="Branch, Date & Remarks">
          <BranchDateRemarks data={data} onChange={set} branches={branches} />
        </TransactionSectionCard>

        <TransactionSectionCard title="Receipts / Documents">
          <ReceiptUpload
            receipts={data.receipts || []}
            onChange={(receipts) => set({ receipts })}
            section="expense"
          />
        </TransactionSectionCard>
      </div>

      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-6">
          <TransactionSummaryPanel
            category="EXPENSE"
            amount={data.amount}
            method={data.method}
            who={{ payeeLabel }}
            externalParty={data.method === "paid_by_other" ? data.externalParty : undefined}
          />
          {onSave && (
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full mt-4 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
