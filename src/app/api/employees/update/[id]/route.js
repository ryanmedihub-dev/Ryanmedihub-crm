import { NextResponse } from "next/server";
import Employee from "@/models/Employee";
import dbConnect from "@/lib/db";
import { normalizeEmployeeRoleForSave } from "@/constants/employeeRoles";

export async function PUT(request, { params }) {
  try {
    await dbConnect();

    const { id } = await params;
    const data = await request.json();

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Employee ID is required" },
        { status: 400 }
      );
    }

    if (!data.name || !data.name.trim()) {
      return NextResponse.json(
        { success: false, message: "Employee name is required" },
        { status: 400 }
      );
    }

    if (!data.role || !String(data.role).trim()) {
      return NextResponse.json(
        { success: false, message: "Employee role is required" },
        { status: 400 }
      );
    }
    // Designation is free-form — any post can be entered, not just a fixed list.

    if (data.email && data.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        return NextResponse.json(
          { success: false, message: "Invalid email format" },
          { status: 400 }
        );
      }
    }

    if (data.phone && data.phone.trim()) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(data.phone)) {
        return NextResponse.json(
          { success: false, message: "Phone number must be exactly 10 digits" },
          { status: 400 }
        );
      }
    }

    const updateData = {
      name: data.name.trim(),
      phone: data.phone?.trim() || undefined,
      email: data.email?.trim() || undefined,
      employeeId: (data.employeeId ?? "").trim(),
      role: normalizeEmployeeRoleForSave(data.role),
      isactive: data.isactive !== undefined ? data.isactive : true,
      salaryStructure: data.salaryStructure || undefined,
      incentiveRate: data.incentiveRate !== undefined ? data.incentiveRate : undefined,
    };

    // Optional identity fields (Owner Panel v2). Only touched when the caller
    // sends them, so existing edit forms are unaffected. callbyUserId is owned
    // by /api/owner/callby-links, not this route.
    if (data.dateOfJoining !== undefined) {
      updateData.dateOfJoining = data.dateOfJoining || null;
    }
    if (data.tlName !== undefined) {
      updateData.tlName = String(data.tlName ?? "").trim();
    }
    if (data.managerName !== undefined) {
      updateData.managerName = String(data.managerName ?? "").trim();
    }

    const employee = await Employee.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: employee,
        message: "Employee updated successfully"
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating employee:", error);

    if (error.name === "CastError") {
      return NextResponse.json(
        { success: false, message: "Invalid employee ID format" },
        { status: 400 }
      );
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return NextResponse.json(
        { success: false, message: `An employee with this ${field} already exists` },
        { status: 409 }
      );
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { success: false, message: messages.join(", ") },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to update employee. Please try again." },
      { status: 500 }
    );
  }
}