"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gift, Wallet } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const formatDate = (date) => (date ? new Date(date).toLocaleDateString("en-IN") : "N/A");

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params.id;
  const router = useRouter();

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState({
    rows: [],
    total: 0,
    byMonth: [],
    byPurpose: [],
    byPatient: [],
    outstanding: 0,
    paid: 0,
  });
  const [rowsLoading, setRowsLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [purpose, setPurpose] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  // The same payable rollup the staff list's money columns are built from, so clicking
  // through from a row shows that row's figures broken out rather than a different number.
  const [finance, setFinance] = useState(null);
  const [advances, setAdvances] = useState([]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/employees/finance-summary?employeeId=${id}`)
      .then((r) => r.json())
      .then((json) => setFinance(json?.byEmployee?.[id] || null))
      .catch(() => setFinance(null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/advances/open-for-party?partyKind=EMPLOYEE&partyRefId=${id}`)
      .then((r) => r.json())
      .then((json) => setAdvances(Array.isArray(json?.advances) ? json.advances : []))
      .catch(() => setAdvances([]));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/employees/get/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEmployee(json.data);
        else router.push("/admin/employees");
      })
      .catch(() => router.push("/admin/employees"))
      .finally(() => setLoading(false));
  }, [id, router]);

  const fetchIncentives = useCallback(async () => {
    if (!id) return;
    setRowsLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (month) qs.set("month", month);
      if (year) qs.set("year", year);
      if (purpose) qs.set("purpose", purpose);
      const json = await fetch(`/api/employees/${id}/incentives?${qs}`).then((r) => r.json());
      if (json.success) setData(json);
    } catch {
    } finally {
      setRowsLoading(false);
    }
  }, [id, month, year, purpose, page]);

  useEffect(() => {
    fetchIncentives();
  }, [fetchIncentives]);

  const purposeOptions = data.byPurpose.map((p) => p.purpose);
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading employee...</p>
        </div>
      </main>
    );
  }

  if (!employee) return null;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h1 className="text-xl font-bold text-gray-900">
            {employee.name}
            {employee.employeeId ? (
              <span className="ml-2 text-sm font-medium text-gray-400">#{employee.employeeId}</span>
            ) : null}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {employee.role} · {employee.branch || "N/A"}
            {employee.phone ? ` · ${employee.phone}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Earned (active)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(data.byPurpose.reduce((s, p) => s + p.total, 0))}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Paid</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(data.paid)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding (unpaid)</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(data.outstanding)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Entries</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.total}</p>
          </div>
        </div>

        {finance && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Payables</h2>
            <p className="text-xs text-gray-400 mb-4">
              Everything raised against this employee — {finance.payableCount}{" "}
              document{finance.payableCount === 1 ? "" : "s"}
              {finance.overdueCount > 0 && (
                <span className="ml-1 font-semibold text-red-600">
                  · {finance.overdueCount} overdue
                </span>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2 font-semibold" />
                    <th className="text-right py-2 font-semibold">Payable</th>
                    <th className="text-right py-2 font-semibold">Paid</th>
                    <th className="text-right py-2 font-semibold">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    ["Salary", "salaryPayable", "salaryPaid", "salaryPending"],
                    ["Incentive", "incentivePayable", "incentivePaid", "incentivePending"],
                  ].map(([label, a, b, c]) => (
                    <tr key={label}>
                      <td className="py-2 text-gray-700">{label}</td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(finance[a])}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-700">{formatCurrency(finance[b])}</td>
                      <td className="py-2 text-right tabular-nums text-amber-700">{formatCurrency(finance[c])}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="py-2 text-gray-900">Total</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(finance.totalPayable)}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-700">{formatCurrency(finance.totalPaid)}</td>
                    <td className="py-2 text-right tabular-nums text-amber-700">{formatCurrency(finance.totalPending)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {finance && (finance.advanceGiven > 0 || advances.length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-600" /> Advances / Receivable
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Money given in advance to this employee — {finance.advanceCount}{" "}
              advance{finance.advanceCount === 1 ? "" : "s"}. Outstanding is what is still
              recoverable after settling against payables and any cash recovered.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Given</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(finance.advanceGiven)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Settled vs payables</p>
                <p className="text-lg font-bold text-indigo-700 mt-0.5">{formatCurrency(finance.advanceSettled)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Recovered (cash)</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatCurrency(finance.advanceRecovered)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs text-amber-600 uppercase tracking-wide">Outstanding</p>
                <p className="text-lg font-bold text-amber-700 mt-0.5">{formatCurrency(finance.advanceOutstanding)}</p>
              </div>
            </div>
            {advances.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-2 font-semibold">Date</th>
                      <th className="text-left py-2 font-semibold">Account</th>
                      <th className="text-left py-2 font-semibold">Reference</th>
                      <th className="text-right py-2 font-semibold">Amount</th>
                      <th className="text-right py-2 font-semibold">Applied</th>
                      <th className="text-right py-2 font-semibold">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {advances.map((a) => (
                      <tr key={a._id}>
                        <td className="py-2 text-gray-700">{formatDate(a.date)}</td>
                        <td className="py-2 text-gray-600">{a.account || "—"}</td>
                        <td className="py-2 text-gray-600">{a.reference || "—"}</td>
                        <td className="py-2 text-right tabular-nums">{formatCurrency(a.amount)}</td>
                        <td className="py-2 text-right tabular-nums text-indigo-700">
                          {formatCurrency((a.settledTotal || 0) + (a.cashRecovered || 0))}
                        </td>
                        <td className="py-2 text-right tabular-nums text-amber-700">{formatCurrency(a.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Gift className="w-5 h-5 text-indigo-600" /> Incentives Earned
            </h2>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={month}
              onChange={(e) => { setMonth(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All months</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => { setYear(e.target.value); setPage(1); }}
              placeholder="Year"
              className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <select
              value={purpose}
              onChange={(e) => { setPurpose(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All purposes</option>
              {purposeOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {rowsLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : data.rows.length === 0 ? (
            <p className="text-sm text-gray-400">No incentives recorded for this employee yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Patient</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Purpose</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Date</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">Amount</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map((row) => (
                      <tr key={row._id} className={row.isCancelled ? "text-gray-400 line-through" : ""}>
                        <td className="px-3 py-2">
                          <Link href={`/admin/patients/${row.patientId}`} className="text-indigo-600 hover:underline">
                            {row.patientName || "Unknown"}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{row.purpose}</td>
                        <td className="px-3 py-2">{formatDate(row.date)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.amount)}</td>
                        <td className="px-3 py-2">{row.isCancelled ? "Cancelled" : "Active"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-gray-500">Page {page} of {totalPages}</span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Gift className="w-4 h-4 text-gray-500" /> By Patient
          </h3>
          {rowsLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : data.byPatient.length === 0 ? (
            <p className="text-sm text-gray-400">No incentives recorded for this employee yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Patient</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Entries</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Total Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byPatient.map((row) => (
                    <tr key={row.patientId}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/patients/${row.patientId}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {row.patientName || "Unknown"}
                        </Link>
                        {row.patientPhone ? (
                          <span className="text-gray-400"> · {row.patientPhone}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">{row.count}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data.byMonth.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-gray-500" /> By Month (active only)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.byMonth.map((m) => (
                <div key={`${m.year}-${m.month}`} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{MONTH_NAMES[m.month - 1]} {m.year}</p>
                  <p className="font-bold text-gray-900">{formatCurrency(m.total)}</p>
                  <p className="text-[11px] text-gray-400">{m.count} entr{m.count === 1 ? "y" : "ies"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
