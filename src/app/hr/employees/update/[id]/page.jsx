"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import { buttonClass, FormSection, FormActions } from "@/components/ui";
import {
  CheckCircle,
  User,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";

const roleDescriptions = {
  Agent:      { description: "Responsible for patient referrals and initial contact", responsibilities: ["Generate patient leads and referrals", "Initial patient contact and coordination", "Maintain referral relationships"], color: "blue" },
  Counsellor: { description: "Provides consultation and treatment planning", responsibilities: ["Conduct patient consultations", "Develop treatment plans", "Provide pre and post-surgery guidance"], color: "green" },
  Doctor:     { description: "Performs surgical procedures and medical oversight", responsibilities: ["Perform hair transplant surgeries", "Medical evaluations and clearances", "Post-operative care and follow-ups"], color: "red" },
  Technician: { description: "Assists in surgical procedures and technical tasks", responsibilities: ["Assist during surgical procedures", "Prepare surgical equipment", "Support the surgical team"], color: "orange" },
  Implanter:  { description: "Specializes in graft implantation during surgery", responsibilities: ["Perform graft implantation", "Ensure precise placement", "Monitor graft quality"], color: "purple" },
  Others:     { description: "Supports clinic operations in various capacities", responsibilities: ["General clinic support", "Administrative assistance", "Patient care coordination"], color: "indigo" },
  Hr:         { description: "Manages human resources, recruitment, and employee relations", responsibilities: ["Manage recruitment and onboarding", "Handle employee performance and appraisals", "Maintain HR records and compliance"], color: "pink" },
};

const colorClasses = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-500",   text: "text-blue-600",   textDark: "text-blue-900",   textMedium: "text-blue-700",   textLight: "text-blue-800" },
  green:  { bg: "bg-green-50",  border: "border-green-500",  text: "text-green-600",  textDark: "text-green-900",  textMedium: "text-green-700",  textLight: "text-green-800" },
  red:    { bg: "bg-red-50",    border: "border-red-500",    text: "text-red-600",    textDark: "text-red-900",    textMedium: "text-red-700",    textLight: "text-red-800" },
  orange: { bg: "bg-orange-50", border: "border-orange-500", text: "text-orange-600", textDark: "text-orange-900", textMedium: "text-orange-700", textLight: "text-orange-800" },
  purple: { bg: "bg-purple-50", border: "border-indigo-500", text: "text-purple-600", textDark: "text-purple-900", textMedium: "text-purple-700", textLight: "text-purple-800" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-500", text: "text-indigo-600", textDark: "text-indigo-900", textMedium: "text-indigo-700", textLight: "text-indigo-800" },
  pink:   { bg: "bg-pink-50",   border: "border-pink-500",   text: "text-pink-600",   textDark: "text-pink-900",   textMedium: "text-pink-700",   textLight: "text-pink-800" },
};

function RoleDescriptionCard({ role }) {
  if (!role || !roleDescriptions[role]) return null;
  const info   = roleDescriptions[role];
  const colors = colorClasses[info.color];
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
      <div className="flex items-start">
        <AlertCircle className="text-gray-400 mr-3 shrink-0 mt-0.5" size={18} aria-hidden />
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1.5">Role: {role}</h4>
          <p className="text-sm text-gray-600 mb-3">{info.description}</p>
          <p className="text-xs font-medium text-gray-700 mb-1">Key Responsibilities:</p>
          {info.responsibilities.map((r, i) => (
            <p key={i} className="text-xs text-gray-600 ml-4">• {r}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

const roleOptions = [
  { value: "Agent", label: "Agent" },
  { value: "Counsellor", label: "Counsellor" },
  { value: "Doctor", label: "Doctor" },
  { value: "Technician", label: "Technician" },
  { value: "Implanter", label: "Implanter" },
  { value: "Others", label: "Others" },
  { value: "Hr", label: "Hr" },
];

export default function HRUpdateEmployee() {
  const router     = useRouter();
  const params     = useParams();
  const toast      = useToast();
  const employeeId = params.id;

  const [isLoading, setIsLoading]     = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notFound, setNotFound]       = useState(false);
  const [formData, setFormData]       = useState({ name: "", phone: "", email: "", employeeId: "", role: "", isactive: true });

  useEffect(() => {
    if (!employeeId) { setNotFound(true); setIsLoading(false); return; }
    fetch(`/api/employees/get/${employeeId}`)
      .then((res) => { if (res.status === 404) { setNotFound(true); } return res.json(); })
      .then((result) => {
        if (result.success && result.data) {
          const d = result.data;
          setFormData({ name: d.name || "", phone: d.phone || "", email: d.email || "", employeeId: d.employeeId || "", role: d.role || "", isactive: d.isactive !== undefined ? d.isactive : true });
        }
      })
      .catch(() => toast.error("Error fetching employee data"))
      .finally(() => setIsLoading(false));
  }, [employeeId]);

  const createChangeHandler = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    if (!formData.name.trim())  { toast.error("Employee name is required"); return false; }
    if (!formData.role)         { toast.error("Employee role is required"); return false; }
    if (formData.email && !formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { toast.error("Invalid email address"); return false; }
    if (formData.phone && !formData.phone.match(/^[0-9]{10}$/))                { toast.error("Phone must be 10 digits"); return false; }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/employees/update/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update employee");
      }
      toast.success("Employee updated successfully!");
      setTimeout(() => router.push("/hr/employees"), 1500);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex min-h-screen">
        <HRSidebar />
        <main className="flex-1 min-w-0 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-indigo-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading employee data...</p>
          </div>
        </main>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="flex min-h-screen">
        <HRSidebar />
        <main className="flex-1 min-w-0 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">Employee Not Found</h2>
            <p className="text-gray-600 mb-6">The employee you're trying to edit doesn't exist or has been deleted.</p>
            <button onClick={() => router.push("/hr/employees")}
              className="inline-flex items-center px-6 py-3 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
              <ArrowLeft className="mr-2" size={20} />Back to Employees
            </button>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen">
      <HRSidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-7">
        <div className="max-w-5xl">
          <nav aria-label="Breadcrumb" className="mb-2 text-[13px] text-gray-500">
            <button type="button" onClick={() => router.push("/hr/employees")} className="hover:text-gray-900 transition-colors">Employees</button>
            <span className="mx-1.5 text-gray-300">/</span>
            <span className="text-gray-700">Edit</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{formData.name || "Edit employee"}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Changes apply to every patient record linked to this employee. Inactive employees are hidden from new registrations.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 bg-white rounded-xl border border-gray-200">
            <FormSection title="Profile" description="Who they are and how to reach them.">
              <InputField label="Full name" required value={formData.name} onChange={createChangeHandler("name")} placeholder="As it should appear on payslips" className="sm:col-span-2" />
              <InputField label="Phone" type="tel" value={formData.phone} onChange={createChangeHandler("phone")} placeholder="98765 43210" hint="10 digits, no country code." />
              <InputField label="Email" type="email" value={formData.email} onChange={createChangeHandler("email")} placeholder="name@example.com" />
            </FormSection>

            <FormSection title="Role" description="Designation decides what they handle in the CRM." last>
              <InputField label="Designation" type="combobox" required value={formData.role} onChange={createChangeHandler("role")} options={roleOptions} placeholder="Type any post, or pick one" />
              <InputField label="Employee ID" value={formData.employeeId} onChange={createChangeHandler("employeeId")} placeholder="RYN-014" hint="Optional staff code." />
              {formData.role && <div className="sm:col-span-2"><RoleDescriptionCard role={formData.role} /></div>}
              <InputField label="Active" type="checkbox" value={formData.isactive} onChange={createChangeHandler("isactive")} className="sm:col-span-2" />
            </FormSection>

            <FormActions>
              <button type="button" onClick={() => router.push("/hr/employees")} className={buttonClass("secondary")}>Cancel</button>
              <button type="submit" disabled={isSubmitting} className={buttonClass("primary")}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle className="w-4 h-4" aria-hidden />}
                {isSubmitting ? "Saving…" : "Save changes"}
              </button>
            </FormActions>
          </form>
        </div>
      </main>
    </section>
  );
}
