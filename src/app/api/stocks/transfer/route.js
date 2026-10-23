import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Stock from "@/models/Stock";
import { NAME_COLLATION } from "@/lib/sortOptions";
import { cacheInvalidate } from "@/lib/cache";

const fail = (message, status = 400) =>
  NextResponse.json({ success: false, message }, { status });

/* Transfers are stock movement only — no vendor, no payment, no transaction.
   They are logged in stock.editors under transferOut / transferIn so the
   stock audit (which reads "totalQuantity" entries) never counts them as
   purchases. */

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return fail("Unauthorized", 401);

    await dbConnect();

    const isAdmin = ["admin", "super-admin"].includes(session.user.role);
    const userBranch = session.user.branch;

    /* One row per transfer: read the source side only, since both sides carry
       an entry. A branch-locked user also needs stock moved INTO their branch,
       which only exists on their (destination) doc. */
    const includeIncoming = !isAdmin && !!userBranch;
    const query = includeIncoming
      ? {
          location: userBranch,
          "editors.updatedFields.name": { $in: ["transferOut", "transferIn"] },
        }
      : { "editors.updatedFields.name": "transferOut" };

    const stocks = await Stock.find(query)
      .select("name location unit editors")
      .lean();

    const transfers = [];
    for (const stock of stocks) {
      for (const editor of stock.editors || []) {
        const outField = editor.updatedFields?.find((f) => f.name === "transferOut");
        const inField = includeIncoming
          ? editor.updatedFields?.find((f) => f.name === "transferIn")
          : null;
        const qtyField = outField || inField;
        if (!qtyField) continue;

        const counterpart = editor.updatedFields?.find(
          (f) => f.name === (outField ? "transferTo" : "transferFrom")
        );
        const remarks = editor.updatedFields?.find((f) => f.name === "remarks");
        const prev = parseFloat(qtyField.previousValue) || 0;
        const next = parseFloat(qtyField.newValue) || 0;

        transfers.push({
          stockId: stock._id.toString(),
          stockName: stock.name,
          unit: stock.unit || "",
          direction: outField ? "OUT" : "IN",
          from: outField ? stock.location || "—" : counterpart?.newValue || "—",
          to: outField ? counterpart?.newValue || "—" : stock.location || "—",
          quantity: Math.abs(next - prev),
          remainingAtSource: outField ? next : null,
          remarks: remarks?.newValue || "",
          date: editor.date || null,
          by: editor.name || "—",
        });
      }
    }

    transfers.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return NextResponse.json(
      { success: true, data: transfers.slice(0, 100) },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching stock transfers:", error);
    return fail("Failed to fetch transfers", 500);
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return fail("Unauthorized", 401);

    await dbConnect();

    const { stockId, toLocation, quantity, remarks } = await req.json();

    const qty = parseFloat(quantity);
    if (!stockId) return fail("Stock item is required");
    if (!toLocation || !String(toLocation).trim()) return fail("Destination location is required");
    if (!qty || qty <= 0) return fail("Transfer quantity must be greater than zero");

    const destination = String(toLocation).trim();

    const source = await Stock.findById(stockId);
    if (!source) return fail("Stock item not found", 404);

    const isAdmin = ["admin", "super-admin"].includes(session.user.role);
    const userBranch = session.user.branch;
    if (!isAdmin && userBranch && source.location !== userBranch) {
      return fail("You can only transfer stock from your own branch", 403);
    }

    if ((source.location || "") === destination) {
      return fail("Source and destination locations are the same");
    }
    if ((source.totalQuantity || 0) < qty) {
      return fail(`Only ${source.totalQuantity || 0} available to transfer`);
    }

    const who = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    };
    const note = remarks ? String(remarks).trim() : "";

    // conditional $inc so two concurrent transfers can't push quantity below zero
    const updatedSource = await Stock.findOneAndUpdate(
      { _id: stockId, totalQuantity: { $gte: qty } },
      {
        $inc: { totalQuantity: -qty },
        $push: {
          editors: {
            ...who,
            updatedFields: [
              {
                name: "transferOut",
                previousValue: (source.totalQuantity || 0).toString(),
                newValue: ((source.totalQuantity || 0) - qty).toString(),
              },
              { name: "transferTo", previousValue: source.location || "", newValue: destination },
              ...(note ? [{ name: "remarks", previousValue: "", newValue: note }] : []),
            ],
          },
        },
      },
      { new: true }
    );
    if (!updatedSource) return fail("Insufficient quantity available, please reload and retry");

    let updatedDestination;
    try {
      // ponytail: destination matched on name only, so batches with different
      // expiry/mrp merge into one doc there; match on expiry too if batch-wise
      // tracking is ever needed
      const existing = await Stock.findOne({ name: source.name, location: destination })
        .collation(NAME_COLLATION);

      const inEntry = {
        ...who,
        updatedFields: [
          {
            name: "transferIn",
            previousValue: (existing?.totalQuantity || 0).toString(),
            newValue: ((existing?.totalQuantity || 0) + qty).toString(),
          },
          { name: "transferFrom", previousValue: destination, newValue: source.location || "" },
          ...(note ? [{ name: "remarks", previousValue: "", newValue: note }] : []),
        ],
      };

      updatedDestination = existing
        ? await Stock.findByIdAndUpdate(
            existing._id,
            { $inc: { totalQuantity: qty }, $push: { editors: inEntry } },
            { new: true }
          )
        : await Stock.create({
            name: source.name,
            location: destination,
            totalQuantity: qty,
            mrp: source.mrp,
            purchaseAmt: source.purchaseAmt,
            soldAmt: source.soldAmt,
            gstNo: source.gstNo,
            weight: source.weight,
            unit: source.unit,
            expiry: source.expiry,
            vendors: source.vendors,
            createdBy: who,
            editors: [inEntry],
          });
    } catch (error) {
      // put the quantity back so a failed destination write can't lose stock
      await Stock.findByIdAndUpdate(stockId, { $inc: { totalQuantity: qty } });
      throw error;
    }

    await cacheInvalidate("finance", "owner");

    return NextResponse.json(
      {
        success: true,
        message: `Transferred ${qty} ${source.unit || "unit(s)"} of ${source.name} to ${destination}`,
        source: { id: updatedSource._id, name: updatedSource.name, location: updatedSource.location, quantity: updatedSource.totalQuantity },
        destination: { id: updatedDestination._id, name: updatedDestination.name, location: updatedDestination.location, quantity: updatedDestination.totalQuantity },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error transferring stock:", error);
    return fail("Failed to transfer stock", 500);
  }
}
