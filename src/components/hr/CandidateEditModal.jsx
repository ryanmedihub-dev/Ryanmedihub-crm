"use client";

import { useState } from "react";
import {
  X, Pencil, CheckCircle, User, Briefcase, CalendarDays, Star,
} from "lucide-react";

const EXP_TYPES = ["Fresher", "Experienced"];

function Field({ label, name, value, onChange, type = "text", required, textarea, options, placeholder }) {
  const cls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30/50 focus:border-indigo-500 transition-all bg-white placeholder:text-gray-400";
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {options ? (
        <select name={name} value={value} onChange={onChange} className={cls}>
          {options.map((o) => typeof o === "string"
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : textarea ? (
        <textarea name={name} value={value} onChange={onChange} rows={3} placeholder={placeholder}
          className={`${cls} resize-none`} />
      ) : (
        <input type={type} name={name} value={value} onChange={onChange} required={required}
          placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

function RatingBoxes({ label, name, value, onChange }) {
  const n = Number(value);
  const activeColor = n >= 7 ? "bg-emerald-500 border-emerald-500 text-white" : n >= 5 ? "bg-amber-400 border-amber-400 text-white" : "bg-red-400 border-red-400 text-white";
  return (
    <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-xs font-semibold text-gray-600">{label}</label>
        <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-lg ${n > 0 ? (n >= 7 ? "bg-emerald-100 text-emerald-700" : n >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600") : "bg-gray-200 text-gray-400"}`}>
          {n > 0 ? `${n}/10` : "—"}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => {
          const v = i + 1;
          const active = v <= n;
          return (
            <button key={v} type="button"
              onClick={() => onChange({ target: { name, value: v === n ? 0 : v } })}
              className={`flex-1 h-7 rounded-lg text-xs font-semibold border transition-all ${active ? activeColor : "border-gray-200 bg-white text-gray-400 hover:border-indigo-300 hover:text-indigo-500"}`}>
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeading({ title, icon: Icon }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-indigo-600" />
      </div>
      <span className="text-xs font-medium text-gray-700">{title}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function StatusSelector({ value, onChange }) {
  const opts = [
    { val: "Applied",             idle: "bg-blue-50 text-blue-600 border-blue-200",    active: "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200" },
    { val: "Interview Scheduled", idle: "bg-indigo-50 text-indigo-600 border-indigo-200", active: "bg-indigo-600 text-white border-indigo-600 " },
    { val: "Selected",            idle: "bg-emerald-50 text-emerald-700 border-emerald-200", active: "bg-emerald-600 text-white border-emerald-600 " },
    { val: "Rejected",            idle: "bg-red-50 text-red-600 border-red-200",       active: "bg-red-600 text-white border-red-600 " },
    { val: "On Hold",             idle: "bg-amber-50 text-amber-600 border-amber-200", active: "bg-amber-500 text-white border-amber-500 " },
  ];
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-2">Status</label>
      <div className="flex flex-wrap gap-2">
        {opts.map(({ val, idle, active }) => (
          <button key={val} type="button"
            onClick={() => onChange({ target: { name: "status", value: val } })}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${value === val ? active : idle}`}>
            {val}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CandidateEditModal({ candidate: initial, onClose, onSaved, hrEmployees = [] }) {
  const [form, setForm] = useState({
    name:                    initial.name                    || "",
    position:                initial.position                || "",
    phone:                   initial.phone                   || "",
    email:                   initial.email                   || "",
    address:                 initial.address                 || "",
    experienceType:          initial.experienceType          || "Fresher",
    yearsOfExperience:       initial.yearsOfExperience       || "",
    previousCompany:         initial.previousCompany         || "",
    previousCompanyContact:  initial.previousCompanyContact  || "",
    previousPosition:        initial.previousPosition        || "",
    reasonForLeaving:        initial.reasonForLeaving        || "",
    previousSalary:          initial.previousSalary          || "",
    expectedSalary:          initial.expectedSalary          || "",
    finalSalary:             initial.finalSalary             || "",
    interviewDate:           initial.interviewDate           || "",
    source:                  initial.source                  || "",
    assignedHr:              initial.assignedHr?._id || (typeof initial.assignedHr === "string" ? initial.assignedHr : "") || "",
    status:                  initial.status                  || "Applied",
    communication:           initial.communication           || "",
    technicalKnowledge:      initial.technicalKnowledge      || "",
    personality:             initial.personality             || "",
    motivation:              initial.motivation              || "",
    stability:               initial.stability               || "",
    hrComments:              initial.hrComments              || "",
    finalReference:          initial.finalReference          || "",
    finalRemarks:            initial.finalRemarks            || "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const h = (e) => { const { name, value } = e.target; setForm((f) => ({ ...f, [name]: value })); };

  const handleSubmit = async () => {
    if (!form.name?.trim())     { setError("Full name is required"); return; }
    if (!form.position?.trim()) { setError("Position is required");  return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form, assignedHr: form.assignedHr || null };
      const res  = await fetch(`/api/hr/candidates/${initial._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Failed to save"); return; }
      onSaved();
    } catch { setError("Something went wrong. Please try again."); }
    finally { setSaving(false); }
  };

  const hrOptions = [
    { value: "", label: "— Unassigned —" },
    ...hrEmployees.map((e) => ({ value: e._id, label: e.name })),
  ];

  return (
    <div className="fixed inset-0 overlay-in z-50 flex items-center justify-center bg-gray-950/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col">

        <div className="bg-white border-b border-gray-200 rounded-t-2xl px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <Pencil className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 leading-tight">Edit Candidate</h2>
                <p className="text-gray-500 text-xs mt-0.5">{initial?.name}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <X className="w-4 h-4 shrink-0 text-red-400" />
              {error}
            </div>
          )}

          <SectionHeading title="Personal Info" icon={User} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name"            name="name"     value={form.name}     onChange={h} required placeholder="e.g. Priya Sharma" />
            <Field label="Position Applied For" name="position" value={form.position} onChange={h} required placeholder="e.g. Hair Transplant Tech" />
            <Field label="Phone"  name="phone" value={form.phone} onChange={h} type="tel"   placeholder="+91 9876543210" />
            <Field label="Email"  name="email" value={form.email} onChange={h} type="email" placeholder="priya@example.com" />
            <div className="sm:col-span-2">
              <Field label="Address" name="address" value={form.address} onChange={h} textarea placeholder="Current residential address" />
            </div>
          </div>

          <SectionHeading title="Work History" icon={Briefcase} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Experience Type"      name="experienceType"        value={form.experienceType}        onChange={h} options={EXP_TYPES} />
            <Field label="Years of Experience"  name="yearsOfExperience"     value={form.yearsOfExperience}     onChange={h} type="number" placeholder="0" />
            <Field label="Previous Company"     name="previousCompany"       value={form.previousCompany}       onChange={h} placeholder="Company name" />
            <Field label="Company Contact"      name="previousCompanyContact" value={form.previousCompanyContact} onChange={h} type="tel" placeholder="HR / Manager number" />
            <Field label="Previous Role"        name="previousPosition"      value={form.previousPosition}      onChange={h} placeholder="Designation" />
            <Field label="Reason for Leaving"   name="reasonForLeaving"      value={form.reasonForLeaving}      onChange={h} placeholder="Brief reason" />
            <Field label="Previous Salary (₹)"  name="previousSalary"        value={form.previousSalary}        onChange={h} type="number" placeholder="0" />
            <Field label="Expected Salary (₹)"  name="expectedSalary"        value={form.expectedSalary}        onChange={h} type="number" placeholder="0" />
            <Field label="Final Salary (₹)"     name="finalSalary"           value={form.finalSalary}           onChange={h} type="number" placeholder="0" />
          </div>

          <SectionHeading title="Interview Details" icon={CalendarDays} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Interview Date" name="interviewDate"
              value={form.interviewDate ? String(form.interviewDate).slice(0, 10) : ""}
              onChange={h} type="date" />
            <Field label="Source" name="source" value={form.source} onChange={h} placeholder="e.g. Naukri, Referral, LinkedIn" />
            <Field label="Assigned HR" name="assignedHr" value={form.assignedHr} onChange={h} options={hrOptions} />
          </div>

          <StatusSelector value={form.status} onChange={h} />

          <SectionHeading title="Evaluation" icon={Star} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RatingBoxes label="Communication"       name="communication"      value={form.communication}      onChange={h} />
            <RatingBoxes label="Technical Knowledge" name="technicalKnowledge" value={form.technicalKnowledge} onChange={h} />
            <RatingBoxes label="Personality"         name="personality"        value={form.personality}        onChange={h} />
            <RatingBoxes label="Motivation"          name="motivation"         value={form.motivation}         onChange={h} />
            <RatingBoxes label="Stability"           name="stability"          value={form.stability}          onChange={h} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="HR Comments"     name="hrComments"     value={form.hrComments}     onChange={h} textarea placeholder="Internal HR notes…" />
            <Field label="Final Reference" name="finalReference" value={form.finalReference} onChange={h} textarea placeholder="Reference check notes…" />
            <Field label="Final Remarks"   name="finalRemarks"   value={form.finalRemarks}   onChange={h} textarea placeholder="Decision rationale…" />
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50/80 rounded-b-2xl">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors font-medium">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2.5 text-sm rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm ">
            {saving
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
              : <><CheckCircle className="w-4 h-4" />Save Changes</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
