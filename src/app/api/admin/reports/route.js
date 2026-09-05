import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions";
import Stock from "@/models/Stock";
import Vendor from "@/models/Vendor";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import Borrowing from "@/models/Borrowing";
import Advance from "@/models/Advance";
import SuspenseEntry from "@/models/SuspenseEntry";
import AccountTransfer from "@/models/AccountTransfer";
import { PAYABLE_PURPOSES } from "@/constants/payablePurposes";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";
import { settlementLinesFor } from "@/lib/advanceSettlements";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";

function branchAllowed(branchFilter, branchName) {
  if (!branchFilter) return true;
  if (typeof branchFilter === "string") return branchFilter === branchName;
  if (branchFilter.$in) return branchFilter.$in.includes(branchName);
  return true;
}

export async function GET(request) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized. Please login." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const requestedBranch = searchParams.get("branch");

    let branch = requestedBranch || undefined;
    const role = session.user.role;
    const userBranch = session.user.branch;
    if (role === "collab") {
      branch = requestedBranch && COLLAB_BRANCHES.includes(requestedBranch)
        ? requestedBranch
        : { $in: COLLAB_BRANCHES };
    } else if (!["admin", "super-admin"].includes(role) && userBranch && userBranch !== "All") {
      branch = userBranch;
    }

    const staffFilter = searchParams.get("staffFilter");
    const techniqueFilter = searchParams.get("techniqueFilter");
    const statusFilter = searchParams.get("statusFilter");
    const procedureFilter = searchParams.get("procedureFilter");
    const paymentTypeFilter = searchParams.get("paymentTypeFilter");
    const rawPayableType = searchParams.get("payableTypeFilter");
    // Validated against the enum so an unknown value can't silently return everything.
    const payableTypeFilter = PAYABLE_PURPOSES.includes(rawPayableType) ? rawPayableType : "";
    const revenueCategoryFilter = searchParams.get("revenueCategoryFilter") || "";

    let data = [];

    const allEmployees = await Employee.find(
      { isactive: true },
      { name: 1, role: 1, email: 1, phone: 1, _id: 1 }
    ).lean();
    const employeesByRole = {
      counsellors: allEmployees.filter(e => e.role === "Counsellor"),
      agents:      allEmployees.filter(e => e.role === "Agent"),
      doctors:     allEmployees.filter(e => e.role === "Doctor"),
      implanters:  allEmployees.filter(e => e.role === "Implanter"),
      technicians: allEmployees.filter(e => e.role === "Technician"),
    };

    const patientDateFilter = {};
    const transactionDateFilter = {};
    const obligationDateFilter = {};
    const fromDate = from ? getISTStartOfDay(from) : null;
    const toDate = to ? getISTEndOfDay(to) : null;
    if (fromDate || toDate) {
      const range = {};
      if (fromDate) range.$gte = fromDate;
      if (toDate) range.$lte = toDate;
      patientDateFilter["personal.visitDate"] = range;
      transactionDateFilter["date"] = range;
      obligationDateFilter["createdAt"] = range;
    }

    switch (type) {
      case "patients-comprehensive":
        data = await generateComprehensivePatientReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
          techniqueFilter,
          statusFilter,
        });
        break;

      case "patients-demographics":
        data = await generateDemographicsReport({ dateFilter: patientDateFilter, branch });
        break;

      case "patients-status":
        data = await generateStatusReport({ dateFilter: patientDateFilter, branch, statusFilter });
        break;

      case "patients-medical":
        data = await generateMedicalHistoryReport({ dateFilter: patientDateFilter, branch });
        break;

      case "patients-surgery":
        data = await generateSurgeryScheduleReport({ dateFilter: patientDateFilter, branch, staffFilter });
        break;

      case "patients-counselling":
        data = await generateCounsellingOutcomesReport({ dateFilter: patientDateFilter, branch, staffFilter });
        break;

      case "outstanding-payments":
        data = await generateOutstandingPaymentsReport({
          dateFilter: patientDateFilter,
          branch,
          statusFilter,
        });
        break;

      case "grafts-analysis":
        data = await generateGraftsAnalysisReport({
          dateFilter: patientDateFilter,
          branch,
          techniqueFilter,
        });
        break;

      case "employees-all":
        data = await generateEmployeesAllReport();
        break;

      case "counsellors":
        data = await generateCounsellorReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
          employees: employeesByRole.counsellors,
        });
        break;

      case "agents":
        data = await generateAgentReport({ dateFilter: patientDateFilter, branch, staffFilter, employees: employeesByRole.agents });
        break;

      case "doctors":
        data = await generateDoctorReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
          techniqueFilter,
          employees: employeesByRole.doctors,
        });
        break;

      case "implanters":
        data = await generateImplanterReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
          employees: employeesByRole.implanters,
        });
        break;

      case "technicians":
        data = await generateTechnicianReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
          employees: employeesByRole.technicians,
        });
        break;

      case "techniques":
        data = await generateTechniqueReport({
          dateFilter: patientDateFilter,
          branch,
          techniqueFilter,
        });
        break;

      case "surgery-schedule":
        data = await generateSurgeryScheduleReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "counselling-outcomes":
        data = await generateCounsellingOutcomesReport({
          dateFilter: patientDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "revenue":
        data = await generateRevenueReport({
          dateFilter: transactionDateFilter,
          branch,
          procedureFilter,
          paymentTypeFilter,
        });
        break;

      case "expenses":
        data = await generateExpensesReport({ dateFilter: transactionDateFilter, branch });
        break;

      case "transactions":
      case "transactions-all":
        data = await generateTransactionsReport({
          dateFilter: transactionDateFilter,
          branch,
          procedureFilter,
          paymentTypeFilter,
        });
        break;

      case "payment-collection":
        data = await generatePaymentCollectionReport({
          dateFilter: transactionDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "procedure-revenue":
        data = await generateProcedureRevenueReport({
          dateFilter: transactionDateFilter,
          branch,
          procedureFilter,
        });
        break;

      case "payables-all":
        data = await generatePayablesAllReport({
          dateFilter: obligationDateFilter,
          branch,
          payableTypeFilter,
        });
        break;

      case "receivables-all":
        data = await generateReceivablesAllReport({
          dateFilter: obligationDateFilter,
          branch,
          revenueCategoryFilter,
        });
        break;

      case "suspense-all":
        data = await generateSuspenseReport({ from: fromDate, to: toDate, branch });
        break;

      case "contra-all":
        data = await generateContraReport({ from: fromDate, to: toDate, branch });
        break;

      case "incentives-all":
        data = await generateIncentivesReport({ from: fromDate, to: toDate, branch });
        break;

      case "branch-comparison":
        data = await generateBranchComparisonReport({ patientDateFilter, transactionDateFilter, branch });
        break;

      case "branch-revenue":
        data = await generateBranchRevenueReport({ dateFilter: transactionDateFilter, branch });
        break;

      case "branch-patients":
        data = await generateBranchPatientsReport({ dateFilter: patientDateFilter, branch });
        break;

      case "stocks-all":
        data = await generateStocksAllReport();
        break;

      case "vendors-all":
        data = await generateVendorsAllReport();
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, message: "Invalid report type" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}


async function generateComprehensivePatientReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;
  if (filters.statusFilter) query["ops.status"] = filters.statusFilter;

  let patients = await Patient.find(query, {
    "documents.images": 0,
    "documents.consentForm": 0,
    "documents.suregeryForm": 0,
    "documents.consultForm": 0,
    "afterSurgery": 0,
    "products": 0,
    "editors": 0,
  })
    .populate("personal.reference", "name role")
    .populate("counselling.counsellor", "name")
    .populate("surgery.doctor", "name")
    .populate("surgery.seniorTech", "name")
    .populate("surgery.implanterRight", "name")
    .populate("surgery.implanterLeft", "name")
    .limit(5000)
    .lean();

  if (filters.staffFilter) {
    patients = patients.filter(
      (p) =>
        p.personal?.reference?.name === filters.staffFilter ||
        p.counselling?.counsellor?.name === filters.staffFilter ||
        p.surgery?.doctor?.name === filters.staffFilter
    );
  }

  if (filters.techniqueFilter) {
    patients = patients.filter(
      (p) =>
        p.counselling?.techniqueSuggested === filters.techniqueFilter ||
        p.surgery?.technique === filters.techniqueFilter
    );
  }

  return patients.map((p) => ({
    "Patient ID": p._id?.toString() || "",
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Email: p.personal?.email || "",
    Age: p.personal?.age || "",
    Gender: p.personal?.gender || "",
    Branch: p.personal?.branch || "",
    Address: p.personal?.address || "",
    Profession: p.personal?.profession || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString()
      : "",
    "Reference Agent": p.personal?.reference?.name || "",
    "Package Quoted": p.personal?.packageQuoted || "",
    "Technique Quoted": p.personal?.techniqueQuoted || "",
    "Blood Group": p.medical?.bloodGroup || "",
    Allergies: p.medical?.allergies || "",
    "Medical History": p.medical?.medicalHistory || "",
    Counsellor: p.counselling?.counsellor?.name || "",
    "Technique Suggested": p.counselling?.techniqueSuggested || "",
    "Final Package": p.counselling?.finlpackage || "",
    "Grafts Suggested": p.counselling?.graftsSuggested || "",
    "Ready For Surgery": p.counselling?.readyForSurgery ? "Yes" : "No",
    "Surgery Date": p.surgery?.surgeryDate
      ? new Date(p.surgery.surgeryDate).toLocaleDateString()
      : "",
    "Surgery Location": p.surgery?.location || "",
    "Surgery Technique": p.surgery?.technique || "",
    "Grafts Implanted": p.surgery?.graftsImplanted || "",
    Doctor: p.surgery?.doctor?.name || "",
    "Senior Technician": p.surgery?.seniorTech?.name || "",
    "Implanter Right": p.surgery?.implanterRight?.name || "",
    "Implanter Left": p.surgery?.implanterLeft?.name || "",
    "Total Amount": p.payments?.totalAmount || 0,
    "Amount Received": p.payments?.amountReceived || 0,
    "Pending Amount": p.payments?.pendingAmount || 0,
    Status: p.ops?.status || "",
    "Created At": p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "",
  }));
}

async function generateDemographicsReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.age": 1,
    "personal.gender": 1,
    "personal.profession": 1,
    "personal.branch": 1,
    "personal.address": 1,
    "personal.visitDate": 1,
  }).limit(5000).lean();

  return patients.map((p) => ({
    "Patient ID": p._id?.toString() || "",
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Age: p.personal?.age || "",
    Gender: p.personal?.gender || "",
    Profession: p.personal?.profession || "",
    Branch: p.personal?.branch || "",
    Address: p.personal?.address || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString()
      : "",
  }));
}

