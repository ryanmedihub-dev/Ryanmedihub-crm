"use client";

import { useState } from "react";
import ReceptionSidebar from "@/components/Sidebars/ReceptionSidebar";
import {
  UserPlus,
  Phone,
  User,
  Calendar,
  Scissors,
  Droplets,
  IndianRupee,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ChevronDown,
} from "lucide-react";

const BRANCHES = ["Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon"];
const GENDERS  = ["MALE", "FEMALE", "OTHER"];
const TECHNIQUES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant",
  "PRP", "GFC", "Alopecia", "Headwash", "Other",
];
const SESSION_TYPES = ["PRP", "GFC", "Canacot", "Biotin"];

const EMPTY_SESSION = { prpNumber: "", date: "", type: "PRP" };

const INITIAL_FORM = {
  name: "",
  phone: "",
  age: "",
  gender: "MALE",
  branch: "",
  surgeryDate: "",
  technique: "",
  graftsneed: "",
  graftsImplanted: "",
  totalAmount: "",
  amountReceived: "",
  pendingAmount: "",
  sessions: [{ ...EMPTY_SESSION, prpNumber: "" }],
};

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all bg-white ${className}`}
      {...props}
    />
  );
}

function Select({ children, className = "", ...props }) {
  return (
    <select
      className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all bg-white ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
          <span className="text-indigo-600">{icon}</span>
        </div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl shadow-xl border max-w-sm transition-all ${
        isError
          ? "bg-red-50 border-red-200 text-red-800"
          : "bg-emerald-50 border-emerald-200 text-emerald-800"
      }`}
    >
      {isError
        ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
        : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />}
      <div className="flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.message && <p className="text-xs mt-0.5 opacity-80">{toast.message}</p>}
      </div>
      <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-black/10">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function OldPRPPatientsPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (title, message, type = "success") => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const autoCalcPending = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      const total    = parseFloat(field === "totalAmount"    ? value : f.totalAmount)    || 0;
      const received = parseFloat(field === "amountReceived" ? value : f.amountReceived) || 0;
      next.pendingAmount = Math.max(0, total - received).toString();
      return next;
    });
  };

  const addSession = () =>
    setForm((f) => ({
      ...f,
      sessions: [...f.sessions, { ...EMPTY_SESSION, prpNumber: "" }],
    }));

  const removeSession = (idx) =>
    setForm((f) => ({
      ...f,
      sessions: f.sessions.filter((_, i) => i !== idx),
    }));

  const setSession = (idx, field, value) =>
    setForm((f) => ({
      ...f,
      sessions: f.sessions.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      showToast("Missing Fields", "Patient name and phone are required.", "error");
      return;
    }

    setLoading(true);
    try {
      const body = {
        personal: {
          name:   form.name.trim(),
          phone:  form.phone.trim(),
          age:    form.age ? Number(form.age) : null,
          gender: form.gender,
          branch: form.branch,
        },
        surgery: {
          surgeryDate:     form.surgeryDate || null,
          technique:       form.technique,
          graftsneed:      form.graftsneed      ? Number(form.graftsneed)      : 0,
          graftsImplanted: form.graftsImplanted ? Number(form.graftsImplanted) : 0,
        },
        afterSurgery: {
          prp: form.sessions
            .filter((s) => s.date)
            .map((s, i) => ({
              prpNumber: s.prpNumber || i + 1,
              date:      s.date,
              type:      s.type,
            })),
        },
        payments: {
          totalAmount:    form.totalAmount    ? Number(form.totalAmount)    : 0,
          amountReceived: form.amountReceived ? Number(form.amountReceived) : 0,
          pendingAmount:  form.pendingAmount  ? Number(form.pendingAmount)  : 0,
        },
      };

      const res  = await fetch("/api/patients/create-old-prp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast("Error", data.error || "Something went wrong.", "error");
        return;
      }

      showToast("Patient Added!", `${form.name} has been added successfully.`);
      setForm(INITIAL_FORM);
    } catch (err) {
      console.error(err);
      showToast("Error", "Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ReceptionSidebar />

      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-3xl mx-auto space-y-6">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                <Droplets className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Add Old PRP Patient</h1>
                <p className="text-sm text-gray-500">
                  Register patients from before the CRM was set up — status will be set to <span className="font-semibold text-indigo-600">CLOSED</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              <SectionCard title="Patient Information" icon={<User className="w-4 h-4" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label required>Full Name</Label>
                    <Input
                      placeholder="Patient full name"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label required>Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        className="pl-9"
                        placeholder="10-digit mobile number"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Age</Label>
                    <Input
                      type="number"
                      placeholder="Age"
                      min={1}
                      max={120}
                      value={form.age}
                      onChange={(e) => set("age", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Branch</Label>
                    <div className="flex gap-2 flex-wrap">
                      {BRANCHES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => set("branch", b)}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                            form.branch === b
                              ? "bg-indigo-500 text-white shadow-sm"
                              : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Surgery & Treatment" icon={<Scissors className="w-4 h-4" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Surgery Date</Label>
                    <p className="text-[10px] text-gray-400 mb-1.5">
                      Sets the patient's record date. If blank, defaults to 01 Jan 2025.
                    </p>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        className="pl-9"
                        type="date"
                        value={form.surgeryDate}
                        onChange={(e) => set("surgeryDate", e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Technique</Label>
                    <Select value={form.technique} onChange={(e) => set("technique", e.target.value)}>
                      <option value="">Select technique</option>
                      {TECHNIQUES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Grafts Needed</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={form.graftsneed}
                      onChange={(e) => set("graftsneed", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Grafts Implanted</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={form.graftsImplanted}
                      onChange={(e) => set("graftsImplanted", e.target.value)}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Past Sessions" icon={<Droplets className="w-4 h-4" />}>
                <p className="text-xs text-gray-400 mb-3">Enter each session the patient has already taken. Set the correct session number per treatment type.</p>
                <div className="space-y-3">
                  {form.sessions.map((session, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100 items-end"
                    >
                      <div className="col-span-12 sm:col-span-2">
                        <label className="block text-xs font-semibold text-indigo-700 mb-1">Session #</label>
                        <input
                          type="number"
                          min={1}
                          value={session.prpNumber}
                          onChange={(e) => setSession(idx, "prpNumber", Number(e.target.value) || 1)}
                          className="w-full px-3 py-2.5 text-sm border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-center font-bold text-indigo-700"
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-3">
                        <label className="block text-xs font-semibold text-indigo-700 mb-1">Session Date</label>
                        <Input
                          type="date"
                          value={session.date}
                          onChange={(e) => setSession(idx, "date", e.target.value)}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-4">
                        <label className="block text-xs font-semibold text-indigo-700 mb-1">Type</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {SESSION_TYPES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setSession(idx, "type", t)}
                              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                                session.type === t
                                  ? "bg-indigo-500 text-white shadow-sm"
                                  : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="col-span-12 sm:col-span-3 flex justify-end">
                        {form.sessions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSession(idx)}
                            className="p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addSession}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 text-sm font-semibold transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add Session
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Payment Details (Optional)" icon={<IndianRupee className="w-4 h-4" />}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Total Amount (₹)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={form.totalAmount}
                      onChange={(e) => autoCalcPending("totalAmount", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Amount Received (₹)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={form.amountReceived}
                      onChange={(e) => autoCalcPending("amountReceived", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Pending Amount (₹)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={form.pendingAmount}
                      onChange={(e) => set("pendingAmount", e.target.value)}
                      className="bg-gray-50"
                      readOnly
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">Pending amount is auto-calculated from total − received.</p>
              </SectionCard>

              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-semibold">Auto-set fields on submission</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    Status → <strong>CLOSED</strong> &nbsp;|&nbsp;
                    Record date → <strong>Surgery date</strong> (or 01 Jan 2025 if not provided)
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all shadow-md ${
                  loading
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-linear-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 hover:shadow-lg active:scale-[0.98]"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Patient...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Add Old PRP Patient
                  </>
                )}
              </button>

            </form>
          </div>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
