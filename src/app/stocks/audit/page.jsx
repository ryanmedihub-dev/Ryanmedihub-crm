"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import StockSidebar from "@/components/Sidebars/StockSidebar";
import {
  ClipboardList,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  PackageOpen,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Filter,
  Download,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Users,
  Store,
  Calendar,
  DollarSign,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { formatDate as fmtDate } from "@/lib/financeUI";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

function KpiCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function EventBadge({ type }) {
  return type === "PURCHASE" ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
      <ArrowDownToLine className="w-3 h-3" /> Purchase
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <ArrowUpFromLine className="w-3 h-3" /> Sale
    </span>
  );
}

function ProfitBadge({ profit }) {
  if (profit === null || profit === undefined) return <span className="text-gray-400 text-xs">—</span>;
  const positive = profit >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {fmt(Math.abs(profit))}
    </span>
  );
}

function StockSummaryRow({ s, onClick, isExpanded }) {
  const profitColor = s.totalProfit > 0 ? "text-emerald-600" : s.totalProfit < 0 ? "text-red-500" : "text-gray-500";
  return (
    <tr
      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {s.name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm">{s.name}</p>
            <p className="text-xs text-gray-400">{s.location}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{s.unitsPurchased}</td>
      <td className="px-4 py-3 text-sm text-gray-700">{s.unitsSold}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{fmt(s.totalRevenue)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{fmt(s.totalCost)}</td>
      <td className={`px-4 py-3 text-sm font-bold ${profitColor}`}>{fmt(s.totalProfit)}</td>
      <td className="px-4 py-3 text-right">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isExpanded ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </td>
    </tr>
  );
}

export default function StockAuditPage() {
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary]       = useState(null);
  const [events, setEvents]         = useState([]);
  const [stockSummaries, setStockSummaries] = useState([]);

  const [search, setSearch]         = useState("");
  const [location, setLocation]     = useState("All");
  const [eventType, setEventType]   = useState("ALL");
  const [from, setFrom]             = useState("");
  const [to, setTo]                 = useState("");

  const [activeTab, setActiveTab]   = useState("events");
  const [expandedStocks, setExpandedStocks] = useState({});
  const [sortField, setSortField]   = useState("date");
  const [sortDir, setSortDir]       = useState("desc");

  const fetchAudit = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (location !== "All") params.set("location", location);
      if (eventType !== "ALL") params.set("eventType", eventType);
      if (from) params.set("from", from);
      if (to)   params.set("to", to);

      const res = await fetch(`/api/stocks/audit?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSummary(data.summary);
      setEvents(data.events);
      setStockSummaries(data.stockSummaries);
    } catch (err) {
      setError(err.message || "Failed to load audit data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudit(); }, []);

  const filteredEvents = useMemo(() => {
    let arr = [...events];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(e =>
        e.stockName?.toLowerCase().includes(q) ||
        e.party?.name?.toLowerCase().includes(q) ||
        e.by?.name?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q)
      );
    }
    if (eventType !== "ALL") arr = arr.filter(e => e.type === eventType);

    arr.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === "date") { va = new Date(va || 0); vb = new Date(vb || 0); }
      if (sortField === "totalAmount") { va = va || 0; vb = vb || 0; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [events, search, eventType, sortField, sortDir]);

  const filteredSummaries = useMemo(() => {
    if (!search) return stockSummaries;
    const q = search.toLowerCase();
    return stockSummaries.filter(s =>
      s.name?.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q)
    );
  }, [stockSummaries, search]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }) =>
    sortField === field ? (
      sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 inline ml-1" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-1" />
    ) : null;

  const exportExcel = async () => {
    const { utils, writeFile } = await import("xlsx");

    const evRows = filteredEvents.map(e => ({
      "Date":         fmtDateTime(e.date),
      "Type":         e.type,
      "Stock Name":   e.stockName,
      "Location":     e.location,
      "Party":        e.party?.name || "—",
      "Party Type":   e.party?.type === "vendor" ? "Vendor" : "Patient",
      "Quantity":     e.quantity,
      "Unit Price":   e.unitPrice,
      "Total Amount": e.totalAmount,
      "Purchase Cost":e.type === "SALE" ? (e.totalCost || 0) : "",
      "Profit/Loss":  e.profit !== null ? e.profit : "",
      "Discount":     e.discount || "",
      "Payment Method": e.method || "",
      "Recorded By":  e.by?.name || "—",
      "By Branch":    e.by?.branch || "—",
    }));

    const ws = utils.json_to_sheet(evRows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 10 }, { wch: 25 }, { wch: 12 }, { wch: 25 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 12 },
    ];

    const sumRows = stockSummaries.map(s => ({
      "Stock Name":      s.name,
      "Location":        s.location,
      "Current Qty":     s.currentQty,
      "MRP":             s.mrp,
      "Purchase Rate":   s.purchaseAmt,
      "Units Purchased": s.unitsPurchased,
      "Units Sold":      s.unitsSold,
      "Total Revenue":   s.totalRevenue,
      "Total Cost":      s.totalCost,
      "Gross Profit":    s.totalProfit,
    }));
    const wsSum = utils.json_to_sheet(sumRows);
    wsSum["!cols"] = [
      { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
      { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Audit Events");
    utils.book_append_sheet(wb, wsSum, "Stock Summary");
    const today = new Date().toISOString().slice(0, 10);
    writeFile(wb, `stock_audit_${today}.xlsx`);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StockSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 min-w-0 p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-emerald-600" />
              Stock Audit
            </h1>
            <p className="text-sm text-gray-500 mt-1">Track purchases, sales, profit & loss per product</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAudit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Total Revenue"
              value={fmt(summary.totalRevenue)}
              icon={DollarSign}
              color="bg-linear-to-br from-emerald-500 to-teal-600"
              sub={`${summary.unitsSold} units sold`}
            />
            <KpiCard
              label="Total Cost"
              value={fmt(summary.totalCost)}
              icon={ArrowDownToLine}
              color="bg-linear-to-br from-blue-500 to-indigo-600"
              sub={`${summary.unitsPurchased} units bought`}
            />
            <KpiCard
              label="Gross Profit"
              value={fmt(summary.totalProfit)}
              icon={summary.totalProfit >= 0 ? TrendingUp : TrendingDown}
              color={summary.totalProfit >= 0 ? "bg-linear-to-br from-green-500 to-emerald-600" : "bg-linear-to-br from-red-500 to-rose-600"}
              sub={summary.totalRevenue ? `${((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)}% margin` : ""}
            />
            <KpiCard
              label="Units Purchased"
              value={summary.unitsPurchased}
              icon={PackageOpen}
              color="bg-linear-to-br from-violet-500 to-purple-600"
            />
            <KpiCard
              label="Products Tracked"
              value={summary.totalStocks}
              icon={Package}
              color="bg-linear-to-br from-orange-500 to-amber-600"
            />
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search stock, patient, vendor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
            >
              <option value="ALL">All Events</option>
              <option value="PURCHASE">Purchases Only</option>
              <option value="SALE">Sales Only</option>
            </select>

            <select
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
            >
              <option value="All">All Locations</option>
              <option value="Delhi">Delhi</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Noida">Noida</option>
            </select>

            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />

            <button
              onClick={fetchAudit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Apply
            </button>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {[
            { id: "events", label: "Event Timeline", icon: BarChart3 },
            { id: "stocks", label: "By Product",     icon: Package },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading audit data…</p>
          </div>
        )}

        {!loading && activeTab === "events" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900">{filteredEvents.length} events</p>
              <p className="text-xs text-gray-400">
                {filteredEvents.filter(e => e.type === "PURCHASE").length} purchases &nbsp;·&nbsp;
                {filteredEvents.filter(e => e.type === "SALE").length} sales
              </p>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No events found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort("date")}>
                        Date <SortIcon field="date" />
                      </th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort("stockName")}>
                        Product <SortIcon field="stockName" />
                      </th>
                      <th className="px-4 py-3 text-left">Party</th>
                      <th className="px-4 py-3 text-left">Location</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Unit Price</th>
                      <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("totalAmount")}>
                        Amount <SortIcon field="totalAmount" />
                      </th>
                      <th className="px-4 py-3 text-right">Profit / Loss</th>
                      <th className="px-4 py-3 text-left">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((ev, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(ev.date)}</td>
                        <td className="px-4 py-3"><EventBadge type={ev.type} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {ev.stockName?.[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900">{ev.stockName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {ev.party?.type === "vendor"
                              ? <Store className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              : <Users className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            }
                            <span className="text-gray-700">{ev.party?.name || "—"}</span>
                            {ev.party?.phone && (
                              <span className="text-gray-400 text-xs">({ev.party.phone})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{ev.location}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{ev.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmt(ev.unitPrice)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(ev.totalAmount)}</td>
                        <td className="px-4 py-3 text-right"><ProfitBadge profit={ev.profit} /></td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-gray-700 font-medium">
                              {ev.by?.name && ev.by.name !== "—" ? ev.by.name : (session?.user?.name || "—")}
                            </p>
                            <p className="text-gray-400 text-xs">
                              {ev.by?.branch && ev.by.branch !== "—" ? ev.by.branch : (session?.user?.branch || "")}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === "stocks" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="font-semibold text-gray-900">{filteredSummaries.length} products</p>
            </div>

            {filteredSummaries.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No products found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-left">Purchased</th>
                      <th className="px-4 py-3 text-left">Sold</th>
                      <th className="px-4 py-3 text-left">Revenue</th>
                      <th className="px-4 py-3 text-left">Cost</th>
                      <th className="px-4 py-3 text-left">Profit / Loss</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummaries.map((s) => (
                      <React.Fragment key={s._id}>
                        <StockSummaryRow
                          s={s}
                          isExpanded={!!expandedStocks[s._id]}
                          onClick={() =>
                            setExpandedStocks(prev => ({ ...prev, [s._id]: !prev[s._id] }))
                          }
                        />
                        {expandedStocks[s._id] && (
                          <tr key={`${s._id}-detail`} className="bg-gray-50/60">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                <div className="bg-white rounded-xl border border-gray-100 p-3">
                                  <p className="text-xs text-gray-500">Current Stock</p>
                                  <p className="text-lg font-bold text-gray-900">{s.currentQty}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-100 p-3">
                                  <p className="text-xs text-gray-500">MRP</p>
                                  <p className="text-lg font-bold text-gray-900">{fmt(s.mrp)}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-100 p-3">
                                  <p className="text-xs text-gray-500">Purchase Rate</p>
                                  <p className="text-lg font-bold text-gray-900">{fmt(s.purchaseAmt)}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-100 p-3">
                                  <p className="text-xs text-gray-500">Margin</p>
                                  <p className={`text-lg font-bold ${s.totalRevenue ? (s.totalProfit >= 0 ? "text-emerald-600" : "text-red-500") : "text-gray-400"}`}>
                                    {s.totalRevenue
                                      ? `${((s.totalProfit / s.totalRevenue) * 100).toFixed(1)}%`
                                      : "—"}
                                  </p>
                                </div>
                              </div>

                              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Transaction History</p>
                              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
                                {events
                                  .filter(e => e.stockId === s._id)
                                  .map((ev, i) => (
                                    <div
                                      key={i}
                                      className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs ${
                                        ev.type === "PURCHASE"
                                          ? "bg-blue-50 border-blue-100"
                                          : "bg-emerald-50 border-emerald-100"
                                      }`}
                                    >
                                      <EventBadge type={ev.type} />
                                      <span className="text-gray-500">{fmtDateTime(ev.date)}</span>
                                      <div className="flex items-center gap-1">
                                        {ev.party?.type === "vendor"
                                          ? <Store className="w-3 h-3 text-blue-500" />
                                          : <Users className="w-3 h-3 text-violet-500" />
                                        }
                                        <span className="font-medium text-gray-700">{ev.party?.name}</span>
                                      </div>
                                      <span className="text-gray-500">{ev.quantity} units @ {fmt(ev.unitPrice)}</span>
                                      <span className="font-medium text-gray-600 text-xs">
                                        {ev.by?.name && ev.by.name !== "—" ? ev.by.name : (session?.user?.name || "—")}
                                        {(ev.by?.branch && ev.by.branch !== "—" ? ev.by.branch : session?.user?.branch) && (
                                          <span className="text-gray-400"> · {ev.by?.branch && ev.by.branch !== "—" ? ev.by.branch : session?.user?.branch}</span>
                                        )}
                                      </span>
                                      <span className="font-semibold text-gray-900 ml-auto">{fmt(ev.totalAmount)}</span>
                                      {ev.profit !== null && (
                                        <ProfitBadge profit={ev.profit} />
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
