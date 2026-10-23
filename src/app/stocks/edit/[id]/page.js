"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, MapPin, Eye } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Field, Btn, Chip, Row, Spinner,
  input, inputEdited, inr,
} from "@/components/stocks/ui";

const UNITS = ["pieces", "boxes", "bottles", "packets", "kg", "grams", "liters", "ml"];
const BRANCHES = ["Delhi", "Mumbai", "Hyderabad", "Noida"];

const LABELS = {
  name: "Name", location: "Branch", mrp: "MRP", gstNo: "GST number",
  weight: "Weight", unit: "Unit", expiry: "Expiry",
  purchaseAmt: "Purchase price", soldAmt: "Selling price",
};

export default function EditStockPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const toast = useToast();
  const stockId = params.id;

  const isAdmin = session?.user?.role === "admin";
  const userBranch = session?.user?.branch;
  const branchRestricted = !isAdmin && userBranch;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [onHand, setOnHand] = useState(0);
  const [originalData, setOriginalData] = useState(null);
  const [formData, setFormData] = useState({
    name: "", location: "", mrp: "", gstNo: "",
    weight: "", unit: "", expiry: "", purchaseAmt: "", soldAmt: "",
  });

  useEffect(() => { if (stockId) fetchStock(); }, [stockId]);

  const fetchStock = async () => {
    try {
      setFetching(true);
      const res = await fetch(`/api/stocks/get?id=${stockId}`);
      const data = await res.json();

      if (data.success && data.data) {
        const stock = data.data;
        const stockData = {
          name: stock.name || "",
          location: stock.location || "",
          mrp: stock.mrp || "",
          gstNo: stock.gstNo || "",
          weight: stock.weight || "",
          unit: stock.unit || "",
          soldAmt: stock.soldAmt || "",
          purchaseAmt: stock.purchaseAmt || "",
          expiry: stock.expiry ? new Date(stock.expiry).toISOString().split("T")[0] : "",
        };
        setFormData(stockData);
        setOriginalData(stockData);
        setOnHand(stock.totalQuantity || 0);
      } else {
        toast.error(data.message || "Could not load this product");
        router.push("/stocks/dashboard");
      }
    } catch {
      toast.error("Could not load this product");
      router.push("/stocks/dashboard");
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getChangedFields = () => {
    if (!originalData) return [];
    return Object.keys(formData)
      .map((key) => ({
        name: key,
        previousValue: originalData[key]?.toString() || "",
        newValue: formData[key]?.toString() || "",
      }))
      .filter((f) => f.previousValue !== f.newValue);
  };

  const changedFields = getChangedFields();
  const isEdited = (field) => changedFields.some((f) => f.name === field);
  const cls = (field) => (isEdited(field) ? inputEdited : input);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error("The product needs a name");
    if (!formData.mrp)         return toast.error("MRP is required");
    if (changedFields.length === 0) return toast.info("Nothing has changed yet");

    setLoading(true);
    try {
      const res = await fetch("/api/stocks/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: stockId,
          name: formData.name,
          location: formData.location || undefined,
          mrp: Number(formData.mrp),
          gstNo: formData.gstNo || undefined,
          weight: formData.weight ? Number(formData.weight) : undefined,
          unit: formData.unit || undefined,
          expiry: formData.expiry || undefined,
          purchaseAmt: formData.purchaseAmt || undefined,
          soldAmt: formData.soldAmt || undefined,
          updatedFields: changedFields,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${formData.name} updated`);
        router.push("/stocks/dashboard");
      } else {
        toast.error(data.message || "Could not save the changes");
      }
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (changedFields.length && !confirm("Leave without saving your changes?")) return;
    router.push("/stocks/dashboard");
  };

  if (fetching) {
    return (
      <Page sidebar={Sidebar} section="Catalogue" title="Edit product">
        <Card><Spinner note="Loading product" /></Card>
      </Page>
    );
  }

  const margin = (parseFloat(formData.soldAmt) || 0) - (parseFloat(formData.purchaseAmt) || 0);

  return (
    <Page
      sidebar={Sidebar}
      section="Catalogue"
      title={originalData?.name || "Edit product"}
      lead={changedFields.length ? `${changedFields.length} unsaved ${changedFields.length === 1 ? "change" : "changes"}` : "No changes yet"}
      back="/stocks/dashboard"
      actions={
        <>
          <Btn icon={Eye} onClick={() => router.push(`/stocks/view/${stockId}`)}>View</Btn>
          <Btn onClick={handleCancel} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" icon={Check} busy={loading} onClick={handleSubmit} disabled={!changedFields.length}>
            Save changes
          </Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Product">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required className="sm:col-span-2">
                <input name="name" value={formData.name} onChange={handleChange} className={cls("name")} required />
              </Field>

              <Field label="Branch">
                {branchRestricted ? (
                  <div className="flex h-10 items-center">
                    <Chip icon={MapPin} tone="emerald">{userBranch}</Chip>
                  </div>
                ) : (
                  <select name="location" value={formData.location} onChange={handleChange} className={cls("location")}>
                    <option value="">Unassigned</option>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
              </Field>

              <Field label="Expiry">
                <input type="date" name="expiry" value={formData.expiry} onChange={handleChange} className={cls("expiry")} />
              </Field>

              <Field label="Unit">
                <select name="unit" value={formData.unit} onChange={handleChange} className={cls("unit")}>
                  <option value="">Not set</option>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>

              <Field label="Weight or volume">
                <input
                  type="number" step="0.01" min="0"
                  name="weight" value={formData.weight} onChange={handleChange}
                  className={cls("weight")}
                />
              </Field>
            </div>
          </Card>

          <Card title="Pricing">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="MRP" required>
                <input type="number" step="0.01" min="0" name="mrp" value={formData.mrp} onChange={handleChange} className={cls("mrp")} required />
              </Field>
              <Field label="Purchase price">
                <input type="number" step="0.01" min="0" name="purchaseAmt" value={formData.purchaseAmt} onChange={handleChange} className={cls("purchaseAmt")} />
              </Field>
              <Field label="Selling price">
                <input type="number" step="0.01" min="0" name="soldAmt" value={formData.soldAmt} onChange={handleChange} className={cls("soldAmt")} />
              </Field>
            </div>
          </Card>

          <Card title="Tax">
            <Field label="GST number">
              <input
                name="gstNo" value={formData.gstNo} onChange={handleChange}
                className={`${cls("gstNo")} font-mono uppercase sm:max-w-xs`}
              />
            </Field>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card title="On hand">
            <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
              {onHand}
              {formData.unit && <span className="ml-1.5 text-sm font-normal text-slate-400">{formData.unit}</span>}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Quantity is not editable here. Use Record purchase to add stock, or Transfer stock to move it.
            </p>
            <div className="mt-4">
              <Row label="Stock value">{inr(onHand * (parseFloat(formData.mrp) || 0))}</Row>
              <Row label="Margin per unit" tone={margin > 0 ? "emerald" : margin < 0 ? "rose" : undefined}>
                {formData.purchaseAmt && formData.soldAmt ? inr(margin) : "—"}
              </Row>
            </div>
          </Card>

          <Card title="Unsaved changes">
            {changedFields.length === 0 ? (
              <p className="text-sm text-slate-400">Every edit is logged against your name once saved.</p>
            ) : (
              <div className="space-y-3">
                {changedFields.map((f) => (
                  <div key={f.name} className="text-sm">
                    <p className="text-xs text-slate-500">{LABELS[f.name] || f.name}</p>
                    <p className="mt-0.5 text-slate-400 line-through">{f.previousValue || "empty"}</p>
                    <p className="font-medium text-slate-900">{f.newValue || "empty"}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </form>
    </Page>
  );
}
