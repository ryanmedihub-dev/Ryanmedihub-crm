"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import { byName } from "@/lib/sortOptions";
import SearchableSelect from "@/components/SearchableSelect";
import {
  Plus, Search, Eye, Pencil, Trash2, X, Star, Filter,
  ChevronLeft, ChevronRight, UserCheck, UserX, Clock,
  Users, Briefcase, CalendarDays, IndianRupee, Building2,
  SlidersHorizontal, CheckCircle, UserCog, User, QrCode, Globe,
} from "lucide-react";
import { formatDate as fmtDate } from "@/lib/financeUI";

const STATUSES  = ["Applied", "Interview Scheduled", "Selected", "Rejected", "On Hold"];
const EXP_TYPES = ["Fresher", "Experienced"];

const STATUS_META = {
  Applied:             { color: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500",    ring: "ring-blue-200" },
  "Interview Scheduled":{ color: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500",  ring: "ring-indigo-200" },
  Selected:            { color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  Rejected:            { color: "bg-red-50 text-red-700 border-red-200",          dot: "bg-red-500",     ring: "ring-red-200" },
  "On Hold":           { color: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500",   ring: "ring-amber-200" },
};

const TAB_META = {
  "":                    { icon: Users,       label: "All" },
  Applied:               { icon: Briefcase,   label: "Applied" },
  "Interview Scheduled": { icon: CalendarDays,label: "Scheduled" },
  Selected:              { icon: UserCheck,   label: "Selected" },
  Rejected:              { icon: UserX,       label: "Rejected" },
  "On Hold":             { icon: Clock,       label: "On Hold" },
};

const EMPTY = {
  name: "", position: "", phone: "", email: "", address: "",
  previousSalary: "", expectedSalary: "", finalSalary: "",
  experienceType: "Fresher", yearsOfExperience: "",
  reference: "", previousCompany: "", previousCompanyContact: "",
  previousPosition: "", reasonForLeaving: "", source: "",
  interviewDate: "",
  assignedHr: "",
  communication: "", technicalKnowledge: "", personality: "",
  motivation: "", stability: "",
  hrComments: "", finalReference: "", finalRemarks: "",
  status: "Applied",
};

const fmt     = (n) => n ? `₹${Number(n).toLocaleString("en-IN")}` : "—";
const avgRating = (c) => {
  const vals = [c.communication, c.technicalKnowledge, c.personality, c.motivation, c.stability]
    .map(Number).filter((v) => !isNaN(v) && v > 0);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {status}
    </span>
  );
}

function RatingBar({ value }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>;
  const n = parseFloat(value);
  const pct = (n / 10) * 100;
  const color = n >= 7 ? "bg-emerald-500" : n >= 5 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-20">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 tabular-nums">{n}</span>
    </div>
  );
}

function KPICard({ label, value, total, icon: Icon, accent }) {
  const accents = {
    violet:  { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200", iconBg: "bg-violet-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200",iconBg: "bg-emerald-100" },
    red:     { bg: "bg-red-50",     text: "text-red-500",     border: "border-red-200",    iconBg: "bg-red-100" },
    blue:    { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200",   iconBg: "bg-blue-100" },
  };
  const a = accents[accent];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`bg-white rounded-xl border ${a.border} p-4 flex items-center gap-4 shadow-xs hover:shadow-sm transition-shadow`}>
      <div className={`w-11 h-11 rounded-xl ${a.iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${a.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {total !== undefined && (
          <p className="text-xs text-gray-400 mt-0.5">{pct}% of {total} shown</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text", required, textarea, options, placeholder }) {
  const cls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400 transition-all bg-white placeholder:text-gray-400";
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {options ? (
        <select name={name} value={value} onChange={onChange} className={cls}>
          {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg ${n > 0 ? (n >= 7 ? "bg-emerald-100 text-emerald-700" : n >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600") : "bg-gray-200 text-gray-400"}`}>
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
              className={`flex-1 h-7 rounded-lg text-xs font-bold border transition-all ${active ? activeColor : "border-gray-200 bg-white text-gray-400 hover:border-violet-300 hover:text-violet-500"}`}>
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusSelector({ value, onChange }) {
  const opts = [
    { val: "Applied",             idle: "bg-blue-50 text-blue-600 border-blue-200",    active: "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200" },
    { val: "Interview Scheduled", idle: "bg-indigo-50 text-indigo-600 border-indigo-200", active: "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200" },
    { val: "Selected",            idle: "bg-emerald-50 text-emerald-700 border-emerald-200", active: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200" },
    { val: "Rejected",            idle: "bg-red-50 text-red-600 border-red-200",       active: "bg-red-600 text-white border-red-600 shadow-sm shadow-red-200" },
    { val: "On Hold",             idle: "bg-amber-50 text-amber-600 border-amber-200", active: "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-200" },
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

function SectionHeading({ title, icon: Icon }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-violet-600" />
      </div>
      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function CandidateModal({ mode, initial, onClose, onSaved, hrEmployees }) {
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => {
    if (isEdit && initial) {
      return {
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
      };
    }
    return { ...EMPTY };
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
      const url    = isEdit ? `/api/hr/candidates/${initial._id}` : "/api/hr/candidates";
      const method = isEdit ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col">

        <div className="bg-linear-to-r from-violet-600 to-purple-600 rounded-t-2xl px-6 py-5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {isEdit ? <Pencil className="w-5 h-5 text-white" /> : <Plus className="w-5 h-5 text-white" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">
                  {isEdit ? "Edit Candidate" : "Add New Candidate"}
                </h2>
                <p className="text-violet-200 text-xs mt-0.5">
                  {isEdit ? initial?.name : "Fill in the candidate details below"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-5 h-5 text-white" />
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
            <Field label="Previous Company"     name="previousCompany"        value={form.previousCompany}       onChange={h} placeholder="Company name" />
            <Field label="Company Contact"      name="previousCompanyContact" value={form.previousCompanyContact} onChange={h} type="tel" placeholder="HR / Manager number" />
            <Field label="Previous Role"        name="previousPosition"       value={form.previousPosition}      onChange={h} placeholder="Designation" />
            <Field label="Reason for Leaving"   name="reasonForLeaving"       value={form.reasonForLeaving}      onChange={h} placeholder="Brief reason" />
            <Field label="Previous Salary (₹)"  name="previousSalary"         value={form.previousSalary}        onChange={h} type="number" placeholder="0" />
            <Field label="Expected Salary (₹)"  name="expectedSalary"         value={form.expectedSalary}        onChange={h} type="number" placeholder="0" />
            <Field label="Final Salary (₹)"     name="finalSalary"            value={form.finalSalary}           onChange={h} type="number" placeholder="0" />
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
            className="px-6 py-2.5 text-sm rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm shadow-violet-200">
            {saving
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
              : <><CheckCircle className="w-4 h-4" />{isEdit ? "Save Changes" : "Add Candidate"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewModal({ candidate: c, onClose, onEdit, hrEmployees }) {
  const avg = avgRating(c);
  const assignedHrName = c.assignedHr?.name || hrEmployees.find((e) => e._id === c.assignedHr)?.name || null;

  const Row = ({ label, value }) =>
    value ? (
      <div className="grid grid-cols-5 gap-2 py-2 border-b border-gray-50 last:border-0">
        <span className="col-span-2 text-xs text-gray-400 font-medium self-start pt-0.5">{label}</span>
        <span className="col-span-3 text-sm text-gray-800 leading-snug">{value}</span>
      </div>
    ) : null;

  const Section = ({ title }) => (
    <h4 className="text-xs font-bold text-violet-600 uppercase tracking-widest mt-5 mb-2 first:mt-0">{title}</h4>
  );

  const RBar = ({ label, value }) => {
    if (!value) return null;
    const n = Number(value);
    const pct = (n / 10) * 100;
    const color = n >= 7 ? "from-emerald-400 to-emerald-500" : n >= 5 ? "from-amber-400 to-amber-500" : "from-red-400 to-red-500";
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full bg-linear-to-r ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-bold text-gray-700 w-8 text-right tabular-nums">{n}/10</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col animate-scale-in">

        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-violet-600">{(c.name || "?")[0].toUpperCase()}</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">{c.name}</h2>
                <p className="text-xs text-gray-500">{c.position}</p>
                {avg && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-semibold text-gray-600">{avg}/10 avg rating</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 ml-3">
              <StatusBadge status={c.status} />
              <button onClick={() => { onClose(); onEdit(c); }}
                className="p-1.5 hover:bg-amber-50 text-amber-500 rounded-lg transition-colors" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 text-sm">
          <Section title="Contact" />
          <Row label="Phone"       value={c.phone} />
          <Row label="Email"       value={c.email} />
          <Row label="Address"     value={c.address} />
          <Row label="Source"      value={c.source === "qr" ? "Visited via QR" : c.source === "direct" ? "Applied Online" : c.source} />
          <Row label="Reference"   value={c.reference} />
          <Row label="Assigned HR" value={assignedHrName} />
          <Row label="Applied"     value={fmtDate(c.createdAt)} />

          <Section title="Work History" />
          <Row label="Experience"       value={c.experienceType} />
          <Row label="Years"            value={c.yearsOfExperience ? `${c.yearsOfExperience} yrs` : null} />
          <Row label="Previous Company" value={c.previousCompany} />
          <Row label="Company Contact"  value={c.previousCompanyContact} />
          <Row label="Previous Role"    value={c.previousPosition} />
          <Row label="Reason Leaving"   value={c.reasonForLeaving} />
          <Row label="Prev. Salary"     value={c.previousSalary ? fmt(c.previousSalary) : null} />
          <Row label="Exp. Salary"      value={c.expectedSalary ? fmt(c.expectedSalary) : null} />
          <Row label="Final Salary"     value={c.finalSalary ? fmt(c.finalSalary) : null} />

          <Section title="Interview" />
          <Row label="Interview Date" value={fmtDate(c.interviewDate)} />

          {(c.communication || c.technicalKnowledge || c.personality || c.motivation || c.stability) && (
            <>
              <Section title="Evaluation" />
              <div className="space-y-2.5 mt-1">
                <RBar label="Communication"       value={c.communication} />
                <RBar label="Technical Knowledge" value={c.technicalKnowledge} />
                <RBar label="Personality"         value={c.personality} />
                <RBar label="Motivation"          value={c.motivation} />
                <RBar label="Stability"           value={c.stability} />
              </div>
            </>
          )}

          {(c.hrComments || c.finalReference || c.finalRemarks) && (
            <>
              <Section title="HR Notes" />
              <Row label="HR Comments"     value={c.hrComments} />
              <Row label="Final Reference" value={c.finalReference} />
              <Row label="Final Remarks"   value={c.finalRemarks} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterDrawer({ filters, setFilters, positions, sources, hrEmployees, onClose }) {
  const sel = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400 bg-white transition-all";
  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400 transition-all";

  const F = ({ label, children }) => (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );

  const reset = () => setFilters((f) => ({
    ...f, experienceType: "", source: "", position: "", assignedHr: "",
    interviewFrom: "", interviewTo: "",
    appliedFrom: "", appliedTo: "",
    salaryMin: "", salaryMax: "",
    minRating: "", sortBy: "newest",
  }));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-tab-in">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-600" />
            <span className="font-bold text-gray-900 text-sm">Filters</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <F label="Sort By">
            <select value={filters.sortBy} onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))} className={sel}>
              <option value="newest">Newest Applied First</option>
              <option value="oldest">Oldest Applied First</option>
              <option value="name">Name A–Z</option>
              <option value="salary_asc">Salary Low–High</option>
              <option value="salary_desc">Salary High–Low</option>
              <option value="rating">Highest Rating</option>
              <option value="interview_asc">Interview Date ↑</option>
            </select>
          </F>

          <F label="Assigned HR">
            <SearchableSelect
              options={[{ _id: "unassigned", name: "Unassigned" }, ...hrEmployees]}
              value={filters.assignedHr}
              onChange={(v) => setFilters((f) => ({ ...f, assignedHr: v }))}
              placeholder="All HR"
              valueKey="_id"
              displayKey="name"
            />
          </F>

          <F label="Experience Type">
            <select value={filters.experienceType} onChange={(e) => setFilters((f) => ({ ...f, experienceType: e.target.value }))} className={sel}>
              <option value="">All Types</option>
              {EXP_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </F>

          <F label="Source">
            <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className={sel}>
              <option value="">All Sources</option>
              <option value="qr">Visited via QR</option>
              <option value="direct">Applied Online</option>
            </select>
          </F>

          <F label="Position">
            <SearchableSelect
              options={positions.map((p) => ({ value: p, label: p }))}
              value={filters.position}
              onChange={(v) => setFilters((f) => ({ ...f, position: v }))}
              placeholder="All Positions"
            />
          </F>

          <F label="Interview Date Range">
            <div className="space-y-2">
              <input type="date" value={filters.interviewFrom} onChange={(e) => setFilters((f) => ({ ...f, interviewFrom: e.target.value }))} className={inp} />
              <input type="date" value={filters.interviewTo}   onChange={(e) => setFilters((f) => ({ ...f, interviewTo: e.target.value }))}   className={inp} />
            </div>
          </F>

          <F label="Expected Salary (₹)">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.salaryMin} onChange={(e) => setFilters((f) => ({ ...f, salaryMin: e.target.value }))} className={inp} placeholder="Min" />
              <input type="number" value={filters.salaryMax} onChange={(e) => setFilters((f) => ({ ...f, salaryMax: e.target.value }))} className={inp} placeholder="Max" />
            </div>
          </F>

          <F label="Minimum Avg Rating">
            <input type="number" min={1} max={10} value={filters.minRating}
              onChange={(e) => setFilters((f) => ({ ...f, minRating: e.target.value }))}
              className={inp} placeholder="e.g. 7" />
          </F>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={reset}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors btn-animate">
            Reset All
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors btn-animate">
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-gray-50 items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    }>
      <CandidatesContent />
    </Suspense>
  );
}

function CandidatesContent() {
  const searchParams  = useSearchParams();
  const initialStatus = searchParams.get("status") || "";

  const [candidates, setCandidates] = useState([]);
  const [hrEmployees, setHrEmployees] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null);
  const [deleting, setDeleting]     = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const debounceRef = useRef(null);
  const handleSearch = (val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  };

  const [activeStatus, setActiveStatus] = useState(initialStatus);
  const [filters, setFilters] = useState({
    experienceType: "", source: "", position: "", assignedHr: "",
    appliedFrom: "", appliedTo: "",
    interviewFrom: "", interviewTo: "",
    salaryMin: "", salaryMax: "",
    minRating: "", sortBy: "newest",
  });
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(25);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/hr/candidates");
      const data = await res.json();
      if (data.success) setCandidates(data.candidates);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCandidates();
    fetch("/api/hr/employees")
      .then((r) => r.json())
      .then((d) => { if (d.success) setHrEmployees(d.employees); })
      .catch(() => {});
  }, [fetchCandidates]);

  useEffect(() => { setPage(1); }, [search, activeStatus, filters]);

  const positions = useMemo(() => [...new Set(candidates.map((c) => c.position).filter(Boolean))].sort(byName), [candidates]);
  const sources   = useMemo(() => [...new Set(candidates.map((c) => c.source).filter(Boolean))].sort(byName), [candidates]);

  const statusCounts = useMemo(() => {
    const counts = { "": candidates.length };
    STATUSES.forEach((s) => { counts[s] = candidates.filter((c) => c.status === s).length; });
    return counts;
  }, [candidates]);

  const filtered = useMemo(() => {
    let list = [...candidates];

    if (activeStatus) list = list.filter((c) => c.status === activeStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.position?.toLowerCase().includes(q) ||
        c.previousCompany?.toLowerCase().includes(q)
      );
    }
    if (filters.experienceType) list = list.filter((c) => c.experienceType === filters.experienceType);
    if (filters.source)         list = list.filter((c) => c.source === filters.source);
    if (filters.position)       list = list.filter((c) => c.position === filters.position);
    if (filters.assignedHr === "unassigned") {
      list = list.filter((c) => !c.assignedHr);
    } else if (filters.assignedHr) {
      list = list.filter((c) => {
        const id = c.assignedHr?._id || c.assignedHr;
        return String(id) === filters.assignedHr;
      });
    }
    if (filters.appliedFrom)    list = list.filter((c) => c.createdAt && new Date(c.createdAt) >= new Date(filters.appliedFrom));
    if (filters.appliedTo)      list = list.filter((c) => c.createdAt && new Date(c.createdAt) <= new Date(filters.appliedTo));
    if (filters.interviewFrom)  list = list.filter((c) => c.interviewDate && new Date(c.interviewDate) >= new Date(filters.interviewFrom));
    if (filters.interviewTo)    list = list.filter((c) => c.interviewDate && new Date(c.interviewDate) <= new Date(filters.interviewTo));
    if (filters.salaryMin)      list = list.filter((c) => Number(c.expectedSalary) >= Number(filters.salaryMin));
    if (filters.salaryMax)      list = list.filter((c) => Number(c.expectedSalary) <= Number(filters.salaryMax));
    if (filters.minRating)      list = list.filter((c) => { const a = avgRating(c); return a !== null && parseFloat(a) >= Number(filters.minRating); });

    switch (filters.sortBy) {
      case "oldest":        list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
      case "name":          list.sort((a, b) => (a.name || "").localeCompare(b.name || "")); break;
      case "salary_asc":    list.sort((a, b) => Number(a.expectedSalary || 0) - Number(b.expectedSalary || 0)); break;
      case "salary_desc":   list.sort((a, b) => Number(b.expectedSalary || 0) - Number(a.expectedSalary || 0)); break;
      case "rating":        list.sort((a, b) => parseFloat(avgRating(b) || 0) - parseFloat(avgRating(a) || 0)); break;
      case "interview_asc": list.sort((a, b) => new Date(a.interviewDate || 0) - new Date(b.interviewDate || 0)); break;
      default:              list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return list;
  }, [candidates, activeStatus, search, filters]);

  const kpi = useMemo(() => ({
    total:     filtered.length,
    selected:  filtered.filter((c) => c.status === "Selected").length,
    rejected:  filtered.filter((c) => c.status === "Rejected").length,
    scheduled: filtered.filter((c) => c.status === "Interview Scheduled").length,
  }), [filtered]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageStart   = (currentPage - 1) * perPage;
  const rows        = filtered.slice(pageStart, pageStart + perPage);

  const activeFilterCount = [
    filters.experienceType, filters.source, filters.position, filters.assignedHr,
    filters.appliedFrom, filters.appliedTo,
    filters.interviewFrom, filters.interviewTo,
    filters.salaryMin, filters.salaryMax, filters.minRating,
  ].filter(Boolean).length;

  const handleDelete = async (id) => {
    if (!confirm("Delete this candidate? This cannot be undone.")) return;
    setDeleting(id);
    try { await fetch(`/api/hr/candidates/${id}`, { method: "DELETE" }); fetchCandidates(); }
    finally { setDeleting(null); }
  };
  const handleSaved = () => { setModal(null); fetchCandidates(); };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <HRSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-auto">

        <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Candidates</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {loading ? "Loading…" : `${filtered.length} of ${candidates.length} candidates`}
              </p>
            </div>
            <button
              onClick={() => setModal({ mode: "add" })}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 active:scale-95 transition-all shadow-sm shadow-violet-200 btn-animate">
              <Plus className="w-4 h-4" /> Add Candidate
            </button>
          </div>
        </header>

        <div className="p-5 lg:p-6 space-y-5 flex-1">

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <KPICard label="Showing"             value={kpi.total}     total={candidates.length} icon={Users}        accent="violet" />
            <KPICard label="Selected"            value={kpi.selected}  total={kpi.total}         icon={UserCheck}    accent="emerald" />
            <KPICard label="Rejected"            value={kpi.rejected}  total={kpi.total}         icon={UserX}        accent="red" />
            <KPICard label="Interview Scheduled" value={kpi.scheduled} total={kpi.total}         icon={CalendarDays} accent="blue" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {["", ...STATUSES].map((s) => {
              const { icon: Icon, label } = TAB_META[s] || { icon: Users, label: s };
              const isActive = activeStatus === s;
              const count    = statusCounts[s] ?? 0;
              return (
                <button
                  key={s || "all"}
                  onClick={() => setActiveStatus(s)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0 btn-animate ${
                    isActive
                      ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                      : "bg-white text-gray-600 border border-gray-200 hover:border-violet-300 hover:text-violet-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold min-w-5 text-center ${isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, email, phone, position, company…"
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 bg-white transition-all"
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(""); setSearch(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all btn-animate shrink-0 ${
                activeFilterCount > 0
                  ? "border-violet-400 bg-violet-50 text-violet-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-violet-300 hover:text-violet-700"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-violet-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div
            key={`${activeStatus}-${filters.sortBy}`}
            className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden animate-tab-in"
          >
            {loading ? (
              <div className="flex items-center justify-center h-52 gap-3">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-500 font-medium">Loading candidates…</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Users className="w-7 h-7 text-gray-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">No candidates found</p>
                  <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or search query</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[
                        { label: "#",               cls: "w-10" },
                        { label: "Candidate",        cls: "min-w-44" },
                        { label: "Position",         cls: "min-w-36" },
                        { label: "Source",           cls: "min-w-28" },
                        { label: "Phone",            cls: "min-w-32" },
                        { label: "Reference",        cls: "min-w-32" },
                        { label: "Experience",       cls: "min-w-28" },
                        { label: "Exp. Salary",      cls: "min-w-28" },
                        { label: "Interview Date",   cls: "min-w-32" },
                        { label: "Avg Rating",       cls: "min-w-28" },
                        { label: "Status",           cls: "min-w-36" },
                        { label: "Options",          cls: "w-24" },
                      ].map(({ label, cls }) => (
                        <th key={label} className={`px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((c, idx) => {
                      const assignedHrName = c.assignedHr?.name || hrEmployees.find((e) => String(e._id) === String(c.assignedHr))?.name || null;
                      return (
                        <tr key={c._id} className="hover:bg-violet-50/40 transition-colors group">
                          <td className="px-4 py-3 text-xs text-gray-400 font-semibold tabular-nums">
                            {pageStart + idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-violet-600">{(c.name || "?")[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 leading-tight truncate max-w-36">{c.name}</div>
                                {c.email && <div className="text-xs text-gray-400 truncate max-w-36">{c.email}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">{c.position || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {c.source === "qr" ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                                <QrCode className="w-3 h-3" />Visited
                              </span>
                            ) : c.source === "direct" ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                                <Globe className="w-3 h-3" />Applied
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{c.phone || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {assignedHrName ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold">
                                <UserCog className="w-3 h-3" />{assignedHrName}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold ${c.experienceType === "Fresher" ? "bg-sky-100 text-sky-700" : "bg-purple-100 text-purple-700"}`}>
                              {c.experienceType}
                            </span>
                            {c.yearsOfExperience ? <span className="ml-1 text-xs text-gray-400">{c.yearsOfExperience}y</span> : null}
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-semibold text-xs">
                            {c.expectedSalary ? fmt(c.expectedSalary) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                            {c.interviewDate ? fmtDate(c.interviewDate) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <RatingBar value={avgRating(c)} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setModal({ mode: "view", data: c })}
                                className="p-1.5 hover:bg-indigo-50 text-indigo-500 rounded-lg transition-colors" title="View">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setModal({ mode: "edit", data: c })}
                                className="p-1.5 hover:bg-amber-50 text-amber-500 rounded-lg transition-colors" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(c._id)} disabled={deleting === c._id}
                                className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors disabled:opacity-40" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
                <p className="text-xs text-gray-500">
                  Showing{" "}
                  <span className="font-bold text-gray-700">{pageStart + 1}</span>–
                  <span className="font-bold text-gray-700">{Math.min(pageStart + perPage, filtered.length)}</span>
                  {" "}of{" "}
                  <span className="font-bold text-gray-700">{filtered.length}</span> candidates
                </p>
                <div className="flex items-center gap-2.5">
                  <select
                    value={perPage}
                    onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all"
                  >
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors btn-animate">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                      return (
                        <button key={p} onClick={() => setPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all btn-animate ${
                            p === currentPage
                              ? "bg-violet-600 text-white shadow-sm"
                              : "border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                          }`}>
                          {p}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors btn-animate">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {drawerOpen && (
        <FilterDrawer
          filters={filters}
          setFilters={setFilters}
          positions={positions}
          sources={sources}
          hrEmployees={hrEmployees}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {modal?.mode === "view" && (
        <ViewModal
          candidate={modal.data}
          onClose={() => setModal(null)}
          onEdit={(c) => setModal({ mode: "edit", data: c })}
          hrEmployees={hrEmployees}
        />
      )}

      {(modal?.mode === "add" || modal?.mode === "edit") && (
        <CandidateModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          hrEmployees={hrEmployees}
        />
      )}
    </div>
  );
}
