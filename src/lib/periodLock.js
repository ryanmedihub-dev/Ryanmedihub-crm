import AccountPeriod, { isOpeningSeed } from "@/models/AccountPeriod";
import { accountsSync } from "@/lib/masterData";


const fmt = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

async function closedPeriodsCovering(account, date) {
  const rows = await AccountPeriod.find({
    account,
    branch: null,
    isClosed: true,
    periodStart: { $lte: new Date(date) },
    periodEnd: { $gte: new Date(date) },
  }).lean();
  return rows.filter((p) => !isOpeningSeed(p));
}

async function blockReasonFor(account, date) {
  if (!date) return null;

  if (account && accountsSync().includes(account)) {
    const [closed] = await closedPeriodsCovering(account, date);
    if (closed) {
      return `${account} is closed for ${fmt(closed.periodStart)} – ${fmt(closed.periodEnd)}. Reopen that period to change this transaction.`;
    }
    return null;
  }

  const perAccount = await Promise.all(
    accountsSync().map(async (a) => ({ account: a, closed: (await closedPeriodsCovering(a, date))[0] })),
  );
  if (perAccount.every((r) => r.closed)) {
    const p = perAccount[0].closed;
    return `The books are closed for ${fmt(p.periodStart)} – ${fmt(p.periodEnd)} across all ${accountsSync().length} accounts. Reopen the period to change this transaction.`;
  }
  return null;
}

export async function loadClosedPeriodSnapshot() {
  const rows = await AccountPeriod.find({ branch: null, isClosed: true }).lean();
  return rows.filter((p) => !isOpeningSeed(p));
}

function coveringFromSnapshot(snapshot, account, date) {
  const t = new Date(date).getTime();
  return snapshot.find(
    (p) =>
      p.account === account &&
      new Date(p.periodStart).getTime() <= t &&
      new Date(p.periodEnd).getTime() >= t,
  );
}

export function blockReasonFromSnapshot(snapshot, account, date) {
  if (!date) return null;

  if (account && accountsSync().includes(account)) {
    const closed = coveringFromSnapshot(snapshot, account, date);
    return closed
      ? `${account} is closed for ${fmt(closed.periodStart)} – ${fmt(closed.periodEnd)}. Reopen that period to change this transaction.`
      : null;
  }

  const perAccount = accountsSync().map((a) => coveringFromSnapshot(snapshot, a, date));
  if (perAccount.every(Boolean)) {
    const p = perAccount[0];
    return `The books are closed for ${fmt(p.periodStart)} – ${fmt(p.periodEnd)} across all ${accountsSync().length} accounts. Reopen the period to change this transaction.`;
  }
  return null;
}

export async function checkPeriodLock(transaction, next = null) {
  if (!transaction) return null;

  const checks = [
    { account: transaction.furtherMode, date: transaction.date, side: "current" },
  ];

  if (next) {
    const nextDate = next.date !== undefined && next.date !== null ? next.date : transaction.date;
    const nextAccount =
      next.furtherMode !== undefined && next.furtherMode !== null
        ? next.furtherMode
        : transaction.furtherMode;
    const movedDate = new Date(nextDate).getTime() !== new Date(transaction.date).getTime();
    const movedAccount = nextAccount !== transaction.furtherMode;
    if (movedDate || movedAccount) {
      checks.push({ account: nextAccount, date: nextDate, side: "target" });
    }
  }

  for (const c of checks) {
    const reason = await blockReasonFor(c.account, c.date);
    if (reason) {
      return c.side === "target"
        ? `That change would move this transaction into a closed period. ${reason}`
        : reason;
    }
  }
  return null;
}

export async function periodLockResponse(transaction, next = null) {
  const reason = await checkPeriodLock(transaction, next);
  if (!reason) return null;
  return { status: 423, body: { success: false, error: reason, periodLocked: true } };
}
