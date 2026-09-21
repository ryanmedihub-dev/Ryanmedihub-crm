"use client";

import { useState, useEffect, useCallback } from "react";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import {
  Search, Eye, X, QrCode, Star, Pencil,
  CalendarDays, IndianRupee, Phone, Mail, Building2,
  ChevronLeft, ChevronRight, User, Briefcase, UserCheck,
  UserX, Clock, CheckCircle2, AlertCircle,
} from "lucide-react";
import CandidateEditModal from "@/components/hr/CandidateEditModal";
import { formatDate as fmtDate } from "@/lib/financeUI";

const fmt     = (n) => n ? `₹${Number(n).toLocaleString("en-IN")}` : "—";
const avgRating = (c) => {
  const vals = [c.communication, c.technicalKnowledge, c.personality, c.motivation, c.stability]
    .map(Number).filter((v) => !isNaN(v) && v > 0);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
};

const STATUS_META = {
  Applied:             { bg: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"    },
  "Interview Scheduled":{ bg: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  Selected:            { bg: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500" },
  Rejected:            { bg: "bg-red-100 text-red-700",        dot: "bg-red-500"     },
  "On Hold":           { bg: "bg-amber-100 text-amber-700",    dot: "bg-amber-500"   },
};

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

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-sm text-gray-700">{value || "—"}</p>
      </div>
    </div>
  );
}

function ViewModal({ candidate: c, onClose }) {
  if (!c) return null;
  const avg = avgRating(c);
  const ratings = [
    { label: "Communication",       val: c.communication },
    { label: "Technical Knowledge", val: c.technicalKnowledge },
    { label: "Personality",         val: c.personality },
    { label: "Motivation",          val: c.motivation },
    { label: "Stability",           val: c.stability },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="text-amber-700 font-bold text-sm">{c.name?.slice(0,2).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{c.name}</h2>
              <p className="text-xs text-gray-500">{c.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <QrCode className="w-3 h-3" /> Visited via QR
            </span>
            {c.status && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${(STATUS_META[c.status] || {}).bg || "bg-gray-100 text-gray-600"}`}>
                {c.status}
              </span>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Contact</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={Phone} label="Phone" value={c.phone} />
              <InfoRow icon={Mail}  label="Email" value={c.email} />
              <InfoRow icon={User}  label="Address" value={c.address} />
            </div>
          </section>
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Work History</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={Building2}   label="Experience"    value={c.experienceType === "Experienced" ? `${c.experienceType} · ${c.yearsOfExperience || 0}y` : c.experienceType} />
              <InfoRow icon={Building2}   label="Prev Company"  value={c.previousCompany} />
              <InfoRow icon={Briefcase}   label="Prev Role"     value={c.previousPosition} />
              <InfoRow icon={IndianRupee} label="Prev Salary"   value={fmt(c.previousSalary)} />
              <InfoRow icon={IndianRupee} label="Exp. Salary"   value={fmt(c.expectedSalary)} />
              <InfoRow icon={IndianRupee} label="Final Salary"  value={fmt(c.finalSalary)} />
            </div>
          </section>
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Interview</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={CalendarDays} label="Interview Date" value={fmtDate(c.interviewDate)} />
              <InfoRow icon={User}         label="Assigned HR"    value={c.assignedHr?.name || "—"} />
              <InfoRow icon={User}         label="Reference"      value={c.reference} />
            </div>
          </section>
          {(c.communication || c.technicalKnowledge || c.personality || c.motivation || c.stability) && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                Evaluation {avg && <span className="text-amber-600 normal-case font-semibold">· Avg {avg}/10</span>}
              </h3>
              <div className="space-y-2">
                {ratings.map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 w-40">{label}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-40">
                        <div className={`h-full rounded-full ${Number(val) >= 7 ? "bg-emerald-500" : Number(val) >= 5 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: val ? `${(Number(val) / 10) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-10 text-right">{val || "—"}/10</span>
                    </div>
                  </div>
                ))}
              </div>
              {c.hrComments && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-600 font-medium mb-1">HR Comments</p>
                  <p className="text-sm text-gray-700">{c.hrComments}</p>
                </div>
              )}
              {c.finalRemarks && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium mb-1">Final Remarks</p>
                  <p className="text-sm text-gray-700">{c.finalRemarks}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, accent }) {
  const accents = {
    amber:   "bg-amber-50 border-amber-200 text-amber-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    red:     "bg-red-50 border-red-200 text-red-800",
    blue:    "bg-blue-50 border-blue-200 text-blue-800",
    indigo:  "bg-indigo-50 border-indigo-200 text-indigo-800",
    violet:  "bg-violet-50 border-violet-200 text-violet-800",
  };
  return (
    <div className={`rounded-xl border p-4 ${accents[accent] || accents.amber}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

const PAGE_SIZE = 25;

export default function VisitedPage() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage]             = useState(1);
  const [viewing, setViewing]       = useState(null);
  const [editing, setEditing]       = useState(null);
  const [hrEmployees, setHrEmployees] = useState([]);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/hr/candidates?source=qr");
      const json = await res.json();
      if (json.success) setCandidates(json.candidates || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCandidates();
    fetch("/api/hr/employees").then((r) => r.json()).then((d) => { if (d.success) setHrEmployees(d.employees); }).catch(() => {});
  }, [fetchCandidates]);

  const filtered = candidates.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.position?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusCounts = {
    "": candidates.length,
    Applied: candidates.filter(c => c.status === "Applied").length,
    "Interview Scheduled": candidates.filter(c => c.status === "Interview Scheduled").length,
    Selected: candidates.filter(c => c.status === "Selected").length,
    Rejected: candidates.filter(c => c.status === "Rejected").length,
    "On Hold": candidates.filter(c => c.status === "On Hold").length,
  };

  const kpi = {
    total:     candidates.length,
    selected:  candidates.filter(c => c.status === "Selected").length,
    rejected:  candidates.filter(c => c.status === "Rejected").length,
    scheduled: candidates.filter(c => c.status === "Interview Scheduled").length,
    freshers:  candidates.filter(c => c.experienceType === "Fresher").length,
  };

  const STATUS_TABS = [
    { val: "",                     label: "All",       icon: QrCode,      accent: "amber" },
    { val: "Applied",              label: "Applied",   icon: Briefcase,   accent: "blue" },
    { val: "Interview Scheduled",  label: "Scheduled", icon: CalendarDays,accent: "indigo" },
    { val: "Selected",             label: "Selected",  icon: UserCheck,   accent: "emerald" },
    { val: "Rejected",             label: "Rejected",  icon: UserX,       accent: "red" },
    { val: "On Hold",              label: "On Hold",   icon: AlertCircle, accent: "amber" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <HRSidebar />
      <main className="flex-1 overflow-auto">
        <div className="bg-white border-b border-gray-200 px-6 py-5 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">Visited Candidates (QR)</h1>
                <p className="text-xs text-gray-500 mt-0.5">Candidates who physically came in via QR scan</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-600">{candidates.length}</p>
              <p className="text-xs text-gray-400">total visited</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiTile label="Total Visited"  value={kpi.total}     accent="amber" />
            <KpiTile label="Selected"       value={kpi.selected}  accent="emerald" />
            <KpiTile label="Rejected"       value={kpi.rejected}  accent="red" />
            <KpiTile label="Scheduled"      value={kpi.scheduled} accent="indigo" />
            <KpiTile label="Freshers"       value={kpi.freshers}  accent="blue" />
          </div>

          <div className="flex gap-2 flex-wrap">
            {STATUS_TABS.map(({ val, label, icon: Icon }) => {
              const isActive = statusFilter === val;
              const count = statusCounts[val] ?? 0;
              return (
                <button key={val || "all"} onClick={() => setStatusFilter(val)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    isActive
                      ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                      : "bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:text-amber-700"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-5 text-center ${isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, position, phone…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              {search && (
                <button onClick={() => setSearch("")} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
              <span className="text-xs text-gray-500 font-medium ml-auto">{filtered.length} candidates</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-7 h-7 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : paged.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <QrCode className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No visited candidates found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left border-b border-gray-200">
                      {["#","Candidate","Position","Phone","Experience","Exp. Salary","Interview Date","Assigned HR","Rating","Status",""].map((h) => (
                        <th key={h} className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paged.map((c, i) => {
                      const avg = avgRating(c);
                      const sm = STATUS_META[c.status] || { bg: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
                      return (
                        <tr key={c._id} className="hover:bg-amber-50/30 transition-colors group">
                          <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                <span className="text-amber-700 font-bold text-xs">{c.name?.slice(0,2).toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 text-sm leading-none">{c.name}</p>
                                {c.email && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-35">{c.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">{c.position || "—"}</td>
                          <td className="px-4 py-3 text-gray-600 text-sm whitespace-nowrap">{c.phone || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {c.experienceType === "Experienced"
                              ? <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">{c.yearsOfExperience || 0}y exp</span>
                              : <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-medium">Fresher</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-semibold text-xs">{fmt(c.expectedSalary)}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDate(c.interviewDate)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {c.assignedHr?.name
                              ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{c.assignedHr.name}</span>
                              : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3"><RatingBar value={avg} /></td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${sm.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setViewing(c)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditing(c)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Edit">
                                <Pencil className="w-4 h-4" />
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

            {!loading && filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/60">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors">
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-xs font-semibold text-gray-700 px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {viewing && <ViewModal candidate={viewing} onClose={() => setViewing(null)} />}
        {editing && <CandidateEditModal candidate={editing} hrEmployees={hrEmployees} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchCandidates(); }} />}
      </main>
    </div>
  );
}
