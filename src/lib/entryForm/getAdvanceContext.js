

export function getAdvanceContext({ expenseData, employees, employeeCache, patients, patientCache, vendors }) {
  const d = expenseData;
  const emp = (id) => employeeCache?.[id] || employees?.find((e) => e._id === id);
  const pat = (id) => patientCache?.[id] || patients?.find((p) => p._id === id);

  
  if (d.expenseSection === "agent") {
    if (!d.employeeId) return null;
    return { kind: "EMPLOYEE", refId: d.employeeId, label: emp(d.employeeId)?.name || "Employee" };
  }

  
  if (d.expenseSection === "patient" && d.patientSubTab === "commission") {
    if (d.receiverType === "MANUAL" || !d.receiverId) return null;
    if (d.receiverType === "Patient") {
      return { kind: "PATIENT", refId: d.receiverId, label: pat(d.receiverId)?.personal?.name || "Patient" };
    }
    return { kind: "EMPLOYEE", refId: d.receiverId, label: emp(d.receiverId)?.name || "Employee" };
  }

  
  if (d.expenseSection === "rent") {
    if (!d.payableVendorId) return null;
    const v = vendors?.find((x) => x._id === d.payableVendorId);
    if (!v) return null;
    return { kind: "VENDOR", refId: d.payableVendorId, label: v.name };
  }

  return null;
}
