import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import * as md from "@/lib/masterData/lists";
import { TDS_TAX_TYPES } from "@/constants/expenseCategories";

// Read-only. The single feed every client form uses (via src/lib/useMasterData.js) to get the
// dynamic expense heads / payment methods / receipt modes / accounts / routing without pulling
// mongoose into the browser bundle. Any authenticated user may read it — these lists drive
// transaction entry across every role.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

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

  // Pre-compute the method-option lists the forms ask for, both for a new entry and for edit.
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

  return NextResponse.json(
    {
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
    },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
