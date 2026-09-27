import mongoose from "mongoose";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";

export async function withExternalPartyLink(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export const withDbTransaction = withExternalPartyLink;

function toDocKind(partyKind) {
  return partyKind === "MANUAL" ? "OTHER" : partyKind;
}

const REVENUE_CATEGORY_LABEL = {
  TRANSPLANT: "Transplant",
  SERVICE: "Services",
  MEDICINE: "Medicine",
};

export async function createExternalReceivable({
  session,
  amount,
  name,
  method,
  partyKind,
  partyRefId,
  branch,
  transactionCategory,
  relatedPatient,
  actor,
}) {
  const performedBy = { name: actor?.name, email: actor?.email };
  const [receivable] = await Receivable.create(
    [
      {
        payer: {
          kind: toDocKind(partyKind),
          refId: partyKind === "MANUAL" ? null : partyRefId,
          label: name,
        },
        purpose: "OTHER",
        revenueCategory: REVENUE_CATEGORY_LABEL[transactionCategory] || undefined,
        relatedPatient: relatedPatient || undefined,
        totalAmount: amount,
        branch,
        costAlreadyRecognised: true,
        remarks: `Paid to external party — ${name} received ₹${amount} on our behalf (their method: ${method || "unspecified"}).`,
        createdBy: { ...actor, date: new Date() },
        log: [
          {
            action: "Created",
            newValue: String(amount),
            note: `Auto-created from a "Paid to External" revenue transaction`,
            performedBy,
            performedAt: new Date(),
          },
        ],
      },
    ],
    { session, ordered: true },
  );
  return receivable;
}

export async function createExternalPayable({
  session,
  amount,
  name,
  method,
  partyKind,
  partyRefId,
  branch,
  relatedPatient,
  actor,
  
  
  
  
  settledPayableLabel,
}) {
  const performedBy = { name: actor?.name, email: actor?.email };
  const remarks = settledPayableLabel
    ? `Paid by external party — ${name} covered ₹${amount} on our behalf (their method: ${method || "unspecified"}), settling the payable to ${settledPayableLabel}.`
    : `Paid by external party — ${name} covered ₹${amount} on our behalf (their method: ${method || "unspecified"}).`;
  const [payable] = await Payable.create(
    [
      {
        payee: {
          kind: toDocKind(partyKind),
          refId: partyKind === "MANUAL" ? null : partyRefId,
          label: name,
        },
        purpose: "OTHER",
        expenseCategory: "External Payment",
        expenseSubType: "Paid By Other",
        relatedPatient: relatedPatient || undefined,
        totalAmount: amount,
        branch,
        costAlreadyRecognised: true,
        remarks,
        createdBy: { ...actor, date: new Date() },
        log: [
          {
            action: "Created",
            newValue: String(amount),
            note: `Auto-created from a "Paid by Other" expense transaction`,
            performedBy,
            performedAt: new Date(),
          },
        ],
      },
    ],
    { session, ordered: true },
  );
  return payable;
}

async function settledAgainst(kind, id, session) {
  const { default: Transactions } = await import("@/models/Transactions");
  const { unsettledMethodsSync } = await import("@/lib/masterData");
  const UNSETTLED_METHODS = unsettledMethodsSync();

  const match =
    kind === "receivable"
      ? { receivableId: id, costType: "Revenue" }
      : { payableId: id, costType: "Expenses" };

  const [agg] = await Transactions.aggregate([
    { $match: { ...match, approvalStatus: "APPROVED", method: { $nin: UNSETTLED_METHODS } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).session(session || null);

  return agg?.total || 0;
}

export async function syncExternalPartyOnUpdate({
  session,
  transaction,
  nextMethod,
  nextAmount,
  nextExternalParty,
  branch,
  transactionCategory,
  relatedPatient,
  actor,
}) {
  const isExpense =
    transaction.costType === "Expenses" || transaction.transactionCategory === "EXPENSE";
  const externalMethod = isExpense ? "paid_by_other" : "paid_to_external";
  const direction = isExpense ? "PAID_BY" : "RECEIVED_BY";
  const linkField = isExpense ? "linkedPayableId" : "linkedReceivableId";
  const kind = isExpense ? "payable" : "receivable";
  const Model = isExpense ? Payable : Receivable;
  const noun = isExpense ? "payable" : "receivable";

  const linkedId = transaction.externalParty?.[linkField] || null;
  const wasExternal = !!linkedId;
  const isExternalNow = nextMethod === externalMethod;
  const amount = Number(nextAmount);
  const performedBy = { name: actor?.name, email: actor?.email };

  if (!wasExternal && !isExternalNow) return null;

  if (wasExternal && !isExternalNow) {
    const settled = await settledAgainst(kind, linkedId, session);
    if (settled > 0) {
      throw new Error(
        `₹${settled.toLocaleString("en-IN")} has already been settled against the ${noun} this transaction created. ` +
          `Reverse those entries before changing the payment method, or this edit would strand them against a cancelled ${noun}.`,
      );
    }
    await Model.updateOne(
      { _id: linkedId },
      {
        $set: { isCancelled: true },
        $push: {
          log: {
            action: "Cancelled",
            previousValue: "false",
            newValue: "true",
            note: "Source transaction changed away from an external-party method",
            performedBy,
            performedAt: new Date(),
          },
        },
      },
      { session },
    );
    return {
      externalParty: {
        direction: null,
        name: undefined,
        method: undefined,
        partyKind: null,
        partyRefId: null,
        linkedPayableId: null,
        linkedReceivableId: null,
      },
    };
  }

  const partyError = validateExternalParty(nextExternalParty, direction);
  if (partyError) throw new Error(partyError);

  const partyKind = nextExternalParty.partyKind || "MANUAL";
  const partyRefId = partyKind !== "MANUAL" ? nextExternalParty.partyRefId : null;

  if (!wasExternal && isExternalNow) {
    const create = isExpense ? createExternalPayable : createExternalReceivable;
    const doc = await create({
      session,
      amount,
      name: nextExternalParty.name,
      method: nextExternalParty.method,
      partyKind,
      partyRefId,
      branch,
      transactionCategory,
      relatedPatient,
      actor,
    });
    return {
      externalParty: {
        direction,
        name: nextExternalParty.name,
        method: nextExternalParty.method,
        partyKind,
        partyRefId,
        [linkField]: doc._id,
      },
    };
  }

  const existing = await Model.findById(linkedId).session(session || null);
  if (!existing) {
    throw new Error(
      `The ${noun} linked to this transaction no longer exists. Change the method to something else and re-enter it.`,
    );
  }

  const settled = await settledAgainst(kind, linkedId, session);
  if (amount < settled) {
    throw new Error(
      `This transaction cannot be reduced to ₹${amount.toLocaleString("en-IN")} — ₹${settled.toLocaleString("en-IN")} has already been settled against its ${noun}.`,
    );
  }

  if (existing.totalAmount !== amount) {
    existing.log.push({
      action: "Amount Revised",
      previousValue: String(existing.totalAmount),
      newValue: String(amount),
      note: "Source transaction amount edited",
      performedBy,
      performedAt: new Date(),
    });
    existing.totalAmount = amount;
  }

  const partySide = isExpense ? existing.payee : existing.payer;
  if (partySide && partySide.label !== nextExternalParty.name) {
    existing.log.push({
      action: "Note Added",
      note: `Party renamed from "${partySide.label}" to "${nextExternalParty.name}" on the source transaction`,
      performedBy,
      performedAt: new Date(),
    });
    partySide.label = nextExternalParty.name;
    partySide.kind = partyKind === "MANUAL" ? "OTHER" : partyKind;
    partySide.refId = partyRefId;
  }

  if (existing.isCancelled) {
    existing.isCancelled = false;
    existing.log.push({
      action: "Cancelled",
      previousValue: "true",
      newValue: "false",
      note: "Reinstated — source transaction is external again",
      performedBy,
      performedAt: new Date(),
    });
  }

  await existing.save({ session });

  return {
    externalParty: {
      direction,
      name: nextExternalParty.name,
      method: nextExternalParty.method,
      partyKind,
      partyRefId,
      [linkField]: existing._id,
    },
  };
}

export function validateExternalParty(externalParty, direction) {
  const who = direction === "RECEIVED_BY" ? "Receiver" : "Sender";
  if (!externalParty || typeof externalParty !== "object") {
    return `${who} details are required for this payment method`;
  }
  if (!externalParty.name || !String(externalParty.name).trim()) {
    return `${who} name is required`;
  }
  if (!externalParty.method) {
    return `${who} payment method is required`;
  }
  const kind = externalParty.partyKind || "MANUAL";
  if (!["VENDOR", "EMPLOYEE", "PATIENT", "MANUAL"].includes(kind)) {
    return "Invalid party type";
  }
  if (kind !== "MANUAL" && !externalParty.partyRefId) {
    return `Select a specific ${kind.toLowerCase()}, or switch to manual entry`;
  }
  return null;
}
