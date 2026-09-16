import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Stock from "@/models/Stock";
import { NAME_COLLATION } from "@/lib/sortOptions";

// Everything below used to run as two Stock.find({}).lean() passes — one for the
// filtered list, one unfiltered across the WHOLE collection just to sum things up in
// JS — on every single request, including every keystroke in the search box. A single
// $facet aggregation does the list + both stat breakdowns in one round trip, with Mongo
// doing the summing instead of Node, and only the matched page of documents crossing
// the wire.
async function buildResponse(query, threshold, restrictedLocation = null) {
  const statsQuery = restrictedLocation ? { location: restrictedLocation } : {};
  const now = new Date();

  const statAccumulators = {
    totalItems: { $sum: 1 },
    totalStockValue: { $sum: { $multiply: [{ $ifNull: ["$totalQuantity", 0] }, { $ifNull: ["$mrp", 0] }] } },
    lowStockCount: { $sum: { $cond: [{ $lte: [{ $ifNull: ["$totalQuantity", 0] }, threshold] }, 1, 0] } },
    expiredCount: {
      $sum: {
        $cond: [{ $and: [{ $ne: ["$expiry", null] }, { $lte: ["$expiry", now] }] }, 1, 0],
      },
    },
  };

  const [result] = await Stock.aggregate([
    {
      $facet: {
        list: [{ $match: query }, { $sort: { name: 1 } }],
        overall: [{ $match: statsQuery }, { $group: { _id: null, ...statAccumulators } }],
        byLocation: [
          { $match: statsQuery },
          {
            $group: {
              _id: { $ifNull: ["$location", "Unassigned"] },
              ...statAccumulators,
              availableQty: { $sum: { $ifNull: ["$totalQuantity", 0] } },
              purchaseValue: { $sum: { $multiply: [{ $ifNull: ["$totalQuantity", 0] }, { $ifNull: ["$purchaseAmt", 0] }] } },
              soldValue: { $sum: { $multiply: [{ $ifNull: ["$totalQuantity", 0] }, { $ifNull: ["$soldAmt", 0] }] } },
            },
          },
        ],
      },
    },
  ]).collation(NAME_COLLATION);

  const stocks = result?.list || [];
  const overall = result?.overall?.[0];
  const statistics = {
    totalItems: overall?.totalItems || 0,
    totalStockValue: overall?.totalStockValue || 0,
    lowStockCount: overall?.lowStockCount || 0,
    expiredCount: overall?.expiredCount || 0,
  };

  const locationStats = (result?.byLocation || []).map((entry) => ({
    location: entry._id,
    totalItems: entry.totalItems,
    availableQty: entry.availableQty,
    stockValue: entry.totalStockValue,
    purchaseValue: entry.purchaseValue,
    soldValue: entry.soldValue,
    lowStockCount: entry.lowStockCount,
    expiredCount: entry.expiredCount,
  }));

  return { stocks, statistics, locationStats };
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const id        = searchParams.get("id");
    const location  = searchParams.get("location");
    const search    = searchParams.get("search");
    const lowStock  = searchParams.get("lowStock");
    const expired   = searchParams.get("expired");
    const threshold = parseInt(searchParams.get("threshold")) || 10;

    const userBranch = session.user.branch;
    const isAdmin = ["admin", "super-admin"].includes(session.user.role);
    const branchRestricted = !isAdmin && userBranch;

    if (id) {
      const stock = await Stock.findById(id).lean();
      if (!stock) {
        return NextResponse.json(
          { success: false, message: "Stock not found" },
          { status: 404 }
        );
      }
      if (branchRestricted && stock.location !== userBranch) {
        return NextResponse.json(
          { success: false, message: "You can only view stock items for your branch" },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, data: stock }, { status: 200 });
    }

    const query = {};
    if (branchRestricted) {
      query.location = userBranch;
    } else if (location && location !== "All") {
      query.location = location;
    }
    if (search) {
      query.$or = [
        { name:     { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }
    if (lowStock === "true") query.totalQuantity = { $lte: threshold };
    if (expired  === "true") query.expiry        = { $lte: new Date() };

    const { stocks, statistics, locationStats } = await buildResponse(query, threshold, branchRestricted ? userBranch : null);

    return NextResponse.json(
      { success: true, data: stocks, statistics, locationStats, userBranch: userBranch || null, branchRestricted: !!branchRestricted },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching stocks:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch stocks", error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    await dbConnect();

    const body = await req.json();
    const { id, location, search, lowStock, expired, threshold = 10 } = body;

    const userBranch = session.user.branch;
    const isAdmin = ["admin", "super-admin"].includes(session.user.role);
    const branchRestricted = !isAdmin && userBranch;

    if (id) {
      const stock = await Stock.findById(id).lean();
      if (!stock) {
        return NextResponse.json(
          { success: false, message: "Stock not found" },
          { status: 404 }
        );
      }
      if (branchRestricted && stock.location !== userBranch) {
        return NextResponse.json(
          { success: false, message: "You can only view stock items for your branch" },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, data: stock }, { status: 200 });
    }

    const query = {};
    if (branchRestricted) {
      query.location = userBranch;
    } else if (location && location !== "All") {
      query.location = location;
    }
    if (search) {
      query.$or = [
        { name:     { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }
    if (lowStock === true) query.totalQuantity = { $lte: threshold };
    if (expired  === true) query.expiry        = { $lte: new Date() };

    const { stocks, statistics, locationStats } = await buildResponse(query, threshold, branchRestricted ? userBranch : null);

    return NextResponse.json(
      { success: true, data: stocks, statistics, locationStats, userBranch: userBranch || null, branchRestricted: !!branchRestricted },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching stocks:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch stocks", error: error.message },
      { status: 500 }
    );
  }
}
