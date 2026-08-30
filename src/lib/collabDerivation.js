import mongoose from "mongoose";
import Transactions from "@/models/Transactions";
import CollabCase from "@/models/CollabCase";
import Patient from "@/models/Patient";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { deriveClinicSettlement, round2 } from "@/lib/collabFormula";
import { checkPeriodLock } from "@/lib/periodLock";
import { reverseTransaction, ReversalError } from "@/lib/reverseTransaction";

export { deriveClinicSettlement };

const TRANSPLANT_PROCEDURES = ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"];
const SERVICE_PROCEDURES = ["PRP", "GFC", "Alopecia", "Headwash", "Canacot"];

function categoryForProcedure(procedure) {
  if (TRANSPLANT_PROCEDURES.includes(procedure)) return "TRANSPLANT";
  if (SERVICE_PROCEDURES.includes(procedure)) return "SERVICE";
  if (procedure === "Medicine") return "MEDICINE";
  return "SERVICE";
}

async function assertNotLocked(furtherMode, date, label) {
  const reason = await checkPeriodLock({ furtherMode: furtherMode || "", date });
  if (reason) {
    throw new Error(`Cannot record ${label}: ${reason}`);
  }
}

async function createCollectionTransaction({
  session,
  collabCase,
  patientId,
  procedure,
  amount,
  discount = 0,
  collectedBy,
  method,
  paymentId,
  receiptMode,
  furtherMode,
  collectionMode,
  branch,
  when,
  remarks,
  createdBy,
}) {
  if (collectedBy === "US") {
    await assertNotLocked(furtherMode, when, "this collection");

    const [transaction] = await Transactions.create(
      [
        {
          transactionCategory: categoryForProcedure(procedure),
          costType: "Revenue",
          patient: patientId,
          procedure,
          amount,
          discount: discount || 0,
          method: method || "cash",
          paymentId: paymentId || "",
          receiptMode: receiptMode || "",
          furtherMode: furtherMode || "",
          branch,
          date: when,
          remarks: remarks || "",
          approvalStatus: "APPROVED",
          collabRef: { caseId: collabCase._id },
          createdBy,
        },
      ],
      { session, ordered: true },
    );

    const patient = await Patient.findById(patientId).session(session);
    if (patient) {
      patient.payments = patient.payments || {};
      patient.payments.amountReceived = round2((patient.payments.amountReceived || 0) + amount);
      patient.payments.transactions = patient.payments.transactions || [];
      patient.payments.transactions.push(transaction._id);

      const linkedTransactions = await Transactions.find({
        _id: { $in: patient.payments.transactions },
        costType: "Revenue",
      }).session(session);
      patient.payments.discount = round2(
        linkedTransactions.reduce((sum, t) => sum + (t.discount || 0), 0),
      );

      const total = patient.payments.totalAmount || patient.counselling?.finlpackage || 0;
      patient.payments.pendingAmount = Math.max(
        0,
        round2(total - patient.payments.amountReceived - patient.payments.discount),
      );
      await patient.save({ session });
    }

    return transaction;
  }

  await assertNotLocked("", when, "this collection");

  const [transaction] = await Transactions.create(
    [
      {
        transactionCategory: categoryForProcedure(procedure),
        costType: "Revenue",
        patient: patientId,
        procedure,
        amount,
        discount: discount || 0,
        method: "paid_to_external",
        paymentId: paymentId || "",
        receiptMode: "",
        furtherMode: "",
        branch,
        date: when,
        remarks: remarks || "",
        approvalStatus: "APPROVED",
        externalParty: {
          direction: "RECEIVED_BY",
          name: branch,
          partyKind: "MANUAL",
          method: collectionMode || "",
        },
        collabRef: { caseId: collabCase._id },
        createdBy,
      },
    ],
    { session, ordered: true },
  );

  return transaction;
}

