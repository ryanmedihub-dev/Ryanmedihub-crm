import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import {
  PRESET_STATUS, PATIENT_STATUSES, PATIENT_DIRECT_REFERENCE_NAME, CONVERTED_STATUSES,
} from "@/lib/owner/patientStatus";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";
import { periodBounds, istDayBucket } from "@/lib/owner/dates";
import { ATTENTION_THRESHOLDS } from "@/lib/owner/attentionThresholds";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Public sort key -> Mongo path. `invert: true` = the column shows "days
// since X", so ascending on the column is DESCENDING on the date.
const SORT_FIELD_MAP = {
  name: { field: "personal.name" },
  createdAt: { field: "createdAt" },
  visitDate: { field: "personal.visitDate" },
  packageAmount: { field: "counselling.finlpackage" },
  amountReceived: { field: "payments.amountReceived" },
  pendingAmount: { field: "payments.pendingAmount" },
  surgeryDate: { field: "surgery.surgeryDate" },
  discount: { field: "payments.discount" },
  graftsImplanted: { field: "surgery.graftsImplanted" },
  daysSinceActivity: { field: "updatedAt", invert: true },
  daysSinceBooking: { field: "createdAt", invert: true },
};

// Which date the period filter applies to, per preset. Surgery Done is about
// WHEN THE SURGERY HAPPENED; everything else is about when the patient was
// registered.
const PRESET_DATE_FIELD = { surgeryDone: "surgery.surgeryDate" };

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SURGERY_EMPLOYEE_FIELDS = ["doctor", "seniorTech", "implanterRight", "implanterLeft", "graftingPerson", "helper"];

const TOTALS_GROUP = {
  _id: null,
  count: { $sum: 1 },
  packageSum: { $sum: { $ifNull: ["$counselling.finlpackage", 0] } },
  receivedSum: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
  pendingSum: { $sum: { $ifNull: ["$payments.pendingAmount", 0] } },
  discountSum: { $sum: { $ifNull: ["$payments.discount", 0] } },
  converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
};

const daysAgoExpr = (field) => ({ $divide: [{ $subtract: ["$$NOW", `$${field}`] }, 86400000] });

