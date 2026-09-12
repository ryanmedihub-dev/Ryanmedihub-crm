"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebars/CollabSidebar";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import { X } from "lucide-react";
import {
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  CheckCircle,
} from "lucide-react";

const BenefitsManager = ({ benefits, onChange, onAdd, onRemove }) => {
  const predefinedBenefits = [
    "5 Free PRP Sessions",
    "Deep Headwash",
    "5 Days Medicines Included",
    "Bandage Removal",
    "GFC",
  ];

  const handleBenefitToggle = (benefit) => {
    const currentBenefits = [...benefits];
    const benefitIndex = currentBenefits.indexOf(benefit);

    if (benefitIndex > -1) {
      onRemove(benefitIndex);
    } else {
      onAdd(benefit);
    }
  };

  const handleCustomBenefitAdd = (customBenefit) => {
    if (customBenefit.trim() && !benefits.includes(customBenefit.trim())) {
      onAdd(customBenefit.trim());
    }
  };

  return (
    <div className="md:col-span-2">
      <label className="block text-md mb-3 font-bold text-gray-700">
        Additional Benefits
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        {predefinedBenefits.map((benefit) => (
          <label
            key={benefit}
            className="flex items-center space-x-2 p-2 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={benefits.includes(benefit)}
              onChange={() => handleBenefitToggle(benefit)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">{benefit}</span>
          </label>
        ))}
      </div>

      <div className="mb-3">
        <label className="block text-md mb-3 font-um text-gray-700 ">
          Add Custom Benefit
        </label>
        <div className="flex space-x-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter custom benefit"
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCustomBenefitAdd(e.target.value);
                e.target.value = "";
              }
            }}
          />
          <button
            type="button"
            className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
            onClick={(e) => {
              const input = e.target.previousElementSibling;
              handleCustomBenefitAdd(input.value);
              input.value = "";
            }}
          >
            Add
          </button>
        </div>
      </div>

      {benefits.length > 0 && (
        <div className="mt-3">
          <label className="block text-md mb-3 font-um text-gray-700 ">
            Selected Benefits ({benefits.length})
          </label>
          <div className="flex flex-wrap gap-1">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center space-x-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-sm"
              >
                <span>{benefit}</span>
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-800"
                  onClick={() => onRemove(index)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function BookAppointment() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employees, setEmployees] = useState({
    Agent: [],
    Counsellor: [],
  });

  const toast = useToast();
  const router = useRouter();

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
    counselling: {
      counsellor: "",
      techniqueSuggested: "",
      finlpackage: "",
      graftsSuggested: "",
      readyForSurgery: false,
      notes: "",
      additionalbenefits: [],
      medicines: [],
      hairlossType: "",
      areaofConcern: "",
      hairlossreason: "",
      hairlossduration: "",
    },
    ops: {
      status: "NEW",
    },
  });

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await fetch("/api/employees/get-id");
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
      const value =
        e.target.type === "checkbox" ? e.target.checked : e.target.value;
      handleChange(section, field, value);
    };
  };

  const addArrayItem = (section, field, value = "") => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: [...prev[section][field], value],
      },
    }));
  };

  const removeArrayItem = (section, field, index) => {
    const newArray = formData[section][field].filter((_, i) => i !== index);
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: newArray,
      },
    }));
  };

  const cleanObjectIdFields = (data) => {
    const cleaned = JSON.parse(JSON.stringify(data));

    if (cleaned.personal && cleaned.personal.reference === "") {
      cleaned.personal.reference = null;
    }
    if (cleaned.counselling && cleaned.counselling.counsellor === "") {
      cleaned.counselling.counsellor = null;
    }

    const numberFields = ["age", "packageQuoted", "finlpackage", "graftsSuggested"];
    numberFields.forEach((field) => {
      if (cleaned.personal && cleaned.personal[field] === "") {
        cleaned.personal[field] = null;
      }
      if (cleaned.counselling && cleaned.counselling[field] === "") {
        cleaned.counselling[field] = null;
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
          counselling: {
            counsellor: "",
            techniqueSuggested: "",
            finlpackage: "",
            graftsSuggested: "",
            readyForSurgery: false,
            notes: "",
            additionalbenefits: [],
            medicines: [],
            hairlossType: "",
            areaofConcern: "",
            hairlossreason: "",
            hairlossduration: "",
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
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Register Your Counsult
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Fill in your details below to register your consultation.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <form onSubmit={handleSubmit} className="p-6 lg:p-8">
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                    Personal Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        { value: "Patna", label: "Patna" },
                        { value: "Gujarat", label: "Gujarat" },
                        { value: "Kolkata", label: "Kolkata" },
                        { value: "Ahmedabad", label: "Ahmedabad" },
                        { value: "Jaipur", label: "Jaipur" },
                        { value: "Bengaluru", label: "Bengaluru" },
                        { value: "Pune", label: "Pune" },
                        { value: "Lucknow", label: "Lucknow" },
                        { value: "Chennai", label: "Chennai" },
                        { value: "Jammu", label: "Jammu" },
                        { value: "Kashmir", label: "Kashmir" },
                        { value: "Ranchi", label: "Ranchi" },
                        { value: "Prayagraj", label: "Prayagraj" },
                        { value: "Chandigarh", label: "Chandigarh" },
                        { value: "Jalandhar", label: "Jalandhar" },
                        { value: "Indore", label: "Indore" },
                        { value: "Bhopal", label: "Bhopal" },
                        { value: "Nagpur", label: "Nagpur" },
                        { value: "Dehradun", label: "Dehradun" },
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
                      type="searchable-select"
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
                      label="Address"
                      type="textarea"
                      value={formData.personal.address}
                      onChange={createChangeHandler("personal", "address")}
                      placeholder="Enter your complete address"
                      className="md:col-span-2"
                      icon={MapPin}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                    Counselling Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField
                      label="Counsellor"
                      type="select"
                      value={formData.counselling.counsellor}
                      onChange={createChangeHandler("counselling", "counsellor")}
                      options={[
                        { value: "", label: "Select Counsellor" },
                        ...employees.Counsellor.map((emp) => ({
                          value: emp._id,
                          label: emp.name,
                        })),
                      ]}
                    />

                    <InputField
                      label="Technique Suggested"
                      type="select"
                      value={formData.counselling.techniqueSuggested}
                      onChange={createChangeHandler("counselling", "techniqueSuggested")}
                      options={[
                        { value: "FUE", label: "FUE" },
                        { value: "INDIAN DHI", label: "INDIAN DHI" },
                        { value: "TURKISH DHI", label: "Turkish DHI" },
                        { value: "HYBRID", label: "HYBRID" },
                        { value: "PRP", label: "PRP" },
                        { value: "GFC", label: "GFC" },
                        { value: "Other", label: "Other" },
                      ]}
                    />

                    <InputField
                      label="Final Package Amount (₹)"
                      type="number"
                      value={formData.counselling.finlpackage}
                      onChange={createChangeHandler("counselling", "finlpackage")}
                      placeholder="Final package amount"
                    />

                    <InputField
                      label="Grafts Suggested"
                      type="number"
                      value={formData.counselling.graftsSuggested}
                      onChange={createChangeHandler("counselling", "graftsSuggested")}
                      placeholder="Number of grafts"
                    />

                    <div className="space-y-2">
                      <label className="block text-md mb-3 font-bold text-gray-700">
                        Hair Loss Type
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "male_pattern", label: "Male Pattern Baldness" },
                          { value: "female_pattern", label: "Female Pattern Baldness" },
                          { value: "receding_hairline", label: "Receding Hairline" },
                          { value: "crown_thinning", label: "Crown Thinning" },
                          { value: "diffuse_thinning", label: "Diffuse Thinning" },
                          { value: "frontal_loss", label: "Frontal Hair Loss" },
                          { value: "traction_alopecia", label: "Traction Alopecia" },
                          { value: "other", label: "Other" },
                        ].map((option) => (
                          <label key={option.value} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="hairlossType"
                              value={option.value}
                              checked={formData.counselling.hairlossType === option.value}
                              onChange={createChangeHandler("counselling", "hairlossType")}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-md mb-3 font-bold text-gray-700">
                        Area of Concern
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "frontal", label: "Frontal Area" },
                          { value: "mid_scalp", label: "Mid Scalp" },
                          { value: "crown", label: "Crown/Vortex" },
                          { value: "hairline", label: "Hairline Correction" },
                          { value: "temples", label: "Temples" },
                          { value: "beard", label: "Beard/Moustache" },
                          { value: "multiple_areas", label: "Multiple Areas" },
                        ].map((option) => (
                          <label key={option.value} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="areaofConcern"
                              value={option.value}
                              checked={formData.counselling.areaofConcern === option.value}
                              onChange={createChangeHandler("counselling", "areaofConcern")}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-md mb-3 font-bold text-gray-700">
                        Hair Loss Reason
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "genetic", label: "Genetic/Hereditary" },
                          { value: "hormonal", label: "Hormonal Changes" },
                          { value: "stress", label: "Stress Related" },
                          { value: "nutritional", label: "Nutritional Deficiency" },
                          { value: "medical", label: "Medical Condition" },
                          { value: "medication", label: "Medication Side Effects" },
                          { value: "lifestyle", label: "Lifestyle Factors" },
                          { value: "ageing", label: "Ageing Process" },
                          { value: "unknown", label: "Unknown/Idiopathic" },
                        ].map((option) => (
                          <label key={option.value} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="hairlossreason"
                              value={option.value}
                              checked={formData.counselling.hairlossreason === option.value}
                              onChange={createChangeHandler("counselling", "hairlossreason")}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-md mb-3 font-bold text-gray-700">
                        Hair Loss Duration
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "less_than_1_year", label: "Less than 1 year" },
                          { value: "1_2_years", label: "1-2 years" },
                          { value: "2_5_years", label: "2-5 years" },
                          { value: "5_10_years", label: "5-10 years" },
                          { value: "more_than_10_years", label: "More than 10 years" },
                          { value: "progressive", label: "Progressive (ongoing)" },
                          { value: "recent_accelerated", label: "Recent accelerated loss" },
                        ].map((option) => (
                          <label key={option.value} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="hairlossduration"
                              value={option.value}
                              checked={formData.counselling.hairlossduration === option.value}
                              onChange={createChangeHandler("counselling", "hairlossduration")}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <BenefitsManager
                      benefits={formData.counselling.additionalbenefits}
                      onChange={(value, index) =>
                        handleChange("counselling", "additionalbenefits", {
                          target: { value, index },
                        })
                      }
                      onAdd={(value) =>
                        addArrayItem("counselling", "additionalbenefits", value)
                      }
                      onRemove={(index) =>
                        removeArrayItem("counselling", "additionalbenefits", index)
                      }
                    />

                    <InputField
                      label="Additional Notes"
                      type="textarea"
                      value={formData.counselling.notes}
                      onChange={createChangeHandler("counselling", "notes")}
                      placeholder="Any additional notes or concerns..."
                      className="md:col-span-2"
                    />

                    <InputField
                      label="Ready for Surgery"
                      type="checkbox"
                      checked={formData.counselling.readyForSurgery}
                      onChange={createChangeHandler("counselling", "readyForSurgery")}
                      className="md:col-span-2"
                    />

                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
                  <div className="text-sm text-gray-600">
                    <p>Your consult details will be registered successfully into our database</p>
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