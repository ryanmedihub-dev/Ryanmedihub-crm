

export const EMPLOYEE_REFERENCES = [
  
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

  
  { model: "Payable", path: "payee.refId", kind: "single", labelPath: "payee.label", guard: { "payee.kind": "EMPLOYEE" } },
  { model: "Receivable", path: "payer.refId", kind: "single", labelPath: "payer.label", guard: { "payer.kind": "EMPLOYEE" } },
  { model: "Advance", path: "party.refId", kind: "single", labelPath: "party.label", guard: { "party.kind": "EMPLOYEE" } },
  { model: "Borrowing", path: "party.refId", kind: "single", labelPath: "party.label", guard: { "party.kind": "EMPLOYEE" } },

  
  { model: "Transactions", path: "expenseGiver.refId", kind: "single", labelPath: "expenseGiver.name", guard: { "expenseGiver.type": "EMPLOYEE" } },
  { model: "Transactions", path: "commissionReceiver.refId", kind: "single", labelPath: "commissionReceiver.name", guard: { "commissionReceiver.type": "Employee" } },
  { model: "Transactions", path: "externalParty.partyRefId", kind: "single", labelPath: "externalParty.name", guard: { "externalParty.partyKind": "EMPLOYEE" } },

  
  { model: "Interviewer", path: "assignedHr", kind: "single" },
];

export const EMPLOYEE_REFERENCE_MODELS = [...new Set(EMPLOYEE_REFERENCES.map((r) => r.model))];

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
      
      const norm = pathName.replace(/\.\$\*/g, "").replace(/\.\d+\./g, ".");
      if (!declared.has(`${name}.${norm}`)) missing.push(`${name}.${norm}`);
    });
  }
  return missing;
}
