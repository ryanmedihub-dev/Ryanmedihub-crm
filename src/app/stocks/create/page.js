"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MapPin, Check } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import { Page, Card, Field, Btn, Chip, Row, input, inr } from "@/components/stocks/ui";

const UNITS = ["pieces", "boxes", "bottles", "packets", "kg", "grams", "liters", "ml"];
const BRANCHES = ["Delhi", "Mumbai", "Hyderabad", "Noida"];

export default function CreateStockPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "", location: "", mrp: "", gstNo: "",
    weight: "", unit: "", expiry: "", purchaseAmt: "", soldAmt: "",
  });

  const isAdmin = session?.user?.role === "admin";
  const userBranch = session?.user?.branch;
  const branchRestricted = !isAdmin && userBranch;

  const buyPrice  = parseFloat(formData.purchaseAmt) || 0;
  const sellPrice = parseFloat(formData.soldAmt)     || 0;
  const margin    = sellPrice - buyPrice;
  const marginPct = buyPrice > 0 ? ((margin / buyPrice) * 100).toFixed(1) : null;

  const expiryDays = formData.expiry
    ? Math.round((new Date(formData.expiry) - new Date()) / 86400000)
    : null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error("Give the product a name");
    if (!formData.mrp)         return toast.error("MRP is required");

    setLoading(true);
    try {
      const res = await fetch("/api/stocks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        formData.name,
          location:    formData.location    || undefined,
          mrp:         Number(formData.mrp),
          gstNo:       formData.gstNo       || undefined,
          weight:      formData.weight ? Number(formData.weight) : undefined,
          unit:        formData.unit        || undefined,
          expiry:      formData.expiry      || undefined,
          purchaseAmt: formData.purchaseAmt || undefined,
          soldAmt:     formData.soldAmt     || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${formData.name} added to the catalogue`);
        router.push("/stocks/dashboard");
      } else {
        toast.error(data.message || "Could not save the product");
      }
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page
      sidebar={Sidebar}
      section="Catalogue"
      title="New product"
      lead="Create the item first, then record purchases against it"
      back="/stocks/dashboard"
      actions={
        <>
          <Btn onClick={() => router.push("/stocks/dashboard")} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" icon={Check} busy={loading} onClick={handleSubmit}>Save product</Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Product">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required className="sm:col-span-2">
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Minoxidil 5%"
                  className={input}
                />
              </Field>

              <Field label="Branch" hint={branchRestricted ? null : "Leave empty to keep it unassigned"}>
                {branchRestricted ? (
                  <div className="flex h-10 items-center">
                    <Chip icon={MapPin} tone="emerald">{userBranch}</Chip>
                  </div>
                ) : (
                  <select name="location" value={formData.location} onChange={handleChange} className={input}>
                    <option value="">Unassigned</option>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
              </Field>

              <Field
                label="Expiry"
                hint={
                  expiryDays === null
                    ? "Optional"
                    : expiryDays < 0
                    ? "This date has already passed"
                    : expiryDays <= 30
                    ? `Expires in ${expiryDays} days`
                    : null
                }
              >
                <input type="date" name="expiry" value={formData.expiry} onChange={handleChange} className={input} />
              </Field>

              <Field label="Unit">
                <select name="unit" value={formData.unit} onChange={handleChange} className={input}>
                  <option value="">Not set</option>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>

              <Field label="Weight or volume" hint="Number only, paired with the unit above">
                <input
                  type="number" step="0.01" min="0"
                  name="weight" value={formData.weight} onChange={handleChange}
                  placeholder="0"
                  className={input}
                />
              </Field>
            </div>
          </Card>

          <Card title="Pricing" note="Buy and sell prices drive the margin and the audit's profit figures">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="MRP" required>
                <input
                  type="number" step="0.01" min="0"
                  name="mrp" value={formData.mrp} onChange={handleChange}
                  required placeholder="0"
                  className={input}
                />
              </Field>
              <Field label="Purchase price">
                <input
                  type="number" step="0.01" min="0"
                  name="purchaseAmt" value={formData.purchaseAmt} onChange={handleChange}
                  placeholder="0"
                  className={input}
                />
              </Field>
              <Field label="Selling price">
                <input
                  type="number" step="0.01" min="0"
                  name="soldAmt" value={formData.soldAmt} onChange={handleChange}
                  placeholder="0"
                  className={input}
                />
              </Field>
            </div>
          </Card>

          <Card title="Tax">
            <Field label="GST number" hint="Optional, as printed on the supplier invoice">
              <input
                name="gstNo" value={formData.gstNo} onChange={handleChange}
                placeholder="22AAAAA0000A1Z5"
                className={`${input} font-mono uppercase sm:max-w-xs`}
              />
            </Field>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Summary">
            <p className="text-[15px] font-medium text-slate-900">{formData.name || "Unnamed product"}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {branchRestricted ? userBranch : formData.location || "No branch"}
              {formData.unit ? ` · sold by ${formData.unit}` : ""}
            </p>

            <div className="mt-4">
              <Row label="MRP">{formData.mrp ? inr(formData.mrp) : "—"}</Row>
              <Row label="Buy">{buyPrice ? inr(buyPrice) : "—"}</Row>
              <Row label="Sell">{sellPrice ? inr(sellPrice) : "—"}</Row>
              <Row label="Margin per unit" tone={margin > 0 ? "emerald" : margin < 0 ? "rose" : undefined}>
                {buyPrice && sellPrice ? `${inr(margin)}${marginPct ? ` (${marginPct}%)` : ""}` : "—"}
              </Row>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              New products start at zero quantity. Use Record purchase to bring stock in.
            </p>
          </Card>
        </div>
      </form>
    </Page>
  );
}
