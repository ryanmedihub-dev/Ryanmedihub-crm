export const ACCOUNTS = [
  "Cash Book",
  "HDFC Skin",
  "HDFC Medihub",
  "ICICI Medihub",
  "Mumbai Receipts",
  "Cash ( backend )",
  "Paytm ( Delhi T44P )",
  "Paytm ( Noida CK5Y )",
  "Bajaj Loan",
  "Fibe Loan",
  "Pine Lab",
];

export const NON_CASH_METHODS = [
  "offset_settlement",
  "including-package",
  "paid_to_external",
  "paid_by_other",
];

export const UNSETTLED_METHODS = ["paid_to_external", "paid_by_other"];

export const SETTLEMENT_EXCLUSION = { isSettlement: { $ne: true } };

export const FURTHER_MODES = ACCOUNTS;

export const RECEIPT_MODES = [
  "In Cash",
  "Paytm Delhi",
  "Paytm Noida",
  "Pine Lab",
  "Bajaj Statement",
  "Fibe Statement",
  "ICICI Medihub",
  "Mumbai Receipts",
];

const BANK_ROUTING_MAP = {
  Delhi: {
    TRANSPLANT: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Paytm Delhi", furtherMode: "Paytm ( Delhi T44P )" },
      upi: { receiptMode: "Paytm Delhi", furtherMode: "Paytm ( Delhi T44P )" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    SERVICE: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Paytm Delhi", furtherMode: "Paytm ( Delhi T44P )" },
      upi: { receiptMode: "Paytm Delhi", furtherMode: "Paytm ( Delhi T44P )" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    MEDICINE: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Paytm Delhi", furtherMode: "Paytm ( Delhi T44P )" },
      upi: { receiptMode: "ICICI Medihub", furtherMode: "ICICI Medihub" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
  },
  Hyderabad: {
    TRANSPLANT: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Pine Lab", furtherMode: "Pine Lab" },
      upi: { receiptMode: "ICICI Medihub", furtherMode: "ICICI Medihub" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    SERVICE: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Pine Lab", furtherMode: "Pine Lab" },
      upi: { receiptMode: "ICICI Medihub", furtherMode: "ICICI Medihub" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    MEDICINE: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Pine Lab", furtherMode: "Pine Lab" },
      upi: { receiptMode: "ICICI Medihub", furtherMode: "ICICI Medihub" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
  },
  Noida: {
    TRANSPLANT: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" },
      upi: { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    SERVICE: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" },
      upi: { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    MEDICINE: {
      cash: { receiptMode: "In Cash", furtherMode: "Cash Book" },
      card: { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" },
      upi: { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" },
      bajaj_loan: { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
  },
  Mumbai: {
    TRANSPLANT: {
      cash: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      card: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      upi: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      bajaj_loan: { receiptMode: "Mumbai Receipts", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" },
    },
    SERVICE: {
      cash: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      card: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      upi: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      bajaj_loan: { receiptMode: "Mumbai Receipts", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "", furtherMode: "Fibe Loan" },
    },
    MEDICINE: {
      cash: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      card: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      upi: { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" },
      bajaj_loan: { receiptMode: "Mumbai Receipts", furtherMode: "Bajaj Loan" },
      fibe_loan: { receiptMode: "", furtherMode: "Fibe Loan" },
    },
  },
};

export function getBankRoutingDefaults(branch, transactionCategory, method) {
  const entry = BANK_ROUTING_MAP?.[branch]?.[transactionCategory]?.[method];
  return entry ? { ...entry } : { receiptMode: "", furtherMode: "" };
}

const EXPENSE_METHOD_ACCOUNT_MAP = {
  cash: "Cash Book",
  hdfc_skin_bank_transfer: "HDFC Skin",
  hdfc_ryan_medihub_bank_transfer: "HDFC Medihub",
  icici_medihub_bank_transfer: "ICICI Medihub",
};

export function getExpenseFurtherModeDefault(method) {
  return EXPENSE_METHOD_ACCOUNT_MAP[method] || "";
}

export default BANK_ROUTING_MAP;
