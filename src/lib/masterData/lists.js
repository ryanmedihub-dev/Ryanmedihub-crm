

import {
  getActiveValues,
  getExpenseSubTypes,
  getMethodRows,
  getLabelMap,
  getRoutingRule,
  getRoutingMap,
  isEmpty,
  isRoutingEmpty,
  getDirectPaymentCategories as mdDirect,
  getPayableExpenseCategories as mdPayable,
  getPayableExpenseDropdownCategories as mdPayableDropdown,
  getNonCashMethods as mdNonCash,
  getUnsettledMethods as mdUnsettled,
} from "@/lib/masterData";

import {
  EXPENSE_CATEGORY_TREE,
  EXPENSE_CATEGORIES,
  PAYABLE_EXPENSE_CATEGORIES,
  PAYABLE_EXPENSE_DROPDOWN_CATEGORIES,
  DIRECT_PAYMENT_CATEGORIES,
  getExpenseTypes as literalExpenseTypes,
} from "@/constants/expenseCategories";

import literalRoutingMap, {
  ACCOUNTS,
  RECEIPT_MODES,
  NON_CASH_METHODS,
  UNSETTLED_METHODS,
  getBankRoutingDefaults as literalRouting,
  getExpenseFurtherModeDefault,
} from "@/constants/bankRouting";

import {
  METHOD_LABELS,
  EXPENSE_METHODS,
  REVENUE_METHODS,
  getMethodOptions as literalMethodOptions,
} from "@/constants/paymentMethods";

export { getExpenseFurtherModeDefault };

function mergeTemplate(activeValues, template) {
  const activeSet = new Set(activeValues);
  const kept = template.filter((v) => activeSet.has(v));
  const templateSet = new Set(template);
  const appended = activeValues.filter((v) => !templateSet.has(v));
  return [...kept, ...appended];
}

export async function getExpenseCategories() {
  if (await isEmpty("EXPENSE_CATEGORY")) return [...EXPENSE_CATEGORIES];
  return mergeTemplate(await getActiveValues("EXPENSE_CATEGORY"), EXPENSE_CATEGORIES);
}

export async function getExpenseTypes(category) {
  if (await isEmpty("EXPENSE_SUBTYPE")) return literalExpenseTypes(category);
  return mergeTemplate(await getExpenseSubTypes(category), EXPENSE_CATEGORY_TREE[category] || []);
}

export async function getDirectPaymentCategories() {
  if (await isEmpty("EXPENSE_CATEGORY")) return [...DIRECT_PAYMENT_CATEGORIES];
  return mergeTemplate(await mdDirect(), DIRECT_PAYMENT_CATEGORIES);
}

export async function getPayableExpenseCategories() {
  if (await isEmpty("EXPENSE_CATEGORY")) return [...PAYABLE_EXPENSE_CATEGORIES];
  return mergeTemplate(await mdPayable(), PAYABLE_EXPENSE_CATEGORIES);
}

export async function getPayableExpenseDropdownCategories() {
  if (await isEmpty("EXPENSE_CATEGORY")) return [...PAYABLE_EXPENSE_DROPDOWN_CATEGORIES];
  return mergeTemplate(await mdPayableDropdown(), PAYABLE_EXPENSE_DROPDOWN_CATEGORIES);
}

export async function getExpenseCategoryTree() {
  const cats = await getExpenseCategories();
  const tree = {};
  await Promise.all(cats.map(async (c) => (tree[c] = await getExpenseTypes(c))));
  return tree;
}

export async function getAccounts() {
  if (await isEmpty("ACCOUNT")) return [...ACCOUNTS];
  return mergeTemplate(await getActiveValues("ACCOUNT"), ACCOUNTS);
}

export const getFurtherModes = getAccounts;

export async function getReceiptModes() {
  if (await isEmpty("RECEIPT_MODE")) return [...RECEIPT_MODES];
  return mergeTemplate(await getActiveValues("RECEIPT_MODE"), RECEIPT_MODES);
}

export async function getNonCashMethods() {
  if (await isEmpty("PAYMENT_METHOD")) return [...NON_CASH_METHODS];
  return mdNonCash();
}

export async function getUnsettledMethods() {
  if (await isEmpty("PAYMENT_METHOD")) return [...UNSETTLED_METHODS];
  return mdUnsettled();
}

export async function getMethodLabels() {
  const dyn = await getLabelMap("PAYMENT_METHOD");
  return Object.keys(dyn).length ? { ...METHOD_LABELS, ...dyn } : { ...METHOD_LABELS };
}

const METHOD_SPECIALS = new Set([
  "offset_settlement",
  "paid_to_external",
  "paid_by_other",
  "including-package",
]);

export async function getMethodOptions(category, { forEdit = false } = {}) {
  if (await isEmpty("PAYMENT_METHOD")) return literalMethodOptions(category, { forEdit });

  const rows = await getMethodRows();
  const active = new Map(rows.map((r) => [r.value, r]));
  const labelOf = (v) => active.get(v)?.label || METHOD_LABELS[v] || v;
  const isExpense = category === "EXPENSE";

  const templateBase = (isExpense ? EXPENSE_METHODS : REVENUE_METHODS).map((o) => o.value);
  const templateSet = new Set(templateBase);
  const wantApplies = isExpense ? ["EXPENSE", "BOTH"] : ["REVENUE", "BOTH"];

  const baseValues = [
    ...templateBase.filter((v) => active.has(v)),
    ...rows
      .filter(
        (r) =>
          !templateSet.has(r.value) &&
          !METHOD_SPECIALS.has(r.value) &&
          wantApplies.includes(r.appliesTo),
      )
      .map((r) => r.value),
  ];

  const out = [...baseValues];
  if (!isExpense && category === "MEDICINE" && !forEdit && active.has("including-package"))
    out.push("including-package");
  if (active.has("offset_settlement")) out.push("offset_settlement");
  const ext = isExpense ? "paid_by_other" : "paid_to_external";
  if (active.has(ext)) out.push(ext);

  return out.map((v) => ({ value: v, label: labelOf(v) }));
}

export async function getBankRoutingDefaults(branch, transactionCategory, method) {
  const rule = await getRoutingRule(branch, transactionCategory, method);
  if (rule) return { ...rule };
  if (await isRoutingEmpty()) return literalRouting(branch, transactionCategory, method);
  return { receiptMode: "", furtherMode: "" };
}

export async function getBankRoutingMap() {
  if (await isRoutingEmpty()) return literalRoutingMap;
  return getRoutingMap();
}
