"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, ArrowLeftRight, MapPin, Check, Package, Plus, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import SearchableSelect from "@/components/SearchableSelect";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Field, Btn, IconBtn, Chip, Row, DataTable, Empty, Spinner,
  input, inputBad, num, when, td, tr, th,
} from "@/components/stocks/ui";

const blankItem = () => ({
  id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  stockId: "",
  quantity: "",
});

export default function StockTransferPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stocks, setStocks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);

  const branchRestricted = Boolean(
    session?.user?.branch && !["admin", "super-admin"].includes(session?.user?.role)
  );
  const userBranch = session?.user?.branch || "";

  const [fromLocation, setFromLocation] = useState(branchRestricted ? userBranch : "");
  const [toLocation, setToLocation] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState([blankItem()]);

  const loadData = async () => {
    try {
      const [stockRes, transferRes] = await Promise.all([
        fetch("/api/stocks/get"),
        fetch("/api/stocks/transfer"),
      ]);
      const stockData = await stockRes.json();
      const transferData = await transferRes.json();
      if (stockData.success) {
        setStocks(stockData.data || []);
        setLocations(
          (stockData.locationStats || []).map((l) => l.location).filter((l) => l && l !== "Unassigned")
        );
      }
      if (transferData.success) setTransfers(transferData.data || []);
    } catch {
      toast.error("Could not load stock");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (branchRestricted && userBranch) {
      setFromLocation(userBranch);
    }
  }, [branchRestricted, userBranch]);

  const allLocations = useMemo(() => {
    const locSet = new Set(locations);
    stocks.forEach((s) => {
      if (s.location && s.location !== "Unassigned") locSet.add(s.location);
    });
    return Array.from(locSet).sort();
  }, [locations, stocks]);

  const availableProducts = useMemo(() => {
    if (!fromLocation) return stocks;
    return stocks.filter((s) => (s.location || "Unassigned") === fromLocation);
  }, [stocks, fromLocation]);

  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, [field]: value };
        if (field === "stockId" && value) {
          const picked = stocks.find((s) => s._id === value);
          if (picked?.location && !fromLocation && !branchRestricted) {
            setFromLocation(picked.location);
          }
        }
        return next;
      })
    );
  };

  const handleFromLocationChange = (newLoc) => {
    setFromLocation(newLoc);
    if (newLoc) {
      setItems((prev) =>
        prev.map((item) => {
          if (!item.stockId) return item;
          const picked = stocks.find((s) => s._id === item.stockId);
          if (picked && (picked.location || "Unassigned") !== newLoc) {
            return { ...item, stockId: "", quantity: "" };
          }
          return item;
        })
      );
      if (toLocation.trim().toLowerCase() === newLoc.trim().toLowerCase()) {
        setToLocation("");
      }
    }
  };

  const addLine = () => {
    setItems((prev) => [...prev, blankItem()]);
  };

  const removeItem = (id) => {
    if (items.length === 1) {
      return toast.info("A transfer needs at least one line");
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const qtyByStock = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      if (!item.stockId) return;
      const q = parseFloat(item.quantity) || 0;
      map[item.stockId] = (map[item.stockId] || 0) + q;
    });
    return map;
  }, [items]);

  const totalUnits = useMemo(() => {
    return items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);
  }, [items]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;

    const source = (fromLocation || "").trim();
    const destination = (toLocation || "").trim();

    if (!source) {
      return toast.error("Select the source location first");
    }
    if (!destination) {
      return toast.error("Say where the stock is going");
    }
    if (destination.toLowerCase() === source.toLowerCase()) {
      return toast.error("Pick a destination other than the source");
    }
    if (items.length === 0) {
      return toast.error("A transfer needs at least one line");
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.stockId) {
        return toast.error(`Line ${i + 1}: Pick a product to move`);
      }
      const q = parseFloat(item.quantity);
      if (!q || q <= 0 || isNaN(q)) {
        return toast.error(`Line ${i + 1}: Enter a quantity above zero`);
      }
    }

    for (const [stockId, totalReq] of Object.entries(qtyByStock)) {
      const stock = stocks.find((s) => s._id === stockId);
      const avail = stock?.totalQuantity || 0;
      if (totalReq > avail) {
        return toast.error(
          `Only ${num(avail)} on hand for ${stock?.name || "product"} at ${source} (requested: ${num(totalReq)})`
        );
      }
    }

    setLoading(true);
    const successfulIds = [];
    const failedLines = [];

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const q = parseFloat(item.quantity);
        const stock = stocks.find((s) => s._id === item.stockId);
        const productName = stock?.name || `Line ${i + 1}`;

        try {
          const res = await fetch("/api/stocks/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stockId: item.stockId,
              toLocation: destination,
              quantity: q,
              remarks: remarks ? remarks.trim() : "",
            }),
          });
          const data = await res.json();
          if (data.success) {
            successfulIds.push(item.id);
          } else {
            failedLines.push({
              name: productName,
              message: data.message || "Could not move the stock",
            });
          }
        } catch {
          failedLines.push({
            name: productName,
            message: "Could not reach the server",
          });
        }
      }

      await loadData();

      if (failedLines.length === 0) {
        toast.success(
          `Successfully transferred ${successfulIds.length} ${successfulIds.length === 1 ? "product" : "products"} (${num(totalUnits)} units) to ${destination}`
        );
        setItems([blankItem()]);
        setToLocation("");
        setRemarks("");
      } else if (successfulIds.length > 0) {
        toast.warning(
          `Transferred ${successfulIds.length} ${successfulIds.length === 1 ? "line" : "lines"}, but ${failedLines.length} failed`
        );
        toast.error(
          failedLines.map((f) => `${f.name}: ${f.message}`).join("; ")
        );
        setItems((prev) => prev.filter((it) => !successfulIds.includes(it.id)));
      } else {
        toast.error(
          `Transfer failed: ${failedLines.map((f) => `${f.name}: ${f.message}`).join("; ")}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <Page sidebar={Sidebar} section="Inventory" title="Transfer stock">
        <Card><Spinner note="Loading stock" /></Card>
      </Page>
    );
  }

  return (
    <Page
      sidebar={Sidebar}
      section="Inventory"
      title="Transfer stock"
      lead="Move stock between branches — no payment, no sale, no transaction"
      back="/stocks/dashboard"
      actions={
        <>
          {branchRestricted && <Chip icon={MapPin}>{session.user.branch}</Chip>}
          <Btn onClick={() => router.push("/stocks/dashboard")} disabled={loading}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            icon={Check}
            busy={loading}
            onClick={handleSubmit}
          >
            Transfer stock
          </Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Movement">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="From"
                required
                hint={
                  branchRestricted
                    ? "Locked to your branch"
                    : "Pick a source branch or select a product below"
                }
              >
                {branchRestricted ? (
                  <div className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {session.user.branch}
                  </div>
                ) : (
                  <select
                    value={fromLocation}
                    onChange={(e) => handleFromLocationChange(e.target.value)}
                    className={input}
                  >
                    <option value="">Select source branch</option>
                    {allLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field
                label="To"
                required
                hint="Pick a branch or type a new place — the product is created there if needed"
              >
                <input
                  list="transfer-locations"
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                  placeholder="GD, Warehouse, Mumbai"
                  className={input}
                  required
                />
                <datalist id="transfer-locations">
                  {allLocations
                    .filter((l) => l !== fromLocation)
                    .map((l) => (
                      <option key={l} value={l} />
                    ))}
                </datalist>
              </Field>

              <Field label="Note" className="sm:col-span-2">
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Why it is moving"
                  className={input}
                />
              </Field>
            </div>
          </Card>

          <Card
            flush
            title="Lines"
            note="Stock is deducted from the source and added at destination"
            action={
              <Btn
                type="button"
                variant="ghost"
                icon={Plus}
                onClick={addLine}
                disabled={loading}
              >
                Add line
              </Btn>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="bg-slate-50/70">
                    <th className={`${th} w-10 text-center`}>#</th>
                    <th className={th}>Product</th>
                    <th className={`${th} w-32 text-right`}>Available</th>
                    <th className={`${th} w-36`}>Quantity</th>
                    <th className={`${th} w-12`} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const picked = stocks.find((s) => s._id === item.stockId);
                    const avail = picked?.totalQuantity || 0;
                    const rowQty = parseFloat(item.quantity) || 0;
                    const totalForStock = qtyByStock[item.stockId] || rowQty;
                    const isExceeded = picked && totalForStock > avail;

                    return (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className={`${td} text-center text-xs text-slate-400`}>{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <SearchableSelect
                            options={availableProducts.map((s) => ({
                              value: s._id,
                              label: `${s.name} — ${num(s.totalQuantity || 0)}${s.unit ? ` ${s.unit}` : ""} on hand${!fromLocation && s.location ? ` · ${s.location}` : ""}`,
                            }))}
                            value={item.stockId}
                            onChange={(value) => updateItem(item.id, "stockId", value)}
                            placeholder={
                              availableProducts.length === 0
                                ? "No products at this location"
                                : "Search products"
                            }
                            disabled={loading}
                          />
                        </td>
                        <td className={`${td} text-right tabular-nums`}>
                          {picked ? (
                            <div>
                              <span className="font-medium text-slate-900">{num(avail)}</span>
                              {picked.unit && (
                                <span className="ml-1 text-xs text-slate-400">{picked.unit}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                            placeholder="0"
                            className={`${isExceeded ? inputBad : input} text-right tabular-nums`}
                            required
                            disabled={loading}
                          />
                          {isExceeded && (
                            <p className="mt-1 text-right text-[11px] text-rose-600">
                              Exceeds {num(avail)} on hand
                            </p>
                          )}
                          {!isExceeded && picked && rowQty > 0 && (
                            <p className="mt-1 text-right text-[11px] text-slate-400">
                              {num(Math.max(avail - rowQty, 0))} left
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <IconBtn
                            type="button"
                            icon={Trash2}
                            tone="rose"
                            label="Remove line"
                            onClick={() => removeItem(item.id)}
                            disabled={items.length === 1 || loading}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Summary">
            {fromLocation || toLocation.trim() ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                  {fromLocation || "Source"}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-emerald-700" />
                <span
                  className={`rounded-md px-2 py-1 font-medium ${
                    toLocation.trim()
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-50 text-slate-400"
                  }`}
                >
                  {toLocation.trim() || "Destination"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Pick a source and destination to see transfer route.</p>
            )}

            <div className="mt-4">
              <Row label="Product lines">
                {num(items.filter((i) => i.stockId).length || items.length)}
              </Row>
              <Row label="Units moving">{num(totalUnits)}</Row>
              <Row label="Source">{fromLocation || "—"}</Row>
              <Row label="Destination">{toLocation.trim() || "—"}</Row>
              {remarks.trim() && <Row label="Note">{remarks.trim()}</Row>}
            </div>

            <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
              <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Quantity only. Nothing is written to sales or transactions.
            </p>
          </Card>
        </div>
      </form>

      <Card flush title="Transfer history" note="Most recent first">
        <DataTable
          minWidth={820}
          head={[
            "Date", "Product", "Route",
            { label: "Qty", align: "right" },
            { label: "Left at source", align: "right" },
            "Note", "By",
          ]}
          empty={
            transfers.length === 0 ? (
              <Empty
                icon={ArrowLeftRight}
                title="No transfers yet"
                hint="Stock you move between branches shows up here and in the audit."
              />
            ) : null
          }
        >
          {transfers.map((t, i) => (
            <tr key={`${t.stockId}-${t.date}-${i}`} className={tr}>
              <td className={`${td} whitespace-nowrap text-slate-500`}>{when(t.date)}</td>
              <td className={`${td} font-medium text-slate-900`}>{t.stockName}</td>
              <td className={td}>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-600">
                  {t.from}
                  <ArrowRight className="h-3 w-3 text-amber-500" />
                  {t.to}
                </span>
              </td>
              <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>
                {num(t.quantity)}
                {t.unit && <span className="ml-1 text-xs font-normal text-slate-400">{t.unit}</span>}
              </td>
              <td className={`${td} text-right tabular-nums text-slate-500`}>
                {t.remainingAtSource ?? <span className="text-slate-300">—</span>}
              </td>
              <td className={`${td} text-slate-500`}>{t.remarks || "—"}</td>
              <td className={`${td} whitespace-nowrap text-slate-500`}>{t.by}</td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </Page>
  );
}
