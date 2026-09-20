import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Vendor from "@/models/Vendor";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheInvalidate } from "@/lib/cache";

export async function PUT(req) {
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
    const { id, name, contact, email, address, gstNumber, DealsIn } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Vendor ID is required" },
        { status: 400 }
      );
    }

    const existingVendor = await Vendor.findById(id);
    if (!existingVendor) {
      return NextResponse.json(
        { success: false, message: "Vendor not found" },
        { status: 404 }
      );
    }

    const updatedFields = [];

    if (name && name !== existingVendor.name) {
      updatedFields.push({
        name: "name",
        previousValue: existingVendor.name || "",
        newValue: name,
      });
    }

    if (contact && contact !== existingVendor.contact) {
      updatedFields.push({
        name: "contact",
        previousValue: existingVendor.contact?.toString() || "",
        newValue: contact.toString(),
      });
    }

    if (email && email !== existingVendor.email) {
      updatedFields.push({
        name: "email",
        previousValue: existingVendor.email || "",
        newValue: email,
      });
    }

    if (address && address !== existingVendor.address) {
      updatedFields.push({
        name: "address",
        previousValue: existingVendor.address || "",
        newValue: address,
      });
    }

    if (gstNumber && gstNumber !== existingVendor.gstNumber) {
      updatedFields.push({
        name: "gstNumber",
        previousValue: existingVendor.gstNumber || "",
        newValue: gstNumber,
      });
    }

    if (DealsIn && DealsIn !== existingVendor.DealsIn) {
      updatedFields.push({
        name: "DealsIn",
        previousValue: existingVendor.DealsIn || "",
        newValue: DealsIn,
      });
    }

    const updateData = {
      ...(name && { name }),
      ...(contact && { contact }),
      ...(email && { email }),
      ...(address && { address }),
      ...(gstNumber && { gstNumber }),
      ...(DealsIn && { DealsIn }),
    };

    const editorInfo = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
      updatedFields,
    };

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      {
        ...updateData,
        $push: { editors: editorInfo },
      },
      { new: true, runValidators: true }
    );

    await cacheInvalidate("finance", "owner");
    return NextResponse.json(
      {
        success: true,
        message: "Vendor updated successfully",
        data: vendor,
        updatedFields: updatedFields.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update vendor",
        error: error.message,
      },
      { status: 500 }
    );
  }
}