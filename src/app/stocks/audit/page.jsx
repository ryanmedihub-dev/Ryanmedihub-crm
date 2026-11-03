"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ClipboardList, Download, RefreshCw, Search, ChevronDown, ChevronUp,
  Store, Users, MapPin, Package, AlertCircle, ArrowRight,
  Filter, RotateCcw, Check, Calendar, X,
} from "lucide-react";
import StockSidebar from "@/components/Sidebars/StockSidebar";
import {
  Page, Card, Stats, Status, Btn, DataTable, Empty, Row,
  inr, num, when, day, td, tr, th,
} from "@/components/stocks/ui";

const BRANCHES = ["All", "Delhi", "Mumbai", "Hyderabad", "Noida"];

const EVENT_LABELS = {
  PURCHASE: { tone: "neutral", label: "Purchase" },
  SALE:     { tone: "ok",      label: "Sale" },
  TRANSFER: { tone: "low",     label: "Transfer" },
};

function EventType({ type, direction }) {
  const cfg = EVENT_LABELS[type] || EVENT_LABELS.PURCHASE;
  return (
    <Status tone={cfg.tone}>
      {type === "TRANSFER" ? `Transfer ${direction === "OUT" ? "out" : "in"}` : cfg.label}
    </Status>
  );
}

function Party({ party }) {
  const Icon = party?.type === "location" ? MapPin : party?.type === "vendor" ? Store : Users;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-700">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      {party?.name || "—"}
      {party?.phone && <span className="text-xs text-slate-400">{party.phone}</span>}
    </span>
  );
}

function Profit({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  return (
    <span className={`font-medium tabular-nums ${value >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
      {value < 0 && "−"}{inr(Math.abs(value))}
    </span>
  );
}

function toDateStr(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayStr}`;
}

const PRESETS = [
  {
    label: "Today",
    getRange: () => {
      const today = toDateStr(new Date());
      return { from: today, to: today };
    },
  },
  {
    label: "Yesterday",
    getRange: () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = toDateStr(y);
      return { from: yStr, to: yStr };
    },
  },
  {
    label: "Last 7 days",
    getRange: () => {
      const to = toDateStr(new Date());
      const f = new Date();
      f.setDate(f.getDate() - 6);
      return { from: toDateStr(f), to };
    },
  },
  {
    label: "Last 30 days",
    getRange: () => {
      const to = toDateStr(new Date());
      const f = new Date();
      f.setDate(f.getDate() - 29);
      return { from: toDateStr(f), to };
    },
  },
  {
    label: "This month",
    getRange: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateStr(first), to: toDateStr(now) };
    },
  },
  {
    label: "Last month",
    getRange: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateStr(first), to: toDateStr(last) };
    },
  },
  {
    label: "This year",
    getRange: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: toDateStr(first), to: toDateStr(now) };
    },
  },
];

const filterInput =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15 disabled:bg-slate-50 disabled:text-slate-400";
const filterSelect =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400";
const filterLabel = "mb-1.5 block text-xs font-medium text-slate-600";

