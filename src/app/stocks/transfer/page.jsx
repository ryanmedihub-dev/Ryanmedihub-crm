"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, ArrowLeftRight, MapPin, Check, Package } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import SearchableSelect from "@/components/SearchableSelect";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Field, Btn, Chip, Row, DataTable, Empty, Spinner,
  input, num, when, td, tr,
} from "@/components/stocks/ui";

export default function StockTransferPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stocks, setStocks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [form, setForm] = useState({ stockId: "", toLocation: "", quantity: "", remarks: "" });

  const branchRestricted = session?.user?.branch && !["admin", "super-admin"].includes(session?.user?.role);

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

  useEffect(() => { loadData(); }, []);

  const selected = useMemo(() => stocks.find((s) => s._id === form.stockId), [stocks, form.stockId]);
  const available = selected?.totalQuantity || 0;
  const qty = parseFloat(form.quantity) || 0;
  const remaining = available - qty;
  const destination = form.toLocation.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.stockId)   return toast.error("Pick the product to move");
    if (!destination)    return toast.error("Say where the stock is going");
    if (qty <= 0)        return toast.error("Enter a quantity above zero");
    if (qty > available) return toast.error(`Only ${num(available)} on hand at ${selected?.location || "the source"}`);
    if (destination === (selected?.location || "")) return toast.error("Pick a destination other than the source");

    setLoading(true);
    try {
      const res = await fetch("/api/stocks/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId: form.stockId,
          toLocation: destination,
          quantity: qty,
          remarks: form.remarks,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setForm({ stockId: "", toLocation: "", quantity: "", remarks: "" });
        await loadData();
      } else {
        toast.error(data.message || "Could not move the stock");
      }
    } catch {
      toast.error("Could not reach the server. Try again.");
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
          <Btn variant="primary" icon={Check} busy={loading} onClick={handleSubmit}>Transfer stock</Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Movement">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product" required className="sm:col-span-2">
                <SearchableSelect
                  options={stocks.map((s) => ({
                    value: s._id,
                    label: `${s.name} — ${num(s.totalQuantity || 0)}${s.unit ? ` ${s.unit}` : ""} at ${s.location || "Unassigned"}`,
                  }))}
                  value={form.stockId}
                  onChange={(value) => setForm({ ...form, stockId: value })}
                  placeholder="Search products"
                />
              </Field>

              <Field label="From">
                <div className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {selected ? selected.location || "Unassigned" : "Pick a product first"}
                </div>
              </Field>

              <Field label="To" required hint="Pick a branch or type a new place — the product is created there if needed">
                <input
                  list="transfer-locations"
                  value={form.toLocation}
                  onChange={(e) => setForm({ ...form, toLocation: e.target.value })}
                  placeholder="GD, Warehouse, Mumbai"
                  className={input}
                  required
                />
                <datalist id="transfer-locations">
                  {locations.filter((l) => l !== selected?.location).map((l) => <option key={l} value={l} />)}
                </datalist>
              </Field>

              <Field
                label="Quantity"
                required
                error={qty > available && selected ? `Only ${num(available)} on hand` : null}
                hint={selected && qty > 0 && qty <= available
                  ? `${num(remaining)} left at ${selected.location || "Unassigned"} after this`
                  : selected ? `${num(available)} on hand` : null}
              >
                <input
                  type="number" step="0.01" min="0" max={available || undefined}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="0"
                  className={`${input} text-right tabular-nums`}
                  required
                />
              </Field>

              <Field label="Note">
                <input
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Why it is moving"
                  className={input}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Summary">
            {selected ? (
              <>
                <p className="text-[15px] font-medium text-slate-900">{selected.name}</p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                    {selected.location || "Unassigned"}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span className={`rounded-md px-2 py-1 font-medium ${destination ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"}`}>
                    {destination || "Destination"}
                  </span>
                </div>

                <div className="mt-4">
                  <Row label="Moving">{qty ? `${num(qty)}${selected.unit ? ` ${selected.unit}` : ""}` : "—"}</Row>
                  <Row label={`Left at ${selected.location || "source"}`} tone={remaining < 0 ? "rose" : undefined}>
                    {qty ? num(Math.max(remaining, 0)) : num(available)}
                  </Row>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Pick a product to see what moves where.</p>
            )}

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
              <Empty icon={ArrowLeftRight} title="No transfers yet" hint="Stock you move between branches shows up here and in the audit." />
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
