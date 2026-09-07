"use client";

import { useState } from "react";
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
    purple: { bg: "bg-purple-50", border: "border-purple-500", text: "text-purple-600", textDark: "text-purple-900", textMedium: "text-purple-700", textLight: "text-purple-800" },
    indigo: { bg: "bg-indigo-50", border: "border-indigo-500", text: "text-indigo-600", textDark: "text-indigo-900", textMedium: "text-indigo-700", textLight: "text-indigo-800" },
    pink:   { bg: "bg-pink-50",   border: "border-pink-500",   text: "text-pink-600",   textDark: "text-pink-900",   textMedium: "text-pink-700",   textLight: "text-pink-800" },
  };

  const colors = colorClasses[roleInfo.color];

  return (
    <div className={`${colors.bg} border-l-4 ${colors.border} rounded-lg p-6`}>
      <div className="flex items-start">
        <AlertCircle className={`${colors.text} mr-3 shrink-0 mt-1`} size={20} />
        <div>
          <h4 className={`text-sm font-bold ${colors.textDark} mb-2`}>
            Role: {role}
          </h4>
          <p className={`text-sm ${colors.textMedium} mb-3`}>
            {roleInfo.description}
          </p>
          <div className="space-y-1">
            <p className={`text-xs font-semibold ${colors.textLight} mb-1`}>
              Key Responsibilities:
            </p>
            {roleInfo.responsibilities.map((resp, index) => (
              <p key={index} className={`text-xs ${colors.textMedium} ml-4`}>
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

      <main className="flex-1 px-4 md:px-12 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-8 py-6 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold flex items-center space-x-2">
                    <UserPlus size={28} />
                    <span>Employee Registration</span>
                  </h1>
                  <p className="text-blue-100 mt-1">
                    Add a new team member to RyanCRM
                  </p>
                </div>
                <div className="text-right hidden md:block">
                  <p className="text-sm text-blue-100">Current Status</p>
                  <p className="font-medium">New Registration</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-8 py-8">
              <div className="space-y-8">
                <div className="text-center mb-8">
                  <User className="mx-auto h-16 w-16 text-blue-500 mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Employee Information</h3>
                  <p className="text-gray-600">Fill in the details below to register a new employee</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Full Name"
                    required
                    value={formData.name}
                    onChange={createChangeHandler("name")}
                    placeholder="Enter employee's full name"
                    className="md:col-span-2"
                  />

                  <InputField
                    label="Phone Number"
                    type="tel"
                    value={formData.phone}
                    onChange={createChangeHandler("phone")}
                    placeholder="10-digit mobile number"
                  />

                  <InputField
                    label="Email Address"
                    type="email"
                    value={formData.email}
                    onChange={createChangeHandler("email")}
                    placeholder="employee@example.com"
                  />

                  <InputField
                    label="Employee ID"
                    value={formData.employeeId}
                    onChange={createChangeHandler("employeeId")}
                    placeholder="e.g. RYN-014 (optional)"
                  />

                  <InputField
                    label="Designation / Role"
                    type="combobox"
                    required
                    value={formData.role}
                    onChange={createChangeHandler("role")}
                    options={roleOptions}
                    placeholder="Type any post, or pick a common one"
                  />

                  {formData.role && (
                    <div className="md:col-span-2">
                      <RoleDescriptionCard role={formData.role} />
                    </div>
                  )}

                  <InputField
                    label="Active Status"
                    type="checkbox"
                    value={formData.isactive}
                    onChange={createChangeHandler("isactive")}
                    className="md:col-span-2"
                  />

                  <div className="md:col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-bold text-gray-900 mb-4">Salary Structure</h4>
                  </div>

                  <InputField
                    label="Base Salary (₹)"
                    type="number"
                    value={formData.salaryStructure.baseSalary}
                    onChange={(e) => handleSalaryChange("baseSalary", e.target.value)}
                    placeholder="0"
                  />

                  <InputField
                    label="Salary Type"
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
                    label="Effective From"
                    type="date"
                    value={formData.salaryStructure.effectiveFrom}
                    onChange={(e) => handleSalaryChange("effectiveFrom", e.target.value)}
                  />

                  <InputField
                    label="Usual Incentive Rate (₹ per patient)"
                    type="number"
                    value={formData.incentiveRate}
                    onChange={(e) => handleChange("incentiveRate", e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="text-blue-600 mr-3 shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">
                        Important Information
                      </h4>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>• Fields marked with <span className="text-red-500">*</span> are required</li>
                        <li>• Phone number should be 10 digits without country code</li>
                        <li>• Inactive employees won't appear in patient registration forms</li>
                        <li>• Employee role determines their access and responsibilities</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Registering Employee...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2" size={20} />
                        Register Employee
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            <div className="px-8 py-4 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                All employee data is securely stored and can be managed from the employee dashboard
              </p>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}