// §2.2 — batched reference resolution for the bulk-Payable upload. SERVER ONLY (imports
// mongoose models). One query per collection, never inside the row loop.

import Employee from "@/models/Employee";
import Vendor from "@/models/Vendor";
import Patient from "@/models/Patient";
import Payable, { MONTHLY_PAYABLE_PURPOSES } from "@/models/Payable";
import { normalizePhone } from "@/lib/phone";

const norm = (s) => String(s || "").trim().toLowerCase();

function indexByName(rows) {
  const byName = new Map();
  const byPhone = new Map();
  const byEmail = new Map();
  const byId = new Map();
  for (const r of rows) {
    byId.set(String(r._id), r);
    const nameKey = norm(r.name);
    if (nameKey) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(r);
    }
    const phone = normalizePhone(r.phone ?? r.contact);
    if (phone) {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(r);
    }
    const emailKey = norm(r.email);
    if (emailKey) {
      if (!byEmail.has(emailKey)) byEmail.set(emailKey, []);
      byEmail.get(emailKey).push(r);
    }
  }
  return { byName, byPhone, byEmail, byId };
}

/**
 * @param parsedRows  output of parsePayableRowFormat per row (needs .purpose, .payeeLabel,
 *                    .payeeLookup, .relatedPatientPhone, .period)
 */
export async function resolveRefs(parsedRows) {
  const normalizedPhones = new Set();
  const yearsInFile = new Set();

  for (const r of parsedRows) {
    if (!r || !r.purpose) continue;
    if (r.relatedPatientPhone) {
      const p = normalizePhone(r.relatedPatientPhone);
      if (p) normalizedPhones.add(p);
    }
    if (r.payeeLookup) {
      const p = normalizePhone(r.payeeLookup);
      if (p) normalizedPhones.add(p); // harmless extra; patient lookup may use payeeLookup too
    }
    if (r.period?.year) yearsInFile.add(r.period.year);
  }

  const [employees, vendors, patients, existingPayables] = await Promise.all([
    Employee.find({ isactive: true }).select("name phone email branch role").lean(),
    Vendor.find({}).select("name contact email gstNumber DealsIn").lean(),
    normalizedPhones.size
      ? Patient.find({ "personal.phoneNormalized": { $in: [...normalizedPhones] } })
          .select("personal.name personal.phone personal.phoneNormalized")
          .lean()
      : Promise.resolve([]),
    yearsInFile.size
      ? Payable.find({
          purpose: { $in: MONTHLY_PAYABLE_PURPOSES },
          isCancelled: { $ne: true },
          "period.year": { $in: [...yearsInFile] },
        })
          .select("payee purpose expenseSubType period totalAmount createdAt")
          .lean()
      : Promise.resolve([]),
  ]);

  const patientByPhone = new Map();
  for (const p of patients) {
    const key = p.personal?.phoneNormalized || normalizePhone(p.personal?.phone);
    if (!key) continue;
    if (!patientByPhone.has(key)) patientByPhone.set(key, []);
    patientByPhone.get(key).push(p);
  }

  return {
    employees: indexByName(employees),
    vendors: indexByName(vendors.map((v) => ({ ...v, phone: v.contact }))),
    patients: { byPhone: patientByPhone },
    existingPayables,
  };
}

/**
 * Resolve one payee against the batched maps.
 * @returns { kind, refId, label, errors: [], warnings: [] }
 *   kind    — the resolved payee.kind
 *   refId   — string ObjectId or null
 *   label   — the name to store (a resolved doc's real name wins over the sheet's)
 */
