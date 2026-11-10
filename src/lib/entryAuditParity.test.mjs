/**
 * Needs a live MONGODB_URI (reads only, writes nothing):
 *   node src/lib/entryAuditParity.test.mjs
 *
 * Asserts the Mongo pipeline in entryAuditPipeline.js produces exactly the
 * issues auditPatient() produces, over real patient documents, and reports how
 * long the report query takes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import mongoose from "mongoose";
import { auditPatient } from "./entryAudit.js";
import { auditStages, buildAuditPipeline, shapeFacet } from "./entryAuditPipeline.js";

const uri =
  process.env.MONGODB_URI ||
  (fs.existsSync(".env") && fs.readFileSync(".env", "utf8").match(/^MONGODB_URI\s*=\s*"?([^"\r\n]+)"?/m)?.[1]);
if (!uri) throw new Error("MONGODB_URI not set");

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const patients = db.collection("patients");

const FOCUS = ["BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];
const sortIssues = (a) =>
  [...a].sort((x, y) => (x.field + x.type + x.label).localeCompare(y.field + y.type + y.label));

/* ── Parity on a sample of real documents, plus hand-built edge cases ────── */

const sample = await patients
  .aggregate([{ $match: { "ops.status": { $in: FOCUS } } }, { $sample: { size: 300 } }])
  .toArray();

const edges = [
  { _id: "e1", ops: { status: "CLOSED" }, personal: { name: " ", phone: "12345", branch: "Delhi" } },
  {
    _id: "e2",
    ops: { status: "CLOSED" },
    personal: { name: "X", phone: "+91 98765 43210", branch: "Delhi", visitDate: new Date(), reference: "r", address: "a" },
    counselling: { counsellor: "c", techniqueSuggested: "DHI", finlpackage: 1, readyForSurgery: true, additionalbenefits: ["PRP"] },
    medical: { hiv: "NR", hcv: "NR" },
    surgery: {
      surgeryDate: new Date(), location: "Delhi", OT: 1, technique: "DHI", graftsImplanted: 10,
      doctor: ["d"], seniorTech: ["s"], implanterRight: ["r"], implanterLeft: ["l"], graftingPerson: ["g"],
    },
    documents: { images: ["a.jpg", "b.pdf"], consentForm: ["c.pdf"], suregeryForm: ["https://drive.google.com/x"] },
  },
  { _id: "e3", ops: { status: "BOOKING_DONE" }, personal: { phone: "", branch: "" }, counselling: { finlpackage: 0 }, documents: { images: [] } },
  { _id: "e4", ops: { status: "SURGERY_BOOKED" }, personal: { name: "Y", phone: "09876543210", branch: "Noida" }, counselling: { readyForSurgery: false } },
  // Money: whole numbers, paise, overpaid, negative pending, dues, junk, int vs double.
  { _id: "m1", ops: { status: "CLOSED" }, payments: { totalAmount: 100, amountReceived: 20, discount: 0, pendingAmount: 30 } },
  { _id: "m2", ops: { status: "CLOSED" }, payments: { totalAmount: 125000.5, amountReceived: 1000.25, discount: 0, pendingAmount: 0 } },
  { _id: "m3", ops: { status: "CLOSED" }, payments: { totalAmount: 100, amountReceived: 150, discount: 0, pendingAmount: -50 } },
  { _id: "m4", ops: { status: "CLOSED" }, payments: { totalAmount: 90000, amountReceived: 40000, discount: 0, pendingAmount: 50000 } },
  { _id: "m5", ops: { status: "SURGERY_BOOKED" }, payments: { totalAmount: 90000, amountReceived: 40000, discount: 0, pendingAmount: 50000 } },
  { _id: "m6", ops: { status: "CLOSED" }, payments: { totalAmount: "abc", amountReceived: null, discount: undefined } },
  { _id: "m7", ops: { status: "CLOSED" }, payments: { totalAmount: "100", amountReceived: "20" } },
  { _id: "m8", ops: { status: "CLOSED" } },
];

const docs = [...sample, ...edges];
// $documents lets the real pipeline run over these without touching any collection.
const viaMongo = await db
  .aggregate([{ $documents: docs }, ...auditStages(), { $project: { issues: 1, counts: 1, priority: 1, score: 1 } }])
  .toArray();

