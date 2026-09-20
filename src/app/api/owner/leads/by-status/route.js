import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toLeadDateParams } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";
import { normalizePhone } from "@/lib/phone";
import { CONVERTED_STATUSES } from "@/lib/owner/patientStatus";
import { cacheKey, cached } from "@/lib/cache";

// Backs the four Interested/Follow-ups/Not-interested/Unattempted pages
// (Owner Panel v2, Part 2) — one route, one shared client component
// (LeadStatusReportPage), a `preset` param picks the filter. All four are
// callby's GET /api/leads under different status/attempts filters; the
// "recovery" figure on Not-interested is the one piece that needs ryan-crm's
// own Patient collection, so it's computed here rather than in callby.
const PRESET_PARAMS = {
  interested:    { status: "interested" },
  followUps:     { status: "follow_up" },
  notInterested: { status: "not_interested,lost" },
  unattempted:   { attemptsMax: "0" },
};

export const GET = withCallbyRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const preset = searchParams.get("preset");
  const presetParams = PRESET_PARAMS[preset];
  if (!presetParams) {
    return NextResponse.json({ success: false, message: `Unknown preset: ${preset}` }, { status: 400 });
  }

  const { dateFrom, dateTo, search } = parseEmployeeFilters(searchParams);
  const { page, pageSize } = parsePageParams(searchParams);

  const meta = {};
  const key = cacheKey("owner", { route: "leads-by-status", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const params = {
      ...toLeadDateParams(dateFrom, dateTo),
      ...presetParams,
      page: String(page),
      limit: String(pageSize),
    };
    const sortBy = searchParams.get("sortBy");
    const sortDir = searchParams.get("sortDir");
    const tlName = searchParams.get("tlName");
    const assignedTo = searchParams.get("assignedTo");
    if (sortBy) params.sortBy = sortBy;
    if (sortDir) params.sortDir = sortDir === "desc" ? "-1" : "1";
    if (tlName) params.tlName = tlName;
    if (assignedTo) params.assignedTo = assignedTo;
    if (search) params.search = search;

    const result = await fetchCallby("/api/leads", { params });
    const d = result?.data || {};
    const rows = d.leads || [];

    let recovery = null;
    if (preset === "notInterested" && rows.length) {
      await dbConnect();
      const normalizedPhones = [...new Set(rows.map((l) => normalizePhone(l.phone)).filter(Boolean))];
      // "Recovered" means money changed hands after being marked lost — any
      // payment (BOOKING_DONE) or a full conversion — not just a NEW/NOT_VISITED/
      // NOT_CONVERTED record.
      const patients = normalizedPhones.length
        ? await Patient.find({
            "personal.phoneNormalized": { $in: normalizedPhones },
            "ops.status": { $in: ["BOOKING_DONE", ...CONVERTED_STATUSES] },
          })
            .select("personal.phone personal.name ops.status")
            .lean()
        : [];
      recovery = {
        recoveredCount: patients.length,
        recovered: patients.map((p) => ({
          name: p.personal?.name || "Unknown",
          phone: p.personal?.phone || "",
          status: p.ops?.status,
        })),
      };
    }

    return {
      success: true,
      rows,
      total: d.total || 0,
      page: d.page || page,
      pages: d.pages || 1,
      recovery,
    };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
});
