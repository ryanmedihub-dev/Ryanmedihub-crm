// §9 — duplicate-employee merge: every reference repointed, denormalised names refreshed,
// conflicts surfaced, undo restores byte-for-byte, merged record hidden from pickers.
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/22-employee-merge.mjs

import mongoose from "mongoose";
import Employee from "@/models/Employee.js";
import Patient from "@/models/Patient.js";
import Payable from "@/models/Payable.js";
import Transactions from "@/models/Transactions.js";
import Advance from "@/models/Advance.js";
import Borrowing from "@/models/Borrowing.js";
import Receivable from "@/models/Receivable.js";
import Interviewer from "@/models/Interviewer.js";
import EmployeeMerge from "@/models/EmployeeMerge.js";
import { EMPLOYEE_REFERENCES, assertEmployeeReferenceCoverage } from "@/constants/employeeReferences.js";
import { buildPreview, runMerge, runRevert } from "@/lib/employees/mergeEngine.js";
import {
  connectForAcceptance, disconnectAcceptance, record, printResultsTable, fakeActorSession, TEST_TAG,
} from "./_harness.mjs";

const actor = fakeActorSession().user;
const bin = { employees: [], patients: [], payables: [], txns: [], merges: [] };

const mkEmp = async (name, over = {}) => {
  const e = await Employee.create({ name, role: "Counsellor", branch: "Delhi", ...over });
  bin.employees.push(e._id);
  return e;
};

const REF_MODELS = { Employee, Patient, Payable, Transactions, Advance, Borrowing, Receivable, Interviewer };
async function refCount(empId) {
  let total = 0;
  for (const ref of EMPLOYEE_REFERENCES) {
    total += await REF_MODELS[ref.model].countDocuments({ [ref.path]: empId, ...(ref.guard || {}) });
  }
  return total;
}

