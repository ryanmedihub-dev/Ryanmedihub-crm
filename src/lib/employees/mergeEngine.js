import crypto from "crypto";
import mongoose from "mongoose";

import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import Payable, { MONTHLY_PAYABLE_PURPOSES } from "@/models/Payable";
import Advance from "@/models/Advance";
import Borrowing from "@/models/Borrowing";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import EmployeeMerge from "@/models/EmployeeMerge";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { settledTotalExpr } from "@/lib/advanceSettlements";
import { checkPeriodLock } from "@/lib/periodLock";
import { EMPLOYEE_REFERENCES } from "@/constants/employeeReferences";

const MODELS = { Employee, Patient, Interviewer, Payable, Advance, Borrowing, Receivable, Transactions };
const getModel = (name) => {
  const m = MODELS[name];
  if (!m) throw new Error(`mergeEngine: no model registered for "${name}"`);
  return m;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sameId = (a, b) => String(a) === String(b);

const FIELD_KEYS = ["name", "phone", "email", "employeeId", "role", "branch", "isactive", "salaryStructure", "incentiveRate"];

const pathCond = (ref, empId) => ({ [ref.path]: empId, ...(ref.guard || {}) });

async function countReferences(empId, session) {
  const rows = await Promise.all(
    EMPLOYEE_REFERENCES.map(async (ref) => {
      const Model = getModel(ref.model);
      const cond = pathCond(ref, empId);
      const [count, sample] = await Promise.all([
        Model.countDocuments(cond).session(session || null),
        Model.find(cond)
          .select(sampleProjection(ref.model))
          .limit(5)
          .lean()
          .session(session || null),
      ]);
      return {
        model: ref.model,
        path: ref.path,
        kind: ref.kind,
        count,
        sample: sample.map((d) => summariseSample(ref.model, d)),
      };
    }),
  );
  return rows;
}

function sampleProjection(model) {
  switch (model) {
    case "Patient": return "personal.name personal.phone surgery.surgeryDate";
    case "Payable": return "payee.label purpose totalAmount period createdAt";
    case "Receivable": return "payer.label purpose totalAmount createdAt";
    case "Advance": return "party.label amount direction date";
    case "Borrowing": return "party.label amount direction date";
    case "Transactions": return "expenseGiver.name commissionReceiver.name amount date transactionCategory";
    case "Interviewer": return "name status createdAt";
    default: return "";
  }
}
function summariseSample(model, d) {
  switch (model) {
    case "Patient": return { _id: d._id, label: d.personal?.name || "—", date: d.surgery?.surgeryDate };
    case "Payable": return { _id: d._id, label: d.payee?.label || "—", date: d.createdAt, amount: d.totalAmount };
    case "Receivable": return { _id: d._id, label: d.payer?.label || "—", date: d.createdAt, amount: d.totalAmount };
    case "Advance": return { _id: d._id, label: d.party?.label || "—", date: d.date, amount: d.amount };
    case "Borrowing": return { _id: d._id, label: d.party?.label || "—", date: d.date, amount: d.amount };
    case "Transactions": return { _id: d._id, label: d.expenseGiver?.name || d.commissionReceiver?.name || "—", date: d.date, amount: d.amount };
    case "Interviewer": return { _id: d._id, label: d.name || "—", date: d.createdAt };
    default: return { _id: d._id };
  }
}

async function financeFor(empId, session) {
  const [p] = await Payable.aggregate([
    { $match: { "payee.kind": "EMPLOYEE", "payee.refId": empId, isCancelled: { $ne: true } } },
    ...buildPayableAggregationStages(Transactions.collection.name),
    {
      $group: {
        _id: null,
        totalPayable: { $sum: "$totalAmount" },
        paid: { $sum: "$paid" },
        pending: { $sum: "$pending" },
        salaryPayable: { $sum: { $cond: [{ $eq: ["$purpose", "SALARY"] }, "$totalAmount", 0] } },
        incentivePayable: { $sum: { $cond: [{ $eq: ["$purpose", "INCENTIVE"] }, "$totalAmount", 0] } },
      },
    },
  ]).session(session || null);

  const [a] = await Advance.aggregate([
    { $match: { "party.kind": "EMPLOYEE", "party.refId": empId, direction: "OUT", isCancelled: { $ne: true } } },
    { $addFields: { _settled: settledTotalExpr } },
    { $group: { _id: null, out: { $sum: "$amount" }, settled: { $sum: "$_settled" } } },
  ]).session(session || null);

  return {
    totalPayable: r2(p?.totalPayable),
    paid: r2(p?.paid),
    pending: r2(p?.pending),
    salaryPayable: r2(p?.salaryPayable),
    incentivePayable: r2(p?.incentivePayable),
    advancesOutstanding: r2((a?.out || 0) - (a?.settled || 0)),
  };
}

async function detectConflicts(survivorId, duplicateId, session) {
  const conflicts = [];
  const warnings = [];
  const blockers = [];

  
  const groups = await Payable.aggregate([
    {
      $match: {
        "payee.kind": "EMPLOYEE",
        "payee.refId": { $in: [survivorId, duplicateId] },
        purpose: { $in: MONTHLY_PAYABLE_PURPOSES },
        isCancelled: { $ne: true },
      },
    },
    ...buildPayableAggregationStages(Transactions.collection.name),
    {
      $group: {
        _id: { purpose: "$purpose", m: "$period.month", y: "$period.year" },
        docs: {
          $push: {
            _id: "$_id",
            refId: "$payee.refId",
            label: "$payee.label",
            totalAmount: "$totalAmount",
            paid: "$paid",
            pending: "$pending",
            isCancelled: "$isCancelled",
            dueDate: "$dueDate",
            createdAt: "$createdAt",
          },
        },
      },
    },
  ]).session(session || null);

  for (const g of groups) {
    const surv = g.docs.filter((d) => sameId(d.refId, survivorId));
    const dup = g.docs.filter((d) => sameId(d.refId, duplicateId));
    if (!surv.length || !dup.length) continue;

    for (const d of dup) {
      const locked = await checkPeriodLock({ furtherMode: null, date: d.dueDate || d.createdAt });
      if (locked) {
        blockers.push(
          `A ${g._id.purpose} payable for ${g._id.m}/${g._id.y} is in a locked period and can't be relabelled: ${locked}`,
        );
      }
      conflicts.push({
        key: `DUP_MONTHLY:${g._id.purpose}:${g._id.m}-${g._id.y}:${d._id}`,
        type: "DUPLICATE_MONTHLY_PAYABLE",
        purpose: g._id.purpose,
        period: { month: g._id.m, year: g._id.y },
        survivorDoc: pick(surv[0], ["_id", "totalAmount", "paid", "pending", "isCancelled"]),
        duplicateDoc: pick(d, ["_id", "totalAmount", "paid", "pending", "isCancelled", "label"]),
        periodLocked: !!locked,
        resolutions: ["KEEP_BOTH_RELABEL", ...(d.paid <= 0.005 ? ["CANCEL_DUPLICATE"] : []), "MANUAL"],
        defaultResolution: "KEEP_BOTH_RELABEL",
      });
    }
  }

  
  const advCounts = await Advance.aggregate([
    {
      $match: {
        "party.kind": "EMPLOYEE",
        "party.refId": { $in: [survivorId, duplicateId] },
        direction: "OUT",
        isCancelled: { $ne: true },
      },
    },
    { $addFields: { _settled: settledTotalExpr } },
    { $match: { $expr: { $gt: [{ $subtract: ["$amount", "$_settled"] }, 0.005] } } },
    { $group: { _id: "$party.refId", n: { $sum: 1 } } },
  ]).session(session || null);
  if (advCounts.length === 2) {
    warnings.push("Both records hold an unsettled advance — both survive and stay recoverable against the survivor.");
  }

  return { conflicts, warnings, blockers };
}

const pick = (obj, keys) => (obj ? Object.fromEntries(keys.map((k) => [k, obj[k]])) : null);

function fieldDiff(survivor, duplicate) {
  return FIELD_KEYS.map((field) => {
    const s = survivor[field];
    const d = duplicate[field];
    const differs = JSON.stringify(s ?? null) !== JSON.stringify(d ?? null);
    let suggest;
    if (differs) {
      const sEmpty = s === "" || s == null || (typeof s === "object" && !Object.keys(s || {}).length);
      const dEmpty = d === "" || d == null || (typeof d === "object" && !Object.keys(d || {}).length);
      if (sEmpty && !dEmpty) suggest = "duplicate";
      else if (!sEmpty && dEmpty) suggest = "survivor";
    }
    return { field, survivor: s ?? "", duplicate: d ?? "", differs, ...(suggest ? { suggest } : {}) };
  });
}

async function overlaps(survivorId, duplicateId, session) {
  const patientPaths = EMPLOYEE_REFERENCES.filter((r) => r.model === "Patient").map((r) => r.path);
  const both = await Patient.countDocuments({
    $and: [
      { $or: patientPaths.map((p) => ({ [p]: survivorId })) },
      { $or: patientPaths.map((p) => ({ [p]: duplicateId })) },
    ],
  }).session(session || null);

  const arrayPaths = EMPLOYEE_REFERENCES.filter((r) => r.model === "Patient" && r.kind === "array").map((r) => r.path);
  const dupInBoth = await Patient.find(
    { $or: arrayPaths.map((p) => ({ [p]: { $all: [survivorId, duplicateId] } })) },
    { _id: 1 },
  )
    .limit(50)
    .lean()
    .session(session || null);

  return { patientsInBoth: both, arrayFieldsNeedingDedupe: dupInBoth.map((d) => ({ patientId: d._id })) };
}

function employeeCard(e, patientCount) {
  return {
    _id: e._id,
    name: e.name,
    employeeId: e.employeeId || "",
    role: e.role,
    branch: e.branch,
    phone: e.phone || "",
    email: e.email || "",
    isactive: e.isactive,
    createdAt: e.createdAt,
    salaryStructure: e.salaryStructure,
    incentiveRate: e.incentiveRate,
    patientCount: (e.patient || []).length,
    ...(patientCount != null ? { patientCount } : {}),
  };
}

export function computeConfirmToken({ references, conflicts }) {
  const refPart = [...references]
    .map((r) => `${r.model}.${r.path}=${r.count}`)
    .sort()
    .join("|");
  const conflictPart = [...(conflicts || [])].map((c) => c.key).sort().join("|");
  return crypto.createHash("sha256").update(`${refPart}::${conflictPart}`).digest("hex");
}

export async function buildPreview({ survivorId, duplicateId }) {
  const blockers = [];
  if (!mongoose.Types.ObjectId.isValid(survivorId) || !mongoose.Types.ObjectId.isValid(duplicateId)) {
    return { success: false, error: "Invalid employee id(s)" };
  }
  if (sameId(survivorId, duplicateId)) {
    return { success: false, error: "Survivor and duplicate are the same record" };
  }
  const sOid = oid(survivorId);
  const dOid = oid(duplicateId);

  const [survivor, duplicate] = await Promise.all([
    Employee.findById(sOid).lean(),
    Employee.findById(dOid).lean(),
  ]);
  if (!survivor) return { success: false, error: "Survivor employee not found" };
  if (!duplicate) return { success: false, error: "Duplicate employee not found" };
  if (survivor.mergedInto) blockers.push("The survivor has itself already been merged into another record.");
  if (duplicate.mergedInto) blockers.push("This duplicate has already been merged.");

  const [references, finSurv, finDup, conflictReport, diff, ov] = await Promise.all([
    countReferences(dOid),
    financeFor(sOid),
    financeFor(dOid),
    detectConflicts(sOid, dOid),
    Promise.resolve(fieldDiff(survivor, duplicate)),
    overlaps(sOid, dOid),
  ]);

  const totalReferences = references.reduce((s, r) => s + r.count, 0);
  const merged = {};
  for (const k of Object.keys(finSurv)) merged[k] = r2(finSurv[k] + finDup[k]);

  const allBlockers = [...blockers, ...conflictReport.blockers];
  const token = computeConfirmToken({ references, conflicts: conflictReport.conflicts });

  return {
    success: true,
    survivor: employeeCard(survivor),
    duplicate: employeeCard(duplicate),
    references,
    totalReferences,
    finance: { survivor: finSurv, duplicate: finDup, merged },
    conflicts: conflictReport.conflicts,
    fieldDiff: diff,
    overlaps: ov,
    blockers: allBlockers,
    warnings: conflictReport.warnings,
    confirmToken: token,
    
    suggestedSurvivor: finSurv.totalPayable + (survivor.patient || []).length >= finDup.totalPayable + (duplicate.patient || []).length ? "survivor" : "duplicate",
  };
}

export async function runMerge({ survivorId, duplicateId, fieldChoices = {}, conflictResolutions = {}, confirmToken, note, actor }) {
  const pre = await buildPreview({ survivorId, duplicateId });
  if (!pre.success) return { status: 400, body: { success: false, error: pre.error } };
  if (pre.blockers.length) return { status: 400, body: { success: false, error: "Blocked", blockers: pre.blockers } };
  if (confirmToken && confirmToken !== pre.confirmToken) {
    return { status: 409, body: { success: false, error: "The picture changed since you reviewed it — re-check and confirm again.", preview: pre } };
  }
  for (const c of pre.conflicts) {
    const res = conflictResolutions[c.key];
    if (!res) return { status: 400, body: { success: false, error: `Unresolved conflict: ${c.key}` } };
    if (res === "MANUAL") return { status: 400, body: { success: false, error: `Conflict ${c.key} set to MANUAL — resolve those payables by hand, then re-run.` } };
    if (!c.resolutions.includes(res)) return { status: 400, body: { success: false, error: `Invalid resolution "${res}" for ${c.key}` } };
  }

  const sOid = oid(survivorId);
  const dOid = oid(duplicateId);

  const dbSession = await mongoose.startSession();
  let result;
  try {
    await dbSession.withTransaction(async () => {
      const session = dbSession;

      
      
      
      const survivorSnapshot = await Employee.findById(sOid).lean().session(session);
      const duplicateSnapshot = await Employee.findById(dOid).lean().session(session);

      
      
      const survName = fieldChoices.name === "duplicate" ? duplicateSnapshot.name : survivorSnapshot.name;
      const survRole = fieldChoices.role === "duplicate" ? duplicateSnapshot.role : survivorSnapshot.role;

      const operations = [];
      const relabelledPayables = [];
      const cancelledPayables = [];

      
      for (const c of pre.conflicts) {
        const res = conflictResolutions[c.key];
        const pid = oid(c.duplicateDoc._id);
        const p = await Payable.findById(pid).session(session);
        if (!p) continue;
        if (res === "KEEP_BOTH_RELABEL") {
          const previousLabel = p.payee.label;
          p.payee.label = `${survName} (merged)`;
          p.log.push({ action: "Note Added", note: `Payee relabelled during employee merge ${dOid} → ${sOid}`, performedBy: { name: actor?.name, email: actor?.email }, performedAt: new Date() });
          await p.save({ session });
          relabelledPayables.push({ payableId: p._id, previousLabel, newLabel: p.payee.label });
        } else if (res === "CANCEL_DUPLICATE") {
          if ((c.duplicateDoc.paid || 0) > 0.005) throw new Error(`CANCEL_DUPLICATE not allowed on a payable with payments (${c.key})`);
          p.isCancelled = true;
          p.log.push({ action: "Cancelled", previousValue: "false", newValue: "true", note: `Cancelled — duplicate monthly payable folded during employee merge ${dOid} → ${sOid}`, performedBy: { name: actor?.name, email: actor?.email }, performedAt: new Date() });
          await p.save({ session });
          cancelledPayables.push(p._id);
        }
      }

      
      for (const ref of EMPLOYEE_REFERENCES) {
        const Model = getModel(ref.model);
        const cond = pathCond(ref, dOid);
        const hits = await Model.find(cond, { _id: 1 }).lean().session(session);
        const ids = hits.map((h) => h._id);
        if (ids.length === 0) continue;

        if (ref.kind === "single") {
          const set = { [ref.path]: sOid };
          if (ref.labelPath) set[ref.labelPath] = survName;
          const r = await Model.updateMany({ _id: { $in: ids } }, { $set: set }, { session });
          operations.push({ model: ref.model, path: ref.path, kind: ref.kind, documentIds: ids, modifiedCount: r.modifiedCount || 0 });
        } else if (ref.kind === "array") {
          await Model.updateMany({ _id: { $in: ids } }, { $pull: { [ref.path]: dOid } }, { session });
          const r = await Model.updateMany({ _id: { $in: ids } }, { $addToSet: { [ref.path]: sOid } }, { session });
          operations.push({ model: ref.model, path: ref.path, kind: ref.kind, documentIds: ids, modifiedCount: r.modifiedCount || 0 });
        } else if (ref.kind === "arrayElement") {
          const set = {
            [`${ref.arrayPath}.$[el].${ref.elemRef}`]: sOid,
            ...(ref.labelPath ? { [`${ref.arrayPath}.$[el].${ref.labelPath}`]: survName } : {}),
            ...(ref.extraPaths?.role ? { [`${ref.arrayPath}.$[el].${ref.extraPaths.role}`]: survRole } : {}),
          };
          const r = await Model.updateMany(
            { _id: { $in: ids } },
            { $set: set },
            { arrayFilters: [{ [`el.${ref.elemRef}`]: dOid }], session },
          );
          operations.push({ model: ref.model, path: ref.path, kind: ref.kind, documentIds: ids, modifiedCount: r.modifiedCount || 0 });
        }
      }

      
      
      for (const rp of relabelledPayables) {
        await Payable.updateOne({ _id: rp.payableId }, { $set: { "payee.label": rp.newLabel } }, { session });
      }

      
      const survivorPatientSet = new Set((survivorSnapshot.patient || []).map(String));
      const added = (duplicateSnapshot.patient || []).map(String).filter((p) => !survivorPatientSet.has(p));
      const unionedPatients = [...survivorPatientSet, ...added].map((p) => oid(p));

      
      const survivorUpdate = { patient: unionedPatients };
      for (const k of FIELD_KEYS) {
        if (fieldChoices[k] === "duplicate") survivorUpdate[k] = duplicateSnapshot[k];
      }
      await Employee.updateOne({ _id: sOid }, { $set: survivorUpdate }, { session });

      
      const retiredName = duplicateSnapshot.name?.startsWith("[MERGED]") ? duplicateSnapshot.name : `[MERGED] ${duplicateSnapshot.name}`;
      await Employee.updateOne(
        { _id: dOid },
        {
          $set: {
            mergedInto: sOid,
            mergedAt: new Date(),
            mergedBy: { name: actor?.name, email: actor?.email },
            isactive: false,
            name: retiredName,
          },
        },
        { session },
      );

      
      const totalReferences = operations.reduce((s, o) => s + (o.documentIds?.length || 0), 0);
      const [logDoc] = await EmployeeMerge.create(
        [
          {
            survivorId: sOid,
            duplicateId: dOid,
            survivorSnapshot,
            duplicateSnapshot,
            fieldChoices,
            conflictResolutions,
            operations,
            relabelledPayables,
            cancelledPayables,
            survivorPatientAdded: added.map((p) => oid(p)),
            totalReferences,
            status: "completed",
            note: note || "",
            performedBy: { name: actor?.name, email: actor?.email },
            performedAt: new Date(),
          },
        ],
        { session, ordered: true },
      );

      result = { mergeId: logDoc._id, operations, totalReferences };
    });
  } finally {
    await dbSession.endSession();
  }

  
  const stillReferenced = [];
  for (const ref of EMPLOYEE_REFERENCES) {
    const Model = getModel(ref.model);
    const n = await Model.countDocuments(pathCond(ref, dOid));
    if (n > 0) stillReferenced.push({ model: ref.model, path: ref.path, remaining: n });
  }
  const verification = { clean: stillReferenced.length === 0, stillReferenced };
  await EmployeeMerge.updateOne({ _id: result.mergeId }, { $set: { verification } });

  return {
    status: verification.clean ? 200 : 200,
    body: {
      success: verification.clean,
      mergeId: result.mergeId,
      totalReferences: result.totalReferences,
      operations: result.operations.map((o) => ({ model: o.model, path: o.path, modifiedCount: o.modifiedCount })),
      verification,
      ...(verification.clean ? {} : { warning: "Merge committed but some references still point at the duplicate — undo and investigate." }),
    },
  };
}

export async function runRevert({ mergeId, actor }) {
  if (!mongoose.Types.ObjectId.isValid(mergeId)) return { status: 400, body: { success: false, error: "Invalid merge id" } };
  const merge = await EmployeeMerge.findById(mergeId).lean();
  if (!merge) return { status: 404, body: { success: false, error: "Merge record not found" } };
  if (merge.status !== "completed") return { status: 400, body: { success: false, error: `This merge is already "${merge.status}".` } };

  const sOid = oid(merge.survivorId);
  const dOid = oid(merge.duplicateId);
  const since = new Date(merge.performedAt).getTime();

  
  const dupNow = await Employee.findById(dOid).lean();
  if (!dupNow) return { status: 400, body: { success: false, error: "The duplicate record no longer exists." } };
  if (!sameId(dupNow.mergedInto, sOid)) {
    return { status: 400, body: { success: false, error: "The duplicate has since been merged elsewhere — revert that first." } };
  }
  const touchedIds = [
    ...merge.operations.flatMap((o) => o.documentIds || []),
    ...merge.relabelledPayables.map((r) => r.payableId),
    ...merge.cancelledPayables,
  ];
  const touchedByModel = {};
  for (const o of merge.operations) {
    touchedByModel[o.model] = touchedByModel[o.model] || new Set();
    (o.documentIds || []).forEach((id) => touchedByModel[o.model].add(String(id)));
  }
  for (const [model, idSet] of Object.entries(touchedByModel)) {
    const Model = getModel(model);
    const changed = await Model.countDocuments({ _id: { $in: [...idSet].map(oid) }, updatedAt: { $gt: new Date(since + 2000) } });
    if (changed > 0) {
      return { status: 409, body: { success: false, error: `${changed} ${model} document(s) changed since the merge — revert refused. Undo those changes or accept the merge.` } };
    }
  }
  if (touchedIds.length) {
    const payChanged = await Payable.countDocuments({
      _id: { $in: [...merge.relabelledPayables.map((r) => r.payableId), ...merge.cancelledPayables].map(oid) },
      updatedAt: { $gt: new Date(since + 2000) },
    });
    if (payChanged > 0) {
      return { status: 409, body: { success: false, error: `${payChanged} relabelled/cancelled payable(s) changed since the merge — revert refused.` } };
    }
  }

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const session = dbSession;

      
      for (const op of [...merge.operations].reverse()) {
        const Model = getModel(op.model);
        const ids = (op.documentIds || []).map(oid);
        if (ids.length === 0) continue;
        const ref = EMPLOYEE_REFERENCES.find((r) => r.model === op.model && r.path === op.path);

        if (op.kind === "single") {
          const set = { [op.path]: dOid };
          if (ref?.labelPath) set[ref.labelPath] = merge.duplicateSnapshot.name;
          await Model.updateMany({ _id: { $in: ids } }, { $set: set }, { session });
        } else if (op.kind === "array") {
          await Model.updateMany({ _id: { $in: ids } }, { $pull: { [op.path]: sOid } }, { session });
          await Model.updateMany({ _id: { $in: ids } }, { $addToSet: { [op.path]: dOid } }, { session });
        } else if (op.kind === "arrayElement") {
          const set = {
            [`${ref.arrayPath}.$[el].${ref.elemRef}`]: dOid,
            ...(ref.labelPath ? { [`${ref.arrayPath}.$[el].${ref.labelPath}`]: merge.duplicateSnapshot.name } : {}),
            ...(ref.extraPaths?.role ? { [`${ref.arrayPath}.$[el].${ref.extraPaths.role}`]: merge.duplicateSnapshot.role } : {}),
          };
          await Model.updateMany({ _id: { $in: ids } }, { $set: set }, { arrayFilters: [{ [`el.${ref.elemRef}`]: sOid }], session });
        }
      }

      
      for (const rp of merge.relabelledPayables) {
        await Payable.updateOne({ _id: rp.payableId }, { $set: { "payee.label": rp.previousLabel } }, { session });
      }
      for (const pid of merge.cancelledPayables) {
        await Payable.updateOne({ _id: pid }, { $set: { isCancelled: false } }, { session });
      }

      
      await Employee.replaceOne({ _id: sOid }, merge.survivorSnapshot, { session });
      await Employee.replaceOne({ _id: dOid }, merge.duplicateSnapshot, { session });

      await EmployeeMerge.updateOne(
        { _id: merge._id },
        { $set: { status: "reverted", revertedBy: { name: actor?.name, email: actor?.email }, revertedAt: new Date() } },
        { session },
      );
    });
  } finally {
    await dbSession.endSession();
  }

  return { status: 200, body: { success: true, message: "Merge reverted — both records restored." } };
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

