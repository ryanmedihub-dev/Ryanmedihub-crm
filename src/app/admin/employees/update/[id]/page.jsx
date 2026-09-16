"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
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
    <div className={`bg-${roleInfo.color}-50 border-l-4 border-${roleInfo.color}-500 rounded-lg p-6`}>
      <div className="flex items-start">
        <AlertCircle className={`text-${roleInfo.color}-600 mr-3 shrink-0 mt-1`} size={20} />
        <div>
          <h4 className={`text-sm font-bold text-${roleInfo.color}-900 mb-2`}>
            Role: {role}
          </h4>
          <p className={`text-sm text-${roleInfo.color}-700 mb-3`}>
            {roleInfo.description}
          </p>
          <div className="space-y-1">
            <p className={`text-xs font-semibold text-${roleInfo.color}-800 mb-1`}>
              Key Responsibilities:
            </p>
            {roleInfo.responsibilities.map((resp, index) => (
              <p key={index} className={`text-xs text-${roleInfo.color}-600 ml-4`}>
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
        <main className="flex-1 flex items-center justify-center">
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
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Employee Not Found</h2>
            <p className="text-gray-600 mb-6">
              The employee you're trying to edit doesn't exist or has been deleted.
            </p>
            <button
              onClick={() => router.push("/employees")}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
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

      <main className="flex-1 px-4 md:px-12 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-8 py-6 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold flex items-center space-x-2">
                    <User size={28} />
                    <span>Update Employee</span>
                  </h1>
                  <p className="text-blue-100 mt-1">
                    Edit employee information for RyanCRM
                  </p>
                </div>
                <div className="text-right hidden md:block">
                  <p className="text-sm text-blue-100">Current Status</p>
                  <p className="font-medium">Editing Employee</p>
                </div>
              </div>
            </div>


            <div className="px-8 pt-6">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
              >
                <ArrowLeft size={16} className="mr-1" />
                Back
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-8 py-8">
              <div className="space-y-8">
                <div className="text-center mb-8">
                  <User className="mx-auto h-16 w-16 text-blue-500 mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900">Employee Information</h3>
                  <p className="text-gray-600">Update the employee details below</p>
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
                    label="Employee ID"
                    value={formData.employeeId}
                    onChange={createChangeHandler("employeeId")}
                    placeholder="e.g. RYN-014 (optional staff code)"
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
                    label="Designation / Role"
                    type="combobox"
                    required
                    value={formData.role}
                    onChange={createChangeHandler("role")}
                    options={roleOptions}
                    placeholder="Type any post, or pick a common one"
                    className="md:col-span-2"
                  />

                  {formData.role && (
                    <div className="md:col-span-2">
                      <RoleDescriptionCard role={formData.role} />
                    </div>
                  )}

                  <InputField
                    label="Date of Joining"
                    type="date"
                    value={formData.dateOfJoining}
                    onChange={createChangeHandler("dateOfJoining")}
                  />

                  <InputField
                    label="Active Status"
                    type="checkbox"
                    value={formData.isactive}
                    onChange={createChangeHandler("isactive")}
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

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="text-yellow-600 mr-3 shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="text-sm font-semibold text-yellow-900 mb-1">
                        Update Information
                      </h4>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        <li>• Changes will affect all existing patient records linked to this employee</li>
                        <li>• Setting employee to inactive will hide them from new patient registrations</li>
                        <li>• Ensure all information is accurate before updating</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Updating Employee...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2" size={20} />
                        Update Employee
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            <div className="px-8 py-4 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                Record ID: {employeeId} • Last updated information will be reflected immediately
              </p>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}