export function resolvePayeeForRow(parsed, refs, { defaultKindForPurpose, deriveRequirements }) {
  const errors = [];
  const warnings = [];
  const purpose = parsed.purpose;
  const isGeneric = deriveRequirements(purpose, null).needsSubType; // GENERIC_SUBTYPE_PURPOSES

  // --- RENT / ELECTRICITY: default to the unit kind, but honour an explicit
  //     VENDOR / EMPLOYEE / PATIENT so a landlord/vendor-billed rent connects to that
  //     record (a rent payable can legitimately be owed to a vendor).
  const UNIT_PURPOSES = { RENT: "RENT_UNIT", ELECTRICITY: "UTILITY_UNIT" };
  if (UNIT_PURPOSES[purpose] && !isGeneric) {
    const unitKind = UNIT_PURPOSES[purpose];
    const override = parsed.declaredKind;
    if (override === "VENDOR") {
      return resolveAgainst("VENDOR", "Vendor", refs.vendors, parsed, errors, warnings);
    }
    if (override === "EMPLOYEE") {
      return resolveAgainst("EMPLOYEE", "Employee", refs.employees, parsed, errors, warnings);
    }
    if (override === "PATIENT") {
      // patients aren't name-indexed here — needs an explicit id (pipeline flags a missing one).
      return { kind: "PATIENT", refId: parsed.payeeRefId || null, label: parsed.payeeLabel, errors, warnings };
    }
    checkDeclaredKind(parsed, unitKind, warnings, errors); // errors only if a *wrong* kind was forced
    return { kind: unitKind, refId: null, label: parsed.payeeLabel, errors, warnings };
  }

  // --- fixed-label purposes: the label IS an enum, so no ref and no override ---
  const FIXED_LABEL_PURPOSES = { COLLAB_CLINIC: "COLLAB_CLINIC", TAX: "OTHER", OTHER: "OTHER" };
  if (FIXED_LABEL_PURPOSES[purpose] && !isGeneric) {
    const kind = FIXED_LABEL_PURPOSES[purpose];
    checkDeclaredKind(parsed, kind, warnings, errors);
    return { kind, refId: null, label: parsed.payeeLabel, errors, warnings };
  }

  // --- EMPLOYEE (SALARY / INCENTIVE) ---
  if (purpose === "SALARY" || purpose === "INCENTIVE") {
    return resolveAgainst("EMPLOYEE", "Employee", refs.employees, parsed, errors, warnings);
  }

  // --- PATIENT (PATIENT_COMMISSION) — payee is the patient ---
  if (purpose === "PATIENT_COMMISSION") {
    // relatedPatient resolution (below, resolveRelatedPatient) also covers this; the payee
    // ref mirrors it. Handled by the caller wiring relatedPatient -> payee.refId.
    checkDeclaredKind(parsed, "PATIENT", warnings, errors);
    return { kind: "PATIENT", refId: parsed.payeeRefId || null, label: parsed.payeeLabel, errors, warnings };
  }

  // --- GENERIC subtype purposes: VENDOR if one resolves, else OTHER(label = subType) ---
  if (isGeneric) {
    if (parsed.payeeRefId) {
      const v = refs.vendors.byId.get(parsed.payeeRefId);
      if (!v) {
        errors.push(`payeeRefId ${parsed.payeeRefId}: no vendor with that id`);
        return { kind: "VENDOR", refId: null, label: parsed.payeeLabel, errors, warnings };
      }
      if (norm(v.name) !== norm(parsed.payeeLabel)) {
        warnings.push(`payeeLabel replaced with the vendor's stored name "${v.name}"`);
      }
      return { kind: "VENDOR", refId: String(v._id), label: v.name, errors, warnings };
    }
    const hit = lookupInIndex(refs.vendors, parsed);
    if (hit.matches.length === 1) {
      const v = hit.matches[0];
      if (norm(v.name) !== norm(parsed.payeeLabel)) {
        warnings.push(`payeeLabel replaced with the vendor's stored name "${v.name}"`);
      }
      return { kind: "VENDOR", refId: String(v._id), label: v.name, errors, warnings };
    }
    if (hit.matches.length > 1) {
      errors.push(ambiguityMessage("Vendor", parsed.payeeLabel, hit.matches));
      return { kind: "OTHER", refId: null, label: parsed.expenseSubType || parsed.payeeLabel, errors, warnings };
    }
    // no vendor — fall back to OTHER filed under the sub-type
    if (parsed.declaredKind === "VENDOR") {
      errors.push(`payeeKind VENDOR was given but no vendor named "${parsed.payeeLabel}" was found. Paste their ObjectId into payeeRefId, or leave payeeKind blank to file it under the sub-type.`);
    }
    return { kind: "OTHER", refId: null, label: parsed.expenseSubType || parsed.payeeLabel, errors, warnings };
  }

  // --- explicit payeeKind on an otherwise unmatched row ---
  const kind = parsed.declaredKind || defaultKindForPurpose(purpose);
  return { kind, refId: parsed.payeeRefId || null, label: parsed.payeeLabel, errors, warnings };
}

