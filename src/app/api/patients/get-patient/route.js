import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
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
    const counsellorNames = split(searchParams.get("counsellor"));
    const agentNames      = split(searchParams.get("agent"));
    const techniques      = split(searchParams.get("technique"));
    const doctorNames     = split(searchParams.get("doctor"));
    const seniorTechNames = split(searchParams.get("seniorTech"));
    const implanterNames  = split(searchParams.get("implanter"));
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

    const [counsellorDocs, agentDocs, doctorDocs, seniorTechDocs, implanterDocs] = await Promise.all([
      counsellorNames.length ? Employee.find({ name: { $in: counsellorNames } }, "_id").lean() : [],
      agentNames.length      ? Employee.find({ name: { $in: agentNames } },      "_id").lean() : [],
      doctorNames.length     ? Employee.find({ name: { $in: doctorNames } },     "_id").lean() : [],
      seniorTechNames.length ? Employee.find({ name: { $in: seniorTechNames } }, "_id").lean() : [],
      implanterNames.length  ? Employee.find({ name: { $in: implanterNames } },  "_id").lean() : [],
    ]);

    if (counsellorNames.length) {
      if (!counsellorDocs.length) return NextResponse.json({ patients: [], total: 0, page, limit, filterOptions: {} }, { status: 200 });
      const ids = counsellorDocs.map((d) => d._id);
      query["counselling.counsellor"] = ids.length === 1 ? ids[0] : { $in: ids };
    } else if (visited) {
      query["counselling.counsellor"] = { $exists: true, $ne: null };
    }

    if (agentNames.length) {
      if (!agentDocs.length) return NextResponse.json({ patients: [], total: 0, page, limit, filterOptions: {} }, { status: 200 });
      const ids = agentDocs.map((d) => d._id);
      query["personal.reference"] = ids.length === 1 ? ids[0] : { $in: ids };
    }

    if (doctorDocs.length) {
      const ids = doctorDocs.map((d) => d._id);
      query["surgery.doctor"] = ids.length === 1 ? ids[0] : { $in: ids };
    }

    if (seniorTechDocs.length) {
      const ids = seniorTechDocs.map((d) => d._id);
      query["surgery.seniorTech"] = ids.length === 1 ? ids[0] : { $in: ids };
    }

    if (implanterDocs.length) {
      const ids = implanterDocs.map((d) => d._id);
      query["surgery.implanterRight"] = ids.length === 1 ? ids[0] : { $in: ids };
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
