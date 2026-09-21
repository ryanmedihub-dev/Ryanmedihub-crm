import { getExpenseTypes } from '@/constants/expenseCategories';

export { formatCurrency } from '@/lib/financeUI';

// Local: renders "" for a missing date, where financeUI.formatDate renders "—". Callers here
// embed the result in bills/exports where a dash would read as real content.
export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getTransactionCategoryName = (category) => {
  const names = {
    TRANSPLANT: 'Hair Transplant',
    SERVICE: 'PRP/GFC Service',
    MEDICINE: 'Medicine Sale',
    EXPENSE: 'Expense',
  };
  return names[category] || category;
};

export const getTransactionCategoryColor = (category) => {
  const colors = {
    TRANSPLANT: 'bg-blue-100 text-blue-800',
    SERVICE: 'bg-green-100 text-green-800',
    MEDICINE: 'bg-purple-100 text-purple-800',
    EXPENSE: 'bg-red-100 text-red-800',
  };
  return colors[category] || 'bg-gray-100 text-gray-800';
};

export const getPaymentMethodName = (method) => {
  const names = {
    upi: 'UPI',
    cash: 'Cash',
    card: 'Card',
    banking: 'Net Banking',
    bajaj_loan: 'Bajaj Loan',
    fibe_loan: 'Fibe Loan',
    hdfc_skin_bank_transfer: 'HDFC Skin Bank Transfer',
    hdfc_ryan_medihub_bank_transfer: 'HDFC Ryan Medihub Bank Transfer',
    icici_medihub_bank_transfer: 'ICICI Medihub Bank Transfer',
    other: 'Other',
  };
  return names[method] || method;
};

export const generateInvoiceNumber = (category, branch, count) => {
  const prefixes = {
    TRANSPLANT: 'TR',
    SERVICE: 'SRV',
    MEDICINE: 'MED',
    EXPENSE: 'EXP',
  };

  const prefix = prefixes[category] || 'TXN';
  const branchCode = branch?.substring(0, 3).toUpperCase() || 'XXX';
  const year = new Date().getFullYear();
  const number = String(count).padStart(4, '0');

  return `${prefix}-${branchCode}-${year}-${number}`;
};

