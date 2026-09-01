"use client";

// Client-side access to the dynamic master data. Fetches GET /api/master-data/lists once
// (SWR-cached, 60s dedupe) and, until that resolves or if it fails, falls back to the literal
// constants still bundled in src/constants/* — so every form renders identically to today from
// the first paint and only "upgrades" to live data once the fetch lands.
//
// Client components must never import src/lib/masterData/* (that pulls in mongoose). This hook
// and the API route are the only bridge.

import useSWR from "swr";

import {
  EXPENSE_CATEGORY_TREE,
  EXPENSE_CATEGORIES,
  PAYABLE_EXPENSE_CATEGORIES,
  PAYABLE_EXPENSE_DROPDOWN_CATEGORIES,
  DIRECT_PAYMENT_CATEGORIES,
  getExpenseTypes as literalExpenseTypes,
  TDS_TAX_TYPES,
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
  getMethodOptions as literalMethodOptions,
  withLegacyMethod,
} from "@/constants/paymentMethods";

const METHOD_OPTION_CATEGORIES = ["EXPENSE", "TRANSPLANT", "SERVICE", "MEDICINE"];

const FALLBACK = {
  expenseCategories: EXPENSE_CATEGORIES,
  expenseCategoryTree: EXPENSE_CATEGORY_TREE,
  directPaymentCategories: DIRECT_PAYMENT_CATEGORIES,
  payableExpenseCategories: PAYABLE_EXPENSE_CATEGORIES,
  payableExpenseDropdownCategories: PAYABLE_EXPENSE_DROPDOWN_CATEGORIES,
  accounts: ACCOUNTS,
  furtherModes: ACCOUNTS,
  receiptModes: RECEIPT_MODES,
  methodLabels: METHOD_LABELS,
  methodOptions: METHOD_OPTION_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = {
      new: literalMethodOptions(cat, { forEdit: false }),
      edit: literalMethodOptions(cat, { forEdit: true }),
    };
    return acc;
  }, {}),
  nonCashMethods: NON_CASH_METHODS,
  unsettledMethods: UNSETTLED_METHODS,
  routing: literalRoutingMap,
  tdsTaxTypes: TDS_TAX_TYPES,
};

const fetcher = async (url) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`master-data fetch failed (${res.status})`);
  return res.json();
};

export default function useMasterData() {
  const { data, error, isLoading, mutate } = useSWR("/api/master-data/lists", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    keepPreviousData: true,
    errorRetryCount: 2,
  });

  const live = !!data;
  const md = data || FALLBACK;

  return {
    /** true once real data from the API is in hand (vs. the literal fallback). */
    ready: live,
    isLoading,
    error,
    /** re-fetch — call after a master-data edit in the admin UI. */
    refresh: mutate,

    expenseCategories: md.expenseCategories,
    expenseCategoryTree: md.expenseCategoryTree,
    getExpenseTypes: (category) =>
      live ? md.expenseCategoryTree?.[category] || [] : literalExpenseTypes(category),

    directPaymentCategories: md.directPaymentCategories,
    payableExpenseCategories: md.payableExpenseCategories,
    payableExpenseDropdownCategories: md.payableExpenseDropdownCategories,

    accounts: md.accounts,
    furtherModes: md.furtherModes,
    receiptModes: md.receiptModes,

    methodLabels: md.methodLabels,
    methodLabel: (v) => md.methodLabels?.[v] || METHOD_LABELS[v] || v,
    nonCashMethods: md.nonCashMethods,
    unsettledMethods: md.unsettledMethods,

    getMethodOptions: (category, { forEdit = false } = {}) => {
      const slot = md.methodOptions?.[category];
      if (slot) return forEdit ? slot.edit : slot.new;
      return literalMethodOptions(category, { forEdit });
    },
    withLegacyMethod,

    getBankRoutingDefaults: (branch, transactionCategory, method) => {
      const cell = md.routing?.[branch]?.[transactionCategory]?.[method];
      if (cell) return { ...cell };
      return live
        ? { receiptMode: "", furtherMode: "" }
        : literalRouting(branch, transactionCategory, method);
    },
    getExpenseFurtherModeDefault,

    tdsTaxTypes: md.tdsTaxTypes || TDS_TAX_TYPES,
  };
}
