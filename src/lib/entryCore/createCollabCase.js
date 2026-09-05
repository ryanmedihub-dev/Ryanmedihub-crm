// Extracted from collab-settlement/cases/create/route.js's POST handler — used by
// "collab.case". Per the project's guardrails, collabDerivation.js (createCollabCaseAtomic)
// is read and called, never modified — this module only carries the route's OWN
// pre-validation (the package/discount/share bounds checks that live in the route, not in
// collabDerivation.js).

import Patient from "@/models/Patient";
import { createCollabCaseAtomic } from "@/lib/collabDerivation";
import { COLLAB_BRANCHES } from "@/lib/branches";

export async function createCollabCase({ payload, session: authSession }) {
  const { patient, clinic, clinicShare, discount, ourReceived, clinicReceived, procedure, method, paymentId, receiptMode, furtherMode, date, remarks } = payload;

  if (!patient || !clinic || !procedure) return { error: "Patient, clinic and procedure are required", status: 400 };
  if (!COLLAB_BRANCHES.includes(clinic)) return { error: "Invalid clinic — collab cases can only be created for partner clinics", status: 400 };

  const patientDoc = await Patient.findById(patient).select("personal.name payments.totalAmount").lean();
  if (!patientDoc) return { error: "Patient not found", status: 404 };

  const grossPackage = patientDoc.payments?.totalAmount || 0;
  if (grossPackage <= 0) {
    return { error: "This patient has no final package set. Set the patient's package (counselling → final package) before creating a collab case.", status: 400 };
  }

  const discountNum = Number(discount) || 0;
  if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > grossPackage) {
    return { error: `Discount must be between 0 and the package total (${grossPackage})`, status: 400 };
  }
  const totalPackage = Math.round((grossPackage - discountNum) * 100) / 100;
  if (totalPackage <= 0) return { error: "Net chargeable amount after discount must be greater than zero", status: 400 };

  const clinicShareNum = Number(clinicShare);
  const ourReceivedNum = Number(ourReceived) || 0;
  const clinicReceivedNum = Number(clinicReceived) || 0;
  if (!Number.isFinite(clinicShareNum) || clinicShareNum < 0) return { error: "Clinic share must be a non-negative number", status: 400 };
  const ourShareNum = Math.round((totalPackage - clinicShareNum) * 100) / 100;
  if (ourShareNum < 0) return { error: `Clinic share (${clinicShareNum}) cannot exceed the package total (${totalPackage})`, status: 400 };
  if (ourReceivedNum < 0 || clinicReceivedNum < 0) return { error: "Collected amounts cannot be negative", status: 400 };
  if (ourReceivedNum + clinicReceivedNum - totalPackage > 0.01) {
    return { error: `Collected amount exceeds the package: ${ourReceivedNum} + ${clinicReceivedNum} = ${ourReceivedNum + clinicReceivedNum}, package is ${totalPackage}`, status: 400 };
  }

  const result = await createCollabCaseAtomic({
    patientId: patient, patientName: patientDoc.personal?.name, clinic, procedure, totalPackage, discount: discountNum,
    ourShare: ourShareNum, clinicShare: clinicShareNum, ourReceived: ourReceivedNum, clinicReceived: clinicReceivedNum,
    method, paymentId, receiptMode, furtherMode, date, remarks,
    actor: { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch },
  });

  return { data: result.collabCase, summary: result.summary, status: 201 };
}
