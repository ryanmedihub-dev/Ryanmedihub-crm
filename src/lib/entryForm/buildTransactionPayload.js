import { computeTaxBreakdown, toTaxDetails } from "@/lib/taxMath";
import { expenseNeedsGiver } from "@/lib/entryEngine/derive";

export function buildExpensePayload({
  expenseData,
  payableAction,
  selectedPayableId,
  allowOverpayment,
  advanceAllocations = [],
  employees,
  employeeCache,
  patients,
  patientCache,
  patientOptions,
  employeeOptions,
  vendors,
}) {
  const common = {
    method: expenseData.method,
    paymentId: expenseData.paymentId,
    branch: expenseData.branch,
    date: expenseData.date,
    remarks: expenseData.remarks,
    receipts: expenseData.receipts,
    furtherMode: expenseData.furtherMode,
    externalParty: expenseData.method === "paid_by_other" ? expenseData.externalParty : undefined,
    ...(payableAction === "pay" ? { payableId: selectedPayableId, allowOverpayment } : {}),
    // `expenseData.amount` is already the NET (payable pending − advance applied), auto-set and
    // locked by the form while allocations are active — so every branch below stays as-is.
    ...(advanceAllocations.length
      ? {
          advanceSettlements: advanceAllocations.map((a) => ({
            advanceId: a.advanceId,
            amount: Number(a.amount),
          })),
        }
      : {}),
  };

  if (expenseData.expenseSection === "agent") {
    const isSalary = expenseData.agentSubTab === "salary";
    const emp = employeeCache[expenseData.employeeId] || employees.find((e) => e._id === expenseData.employeeId);
    return {
      ...common,
      expenseCategory: isSalary ? "Salary" : "Incentive",
      // The incentive sub-tab is pay-only against an existing payable and no longer collects
      // an incentive type / related patient, so fall back to a generic label.
      expenseType: isSalary ? "Salary" : expenseData.expenseType || "Incentive",
      patientId: !isSalary && expenseData.patientId ? expenseData.patientId : undefined,
      expenseGiver: {
        type: "EMPLOYEE",
        refId: expenseData.employeeId,
        name: emp?.name || "",
      },
      amount: expenseData.amount,
    };
  }

  if (expenseData.expenseSection === "patient") {
    if (expenseData.patientSubTab === "commission") {
      const receiverName =
        expenseData.receiverType === "MANUAL"
          ? expenseData.receiverName
          : expenseData.receiverType === "Patient"
            ? patientOptions.find((p) => p._id === expenseData.receiverId)?.personal?.name || ""
            : employeeOptions.find((e) => e._id === expenseData.receiverId)?.name || "";
      const giverType =
        expenseData.receiverType === "MANUAL"
          ? "MANUAL"
          : expenseData.receiverType === "Patient"
            ? "PATIENT"
            : "EMPLOYEE";

      return {
        ...common,
        expenseCategory: "Commision",
        expenseType: expenseData.expenseType,
        patientId: expenseData.patientId,
        amount: expenseData.amount,
        expenseGiver: {
          type: giverType,
          refId: expenseData.receiverType === "MANUAL" ? undefined : expenseData.receiverId,
          name: receiverName,
        },
        commissionReceiver: {
          type: giverType,
          refId: expenseData.receiverType === "MANUAL" ? undefined : expenseData.receiverId,
          name: receiverName,
        },
      };
    }

    const pat = patientCache[expenseData.patientId] || patients.find((p) => p._id === expenseData.patientId);
    const patientGiver = {
      type: "PATIENT",
      refId: expenseData.patientId,
      name: pat?.personal?.name || "",
    };

    if (expenseData.patientSubTab === "refund") {
      return {
        ...common,
        expenseCategory: "Patient Related Expenses",
        expenseType: "Patient Refunds",
        patientId: expenseData.patientId,
        amount: expenseData.amount,
        expenseGiver: patientGiver,
      };
    }
    return {
      ...common,
      expenseCategory: "Patient Related Expenses",
      expenseType: expenseData.expenseType,
      patientId: expenseData.patientId,
      amount: expenseData.amount,
      expenseGiver: patientGiver,
    };
  }

  if (expenseData.expenseSection === "rent") {
    const rentVendor = expenseData.payableVendorId
      ? vendors.find((v) => v._id === expenseData.payableVendorId)
      : null;
    // Categories outside the server's NO_GIVER list (e.g. Professional Expenses, Medical
    // Consumables) require a giver — fall back to a MANUAL payee named after the sub-type
    // ("the shared bucket") when no specific vendor was picked. Rent/Electricity/Collab Clinic
    // Payment stay giver-less, matching how they've always been recorded.
    const rentGiver = rentVendor
      ? { type: "VENDOR", vendorId: rentVendor._id, name: rentVendor.name }
      : expenseNeedsGiver(expenseData.payableCategory)
        ? { type: "MANUAL", name: expenseData.rentSubType || expenseData.payableCategory }
        : undefined;
    return {
      ...common,
      expenseCategory: expenseData.payableCategory,
      expenseType: expenseData.rentSubType,
      amount: expenseData.amount,
      expenseGiver: rentGiver,
    };
  }

  const vendor = vendors.find((v) => v._id === expenseData.vendorId);
  const directTax = computeTaxBreakdown({
    baseAmount: expenseData.amount,
    includeGST: expenseData.includeGST,
    gstRate: expenseData.gstRate,
    gstAmount: expenseData.gstAmount,
  });
  return {
    ...common,
    expenseCategory: expenseData.expenseCategory,
    expenseType: expenseData.expenseType,
    expenseGiver: {
      type: expenseData.isVendor ? "VENDOR" : "MANUAL",
      vendorId: expenseData.isVendor ? expenseData.vendorId : "",
      name: expenseData.isVendor ? vendor?.name : expenseData.expenseGiverName,
    },
    amount: expenseData.includeGST ? directTax.invoiceTotal : expenseData.amount,
    ...(expenseData.includeGST ? { taxDetails: toTaxDetails(directTax) } : {}),
  };
}