async function growClinicReceivable({
  session,
  collabCase,
  newCumulativeClinicReceived,
  branch,
  procedure,
  patientId,
  performedBy,
  noteSuffix = "",
}) {
  let receivableId = collabCase.clinicShareReceivable;
  if (collabCase.clinicShareReceivable) {
    await resizeClinicReceivable({
      session,
      receivableId: collabCase.clinicShareReceivable,
      newTotal: newCumulativeClinicReceived,
      note: `Resized after a new clinic collection${noteSuffix}`,
      performedBy,
    });
  } else {
    const [receivable] = await Receivable.create(
      [
        {
          payer: { kind: "COLLAB_CLINIC", label: branch },
          purpose: "COLLAB_SETTLEMENT",
          revenueCategory: categoryForProcedure(procedure),
          relatedPatient: patientId,
          totalAmount: newCumulativeClinicReceived,
          branch,
          costAlreadyRecognised: true,
          remarks: `Collab settlement — money ${branch} has collected on this case's behalf`,
          createdBy: performedBy,
          log: [
            {
              action: "Created",
              newValue: String(newCumulativeClinicReceived),
              note: `Raised for the full amount ${branch} has collected so far${noteSuffix}`,
              performedBy,
              performedAt: new Date(),
            },
          ],
        },
      ],
      { session, ordered: true },
    );
    receivableId = receivable._id;
    collabCase.clinicShareReceivable = receivableId;
    await collabCase.save({ session });
  }

  return receivableId;
}

async function resizeClinicReceivable({ session, receivableId, newTotal, note, performedBy }) {
  const receivable = await Receivable.findById(receivableId).session(session);
  if (!receivable || receivable.totalAmount === newTotal) return;
  receivable.log.push({
    action: "Amount Revised",
    previousValue: String(receivable.totalAmount),
    newValue: String(newTotal),
    note,
    performedBy,
    performedAt: new Date(),
  });
  receivable.totalAmount = newTotal;
  await receivable.save({ session });
}

