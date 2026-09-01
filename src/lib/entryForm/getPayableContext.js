
export const PAYABLE_CATEGORY_PURPOSE = {
  "Rent": "RENT",
  "Electricity Bill": "ELECTRICITY",
  "Medical Consumables": "MEDICAL_CONSUMABLES",
  "Medicine Procurement": "MEDICINE_PROCUREMENT",
  "Professional Expenses": "PROFESSIONAL_EXPENSES",
  "Lab Expenses": "LAB_EXPENSES",
  "Interest Expenses": "INTEREST_EXPENSES",
  "Taxes": "TAX",
  "Hardware Rental Expenses": "HARDWARE_RENTAL",
};
export const PAYABLE_CATEGORY_KIND = {
  "Rent": "RENT_UNIT",
  "Electricity Bill": "UTILITY_UNIT",
};

export function getPayableContext({ expenseData, employees, employeeCache, patients, patientCache, vendors }) {
  const d = expenseData;

  if (d.expenseSection === "agent") {
    if (!d.employeeId) return null;
    const emp = employeeCache[d.employeeId] || employees.find((e) => e._id === d.employeeId);
    const label = emp?.name || "Employee";
    if (d.agentSubTab === "salary") {
      return {
        purpose: "SALARY",
        payeeKind: "EMPLOYEE",
        payeeRefId: d.employeeId,
        payeeLabel: label,
        expenseCategory: "Salary",
        expenseSubType: "Salary",
        period: { month: d.salaryMonth, year: d.salaryYear },
        relatedPatient: null,
        branch: d.branch,
        giver: { type: "EMPLOYEE", refId: d.employeeId, name: label },
      };
    }
    return {
      purpose: "INCENTIVE",
      payeeKind: "EMPLOYEE",
      payeeRefId: d.employeeId,
      payeeLabel: label,
      expenseCategory: "Incentive",
      expenseSubType: d.expenseType,
      period: null,
      relatedPatient: d.patientId || null,
      branch: d.branch,
      giver: { type: "EMPLOYEE", refId: d.employeeId, name: label },
    };
  }

  if (d.expenseSection === "patient" && d.patientSubTab === "commission") {
    if (!d.patientId) return null;
    let receiverLabel = "";
    let receiverKind = "OTHER";
    let receiverRefId = null;
    if (d.receiverType === "MANUAL") {
      receiverLabel = d.receiverName;
    } else if (d.receiverType === "Patient") {
      const pat = patientCache[d.receiverId] || patients.find((p) => p._id === d.receiverId);
      receiverLabel = pat?.personal?.name || "";
      receiverKind = "PATIENT";
      receiverRefId = d.receiverId;
    } else {
      const emp = employeeCache[d.receiverId] || employees.find((e) => e._id === d.receiverId);
      receiverLabel = emp?.name || "";
      receiverKind = "EMPLOYEE";
      receiverRefId = d.receiverId;
    }
    return {
      purpose: "PATIENT_COMMISSION",
      payeeKind: receiverKind,
      payeeRefId: receiverRefId,
      payeeLabel: receiverLabel || "Payee",
      expenseCategory: "Commision",
      expenseSubType: d.expenseType,
      period: null,
      relatedPatient: d.patientId,
      branch: d.branch,
      giver: {
        type: d.receiverType === "MANUAL" ? "MANUAL" : d.receiverType === "Patient" ? "PATIENT" : "EMPLOYEE",
        refId: d.receiverType === "MANUAL" ? null : d.receiverId,
        name: receiverLabel,
      },
    };
  }

  if (d.expenseSection === "rent") {
    if (!d.rentSubType) return null;
    const purpose = PAYABLE_CATEGORY_PURPOSE[d.payableCategory];
    if (!purpose) return null;

    const vendor = d.payableVendorId ? vendors.find((v) => v._id === d.payableVendorId) : null;

    return {
      purpose,
      payeeKind: vendor ? "VENDOR" : PAYABLE_CATEGORY_KIND[d.payableCategory] || "OTHER",
      payeeRefId: vendor ? vendor._id : null,
      payeeLabel: vendor ? vendor.name : d.rentSubType,
      expenseCategory: d.payableCategory,
      expenseSubType: d.rentSubType,
      period: null,
      relatedPatient: null,
      branch: d.branch,
      giver: vendor ? { type: "VENDOR", refId: vendor._id, name: vendor.name } : null,
    };
  }

  return null;
}