async function generateStatusReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;
  if (filters.statusFilter) query["ops.status"] = filters.statusFilter;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.branch": 1,
    "personal.visitDate": 1,
    "personal.reference": 1,
    "ops.status": 1,
    "updatedAt": 1,
  })
    .populate("personal.reference", "name")
    .limit(5000)
    .lean();

  return patients.map((p) => ({
    "Patient ID": p._id?.toString() || "",
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Branch: p.personal?.branch || "",
    Status: p.ops?.status || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString()
      : "",
    "Reference Agent": p.personal?.reference?.name || "",
    "Days in Current Status": p.updatedAt
      ? Math.floor((new Date() - new Date(p.updatedAt)) / (1000 * 60 * 60 * 24))
      : "",
  }));
}

async function generateMedicalHistoryReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.age": 1,
    "personal.gender": 1,
    "medical": 1,
  }).limit(5000).lean();

  return patients.map((p) => ({
    "Patient ID": p._id?.toString() || "",
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Age: p.personal?.age || "",
    Gender: p.personal?.gender || "",
    "Blood Group": p.medical?.bloodGroup || "",
    Allergies: p.medical?.allergies || "",
    "Medical History": p.medical?.medicalHistory || "",
    Sugar: p.medical?.sugar || "",
    "Blood Pressure": p.medical?.bp || "",
    Pulse: p.medical?.pulse || "",
    Weight: p.medical?.weight || "",
    HIV: p.medical?.hiv || "",
    HCV: p.medical?.hcv || "",
  }));
}

async function generateCounsellorReport(filters) {
  const counsellors = filters.employees || [];

  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.branch": 1,
    "counselling.counsellor": 1,
    "counselling.readyForSurgery": 1,
    "counselling.finlpackage": 1,
  })
    .populate("counselling.counsellor", "name")
    .limit(5000)
    .lean();

  const counsellorStats = {};

  counsellors.forEach((c) => {
    counsellorStats[c._id.toString()] = {
      "Counsellor Name": c.name,
      Email: c.email || "",
      Phone: c.phone || "",
      "Total Patients": 0,
      "Ready for Surgery": 0,
      "Not Ready": 0,
      "Conversion Rate": "0%",
      "Total Package Value": 0,
      "Avg Package Value": 0,
    };
  });

  patients.forEach((p) => {
    const counsellorId = p.counselling?.counsellor?._id?.toString();
    if (counsellorId && counsellorStats[counsellorId]) {
      counsellorStats[counsellorId]["Total Patients"]++;
      if (p.counselling?.readyForSurgery) {
        counsellorStats[counsellorId]["Ready for Surgery"]++;
      } else {
        counsellorStats[counsellorId]["Not Ready"]++;
      }
      if (p.counselling?.finlpackage) {
        counsellorStats[counsellorId]["Total Package Value"] +=
          p.counselling.finlpackage;
      }
    }
  });

  Object.keys(counsellorStats).forEach((id) => {
    const stats = counsellorStats[id];
    if (stats["Total Patients"] > 0) {
      stats["Conversion Rate"] =
        ((stats["Ready for Surgery"] / stats["Total Patients"]) * 100).toFixed(
          1
        ) + "%";
      stats["Avg Package Value"] = Math.round(
        stats["Total Package Value"] / stats["Total Patients"]
      );
    }
  });

  return Object.values(counsellorStats).filter((s) => s["Total Patients"] > 0);
}

async function generateAgentReport(filters) {
  const agents = filters.employees || [];

  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.reference": 1,
    "personal.branch": 1,
    "ops.status": 1,
    "payments.amountReceived": 1,
  })
    .populate("personal.reference", "name")
    .limit(5000)
    .lean();

  const agentStats = {};

  agents.forEach((a) => {
    agentStats[a._id.toString()] = {
      "Agent Name": a.name,
      Email: a.email || "",
      Phone: a.phone || "",
      "Total Referrals": 0,
      "Converted to Surgery": 0,
      "Conversion Rate": "0%",
      "Total Revenue Generated": 0,
    };
  });

  patients.forEach((p) => {
    const agentId = p.personal?.reference?._id?.toString();
    if (agentId && agentStats[agentId]) {
      agentStats[agentId]["Total Referrals"]++;
      if (p.ops?.status === "POST_OP" || p.ops?.status === "CLOSED") {
        agentStats[agentId]["Converted to Surgery"]++;
        if (p.payments?.amountReceived) {
          agentStats[agentId]["Total Revenue Generated"] +=
            p.payments.amountReceived;
        }
      }
    }
  });

  Object.keys(agentStats).forEach((id) => {
    const stats = agentStats[id];
    if (stats["Total Referrals"] > 0) {
      stats["Conversion Rate"] =
        (
          (stats["Converted to Surgery"] / stats["Total Referrals"]) *
          100
        ).toFixed(1) + "%";
    }
  });

  return Object.values(agentStats).filter((s) => s["Total Referrals"] > 0);
}