export const validateTransplantTransaction = (data) => {
  const errors = {};

  if (!data.patientId) {
    errors.patientId = 'Patient is required';
  }

  if (!data.procedure) {
    errors.procedure = 'Procedure is required';
  }

  if (!data.paymentType) {
    errors.paymentType = 'Payment type is required';
  }

  if (!data.amount || data.amount <= 0) {
    errors.amount = 'Amount must be greater than 0';
  }

  if (!data.method) {
    errors.method = 'Payment method is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateServiceTransaction = (data) => {
  const errors = {};

  if (!data.patientId && (!data.patientName || !data.patientPhone)) {
    errors.patient = 'Either select a patient or enter name and phone';
  }

  if (!data.procedure || !['PRP', 'GFC'].includes(data.procedure)) {
    errors.procedure = 'Valid procedure (PRP or GFC) is required';
  }

  if (!data.quantity || data.quantity < 1) {
    errors.quantity = 'Quantity must be at least 1';
  }

  if (!data.perSessionCost || data.perSessionCost <= 0) {
    errors.perSessionCost = 'Per session cost must be greater than 0';
  }

  if (!data.method) {
    errors.method = 'Payment method is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateMedicineTransaction = (data) => {
  const errors = {};

  if (!data.patientId && (!data.patientName || !data.patientPhone)) {
    errors.patient = 'Either select a patient or enter name and phone';
  }

  if (!data.medicineId) {
    errors.medicineId = 'Medicine is required';
  }

  if (!data.quantity || data.quantity < 1) {
    errors.quantity = 'Quantity must be at least 1';
  }

  if (!data.method) {
    errors.method = 'Payment method is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateExpenseTransaction = (data) => {
  const errors = {};

  if (!data.expenseCategory) {
    errors.expenseCategory = 'Expense category is required';
  } else if (getExpenseTypes(data.expenseCategory).length > 0 && !data.expenseType) {
    errors.expenseType = 'Transaction type is required for this category';
  }

  if (!data.expenseGiver?.type) {
    errors.expenseGiverType = 'Expense giver type is required';
  }

  if (data.expenseGiver?.type === 'VENDOR' && !data.expenseGiver.vendorId) {
    errors.vendorId = 'Vendor is required';
  }

  if (data.expenseGiver?.type === 'MANUAL' && !data.expenseGiver.name) {
    errors.expenseGiverName = 'Name is required';
  }

  if (!data.amount || data.amount <= 0) {
    errors.amount = 'Amount must be greater than 0';
  }

  if (!data.method) {
    errors.method = 'Payment method is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const calculateServiceTotal = (quantity, perSessionCost, discount = 0) => {
  if (!quantity || !perSessionCost) return 0;
  return (quantity * perSessionCost) - discount;
};

export const calculateMedicineTotal = (quantity, perUnitCost, discount = 0) => {
  if (!quantity || !perUnitCost) return 0;
  return (quantity * perUnitCost) - discount;
};

export const exportTransactionsToCSV = (transactions, category) => {
  if (!transactions || transactions.length === 0) {
    return '';
  }

  let headers = ['Date', 'Branch', 'Amount', 'Discount', 'Payment Method', 'Transaction ID', 'Remarks'];

  switch (category) {
    case 'TRANSPLANT':
      headers = ['Date', 'Patient Name', 'Phone', 'Procedure', 'Payment Type', 'Amount', 'Discount', 'Method', 'Branch', ...headers.slice(7)];
      break;
    case 'SERVICE':
      headers = ['Date', 'Patient Name', 'Phone', 'Service Type', 'Quantity', 'Per Session Cost', 'Amount', 'Discount', 'Method', 'Branch', ...headers.slice(7)];
      break;
    case 'MEDICINE':
      headers = ['Date', 'Patient Name', 'Phone', 'Medicine', 'Quantity', 'Per Unit Cost', 'Amount', 'Discount', 'Method', 'Branch', ...headers.slice(7)];
      break;
    case 'EXPENSE':
      headers = ['Date', 'Expense Category', 'Expense Type', 'Payee', 'Amount', 'Method', 'Branch', ...headers.slice(7)];
      break;
  }

  const csvRows = [headers.join(',')];

  transactions.forEach(txn => {
    let row = [];

    switch (category) {
      case 'TRANSPLANT':
        row = [
          formatDate(txn.date),
          txn.patient?.name || '',
          txn.patient?.phone || '',
          txn.procedure || '',
          txn.paymentType || '',
          txn.amount || 0,
          txn.discount || 0,
          txn.method || '',
          txn.branch || '',
          txn.paymentId || '',
          txn.remarks || '',
        ];
        break;
      case 'SERVICE':
        row = [
          formatDate(txn.date),
          txn.patient?.name || '',
          txn.patient?.phone || '',
          txn.procedure || '',
          txn.quantity || 0,
          txn.perSessionCost || 0,
          txn.amount || 0,
          txn.discount || 0,
          txn.method || '',
          txn.branch || '',
          txn.paymentId || '',
          txn.remarks || '',
        ];
        break;
      case 'MEDICINE':
        row = [
          formatDate(txn.date),
          txn.patient?.name || '',
          txn.patient?.phone || '',
          txn.medicine?.name || '',
          txn.quantity || 0,
          txn.perUnitCost || 0,
          txn.amount || 0,
          txn.discount || 0,
          txn.method || '',
          txn.branch || '',
          txn.paymentId || '',
          txn.remarks || '',
        ];
        break;
      case 'EXPENSE':
        row = [
          formatDate(txn.date),
          txn.expense || '',
          txn.expenseType || '',
          txn.expenseGiver?.name || '',
          txn.amount || 0,
          txn.method || '',
          txn.branch || '',
          txn.paymentId || '',
          txn.remarks || '',
        ];
        break;
    }

    csvRows.push(row.map(cell => `"${cell}"`).join(','));
  });

  return csvRows.join('\n');
};

export const downloadCSV = (csvContent, filename) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};