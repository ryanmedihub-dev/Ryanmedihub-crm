import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import * as md from "@/lib/masterData/lists";
import { TDS_TAX_TYPES } from "@/constants/expenseCategories";
import { cacheKey, cached } from "@/lib/cache";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  
  
  const meta = {};
  const key = cacheKey("masterdata", { route: "master-data-lists" });
  const data = await cached(key, 60, async () => {
    const [
      expenseCategories,
      expenseCategoryTree,
      directPaymentCategories,
      payableExpenseCategories,
      payableExpenseDropdownCategories,
      accounts,
      receiptModes,
      methodLabels,
      nonCashMethods,
      unsettledMethods,
      routing,
    ] = await Promise.all([
      md.getExpenseCategories(),
      md.getExpenseCategoryTree(),
      md.getDirectPaymentCategories(),
      md.getPayableExpenseCategories(),
      md.getPayableExpenseDropdownCategories(),
      md.getAccounts(),
      md.getReceiptModes(),
      md.getMethodLabels(),
      md.getNonCashMethods(),
      md.getUnsettledMethods(),
      md.getBankRoutingMap(),
    ]);

    
    const methodOptions = {};
    await Promise.all(
      ["EXPENSE", "TRANSPLANT", "SERVICE", "MEDICINE"].map(async (cat) => {
        const [fresh, edit] = await Promise.all([
          md.getMethodOptions(cat, { forEdit: false }),
          md.getMethodOptions(cat, { forEdit: true }),
        ]);
        methodOptions[cat] = { new: fresh, edit };
      }),
    );

    return {
      expenseCategories,
      expenseCategoryTree,
      directPaymentCategories,
      payableExpenseCategories,
      payableExpenseDropdownCategories,
      accounts,
      furtherModes: accounts,
      receiptModes,
      methodLabels,
      methodOptions,
      nonCashMethods,
      unsettledMethods,
      routing,
      tdsTaxTypes: TDS_TAX_TYPES,
    };
  }, meta);

  const res = NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  res.headers.set("X-Cache", meta.status);
  return res;
}