async function generateDoctorReport(filters) {
  const doctors = filters.employees || [];

  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;
  if (filters.techniqueFilter)
    query["surgery.technique"] = filters.techniqueFilter;

  const patients = await Patient.find(query, {
    "personal.branch": 1,
    "surgery.doctor": 1,
    "surgery.surgeryDate": 1,
    "surgery.technique": 1,
    "surgery.graftsImplanted": 1,
  })
    .populate("surgery.doctor", "name")
    .limit(5000)
    .lean();

  const doctorStats = {};

  doctors.forEach((d) => {
    doctorStats[d._id.toString()] = {
      "Doctor Name": d.name,
      Email: d.email || "",
      Phone: d.phone || "",
      "Total Surgeries": 0,
      "Total Grafts Implanted": 0,
      "Avg Grafts per Surgery": 0,
      "FUE Count": 0,
      "DHI Count": 0,
      "INDIAN DHI Count": 0,
      "HYBRID Count": 0,
    };
  });

  patients.forEach((p) => {
    const doctorId = p.surgery?.doctor?._id?.toString();
    if (doctorId && doctorStats[doctorId] && p.surgery?.surgeryDate) {
      doctorStats[doctorId]["Total Surgeries"]++;
      if (p.surgery?.graftsImplanted) {
        doctorStats[doctorId]["Total Grafts Implanted"] +=
          p.surgery.graftsImplanted;
      }
      if (p.surgery?.technique) {
        const technique = p.surgery.technique;
        if (technique === "FUE") doctorStats[doctorId]["FUE Count"]++;
        else if (technique === "DHI") doctorStats[doctorId]["DHI Count"]++;
        else if (technique === "INDIAN DHI")
          doctorStats[doctorId]["INDIAN DHI Count"]++;
        else if (technique === "HYBRID")
          doctorStats[doctorId]["HYBRID Count"]++;
      }
    }
  });

  Object.keys(doctorStats).forEach((id) => {
    const stats = doctorStats[id];
    if (stats["Total Surgeries"] > 0) {
      stats["Avg Grafts per Surgery"] = Math.round(
        stats["Total Grafts Implanted"] / stats["Total Surgeries"]
      );
    }
  });

  return Object.values(doctorStats).filter((s) => s["Total Surgeries"] > 0);
}

async function generateImplanterReport(filters) {
  const implanters = filters.employees || [];

  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.branch": 1,
    "surgery.implanterRight": 1,
    "surgery.implanterLeft": 1,
    "surgery.surgeryDate": 1,
    "surgery.graftsImplanted": 1,
  })
    .populate("surgery.implanterRight", "name")
    .populate("surgery.implanterLeft", "name")
    .limit(5000)
    .lean();

  const implanterStats = {};

  implanters.forEach((i) => {
    implanterStats[i._id.toString()] = {
      "Implanter Name": i.name,
      Email: i.email || "",
      Phone: i.phone || "",
      "Total Procedures": 0,
      "Total Grafts Implanted": 0,
      "Avg Grafts per Procedure": 0,
    };
  });

  patients.forEach((p) => {
    if (p.surgery?.surgeryDate) {
      const rightId = p.surgery?.implanterRight?._id?.toString();
      const leftId = p.surgery?.implanterLeft?._id?.toString();
      const grafts = p.surgery?.graftsImplanted || 0;

      [rightId, leftId].forEach((id) => {
        if (id && implanterStats[id]) {
          implanterStats[id]["Total Procedures"]++;
          implanterStats[id]["Total Grafts Implanted"] += grafts / 2;
        }
      });
    }
  });

  Object.keys(implanterStats).forEach((id) => {
    const stats = implanterStats[id];
    if (stats["Total Procedures"] > 0) {
      stats["Avg Grafts per Procedure"] = Math.round(
        stats["Total Grafts Implanted"] / stats["Total Procedures"]
      );
    }
  });

  return Object.values(implanterStats).filter((s) => s["Total Procedures"] > 0);
}

async function generateTechnicianReport(filters) {
  const technicians = filters.employees || [];

  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.branch": 1,
    "surgery.seniorTech": 1,
    "surgery.graftingPerson": 1,
    "surgery.helper": 1,
    "surgery.surgeryDate": 1,
  })
    .populate("surgery.seniorTech", "name")
    .populate("surgery.graftingPerson", "name")
    .populate("surgery.helpers", "name")
    .limit(5000)
    .lean();

  const techStats = {};

  technicians.forEach((t) => {
    techStats[t._id.toString()] = {
      "Technician Name": t.name,
      Email: t.email || "",
      Phone: t.phone || "",
      "Total Procedures": 0,
      "As Senior Tech": 0,
      "As Grafting Person": 0,
      "As Helper": 0,
    };
  });

  patients.forEach((p) => {
    if (p.surgery?.surgeryDate) {
      const seniorId = p.surgery?.seniorTech?._id?.toString();
      const graftingId = p.surgery?.graftingPerson?._id?.toString();
      const helpers = p.surgery?.helpers || [];

      if (seniorId && techStats[seniorId]) {
        techStats[seniorId]["Total Procedures"]++;
        techStats[seniorId]["As Senior Tech"]++;
      }
      if (graftingId && techStats[graftingId]) {
        techStats[graftingId]["Total Procedures"]++;
        techStats[graftingId]["As Grafting Person"]++;
      }

      helpers.forEach((helper) => {
        const helperId = helper?._id?.toString();
        if (helperId && techStats[helperId]) {
          techStats[helperId]["Total Procedures"]++;
          techStats[helperId]["As Helper"]++;
        }
      });
    }
  });
  return Object.values(techStats).filter((s) => s["Total Procedures"] > 0);
}

async function generateTechniqueReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;
  if (filters.techniqueFilter)
    query["surgery.technique"] = filters.techniqueFilter;

  const patients = await Patient.find(query, {
    "personal.branch": 1,
    "surgery.technique": 1,
    "surgery.surgeryDate": 1,
    "surgery.graftsImplanted": 1,
    "payments.amountReceived": 1,
  }).limit(5000).lean();

  const techniques = {};

  patients.forEach((p) => {
    if (p.surgery?.technique && p.surgery?.surgeryDate) {
      const tech = p.surgery.technique;
      if (!techniques[tech]) {
        techniques[tech] = {
          Technique: tech,
          "Total Surgeries": 0,
          "Total Grafts": 0,
          "Avg Grafts": 0,
          "Total Revenue": 0,
          "Avg Revenue": 0,
        };
      }
      techniques[tech]["Total Surgeries"]++;
      if (p.surgery.graftsImplanted) {
        techniques[tech]["Total Grafts"] += p.surgery.graftsImplanted;
      }
      if (p.payments?.amountReceived) {
        techniques[tech]["Total Revenue"] += p.payments.amountReceived;
      }
    }
  });

  Object.keys(techniques).forEach((tech) => {
    const stats = techniques[tech];
    if (stats["Total Surgeries"] > 0) {
      stats["Avg Grafts"] = Math.round(
        stats["Total Grafts"] / stats["Total Surgeries"]
      );
      stats["Avg Revenue"] = Math.round(
        stats["Total Revenue"] / stats["Total Surgeries"]
      );
    }
  });

  return Object.values(techniques);
}

