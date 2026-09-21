import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions.js";
import { cacheKey, cached } from "@/lib/cache";

const handler = async (req) => {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: "Patient ID is required" 
                },
                { status: 400 }
            );
        }

        const meta = {};
        const key = cacheKey("patients", { route: "admin-patient-data", id });
        const patient = await cached(key, 30, () => Patient.findById(id)
            .populate({
                path: 'personal.reference',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'counselling.counsellor',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'surgery.doctor',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'surgery.seniorTech',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'surgery.implanterRight',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'surgery.implanterLeft',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'surgery.graftingPerson',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'surgery.helper',
                select: 'name',
                model: 'Employee'
            })
            .populate({
                path: 'payments.transactions',
                select: 'date branch paymentType procedure method amount',
                model: 'Transactions'
            })
            .lean(), meta);

        if (!patient) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: "Patient not found" 
                },
                { status: 404 }
            );
        }

        const res = NextResponse.json({
            patient,
            success: true,
        }, { status: 200 });
        res.headers.set("X-Cache", meta.status);
        return res;

    } catch (error) {
        console.error("Error fetching patient data:", error);
        return NextResponse.json(
            { 
                success: false, 
                error: "Failed to fetch patient data",
                details: error.message 
            },
            { status: 500 }
        );
    }
}

export const GET = withDB(handler);