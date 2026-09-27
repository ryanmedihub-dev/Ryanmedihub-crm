

import dbConnect from "@/lib/db";
import MasterData from "@/models/MasterData";
import BankRoutingRule from "@/models/BankRoutingRule";

import {
  EXPENSE_CATEGORY_TREE as LIT_TREE,
  EXPENSE_CATEGORIES as LIT_CATS,
  PAYABLE_EXPENSE_CATEGORIES as LIT_PAYABLE_CATS,
  PAYABLE_EXPENSE_DROPDOWN_CATEGORIES as LIT_PAYABLE_DROPDOWN,
  DIRECT_PAYMENT_CATEGORIES as LIT_DIRECT,
} from "@/constants/expenseCategories";
import {
  ACCOUNTS as LIT_ACCOUNTS,
  RECEIPT_MODES as LIT_RECEIPT_MODES,
  NON_CASH_METHODS as LIT_NON_CASH,
  UNSETTLED_METHODS as LIT_UNSETTLED,
} from "@/constants/bankRouting";
import { METHOD_LABELS as LIT_METHOD_LABELS } from "@/constants/paymentMethods";

const TTL_MS = 60_000;

let cache = null; 
let inflight = null;

async function load() {
  await dbConnect();
  const [rows, rules] = await Promise.all([
    MasterData.find({}).lean(),
    BankRoutingRule.find({}).lean(),
  ]);

  const byKind = new Map();
  for (const r of rows) {
    if (!byKind.has(r.kind)) byKind.set(r.kind, []);
    byKind.get(r.kind).push(r);
  }
  for (const arr of byKind.values()) {
    arr.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        String(a.value).localeCompare(String(b.value)),
    );
  }

  const routing = new Map();
  for (const rule of rules) {
    if (rule.isActive === false) continue;
    routing.set(`${rule.branch}|${rule.transactionCategory}|${rule.method}`, {
      receiptMode: rule.receiptMode ?? "",
      furtherMode: rule.furtherMode ?? "",
    });
  }

  rebuildSnapshot(byKind);
  return { byKind, routing, loadedAt: Date.now() };
}

