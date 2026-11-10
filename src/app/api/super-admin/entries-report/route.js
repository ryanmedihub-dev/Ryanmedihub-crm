import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import { requireSession } from "@/lib/apiGuard";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { cacheKey, cached } from "@/lib/cache";
import { ALL_STATUSES, FOCUS_STATUSES } from "@/lib/entryAudit";
import { buildAuditPipeline, shapeFacet } from "@/lib/entryAuditPipeline";

const ALLOWED_ROLES = ["super-admin"];

const CACHE_TTL = 120;

const DATE_FIELDS = {
  visitDate: "personal.visitDate",
  createdAt: "createdAt",
  surgeryDate: "surgery.surgeryDate",
};

const csv = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

const handler = async (req) => {
  const { error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  const sp = new URL(req.url).searchParams;

  const branches = csv(sp.get("branches"));
  const statuses = csv(sp.get("statuses")).filter((s) => ALL_STATUSES.includes(s));
  const priorities = csv(sp.get("priority")).filter((p) => ["high", "medium", "low"].includes(p));
  const sections = csv(sp.get("sections"));
  const types = csv(sp.get("types")).filter((t) => ["missing", "format", "invalid"].includes(t));
  const search = (sp.get("search") || "").trim();
  const dateField = DATE_FIELDS[sp.get("dateField")] || DATE_FIELDS.visitDate;
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const sort = sp.get("sort") || "priority";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 50));

  // ── What Mongo narrows before the audit runs ──────────────────────────────
  const match = { "ops.status": { $in: statuses.length ? statuses : FOCUS_STATUSES } };
  if (branches.length) match["personal.branch"] = { $in: branches };

  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = getISTStartOfDay(new Date(dateFrom));
    if (dateTo) range.$lte = getISTEndOfDay(new Date(dateTo));
    match[dateField] = range;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    match.$or = [{ "personal.name": rx }, { "personal.phone": rx }];
  }

  const key = cacheKey("patients", {
    route: "entries-report",
    branches: branches.join(","),
    statuses: statuses.join(","),
    priorities: priorities.join(","),
    sections: sections.join(","),
    types: types.join(","),
    dateField,
    dateFrom,
    dateTo,
    search,
    sort,
    page,
    limit,
  });

  const payload = await cached(key, CACHE_TTL, async () => {
    // The audit runs inside Mongo: only this page of rows plus the summary
    // crosses the wire, instead of every matching patient document.
    const [facet] = await Patient.aggregate(
      buildAuditPipeline({
        match,
        priorities,
        sections,
        types,
        sort,
        skip: (page - 1) * limit,
        limit,
      })
    ).allowDiskUse(true);

    const shaped = shapeFacet(facet || {});

    // Counsellor names for this page only.
    const ids = [...new Set(shaped.rows.map((r) => r.counsellorId).filter(Boolean))].map(String);
    if (ids.length) {
      const emps = await Employee.find({ _id: { $in: ids } }).select("name").lean();
      const nameById = new Map(emps.map((e) => [String(e._id), e.name]));
      for (const r of shaped.rows) {
        r.counsellorId = r.counsellorId ? String(r.counsellorId) : null;
        r.counsellor = nameById.get(r.counsellorId) || "";
      }
    }

    return shaped;
  });

  return NextResponse.json({ success: true, page, limit, ...payload });
};

export const GET = withDB(handler);
export const dynamic = "force-dynamic";
