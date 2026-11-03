import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import { requireAuth } from "@/lib/apiGuard";

const handler = async (req) => {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const newId = searchParams.get("id");

    if (!newId) {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 },
      );
    }

    let patient = await Patient.findById(newId)
      .select("personal counselling payments")
      .populate({
        path: "payments.transactions",
        select: "date paymentType transactionCategory costType method amount discount paymentId branch",
        model: "Transactions",
      })
      .populate({
        path: "counselling.counsellor",
        select: "name",
      });

    if (patient) {
      // Branch check
      const isPrivileged = ["super-admin", "admin", "owner"].includes(session.user.role);
      if (!isPrivileged && session.user.branch && session.user.branch !== "All") {
        if (patient.personal?.branch && patient.personal.branch !== session.user.branch) {
          return NextResponse.json(
            { error: "Forbidden: Access to invoice outside your assigned branch is denied" },
            { status: 403 }
          );
        }
      }

      const transplantPayments = patient.payments?.transactions?.filter(
        (t) => t && (t.transactionCategory === "TRANSPLANT" || !t.transactionCategory)
      ) || [];

      const branch = transplantPayments[0]?.branch || patient.personal?.branch || "Delhi";

      return NextResponse.json({
        success: true,
        data: {
          category: "TRANSPLANT",
          branch: branch,
          isBatch: false,
          packageAmount: patient.payments?.totalAmount || patient.counselling?.finlpackage || 0,
          packageDiscount: patient.payments?.discount || 0,
          transactions: transplantPayments.map((t) => ({
            _id: t._id,
            date: t.date,
            method: t.method,
            amount: t.amount,
            discount: t.discount || 0,
            paymentId: t.paymentId,
            paymentType: t.paymentType,
            procedure: patient.counselling?.techniqueSuggested || patient.personal?.techniqueQuoted || "Hair Transplant",
          })),
          patient: {
            name: patient.personal?.name || "N/A",
            phone: patient.personal?.phone || "N/A",
            email: patient.personal?.email || "N/A",
            gender: patient.personal?.gender || "N/A",
            age: patient.personal?.age || "N/A",
            additionalbenefits: patient.counselling?.additionalbenefits || [],
          },
          consultant: patient.counselling?.counsellor?.name || "Dr. Ryan",
        },
      });
    }

    const transaction = await Transactions.findById(newId)
      .populate({
        path: "patient",
        select: "personal counselling",
        populate: {
          path: "counselling.counsellor",
          select: "name",
        },
      })
      .populate({
        path: "medicineId",
        select: "name category",
      });

    if (!transaction) {
      return NextResponse.json(
        { error: "Record not found" },
        { status: 404 },
      );
    }

    // Branch check for transaction
    const isPrivileged = ["super-admin", "admin", "owner"].includes(session.user.role);
    if (!isPrivileged && session.user.branch && session.user.branch !== "All") {
      if (transaction.branch && transaction.branch !== session.user.branch) {
        return NextResponse.json(
          { error: "Forbidden: Access to invoice outside your assigned branch is denied" },
          { status: 403 }
        );
      }
    }

    const category = transaction.transactionCategory || "GENERAL";
    const isBatch = !!transaction.batchId;

    let transactions = [transaction];
    if (isBatch && category === "MEDICINE") {
      transactions = await Transactions.find({
        batchId: transaction.batchId,
      }).populate({
        path: "medicineId",
        select: "name category",
      });
    }

    let patientDetails = {
      name: "Walk-in Customer",
      phone: "N/A",
      email: "N/A",
      gender: "N/A",
      age: "N/A",
    };

    if (transaction.patient && typeof transaction.patient === "object") {
      patientDetails = {
        name: transaction.patient.personal?.name || "Walk-in Customer",
        phone: transaction.patient.personal?.phone || "N/A",
        email: transaction.patient.personal?.email || "N/A",
        gender: transaction.patient.personal?.gender || "N/A",
        age: transaction.patient.personal?.age || "N/A",
      };
    } else if (transaction.patientName) {
      patientDetails.name = transaction.patientName;
      patientDetails.phone = transaction.patientPhone || "N/A";
    }

    const consultant =
      transaction.patient?.counselling?.counsellor?.name || "Dr. Ryan";

    return NextResponse.json({
      success: true,
      data: {
        category,
        branch: transaction.branch || "Delhi",
        isBatch,
        transactions: transactions.map((t) => ({
          _id: t._id,
          date: t.date,
          method: t.method,
          amount: t.amount,
          discount: t.discount || 0,
          paymentId: t.paymentId,
          procedure: t.procedure,
          quantity: t.quantity || 1,
          perSessionCost: t.perSessionCost,
          perUnitCost: t.perUnitCost,
          medicineName: t.medicineId?.name || "N/A",
          expense: t.expense,
          expenseType: t.expenseType,
        })),
        patient: patientDetails,
        consultant,
      },
    });
  } catch (error) {
    console.error("Error fetching record:", error);
    return NextResponse.json(
      { success: false, error: "Server Error", message: error.message },
      { status: 500 },
    );
  }
};

export const GET = withDB(handler);