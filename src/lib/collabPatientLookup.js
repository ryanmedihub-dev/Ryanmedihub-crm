import CollabCase from "@/models/CollabCase";
import Patient from "@/models/Patient";

/**
 * A collab clinic's payable/receivable carries the CLINIC as the party — the patient the
 * money is actually about sits one hop away on the CollabCase that crystallised the
 * document. Without this join the assets and liabilities pages show "Patna" with no way to
 * tell which patient's case it came from.
 *
 * Mutates `rows` in place, adding `collabPatient` to any row that came from a collab case:
 *   { name, phone, branch, clinic, caseId, packageAmount, clinicShare, procedure }
 * Rows with no collab case are left untouched.
 *
 * @param rows  document rows carrying `_id` (the Payable/Receivable id)
 * @param linkField "clinicSharePayable" | "clinicShareReceivable"
 */
export async function attachCollabPatients(rows, linkField) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const ids = rows.map((r) => r._id).filter(Boolean);
  if (ids.length === 0) return rows;

  const cases = await CollabCase.find({ [linkField]: { $in: ids } })
    .select(`${linkField} patient clinic packageAmount clinicShare procedure status`)
    .populate({ path: "patient", model: Patient, select: "personal.name personal.phone personal.branch" })
    .lean();

  if (cases.length === 0) return rows;

  const byDoc = new Map(cases.map((c) => [String(c[linkField]), c]));

  for (const row of rows) {
    const c = byDoc.get(String(row._id));
    if (!c) continue;
    row.collabPatient = {
      name: c.patient?.personal?.name || "",
      phone: c.patient?.personal?.phone || "",
      branch: c.patient?.personal?.branch || "",
      clinic: c.clinic || "",
      caseId: String(c._id),
      caseStatus: c.status || "",
      packageAmount: c.packageAmount ?? null,
      clinicShare: c.clinicShare ?? null,
      procedure: c.procedure || "",
    };
  }

  return rows;
}
