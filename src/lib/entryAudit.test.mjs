// node src/lib/entryAudit.test.mjs
import assert from "node:assert/strict";
import { auditPatient, fileKind, rulesFor, TRACKED_PATHS } from "./entryAudit.js";

const has = (r, field, type) => r.issues.some((i) => i.field === field && (!type || i.type === type));

// fileKind
assert.equal(fileKind("https://res.cloudinary.com/x/a/b.JPG"), "image");
assert.equal(fileKind("https://res.cloudinary.com/x/upload/fl_attachment:false/a.pdf"), "pdf");
assert.equal(fileKind("https://res.cloudinary.com/x/a.pdf?v=2"), "pdf");
assert.equal(fileKind("https://drive.google.com/file/d/abc/view?usp=sharing"), "unknown");

// Only the tracked fields are audited - nothing else leaks back in.
assert.deepEqual(
  [...TRACKED_PATHS].sort(),
  [
    "counselling.additionalbenefits", "counselling.counsellor", "counselling.finlpackage",
    "counselling.readyForSurgery", "counselling.techniqueSuggested",
    "medical.hcv", "medical.hiv",
    "personal.address", "personal.branch", "personal.name", "personal.phone",
    "personal.reference", "personal.visitDate",
    "surgery.OT", "surgery.doctor", "surgery.graftingPerson", "surgery.graftsImplanted",
    "surgery.implanterLeft", "surgery.implanterRight", "surgery.location",
    "surgery.seniorTech", "surgery.surgeryDate", "surgery.technique",
  ].sort()
);

// A complete CLOSED patient raises nothing.
const closedClean = {
  ops: { status: "CLOSED" },
  personal: {
    name: "A", phone: "9876543210", branch: "Delhi",
    visitDate: new Date("2026-01-01"), reference: "e1", address: "x",
  },
  counselling: {
    counsellor: "e2", techniqueSuggested: "DHI", finlpackage: 100,
    readyForSurgery: true, additionalbenefits: ["PRP"],
  },
  medical: { hiv: "NR", hcv: "NR" },
  surgery: {
    surgeryDate: new Date("2026-02-01"), location: "Delhi", OT: 1, technique: "DHI",
    graftsImplanted: 2100, doctor: ["d1"], seniorTech: ["s1"],
    implanterRight: ["i1"], implanterLeft: ["i2"], graftingPerson: ["g1"],
  },
  documents: { images: ["a.jpg"], consentForm: ["c.pdf"], suregeryForm: ["s.pdf"] },
};
assert.deepEqual(auditPatient(closedClean).counts, { high: 0, medium: 0, low: 0 });
assert.equal(auditPatient(closedClean).priority, null);

// Untracked fields (age, email, bloodGroup, grafts suggested) are ignored.
const noExtras = auditPatient({
  ...closedClean,
  personal: { ...closedClean.personal, age: 999, email: "" },
  medical: { ...closedClean.medical, bloodGroup: "" },
  counselling: { ...closedClean.counselling, graftsSuggested: 0 },
});
assert.equal(noExtras.priority, null);

// Money checks.
const withMoney = (payments) => auditPatient({ ...closedClean, payments });
assert.equal(withMoney({ totalAmount: 100, amountReceived: 90, discount: 10, pendingAmount: 0 }).priority, null);
assert.equal(withMoney({}).priority, null, "no money recorded is not a money problem");
assert.equal(withMoney({ totalAmount: 0, amountReceived: 0 }).priority, null);

const off = withMoney({ totalAmount: 100, amountReceived: 20, discount: 0, pendingAmount: 30 });
assert.ok(has(off, "payments.totalAmount", "invalid"), "totals that do not add up");
assert.equal(off.priority, "high");
assert.equal(
  off.issues.find((i) => i.field === "payments.totalAmount").detail,
  "Total 100 != Received 20 + Discount 0 + Pending 30"
);

// 1 rupee of rounding slack, as before.
assert.equal(withMoney({ totalAmount: 100, amountReceived: 99.5, discount: 0, pendingAmount: 0 }).priority, null);
assert.ok(has(withMoney({ totalAmount: 100, amountReceived: 97, discount: 0, pendingAmount: 0 }), "payments.totalAmount"));

