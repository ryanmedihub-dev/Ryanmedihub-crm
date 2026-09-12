"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebars/CollabSidebar";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useParams } from "next/navigation";
import InputField from "@/components/InputField";
import { prepareFileForUpload, formatBytes } from "@/utils/compressImage";
import {
  Upload,
  X,
  FileText,
  Image,
  Calendar,
  User,
  Heart,
  CreditCard,
  Scissors,
  FileUp,
  Save,
  ArrowLeft,
  Edit3,
  Eye,
  Download,
  Plus,
  Droplet,
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
      <label className="block text-md underline font-semibold text-gray-700 mb-4">
        Additional Benefits *
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {predefinedBenefits.map((benefit) => (
          <label
            key={benefit}
            className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-200"
          >
            <input
              type="checkbox"
              checked={benefits.includes(benefit)}
              onChange={() => handleBenefitToggle(benefit)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">{benefit}</span>
          </label>
        ))}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Add Custom Benefit
        </label>
        <div className="flex space-x-3">
          <input
            type="text"
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
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
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-200 font-medium"
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
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selected Benefits ({benefits.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-2 rounded-lg"
              >
                <span className="text-sm font-medium">{benefit}</span>
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
                  onClick={() => onRemove(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SESSION_TYPES = ["PRP", "GFC", "Canacot", "Biotin"];

const PRPManager = ({ prpSessions, onChange, onAdd, onRemove }) => {
  return (
    <div className="md:col-span-2">
      <h4 className="text-lg font-semibold text-gray-700 mb-4">Sessions (PRP / GFC / Canacot / Biotin)</h4>
      {prpSessions && prpSessions.length > 0 ? (
        <div className="space-y-4">
          {prpSessions.map((session, index) => (
            <div
              key={index}
              className="bg-gray-50 p-6 rounded-lg border relative"
            >
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute top-4 right-4 text-red-500 hover:text-red-700 p-1"
                title="Remove Session"
              >
                <X size={20} />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-12">
                <InputField
                  label="Session Number"
                  type="number"
                  value={session.prpNumber || ""}
                  onChange={(e) => onChange(index, "prpNumber", e.target.value)}
                  placeholder="e.g. 1"
                />
                <InputField
                  label="Date"
                  type="date"
                  value={session.date ? session.date.split("T")[0] : ""}
                  onChange={(e) => onChange(index, "date", e.target.value)}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={session.type || "PRP"}
                    onChange={(e) => onChange(index, "type", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  >
                    {SESSION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-4">No sessions added yet</p>
      )}
      <button
        type="button"
        className="mt-4 px-6 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors duration-200 font-medium flex items-center gap-2"
        onClick={onAdd}
      >
        <Plus size={20} />
        Add Session
      </button>
    </div>
  );
};

const StepHeader = ({ icon: Icon, title, description, color }) => (
  <div className="text-center mb-8">
    <div
      className={`mx-auto h-16 w-16 text-${color}-500 mb-4 flex items-center justify-center`}
    >
      <Icon size={64} />
    </div>
    <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

const TransactionManager = ({ transactions, onChange, onAdd, onRemove }) => (
  <div className="md:col-span-2">
    <h4 className="text-lg font-semibold text-gray-700 mb-4">Transactions</h4>
    {transactions.map((transaction, index) => (
      <div key={index} className="bg-gray-50 p-6 rounded-lg mb-4 border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <InputField
            label="Date"
            type="date"
            value={transaction.date ? transaction.date.split("T")[0] : ""}
            onChange={(e) => onChange(index, "date", e.target.value)}
          />
          <InputField
            label="Payment Type"
            type="select"
            value={transaction.paymentType || ""}
            onChange={(e) => onChange(index, "paymentType", e.target.value)}
            options={[
              { value: "Full-payment", label: "Full Payment" },
              { value: "Advance", label: "Advance" },
              { value: "Installment", label: "Installment" },
              { value: "EMI", label: "EMI" },
            ]}
          />
          <InputField
            label="Branch"
            type="select"
            value={transaction.branch || ""}
            onChange={(e) => onChange(index, "branch", e.target.value)}
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
            label="Amount"
            type="number"
            value={transaction.amount || ""}
            onChange={(e) => onChange(index, "amount", e.target.value)}
            placeholder="Transaction amount"
          />
        </div>
        <button
          type="button"
          className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200"
          onClick={() => onRemove(index)}
        >
          Remove Transaction
        </button>
      </div>
    ))}
    <button
      type="button"
      className="px-6 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors duration-200 font-medium"
      onClick={onAdd}
    >
      + Add Transaction
    </button>
  </div>
);

const MultiSelectEmployee = ({ label, options, selectedIds, onChange }) => {
  const handleToggle = (employeeId) => {
    const newSelection = selectedIds.includes(employeeId)
      ? selectedIds.filter((id) => id !== employeeId)
      : [...selectedIds, employeeId];
    onChange(newSelection);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="border border-gray-300 rounded-md p-4 bg-white max-h-48 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-sm text-gray-500">No employees available</p>
        ) : (
          <div className="space-y-2">
            {options.map((employee) => (
              <label
                key={employee._id}
                className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(employee._id)}
                  onChange={() => handleToggle(employee._id)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">{employee.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-sm text-gray-600 mt-2">
          {selectedIds.length} selected
        </p>
      )}
    </div>
  );
};

const DocumentUpload = ({
  title,
  icon: Icon,
  color,
  files,
  onUpload,
  onRemove,
  accept,
  uploadId,
  isUploading,
}) => {
  const [viewingFile, setViewingFile] = useState(null);

  const isPDF = (filename) => {
    return filename.toLowerCase().endsWith(".pdf");
  };

  const getFileName = (url) => {
    try {
      const parts = url.split("/");
      const fileNameWithParams = parts[parts.length - 1];
      const fileName = fileNameWithParams.split("?")[0];
      return decodeURIComponent(fileName);
    } catch (error) {
      return url;
    }
  };

  const handleViewFile = (fileUrl) => {
    setViewingFile(fileUrl);
  };

  const handleDownloadFile = (fileUrl) => {
    const fileName = getFileName(fileUrl);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4 flex items-center justify-center">
            <Icon size={48} />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">{title}</h4>
          <input
            type="file"
            multiple
            accept={accept}
            onChange={(e) => onUpload(e.target.files)}
            className="hidden"
            id={uploadId}
            disabled={isUploading}
          />
          <label
            htmlFor={uploadId}
            className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${
              isUploading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
            } transition-colors duration-200`}
          >
            <Upload className="mr-2" size={20} />
            {isUploading ? "Uploading..." : "Add Files"}
          </label>

          {files.length > 0 && (
            <div className="mt-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Uploaded Files ({files.length}):
              </h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {files.map((filePath, index) => {
                  const fileName = getFileName(filePath);
                  const isPdf = isPDF(filePath);

                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-white px-4 py-3 rounded-md border hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div
                          className={`shrink-0 w-8 h-8 rounded flex items-center justify-center ${
                            isPdf ? "bg-red-100" : "bg-blue-100"
                          }`}
                        >
                          {isPdf ? (
                            <FileText size={16} className="text-red-600" />
                          ) : (
                            <Image size={16} className="text-blue-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-gray-700 block truncate">
                            {fileName}
                          </span>
                          <p className="text-xs text-gray-500">
                            {isPdf ? "PDF Document" : "Image File"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleViewFile(filePath)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          title="View file"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(filePath)}
                          className="p-2 text-green-600 hover:bg-green-100 rounded transition-colors"
                          title="Download file"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(index)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="Remove file"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {viewingFile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingFile(null)}
        >
          <div
            className="relative bg-white rounded-lg w-full max-w-6xl h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">
                {getFileName(viewingFile)}
              </h3>
              <button
                onClick={() => setViewingFile(null)}
                className="text-gray-600 hover:text-gray-900 text-2xl font-bold px-3 hover:bg-gray-200 rounded"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-gray-100">
              {isPDF(viewingFile) ? (
                <iframe
                  src={viewingFile}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={viewingFile}
                    alt="Document"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default function PatientEditDetails() {
  const [step, setStep] = useState(1);
  const [isUpdating, setIsUpdating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [employees, setEmployees] = useState({
    Agent: [],
    Counsellor: [],
    Doctor: [],
    Technician: [],
    Implanter: [],
    Others: [],
  });

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
    medical: {
      allergies: "",
      medicalHistory: "",
      bloodGroup: "",
      sugar: "",
      bp: "",
      pulse: "",
      weight: "",
      hiv: "",
      hcv: "",
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
    surgery: {
      surgeryDate: "",
      location: "",
      OT: "",
      technique: "",
      graftsneed: "",
      graftsImplanted: "",
      donorCondition: "",
      doctor: [],
      seniorTech: [],
      implanterRight: [],
      implanterLeft: [],
      graftingPerson: [],
      helper: [],
    },
    afterSurgery: {
      headwashDate: "",
      bandageRemovalDate: "",
      prp: [],
    },
    payments: {
      totalAmount: "",
      amountReceived: "",
      pendingAmount: "",
      medicineAmount: "",
      discount: "",
      transactions: [],
    },
    documents: {
      images: [],
      consentForm: [],
      suregeryForm: [],
      consultForm: [],
    },
    ops: {
      status: "",
      patientId: "",
      lastUpdated: "",
    },
  });

  const params = useParams();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();

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

  useEffect(() => {
    if (!id) return;

    const fetchPatientData = async () => {
      try {
        const res = await fetch(`/api/admin/patient-data?id=${id}`, {
          method: "GET",
        });

        if (!res.ok) {
          router.push("/404");
          return;
        }

        const data = await res.json();
        if (data.success && data.patient) {
          const patientData = data.patient;

          const extractIds = (data) => {
            if (!data) return [];
            if (Array.isArray(data)) {
              return data
                .map((item) => (typeof item === "object" ? item._id : item))
                .filter(Boolean);
            }
            return [];
          };

          setFormData({
            personal: {
              name: patientData.personal?.name || "",
              phone: patientData.personal?.phone || "",
              email: patientData.personal?.email || "",
              age: patientData.personal?.age || "",
              gender: patientData.personal?.gender || "",
              branch: patientData.personal?.branch || "",
              address: patientData.personal?.address || "",
              profession: patientData.personal?.profession || "",
              visitDate: patientData.personal?.visitDate
                ? patientData.personal.visitDate.split("T")[0]
                : "",
              reference: patientData.personal?.reference?._id || "",
              packageQuoted: patientData.personal?.packageQuoted || "",
              techniqueQuoted: patientData.personal?.techniqueQuoted || "",
              remarks: patientData.personal?.remarks || "",
            },
            medical: {
              allergies: patientData.medical?.allergies || "",
              medicalHistory: patientData.medical?.medicalHistory || "",
              bloodGroup: patientData.medical?.bloodGroup || "",
              sugar: patientData.medical?.sugar || "",
              bp: patientData.medical?.bp || "",
              pulse: patientData.medical?.pulse || "",
              weight: patientData.medical?.weight || "",
              hiv: patientData.medical?.hiv || "",
              hcv: patientData.medical?.hcv || "",
            },
            counselling: {
              counsellor: patientData.counselling?.counsellor?._id || "",
              techniqueSuggested:
                patientData.counselling?.techniqueSuggested || "",
              finlpackage: patientData.counselling?.finlpackage || "",
              graftsSuggested: patientData.counselling?.graftsSuggested || "",
              readyForSurgery:
                patientData.counselling?.readyForSurgery || false,
              notes: patientData.counselling?.notes || "",
              additionalbenefits:
                patientData.counselling?.additionalbenefits || [],
              medicines: patientData.counselling?.medicines || [],
              hairlossType: patientData.counselling?.hairlossType || "",
              areaofConcern: patientData.counselling?.areaofConcern || "",
              hairlossreason: patientData.counselling?.hairlossreason || "",
              hairlossduration: patientData.counselling?.hairlossduration || "",
            },
            surgery: {
              surgeryDate: patientData.surgery?.surgeryDate
                ? patientData.surgery.surgeryDate.split("T")[0]
                : "",
              location: patientData.surgery?.location || "",
              OT: patientData.surgery?.OT || "",
              technique: patientData.surgery?.technique || "",
              graftsneed: patientData.surgery?.graftsneed || "",
              graftsImplanted: patientData.surgery?.graftsImplanted || "",
              donorCondition: patientData.surgery?.donorCondition || "",
              doctor: extractIds(patientData.surgery?.doctor),
              seniorTech: extractIds(patientData.surgery?.seniorTech),
              implanterRight: extractIds(patientData.surgery?.implanterRight),
              implanterLeft: extractIds(patientData.surgery?.implanterLeft),
              graftingPerson: extractIds(patientData.surgery?.graftingPerson),
              helper: extractIds(patientData.surgery?.helper),
            },
            afterSurgery: {
              headwashDate: patientData.afterSurgery?.headwashDate
                ? patientData.afterSurgery.headwashDate.split("T")[0]
                : "",
              bandageRemovalDate: patientData.afterSurgery?.bandageRemovalDate
                ? patientData.afterSurgery.bandageRemovalDate.split("T")[0]
                : "",
              prp: patientData.afterSurgery?.prp || [],
            },
            payments: {
              totalAmount: patientData.payments?.totalAmount || "",
              amountReceived: patientData.payments?.amountReceived || "",
              pendingAmount: patientData.payments?.pendingAmount || "",
              medicineAmount: patientData.payments?.medicineAmount || "",
              discount: patientData.payments?.discount || "",
              transactions: patientData.payments?.transactions || [],
            },
            documents: {
              images: patientData.documents?.images || [],
              consentForm: patientData.documents?.consentForm || [],
              suregeryForm: patientData.documents?.suregeryForm || [],
              consultForm: patientData.documents?.consultForm || [],
            },
            ops: {
              status: patientData.ops?.status || "",
              patientId: patientData._id || "",
              lastUpdated: patientData.updatedAt || "",
            },
          });
        }
      } catch (err) {
        console.error("Error fetching patient data:", err);
        router.push("/404");
      }
    };

    fetchPatientData();
  }, [id, router]);

  const stepConfig = [
    { number: 1, title: "Personal Details", icon: User, color: "blue" },
    { number: 2, title: "Counsellor Details", icon: FileText, color: "green" },
    { number: 3, title: "Medical Information", icon: Heart, color: "red" },
    { number: 4, title: "Surgery Details", icon: Scissors, color: "orange" },
    { number: 5, title: "After Surgery Care", icon: Droplet, color: "pink" },
    { number: 6, title: "Payment Details", icon: CreditCard, color: "purple" },
    { number: 7, title: "Document Upload", icon: FileUp, color: "indigo" },
  ];

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

  const handleArrayChange = (section, field, value, index) => {
    const newArray = [...formData[section][field]];
    newArray[index] = value;
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: newArray,
      },
    }));
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

  const handlePRPChange = (index, field, value) => {
    const newPRP = [...formData.afterSurgery.prp];
    newPRP[index] = {
      ...newPRP[index],
      [field]: value,
    };
    setFormData((prev) => ({
      ...prev,
      afterSurgery: {
        ...prev.afterSurgery,
        prp: newPRP,
      },
    }));
  };

  const addPRPSession = () => {
    setFormData((prev) => ({
      ...prev,
      afterSurgery: {
        ...prev.afterSurgery,
        prp: [
          ...prev.afterSurgery.prp,
          {
            prpNumber: "",
            date: "",
            type: "PRP",
          },
        ],
      },
    }));
  };

  const removePRPSession = (index) => {
    const newPRP = formData.afterSurgery.prp.filter((_, i) => i !== index);
    setFormData((prev) => ({
      ...prev,
      afterSurgery: {
        ...prev.afterSurgery,
        prp: newPRP,
      },
    }));
  };

  const handleFileUpload = async (section, files) => {
    if (!files || files.length === 0) return;

    setUploadingFiles((prev) => ({ ...prev, [section]: true }));

    try {
      const compressionNotes = [];
      const uploadPromises = Array.from(files).map(async (file) => {
        const { file: preparedFile, wasCompressed, originalSize, compressedSize, warning } =
          await prepareFileForUpload(file);
        if (warning) compressionNotes.push(warning);
        if (wasCompressed) {
          compressionNotes.push(`${file.name}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)}`);
        }

        const formDataToSend = new FormData();
        formDataToSend.append("file", preparedFile);
        formDataToSend.append("section", section);
        formDataToSend.append("patientId", id);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formDataToSend,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to upload ${file.name}`);
        }

        const data = await response.json();
        return data.filePath;
      });

      const uploadedPaths = await Promise.all(uploadPromises);

      setFormData((prev) => ({
        ...prev,
        documents: {
          ...prev.documents,
          [section]: [...prev.documents[section], ...uploadedPaths],
        },
      }));

      setUpdateStatus({
        type: "success",
        message: [`Successfully uploaded ${uploadedPaths.length} file(s)`, ...compressionNotes].join(" · "),
      });

      setTimeout(() => setUpdateStatus(null), 3000);
    } catch (error) {
      console.error("Error uploading files:", error);
      setUpdateStatus({
        type: "error",
        message:
          error.message || "Failed to upload some files. Please try again.",
      });
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [section]: false }));
    }
  };

  const removeFile = async (section, index) => {
    const filePath = formData.documents[section][index];

    if (!confirm("Are you sure you want to remove this file?")) {
      return;
    }

    try {
      const extractPublicId = (url) => {
        if (!url.includes("cloudinary.com")) return null;

        const parts = url.split("/upload/");
        if (parts.length !== 2) return null;

        const pathPart = parts[1];
        const segments = pathPart.split("/");

        let publicIdParts = [];
        let foundPath = false;

        for (const segment of segments) {
          if (!foundPath && /^[a-z]+_/.test(segment)) {
            continue;
          }
          foundPath = true;
          publicIdParts.push(segment);
        }

        const publicId = publicIdParts.join("/");
        return publicId.replace(/\.[^/.]+$/, "");
      };

      const publicId = extractPublicId(filePath);
      const resourceType = filePath.toLowerCase().endsWith(".pdf")
        ? "raw"
        : "image";

      const response = await fetch("/api/upload", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicId: publicId,
          resourceType: resourceType,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setFormData((prev) => ({
          ...prev,
          documents: {
            ...prev.documents,
            [section]: prev.documents[section].filter((_, i) => i !== index),
          },
        }));

        setUpdateStatus({
          type: "success",
          message: "File removed successfully",
        });

        setTimeout(() => setUpdateStatus(null), 3000);
      } else {
        throw new Error(result.message || "Failed to delete file");
      }
    } catch (error) {
      console.error("Error removing file:", error);
      setUpdateStatus({
        type: "error",
        message: error.message || "Failed to remove file. Please try again.",
      });
    }
  };

  const handleTransactionChange = (index, field, value) => {
    const newTransactions = [...formData.payments.transactions];
    newTransactions[index] = {
      ...newTransactions[index],
      [field]: value,
      _id: newTransactions[index]._id || undefined,
    };
    handleChange("payments", "transactions", newTransactions);
  };

  const addTransaction = () => {
    handleChange("payments", "transactions", [
      ...formData.payments.transactions,
      {
        date: "",
        paymentType: "",
        branch: "",
        amount: "",
      },
    ]);
  };

  const removeTransaction = (index) => {
    const newTransactions = formData.payments.transactions.filter(
      (_, i) => i !== index
    );
    handleChange("payments", "transactions", newTransactions);
  };

  const cleanObjectIdFields = (data) => {
    const cleaned = JSON.parse(JSON.stringify(data));

    const objectIdFields = {
      personal: ["reference"],
      counselling: ["counsellor"],
    };

    const arrayObjectIdFields = {
      surgery: [
        "doctor",
        "seniorTech",
        "implanterRight",
        "implanterLeft",
        "graftingPerson",
        "helper",
      ],
    };

    Object.keys(objectIdFields).forEach((section) => {
      if (cleaned[section]) {
        objectIdFields[section].forEach((field) => {
          if (
            cleaned[section][field] === "" ||
            cleaned[section][field] === undefined
          ) {
            cleaned[section][field] = null;
          }
        });
      }
    });

    Object.keys(arrayObjectIdFields).forEach((section) => {
      if (cleaned[section]) {
        arrayObjectIdFields[section].forEach((field) => {
          if (Array.isArray(cleaned[section][field])) {
            cleaned[section][field] = cleaned[section][field].filter(
              (id) => id && id !== ""
            );
            if (cleaned[section][field].length === 0) {
              cleaned[section][field] = [];
            }
          } else if (
            cleaned[section][field] === "" ||
            cleaned[section][field] === undefined
          ) {
            cleaned[section][field] = [];
          }
        });
      }
    });

    const numberFields = {
      personal: ["age", "packageQuoted"],
      counselling: ["finlpackage", "graftsSuggested"],
      surgery: ["OT", "graftsneed", "graftsImplanted"],
      payments: [
        "totalAmount",
        "amountReceived",
        "pendingAmount",
        "medicineAmount",
        "discount",
      ],
    };

    Object.keys(numberFields).forEach((section) => {
      if (cleaned[section]) {
        numberFields[section].forEach((field) => {
          if (
            cleaned[section][field] === "" ||
            cleaned[section][field] === undefined
          ) {
            cleaned[section][field] = null;
          }
        });
      }
    });

    return cleaned;
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus(null);

    try {
      const cleanedData = cleanObjectIdFields(formData);

      const updateData = {
        ...cleanedData,
        ops: {
          ...cleanedData.ops,
          lastUpdated: new Date().toISOString(),
        },
      };

      const response = await fetch(`/api/patients/update?id=${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();

      if (result.success) {
        toast.success("Updated successfully!");

        setUpdateStatus({
          type: "success",
          message: "Patient details updated successfully!",
        });

        setTimeout(() => setUpdateStatus(null), 5000);
      } else {
        throw new Error(result.message || "Update failed");
      }
    } catch (error) {
      console.error("Error updating patient data:", error);
      toast.error("Update failed: " + error.message);

      setUpdateStatus({
        type: "error",
        message:
          error.message ||
          "Failed to update patient details. Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const nextStep = () => setStep(Math.min(step + 1, 7));
  const prevStep = () => setStep(Math.max(step - 1, 1));

  return (
    <section className="flex min-h-screen">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 px-12 py-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-8 py-6 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  onClick={() => router.back()}
                >
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h1 className="text-2xl font-bold flex items-center space-x-2">
                    <Edit3 size={28} />
                    <span>Edit Patient Details</span>
                  </h1>
                  <p className="text-blue-100 mt-1">
                    Patient ID: {formData.ops.patientId} | Status:{" "}
                    {formData.ops.status}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-100">Last Updated</p>
                <p className="font-medium">
                  {formData.ops.lastUpdated
                    ? new Date(formData.ops.lastUpdated).toLocaleDateString()
                    : "Not available"}
                </p>
              </div>
            </div>
          </div>

          {updateStatus && (
            <div
              className={`px-8 py-4 ${
                updateStatus.type === "success"
                  ? "bg-green-50 text-green-800 border-l-4 border-green-400"
                  : "bg-red-50 text-red-800 border-l-4 border-red-400"
              }`}
            >
              <div className="flex">
                <div className="shrink-0">
                  {updateStatus.type === "success" ? "✓" : "⚠"}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium">{updateStatus.message}</p>
                </div>
              </div>
            </div>
          )}

          <div className="px-8 py-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                {stepConfig.map((stepInfo) => {
                  const Icon = stepInfo.icon;
                  return (
                    <button
                      key={stepInfo.number}
                      onClick={() => setStep(stepInfo.number)}
                      className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${
                        stepInfo.number === step
                          ? `bg-${stepInfo.color}-600 text-white shadow-lg scale-110`
                          : stepInfo.number < step
                          ? "bg-green-500 text-white shadow-md hover:scale-105"
                          : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                      }`}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
              <div className="text-sm text-gray-600 font-medium">
                Step {step} of {stepConfig.length}: {stepConfig[step - 1].title}
              </div>
            </div>
          </div>

          <div className="px-8 py-8">
            {step === 1 && (
              <div className="space-y-8">
                <StepHeader
                  icon={User}
                  title="Personal Information"
                  description="Update basic personal details"
                  color="blue"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Full Name"
                    required
                    value={formData.personal.name}
                    onChange={createChangeHandler("personal", "name")}
                    placeholder="Enter full name"
                  />

                  <InputField
                    label="Email Address"
                    type="email"
                    value={formData.personal.email}
                    onChange={createChangeHandler("personal", "email")}
                    placeholder="Enter email address"
                  />

                  <InputField
                    label="Age"
                    type="number"
                    value={formData.personal.age}
                    onChange={createChangeHandler("personal", "age")}
                    placeholder="Enter age"
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
                    label="Branch"
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
                    placeholder="Enter profession"
                  />

                  <InputField
                    label="Visit Date"
                    type="date"
                    value={formData.personal.visitDate}
                    onChange={createChangeHandler("personal", "visitDate")}
                  />

                  <InputField
                    label="Package Quoted (₹)"
                    type="number"
                    value={formData.personal.packageQuoted}
                    onChange={createChangeHandler("personal", "packageQuoted")}
                    placeholder="Package amount"
                  />

                  <InputField
                    label="Technique Quoted"
                    type="select"
                    value={formData.personal.techniqueQuoted}
                    onChange={createChangeHandler(
                      "personal",
                      "techniqueQuoted"
                    )}
                    options={[
                      { value: "FUE", label: "FUE" },
                      { value: "INDIAN DHI", label: "Indian DHI" },
                      { value: "TURKISH DHI", label: "Turkish DHI" },
                      { value: "HYBRID", label: "HYBRID" },
                      { value: "PRP", label: "PRP" },
                      { value: "GFC", label: "GFC" },
                      { value: "Alopecia", label: "Alopecia" },
                      { value: "Other", label: "Other" },
                    ]}
                  />

                  <InputField
                    label="Address"
                    type="textarea"
                    value={formData.personal.address}
                    onChange={createChangeHandler("personal", "address")}
                    placeholder="Complete address"
                    className="md:col-span-2"
                  />

                  <InputField
                    label="Remarks"
                    type="textarea"
                    value={formData.personal.remarks}
                    onChange={createChangeHandler("personal", "remarks")}
                    placeholder="Additional remarks"
                    className="md:col-span-2"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8">
                <StepHeader
                  icon={FileText}
                  title="Counselling Details"
                  description="Update consultation information"
                  color="green"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Counsellor"
                    type="select"
                    value={formData.counselling.counsellor}
                    onChange={createChangeHandler("counselling", "counsellor")}
                    options={employees.Counsellor.map((emp) => ({
                      value: emp._id,
                      label: emp.name,
                    }))}
                  />

                  <InputField
                    label="Technique Suggested"
                    type="select"
                    value={formData.counselling.techniqueSuggested}
                    onChange={createChangeHandler(
                      "counselling",
                      "techniqueSuggested"
                    )}
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
                    onChange={createChangeHandler(
                      "counselling",
                      "graftsSuggested"
                    )}
                    placeholder="Number of grafts"
                  />

                  <div className="space-y-3 my-3">
                    <label className="block mb-4 text-md underline font-bold text-gray-700">
                      Hair Loss Type *
                    </label>
                    <div className="space-y-2 flex flex-wrap space-x-7">
                      {[
                        {
                          value: "male_pattern",
                          label: "Male Pattern Baldness",
                        },
                        {
                          value: "female_pattern",
                          label: "Female Pattern Baldness",
                        },
                        {
                          value: "receding_hairline",
                          label: "Receding Hairline",
                        },
                        { value: "crown_thinning", label: "Crown Thinning" },
                        {
                          value: "diffuse_thinning",
                          label: "Diffuse Thinning",
                        },
                        { value: "frontal_loss", label: "Frontal Hair Loss" },
                        {
                          value: "traction_alopecia",
                          label: "Traction Alopecia",
                        },
                        { value: "other", label: "Other" },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center align-middle space-x-1"
                        >
                          <input
                            type="radio"
                            name="hairlossType"
                            value={option.value}
                            checked={
                              formData.counselling.hairlossType === option.value
                            }
                            onChange={createChangeHandler(
                              "counselling",
                              "hairlossType"
                            )}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-md text-gray-700">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 my-3">
                    <label className="block mb-4 text-md underline font-bold text-gray-700">
                      Area of Concern *
                    </label>
                    <div className="space-y-2 flex flex-wrap space-x-7">
                      {[
                        { value: "frontal", label: "Frontal Area" },
                        { value: "mid_scalp", label: "Mid Scalp" },
                        { value: "crown", label: "Crown/Vortex" },
                        { value: "hairline", label: "Hairline Correction" },
                        { value: "temples", label: "Temples" },
                        { value: "beard", label: "Beard/Moustache" },
                        { value: "multiple_areas", label: "Multiple Areas" },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center align-baseline space-x-1"
                        >
                          <input
                            type="radio"
                            name="areaofConcern"
                            value={option.value}
                            checked={
                              formData.counselling.areaofConcern ===
                              option.value
                            }
                            onChange={createChangeHandler(
                              "counselling",
                              "areaofConcern"
                            )}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-md text-gray-700">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block mb-4 text-lg underline font-bold text-gray-700">
                      Hair Loss Reason *
                    </label>
                    <div className="flex flex-wrap space-x-7 space-y-2">
                      {[
                        { value: "genetic", label: "Genetic/Hereditary" },
                        { value: "hormonal", label: "Hormonal Changes" },
                        { value: "stress", label: "Stress Related" },
                        {
                          value: "nutritional",
                          label: "Nutritional Deficiency",
                        },
                        { value: "medical", label: "Medical Condition" },
                        {
                          value: "medication",
                          label: "Medication Side Effects",
                        },
                        { value: "lifestyle", label: "Lifestyle Factors" },
                        { value: "ageing", label: "Ageing Process" },
                        { value: "unknown", label: "Unknown/Idiopathic" },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center align-middle space-x-1"
                        >
                          <input
                            type="radio"
                            name="hairlossreason"
                            value={option.value}
                            checked={
                              formData.counselling.hairlossreason ===
                              option.value
                            }
                            onChange={createChangeHandler(
                              "counselling",
                              "hairlossreason"
                            )}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-md text-gray-700">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block mb-4 text-md underline font-bold text-gray-700">
                      Hair Loss Duration *
                    </label>
                    <div className="space-y-2 flex flex-wrap space-x-5">
                      {[
                        {
                          value: "less_than_1_year",
                          label: "Less than 1 year",
                        },
                        { value: "1_2_years", label: "1-2 years" },
                        { value: "2_5_years", label: "2-5 years" },
                        { value: "5_10_years", label: "5-10 years" },
                        {
                          value: "more_than_10_years",
                          label: "More than 10 years",
                        },
                        {
                          value: "progressive",
                          label: "Progressive (ongoing)",
                        },
                        {
                          value: "recent_accelerated",
                          label: "Recent accelerated loss",
                        },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center space-x-1"
                        >
                          <input
                            type="radio"
                            name="hairlossduration"
                            value={option.value}
                            checked={
                              formData.counselling.hairlossduration ===
                              option.value
                            }
                            onChange={createChangeHandler(
                              "counselling",
                              "hairlossduration"
                            )}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-md text-gray-700">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <BenefitsManager
                    benefits={formData.counselling.additionalbenefits}
                    onChange={(value, index) =>
                      handleArrayChange(
                        "counselling",
                        "additionalbenefits",
                        value,
                        index
                      )
                    }
                    onAdd={(value) =>
                      addArrayItem("counselling", "additionalbenefits", value)
                    }
                    onRemove={(index) =>
                      removeArrayItem(
                        "counselling",
                        "additionalbenefits",
                        index
                      )
                    }
                  />

                  <InputField
                    label="Notes"
                    type="textarea"
                    value={formData.counselling.notes}
                    onChange={createChangeHandler("counselling", "notes")}
                    placeholder="Additional counselling notes"
                    className="md:col-span-2 mt-3"
                  />

                  <div className="md:col-span-2">
                    <InputField
                      label="Ready for Surgery"
                      type="checkbox"
                      value={formData.counselling.readyForSurgery}
                      onChange={createChangeHandler(
                        "counselling",
                        "readyForSurgery"
                      )}
                      className="mt-4"
                      placeholder="Patient is ready for surgery"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8">
                <StepHeader
                  icon={Heart}
                  title="Medical Information"
                  description="Health history and vital signs"
                  color="red"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Allergies"
                    type="textarea"
                    value={formData.medical.allergies}
                    onChange={createChangeHandler("medical", "allergies")}
                    placeholder="List any known allergies"
                    className="md:col-span-2"
                  />

                  <InputField
                    label="Medical History"
                    type="select"
                    value={formData.medical.medicalHistory}
                    onChange={createChangeHandler("medical", "medicalHistory")}
                    options={[
                      { value: "YES", label: "Yes" },
                      { value: "NO", label: "No" },
                      { value: "UNKNOWN", label: "Unknown" },
                    ]}
                  />

                  <InputField
                    label="Blood Group"
                    type="select"
                    value={formData.medical.bloodGroup}
                    onChange={createChangeHandler("medical", "bloodGroup")}
                    options={[
                      { value: "A+", label: "A+" },
                      { value: "A-", label: "A-" },
                      { value: "B+", label: "B+" },
                      { value: "B-", label: "B-" },
                      { value: "AB+", label: "AB+" },
                      { value: "AB-", label: "AB-" },
                      { value: "O+", label: "O+" },
                      { value: "O-", label: "O-" },
                    ]}
                  />

                  <InputField
                    label="Sugar Level"
                    type="text"
                    value={formData.medical.sugar}
                    onChange={createChangeHandler("medical", "sugar")}
                    placeholder="Sugar level"
                  />

                  <InputField
                    label="Blood Pressure"
                    type="text"
                    value={formData.medical.bp}
                    onChange={createChangeHandler("medical", "bp")}
                    placeholder="Blood pressure reading"
                  />

                  <InputField
                    label="Pulse Rate"
                    type="text"
                    value={formData.medical.pulse}
                    onChange={createChangeHandler("medical", "pulse")}
                    placeholder="Pulse rate"
                  />

                  <InputField
                    label="Weight"
                    type="text"
                    value={formData.medical.weight}
                    onChange={createChangeHandler("medical", "weight")}
                    placeholder="Weight"
                  />

                  <InputField
                    label="HIV Status"
                    type="text"
                    value={formData.medical.hiv}
                    onChange={createChangeHandler("medical", "hiv")}
                    placeholder="HIV status"
                  />

                  <InputField
                    label="HCV Status"
                    type="text"
                    value={formData.medical.hcv}
                    onChange={createChangeHandler("medical", "hcv")}
                    placeholder="HCV status"
                  />
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="space-y-8">
                <StepHeader
                  icon={Scissors}
                  title="Surgery Details"
                  description="Update surgical procedure information"
                  color="orange"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Surgery Date"
                    type="date"
                    value={formData.surgery.surgeryDate}
                    onChange={createChangeHandler("surgery", "surgeryDate")}
                  />

                  <InputField
                    label="Surgery Location"
                    type="text"
                    value={formData.surgery.location}
                    onChange={createChangeHandler("surgery", "location")}
                    placeholder="Surgery location"
                  />

                  <InputField
                    label="Operation Theatre (OT) Number"
                    type="number"
                    value={formData.surgery.OT}
                    onChange={createChangeHandler("surgery", "OT")}
                    placeholder="OT number"
                  />

                  <InputField
                    label="Technique Used"
                    type="text"
                    value={formData.surgery.technique}
                    onChange={createChangeHandler("surgery", "technique")}
                    placeholder="Surgical technique"
                  />

                  <InputField
                    label="Grafts Needed"
                    type="number"
                    value={formData.surgery.graftsneed}
                    onChange={createChangeHandler("surgery", "graftsneed")}
                    placeholder="Number of grafts needed"
                  />

                  <InputField
                    label="Grafts Implanted"
                    type="number"
                    value={formData.surgery.graftsImplanted}
                    onChange={createChangeHandler("surgery", "graftsImplanted")}
                    placeholder="Number of grafts implanted"
                  />

                  <InputField
                    label="Donor Area Condition"
                    type="text"
                    value={formData.surgery.donorCondition}
                    onChange={createChangeHandler("surgery", "donorCondition")}
                    placeholder="Donor area condition"
                    className="md:col-span-2"
                  />

                  <div className="md:col-span-2">
                    <MultiSelectEmployee
                      label="Operating Doctors (Select Multiple)"
                      options={employees.Doctor}
                      selectedIds={formData.surgery.doctor}
                      onChange={(newSelection) =>
                        handleChange("surgery", "doctor", newSelection)
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <MultiSelectEmployee
                      label="Senior Technicians (Select Multiple)"
                      options={employees.Technician}
                      selectedIds={formData.surgery.seniorTech}
                      onChange={(newSelection) =>
                        handleChange("surgery", "seniorTech", newSelection)
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <MultiSelectEmployee
                      label="Right Side Implanters (Select Multiple)"
                      options={employees.Implanter}
                      selectedIds={formData.surgery.implanterRight}
                      onChange={(newSelection) =>
                        handleChange("surgery", "implanterRight", newSelection)
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <MultiSelectEmployee
                      label="Left Side Implanters (Select Multiple)"
                      options={employees.Implanter}
                      selectedIds={formData.surgery.implanterLeft}
                      onChange={(newSelection) =>
                        handleChange("surgery", "implanterLeft", newSelection)
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <MultiSelectEmployee
                      label="Grafting Specialists (Select Multiple)"
                      options={employees.Others}
                      selectedIds={formData.surgery.graftingPerson}
                      onChange={(newSelection) =>
                        handleChange("surgery", "graftingPerson", newSelection)
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <MultiSelectEmployee
                      label="Surgery Helpers (Select Multiple)"
                      options={employees.Others}
                      selectedIds={formData.surgery.helper}
                      onChange={(newSelection) =>
                        handleChange("surgery", "helper", newSelection)
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-8">
                <StepHeader
                  icon={Droplet}
                  title="After Surgery Care"
                  description="Post-operative care schedule"
                  color="pink"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Head Wash Date"
                    type="date"
                    value={formData.afterSurgery.headwashDate}
                    onChange={createChangeHandler(
                      "afterSurgery",
                      "headwashDate"
                    )}
                  />

                  <InputField
                    label="Bandage Removal Date"
                    type="date"
                    value={formData.afterSurgery.bandageRemovalDate}
                    onChange={createChangeHandler(
                      "afterSurgery",
                      "bandageRemovalDate"
                    )}
                  />

                  <PRPManager
                    prpSessions={formData.afterSurgery.prp}
                    onChange={handlePRPChange}
                    onAdd={addPRPSession}
                    onRemove={removePRPSession}
                  />
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-8">
                <StepHeader
                  icon={CreditCard}
                  title="Payment Details"
                  description="Update financial information and transactions"
                  color="purple"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField
                    label="Total Amount (₹)"
                    type="number"
                    value={formData.payments.totalAmount}
                    onChange={createChangeHandler("payments", "totalAmount")}
                    placeholder="Total amount quoted"
                  />

                  <InputField
                    label="Amount Received (₹)"
                    type="number"
                    value={formData.payments.amountReceived}
                    onChange={createChangeHandler("payments", "amountReceived")}
                    placeholder="Amount received"
                  />

                  <InputField
                    label="Pending Amount (₹)"
                    type="number"
                    value={formData.payments.pendingAmount}
                    onChange={createChangeHandler("payments", "pendingAmount")}
                    placeholder="Pending amount"
                  />

                  <InputField
                    label="Medicine Amount (₹)"
                    type="number"
                    value={formData.payments.medicineAmount}
                    onChange={createChangeHandler("payments", "medicineAmount")}
                    placeholder="Medicine cost"
                  />

                  <InputField
                    label="Discount (₹)"
                    type="number"
                    value={formData.payments.discount}
                    onChange={createChangeHandler("payments", "discount")}
                    placeholder="Discount amount"
                  />

                  <TransactionManager
                    transactions={formData.payments.transactions}
                    onChange={handleTransactionChange}
                    onAdd={addTransaction}
                    onRemove={removeTransaction}
                  />
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-8">
                <StepHeader
                  icon={FileUp}
                  title="Document Management"
                  description="Manage patient images and forms"
                  color="indigo"
                />

                <div className="space-y-8">
                  <DocumentUpload
                    title="Patient Images"
                    icon={Image}
                    color="indigo"
                    files={formData.documents.images}
                    onUpload={(files) => handleFileUpload("images", files)}
                    onRemove={(index) => removeFile("images", index)}
                    accept="image/*"
                    uploadId="images-upload"
                    isUploading={uploadingFiles.images}
                  />

                  <DocumentUpload
                    title="Consent Forms"
                    icon={FileText}
                    color="blue"
                    files={formData.documents.consentForm}
                    onUpload={(files) => handleFileUpload("consentForm", files)}
                    onRemove={(index) => removeFile("consentForm", index)}
                    accept=".pdf,.doc,.docx"
                    uploadId="consent-upload"
                    isUploading={uploadingFiles.consentForm}
                  />

                  <DocumentUpload
                    title="Surgery Forms"
                    icon={FileText}
                    color="green"
                    files={formData.documents.suregeryForm}
                    onUpload={(files) =>
                      handleFileUpload("suregeryForm", files)
                    }
                    onRemove={(index) => removeFile("suregeryForm", index)}
                    accept=".pdf,.doc,.docx"
                    uploadId="surgery-upload"
                    isUploading={uploadingFiles.suregeryForm}
                  />

                  <DocumentUpload
                    title="Consultation Forms"
                    icon={Calendar}
                    color="purple"
                    files={formData.documents.consultForm}
                    onUpload={(files) => handleFileUpload("consultForm", files)}
                    onRemove={(index) => removeFile("consultForm", index)}
                    accept=".pdf,.doc,.docx"
                    uploadId="consult-upload"
                    isUploading={uploadingFiles.consultForm}
                  />
                </div>
              </div>
            )}

            <div className="mt-12 flex justify-between items-center pt-6 border-t border-gray-200">
              {step > 1 ? (
                <button
                  type="button"
                  className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200"
                  onClick={prevStep}
                >
                  ← Previous
                </button>
              ) : (
                <div></div>
              )}

              <div className="flex space-x-4">
                {step < 7 && (
                  <button
                    type="button"
                    className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors duration-200"
                    onClick={nextStep}
                  >
                    Next →
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleUpdate}
                  className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2" size={20} />
                      Update Details
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}