async function generateSurgeryScheduleReport(filters) {
  const query = {
    ...filters.dateFilter,
    "surgery.surgeryDate": { $exists: true },
  };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.branch": 1,
    "surgery.surgeryDate": 1,
    "surgery.location": 1,
    "surgery.technique": 1,
    "surgery.graftsneed": 1,
    "surgery.doctor": 1,
    "surgery.seniorTech": 1,
    "surgery.implanterRight": 1,
    "surgery.implanterLeft": 1,
    "ops.status": 1,
  })
    .populate("surgery.doctor", "name")
    .populate("surgery.seniorTech", "name")
    .populate("surgery.implanterRight", "name")
    .populate("surgery.implanterLeft", "name")
    .sort({ "surgery.surgeryDate": 1 })
    .limit(5000)
    .lean();

  return patients.map((p) => ({
    "Surgery Date": p.surgery?.surgeryDate
      ? new Date(p.surgery.surgeryDate).toLocaleDateString()
      : "",
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Branch: p.personal?.branch || "",
    "Surgery Location": p.surgery?.location || "",
    Technique: p.surgery?.technique || "",
    "Grafts Needed": p.surgery?.graftsneed || "",
    Doctor: p.surgery?.doctor?.name || "",
    "Senior Tech": p.surgery?.seniorTech?.name || "",
    "Implanter Right": p.surgery?.implanterRight?.name || "",
    "Implanter Left": p.surgery?.implanterLeft?.name || "",
    Status: p.ops?.status || "",
  }));
}

async function generateGraftsAnalysisReport(filters) {
  const query = {
    ...filters.dateFilter,
    "surgery.surgeryDate": { $exists: true },
  };
  if (filters.branch) query["personal.branch"] = filters.branch;
  if (filters.techniqueFilter)
    query["surgery.technique"] = filters.techniqueFilter;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.branch": 1,
    "surgery.technique": 1,
    "surgery.surgeryDate": 1,
    "surgery.graftsneed": 1,
    "surgery.graftsImplanted": 1,
    "counselling.graftsSuggested": 1,
  }).limit(5000).lean();

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Branch: p.personal?.branch || "",
    Technique: p.surgery?.technique || "",
    "Grafts Suggested": p.counselling?.graftsSuggested || 0,
    "Grafts Needed": p.surgery?.graftsneed || 0,
    "Grafts Implanted": p.surgery?.graftsImplanted || 0,
    "Variance (Suggested vs Implanted)":
      (p.surgery?.graftsImplanted || 0) - (p.counselling?.graftsSuggested || 0),
    "Implantation Rate": p.surgery?.graftsneed
      ? ((p.surgery.graftsImplanted / p.surgery.graftsneed) * 100).toFixed(1) +
        "%"
      : "N/A",
    "Surgery Date": p.surgery?.surgeryDate
      ? new Date(p.surgery.surgeryDate).toLocaleDateString()
      : "",
  }));
}

async function generateCounsellingOutcomesReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query["personal.branch"] = filters.branch;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.branch": 1,
    "counselling": 1,
    "ops.status": 1,
  })
    .populate("counselling.counsellor", "name")
    .limit(5000)
    .lean();

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Branch: p.personal?.branch || "",
    Counsellor: p.counselling?.counsellor?.name || "",
    "Technique Suggested": p.counselling?.techniqueSuggested || "",
    "Grafts Suggested": p.counselling?.graftsSuggested || "",
    "Package Amount": p.counselling?.finlpackage || "",
    "Ready for Surgery": p.counselling?.readyForSurgery ? "Yes" : "No",
    "Medicines Prescribed": p.counselling?.medicines?.join(", ") || "",
    "Hair Loss Type": p.counselling?.hairlossType || "",
    "Area of Concern": p.counselling?.areaofConcern || "",
    "Hair Loss Reason": p.counselling?.hairlossreason || "",
    "Hair Loss Duration": p.counselling?.hairlossduration || "",
    Status: p.ops?.status || "",
  }));
}

async function generateRevenueReport(filters) {
  const query = {
    ...filters.dateFilter,
    costType: "Revenue",
  };
  if (filters.branch) query.branch = filters.branch;
  if (filters.procedureFilter) query.procedure = filters.procedureFilter;
  if (filters.paymentTypeFilter) query.paymentType = filters.paymentTypeFilter;

  const transactions = await Transactions.find(query)
    .populate("patient", "personal.name personal.phone")
    .sort({ date: -1 })
    .limit(5000)
    .lean();

  return transactions.map((t) => ({
    Date: t.date ? new Date(t.date).toLocaleDateString() : "",
    "Patient Name": t.patient?.personal?.name || "",
    "Patient Phone": t.patient?.personal?.phone || "",
    Branch: t.branch || "",
    Procedure: t.procedure || "",
    "Payment Type": t.paymentType || "",
    "Payment Method": t.method || "",
    Amount: t.amount || 0,
    Remarks: t.remarks || "",
  }));
}

async function generateExpensesReport(filters) {
  const query = {
    ...filters.dateFilter,
    costType: "Expenses",
  };
  if (filters.branch) query.branch = filters.branch;

  const transactions = await Transactions.find(query).sort({ date: -1 }).limit(5000).lean();

  return transactions.map((t) => ({
    Date: t.date ? new Date(t.date).toLocaleDateString() : "",
    Branch: t.branch || "",
    "Expense Category": t.expense || "",
    "Expense Type": t.expenseType || "",
    "Payment Method": t.method || "",
    Amount: t.amount || 0,
    Remarks: t.remarks || "",
  }));
}

async function generateTransactionsReport(filters) {
  const query = { ...filters.dateFilter };
  if (filters.branch) query.branch = filters.branch;
  if (filters.procedureFilter) query.procedure = filters.procedureFilter;
  if (filters.paymentTypeFilter) query.paymentType = filters.paymentTypeFilter;

  const transactions = await Transactions.find(query)
    .populate("patient", "personal.name personal.phone")
    .sort({ date: -1 })
    .limit(5000)
    .lean();

  return transactions.map((t) => ({
    Date: t.date ? new Date(t.date).toLocaleDateString() : "",
    "Cost Type": t.costType || "",
    Branch: t.branch || "",
    "Patient Name": t.patient?.personal?.name || "N/A",
    "Patient Phone": t.patient?.personal?.phone || "N/A",
    Procedure: t.procedure || "N/A",
    "Payment Type": t.paymentType || "N/A",
    "Expense Category": t.expense || "N/A",
    "Expense Type": t.expenseType || "N/A",
    "Payment Method": t.method || "",
    Amount: t.amount || 0,
    Remarks: t.remarks || "",
  }));
}

async function generateOutstandingPaymentsReport(filters) {
  const query = {
    ...filters.dateFilter,
    "payments.pendingAmount": { $gt: 0 },
  };
  if (filters.branch) query["personal.branch"] = filters.branch;
  if (filters.statusFilter) query["ops.status"] = filters.statusFilter;

  const patients = await Patient.find(query, {
    "personal.name": 1,
    "personal.phone": 1,
    "personal.branch": 1,
    "counselling.counsellor": 1,
    "payments.totalAmount": 1,
    "payments.amountReceived": 1,
    "payments.pendingAmount": 1,
    "surgery.surgeryDate": 1,
    "ops.status": 1,
  })
    .populate("counselling.counsellor", "name")
    .sort({ "payments.pendingAmount": -1 })
    .limit(5000)
    .lean();

  const patientIds = patients.map((p) => p._id);

  const transactions = await Transactions.find({
    patient: { $in: patientIds },
    costType: "Revenue",
  })
    .sort({ patient: 1, date: 1 })
    .lean();

  const txByPatient = {};
  transactions.forEach((t) => {
    const pid = t.patient?.toString();
    if (!txByPatient[pid]) txByPatient[pid] = [];
    txByPatient[pid].push(t);
  });

  const rows = [];
  patients.forEach((p) => {
    const pid = p._id.toString();
    const ptxs = txByPatient[pid] || [];
    const totalAmount = p.payments?.totalAmount || 0;
    const amountReceived = p.payments?.amountReceived || 0;
    const pendingAmount = p.payments?.pendingAmount || 0;
    const paymentPct = totalAmount
      ? ((amountReceived / totalAmount) * 100).toFixed(1) + "%"
      : "0%";
    const daysSinceSurgery = p.surgery?.surgeryDate
      ? Math.floor(
          (new Date() - new Date(p.surgery.surgeryDate)) / (1000 * 60 * 60 * 24)
        )
      : "N/A";

    const base = {
      "Patient Name": p.personal?.name || "",
      Phone: p.personal?.phone || "",
      Branch: p.personal?.branch || "",
      Counsellor: p.counselling?.counsellor?.name || "",
      "Total Amount": totalAmount,
      "Amount Received": amountReceived,
      "Pending Amount": pendingAmount,
      "Payment Percentage": paymentPct,
      Status: p.ops?.status || "",
      "Days Since Surgery": daysSinceSurgery,
    };

    if (ptxs.length === 0) {
      rows.push({
        ...base,
        "Transaction Date": "",
        "Transaction Amount": "",
        "Payment Type": "",
        "Payment Method": "",
      });
    } else {
      ptxs.forEach((t) => {
        rows.push({
          ...base,
          "Transaction Date": t.date
            ? new Date(t.date).toLocaleDateString("en-IN")
            : "",
          "Transaction Amount": t.amount || 0,
          "Payment Type": t.paymentType || "",
          "Payment Method": t.method || "",
        });
      });
    }
  });

  return rows;
}

