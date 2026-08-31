"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Filter, X, Plus, ChevronRight, ChevronLeft,
  Search, TrendingUp, Edit, Users, IndianRupee, Activity, Trash2, Calendar, Stethoscope, Eye,
} from "lucide-react";

const CATEGORY_OPTIONS = ["Doctor", "Agent", "Counsellor", "Technician", "Implanter", "Others", "Hr"];

const TECHNIQUES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant", "PRP",
  "Alopecia", "Headwash", "GFC", "Other",
];

const CATEGORY_COLORS = {
  Doctor:     "bg-purple-100 text-purple-800 border-purple-200",
  Agent:      "bg-blue-100 text-blue-800 border-blue-200",
  Counsellor: "bg-green-100 text-green-800 border-green-200",
  Technician: "bg-orange-100 text-orange-800 border-orange-200",
  Implanter:  "bg-indigo-100 text-indigo-800 border-indigo-200",
  Others:     "bg-gray-100 text-gray-800 border-gray-200",
  Hr:         "bg-pink-100 text-pink-800 border-pink-200",
};

const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const fmtNumber = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

const EMPTY_FILTERS = {
  search: "", category: "", status: "",
  minPatients: "", maxPatients: "",
  minAmount: "", maxAmount: "",
  minGrafts: "", maxGrafts: "",
  dateFrom: "", dateTo: "", technique: "",
  minPending: "", onlyPending: false,
};

// The six money columns, shown when config.financeColumns is on. All six come from
// Payables raised against the employee, so Total = Salary + Incentive + other, and
// Pending = Payable − Paid on every line.
const FINANCE_COLUMNS = [
  { key: "totalPayable",     label: "Total Payable",   tone: "text-gray-900 font-medium" },
  { key: "totalPaid",        label: "Total Paid",      tone: "text-emerald-700 font-medium" },
  { key: "salaryPayable",    label: "Salary Payable",  tone: "text-gray-700" },
  { key: "salaryPaid",       label: "Salary Paid",     tone: "text-emerald-600" },
  { key: "incentivePayable", label: "Total Incentive", tone: "text-gray-700" },
  { key: "incentivePaid",    label: "Incentive Paid",  tone: "text-emerald-600" },
];

const EMPTY_FINANCE = {
  totalPayable: 0, totalPaid: 0, totalPending: 0,
  salaryPayable: 0, salaryPaid: 0, salaryPending: 0,
  incentivePayable: 0, incentivePaid: 0, incentivePending: 0,
  payableCount: 0, overdueCount: 0,
};