export default function StockAuditPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [stockSummaries, setStockSummaries] = useState([]);

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");
  const [eventType, setEventType] = useState("ALL");
  const [dateRange, setDateRange] = useState("All time");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");

  const [activeTab, setActiveTab] = useState("events");
  const [expanded, setExpanded] = useState({});
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const isAdmin = ["admin", "super-admin"].includes(session?.user?.role);
  const userBranch = session?.user?.branch;
  const branchRestricted = !isAdmin && !!userBranch;

  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    location: "All",
    eventType: "ALL",
    from: "",
    to: "",
    vendor: "",
    product: "",
    patient: "",
  });

  useEffect(() => {
    if (branchRestricted && userBranch) {
      setLocation(userBranch);
      setAppliedFilters((prev) => ({ ...prev, location: userBranch }));
      fetchAudit({ location: userBranch, eventType: "ALL", from: "", to: "" });
    }
  }, [branchRestricted, userBranch]);

  const fetchAudit = async (overrideParams = null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const loc = overrideParams?.location ?? appliedFilters.location;
      const evType = overrideParams?.eventType ?? appliedFilters.eventType;
      const f = overrideParams?.from ?? appliedFilters.from;
      const t = overrideParams?.to ?? appliedFilters.to;

      if (loc && loc !== "All") params.set("location", loc);
      if (evType && evType !== "ALL") params.set("eventType", evType);
      if (f) params.set("from", f);
      if (t) params.set("to", t);

      const res = await fetch(`/api/stocks/audit?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSummary(data.summary);
      setEvents(data.events || []);
      setStockSummaries(data.stockSummaries || []);
    } catch (err) {
      setError(err.message || "Could not load the audit");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  const vendorOptions = useMemo(() => {
    const set = new Set();
    events.forEach((e) => {
      if (e.party?.type === "vendor" && e.party?.name) {
        set.add(e.party.name);
      }
    });
    return Array.from(set).sort();
  }, [events]);

  const productOptions = useMemo(() => {
    const set = new Set();
    stockSummaries.forEach((s) => {
      if (s.name) set.add(s.name);
    });
    events.forEach((e) => {
      if (e.stockName) set.add(e.stockName);
    });
    return Array.from(set).sort();
  }, [stockSummaries, events]);

  const patientOptions = useMemo(() => {
    const set = new Set();
    events.forEach((e) => {
      if (e.party?.type === "patient" && e.party?.name) {
        set.add(e.party.name);
      }
    });
    return Array.from(set).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    let arr = [...events];
    const q = (appliedFilters.search || "").toLowerCase();
    if (q) {
      arr = arr.filter((e) =>
        e.stockName?.toLowerCase().includes(q) ||
        e.party?.name?.toLowerCase().includes(q) ||
        e.by?.name?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q)
      );
    }
    if (appliedFilters.eventType !== "ALL") {
      arr = arr.filter((e) => e.type === appliedFilters.eventType);
    }
    if (appliedFilters.vendor) {
      arr = arr.filter((e) => e.party?.type === "vendor" && e.party?.name === appliedFilters.vendor);
    }
    if (appliedFilters.product) {
      arr = arr.filter((e) => e.stockName === appliedFilters.product);
    }
    if (appliedFilters.patient) {
      arr = arr.filter((e) => e.party?.type === "patient" && e.party?.name === appliedFilters.patient);
    }

    arr.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === "date") { va = new Date(va || 0); vb = new Date(vb || 0); }
      if (sortField === "totalAmount") { va = va || 0; vb = vb || 0; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [events, appliedFilters, sortField, sortDir]);

  const filteredSummaries = useMemo(() => {
    let list = stockSummaries;
    const q = (appliedFilters.search || "").toLowerCase();
    if (q) {
      list = list.filter((s) =>
        s.name?.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q)
      );
    }
    if (appliedFilters.product) {
      list = list.filter((s) => s.name === appliedFilters.product);
    }
    return list;
  }, [stockSummaries, appliedFilters.search, appliedFilters.product]);

  const activeSummary = useMemo(() => {
    if (!summary) return null;
    const hasClientFilter = Boolean(
      appliedFilters.search ||
      appliedFilters.vendor ||
      appliedFilters.product ||
      appliedFilters.patient
    );
    if (!hasClientFilter) {
      return summary;
    }
    let rev = 0, cost = 0, profit = 0, sold = 0;
    filteredEvents.forEach((e) => {
      if (e.type === "SALE") {
        sold += e.quantity || 0;
        rev += e.totalAmount || 0;
        profit += e.profit || 0;
      } else if (e.type === "PURCHASE") {
        cost += e.totalAmount || 0;
      }
    });
    return {
      totalRevenue: rev,
      totalCost: cost,
      totalProfit: profit,
      unitsSold: sold,
    };
  }, [summary, filteredEvents, appliedFilters]);

  const counts = useMemo(() => ({
    purchases: filteredEvents.filter((e) => e.type === "PURCHASE").length,
    sales:     filteredEvents.filter((e) => e.type === "SALE").length,
    transfers: filteredEvents.filter((e) => e.type === "TRANSFER").length,
  }), [filteredEvents]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const sortMark = (field) =>
    sortField === field
      ? sortDir === "asc"
        ? <ChevronUp className="ml-1 inline h-3 w-3" />
        : <ChevronDown className="ml-1 inline h-3 w-3" />
      : null;

  const handlePresetSelect = (preset) => {
    const { from: newFrom, to: newTo } = preset.getRange();
    setDateRange(preset.label);
    setFrom(newFrom);
    setTo(newTo);
  };

  const handleDropdownRangeChange = (val) => {
    setDateRange(val);
    if (val === "All time") {
      setFrom("");
      setTo("");
    } else {
      const found = PRESETS.find((p) => p.label === val);
      if (found) {
        const { from: newFrom, to: newTo } = found.getRange();
        setFrom(newFrom);
        setTo(newTo);
      }
    }
  };

  const handleFromChange = (val) => {
    setFrom(val);
    setDateRange("Custom");
  };

  const handleToChange = (val) => {
    setTo(val);
    setDateRange("Custom");
  };

  const handleReset = () => {
    const defaultLoc = branchRestricted ? userBranch : "All";
    setSearch("");
    setLocation(defaultLoc);
    setEventType("ALL");
    setFrom("");
    setTo("");
    setDateRange("All time");
    setSelectedVendor("");
    setSelectedProduct("");
    setSelectedPatient("");

    const resetApplied = {
      search: "",
      location: defaultLoc,
      eventType: "ALL",
      from: "",
      to: "",
      vendor: "",
      product: "",
      patient: "",
    };
    setAppliedFilters(resetApplied);
    fetchAudit({ location: defaultLoc, eventType: "ALL", from: "", to: "" });
  };

  const handleApply = () => {
    const newApplied = {
      search: search.trim(),
      location,
      eventType,
      from,
      to,
      vendor: selectedVendor,
      product: selectedProduct,
      patient: selectedPatient,
    };
    setAppliedFilters(newApplied);
    fetchAudit({ location, eventType, from, to });
  };

  const exportExcel = async () => {
    const { utils, writeFile } = await import("xlsx");

    const evRows = filteredEvents.map((e) => ({
      "Date":           when(e.date),
      "Type":           e.type === "TRANSFER" ? `TRANSFER ${e.direction}` : e.type,
      "Stock Name":     e.stockName,
      "Location":       e.location,
      "Party":          e.party?.name || "—",
      "Party Type":     e.party?.type === "location" ? "Location" : e.party?.type === "vendor" ? "Vendor" : "Patient",
      "Quantity":       e.quantity,
      "Unit Price":     e.type === "TRANSFER" ? "" : e.unitPrice,
      "Total Amount":   e.type === "TRANSFER" ? "" : e.totalAmount,
      "Purchase Cost":  e.type === "SALE" ? (e.totalCost || 0) : "",
      "Profit/Loss":    e.profit !== null ? e.profit : "",
      "Discount":       e.discount || "",
      "Payment Method": e.method || "",
      "Remarks":        e.remarks || "",
      "Recorded By":    e.by?.name || "—",
      "By Branch":      e.by?.branch || "—",
    }));

    const ws = utils.json_to_sheet(evRows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 25 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 22 }, { wch: 20 }, { wch: 12 },
    ];

    const sumRows = filteredSummaries.map((s) => ({
      "Stock Name":        s.name,
      "Location":          s.location,
      "Current Qty":       s.currentQty,
      "MRP":               s.mrp,
      "Purchase Rate":     s.purchaseAmt,
      "Units Purchased":   s.unitsPurchased,
      "Units Sold":        s.unitsSold,
      "Units Transferred In":  s.unitsTransferredIn  || 0,
      "Units Transferred Out": s.unitsTransferredOut || 0,
      "Total Revenue":     s.totalRevenue,
      "Total Cost":        s.totalCost,
      "Gross Profit":      s.totalProfit,
    }));
    const wsSum = utils.json_to_sheet(sumRows);
    wsSum["!cols"] = [
      { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
      { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Audit Events");
    utils.book_append_sheet(wb, wsSum, "Stock Summary");
    writeFile(wb, `stock_audit_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Page
      sidebar={StockSidebar}
      section="Audit"
      title="Stock audit"
      lead="Every purchase, sale and transfer, with profit per product"
      wide
      actions={
        <>
          <Btn icon={RefreshCw} onClick={() => fetchAudit()} disabled={loading}>Refresh</Btn>
          <Btn variant="primary" icon={Download} onClick={exportExcel} disabled={!filteredEvents.length}>
            Export
          </Btn>
        </>
      }
    >
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {activeSummary && (
        <Stats
          items={[
            { label: "Revenue",       value: inr(activeSummary.totalRevenue) },
            { label: "Cost of stock", value: inr(activeSummary.totalCost) },
            { label: "Gross profit",  value: inr(activeSummary.totalProfit), tone: activeSummary.totalProfit < 0 ? "rose" : undefined },
            { label: "Units sold",    value: num(activeSummary.unitsSold) },
          ]}
        />
      )}

      {/* Redesigned Filter Card */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Filter Card Header */}
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">Filters</h2>
              <p className="text-xs text-slate-500">Search and filter stock movements</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#00845A] px-4 text-xs font-medium text-white shadow-xs transition-colors hover:bg-[#00704c] disabled:opacity-60 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              Apply filters
            </button>
          </div>
        </div>

        {/* Filter Card Body */}
        <div className="space-y-4 p-5 sm:p-6">
          {/* Row 1: Search, Event type, Branch */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <label htmlFor="audit-search" className={filterLabel}>Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="audit-search"
                  type="text"
                  placeholder="Search product, vendor, patient or branch..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApply();
                    }
                  }}
                  className={`${filterInput} pl-10 pr-9`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      if (appliedFilters.search) {
                        setAppliedFilters((prev) => ({ ...prev, search: "" }));
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-3">
              <label htmlFor="audit-event-type" className={filterLabel}>Event type</label>
              <select
                id="audit-event-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className={filterSelect}
              >
                <option value="ALL">All events</option>
                <option value="PURCHASE">Purchases</option>
                <option value="SALE">Sales</option>
                <option value="TRANSFER">Transfers</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label htmlFor="audit-branch" className={filterLabel}>Branch</label>
              <select
                id="audit-branch"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={branchRestricted}
                className={filterSelect}
              >
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b === "All" ? "All branches" : b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Date range, From date, To date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="audit-date-range" className={filterLabel}>Date range</label>
              <select
                id="audit-date-range"
                value={dateRange}
                onChange={(e) => handleDropdownRangeChange(e.target.value)}
                className={filterSelect}
              >
                <option value="All time">All time</option>
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div>
              <label htmlFor="audit-from-date" className={filterLabel}>From date</label>
              <input
                id="audit-from-date"
                type="date"
                value={from}
                onChange={(e) => handleFromChange(e.target.value)}
                className={filterInput}
              />
            </div>

            <div>
              <label htmlFor="audit-to-date" className={filterLabel}>To date</label>
              <input
                id="audit-to-date"
                type="date"
                value={to}
                onChange={(e) => handleToChange(e.target.value)}
                className={filterInput}
              />
            </div>
          </div>

          {/* Row 3: Vendor, Product, Patient */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="audit-vendor" className={filterLabel}>Vendor</label>
              <select
                id="audit-vendor"
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className={filterSelect}
              >
                <option value="">All vendors</option>
                {vendorOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="audit-product" className={filterLabel}>Product</label>
              <select
                id="audit-product"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className={filterSelect}
              >
                <option value="">All products</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="audit-patient" className={filterLabel}>Patient</label>
              <select
                id="audit-patient"
                value={selectedPatient}
                onChange={(e) => setSelectedPatient(e.target.value)}
                className={filterSelect}
              >
                <option value="">All patients</option>
                {patientOptions.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Filters Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Quick filters:
            </span>
            {PRESETS.map((p) => {
              const active = dateRange === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePresetSelect(p)}
                  className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? "border border-blue-400 bg-blue-50 text-blue-700 shadow-2xs font-semibold"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {[
          { id: "events", label: "Timeline" },
          { id: "stocks", label: "By product" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.id ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "events" && (
        <Card
          flush
          title={loading ? "Events" : `${num(filteredEvents.length)} events`}
          note={
            loading
              ? null
              : `${num(counts.purchases)} purchases, ${num(counts.sales)} sales, ${num(counts.transfers)} transfers`
          }
        >
          <DataTable
            minWidth={1080}
            loading={loading && "Loading audit"}
            head={[
              { label: "Date", onClick: () => toggleSort("date"), sortMark: sortMark("date") },
              "Type",
              { label: "Product", onClick: () => toggleSort("stockName"), sortMark: sortMark("stockName") },
              "Branch",
              "Party",
              { label: "Qty", align: "right" },
              { label: "Unit price", align: "right" },
              { label: "Total", align: "right", onClick: () => toggleSort("totalAmount"), sortMark: sortMark("totalAmount") },
              { label: "Cost", align: "right" },
              { label: "Profit", align: "right" },
              "By",
            ]}
            empty={
              filteredEvents.length === 0 ? (
                <Empty
                  icon={ClipboardList}
                  title="No audit events found"
                  hint="Try widening the search, clearing filters or changing the date range."
                />
              ) : null
            }
          >
            {filteredEvents.map((e, i) => {
              const rowKey = `${e.stockId}-${e.date}-${i}`;
              const isExpanded = !!expanded[rowKey];
              const hasDetails = e.remarks || e.discount || e.method || e.transactionId || (e.by && (e.by.email || e.by.branch));

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={`${tr} ${hasDetails ? "cursor-pointer" : ""}`}
                    onClick={() => hasDetails && setExpanded((p) => ({ ...p, [rowKey]: !p[rowKey] }))}
                  >
                    <td className={`${td} whitespace-nowrap text-slate-500`}>{when(e.date)}</td>
                    <td className={td}><EventType type={e.type} direction={e.direction} /></td>
                    <td className={`${td} font-medium text-slate-900`}>{e.stockName}</td>
                    <td className={`${td} text-slate-600`}>{e.location}</td>
                    <td className={td}><Party party={e.party} /></td>
                    <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>{num(e.quantity)}</td>
                    <td className={`${td} text-right tabular-nums text-slate-600`}>
                      {e.type === "TRANSFER" ? <span className="text-slate-300">—</span> : inr(e.unitPrice)}
                    </td>
                    <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>
                      {e.type === "TRANSFER" ? <span className="text-slate-300">—</span> : inr(e.totalAmount)}
                    </td>
                    <td className={`${td} text-right tabular-nums text-slate-500`}>
                      {e.type === "SALE" ? inr(e.totalCost || 0) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`${td} text-right`}>
                      {e.type === "SALE" ? <Profit value={e.profit} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate-500`}>
                      <span className="flex items-center gap-1.5">
                        {e.by?.name || "—"}
                        {hasDetails && (
                          <span className="text-slate-300">
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-slate-50/80">
                      <td colSpan={11} className="px-6 py-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                          {e.by?.email && <span>Email: <strong className="font-medium text-slate-800">{e.by.email}</strong></span>}
                          {e.by?.branch && <span>Staff branch: <strong className="font-medium text-slate-800">{e.by.branch}</strong></span>}
                          {e.method && <span>Payment method: <strong className="font-medium text-slate-800">{e.method}</strong></span>}
                          {e.discount ? <span>Discount: <strong className="font-medium text-slate-800">{inr(e.discount)}</strong></span> : null}
                          {e.transactionId && <span>Txn ID: <strong className="font-mono text-slate-800">{e.transactionId}</strong></span>}
                          {e.remarks && <span className="w-full">Note: <em>{e.remarks}</em></span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </DataTable>
        </Card>
      )}

      {activeTab === "stocks" && (
        <Card
          flush
          title={loading ? "Products" : `${num(filteredSummaries.length)} products`}
          note={loading ? null : "Per-product totals across all recorded movements"}
        >
          <DataTable
            minWidth={980}
            loading={loading && "Loading audit"}
            head={[
              "Product", "Branch",
              { label: "On hand", align: "right" },
              { label: "MRP", align: "right" },
              { label: "Buy rate", align: "right" },
              { label: "Sold", align: "right" },
              { label: "Bought", align: "right" },
              { label: "In", align: "right" },
              { label: "Out", align: "right" },
              { label: "Revenue", align: "right" },
              { label: "Cost", align: "right" },
              { label: "Gross profit", align: "right" },
            ]}
            empty={
              filteredSummaries.length === 0 ? (
                <Empty icon={Package} title="No product summaries" hint="No products match the current filters." />
              ) : null
            }
          >
            {filteredSummaries.map((s) => (
              <tr key={s._id} className={tr}>
                <td className={`${td} font-medium text-slate-900`}>{s.name}</td>
                <td className={`${td} text-slate-600`}>{s.location}</td>
                <td className={`${td} text-right tabular-nums text-slate-700`}>{num(s.currentQty)}</td>
                <td className={`${td} text-right tabular-nums text-slate-500`}>{inr(s.mrp)}</td>
                <td className={`${td} text-right tabular-nums text-slate-500`}>{inr(s.purchaseAmt)}</td>
                <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>{num(s.unitsSold)}</td>
                <td className={`${td} text-right tabular-nums text-slate-700`}>{num(s.unitsPurchased)}</td>
                <td className={`${td} text-right tabular-nums text-emerald-700`}>{s.unitsTransferredIn ? `+${num(s.unitsTransferredIn)}` : "—"}</td>
                <td className={`${td} text-right tabular-nums text-amber-700`}>{s.unitsTransferredOut ? `−${num(s.unitsTransferredOut)}` : "—"}</td>
                <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>{inr(s.totalRevenue)}</td>
                <td className={`${td} text-right tabular-nums text-slate-500`}>{inr(s.totalCost)}</td>
                <td className={`${td} text-right`}><Profit value={s.totalProfit} /></td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </Page>
  );
}