async function generatePaymentCollectionReport(filters) {
  const query = {
    ...filters.dateFilter,
    costType: "Revenue",
    method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
  };
  if (filters.branch) query.branch = filters.branch;

  const transactions = await Transactions.find(query)
    .populate("patient", "personal.name counselling.counsellor")
    .populate({
      path: "patient",
      populate: { path: "counselling.counsellor", select: "name" },
    })
    .limit(5000)
    .lean();

  const collectionData = {};

  transactions.forEach((t) => {
    const branch = t.branch || "Unknown";
    const counsellor =
      t.patient?.counselling?.counsellor?.name || "No Counsellor";
    const key = `${branch}_${counsellor}`;

    if (!collectionData[key]) {
      collectionData[key] = {
        Branch: branch,
        Counsellor: counsellor,
        "Total Collections": 0,
        "Number of Transactions": 0,
        "Booking Payments": 0,
        "Pending Payments": 0,
        "Full Payments": 0,
        "Avg Transaction": 0,
      };
    }

    collectionData[key]["Total Collections"] += t.amount || 0;
    collectionData[key]["Number of Transactions"]++;

    if (t.paymentType === "Booking") {
      collectionData[key]["Booking Payments"] += t.amount || 0;
    } else if (t.paymentType === "Pending") {
      collectionData[key]["Pending Payments"] += t.amount || 0;
    } else if (t.paymentType === "Full-payment") {
      collectionData[key]["Full Payments"] += t.amount || 0;
    }
  });

  Object.keys(collectionData).forEach((key) => {
    const data = collectionData[key];
    if (data["Number of Transactions"] > 0) {
      data["Avg Transaction"] = Math.round(
        data["Total Collections"] / data["Number of Transactions"]
      );
    }
  });

  return Object.values(collectionData);
}

async function generateProcedureRevenueReport(filters) {
  const query = {
    ...filters.dateFilter,
    costType: "Revenue",
    method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
  };
  if (filters.branch) query.branch = filters.branch;
  if (filters.procedureFilter) query.procedure = filters.procedureFilter;

  const transactions = await Transactions.find(query).limit(5000).lean();

  const procedureData = {};

  transactions.forEach((t) => {
    const procedure = t.procedure || "Other";
    if (!procedureData[procedure]) {
      procedureData[procedure] = {
        Procedure: procedure,
        "Total Revenue": 0,
        "Number of Transactions": 0,
        "Avg Transaction Value": 0,
      };
    }

    procedureData[procedure]["Total Revenue"] += t.amount || 0;
    procedureData[procedure]["Number of Transactions"]++;
  });

  Object.keys(procedureData).forEach((proc) => {
    const data = procedureData[proc];
    if (data["Number of Transactions"] > 0) {
      data["Avg Transaction Value"] = Math.round(
        data["Total Revenue"] / data["Number of Transactions"]
      );
    }
  });

  return Object.values(procedureData);
}

/**
 * Payables with the payments made against each one, as a readable statement.
 *
 * Every row carries the same key set so the sheet has one stable header. The `Row` column
 * marks whether a line is the obligation or a payment against it, which is what makes the
 * export both readable top-to-bottom AND filterable — set Row = "↳ Payment" for a payment
 * ledger, Row = "Payable" for the obligation list.
 *
 * A payable can be settled three ways (mirrors buildPayableAggregationStages, so the
 * payment lines always add up to the Paid figure on the payable line above them):
 *   - a Transaction carrying payableId
 *   - a Borrowing paid out against it
 *   - an Advance already held with the payee, applied to it
 */
async function generatePayablesAllReport(filters) {
  const match = { isCancelled: { $ne: true }, ...filters.dateFilter };
  if (filters.branch) match.branch = filters.branch;
  if (filters.payableTypeFilter) match.purpose = filters.payableTypeFilter;

  const txCollection = Transactions.collection.name;
  const payables = await Payable.aggregate([
    { $match: match },
    ...buildPayableAggregationStages(txCollection),
    // Grouped so every payable for one payee sits together, newest obligation first.
    { $sort: { purpose: 1, "payee.label": 1, createdAt: -1 } },
    { $limit: 5000 },
  ]);

  if (payables.length === 0) return [];

  const ids = payables.map((p) => p._id);
  const idStrSet = new Set(ids.map(String));

  const [txPayments, borrowingPayments, advancePayments] = await Promise.all([
    Transactions.find({
      payableId: { $in: ids },
      approvalStatus: "APPROVED",
      method: { $nin: unsettledMethodsSync() },
    })
      .select("payableId date amount method furtherMode paymentId remarks expense expenseType branch")
      .lean(),
    Borrowing.find({ payableId: { $in: ids }, direction: "OUT", isCancelled: { $ne: true } })
      .select("payableId date amount account reference remarks branch")
      .lean(),
    Advance.find({
      direction: "OUT",
      isCancelled: { $ne: true },
      $or: [{ settlesPayableId: { $in: ids } }, { "settlements.payableId": { $in: ids } }],
    })
      .select("settlesPayableId settlesPayableAmount settlements date amount account reference remarks branch")
      .lean(),
  ]);

  const paymentsByPayable = new Map();
  const push = (key, row) => {
    const k = String(key);
    if (!paymentsByPayable.has(k)) paymentsByPayable.set(k, []);
    paymentsByPayable.get(k).push(row);
  };

  txPayments.forEach((t) =>
    push(t.payableId, {
      source: "Transaction",
      date: t.date,
      amount: t.amount || 0,
      method: (t.method || "").replace(/_/g, " "),
      account: t.furtherMode || "",
      reference: t.paymentId || "",
      remarks: t.remarks || "",
    }),
  );
  borrowingPayments.forEach((b) =>
    push(b.payableId, {
      source: "Borrowing",
      date: b.date,
      amount: b.amount || 0,
      method: "borrowing",
      account: b.account || "",
      reference: b.reference || "",
      remarks: b.remarks || "",
    }),
  );
  advancePayments.forEach((a) => {
    // One advance can now settle several payables — emit one payment row per line, only
    // for the ones targeting a payable actually in this report's set.
    settlementLinesFor(a)
      .filter((line) => idStrSet.has(String(line.payableId)))
      .forEach((line) => {
        push(line.payableId, {
          source: "Advance applied",
          date: line.settledAt || a.date,
          amount: line.amount || 0,
          method: "advance",
          account: a.account || "",
          reference: a.reference || "",
          remarks: line.note || a.remarks || "",
        });
      });
  });

  const d = (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "");
  const out = [];

  for (const p of payables) {
    const payments = (paymentsByPayable.get(String(p._id)) || []).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    // Context repeated on the payment lines too, so filtering to payments alone still
    // tells you whose payable each one settled.
    const context = {
      Payee: p.payee?.label || "",
      "Payee Type": p.payee?.kind || "",
      Purpose: p.purpose || "",
      "Expense Category": p.expenseCategory || "",
      "Expense Sub-Type": p.expenseSubType || "",
      Period: p.period?.month && p.period?.year ? `${p.period.month}/${p.period.year}` : "",
      Branch: p.branch || "",
    };

    out.push({
      Row: "Payable",
      ...context,
      "Raised On": d(p.createdAt),
      "Due Date": d(p.dueDate),
      "Total Amount": p.totalAmount || 0,
      Paid: p.paid || 0,
      Pending: p.pending || 0,
      Status: p.status || "",
      "Ageing Bucket": p.pending > 0 ? p.ageingBucket || "" : "",
      "Days Overdue": p.pending > 0 ? (p.daysOverdue ?? "") : "",
      "Payments Count": payments.length,
      "Payment Date": "",
      "Payment Amount": "",
      "Payment Source": "",
      Method: "",
      Account: "",
      Reference: "",
      Remarks: p.remarks || "",
    });

    for (const pay of payments) {
      out.push({
        Row: "  ↳ Payment",
        ...context,
        "Raised On": "",
        "Due Date": "",
        "Total Amount": "",
        Paid: "",
        Pending: "",
        Status: "",
        "Ageing Bucket": "",
        "Days Overdue": "",
        "Payments Count": "",
        "Payment Date": d(pay.date),
        "Payment Amount": pay.amount,
        "Payment Source": pay.source,
        Method: pay.method,
        Account: pay.account,
        Reference: pay.reference,
        Remarks: pay.remarks,
      });
    }

    if (payments.length === 0) {
      out.push({
        Row: "  ↳ Payment",
        ...context,
        "Raised On": "",
        "Due Date": "",
        "Total Amount": "",
        Paid: "",
        Pending: "",
        Status: "",
        "Ageing Bucket": "",
        "Days Overdue": "",
        "Payments Count": "",
        "Payment Date": "",
        "Payment Amount": "",
        "Payment Source": "— nothing paid yet —",
        Method: "",
        Account: "",
        Reference: "",
        Remarks: "",
      });
    }
  }

  return out;
}

