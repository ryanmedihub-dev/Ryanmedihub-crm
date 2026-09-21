"use client";


import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { maskPhone } from "@/utils/phoneUtils";
import MultiSelect from "@/components/MultiSelect";
import useCrmData from "@/lib/useCrmData";
import { fetchAllPages } from "@/lib/exportToExcel";
import {
  Filter, X, ChevronRight, ChevronLeft,
  Eye, SquarePen, Search, Calendar,
  Download, Plus, Phone, MapPin, Users, Scissors,
} from "lucide-react";
import { formatDate as fmtDate } from "@/lib/financeUI";

const STATUS_OPTIONS =["NEW","NOT_VISITED","CONSULTED","NOT_CONVERTED","BOOKING_DONE","SURGERY_BOOKED","CLOSED"];

const STATUS_COLORS = {
  NEW:            "bg-blue-50 text-blue-700 border-blue-200",
  NOT_VISITED:    "bg-amber-50 text-amber-700 border-amber-200",
  CONSULTED:      "bg-purple-50 text-purple-700 border-purple-200",
  NOT_CONVERTED:  "bg-red-50 text-red-700 border-red-200",
  BOOKING_DONE:   "bg-teal-50 text-teal-700 border-teal-200",
  SURGERY_BOOKED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLOSED:         "bg-gray-50 text-gray-600 border-gray-200",
};

const LOCATION_OPTIONS = ["Delhi", "Mumbai", "Hyderabad", "Noida"];

const COL_DEFS = {
  visitDate:   { label: "Visit Date",    sortKey: "personal.visitDate" },
  name:        { label: "Name",          sortKey: "personal.name"      },
  phone:       { label: "Phone" },
  branch:      { label: "Branch" },
  technique:   { label: "Technique" },
  package:     { label: "Package" },
  received:    { label: "Received" },
  pending:     { label: "Pending" },
  counsellor:  { label: "Counsellor" },
  surgeryDate: { label: "Surgery Date",  sortKey: "surgery.surgeryDate" },
  reference:   { label: "Reference" },
  status:      { label: "Status" },
};

const fmtRupee = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

