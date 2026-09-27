import { getExpenseTypes } from "@/constants/expenseCategories";

export function validateExpenseSection({ expenseData, payableAction, selectedPayableId }) {
  if (payableAction === "create") {
    return "Use the Create Payable button to record this as owed.";
  }
  if (payableAction === "pay" && !selectedPayableId) {
    return "Select which payable this payment is against";
  }

  if (expenseData.expenseSection === "agent") {
    if (!expenseData.employeeId) return "Please select an employee";
    
    
    if (expenseData.agentSubTab === "incentive" && !selectedPayableId) {
      return "Select which open incentive payable this payment is against";
    }
    if (!expenseData.amount) return "Please enter amount";
    return null;
  }
  if (expenseData.expenseSection === "patient") {
    if (!expenseData.patientId) return "Please select a patient";
    if (expenseData.patientSubTab === "commission") {
      if (!expenseData.expenseType) return "Please select a commission type";
      if (expenseData.receiverType === "MANUAL" && !expenseData.receiverName)
        return "Please enter the payee's name";
      if (expenseData.receiverType !== "MANUAL" && !expenseData.receiverId)
        return "Please select the commission recipient";
    }
    if (expenseData.patientSubTab === "expense" && !expenseData.expenseType)
      return "Please select an expense type";
    if (!expenseData.amount) return "Please enter amount";
    return null;
  }
  if (expenseData.expenseSection === "rent") {
    if (!expenseData.rentSubType) return "Please select a sub-type";
    if (!expenseData.amount) return "Please enter amount";
    return null;
  }
  if (!expenseData.expenseCategory) return "Please select expense category";
  if (getExpenseTypes(expenseData.expenseCategory).length > 0 && !expenseData.expenseType)
    return "Please select expense type";
  if (expenseData.isVendor && !expenseData.vendorId) return "Please select a vendor";
  if (!expenseData.isVendor && !expenseData.expenseGiverName) return "Please enter payee name";
  if (!expenseData.amount) return "Please enter amount";
  return null;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function validateExpenseEntry({
  expenseData,
  payableAction,
  selectedPayableId,
  advanceAllocations = [],
  selectedPayable = null,
  nonCashMethods = [],
}) {
  const sectionError = validateExpenseSection({ expenseData, payableAction, selectedPayableId });
  if (sectionError) return sectionError;

  if (!expenseData.branch) return "Select a branch";

  
  
  
  if (!expenseData.furtherMode && !nonCashMethods.includes(expenseData.method)) {
    return "Select which account this payment left from";
  }

  const allocs = advanceAllocations.filter((a) => a && a.advanceId);
  if (allocs.length > 0) {
    if (!selectedPayableId) return "Select which payable these advances settle against";
    for (const a of allocs) {
      const amt = round2(a.amount);
      if (!(amt > 0)) return "Enter how much of the advance to apply";
      if (a.remaining != null && amt > round2(a.remaining) + 0.005) {
        return `An advance allocation (₹${amt.toLocaleString("en-IN")}) is more than that advance has left (₹${round2(a.remaining).toLocaleString("en-IN")})`;
      }
    }
    const applied = round2(allocs.reduce((s, a) => s + round2(a.amount), 0));
    const pending = selectedPayable ? round2(selectedPayable.pending) : null;
    if (pending != null && applied > pending + 0.005) {
      return `Advance applied (₹${applied.toLocaleString("en-IN")}) is more than this payable's outstanding (₹${pending.toLocaleString("en-IN")})`;
    }
    if (pending != null && round2(pending - applied) < 0) {
      return "Net payable cannot be negative";
    }
  }

  if (expenseData.method !== "cash" && !expenseData.paymentId) {
    return expenseData.method === "card"
      ? "Please enter card last no."
      : expenseData.method?.toLowerCase() === "bajaj_loan" || expenseData.method?.toLowerCase() === "fibe_loan"
        ? "Please add the reference id"
        : "Please add transaction id";
  }
  if (
    expenseData.method === "paid_by_other" &&
    (!expenseData.externalParty.name || !expenseData.externalParty.method)
  ) {
    return "Please enter the sender's name and payment method";
  }

  return null;
}