export async function findSuggestions() {
  const employees = await Employee.find({ mergedInto: null }, "name phone email branch employeeId role isactive createdAt patient").lean();
  const byKey = {};
  const add = (key, e) => {
    if (!key) return;
    (byKey[key] = byKey[key] || []).push(e);
  };
  for (const e of employees) {
    add(`name:${norm(e.name)}`, e);
    if (e.phone) add(`phone:${norm(e.phone)}`, e);
    if (e.email) add(`email:${norm(e.email)}`, e);
    add(`nb:${norm(e.name)}|${e.branch || ""}`, e);
  }

  const pairs = new Map();
  for (const [key, list] of Object.entries(byKey)) {
    if (list.length < 2) continue;
    const reason = key.split(":")[0];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const pk = [String(a._id), String(b._id)].sort().join("|");
        const conf =
          reason === "phone" || reason === "email" ? 0.95 : reason === "name" ? 0.8 : 0.6;
        const prev = pairs.get(pk);
        if (!prev || conf > prev.confidence) {
          pairs.set(pk, {
            confidence: conf,
            reason,
            a: card(a),
            b: card(b),
          });
        }
      }
    }
  }

  
  
  
  
  
  const digits = (p) => String(p || "").replace(/\D/g, "");
  const sortedDigits = (p) => digits(p).split("").sort().join("");
  for (let i = 0; i < employees.length; i++) {
    for (let j = i + 1; j < employees.length; j++) {
      const a = employees[i];
      const b = employees[j];
      const pk = [String(a._id), String(b._id)].sort().join("|");
      if (pairs.has(pk)) continue; 

      const na = norm(a.name);
      const nb = norm(b.name);
      let matched = false;
      if (na && nb && na !== nb) {
        
        
        const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
        if (shorter.length >= 3) {
          const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          matched = new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(longer);
        }
      }
      if (!matched) {
        
        
        const da = digits(a.phone);
        const db = digits(b.phone);
        if (da && db && da !== db && da.length === db.length && da.length >= 10 && sortedDigits(a.phone) === sortedDigits(b.phone)) {
          matched = true;
        }
      }
      if (matched) {
        pairs.set(pk, { confidence: 0.5, reason: "similar", a: card(a), b: card(b) });
      }
    }
  }

  return [...pairs.values()].sort((x, y) => y.confidence - x.confidence);
}
const card = (e) => ({
  _id: e._id,
  name: e.name,
  employeeId: e.employeeId || "",
  role: e.role,
  branch: e.branch,
  phone: e.phone || "",
  email: e.email || "",
  isactive: e.isactive,
  createdAt: e.createdAt,
  patientCount: (e.patient || []).length,
});
