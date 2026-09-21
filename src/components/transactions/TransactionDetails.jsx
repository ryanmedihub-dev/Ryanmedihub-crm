import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { payableGroupForPurpose } from "@/constants/payableGroups";
import { formatDateForDisplay } from "./transactionsHelpers";

export default function TransactionDetails({
  row,
  linkedInfo,
  linkedLoading,
}) {
  const router = useRouter();

  const hasTax =
    row.taxDetails &&
    (row.taxDetails.gstAmount ||
      row.taxDetails.tdsAmount);

  const hasCollab =
    row.collabSplit?.ourShare ||
    row.collabSplit?.clinicShare;

  const hasExternalParty =
    !!row.externalParty?.name;

  const hasReceipts =
    row.receipts?.length > 0;

  const hasLink =
    linkedLoading || !!linkedInfo;

  const hasAudit =
    !!row.createdBy?.name ||
    row.editors?.length > 0;

  if (
    !hasTax &&
    !hasCollab &&
    !hasExternalParty &&
    !hasReceipts &&
    !hasLink &&
    !hasAudit
  ) {
    return (
      <div className="px-5 py-4 bg-slate-50 text-xs text-slate-400">
        No additional details available.
      </div>
    );
  }

  return (
    <div className="px-5 py-5 bg-slate-50 border-t border-slate-100">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {hasTax && (
          <DetailBox title="Tax">
            <DetailLine
              label="Base"
              value={formatCurrency(
                row.taxDetails.baseAmount || 0
              )}
            />

            <DetailLine
              label={`GST (${row.taxDetails.gstRate || 0}%)`}
              value={formatCurrency(
                row.taxDetails.gstAmount || 0
              )}
            />

            {row.taxDetails.tdsApplied && (
              <DetailLine
                label={`TDS (${row.taxDetails.tdsRate || 0}%)`}
                value={`-${formatCurrency(
                  row.taxDetails.tdsAmount || 0
                )}`}
                danger
              />
            )}
          </DetailBox>
        )}

        {hasCollab && (
          <DetailBox title="Collaboration split">
            <DetailLine
              label="Our share"
              value={formatCurrency(
                row.collabSplit.ourShare || 0
              )}
            />

            <DetailLine
              label="Clinic share"
              value={formatCurrency(
                row.collabSplit.clinicShare || 0
              )}
            />

            <DetailLine
              label="Received by us"
              value={formatCurrency(
                row.collabSplit.ourReceived || 0
              )}
            />
          </DetailBox>
        )}

        {hasExternalParty && (
          <DetailBox title="External party">
            <DetailLine
              label="Name"
              value={row.externalParty.name}
            />

            <DetailLine
              label="Type"
              value={
                row.externalParty.partyKind || "—"
              }
            />

            <DetailLine
              label="Method"
              value={
                row.externalParty.method || "—"
              }
            />
          </DetailBox>
        )}

        {hasReceipts && (
          <DetailBox title="Receipts">
            <div className="flex flex-wrap gap-2">
              {row.receipts.map((receipt) => (
                <a
                  key={
                    receipt.publicId ||
                    receipt.url
                  }
                  href={receipt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 hover:border-indigo-300 transition"
                >
                  <Receipt className="w-3.5 h-3.5 text-indigo-500" />

                  <span className="max-w-32 truncate">
                    {receipt.fileName || "Receipt"}
                  </span>
                </a>
              ))}
            </div>
          </DetailBox>
        )}

        {hasLink && (
          <DetailBox title="Linked document">
            {linkedLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : linkedInfo?.data ? (
              <>
                <DetailLine
                  label="Total"
                  value={formatCurrency(
                    linkedInfo.data.totalAmount
                  )}
                />

                <DetailLine
                  label={
                    linkedInfo.type === "payable"
                      ? "Paid"
                      : "Received"
                  }
                  value={formatCurrency(
                    linkedInfo.data.paid ??
                      linkedInfo.data.received ??
                      0
                  )}
                />

                <button
                  onClick={() =>
                    router.push(
                      linkedInfo.type === "payable"
                        ? `/admin/liabilities/payables/${payableGroupForPurpose(linkedInfo.data.purpose)}?doc=${linkedInfo.data._id}`
                        : `/admin/assets/receivables?doc=${linkedInfo.data._id}`
                    )
                  }
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Open document →
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Document not found.
              </p>
            )}
          </DetailBox>
        )}

        {hasAudit && (
          <DetailBox title="Audit trail">
            {row.createdBy?.name && (
              <DetailLine
                label="Created by"
                value={`${row.createdBy.name}${
                  row.createdBy.date
                    ? ` · ${formatDateForDisplay(row.createdBy.date)}`
                    : ""
                }`}
              />
            )}

            {row.editors?.length > 0 ? (
              (() => {
                const lastEditor = row.editors[row.editors.length - 1];
                return (
                  <>
                    <DetailLine
                      label="Last updated by"
                      value={`${lastEditor.name || "—"}${
                        lastEditor.date
                          ? ` · ${formatDateForDisplay(lastEditor.date)}`
                          : ""
                      }`}
                    />

                    {row.editors.length > 1 && (
                      <DetailLine
                        label="Total edits"
                        value={String(row.editors.length)}
                      />
                    )}

                    {lastEditor.updatedFields?.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Changed:{" "}
                        {lastEditor.updatedFields
                          .map((f) => f.name)
                          .join(", ")}
                      </p>
                    )}
                  </>
                );
              })()
            ) : (
              <DetailLine label="Last updated by" value="Not edited" />
            )}
          </DetailBox>
        )}
      </div>
    </div>
  );
}

function DetailBox({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <p className="text-xs font-bold text-slate-700 mb-3">
        {title}
      </p>

      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailLine({
  label,
  value,
  danger = false,
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>

      <span
        className={`font-semibold ${
          danger
            ? "text-rose-600"
            : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
