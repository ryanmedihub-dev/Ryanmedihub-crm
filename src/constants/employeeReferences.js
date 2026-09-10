// Every place an Employee ObjectId can live, declared once. The merge preview, the merge
// itself, the revert, and the delete guard all drive off this array — add a new reference
// path here and every one of them starts handling it. `assertEmployeeReferenceCoverage()`
// walks the schemas for `ref: "Employee"` and fails if a path is missing from this list.
//
// kind:
//   "single"       — field holds one ObjectId
//   "array"        — field holds an array of ObjectIds
//   "arrayElement" — field is `<arrayPath>.<sub>`, one ObjectId per array element; the merge
//                    uses a positional filtered ($[el]) update with arrayFilters
//
// labelPath   — denormalised name to refresh alongside the ref (path is relative to the doc,
//               or to the array element for arrayElement)
// extraPaths  — { fieldName: pathToDenormalisedValue } refreshed from the survivor too
// guard       — extra match conditions (e.g. the discriminator that says "this ref is an
//               employee, not a vendor"). NOTE the casing: expenseGiver/externalParty use
//               "EMPLOYEE", commissionReceiver uses "Employee".

export const EMPLOYEE_REFERENCES = [
  // ---- Patient: 9 paths, 6 of them arrays ----
  { model: "Patient", path: "personal.reference", kind: "single" },
  { model: "Patient", path: "counselling.counsellor", kind: "single" },
  { model: "Patient", path: "surgery.doctor", kind: "array" },
  { model: "Patient", path: "surgery.seniorTech", kind: "array" },
  { model: "Patient", path: "surgery.implanterRight", kind: "array" },
  { model: "Patient", path: "surgery.implanterLeft", kind: "array" },
  { model: "Patient", path: "surgery.graftingPerson", kind: "array" },
  { model: "Patient", path: "surgery.helper", kind: "array" },
  {
    model: "Patient",
    path: "incentives.employee",
    kind: "arrayElement",
    arrayPath: "incentives",
    elemRef: "employee",
    labelPath: "employeeName",
    extraPaths: { role: "role" },
  },

  // ---- Finance: discriminated party refs ----
  { model: "Payable", path: "payee.refId", kind: "single", labelPath: "payee.label", guard: { "payee.kind": "EMPLOYEE" } },
  { model: "Receivable", path: "payer.refId", kind: "single", labelPath: "payer.label", guard: { "payer.kind": "EMPLOYEE" } },
  { model: "Advance", path: "party.refId", kind: "single", labelPath: "party.label", guard: { "party.kind": "EMPLOYEE" } },
  { model: "Borrowing", path: "party.refId", kind: "single", labelPath: "party.label", guard: { "party.kind": "EMPLOYEE" } },

  // ---- Transactions: 3 paths, casing differs per path ----
  { model: "Transactions", path: "expenseGiver.refId", kind: "single", labelPath: "expenseGiver.name", guard: { "expenseGiver.type": "EMPLOYEE" } },
  { model: "Transactions", path: "commissionReceiver.refId", kind: "single", labelPath: "commissionReceiver.name", guard: { "commissionReceiver.type": "Employee" } },
  { model: "Transactions", path: "externalParty.partyRefId", kind: "single", labelPath: "externalParty.name", guard: { "externalParty.partyKind": "EMPLOYEE" } },

  // ---- Everything else ----
  { model: "Interviewer", path: "assignedHr", kind: "single" },
];

export const EMPLOYEE_REFERENCE_MODELS = [...new Set(EMPLOYEE_REFERENCES.map((r) => r.model))];

/**
 * Walk every referenced schema for a path typed `ref: "Employee"` and fail if EMPLOYEE_REFERENCES
 * doesn't cover it. `models` is a { name: mongooseModel } map the caller passes in (keeps this
 * file free of model imports so it stays client-safe).
 */
export function assertEmployeeReferenceCoverage(models) {
  const declared = new Set(EMPLOYEE_REFERENCES.map((r) => `${r.model}.${r.path}`));
  const missing = [];

  for (const [name, model] of Object.entries(models)) {
    const schema = model?.schema;
    if (!schema) continue;
    schema.eachPath((pathName, schemaType) => {
      const opts = schemaType?.options || {};
      const isEmployeeRef =
        opts.ref === "Employee" ||
        opts?.type?.ref === "Employee" ||
        (Array.isArray(opts.type) && opts.type[0]?.ref === "Employee") ||
        schemaType?.caster?.options?.ref === "Employee";
      if (!isEmployeeRef) return;
      // normalise `incentives.$*.employee` → `incentives.employee`
      const norm = pathName.replace(/\.\$\*/g, "").replace(/\.\d+\./g, ".");
      if (!declared.has(`${name}.${norm}`)) missing.push(`${name}.${norm}`);
    });
  }
  return missing;
}
