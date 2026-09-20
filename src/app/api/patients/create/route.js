import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Leads from "@/models/Leads";
import { withDB } from "@/lib/withDB";
import { normalizePhone } from "@/lib/phone";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheInvalidate } from "@/lib/cache";

const handler = async (req) => {
  const session = await getServerSession(authOptions);


  const userBranch = session?.user?.branch || null;

  const {
    personal,
    medical,
    counselling,
    surgery,
    afterSurgery,
    payments,
    documents,
    ops,
  } = await req.json();

  if (!personal || !personal.phone?.trim() || !personal.name?.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "Please fill all the required fields (name and phone)",
      },
      { status: 400 },
    );
  }

  const phone = personal.phone.trim();


  const phoneNormalized = normalizePhone(phone);

  if (phoneNormalized) {
    const existingPatient = await Patient.findOne({
      "personal.phoneNormalized": phoneNormalized,
    });

    if (existingPatient) {
      return NextResponse.json(
        {
          success: false,
          error: "Patient already exists with this phone number",
        },
        { status: 409 },
      );
    }
  }

  try {
    if (personal.reference) {
      const employeeExists = await Employee.findById(personal.reference);
      if (!employeeExists) {
        return NextResponse.json(
          {
            success: false,
            error: "Reference employee not found",
          },
          { status: 404 },
        );
      }
    }

    const newPatient = new Patient({
      personal: {
        name: personal.name.trim(),
        phone: phone,
        phoneNormalized: phoneNormalized,
        email: personal.email?.trim() || "",
        age: personal.age || null,
        gender: personal.gender || "MALE",
        branch: personal.branch || (userBranch === "Collab" ? "" : userBranch) || "",
        address: personal.address || "",
        profession: personal.profession || "",
        visitDate: personal.visitDate || new Date(),
        reference: personal.reference || null,
        purpose: personal.purpose || "",
        packageQuoted: personal.packageQuoted || 0,
        techniqueQuoted: personal.techniqueQuoted || "",
        remarks: personal.remarks || "",
      },
      medical: medical || {},
      counselling: counselling || {},
      surgery: surgery || {},
      afterSurgery: afterSurgery || {},
      ...(payments ? { payments } : {}),
      documents: documents || {},
      ops: ops || {},
      editors: [],
    });

    const savedPatient = await newPatient.save();


    const employeeUpdatePromises = [];

    const addEmployeeUpdate = (employeeId, fieldName) => {
      if (employeeId) {
        employeeUpdatePromises.push(
          Employee.findByIdAndUpdate(
            employeeId,
            {
              $push: {
                patient: savedPatient._id,
              },
            },
            { new: true },
          ).catch((error) => {
            console.error(
              `Error updating employee ${fieldName} with ID ${employeeId}:`,
              error,
            );
            return null;
          }),
        );
      }
    };

    if (personal.reference) {
      addEmployeeUpdate(personal.reference, "reference");
    }

    if (counselling && counselling.counsellor) {
      addEmployeeUpdate(counselling.counsellor, "counsellor");
    }

    if (surgery) {
      const arrayFields = [
        "doctor",
        "seniorTech",
        "implanterRight",
        "implanterLeft",
        "graftingPerson",
        "helper",
      ];

      arrayFields.forEach((field) => {
        if (surgery[field]) {
          if (Array.isArray(surgery[field])) {
            surgery[field].forEach((employeeId, index) => {
              addEmployeeUpdate(employeeId, `${field}[${index}]`);
            });
          } else {
            addEmployeeUpdate(surgery[field], field);
          }
        }
      });
    }

    if (employeeUpdatePromises.length > 0) {
      await Promise.all(employeeUpdatePromises);
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      {
        savedPatient,
        success: true,
        message: `Patient created successfully and ${employeeUpdatePromises.length} employees updated`,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating patient:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
};

export const POST = withDB(handler);