async function cumulativeClinicReceived(caseId, session) {
  const [agg] = await Transactions.aggregate([
    {
      $match: {
        "collabRef.caseId": caseId,
        costType: "Revenue",
        method: "paid_to_external",
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).session(session || null);
  return agg?.total || 0;
}

export async function computeCaseBalance(caseId, session = null) {
  const [agg] = await Transactions.aggregate([
    {
      $match: {
        "collabRef.caseId": caseId,
        costType: "Revenue",
        approvalStatus: { $nin: ["PENDING", "REJECTED"] },
        receivableId: null,
      },
    },
    { $group: { _id: null, totalCollected: { $sum: "$amount" }, totalDiscount: { $sum: "$discount" } } },
  ]).session(session || null);
  return { totalCollected: agg?.totalCollected || 0, totalDiscount: agg?.totalDiscount || 0 };
}

export function isFullyCollected(collabCase, balance) {
  return round2(collabCase.packageAmount - balance.totalCollected - balance.totalDiscount) <= 0.005;
}

export async function crystalliseClinicShare({
  session,
  collabCase,
  branch,
  procedure,
  patientId,
  when,
  createdBy,
  performedBy,
  noteSuffix = "",
}) {
  if (collabCase.clinicShareSettledAt) return;

  const S = collabCase.clinicShare || 0;
  const C = await cumulativeClinicReceived(collabCase._id, session);

  const postOffsetPair = async (amount) => {
    if (amount <= 0.005) return;
    await assertNotLocked("", when, "the clinic-share expense");
    await Transactions.create(
      [
        {
          transactionCategory: "EXPENSE",
          costType: "Expenses",
          expense: "Collab Clinic Payment",
          expenseType: "Collab Clinic Payment",
          expenseGiver: { type: "MANUAL", name: branch },
          amount,
          method: "offset_settlement",
          furtherMode: "",
          branch,
          date: when,
          remarks: `Clinic share crystallised — ${branch} kept this out of money it collected${noteSuffix}`,
          approvalStatus: "APPROVED",
          collabRef: { caseId: collabCase._id, crystallisation: true },
          createdBy,
        },
      ],
      { session, ordered: true },
    );

    if (collabCase.clinicShareReceivable) {
      await Transactions.create(
        [
          {
            transactionCategory: categoryForProcedure(procedure),
            costType: "Revenue",
            procedure,
            amount,
            method: "offset_settlement",
            receivableId: collabCase.clinicShareReceivable,
            isSettlement: true,
            branch,
            date: when,
            remarks: `Clinic share crystallised — offset against money ${branch} collected${noteSuffix}`,
            approvalStatus: "APPROVED",
            collabRef: { caseId: collabCase._id, crystallisation: true },
            createdBy,
          },
        ],
        { session, ordered: true },
      );
    }
  };

  if (C >= S) {
    await postOffsetPair(S);
  } else {
    const shortfall = round2(S - C);
    if (shortfall > 0.005) {
      await assertNotLocked("", when, "the clinic-share payable");
      const [payable] = await Payable.create(
        [
          {
            payee: { kind: "COLLAB_CLINIC", label: branch },
            purpose: "COLLAB_CLINIC",
            expenseCategory: "Collab Clinic Payment",
            expenseSubType: "Collab Clinic Payment",
            relatedPatient: patientId,
            totalAmount: shortfall,
            branch,
            costAlreadyRecognised: false,
            remarks: `Collab clinic fee shortfall — crystallised at case completion${noteSuffix}`,
            createdBy,
            log: [
              {
                action: "Created",
                newValue: String(shortfall),
                note: `Crystallised — clinic collected ₹${C} of its ₹${S} fee`,
                performedBy,
                performedAt: new Date(),
              },
            ],
          },
        ],
        { session, ordered: true },
      );
      collabCase.clinicSharePayable = payable._id;
    }
    await postOffsetPair(C);
  }

  collabCase.clinicShareSettledAt = new Date();
  collabCase.log.push({
    action: "Clinic Share Crystallised",
    newValue: String(S),
    note: `Clinic collected ₹${C} of its ₹${S} fee${noteSuffix}`,
    performedBy,
    performedAt: new Date(),
  });
  await collabCase.save({ session });
}

export async function unwindClinicShareCrystallisation({ session, collabCase, actor, reason }) {
  if (!collabCase.clinicShareSettledAt) return { unwound: false };

  const performedBy = { name: actor?.name, email: actor?.email };

  if (collabCase.clinicSharePayable) {
    const realPayments = await Transactions.countDocuments({
      payableId: collabCase.clinicSharePayable,
      "collabRef.crystallisation": { $ne: true },
    }).session(session);
    if (realPayments > 0) {
      throw new ReversalError(409, {
        error:
          `Cannot unwind this case's clinic-share crystallisation: ${realPayments} payment(s) ` +
          `have already been settled against its clinic payable. Reverse or reallocate ` +
          `${realPayments === 1 ? "that settlement" : "those settlements"} first.`,
      });
    }
  }

  const crystallisationTx = await Transactions.find({
    "collabRef.caseId": collabCase._id,
    "collabRef.crystallisation": true,
    reversalOf: { $exists: false },
    isReversed: { $ne: true },
  }).session(session);

  for (const tx of crystallisationTx) {
    await reverseTransaction({
      transactionId: tx._id,
      reason: reason || "Clinic share crystallisation unwound",
      actor,
      dbSession: session,
    });
  }

  if (collabCase.clinicSharePayable) {
    const payable = await Payable.findById(collabCase.clinicSharePayable).session(session);
    if (payable && !payable.isCancelled) {
      payable.isCancelled = true;
      payable.log.push({
        action: "Cancelled",
        previousValue: "false",
        newValue: "true",
        note: "Clinic-share crystallisation unwound — a reversed collection brought the case back under its package total",
        performedBy,
        performedAt: new Date(),
      });
      await payable.save({ session });
    }
    collabCase.clinicSharePayable = null;
  }

  if (collabCase.clinicShareReceivable) {
    const C = await cumulativeClinicReceived(collabCase._id, session);
    await resizeClinicReceivable({
      session,
      receivableId: collabCase.clinicShareReceivable,
      newTotal: C,
      note: "Resized back to the cumulative clinic-collected total — crystallisation unwound",
      performedBy,
    });
  }

  collabCase.clinicShareSettledAt = null;
  collabCase.log.push({
    action: "Note Added",
    note: "Clinic-share crystallisation unwound — case dropped back under its package total",
    performedBy,
    performedAt: new Date(),
  });
  await collabCase.save({ session });

  return { unwound: true };
}

export async function createCollabCaseAtomic({
  patientId,
  patientName,
  clinic,
  procedure,
  totalPackage,
  discount = 0,
  ourShare,
  clinicShare,
  ourReceived,
  clinicReceived,
  method,
  paymentId,
  receiptMode,
  furtherMode,
  date,
  remarks,
  actor,
}) {
  if (!COLLAB_BRANCHES.includes(clinic)) {
    throw new Error(`"${clinic}" is not a collab clinic branch`);
  }

  const createdBy = { ...actor, date: new Date() };
  const performedBy = { name: actor?.name, email: actor?.email };
  const when = date ? new Date(date) : new Date();

  const created = {
    collabCase: null,
    ourTransaction: null,
    clinicTransaction: null,
    payable: null,
    receivable: null,
  };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [collabCase] = await CollabCase.create(
        [
          {
            patient: patientId,
            clinic,
            packageAmount: totalPackage,
            clinicShare,
            procedure,
            remarks: remarks || "",
            createdBy,
            log: [
              {
                action: "Created",
                newValue: String(totalPackage),
                note: `Split — ours ${ourShare}, clinic ${clinicShare}; collected — us ${ourReceived}, clinic ${clinicReceived}`,
                performedBy,
                performedAt: new Date(),
              },
            ],
          },
        ],
        { session, ordered: true },
      );
      created.collabCase = collabCase;

      const ourReceivedNum = Number(ourReceived) || 0;
      if (ourReceivedNum > 0) {
        const tx = await createCollectionTransaction({
          session,
          collabCase,
          patientId,
          procedure,
          amount: ourReceivedNum,
          discount: discount || 0,
          collectedBy: "US",
          method,
          paymentId,
          receiptMode,
          furtherMode,
          branch: clinic,
          when,
          remarks,
          createdBy,
        });
        created.ourTransaction = tx;
      }

      const clinicReceivedNum = Number(clinicReceived) || 0;
      if (clinicReceivedNum > 0) {
        const tx = await createCollectionTransaction({
          session,
          collabCase,
          patientId,
          procedure,
          discount: ourReceivedNum > 0 ? 0 : discount || 0,
          amount: clinicReceivedNum,
          collectedBy: "CLINIC",
          collectionMode: method,
          paymentId,
          branch: clinic,
          when,
          remarks,
          createdBy,
        });
        created.clinicTransaction = tx;

        const receivableId = await growClinicReceivable({
          session,
          collabCase,
          newCumulativeClinicReceived: clinicReceivedNum,
          branch: clinic,
          procedure,
          patientId,
          performedBy,
          noteSuffix: " at case creation",
        });
        if (receivableId) {
          created.receivable = { _id: receivableId };
        }
      }

      const balance = await computeCaseBalance(collabCase._id, session);
      if (isFullyCollected(collabCase, balance)) {
        await crystalliseClinicShare({
          session,
          collabCase,
          branch: clinic,
          procedure,
          patientId,
          when,
          createdBy,
          performedBy,
          noteSuffix: " at case creation",
        });
      }
      created.payable = collabCase.clinicSharePayable
        ? await Payable.findById(collabCase.clinicSharePayable).select("totalAmount").session(session)
        : null;
    });
  } finally {
    await session.endSession();
  }

  return {
    ...created,
    summary: {
      collabCaseId: created.collabCase?._id,
      ourTransactionId: created.ourTransaction?._id || null,
      ourTransactionAmount: created.ourTransaction?.amount || 0,
      clinicTransactionId: created.clinicTransaction?._id || null,
      clinicTransactionAmount: created.clinicTransaction?.amount || 0,
      payableId: created.payable?._id || null,
      payableAmount: created.payable?.totalAmount || 0,
      receivableId: created.receivable?._id || null,
    },
  };
}

