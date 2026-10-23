"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ClipboardList, Download, RefreshCw, Search, ChevronDown, ChevronUp,
  Store, Users, MapPin, Package, AlertCircle, SlidersHorizontal, ArrowRight,
} from "lucide-react";
import StockSidebar from "@/components/Sidebars/StockSidebar";
import {
  Page, Card, Stats, Status, Btn, DataTable, Empty, Row,
  input, inr, num, when, day, td, tr, th,
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [activeTab, setActiveTab] = useState("events");
  const [expanded, setExpanded] = useState({});
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const fetchAudit = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (location !== "All") params.set("location", location);
      if (eventType !== "ALL") params.set("eventType", eventType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/stocks/audit?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSummary(data.summary);
      setEvents(data.events);
      setStockSummaries(data.stockSummaries);
    } catch (err) {
      setError(err.message || "Could not load the audit");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudit(); }, []);

  const filteredEvents = useMemo(() => {
    let arr = [...events];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((e) =>
        e.stockName?.toLowerCase().includes(q) ||
        e.party?.name?.toLowerCase().includes(q) ||
        e.by?.name?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q)
      );
    }
    if (eventType !== "ALL") arr = arr.filter((e) => e.type === eventType);

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
    return stockSummaries.filter((s) =>
      s.name?.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q)
    );
  }, [stockSummaries, search]);

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

    const sumRows = stockSummaries.map((s) => ({
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
          <Btn icon={RefreshCw} onClick={fetchAudit} disabled={loading}>Refresh</Btn>
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

      {summary && (
        <Stats
          items={[
            { label: "Revenue",      value: inr(summary.totalRevenue) },
            { label: "Cost of stock", value: inr(summary.totalCost) },
            { label: "Gross profit", value: inr(summary.totalProfit), tone: summary.totalProfit < 0 ? "rose" : undefined },
            { label: "Units sold",   value: num(summary.unitsSold) },
          ]}
        />
      )}

      <Card flush>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product, vendor, patient or branch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${input} pl-9`}
            />
          </div>

          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={`${input} w-40`}>
            <option value="ALL">All events</option>
            <option value="PURCHASE">Purchases</option>
            <option value="SALE">Sales</option>
            <option value="TRANSFER">Transfers</option>
          </select>

          <select value={location} onChange={(e) => setLocation(e.target.value)} className={`${input} w-36`}>
            {BRANCHES.map((b) => <option key={b} value={b}>{b === "All" ? "All branches" : b}</option>)}
          </select>

          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} w-40`} aria-label="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} w-40`} aria-label="To date" />

          <Btn variant="primary" icon={SlidersHorizontal} onClick={fetchAudit} className="ml-auto">Apply</Btn>
        </div>
      </Card>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {[
          { id: "events", label: "Timeline" },
          { id: "stocks", label: "By product" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
              "Counterparty", "Branch",
              { label: "Qty", align: "right" },
              { label: "Unit price", align: "right" },
              { label: "Amount", align: "right", onClick: () => toggleSort("totalAmount"), sortMark: sortMark("totalAmount") },
              { label: "Profit", align: "right" },
              "Recorded by",
            ]}
            empty={
              !loading && filteredEvents.length === 0 ? (
                <Empty
                  icon={ClipboardList}
                  title="No events in this range"
                  hint="Widen the dates or clear the filters to see activity."
                />
              ) : null
            }
          >
            {filteredEvents.map((ev, i) => (
              <tr key={`${ev.stockId}-${ev.date}-${i}`} className={tr}>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{day(ev.date)}</td>
                <td className={td}><EventType type={ev.type} direction={ev.direction} /></td>
                <td className={`${td} font-medium text-slate-900`}>{ev.stockName}</td>
                <td className={td}><Party party={ev.party} /></td>
                <td className={`${td} text-slate-500`}>{ev.location}</td>
                <td className={`${td} text-right font-medium tabular-nums text-slate-900`}>
                  {ev.type === "TRANSFER" && (ev.direction === "OUT" ? "−" : "+")}
                  {num(ev.quantity)}
                </td>
                <td className={`${td} text-right tabular-nums text-slate-500`}>
                  {ev.type === "TRANSFER" ? <span className="text-slate-300">—</span> : inr(ev.unitPrice)}
                </td>
                <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>
                  {ev.type === "TRANSFER" ? <span className="font-normal text-slate-300">—</span> : inr(ev.totalAmount)}
                </td>
                <td className={`${td} text-right`}><Profit value={ev.profit} /></td>
                <td className={td}>
                  <p className="whitespace-nowrap text-slate-700">
                    {ev.by?.name && ev.by.name !== "—" ? ev.by.name : session?.user?.name || "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {ev.by?.branch && ev.by.branch !== "—" ? ev.by.branch : session?.user?.branch || ""}
                  </p>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      {activeTab === "stocks" && (
        <Card flush title={loading ? "Products" : `${num(filteredSummaries.length)} products`} note="Click a row for its history">
          <DataTable
            minWidth={900}
            loading={loading && "Loading audit"}
            head={[
              "Product",
              { label: "Purchased", align: "right" },
              { label: "Sold", align: "right" },
              { label: "Moved", align: "right" },
              { label: "Revenue", align: "right" },
              { label: "Cost", align: "right" },
              { label: "Profit", align: "right" },
              { label: "", align: "right" },
            ]}
            empty={
              !loading && filteredSummaries.length === 0 ? (
                <Empty icon={Package} title="No products match" hint="Clear the search to see every product." />
              ) : null
            }
          >
            {filteredSummaries.map((s) => {
              const open = !!expanded[s._id];
              const moved = (s.unitsTransferredIn || 0) - (s.unitsTransferredOut || 0);
              const history = events.filter((e) => e.stockId === s._id);
              return (
                <React.Fragment key={s._id}>
                  <tr className={`${tr} cursor-pointer`} onClick={() => setExpanded((p) => ({ ...p, [s._id]: !p[s._id] }))}>
                    <td className={`${td} font-medium text-slate-900`}>
                      {s.name}
                      <span className="ml-2 text-xs font-normal text-slate-400">{s.location}</span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{num(s.unitsPurchased)}</td>
                    <td className={`${td} text-right tabular-nums`}>{num(s.unitsSold)}</td>
                    <td className={`${td} text-right tabular-nums ${moved ? "text-amber-600" : "text-slate-300"}`}>
                      {moved ? `${moved > 0 ? "+" : "−"}${num(Math.abs(moved))}` : "—"}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{inr(s.totalRevenue)}</td>
                    <td className={`${td} text-right tabular-nums text-slate-500`}>{inr(s.totalCost)}</td>
                    <td className={`${td} text-right`}><Profit value={s.totalProfit} /></td>
                    <td className={`${td} text-right text-slate-400`}>
                      {open ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />}
                    </td>
                  </tr>

                  {open && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <Row label="On hand">{num(s.currentQty)}</Row>
                            <Row label="MRP">{inr(s.mrp)}</Row>
                            <Row label="Purchase rate">{inr(s.purchaseAmt)}</Row>
                            <Row label="Margin" tone={s.totalProfit >= 0 ? "emerald" : "rose"}>
                              {s.totalRevenue ? `${((s.totalProfit / s.totalRevenue) * 100).toFixed(1)}%` : "—"}
                            </Row>
                            {(s.unitsTransferredIn || s.unitsTransferredOut) ? (
                              <Row label="Transferred">
                                <span className="text-amber-600">
                                  +{num(s.unitsTransferredIn || 0)} / −{num(s.unitsTransferredOut || 0)}
                                </span>
                              </Row>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <p className="mb-2 text-xs font-medium text-slate-500">History</p>
                            {history.length === 0 ? (
                              <p className="text-sm text-slate-400">Nothing recorded for this product yet.</p>
                            ) : (
                              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 scrollbar-hide">
                                {history.map((ev, i) => (
                                  <div
                                    key={i}
                                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                                  >
                                    <EventType type={ev.type} direction={ev.direction} />
                                    <span className="text-slate-400">{when(ev.date)}</span>
                                    {ev.type === "TRANSFER" ? (
                                      <span className="flex items-center gap-1 text-slate-600">
                                        {num(ev.quantity)} {ev.direction === "OUT" ? "to" : "from"}
                                        <ArrowRight className="h-3 w-3 text-amber-500" />
                                        {ev.party?.name || "—"}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-slate-600">{num(ev.quantity)} @ {inr(ev.unitPrice)}</span>
                                        <Party party={ev.party} />
                                      </>
                                    )}
                                    <span className="ml-auto flex items-center gap-3">
                                      {ev.type !== "TRANSFER" && (
                                        <span className="font-semibold tabular-nums text-slate-900">{inr(ev.totalAmount)}</span>
                                      )}
                                      <Profit value={ev.profit} />
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
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
    </Page>
  );
}
