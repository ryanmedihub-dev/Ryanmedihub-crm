"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import usePatientPicker from "@/lib/usePatientPicker";
import PatientPicker from "@/components/PatientPicker";
import MetricCard from "@/components/MetricCard";
import { useToast } from "@/components/Toast";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { RecordCollectionModal, SettleModal } from "@/components/collab/CollabModals";
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
} from "lucide-react";

// Same "patient owes / clinic owes" split every collab case row uses, computed once per
// clinic group for just this patient's cases at that clinic — see SettleModal in
// CollabModals.jsx, which treats this exactly like a per-clinic balance.
function clinicNetForPatient(cases) {
  return cases.reduce((sum, c) => {
    if (c.receivableValue != null) return sum + c.receivableValue;
    if (c.payableValue != null) return sum - c.payableValue;
    return sum;
  }, 0);
}

export default function PatientCollabSettlementPage() {
  const toast = useToast();
  const picker = usePatientPicker();
  const [pickerValue, setPickerValue] = useState({ patient: "" });

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedClinic, setExpandedClinic] = useState(null);

  const [settleClinic, setSettleClinic] = useState(null); // clinic name currently being settled
  const [collectionCase, setCollectionCase] = useState(null);

  const patientId = pickerValue.patient;
  const selectedPatient = picker.cache[patientId] || picker.options.find((o) => o._id === patientId);

  const fetchCases = async (id) => {
    if (!id) {
      setCases([]);
      setLoaded(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/collab-settlement/cases?patient=${encodeURIComponent(id)}&limit=100`);
      const data = await res.json();
      if (res.ok) {
        setCases(data.cases || []);
      } else {
        toast.error(data.error || "Failed to load collab cases for this patient");
        setCases([]);
      }
    } catch (error) {
      console.error("Error fetching patient collab cases:", error);
      toast.error("Failed to load collab cases for this patient");
      setCases([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    fetchCases(patientId);
    setExpandedClinic(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const refresh = () => fetchCases(patientId);

  // Grouped by clinic — a patient's cases can span more than one partner clinic, and a
  // settlement is always written against exactly one clinic (see CollabSettlement.clinic),
  // so each group gets its own totals and its own Settle action.
  const clinicGroups = useMemo(() => {
    const byClinic = new Map();
    for (const c of cases) {
      if (!byClinic.has(c.clinic)) byClinic.set(c.clinic, []);
      byClinic.get(c.clinic).push(c);
    }
    return [...byClinic.entries()]
      .map(([clinic, clinicCases]) => ({
        clinic,
        cases: clinicCases,
        receivablePending: clinicCases.reduce((s, c) => s + (c.receivableValue || 0), 0),
        payablePending: clinicCases.reduce((s, c) => s + (c.payableValue || 0), 0),
        netPosition: clinicNetForPatient(clinicCases),
      }))
      .sort((a, b) => Math.abs(b.netPosition) - Math.abs(a.netPosition));
  }, [cases]);

  const totals = useMemo(
    () => ({
      receivable: clinicGroups.reduce((s, g) => s + g.receivablePending, 0),
      payable: clinicGroups.reduce((s, g) => s + g.payablePending, 0),
    }),
    [clinicGroups],
  );

  const patientName = cases[0]?.patientName || selectedPatient?.personal?.name || "";
  const patientPhone = cases[0]?.patientPhone || selectedPatient?.personal?.phone || "";

  const settleGroup = clinicGroups.find((g) => g.clinic === settleClinic);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <Link
                href="/admin/collab-settlement"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Clinic view
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Settle by Patient</h1>
              <p className="text-sm text-gray-500 mt-1">
                Every open payable and receivable a patient's collab cases created, in one place
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <PatientPicker
              picker={picker}
              value={pickerValue}
              onChange={(v) => setPickerValue(v)}
              allowWalkIn={false}
              required={false}
            />
          </div>

          {!patientId ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-500 text-sm">
              Search for a patient above to see their collab cases.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : loaded && cases.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-500 text-sm">
              {patientName || "This patient"} has no collab cases.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
                <p className="text-lg font-bold text-gray-900">{patientName || "Patient"}</p>
                {patientPhone && <p className="text-sm text-gray-500">{patientPhone}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <MetricCard
                  title="Total Receivable (clinics owe for this patient)"
                  value={formatCurrency(totals.receivable)}
                  icon={TrendingUp}
                  color="from-emerald-500 to-emerald-600"
                />
                <MetricCard
                  title="Total Payable (we owe clinics for this patient)"
                  value={formatCurrency(totals.payable)}
                  icon={TrendingDown}
                  color="from-rose-500 to-rose-600"
                />
              </div>

              <div className="space-y-3">
                {clinicGroups.map((group) => (
                  <div key={group.clinic} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedClinic(expandedClinic === group.clinic ? null : group.clinic)
                      }
                      className="w-full text-left p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{group.clinic}</p>
                          <p className="text-xs text-gray-500">
                            {group.cases.length} case{group.cases.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-6">
                        <div className="sm:text-right sm:w-32">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Receivable
                          </p>
                          <p className="text-sm font-bold text-emerald-600 tabular-nums">
                            {formatCurrency(group.receivablePending)}
                          </p>
                        </div>
                        <div className="sm:text-right sm:w-32">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Payable
                          </p>
                          <p className="text-sm font-bold text-rose-600 tabular-nums">
                            {formatCurrency(group.payablePending)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <p
                          className={`text-sm font-bold shrink-0 ${
                            group.netPosition > 0
                              ? "text-emerald-600"
                              : group.netPosition < 0
                                ? "text-rose-600"
                                : "text-gray-500"
                          }`}
                        >
                          {group.netPosition > 0 && `Net: clinic owes ${formatCurrency(group.netPosition)}`}
                          {group.netPosition < 0 && `Net: we owe ${formatCurrency(Math.abs(group.netPosition))}`}
                          {group.netPosition === 0 && "Square"}
                        </p>
                        {expandedClinic === group.clinic ? (
                          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                      </div>
                    </button>

                    {expandedClinic === group.clinic && (
                      <div className="border-t border-gray-100 p-4 sm:p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-gray-900">Cases at {group.clinic}</h3>
                          {group.netPosition !== 0 && (
                            <button
                              onClick={() => setSettleClinic(group.clinic)}
                              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              <Wallet className="w-4 h-4" />
                              Settle {group.clinic}
                            </button>
                          )}
                        </div>

                        <div className="overflow-x-auto -mx-1">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold text-gray-600">Procedure</th>
                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Package</th>
                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Clinic Share</th>
                                <th className="text-right px-3 py-2 font-semibold text-emerald-700">Receivable</th>
                                <th className="text-right px-3 py-2 font-semibold text-rose-700">Payable</th>
                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Created</th>
                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.cases.map((c) => (
                                <tr key={c._id} className="hover:bg-gray-50/60">
                                  <td className="px-3 py-2">
                                    <span className="font-medium text-gray-900">{c.procedure}</span>
                                    {c.status !== "OPEN" && (
                                      <span className="ml-1.5 text-[10px] font-semibold text-gray-400 uppercase">
                                        {c.status}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatCurrency(c.packageAmount)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatCurrency(c.clinicShare)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">
                                    {c.receivableValue == null ? "—" : formatCurrency(c.receivableValue)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-rose-700 font-semibold">
                                    {c.payableValue == null ? "—" : formatCurrency(c.payableValue)}
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                                    {formatDate(c.createdAt)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {c.status === "OPEN" && (
                                      <button
                                        onClick={() => setCollectionCase(c)}
                                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                                      >
                                        Record Collection
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {settleGroup && (
        <SettleModal
          clinic={settleGroup.clinic}
          balance={{ netPosition: settleGroup.netPosition }}
          openCases={settleGroup.cases.filter((c) => c.status === "OPEN")}
          onClose={() => setSettleClinic(null)}
          onSuccess={() => {
            setSettleClinic(null);
            refresh();
          }}
          toast={toast}
        />
      )}

      {collectionCase && (
        <RecordCollectionModal
          collabCase={collectionCase}
          onClose={() => setCollectionCase(null)}
          onSuccess={() => {
            setCollectionCase(null);
            refresh();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}