const overpaid = withMoney({ totalAmount: 100, amountReceived: 150, discount: 0, pendingAmount: -50 });
assert.ok(has(overpaid, "payments.amountReceived", "invalid"), "received above total");
assert.ok(has(overpaid, "payments.pendingAmount", "invalid"), "negative pending");

const dues = withMoney({ totalAmount: 100, amountReceived: 40, discount: 0, pendingAmount: 60 });
assert.ok(
  dues.issues.some((i) => i.label === "Surgery closed with pending balance" && i.severity === "medium"),
  "CLOSED with dues"
);
// Same dues before surgery is normal, not an issue.
assert.equal(
  auditPatient({
    ...closedClean,
    ops: { status: "SURGERY_BOOKED" },
    surgery: { ...closedClean.surgery, surgeryDate: undefined },
    payments: { totalAmount: 100, amountReceived: 40, discount: 0, pendingAmount: 60 },
  }).issues.some((i) => i.section === "Payments"),
  false
);

// Garbage in a money field reads as 0, it does not throw.
assert.equal(withMoney({ totalAmount: "abc", amountReceived: null }).priority, null);
assert.ok(has(withMoney({ totalAmount: "100", amountReceived: "20" }), "payments.totalAmount"));

// Wrong format in both directions -> high.
const swapped = {
  ...closedClean,
  documents: { images: ["a.pdf"], consentForm: ["c.png"], suregeryForm: ["s.pdf"] },
};
const sw = auditPatient(swapped);
assert.ok(has(sw, "documents.images", "format"), "pdf in image section flagged");
assert.ok(has(sw, "documents.consentForm", "format"), "image in pdf section flagged");
assert.equal(sw.priority, "high");

// An extension-less link is medium, not a red alert.
const vague = auditPatient({ ...closedClean, documents: { ...closedClean.documents, images: ["https://drive.google.com/x"] } });
assert.ok(vague.issues.some((i) => i.field === "documents.images" && i.severity === "medium"));

// CLOSED with no documents -> high on every tracked section.
const nd = auditPatient({ ...closedClean, documents: {} });
for (const k of ["images", "consentForm", "suregeryForm"]) {
  assert.ok(has(nd, `documents.${k}`, "missing"), `${k} missing flagged`);
}

// Mongo-side tallies are used when present, without touching documents arrays.
const projected = auditPatient({
  ...closedClean,
  documents: undefined,
  docCounts: {
    images: { n: 3, wrong: 1, unknown: 0 },
    consentForm: { n: 1, wrong: 0, unknown: 0 },
    suregeryForm: { n: 0, wrong: 0, unknown: 0 },
  },
});
assert.ok(has(projected, "documents.images", "format"));
assert.ok(has(projected, "documents.suregeryForm", "missing"));
assert.ok(!has(projected, "documents.consentForm"));

// Status layering.
assert.equal(rulesFor("NEW")["surgery.surgeryDate"], undefined);
assert.equal(rulesFor("NEW")["documents.images"], undefined);
assert.ok(rulesFor("CLOSED")["surgery.surgeryDate"]);
assert.equal(rulesFor("BOOKING_DONE")["counselling.finlpackage"].severity, "high");
assert.equal(rulesFor("CONSULTED")["counselling.finlpackage"], undefined);
assert.ok(rulesFor("SURGERY_BOOKED")["documents.consentForm"]);
assert.equal(rulesFor("SURGERY_BOOKED")["documents.suregeryForm"], undefined);

// Bad phone is a red alert.
assert.ok(has(auditPatient({ ...closedClean, personal: { ...closedClean.personal, phone: "12345" } }), "personal.phone", "invalid"));

// Bare record: priority high, no crash on missing sub-objects.
const bare = auditPatient({ ops: { status: "BOOKING_DONE" } });
assert.equal(bare.priority, "high");
assert.ok(bare.counts.high >= 4);

console.log("entryAudit: all checks passed");
