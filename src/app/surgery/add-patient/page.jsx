"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import InputField from "@/components/InputField";
import SurgerySidebar from "@/components/Sidebars/SurgerySidebar";
import { prepareFileForUpload, formatBytes } from "@/utils/compressImage";
import {
  Eye, Download, Plus,
  Upload,
  X,
  FileText,
  Image,
  Calendar,
  User,
  Heart,
  Scissors,
  FileUp,
  CheckCircle,
  UserPlus,
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
    if (benefitIndex > -1) onRemove(benefitIndex);
    else onAdd(benefit);
  };

  const handleCustomBenefitAdd = (customBenefit) => {
    if (customBenefit.trim() && !benefits.includes(customBenefit.trim()))
      onAdd(customBenefit.trim());
  };

  return (
    <div className="md:col-span-2">
      <label className="block text-md underline font-semibold text-gray-700 mb-4">
        Additional Benefits *
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {predefinedBenefits.map((benefit) => (
          <label key={benefit} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-200">
            <input type="checkbox" checked={benefits.includes(benefit)} onChange={() => handleBenefitToggle(benefit)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
            <span className="text-sm font-medium text-gray-700">{benefit}</span>
          </label>
        ))}
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Add Custom Benefit</label>
        <div className="flex space-x-3">
          <input type="text" className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm" placeholder="Enter custom benefit"
            onKeyPress={(e) => { if (e.key === "Enter") { handleCustomBenefitAdd(e.target.value); e.target.value = ""; } }} />
          <button type="button" className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-200 font-medium"
            onClick={(e) => { const input = e.target.previousElementSibling; handleCustomBenefitAdd(input.value); input.value = ""; }}>
            Add
          </button>
        </div>
      </div>
      {benefits.length > 0 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Selected Benefits ({benefits.length})</label>
          <div className="flex flex-wrap gap-2">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-2 rounded-lg">
                <span className="text-sm font-medium">{benefit}</span>
                <button type="button" className="text-blue-600 hover:text-blue-800 transition-colors duration-200" onClick={() => onRemove(index)}><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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
              <label key={employee._id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                <input type="checkbox" checked={selectedIds.includes(employee._id)} onChange={() => handleToggle(employee._id)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                <span className="text-sm text-gray-700">{employee.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      {selectedIds.length > 0 && <p className="text-sm text-gray-600 mt-2">{selectedIds.length} selected</p>}
    </div>
  );
};

const DocumentUpload = ({ title, icon: Icon, files, onUpload, onRemove, accept, uploadId, isUploading }) => {
  const [viewingFile, setViewingFile] = useState(null);
  const isPDF = (f) => f.toLowerCase().endsWith(".pdf");
  const getFileName = (url) => { try { return decodeURIComponent(url.split("/").pop().split("?")[0]); } catch { return url; } };

  return (
    <>
      <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4 flex items-center justify-center"><Icon size={48} /></div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">{title}</h4>
          <input type="file" multiple accept={accept} onChange={(e) => onUpload(e.target.files)} className="hidden" id={uploadId} disabled={isUploading} />
          <label htmlFor={uploadId} className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${isUploading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 cursor-pointer"} transition-colors duration-200`}>
            <Upload className="mr-2" size={20} />{isUploading ? "Uploading..." : "Add Files"}
          </label>
          {files.length > 0 && (
            <div className="mt-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Uploaded Files ({files.length}):</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {files.map((filePath, index) => (
                  <div key={index} className="flex items-center justify-between bg-white px-4 py-3 rounded-md border hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className={`shrink-0 w-8 h-8 rounded flex items-center justify-center ${isPDF(filePath) ? "bg-red-100" : "bg-blue-100"}`}>
                        {isPDF(filePath) ? <FileText size={16} className="text-red-600" /> : <Image size={16} className="text-blue-600" />}
                      </div>
                      <span className="text-sm font-medium text-gray-700 block truncate">{getFileName(filePath)}</span>
                    </div>
                    <div className="flex items-center space-x-2 ml-2 shrink-0">
                      <button type="button" onClick={() => setViewingFile(filePath)} className="p-2 text-blue-600 hover:bg-blue-100 rounded transition-colors"><Eye size={16} /></button>
                      <button type="button" onClick={() => { const a = Object.assign(document.createElement("a"), { href: filePath, download: getFileName(filePath), target: "_blank" }); a.click(); }} className="p-2 text-green-600 hover:bg-green-100 rounded transition-colors"><Download size={16} /></button>
                      <button type="button" onClick={() => onRemove(index)} className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"><X size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {viewingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setViewingFile(null)}>
          <div className="relative bg-white rounded-lg w-full max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">{getFileName(viewingFile)}</h3>
              <button onClick={() => setViewingFile(null)} className="text-gray-600 hover:text-gray-900 text-2xl font-bold px-3 hover:bg-gray-200 rounded">✕</button>
            </div>
            <div className="flex-1 overflow-hidden bg-gray-100">
              {isPDF(viewingFile) ? <iframe src={viewingFile} className="w-full h-full border-0" title="PDF Viewer" /> : <div className="w-full h-full flex items-center justify-center p-4"><img src={viewingFile} alt="Document" className="max-w-full max-h-full object-contain" /></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const StepHeader = ({ icon: Icon, title, description, color }) => (
  <div className="text-center mb-8">
    <div className={`mx-auto h-16 w-16 text-${color}-500 mb-4 flex items-center justify-center`}><Icon size={64} /></div>
    <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

const emptyForm = () => ({
  personal: { name: "", phone: "", email: "", age: "", gender: "", branch: "", address: "", profession: "", visitDate: "", reference: "", packageQuoted: "", techniqueQuoted: "", remarks: "" },
  medical: { allergies: "", medicalHistory: "", bloodGroup: "", sugar: "", bp: "", pulse: "", weight: "", hiv: "", hcv: "" },
  counselling: { counsellor: "", techniqueSuggested: "", finlpackage: "", graftsSuggested: "", readyForSurgery: false, notes: "", additionalbenefits: [], medicines: [], hairlossType: "", areaofConcern: "", hairlossreason: "", hairlossduration: "" },
  surgery: { surgeryDate: "", location: "", OT: "", technique: "", graftsneed: "", graftsImplanted: "", donorCondition: "", doctor: [], seniorTech: [], implanterRight: [], implanterLeft: [], graftingPerson: [], helper: [] },
  afterSurgery: { headwashDate: "", bandageRemovalDate: "", prp: [] },
  documents: { images: [], consentForm: [], suregeryForm: [], consultForm: [] },
  ops: { status: "NEW" },
});

export default function SurgeryAddPatient() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [formData, setFormData] = useState(emptyForm());
  const [employees, setEmployees] = useState({ Agent: [], Counsellor: [], Doctor: [], Technician: [], Implanter: [], Others: [] });
  const toast = useToast();

  const stepConfig = [
    { number: 1, title: "Personal Details",    icon: User,     color: "blue"   },
    { number: 2, title: "Counsellor Details",  icon: FileText, color: "green"  },
    { number: 3, title: "Medical Information", icon: Heart,    color: "indigo" },
    { number: 4, title: "Surgery Details",     icon: Scissors, color: "green"  },
    { number: 5, title: "Document Upload",     icon: FileUp,   color: "indigo" },
  ];

  useEffect(() => {
    fetch("/api/employees/get-id").then((r) => r.json()).then((d) => { if (d.success) setEmployees(d.data); }).catch(() => {});
  }, []);

  const handleChange = (section, field, value) =>
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  const createChangeHandler = (section, field) => (e) =>
    handleChange(section, field, e.target.type === "checkbox" ? e.target.checked : e.target.value);

  const handleArrayChange = (section, field, value, index) => {
    const arr = [...formData[section][field]]; arr[index] = value;
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], [field]: arr } }));
  };

  const addArrayItem = (section, field, value = "") =>
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], [field]: [...prev[section][field], value] } }));

  const removeArrayItem = (section, field, index) =>
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], [field]: prev[section][field].filter((_, i) => i !== index) } }));

  const handleFileUpload = async (section, files) => {
    if (!files?.length) return;
    setUploadingFiles((prev) => ({ ...prev, [section]: true }));
    try {
      const compressionNotes = [];
      const paths = await Promise.all(Array.from(files).map(async (file) => {
        const { file: preparedFile, wasCompressed, originalSize, compressedSize, warning } = await prepareFileForUpload(file);
        if (warning) toast.error(warning);
        if (wasCompressed) compressionNotes.push(`${file.name}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)}`);
        const fd = new FormData(); fd.append("file", preparedFile); fd.append("section", section); fd.append("patientId", "temp");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
        return (await res.json()).filePath;
      }));
      setFormData((prev) => ({ ...prev, documents: { ...prev.documents, [section]: [...prev.documents[section], ...paths] } }));
      toast.success([`Uploaded ${paths.length} file(s)`, ...compressionNotes].join(" · "));
    } catch { toast.error("Failed to upload some files. Please try again."); }
    finally { setUploadingFiles((prev) => ({ ...prev, [section]: false })); }
  };

  const removeFile = async (section, index) => {
    if (!confirm("Remove this file?")) return;
    const filePath = formData.documents[section][index];
    try {
      await fetch("/api/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath }) });
      setFormData((prev) => ({ ...prev, documents: { ...prev.documents, [section]: prev.documents[section].filter((_, i) => i !== index) } }));
      toast.success("File removed");
    } catch { toast.error("Error removing file"); }
  };

  const cleanObjectIdFields = (data) => {
    const d = JSON.parse(JSON.stringify(data));
    [["personal","reference"],["counselling","counsellor"]].forEach(([s,f]) => { if (d[s]?.[f] === "" || d[s]?.[f] === undefined) d[s][f] = null; });
    ["doctor","seniorTech","implanterRight","implanterLeft","graftingPerson","helper"].forEach((f) => {
      d.surgery[f] = Array.isArray(d.surgery[f]) ? d.surgery[f].filter((id) => id && id !== "") : [];
    });
    [["personal","age"],["personal","packageQuoted"],["counselling","finlpackage"],["counselling","graftsSuggested"],["surgery","OT"],["surgery","graftsneed"],["surgery","graftsImplanted"]]
      .forEach(([s,f]) => { if (d[s]?.[f] === "" || d[s]?.[f] === undefined) d[s][f] = null; });
    return d;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/patients/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleanObjectIdFields(formData)) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "HTTP error"); }
      toast.success("Patient registered successfully!");
      setTimeout(() => { setFormData(emptyForm()); setStep(1); }, 2000);
    } catch { toast.error("Error submitting patient data"); }
    finally { setIsSubmitting(false); }
  };

  return (
    <section className="flex min-h-screen">
      <SurgerySidebar />
      <main className="flex-1 px-12 py-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-8 py-6 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold flex items-center space-x-2"><UserPlus size={28} /><span>Patient Registration</span></h1>
                <p className="text-blue-100 mt-1">Complete all steps to register a new patient</p>
              </div>
              <div className="text-right"><p className="text-sm text-blue-100">Current Status</p><p className="font-medium">New Registration</p></div>
            </div>
          </div>

          <div className="px-8 py-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                {stepConfig.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button key={s.number} onClick={() => setStep(s.number)}
                      className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${s.number === step ? `bg-${s.color}-600 text-white shadow-lg scale-110` : s.number < step ? "bg-red-950 text-white shadow-md hover:scale-105" : "bg-gray-200 text-gray-500 hover:bg-gray-300"}`}>
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
              <div className="text-sm text-gray-600 font-medium">Step {step} of {stepConfig.length}: {stepConfig[step - 1].title}</div>
            </div>
          </div>

          <div className="px-8 py-8">
            {step === 1 && (
              <div className="space-y-8">
                <StepHeader icon={User} title="Personal Information" description="Let's start with basic details" color="blue" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField label="Full Name" required value={formData.personal.name} onChange={createChangeHandler("personal","name")} placeholder="Enter full name" />
                  <InputField label="Phone Number" type="tel" required value={formData.personal.phone} onChange={createChangeHandler("personal","phone")} placeholder="Enter phone number" />
                  <InputField label="Email Address" type="email" value={formData.personal.email} onChange={createChangeHandler("personal","email")} placeholder="Enter email address" />
                  <InputField label="Age" type="number" value={formData.personal.age} onChange={createChangeHandler("personal","age")} placeholder="Enter age" />
                  <InputField label="Gender" type="select" value={formData.personal.gender} onChange={createChangeHandler("personal","gender")} options={[{value:"MALE",label:"Male"},{value:"FEMALE",label:"Female"},{value:"OTHERS",label:"Others"}]} />
                  <InputField label="Branch" type="select" value={formData.personal.branch} onChange={createChangeHandler("personal","branch")} options={[{value:"Delhi",label:"Delhi"},{value:"Mumbai",label:"Mumbai"},{value:"Hyderabad",label:"Hyderabad"},{value:"Noida",label:"Noida"},{value:"Gurgaon",label:"Gurgaon"}]} />
                  <InputField label="Profession" value={formData.personal.profession} onChange={createChangeHandler("personal","profession")} placeholder="Enter profession" />
                  <InputField label="Visit Date" type="date" value={formData.personal.visitDate} onChange={createChangeHandler("personal","visitDate")} />
                  <InputField label="Reference Source (Agent)" type="searchable-select" value={formData.personal.reference} onChange={createChangeHandler("personal","reference")} options={employees.Agent.map((e) => ({value:e._id,label:e.name}))} />
                  <InputField label="Package Quoted (₹)" type="number" value={formData.personal.packageQuoted} onChange={createChangeHandler("personal","packageQuoted")} placeholder="Package amount" />
                  <InputField label="Technique Quoted" type="select" value={formData.personal.techniqueQuoted} onChange={createChangeHandler("personal","techniqueQuoted")} options={[{value:"FUE",label:"FUE"},{value:"INDIAN DHI",label:"Indian DHI"},{value:"TURKISH DHI",label:"Turkish DHI"},{value:"HYBRID",label:"HYBRID"},{value:"PRP",label:"PRP"},{value:"GFC",label:"GFC"},{value:"Alopecia",label:"Alopecia"},{value:"Other",label:"Other"}]} />
                  <InputField label="Address" type="textarea" value={formData.personal.address} onChange={createChangeHandler("personal","address")} placeholder="Complete address" className="md:col-span-2" />
                  <InputField label="Remarks" type="textarea" value={formData.personal.remarks} onChange={createChangeHandler("personal","remarks")} placeholder="Additional remarks" className="md:col-span-2" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8">
                <StepHeader icon={FileText} title="Counselling Details" description="Professional consultation information" color="green" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField label="Counsellor" type="select" value={formData.counselling.counsellor} onChange={createChangeHandler("counselling","counsellor")} options={employees.Counsellor.map((e) => ({value:e._id,label:e.name}))} />
                  <InputField label="Technique Suggested" type="select" value={formData.counselling.techniqueSuggested} onChange={createChangeHandler("counselling","techniqueSuggested")} options={[{value:"FUE",label:"FUE"},{value:"INDIAN DHI",label:"INDIAN DHI"},{value:"TURKISH DHI",label:"Turkish DHI"},{value:"HYBRID",label:"HYBRID"},{value:"PRP",label:"PRP"},{value:"GFC",label:"GFC"},{value:"Other",label:"Other"}]} />
                  <InputField label="Final Package Amount (₹)" type="number" value={formData.counselling.finlpackage} onChange={createChangeHandler("counselling","finlpackage")} placeholder="Final package amount" />
                  <InputField label="Grafts Suggested" type="number" value={formData.counselling.graftsSuggested} onChange={createChangeHandler("counselling","graftsSuggested")} placeholder="Number of grafts" />
                  <div className="space-y-3 my-3">
                    <label className="block mb-4 text-md underline font-bold text-gray-700">Hair Loss Type *</label>
                    <div className="space-y-2 flex flex-wrap space-x-7">
                      {[{value:"male_pattern",label:"Male Pattern Baldness"},{value:"female_pattern",label:"Female Pattern Baldness"},{value:"receding_hairline",label:"Receding Hairline"},{value:"crown_thinning",label:"Crown Thinning"},{value:"diffuse_thinning",label:"Diffuse Thinning"},{value:"frontal_loss",label:"Frontal Hair Loss"},{value:"traction_alopecia",label:"Traction Alopecia"},{value:"other",label:"Other"}].map((o) => (
                        <label key={o.value} className="flex items-center align-middle space-x-1">
                          <input type="radio" name="hairlossType" value={o.value} checked={formData.counselling.hairlossType===o.value} onChange={createChangeHandler("counselling","hairlossType")} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-md text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 my-3">
                    <label className="block mb-4 text-md underline font-bold text-gray-700">Area of Concern *</label>
                    <div className="space-y-2 flex flex-wrap space-x-7">
                      {[{value:"frontal",label:"Frontal Area"},{value:"mid_scalp",label:"Mid Scalp"},{value:"crown",label:"Crown/Vortex"},{value:"hairline",label:"Hairline Correction"},{value:"temples",label:"Temples"},{value:"beard",label:"Beard/Moustache"},{value:"multiple_areas",label:"Multiple Areas"}].map((o) => (
                        <label key={o.value} className="flex items-center align-baseline space-x-1">
                          <input type="radio" name="areaofConcern" value={o.value} checked={formData.counselling.areaofConcern===o.value} onChange={createChangeHandler("counselling","areaofConcern")} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-md text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="block mb-4 text-lg underline font-bold text-gray-700">Hair Loss Reason *</label>
                    <div className="flex flex-wrap space-x-7 space-y-2">
                      {[{value:"genetic",label:"Genetic/Hereditary"},{value:"hormonal",label:"Hormonal Changes"},{value:"stress",label:"Stress Related"},{value:"nutritional",label:"Nutritional Deficiency"},{value:"medical",label:"Medical Condition"},{value:"medication",label:"Medication Side Effects"},{value:"lifestyle",label:"Lifestyle Factors"},{value:"ageing",label:"Ageing Process"},{value:"unknown",label:"Unknown/Idiopathic"}].map((o) => (
                        <label key={o.value} className="flex items-center align-middle space-x-1">
                          <input type="radio" name="hairlossreason" value={o.value} checked={formData.counselling.hairlossreason===o.value} onChange={createChangeHandler("counselling","hairlossreason")} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-md text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="block mb-4 text-md underline font-bold text-gray-700">Hair Loss Duration *</label>
                    <div className="space-y-2 flex flex-wrap space-x-5">
                      {[{value:"less_than_1_year",label:"Less than 1 year"},{value:"1_2_years",label:"1-2 years"},{value:"2_5_years",label:"2-5 years"},{value:"5_10_years",label:"5-10 years"},{value:"more_than_10_years",label:"More than 10 years"},{value:"progressive",label:"Progressive (ongoing)"},{value:"recent_accelerated",label:"Recent accelerated loss"}].map((o) => (
                        <label key={o.value} className="flex items-center space-x-1">
                          <input type="radio" name="hairlossduration" value={o.value} checked={formData.counselling.hairlossduration===o.value} onChange={createChangeHandler("counselling","hairlossduration")} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-md text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <BenefitsManager benefits={formData.counselling.additionalbenefits} onChange={(v,i) => handleArrayChange("counselling","additionalbenefits",v,i)} onAdd={(v) => addArrayItem("counselling","additionalbenefits",v)} onRemove={(i) => removeArrayItem("counselling","additionalbenefits",i)} />
                  <InputField label="Notes" type="textarea" value={formData.counselling.notes} onChange={createChangeHandler("counselling","notes")} placeholder="Additional counselling notes" className="md:col-span-2 mt-3" />
                  <div className="md:col-span-2">
                    <InputField label="Ready for Surgery" type="checkbox" value={formData.counselling.readyForSurgery} onChange={createChangeHandler("counselling","readyForSurgery")} className="mt-4" placeholder="Patient is ready for surgery" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8">
                <StepHeader icon={Heart} title="Medical Information" description="Health history and vital signs" color="red" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField label="Allergies" type="textarea" value={formData.medical.allergies} onChange={createChangeHandler("medical","allergies")} placeholder="List any known allergies" className="md:col-span-2" />
                  <InputField label="Medical History" type="select" value={formData.medical.medicalHistory} onChange={createChangeHandler("medical","medicalHistory")} options={[{value:"YES",label:"Yes"},{value:"NO",label:"No"},{value:"UNKNOWN",label:"Unknown"}]} />
                  <InputField label="Blood Group" type="select" value={formData.medical.bloodGroup} onChange={createChangeHandler("medical","bloodGroup")} options={[{value:"A+",label:"A+"},{value:"A-",label:"A-"},{value:"B+",label:"B+"},{value:"B-",label:"B-"},{value:"AB+",label:"AB+"},{value:"AB-",label:"AB-"},{value:"O+",label:"O+"},{value:"O-",label:"O-"}]} />
                  <InputField label="Sugar Level" value={formData.medical.sugar} onChange={createChangeHandler("medical","sugar")} placeholder="Sugar level" />
                  <InputField label="Blood Pressure" value={formData.medical.bp} onChange={createChangeHandler("medical","bp")} placeholder="Blood pressure reading" />
                  <InputField label="Pulse Rate" value={formData.medical.pulse} onChange={createChangeHandler("medical","pulse")} placeholder="Pulse rate" />
                  <InputField label="Weight" value={formData.medical.weight} onChange={createChangeHandler("medical","weight")} placeholder="Weight" />
                  <InputField label="HIV Status" type="select" value={formData.medical.hiv} onChange={createChangeHandler("medical","hiv")} options={[{value:"Positive",label:"Positive"},{value:"Negative",label:"Negative"}]} />
                  <InputField label="HCV Status" type="select" value={formData.medical.hcv} onChange={createChangeHandler("medical","hcv")} options={[{value:"Positive",label:"Positive"},{value:"Negative",label:"Negative"}]} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-8">
                <StepHeader icon={Scissors} title="Surgery Details" description="Surgical procedure information" color="orange" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gap-x-12">
                  <InputField label="Surgery Date" type="date" value={formData.surgery.surgeryDate} onChange={createChangeHandler("surgery","surgeryDate")} />
                  <InputField label="Surgery Location" value={formData.surgery.location} onChange={createChangeHandler("surgery","location")} placeholder="Surgery location" />
                  <InputField label="Operation Theatre (OT) Number" type="number" value={formData.surgery.OT} onChange={createChangeHandler("surgery","OT")} placeholder="OT number" />
                  <InputField label="Technique Used" value={formData.surgery.technique} onChange={createChangeHandler("surgery","technique")} placeholder="Surgical technique" />
                  <InputField label="Grafts Needed" type="number" value={formData.surgery.graftsneed} onChange={createChangeHandler("surgery","graftsneed")} placeholder="Number of grafts needed" />
                  <InputField label="Grafts Implanted" type="number" value={formData.surgery.graftsImplanted} onChange={createChangeHandler("surgery","graftsImplanted")} placeholder="Number of grafts implanted" />
                  <InputField label="Donor Area Condition" value={formData.surgery.donorCondition} onChange={createChangeHandler("surgery","donorCondition")} placeholder="Donor area condition" className="md:col-span-2" />
                  <div className="md:col-span-2"><MultiSelectEmployee label="Operating Doctors (Select Multiple)" options={employees.Doctor} selectedIds={formData.surgery.doctor} onChange={(v) => handleChange("surgery","doctor",v)} /></div>
                  <div className="md:col-span-2"><MultiSelectEmployee label="Senior Technicians (Select Multiple)" options={employees.Technician} selectedIds={formData.surgery.seniorTech} onChange={(v) => handleChange("surgery","seniorTech",v)} /></div>
                  <div className="md:col-span-2"><MultiSelectEmployee label="Right Side Implanters (Select Multiple)" options={employees.Implanter} selectedIds={formData.surgery.implanterRight} onChange={(v) => handleChange("surgery","implanterRight",v)} /></div>
                  <div className="md:col-span-2"><MultiSelectEmployee label="Left Side Implanters (Select Multiple)" options={employees.Implanter} selectedIds={formData.surgery.implanterLeft} onChange={(v) => handleChange("surgery","implanterLeft",v)} /></div>
                  <div className="md:col-span-2"><MultiSelectEmployee label="Grafting Specialists (Select Multiple)" options={employees.Others} selectedIds={formData.surgery.graftingPerson} onChange={(v) => handleChange("surgery","graftingPerson",v)} /></div>
                  <div className="md:col-span-2"><MultiSelectEmployee label="Surgery Helpers (Select Multiple)" options={employees.Others} selectedIds={formData.surgery.helper} onChange={(v) => handleChange("surgery","helper",v)} /></div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-8">
                <StepHeader icon={FileUp} title="Document Upload" description="Upload patient images and forms" color="indigo" />
                <div className="space-y-8">
                  <DocumentUpload title="Patient Images" icon={Image} files={formData.documents.images} onUpload={(f) => handleFileUpload("images",f)} onRemove={(i) => removeFile("images",i)} accept="image/*" uploadId="images-upload" isUploading={uploadingFiles.images} />
                  <DocumentUpload title="Consent Forms" icon={FileText} files={formData.documents.consentForm} onUpload={(f) => handleFileUpload("consentForm",f)} onRemove={(i) => removeFile("consentForm",i)} accept=".pdf,.doc,.docx" uploadId="consent-upload" isUploading={uploadingFiles.consentForm} />
                  <DocumentUpload title="Surgery Forms" icon={FileText} files={formData.documents.suregeryForm} onUpload={(f) => handleFileUpload("suregeryForm",f)} onRemove={(i) => removeFile("suregeryForm",i)} accept=".pdf,.doc,.docx" uploadId="surgery-upload" isUploading={uploadingFiles.suregeryForm} />
                  <DocumentUpload title="Consultation Forms" icon={Calendar} files={formData.documents.consultForm} onUpload={(f) => handleFileUpload("consultForm",f)} onRemove={(i) => removeFile("consultForm",i)} accept=".pdf,.doc,.docx" uploadId="consult-upload" isUploading={uploadingFiles.consultForm} />
                </div>
              </div>
            )}

            <div className="mt-12 flex justify-between items-center pt-6 border-t border-gray-200">
              {step > 1 ? (
                <button type="button" className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200" onClick={() => setStep((s) => s - 1)}>← Previous</button>
              ) : <div />}
              <div className="flex space-x-4">
                {step < 5 && <button type="button" className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors duration-200" onClick={() => setStep((s) => s + 1)}>Next →</button>}
                {step === 5 && (
                  <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200">
                    {isSubmitting ? (<><div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full" />Submitting...</>) : (<><CheckCircle className="mr-2" size={20} />Complete Registration</>)}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}
