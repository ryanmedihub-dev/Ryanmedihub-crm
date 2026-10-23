"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus, Trash2, MapPin, Check, Package } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import SearchableSelect from "@/components/SearchableSelect";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Field, Btn, IconBtn, Chip, Row, Spinner,
  input, textarea, inr, num, th, td, tr,
} from "@/components/stocks/ui";

const METHODS = [
  ["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["banking", "Net banking"],
  ["bajaj_loan", "Bajaj loan"], ["fibe_loan", "Fibe loan"], ["other", "Other"],
];

const blankItem = () => ({ id: Date.now() + Math.random(), stockId: "", quantity: "", purchasePrice: "" });

export default function StockPurchasePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [stocks, setStocks] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [head, setHead] = useState({
    vendorId: "",
    paymentMethod: "cash",
    purchaseDate: new Date().toISOString().split("T")[0],
    remarks: "",
  });
  const [items, setItems] = useState([blankItem()]);

  const branchRestricted = session?.user?.branch && !["admin", "super-admin"].includes(session?.user?.role);

  useEffect(() => {
    (async () => {
      try {
        const [stockRes, vendorRes] = await Promise.all([
          fetch("/api/stocks/get"),
          fetch("/api/vendors/get"),
        ]);
        const stockData = await stockRes.json();
        const vendorData = await vendorRes.json();
        if (stockData.success) setStocks(stockData.data || []);
        if (vendorData.success) setVendors(vendorData.data || vendorData.vendors || []);
      } catch {
        toast.error("Could not load products and vendors");
      } finally {
        setFetching(false);
      }
    })();
  }, []);

  const lineTotal = (item) => (parseFloat(item.quantity) || 0) * (parseFloat(item.purchasePrice) || 0);
  const grandTotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const totalUnits = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);
  const vendor = vendors.find((v) => v._id === head.vendorId);

  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, [field]: value };
        if (field === "stockId" && value) {
          const picked = stocks.find((s) => s._id === value);
          if (picked && !next.purchasePrice) next.purchasePrice = picked.purchaseAmt || "";
        }
        return next;
      })
    );
  };

  const removeItem = (id) => {
    if (items.length === 1) return toast.info("A purchase needs at least one line");
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!head.vendorId) return toast.error("Pick the vendor this stock came from");
    for (const item of items) {
      if (!item.stockId)                            return toast.error("Every line needs a product");
      if (!item.quantity || +item.quantity <= 0)    return toast.error("Every line needs a quantity above zero");
      if (!item.purchasePrice || +item.purchasePrice <= 0) return toast.error("Every line needs a purchase price");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/stocks/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: head.vendorId,
          paymentMethod: head.paymentMethod,
          purchaseDate: head.purchaseDate,
          remarks: head.remarks,
          items: items.map((i) => ({
            stockId: i.stockId,
            quantity: parseFloat(i.quantity),
            purchasePrice: parseFloat(i.purchasePrice),
            totalAmount: lineTotal(i),
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Purchase recorded — ${data.itemsProcessed} ${data.itemsProcessed === 1 ? "line" : "lines"} added to stock`);
        router.push("/stocks/dashboard");
      } else {
        toast.error(data.message || "Could not record the purchase");
      }
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <Page sidebar={Sidebar} section="Inventory" title="Record purchase">
        <Card><Spinner note="Loading products and vendors" /></Card>
      </Page>
    );
  }

  return (
    <Page
      sidebar={Sidebar}
      section="Inventory"
      title="Record purchase"
      lead="Bring stock in from a vendor and raise the quantity on hand"
      back="/stocks/dashboard"
      actions={
        <>
          {branchRestricted && <Chip icon={MapPin}>{session.user.branch}</Chip>}
          <Btn onClick={() => router.push("/stocks/dashboard")} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" icon={Check} busy={loading} onClick={handleSubmit}>Record purchase</Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Purchase">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Vendor" required className="sm:col-span-2">
                <SearchableSelect
                  options={vendors.map((v) => ({ value: v._id, label: v.contact ? `${v.name} — ${v.contact}` : v.name }))}
                  value={head.vendorId}
                  onChange={(value) => setHead({ ...head, vendorId: value })}
                  placeholder="Search vendors"
                />
              </Field>

              <Field label="Paid by">
                <select
                  value={head.paymentMethod}
                  onChange={(e) => setHead({ ...head, paymentMethod: e.target.value })}
                  className={input}
                >
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>

              <Field label="Purchase date">
                <input
                  type="date"
                  value={head.purchaseDate}
                  onChange={(e) => setHead({ ...head, purchaseDate: e.target.value })}
                  className={input}
                  required
                />
              </Field>

              <Field label="Note" className="sm:col-span-2">
                <textarea
                  rows="2"
                  value={head.remarks}
                  onChange={(e) => setHead({ ...head, remarks: e.target.value })}
                  placeholder="Invoice number, delivery details"
                  className={`${textarea} resize-none`}
                />
              </Field>
            </div>
          </Card>

          <Card
            flush
            title="Lines"
            note="Quantity is added to whatever is already on hand"
            action={<Btn variant="ghost" icon={Plus} onClick={() => setItems([...items, blankItem()])}>Add line</Btn>}
          >
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="bg-slate-50/70">
                    <th className={`${th} w-10 text-center`}>#</th>
                    <th className={th}>Product</th>
                    <th className={`${th} w-28`}>Quantity</th>
                    <th className={`${th} w-32`}>Unit price</th>
                    <th className={`${th} w-28 text-right`}>Line total</th>
                    <th className={`${th} w-12`} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const picked = stocks.find((s) => s._id === item.stockId);
                    return (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className={`${td} text-center text-xs text-slate-400`}>{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <SearchableSelect
                            options={stocks.map((s) => ({
                              value: s._id,
                              label: `${s.name} — ${num(s.totalQuantity || 0)} on hand${s.location ? ` · ${s.location}` : ""}`,
                            }))}
                            value={item.stockId}
                            onChange={(value) => updateItem(item.id, "stockId", value)}
                            placeholder="Search products"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number" step="0.01" min="0"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                            placeholder="0"
                            className={`${input} text-right tabular-nums`}
                            required
                          />
                          {picked?.unit && <p className="mt-1 text-xs text-slate-400">{picked.unit}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number" step="0.01" min="0"
                            value={item.purchasePrice}
                            onChange={(e) => updateItem(item.id, "purchasePrice", e.target.value)}
                            placeholder="0"
                            className={`${input} text-right tabular-nums`}
                            required
                          />
                        </td>
                        <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>
                          {lineTotal(item) ? inr(lineTotal(item)) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <IconBtn
                            icon={Trash2}
                            tone="rose"
                            label="Remove line"
                            onClick={() => removeItem(item.id)}
                            disabled={items.length === 1}
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
            {vendor ? (
              <>
                <p className="text-[15px] font-medium text-slate-900">{vendor.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {vendor.DealsIn || "Vendor"}
                  {vendor.contact ? ` · ${vendor.contact}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">No vendor picked yet</p>
            )}

            <div className="mt-4">
              <Row label="Lines">{num(items.length)}</Row>
              <Row label="Units coming in">{num(totalUnits)}</Row>
              <Row label="Paid by">{METHODS.find(([v]) => v === head.paymentMethod)?.[1]}</Row>
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
              <span className="text-sm font-medium text-slate-700">Total</span>
              <span className="text-xl font-semibold tabular-nums text-slate-900">{inr(grandTotal)}</span>
            </div>

            <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
              <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Each line also updates that product&apos;s purchase price and vendor.
            </p>
          </Card>
        </div>
      </form>
    </Page>
  );
}
