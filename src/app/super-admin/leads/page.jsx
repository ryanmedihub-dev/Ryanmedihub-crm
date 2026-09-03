"use client";

import { useEffect, useRef, useState } from "react";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";
import {
  Search,
  Filter,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Users,
  Tag,
  Calendar,
  Loader2,
  Mail,
  ScrollText,
} from "lucide-react";

const TAG_OPTIONS = [
  "Google Leads",
  "Meta Leads",
  "Form Leads",
  "Collab Leads",
];

const LOCATION_OPTIONS = [
  "Agra",
  "Ahmedabad",
  "Amritsar",
  "Aurangabad",
  "Bengaluru",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Dehradun",
  "Delhi",
  "Faridabad",
  "Ghaziabad",
  "Gurgaon",
  "Guwahati",
  "Gwalior",
  "Hyderabad",
  "India",
  "Indore",
  "Jabalpur",
  "Jaipur",
  "Jammu",
  "Jodhpur",
  "Kanpur",
  "Kochi",
  "Kolkata",
  "Kolhapur",
  "Kota",
  "Lucknow",
  "Ludhiana",
  "Mangalore",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Noida",
  "Patna",
  "Pune",
  "Raipur",
  "Rajkot",
  "Ranchi",
  "Shimla",
  "Solapur",
  "Srinagar",
  "Surat",
  "Thiruvananthapuram",
  "Udaipur",
  "Vadodara",
  "Varanasi",
  "Vijayawada",
  "Visakhapatnam",
];

const TAG_STYLES = {
  "Google Leads": "bg-blue-100 text-blue-700 border-blue-200",
  "Meta Leads": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Form Leads": "bg-green-100 text-green-700 border-green-200",
  "Collab Leads": "bg-purple-100 text-purple-700 border-purple-200",
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtFilterLabel(key, val) {
  if (!val) return null;
  if (
    key === "createdFrom" ||
    key === "createdTo" ||
    key === "visitFrom" ||
    key === "visitTo"
  ) {
    const [, timePart] = val.split("T");
    const date = new Date(val).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return timePart ? `${date} ${timePart}` : date;
  }
  return val;
}

function leadsToCSV(leads) {
  const headers = [
    "Name",
    "Phone",
    "Email",
    "City",
    "Tag",
    "Created At",
    "Visit Date",
    "Remarks",
  ];
  const rows = leads.map((l) => [
    l.name ?? "",
    l.phone ?? "",
    l.email ?? "",
    l.city ?? "",
    l.tag ?? "",
    l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "",
    l.visitDate ? new Date(l.visitDate).toLocaleString("en-IN") : "",
    (l.remarks ?? "").replace(/,/g, ";"),
  ]);
  return [headers, ...rows].map((r) => r.join(",")).join("\n");
}

function buildParams(search, filters, extra = {}) {
  const p = new URLSearchParams();
  if (search) p.set("search", search);
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.city) p.set("city", filters.city);
  if (filters.createdFrom) p.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) p.set("createdTo", filters.createdTo);
  if (filters.visitFrom) p.set("visitFrom", filters.visitFrom);
  if (filters.visitTo) p.set("visitTo", filters.visitTo);
  if (filters.hasEmail === true) p.set("hasEmail", "true");
  if (filters.hasEmail === false) p.set("hasEmail", "false");
  if (filters.hasRemarks === true) p.set("hasRemarks", "true");
  if (filters.hasRemarks === false) p.set("hasRemarks", "false");
  Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p;
}