/**
 * Receivables with the receipts posted against each one — the mirror of
 * generatePayablesAllReport. Each receivable line (Row = "Receivable") is followed by its
 * receipt lines (Row = "  ↳ Receipt"), so the receipt amounts sum to the Received figure on
 * the line above. Receipts arrive three ways, matching buildReceivableAggregationStages:
 *   - a Transaction pointing straight at the receivable (receivableId)
 *   - a Transaction split across several receivables (receivableAllocations)
 *   - an Advance / Borrowing recorded IN against the receivable
 */
async function generateReceivablesAllReport(filters) {
  const match = { isCancelled: { $ne: true }, ...filters.dateFilter };
  if (filters.branch) match.branch = filters.branch;
  if (filters.revenueCategoryFilter) match.revenueCategory = filters.revenueCategoryFilter;

  const txCollection = Transactions.collection.name;
  const receivables = await Receivable.aggregate([
    { $match: match },
    ...buildReceivableAggregationStages(txCollection),
    { $sort: { revenueCategory: 1, "payer.label": 1, createdAt: -1 } },
    { $limit: 5000 },
  ]);

  if (receivables.length === 0) return [];

  const ids = receivables.map((r) => r._id);
  const idStrSet = new Set(ids.map(String));

  const [directTx, splitTx, advanceIn, borrowingIn, advancePayableOut] = await Promise.all([
    Transactions.find({
      receivableId: { $in: ids },
      costType: "Revenue",
      approvalStatus: "APPROVED",
      method: { $nin: unsettledMethodsSync() },
    })
      .select("receivableId date amount method furtherMode paymentId remarks branch")
      .lean(),
    Transactions.find({
      "receivableAllocations.receivableId": { $in: ids },
      costType: "Revenue",
      approvalStatus: "APPROVED",
      method: { $nin: unsettledMethodsSync() },
    })
      .select("receivableAllocations date method furtherMode paymentId remarks branch")
      .lean(),
    Advance.find({ receivableId: { $in: ids }, direction: "IN", isCancelled: { $ne: true } })
      .select("receivableId date amount account reference remarks branch")
      .lean(),
    Borrowing.find({ settlesReceivableId: { $in: ids }, direction: "IN", isCancelled: { $ne: true } })
      .select("settlesReceivableId date amount account reference remarks branch")
      .lean(),
    Advance.find({
      receivableId: { $in: ids },
      direction: "OUT",
      isCancelled: { $ne: true },
      $or: [{ settlesPayableId: { $ne: null } }, { "settlements.0": { $exists: true } }],
    })
      .select("receivableId settlesPayableId settlesPayableAmount settlements date amount account reference remarks branch")
      .lean(),
  ]);

  const receiptsByReceivable = new Map();
  const push = (key, row) => {
    const k = String(key);
    if (!receiptsByReceivable.has(k)) receiptsByReceivable.set(k, []);
    receiptsByReceivable.get(k).push(row);
  };

  directTx.forEach((t) =>
    push(t.receivableId, {
      source: "Transaction",
      date: t.date,
      amount: t.amount || 0,
      method: (t.method || "").replace(/_/g, " "),
      account: t.furtherMode || "",
      reference: t.paymentId || "",
      remarks: t.remarks || "",
    }),
  );
  splitTx.forEach((t) => {
    (t.receivableAllocations || []).forEach((a) => {
      if (!idStrSet.has(String(a.receivableId))) return;
      push(a.receivableId, {
        source: "Transaction (split)",
        date: t.date,
        amount: a.amount || 0,
        method: (t.method || "").replace(/_/g, " "),
        account: t.furtherMode || "",
        reference: t.paymentId || "",
        remarks: t.remarks || "",
      });
    });
  });
  advanceIn.forEach((a) =>
    push(a.receivableId, {
      source: "Advance applied",
      date: a.date,
      amount: a.amount || 0,
      method: "advance",
      account: a.account || "",
      reference: a.reference || "",
      remarks: a.remarks || "",
    }),
  );
  borrowingIn.forEach((b) =>
    push(b.settlesReceivableId, {
      source: "Borrowing",
      date: b.date,
      amount: b.amount || 0,
      method: "borrowing",
      account: b.account || "",
      reference: b.reference || "",
      remarks: b.remarks || "",
    }),
  );
  advancePayableOut.forEach((a) => {
    // Every settlement line on this advance nets its own receivable, regardless of which
    // payable it targets — one report row per line.
    settlementLinesFor(a).forEach((line) => {
      push(a.receivableId, {
        source: "Advance applied to payable",
        date: line.settledAt || a.date,
        amount: line.amount || 0,
        method: "advance→payable",
        account: a.account || "",
        reference: a.reference || "",
        remarks: line.note || a.remarks || "",
      });
    });
  });

  const d = (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "");
  const out = [];

  for (const r of receivables) {
    const receipts = (receiptsByReceivable.get(String(r._id)) || []).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    const context = {
      Payer: r.payer?.label || "",
      "Payer Type": r.payer?.kind || "",
      "Revenue Category": r.revenueCategory || "",
      Purpose: r.purpose || "",
      Period: r.period?.month && r.period?.year ? `${r.period.month}/${r.period.year}` : "",
      Branch: r.branch || "",
    };

    out.push({
      Row: "Receivable",
      ...context,
      "Raised On": d(r.createdAt),
      "Due Date": d(r.dueDate),
      "Total Amount": r.totalAmount || 0,
      Received: r.received || 0,
      Pending: r.pending || 0,
      Status: r.status || "",
      "Ageing Bucket": r.pending > 0 ? r.ageingBucket || "" : "",
      "Days Overdue": r.pending > 0 ? (r.daysOverdue ?? "") : "",
      "Receipts Count": receipts.length,
      "Receipt Date": "",
      "Receipt Amount": "",
      "Receipt Source": "",
      Method: "",
      Account: "",
      Reference: "",
      Remarks: r.remarks || "",
    });

    for (const rc of receipts) {
      out.push({
        Row: "  ↳ Receipt",
        ...context,
        "Raised On": "",
        "Due Date": "",
        "Total Amount": "",
        Received: "",
        Pending: "",
        Status: "",
        "Ageing Bucket": "",
        "Days Overdue": "",
        "Receipts Count": "",
        "Receipt Date": d(rc.date),
        "Receipt Amount": rc.amount,
        "Receipt Source": rc.source,
        Method: rc.method,
        Account: rc.account,
        Reference: rc.reference,
        Remarks: rc.remarks,
      });
    }

    if (receipts.length === 0) {
      out.push({
        Row: "  ↳ Receipt",
        ...context,
        "Raised On": "",
        "Due Date": "",
        "Total Amount": "",
        Received: "",
        Pending: "",
        Status: "",
        "Ageing Bucket": "",
        "Days Overdue": "",
        "Receipts Count": "",
        "Receipt Date": "",
        "Receipt Amount": "",
        "Receipt Source": "— nothing received yet —",
        Method: "",
        Account: "",
        Reference: "",
        Remarks: "",
      });
    }
  }

  return out;
}

