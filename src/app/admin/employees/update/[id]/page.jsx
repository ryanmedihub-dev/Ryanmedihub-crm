"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import { buttonClass, FormSection, FormActions } from "@/components/ui";

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
  ArrowLeft,
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

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
      <div className="flex items-start">
        <AlertCircle className="text-gray-400 mr-3 shrink-0 mt-0.5" size={18} aria-hidden />
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1.5">
            Role: {role}
          </h4>
          <p className="text-sm text-gray-600 mb-3">
            {roleInfo.description}
          </p>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-700 mb-1">
              Key Responsibilities:
            </p>
            {roleInfo.responsibilities.map((resp, index) => (
              <p key={index} className="text-xs text-gray-600 ml-4">
                • {resp}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function EmployeeUpdate() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id;
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

  const handleSalaryChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      salaryStructure: { ...prev.salaryStructure, [field]: value },
    }));
  };

  useEffect(() => {
    const fetchEmployee = async () => {
      if (!employeeId) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/employees/get/${employeeId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setNotFound(true);
          }
                toast.error("Failed to fetch employee data");
        }

        const result = await response.json();

        if (result.success && result.data) {
          setFormData({
            name: result.data.name || "",
            phone: result.data.phone || "",
            email: result.data.email || "",
            employeeId: result.data.employeeId || "",
            role: result.data.role || "",
            isactive: result.data.isactive !== undefined ? result.data.isactive : true,
            salaryStructure: {
              baseSalary: result.data.salaryStructure?.baseSalary ?? "",
              salaryType: result.data.salaryStructure?.salaryType || "Monthly",
              effectiveFrom: result.data.salaryStructure?.effectiveFrom
                ? new Date(result.data.salaryStructure.effectiveFrom).toISOString().split("T")[0]
                : new Date().toISOString().split("T")[0],
            },
            incentiveRate: result.data.incentiveRate ?? "",
            dateOfJoining: result.data.dateOfJoining
              ? new Date(result.data.dateOfJoining).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
              : "",
          });
        }
      } catch (error) {
        toast.error("Error fetching employee data:", error.message);

      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployee();
  }, [employeeId]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
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
      const response = await fetch(`/api/employees/update/${employeeId}`, {
        method: "PUT",
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

      toast.success("Employee updated successfully");

      setTimeout(() => {
        router.push("/admin/employees");
      }, 2000);
    } catch (error) {
      toast.error("Error updating employee data:", error.message)
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

  if (isLoading) {
    return (
      <section className="flex min-h-screen">
        <main className="flex-1 min-w-0 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading employee data...</p>
          </div>
        </main>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="flex min-h-screen">
        <main className="flex-1 min-w-0 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">Employee Not Found</h2>
            <p className="text-gray-600 mb-6">
              The employee you're trying to edit doesn't exist or has been deleted.
            </p>
            <button
              onClick={() => router.push("/employees")}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors duration-200"
            >
              <ArrowLeft className="mr-2" size={20} />
              Back to Employee List
            </button>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen">
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-7">
        <div className="max-w-5xl">
          <nav aria-label="Breadcrumb" className="mb-2 text-[13px] text-gray-500">
            <button type="button" onClick={() => router.back()} className="hover:text-gray-900 transition-colors">Employees</button>
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

            <FormSection title="Role" description="Designation decides what they handle in the CRM.">
              <InputField label="Designation" type="combobox" required value={formData.role} onChange={createChangeHandler("role")} options={roleOptions} placeholder="Type any post, or pick one" />
              <InputField label="Employee ID" value={formData.employeeId} onChange={createChangeHandler("employeeId")} placeholder="RYN-014" hint="Optional staff code." />
              {formData.role && (
                <div className="sm:col-span-2">
                  <RoleDescriptionCard role={formData.role} />
                </div>
              )}
              <InputField label="Date of joining" type="date" value={formData.dateOfJoining} onChange={createChangeHandler("dateOfJoining")} />
              <div className="sm:pt-7">
                <InputField label="Active" type="checkbox" value={formData.isactive} onChange={createChangeHandler("isactive")} />
              </div>
            </FormSection>

            <FormSection title="Pay" description="Base salary and the incentive usually paid per patient." last>
              <InputField label="Base salary (₹)" type="number" value={formData.salaryStructure.baseSalary} onChange={(e) => handleSalaryChange("baseSalary", e.target.value)} placeholder="0" />
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
              <InputField label="Effective from" type="date" value={formData.salaryStructure.effectiveFrom} onChange={(e) => handleSalaryChange("effectiveFrom", e.target.value)} />
              <InputField label="Incentive per patient (₹)" type="number" value={formData.incentiveRate} onChange={(e) => handleChange("incentiveRate", e.target.value)} placeholder="0" />
            </FormSection>

            <FormActions>
              <button type="button" onClick={() => router.back()} className={buttonClass("secondary")}>Cancel</button>
              <button type="submit" disabled={isSubmitting} className={buttonClass("primary")}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle className="w-4 h-4" aria-hidden />}
                {isSubmitting ? "Saving…" : "Save changes"}
              </button>
            </FormActions>
          </form>
          <p className="mt-3 text-xs text-gray-400 tabular-nums">Record ID {employeeId}</p>
        </div>
      </main>
    </section>
  );
}
