import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Stock from "@/models/Stock";
import Vendor from "@/models/Vendor";
import { cacheInvalidate } from "@/lib/cache";

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
    const { vendorId, items, paymentMethod, purchaseDate, remarks } = body;

    if (!vendorId) {
      return NextResponse.json(
        { success: false, message: "Vendor is required" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one item is required" },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (
        !item.stockId ||
        !item.quantity ||
        item.quantity <= 0 ||
        !item.purchasePrice ||
        item.purchasePrice <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid item data. Check stock, quantity, and purchase price",
          },
          { status: 400 }
        );
      }
    }

    const vendorDoc = await Vendor.findById(vendorId);
    if (!vendorDoc) {
      return NextResponse.json(
        { success: false, message: "Vendor not found" },
        { status: 404 }
      );
    }

    const stockIds = items.map((item) => item.stockId);
    const stocks = await Stock.find({ _id: { $in: stockIds } });

    if (stocks.length !== stockIds.length) {
      return NextResponse.json(
        { success: false, message: "One or more stock items not found" },
        { status: 404 }
      );
    }

    const isAdmin = ["admin", "super-admin"].includes(session.user.role);
    const userBranch = session.user.branch;
    if (!isAdmin && userBranch) {
      const wrongBranch = stocks.find((s) => s.location !== userBranch);
      if (wrongBranch) {
        return NextResponse.json(
          { success: false, message: `Stock item "${wrongBranch.name}" does not belong to your branch (${userBranch})` },
          { status: 403 }
        );
      }
    }

    const updatedStocks = [];

    for (const item of items) {
      const stock = stocks.find((s) => s._id.toString() === item.stockId);

      const quantityToAdd = parseFloat(item.quantity);
      const newTotalQuantity = (stock.totalQuantity || 0) + quantityToAdd;

      const updatedStock = await Stock.findByIdAndUpdate(
        item.stockId,
        {
          $set: {
            totalQuantity: newTotalQuantity,
            purchaseAmt: item.purchasePrice,
            vendor: vendorId,
          },
          $push: {
            editors: {
              name: session.user.name,
              email: session.user.email,
              branch: session.user.branch,
              date: new Date(),
              updatedFields: [
                {
                  name: "totalQuantity",
                  previousValue: (stock.totalQuantity || 0).toString(),
                  newValue: newTotalQuantity.toString(),
                },
                {
                  name: "purchaseAmt",
                  previousValue: (stock.purchaseAmt || 0).toString(),
                  newValue: item.purchasePrice.toString(),
                },
                {
                  name: "vendor",
                  previousValue: stock.vendor?.toString() || "",
                  newValue: vendorId.toString(),
                },
              ],
            },
          },
        },
        { new: true }
      );

      updatedStocks.push(updatedStock);
    }

    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalQuantity = items.reduce(
      (sum, item) => sum + parseFloat(item.quantity),
      0
    );

    await cacheInvalidate("finance", "owner");
    return NextResponse.json(
      {
        success: true,
        message: "Stock purchase completed successfully",
        vendor: {
          id: vendorDoc._id,
          name: vendorDoc.name,
        },
        itemsProcessed: items.length,
        totalAmount: totalAmount,
        totalQuantity: totalQuantity,
        updatedStocks: updatedStocks.map((s) => ({
          id: s._id,
          name: s.name,
          quantity: s.totalQuantity,
          purchaseAmt: s.purchaseAmt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing stock purchase:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to process stock purchase",
        error: error.message,
      },
      { status: 500 }
    );
  }
}