assert.equal(viaMongo.length, docs.length);
let compared = 0;
for (let i = 0; i < docs.length; i++) {
  const js = auditPatient(docs[i]);
  const mg = viaMongo[i];
  const where = `doc ${String(docs[i]._id)} (${docs[i].ops?.status})`;
  assert.deepEqual(mg.counts, js.counts, `counts differ for ${where}`);
  assert.equal(mg.priority ?? null, js.priority, `priority differs for ${where}`);
  assert.equal(mg.score, js.score, `score differs for ${where}`);
  assert.deepEqual(
    sortIssues(mg.issues).map((x) => [x.field, x.type, x.severity, x.label, x.detail ?? null]),
    sortIssues(js.issues).map((x) => [x.field, x.type, x.severity, x.label, x.detail ?? null]),
    `issues differ for ${where}`
  );
  compared++;
}
console.log(`parity: ${compared} documents, pipeline == auditPatient`);

// The edge cases must actually exercise the interesting branches.
const byId = new Map(viaMongo.map((r, i) => [String(docs[i]._id), r]));
const e2 = byId.get("e2").issues;
assert.ok(e2.some((i) => i.field === "documents.images" && i.type === "format" && i.severity === "high"));
assert.ok(e2.some((i) => i.field === "documents.suregeryForm" && i.type === "format" && i.severity === "medium"));
assert.ok(!e2.some((i) => i.field === "personal.phone"), "+91 98765 43210 is a valid number");
assert.ok(byId.get("e1").issues.some((i) => i.field === "personal.phone" && i.type === "invalid"));
assert.ok(byId.get("e1").issues.some((i) => i.field === "personal.name" && i.type === "missing"), "whitespace name is empty");
assert.ok(byId.get("e4").issues.some((i) => i.field === "counselling.readyForSurgery"));

const money = (id) => byId.get(id).issues.filter((i) => i.section === "Payments");
assert.deepEqual(
  money("m1").map((i) => [i.field, i.detail]),
  [
    ["payments.totalAmount", "Total 100 != Received 20 + Discount 0 + Pending 30"],
    ["payments.pendingAmount", "Pending 30"],
  ],
  "detail strings must match the JS wording exactly, integers without decimals"
);
assert.ok(money("m2").some((i) => i.detail.includes("125000.5")), "paise survive the round trip");
assert.deepEqual(money("m3").map((i) => i.field).sort(), ["payments.amountReceived", "payments.pendingAmount"]);
assert.deepEqual(money("m4").map((i) => i.label), ["Surgery closed with pending balance"]);
assert.deepEqual(money("m5"), [], "dues before surgery are normal");
assert.deepEqual(money("m6"), [], "unparseable money reads as 0");
assert.deepEqual(money("m7").map((i) => i.field), ["payments.totalAmount"], "numeric strings are compared");
assert.deepEqual(money("m8"), [], "no payments sub-document at all");

/* ── Timing of the real report query ─────────────────────────────────────── */

const pipeline = buildAuditPipeline({ match: { "ops.status": { $in: FOCUS } }, limit: 50 });
const t = Date.now();
const [facet] = await patients.aggregate(pipeline, { allowDiskUse: true }).toArray();
const ms = Date.now() - t;
const shaped = shapeFacet(facet);

assert.equal(shaped.rows.length, 50);
assert.ok(shaped.summary.scanned > 0);
assert.equal(
  shaped.summary.high + shaped.summary.medium + shaped.summary.low + shaped.summary.clean,
  shaped.summary.scanned,
  "summary buckets must add up to everything scanned"
);
assert.ok(shaped.rows.every((r) => r.priority), "listed rows always carry a priority");
assert.ok(!("docCounts" in shaped.rows[0]), "document tallies stay on the server");

console.log(
  `report query: ${ms}ms for ${shaped.summary.scanned} patients ` +
    `(${shaped.summary.total ?? shaped.total} flagged, page of ${shaped.rows.length})`
);
console.log("summary:", shaped.summary);

await mongoose.disconnect();
console.log("entryAuditParity: all checks passed");
