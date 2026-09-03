export const PAYABLE_PURPOSES = [
  "SALARY",
  "INCENTIVE",
  "RENT",
  "ELECTRICITY",
  "COLLAB_CLINIC",
  "PATIENT_COMMISSION",
  "TAX",
  "MEDICAL_CONSUMABLES",
  "MEDICINE_PROCUREMENT",
  "PROFESSIONAL_EXPENSES",
  "LAB_EXPENSES",
  "INTEREST_EXPENSES",
  "SOFTWARE_RENTAL",
  "HARDWARE_RENTAL",
  "OTHER",
];

export const PAYABLE_PURPOSE_LABELS = {
  SALARY: "Salary",
  INCENTIVE: "Incentive",
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  COLLAB_CLINIC: "Collab Clinic",
  PATIENT_COMMISSION: "Patient Commission",
  TAX: "Tax",
  MEDICAL_CONSUMABLES: "Medical Consumables",
  MEDICINE_PROCUREMENT: "Medicine Procurement",
  PROFESSIONAL_EXPENSES: "Professional Expenses",
  LAB_EXPENSES: "Lab Expenses",
  INTEREST_EXPENSES: "Interest Expenses",
  SOFTWARE_RENTAL: "Software Rental",
  HARDWARE_RENTAL: "Hardware Rental",
  OTHER: "Other",
};

export const payablePurposeLabel = (v) =>
  PAYABLE_PURPOSE_LABELS[v] || (v || "").replace(/_/g, " ");
