"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Check } from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Field, Btn, Row, Spinner, input, inputEdited, textarea, day,
} from "@/components/stocks/ui";

const CATEGORIES = [
  "Surgical Equipment", "Medicines", "Hair Care", "Lab Supplies",
  "Consumables", "PPE Kits", "Instruments", "Cosmetics",
];

export default function EditVendorPage() {
  const router = useRouter();
  const params = useParams();
  const vendorId = params.id;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [createdAt, setCreatedAt] = useState(null);
  const [formData, setFormData] = useState({
    name: "", contact: "", email: "", address: "", gstNumber: "", DealsIn: "",
  });
  const [originalData, setOriginalData] = useState({});

  useEffect(() => { if (vendorId) fetchVendor(); }, [vendorId]);

  const fetchVendor = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/vendors/get?id=${vendorId}`);
      const data = await res.json();
      if (data.success) {
        const vendor = data.data || data.vendor || data;
        if (!vendor || !vendor.name) {
          toast.error("That vendor record is incomplete");
          router.push("/stocks/vendors");
          return;
        }
        const vendorData = {
          name: vendor.name || "",
          contact: vendor.contact?.toString() || "",
          email: vendor.email || "",
          address: vendor.address || "",
          gstNumber: vendor.gstNumber || "",
          DealsIn: vendor.DealsIn || "",
        };
        setFormData(vendorData);
        setOriginalData(vendorData);
        setCreatedAt(vendor.createdAt || null);
      } else {
        toast.error(data.message || "Could not load the vendor");
        router.push("/stocks/vendors");
      }
    } catch {
      toast.error("Could not load the vendor");
      router.push("/stocks/vendors");
    } finally {
      setLoading(false);
    }
  };

  const changed = (field) => formData[field] !== originalData[field];
  const changedFields = Object.keys(formData).filter(changed);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = "A vendor needs a name";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errs.email = "Check this email address";
    if (formData.contact && !/^\d{10}$/.test(formData.contact.replace(/\D/g, "")))
      errs.contact = "Phone numbers are 10 digits";
    if (formData.gstNumber && formData.gstNumber.length !== 15)
      errs.gstNumber = "GST numbers are exactly 15 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (changedFields.length === 0) return toast.info("Nothing has changed yet");

    setSaving(true);
    try {
      const res = await fetch("/api/vendors/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vendorId,
          name: formData.name,
          contact: formData.contact || undefined,
          email: formData.email || undefined,
          address: formData.address || undefined,
          gstNumber: formData.gstNumber || undefined,
          DealsIn: formData.DealsIn || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${formData.name} updated`);
        router.push("/stocks/vendors");
      } else {
        toast.error(data.message || "Could not save the changes");
      }
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (changedFields.length && !confirm("Leave without saving your changes?")) return;
    router.push("/stocks/vendors");
  };

  const cls = (field) => (changed(field) ? inputEdited : input);

  if (loading) {
    return (
      <Page sidebar={Sidebar} section="Vendors" title="Edit vendor">
        <Card><Spinner note="Loading vendor" /></Card>
      </Page>
    );
  }

  return (
    <Page
      sidebar={Sidebar}
      section="Vendors"
      title={originalData.name || "Edit vendor"}
      lead={changedFields.length ? `${changedFields.length} unsaved ${changedFields.length === 1 ? "change" : "changes"}` : "No changes yet"}
      back="/stocks/vendors"
      actions={
        <>
          <Btn onClick={handleCancel} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" icon={Check} busy={saving} onClick={handleSubmit} disabled={!changedFields.length}>
            Save changes
          </Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Vendor">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name} className="sm:col-span-2">
                <input name="name" value={formData.name} onChange={handleChange} className={cls("name")} required />
              </Field>

              <Field label="Phone" error={errors.contact}>
                <input
                  name="contact" value={formData.contact} onChange={handleChange}
                  inputMode="numeric" className={`${cls("contact")} tabular-nums`}
                />
              </Field>

              <Field label="Email" error={errors.email}>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className={cls("email")} />
              </Field>

              <Field label="Deals in" className="sm:col-span-2">
                <input name="DealsIn" list="vendor-category-options" value={formData.DealsIn} onChange={handleChange} className={cls("DealsIn")} />
                <datalist id="vendor-category-options">
                  {CATEGORIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </Field>
            </div>
          </Card>

          <Card title="Billing">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="GST number" error={errors.gstNumber} hint="15 characters">
                <input
                  name="gstNumber" value={formData.gstNumber} onChange={handleChange} maxLength={15}
                  className={`${cls("gstNumber")} font-mono uppercase`}
                />
              </Field>

              <Field label="Address" className="sm:col-span-2">
                <textarea
                  name="address" rows="3" value={formData.address} onChange={handleChange}
                  className={`${textarea} resize-none ${changed("address") ? "border-amber-300 bg-amber-50/40" : ""}`}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Unsaved changes">
            {changedFields.length === 0 ? (
              <p className="text-sm text-slate-400">Edit a field and it shows up here before you save.</p>
            ) : (
              <div className="space-y-3">
                {changedFields.map((f) => (
                  <div key={f} className="text-sm">
                    <p className="text-xs text-slate-500">{f === "DealsIn" ? "Deals in" : f === "gstNumber" ? "GST number" : f}</p>
                    <p className="mt-0.5 text-slate-400 line-through">{originalData[f] || "empty"}</p>
                    <p className="font-medium text-slate-900">{formData[f] || "empty"}</p>
                  </div>
                ))}
              </div>
            )}

            {createdAt && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Row label="Vendor since">{day(createdAt)}</Row>
              </div>
            )}
          </Card>
        </div>
      </form>
    </Page>
  );
}
