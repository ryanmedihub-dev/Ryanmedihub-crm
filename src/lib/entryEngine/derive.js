

export const CATEGORY_TO_PAYABLE_PURPOSE = {
  Rent: "RENT",
  "Electricity Bill": "ELECTRICITY",
  "Collab Clinic Payment": "COLLAB_CLINIC",
  Salary: "SALARY",
  Incentive: "INCENTIVE",
  Commision: "PATIENT_COMMISSION",
  "Medical Consumables": "MEDICAL_CONSUMABLES",
  "Medicine Procurement": "MEDICINE_PROCUREMENT",
  "Professional Expenses": "PROFESSIONAL_EXPENSES",
  "Lab Expenses": "LAB_EXPENSES",
  "Interest Expenses": "INTEREST_EXPENSES",
  Taxes: "TAX",
  "Hardware Rental Expenses": "HARDWARE_RENTAL",
  "Software Rental Expenses": "SOFTWARE_RENTAL",
};

export const PAYABLE_PURPOSE_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_TO_PAYABLE_PURPOSE).map(([category, purpose]) => [purpose, category]),
);

export const PAYABLE_CATEGORY_TO_FIXED_KIND = {
  Rent: "RENT_UNIT",
  "Electricity Bill": "UTILITY_UNIT",
  "Collab Clinic Payment": "COLLAB_CLINIC",
};

export function purposeForCategory(category) {
  return CATEGORY_TO_PAYABLE_PURPOSE[category] || null;
}

export function categoryForPurpose(purpose) {
  return PAYABLE_PURPOSE_TO_CATEGORY[purpose] || null;
}

const TYPE_TRANSACTION_SHAPE = {
  "revenue.transplant": { transactionCategory: "TRANSPLANT", costType: "Revenue" },
  "revenue.service": { transactionCategory: "SERVICE", costType: "Revenue" },
  "revenue.medicine": { transactionCategory: "MEDICINE", costType: "Revenue" },
  "expense.agent.salary": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.agent.incentive": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.patient.commission": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.patient.refund": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.patient.other": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.head": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "expense.vendor": { transactionCategory: "EXPENSE", costType: "Expenses" },
  "payable.settle": { transactionCategory: "EXPENSE", costType: "Expenses" },
};

export function transactionShapeForType(typeKey) {
  return TYPE_TRANSACTION_SHAPE[typeKey] || null;
}

const REVENUE_CATEGORY_TO_TRANSACTION_CATEGORY = {
  transplant: "TRANSPLANT",
  service: "SERVICE",
  services: "SERVICE",
  medicine: "MEDICINE",
};

export function deriveReceiptTransactionCategory(revenueCategory) {
  return REVENUE_CATEGORY_TO_TRANSACTION_CATEGORY[String(revenueCategory || "").toLowerCase()];
}

export function deriveIsSettlement(targetDoc) {
  return targetDoc?.costAlreadyRecognised === true;
}

export const EXPENSE_NO_GIVER_CATEGORIES = [
  "Salary",
  "Incentive",
  "Commision",
  "Patient Related Expenses",
  "Rent",
  "Electricity Bill",
  "Collab Clinic Payment",
];

export function expenseNeedsGiver(expenseCategory) {
  return !EXPENSE_NO_GIVER_CATEGORIES.includes(expenseCategory);
}

export const MONTHLY_PAYABLE_PURPOSES = ["SALARY", "RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"];

export function isPeriodicPurpose(purpose) {
  return MONTHLY_PAYABLE_PURPOSES.includes(purpose);
}
