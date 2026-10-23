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

<<<<<<< HEAD
              <Field label="Branch" hint={branchRestricted ? null : "Leave empty to keep it unassigned"}>
                {branchRestricted ? (
                  <div className="flex h-10 items-center">
                    <Chip icon={MapPin} tone="emerald">{userBranch}</Chip>
=======
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">

        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                  <PackagePlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900 leading-tight">Create Stock Item</h1>
                  <p className="text-xs text-gray-400">Add a new product to inventory</p>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full">
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${completionPct}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-600">{completionPct}%</span>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6">
          <form onSubmit={handleSubmit}>
            <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6">

              <div className="xl:col-span-2 space-y-5">

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <SectionHeader icon={Package} title="Product Identity" subtitle="Name and branch location" color="emerald" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Product Name <span className="text-red-400 normal-case">*</span></label>
                      <input type="text" name="name" value={formData.name} onChange={handleChange}
                        required placeholder="e.g., Minoxidil 5%, Surgical Gloves"
                        className={`${inputCls} text-base font-medium`} />
                    </div>
                    <div>
                      <label className={labelCls}>Branch / Location</label>
                      {branchRestricted ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <MapPin className="w-3.5 h-3.5" /> {userBranch}
                        </div>
                      ) : (
                        <select name="location" value={formData.location} onChange={handleChange} className={inputCls}>
                          <option value="">All Branches</option>
                          <option value="Delhi">Delhi</option>
                          <option value="Mumbai">Mumbai</option>
                          <option value="Hyderabad">Hyderabad</option>
                          <option value="Noida">Noida</option>
                          <option value="Gurgaon">Gurgaon</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Expiry Date</label>
                      <input type="date" name="expiry" value={formData.expiry} onChange={handleChange} className={inputCls} />
                      {isExpiringSoon && (
                        <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Expiring within 30 days
                        </p>
                      )}
                      {isExpired && (
                        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> This date is already past
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <SectionHeader icon={IndianRupee} title="Pricing" subtitle="MRP, cost price and selling price" color="indigo" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>MRP <span className="text-red-400 normal-case">*</span></label>
                      <CurrencyInput name="mrp" value={formData.mrp} onChange={handleChange} required placeholder="0.00" />
                    </div>
                    <div>
                      <label className={labelCls}>Purchase Price <span className="text-red-400 normal-case">*</span></label>
                      <CurrencyInput name="purchaseAmt" value={formData.purchaseAmt} onChange={handleChange} required placeholder="0.00" />
                    </div>
                    <div>
                      <label className={labelCls}>Sell Price <span className="text-red-400 normal-case">*</span></label>
                      <CurrencyInput name="soldAmt" value={formData.soldAmt} onChange={handleChange} required placeholder="0.00" />
                    </div>
                  </div>

                  {(buyPrice > 0 || sellPrice > 0) && (
                    <div className={`mt-4 rounded-xl px-4 py-3 flex items-center justify-between ${
                      margin > 0 ? "bg-emerald-50 border border-emerald-100" :
                      margin < 0 ? "bg-red-50 border border-red-100" :
                      "bg-gray-50 border border-gray-100"
                    }`}>
                      <div className="flex items-center gap-2">
                        {margin > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
                         margin < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> :
                         <Minus className="w-4 h-4 text-gray-400" />}
                        <span className={`text-xs font-semibold ${
                          margin > 0 ? "text-emerald-700" : margin < 0 ? "text-red-600" : "text-gray-500"
                        }`}>
                          {margin > 0 ? "Profitable margin" : margin < 0 ? "Selling below cost!" : "Break-even"}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${
                          margin > 0 ? "text-emerald-700" : margin < 0 ? "text-red-600" : "text-gray-500"
                        }`}>
                          {margin >= 0 ? "+" : ""}₹{Math.abs(margin).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {marginPct !== null && (
                          <p className="text-[10px] text-gray-400">{marginPct}% margin</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <SectionHeader icon={Weight} title="Physical Details" subtitle="Unit, weight and tax info" color="violet" />

                  <div className="mb-4">
                    <label className={labelCls}>Unit</label>
                    <div className="flex flex-wrap gap-2">
                      {UNITS.map(u => (
                        <button key={u.value} type="button"
                          onClick={() => setFormData(p => ({ ...p, unit: p.unit === u.value ? "" : u.value }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            formData.unit === u.value
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-700"
                          }`}>
                          {u.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Weight {formData.unit && <span className="normal-case text-gray-400">({formData.unit})</span>}</label>
                      <div className="relative">
                        <input type="number" name="weight" value={formData.weight} onChange={handleChange}
                          min="0" step="0.01" placeholder="0.00" className={`${inputCls} pr-12`} />
                        {formData.unit && (
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <span className="text-xs font-semibold text-gray-400">
                              {UNITS.find(u => u.value === formData.unit)?.short || formData.unit}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>GST Number</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <Hash className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <input type="text" name="gstNo" value={formData.gstNo} onChange={handleChange}
                          placeholder="27AABCU9603R1ZM"
                          className={`${inputCls} pl-8 uppercase tracking-widest`} />
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
>>>>>>> 61494038b829dc998ade6b72a564481bdbbf80db
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