function resolveAgainst(kind, noun, index, parsed, errors, warnings) {
  checkDeclaredKind(parsed, kind, warnings, errors);
  if (parsed.payeeRefId) {
    const doc = index.byId.get(parsed.payeeRefId);
    if (!doc) {
      errors.push(`payeeRefId ${parsed.payeeRefId}: no ${noun.toLowerCase()} with that id`);
      return { kind, refId: null, label: parsed.payeeLabel, errors, warnings };
    }
    if (norm(doc.name) !== norm(parsed.payeeLabel)) {
      warnings.push(`payeeLabel replaced with the ${noun.toLowerCase()}'s stored name "${doc.name}"`);
    }
    return { kind, refId: String(doc._id), label: doc.name, errors, warnings };
  }
  const hit = lookupInIndex(index, parsed);
  if (hit.matches.length === 1) {
    return { kind, refId: String(hit.matches[0]._id), label: hit.matches[0].name, errors, warnings };
  }
  if (hit.matches.length === 0) {
    errors.push(
      `${noun} "${parsed.payeeLabel}" not found. Create the ${noun.toLowerCase()} first, or paste their ObjectId into payeeRefId.`,
    );
    return { kind, refId: null, label: parsed.payeeLabel, errors, warnings };
  }
  errors.push(ambiguityMessage(noun, parsed.payeeLabel, hit.matches));
  return { kind, refId: null, label: parsed.payeeLabel, errors, warnings };
}

function lookupInIndex(index, parsed) {
  const lookup = parsed.payeeLookup;
  if (lookup) {
    const asPhone = normalizePhone(lookup);
    if (asPhone && index.byPhone.has(asPhone)) return { matches: index.byPhone.get(asPhone) };
    const emailKey = norm(lookup);
    if (index.byEmail.has(emailKey)) return { matches: index.byEmail.get(emailKey) };
    if (index.byName.has(emailKey)) return { matches: index.byName.get(emailKey) };
  }
  const nameKey = norm(parsed.payeeLabel);
  return { matches: index.byName.get(nameKey) || [] };
}

function checkDeclaredKind(parsed, derivedKind, warnings, errors) {
  if (parsed.declaredKind && parsed.declaredKind !== derivedKind) {
    errors.push(
      `payeeKind "${parsed.declaredKind}" contradicts the kind derived from purpose ${parsed.purpose} ("${derivedKind}"). Leave payeeKind blank or set it to "${derivedKind}".`,
    );
  }
}

function ambiguityMessage(noun, label, matches) {
  const list = matches
    .map((m) => `${m._id} (${m.branch || m.DealsIn || "—"}${m.phone || m.contact ? `, ${m.phone || m.contact}` : ""})`)
    .join("; ");
  return `${matches.length} ${noun.toLowerCase()}s match "${label}": ${list}. Put the right one's id in payeeRefId.`;
}

/**
 * Resolve relatedPatient for INCENTIVE / PATIENT_COMMISSION rows.
 * @returns { id: string|null, label: string|null, errors: [] }
 */
export function resolveRelatedPatient(parsed, refs) {
  const errors = [];
  if (parsed.relatedPatientId) {
    return { id: parsed.relatedPatientId, label: null, errors }; // trusted escape hatch
  }
  if (!parsed.relatedPatientPhone) return { id: null, label: null, errors };
  const key = normalizePhone(parsed.relatedPatientPhone);
  const hits = (key && refs.patients.byPhone.get(key)) || [];
  if (hits.length === 1) return { id: String(hits[0]._id), label: hits[0].personal?.name || null, errors };
  if (hits.length === 0) {
    errors.push(`relatedPatientPhone ${parsed.relatedPatientPhone}: no patient with that phone. Paste their ObjectId into relatedPatientId.`);
    return { id: null, label: null, errors };
  }
  errors.push(
    `relatedPatientPhone ${parsed.relatedPatientPhone}: ${hits.length} patients share it — ${hits
      .map((p) => `${p._id} (${p.personal?.name || "—"})`)
      .join("; ")}. Use relatedPatientId.`,
  );
  return { id: null, label: null, errors };
}
