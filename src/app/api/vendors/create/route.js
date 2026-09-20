import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Vendor from "@/models/Vendor";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheInvalidate } from "@/lib/cache";

export async function POST(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, contact, email, address, gstNumber, DealsIn } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Vendor name is required" },
        { status: 400 }
      );
    }

    const existingVendor = await Vendor.findOne({
      $or: [
        { name: name },
        ...(contact ? [{ contact: contact }] : [])
      ]
    });

    if (existingVendor) {
      return NextResponse.json(
        { success: false, message: "Vendor with this name or contact already exists" },
        { status: 400 }
      );
    }

    const vendor = await Vendor.create({
      name,
      contact,
      email,
      address,
      gstNumber,
      DealsIn,
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });

    await cacheInvalidate("finance", "owner");
    return NextResponse.json(
      {
        success: true,
        message: "Vendor created successfully",
        data: vendor,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating vendor:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create vendor",
        error: error.message,
      },
      { status: 500 }
    );
  }
}