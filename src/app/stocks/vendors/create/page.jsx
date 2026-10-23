"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import { Page, Card, Field, Btn, Row, input, textarea } from "@/components/stocks/ui";

const CATEGORIES = [
  "Surgical Equipment", "Medicines", "Hair Care", "Lab Supplies",
  "Consumables", "PPE Kits", "Instruments", "Cosmetics",
];

export default function CreateVendorPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    name: "", contact: "", email: "", address: "", gstNumber: "", DealsIn: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = "A vendor needs a name";
    if (formData.contact && !/^\d{10}$/.test(formData.contact.replace(/\D/g, "")))
      errs.contact = "Phone numbers are 10 digits";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errs.email = "Check this email address";
    if (formData.gstNumber && formData.gstNumber.length !== 15)
      errs.gstNumber = "GST numbers are exactly 15 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/vendors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          contact: formData.contact ? Number(formData.contact) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${formData.name} added to vendors`);
        router.push("/stocks/vendors");
      } else {
        toast.error(data.message || "Could not save the vendor");
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
      section="Vendors"
      title="New vendor"
      lead="Only the name is required — the rest can follow later"
      back="/stocks/vendors"
      actions={
        <>
          <Btn onClick={() => router.push("/stocks/vendors")} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" icon={Check} busy={loading} onClick={handleSubmit}>Save vendor</Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Vendor">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name} className="sm:col-span-2">
                <input
                  name="name" value={formData.name} onChange={handleChange}
                  placeholder="Sharma Surgicals"
                  className={input} required
                />
              </Field>

              <Field label="Phone" error={errors.contact}>
                <input
                  name="contact" value={formData.contact} onChange={handleChange}
                  inputMode="numeric" placeholder="9876543210"
                  className={`${input} tabular-nums`}
                />
              </Field>

              <Field label="Email" error={errors.email}>
                <input
                  type="email" name="email" value={formData.email} onChange={handleChange}
                  placeholder="orders@vendor.com"
                  className={input}
                />
              </Field>

              <Field label="Deals in" className="sm:col-span-2" hint="Pick a category or write your own">
                <input
                  name="DealsIn" list="vendor-category-options" value={formData.DealsIn} onChange={handleChange}
                  placeholder="Medicines"
                  className={input}
                />
                <datalist id="vendor-category-options">
                  {CATEGORIES.map((c) => <option key={c} value={c} />)}
                </datalist>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CATEGORIES.slice(0, 6).map((cat) => {
                    const on = formData.DealsIn === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, DealsIn: on ? "" : cat }))}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          on ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          </Card>

          <Card title="Billing">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="GST number" error={errors.gstNumber} hint="15 characters, as printed on the invoice">
                <input
                  name="gstNumber" value={formData.gstNumber} onChange={handleChange}
                  placeholder="22AAAAA0000A1Z5" maxLength={15}
                  className={`${input} font-mono uppercase`}
                />
              </Field>

              <Field label="Address" className="sm:col-span-2">
                <textarea
                  name="address" rows="3" value={formData.address} onChange={handleChange}
                  placeholder="Street, city, pin code"
                  className={`${textarea} resize-none`}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Summary">
            <p className="text-[15px] font-medium text-slate-900">{formData.name || "Unnamed vendor"}</p>
            <p className="mt-0.5 text-xs text-slate-400">{formData.DealsIn || "No category yet"}</p>

            <div className="mt-4">
              <Row label="Phone">{formData.contact || "—"}</Row>
              <Row label="Email">{formData.email || "—"}</Row>
              <Row label="GST">{formData.gstNumber || "—"}</Row>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Saved vendors appear in the purchase form straight away.
            </p>
          </Card>
        </div>
      </form>
    </Page>
  );
}
