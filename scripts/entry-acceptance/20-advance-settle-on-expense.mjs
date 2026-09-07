// §8 scenario 20 — advance settlement inside the expense entry flow.
// Exercises src/lib/entryCore/createExpenseWithSettlement.js end to end: tick an advance,
// book the net, and BOTH sides move (payable → Paid, advance receivable → Recovered).
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/20-advance-settle-on-expense.mjs

import mongoose from "mongoose";
import Employee from "@/models/Employee.js";
import Payable from "@/models/Payable.js";
import Advance from "@/models/Advance.js";
import Receivable from "@/models/Receivable.js";
import Transactions from "@/models/Transactions.js";
import { createPayable } from "@/lib/entryCore/createPayable.js";
import { createExpenseWithSettlement } from "@/lib/entryCore/createExpenseWithSettlement.js";
import { settleAdvanceAgainstPayable } from "@/lib/entryCore/settleAdvanceAgainstPayable.js";
import { buildPayableAggregationStages } from "@/lib/payableAggregation.js";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation.js";
import { totalSettledAmount } from "@/lib/advanceSettlements.js";
import {
  connectForAcceptance, disconnectAcceptance, record, printResultsTable, fakeActorSession, TEST_TAG,
} from "./_harness.mjs";

const session = fakeActorSession();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bin = { employees: [], payables: [], advances: [], receivables: [], txns: [] };

async function makeEmployee(name) {
  const e = await Employee.create({ name, role: "Agent", branch: "Delhi" });
  bin.employees.push(e._id);
  return e;
}

async function makeSalaryPayable(employee, month, amount) {
  const r = await createPayable({
    payload: {
      payee: { kind: "EMPLOYEE", refId: String(employee._id), label: employee.name },
      purpose: "SALARY", expenseCategory: "Salary", expenseSubType: "Salary",
      period: { month, year: 2100 }, totalAmount: amount, remarks: TEST_TAG,
    },
    session,
  });
  if (!r.data) throw new Error(`payable create failed: ${r.error}`);
  bin.payables.push(r.data._id);
  return r.data;
}

async function makeOutAdvance(employee, amount, { legacyPayableId, legacyAmount } = {}) {
  const rcv = await Receivable.create({
    payer: { kind: "EMPLOYEE", refId: employee._id, label: employee.name },
    purpose: "ADVANCE_RECOVERY", revenueCategory: "Advances",
    totalAmount: amount, branch: "Delhi",
    costAlreadyRecognised: false, excludeFromPnl: true, remarks: TEST_TAG,
  });
  bin.receivables.push(rcv._id);

  const adv = await Advance.create({
    direction: "OUT", account: "Cash Book", amount, branch: "Delhi",
    party: { kind: "EMPLOYEE", refId: employee._id, label: employee.name },
    receivableId: rcv._id, remarks: TEST_TAG,
    ...(legacyPayableId ? { settlesPayableId: legacyPayableId, settlesPayableAmount: legacyAmount } : {}),
  });
  bin.advances.push(adv._id);
  return adv;
}

async function payablePending(id) {
  const [agg] = await Payable.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(id) } }, ...buildPayableAggregationStages(Transactions.collection.name)]);
  return round2(agg?.pending ?? 0);
}
async function receivableNetPending(id) {
  const [agg] = await Receivable.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(id) } }, ...buildReceivableAggregationStages(Transactions.collection.name)]);
  return round2(agg?.netPending ?? agg?.pending ?? 0);
}
async function advanceRemaining(id) {
  const a = await Advance.findById(id).lean();
  return round2(a.amount - totalSettledAmount(a));
}

function expensePayload(employee, payable, adv, net, allocAmount) {
  return {
    expenseCategory: "Salary", expenseType: "Salary",
    expenseGiver: { type: "EMPLOYEE", refId: String(employee._id), name: employee.name },
    payableId: String(payable._id), amount: net,
    method: "cash", furtherMode: "Cash Book", branch: "Delhi",
    date: new Date().toISOString(), remarks: TEST_TAG,
    advanceSettlements: [{ advanceId: String(adv._id), amount: allocAmount }],
  };
}

