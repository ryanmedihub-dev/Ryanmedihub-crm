"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { maskPhone } from "@/utils/phoneUtils";
import MultiSelect from "@/components/MultiSelect";
import {
  Filter,
  X,
  ChevronRight,
  ChevronLeft,
  Search,
  Calendar,
  LogOut,
} from "lucide-react";

const STATUS_OPTIONS = [
  "NEW",
  "NOT_VISITED",
  "CONSULTED",
  "NOT_CONVERTED",
  "SURGERY_BOOKED",
  "CLOSED",
];

const STATUS_COLORS = {
  NEW: "bg-blue-100 text-blue-800",
  NOT_VISITED: "bg-amber-100 text-amber-800",
  CONSULTED: "bg-purple-100 text-purple-800",
  NOT_CONVERTED: "bg-red-100 text-red-800",
  SURGERY_BOOKED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

const LOCATION_OPTIONS = ["Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon"];

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "N/A";

function PatientDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";

  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState({
    counsellors: [],
    agents: [],
    techniques: [],
  });
  const optionsLoaded = useRef(false);

  useEffect(() => {
    fetch("/api/patients/filter-options")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFilterOptions((prev) => ({
            ...prev,
            counsellors: data.counsellors || [],
            agents:      data.agents      || [],
            techniques:  data.techniques  || [],
          }));
        }
      })
      .catch(() => {});
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef(null);

  const [filters, setFilters] = useState({
    status:     searchParams.get("status")     ? [searchParams.get("status")]     : [],
    branch:     searchParams.get("branch") && searchParams.get("branch") !== "All" ? [searchParams.get("branch")] : [],
    counsellor: searchParams.get("counsellor") ? [searchParams.get("counsellor")] : [],
    agent:      [],
    technique:  [],
    surgeryDate: searchParams.get("surgeryDate") || "",
    dateFrom:    searchParams.get("dateFrom")    || "",
    dateTo:      searchParams.get("dateTo")      || "",
    visited:         searchParams.get("visited")          === "true",
    readyForSurgery: searchParams.get("readyForSurgery")  === "true",
  });

  const [sort, setSort] = useState({ key: "personal.visitDate", dir: "desc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const handleSearchInput = (val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page,
          limit: perPage,
          sortKey: sort.key,
          sortDir: sort.dir,
        });
        if (search)                    params.set("search",          search);
        if (filters.status.length)     params.set("status",          filters.status.join(","));
        if (filters.branch.length)     params.set("branch",          filters.branch.join(","));
        if (filters.counsellor.length) params.set("counsellor",      filters.counsellor.join(","));
        if (filters.agent.length)      params.set("agent",           filters.agent.join(","));
        if (filters.technique.length)  params.set("technique",       filters.technique.join(","));
        if (filters.surgeryDate)       params.set("surgeryDate",     filters.surgeryDate);
        if (filters.dateFrom)          params.set("dateFrom",        filters.dateFrom);
        if (filters.dateTo)            params.set("dateTo",          filters.dateTo);
        if (filters.visited)           params.set("visited",         "true");
        if (filters.readyForSurgery)   params.set("readyForSurgery", "true");

        const res = await fetch(`/api/patients/get-patient?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch patient data");
        const data = await res.json();
        if (cancelled) return;

        setPatients(data.patients || []);
        setTotal(data.total || 0);

        if (!optionsLoaded.current && data.filterOptions) {
          setFilterOptions(data.filterOptions);
          optionsLoaded.current = true;
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [page, perPage, sort, search, filters]);

  const pages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = (page - 1) * perPage;
  const endIdx = Math.min(startIdx + perPage, total);

  const applyFilter = (key, val) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      status: [],
      branch: [],
      counsellor: [],
      agent: [],
      technique: [],
      surgeryDate: "",
      dateFrom: "",
      dateTo: "",
      visited: false,
      readyForSurgery: false,
    });
    setPage(1);
  };

  const toggleSort = (key) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
    setPage(1);
  };

  const activeFilterChips = [];
  if (filters.status.length)     activeFilterChips.push({ k: "status",     label: `Status: ${filters.status.map(s => s.replace(/_/g," ")).join(", ")}` });
  if (filters.branch.length)     activeFilterChips.push({ k: "branch",     label: `Branch: ${filters.branch.join(", ")}` });
  if (filters.counsellor.length) activeFilterChips.push({ k: "counsellor", label: `Counsellor: ${filters.counsellor.join(", ")}` });
  if (filters.agent.length)      activeFilterChips.push({ k: "agent",      label: `Reference: ${filters.agent.join(", ")}` });
  if (filters.technique.length)  activeFilterChips.push({ k: "technique",  label: `Technique: ${filters.technique.join(", ")}` });
  if (filters.surgeryDate)       activeFilterChips.push({ k: "surgeryDate",label: `Surgery: ${formatDate(filters.surgeryDate)}` });
  if (filters.dateFrom)          activeFilterChips.push({ k: "dateFrom",   label: `From: ${formatDate(filters.dateFrom)}` });
  if (filters.dateTo)            activeFilterChips.push({ k: "dateTo",     label: `To: ${formatDate(filters.dateTo)}` });
  if (filters.visited)           activeFilterChips.push({ k: "visited",    label: "Visited Patients" });
  if (filters.readyForSurgery)   activeFilterChips.push({ k: "readyForSurgery", label: "Ready for Surgery" });

  const removeChip = (k) => {
    if (k === "visited" || k === "readyForSurgery") applyFilter(k, false);
    else if (k === "surgeryDate" || k === "dateFrom" || k === "dateTo") applyFilter(k, "");
    else applyFilter(k, []);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (error)
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        {error}
      </div>
    );

  return (
    <div className="">
      <main className="flex-1 flex flex-col px-24">
        <header className="bg-white sticky top-0 z-10">
          <div className="py-3 mt-4">
            <h1 className="text-3xl underline pl-6 font-semibold">
              All Patients Data
            </h1>
          </div>

          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <div className="relative w-100">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search patients by name, phone, or email…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
                  value={searchInput}
                  onChange={(e) => handleSearchInput(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white shadow-sm hover:bg-gray-50 text-gray-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterChips.length > 0 && (
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                    {activeFilterChips.length}
                  </span>
                )}
              </button>

              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="px-6 pb-3 flex flex-wrap gap-2">
              {activeFilterChips.map((c) => (
                <span
                  key={c.k}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium border border-indigo-200"
                >
                  {c.label}
                  <button
                    onClick={() => removeChip(c.k)}
                    className="hover:text-indigo-900 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="text-sm text-gray-600 hover:text-gray-900 underline transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </header>

        <section className="p-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                    <tr>
                      <Th label="Patient" />
                      <Th label="Contact" />
                      <Th label="Branch" />
                      <Th
                        label="Visit Date"
                        sortKey="personal.visitDate"
                        sort={sort}
                        onSort={toggleSort}
                      />
                      <Th label="Status" />
                      <Th label="Package" />
                      <Th label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {patients.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-12 text-center text-gray-500"
                        >
                          <div className="flex flex-col items-center justify-center">
                            <Search className="w-12 h-12 text-gray-300 mb-4" />
                            <p className="text-lg font-medium text-gray-900 mb-2">
                              No patients found
                            </p>
                            <p className="text-gray-500">
                              Try adjusting your search or filters
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      patients.map((p) => (
                        <tr
                          key={p._id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 font-medium text-gray-900">
                            {p.personal?.name}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {maskPhone(p.personal?.phone, userRole)}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {p.personal?.branch}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {formatDate(p.personal?.visitDate)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                STATUS_COLORS[p?.ops?.status] ||
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {p?.ops?.status?.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {p.personal?.packageQuoted}
                          </td>

                          <td className="px-6 py-4">
                            <div className="space-x-2">
                              <Link
                                href={`/counsellor/patients/edit/${p._id}`}
                                className="p-2 rounded-lg flex hover:bg-blue-50 text-blue-600 transition-colors"
                                title="Edit patient"
                                target="_blank"
                              >
                                Update &nbsp;
                                <Edit className="w-6 h-6" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing <b>{total === 0 ? 0 : startIdx + 1}</b>–<b>{endIdx}</b>{" "}
                of <b>{total}</b> patients
              </p>
              <div className="flex items-center gap-3">
                <select
                  className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 w-16 text-center">
                    {page} / {pages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page >= pages}
                    className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {drawerOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col">
              <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Filters
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Refine your patient search
                  </p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">
                  <Section
                    title="Basic Filters"
                    icon={<Filter className="w-4 h-4" />}
                  >
                    <Field label="Status">
                      <MultiSelect
                        values={filters.status}
                        onChange={(v) => applyFilter("status", v)}
                        placeholder="All Statuses"
                        options={STATUS_OPTIONS.map((s) => ({ label: s.replace(/_/g, " "), value: s }))}
                      />
                    </Field>
                    <Field label="Branch">
                      <MultiSelect
                        values={filters.branch}
                        onChange={(v) => applyFilter("branch", v)}
                        placeholder="All Branches"
                        options={LOCATION_OPTIONS.map((l) => ({ label: l, value: l }))}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Date From">
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            type="date"
                            value={filters.dateFrom}
                            onChange={(v) => applyFilter("dateFrom", v)}
                            className="pl-10"
                          />
                        </div>
                      </Field>
                      <Field label="Date To">
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            type="date"
                            value={filters.dateTo}
                            onChange={(v) => applyFilter("dateTo", v)}
                            className="pl-10"
                          />
                        </div>
                      </Field>
                    </div>
                  </Section>

                  <Section
                    title="Staff & Team"
                    icon={<Users className="w-4 h-4" />}
                  >
                    <Field label="Counsellor">
                      <MultiSelect
                        values={filters.counsellor}
                        onChange={(v) => applyFilter("counsellor", v)}
                        placeholder="All Counsellors"
                        options={filterOptions.counsellors.map((c) => ({ label: c, value: c }))}
                      />
                    </Field>
                    <Field label="Reference">
                      <MultiSelect
                        values={filters.agent}
                        onChange={(v) => applyFilter("agent", v)}
                        placeholder="All References"
                        options={filterOptions.agents.map((a) => ({
                            label: a,
                            value: a,
                          }))}
                      />
                    </Field>
                  </Section>

                  <Section
                    title="Surgery Details"
                    icon={<Scissors className="w-4 h-4" />}
                  >
                    <Field label="Technique">
                      <MultiSelect
                        values={filters.technique}
                        onChange={(v) => applyFilter("technique", v)}
                        placeholder="All Techniques"
                        options={filterOptions.techniques.map((t) => ({ label: t, value: t }))}
                      />
                    </Field>

                    <Field label="Surgery Date">
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          type="date"
                          value={filters.surgeryDate}
                          onChange={(v) => applyFilter("surgeryDate", v)}
                          className="pl-10"
                        />
                      </div>
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="">
                        <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={filters.visited}
                            onChange={(e) =>
                              applyFilter("visited", e.target.checked)
                            }
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            Visited Patients
                          </span>
                        </label>
                      </Field>
                      <Field label="">
                        <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={filters.readyForSurgery}
                            onChange={(e) =>
                              applyFilter("readyForSurgery", e.target.checked)
                            }
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            Ready for Surgery
                          </span>
                        </label>
                      </Field>
                    </div>
                  </Section>
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between gap-3">
                <button
                  onClick={() => { clearFilters(); setDrawerOpen(false); }}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  Reset All
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PatientDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-gray-50">
          <main className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
          </main>
        </div>
      }
    >
      <PatientDashboardContent />
    </Suspense>
  );
}

function Th({ label, sortKey, sort, onSort }) {
  const isSortable = !!sortKey;
  const active = isSortable && sort?.key === sortKey;
  return (
    <th
      className={`px-6 py-3 text-left font-medium ${
        isSortable ? "cursor-pointer select-none hover:bg-gray-100" : ""
      }`}
      onClick={isSortable ? () => onSort(sortKey) : undefined}
    >
      <div className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="text-[10px] text-gray-500">
            {sort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </div>
    </th>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="p-4 grid grid-cols-1 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

function Input({ type = "text", value, onChange, placeholder, className = "" }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors ${className}`}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors bg-white"
    >
      {options.map((o) => (
        <option key={`${o.label}-${o.value}`} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const Edit = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15.828H9v-2.828z"
    />
  </svg>
);

const Users = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
    />
  </svg>
);

const Scissors = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
    />
  </svg>
);