export async function recordCollabCollectionAtomic({
  caseId,
  amount,
  discount,
  date,
  collectedBy = "CLINIC",
  method,
  mode,
  reference,
  receiptMode,
  furtherMode,
  note,
  actor,
}) {
  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    throw new Error("Collection amount must be greater than 0");
  }
  const parsedDiscount = Number(discount) || 0;
  if (parsedDiscount < 0) {
    throw new Error("Discount cannot be negative");
  }
  if (!["US", "CLINIC"].includes(collectedBy)) {
    throw new Error('collectedBy must be "US" or "CLINIC"');
  }

  const performedBy = { name: actor?.name, email: actor?.email };
  const createdBy = { ...actor, date: new Date() };
  const when = date ? new Date(date) : new Date();

  const collabCase = await CollabCase.findById(caseId);
  if (!collabCase) throw new Error("Collab case not found");
  if (collabCase.status === "CANCELLED") throw new Error("This case has been cancelled");

  const session = await mongoose.startSession();
  let transaction = null;
  try {
    await session.withTransaction(async () => {
      collabCase.clinicCollections.push({
        amount: parsedAmount,
        discount: parsedDiscount,
        collectedBy,
        date: when,
        mode: collectedBy === "CLINIC" ? mode : undefined,
        reference: reference || "",
        receiptMode: receiptMode || "",
        furtherMode: furtherMode || "",
        note: note || "",
        recordedBy: performedBy,
        recordedAt: new Date(),
      });
      collabCase.log.push({
        action: "Collection Added",
        newValue: String(parsedAmount),
        note: note ? `${collectedBy}: ${note}` : `Collected by ${collectedBy}`,
        performedBy,
        performedAt: new Date(),
      });

      const previousCumulative =
        collectedBy === "CLINIC" ? await cumulativeClinicReceived(collabCase._id, session) : 0;

      transaction = await createCollectionTransaction({
        session,
        collabCase,
        patientId: collabCase.patient,
        procedure: collabCase.procedure,
        amount: parsedAmount,
        discount: parsedDiscount,
        collectedBy,
        method,
        paymentId: reference,
        receiptMode,
        furtherMode,
        collectionMode: mode,
        branch: collabCase.clinic,
        when,
        remarks: note,
        createdBy,
      });

      if (collectedBy === "CLINIC") {
        await growClinicReceivable({
          session,
          collabCase,
          newCumulativeClinicReceived: round2(previousCumulative + parsedAmount),
          branch: collabCase.clinic,
          procedure: collabCase.procedure,
          patientId: collabCase.patient,
          performedBy,
          noteSuffix: ` of ₹${parsedAmount}`,
        });
      }

      await collabCase.save({ session });

      const balance = await computeCaseBalance(collabCase._id, session);
      if (isFullyCollected(collabCase, balance)) {
        await crystalliseClinicShare({
          session,
          collabCase,
          branch: collabCase.clinic,
          procedure: collabCase.procedure,
          patientId: collabCase.patient,
          when,
          createdBy,
          performedBy,
          noteSuffix: ` of ₹${parsedAmount}`,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  return { collabCase, transaction };
}