async function fresh() {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = load()
    .then((c) => {
      cache = c;
      inflight = null;
      return c;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

export function invalidate() {
  cache = null;
  inflight = null;
  fresh().catch(() => {}); 
}

function bySortOrder(a, b) {
  return (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.value).localeCompare(String(b.value))
  );
}

function mergeTemplate(activeValues, template) {
  const activeSet = new Set(activeValues);
  const templateSet = new Set(template);
  return [
    ...template.filter((v) => activeSet.has(v)),
    ...activeValues.filter((v) => !templateSet.has(v)),
  ];
}

const LITERAL_SNAPSHOT = {
  expenseCategories: [...LIT_CATS],
  expenseTree: LIT_TREE,
  directPaymentCategories: [...LIT_DIRECT],
  payableExpenseCategories: [...LIT_PAYABLE_CATS],
  payableExpenseDropdownCategories: [...LIT_PAYABLE_DROPDOWN],
  accounts: [...LIT_ACCOUNTS],
  receiptModes: [...LIT_RECEIPT_MODES],
  nonCashMethods: [...LIT_NON_CASH],
  unsettledMethods: [...LIT_UNSETTLED],
  methodLabels: { ...LIT_METHOD_LABELS },
};

let snap = LITERAL_SNAPSHOT;

function rebuildSnapshot(byKind) {
  const cats = (byKind.get("EXPENSE_CATEGORY") || []).filter((r) => r.isActive !== false);
  const subs = (byKind.get("EXPENSE_SUBTYPE") || []).filter((r) => r.isActive !== false);
  const allMethods = byKind.get("PAYMENT_METHOD") || []; 
  const methods = allMethods.filter((r) => r.isActive !== false);
  const accounts = (byKind.get("ACCOUNT") || []).filter((r) => r.isActive !== false);
  const receiptModes = (byKind.get("RECEIPT_MODE") || []).filter((r) => r.isActive !== false);

  if (!cats.length && !methods.length && !accounts.length && !receiptModes.length) {
    snap = LITERAL_SNAPSHOT; 
    return;
  }

  const catValues = cats.map((r) => r.value);
  const tree = {};
  for (const c of catValues) tree[c] = [];
  for (const s of subs.slice().sort(bySortOrder)) {
    (tree[s.parent] ??= []).push(s.value);
  }
  for (const c of Object.keys(tree)) tree[c] = mergeTemplate(tree[c], LIT_TREE[c] || []);

  const methodLabels = { ...LIT_METHOD_LABELS };
  for (const m of allMethods) methodLabels[m.value] = m.label;

  const pick = (rows, tmpl) => (rows.length ? mergeTemplate(rows.map((r) => r.value), tmpl) : [...tmpl]);

  snap = {
    expenseCategories: pick(cats, LIT_CATS),
    expenseTree: cats.length ? tree : LIT_TREE,
    directPaymentCategories: pick(
      cats.filter((r) => r.settlementType === "DIRECT"),
      LIT_DIRECT,
    ),
    payableExpenseCategories: pick(
      cats.filter((r) => r.settlementType === "PAYABLE"),
      LIT_PAYABLE_CATS,
    ),
    payableExpenseDropdownCategories: pick(
      cats.filter((r) => r.settlementType === "PAYABLE" && !r.ownedElsewhere),
      LIT_PAYABLE_DROPDOWN,
    ),
    accounts: pick(accounts, LIT_ACCOUNTS),
    receiptModes: pick(receiptModes, LIT_RECEIPT_MODES),
    nonCashMethods: methods.length
      ? methods.filter((r) => r.isNonCash).map((r) => r.value)
      : [...LIT_NON_CASH],
    unsettledMethods: methods.length
      ? methods.filter((r) => r.isUnsettled).map((r) => r.value)
      : [...LIT_UNSETTLED],
    methodLabels,
  };
}

function keepWarm() {
  fresh().catch(() => {}); 
}

export function expenseCategoriesSync() {
  keepWarm();
  return snap.expenseCategories;
}
export function expenseTypesSync(category) {
  keepWarm();
  return snap.expenseTree[category] || [];
}
export function directPaymentCategoriesSync() {
  keepWarm();
  return snap.directPaymentCategories;
}
export function payableExpenseCategoriesSync() {
  keepWarm();
  return snap.payableExpenseCategories;
}
export function payableExpenseDropdownCategoriesSync() {
  keepWarm();
  return snap.payableExpenseDropdownCategories;
}
export function accountsSync() {
  keepWarm();
  return snap.accounts;
}
export function receiptModesSync() {
  keepWarm();
  return snap.receiptModes;
}
export function nonCashMethodsSync() {
  keepWarm();
  return snap.nonCashMethods;
}
export function unsettledMethodsSync() {
  keepWarm();
  return snap.unsettledMethods;
}
export function methodLabelsSync() {
  keepWarm();
  return snap.methodLabels;
}

export async function warmup() {
  await fresh();
}

export async function getRows(kind, { includeRetired = true } = {}) {
  const c = await fresh();
  const rows = c.byKind.get(kind) || [];
  return includeRetired ? rows : rows.filter((r) => r.isActive !== false);
}

export async function getActiveValues(kind) {
  return (await getRows(kind, { includeRetired: false })).map((r) => r.value);
}

export async function getActiveValueSet(kind) {
  return new Set(await getActiveValues(kind));
}

export async function getKnownValueSet(kind) {
  return new Set((await getRows(kind)).map((r) => r.value));
}

export async function isEmpty(kind) {
  return (await getRows(kind)).length === 0;
}

export async function getLabelMap(kind) {
  const out = {};
  for (const r of await getRows(kind)) out[r.value] = r.label;
  return out;
}

export async function getExpenseCategories() {
  return getActiveValues("EXPENSE_CATEGORY");
}

export async function getExpenseSubTypes(categoryValue) {
  const rows = await getRows("EXPENSE_SUBTYPE", { includeRetired: false });
  return rows.filter((r) => r.parent === categoryValue).map((r) => r.value);
}

export async function getCategoryMeta(categoryValue) {
  const row = (await getRows("EXPENSE_CATEGORY")).find((r) => r.value === categoryValue);
  if (!row) return null;
  return {
    settlementType: row.settlementType ?? null,
    ownedElsewhere: !!row.ownedElsewhere,
    payablePurpose: row.payablePurpose ?? null,
    isActive: row.isActive !== false,
  };
}

export async function getDirectPaymentCategories() {
  return (await getRows("EXPENSE_CATEGORY", { includeRetired: false }))
    .filter((r) => r.settlementType === "DIRECT")
    .map((r) => r.value);
}

export async function getPayableExpenseCategories() {
  return (await getRows("EXPENSE_CATEGORY", { includeRetired: false }))
    .filter((r) => r.settlementType === "PAYABLE")
    .map((r) => r.value);
}

export async function getPayableExpenseDropdownCategories() {
  return (await getRows("EXPENSE_CATEGORY", { includeRetired: false }))
    .filter((r) => r.settlementType === "PAYABLE" && !r.ownedElsewhere)
    .map((r) => r.value);
}

export async function getMethodRows() {
  return getRows("PAYMENT_METHOD", { includeRetired: false });
}

export async function getNonCashMethods() {
  return (await getRows("PAYMENT_METHOD")).filter((r) => r.isNonCash).map((r) => r.value);
}

export async function getUnsettledMethods() {
  return (await getRows("PAYMENT_METHOD")).filter((r) => r.isUnsettled).map((r) => r.value);
}

export async function getMethodLabels() {
  return getLabelMap("PAYMENT_METHOD");
}

export async function getReceiptModes() {
  return getActiveValues("RECEIPT_MODE");
}

export async function getAccounts() {
  return getActiveValues("ACCOUNT");
}

export async function getRoutingRule(branch, transactionCategory, method) {
  const c = await fresh();
  return c.routing.get(`${branch}|${transactionCategory}|${method}`) || null;
}

export async function isRoutingEmpty() {
  const c = await fresh();
  return c.routing.size === 0;
}

export async function getRoutingMap() {
  const c = await fresh();
  const out = {};
  for (const [key, val] of c.routing) {
    const [branch, category, method] = key.split("|");
    ((out[branch] ??= {})[category] ??= {})[method] = { ...val };
  }
  return out;
}
