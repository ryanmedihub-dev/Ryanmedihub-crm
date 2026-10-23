import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { resolveDateRange, toDateQuery } from "@/lib/dateHelpers";
import { cacheKey, cached } from "@/lib/cache";

const split = (v) => (v || "").split(",").filter(Boolean);

const LIST_PROJECTION = [
  "personal.name",
  "personal.phone",
  "personal.address",
  "personal.branch",
  "personal.visitDate",
  "personal.reference",
  "personal.packageQuoted",
  "personal.techniqueQuoted",
  "counselling.counsellor",
  "counselling.techniqueSuggested",
  "counselling.finlpackage",
  "counselling.readyForSurgery",
  "payments.totalAmount",
  "payments.amountReceived",
  "payments.pendingAmount",
  "surgery.surgeryDate",
  "surgery.technique",
  "surgery.location",
  "ops.status",
].join(" ");

const handler = async (req) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const page    = Math.max(1, parseInt(searchParams.get("page"))  || 1);
    const limit   = Math.min(500, parseInt(searchParams.get("limit")) || 50);
    const skip    = (page - 1) * limit;
    const sortKey = searchParams.get("sortKey") || "personal.visitDate";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;

    const search          = searchParams.get("search") || "";
    const statuses        = split(searchParams.get("status"));
    const branches        = split(searchParams.get("branch"));
    const counsellorIds   = split(searchParams.get("counsellor"));
    const agentIds        = split(searchParams.get("agent"));
    const techniques      = split(searchParams.get("technique"));
    const doctorIds       = split(searchParams.get("doctor"));
    const seniorTechIds   = split(searchParams.get("seniorTech"));
    const implanterIds    = split(searchParams.get("implanter"));
    const surgeryLocations = split(searchParams.get("surgeryLocations"));
    const surgeryDate      = searchParams.get("surgeryDate")      || "";
    const visited          = searchParams.get("visited")          === "true";
    const readyForSurgery  = searchParams.get("readyForSurgery")  === "true";

    const query = {};
    const andClauses = [];

    const userBranch = session.user.branch;
    if (userBranch === "Collab") {
      const requested = branches.filter((b) => COLLAB_BRANCHES.includes(b));
      query["personal.branch"] = { $in: requested.length ? requested : COLLAB_BRANCHES };
    } else if (userBranch && userBranch !== "All") {
      query["personal.branch"] = userBranch;
    } else if (branches.length) {
      query["personal.branch"] = branches.length === 1 ? branches[0] : { $in: branches };
    }

    if (statuses.length)   query["ops.status"] = statuses.length === 1 ? statuses[0] : { $in: statuses };
    if (readyForSurgery)   query["counselling.readyForSurgery"] = true;

    const dateRange = resolveDateRange(searchParams);
    
    
    
    
    
    
    const searchBypassesDefaultWindow = dateRange.isDefault && !!search;
    const visitDateQuery = searchBypassesDefaultWindow ? null : toDateQuery(dateRange);
    if (visitDateQuery) query["personal.visitDate"] = visitDateQuery;

    if (surgeryLocations.length) query["surgery.location"] = { $in: surgeryLocations };

    if (surgeryDate) {
      const sd = new Date(surgeryDate);
      const start = new Date(sd); start.setHours(0, 0, 0, 0);
      const end   = new Date(sd); end.setHours(23, 59, 59, 999);
      query["surgery.surgeryDate"] = { $gte: start, $lte: end };
    }

    if (search) {
      andClauses.push({
        $or: [
          { "personal.name":  { $regex: search, $options: "i" } },
          { "personal.phone": { $regex: search, $options: "i" } },
          { "personal.email": { $regex: search, $options: "i" } },
        ],
      });
    }

    if (techniques.length) {
      const techMatch = techniques.length === 1 ? techniques[0] : { $in: techniques };
      andClauses.push({
        $or: [
          { "counselling.techniqueSuggested": techMatch },
          { "surgery.technique":              techMatch },
          { "personal.techniqueQuoted":       techMatch },
        ],
      });
    }

    if (andClauses.length) query.$and = andClauses;

    if (counsellorIds.length) {
      query["counselling.counsellor"] = counsellorIds.length === 1 ? counsellorIds[0] : { $in: counsellorIds };
    } else if (visited) {
      query["counselling.counsellor"] = { $exists: true, $ne: null };
    }

    if (agentIds.length) {
      query["personal.reference"] = agentIds.length === 1 ? agentIds[0] : { $in: agentIds };
    }

    if (doctorIds.length) {
      query["surgery.doctor"] = doctorIds.length === 1 ? doctorIds[0] : { $in: doctorIds };
    }

    if (seniorTechIds.length) {
      query["surgery.seniorTech"] = seniorTechIds.length === 1 ? seniorTechIds[0] : { $in: seniorTechIds };
    }

    if (implanterIds.length) {
      query["surgery.implanterRight"] = implanterIds.length === 1 ? implanterIds[0] : { $in: implanterIds };
    }

    const meta = {};
    const key = cacheKey("patients", Object.fromEntries(searchParams), session);
    const { patients, total } = await cached(key, 30, async () => {
      const [patients, total] = await Promise.all([
        Patient.find(query)
          .select(LIST_PROJECTION)
          .sort({ [sortKey]: sortDir })
          .skip(skip)
          .limit(limit)
          .populate("personal.reference",     "name")
          .populate("counselling.counsellor", "name")
          .lean(),
        Patient.countDocuments(query),
      ]);
      return { patients, total };
    }, meta);

    const res = NextResponse.json({
      patients, total, page, limit, success: true,
      dateWindow: {
        from: visitDateQuery && dateRange.start ? dateRange.start.toISOString() : null,
        to: visitDateQuery && dateRange.end ? dateRange.end.toISOString() : null,
        isDefault: dateRange.isDefault && !searchBypassesDefaultWindow,
        isAll: dateRange.isAll || searchBypassesDefaultWindow,
      },
    }, { status: 200 });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error fetching patients:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch patients" }, { status: 500 });
  }
};

export const GET = withDB(handler);
