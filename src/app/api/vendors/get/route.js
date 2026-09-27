import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import vendor from "@/models/Vendor";
import { cacheKey, cached } from "@/lib/cache";


const SAFETY_LIMIT = 2000;

async function findVendors(query) {
  return vendor.find(query).sort({ createdAt: -1 }).limit(SAFETY_LIMIT).lean();
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const search = searchParams.get("search");
    const dealsIn = searchParams.get("dealsIn");
    const active = searchParams.get("active");

    if (id) {
      try {
        const found = await vendor.findById(id).lean();

        if (!found) {
          return NextResponse.json(
            {
              success: false,
              message: "Vendor not found",
            },
            { status: 404 }
          );
        }

        return NextResponse.json(
          {
            success: true,
            data: found,
            vendor: found,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Error fetching vendor by ID:", error);
        return NextResponse.json(
          {
            success: false,
            message: "Invalid vendor ID",
            error: error.message,
          },
          { status: 400 }
        );
      }
    }

    const query = {};

    if (active === "true") {
      query.isActive = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { contact: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { DealsIn: { $regex: search, $options: "i" } },
        { gstNumber: { $regex: search, $options: "i" } },
      ];
    }

    if (dealsIn) {
      query.DealsIn = { $regex: dealsIn, $options: "i" };
    }

    const meta = {};
    const key = cacheKey("finance", { route: "vendors-get", search, dealsIn, active }, session);
    const vendors = await cached(key, 30, () => findVendors(query), meta);

    const res = NextResponse.json(
      {
        success: true,
        data: vendors,
        vendors: vendors,
        count: vendors.length,
      },
      { status: 200 }
    );
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch vendors",
        error: error.message,
      },
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
    const { id, search, dealsIn, active } = body;

    if (id) {
      try {
        const found = await vendor.findById(id).lean();

        if (!found) {
          return NextResponse.json(
            {
              success: false,
              message: "Vendor not found",
            },
            { status: 404 }
          );
        }

        return NextResponse.json(
          {
            success: true,
            data: found,
            vendor: found,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Error fetching vendor by ID:", error);
        return NextResponse.json(
          {
            success: false,
            message: "Invalid vendor ID",
            error: error.message,
          },
          { status: 400 }
        );
      }
    }

    const query = {};

    if (active === true) {
      query.isActive = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { contact: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { DealsIn: { $regex: search, $options: "i" } },
        { gstNumber: { $regex: search, $options: "i" } },
      ];
    }

    if (dealsIn) {
      query.DealsIn = { $regex: dealsIn, $options: "i" };
    }

    const meta = {};
    const key = cacheKey("finance", { route: "vendors-get", search, dealsIn, active }, session);
    const vendors = await cached(key, 30, () => findVendors(query), meta);

    const res = NextResponse.json(
      {
        success: true,
        data: vendors,
        vendors: vendors,
        count: vendors.length,
      },
      { status: 200 }
    );
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch vendors",
        error: error.message,
      },
      { status: 500 }
    );
  }
}