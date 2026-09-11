import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import { PRESET_STATUS, PATIENT_DIRECT_REFERENCE_NAME } from "@/lib/owner/patientStatus";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

const SORT_FIELD_MAP = {
  name: "personal.name",
  createdAt: "createdAt",
  visitDate: "personal.visitDate",
  packageAmount: "counselling.finlpackage",
  amountReceived: "payments.amountReceived",
  pendingAmount: "payments.pendingAmount",
  surgeryDate: "surgery.surgeryDate",
  discount: "payments.discount",
  graftsImplanted: "surgery.graftsImplanted",
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SURGERY_EMPLOYEE_FIELDS = ["doctor", "seniorTech", "implanterRight", "implanterLeft", "graftingPerson", "helper"];

// One query builder behind all six Patients list pages (Owner Panel v2,
// Part 3). Pure ryan-crm data — no callby round trip, so this can afford a
// single $facet aggregation (page of rows + status/revenue totals for the
// WHOLE filtered set, not just the page) in one round trip, per F7.
const getHandler = async (req) => {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const preset = searchParams.get("preset") || "all";
  const { dateFrom, dateTo, branch, search, sortBy, sortDir } = parseEmployeeFilters(searchParams);
  const { page, pageSize, skip, limit } = parsePageParams(searchParams);

  const match = {};
  if (branch && branch !== "All") match["personal.branch"] = branch;
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) match.createdAt.$lte = new Date(dateTo);
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    match.$or = [{ "personal.name": re }, { "personal.phone": re }];
  }

  if (preset === "direct") {
    const ryan = await Employee.findOne({ name: PATIENT_DIRECT_REFERENCE_NAME }).select("_id").lean();
    // No matching Employee -> an impossible id, so the query legitimately returns zero rather
    // than silently falling through to "no filter" (which would show everyone as "Direct").
    match["personal.reference"] = ryan ? ryan._id : new mongoose.Types.ObjectId();
  } else if (Object.prototype.hasOwnProperty.call(PRESET_STATUS, preset)) {
    const status = PRESET_STATUS[preset];
    if (status) match["ops.status"] = status;
  } else {
    return NextResponse.json({ success: false, message: `Unknown preset: ${preset}` }, { status: 400 });
  }

  const sortField = SORT_FIELD_MAP[sortBy] || "createdAt";
  const sortDirNum = sortDir === "desc" ? -1 : 1;

  const facet = {
    rows: [
      { $sort: { [sortField]: sortDirNum, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
    ],
    totals: [
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          packageSum: { $sum: { $ifNull: ["$counselling.finlpackage", 0] } },
          receivedSum: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
          pendingSum: { $sum: { $ifNull: ["$payments.pendingAmount", 0] } },
          discountSum: { $sum: { $ifNull: ["$payments.discount", 0] } },
        },
      },
    ],
    statusBreakdown: [{ $group: { _id: "$ops.status", count: { $sum: 1 } } }],
  };

  if (preset === "surgeryDone") {
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

  const [result] = await Patient.aggregate([{ $match: match }, { $facet: facet }]);

  const rawRows = result.rows || [];
  const totalsRow = result.totals?.[0] || { count: 0, packageSum: 0, receivedSum: 0, pendingSum: 0, discountSum: 0 };
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

  const response = {
    success: true,
    rows,
    total: totalsRow.count,
    page,
    pageSize,
    // Echoed back so a page can construct a related query (e.g. Direct's
    // "vs everyone else" comparison) without re-deriving the resolved range.
    appliedFilters: { dateFrom, dateTo, branch: branch || "All" },
    totals: {
      packageSum: totalsRow.packageSum,
      receivedSum: totalsRow.receivedSum,
      pendingSum: totalsRow.pendingSum,
      discountSum: totalsRow.discountSum,
    },
    statusBreakdown,
  };

  if (preset === "surgeryDone") {
    const s = result.surgeryStats?.[0] || { totalGraftsImplanted: 0, countWithGrafts: 0, missingGrafts: 0, totalGraftsNeeded: 0 };
    response.surgeryStats = {
      ...s,
      avgGraftsPerCase: s.countWithGrafts ? Math.round(s.totalGraftsImplanted / s.countWithGrafts) : null,
    };
    response.techniqueMix = (result.techniqueMix || []).map((t) => ({ technique: t._id, count: t.count }));
  }

  return NextResponse.json(response);
};

export const GET = withDB(getHandler);
