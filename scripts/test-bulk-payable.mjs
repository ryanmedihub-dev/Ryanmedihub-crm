// Pure-function tests for the bulk-Payable upload mapper — makes ZERO database calls.
// (--env-file is only so importing @/lib/uploads/resolveRefs, which pulls in the models,
//  doesn't trip src/lib/db.js's "set MONGODB_URI" guard at import time. Nothing connects.)
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/test-bulk-payable.mjs

import assert from "node:assert/strict";
import { computeTaxBreakdown } from "@/lib/taxMath.js";
import {
  PAYABLE_KIND_VALUES,
  PAYABLE_PURPOSE_VALUES,
} from "@/models/Payable.js";
import { EXPENSE_CATEGORY_TREE, TDS_TAX_TYPES } from "@/constants/expenseCategories.js";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches.js";
import {
  PURPOSE_TO_CATEGORY,
  parsePayableRowFormat,
  parseAmount,
  parseExcelDate,
  monthlyDupKey,
  defaultKindForPurpose,
  deriveRequirements,
} from "@/lib/uploads/payableRowMapper.js";
import { resolvePayeeForRow } from "@/lib/uploads/resolveRefs.js";

const ctx = {
  purposeValues: PAYABLE_PURPOSE_VALUES,
  kindValues: PAYABLE_KIND_VALUES,
  branches: ALL_BRANCHES,
  collabBranches: COLLAB_BRANCHES,
  tdsTypes: TDS_TAX_TYPES,
  allCategories: [...new Set(Object.values(PURPOSE_TO_CATEGORY))],
  subTypesFor: (c) => EXPENSE_CATEGORY_TREE[c] || [],
};

let pass = 0;
let fail = 0;
const test = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
};

/* 1 — vendor bill 100000 + 18% GST + 10% TDS */
test("vendor bill: 100000 base, GST 18%, TDS 10%", () => {
  const t = computeTaxBreakdown({
    baseAmount: 100000,
    includeGST: true,
    gstRate: 18,
    includeTDS: true,
    tdsRate: 10,
  });
  assert.equal(t.gstAmount, 18000);
  assert.equal(t.invoiceTotal, 118000);
  assert.equal(t.tdsAmount, 10000);
  assert.equal(t.vendorPayable, 108000); // saved totalAmount
  assert.ok(t.tdsAmount > 0 && t.tdsAmount < t.invoiceTotal); // -> createsTdsPayable
});

/* 2 — salary with no month/year */
test("salary without periodMonth/periodYear -> error mentions periodMonth", () => {
  const out = parsePayableRowFormat(
    { purpose: "SALARY", payeeLabel: "Ramesh Kumar", payeeRefId: "a".repeat(24), amount: "45000" },
    2,
    ctx,
  );
  assert.ok(out.errors.some((e) => /periodMonth|period/i.test(e)), out.errors.join(" | "));
});

/* 3 — two identical SALARY rows collide on the monthly key */
test("identical SALARY/employee/period -> same monthly dup key (2nd row is a duplicate)", () => {
  const mk = (row) =>
    monthlyDupKey({
      kind: "EMPLOYEE",
      refId: "emp1",
      label: "Ramesh Kumar",
      purpose: "SALARY",
      period: { month: 9, year: 2026 },
    });
  const seen = new Map();
  const rows = [mk(), mk()];
  const dupHits = [];
  rows.forEach((key, i) => {
    if (seen.has(key)) dupHits.push({ row: i + 2, firstRow: seen.get(key) });
    else seen.set(key, i + 2);
  });
  assert.equal(dupHits.length, 1);
  assert.equal(dupHits[0].firstRow, 2);
});

/* 3b — same vendor/month but different head (expenseSubType) -> NOT a duplicate */
test("RENT for one vendor, two different units, same month -> distinct keys", () => {
  const k1 = monthlyDupKey({
    kind: "VENDOR", refId: "v1", label: "Abdul Razzak", purpose: "RENT",
    expenseSubType: "Rent-CD Clinic", period: { month: 9, year: 2026 },
  });
  const k2 = monthlyDupKey({
    kind: "VENDOR", refId: "v1", label: "Abdul Razzak", purpose: "RENT",
    expenseSubType: "Rent-GD clinic", period: { month: 9, year: 2026 },
  });
  assert.notEqual(k1, k2);
});