async function main() {
  await connectForAcceptance();
  try {
    /* 1 — partial cover: 10k advance vs 45k salary → settle 10k, pay 35k */
    {
      const emp = await makeEmployee("EA Fixture S1");
      const pay = await makeSalaryPayable(emp, 1, 45000);
      const adv = await makeOutAdvance(emp, 10000);
      const res = await createExpenseWithSettlement({ payload: expensePayload(emp, pay, adv, 35000, 10000), session });
      if (res.data?.transaction?._id) bin.txns.push(res.data.transaction._id);
      const [pp, ar, rn] = [await payablePending(pay._id), await advanceRemaining(adv._id), await receivableNetPending(adv.receivableId)];
      record("1. partial cover — both sides land at 0",
        "payable 0 · advance 0 · receivable 0",
        `payable ${pp} · advance ${ar} · receivable ${rn}`,
        res.status === 201 && pp === 0 && ar === 0 && rn === 0);
    }

    /* 2 — full cover (net 0): no Transactions row, payable still closes */
    {
      const emp = await makeEmployee("EA Fixture S2");
      const pay = await makeSalaryPayable(emp, 2, 10000);
      const adv = await makeOutAdvance(emp, 10000);
      const res = await createExpenseWithSettlement({ payload: expensePayload(emp, pay, adv, 0, 10000), session });
      if (res.data?.transaction?._id) bin.txns.push(res.data.transaction._id);
      const txnCount = await Transactions.countDocuments({ payableId: pay._id });
      const pp = await payablePending(pay._id);
      record("2. full cover — no transaction, payable closed",
        "transaction=null, payable pending 0",
        `transaction=${res.data?.transaction ? "created (BUG)" : "null"}, payable ${pp}, txnCount ${txnCount}`,
        res.status === 201 && !res.data?.transaction && pp === 0 && txnCount === 0);
    }

    /* 3 — allocation > advance remaining → 400, nothing written */
    {
      const emp = await makeEmployee("EA Fixture S3");
      const pay = await makeSalaryPayable(emp, 3, 45000);
      const adv = await makeOutAdvance(emp, 10000);
      const res = await createExpenseWithSettlement({ payload: expensePayload(emp, pay, adv, 30000, 15000), session });
      const a = await Advance.findById(adv._id).lean();
      record("3. alloc > advance remaining → 400, no write",
        "4xx, advance has 0 settlement lines",
        `status ${res.status}: ${res.error} · lines ${a.settlements.length}`,
        res.status >= 400 && res.status < 500 && a.settlements.length === 0);
    }

    /* 4 — allocation > payable pending → 400, nothing written */
    {
      const emp = await makeEmployee("EA Fixture S4");
      const pay = await makeSalaryPayable(emp, 4, 10000);
      const adv = await makeOutAdvance(emp, 20000);
      const res = await createExpenseWithSettlement({ payload: expensePayload(emp, pay, adv, 0, 15000), session });
      const a = await Advance.findById(adv._id).lean();
      record("4. alloc > payable pending → 400, no write",
        "4xx, advance has 0 settlement lines",
        `status ${res.status}: ${res.error} · lines ${a.settlements.length}`,
        res.status >= 400 && res.status < 500 && a.settlements.length === 0);
    }

    /* 5 — advance for employee A on employee B's payable → 400 with the mismatch message */
    {
      const a = await makeEmployee("EA Fixture S5-A");
      const b = await makeEmployee("EA Fixture S5-B");
      const payB = await makeSalaryPayable(b, 5, 45000);
      const advA = await makeOutAdvance(a, 10000);
      const res = await createExpenseWithSettlement({ payload: expensePayload(b, payB, advA, 35000, 10000), session });
      const lines = (await Advance.findById(advA._id).lean()).settlements.length;
      record("5. cross-party advance → 400 mismatch",
        "4xx mentioning 'cannot settle a payable for'",
        `status ${res.status}: ${res.error} · lines ${lines}`,
        res.status === 400 && /cannot settle a payable for/i.test(res.error || "") && lines === 0);
    }

    /* 6 — expense creation forced to fail after a good settle → advance rolled back to 0 lines */
    {
      const emp = await makeEmployee("EA Fixture S6");
      const pay = await makeSalaryPayable(emp, 6, 45000);
      const adv = await makeOutAdvance(emp, 10000);
      const payload = expensePayload(emp, pay, adv, 35000, 10000);
      payload.expenseGiver = { type: "EMPLOYEE", name: "no refId" }; // createExpense will reject this
      const res = await createExpenseWithSettlement({ payload, session });
      const [a, pp] = [await Advance.findById(adv._id).lean(), await payablePending(pay._id)];
      record("6. expense fails after settle → transaction aborted",
        "4xx, advance 0 lines, payable pending unchanged (45000)",
        `status ${res.status} · lines ${a.settlements.length} · payable ${pp}`,
        res.status >= 400 && a.settlements.length === 0 && pp === 45000);
    }

    /* 7 — advance already settled 4k elsewhere → remaining 6k, settling 7k rejected */
    {
      const emp = await makeEmployee("EA Fixture S7");
      const other = await makeSalaryPayable(emp, 7, 45000);
      const target = await makeSalaryPayable(emp, 8, 45000);
      const adv = await makeOutAdvance(emp, 10000);
      await settleAdvanceAgainstPayable({ advanceId: String(adv._id), payableId: String(other._id), amount: 4000, note: TEST_TAG, session });
      const remaining = await advanceRemaining(adv._id);
      const res = await createExpenseWithSettlement({ payload: expensePayload(emp, target, adv, 38000, 7000), session });
      record("7. partly-settled advance — remaining 6k, 7k rejected",
        "remaining 6000, and settling 7000 → 4xx",
        `remaining ${remaining} · status ${res.status}: ${res.error}`,
        remaining === 6000 && res.status >= 400 && res.status < 500);
    }

    /* 8 — legacy settlesPayableId pair → remaining still right, new settle folds it into the array */
    {
      const emp = await makeEmployee("EA Fixture S8");
      const legacyTarget = await makeSalaryPayable(emp, 9, 45000);
      const newTarget = await makeSalaryPayable(emp, 10, 45000);
      const adv = await makeOutAdvance(emp, 10000, { legacyPayableId: legacyTarget._id, legacyAmount: 3000 });
      const remainingBefore = await advanceRemaining(adv._id); // 10000 - 3000
      const res = await createExpenseWithSettlement({ payload: expensePayload(emp, newTarget, adv, 43000, 2000), session });
      if (res.data?.transaction?._id) bin.txns.push(res.data.transaction._id);
      const a = await Advance.findById(adv._id).lean();
      record("8. legacy pair — read correct, folded into settlements[] on next settle",
        "remaining 7000 before · settlesPayableId null after · 2 array lines",
        `remaining ${remainingBefore} · settlesPayableId ${a.settlesPayableId} · lines ${a.settlements.length}`,
        remainingBefore === 7000 && a.settlesPayableId == null && a.settlements.length === 2);
    }
  } finally {
    if (bin.txns.length) await Transactions.deleteMany({ _id: { $in: bin.txns } });
    await Transactions.deleteMany({ remarks: TEST_TAG });
    if (bin.advances.length) await Advance.deleteMany({ _id: { $in: bin.advances } });
    if (bin.receivables.length) await Receivable.deleteMany({ _id: { $in: bin.receivables } });
    if (bin.payables.length) await Payable.deleteMany({ _id: { $in: bin.payables } });
    if (bin.employees.length) await Employee.deleteMany({ _id: { $in: bin.employees } });
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
