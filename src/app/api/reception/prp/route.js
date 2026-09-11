import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import DeleteLog from "@/models/DeleteLog";
import { unsettledMethodsSync } from "@/lib/masterData";
const PROCEDURES = ["PRP", "GFC", "Canacot", "Biotin"];

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam   = searchParams.get("to");
    const dateParam = searchParams.get("date");

    let dayStart, dayEnd;
    if (fromParam && toParam) {
      dayStart = new Date(fromParam);
      dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(toParam);
      dayEnd.setHours(23, 59, 59, 999);
    } else {
      dayStart = dateParam ? new Date(dateParam) : new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
    }

    const branch = session.user.branch;
    const branchFilter = branch && branch !== "All" ? { branch } : {};
    const patientBranchFilter =
      branch && branch !== "All" ? { "personal.branch": branch } : {};

    const paidTransactions = await Transactions.find({
      procedure: { $in: PROCEDURES },
      date: { $gte: dayStart, $lte: dayEnd },
      ...branchFilter,
    })
      .populate("patient", "personal.name personal.phone personal.branch")
      .sort({ date: -1 })
      .lean();

    const patientsWithSessions = await Patient.find(
      {
        "afterSurgery.prp": {
          $elemMatch: { date: { $gte: dayStart, $lte: dayEnd } },
        },
        ...patientBranchFilter,
      },
      {
        "personal.name": 1,
        "personal.phone": 1,
        "personal.branch": 1,
        "afterSurgery.prp": 1,
      }
    ).lean();

    const paidKeys = new Set(
      paidTransactions
        .filter((t) => t.patient?._id)
        .map((t) => `${t.patient._id}-${t.procedure}`)
    );

    const unpaidSessions = patientsWithSessions.flatMap((p) => {
      const todaySessions = (p.afterSurgery?.prp || []).filter((s) => {
        const d = new Date(s.date);
        return d >= dayStart && d <= dayEnd;
      });
      return todaySessions
        .filter((s) => {
          const proc = s.type || "PRP";
          return !paidKeys.has(`${p._id}-${proc}`);
        })
        .map((s) => ({
          patientId: p._id,
          patientName: p.personal?.name || "",
          patientPhone: p.personal?.phone || "",
          branch: p.personal?.branch || "",
          sessionNumber: s.prpNumber,
          sessionId: s._id,
          procedure: s.type || "PRP",
          date: s.date,
          status: "unpaid",
        }));
    });

    const paidList = paidTransactions.map((t) => ({
      transactionId: t._id,
      patientId: t.patient?._id || null,
      patientName: t.patient?.personal?.name || t.patientName || "Walk-in",
      patientPhone: t.patient?.personal?.phone || t.patientPhone || "",
      branch: t.branch || "",
      procedure: t.procedure || "PRP",
      amount: t.amount || 0,
      discount: t.discount || 0,
      method: t.method || "",
      paymentId: t.paymentId || "",
      remarks: t.remarks || "",
      date: t.date,
      status: "paid",
    }));

    const settledPaidList = paidList.filter(
      (t) => !unsettledMethodsSync().includes(t.method) && t.isSettlement !== true,
    );
    const totalRevenue = settledPaidList.reduce((s, t) => s + (t.amount || 0), 0);
    const byType = {};
    PROCEDURES.forEach((proc) => {
      byType[proc] = {
        paid:    paidList.filter((r) => r.procedure === proc).length,
        unpaid:  unpaidSessions.filter((r) => r.procedure === proc).length,
        revenue: settledPaidList.filter((r) => r.procedure === proc).reduce((s, t) => s + (t.amount || 0), 0),
      };
    });

    return NextResponse.json({
      success: true,
      date: dayStart.toISOString().split("T")[0],
      paid: paidList,
      unpaid: unpaidSessions,
      summary: {
        total:   paidList.length + unpaidSessions.length,
        paid:    paidList.length,
        unpaid:  unpaidSessions.length,
        revenue: totalRevenue,
        byType,
      },
    });
  } catch (error) {
    console.error("PRP/GFC GET error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const {
      patientId,
      patientName,
      patientPhone,
      procedure = "PRP",
      sessionNumber: manualSessionNumber,
      date,
      isPaid,
      amount,
      method,
      discount,
      paymentId,
      remarks,
    } = body;

    if (!PROCEDURES.includes(procedure)) {
      return NextResponse.json({ error: `Invalid procedure. Must be one of: ${PROCEDURES.join(", ")}` }, { status: 400 });
    }

    if (!patientId && (!patientName || !patientPhone)) {
      return NextResponse.json(
        { error: "Provide a patient or walk-in name and phone" },
        { status: 400 }
      );
    }

    const sessionDate = date ? new Date(date) : new Date();
    const branch = session.user.branch || body.branch;

    let sessionNumber = null;
    let updatedPatient = null;

    if (patientId) {
      const patient = await Patient.findById(patientId);
      if (!patient) {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 });
      }

      if (manualSessionNumber) {
        sessionNumber = manualSessionNumber;
      } else {
        const existing = (patient.afterSurgery?.prp || []).filter(
          (s) => (s.type || "PRP") === procedure
        );
        sessionNumber =
          existing.length > 0
            ? Math.max(...existing.map((s) => s.prpNumber || 0)) + 1
            : 1;
      }

      if (!patient.afterSurgery) patient.afterSurgery = {};
      if (!patient.afterSurgery.prp) patient.afterSurgery.prp = [];

      patient.afterSurgery.prp.push({
        prpNumber: sessionNumber,
        date: sessionDate,
        type: procedure,
      });

      patient.editors = patient.editors || [];
      patient.editors.push({
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      });

      await patient.save();
      updatedPatient = { _id: patient._id, sessionNumber };
    }

    let transaction = null;
    if (isPaid) {
      if (!amount || amount <= 0) {
        return NextResponse.json(
          { error: `Amount is required for paid ${procedure}` },
          { status: 400 }
        );
      }
      if (!method) {
        return NextResponse.json(
          { error: "Payment method is required" },
          { status: 400 }
        );
      }

      transaction = await Transactions.create({
        transactionCategory: "SERVICE",
        costType: "Revenue",
        batchId: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        patient: patientId || null,
        patientName: patientName || "",
        patientPhone: patientPhone || "",
        procedure,
        quantity: 1,
        perSessionCost: parseFloat(amount) + parseFloat(discount || 0),
        amount: parseFloat(amount),
        discount: parseFloat(discount || 0),
        method,
        paymentId: paymentId || "",
        branch: branch || "",
        date: sessionDate,
        remarks: remarks || "",
        createdBy: {
          name: session.user.name,
          email: session.user.email,
          branch: session.user.branch,
          date: new Date(),
        },
      });

      if (patientId) {
        const patient = await Patient.findById(patientId);
        if (patient) {
          patient.payments = patient.payments || {};
          patient.payments.transactions = patient.payments.transactions || [];
          patient.payments.transactions.push(transaction._id);
          patient.payments.amountReceived =
            (patient.payments.amountReceived || 0) + parseFloat(amount);

          const adjustedTotal = Math.max(
            0,
            (patient.payments.totalAmount || 0) - (patient.payments.discount || 0)
          );
          patient.payments.pendingAmount = Math.max(
            0,
            adjustedTotal - patient.payments.amountReceived
          );
          await patient.save();
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: isPaid
          ? `${procedure} recorded and payment saved`
          : `${procedure} session recorded (unpaid)`,
        sessionNumber,
        procedure,
        transaction: transaction
          ? { _id: transaction._id, amount: transaction.amount }
          : null,
        updatedPatient,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("PRP/GFC POST error:", error);
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const {
      patientId,
      sessionNumber,
      sessionDate,
      procedure = "PRP",
      amount,
      method,
      discount,
      paymentId,
      remarks,
    } = body;

    if (!patientId || !amount || !method) {
      return NextResponse.json(
        { error: "patientId, amount and method are required" },
        { status: 400 }
      );
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const txDate = sessionDate ? new Date(sessionDate) : new Date();

    const transaction = await Transactions.create({
      transactionCategory: "SERVICE",
      costType: "Revenue",
      batchId: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      patient: patientId,
      patientName: patient.personal?.name || "",
      patientPhone: patient.personal?.phone || "",
      procedure,
      quantity: 1,
      perSessionCost: parseFloat(amount) + parseFloat(discount || 0),
      amount: parseFloat(amount),
      discount: parseFloat(discount || 0),
      method,
      paymentId: paymentId || "",
      branch: patient.personal?.branch || session.user.branch || "",
      date: txDate,
      remarks: remarks || `${procedure} Session #${sessionNumber || ""}`,
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });

    patient.payments = patient.payments || {};
    patient.payments.transactions = patient.payments.transactions || [];
    patient.payments.transactions.push(transaction._id);
    patient.payments.amountReceived =
      (patient.payments.amountReceived || 0) + parseFloat(amount);

    const adjustedTotal = Math.max(
      0,
      (patient.payments.totalAmount || 0) - (patient.payments.discount || 0)
    );
    patient.payments.pendingAmount = Math.max(
      0,
      adjustedTotal - patient.payments.amountReceived
    );

    patient.editors = patient.editors || [];
    patient.editors.push({
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    });

    await patient.save();

    return NextResponse.json({
      success: true,
      message: `${procedure} marked as paid`,
      transaction: { _id: transaction._id, amount: transaction.amount },
    });
  } catch (error) {
    console.error("PRP/GFC PATCH error:", error);
    return NextResponse.json({ error: "Failed to mark as paid" }, { status: 500 });
  }
}

// Deletes an UNPAID session — a Patient.afterSurgery.prp[] row with no money behind it yet.
// A PAID row is a real Transactions document instead; the page deletes those through the
// existing /api/transactions/service/delete route so it gets that route's backdate guard,
// period-lock check, and patient-payment reversal instead of a second copy of that logic here.
export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { patientId, sessionId } = await req.json();
    if (!patientId || !sessionId) {
      return NextResponse.json({ error: "patientId and sessionId are required" }, { status: 400 });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const entry = patient.afterSurgery?.prp?.id(sessionId);
    if (!entry) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await DeleteLog.create({
      entityType: "PRPSession",
      entityId: String(sessionId),
      entityName: patient.personal?.name || "Walk-in",
      entityDetails: {
        patientId: String(patient._id),
        procedure: entry.type || "PRP",
        sessionNumber: entry.prpNumber,
        date: entry.date,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: patient.personal?.branch || session.user.branch,
    });

    patient.afterSurgery.prp.pull({ _id: sessionId });

    patient.editors = patient.editors || [];
    patient.editors.push({
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    });

    await patient.save();

    return NextResponse.json({ success: true, message: "Session deleted" });
  } catch (error) {
    console.error("PRP/GFC DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
