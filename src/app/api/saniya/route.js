import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Leads from "@/models/Leads";
import Stock from "@/models/Stock";
import Employee from "@/models/Employee";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";

// Security fix (Owner Panel v2, Part 6): this route had NO auth check at all
// — reachable by anyone with the URL, not even a login required — and it was
// sending patient names/phones/payments, lead names/phones, and employee
// names/phones/roles straight into the OpenAI prompt. Both are fixed here:
// owner-only gate (matches src/proxy.js's edge guard on /saniya), and the
// per-record PII arrays below are removed from what's sent to OpenAI —
// aggregate breakdowns only.
const ALLOWED_ROLES = ["owner", "super-admin"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ answer: "Unauthorized." }, { status: 403 });
    }

    const { question, history = [] } = await req.json();
    if (!question?.trim())
      return NextResponse.json({ answer: "Please ask something." });

    await dbConnect();




    const IST_MS = 5.5 * 60 * 60 * 1000;
    const now = new Date();
    const nowIST = new Date(now.getTime() + IST_MS);
    const Y = nowIST.getUTCFullYear();
    const M = nowIST.getUTCMonth();
    const D = nowIST.getUTCDate();

    const istMid = (y, m, d) => new Date(Date.UTC(y, m, d) - IST_MS);

    const todayStart = istMid(Y, M, D);
    const todayEnd = istMid(Y, M, D + 1);
    const yesterdayStart = istMid(Y, M, D - 1);
    const yesterdayEnd = new Date(todayStart - 1);
    const monthStart = istMid(Y, M, 1);
    const lastMonthStart = istMid(Y, M - 1, 1);
    const lastMonthEnd = new Date(monthStart - 1);
    const weekStart = istMid(Y, M, D - 7);


    const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
    const ist = (d) =>
      d
        ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "—";




    const revenueFacetPromise = Transactions.aggregate([
      { $match: { costType: "Revenue", date: { $gte: lastMonthStart } } },
      {
        $facet: {

          todayTotal: [
            { $match: { date: { $gte: todayStart, $lt: todayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          todayByBranch: [
            { $match: { date: { $gte: todayStart, $lt: todayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$branch",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          todayByCategory: [
            { $match: { date: { $gte: todayStart, $lt: todayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$transactionCategory",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          todayByProcedure: [
            { $match: { date: { $gte: todayStart, $lt: todayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$procedure",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          todayByMethod: [
            { $match: { date: { $gte: todayStart, $lt: todayEnd } } },
            { $group: { _id: "$method", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
          ],


          yesterdayTotal: [
            { $match: { date: { $gte: yesterdayStart, $lte: yesterdayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          yesterdayByBranch: [
            { $match: { date: { $gte: yesterdayStart, $lte: yesterdayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$branch",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          yesterdayByCategory: [
            { $match: { date: { $gte: yesterdayStart, $lte: yesterdayEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$transactionCategory",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],


          monthTotal: [
            { $match: { date: { $gte: monthStart }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          monthByBranch: [
            { $match: { date: { $gte: monthStart }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$branch",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          monthByCategory: [
            { $match: { date: { $gte: monthStart }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$transactionCategory",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          monthByProcedure: [
            { $match: { date: { $gte: monthStart }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            {
              $group: {
                _id: "$procedure",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          monthByMethod: [
            { $match: { date: { $gte: monthStart } } },
            { $group: { _id: "$method", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
          ],


          lastMonthTotal: [
            { $match: { date: { $gte: lastMonthStart, $lte: lastMonthEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ],
          lastMonthByBranch: [
            { $match: { date: { $gte: lastMonthStart, $lte: lastMonthEnd }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
            { $group: { _id: "$branch", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]);


    const revenueAllTimePromise = Transactions.aggregate([
      { $match: { costType: "Revenue", method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    const expensesFacetPromise = Transactions.aggregate([
      { $match: { costType: "Expenses", date: { $gte: monthStart }, method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION } },
      {
        $facet: {
          todayTotal: [
            { $match: { date: { $gte: todayStart, $lt: todayEnd } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ],
          monthTotal: [{ $group: { _id: null, total: { $sum: "$amount" } } }],
          monthByBranch: [
            { $group: { _id: "$branch", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]);





    const agentRevQuery = (dateFilter) =>
      Transactions.aggregate([
        { $match: { costType: "Revenue", method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION, ...dateFilter } },
        {
          $lookup: {
            from: "patients",
            localField: "patient",
            foreignField: "_id",
            as: "pat",
          },
        },
        { $unwind: { path: "$pat", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$pat.personal.reference",
            revenue: { $sum: "$amount" },
            txCount: { $sum: 1 },
            branches: { $addToSet: "$branch" },
          },
        },
        {
          $lookup: {
            from: "employees",
            localField: "_id",
            foreignField: "_id",
            as: "emp",
          },
        },
        { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
        { $match: { "emp.name": { $exists: true } } },
        {
          $project: {
            name: "$emp.name",
            role: "$emp.role",
            revenue: 1,
            txCount: 1,
            branches: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]);



    const agentRefQuery = (visitDateFilter) =>
      Patient.aggregate([
        {
          $match: {
            "personal.reference": { $exists: true, $ne: null },
            ...visitDateFilter,
          },
        },
        {
          $group: {
            _id: "$personal.reference",
            referrals: { $sum: 1 },
            converted: {
              $sum: {
                $cond: [
                  { $in: ["$ops.status", ["SURGERY_BOOKED", "CLOSED"]] },
                  1,
                  0,
                ],
              },
            },
            branches: { $addToSet: "$personal.branch" },
          },
        },
        {
          $lookup: {
            from: "employees",
            localField: "_id",
            foreignField: "_id",
            as: "emp",
          },
        },
        { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: "$emp.name",
            role: "$emp.role",
            referrals: 1,
            converted: 1,
            branches: 1,
          },
        },
        { $sort: { referrals: -1 } },
      ]);



    const patientFacetPromise = Patient.aggregate([
      { $match: { "personal.visitDate": { $gte: lastMonthStart } } },
      {
        $facet: {
          todayTotal: [
            {
              $match: {
                "personal.visitDate": { $gte: todayStart, $lt: todayEnd },
              },
            },
            { $count: "count" },
          ],
          todayByBranch: [
            {
              $match: {
                "personal.visitDate": { $gte: todayStart, $lt: todayEnd },
              },
            },
            { $group: { _id: "$personal.branch", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          todayByStatus: [
            {
              $match: {
                "personal.visitDate": { $gte: todayStart, $lt: todayEnd },
              },
            },
            { $group: { _id: "$ops.status", count: { $sum: 1 } } },
          ],
          todayConverted: [
            {
              $match: {
                "personal.visitDate": { $gte: todayStart, $lt: todayEnd },
                "counselling.readyForSurgery": true,
              },
            },
            { $count: "count" },
          ],
          todaySurgeries: [
            {
              $match: {
                "surgery.surgeryDate": { $gte: todayStart, $lt: todayEnd },
              },
            },
            { $count: "count" },
          ],

          yesterdayTotal: [
            {
              $match: {
                "personal.visitDate": {
                  $gte: yesterdayStart,
                  $lte: yesterdayEnd,
                },
              },
            },
            { $count: "count" },
          ],
          yesterdayByBranch: [
            {
              $match: {
                "personal.visitDate": {
                  $gte: yesterdayStart,
                  $lte: yesterdayEnd,
                },
              },
            },
            { $group: { _id: "$personal.branch", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          yesterdayConverted: [
            {
              $match: {
                "personal.visitDate": {
                  $gte: yesterdayStart,
                  $lte: yesterdayEnd,
                },
                "counselling.readyForSurgery": true,
              },
            },
            { $count: "count" },
          ],
          yesterdaySurgeries: [
            {
              $match: {
                "surgery.surgeryDate": {
                  $gte: yesterdayStart,
                  $lte: yesterdayEnd,
                },
              },
            },
            { $count: "count" },
          ],

          monthTotal: [
            { $match: { "personal.visitDate": { $gte: monthStart } } },
            { $count: "count" },
          ],
          monthByBranch: [
            { $match: { "personal.visitDate": { $gte: monthStart } } },
            { $group: { _id: "$personal.branch", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          monthByStatus: [
            { $match: { "personal.visitDate": { $gte: monthStart } } },
            { $group: { _id: "$ops.status", count: { $sum: 1 } } },
          ],
          monthConverted: [
            {
              $match: {
                "personal.visitDate": { $gte: monthStart },
                "counselling.readyForSurgery": true,
              },
            },
            { $count: "count" },
          ],
          monthSurgeries: [
            { $match: { "surgery.surgeryDate": { $gte: monthStart } } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const totalPatientsPromise = Patient.countDocuments();

    // Per-record recent-patients / recent-transactions queries were removed
    // along with the PII they carried (see the ctx.patients / ctx.recentTransactions
    // comments below) — nothing left that needs them.


    const counsellorQuery = (visitDateFilter) =>
      Patient.aggregate([
        {
          $match: {
            "counselling.counsellor": { $exists: true, $ne: null },
            ...visitDateFilter,
          },
        },
        {
          $group: {
            _id: "$counselling.counsellor",
            consulted: { $sum: 1 },
            converted: {
              $sum: { $cond: ["$counselling.readyForSurgery", 1, 0] },
            },
            totalPkg: { $sum: { $ifNull: ["$counselling.finlpackage", 0] } },
            byBranch: { $addToSet: "$personal.branch" },
          },
        },
        {
          $lookup: {
            from: "employees",
            localField: "_id",
            foreignField: "_id",
            as: "emp",
          },
        },
        { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: "$emp.name",
            consulted: 1,
            converted: 1,
            totalPkg: 1,
            byBranch: 1,
          },
        },
        { $sort: { converted: -1 } },
      ]);


    const doctorMonthPromise = Patient.aggregate([
      {
        $match: {
          "surgery.surgeryDate": { $gte: monthStart },
          "surgery.doctor": { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$surgery.doctor" },
      {
        $group: {
          _id: "$surgery.doctor",
          surgeries: { $sum: 1 },
          grafts: { $sum: { $ifNull: ["$surgery.graftsImplanted", 0] } },
          revenue: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
          branch: { $addToSet: "$personal.branch" },
        },
      },
      {
        $lookup: {
          from: "employees",
          localField: "_id",
          foreignField: "_id",
          as: "emp",
        },
      },
      { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: "$emp.name",
          surgeries: 1,
          grafts: 1,
          revenue: 1,
          branch: 1,
        },
      },
      { $sort: { surgeries: -1 } },
    ]);


    const leadsFacetPromise = Leads.aggregate([
      {
        $facet: {
          total: [{ $count: "count" }],
          todayTotal: [
            { $match: { createdAt: { $gte: todayStart, $lt: todayEnd } } },
            { $count: "count" },
          ],
          yesterdayTotal: [
            {
              $match: {
                createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
              },
            },
            { $count: "count" },
          ],
          weekTotal: [
            { $match: { createdAt: { $gte: weekStart } } },
            { $count: "count" },
          ],
          monthTotal: [
            { $match: { createdAt: { $gte: monthStart } } },
            { $count: "count" },
          ],
          bySource: [
            { $group: { _id: "$tag", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          monthBySource: [
            { $match: { createdAt: { $gte: monthStart } } },
            { $group: { _id: "$tag", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          recent: [
            { $sort: { createdAt: -1 } },
            { $limit: 15 },
            {
              $project: {
                name: 1,
                phone: 1,
                location: 1,
                tag: 1,
                remarks: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]);


    const stockPromise = Stock.find()
      .select("name totalQuantity unit mrp expiry location")
      .lean();


    // Only `role` is needed now — name/phone were dropped from ctx.team, so
    // there's no reason to pull them out of the database at all.
    const employeesPromise = Employee.find({ isactive: true })
      .select("role")
      .lean();


    const [
      revenueFacet,
      revenueAllTime,
      expensesFacet,
      agentRevToday,
      agentRevYesterday,
      agentRevMonth,
      agentRefToday,
      agentRefYesterday,
      agentRefMonth,
      counsellorYesterday,
      counsellorMonth,
      doctorMonth,
      patientFacet,
      totalPatients,
      leadsFacet,
      allStock,
      allEmployees,
    ] = await Promise.all([
      revenueFacetPromise,
      revenueAllTimePromise,
      expensesFacetPromise,
      agentRevQuery({ date: { $gte: todayStart, $lt: todayEnd } }),
      agentRevQuery({ date: { $gte: yesterdayStart, $lte: yesterdayEnd } }),
      agentRevQuery({ date: { $gte: monthStart } }),
      agentRefQuery({
        "personal.visitDate": { $gte: todayStart, $lt: todayEnd },
      }),
      agentRefQuery({
        "personal.visitDate": { $gte: yesterdayStart, $lte: yesterdayEnd },
      }),
      agentRefQuery({ "personal.visitDate": { $gte: monthStart } }),
      counsellorQuery({
        "personal.visitDate": { $gte: yesterdayStart, $lte: yesterdayEnd },
      }),
      counsellorQuery({ "personal.visitDate": { $gte: monthStart } }),
      doctorMonthPromise,
      patientFacetPromise,
      totalPatientsPromise,
      leadsFacetPromise,
      stockPromise,
      employeesPromise,
    ]);


    const mergeAgent = (revArr, refArr) => {
      const revMap = {};
      revArr.forEach((a) => {
        if (a.name) revMap[a.name] = a;
      });
      const refMap = {};
      refArr.forEach((a) => {
        if (a.name) refMap[a.name] = a;
      });
      const names = new Set(
        [...revArr.map((a) => a.name), ...refArr.map((a) => a.name)].filter(
          Boolean,
        ),
      );
      return Array.from(names)
        .map((name) => {
          const rev = revMap[name] || {};
          const ref = refMap[name] || {};
          return {
            name,
            role: rev.role || ref.role || "—",
            revenue: fmt(rev.revenue),
            txCount: rev.txCount || 0,
            referrals: ref.referrals || 0,
            converted: ref.converted || 0,
            convRate:
              ref.referrals > 0
                ? `${Math.round((ref.converted / ref.referrals) * 100)}%`
                : "0%",
          };
        })
        .sort(
          (a, b) =>
            (revMap[b.name]?.revenue || 0) - (revMap[a.name]?.revenue || 0),
        );
    };


    const rv = revenueFacet[0] || {};
    const pt = patientFacet[0] || {};
    const ld = leadsFacet[0] || {};
    const ex = expensesFacet[0] || {};

    const fmtFacet = (arr) =>
      (arr || []).map((x) => ({
        label: x._id || "Unknown",
        total: fmt(x.total),
        count: x.count || 0,
      }));
    const fmtPatBranch = (arr) =>
      (arr || []).map((x) => ({ branch: x._id || "Unknown", count: x.count }));
    const fmtPatStatus = (arr) =>
      (arr || []).map((x) => ({ status: x._id || "Unknown", count: x.count }));


    const ctx = {
      reportedAt: ist(now),



      revenue: {
        allTime: fmt(revenueAllTime[0]?.total),

        today: {
          total: fmt(rv.todayTotal?.[0]?.total),
          txCount: rv.todayTotal?.[0]?.count || 0,
          byBranch: fmtFacet(rv.todayByBranch),
          byCategory: fmtFacet(rv.todayByCategory),
          byProcedure: fmtFacet(rv.todayByProcedure),
          byMethod: fmtFacet(rv.todayByMethod),
          expenses: fmt(ex.todayTotal?.[0]?.total),
        },

        yesterday: {
          total: fmt(rv.yesterdayTotal?.[0]?.total),
          txCount: rv.yesterdayTotal?.[0]?.count || 0,
          byBranch: fmtFacet(rv.yesterdayByBranch),
          byCategory: fmtFacet(rv.yesterdayByCategory),
        },

        thisMonth: {
          total: fmt(rv.monthTotal?.[0]?.total),
          txCount: rv.monthTotal?.[0]?.count || 0,
          byBranch: fmtFacet(rv.monthByBranch),
          byCategory: fmtFacet(rv.monthByCategory),
          byProcedure: fmtFacet(rv.monthByProcedure),
          byMethod: fmtFacet(rv.monthByMethod),
          expenses: fmt(ex.monthTotal?.[0]?.total),
          expByBranch: fmtFacet(ex.monthByBranch),
        },

        lastMonth: {
          total: fmt(rv.lastMonthTotal?.[0]?.total),
          byBranch: fmtFacet(rv.lastMonthByBranch),
        },
      },



      patients: {
        total: totalPatients,

        today: {
          total: pt.todayTotal?.[0]?.count || 0,
          byBranch: fmtPatBranch(pt.todayByBranch),
          byStatus: fmtPatStatus(pt.todayByStatus),
          converted: pt.todayConverted?.[0]?.count || 0,
          surgeries: pt.todaySurgeries?.[0]?.count || 0,
        },

        yesterday: {
          total: pt.yesterdayTotal?.[0]?.count || 0,
          byBranch: fmtPatBranch(pt.yesterdayByBranch),
          converted: pt.yesterdayConverted?.[0]?.count || 0,
          surgeries: pt.yesterdaySurgeries?.[0]?.count || 0,
        },

        thisMonth: {
          total: pt.monthTotal?.[0]?.count || 0,
          byBranch: fmtPatBranch(pt.monthByBranch),
          byStatus: fmtPatStatus(pt.monthByStatus),
          converted: pt.monthConverted?.[0]?.count || 0,
          surgeries: pt.monthSurgeries?.[0]?.count || 0,
        },

        // recent10 (patient name/phone/package/payments) removed — never
        // sent to the model. Aggregate breakdowns above are enough to answer
        // "how many / how much" questions without exposing an individual
        // patient's identity or financial detail to OpenAI.
      },




      agentPerformance: {
        note: "Revenue = actual transactions in that period. Referrals = patients who visited in that period.",
        today: mergeAgent(agentRevToday, agentRefToday),
        yesterday: mergeAgent(agentRevYesterday, agentRefYesterday),
        thisMonth: mergeAgent(agentRevMonth, agentRefMonth),
      },



      counsellorPerformance: {
        yesterday: counsellorYesterday.map((c) => ({
          name: c.name,
          consulted: c.consulted,
          converted: c.converted,
          convRate:
            c.consulted > 0
              ? `${Math.round((c.converted / c.consulted) * 100)}%`
              : "0%",
          totalPkg: fmt(c.totalPkg),
          branches: c.byBranch,
        })),
        thisMonth: counsellorMonth.map((c) => ({
          name: c.name,
          consulted: c.consulted,
          converted: c.converted,
          convRate:
            c.consulted > 0
              ? `${Math.round((c.converted / c.consulted) * 100)}%`
              : "0%",
          totalPkg: fmt(c.totalPkg),
          branches: c.byBranch,
        })),
      },


      doctorPerformance: {
        thisMonth: doctorMonth.map((d) => ({
          name: d.name,
          surgeries: d.surgeries,
          grafts: d.grafts,
          revenue: fmt(d.revenue),
          branches: d.branch,
        })),
      },


      leads: {
        total: ld.total?.[0]?.count || 0,
        today: ld.todayTotal?.[0]?.count || 0,
        yesterday: ld.yesterdayTotal?.[0]?.count || 0,
        thisWeek: ld.weekTotal?.[0]?.count || 0,
        thisMonth: ld.monthTotal?.[0]?.count || 0,
        allBySource: (ld.bySource || []).map((x) => ({
          source: x._id || "Untagged",
          count: x.count,
        })),
        monthBySource: (ld.monthBySource || []).map((x) => ({
          source: x._id || "Untagged",
          count: x.count,
        })),
        // recent15 (lead name/phone/remarks) removed — never sent to the
        // model, same reasoning as patients.recent10 above.
      },


      stock: {
        totalItems: allStock.length,
        lowStock: allStock
          .filter((s) => s.totalQuantity <= 5)
          .map((s) => ({ name: s.name, qty: s.totalQuantity, unit: s.unit })),
        allItems: allStock.map((s) => ({
          name: s.name,
          qty: s.totalQuantity,
          unit: s.unit,
          mrp: fmt(s.mrp),
          location: s.location,
        })),
      },


      team: {
        total: allEmployees.length,
        byRole: allEmployees.reduce((acc, e) => {
          acc[e.role] = (acc[e.role] || 0) + 1;
          return acc;
        }, {}),
        // Per-employee name/phone list removed — never sent to the model;
        // byRole counts above answer headcount questions without it.
      },

      // recentTransactions (patient name/phone per transaction) removed —
      // never sent to the model; the revenue breakdowns above cover
      // "how much / by branch / by category" without exposing who paid.
    };


    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 1200,
          messages: [
            {
              role: "system",
              content: `You are Saniya — the AI assistant for Ryan Clinic (Ryan MediHub), a premium hair transplant clinic in Delhi, Mumbai, Hyderabad, and Noida.

You have real-time CRM aggregates in the context — answer directly from them when they cover the question. If the context genuinely doesn't have what's being asked (e.g. a specific patient's name/phone, an individual employee's personal details, or a figure outside the periods provided), say so plainly instead of guessing or estimating — a wrong number is worse than saying you don't have it. Never invent names, phone numbers, or amounts that aren't in the context.

Data structure guide:
- revenue.today / revenue.yesterday / revenue.thisMonth / revenue.lastMonth — each has total, byBranch, byCategory
- patients.today / patients.yesterday / patients.thisMonth — each has total, byBranch, byStatus
- agentPerformance.today / yesterday / thisMonth — revenue = actual transactions in that period, referrals = patients visited
- counsellorPerformance.yesterday / thisMonth
- leads.today / yesterday / thisWeek / thisMonth

Key rules:
- "kal" = yesterday, "aaj" = today, "is month" = thisMonth, "pichhle month" = lastMonth
- For branch queries: look inside the relevant time period's byBranch array
- For agent queries: match name case-insensitively (e.g. "aisha" matches "Aisha Khan")
- Revenue date = transaction payment date | Patient count date = visit date — these can differ
- Format currency as ₹ Indian style
- Reply in same language as the admin (Hindi/English/Hinglish)
- Be direct and sharp — no filler text`,
            },
            ...history.slice(-6),
            {
              role: "user",
              content: `Live CRM Data:\n${JSON.stringify(ctx, null, 2)}\n\nQuestion: ${question}`,
            },
          ],
        }),
      },
    );

    const openaiData = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error("OpenAI error:", openaiData);
      return NextResponse.json(
        { answer: "OpenAI API error. Check OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const answer =
      openaiData.choices?.[0]?.message?.content ||
      "Sorry, couldn't process that.";
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("Saniya error:", err);
    return NextResponse.json(
      { answer: "Internal server error. Please try again." },
      { status: 500 },
    );
  }
}
