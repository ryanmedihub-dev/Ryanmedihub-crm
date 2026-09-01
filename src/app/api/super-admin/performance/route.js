import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Employee from "@/models/Employee";
import Interviewer from "@/models/Interviewer";
import Leads from "@/models/Leads";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { branch = "All", from, to } = await req.json();
    const fromDate = new Date(from);
    const toDate   = new Date(to);

    const branchQ   = branch === "All" ? {} : { "personal.branch": branch };
    const txBranchQ = branch === "All" ? {} : { branch };

    const patientFunnelPromise = Patient.aggregate([
      { $facet: {
        leads:        [{ $match: { createdAt: { $gte: fromDate, $lte: toDate } } }, { $count: "c" }],
        appointments: [{ $match: { ...branchQ, "personal.visitDate": { $gte: fromDate, $lte: toDate } } }, { $count: "c" }],
        visited:      [{ $match: { ...branchQ, "personal.visitDate": { $gte: fromDate, $lte: toDate }, "counselling.counsellor": { $exists: true, $ne: null } } }, { $count: "c" }],
        converted:    [{ $match: { ...branchQ, "personal.visitDate": { $gte: fromDate, $lte: toDate }, "counselling.readyForSurgery": true } }, { $count: "c" }],
        surgeries:    [{ $match: { ...branchQ, "surgery.surgeryDate": { $gte: fromDate, $lte: toDate } } }, { $count: "c" }],
      }},
    ]);

    const statusDistPromise = Patient.aggregate([
      { $match: { ...branchQ } },
      { $group: { _id: "$ops.status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const dailyPatientPromise = Patient.aggregate([
      { $match: { ...branchQ, "personal.visitDate": { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$personal.visitDate",
            timezone: "Asia/Kolkata",
          },
        },
        count: { $sum: 1 },
        converted: { $sum: { $cond: ["$counselling.readyForSurgery", 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    const branchPatientPromise = Patient.aggregate([
      { $match: { "personal.visitDate": { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id: "$personal.branch",
        total:     { $sum: 1 },
        converted: { $sum: { $cond: ["$counselling.readyForSurgery", 1, 0] } },
        surgeries: { $sum: { $cond: [{ $ifNull: ["$surgery.surgeryDate", false] }, 1, 0] } },
      }},
      { $sort: { total: -1 } },
    ]);

    const revenueDailyPromise = Transactions.aggregate([
      { $match: { ...txBranchQ, date: { $gte: fromDate, $lte: toDate }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
      { $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "Asia/Kolkata" } },
          type: "$costType",
        },
        amount: { $sum: "$amount" },
      }},
      { $sort: { "_id.day": 1 } },
    ]);

    const revByBranchPromise = Transactions.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
      { $group: {
        _id: { branch: "$branch", type: "$costType" },
        amount: { $sum: "$amount" },
      }},
    ]);

    const revByProcedurePromise = Transactions.aggregate([
      { $match: { ...txBranchQ, date: { $gte: fromDate, $lte: toDate }, costType: "Revenue", method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
      { $group: { _id: "$procedure", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]);

    const revByMethodPromise = Transactions.aggregate([
      { $match: { ...txBranchQ, date: { $gte: fromDate, $lte: toDate }, costType: "Revenue" } },
      { $group: { _id: "$method", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]);

    const counsellorPerfPromise = Patient.aggregate([
      { $match: { ...branchQ, "personal.visitDate": { $gte: fromDate, $lte: toDate }, "counselling.counsellor": { $exists: true, $ne: null } } },
      { $group: {
        _id: "$counselling.counsellor",
        total:     { $sum: 1 },
        converted: { $sum: { $cond: ["$counselling.readyForSurgery", 1, 0] } },
        totalPkg:  { $sum: { $ifNull: ["$counselling.finlpackage", 0] } },
      }},
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $lookup: { from: "employees", localField: "_id", foreignField: "_id", as: "emp" } },
      { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
    ]);

    const agentPerfPromise = Patient.aggregate([
      { $match: { ...branchQ, "personal.visitDate": { $gte: fromDate, $lte: toDate }, "personal.reference": { $exists: true, $ne: null } } },
      { $group: {
        _id: "$personal.reference",
        referrals: { $sum: 1 },
        converted: { $sum: { $cond: [{ $in: ["$ops.status", ["SURGERY_BOOKED", "CLOSED"]] }, 1, 0] } },
        revenue:   { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
      }},
      { $sort: { referrals: -1 } },
      { $limit: 10 },
      { $lookup: { from: "employees", localField: "_id", foreignField: "_id", as: "emp" } },
      { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
    ]);

    const doctorPerfPromise = Patient.aggregate([
      { $match: { ...branchQ, "surgery.surgeryDate": { $gte: fromDate, $lte: toDate } } },
      { $unwind: { path: "$surgery.doctor", preserveNullAndEmptyArrays: false } },
      { $group: {
        _id: "$surgery.doctor",
        surgeries:     { $sum: 1 },
        totalGrafts:   { $sum: { $ifNull: ["$surgery.graftsImplanted", 0] } },
        totalRevenue:  { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
      }},
      { $sort: { surgeries: -1 } },
      { $limit: 10 },
      { $lookup: { from: "employees", localField: "_id", foreignField: "_id", as: "emp" } },
      { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
    ]);

    const staffRolePromise = Employee.aggregate([
      { $match: { isactive: true } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const techniqueDistPromise = Patient.aggregate([
      { $match: { ...branchQ, "surgery.surgeryDate": { $gte: fromDate, $lte: toDate }, "surgery.technique": { $exists: true, $ne: null } } },
      { $group: {
        _id: "$surgery.technique",
        count:      { $sum: 1 },
        avgGrafts:  { $avg: "$surgery.graftsImplanted" },
        totalRev:   { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
      }},
      { $sort: { count: -1 } },
    ]);

    const surgeryDailyPromise = Patient.aggregate([
      { $match: { ...branchQ, "surgery.surgeryDate": { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$surgery.surgeryDate", timezone: "Asia/Kolkata" } },
        count:     { $sum: 1 },
        grafts:    { $sum: { $ifNull: ["$surgery.graftsImplanted", 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    const hrFunnelPromise = Interviewer.aggregate([
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id: "$status",
        count:   { $sum: 1 },
        visited: { $sum: { $cond: [{ $eq: ["$source", "qr"] }, 1, 0] } },
        applied: { $sum: { $cond: [{ $eq: ["$source", "direct"] }, 1, 0] } },
      }},
    ]);

    const hrSourcePromise = Interviewer.aggregate([
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id:      "$source",
        count:    { $sum: 1 },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
        scheduled:{ $sum: { $cond: [{ $eq: ["$status", "Interview Scheduled"] }, 1, 0] } },
      }},
    ]);

    const hrPositionPromise = Interviewer.aggregate([
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id:      "$position",
        total:    { $sum: 1 },
        visited:  { $sum: { $cond: [{ $eq: ["$source", "qr"] }, 1, 0] } },
        applied:  { $sum: { $cond: [{ $eq: ["$source", "direct"] }, 1, 0] } },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
      }},
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);

    const hrDailyPromise = Interviewer.aggregate([
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id:      { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
        count:    { $sum: 1 },
        visited:  { $sum: { $cond: [{ $eq: ["$source", "qr"] }, 1, 0] } },
        applied:  { $sum: { $cond: [{ $eq: ["$source", "direct"] }, 1, 0] } },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    const leadsDailyPromise = Leads.aggregate([
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    const outstandingPromise = Patient.aggregate([
      { $match: { ...branchQ, "payments.pendingAmount": { $gt: 0 } } },
      { $group: {
        _id: "$personal.branch",
        totalPending:  { $sum: "$payments.pendingAmount" },
        totalReceived: { $sum: "$payments.amountReceived" },
        count:         { $sum: 1 },
      }},
      { $sort: { totalPending: -1 } },
    ]);

    const [
      patientFunnelRaw,
      statusDistRaw,
      dailyPatients,
      branchPatients,
      revenueDailyRaw,
      revByBranch,
      revByProcedure,
      revByMethod,
      counsellorPerf,
      agentPerf,
      doctorPerf,
      staffRoles,
      techniqueDist,
      surgeryDaily,
      hrFunnel,
      hrSource,
      hrPosition,
      hrDaily,
      leadsDaily,
      outstanding,
    ] = await Promise.all([
      patientFunnelPromise,
      statusDistPromise,
      dailyPatientPromise,
      branchPatientPromise,
      revenueDailyPromise,
      revByBranchPromise,
      revByProcedurePromise,
      revByMethodPromise,
      counsellorPerfPromise,
      agentPerfPromise,
      doctorPerfPromise,
      staffRolePromise,
      techniqueDistPromise,
      surgeryDailyPromise,
      hrFunnelPromise,
      hrSourcePromise,
      hrPositionPromise,
      hrDailyPromise,
      leadsDailyPromise,
      outstandingPromise,
    ]);

    const pf = patientFunnelRaw[0] || {};
    const patientFunnel = [
      { stage: "Appointments", count: pf.appointments?.[0]?.c || 0 },
      { stage: "Visited",      count: pf.visited?.[0]?.c      || 0 },
      { stage: "Converted",    count: pf.converted?.[0]?.c    || 0 },
      { stage: "Surgeries",    count: pf.surgeries?.[0]?.c    || 0 },
    ];

    const dayMap = {};
    const dayCount = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      dayMap[key] = { date: key, revenue: 0, expenses: 0 };
    }
    revenueDailyRaw.forEach(({ _id, amount }) => {
      const key = _id.day;
      if (dayMap[key]) {
        if (_id.type === "Revenue") dayMap[key].revenue += amount;
        else dayMap[key].expenses += amount;
      }
    });
    const revenueDaily = Object.values(dayMap);

    const branchRevMap = {};
    revByBranch.forEach(({ _id, amount }) => {
      const b = _id.branch || "Unknown";
      if (!branchRevMap[b]) branchRevMap[b] = { branch: b, revenue: 0, expenses: 0 };
      if (_id.type === "Revenue") branchRevMap[b].revenue += amount;
      else branchRevMap[b].expenses += amount;
    });
    const revenueByBranch = Object.values(branchRevMap).sort((a, b) => b.revenue - a.revenue);

    const counsellors = counsellorPerf.map((c) => ({
      name: c.emp?.name || `Unknown (${c._id?.toString().slice(-4)})`,
      total:     c.total,
      converted: c.converted,
      rate:      c.total > 0 ? +((c.converted / c.total) * 100).toFixed(1) : 0,
      avgPkg:    c.total > 0 ? Math.round(c.totalPkg / c.total) : 0,
    }));

    const agents = agentPerf.map((a) => ({
      name:      a.emp?.name || `Unknown (${a._id?.toString().slice(-4)})`,
      referrals: a.referrals,
      converted: a.converted,
      rate:      a.referrals > 0 ? +((a.converted / a.referrals) * 100).toFixed(1) : 0,
      revenue:   a.revenue,
    }));

    const doctors = doctorPerf.map((d) => ({
      name:       d.emp?.name || `Unknown (${d._id?.toString().slice(-4)})`,
      surgeries:  d.surgeries,
      avgGrafts:  d.surgeries > 0 ? Math.round(d.totalGrafts / d.surgeries) : 0,
      totalGrafts:d.totalGrafts,
      revenue:    d.totalRevenue,
    }));

    const techniques = techniqueDist.map((t) => ({
      technique: t._id || "Unknown",
      count:     t.count,
      avgGrafts: Math.round(t.avgGrafts || 0),
      revenue:   t.totalRev,
    }));

    const hrStatusOrder = ["Applied", "Interview Scheduled", "Selected", "Rejected", "On Hold"];
    const hrMap = {};
    hrFunnel.forEach(({ _id, count, visited, applied }) => {
      hrMap[_id] = { count, visited: visited || 0, applied: applied || 0 };
    });
    const hrFunnelData = hrStatusOrder.map((s) => ({
      status:  s,
      count:   hrMap[s]?.count   || 0,
      visited: hrMap[s]?.visited || 0,
      applied: hrMap[s]?.applied || 0,
    }));

    const sourceMap = {};
    hrSource.forEach(({ _id, count, selected, rejected, scheduled }) => {
      sourceMap[_id || "unknown"] = { count, selected, rejected, scheduled };
    });

    const totalRevenue  = revenueByBranch.reduce((s, b) => s + b.revenue,  0);
    const totalExpenses = revenueByBranch.reduce((s, b) => s + b.expenses, 0);
    const totalSurgeries = techniqueDist.reduce((s, t) => s + t.count, 0);
    const totalHRCandidates = hrFunnelData.reduce((s, h) => s + h.count, 0);

    return NextResponse.json({
      success: true,
      summary: {
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        totalSurgeries,
        totalHRCandidates,
        hrSelected:  hrMap["Selected"]?.count  || 0,
        hrApplied:   sourceMap["direct"]?.count || 0,
        hrVisited:   sourceMap["qr"]?.count     || 0,
      },
      patients: {
        funnel:            patientFunnel,
        statusDist:        statusDistRaw.map((s) => ({ status: s._id || "Unknown", count: s.count })),
        dailyTrend:        dailyPatients.map((d) => ({ date: d._id, patients: d.count, converted: d.converted })),
        branchWise:        branchPatients.map((b) => ({ branch: b._id || "Unknown", total: b.total, converted: b.converted, surgeries: b.surgeries })),
      },
      revenue: {
        dailyTrend:   revenueDaily,
        byBranch:     revenueByBranch,
        byProcedure:  revByProcedure.map((r) => ({ procedure: r._id || "Other", amount: r.amount, count: r.count })),
        byMethod:     revByMethod.map((r) => ({ method: r._id || "other", amount: r.amount, count: r.count })),
        outstanding:  outstanding.map((o) => ({ branch: o._id || "Unknown", pending: o.totalPending, received: o.totalReceived, count: o.count })),
      },
      staff: {
        counsellors,
        agents,
        doctors,
        roleDistribution: staffRoles.map((s) => ({ role: s._id || "Unknown", count: s.count })),
      },
      surgery: {
        techniques,
        dailyTrend: surgeryDaily.map((d) => ({ date: d._id, count: d.count, grafts: d.grafts })),
        byBranch:   branchPatients.map((b) => ({ branch: b._id || "Unknown", surgeries: b.surgeries })),
      },
      hr: {
        funnel:      hrFunnelData,
        sourceSummary: {
          applied: sourceMap["direct"] || { count: 0, selected: 0, rejected: 0, scheduled: 0 },
          visited: sourceMap["qr"]     || { count: 0, selected: 0, rejected: 0, scheduled: 0 },
        },
        positionWise: hrPosition.map((p) => ({
          position: p._id || "Unknown",
          total:    p.total,
          visited:  p.visited  || 0,
          applied:  p.applied  || 0,
          selected: p.selected || 0,
        })),
        dailyTrend: hrDaily.map((d) => ({
          date:     d._id,
          count:    d.count,
          visited:  d.visited  || 0,
          applied:  d.applied  || 0,
          selected: d.selected || 0,
        })),
      },
      leads: {
        dailyTrend: leadsDaily.map((d) => ({ date: d._id, count: d.count })),
      },
    });
  } catch (error) {
    console.error("Super-admin performance error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