export default function StaffTable({ config = {} }) {
  const {
    SidebarComponent,
    addEmployeePath = null,
    editBasePath    = "/admin/employees/update",
    canDelete       = false,
    viewBasePath    = null,
    financeColumns  = false,
  } = config;

  const [data,     setData]     = useState({});
  const [filters,  setFilters]  = useState(EMPTY_FILTERS);
  const [drawerOpen, setDrawer] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [sort,     setSort]     = useState({ key: financeColumns ? "totalPayable" : "totalPatient", dir: "desc" });
  const [page,     setPage]     = useState(1);
  const [perPage,  setPerPage]  = useState(10);
  const [selectedCategory, setSelectedCategory] = useState("Doctor");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const p = new URLSearchParams();
        if (filters.dateFrom)  p.set("dateFrom",  filters.dateFrom);
        if (filters.dateTo)    p.set("dateTo",    filters.dateTo);
        if (filters.technique) p.set("technique", filters.technique);

        // The payable rollup is a separate query keyed by employee id — fetched alongside
        // so the roster and the money columns arrive together rather than popping in late.
        const [raw, finance] = await Promise.all([
          fetch(`/api/employees/get-patients?${p.toString()}`).then((r) => {
            if (!r.ok) throw new Error("Failed to fetch");
            return r.json();
          }),
          financeColumns
            ? fetch(`/api/employees/finance-summary?${p.toString()}`)
                .then((r) => (r.ok ? r.json() : { byEmployee: {} }))
                .catch(() => ({ byEmployee: {} }))
            : Promise.resolve({ byEmployee: {} }),
        ]);

        const byEmployee = finance?.byEmployee || {};
        const transformed = {};
        Object.keys(raw).forEach((cat) => {
          transformed[cat] = raw[cat].map((e) => ({
            ...e,
            status: e.isactive ? "active" : "inactive",
            ...(financeColumns ? (byEmployee[String(e._id)] || EMPTY_FINANCE) : {}),
          }));
        });
        setData(transformed);
      } catch {
        setData({});
      } finally {
        setLoading(false);
      }
    })();
  }, [filters.dateFrom, filters.dateTo, filters.technique, financeColumns]);

  const currentCategory = filters.category || selectedCategory;
  const hasGrafts          = ["Doctor", "Technician", "Implanter", "Others"].includes(currentCategory);
  const hasReadyForSurgery = ["Agent", "Counsellor"].includes(currentCategory);
  const isHr               = currentCategory === "Hr";

  const categoryData = useMemo(() => data[currentCategory] || [], [data, currentCategory]);

  const filtered = useMemo(() => {
    let list = [...categoryData];
    if (filters.search)      list = list.filter((i) => i.name.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.status)      list = list.filter((i) => i.status === filters.status);
    if (financeColumns) {
      if (filters.minAmount)  list = list.filter((i) => (i.totalPayable || 0) >= +filters.minAmount);
      if (filters.maxAmount)  list = list.filter((i) => (i.totalPayable || 0) <= +filters.maxAmount);
      if (filters.minPending) list = list.filter((i) => (i.totalPending || 0) >= +filters.minPending);
      if (filters.onlyPending) list = list.filter((i) => (i.totalPending || 0) > 0);
    } else {
      if (filters.minPatients) list = list.filter((i) => i.totalPatient >= +filters.minPatients);
      if (filters.maxPatients) list = list.filter((i) => i.totalPatient <= +filters.maxPatients);
      if (filters.minAmount)   list = list.filter((i) => i.amountReceived >= +filters.minAmount);
      if (filters.maxAmount)   list = list.filter((i) => i.amountReceived <= +filters.maxAmount);
      if (filters.minGrafts)   list = list.filter((i) => (i.graftsImplanted || 0) >= +filters.minGrafts);
      if (filters.maxGrafts)   list = list.filter((i) => (i.graftsImplanted || 0) <= +filters.maxGrafts);
    }
    list.sort((a, b) => {
      const av = a[sort.key] || 0, bv = b[sort.key] || 0;
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [categoryData, filters, sort, financeColumns]);

  const financeTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, i) => {
          Object.keys(EMPTY_FINANCE).forEach((k) => {
            acc[k] += i[k] || 0;
          });
          return acc;
        },
        { ...EMPTY_FINANCE },
      ),
    [filtered],
  );

  const totals = useMemo(() =>
    filtered.reduce((acc, i) => ({
      totalPatient:    acc.totalPatient    + (i.totalPatient    || 0),
      graftsImplanted: acc.graftsImplanted + (i.graftsImplanted || 0),
      amountReceived:  acc.amountReceived  + (i.amountReceived  || 0),
      readyForSurgery: acc.readyForSurgery + (i.readyForSurgery || 0),
      totalCandidates: acc.totalCandidates + (i.totalCandidates || 0),
      selected:        acc.selected        + (i.selected        || 0),
      rejected:        acc.rejected        + (i.rejected        || 0),
      scheduled:       acc.scheduled       + (i.scheduled       || 0),
    }), { totalPatient: 0, graftsImplanted: 0, amountReceived: 0, readyForSurgery: 0, totalCandidates: 0, selected: 0, rejected: 0, scheduled: 0 }),
  [filtered]);

  const total   = filtered.length;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages);
  const start   = (current - 1) * perPage;
  const rows    = filtered.slice(start, Math.min(start + perPage, total));
  useEffect(() => setPage(1), [filters, perPage, selectedCategory]);

  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const toggleSort   = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  const setFilter    = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete employee "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res  = await fetch(`/api/employees/delete/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setData((prev) => {
          const next = {};
          Object.keys(prev).forEach((cat) => { next[cat] = prev[cat].filter((e) => e._id !== id); });
          return next;
        });
      }
    } finally {
      setDeleting(null);
    }
  };

  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.category)    chips.push({ k: "category",    label: `Category: ${filters.category}` });
    if (filters.status)      chips.push({ k: "status",      label: `Status: ${filters.status === "active" ? "Active" : "Inactive"}` });
    if (filters.minPatients) chips.push({ k: "minPatients", label: `Min Patients: ${filters.minPatients}` });
    if (filters.maxPatients) chips.push({ k: "maxPatients", label: `Max Patients: ${filters.maxPatients}` });
    if (filters.minAmount)   chips.push({ k: "minAmount",   label: `Min Amount: ${fmtCurrency(filters.minAmount)}` });
    if (filters.maxAmount)   chips.push({ k: "maxAmount",   label: `Max Amount: ${fmtCurrency(filters.maxAmount)}` });
    if (filters.minGrafts)   chips.push({ k: "minGrafts",   label: `Min Grafts: ${filters.minGrafts}` });
    if (filters.maxGrafts)   chips.push({ k: "maxGrafts",   label: `Max Grafts: ${filters.maxGrafts}` });
    if (filters.dateFrom)    chips.push({ k: "dateFrom",    label: `From: ${filters.dateFrom}` });
    if (filters.dateTo)      chips.push({ k: "dateTo",      label: `To: ${filters.dateTo}` });
    if (filters.technique)   chips.push({ k: "technique",   label: `Service: ${filters.technique}` });
    return chips;
  }, [filters]);

  if (loading)
    return (
      <div className="flex min-h-screen bg-gray-50">
        {SidebarComponent && <SidebarComponent />}
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
        </main>
      </div>
    );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {SidebarComponent && <SidebarComponent />}

      <main className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Staff Performance</h1>
              <p className="text-sm text-gray-500">Track performance metrics across all staff categories</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDrawer(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white shadow-sm hover:bg-gray-50 text-gray-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeChips.length > 0 && (
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                    {activeChips.length}
                  </span>
                )}
              </button>
              {addEmployeePath && (
                <Link
                  href={addEmployeePath}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Employee
                </Link>
              )}
            </div>
          </div>

          {activeChips.length > 0 && (
            <div className="px-6 pb-3 flex flex-wrap gap-2">
              {activeChips.map((c) => (
                <span key={c.k} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium border border-indigo-200">
                  {c.label}
                  <button onClick={() => setFilter(c.k, "")}><X className="w-3 h-3" /></button>
                </span>
              ))}
              <button onClick={clearFilters} className="text-sm text-gray-600 hover:text-gray-900 underline">Clear all</button>
            </div>
          )}
        </header>

        <div className="px-6 pt-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(cat); setFilter("category", cat); }}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                  currentCategory === cat
                    ? CATEGORY_COLORS[cat] + " border"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {cat}
                <span className="ml-2 text-xs opacity-75">({data[cat]?.length || 0})</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`px-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4 ${financeColumns ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          <SummaryCard title="Total Staff"   value={filtered.length}                    icon={<Users className="w-5 h-5" />}       color="blue" />
          {financeColumns ? (
            <>
              <SummaryCard title="Total Payable"    value={fmtCurrency(financeTotals.totalPayable)}     icon={<IndianRupee className="w-5 h-5" />} color="indigo" />
              <SummaryCard title="Total Paid"       value={fmtCurrency(financeTotals.totalPaid)}        icon={<TrendingUp className="w-5 h-5" />}  color="green" />
              <SummaryCard title="Salary Pending"   value={fmtCurrency(financeTotals.salaryPending)}    icon={<IndianRupee className="w-5 h-5" />} color="orange" />
              <SummaryCard title="Incentive Pending" value={fmtCurrency(financeTotals.incentivePending)} icon={<Activity className="w-5 h-5" />}    color="purple" />
            </>
          ) : isHr ? (
            <>
              <SummaryCard title="Total Assigned" value={totals.totalCandidates}         icon={<Activity className="w-5 h-5" />}    color="green" />
              <SummaryCard title="Selected"        value={totals.selected}                icon={<TrendingUp className="w-5 h-5" />}  color="purple" />
              <SummaryCard title="Rejected"        value={totals.rejected}                icon={<Activity className="w-5 h-5" />}    color="orange" />
            </>
          ) : (
            <>
              <SummaryCard title="Total Patients"   value={totals.totalPatient}                     icon={<Activity className="w-5 h-5" />}   color="green" />
              {hasGrafts          && <SummaryCard title="Total Grafts"       value={fmtNumber(totals.graftsImplanted)}    icon={<TrendingUp className="w-5 h-5" />} color="purple" />}
              {hasReadyForSurgery && <SummaryCard title="Ready for Surgery"  value={totals.readyForSurgery}               icon={<Activity className="w-5 h-5" />}   color="orange" />}
              <SummaryCard title="Total Revenue"    value={fmtCurrency(totals.amountReceived)}       icon={<IndianRupee className="w-5 h-5" />} color="indigo" />
            </>
          )}
        </div>

        <div className="px-6 pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search staff by name…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <section className="p-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                  <tr>
                    <Th label="Name" />
                    <Th label="Status" />
                    {financeColumns ? (
                      FINANCE_COLUMNS.map((c) => (
                        <Th key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={toggleSort} />
                      ))
                    ) : isHr ? (
                      <>
                        <Th label="Total Assigned" sortKey="totalCandidates" sort={sort} onSort={toggleSort} />
                        <Th label="Selected"        sortKey="selected"        sort={sort} onSort={toggleSort} />
                        <Th label="Rejected"        sortKey="rejected"        sort={sort} onSort={toggleSort} />
                        <Th label="Scheduled"       sortKey="scheduled"       sort={sort} onSort={toggleSort} />
                        <Th label="Selection Rate"  sortKey="selectionRate"   sort={sort} onSort={toggleSort} />
                      </>
                    ) : (
                      <>
                        <Th label="Total Patients"  sortKey="totalPatient"    sort={sort} onSort={toggleSort} />
                        {hasGrafts          && <Th label="Grafts Implanted"  sortKey="graftsImplanted"  sort={sort} onSort={toggleSort} />}
                        {hasReadyForSurgery && <Th label="Ready for Surgery" sortKey="readyForSurgery"  sort={sort} onSort={toggleSort} />}
                        <Th label="Amount Received" sortKey="amountReceived"  sort={sort} onSort={toggleSort} />
                        <Th label="Avg per Patient" />
                      </>
                    )}
                    <Th label="Actions" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-500">
                        <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-lg font-medium text-gray-900 mb-1">No results found</p>
                        <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((item, idx) => {
                      const avg = item.totalPatient ? item.amountReceived / item.totalPatient : 0;
                      return (
                        <tr key={item._id || idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">
                            {item.name}
                            {financeColumns && item.overdueCount > 0 && (
                              <span
                                className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200"
                                title={`${item.overdueCount} payable(s) past their due date`}
                              >
                                {item.overdueCount} overdue
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                          {financeColumns ? (
                            FINANCE_COLUMNS.map((c) => (
                              <td key={c.key} className={`px-6 py-4 tabular-nums ${c.tone}`}>
                                {fmtCurrency(item[c.key])}
                              </td>
                            ))
                          ) : isHr ? (
                            <>
                              <td className="px-6 py-4 text-gray-700">{item.totalCandidates || 0}</td>
                              <td className="px-6 py-4 text-emerald-600 font-semibold">{item.selected || 0}</td>
                              <td className="px-6 py-4 text-red-500 font-semibold">{item.rejected || 0}</td>
                              <td className="px-6 py-4 text-indigo-600 font-semibold">{item.scheduled || 0}</td>
                              <td className="px-6 py-4">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.selectionRate >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                                  {item.selectionRate || 0}%
                                </span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-4 text-gray-700">{item.totalPatient}</td>
                              {hasGrafts          && <td className="px-6 py-4 text-gray-700">{fmtNumber(item.graftsImplanted || 0)}</td>}
                              {hasReadyForSurgery && <td className="px-6 py-4 text-gray-700">{item.readyForSurgery || 0}</td>}
                              <td className="px-6 py-4 text-gray-900 font-medium">{fmtCurrency(item.amountReceived)}</td>
                              <td className="px-6 py-4 text-gray-600">{fmtCurrency(avg)}</td>
                            </>
                          )}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              {viewBasePath && (
                                <Link
                                  href={`${viewBasePath}/${item._id}`}
                                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                                  title="View employee"
                                >
                                  <Eye className="w-4 h-4" />
                                </Link>
                              )}
                              <Link
                                href={`${editBasePath}/${item._id}`}
                                className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                                title="Edit employee"
                              >
                                <Edit className="w-4 h-4" />
                              </Link>
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(item._id, item.name)}
                                  disabled={deleting === item._id}
                                  className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40"
                                  title="Delete employee"
                                >
                                  {deleting === item._id
                                    ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                                    : <Trash2 className="w-4 h-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {rows.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <tr>
                      <td className="px-6 py-4 text-gray-900">Total</td>
                      <td className="px-6 py-4" />
                      {financeColumns ? (
                        FINANCE_COLUMNS.map((c) => (
                          <td key={c.key} className="px-6 py-4 text-gray-900 tabular-nums">
                            {fmtCurrency(financeTotals[c.key])}
                          </td>
                        ))
                      ) : isHr ? (
                        <>
                          <td className="px-6 py-4 text-gray-900">{totals.totalCandidates}</td>
                          <td className="px-6 py-4 text-emerald-600">{totals.selected}</td>
                          <td className="px-6 py-4 text-red-500">{totals.rejected}</td>
                          <td className="px-6 py-4 text-indigo-600">{totals.scheduled}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {totals.totalCandidates > 0 ? `${((totals.selected / totals.totalCandidates) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-gray-900">{totals.totalPatient}</td>
                          {hasGrafts          && <td className="px-6 py-4 text-gray-900">{fmtNumber(totals.graftsImplanted)}</td>}
                          {hasReadyForSurgery && <td className="px-6 py-4 text-gray-900">{totals.readyForSurgery}</td>}
                          <td className="px-6 py-4 text-gray-900">{fmtCurrency(totals.amountReceived)}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {totals.totalPatient > 0 ? fmtCurrency(totals.amountReceived / totals.totalPatient) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing <b>{start + 1}</b>–<b>{Math.min(start + perPage, total)}</b> of <b>{total}</b> staff
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={perPage}
                  onChange={(e) => setPerPage(+e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                >
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current <= 1}
                    className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 w-16 text-center">{current} / {pages}</span>
                  <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={current >= pages}
                    className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
                <p className="text-sm text-gray-500 mt-1">Refine your staff performance view</p>
              </div>
              <button onClick={() => setDrawer(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <FilterSection title="Category" icon={<Filter className="w-4 h-4" />}>
                <FilterSelect
                  value={filters.category}
                  onChange={(v) => { setFilter("category", v); setSelectedCategory(v || "Doctor"); }}
                  options={[{ label: "All Categories", value: "" }, ...CATEGORY_OPTIONS.map((c) => ({ label: c, value: c }))]}
                />
              </FilterSection>

              <FilterSection title="Status" icon={<Activity className="w-4 h-4" />}>
                <FilterSelect
                  value={filters.status}
                  onChange={(v) => setFilter("status", v)}
                  options={[{ label: "All Status", value: "" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }]}
                />
              </FilterSection>

              {financeColumns ? (
                <>
                  <FilterSection title="Total Payable" icon={<IndianRupee className="w-4 h-4" />}>
                    <div className="grid grid-cols-2 gap-4">
                      <FilterInput label="Min (₹)" value={filters.minAmount} onChange={(v) => setFilter("minAmount", v)} placeholder="0" />
                      <FilterInput label="Max (₹)" value={filters.maxAmount} onChange={(v) => setFilter("maxAmount", v)} placeholder="500000" />
                    </div>
                  </FilterSection>

                  <FilterSection title="Outstanding" icon={<Activity className="w-4 h-4" />}>
                    <FilterInput label="Min Pending (₹)" value={filters.minPending} onChange={(v) => setFilter("minPending", v)} placeholder="0" />
                    <label className="mt-4 flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={filters.onlyPending}
                        onChange={(e) => setFilter("onlyPending", e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Only staff with something still owed</span>
                    </label>
                  </FilterSection>
                </>
              ) : (
                <>
                  <FilterSection title="Patient Count" icon={<Users className="w-4 h-4" />}>
                    <div className="grid grid-cols-2 gap-4">
                      <FilterInput label="Min Patients" value={filters.minPatients} onChange={(v) => setFilter("minPatients", v)} placeholder="0" />
                      <FilterInput label="Max Patients" value={filters.maxPatients} onChange={(v) => setFilter("maxPatients", v)} placeholder="100" />
                    </div>
                  </FilterSection>

                  <FilterSection title="Amount Received" icon={<IndianRupee className="w-4 h-4" />}>
                    <div className="grid grid-cols-2 gap-4">
                      <FilterInput label="Min Amount (₹)" value={filters.minAmount} onChange={(v) => setFilter("minAmount", v)} placeholder="0" />
                      <FilterInput label="Max Amount (₹)" value={filters.maxAmount} onChange={(v) => setFilter("maxAmount", v)} placeholder="500000" />
                    </div>
                  </FilterSection>
                </>
              )}

              {!financeColumns && hasGrafts && (
                <FilterSection title="Grafts Implanted" icon={<TrendingUp className="w-4 h-4" />}>
                  <div className="grid grid-cols-2 gap-4">
                    <FilterInput label="Min Grafts" value={filters.minGrafts} onChange={(v) => setFilter("minGrafts", v)} placeholder="0" />
                    <FilterInput label="Max Grafts" value={filters.maxGrafts} onChange={(v) => setFilter("maxGrafts", v)} placeholder="30000" />
                  </div>
                </FilterSection>
              )}

              <FilterSection title="Visit Date Range" icon={<Calendar className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-4">
                  <FilterDateInput label="From" value={filters.dateFrom} onChange={(v) => setFilter("dateFrom", v)} />
                  <FilterDateInput label="To"   value={filters.dateTo}   onChange={(v) => setFilter("dateTo",   v)} />
                </div>
              </FilterSection>

              <FilterSection title="Service / Technique" icon={<Stethoscope className="w-4 h-4" />}>
                <FilterSelect
                  value={filters.technique}
                  onChange={(v) => setFilter("technique", v)}
                  options={[{ label: "All Services", value: "" }, ...TECHNIQUES.map((t) => ({ label: t, value: t }))]}
                />
              </FilterSection>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button onClick={clearFilters}      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium">Reset All</button>
              <button onClick={() => setDrawer(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ label, sortKey, sort, onSort }) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th
      className={`px-6 py-3 text-left font-medium ${sortKey ? "cursor-pointer select-none hover:bg-gray-100" : ""}`}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-[10px] text-gray-500">{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function FilterSection({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-2">{label}</span>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
      />
    </label>
  );
}

function FilterDateInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-2">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
      />
    </label>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 bg-white"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SummaryCard({ title, value, icon, color }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    active:   { label: "Active",   cls: "bg-green-100 text-green-800 border-green-200" },
    inactive: { label: "Inactive", cls: "bg-red-100 text-red-800 border-red-200" },
  }[status] || { label: "Unknown", cls: "bg-gray-100 text-gray-800 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
