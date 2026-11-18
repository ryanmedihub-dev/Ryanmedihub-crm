"use client";

import {
  ArrowLeftRight,
  Ban,
  CircleSlash,
  ExternalLink,
  HelpCircle,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { NON_CASH_METHODS, UNSETTLED_METHODS } from "@/constants/bankRouting";
import { STATUS_STYLES } from "@/lib/financeUI";

const BASE =
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap";

function Badge({ tone, icon: Icon, children, title }) {
  return (
    <span className={`${BASE} ${tone}`} title={title}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

export const SettlementBadge = () => (
  <Badge
    tone="bg-sky-50 text-sky-700 border-sky-200"
    icon={ArrowLeftRight}
    title="Cash movement against an amount already recognised elsewhere — counted in account balances, excluded from P&L so it is not double-counted."
  >
    Settlement
  </Badge>
);

export const HeldExternallyBadge = () => (
  <Badge
    tone="bg-amber-100 text-amber-700 border-amber-200"
    icon={ExternalLink}
    title="Someone else physically handled this money. Booked in P&L, excluded from account balances, and tracked by a linked receivable/payable until settled."
  >
    Held externally
  </Badge>
);

export const NoCashMovementBadge = () => (
  <Badge
    tone="bg-slate-100 text-slate-600 border-slate-200"
    icon={CircleSlash}
    title="No cash passed through any of our accounts for this row, so it never moves an account balance."
  >
    No cash movement
  </Badge>
);

export const UnattributedBadge = () => (
  <Badge
    tone="bg-rose-100 text-rose-700 border-rose-200"
    icon={HelpCircle}
    title="Cash moved but no account was recorded, so this row is missing from Cash & Bank. Needs an account before the books reconcile."
  >
    Unattributed
  </Badge>
);

export const ReversedBadge = ({ onClick }) => (
  <Badge
    tone="bg-purple-100 text-purple-700 border-purple-200 cursor-pointer hover:bg-purple-200"
    icon={Undo2}
    title="This transaction has been fully reversed. Both rows stay visible — the pair is the audit trail."
  >
    <button type="button" onClick={onClick} className="contents">
      Reversed
    </button>
  </Badge>
);

export const ReversalBadge = ({ reason }) => (
  <Badge
    tone="bg-red-100 text-red-700 border-red-200"
    icon={RotateCcw}
    title={reason ? `Reversal — ${reason}` : "This row reverses an earlier transaction."}
  >
    Reversal
  </Badge>
);

export const CancelledBadge = () => (
  <Badge tone={STATUS_STYLES.Cancelled} icon={Ban}>
    Cancelled
  </Badge>
);

export const StatusWordBadge = ({ status }) =>
  status ? (
    <span className={`${BASE} ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {status}
    </span>
  ) : null;

export function transactionBadgeFlags(row = {}) {
  const method = row.method;
  const isUnsettled = UNSETTLED_METHODS.includes(method);
  const isNoCash = NON_CASH_METHODS.includes(method) && !isUnsettled;
  return {
    isSettlement: row.isSettlement === true,
    isUnsettled,
    isNoCash,
    isUnattributed: !row.furtherMode && !NON_CASH_METHODS.includes(method),
    isReversal: !!row.reversalOf,
    isReversed: row.isReversed === true,
  };
}

export default function TransactionStatusBadges({ row, onShowDetail }) {
  const f = transactionBadgeFlags(row);
  return (
    <>
      {f.isReversal && <ReversalBadge reason={row.reversalReason} />}
      {f.isReversed && <ReversedBadge onClick={onShowDetail} />}
      {f.isSettlement && <SettlementBadge />}
      {f.isUnsettled && <HeldExternallyBadge />}
      {f.isNoCash && <NoCashMovementBadge />}
      {f.isUnattributed && <UnattributedBadge />}
    </>
  );
}