/* 4 — VENDOR name matching two vendors -> error listing both ids, no auto-pick */
test("ambiguous vendor name -> error names both ObjectIds", () => {
  const byName = new Map([["apex surgicals", [
    { _id: "id_one", name: "Apex Surgicals", DealsIn: "OT" },
    { _id: "id_two", name: "Apex Surgicals", DealsIn: "Pharma" },
  ]]]);
  const refs = {
    vendors: { byName, byPhone: new Map(), byEmail: new Map(), byId: new Map() },
    employees: { byName: new Map(), byPhone: new Map(), byEmail: new Map(), byId: new Map() },
    patients: { byPhone: new Map() },
    existingPayables: [],
  };
  const parsed = {
    purpose: "PROFESSIONAL_EXPENSES",
    payeeLabel: "Apex Surgicals",
    payeeRefId: "",
    payeeLookup: "",
    declaredKind: "VENDOR",
    expenseSubType: "Legal Consultant Fee",
  };
  const res = resolvePayeeForRow(parsed, refs, { defaultKindForPurpose, deriveRequirements });
  const msg = res.errors.join(" | ");
  assert.ok(/id_one/.test(msg) && /id_two/.test(msg), msg);
  assert.notEqual(res.refId, "id_one"); // never auto-pick
});

/* 4b — RENT with explicit payeeKind VENDOR connects to the vendor */
test("RENT row with payeeKind=VENDOR resolves to that vendor (no RENT_UNIT override)", () => {
  const byName = new Map([["manjeet lodha", [{ _id: "vend_ml", name: "Manjeet Lodha", DealsIn: "Property" }]]]);
  const refs = {
    vendors: { byName, byPhone: new Map(), byEmail: new Map(), byId: new Map([["vend_ml", { _id: "vend_ml", name: "Manjeet Lodha" }]]) },
    employees: { byName: new Map(), byPhone: new Map(), byEmail: new Map(), byId: new Map() },
    patients: { byPhone: new Map() },
    existingPayables: [],
  };
  const parsed = {
    purpose: "RENT",
    payeeLabel: "Manjeet Lodha",
    payeeRefId: "",
    payeeLookup: "",
    declaredKind: "VENDOR",
    expenseSubType: "Rent-Backend Basement",
  };
  const res = resolvePayeeForRow(parsed, refs, { defaultKindForPurpose, deriveRequirements });
  assert.equal(res.kind, "VENDOR");
  assert.equal(res.refId, "vend_ml");
  assert.equal(res.errors.length, 0, res.errors.join(" | "));
});

/* 4c — RENT with no payeeKind still defaults to RENT_UNIT, no ref */
test("RENT row with blank payeeKind -> RENT_UNIT, no refId", () => {
  const refs = {
    vendors: { byName: new Map(), byPhone: new Map(), byEmail: new Map(), byId: new Map() },
    employees: { byName: new Map(), byPhone: new Map(), byEmail: new Map(), byId: new Map() },
    patients: { byPhone: new Map() },
    existingPayables: [],
  };
  const parsed = {
    purpose: "RENT",
    payeeLabel: "Rent-Backend Basement",
    payeeRefId: "",
    payeeLookup: "",
    declaredKind: null,
    expenseSubType: "Rent-Backend Basement",
  };
  const res = resolvePayeeForRow(parsed, refs, { defaultKindForPurpose, deriveRequirements });
  assert.equal(res.kind, "RENT_UNIT");
  assert.equal(res.refId, null);
});

/* 5 — day-first date parsing */
test('dueDate "03-09-2026" is 3 September 2026, not 9 March', () => {
  const d = parseExcelDate("03-09-2026");
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 8); // September (0-indexed)
  assert.equal(d.getUTCDate(), 3);
});

/* 6 — rupee/comma amount */
test('amount "₹1,20,000" -> 120000', () => {
  assert.equal(parseAmount("₹1,20,000"), 120000);
});

/* 7 — TDS >= invoice total is rejected */
test("includeTDS with tdsAmount >= invoice total -> flagged", () => {
  const t = computeTaxBreakdown({ baseAmount: 1000, includeTDS: true, tdsAmount: 5000 });
  assert.equal(t.invoiceTotal, 1000);
  assert.equal(t.tdsAmount, 5000);
  assert.ok(t.tdsAmount >= t.invoiceTotal); // the pipeline turns this into a row error
});

/* 8 — blank optionals stay absent, not "" / null */
test("blank optional columns -> period null, dueDate null, patient refs empty", () => {
  const out = parsePayableRowFormat(
    {
      purpose: "PROFESSIONAL_EXPENSES",
      payeeLabel: "Apex Surgicals",
      payeeRefId: "b".repeat(24),
      expenseSubType: "Legal Consultant Fee",
      amount: "5000",
    },
    2,
    ctx,
  );
  assert.equal(out.period, null); // pipeline maps this to `undefined` in the payload
  assert.equal(out.dueDate, null);
  assert.equal(out.relatedPatientId, "");
  assert.equal(out.relatedPatientPhone, "");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