const fmtDay = (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "");
const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

// Every unexplained credit/debit parked in a suspense account. `from`/`to` are already
// IST-bracketed Date objects (getISTStartOfDay / getISTEndOfDay), or null.
async function generateSuspenseReport({ from, to, branch }) {
  const match = {};
  if (branch) match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }

  const rows = await SuspenseEntry.find(match)
    .sort({ date: -1, createdAt: -1 })
    .limit(10000)
    .lean();

  return rows.map((s) => ({
    Date: fmtDay(s.date),
    Account: s.account || "",
    Direction: s.direction === "OUT" ? "Debit (OUT)" : "Credit (IN)",
    "Money In": s.direction === "OUT" ? "" : s.amount || 0,
    "Money Out": s.direction === "OUT" ? s.amount || 0 : "",
    Branch: s.branch || "",
    Status: s.isCancelled ? "Cancelled" : s.isResolved ? "Resolved" : "Open",
    "Resolved On": fmtDay(s.resolvedAt),
    "Resolved By": s.resolvedBy?.name || "",
    "Resolved Txn": s.resolvedTransactionId ? String(s.resolvedTransactionId) : "",
    Reference: s.reference || "",
    Remarks: s.remarks || "",
    "Created By": s.createdBy?.name || "",
    "Created On": fmtDateTime(s.createdAt),
    "Entry ID": String(s._id),
  }));
}

// Every internal transfer between our own accounts (contra). Two rows per transfer — one
// from the paying account, one for the receiving account — so it reads as a ledger and
// each side nets against its account.
async function generateContraReport({ from, to, branch }) {
  const match = {};
  if (branch) match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }

  const transfers = await AccountTransfer.find(match)
    .sort({ date: -1, createdAt: -1 })
    .limit(10000)
    .lean();

  const KIND_LABEL = {
    MANUAL: "Manual",
    LOAN_SETTLEMENT: "Loan settlement",
    LOAN_CANCELLATION: "Loan cancellation",
  };

  const out = [];
  for (const t of transfers) {
    const base = {
      Date: fmtDay(t.date),
      Amount: t.amount || 0,
      Branch: t.branch || "",
      Kind: KIND_LABEL[t.transferKind] || t.transferKind || "Manual",
      Status: t.isCancelled ? "Cancelled" : "Active",
      Reference: t.reference || "",
      Remarks: t.remarks || "",
      "Created By": t.createdBy?.name || "",
      "Created On": fmtDateTime(t.createdAt),
      "Transfer ID": String(t._id),
    };
    out.push({
      Row: "From",
      Account: t.fromAccount || "",
      "Counterparty Account": t.toAccount || "",
      "In": "",
      "Out": t.amount || 0,
      ...base,
    });
    out.push({
      Row: "To",
      Account: t.toAccount || "",
      "Counterparty Account": t.fromAccount || "",
      "In": t.amount || 0,
      "Out": "",
      ...base,
    });
  }
  return out;
}

// Every staff incentive recorded on a patient, grouped by employee, with whether it has
// been rolled into an incentive payable and — for that payable — the live paid/pending.
async function generateIncentivesReport({ from, to, branch }) {
  const rowMatch = { "incentives.isCancelled": { $ne: true } };
  if (branch) rowMatch["incentives.branch"] = branch;
  if (from || to) {
    rowMatch["incentives.date"] = {};
    if (from) rowMatch["incentives.date"].$gte = from;
    if (to) rowMatch["incentives.date"].$lte = to;
  }

  const rows = await Patient.aggregate([
    { $match: { "incentives.0": { $exists: true } } },
    { $unwind: "$incentives" },
    { $match: rowMatch },
    {
      $project: {
        _id: 0,
        employeeId: "$incentives.employee",
        employeeName: "$incentives.employeeName",
        role: "$incentives.role",
        purpose: "$incentives.purpose",
        amount: "$incentives.amount",
        date: "$incentives.date",
        branch: "$incentives.branch",
        payableId: "$incentives.payableId",
        remarks: "$incentives.remarks",
        patientName: "$personal.name",
        patientPhone: "$personal.phone",
        patientBranch: "$personal.branch",
      },
    },
    { $sort: { employeeName: 1, date: -1 } },
  ]);

  if (rows.length === 0) return [];

  // Live paid/pending for each distinct incentive payable, looked up once.
  const payableIds = [...new Set(rows.map((r) => r.payableId).filter(Boolean).map(String))];
  const payableById = new Map();
  if (payableIds.length) {
    const mongoose = (await import("mongoose")).default;
    const oids = payableIds.map((id) => new mongoose.Types.ObjectId(id));
    const payables = await Payable.aggregate([
      { $match: { _id: { $in: oids } } },
      ...buildPayableAggregationStages(Transactions.collection.name),
      { $project: { totalAmount: 1, paid: 1, pending: 1, status: 1 } },
    ]);
    payables.forEach((p) => payableById.set(String(p._id), p));
  }

  // Resolve employee names for any incentive missing the denormalised name.
  const missingName = [...new Set(rows.filter((r) => !r.employeeName && r.employeeId).map((r) => String(r.employeeId)))];
  const empNameById = new Map();
  if (missingName.length) {
    const mongoose = (await import("mongoose")).default;
    const emps = await Employee.find(
      { _id: { $in: missingName.map((id) => new mongoose.Types.ObjectId(id)) } },
      { name: 1, role: 1 },
    ).lean();
    emps.forEach((e) => empNameById.set(String(e._id), e));
  }

  return rows.map((r) => {
    const p = r.payableId ? payableById.get(String(r.payableId)) : null;
    const emp = !r.employeeName && r.employeeId ? empNameById.get(String(r.employeeId)) : null;
    return {
      Employee: r.employeeName || emp?.name || "",
      Role: r.role || emp?.role || "",
      Patient: r.patientName || "",
      "Patient Phone": r.patientPhone || "",
      Purpose: r.purpose || "",
      Amount: r.amount || 0,
      Date: fmtDay(r.date),
      Branch: r.branch || r.patientBranch || "",
      "Payable Raised": r.payableId ? "Yes" : "No",
      "Payable Total": p ? p.totalAmount : "",
      "Payable Paid": p ? p.paid : "",
      "Payable Pending": p ? p.pending : "",
      "Payable Status": p ? p.status : r.payableId ? "Unknown" : "Not raised",
      "Payable ID": r.payableId ? String(r.payableId) : "",
      Remarks: r.remarks || "",
    };
  });
}

