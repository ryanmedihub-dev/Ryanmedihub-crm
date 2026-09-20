import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Vendor from "@/models/Vendor";
import Stock from "@/models/Stock";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheInvalidate } from "@/lib/cache";

export async function DELETE(req) {
  try {
    await dbConnect();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Only admins can delete vendors" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Vendor ID is required" },
        { status: 400 }
      );
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return NextResponse.json(
        { success: false, message: "Vendor not found" },
        { status: 404 }
      );
    }

    const stocksWithVendor = await Stock.find({
      "purchase.vendor": id
    });

    if (stocksWithVendor.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete vendor. They have ${stocksWithVendor.length} associated stock purchase(s). Please remove these associations first.`,
          stockCount: stocksWithVendor.length,
        },
        { status: 400 }
      );
    }

    await Vendor.findByIdAndDelete(id);

    await cacheInvalidate("finance", "owner");
    return NextResponse.json(
      {
        success: true,
        message: "Vendor deleted successfully",
        deletedVendor: {
          id: vendor._id,
          name: vendor.name,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete vendor",
        error: error.message,
      },
      { status: 500 }
    );
  }
}