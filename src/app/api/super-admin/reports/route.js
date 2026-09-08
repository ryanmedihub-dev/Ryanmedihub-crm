import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions";
import Stock from "@/models/Stock";
import Leads from "@/models/Leads";
import Interviewer from "@/models/Interviewer";
import Vendor from "@/models/Vendor";
import { ALL_BRANCHES } from "@/lib/branches";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";
import { canonicalEmployeeRole } from "@/constants/employeeRoles";
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const branch = searchParams.get("branch");
    const staffFilter = searchParams.get("staffFilter");
    const techniqueFilter = searchParams.get("techniqueFilter");
    const statusFilter = searchParams.get("statusFilter");
    const procedureFilter = searchParams.get("procedureFilter");
    const paymentTypeFilter = searchParams.get("paymentTypeFilter");
    const hrStatus = searchParams.get("hrStatus");

    let data = [];

    // The client now sends bare YYYY-MM-DD calendar days; bracket each to the IST day so
    // "31 Aug" means exactly 31 Aug 00:00–23:59 IST and doesn't bleed into the 30th.
    const rangeStart = from ? getISTStartOfDay(from) : null;
    const rangeEnd = to ? getISTEndOfDay(to) : null;
    const dateWindow = rangeStart && rangeEnd ? { $gte: rangeStart, $lte: rangeEnd } : null;

    const dateFilter = dateWindow ? { createdAt: dateWindow } : {};
    const visitDateFilter = dateWindow ? { "personal.visitDate": dateWindow } : {};
    const txDateFilter = dateWindow ? { date: dateWindow } : {};
    const surgeryDateFilter = dateWindow ? { "surgery.surgeryDate": dateWindow } : {};

    switch (type) {
      case "patients-comprehensive":
        data = await generateComprehensivePatientReport({
          visitDateFilter,
          branch,
          staffFilter,
          techniqueFilter,
          statusFilter,
        });
        break;

      case "patients-status":
        data = await generateStatusReport({
          visitDateFilter,
          branch,
          statusFilter,
        });
        break;

      case "patients-medical":
        data = await generateMedicalHistoryReport({ visitDateFilter, branch });
        break;

      case "patients-surgery":
        data = await generateSurgeryScheduleReport({
          surgeryDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "patients-counselling":
        data = await generateCounsellingOutcomesReport({
          visitDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "outstanding-payments":
        data = await generateOutstandingPaymentsReport({
          branch,
          statusFilter,
        });
        break;

      case "grafts-analysis":
        data = await generateGraftsAnalysisReport({
          visitDateFilter,
          branch,
          techniqueFilter,
        });
        break;

      case "employees-all":
        data = await generateEmployeesReport({ branch });
        break;

      case "counsellors":
        data = await generateCounsellorReport({
          visitDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "agents":
        data = await generateAgentReport({
          visitDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "doctors":
        data = await generateDoctorReport({
          visitDateFilter,
          branch,
          staffFilter,
          techniqueFilter,
        });
        break;

      case "implanters":
        data = await generateImplanterReport({
          visitDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "technicians":
        data = await generateTechnicianReport({
          visitDateFilter,
          branch,
          staffFilter,
        });
        break;

      case "revenue":
        data = await generateRevenueReport({
          txDateFilter,
          branch,
          procedureFilter,
          paymentTypeFilter,
        });
        break;

      case "expenses":
        data = await generateExpensesReport({ txDateFilter, branch });
        break;

      case "transactions-all":
        data = await generateTransactionsReport({
          txDateFilter,
          branch,
          procedureFilter,
          paymentTypeFilter,
        });
        break;

      case "procedure-revenue":
        data = await generateProcedureRevenueReport({
          txDateFilter,
          branch,
          procedureFilter,
        });
        break;

      case "branch-comparison":
        data = await generateBranchComparisonReport({
          visitDateFilter,
          txDateFilter,
        });
        break;

      case "techniques":
        data = await generateTechniqueReport({
          visitDateFilter,
          branch,
          techniqueFilter,
        });
        break;

      case "stocks-all":
        data = await generateStocksReport();
        break;

      case "vendors-all":
        data = await generateVendorsReport();
        break;

      case "leads-all":
        data = await generateLeadsReport({ dateFilter });
        break;

      case "hr-interviews-all":
        data = await generateHRAllCandidates({ dateFilter, hrStatus });
        break;

      case "hr-selected":
        data = await generateHRSelected({ dateFilter });
        break;

      case "hr-rejected":
        data = await generateHRRejected({ dateFilter });
        break;

      case "hr-position-wise":
        data = await generateHRPositionWise({ dateFilter });
        break;

      case "hr-evaluation-scores":
        data = await generateHREvaluationScores({ dateFilter, hrStatus });
        break;

      case "hr-salary-analysis":
        data = await generateHRSalaryAnalysis({ dateFilter });
        break;

      default:
        return NextResponse.json(
          { success: false, message: "Invalid report type" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error("Super-admin report error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

async function generateComprehensivePatientReport({
  visitDateFilter,
  branch,
  staffFilter,
  techniqueFilter,
  statusFilter,
}) {
  const query = { ...visitDateFilter };
  if (branch && branch !== "All") query["personal.branch"] = branch;
  if (statusFilter) query["ops.status"] = statusFilter;

  let patients = await Patient.find(query)
    .populate("personal.reference", "name role")
    .populate("counselling.counsellor", "name")
    .populate("surgery.doctor", "name")
    .populate("surgery.seniorTech", "name")
    .populate("surgery.implanterRight", "name")
    .populate("surgery.implanterLeft", "name")
    .lean();

  if (staffFilter) {
    patients = patients.filter(
      (p) =>
        p.personal?.reference?.name === staffFilter ||
        p.counselling?.counsellor?.name === staffFilter ||
        p.surgery?.doctor?.name === staffFilter
    );
  }

  if (techniqueFilter) {
    patients = patients.filter(
      (p) =>
        p.counselling?.techniqueSuggested === techniqueFilter ||
        p.surgery?.technique === techniqueFilter
    );
  }

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Email: p.personal?.email || "",
    Age: p.personal?.age || "",
    Gender: p.personal?.gender || "",
    Branch: p.personal?.branch || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString("en-IN")
      : "",
    Purpose: p.personal?.purpose || "",
    "Package Quoted": p.personal?.packageQuoted || "",
    "Technique Quoted": p.personal?.techniqueQuoted || "",
    "Reference Agent": p.personal?.reference?.name || "",
    Counsellor: p.counselling?.counsellor?.name || "",
    "Technique Suggested": p.counselling?.techniqueSuggested || "",
    "Final Package": p.counselling?.finlpackage || "",
    "Grafts Suggested": p.counselling?.graftsSuggested || "",
    "Ready For Surgery": p.counselling?.readyForSurgery ? "Yes" : "No",
    "Surgery Date": p.surgery?.surgeryDate
      ? new Date(p.surgery.surgeryDate).toLocaleDateString("en-IN")
      : "",
    "Surgery Technique": p.surgery?.technique || "",
    "Grafts Implanted": p.surgery?.graftsImplanted || "",
    Doctor: p.surgery?.doctor?.name || "",
    "Senior Technician": p.surgery?.seniorTech?.name || "",
    "Implanter Right": p.surgery?.implanterRight?.name || "",
    "Implanter Left": p.surgery?.implanterLeft?.name || "",
    "Total Amount": p.payments?.totalAmount || 0,
    "Amount Received": p.payments?.amountReceived || 0,
    "Pending Amount": p.payments?.pendingAmount || 0,
    Discount: p.payments?.discount || 0,
    Status: p.ops?.status || "",
    "Blood Group": p.medical?.bloodGroup || "",
    Allergies: p.medical?.allergies || "",
    "Medical History": p.medical?.medicalHistory || "",
    "Created At": p.createdAt
      ? new Date(p.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateStatusReport({ visitDateFilter, branch, statusFilter }) {
  const query = { ...visitDateFilter };
  if (branch && branch !== "All") query["personal.branch"] = branch;
  if (statusFilter) query["ops.status"] = statusFilter;

  const patients = await Patient.find(query)
    .populate("personal.reference", "name")
    .populate("counselling.counsellor", "name")
    .lean();

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Email: p.personal?.email || "",
    Branch: p.personal?.branch || "",
    Status: p.ops?.status || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString("en-IN")
      : "",
    "Reference Agent": p.personal?.reference?.name || "",
    Counsellor: p.counselling?.counsellor?.name || "",
    "Package Quoted": p.personal?.packageQuoted || "",
    "Amount Received": p.payments?.amountReceived || 0,
    "Pending Amount": p.payments?.pendingAmount || 0,
    "Days Since Visit": p.personal?.visitDate
      ? Math.floor(
          (new Date() - new Date(p.personal.visitDate)) / (1000 * 60 * 60 * 24)
        )
      : "",
  }));
}

async function generateMedicalHistoryReport({ visitDateFilter, branch }) {
  const query = { ...visitDateFilter };
  if (branch && branch !== "All") query["personal.branch"] = branch;

  const patients = await Patient.find(query).lean();

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Age: p.personal?.age || "",
    Gender: p.personal?.gender || "",
    Branch: p.personal?.branch || "",
    "Blood Group": p.medical?.bloodGroup || "",
    Allergies: p.medical?.allergies || "",
    "Medical History": p.medical?.medicalHistory || "",
    Sugar: p.medical?.sugar || "",
    "Blood Pressure": p.medical?.bp || "",
    Pulse: p.medical?.pulse || "",
    Weight: p.medical?.weight || "",
    HIV: p.medical?.hiv || "",
    HCV: p.medical?.hcv || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateSurgeryScheduleReport({
  surgeryDateFilter,
  branch,
  staffFilter,
}) {
  const query = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (surgeryDateFilter?.["surgery.surgeryDate"]) {
    query["surgery.surgeryDate"] = {
      ...query["surgery.surgeryDate"],
      ...surgeryDateFilter["surgery.surgeryDate"],
    };
  }
  if (branch && branch !== "All") query["personal.branch"] = branch;

  const patients = await Patient.find(query)
    .populate("surgery.doctor", "name")
    .populate("surgery.seniorTech", "name")
    .populate("surgery.implanterRight", "name")
    .populate("surgery.implanterLeft", "name")
    .populate("surgery.graftingPerson", "name")
    .populate("surgery.helper", "name")
    .populate("counselling.counsellor", "name")
    .populate("personal.reference", "name")
    .sort({ "surgery.surgeryDate": -1 })
    .lean();

  const namesOf = (arr) => (arr || []).map((e) => e?.name).filter(Boolean).join(", ");

  let filtered = patients;
  if (staffFilter) {
    filtered = patients.filter((p) => {
      const allStaff = [
        ...(p.surgery?.doctor || []),
        ...(p.surgery?.seniorTech || []),
        ...(p.surgery?.implanterRight || []),
        ...(p.surgery?.implanterLeft || []),
        ...(p.surgery?.graftingPerson || []),
        ...(p.surgery?.helper || []),
      ];
      return allStaff.some((e) => e?.name === staffFilter);
    });
  }

  return filtered.map((p) => {
    const prpSessions = (p.afterSurgery?.prp || [])
      .map(
        (s) =>
          `#${s.prpNumber ?? "—"} ${s.type || "PRP"} (${
            s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"
          })`
      )
      .join("; ");

    return {
      "Surgery Date": p.surgery?.surgeryDate
        ? new Date(p.surgery.surgeryDate).toLocaleDateString("en-IN")
        : "",
      "Patient Name": p.personal?.name || "",
      Phone: p.personal?.phone || "",
      Email: p.personal?.email || "",
      Age: p.personal?.age || "",
      Gender: p.personal?.gender || "",
      Branch: p.personal?.branch || "",
      Address: p.personal?.address || "",
      "Referred By": p.personal?.reference?.name || "",
      Location: p.surgery?.location || "",
      Technique: p.surgery?.technique || "",
      OT: p.surgery?.OT || "",
      "Grafts Needed": p.surgery?.graftsneed || "",
      "Grafts Implanted": p.surgery?.graftsImplanted || "",
      "Donor Condition": p.surgery?.donorCondition || "",
      Doctor: namesOf(p.surgery?.doctor),
      "Senior Tech": namesOf(p.surgery?.seniorTech),
      "Implanter Right": namesOf(p.surgery?.implanterRight),
      "Implanter Left": namesOf(p.surgery?.implanterLeft),
      "Grafting Person": namesOf(p.surgery?.graftingPerson),
      Helper: namesOf(p.surgery?.helper),
      Counsellor: p.counselling?.counsellor?.name || "",
      "Headwash Date": p.afterSurgery?.headwashDate
        ? new Date(p.afterSurgery.headwashDate).toLocaleDateString("en-IN")
        : "",
      "Bandage Removal Date": p.afterSurgery?.bandageRemovalDate
        ? new Date(p.afterSurgery.bandageRemovalDate).toLocaleDateString("en-IN")
        : "",
      "PRP Sessions": prpSessions,
      "Blood Group": p.medical?.bloodGroup || "",
      Allergies: p.medical?.allergies || "",
      "Medical History": p.medical?.medicalHistory || "",
      Sugar: p.medical?.sugar || "",
      BP: p.medical?.bp || "",
      Pulse: p.medical?.pulse || "",
      Weight: p.medical?.weight || "",
      HIV: p.medical?.hiv || "",
      HCV: p.medical?.hcv || "",
      "Total Amount": p.payments?.totalAmount || 0,
      "Amount Received": p.payments?.amountReceived || 0,
      "Pending Amount": p.payments?.pendingAmount || 0,
      Discount: p.payments?.discount || 0,
      "Medicine Amount": p.payments?.medicineAmount || 0,
      Status: p.ops?.status || "",
    };
  });
}

async function generateCounsellingOutcomesReport({
  visitDateFilter,
  branch,
  staffFilter,
}) {
  const query = { ...visitDateFilter };
  if (branch && branch !== "All") query["personal.branch"] = branch;

  const patients = await Patient.find(query)
    .populate("counselling.counsellor", "name")
    .lean();

  let filtered = patients;
  if (staffFilter) {
    filtered = patients.filter(
      (p) => p.counselling?.counsellor?.name === staffFilter
    );
  }

  return filtered.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Branch: p.personal?.branch || "",
    Counsellor: p.counselling?.counsellor?.name || "",
    "Technique Suggested": p.counselling?.techniqueSuggested || "",
    "Grafts Suggested": p.counselling?.graftsSuggested || "",
    "Final Package": p.counselling?.finlpackage || "",
    "Ready For Surgery": p.counselling?.readyForSurgery ? "Yes" : "No",
    "Additional Benefits": (p.counselling?.additionalbenefits || []).join(", "),
    Medicines: (p.counselling?.medicines || []).join(", "),
    Status: p.ops?.status || "",
    "Visit Date": p.personal?.visitDate
      ? new Date(p.personal.visitDate).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateOutstandingPaymentsReport({ branch, statusFilter }) {
  const query = { "payments.pendingAmount": { $gt: 0 } };
  if (branch && branch !== "All") query["personal.branch"] = branch;
  if (statusFilter) query["ops.status"] = statusFilter;

  const patients = await Patient.find(query)
    .populate("counselling.counsellor", "name")
    .sort({ "payments.pendingAmount": -1 })
    .lean();

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Email: p.personal?.email || "",
    Branch: p.personal?.branch || "",
    Counsellor: p.counselling?.counsellor?.name || "",
    "Total Amount": p.payments?.totalAmount || 0,
    "Amount Received": p.payments?.amountReceived || 0,
    "Pending Amount": p.payments?.pendingAmount || 0,
    "Payment %": p.payments?.totalAmount
      ? (
          ((p.payments.amountReceived || 0) / p.payments.totalAmount) *
          100
        ).toFixed(1) + "%"
      : "0%",
    "Surgery Date": p.surgery?.surgeryDate
      ? new Date(p.surgery.surgeryDate).toLocaleDateString("en-IN")
      : "Not Done",
    "Days Since Surgery": p.surgery?.surgeryDate
      ? Math.floor(
          (new Date() - new Date(p.surgery.surgeryDate)) / (1000 * 60 * 60 * 24)
        )
      : "N/A",
    Status: p.ops?.status || "",
  }));
}

async function generateGraftsAnalysisReport({
  visitDateFilter,
  branch,
  techniqueFilter,
}) {
  const query = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (branch && branch !== "All") query["personal.branch"] = branch;
  if (techniqueFilter) query["surgery.technique"] = techniqueFilter;

  const patients = await Patient.find(query).lean();

  return patients.map((p) => ({
    "Patient Name": p.personal?.name || "",
    Phone: p.personal?.phone || "",
    Branch: p.personal?.branch || "",
    "Surgery Date": p.surgery?.surgeryDate
      ? new Date(p.surgery.surgeryDate).toLocaleDateString("en-IN")
      : "",
    Technique: p.surgery?.technique || "",
    "Grafts Suggested": p.counselling?.graftsSuggested || 0,
    "Grafts Needed": p.surgery?.graftsneed || 0,
    "Grafts Implanted": p.surgery?.graftsImplanted || 0,
    "Variance (Suggested vs Implanted)":
      (p.surgery?.graftsImplanted || 0) - (p.counselling?.graftsSuggested || 0),
    "Implantation Rate": p.surgery?.graftsneed
      ? (
          ((p.surgery.graftsImplanted || 0) / p.surgery.graftsneed) *
          100
        ).toFixed(1) + "%"
      : "N/A",
  }));
}

async function generateEmployeesReport({ branch }) {
  const query = {};
  if (branch && branch !== "All") query.branch = branch;

  const employees = await Employee.find(query).lean();

  return employees.map((e) => ({
    "Employee ID": e.employeeId || "",
    Name: e.name || "",
    Phone: e.phone || "",
    Email: e.email || "",
    Role: e.role || "",
    Profile: canonicalEmployeeRole(e.role),
    Branch: e.branch || "",
    "Is Active": e.isactive ? "Yes" : "No",
    "Total Patients": (e.patient || []).length,
    "Joined At": e.createdAt
      ? new Date(e.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateCounsellorReport({ visitDateFilter, branch, staffFilter }) {
  const query = { ...visitDateFilter };
  if (branch && branch !== "All") query["personal.branch"] = branch;

  let patients = await Patient.find(query)
    .populate("counselling.counsellor", "name email phone employeeId role")
    .lean();

  const counsellorStats = {};

  patients.forEach((p) => {
    const c = p.counselling?.counsellor;
    if (!c) return;
    const id = c._id?.toString();
    if (!id) return;
    if (!counsellorStats[id]) {
      counsellorStats[id] = {
        "Employee ID": c.employeeId || "",
        "Counsellor Name": c.name,
        Role: canonicalEmployeeRole(c.role),
        Email: c.email || "",
        Phone: c.phone || "",
        "Total Patients": 0,
        "Ready for Surgery": 0,
        "Not Ready": 0,
        "Conversion Rate": "0%",
        "Total Package Value": 0,
        "Avg Package Value": 0,
      };
    }
    counsellorStats[id]["Total Patients"]++;
    if (p.counselling?.readyForSurgery) {
      counsellorStats[id]["Ready for Surgery"]++;
    } else {
      counsellorStats[id]["Not Ready"]++;
    }
    if (p.counselling?.finlpackage) {
      counsellorStats[id]["Total Package Value"] += Number(p.counselling.finlpackage) || 0;
    }
  });

  Object.values(counsellorStats).forEach((s) => {
    if (s["Total Patients"] > 0) {
      s["Conversion Rate"] =
        ((s["Ready for Surgery"] / s["Total Patients"]) * 100).toFixed(1) + "%";
      s["Avg Package Value"] = Math.round(
        s["Total Package Value"] / s["Total Patients"]
      );
    }
  });

  let result = Object.values(counsellorStats).filter(
    (s) => s["Total Patients"] > 0
  );
  if (staffFilter) result = result.filter((s) => s["Counsellor Name"] === staffFilter);
  return result;
}

async function generateAgentReport({ visitDateFilter, branch, staffFilter }) {
  const query = { ...visitDateFilter };
  if (branch && branch !== "All") query["personal.branch"] = branch;

  const patients = await Patient.find(query)
    .populate("personal.reference", "name email phone employeeId role")
    .lean();

  const agentStats = {};

  patients.forEach((p) => {
    const a = p.personal?.reference;
    if (!a) return;
    const id = a._id?.toString();
    if (!id) return;
    if (!agentStats[id]) {
      agentStats[id] = {
        "Employee ID": a.employeeId || "",
        "Agent Name": a.name,
        Role: canonicalEmployeeRole(a.role),
        Email: a.email || "",
        Phone: a.phone || "",
        "Total Referrals": 0,
        "Converted to Surgery": 0,
        "Conversion Rate": "0%",
        "Total Revenue Generated": 0,
      };
    }
    agentStats[id]["Total Referrals"]++;
    if (["CLOSED", "SURGERY_BOOKED"].includes(p.ops?.status)) {
      agentStats[id]["Converted to Surgery"]++;
      agentStats[id]["Total Revenue Generated"] += p.payments?.amountReceived || 0;
    }
  });

  Object.values(agentStats).forEach((s) => {
    if (s["Total Referrals"] > 0) {
      s["Conversion Rate"] =
        ((s["Converted to Surgery"] / s["Total Referrals"]) * 100).toFixed(1) + "%";
    }
  });

  let result = Object.values(agentStats).filter((s) => s["Total Referrals"] > 0);
  if (staffFilter) result = result.filter((s) => s["Agent Name"] === staffFilter);
  return result;
}

async function generateDoctorReport({
  visitDateFilter,
  branch,
  staffFilter,
  techniqueFilter,
}) {
  const query = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (branch && branch !== "All") query["personal.branch"] = branch;
  if (techniqueFilter) query["surgery.technique"] = techniqueFilter;

  const patients = await Patient.find(query)
    .populate("surgery.doctor", "name email phone employeeId role")
    .lean();

  const doctorStats = {};

  patients.forEach((p) => {
    const docs = Array.isArray(p.surgery?.doctor)
      ? p.surgery.doctor
      : p.surgery?.doctor
      ? [p.surgery.doctor]
      : [];

    docs.forEach((d) => {
      if (!d) return;
      const id = d._id?.toString();
      if (!id) return;
      if (!doctorStats[id]) {
        doctorStats[id] = {
          "Employee ID": d.employeeId || "",
          "Doctor Name": d.name,
          Role: canonicalEmployeeRole(d.role),
          Email: d.email || "",
          Phone: d.phone || "",
          "Total Surgeries": 0,
          "Total Grafts Implanted": 0,
          "Avg Grafts per Surgery": 0,
          "FUE Count": 0,
          "DHI Count": 0,
          "Turkish DHI Count": 0,
          "Beard Transplant Count": 0,
          "Other Technique Count": 0,
        };
      }
      doctorStats[id]["Total Surgeries"]++;
      doctorStats[id]["Total Grafts Implanted"] += p.surgery?.graftsImplanted || 0;

      const tech = p.surgery?.technique || "";
      if (tech === "Sapphire FUE") doctorStats[id]["FUE Count"]++;
      else if (tech === "DHI") doctorStats[id]["DHI Count"]++;
      else if (tech === "Turkish DHI") doctorStats[id]["Turkish DHI Count"]++;
      else if (tech === "Beard Transplant") doctorStats[id]["Beard Transplant Count"]++;
      else doctorStats[id]["Other Technique Count"]++;
    });
  });

  Object.values(doctorStats).forEach((s) => {
    if (s["Total Surgeries"] > 0) {
      s["Avg Grafts per Surgery"] = Math.round(
        s["Total Grafts Implanted"] / s["Total Surgeries"]
      );
    }
  });

  let result = Object.values(doctorStats).filter((s) => s["Total Surgeries"] > 0);
  if (staffFilter) result = result.filter((s) => s["Doctor Name"] === staffFilter);
  return result;
}

async function generateImplanterReport({ visitDateFilter, branch, staffFilter }) {
  const query = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (branch && branch !== "All") query["personal.branch"] = branch;

  const patients = await Patient.find(query)
    .populate("surgery.implanterRight", "name email phone employeeId role")
    .populate("surgery.implanterLeft", "name email phone employeeId role")
    .lean();

  const stats = {};

  patients.forEach((p) => {
    const grafts = p.surgery?.graftsImplanted || 0;
    [p.surgery?.implanterRight, p.surgery?.implanterLeft].forEach((imp) => {
      if (!imp) return;
      const id = imp._id?.toString();
      if (!id) return;
      if (!stats[id]) {
        stats[id] = {
          "Employee ID": imp.employeeId || "",
          "Implanter Name": imp.name,
          Role: canonicalEmployeeRole(imp.role),
          Email: imp.email || "",
          Phone: imp.phone || "",
          "Total Procedures": 0,
          "Total Grafts Implanted": 0,
          "Avg Grafts per Procedure": 0,
        };
      }
      stats[id]["Total Procedures"]++;
      stats[id]["Total Grafts Implanted"] += Math.round(grafts / 2);
    });
  });

  Object.values(stats).forEach((s) => {
    if (s["Total Procedures"] > 0) {
      s["Avg Grafts per Procedure"] = Math.round(
        s["Total Grafts Implanted"] / s["Total Procedures"]
      );
    }
  });

  let result = Object.values(stats).filter((s) => s["Total Procedures"] > 0);
  if (staffFilter) result = result.filter((s) => s["Implanter Name"] === staffFilter);
  return result;
}

async function generateTechnicianReport({ visitDateFilter, branch, staffFilter }) {
  const query = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (branch && branch !== "All") query["personal.branch"] = branch;

  const patients = await Patient.find(query)
    .populate("surgery.seniorTech", "name email phone employeeId role")
    .populate("surgery.graftingPerson", "name employeeId role")
    .populate("surgery.helper", "name employeeId role")
    .lean();

  const stats = {};

  patients.forEach((p) => {
    const seniorId = p.surgery?.seniorTech?._id?.toString();
    if (seniorId) {
      if (!stats[seniorId]) {
        stats[seniorId] = {
          "Employee ID": p.surgery.seniorTech.employeeId || "",
          "Technician Name": p.surgery.seniorTech.name,
          Role: canonicalEmployeeRole(p.surgery.seniorTech.role),
          "Total Procedures": 0,
          "As Senior Tech": 0,
          "As Grafting Person": 0,
          "As Helper": 0,
        };
      }
      stats[seniorId]["Total Procedures"]++;
      stats[seniorId]["As Senior Tech"]++;
    }

    const graftingId = p.surgery?.graftingPerson?._id?.toString();
    if (graftingId) {
      if (!stats[graftingId]) {
        stats[graftingId] = {
          "Employee ID": p.surgery.graftingPerson.employeeId || "",
          "Technician Name": p.surgery.graftingPerson.name,
          Role: canonicalEmployeeRole(p.surgery.graftingPerson.role),
          "Total Procedures": 0,
          "As Senior Tech": 0,
          "As Grafting Person": 0,
          "As Helper": 0,
        };
      }
      stats[graftingId]["Total Procedures"]++;
      stats[graftingId]["As Grafting Person"]++;
    }

    const helpers = Array.isArray(p.surgery?.helper) ? p.surgery.helper : [];
    helpers.forEach((h) => {
      if (!h) return;
      const id = h._id?.toString();
      if (!id) return;
      if (!stats[id]) {
        stats[id] = {
          "Employee ID": h.employeeId || "",
          "Technician Name": h.name,
          Role: canonicalEmployeeRole(h.role),
          "Total Procedures": 0,
          "As Senior Tech": 0,
          "As Grafting Person": 0,
          "As Helper": 0,
        };
      }
      stats[id]["Total Procedures"]++;
      stats[id]["As Helper"]++;
    });
  });

  let result = Object.values(stats).filter((s) => s["Total Procedures"] > 0);
  if (staffFilter) result = result.filter((s) => s["Technician Name"] === staffFilter);
  return result;
}

async function generateTechniqueReport({ visitDateFilter, branch, techniqueFilter }) {
  const query = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (branch && branch !== "All") query["personal.branch"] = branch;
  if (techniqueFilter) query["surgery.technique"] = techniqueFilter;

  const patients = await Patient.find(query).lean();

  const techniques = {};

  patients.forEach((p) => {
    const tech = p.surgery?.technique;
    if (!tech) return;
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
    techniques[tech]["Total Grafts"] += p.surgery?.graftsImplanted || 0;
    techniques[tech]["Total Revenue"] += p.payments?.amountReceived || 0;
  });

  Object.values(techniques).forEach((s) => {
    if (s["Total Surgeries"] > 0) {
      s["Avg Grafts"] = Math.round(s["Total Grafts"] / s["Total Surgeries"]);
      s["Avg Revenue"] = Math.round(s["Total Revenue"] / s["Total Surgeries"]);
    }
  });

  return Object.values(techniques);
}

async function generateRevenueReport({
  txDateFilter,
  branch,
  procedureFilter,
  paymentTypeFilter,
}) {
  const query = { costType: "Revenue", ...txDateFilter };
  if (branch && branch !== "All") query.branch = branch;
  if (procedureFilter) query.procedure = procedureFilter;
  if (paymentTypeFilter) query.paymentType = paymentTypeFilter;

  const transactions = await Transactions.find(query)
    .populate("patient", "personal.name personal.phone")
    .sort({ date: -1 })
    .lean();

  return transactions.map((t) => ({
    Date: t.date ? new Date(t.date).toLocaleDateString("en-IN") : "",
    "Patient Name": t.patient?.personal?.name || "N/A",
    "Patient Phone": t.patient?.personal?.phone || "N/A",
    Branch: t.branch || "",
    Procedure: t.procedure || "",
    "Payment Type": t.paymentType || "",
    "Payment Method": t.method || "",
    Amount: t.amount || 0,
    Remarks: t.remarks || "",
  }));
}

async function generateExpensesReport({ txDateFilter, branch }) {
  const query = { costType: "Expenses", ...txDateFilter };
  if (branch && branch !== "All") query.branch = branch;

  const transactions = await Transactions.find(query).sort({ date: -1 }).lean();

  return transactions.map((t) => ({
    Date: t.date ? new Date(t.date).toLocaleDateString("en-IN") : "",
    Branch: t.branch || "",
    "Expense Category": t.transactionCategory || "",
    "Payment Method": t.method || "",
    "Expense Giver Type": t.expenseGiver?.type || "",
    "Expense Giver Name": t.expenseGiver?.name || "",
    Amount: t.amount || 0,
    Remarks: t.remarks || "",
  }));
}

async function generateTransactionsReport({
  txDateFilter,
  branch,
  procedureFilter,
  paymentTypeFilter,
}) {
  const query = { ...txDateFilter };
  if (branch && branch !== "All") query.branch = branch;
  if (procedureFilter) query.procedure = procedureFilter;
  if (paymentTypeFilter) query.paymentType = paymentTypeFilter;

  const transactions = await Transactions.find(query)
    .populate("patient", "personal.name personal.phone")
    .sort({ date: -1 })
    .lean();

  return transactions.map((t) => ({
    Date: t.date ? new Date(t.date).toLocaleDateString("en-IN") : "",
    "Cost Type": t.costType || "",
    Category: t.transactionCategory || "",
    Branch: t.branch || "",
    "Patient Name": t.patient?.personal?.name || "N/A",
    "Patient Phone": t.patient?.personal?.phone || "N/A",
    Procedure: t.procedure || "N/A",
    "Payment Type": t.paymentType || "N/A",
    "Payment Method": t.method || "",
    Amount: t.amount || 0,
    Remarks: t.remarks || "",
  }));
}

async function generateProcedureRevenueReport({
  txDateFilter,
  branch,
  procedureFilter,
}) {
  const query = { costType: "Revenue", method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION, ...txDateFilter };
  if (branch && branch !== "All") query.branch = branch;
  if (procedureFilter) query.procedure = procedureFilter;

  const transactions = await Transactions.find(query).lean();

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

  Object.values(procedureData).forEach((d) => {
    if (d["Number of Transactions"] > 0) {
      d["Avg Transaction Value"] = Math.round(
        d["Total Revenue"] / d["Number of Transactions"]
      );
    }
  });

  return Object.values(procedureData).sort((a, b) => b["Total Revenue"] - a["Total Revenue"]);
}

async function generateBranchComparisonReport({ visitDateFilter, txDateFilter }) {
  const branches = ALL_BRANCHES;
  const result = [];

  for (const b of branches) {
    const [totalPatients, surgeries, revenueAgg, expensesAgg] =
      await Promise.all([
        Patient.countDocuments({
          ...visitDateFilter,
          "personal.branch": b,
        }),
        Patient.countDocuments({
          "surgery.surgeryDate": { $exists: true, $ne: null },
          "personal.branch": b,
        }),
        Transactions.aggregate([
          {
            $match: {
              ...txDateFilter,
              branch: b,
              costType: "Revenue",
              method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Transactions.aggregate([
          {
            $match: {
              ...txDateFilter,
              branch: b,
              costType: "Expenses",
              method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const totalExpenses = expensesAgg[0]?.total || 0;

    result.push({
      Branch: b,
      "Total Patients": totalPatients,
      "Total Surgeries": surgeries,
      "Conversion Rate":
        totalPatients > 0
          ? ((surgeries / totalPatients) * 100).toFixed(1) + "%"
          : "0%",
      "Total Revenue": totalRevenue,
      "Total Expenses": totalExpenses,
      "Net Profit": totalRevenue - totalExpenses,
      "Profit Margin":
        totalRevenue > 0
          ? (((totalRevenue - totalExpenses) / totalRevenue) * 100).toFixed(1) +
            "%"
          : "0%",
    });
  }

  return result;
}

async function generateStocksReport() {
  const stocks = await Stock.find({}).lean();

  return stocks.map((s) => ({
    Name: s.name || "",
    Unit: s.unit || "",
    "Total Quantity": s.totalQuantity || 0,
    MRP: s.mrp || 0,
    "Purchase Amount": s.purchaseAmt || 0,
    "Sold Amount": s.soldAmt || 0,
    "Stock Value (MRP)": (s.totalQuantity || 0) * (s.mrp || 0),
    "Stock Value (Purchase)": (s.totalQuantity || 0) * (s.purchaseAmt || 0),
    Weight: s.weight || "",
    "GST No": s.gstNo || "",
    Expiry: s.expiry ? new Date(s.expiry).toLocaleDateString("en-IN") : "",
    "Vendor Count": (s.vendors || []).length,
    "Created At": s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-IN") : "",
  }));
}

async function generateVendorsReport() {
  const vendors = await Vendor.find({}).lean();

  return vendors.map((v) => ({
    Name: v.name || "",
    Contact: v.contact || "",
    Email: v.email || "",
    Address: v.address || "",
    "GST Number": v.gstNumber || "",
    "Deals In": v.DealsIn || "",
    "Total Transactions": (v.Transactions || []).length,
    "Created At": v.createdAt ? new Date(v.createdAt).toLocaleDateString("en-IN") : "",
  }));
}

async function generateLeadsReport({ dateFilter }) {
  const query = { ...dateFilter };

  const leads = await Leads.find(query).sort({ createdAt: -1 }).lean();

  return leads.map((l) => ({
    Name: l.name || "",
    Phone: l.phone || "",
    Email: l.email || "",
    Location: l.location || "",
    Tag: l.tag || "",
    "Visit Plan": l.visitPlan || "",
    "Visit Date": l.visitDate
      ? new Date(l.visitDate).toLocaleDateString("en-IN")
      : "",
    Remarks: l.remarks || "",
    "Created At": l.createdAt
      ? new Date(l.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateInterviewsReport({ dateFilter }) {
  const query = { ...dateFilter };

  const interviews = await Interviewer.find(query).sort({ createdAt: -1 }).lean();

  return interviews.map((i) => ({
    Name: i.name || "",
    Phone: i.phone || "",
    Email: i.email || "",
    Position: i.position || "",
    Status: i.status || "",
    Address: i.address || "",
    "Experience Type": i.experienceType || "",
    "Years of Experience": i.yearsOfExperience || 0,
    "Previous Company": i.previousCompany || "",
    "Previous Salary": i.previousSalary || 0,
    "Expected Salary": i.expectedSalary || 0,
    "Final Salary": i.finalSalary || 0,
    Reference: i.reference || "",
    "HR Comments": i.hrComments || "",
    "Interview Date": i.interviewDate
      ? new Date(i.interviewDate).toLocaleDateString("en-IN")
      : i.date
      ? new Date(i.date).toLocaleDateString("en-IN")
      : "",
    "Created At": i.createdAt
      ? new Date(i.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateHRAllCandidates({ dateFilter, hrStatus }) {
  const query = { ...dateFilter };
  if (hrStatus) query.status = hrStatus;

  const candidates = await Interviewer.find(query)
    .populate("assignedHr", "name")
    .sort({ createdAt: -1 })
    .lean();

  return candidates.map((i) => ({
    Name: i.name || "",
    Phone: i.phone || "",
    Email: i.email || "",
    Position: i.position || "",
    Status: i.status || "",
    Source: i.source || "",
    "Experience Type": i.experienceType || "",
    "Years of Experience": i.yearsOfExperience || 0,
    "Previous Company": i.previousCompany || "",
    "Previous Position": i.previousPosition || "",
    "Previous Company Contact": i.previousCompanyContact || "",
    "Reason for Leaving": i.reasonForLeaving || "",
    "Previous Salary": i.previousSalary || 0,
    "Expected Salary": i.expectedSalary || 0,
    "Final Salary": i.finalSalary || 0,
    Address: i.address || "",
    Reference: i.reference || "",
    "Assigned HR": i.assignedHr?.name || "",
    "Communication Score": i.communication || "",
    "Technical Score": i.technicalKnowledge || "",
    "Personality Score": i.personality || "",
    "Motivation Score": i.motivation || "",
    "Stability Score": i.stability || "",
    "HR Comments": i.hrComments || "",
    "Final Remarks": i.finalRemarks || "",
    "Final Reference": i.finalReference || "",
    "Interview Date": i.interviewDate
      ? new Date(i.interviewDate).toLocaleDateString("en-IN")
      : "",
    "Applied On": i.createdAt
      ? new Date(i.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateHRSelected({ dateFilter }) {
  const query = { ...dateFilter, status: "Selected" };

  const candidates = await Interviewer.find(query)
    .populate("assignedHr", "name")
    .sort({ createdAt: -1 })
    .lean();

  return candidates.map((i) => ({
    Name: i.name || "",
    Phone: i.phone || "",
    Email: i.email || "",
    Position: i.position || "",
    "Experience Type": i.experienceType || "",
    "Years of Experience": i.yearsOfExperience || 0,
    "Previous Company": i.previousCompany || "",
    "Previous Salary": i.previousSalary || 0,
    "Expected Salary": i.expectedSalary || 0,
    "Final Salary": i.finalSalary || 0,
    "Salary Hike %": i.previousSalary
      ? (((i.finalSalary - i.previousSalary) / i.previousSalary) * 100).toFixed(1) + "%"
      : "N/A",
    "Assigned HR": i.assignedHr?.name || "",
    "HR Comments": i.hrComments || "",
    "Final Remarks": i.finalRemarks || "",
    "Interview Date": i.interviewDate
      ? new Date(i.interviewDate).toLocaleDateString("en-IN")
      : "",
    "Applied On": i.createdAt
      ? new Date(i.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateHRRejected({ dateFilter }) {
  const query = { ...dateFilter, status: "Rejected" };

  const candidates = await Interviewer.find(query)
    .populate("assignedHr", "name")
    .sort({ createdAt: -1 })
    .lean();

  return candidates.map((i) => ({
    Name: i.name || "",
    Phone: i.phone || "",
    Email: i.email || "",
    Position: i.position || "",
    "Experience Type": i.experienceType || "",
    "Years of Experience": i.yearsOfExperience || 0,
    "Previous Company": i.previousCompany || "",
    "Expected Salary": i.expectedSalary || 0,
    "Communication Score": i.communication || "",
    "Technical Score": i.technicalKnowledge || "",
    "Personality Score": i.personality || "",
    "Motivation Score": i.motivation || "",
    "Stability Score": i.stability || "",
    "HR Comments": i.hrComments || "",
    "Final Remarks": i.finalRemarks || "",
    "Assigned HR": i.assignedHr?.name || "",
    "Interview Date": i.interviewDate
      ? new Date(i.interviewDate).toLocaleDateString("en-IN")
      : "",
    "Applied On": i.createdAt
      ? new Date(i.createdAt).toLocaleDateString("en-IN")
      : "",
  }));
}

async function generateHRPositionWise({ dateFilter }) {
  const query = { ...dateFilter };
  const candidates = await Interviewer.find(query).lean();

  const positions = {};

  candidates.forEach((i) => {
    const pos = i.position || "Unknown";
    if (!positions[pos]) {
      positions[pos] = {
        Position: pos,
        "Total Applied": 0,
        Selected: 0,
        Rejected: 0,
        "Interview Scheduled": 0,
        "On Hold": 0,
        Applied: 0,
        "Selection Rate": "0%",
        "Avg Expected Salary": 0,
        "Avg Final Salary": 0,
        _totalExpected: 0,
        _totalFinal: 0,
        _finalCount: 0,
      };
    }
    positions[pos]["Total Applied"]++;
    const status = i.status || "Applied";
    if (positions[pos][status] !== undefined) positions[pos][status]++;
    positions[pos]._totalExpected += i.expectedSalary || 0;
    if (i.finalSalary) {
      positions[pos]._totalFinal += i.finalSalary;
      positions[pos]._finalCount++;
    }
  });

  return Object.values(positions).map((p) => {
    const result = { ...p };
    if (result["Total Applied"] > 0) {
      result["Selection Rate"] =
        ((result["Selected"] / result["Total Applied"]) * 100).toFixed(1) + "%";
      result["Avg Expected Salary"] = Math.round(
        result._totalExpected / result["Total Applied"]
      );
    }
    if (result._finalCount > 0) {
      result["Avg Final Salary"] = Math.round(result._totalFinal / result._finalCount);
    }
    delete result._totalExpected;
    delete result._totalFinal;
    delete result._finalCount;
    return result;
  }).sort((a, b) => b["Total Applied"] - a["Total Applied"]);
}

async function generateHREvaluationScores({ dateFilter, hrStatus }) {
  const query = {
    ...dateFilter,
    $or: [
      { communication: { $exists: true, $ne: null } },
      { technicalKnowledge: { $exists: true, $ne: null } },
    ],
  };
  if (hrStatus) query.status = hrStatus;

  const candidates = await Interviewer.find(query)
    .populate("assignedHr", "name")
    .sort({ createdAt: -1 })
    .lean();

  return candidates.map((i) => {
    const scores = [
      i.communication,
      i.technicalKnowledge,
      i.personality,
      i.motivation,
      i.stability,
    ].filter((s) => s != null);
    const avg = scores.length
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : "N/A";

    return {
      Name: i.name || "",
      Phone: i.phone || "",
      Position: i.position || "",
      Status: i.status || "",
      "Communication (1-10)": i.communication ?? "",
      "Technical Knowledge (1-10)": i.technicalKnowledge ?? "",
      "Personality (1-10)": i.personality ?? "",
      "Motivation (1-10)": i.motivation ?? "",
      "Stability (1-10)": i.stability ?? "",
      "Average Score": avg,
      "HR Comments": i.hrComments || "",
      "Assigned HR": i.assignedHr?.name || "",
      "Interview Date": i.interviewDate
        ? new Date(i.interviewDate).toLocaleDateString("en-IN")
        : "",
    };
  });
}

async function generateHRSalaryAnalysis({ dateFilter }) {
  const query = { ...dateFilter };
  const candidates = await Interviewer.find(query).lean();

  return candidates
    .filter((i) => i.expectedSalary || i.previousSalary || i.finalSalary)
    .map((i) => ({
      Name: i.name || "",
      Phone: i.phone || "",
      Position: i.position || "",
      Status: i.status || "",
      "Experience Type": i.experienceType || "",
      "Years of Experience": i.yearsOfExperience || 0,
      "Previous Company": i.previousCompany || "",
      "Previous Salary (₹)": i.previousSalary || 0,
      "Expected Salary (₹)": i.expectedSalary || 0,
      "Final Salary (₹)": i.finalSalary || 0,
      "Salary Negotiation Gap": i.expectedSalary && i.finalSalary
        ? i.expectedSalary - i.finalSalary
        : "N/A",
      "Hike on Previous (%)": i.previousSalary && i.finalSalary
        ? (((i.finalSalary - i.previousSalary) / i.previousSalary) * 100).toFixed(1) + "%"
        : "N/A",
      "Applied On": i.createdAt
        ? new Date(i.createdAt).toLocaleDateString("en-IN")
        : "",
    }));
}