function DrawerSection({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center gap-2">
        <span className="text-gray-500">{icon}</span>
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function DrawerField({ label, children }) {
  return (
    <div>
      {label && <p className="text-xs font-semibold text-gray-600 mb-1.5">{label}</p>}
      {children}
    </div>
  );
}

function DSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function DDateInput({ value, onChange }) {
  return (
    <div className="relative">
      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
      />
    </div>
  );
}

export default function PatientTable({ config = {} }) {
  const {
    basePath       = "/admin/patients",
    title          = "Patients",
    subtitle       = "",
    columns        = ["visitDate","name","phone","branch","status"],
    actions        = ["view"],
    showCsvExport  = false,
    showAddButton  = false,
    addButtonHref  = "",
    defaultPageSize  = 50,
    pageSizeOptions  = [10, 25, 50, 100],
    enableSorting    = true,
    formatCurrency: useCurrency = false,
    filters: filterCfg = {},
    locationOptions = LOCATION_OPTIONS,
  } = config;

  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";

  const [filterOptions, setFOpts]   = useState({
    counsellors: [], agents: [], techniques: [],
    doctors: [], seniorTechs: [], implanters: [],
    surgeryLocations: [],
  });
const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const debounceRef = useRef(null);

  const [filters, setFilters] = useState({
    status:          searchParams.get("status")  ? [searchParams.get("status")]  : [],
    branch:          searchParams.get("branch") && searchParams.get("branch") !== "All" ? [searchParams.get("branch")] : [],
    counsellor:      [],
    agent:           [],
    technique:       [],
    surgeryDate:      searchParams.get("surgeryDate") || "",
    surgeryLocations: [],
    dateFrom:         searchParams.get("dateFrom")    || "",
    dateTo:           searchParams.get("dateTo")      || "",
    visited:          searchParams.get("visited")     === "true",
    readyForSurgery:  searchParams.get("readyForSurgery") === "true",
    doctor:           [],
    seniorTech:       [],
    implanter:        [],
    allTime:          searchParams.get("all") === "1",
  });

  const [sort, setSort]       = useState({ key: "personal.visitDate", dir: "desc" });
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(defaultPageSize);

  const handleSearch = (val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
  };

  useEffect(() => {
    fetch("/api/patients/filter-options")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFOpts((prev) => ({
            ...prev,
            counsellors: data.counsellors  || [],
            agents:      data.agents       || [],
            techniques:  data.techniques   || [],
            doctors:     data.doctors      || [],
            seniorTechs: data.seniorTechs  || [],
            implanters:  data.implanters   || [],
            surgeryLocations: data.surgeryLocations || [],
          }));
        }
      })
      .catch(() => {});
  }, []);

  const buildQuery = (overrides = {}) => {
    const p = new URLSearchParams({
      page, limit: perPage,
      sortKey: enableSorting ? sort.key : "personal.visitDate",
      sortDir: enableSorting ? sort.dir : "desc",
      ...overrides,
    });
    if (search)                          p.set("search",          search);
    if (filters.status.length)           p.set("status",          filters.status.join(","));
    if (filters.branch.length)           p.set("branch",          filters.branch.join(","));
    if (filters.counsellor.length)       p.set("counsellor",      filters.counsellor.join(","));
    if (filters.agent.length)            p.set("agent",           filters.agent.join(","));
    if (filters.technique.length)        p.set("technique",       filters.technique.join(","));
    if (filters.surgeryDate)             p.set("surgeryDate",     filters.surgeryDate);
    if (filters.surgeryLocations.length) p.set("surgeryLocations",filters.surgeryLocations.join(","));
    if (filters.dateFrom)                p.set("dateFrom",        filters.dateFrom);
    if (filters.dateTo)                  p.set("dateTo",          filters.dateTo);
    if (filters.visited)                 p.set("visited",         "true");
    if (filters.readyForSurgery)         p.set("readyForSurgery", "true");
    if (filters.doctor.length)           p.set("doctor",          filters.doctor.join(","));
    if (filters.seniorTech.length)       p.set("seniorTech",      filters.seniorTech.join(","));
    if (filters.implanter.length)        p.set("implanter",       filters.implanter.join(","));
    if (filters.allTime)                 p.set("all",             "1");
    return p.toString();
  };

  const listKey = `/api/patients/get-patient?${buildQuery()}`;
  const { data, error, isLoading, isValidating } = useCrmData(listKey);

  const patients   = data?.patients || [];
  const total      = data?.total || 0;
  const dateWindow = data?.dateWindow || null;
  const loading    = isLoading && !data;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx   = (page - 1) * perPage;
  const endIdx     = Math.min(startIdx + perPage, total);

  const applyFilter = (key, val) => { setFilters((f) => ({ ...f, [key]: val })); setPage(1); };

  const clearFilters = () => {
    setFilters({
      status: [], branch: [], counsellor: [], agent: [], technique: [],
      surgeryDate: "", surgeryLocations: [], dateFrom: "", dateTo: "",
      visited: false, readyForSurgery: false,
      doctor: [], seniorTech: [], implanter: [],
      allTime: false,
    });
    setPage(1);
  };

  const toggleSort = (key) => {
    if (!enableSorting) return;
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
    setPage(1);
  };

  const [exporting, setExporting] = useState(false);
  const exportCSV = async () => {
    setExporting(true);
    try {
      const { rows: all, truncated } = await fetchAllPages(
        (page, limit) => `/api/patients/get-patient?${buildQuery({ page, limit })}`,
        "patients",
        { limit: 500 },
      );
      if (truncated) {
        alert("Export is incomplete — too many patients match. Narrow the filters and try again.");
      }

      const headers = ["Name","Phone","Address","Branch","Visit Date","Status","Package","Received","Pending","Counsellor","Technique","Ready","Surgery Date","Reference"];
      const rows = all.map((pt) => [
        pt.personal?.name || "", maskPhone(pt.personal?.phone, userRole), pt.personal?.address || "",
        pt.personal?.branch || "",
        fmtDate(pt.personal?.visitDate), pt.ops?.status || "",
        pt.counselling?.finlpackage || pt.personal?.packageQuoted || 0,
        pt.payments?.amountReceived || 0, pt.payments?.pendingAmount || 0,
        pt.counselling?.counsellor?.name || "",
        pt.counselling?.techniqueSuggested || pt.surgery?.technique || "",
        pt.counselling?.readyForSurgery ? "Yes" : "No",
        fmtDate(pt.surgery?.surgeryDate),
        pt.personal?.reference?.name || "",
      ]);
      const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
        download: `patients-${new Date().toISOString().slice(0,10)}.csv`,
      });
      a.click();
    } catch (e) {
      alert(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const chips = [
    filters.status.length     > 0 && { k: "status",          label: `Status: ${filters.status.map(s => s.replace(/_/g," ")).join(", ")}` },
    filters.branch.length     > 0 && { k: "branch",          label: `Branch: ${filters.branch.join(", ")}` },
    filters.counsellor.length > 0 && { k: "counsellor",      label: `Counsellor: ${filters.counsellor.join(", ")}` },
    filters.agent.length      > 0 && { k: "agent",           label: `Ref: ${filters.agent.join(", ")}` },
    filters.technique.length  > 0 && { k: "technique",       label: `Technique: ${filters.technique.join(", ")}` },
    filters.surgeryDate            && { k: "surgeryDate",     label: `Surgery: ${fmtDate(filters.surgeryDate)}` },
    filters.surgeryLocations.length > 0 && { k: "surgeryLocations", label: `Location: ${filters.surgeryLocations.join(", ")}` },
    filters.dateFrom               && { k: "dateFrom",        label: `From: ${fmtDate(filters.dateFrom)}` },
    filters.dateTo                 && { k: "dateTo",          label: `To: ${fmtDate(filters.dateTo)}` },
    filters.visited                && { k: "visited",         label: "Visited Only" },
    filters.readyForSurgery        && { k: "readyForSurgery", label: "Ready for Surgery" },
    filters.doctor.length     > 0 && { k: "doctor",          label: `Doctor: ${filters.doctor.join(", ")}` },
    filters.seniorTech.length > 0 && { k: "seniorTech",      label: `Sr Tech: ${filters.seniorTech.join(", ")}` },
    filters.implanter.length  > 0 && { k: "implanter",       label: `Implanter: ${filters.implanter.join(", ")}` },
    filters.allTime                && { k: "allTime",         label: "All Time" },
  ].filter(Boolean);

  const removeChip = (k) => {
    if (k === "visited" || k === "readyForSurgery" || k === "allTime") applyFilter(k, false);
    else if (k === "surgeryDate" || k === "dateFrom" || k === "dateTo") applyFilter(k, "");
    else applyFilter(k, []);
  };

  const showDefaultWindowNotice = dateWindow?.isDefault && !filters.allTime;

  const cellContent = (col, pt) => {
    switch (col) {
      case "visitDate":
        return <span className="text-sm text-gray-500 whitespace-nowrap">{fmtDate(pt.personal?.visitDate)}</span>;
      case "name":
        return <span className="text-sm font-semibold text-gray-900">{pt.personal?.name || "Unknown"}</span>;
      case "phone":
        return (
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {maskPhone(pt.personal?.phone, userRole)}
          </span>
        );
      case "branch":
        return (
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {pt.personal?.branch}
          </span>
        );
      case "technique":
        return <span className="text-xs text-gray-500">{pt.counselling?.techniqueSuggested || pt.personal?.techniqueQuoted || "—"}</span>;
      case "package": {
        const val = pt.counselling?.finlpackage || pt.personal?.packageQuoted;
        return <span className="text-sm text-gray-700 whitespace-nowrap">{useCurrency ? fmtRupee(val) : (val || "—")}</span>;
      }
      case "received": {
        const val = pt.payments?.amountReceived;
        return <span className={`text-sm font-medium whitespace-nowrap ${useCurrency ? "text-emerald-600" : "text-gray-600"}`}>{useCurrency ? fmtRupee(val) : (val || "—")}</span>;
      }
      case "pending": {
        const val = pt.payments?.pendingAmount;
        return <span className={`text-sm font-medium whitespace-nowrap ${useCurrency ? "text-orange-500" : "text-gray-600"}`}>{useCurrency ? fmtRupee(val) : (val || "—")}</span>;
      }
      case "counsellor":
        return <span className="text-sm text-gray-600">{pt.counselling?.counsellor?.name || "—"}</span>;
      case "surgeryDate":
        return <span className="text-sm text-gray-500 whitespace-nowrap">{fmtDate(pt.surgery?.surgeryDate)}</span>;
      case "reference":
        return <span className="text-sm text-gray-600">{pt.personal?.reference?.name || "—"}</span>;
      case "status":
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${STATUS_COLORS[pt?.ops?.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
            {(pt?.ops?.status || "NEW").replace(/_/g, " ")}
          </span>
        );
      default:
        return null;
    }
  };

  if (error) return (
    <main className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-1">
        <p className="text-base font-semibold text-gray-800">Something went wrong</p>
        <p className="text-sm text-red-500">{error.message || "Error"}</p>
      </div>
    </main>
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden min-w-0">

      <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {showAddButton && addButtonHref && (
          <Link
            href={addButtonHref}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-semibold shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Patient
          </Link>
        )}
      </div>

      <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex flex-wrap items-center gap-2 shrink-0">
        <button
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-4 h-4" />
          Filters
          {chips.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold">
              {chips.length}
            </span>
          )}
        </button>

        {showDefaultWindowNotice && (
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
            <Calendar className="w-3.5 h-3.5" />
            Showing: This Month
            <button
              onClick={() => applyFilter("allTime", true)}
              className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 transition-colors"
            >
              Show all time
            </button>
          </span>
        )}

        {chips.map((chip) => (
          <button
            key={chip.k}
            onClick={() => removeChip(chip.k)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            {chip.label} <X className="w-3 h-3" />
          </button>
        ))}
        {chips.length > 0 && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        )}

        <div className="flex-1" />

        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, phone…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
          />
        </div>

        {showCsvExport && (
          <button
            onClick={exportCSV}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Export CSV"
          >
            <Download className={`w-4 h-4 ${exporting ? "animate-bounce" : ""}`} />
            <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export"}</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" />
            </div>
          ) : (
            <div
              className={`overflow-x-auto transition-opacity duration-150 ${
                isValidating ? "opacity-60" : "opacity-100"
              }`}
            >
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {columns.map((col) => {
                      const def     = COL_DEFS[col] || { label: col };
                      const sortable = enableSorting && !!def.sortKey;
                      const active   = sortable && sort.key === def.sortKey;
                      return (
                        <th
                          key={col}
                          onClick={sortable ? () => toggleSort(def.sortKey) : undefined}
                          className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${sortable ? "cursor-pointer select-none hover:bg-gray-100" : ""}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {def.label}
                            {active && <span className="text-[10px] text-gray-400">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                          </span>
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {patients.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Search className="w-10 h-10 text-gray-300" />
                          <p className="text-sm font-semibold text-gray-600">No patients found</p>
                          <p className="text-xs text-gray-400">Try adjusting your search or filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : patients.map((pt) => (
                    <tr key={pt._id} className="hover:bg-gray-50/70 transition-colors">
                      {columns.map((col) => (
                        <td key={col} className="px-4 py-3.5">
                          {cellContent(col, pt)}
                        </td>
                      ))}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {actions.includes("view") && (
                            <button
                              onClick={() => window.open(`${basePath}/${pt._id}`, "_blank", "noopener,noreferrer")}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                          )}
                          {actions.includes("edit") && (
                            <Link
                              href={`${basePath}/edit/${pt._id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                            >
                              <SquarePen className="w-3.5 h-3.5" /> Edit
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Rows per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
              >
                {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">
                {total === 0 ? 0 : startIdx + 1}–{endIdx} of{" "}
                <span className="font-semibold text-gray-700">{total}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-xs text-gray-600 min-w-14 text-center font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">

            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">Advanced Filters</h3>
                <p className="text-xs text-gray-500 mt-0.5">Refine your patient list</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              <DrawerSection title="Basic" icon={<Filter className="w-4 h-4" />}>
                <DrawerField label="Status">
                  <MultiSelect
                    values={filters.status}
                    onChange={(v) => applyFilter("status", v)}
                    placeholder="All Statuses"
                    options={STATUS_OPTIONS.map((s) => ({ label: s.replace(/_/g, " "), value: s }))}
                  />
                </DrawerField>
                <DrawerField label="Branch">
                  <MultiSelect
                    values={filters.branch}
                    onChange={(v) => applyFilter("branch", v)}
                    placeholder="All Branches"
                    options={locationOptions.map((l) => ({ label: l, value: l }))}
                  />
                </DrawerField>
                <div className="grid grid-cols-2 gap-3">
                  <DrawerField label="Date From">
                    <DDateInput value={filters.dateFrom} onChange={(v) => applyFilter("dateFrom", v)} />
                  </DrawerField>
                  <DrawerField label="Date To">
                    <DDateInput value={filters.dateTo} onChange={(v) => applyFilter("dateTo", v)} />
                  </DrawerField>
                </div>
              </DrawerSection>

              <DrawerSection title="Staff & Team" icon={<Users className="w-4 h-4" />}>
                <DrawerField label="Counsellor">
                  <MultiSelect
                    values={filters.counsellor}
                    onChange={(v) => applyFilter("counsellor", v)}
                    placeholder="All Counsellors"
                    options={filterOptions.counsellors.map((c) => ({ label: c, value: c }))}
                  />
                </DrawerField>
                <DrawerField label="Reference (Agent)">
                  <MultiSelect
                    values={filters.agent}
                    onChange={(v) => applyFilter("agent", v)}
                    placeholder="All References"
                    options={filterOptions.agents.map((a) => ({ label: a, value: a }))}
                  />
                </DrawerField>
                {(filterCfg.showDoctor || filterCfg.showSeniorTech) && (
                  <div className="grid grid-cols-2 gap-3">
                    {filterCfg.showDoctor && (
                      <DrawerField label="Doctor">
                        <MultiSelect
                          values={filters.doctor}
                          onChange={(v) => applyFilter("doctor", v)}
                          placeholder="All Doctors"
                          options={filterOptions.doctors.map((d) => ({ label: d, value: d }))}
                        />
                      </DrawerField>
                    )}
                    {filterCfg.showSeniorTech && (
                      <DrawerField label="Senior Tech">
                        <MultiSelect
                          values={filters.seniorTech}
                          onChange={(v) => applyFilter("seniorTech", v)}
                          placeholder="All Techs"
                          options={filterOptions.seniorTechs.map((t) => ({ label: t, value: t }))}
                        />
                      </DrawerField>
                    )}
                  </div>
                )}
                {filterCfg.showImplanter && (
                  <DrawerField label="Implanter">
                    <MultiSelect
                      values={filters.implanter}
                      onChange={(v) => applyFilter("implanter", v)}
                      placeholder="All Implanters"
                      options={filterOptions.implanters.map((i) => ({ label: i, value: i }))}
                    />
                  </DrawerField>
                )}
              </DrawerSection>

              <DrawerSection title="Surgery Details" icon={<Scissors className="w-4 h-4" />}>
                <DrawerField label="Technique">
                  <MultiSelect
                    values={filters.technique}
                    onChange={(v) => applyFilter("technique", v)}
                    placeholder="All Techniques"
                    options={filterOptions.techniques.map((t) => ({ label: t, value: t }))}
                  />
                </DrawerField>
                {filterCfg.showSurgeryDate && (
                  <DrawerField label="Surgery Date">
                    <DDateInput value={filters.surgeryDate} onChange={(v) => applyFilter("surgeryDate", v)} />
                  </DrawerField>
                )}
                {filterCfg.showSurgeryLocation && filterOptions.surgeryLocations.length > 0 && (
                  <DrawerField label="Surgery Location">
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                      {filterOptions.surgeryLocations.map((loc) => (
                        <label key={loc} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={filters.surgeryLocations.includes(loc)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...filters.surgeryLocations, loc]
                                : filters.surgeryLocations.filter((l) => l !== loc);
                              applyFilter("surgeryLocations", next);
                            }}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-700">{loc}</span>
                        </label>
                      ))}
                    </div>
                    {filters.surgeryLocations.length > 0 && (
                      <button onClick={() => applyFilter("surgeryLocations", [])} className="mt-1.5 text-xs text-red-500 hover:text-red-600 transition-colors">
                        Clear selection
                      </button>
                    )}
                  </DrawerField>
                )}
                {(filterCfg.showVisited || filterCfg.showReadyForSurgery) && (
                  <div className="space-y-2 pt-1">
                    {filterCfg.showVisited && (
                      <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={filters.visited}
                          onChange={(e) => applyFilter("visited", e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Visited Patients Only</span>
                      </label>
                    )}
                    {filterCfg.showReadyForSurgery && (
                      <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={filters.readyForSurgery}
                          onChange={(e) => applyFilter("readyForSurgery", e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Ready for Surgery Only</span>
                      </label>
                    )}
                  </div>
                )}
              </DrawerSection>
            </div>

            <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 shrink-0">
              <button
                onClick={() => { clearFilters(); setDrawerOpen(false); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors"
              >
                Reset All
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
