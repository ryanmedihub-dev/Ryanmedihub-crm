"use client";

import { useState, useEffect, useCallback } from "react";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import {
  Search, Eye, X, UserX, Pencil,
  CalendarDays, IndianRupee, Phone, Mail, Building2,
  ChevronLeft, ChevronRight, User, Briefcase, QrCode, Globe,
} from "lucide-react";
import CandidateEditModal from "@/components/hr/CandidateEditModal";
import { formatDate as fmtDate } from "@/lib/financeUI";

const fmt     = (n) => n ? `₹${Number(n).toLocaleString("en-IN")}` : "—";
const avgRating = (c) => {
  const vals = [c.communication, c.technicalKnowledge, c.personality, c.motivation, c.stability]
    .map(Number).filter((v) => !isNaN(v) && v > 0);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
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
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-700 font-bold text-sm">{c.name?.slice(0,2).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{c.name}</h2>
              <p className="text-xs text-gray-500">{c.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Rejected
            </span>
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
              <InfoRow icon={User}        label="Reason Left"   value={c.reasonForLeaving} />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Interview</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={CalendarDays} label="Interview Date" value={fmtDate(c.interviewDate)} />
              <InfoRow icon={User}         label="Assigned HR"    value={c.assignedHr?.name || "—"} />
              <InfoRow icon={Briefcase}    label="Source"         value={c.source === "qr" ? "Visited via QR" : c.source === "direct" ? "Applied Online" : c.source} />
              <InfoRow icon={User}         label="Reference"      value={c.reference} />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Evaluation {avg && <span className="text-red-500 normal-case font-semibold">· Avg {avg}/10</span>}
            </h3>
            <div className="space-y-2">
              {ratings.map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 w-40">{label}</span>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-40">
                      <div
                        className={`h-full rounded-full ${Number(val) >= 7 ? "bg-emerald-500" : Number(val) >= 5 ? "bg-amber-400" : "bg-red-400"}`}
                        style={{ width: val ? `${(Number(val) / 10) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-10 text-right">{val || "—"}/10</span>
                  </div>
                </div>
              ))}
            </div>
            {c.hrComments && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 font-medium mb-1">HR Comments</p>
                <p className="text-sm text-gray-700">{c.hrComments}</p>
              </div>
            )}
            {c.finalRemarks && (
              <div className="mt-2 p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 font-medium mb-1">Final Remarks</p>
                <p className="text-sm text-gray-700">{c.finalRemarks}</p>
              </div>
            )}
          </section>
        </div>
      </div>
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

const PAGE_SIZE = 25;

export default function RejectedPage() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [page, setPage]             = useState(1);
  const [viewing, setViewing]       = useState(null);
  const [editing, setEditing]       = useState(null);
  const [hrEmployees, setHrEmployees] = useState([]);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/hr/candidates?status=Rejected");
      const json = await res.json();
      if (json.success) setCandidates(json.candidates || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
    fetch("/api/hr/employees").then((r) => r.json()).then((d) => { if (d.success) setHrEmployees(d.employees); }).catch(() => {});
  }, [fetchCandidates]);

  const filtered = candidates.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.position?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.assignedHr?.name?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const topPositions = Object.entries(
    filtered.reduce((acc, c) => {
      const key = c.position || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <HRSidebar />

      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
              <UserX className="w-5 h-5 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Rejected Candidates</h1>
          </div>
          <p className="text-sm text-gray-500 ml-12">Candidates who did not clear the interview process</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <KpiTile label="Total Rejected" value={filtered.length} accent="red" />
          <KpiTile label="Freshers"       value={filtered.filter(c => c.experienceType === "Fresher").length} accent="blue" />
          <KpiTile label="Experienced"    value={filtered.filter(c => c.experienceType === "Experienced").length} accent="violet" />
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Top Rejected Position</p>
            <p className="text-sm font-bold text-gray-800 truncate">{topPositions[0]?.[0] || "—"}</p>
            {topPositions[0] && <p className="text-xs text-gray-400">{topPositions[0][1]} candidates</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by name, position, HR…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <span className="text-xs text-gray-500 font-medium">{filtered.length} candidates</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-7 h-7 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <UserX className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No rejected candidates found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Position</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Experience</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prev Company</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Interview</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned HR</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((c, i) => {
                    const avg = avgRating(c);
                    return (
                      <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                              <span className="text-red-700 font-bold text-xs">{c.name?.slice(0,2).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 text-sm leading-none">{c.name}</p>
                              {c.email && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-37.5">{c.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded-md">{c.position || "—"}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {c.source === "qr" ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                              <QrCode className="w-3 h-3" />Visited
                            </span>
                          ) : c.source === "direct" ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                              <Globe className="w-3 h-3" />Applied
                            </span>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{c.phone || "—"}</td>
                        <td className="px-4 py-3">
                          {c.experienceType === "Experienced"
                            ? <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">{c.yearsOfExperience || 0}y exp</span>
                            : <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Fresher</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{c.previousCompany || "—"}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{fmtDate(c.interviewDate)}</td>
                        <td className="px-4 py-3">
                          {c.assignedHr?.name
                            ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{c.assignedHr.name}</span>
                            : <span className="text-gray-400 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-3"><RatingBar value={avg} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setViewing(c)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditing(c)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Edit"
                            >
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

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-700 px-2 font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {viewing && <ViewModal candidate={viewing} onClose={() => setViewing(null)} />}
      {editing && <CandidateEditModal candidate={editing} hrEmployees={hrEmployees} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchCandidates(); }} />}
    </div>
  );
}

function KpiTile({ label, value, accent }) {
  const styles = {
    red:    "bg-red-50 text-red-700 border-red-200",
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    amber:  "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${styles[accent]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
