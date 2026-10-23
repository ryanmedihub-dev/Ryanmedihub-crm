"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  MapPin, Package, Search, X, Plus, ShoppingCart, Eye, Pencil, RefreshCw,
  ArrowLeftRight, ArrowRight, SlidersHorizontal,
} from "lucide-react";
import {
  Page, Card, Stats, Status, Chip, Btn, IconBtn, DataTable, Empty,
  input, inr, compact, num, day, td, tr,
} from "@/components/stocks/ui";

const BRANCHES = ["All", "Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon"];

export default function StockDashboard({ config = {} }) {
  const {
    SidebarComponent,
    title        = "Stock overview",
    subtitle,
    showAddStock  = false,
    addStockPath  = "/stocks/create",
    showPurchase  = false,
    purchasePath  = "/stocks/addStock",
    editBasePath  = null,
    viewBasePath  = null,
  } = config;

  const router = useRouter();
  const { data: session } = useSession();

  const [stocks,        setStocks]       = useState([]);
  const [statistics,    setStatistics]   = useState({ totalItems: 0, totalStockValue: 0, lowStockCount: 0, expiredCount: 0 });
  const [locationStats, setLocationStats] = useState([]);
  const [transfers,     setTransfers]    = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [refreshing,    setRefreshing]   = useState(false);
  const [searchTerm,    setSearchTerm]   = useState("");
  const [filterLow,     setFilterLow]    = useState(false);
  const [filterExpired, setFilterExp]    = useState(false);
  const [threshold,     setThreshold]    = useState(10);
  const [selectedLoc,   setSelectedLoc]  = useState("All");
  const [branchLocked,  setBranchLocked] = useState(false);

  const userBranch = session?.user?.branch;

  useEffect(() => { fetchStocks(); }, []);

  const fetchStocks = async (overrides = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      const loc = overrides.location  ?? selectedLoc;
      const low = overrides.lowStock  ?? filterLow;
      const exp = overrides.expired   ?? filterExpired;
      const q   = overrides.search    ?? searchTerm;
      const thr = overrides.threshold ?? threshold;

      if (q)                    params.append("search",    q);
      if (loc && loc !== "All") params.append("location",  loc);
      if (low) { params.append("lowStock", "true"); params.append("threshold", thr.toString()); }
      if (exp)                  params.append("expired",   "true");

      const url = `/api/stocks/get${params.toString() ? `?${params}` : ""}`;
      const [res, transferRes] = await Promise.all([fetch(url), fetch("/api/stocks/transfer")]);
      const data = await res.json();

      const transferData = await transferRes.json();
      if (transferData.success) setTransfers(transferData.data || []);

      if (data.success) {
        setStocks(data.data);
        setStatistics(data.statistics);
        setLocationStats(data.locationStats || []);
        setBranchLocked(!!data.branchRestricted);
        if (data.branchRestricted && data.userBranch) setSelectedLoc(data.userBranch);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => { setRefreshing(true); fetchStocks(); };

  const handleClear = () => {
    const resetLoc = branchLocked && userBranch ? userBranch : "All";
    setSearchTerm(""); setFilterLow(false); setFilterExp(false); setSelectedLoc(resetLoc);
    fetchStocks({ search: "", lowStock: false, expired: false, location: resetLoc });
  };

  const handleLocationChange = (loc) => {
    if (branchLocked) return;
    setSelectedLoc(loc);
    fetchStocks({ location: loc });
  };

  const isLow     = (qty) => qty <= threshold;
  const isExpired = (d)   => d && new Date(d) <= new Date();
  const hasFilters = searchTerm || filterLow || filterExpired || selectedLoc !== "All";

  // transfers come back branch-scoped; narrow further to the picked branch
  const visibleTransfers = selectedLoc === "All"
    ? transfers
    : transfers.filter((t) => t.from === selectedLoc || t.to === selectedLoc);

  const lead = subtitle || (branchLocked ? `${userBranch} branch only` : "Every branch");

  return (
    <Page
      sidebar={SidebarComponent}
      section="Overview"
      title={title}
      lead={lead}
      actions={
        <>
          <IconBtn icon={RefreshCw} label="Refresh" onClick={handleRefresh} disabled={refreshing || loading} />
          {showPurchase && (
            <Btn icon={ShoppingCart} onClick={() => router.push(purchasePath)}>Record purchase</Btn>
          )}
          {showAddStock && (
            <Btn variant="primary" icon={Plus} onClick={() => router.push(addStockPath)}>New product</Btn>
          )}
        </>
      }
    >
      <Stats
        items={[
          { label: "Products",   value: num(statistics.totalItems), onClick: hasFilters ? handleClear : undefined },
          { label: "Stock value", value: inr(statistics.totalStockValue) },
          { label: "Running low", value: num(statistics.lowStockCount), tone: statistics.lowStockCount ? "amber" : undefined,
            onClick: () => { setFilterLow(true); fetchStocks({ lowStock: true }); } },
          { label: "Expired",    value: num(statistics.expiredCount), tone: statistics.expiredCount ? "rose" : undefined,
            onClick: () => { setFilterExp(true); fetchStocks({ expired: true }); } },
        ]}
      />

      {locationStats.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {locationStats.map((ls) => {
            const active = selectedLoc === ls.location;
            return (
              <button
                key={ls.location}
                onClick={() => !branchLocked && handleLocationChange(active ? "All" : ls.location)}
                disabled={branchLocked}
                className={`rounded-xl border bg-white p-4 text-left transition-colors ${
                  active ? "border-emerald-700 ring-1 ring-emerald-700/20" : "border-slate-200"
                } ${branchLocked ? "cursor-default" : "hover:border-slate-300"}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {ls.location}
                  </span>
                  {!branchLocked && (
                    <span className={`text-xs ${active ? "text-emerald-700" : "text-slate-400"}`}>
                      {active ? "Filtering" : "View"}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-5">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{num(ls.totalItems)}</p>
                    <p className="text-xs text-slate-500">products</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{num(ls.availableQty)}</p>
                    <p className="text-xs text-slate-500">units</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{compact(ls.stockValue)}</p>
                    <p className="text-xs text-slate-500">value</p>
                  </div>
                  <div className="ml-auto flex gap-3 self-end">
                    {ls.lowStockCount > 0 && <Status tone="low">{ls.lowStockCount} low</Status>}
                    {ls.expiredCount > 0 && <Status tone="bad">{ls.expiredCount} expired</Status>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Card flush>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchStocks()}
              className={`${input} pl-9`}
            />
          </div>

          {branchLocked ? (
            <Chip icon={MapPin}>{userBranch}</Chip>
          ) : (
            <select
              value={selectedLoc}
              onChange={(e) => handleLocationChange(e.target.value)}
              className={`${input} w-36`}
            >
              {BRANCHES.map((b) => <option key={b} value={b}>{b === "All" ? "All branches" : b}</option>)}
            </select>
          )}

          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500">
            Low at
            <input
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(+e.target.value)}
              className="w-12 bg-transparent text-right font-medium tabular-nums text-slate-900 focus:outline-none"
            />
          </label>

          <button
            onClick={() => { const n = !filterLow; setFilterLow(n); fetchStocks({ lowStock: n }); }}
            className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filterLow ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Low stock
          </button>
          <button
            onClick={() => { const n = !filterExpired; setFilterExp(n); fetchStocks({ expired: n }); }}
            className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filterExpired ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Expired
          </button>

          <div className="ml-auto flex items-center gap-2">
            {hasFilters && <Btn variant="ghost" icon={X} onClick={handleClear}>Clear</Btn>}
            <Btn variant="primary" icon={SlidersHorizontal} onClick={() => fetchStocks()}>Apply</Btn>
          </div>
        </div>
      </Card>

      <Card
        flush
        title={loading ? "Products" : `${num(stocks.length)} ${stocks.length === 1 ? "product" : "products"}`}
        note={hasFilters ? "Filtered view" : null}
        action={
          showAddStock && (
            <Btn variant="ghost" icon={Plus} onClick={() => router.push(addStockPath)}>New product</Btn>
          )
        }
      >
        <DataTable
          minWidth={880}
          loading={loading && "Loading stock"}
          head={[
            "Product", "Branch",
            { label: "Qty", align: "right" },
            { label: "MRP", align: "right" },
            { label: "Buy", align: "right" },
            { label: "Sell", align: "right" },
            "Expiry", "Status",
            ...(editBasePath || viewBasePath ? [{ label: "", align: "right" }] : []),
          ]}
          empty={
            stocks.length === 0 && !loading ? (
              <Empty
                icon={Package}
                title="No products here"
                hint={
                  hasFilters
                    ? "Nothing matches these filters. Clear them to see the full list."
                    : showAddStock
                    ? "Add your first product to start tracking stock."
                    : "Nothing has been added to this branch yet."
                }
                action={
                  !hasFilters && showAddStock ? (
                    <Btn variant="primary" icon={Plus} onClick={() => router.push(addStockPath)}>New product</Btn>
                  ) : hasFilters ? (
                    <Btn icon={X} onClick={handleClear}>Clear filters</Btn>
                  ) : null
                }
              />
            ) : null
          }
          footer={
            stocks.length > 0 &&
            `${num(stocks.length)} of ${num(statistics.totalItems)} products${hasFilters ? " · filtered" : ""}`
          }
        >
          {stocks.map((stock) => {
            const expired = isExpired(stock.expiry);
            const low     = isLow(stock.totalQuantity);
            return (
              <tr key={stock._id} className={tr}>
                <td className={`${td} font-medium text-slate-900`}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                      {stock.name?.charAt(0).toUpperCase()}
                    </span>
                    <span className="whitespace-nowrap">{stock.name}</span>
                  </div>
                </td>
                <td className={td}>
                  {stock.location ? <Chip icon={MapPin}>{stock.location}</Chip> : <span className="text-slate-300">—</span>}
                </td>
                <td className={`${td} text-right font-semibold tabular-nums ${low ? "text-amber-600" : "text-slate-900"}`}>
                  {num(stock.totalQuantity)}
                  {stock.unit && <span className="ml-1 text-xs font-normal text-slate-400">{stock.unit}</span>}
                </td>
                <td className={`${td} text-right tabular-nums`}>{inr(stock.mrp)}</td>
                <td className={`${td} text-right tabular-nums text-slate-500`}>{stock.purchaseAmt ? inr(stock.purchaseAmt) : "—"}</td>
                <td className={`${td} text-right tabular-nums text-slate-500`}>{stock.soldAmt ? inr(stock.soldAmt) : "—"}</td>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{stock.expiry ? day(stock.expiry) : "—"}</td>
                <td className={td}>
                  {expired ? <Status tone="bad">Expired</Status> : low ? <Status tone="low">Low</Status> : <Status tone="ok">In stock</Status>}
                </td>
                {(editBasePath || viewBasePath) && (
                  <td className={td}>
                    <div className="flex justify-end gap-0.5">
                      {editBasePath && (
                        <IconBtn icon={Pencil} label="Edit" onClick={() => router.push(`${editBasePath}/${stock._id}`)} />
                      )}
                      {viewBasePath && (
                        <IconBtn icon={Eye} label="View" onClick={() => router.push(`${viewBasePath}/${stock._id}`)} />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </DataTable>
      </Card>

      {visibleTransfers.length > 0 && (
        <Card
          flush
          title="Internal transfers"
          note={selectedLoc === "All" ? "Stock moved between branches" : `Touching ${selectedLoc}`}
          action={
            <Btn variant="ghost" icon={ArrowRight} onClick={() => router.push("/stocks/transfer")}>Transfer stock</Btn>
          }
        >
          <DataTable
            minWidth={720}
            head={["Date", "Product", "Route", { label: "Qty", align: "right" }, "Note", "By"]}
            footer={
              visibleTransfers.length > 25 &&
              `Showing the 25 most recent of ${num(visibleTransfers.length)} transfers`
            }
          >
            {visibleTransfers.slice(0, 25).map((t, i) => (
              <tr key={`${t.stockId}-${t.date}-${i}`} className={tr}>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{day(t.date)}</td>
                <td className={`${td} font-medium text-slate-900`}>{t.stockName}</td>
                <td className={td}>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-600">
                    {t.from}
                    <ArrowLeftRight className="h-3 w-3 text-amber-500" />
                    {t.to}
                  </span>
                </td>
                <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>
                  {num(t.quantity)}
                  {t.unit && <span className="ml-1 text-xs font-normal text-slate-400">{t.unit}</span>}
                </td>
                <td className={`${td} text-slate-500`}>{t.remarks || "—"}</td>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{t.by}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </Page>
  );
}
