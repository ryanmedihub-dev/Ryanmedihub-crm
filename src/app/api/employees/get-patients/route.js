import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import { withDB } from "@/lib/withDB";
import { NextResponse } from "next/server";

const handler = async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom  = searchParams.get("dateFrom");
    const dateTo    = searchParams.get("dateTo");
    const technique = searchParams.get("technique");

    const patientMatch = {};
    if (dateFrom || dateTo) {
      patientMatch["personal.visitDate"] = {};
      if (dateFrom) patientMatch["personal.visitDate"].$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        patientMatch["personal.visitDate"].$lte = to;
      }
    }
    if (technique) {
      patientMatch.$or = [
        { "surgery.technique": technique },
        { "counselling.techniqueSuggested": technique },
      ];
    }

    const data = await Employee.find({})
      .populate({
        path: "patient",
        match: Object.keys(patientMatch).length ? patientMatch : undefined,
        select:
          "personal.name personal.visitDate surgery.technique surgery.graftsImplanted payments.amountReceived counselling.readyForSurgery counselling.techniqueSuggested ops.status createdAt",
        options: { sort: { createdAt: -1 } },
      })
      .sort({ name: 1 })
      .lean();

    const hrEmployeeIds = data
      .filter((e) => (e.role || "").toLowerCase() === "hr")
      .map((e) => e._id);

    const interviewerCounts = hrEmployeeIds.length
      ? await Interviewer.aggregate([
          { $match: { assignedHr: { $in: hrEmployeeIds } } },
          { $group: { _id: { hr: "$assignedHr", status: "$status" }, count: { $sum: 1 } } },
        ])
      : [];

    const hrStatsById = {};
    for (const id of hrEmployeeIds) hrStatsById[id.toString()] = { total: 0, selected: 0, rejected: 0, scheduled: 0, onHold: 0 };
    for (const row of interviewerCounts) {
      const stats = hrStatsById[row._id.hr.toString()];
      if (!stats) continue;
      stats.total += row.count;
      if (row._id.status === "Selected") stats.selected += row.count;
      else if (row._id.status === "Rejected") stats.rejected += row.count;
      else if (row._id.status === "Interview Scheduled") stats.scheduled += row.count;
      else if (row._id.status === "On Hold") stats.onHold += row.count;
    }

    const employeesByRole = {};

    for (const employee of data) {
      const role = employee.role || "Other";
      if (!employeesByRole[role]) employeesByRole[role] = [];

      const normalizedRole = role.toLowerCase();

      if (normalizedRole === "hr") {
        const stats = hrStatsById[employee._id.toString()] || { total: 0, selected: 0, rejected: 0, scheduled: 0, onHold: 0 };
        const selectionRate = stats.total > 0
          ? parseFloat(((stats.selected / stats.total) * 100).toFixed(1))
          : 0;

        employeesByRole[role].push({
          _id: employee._id,
          employeeId: employee.employeeId || "",
          name: employee.name,
          isactive: employee.isactive,
          totalCandidates: stats.total,
          selected: stats.selected,
          rejected: stats.rejected,
          scheduled: stats.scheduled,
          onHold: stats.onHold,
          selectionRate,
        });
      } else {
        const patients = employee.patient || [];

        const patientCount = patients.length;
        const amountReceived = patients.reduce(
          (total, patient) => total + (parseInt(patient.payments?.amountReceived) || 0),
          0
        );

        if (normalizedRole === "agent" || normalizedRole === "counsellor") {
          const readyForSurgery = patients.filter(
            (p) => p.counselling && p.counselling.readyForSurgery === true
          ).length;
          employeesByRole[role].push({
            _id: employee._id,
            employeeId: employee.employeeId || "",
            isactive: employee.isactive,
            name: employee.name,
            totalPatient: patientCount,
            readyForSurgery,
            amountReceived,
          });
        } else {
          const graftsImplanted = patients.reduce(
            (total, patient) => total + (parseInt(patient.surgery?.graftsImplanted) || 0),
            0
          );
          employeesByRole[role].push({
            _id: employee._id,
            employeeId: employee.employeeId || "",
            isactive: employee.isactive,
            name: employee.name,
            totalPatient: patientCount,
            graftsImplanted,
            amountReceived,
          });
        }
      }
    }

    return NextResponse.json(employeesByRole);
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
};

export const GET = withDB(handler);
