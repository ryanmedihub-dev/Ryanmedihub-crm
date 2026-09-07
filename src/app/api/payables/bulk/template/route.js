import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { warmup, payableExpenseCategoriesSync, expenseTypesSync } from "@/lib/masterData";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches";
import { TDS_TAX_TYPES } from "@/constants/expenseCategories";
import {
  PAYABLE_KIND_VALUES,
  PAYABLE_PURPOSE_VALUES,
  MONTHLY_PAYABLE_PURPOSES,
} from "@/models/Payable";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
  }

  await connectDB();
  await warmup();

  const categories = payableExpenseCategoriesSync();
  const categoryTree = {};
  for (const c of categories) categoryTree[c] = expenseTypesSync(c);

  return NextResponse.json({
    purposes: PAYABLE_PURPOSE_VALUES,
    kinds: PAYABLE_KIND_VALUES,
    branches: ALL_BRANCHES,
    categories,
    categoryTree,
    tdsCategories: TDS_TAX_TYPES,
    collabBranches: COLLAB_BRANCHES,
    monthlyPurposes: MONTHLY_PAYABLE_PURPOSES,
  });
}