async function generateBranchComparisonReport(filters) {
  const patientQuery = { ...filters.patientDateFilter };
  const txQuery = { ...filters.transactionDateFilter };

  const targetBranches = ALL_BRANCHES.filter((b) => branchAllowed(filters.branch, b));

  const branchData = await Promise.all(
    targetBranches.map(async (branch) => {
      const branchQuery = { ...patientQuery, "personal.branch": branch };

      const [patientFacet, txFacet] = await Promise.all([
        Patient.aggregate([
          { $match: branchQuery },
          {
            $facet: {
              total: [{ $count: "count" }],
              surgeries: [{ $match: { "surgery.surgeryDate": { $exists: true } } }, { $count: "count" }],
            },
          },
        ]),
        Transactions.aggregate([
          {
            $match: {
              ...txQuery,
              branch,
              method: { $nin: unsettledMethodsSync() },
              ...SETTLEMENT_EXCLUSION,
            },
          },
          {
            $group: { _id: "$costType", total: { $sum: "$amount" } },
          },
        ]),
      ]);

      const totalPatients = patientFacet[0]?.total?.[0]?.count || 0;
      const surgeries = patientFacet[0]?.surgeries?.[0]?.count || 0;
      const totalRevenue = txFacet.find((r) => r._id === "Revenue")?.total || 0;
      const totalExpenses = txFacet.find((r) => r._id === "Expenses")?.total || 0;

      return {
        Branch: branch,
        "Total Patients": totalPatients,
        "Total Surgeries": surgeries,
        "Conversion Rate": totalPatients
          ? ((surgeries / totalPatients) * 100).toFixed(1) + "%"
          : "0%",
        "Total Revenue": totalRevenue,
        "Total Expenses": totalExpenses,
        "Net Profit": totalRevenue - totalExpenses,
        "Profit Margin": totalRevenue
          ? (((totalRevenue - totalExpenses) / totalRevenue) * 100).toFixed(1) +
            "%"
          : "0%",
      };
    })
  );

  return branchData;
}

async function generateBranchRevenueReport(filters) {
  const query = {
    ...filters.dateFilter,
    costType: "Revenue",
    method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
  };
  if (filters.branch) query.branch = filters.branch;

  const transactions = await Transactions.find(query).limit(5000).lean();

  const branchData = {};

  transactions.forEach((t) => {
    const branch = t.branch || "Unknown";
    if (!branchData[branch]) {
      branchData[branch] = {
        Branch: branch,
        "Total Revenue": 0,
        "Total Transactions": 0,
        "Hair Transplant Revenue": 0,
        "PRP Revenue": 0,
        "Beard Transplant Revenue": 0,
        "Medicine Revenue": 0,
        "GFC Revenue": 0,
        "Other Revenue": 0,
      };
    }

    branchData[branch]["Total Revenue"] += t.amount || 0;
    branchData[branch]["Total Transactions"]++;

    const procedure = t.procedure || "Other";
    if (procedure === "hair transplant") {
      branchData[branch]["Hair Transplant Revenue"] += t.amount || 0;
    } else if (procedure === "prp") {
      branchData[branch]["PRP Revenue"] += t.amount || 0;
    } else if (procedure === "beard transplant") {
      branchData[branch]["Beard Transplant Revenue"] += t.amount || 0;
    } else if (procedure === "medicine") {
      branchData[branch]["Medicine Revenue"] += t.amount || 0;
    } else if (procedure === "gfc") {
      branchData[branch]["GFC Revenue"] += t.amount || 0;
    } else {
      branchData[branch]["Other Revenue"] += t.amount || 0;
    }
  });

  return Object.values(branchData);
}

async function generateBranchPatientsReport(filters) {
  const query = { ...filters.dateFilter };

  const targetBranches = ALL_BRANCHES.filter((b) => branchAllowed(filters.branch, b));

  const branchData = await Promise.all(
    targetBranches.map(async (branch) => {
      const branchQuery = { ...query, "personal.branch": branch };

      const statusCounts = await Patient.aggregate([
        { $match: branchQuery },
        { $group: { _id: "$ops.status", count: { $sum: 1 } } },
      ]);
      const byStatus = Object.fromEntries(statusCounts.map((r) => [r._id, r.count]));
      const totalPatients = statusCounts.reduce((sum, r) => sum + r.count, 0);
      const newPatients = byStatus.NEW || 0;
      const consulted = byStatus.CONSULTED || 0;
      const scheduled = byStatus.SURGERY_BOOKED || 0;
      const bookingDone = byStatus.BOOKING_DONE || 0;
      const closed = byStatus.CLOSED || 0;

      return {
        Branch: branch,
        "Total Patients": totalPatients,
        "New Patients": newPatients,
        Consulted: consulted,
        "Surgery Booked": scheduled,
        "Booking Done": bookingDone,
        Closed: closed,
        "Conversion Rate":
          totalPatients > 0
            ? (((bookingDone + closed) / totalPatients) * 100).toFixed(1) + "%"
            : "0%",
      };
    })
  );

  return branchData;
}

async function generateEmployeesAllReport() {
  const employees = await Employee.find({})
    .select("name role email phone isactive salaryStructure incentiveRate patient createdAt updatedAt")
    .sort({ name: 1 })
    .lean();

  return employees.map((e) => ({
    "Employee ID": e._id.toString(),
    Name: e.name || "",
    Role: e.role || "",
    Email: e.email || "",
    Phone: e.phone || "",
    Status: e.isactive ? "Active" : "Inactive",
    "Total Patients": Array.isArray(e.patient) ? e.patient.length : 0,
    "Base Salary": e.salaryStructure?.baseSalary ?? "",
    "Salary Type": e.salaryStructure?.salaryType || "",
    "Salary Effective From": e.salaryStructure?.effectiveFrom
      ? new Date(e.salaryStructure.effectiveFrom).toLocaleDateString()
      : "",
    "Incentive Rate": e.incentiveRate ?? "",
    "Joined On": e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "",
    "Last Updated": e.updatedAt ? new Date(e.updatedAt).toLocaleDateString() : "",
  }));
}

async function generateStocksAllReport() {
  const stocks = await Stock.find({}).limit(5000).lean();

  return stocks.map((s) => ({
    "Stock Name": s.name || "",
    Location: s.location || "",
    "Total Quantity": s.totalQuantity ?? 0,
    Unit: s.unit || "",
    MRP: s.mrp ?? "",
    "Purchase Amount": s.purchaseAmt ?? "",
    "Sold Amount": s.soldAmt ?? "",
    "Stock Value": ((s.totalQuantity || 0) * (s.purchaseAmt || 0)).toFixed(2),
    "Expiry Date": s.expiry ? new Date(s.expiry).toLocaleDateString() : "",
    "GST No": s.gstNo || "",
    "Added By": s.createdBy?.name || "",
    "Added Branch": s.createdBy?.branch || "",
  }));
}

async function generateVendorsAllReport() {
  const vendors = await Vendor.find({}).limit(5000).lean();

  return vendors.map((v) => ({
    "Vendor Name": v.name || "",
    Phone: v.contact ? String(v.contact) : "",
    Email: v.email || "",
    Address: v.address || "",
    "GST Number": v.gstNumber || "",
    "Deals In": v.DealsIn || "",
    "Transaction Count": Array.isArray(v.Transactions) ? v.Transactions.length : 0,
  }));
}
