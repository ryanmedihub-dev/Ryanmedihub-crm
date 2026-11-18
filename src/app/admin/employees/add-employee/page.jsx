"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClass, FormSection, FormActions } from "@/components/ui";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import {
  UserPlus,
  Phone,
  Mail,
  Briefcase,
  CheckCircle,
  User,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

const RoleDescriptionCard = ({ role }) => {
  const roleDescriptions = {
    Agent: {
      description: "Responsible for patient referrals and initial contact",
      responsibilities: [
        "Generate patient leads and referrals",
        "Initial patient contact and coordination",
        "Maintain referral relationships",
      ],
      color: "blue",
    },
    Counsellor: {
      description: "Provides consultation and treatment planning",
      responsibilities: [
        "Conduct patient consultations",
        "Develop treatment plans",
        "Provide pre and post-surgery guidance",
      ],
      color: "green",
    },
    Doctor: {
      description: "Performs surgical procedures and medical oversight",
      responsibilities: [
        "Perform hair transplant surgeries",
        "Medical evaluations and clearances",
        "Post-operative care and follow-ups",
      ],
      color: "red",
    },
    Technician: {
      description: "Assists in surgical procedures and technical tasks",
      responsibilities: [
        "Assist during surgical procedures",
        "Prepare surgical equipment",
        "Support the surgical team",
      ],
      color: "orange",
    },
    Implanter: {
      description: "Specializes in graft implantation during surgery",
      responsibilities: [
        "Perform graft implantation",
        "Ensure precise placement",
        "Monitor graft quality",
      ],
      color: "purple",
    },
    Others: {
      description: "Supports clinic operations in various capacities",
      responsibilities: [
        "General clinic support",
        "Administrative assistance",
        "Patient care coordination",
      ],
      color: "indigo",
    },
    Hr: {
      description: "Manages human resources, recruitment, and employee relations",
      responsibilities: [
        "Manage recruitment and onboarding",
        "Handle employee performance and appraisals",
        "Maintain HR records and compliance",
      ],
      color: "pink",
    },
  };

  if (!role || !roleDescriptions[role]) return null;

  const roleInfo = roleDescriptions[role];

  const colorClasses = {
    blue: { bg: "bg-blue-50", border: "border-blue-500", text: "text-blue-600", textDark: "text-blue-900", textMedium: "text-blue-700", textLight: "text-blue-800" },
    green: { bg: "bg-green-50", border: "border-green-500", text: "text-green-600", textDark: "text-green-900", textMedium: "text-green-700", textLight: "text-green-800" },
    red: { bg: "bg-red-50", border: "border-red-500", text: "text-red-600", textDark: "text-red-900", textMedium: "text-red-700", textLight: "text-red-800" },
    orange: { bg: "bg-orange-50", border: "border-orange-500", text: "text-orange-600", textDark: "text-orange-900", textMedium: "text-orange-700", textLight: "text-orange-800" },
    purple: { bg: "bg-purple-50", border: "border-indigo-500", text: "text-purple-600", textDark: "text-purple-900", textMedium: "text-purple-700", textLight: "text-purple-800" },
    indigo: { bg: "bg-indigo-50", border: "border-indigo-500", text: "text-indigo-600", textDark: "text-indigo-900", textMedium: "text-indigo-700", textLight: "text-indigo-800" },
    pink:   { bg: "bg-pink-50",   border: "border-pink-500",   text: "text-pink-600",   textDark: "text-pink-900",   textMedium: "text-pink-700",   textLight: "text-pink-800" },
  };

  const colors = colorClasses[roleInfo.color];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-gray-400 shrink-0 mt-0.5" size={16} aria-hidden />
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-1">
            {role}
          </h4>
          <p className="text-[13px] text-gray-600 mb-2">
            {roleInfo.description}
          </p>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 mb-1">
              Responsibilities
            </p>
            {roleInfo.responsibilities.map((resp, index) => (
              <p key={index} className="text-xs text-gray-600">
                • {resp}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function EmployeeRegistration() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    employeeId: "",
    role: "",
    isactive: true,
    salaryStructure: {
      baseSalary: "",
      salaryType: "Monthly",
      effectiveFrom: new Date().toISOString().split("T")[0],
    },
    incentiveRate: "",
    dateOfJoining: "",
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSalaryChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      salaryStructure: { ...prev.salaryStructure, [field]: value },
    }));
  };

  const createChangeHandler = (field) => {
    return (e) => {
      const value =
        e.target.type === "checkbox" ? e.target.checked : e.target.value;
      handleChange(field, value);
    };
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error("Employee name is required");
      return false;
    }

    if (!formData.role) {
      toast.error("Employee role is required");
      return false;
    }

    if (formData.email && !formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast.error("Please enter a valid email address");
      return false;
    }

    if (formData.phone && !formData.phone.match(/^[0-9]{10}$/)) {
      toast.error("Phone number must be exactly 10 digits");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/employees/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          salaryStructure: {
            ...formData.salaryStructure,
            baseSalary: parseFloat(formData.salaryStructure.baseSalary) || 0,
          },
          incentiveRate: parseFloat(formData.incentiveRate) || 0,
          dateOfJoining: formData.dateOfJoining || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      toast.success("Employee registered successfully!");

      setTimeout(() => {
        setFormData({
          name: "",
          phone: "",
          email: "",
          employeeId: "",
          role: "",
          isactive: true,
          salaryStructure: {
            baseSalary: "",
            salaryType: "Monthly",
            effectiveFrom: new Date().toISOString().split("T")[0],
          },
          incentiveRate: "",
          dateOfJoining: "",
        });
      }, 2000);
    } catch (error) {
      toast.error(`Error submitting employee data: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = [
    { value: "Agent", label: "Agent" },
    { value: "Counsellor", label: "Counsellor" },
    { value: "Doctor", label: "Doctor" },
    { value: "Technician", label: "Technician" },
    { value: "Implanter", label: "Implanter" },
    { value: "Others", label: "Others" },
    { value: "Hr", label: "Hr" },
  ];

  return (
    <section className="flex min-h-screen">
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-7">
        <div className="max-w-5xl">
          <nav aria-label="Breadcrumb" className="mb-2 text-[13px] text-gray-500">
            <Link href="/admin/employees" className="hover:text-gray-900 transition-colors">Employees</Link>
            <span className="mx-1.5 text-gray-300">/</span>
            <span className="text-gray-700">New employee</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">New employee</h1>
          <p className="mt-1 text-sm text-gray-500">Inactive employees don&apos;t appear in patient registration forms.</p>

          <form onSubmit={handleSubmit} className="mt-6 bg-white rounded-xl border border-gray-200">
            <FormSection title="Profile" description="Who they are and how to reach them.">
              <InputField
                label="Full name"
                required
                value={formData.name}
                onChange={createChangeHandler("name")}
                placeholder="As it should appear on payslips"
                className="sm:col-span-2"
              />
              <InputField
                label="Phone"
                type="tel"
                value={formData.phone}
                onChange={createChangeHandler("phone")}
                placeholder="98765 43210"
                hint="10 digits, no country code."
              />
              <InputField
                label="Email"
                type="email"
                value={formData.email}
                onChange={createChangeHandler("email")}
                placeholder="name@example.com"
              />
            </FormSection>

            <FormSection title="Role" description="Designation decides what they handle in the CRM.">
              <InputField
                label="Designation"
                type="combobox"
                required
                value={formData.role}
                onChange={createChangeHandler("role")}
                options={roleOptions}
                placeholder="Type any post, or pick one"
              />
              <InputField
                label="Employee ID"
                value={formData.employeeId}
                onChange={createChangeHandler("employeeId")}
                placeholder="RYN-014"
                hint="Optional."
              />
              {formData.role && (
                <div className="sm:col-span-2">
                  <RoleDescriptionCard role={formData.role} />
                </div>
              )}
              <InputField
                label="Date of joining"
                type="date"
                value={formData.dateOfJoining}
                onChange={createChangeHandler("dateOfJoining")}
              />
              <div className="sm:pt-7">
                <InputField
                  label="Active"
                  type="checkbox"
                  value={formData.isactive}
                  onChange={createChangeHandler("isactive")}
                />
              </div>
            </FormSection>

            <FormSection title="Pay" description="Base salary and the incentive usually paid per patient." last>
              <InputField
                label="Base salary (₹)"
                type="number"
                value={formData.salaryStructure.baseSalary}
                onChange={(e) => handleSalaryChange("baseSalary", e.target.value)}
                placeholder="0"
              />
              <InputField
                label="Salary type"
                type="select"
                value={formData.salaryStructure.salaryType}
                onChange={(e) => handleSalaryChange("salaryType", e.target.value)}
                options={[
                  { value: "Monthly", label: "Monthly" },
                  { value: "Daily", label: "Daily" },
                  { value: "Hourly", label: "Hourly" },
                ]}
              />
              <InputField
                label="Effective from"
                type="date"
                value={formData.salaryStructure.effectiveFrom}
                onChange={(e) => handleSalaryChange("effectiveFrom", e.target.value)}
              />
              <InputField
                label="Incentive per patient (₹)"
                type="number"
                value={formData.incentiveRate}
                onChange={(e) => handleChange("incentiveRate", e.target.value)}
                placeholder="0"
              />
            </FormSection>

            <FormActions>
                <Link href="/admin/employees" className={buttonClass("secondary")}>Cancel</Link>
                <button type="submit" disabled={isSubmitting} className={buttonClass("primary")}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle className="w-4 h-4" aria-hidden />}
                  {isSubmitting ? "Saving…" : "Create employee"}
                </button>
            </FormActions>
          </form>
        </div>
      </main>
    </section>
  );
}

