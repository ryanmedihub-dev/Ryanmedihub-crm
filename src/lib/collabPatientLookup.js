import CollabCase from "@/models/CollabCase";
import Patient from "@/models/Patient";

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
