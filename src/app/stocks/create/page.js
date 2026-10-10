"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, PackagePlus, Package, MapPin, IndianRupee,
  Tag, Weight, Calendar, Hash, CheckCircle2, AlertCircle,
  TrendingUp, TrendingDown, Minus, Sparkles, ChevronRight,
} from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";

const UNITS = [
  { value: "pieces", label: "Pieces", short: "pcs" },
  { value: "kg",     label: "Kg",     short: "kg"  },
  { value: "grams",  label: "Grams",  short: "g"   },
  { value: "liters", label: "Liters", short: "L"   },
  { value: "ml",     label: "mL",     short: "mL"  },
  { value: "boxes",  label: "Boxes",  short: "box" },
  { value: "bottles",label: "Bottles",short: "btl" },
  { value: "packets",label: "Packets",short: "pkt" },
];

function CurrencyInput({ name, value, onChange, placeholder, required, disabled }) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <IndianRupee className="w-4 h-4 text-gray-400" />
      </div>
      <input
        type="number"
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        min="0"
        step="0.01"
        placeholder={placeholder || "0.00"}
        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white transition-colors disabled:bg-gray-50 disabled:text-gray-400"
      />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, color = "emerald" }) {
  const colors = {
    emerald: "from-emerald-500 to-teal-600",
    indigo:  "from-indigo-500 to-indigo-600",
    violet:  "from-violet-500 to-purple-600",
  };
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-8 h-8 rounded-lg bg-linear-to-br ${colors[color]} flex items-center justify-center shrink-0 shadow-sm`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function CreateStockPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "", location: "", mrp: "", gstNo: "",
    weight: "", unit: "", expiry: "", purchaseAmt: "", soldAmt: "",
  });

  const isAdmin = session?.user?.role === "admin";
  const userBranch = session?.user?.branch;
  const branchRestricted = !isAdmin && userBranch;

  const mrp      = parseFloat(formData.mrp)         || 0;
  const buyPrice = parseFloat(formData.purchaseAmt) || 0;
  const sellPrice= parseFloat(formData.soldAmt)     || 0;
  const margin   = sellPrice - buyPrice;
  const marginPct= buyPrice > 0 ? ((margin / buyPrice) * 100).toFixed(1) : null;

  const required = ["name", "mrp", "purchaseAmt", "soldAmt"];
  const optional = ["location", "unit", "gstNo", "weight", "expiry"];
  const filledRequired = required.filter(k => formData[k]).length;
  const filledOptional = optional.filter(k => formData[k]).length;
  const completionPct  = Math.round(
    ((filledRequired / required.length) * 70) + ((filledOptional / optional.length) * 30)
  );

  const isExpiringSoon = formData.expiry && (() => {
    const days = (new Date(formData.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days > 0;
  })();
  const isExpired = formData.expiry && new Date(formData.expiry) <= new Date();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, [name]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) { setError("Product name is required."); return; }
    if (!formData.mrp)  { setError("MRP is required."); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/stocks/create", {
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
        setSuccess(true);
        setTimeout(() => router.push("/stocks/dashboard"), 1400);
      } else {
        setError(data.message || "Failed to create stock item.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white transition-colors";
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  if (success) {
    return (
      <section className="flex min-h-screen bg-[#f8f9fc]">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Stock Item Created!</h2>
            <p className="text-sm text-gray-500">Redirecting to dashboard…</p>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen bg-[#f8f9fc]">
      <Sidebar />

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
                  </div>
                )}

                <div className="flex gap-3 pb-6">
                  <button type="submit" disabled={loading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm disabled:opacity-50 transition-all">
                    {loading ? (
                      <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>Creating…</>
                    ) : (
                      <><PackagePlus className="w-4 h-4" />Create Stock Item</>
                    )}
                  </button>
                  <button type="button" onClick={() => router.back()}
                    className="px-5 py-2.5 bg-white text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>

              <div className="xl:col-span-1">
                <div className="sticky top-24 space-y-4">

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="h-1 bg-linear-to-r from-emerald-500 to-teal-500" />
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Live Preview</span>
                      </div>

                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                          {formData.name ? formData.name.charAt(0).toUpperCase() : <Package className="w-6 h-6 opacity-60" />}
                        </div>
                        <div>
                          <p className={`font-bold leading-tight ${formData.name ? "text-gray-900" : "text-gray-300"}`}>
                            {formData.name || "Product Name"}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formData.location || "All Branches"}
                            {formData.unit && ` · ${UNITS.find(u => u.value === formData.unit)?.label}`}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {[
                          { label: "MRP",            value: mrp,      color: "text-indigo-600" },
                          { label: "Purchase Price", value: buyPrice,  color: "text-gray-700"   },
                          { label: "Sell Price",     value: sellPrice, color: "text-emerald-600"},
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">{label}</span>
                            <span className={`font-bold ${value ? color : "text-gray-200"}`}>
                              {value ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                            </span>
                          </div>
                        ))}
                        {(buyPrice > 0 && sellPrice > 0) && (
                          <div className={`flex justify-between items-center text-sm pt-2.5 border-t ${
                            margin > 0 ? "border-emerald-100" : margin < 0 ? "border-red-100" : "border-gray-100"
                          }`}>
                            <span className="text-gray-500">Margin</span>
                            <div className="text-right">
                              <span className={`font-bold ${margin > 0 ? "text-emerald-600" : margin < 0 ? "text-red-500" : "text-gray-400"}`}>
                                {margin >= 0 ? "+" : ""}₹{Math.abs(margin).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              {marginPct !== null && (
                                <p className="text-[10px] text-gray-400">{marginPct}%</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {formData.expiry && (
                        <div className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 ${
                          isExpired      ? "bg-red-50 text-red-600 border border-red-100" :
                          isExpiringSoon ? "bg-amber-50 text-amber-700 border border-amber-100" :
                          "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        }`}>
                          <Calendar className="w-3.5 h-3.5" />
                          {isExpired ? "Already expired" :
                           isExpiringSoon ? "Expiring soon" :
                           `Expires ${new Date(formData.expiry).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}`}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Required Fields</p>
                    <div className="space-y-2">
                      {[
                        { key: "name",        label: "Product Name"    },
                        { key: "mrp",         label: "MRP"             },
                        { key: "purchaseAmt", label: "Purchase Price"  },
                        { key: "soldAmt",     label: "Sell Price"      },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-all ${
                            formData[key] ? "bg-emerald-500" : "bg-gray-100 border border-gray-200"
                          }`}>
                            {formData[key] && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>}
                          </div>
                          <span className={`text-xs font-medium ${formData[key] ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>Form completion</span>
                        <span className="font-bold text-gray-700">{completionPct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                          style={{ width: `${completionPct}%` }} />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </form>
        </div>
      </main>
    </section>
  );
}