// One query builder behind all six Patients list pages (Owner Panel v2,
// Part 3). Pure ryan-crm data — no callby round trip, so this can afford a
// single $facet aggregation (page of rows + status/revenue totals + trend
// for the WHOLE filtered set, not just the page) in one round trip, per F7.
const getHandler = async (req) => {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const preset = searchParams.get("preset") || "all";
  const { dateFrom, dateTo, branch, search, sortBy, sortDir } = parseEmployeeFilters(searchParams);
  const { page, pageSize, skip, limit } = parsePageParams(searchParams);

  if (preset !== "direct" && !Object.prototype.hasOwnProperty.call(PRESET_STATUS, preset)) {
    return NextResponse.json({ success: false, message: `Unknown preset: ${preset}` }, { status: 400 });
  }

  const meta = {};
  const key = cacheKey("owner", { route: "patients-list", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
  const dateField = PRESET_DATE_FIELD[preset] || "createdAt";
  const match = {};
  if (branch && branch !== "All") match["personal.branch"] = branch;
  const bounds = periodBounds(dateFrom, dateTo);
  if (bounds) match[dateField] = bounds;
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    match.$or = [{ "personal.name": re }, { "personal.phone": re }];
  }

  let directRef = null;
  if (preset === "direct") {
    const ryan = await Employee.findOne({ name: PATIENT_DIRECT_REFERENCE_NAME }).select("_id").lean();
    // No matching Employee -> an impossible id, so the query legitimately returns zero rather
    // than silently falling through to "no filter" (which would show everyone as "Direct").
    directRef = ryan ? ryan._id : new mongoose.Types.ObjectId();
    match["personal.reference"] = directRef;
  } else {
    const status = PRESET_STATUS[preset];
    if (status) {
      match["ops.status"] = status;
    } else {
      // The All page may narrow by one or more statuses (?status=A,B).
      const wanted = (searchParams.get("status") || "").split(",").map((s) => s.trim()).filter((s) => PATIENT_STATUSES.includes(s));
      if (wanted.length) match["ops.status"] = { $in: wanted };
    }
  }

  const sortSpec = SORT_FIELD_MAP[sortBy] || SORT_FIELD_MAP.createdAt;
  let sortDirNum = sortDir === "desc" ? -1 : 1;
  if (sortSpec.invert) sortDirNum = -sortDirNum;

  const facet = {
    rows: [
      { $sort: { [sortSpec.field]: sortDirNum, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
    ],
    totals: [{ $group: TOTALS_GROUP }],
    statusBreakdown: [{ $group: { _id: "$ops.status", count: { $sum: 1 } } }],
    trend: [
      { $match: { [dateField]: { $ne: null } } },
      { $group: { _id: istDayBucket(`$${dateField}`), count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ],
  };

  // Preset-specific "attention" counts over the WHOLE filtered set (the pages
  // used to compute these from the visible page only).
  if (preset === "notConverted") {
    facet.stats = [
      { $group: { _id: null, stale: { $sum: { $cond: [{ $gt: [daysAgoExpr("updatedAt"), ATTENTION_THRESHOLDS.notConvertedStaleDays] }, 1, 0] } } } },
    ];
  } else if (preset === "bookingDone") {
    facet.stats = [
      {
        $group: {
          _id: null,
          stale: {
            $sum: {
              $cond: [
                { $and: [{ $gt: [daysAgoExpr("createdAt"), ATTENTION_THRESHOLDS.bookingDoneStaleDays] }, { $eq: [{ $ifNull: ["$surgery.surgeryDate", null] }, null] }] },
                1, 0,
              ],
            },
          },
          withSurgeryDate: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$surgery.surgeryDate", null] }, null] }, 1, 0] } },
        },
      },
    ];
  } else if (preset === "surgeryDone") {
    facet.surgeryStats = [
      {
        $group: {
          _id: null,
          totalGraftsImplanted: { $sum: { $ifNull: ["$surgery.graftsImplanted", 0] } },
          // Missing (never recorded) is tracked separately from a real 0 — a missing value
          // must never silently drag the average down (Part 3 brief).
          countWithGrafts: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$surgery.graftsImplanted", null] }, null] }, 1, 0] } },
          missingGrafts: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$surgery.graftsImplanted", null] }, null] }, 1, 0] } },
          totalGraftsNeeded: { $sum: { $ifNull: ["$surgery.graftsneed", 0] } },
        },
      },
    ];
    facet.techniqueMix = [
      { $group: { _id: { $ifNull: ["$surgery.technique", "Unspecified"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];
  }

  const queries = [Patient.aggregate([{ $match: match }, { $facet: facet }])];
  if (preset === "direct") {
    // "Everyone else" = same window/branch, any reference that is NOT the Direct sentinel.
    const othersMatch = { ...match, "personal.reference": { $ne: directRef } };
    queries.push(Patient.aggregate([{ $match: othersMatch }, { $group: TOTALS_GROUP }]));
  }
  const [[result], othersAgg] = await Promise.all(queries);

  const rawRows = result.rows || [];
  const totalsRow = result.totals?.[0] || { count: 0, packageSum: 0, receivedSum: 0, pendingSum: 0, discountSum: 0, converted: 0 };
  const statusBreakdown = (result.statusBreakdown || []).reduce((acc, r) => ({ ...acc, [r._id || "UNKNOWN"]: r.count }), {});

  // Batch-resolve every Employee ref on this PAGE of rows only (never per-row) —
  // personal.reference, counselling.counsellor, and (surgery-done) the six
  // surgery role arrays.
  const employeeIds = new Set();
  for (const p of rawRows) {
    if (p.personal?.reference) employeeIds.add(String(p.personal.reference));
    if (p.counselling?.counsellor) employeeIds.add(String(p.counselling.counsellor));
    if (preset === "surgeryDone") {
      for (const field of SURGERY_EMPLOYEE_FIELDS) {
        for (const id of p.surgery?.[field] || []) employeeIds.add(String(id));
      }
    }
  }
  const employees = employeeIds.size
    ? await Employee.find({ _id: { $in: [...employeeIds] } }).select("name").lean()
    : [];
  const employeeById = new Map(employees.map((e) => [String(e._id), { name: e.name }]));

  const rows = rawRows.map((p) => {
    const base = {
      id: String(p._id),
      name: p.personal?.name,
      phone: p.personal?.phone,
      branch: p.personal?.branch,
      status: p.ops?.status,
      createdAt: p.createdAt,
      visitDate: p.personal?.visitDate,
      counsellor: p.counselling?.counsellor ? employeeById.get(String(p.counselling.counsellor)) : null,
      reference: p.personal?.reference ? employeeById.get(String(p.personal.reference)) : null,
      packageAmount: p.counselling?.finlpackage || 0,
      amountReceived: p.payments?.amountReceived || 0,
      pendingAmount: p.payments?.pendingAmount || 0,
      discount: p.payments?.discount || 0,
      lastActivityAt: p.updatedAt,
    };
    if (preset === "bookingDone") {
      base.surgeryDate = p.surgery?.surgeryDate || null;
    }
    if (preset === "surgeryDone") {
      Object.assign(base, {
        surgeryDate: p.surgery?.surgeryDate || null,
        technique: p.surgery?.technique || "",
        graftsneed: p.surgery?.graftsneed ?? null,
        graftsImplanted: p.surgery?.graftsImplanted ?? null,
        OT: p.surgery?.OT ?? null,
        donorCondition: p.surgery?.donorCondition || "",
        doctor: (p.surgery?.doctor || []).map((id) => employeeById.get(String(id))).filter(Boolean),
        seniorTech: (p.surgery?.seniorTech || []).map((id) => employeeById.get(String(id))).filter(Boolean),
        implanterRight: (p.surgery?.implanterRight || []).map((id) => employeeById.get(String(id))).filter(Boolean),
        implanterLeft: (p.surgery?.implanterLeft || []).map((id) => employeeById.get(String(id))).filter(Boolean),
        graftingPerson: (p.surgery?.graftingPerson || []).map((id) => employeeById.get(String(id))).filter(Boolean),
        helper: (p.surgery?.helper || []).map((id) => employeeById.get(String(id))).filter(Boolean),
      });
    }
    return base;
  });

  const pickTotals = (t) => ({
    count: t?.count || 0,
    packageSum: t?.packageSum || 0,
    receivedSum: t?.receivedSum || 0,
    pendingSum: t?.pendingSum || 0,
    discountSum: t?.discountSum || 0,
    converted: t?.converted || 0,
    conversionRate: t?.count ? Math.round((t.converted / t.count) * 1000) / 10 : 0,
  });

  const response = {
    success: true,
    rows,
    total: totalsRow.count,
    page,
    pageSize,
    sortBy,
    sortDir,
    dateField,
    // Echoed back so a page can construct a related query without re-deriving the resolved range.
    appliedFilters: { dateFrom, dateTo, branch: branch || "All" },
    totals: pickTotals(totalsRow),
    stats: result.stats?.[0] ? { stale: result.stats[0].stale || 0, withSurgeryDate: result.stats[0].withSurgeryDate || 0 } : null,
    statusBreakdown,
    trend: (result.trend || []).map((r) => ({ date: r._id, value: r.count })),
  };

  if (preset === "direct") {
    response.others = pickTotals(othersAgg?.[0]);
  }

  if (preset === "surgeryDone") {
    const s = result.surgeryStats?.[0] || { totalGraftsImplanted: 0, countWithGrafts: 0, missingGrafts: 0, totalGraftsNeeded: 0 };
    response.surgeryStats = {
      ...s,
      avgGraftsPerCase: s.countWithGrafts ? Math.round(s.totalGraftsImplanted / s.countWithGrafts) : null,
    };
    response.techniqueMix = (result.techniqueMix || []).map((t) => ({ technique: t._id, count: t.count }));
  }

  return response;
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
};

export const GET = withDB(getHandler);
