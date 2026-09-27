

import SuspenseEntry from "@/models/SuspenseEntry";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";

export async function createSuspense({ payload, session: authSession }) {
  const { account, direction, amount, date, branch, reference, remarks, receipts } = payload;

  if (!accountsSync().includes(account)) return { error: `account must be one of: ${accountsSync().join(", ")}`, status: 400 };
  if (direction && !["IN", "OUT"].includes(direction)) return { error: "direction must be IN or OUT", status: 400 };
  const parsedAmount = parseFloat(amount);
  if (!(parsedAmount > 0)) return { error: "Amount must be greater than zero", status: 400 };
  if (branch && !ALL_BRANCHES.includes(branch)) return { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}`, status: 400 };

  const entry = new SuspenseEntry({
    account, direction: direction || "IN", amount: parsedAmount, date: date ? new Date(date) : new Date(),
    branch: branch || null, reference: reference || "", remarks: remarks || "", receipts: Array.isArray(receipts) ? receipts : [],
    createdBy: { name: authSession.user.name, email: authSession.user.email, branch: authSession.user.branch, date: new Date() },
  });
  entry.log.push({
    action: "Created", newValue: String(parsedAmount), note: `Unexplained ${direction === "OUT" ? "debit from" : "credit to"} ${account}`,
    performedBy: { name: authSession.user.name, email: authSession.user.email }, performedAt: new Date(),
  });
  await entry.save();

  return { data: entry, status: 201 };
}
