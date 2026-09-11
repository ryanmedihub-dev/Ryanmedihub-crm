"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Loader2, Pencil, X } from "lucide-react";
import { formatCurrency, formatDate, StatusBadge } from "@/lib/financeUI";
import { formatAgeing } from "@/lib/ageing";
import { INCENTIVE_PURPOSES } from "@/constants/incentivePurposes";

const toDateInputValue = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function DocumentDetailModal({ documentId, kind, onClose, onChanged }) {
  const isPayable = kind === "payable";
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState(null);

  // Re-invoked after an incentive-entry edit/cancel to pull the recomputed total — kept
  // separate from the loading flag below so a refresh doesn't blank the whole modal back to
  // a spinner while the row edit the user just made is still visible underneath.
  const load = useCallback(() => {
    setError(null);
    return fetch(isPayable ? `/api/payables/${documentId}` : `/api/receivables/${documentId}`)
      .then((r) => r.json())
      .then((json) => {
        const d = isPayable ? json.payable : json.receivable;
        if (d) setDoc(d);
        else setError(json.error || "Failed to load document");
      })
      .catch(() => setError("Failed to load document"))
      .finally(() => setLoading(false));
  }, [documentId, isPayable]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const startEditEntry = (e) => {
    setEntryError(null);
    setEditingId(e.incentiveId);
    setEditForm({ amount: String(e.amount), purpose: e.purpose || "", date: toDateInputValue(e.date), remarks: e.remarks || "" });
  };

  const cancelEditEntry = () => {
    setEditingId(null);
    setEditForm(null);
    setEntryError(null);
  };

  const saveEditEntry = async (e) => {
    setEntryBusy(true);
    setEntryError(null);
    try {
      const res = await fetch(`/api/patients/${e.patientId}/incentives/${e.incentiveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: editForm.amount,
          purpose: editForm.purpose,
          date: editForm.date,
          remarks: editForm.remarks,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEntryError(json.error || "Failed to update incentive");
        return;
      }
      setEditingId(null);
      setEditForm(null);
      await load();
      onChanged?.();
    } catch {
      setEntryError("Failed to update incentive");
    } finally {
      setEntryBusy(false);
    }
  };

  const deleteEntry = async (e) => {
    const reason = window.prompt(`Cancel this ₹${e.amount.toLocaleString("en-IN")} incentive for ${e.patientName || "this patient"}?\n\nOptional reason:`);
    if (reason === null) return;
    setEntryBusy(true);
    setEntryError(null);
    try {
      const res = await fetch(`/api/patients/${e.patientId}/incentives/${e.incentiveId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEntryError(json.error || "Failed to cancel incentive");
        return;
      }
      await load();
      onChanged?.();
    } catch {
      setEntryError("Failed to cancel incentive");
    } finally {
      setEntryBusy(false);
    }
  };

  const Field = ({ label, value }) =>
    value === undefined || value === null || value === "" ? null : (
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
      </div>
    );

  const party = doc && (isPayable ? doc.payee : doc.payer);
  const settled = doc && (isPayable ? doc.paid : doc.received);
  const pending = doc?.pending ?? (doc ? Math.max((doc.totalAmount || 0) - (settled || 0), 0) : 0);
  const ageing = doc ? formatAgeing(doc.daysOverdue) : null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-gray-900">
            {isPayable ? "Payable" : "Receivable"} Details
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="p-10 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    {isPayable ? "Payee" : "Payer"}
                  </p>
                  <p className="text-base font-semibold text-gray-900 mt-0.5">{party?.label || "—"}</p>
                  <p className="text-xs text-gray-500 mt-1">{doc.purpose}{isPayable && doc.expenseSubType ? ` · ${doc.expenseSubType}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(doc.totalAmount)}</p>
                  <div className="flex justify-end mt-1">
                    <StatusBadge status={doc.isCancelled ? "Cancelled" : doc.status} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
                  <Field label={isPayable ? "Paid" : "Received"} value={formatCurrency(settled)} />
                  <Field label="Pending" value={formatCurrency(pending)} />
                  <Field label="Due Date" value={doc.dueDate ? formatDate(doc.dueDate) : "—"} />
                  <Field label="Ageing" value={ageing?.text} />
                  <Field label="Period" value={doc.period?.month ? `${doc.period.month}/${doc.period.year}` : null} />
                  <Field label="Branch" value={doc.branch} />
                  <Field label={isPayable ? "Expense Category" : "Revenue Category"} value={isPayable ? doc.expenseCategory : doc.revenueCategory} />
                  <Field label="Party Kind" value={party?.kind} />
                  <Field label="Created" value={doc.createdAt ? formatDate(doc.createdAt) : null} />
                  <Field label="Created By" value={doc.createdBy?.name} />
                </div>

                {doc.tdsLink?.role && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide bg-amber-50 px-2 py-0.5 rounded">
                      TDS {doc.tdsLink.role}
                    </span>
                    {doc.tdsLink.grossAmount != null && <span className="text-gray-600">Gross {formatCurrency(doc.tdsLink.grossAmount)}</span>}
                    {doc.tdsLink.tdsRate != null && <span className="text-gray-600">Rate {doc.tdsLink.tdsRate}%</span>}
                    {doc.tdsLink.tdsAmount != null && <span className="text-gray-600">TDS {formatCurrency(doc.tdsLink.tdsAmount)}</span>}
                  </div>
                )}
              </div>

              {doc.incentiveEntries?.length > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Incentive Entries ({doc.incentiveEntries.length})
                    </p>
                    <p className="text-xs text-gray-400">Click a row to edit or cancel</p>
                  </div>

                  {entryError && (
                    <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {entryError}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2 text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Date</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Patient</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Purpose</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Amount</th>
                          <th className="px-4 py-2 w-20" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {doc.incentiveEntries.map((e, i) =>
                          editingId === e.incentiveId ? (
                            <tr key={i} className="bg-indigo-50/50">
                              <td className="px-4 py-2.5 align-top">
                                <input
                                  type="date"
                                  value={editForm.date}
                                  onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))}
                                  className="w-full min-w-38 px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                />
                              </td>
                              <td className="px-4 py-2.5 align-top text-gray-500">
                                <span className="font-medium text-gray-700">{e.patientName || "—"}</span>
                                {e.patientPhone && <div className="text-gray-400 text-xs">{e.patientPhone}</div>}
                              </td>
                              <td className="px-4 py-2.5 align-top">
                                <select
                                  value={editForm.purpose}
                                  onChange={(ev) => setEditForm((f) => ({ ...f, purpose: ev.target.value }))}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                                >
                                  {INCENTIVE_PURPOSES.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2.5 align-top">
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={editForm.amount}
                                  onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))}
                                  className="w-24 ml-auto block px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right"
                                />
                              </td>
                              <td className="px-4 py-2.5 align-top">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => saveEditEntry(e)}
                                    disabled={entryBusy}
                                    title="Save"
                                    className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEditEntry}
                                    disabled={entryBusy}
                                    title="Discard"
                                    className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={i} className={`hover:bg-gray-50 ${e.isCancelled ? "opacity-50" : ""}`}>
                              <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                              <td className="px-4 py-2.5">
                                <span className="text-gray-800 font-medium">{e.patientName || "—"}</span>
                                {e.patientPhone && <span className="text-gray-400"> · {e.patientPhone}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600">{e.purpose || "—"}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                                {formatCurrency(e.amount)}
                              </td>
                              <td className="px-4 py-2.5">
                                {e.isCancelled ? (
                                  <div className="flex justify-end">
                                    <StatusBadge status="Cancelled" />
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => startEditEntry(e)}
                                      disabled={entryBusy}
                                      title="Edit"
                                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 disabled:opacity-50"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => deleteEntry(e)}
                                      disabled={entryBusy}
                                      title="Cancel this incentive"
                                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {doc.remarks && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Remarks</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.remarks}</p>
                </div>
              )}

              {doc.receipts?.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Receipts ({doc.receipts.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {doc.receipts.map((r) => (
                      <a
                        key={r.publicId || r.url}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-700 hover:bg-slate-200 truncate max-w-[10rem]"
                      >
                        {r.fileName || "File"}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
