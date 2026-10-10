"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SalesSidebar from "@/components/Sidebars/SalesSidebar";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import {
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  UserPlus,
  CheckCircle,
} from "lucide-react";



export default function BookAppointment() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employees, setEmployees] = useState({
    Agent: [],
  });

  const toast = useToast();

  const [formData, setFormData] = useState({
    personal: {
      name: "",
      phone: "",
      email: "",
      age: "",
      gender: "",
      branch: "",
      address: "",
      profession: "",
      visitDate: "",
      reference: "",
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
        const response = await fetch(
          "/api/employees/get-id"
        );
        const result = await response.json();
        if (result.success) {
          setEmployees(result.data);
        }
      } catch (error) {
        console.error("Error fetching employees:", error);
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

  const createChangeHandler = (section, field) => {
    return (e) => {
      handleChange(section, field, e.target.value);
    };
  };

  const cleanObjectIdFields = (data) => {
    const cleaned = JSON.parse(JSON.stringify(data));

    if (cleaned.personal && cleaned.personal.reference === "") {
      cleaned.personal.reference = null;
    }

    const numberFields = ["age", "packageQuoted"];
    numberFields.forEach((field) => {
      if (cleaned.personal && cleaned.personal[field] === "") {
        cleaned.personal[field] = null;
      }
    });

    return cleaned;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!formData.personal.name || !formData.personal.phone) {
      toast.error("Please fill in all required fields (Name and Phone are required)");

      setIsSubmitting(false);
      return;
    }

    try {
      const cleanedData = cleanObjectIdFields(formData);

      const response = await fetch("/api/patients/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cleanedData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast.success("Appointment booked successfully! Our team will contact you soon.");


      setTimeout(() => {
        setFormData({
          personal: {
            name: "",
            phone: "",
            email: "",
            age: "",
            gender: "",
            branch: "",
            address: "",
            profession: "",
            visitDate: "",
            reference: "",
            packageQuoted: "",
            techniqueQuoted: "",
            remarks: "",
          },
          ops: {
            status: "NEW",
          },
        });
      }, 3000);
    } catch (error) {
      toast.error(`Error booking appointment: ${error.message}`);

    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen bg-gray-50">
      <SalesSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Book an Appointment
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Fill in your details below to schedule your consultation. Our team will contact you to confirm your appointment.
            </p>
          </div>


          <div className=" overflow-hidden">


            <form onSubmit={handleSubmit} className="p-6 lg:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-8">
                <InputField
                  label="Full Name"
                  required
                  value={formData.personal.name}
                  onChange={createChangeHandler("personal", "name")}
                  placeholder="Enter your full name"
                  icon={User}
                />

                <InputField
                  label="Phone Number"
                  type="tel"
                  required
                  value={formData.personal.phone}
                  onChange={createChangeHandler("personal", "phone")}
                  placeholder="Enter your phone number"
                  icon={Phone}
                />

                <InputField
                  label="Email Address"
                  type="email"
                  value={formData.personal.email}
                  onChange={createChangeHandler("personal", "email")}
                  placeholder="Enter your email address"
                  icon={Mail}
                />

                <InputField
                  label="Age"
                  type="number"
                  value={formData.personal.age}
                  onChange={createChangeHandler("personal", "age")}
                  placeholder="Enter your age"
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
                  label="Profession"
                  type="text"
                  value={formData.personal.profession}
                  onChange={createChangeHandler("personal", "profession")}
                  placeholder="Enter your profession"
                  icon={Briefcase}
                />

                <InputField
                  label="Preferred Visit Date"
                  type="date"
                  value={formData.personal.visitDate}
                  onChange={createChangeHandler("personal", "visitDate")}
                  icon={Calendar}
                />

                <InputField
                  label="Referred By (Agent)"
                  type="select"
                  value={formData.personal.reference}
                  onChange={createChangeHandler("personal", "reference")}
                  options={[
                    { value: "", label: "Not referred by anyone" },
                    ...employees.Agent.map((emp) => ({
                      value: emp._id,
                      label: emp.name,
                    })),
                  ]}
                />

                <InputField
                  label="Expected Budget (₹)"
                  type="number"
                  value={formData.personal.packageQuoted}
                  onChange={createChangeHandler("personal", "packageQuoted")}
                  placeholder="Your expected budget"
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
                    { value: "HYBRID", label: "HYBRID" },
                    { value: "PRP", label: "PRP" },
                    { value: "GFC", label: "GFC" },
                    { value: "Other", label: "Other" },
                  ]}
                />

                <InputField
                  label="Address"
                  type="textarea"
                  value={formData.personal.address}
                  onChange={createChangeHandler("personal", "address")}
                  placeholder="Enter your complete address"
                  className="md:col-span-2"
                  icon={MapPin}
                />

                <InputField
                  label="Additional Notes"
                  type="textarea"
                  value={formData.personal.remarks}
                  onChange={createChangeHandler("personal", "remarks")}
                  placeholder="Any specific concerns or additional information you'd like to share..."
                  className="md:col-span-2"
                />
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
                  <div className="text-sm text-gray-600">
                    <p>We'll contact you within 24 hours to confirm your appointment</p>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 min-w-50 justify-center"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Booking...
                      </>
                    ) : (
                      <>
                        <Calendar className="mr-2" size={20} />
                        Book Appointment
                      </>
                    )}
                  </button>
                </div>
              </div>


            </form>
          </div>


        </div>
      </main>
    </section>
  );
}