function FilterSection({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function ToggleChip({ label, value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === true ? null : true)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
        value === true
          ? "bg-amber-500 text-white border-amber-500"
          : "bg-white text-gray-600 border-gray-300 hover:border-amber-400"
      }`}
    >
      {label}
    </button>
  );
}

export default function SuperAdminLeadsPage() {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({
    tag: "",
    city: "",
    createdFrom: "",
    createdTo: "",
    visitFrom: "",
    visitTo: "",
    hasEmail: null,
    hasRemarks: null,
  });
  const [pendingFilters, setPendingFilters] = useState({ ...filters });
  const searchTimer = useRef(null);
  const filterPanelRef = useRef(null);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) =>
    k === "hasEmail" || k === "hasRemarks" ? v !== null : !!v,
  ).length;

  const fetchLeads = async (overridePage) => {
    setLoading(true);
    try {
      const p = buildParams(search, filters, {
        page: overridePage ?? page,
        limit: perPage,
      });
      const res = await fetch(`/api/leads/get?${p}`);
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchLeads(1);
    }, 400);
  }, [search]);

  useEffect(() => {
    fetchLeads();
  }, [page, perPage, filters]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const p = buildParams(search, filters, { export: "true" });
      const res = await fetch(`/api/leads/get?${p}`);
      const data = await res.json();
      const allLeads = data.leads || [];
      const csv = leadsToCSV(allLeads);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const applyFilters = () => {
    setFilters({ ...pendingFilters });
    setPage(1);
    setShowFilter(false);
  };

  const clearFilters = () => {
    const blank = {
      tag: "",
      city: "",
      createdFrom: "",
      createdTo: "",
      visitFrom: "",
      visitTo: "",
      hasEmail: null,
      hasRemarks: null,
    };
    setFilters(blank);
    setPendingFilters(blank);
    setPage(1);
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <section className="flex min-h-screen bg-gray-50">
      <SuperAdminSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-md">
                <ScrollText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">ALL Leads</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {total.toLocaleString()} total leads
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email…"
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-56"
              />
            </div>

            <button
              onClick={() => {
                setPendingFilters({ ...filters });
                setShowFilter((p) => !p);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                showFilter || activeFilterCount > 0
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white text-gray-600 border-gray-300 hover:border-amber-400"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-white text-amber-600 rounded-full text-xs font-bold w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloading ? "Exporting…" : `Export CSV (${total})`}
            </button>
          </div>
        </div>

        {showFilter && (
          <div
            ref={filterPanelRef}
            className="bg-white border-b border-gray-100 px-6 py-4"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Filters
              </p>
              <button
                onClick={() => setShowFilter(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-xl px-3.5 py-3 border border-gray-100">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  <Tag className="w-3 h-3" /> Source
                </label>
                <select
                  value={pendingFilters.tag}
                  onChange={(e) =>
                    setPendingFilters((p) => ({ ...p, tag: e.target.value }))
                  }
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                >
                  <option value="">All Tags</option>
                  {TAG_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5 mt-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  <Users className="w-3 h-3" /> City
                </label>
                <select
                  value={pendingFilters.city}
                  onChange={(e) =>
                    setPendingFilters((p) => ({ ...p, city: e.target.value }))
                  }
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                >
                  <option value="">All Cities</option>
                  {LOCATION_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 rounded-xl px-3.5 py-3 border border-gray-100">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  <Calendar className="w-3 h-3" /> Created Range
                </label>
                <div className="space-y-1.5 mt-4">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400 pointer-events-none z-10">
                      FROM
                    </span>
                    <input
                      type="datetime-local"
                      value={pendingFilters.createdFrom}
                      onChange={(e) =>
                        setPendingFilters((p) => ({
                          ...p,
                          createdFrom: e.target.value,
                        }))
                      }
                      className="w-full bg-white border border-gray-200 rounded-lg pl-12 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400 pointer-events-none z-10">
                      TO
                    </span>
                    <input
                      type="datetime-local"
                      value={pendingFilters.createdTo}
                      onChange={(e) =>
                        setPendingFilters((p) => ({
                          ...p,
                          createdTo: e.target.value,
                        }))
                      }
                      className="w-full bg-white border border-gray-200 rounded-lg pl-12 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl px-3.5 py-3 border border-gray-100">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  <Calendar className="w-3 h-3" /> Visit Range
                </label>
                <div className="space-y-1.5 mt-4">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400 pointer-events-none z-10">
                      FROM
                    </span>
                    <input
                      type="datetime-local"
                      value={pendingFilters.visitFrom}
                      onChange={(e) =>
                        setPendingFilters((p) => ({
                          ...p,
                          visitFrom: e.target.value,
                        }))
                      }
                      className="w-full bg-white border border-gray-200 rounded-lg pl-12 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400 pointer-events-none z-10">
                      TO
                    </span>
                    <input
                      type="datetime-local"
                      value={pendingFilters.visitTo}
                      onChange={(e) =>
                        setPendingFilters((p) => ({
                          ...p,
                          visitTo: e.target.value,
                        }))
                      }
                      className="w-full bg-white border border-gray-200 rounded-lg pl-12 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl px-3.5 py-3 border border-gray-100">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  <Mail className="w-3 h-3" /> Email
                </label>
                <button
                  onClick={() =>
                    setPendingFilters((p) => ({ ...p, hasEmail: !p.hasEmail }))
                  }
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    pendingFilters.hasEmail
                      ? "bg-amber-50 border-amber-300 text-amber-700"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      pendingFilters.hasEmail
                        ? "border-amber-500 bg-amber-500"
                        : "border-gray-300"
                    }`}
                  >
                    {pendingFilters.hasEmail && (
                      <span className="w-1.5 h-1.5 bg-white rounded-full" />
                    )}
                  </span>
                  With Email
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-gray-100">
              <button
                onClick={applyFilters}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-amber-100"
              >
                Apply
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-600 font-medium">
              Active filters:
            </span>
            {Object.entries(filters).map(([k, v]) => {
              if (k === "hasEmail" || k === "hasRemarks") {
                if (v === null) return null;
                return (
                  <span
                    key={k}
                    className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  >
                    {k === "hasEmail" ? "Has Email" : "Has Remarks"}
                    <button
                      onClick={() => setFilters((p) => ({ ...p, [k]: null }))}
                      className="hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              }
              if (!v) return null;
              return (
                <span
                  key={k}
                  className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium"
                >
                  {k}: {fmtFilterLabel(k, v)}
                  <button
                    onClick={() => setFilters((p) => ({ ...p, [k]: "" }))}
                    className="hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-amber-600 hover:text-red-500 font-medium"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "#",
                      "Name",
                      "Phone",
                      "Email",
                      "City",
                      "Tag",
                      "Visit Date",
                      "Created At",
                      "Remarks",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-500 mx-auto" />
                        <p className="text-sm text-gray-400 mt-2">
                          Loading leads…
                        </p>
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center text-gray-400 text-sm"
                      >
                        No leads found
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead, idx) => (
                      <tr
                        key={lead._id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {(page - 1) * perPage + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {lead.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {lead.phone || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {lead.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {lead.city || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {lead.tag ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${TAG_STYLES[lead.tag] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                            >
                              {lead.tag}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {fmtDate(lead.visitDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {fmtDate(lead.createdAt)}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-gray-500 max-w-50 truncate"
                          title={lead.remarks}
                        >
                          {lead.remarks || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-gray-500">
                {total === 0
                  ? "No results"
                  : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total.toLocaleString()}`}
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? "bg-amber-500 text-white"
                          : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}
