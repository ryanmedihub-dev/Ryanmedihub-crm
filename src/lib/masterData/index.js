// In-memory cache over the MasterData + BankRoutingRule collections. Every route and form that
// used to read the hard-coded constants now reads through here, so a DB round-trip per request
// would be a regression versus the arrays it replaces — hence the cache.
//
// Lifecycle:
//   - Loaded once per lambda instance, then reused for TTL_MS.
//   - invalidate() is called by the master-data mutation API immediately after every write, so
//     the instance that made the change sees it at once.
//   - Serverless caveat: other instances keep their own cache and only converge after the TTL.
//     A change can therefore take up to ~60s to appear everywhere. Cross-instance invalidation
//     would need Redis and is deliberately out of scope.
//
// This module is the data layer only: getters return raw DB-derived values (active list in
// sortOrder, or [] / null when nothing is seeded). Template ordering and the
// empty-collection fallback to the literal arrays live in the constants files that wrap these.

import dbConnect from "@/lib/db";
import MasterData from "@/models/MasterData";
import BankRoutingRule from "@/models/BankRoutingRule";

// Literal constants — used only as (a) the ordering template and (b) the cold-start / empty-
// collection fallback for the synchronous snapshot below. These modules are pure data with no
// imports, so pulling them in here creates no cycle and no client bundle leaks (nothing on the
// client imports @/lib/masterData).
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

let cache = null; // { byKind: Map<kind, row[]>, routing: Map<"b|c|m", {receiptMode,furtherMode}>, loadedAt }
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

/** Drop the cache. Called by the master-data mutation API after every write. */
export function invalidate() {
  cache = null;
  inflight = null;
  fresh().catch(() => {}); // eagerly rebuild so the sync snapshot converges without waiting a request
}

// ---------------------------------------------------------------------------------------------
// Synchronous snapshot
//
// Server code that used to `import { ACCOUNTS } from "@/constants/bankRouting"` and use it
// synchronously (aggregation $match fragments, stage builders, route-level guards) reads these
// instead. The snapshot is rebuilt on every cache load, so it is at most TTL_MS stale — the
// same eventual-consistency contract as the async getters. Before the first load it holds the
// literal constants, so a cold lambda still behaves exactly like today.
// ---------------------------------------------------------------------------------------------

function bySortOrder(a, b) {
  return (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.value).localeCompare(String(b.value))
  );
}

