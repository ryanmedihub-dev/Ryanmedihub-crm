"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { ArrowLeft, Loader2, Store } from "lucide-react";

const CATEGORY_SUGGESTIONS = [
  "Surgical Equipment",
  "Medicines",
  "Hair Care",
  "Lab Supplies",
  "Consumables",
  "PPE Kits",
  "Instruments",
  "Cosmetics",
];

const validators = {
  contact: (v) => /^\d{10}$/.test(v.replace(/\D/g, "")),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  gstNumber: (v) => v.length === 15,
};

const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";
const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm";

export default function AdminCreateVendorPage() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    name: "",
    contact: "",
    email: "",
    address: "",
    gstNumber: "",
    DealsIn: "",
  });

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Vendor name is required";
    if (form.contact && !validators.contact(form.contact))
      errs.contact = "Enter a valid 10-digit number";
    if (form.email && !validators.email(form.email)) errs.email = "Enter a valid email address";
    if (form.gstNumber && !validators.gstNumber(form.gstNumber))
      errs.gstNumber = "GST must be exactly 15 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/vendors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          contact: form.contact ? Number(form.contact.replace(/\D/g, "")) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Vendor created");
        router.push("/admin/vendors");
      } else {
        toast.error(data.message || "Failed to create vendor");
      }
    } catch {
      toast.error("Failed to create vendor");
    } finally {
      setSaving(false);
    }
  };

  const err = (k) =>
    errors[k] ? <p className="mt-1.5 text-xs text-red-500">{errors[k]}</p> : null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
          <Link
            href="/admin/vendors"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to vendors
          </Link>

          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">New Vendor</h1>
            <p className="text-gray-600 mt-1 text-sm">
              Register a supplier. Once saved it can be selected as a payable payee or a
              receivable payer.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
              <div>
                <label className={labelCls}>Vendor Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g., MedSupply India Pvt. Ltd."
                  className={inputCls}
                />
                {err("name")}
              </div>

              <div>
                <label className={labelCls}>Deals In</label>
                <input
                  value={form.DealsIn}
                  onChange={(e) => set("DealsIn", e.target.value)}
                  placeholder="e.g., Surgical Equipment"
                  className={inputCls}
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("DealsIn", form.DealsIn === c ? "" : c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        form.DealsIn === c
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-700"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  value={form.contact}
                  onChange={(e) => set("contact", e.target.value)}
                  placeholder="10-digit mobile number"
                  className={inputCls}
                />
                {err("contact")}
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="vendor@company.com"
                  className={inputCls}
                />
                {err("email")}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Address</label>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Street, City, State, PIN Code"
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>GST Number</label>
                <input
                  value={form.gstNumber}
                  onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
                  maxLength={15}
                  placeholder="27AABCU9603R1ZM"
                  className={`${inputCls} font-mono tracking-wide`}
                />
                {errors.gstNumber ? (
                  err("gstNumber")
                ) : (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Optional · {form.gstNumber.length}/15
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Store className="w-4 h-4" />
                    Create Vendor
                  </>
                )}
              </button>
              <Link
                href="/admin/vendors"
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
