"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Pencil, MapPin, History } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Stats, Status, Chip, Btn, Row, Spinner, Empty,
  inr, num, day, when,
} from "@/components/stocks/ui";

const FIELD_LABELS = {
  name: "Name", location: "Branch", mrp: "MRP", gstNo: "GST number",
  weight: "Weight", unit: "Unit", expiry: "Expiry",
  purchaseAmt: "Purchase price", soldAmt: "Selling price",
  totalQuantity: "Quantity", transferOut: "Transferred out", transferIn: "Transferred in",
  transferTo: "Moved to", transferFrom: "Moved from", remarks: "Note", vendor: "Vendor",
};

export default function ViewStockPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const stockId = params.id;

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState(null);
  const [tab, setTab] = useState("details");

  useEffect(() => { if (stockId) fetchStock(); }, [stockId]);

  const fetchStock = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/stocks/get?id=${stockId}`);
      const data = await res.json();

      if (data.success && data.data) {
        setStock(data.data);
      } else {
        toast.error(
          res.status === 403
            ? "That product belongs to another branch"
            : data.message || "Could not load this product"
        );
        router.push("/stocks/dashboard");
      }
    } catch {
      toast.error("Could not load this product");
      router.push("/stocks/dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Page sidebar={Sidebar} section="Catalogue" title="Product">
        <Card><Spinner note="Loading product" /></Card>
      </Page>
    );
  }
  if (!stock) return null;

  const low = (stock.totalQuantity || 0) <= 10;
  const expired = stock.expiry && new Date(stock.expiry) <= new Date();
  const editors = stock.editors || [];
  const margin = (stock.soldAmt || 0) - (stock.purchaseAmt || 0);

  return (
    <Page
      sidebar={Sidebar}
      section="Catalogue"
      title={stock.name}
      lead={stock.location ? `${stock.location} branch` : "No branch assigned"}
      back="/stocks/dashboard"
      actions={
        <>
          {expired ? <Status tone="bad">Expired</Status> : low ? <Status tone="low">Running low</Status> : <Status tone="ok">In stock</Status>}
          <Btn variant="primary" icon={Pencil} onClick={() => router.push(`/stocks/edit/${stockId}`)}>Edit</Btn>
        </>
      }
    >
      <Stats
        items={[
          { label: stock.unit ? `On hand (${stock.unit})` : "On hand", value: num(stock.totalQuantity), tone: expired ? "rose" : low ? "amber" : undefined },
          { label: "MRP", value: inr(stock.mrp) },
          { label: "Stock value", value: inr((stock.totalQuantity || 0) * (stock.mrp || 0)) },
          { label: "Margin per unit", value: inr(margin), tone: margin < 0 ? "rose" : undefined },
        ]}
      />

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {[
          { id: "details", label: "Details" },
          { id: "history", label: `History${editors.length ? ` (${editors.length})` : ""}` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Product">
            <Row label="Name">{stock.name}</Row>
            <Row label="Branch">
              {stock.location ? <Chip icon={MapPin}>{stock.location}</Chip> : "Unassigned"}
            </Row>
            <Row label="Unit">{stock.unit || "—"}</Row>
            <Row label="Weight or volume">{stock.weight || "—"}</Row>
            <Row label="Expiry" tone={expired ? "rose" : undefined}>{stock.expiry ? day(stock.expiry) : "—"}</Row>
            <Row label="GST number">{stock.gstNo || "—"}</Row>
          </Card>

          <Card title="Money">
            <Row label="MRP" tone="emerald">{inr(stock.mrp)}</Row>
            <Row label="Purchase price">{stock.purchaseAmt ? inr(stock.purchaseAmt) : "—"}</Row>
            <Row label="Selling price">{stock.soldAmt ? inr(stock.soldAmt) : "—"}</Row>
            <Row label="Margin per unit" tone={margin > 0 ? "emerald" : margin < 0 ? "rose" : undefined}>
              {stock.purchaseAmt && stock.soldAmt ? inr(margin) : "—"}
            </Row>
            <Row label="Value on hand">{inr((stock.totalQuantity || 0) * (stock.mrp || 0))}</Row>
          </Card>

          <Card title="Added by">
            <Row label="Name">{stock.createdBy?.name || "—"}</Row>
            <Row label="Email">
              <span className="font-normal">{stock.createdBy?.email || "—"}</span>
            </Row>
            <Row label="Branch">{stock.createdBy?.branch || "—"}</Row>
            <Row label="Added on">{day(stock.createdBy?.date || stock.createdAt)}</Row>
          </Card>

          <Card title="Record">
            <Row label="Product id">
              <span className="font-mono text-xs">{stock._id?.slice(-12)}</span>
            </Row>
            <Row label="Created">{day(stock.createdAt)}</Row>
            <Row label="Last updated">{day(stock.updatedAt)}</Row>
            <Row label="Edits logged">{num(editors.length)}</Row>
            <Row label="Vendors linked">{num(stock.vendors?.length || 0)}</Row>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <Card flush title="Every change to this product" note="Newest first">
          {editors.length === 0 ? (
            <Empty icon={History} title="No changes yet" hint="Purchases, transfers and edits all land here." />
          ) : (
            <ol className="divide-y divide-slate-100">
              {[...editors].reverse().map((edit, i) => {
                const isTransfer = edit.updatedFields?.some((f) => f.name === "transferOut" || f.name === "transferIn");
                const isPurchase = edit.updatedFields?.some((f) => f.name === "totalQuantity");
                return (
                  <li key={i} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {isTransfer ? (
                        <Status tone="low">Transfer</Status>
                      ) : isPurchase ? (
                        <Status tone="info">Purchase</Status>
                      ) : (
                        <Status tone="neutral">Edit</Status>
                      )}
                      <span className="text-sm font-medium text-slate-900">{edit.name || "Unknown user"}</span>
                      {edit.branch && <span className="text-xs text-slate-400">{edit.branch}</span>}
                      <span className="ml-auto text-xs text-slate-400">{when(edit.date)}</span>
                    </div>

                    {edit.updatedFields?.length > 0 && (
                      <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                        {edit.updatedFields.map((f, j) => (
                          <div key={j} className="flex items-baseline gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                            <span className="text-slate-500">{FIELD_LABELS[f.name] || f.name}</span>
                            <span className="ml-auto flex items-baseline gap-1.5 tabular-nums">
                              <span className="text-slate-400 line-through">{f.previousValue || "empty"}</span>
                              <span className="font-medium text-slate-900">{f.newValue || "empty"}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      )}

    </Page>
  );
}