// Keep the template's order, drop entries no longer active, append new active values.
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
  const allMethods = byKind.get("PAYMENT_METHOD") || []; // retired kept for label lookups
  const methods = allMethods.filter((r) => r.isActive !== false);
  const accounts = (byKind.get("ACCOUNT") || []).filter((r) => r.isActive !== false);
  const receiptModes = (byKind.get("RECEIPT_MODE") || []).filter((r) => r.isActive !== false);

  if (!cats.length && !methods.length && !accounts.length && !receiptModes.length) {
    snap = LITERAL_SNAPSHOT; // nothing seeded — degrade to today's behaviour
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
  fresh().catch(() => {}); // fire-and-forget; the caller gets the current snapshot immediately
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

/** Force a load now (e.g. on server start). Safe to call repeatedly. */
export async function warmup() {
  await fresh();
}

// ---------------------------------------------------------------------------------------------
// Row-level access
// ---------------------------------------------------------------------------------------------

/** All rows for a kind (active + retired), already sorted by sortOrder. */
export async function getRows(kind, { includeRetired = true } = {}) {
  const c = await fresh();
  const rows = c.byKind.get(kind) || [];
  return includeRetired ? rows : rows.filter((r) => r.isActive !== false);
}

/** Active `value` strings for a kind, in sortOrder. */
export async function getActiveValues(kind) {
  return (await getRows(kind, { includeRetired: false })).map((r) => r.value);
}

/** Set of active `value` strings — for O(1) membership checks in the validator. */
export async function getActiveValueSet(kind) {
  return new Set(await getActiveValues(kind));
}

/** Set of every known `value` (active + retired) — the validator's update-by-query fallback. */
export async function getKnownValueSet(kind) {
  return new Set((await getRows(kind)).map((r) => r.value));
}

/** true when nothing is seeded for this kind — callers fall back to their literal arrays. */
export async function isEmpty(kind) {
  return (await getRows(kind)).length === 0;
}

/** { value: label } for a kind, including retired rows, so reports keep rendering old labels. */
export async function getLabelMap(kind) {
  const out = {};
  for (const r of await getRows(kind)) out[r.value] = r.label;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Expense heads
// ---------------------------------------------------------------------------------------------

/** Active EXPENSE_CATEGORY values, in sortOrder. */
export async function getExpenseCategories() {
  return getActiveValues("EXPENSE_CATEGORY");
}

/** Active EXPENSE_SUBTYPE values under a category, in sortOrder. */
export async function getExpenseSubTypes(categoryValue) {
  const rows = await getRows("EXPENSE_SUBTYPE", { includeRetired: false });
  return rows.filter((r) => r.parent === categoryValue).map((r) => r.value);
}

/** { settlementType, ownedElsewhere, payablePurpose } for one category, or null if unknown. */
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

/** Active category values whose settlementType is "DIRECT" (sortOrder). */
export async function getDirectPaymentCategories() {
  return (await getRows("EXPENSE_CATEGORY", { includeRetired: false }))
    .filter((r) => r.settlementType === "DIRECT")
    .map((r) => r.value);
}

/** Active category values whose settlementType is "PAYABLE" (sortOrder). */
export async function getPayableExpenseCategories() {
  return (await getRows("EXPENSE_CATEGORY", { includeRetired: false }))
    .filter((r) => r.settlementType === "PAYABLE")
    .map((r) => r.value);
}

/** PAYABLE categories that aren't raised through their own flow (ownedElsewhere = false). */
export async function getPayableExpenseDropdownCategories() {
  return (await getRows("EXPENSE_CATEGORY", { includeRetired: false }))
    .filter((r) => r.settlementType === "PAYABLE" && !r.ownedElsewhere)
    .map((r) => r.value);
}

// ---------------------------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------------------------

/** Active PAYMENT_METHOD rows (value, label, appliesTo, isNonCash, isUnsettled, isSystem). */
export async function getMethodRows() {
  return getRows("PAYMENT_METHOD", { includeRetired: false });
}

export async function getNonCashMethods() {
  return (await getRows("PAYMENT_METHOD")).filter((r) => r.isNonCash).map((r) => r.value);
}

export async function getUnsettledMethods() {
  return (await getRows("PAYMENT_METHOD")).filter((r) => r.isUnsettled).map((r) => r.value);
}

/** { value: label } for methods, including retired, so transaction lists keep their labels. */
export async function getMethodLabels() {
  return getLabelMap("PAYMENT_METHOD");
}

// ---------------------------------------------------------------------------------------------
// Receipt modes / accounts
// ---------------------------------------------------------------------------------------------

export async function getReceiptModes() {
  return getActiveValues("RECEIPT_MODE");
}

export async function getAccounts() {
  return getActiveValues("ACCOUNT");
}

// ---------------------------------------------------------------------------------------------
// Bank routing
// ---------------------------------------------------------------------------------------------

/**
 * The seeded routing rule for a cell, or null if none exists. Callers (bankRouting.js) turn a
 * null into the blank pre-fill { receiptMode: "", furtherMode: "" } — the intended behaviour
 * for the collab branches, which deliberately have no rules.
 */
export async function getRoutingRule(branch, transactionCategory, method) {
  const c = await fresh();
  return c.routing.get(`${branch}|${transactionCategory}|${method}`) || null;
}

/** true when no routing rules are seeded at all — bankRouting.js then uses its literal map. */
export async function isRoutingEmpty() {
  const c = await fresh();
  return c.routing.size === 0;
}

/** The whole active routing table as { [branch]: { [category]: { [method]: {receiptMode,furtherMode} } } }. */
export async function getRoutingMap() {
  const c = await fresh();
  const out = {};
  for (const [key, val] of c.routing) {
    const [branch, category, method] = key.split("|");
    ((out[branch] ??= {})[category] ??= {})[method] = { ...val };
  }
  return out;
}
