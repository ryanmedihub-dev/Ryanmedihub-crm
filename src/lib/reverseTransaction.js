import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import Advance from "@/models/Advance";
import { checkPeriodLock } from "@/lib/periodLock";
import { checkCascadeOnDelete } from "@/lib/cascadeIntegrity";
import { unsettleAdvanceFromPayable } from "@/lib/entryCore/settleAdvanceAgainstPayable";

const MIRRORED_FIELDS = [
  "patient",
  "patientName",
  "patientPhone",
  "procedure",
  "transactionCategory",
  "costType",
  "branch",
  "method",
  "furtherMode",
  "receiptMode",
  "expense",
  "expenseType",
  "payableId",
  "receivableId",
];

export class ReversalError extends Error {
  constructor(status, body) {
    super(body?.error || "Reversal failed");
    this.status = status;
    this.body = body;
  }
}

export async function reverseTransaction({
  transactionId,
  amount,
  reason,
  remarks,
  date,
  actor,
  dbSession,
}) {
  if (!reason || !String(reason).trim()) {
    throw new ReversalError(400, { error: "A reason is required to reverse a transaction" });
  }

  const original = await Transactions.findById(transactionId).session(dbSession);
  if (!original) {
    throw new ReversalError(404, { error: "Transaction not found" });
  }

  if (original.reversalOf) {
    throw new ReversalError(400, {
      error:
        "This row is itself a reversal. Reverse the ORIGINAL transaction instead — a chain of reversals is impossible to read in an audit.",
    });
  }

  if ((original.amount || 0) <= 0) {
    throw new ReversalError(400, { error: "Only a positive-amount transaction can be reversed." });
  }

  const [alreadyAgg] = await Transactions.aggregate([
    { $match: { reversalOf: original._id } },
    { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } },
  ]).session(dbSession);
  const alreadyReversed = Math.abs(alreadyAgg?.total || 0);
  const remaining = Math.round(((original.amount || 0) - alreadyReversed) * 100) / 100;

  if (remaining <= 0) {
    throw new ReversalError(400, {
      error: `This transaction is already fully reversed (₹${alreadyReversed.toLocaleString("en-IN")} of ₹${(original.amount || 0).toLocaleString("en-IN")}).`,
      alreadyReversed,
    });
  }

  const requested = amount === undefined || amount === null ? remaining : Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new ReversalError(400, { error: "Reversal amount must be greater than zero" });
  }
  if (requested > remaining) {
    throw new ReversalError(400, {
      error:
        `Reversing ₹${requested.toLocaleString("en-IN")} would take the total past the original. ` +
        `₹${alreadyReversed.toLocaleString("en-IN")} of ₹${(original.amount || 0).toLocaleString("en-IN")} has already been reversed; ` +
        `₹${remaining.toLocaleString("en-IN")} remains.`,
      alreadyReversed,
      remaining,
    });
  }

  const originalLocked = await checkPeriodLock(original);
  const reversalDate = originalLocked ? new Date() : date ? new Date(date) : new Date(original.date);

  const reversalLock = await checkPeriodLock({
    furtherMode: original.furtherMode,
    date: reversalDate,
  });
  if (reversalLock) {
    throw new ReversalError(423, {
      error: `The reversal cannot be dated ${reversalDate.toLocaleDateString("en-IN")}: ${reversalLock}`,
      periodLocked: true,
    });
  }

  const isFullReversal = Math.abs(requested - remaining) < 0.01;
  if (isFullReversal) {
    const cascade = await checkCascadeOnDelete(original, dbSession);
    if (cascade.blocked) {
      throw new ReversalError(409, {
        error: "This transaction cannot be fully reversed yet.",
        reasons: cascade.reasons,
        hint: `A partial reversal below ₹${remaining.toLocaleString("en-IN")} is still possible.`,
      });
    }
  }

  const narration = [
    `REVERSAL — ${String(reason).trim()}`,
    original.patientName || undefined,
    original.paymentId ? `ref ${original.paymentId}` : undefined,
    `against ${original._id}`,
    remarks ? String(remarks).trim() : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const doc = {};
  for (const f of MIRRORED_FIELDS) {
    if (original[f] !== undefined && original[f] !== null) doc[f] = original[f];
  }

  if (original.collabRef?.caseId) {
    doc.collabRef = { caseId: original.collabRef.caseId };
  }

  const [reversal] = await Transactions.create(
    [
      {
        ...doc,
        amount: -Math.abs(requested),
        isSettlement: original.isSettlement === true,
        reversalOf: original._id,
        reversalReason: String(reason).trim(),
        date: reversalDate,
        remarks: narration,
        paymentId: original.paymentId || "",
        approvalStatus: "APPROVED",
        createdBy: { ...actor, date: new Date() },
      },
    ],
    { session: dbSession, ordered: true },
  );

  const nowReversed = alreadyReversed + Math.abs(requested);
  const fullyReversed = nowReversed >= (original.amount || 0) - 0.01;
  if (fullyReversed) {
    original.isReversed = true;
    original.editors = original.editors || [];
    original.editors.push({
      ...actor,
      date: new Date(),
      updatedFields: [{ name: "isReversed", previousValue: "false", newValue: "true" }],
    });
    await original.save({ session: dbSession });

    // This payment was booked alongside advance settlements (expense/create-with-settlement).
    // A full reversal must undo those too, or the advance-receivable is left half-recovered.
    // A PARTIAL reversal leaves them — the settlement still stands against the reduced payment.
    const settleIds = (original.advanceSettlementIds || []).map(String);
    if (settleIds.length) {
      const advances = await Advance.find({ "settlements._id": { $in: settleIds } }).session(dbSession);
      try {
        for (const adv of advances) {
          for (const line of [...adv.settlements]) {
            if (!settleIds.includes(String(line._id))) continue;
            await unsettleAdvanceFromPayable({
              advanceId: String(adv._id),
              settlementId: String(line._id),
              note: `Auto-unlinked — source payment ${original._id} was reversed`,
              session: { user: actor || {} },
              dbSession,
            });
          }
        }
      } catch (e) {
        throw new ReversalError(409, {
          error: `Could not undo the advance settlement on this payment: ${e?.settleResult?.error || e?.message || "unknown error"}`,
        });
      }
    }
  }

  let patientStatus = null;
  if (original.patient && original.costType === "Revenue") {
    const patient = await Patient.findById(original.patient).session(dbSession);
    if (patient) {
      patient.payments = patient.payments || {};
      const before = patient.ops?.status;
      patient.payments.amountReceived =
        Math.round(((patient.payments.amountReceived || 0) - Math.abs(requested)) * 100) / 100;
      if (patient.payments.amountReceived < 0) patient.payments.amountReceived = 0;
      patient.payments.transactions = patient.payments.transactions || [];
      patient.payments.transactions.push(reversal._id);

      const total = patient.payments.totalAmount || patient.counselling?.finlpackage || 0;
      patient.payments.pendingAmount = Math.max(
        0,
        total - patient.payments.amountReceived - (patient.payments.discount || 0),
      );

      await patient.save({ session: dbSession });
      patientStatus = { before, after: patient.ops?.status, amountReceived: patient.payments.amountReceived };
    }
  }

  return {
    reversal,
    original,
    fullyReversed,
    patientStatus,
    alreadyReversed: nowReversed,
    remaining: Math.round((remaining - Math.abs(requested)) * 100) / 100,
    requested: Math.abs(requested),
  };
}
