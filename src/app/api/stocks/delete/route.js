import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Stock from "@/models/Stock";
import DeleteLog from "@/models/DeleteLog";
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

    if (!["admin", "super-admin", "stock"].includes(session.user.role)) {
      return NextResponse.json(
        {
          success: false,
          message: "Only admins can delete stock items",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Stock ID is required" },
        { status: 400 }
      );
    }

    const stock = await Stock.findById(id);
    if (!stock) {
      return NextResponse.json(
        { success: false, message: "Stock not found" },
        { status: 404 }
      );
    }

    const isAdmin = ["admin", "super-admin"].includes(session.user.role);
    const userBranch = session.user.branch;
    if (!isAdmin && userBranch && stock.location !== userBranch) {
      return NextResponse.json(
        { success: false, message: "You can only delete stock items for your branch" },
        { status: 403 }
      );
    }

    if (stock.sell && stock.sell.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete stock item. It has ${stock.sell.length} sale transaction(s) recorded. Please consider archiving instead.`,
          salesCount: stock.sell.length,
        },
        { status: 400 }
      );
    }

    await DeleteLog.create({
      entityType: "Stock",
      entityId: stock._id.toString(),
      entityName: stock.name,
      entityDetails: {
        location: stock.location,
        totalQuantity: stock.totalQuantity,
        unit: stock.unit,
        mrp: stock.mrp,
        purchaseAmt: stock.purchaseAmt,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: stock.location,
    });

    await Stock.findByIdAndDelete(id);

    await cacheInvalidate("finance", "owner");
    return NextResponse.json(
      {
        success: true,
        message: "Stock deleted successfully",
        deletedStock: {
          id: stock._id,
          name: stock.name,
          quantity: stock.totalQuantity,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting stock:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete stock",
        error: error.message,
      },
      { status: 500 }
    );
  }
}