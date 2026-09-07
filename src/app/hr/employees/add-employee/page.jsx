"use client";

import { useState } from "react";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  CheckCircle,
  User,
  AlertCircle,
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
  purple: { bg: "bg-purple-50", border: "border-purple-500", text: "text-purple-600", textDark: "text-purple-900", textMedium: "text-purple-700", textLight: "text-purple-800" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-500", text: "text-indigo-600", textDark: "text-indigo-900", textMedium: "text-indigo-700", textLight: "text-indigo-800" },
  pink:   { bg: "bg-pink-50",   border: "border-pink-500",   text: "text-pink-600",   textDark: "text-pink-900",   textMedium: "text-pink-700",   textLight: "text-pink-800" },
};

function RoleDescriptionCard({ role }) {
  if (!role || !roleDescriptions[role]) return null;
  const info   = roleDescriptions[role];
  const colors = colorClasses[info.color];
  return (
    <div className={`${colors.bg} border-l-4 ${colors.border} rounded-lg p-6`}>
      <div className="flex items-start">
        <AlertCircle className={`${colors.text} mr-3 shrink-0 mt-1`} size={20} />
        <div>
          <h4 className={`text-sm font-bold ${colors.textDark} mb-2`}>Role: {role}</h4>
          <p className={`text-sm ${colors.textMedium} mb-3`}>{info.description}</p>
          <p className={`text-xs font-semibold ${colors.textLight} mb-1`}>Key Responsibilities:</p>
          {info.responsibilities.map((r, i) => (
            <p key={i} className={`text-xs ${colors.textMedium} ml-4`}>• {r}</p>
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

export default function HRAddEmployee() {
  const router = useRouter();
  const toast  = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", employeeId: "", role: "", isactive: true });

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
      const res = await fetch("/api/employees/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create employee");
      }
      toast.success("Employee registered successfully!");
      setTimeout(() => router.push("/hr/employees"), 1500);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen">
      <HRSidebar />
      <main className="flex-1 px-4 md:px-12 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-8 py-6 bg-linear-to-r from-violet-600 to-indigo-600 text-white">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <UserPlus size={28} />
                Employee Registration
              </h1>
              <p className="text-violet-100 mt-1">Add a new team member to RyanCRM</p>
            </div>

            <form onSubmit={handleSubmit} className="px-8 py-8">
              <div className="space-y-8">
                <div className="text-center mb-8">
                  <User className="mx-auto h-16 w-16 text-violet-500 mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Employee Information</h3>
                  <p className="text-gray-600">Fill in the details below to register a new employee</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField label="Full Name" required value={formData.name} onChange={createChangeHandler("name")} placeholder="Enter employee's full name" className="md:col-span-2" />
                  <InputField label="Phone Number" type="tel" value={formData.phone} onChange={createChangeHandler("phone")} placeholder="10-digit mobile number" />
                  <InputField label="Email Address" type="email" value={formData.email} onChange={createChangeHandler("email")} placeholder="employee@example.com" />
                  <InputField label="Employee ID" value={formData.employeeId} onChange={createChangeHandler("employeeId")} placeholder="e.g. RYN-014 (optional)" />
                  <InputField label="Designation / Role" type="combobox" required value={formData.role} onChange={createChangeHandler("role")} options={roleOptions} placeholder="Type any post, or pick a common one" />
                  {formData.role && <div className="md:col-span-2"><RoleDescriptionCard role={formData.role} /></div>}
                  <InputField label="Active Status" type="checkbox" value={formData.isactive} onChange={createChangeHandler("isactive")} className="md:col-span-2" />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="text-blue-600 mr-3 shrink-0 mt-0.5" size={20} />
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Fields marked with <span className="text-red-500">*</span> are required</li>
                      <li>• Phone number should be 10 digits without country code</li>
                      <li>• Inactive employees won't appear in patient registration forms</li>
                    </ul>
                  </div>
                </div>

                <div className="flex justify-between pt-6 border-t border-gray-200">
                  <button type="button" onClick={() => router.push("/hr/employees")}
                    className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}
                    className="inline-flex items-center px-8 py-3 rounded-md text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
                    {isSubmitting ? (
                      <><div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full" />Registering...</>
                    ) : (
                      <><CheckCircle className="mr-2" size={20} />Register Employee</>
                    )}
                  </button>
                </div>
              </div>
            </form>

            <div className="px-8 py-4 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">All employee data is securely stored and can be managed from the employee dashboard</p>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}