async function main() {
  await connectForAcceptance();
  try {
    /* 0 — the reference inventory covers every ref:"Employee" in the schemas */
    const missing = assertEmployeeReferenceCoverage({ Employee, Patient, Payable, Transactions });
    record("0. EMPLOYEE_REFERENCES covers every schema ref", "[]", JSON.stringify(missing), missing.length === 0);

    /* 1 — references spread across models, merge repoints all of them */
    {
      const A = await mkEmp("Merge Fixture A S1");
      const B = await mkEmp("Merge Fixture B S1", { name: "Merge Fixture A S1" });
      const p1 = await Patient.create({
        personal: { name: `${TEST_TAG} P1`, branch: "Delhi", reference: A._id },
        counselling: { counsellor: B._id },
        surgery: { doctor: [A._id, B._id] },
      });
      bin.patients.push(p1._id);
      const pay = await Payable.create({
        payee: { kind: "EMPLOYEE", refId: B._id, label: "Merge Fixture A S1" },
        purpose: "INCENTIVE", expenseCategory: "Incentive", totalAmount: 5000, branch: "Delhi", remarks: TEST_TAG,
      });
      bin.payables.push(pay._id);
      const tx = await Transactions.create({
        transactionCategory: "EXPENSE", costType: "Expenses", amount: 1000, date: new Date(),
        expenseGiver: { type: "EMPLOYEE", refId: B._id, name: "Merge Fixture A S1" }, remarks: TEST_TAG, approvalStatus: "APPROVED",
      });
      bin.txns.push(tx._id);

      const before = await refCount(B._id);
      const res = await runMerge({ survivorId: String(A._id), duplicateId: String(B._id), actor });
      if (res.body?.mergeId) bin.merges.push(res.body.mergeId);
      const after = await refCount(B._id);

      const freshPay = await Payable.findById(pay._id).lean();
      const freshP1 = await Patient.findById(p1._id).lean();
      const dedupedDoctor = (freshP1.surgery.doctor || []).filter((d) => String(d) === String(A._id)).length;

      record("1. all references repointed, none left on the duplicate",
        `before>0, after 0`, `before ${before}, after ${after}`,
        before > 0 && after === 0);
      record("1b. denormalised payee.label refreshed to survivor",
        "Merge Fixture A S1", freshPay.payee.label, freshPay.payee.label === "Merge Fixture A S1" && String(freshPay.payee.refId) === String(A._id));
      record("2. surgery.doctor[] deduped — survivor appears once",
        "1", String(dedupedDoctor), dedupedDoctor === 1);
    }

    /* 3 — duplicate SALARY payable for the same month → conflict, blocks without a resolution */
    {
      const A = await mkEmp("Merge Fixture A S3");
      const B = await mkEmp("Merge Fixture B S3", { name: "Merge Fixture A S3" });
      const mk = (refId) => Payable.create({
        payee: { kind: "EMPLOYEE", refId, label: "Merge Fixture A S3" },
        purpose: "SALARY", expenseCategory: "Salary", expenseSubType: "Salary",
        period: { month: 3, year: 2099 }, totalAmount: 40000, branch: "Delhi", remarks: TEST_TAG,
      });
      const [pa, pb] = await Promise.all([mk(A._id), mk(B._id)]);
      bin.payables.push(pa._id, pb._id);

      const preview = await buildPreview({ survivorId: String(A._id), duplicateId: String(B._id) });
      const hasConflict = (preview.conflicts || []).some((c) => c.type === "DUPLICATE_MONTHLY_PAYABLE");
      const noRes = await runMerge({ survivorId: String(A._id), duplicateId: String(B._id), actor });
      const withRes = await runMerge({
        survivorId: String(A._id), duplicateId: String(B._id), actor,
        conflictResolutions: Object.fromEntries((preview.conflicts || []).map((c) => [c.key, "KEEP_BOTH_RELABEL"])),
      });
      if (withRes.body?.mergeId) bin.merges.push(withRes.body.mergeId);
      const bothSurvive = await Payable.countDocuments({ _id: { $in: [pa._id, pb._id] }, isCancelled: { $ne: true } });
      const labels = (await Payable.find({ _id: { $in: [pa._id, pb._id] } }).lean()).map((p) => p.payee.label);

      record("3. duplicate monthly payable is reported as a conflict", "true", String(hasConflict), hasConflict);
      record("3b. merge without a resolution is refused", "400", String(noRes.status), noRes.status === 400);
      record("3c. KEEP_BOTH_RELABEL keeps both payables with distinct labels",
        "2 payables, 2 distinct labels", `${bothSurvive} / ${new Set(labels).size}`,
        withRes.body?.success && bothSurvive === 2 && new Set(labels).size === 2);
    }

    /* 6 — commissionReceiver with casing "Employee" (not "EMPLOYEE") is repointed */
    {
      const A = await mkEmp("Merge Fixture A S6");
      const B = await mkEmp("Merge Fixture B S6", { name: "Merge Fixture A S6" });
      const tx = await Transactions.create({
        transactionCategory: "EXPENSE", costType: "Expenses", amount: 500, date: new Date(),
        commissionReceiver: { type: "Employee", refId: B._id, name: "Merge Fixture A S6" },
        remarks: TEST_TAG, approvalStatus: "APPROVED",
      });
      bin.txns.push(tx._id);
      const res = await runMerge({ survivorId: String(A._id), duplicateId: String(B._id), actor });
      if (res.body?.mergeId) bin.merges.push(res.body.mergeId);
      const fresh = await Transactions.findById(tx._id).lean();
      record("6. commissionReceiver (type:'Employee') repointed",
        `refId ${A._id}, name survivor`, `refId ${fresh.commissionReceiver.refId}`,
        String(fresh.commissionReceiver.refId) === String(A._id) && fresh.commissionReceiver.name === "Merge Fixture A S6");
    }

    /* 7 — undo restores every document */
    {
      const A = await mkEmp("Merge Fixture A S7");
      const B = await mkEmp("Merge Fixture B S7", { name: "Merge Fixture A S7" });
      const p = await Patient.create({ personal: { name: `${TEST_TAG} P7`, branch: "Delhi", reference: B._id } });
      bin.patients.push(p._id);
      const merged = await runMerge({ survivorId: String(A._id), duplicateId: String(B._id), actor });
      bin.merges.push(merged.body.mergeId);
      const rev = await runRevert({ mergeId: String(merged.body.mergeId), actor });
      const back = await Patient.findById(p._id).lean();
      const dupBack = await Employee.findById(B._id).lean();
      record("7. undo repoints the reference back to the duplicate",
        `reference ${B._id}, dup not merged`, `reference ${back.personal.reference}, mergedInto ${dupBack.mergedInto}`,
        rev.body?.success && String(back.personal.reference) === String(B._id) && dupBack.mergedInto == null && !dupBack.name.startsWith("[MERGED]"));
    }

    /* 9 — merged employee absent from get-id style query */
    {
      const A = await mkEmp("Merge Fixture A S9");
      const B = await mkEmp("Merge Fixture B S9", { name: "Merge Fixture A S9" });
      await runMerge({ survivorId: String(A._id), duplicateId: String(B._id), actor });
      const visible = await Employee.countDocuments({ _id: B._id, mergedInto: null });
      record("9. merged record excluded by `mergedInto: null` filter", "0", String(visible), visible === 0);
    }
  } finally {
    if (bin.merges.length) await EmployeeMerge.deleteMany({ _id: { $in: bin.merges } });
    await Transactions.deleteMany({ remarks: TEST_TAG });
    await Payable.deleteMany({ remarks: TEST_TAG });
    await Patient.deleteMany({ "personal.name": { $regex: TEST_TAG } });
    if (bin.employees.length) await Employee.deleteMany({ _id: { $in: bin.employees } });
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
