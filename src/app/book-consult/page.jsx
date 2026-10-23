"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import { User, Calendar, Phone, Mail } from "lucide-react";

export default function BookAppointment() {
  const toast = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState({ Agent: [] });

  const [formData, setFormData] = useState({
    personal: {
      name: "",
      phone: "",
      email: "",
      age: "",
      gender: "",
      branch: "",
      visitDate: "",
      reference: "",
      purpose: "",
      packageQuoted: "",
      techniqueQuoted: "",
      remarks: "",
    },
    ops: {
      status: "NEW",
    },
  });

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await fetch("/api/employees/get-id");
        const data = await res.json();

        if (data.success) {
          const sortedAgents = [...data.data.Agent].sort((a, b) =>
            a.name.localeCompare(b.name)
          );

          setEmployees({ Agent: sortedAgents });
        }
      } catch (err) {
        console.error("Error fetching agents:", err);
      }
    };

    fetchEmployees();
  }, []);

  const handleChange = (section, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const createChangeHandler = (section, field) => (e) =>
    handleChange(section, field, e.target.value);

  const cleanObjectIdFields = (data) => {
    const cleaned = JSON.parse(JSON.stringify(data));

    if (cleaned.personal.reference === "") {
      cleaned.personal.reference = null;
    }

    ["age", "packageQuoted"].forEach((field) => {
      if (cleaned.personal[field] === "") {
        cleaned.personal[field] = null;
      }
    });

    return cleaned;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!formData.personal.name || !formData.personal.phone) {
      toast.error("Name and Phone are required");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/patients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanObjectIdFields(formData)),
      });

      if (!res.ok) throw new Error("Patient already exists with this phone number");

      toast.success("Appointment booked successfully");

      setTimeout(() => {
        setFormData({
          personal: {
            name: "",
            phone: "",
            email: "",
            age: "",
            gender: "",
            branch: "",
            visitDate: "",
            reference: "",
            purpose: "",
            packageQuoted: "",
            techniqueQuoted: "",
            remarks: "",
          },
          ops: { status: "NEW" },
        });
      }, 1500);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen md:bg-gray-50 flex items-center justify-center px-3 sm:px-6">
      <main className="w-full max-w-6xl bg-white rounded-xl md:shadow-sm">
        <div className="text-center p-6 sm:p-8 border-b">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <Calendar className="text-blue-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Book an Appointment
          </h1>
          <p className="mt-2 text-gray-600 text-sm sm:text-base">
            Fill your details and our team will contact you within 24 hours
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField
              label="Full Name"
              required
              value={formData.personal.name}
              onChange={createChangeHandler("personal", "name")}
              icon={User}
            />

            <InputField
              label="Phone Number"
              required
              type="number"
              value={formData.personal.phone}
              onChange={createChangeHandler("personal", "phone")}
              icon={Phone}
            />


            <InputField
              label="Age"
              type="number"
              value={formData.personal.age}
              onChange={createChangeHandler("personal", "age")}
            />

            <InputField
              label="Gender"
              type="select"
              value={formData.personal.gender}
              onChange={createChangeHandler("personal", "gender")}
              options={[
                { value: "MALE", label: "Male" },
                { value: "FEMALE", label: "Female" },
                { value: "OTHERS", label: "Others" },
              ]}
            />

            <InputField
              label="Preferred Branch"
              type="select"
              value={formData.personal.branch}
              onChange={createChangeHandler("personal", "branch")}
              options={[
                { value: "Delhi", label: "Delhi" },
                { value: "Mumbai", label: "Mumbai" },
                { value: "Hyderabad", label: "Hyderabad" },
                { value: "Noida", label: "Noida" },
                { value: "Gurgaon", label: "Gurgaon" },
              ]}
            />

            <InputField
              label="Preferred Visit Date"
              type="date"
              value={formData.personal.visitDate}
              onChange={createChangeHandler("personal", "visitDate")}
            />

            <InputField
              label="Referred By (Agent)"
              type="select"
              value={formData.personal.reference}
              onChange={createChangeHandler("personal", "reference")}
              options={[
                { value: "", label: "Not referred by anyone" },
                ...employees.Agent.map((agent) => ({
                  value: agent._id,
                  label: agent.name,
                })),
              ]}
            />

            <InputField
              label="Purpose of Visit"
              type="select"
              value={formData.personal.purpose}
              onChange={createChangeHandler("personal", "purpose")}
              options={[
                { value: "Consult", label: "Consult" },
                { value: "Consult + Surgery", label: "Consult + Surgery" },
                { value: "Surgery", label: "Surgery" },
                { value: "PRP Treatment", label: "PRP Treatment" },
                { value: "GFC Treatment", label: "GFC Treatment" },
                { value: "Other", label: "Other" },
              ]}
            />

            <InputField
              label="Expected Budget (₹)"
              type="number"
              value={formData.personal.packageQuoted}
              onChange={createChangeHandler("personal", "packageQuoted")}
            />

            <InputField
              label="Interested Technique"
              type="select"
              value={formData.personal.techniqueQuoted}
              onChange={createChangeHandler("personal", "techniqueQuoted")}
              options={[
                { value: "", label: "Not sure yet" },
                { value: "FUE", label: "FUE" },
                { value: "INDIAN DHI", label: "Indian DHI" },
                { value: "TURKISH DHI", label: "Turkish DHI" },
                { value: "HYBRID", label: "Hybrid" },
                { value: "PRP", label: "PRP" },
                { value: "GFC", label: "GFC" },
              ]}
            />

            <InputField
              label="Additional Notes"
              type="textarea"
              value={formData.personal.remarks}
              onChange={createChangeHandler("personal", "remarks")}
              className="md:col-span-2"
            />
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-6">
            <p className="text-sm text-gray-500">
              We'll contact you within 24 hours
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-md bg-blue-600 px-8 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isSubmitting ? "Booking..." : "Book Appointment"}
            </button>
          </div>
        </form>
      </main>
    </section>
  );
}