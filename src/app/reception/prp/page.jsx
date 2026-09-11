"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toast";
import ReceptionSidebar from "@/components/Sidebars/ReceptionSidebar";
import { maskPhone } from "@/utils/phoneUtils";
import {
  Droplets,
  Plus,
  Search,
  Calendar,
  IndianRupee,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  CreditCard,
  ChevronDown,
  Loader2,
  Building2,
  Tag,
  FlaskConical,
  Filter,
  Download,
  Pill,
  Leaf,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";

const METHODS = ["cash", "upi", "card", "banking", "bajaj_loan", "fibe_loan", "other"];

const PROCEDURES = ["PRP", "GFC", "Canacot", "Biotin"];

const PROC_CONFIG = {
  PRP: {
    label: "PRP",
    gradient: "from-indigo-500 to-indigo-600",
    badgeBg: "bg-indigo-100 text-indigo-700",
    dotBg: "bg-indigo-500",
    activeBorder: "border-indigo-500 bg-indigo-50 text-indigo-700",
    saveBtnBg: "bg-indigo-600 hover:bg-indigo-700",
    icon: Droplets,
  },
  GFC: {
    label: "GFC",
    gradient: "from-violet-500 to-violet-600",
    badgeBg: "bg-violet-100 text-violet-700",
    dotBg: "bg-violet-500",
    activeBorder: "border-violet-500 bg-violet-50 text-violet-700",
    saveBtnBg: "bg-violet-600 hover:bg-violet-700",
    icon: FlaskConical,
  },
  Canacot: {
    label: "Canacot",
    gradient: "from-teal-500 to-teal-600",
    badgeBg: "bg-teal-100 text-teal-700",
    dotBg: "bg-teal-500",
    activeBorder: "border-teal-500 bg-teal-50 text-teal-700",
    saveBtnBg: "bg-teal-600 hover:bg-teal-700",
    icon: Pill,
  },
  Biotin: {
    label: "Biotin",
    gradient: "from-amber-500 to-amber-600",
    badgeBg: "bg-amber-100 text-amber-700",
    dotBg: "bg-amber-500",
    activeBorder: "border-amber-500 bg-amber-50 text-amber-700",
    saveBtnBg: "bg-amber-600 hover:bg-amber-700",
    icon: Leaf,
  },
};

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtTime = (d) =>
  d
    ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

const todayISO = () => new Date().toISOString().split("T")[0];

function TypeBadge({ type }) {
  const cfg = PROC_CONFIG[type] || PROC_CONFIG.PRP;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badgeBg}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ProcToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROCEDURES.map((p) => {
        const cfg = PROC_CONFIG[p];
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition ${
              active ? cfg.activeBorder : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <cfg.icon className="w-4 h-4" />
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function PRPGFCPage() {
  const { data: session } = useSession();
  const toast = useToast();

  const [paidList, setPaidList]       = useState([]);
  const [unpaidList, setUnpaidList]   = useState([]);
  const [summary, setSummary]         = useState({
    total: 0, paid: 0, unpaid: 0, revenue: 0, byType: {},
  });

  const [selectedDate, setSelectedDate]     = useState(todayISO());
  const [activeStatus, setActiveStatus]     = useState("all");
  const [activeType, setActiveType]         = useState("all");
  const [searchQuery, setSearchQuery]       = useState("");
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  const [showAddModal, setShowAddModal]     = useState(false);
  const [addForm, setAddForm] = useState({
    procedure: "PRP",
    sessionNumber: "",
    patientSearch: "",
    patientId: "",
    patientName: "",
    patientPhone: "",
    isPaid: true,
    amount: "",
    discount: "",
    method: "cash",
    paymentId: "",
    remarks: "",
  });
  const [patientResults, setPatientResults] = useState([]);
  const [searching, setSearching]           = useState(false);
  const [saving, setSaving]                 = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom]           = useState(todayISO());
  const [exportTo, setExportTo]               = useState(todayISO());
  const [exporting, setExporting]             = useState(false);

  const [showPayModal, setShowPayModal]     = useState(false);
  const [payTarget, setPayTarget]           = useState(null);
  const [payForm, setPayForm] = useState({
    amount: "", discount: "", method: "cash", paymentId: "", remarks: "",
  });
  const [paying, setPaying] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchData = useCallback(
    async (silent = false) => {
      silent ? setRefreshing(true) : setLoading(true);
      try {
        const res  = await fetch(`/api/reception/prp?date=${selectedDate}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fetch failed");
        setPaidList(data.paid    || []);
        setUnpaidList(data.unpaid || []);
        setSummary(data.summary  || {});
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate]
  );

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const q = addForm.patientSearch.trim();
    if (q.length < 2) { setPatientResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/patients/get-patient?search=${encodeURIComponent(q)}&limit=6`);
        const data = await res.json();
        setPatientResults(data.patients || []);
      } catch { setPatientResults([]); }
      finally  { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [addForm.patientSearch]);

  const allRows = [
    ...paidList.map((r)   => ({ ...r, status: "paid" })),
    ...unpaidList.map((r) => ({ ...r, status: "unpaid" })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const filtered = allRows.filter((row) => {
    if (activeStatus !== "all" && row.status !== activeStatus) return false;
    if (activeType   !== "all" && (row.procedure || "PRP") !== activeType) return false;
    const q = searchQuery.toLowerCase();
    if (q && !row.patientName?.toLowerCase().includes(q) && !row.patientPhone?.includes(q)) return false;
    return true;
  });

  const selectPatient = (p) => {
    setAddForm((f) => ({
      ...f,
      patientId:    p._id,
      patientName:  p.personal?.name  || "",
      patientPhone: p.personal?.phone || "",
      patientSearch: p.personal?.name || "",
    }));
    setPatientResults([]);
  };

  const clearPatient = () => {
    setAddForm((f) => ({
      ...f, patientId: "", patientName: "", patientPhone: "", patientSearch: "",
    }));
    setPatientResults([]);
  };

  const resetAddForm = () => {
    setAddForm({
      procedure: "PRP",
      sessionNumber: "",
      patientSearch: "", patientId: "", patientName: "", patientPhone: "",
      isPaid: true, amount: "", discount: "",
      method: "cash", paymentId: "", remarks: "",
    });
    setPatientResults([]);
  };

  const handleAdd = async () => {
    if (!addForm.patientId && (!addForm.patientName || !addForm.patientPhone)) {
      toast.error("Select a patient or enter walk-in details");
      return;
    }
    if (addForm.isPaid && (!addForm.amount || parseFloat(addForm.amount) <= 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    if (addForm.isPaid && !addForm.method) {
      toast.error("Select a payment method");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/reception/prp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          procedure:     addForm.procedure,
          sessionNumber: addForm.sessionNumber ? parseInt(addForm.sessionNumber) : undefined,
          patientId:     addForm.patientId   || null,
          patientName:   addForm.patientName,
          patientPhone:  addForm.patientPhone,
          date:          selectedDate,
          isPaid:        addForm.isPaid,
          amount:        addForm.isPaid ? parseFloat(addForm.amount) : 0,
          discount:      parseFloat(addForm.discount || 0),
          method:        addForm.isPaid ? addForm.method : undefined,
          paymentId:     addForm.paymentId,
          remarks:       addForm.remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.message);
      setShowAddModal(false);
      resetAddForm();
      fetchData(true);
    } catch (err) { toast.error(err.message); }
    finally      { setSaving(false); }
  };

  const openPayModal = (row) => {
    setPayTarget(row);
    setPayForm({ amount: "", discount: "", method: "cash", paymentId: "", remarks: "" });
    setShowPayModal(true);
  };

  const handleMarkPaid = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setPaying(true);
    try {
      const res = await fetch("/api/reception/prp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId:     payTarget.patientId,
          sessionNumber: payTarget.sessionNumber,
          sessionDate:   payTarget.date,
          procedure:     payTarget.procedure || "PRP",
          amount:        parseFloat(payForm.amount),
          discount:      parseFloat(payForm.discount || 0),
          method:        payForm.method,
          paymentId:     payForm.paymentId,
          remarks:       payForm.remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.message);
      setShowPayModal(false);
      fetchData(true);
    } catch (err) { toast.error(err.message); }
    finally      { setPaying(false); }
  };

  const handleDelete = async (row) => {
    const label = row.patientName || "this session";
    const ok = window.confirm(
      row.status === "paid"
        ? `Delete this ${row.procedure || "PRP"} session for ${label}? This will delete the ₹${row.amount || 0} payment too. This cannot be undone.`
        : `Delete this ${row.procedure || "PRP"} session for ${label}? This cannot be undone.`,
    );
    if (!ok) return;

    const rowKey = row.transactionId || row.sessionId;
    setDeletingId(rowKey);
    try {
      const res =
        row.status === "paid"
          ? await fetch("/api/transactions/service/delete", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transactionId: row.transactionId }),
            })
          : await fetch("/api/reception/prp", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ patientId: row.patientId, sessionId: row.sessionId }),
            });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed to delete");
      toast.success("Session deleted");
      fetchData(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res  = await fetch(`/api/reception/prp?from=${exportFrom}&to=${exportTo}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");

      const allRecords = [
        ...(data.paid   || []).map((r) => ({ ...r, status: "Paid" })),
        ...(data.unpaid || []).map((r) => ({ ...r, status: "Unpaid" })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      const rows = allRecords.map((r, i) => ({
        "#":            i + 1,
        "Patient Name": r.patientName || "Walk-in",
        "Phone":        r.patientPhone || "",
        "Branch":       r.branch || "",
        "Type":         r.procedure || "PRP",
        "Session #":    r.sessionNumber || "",
        "Status":       r.status,
        "Amount (₹)":   r.status === "Paid" ? (r.amount || 0) : 0,
        "Method":       r.method || "",
        "Date":         r.date ? new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "",
        "Remarks":      r.remarks || "",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 4 }, { wch: 24 }, { wch: 14 }, { wch: 12 },
        { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 12 },
        { wch: 10 }, { wch: 14 }, { wch: 24 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "PRP-GFC Sessions");
      XLSX.writeFile(wb, `PRP_GFC_${exportFrom}_to_${exportTo}.xlsx`);
      setShowExportModal(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const stats = [
    ...PROCEDURES.map((proc) => {
      const cfg = PROC_CONFIG[proc];
      const d   = summary.byType?.[proc] || {};
      return {
        label: `${proc} Today`,
        value: (d.paid || 0) + (d.unpaid || 0),
        sub:   `${fmt(d.revenue || 0)} collected`,
        bg:    cfg.gradient,
        icon:  cfg.icon,
      };
    }),
    {
      label: "Paid",
      value: summary.paid || 0,
      sub:   `${fmt(summary.revenue || 0)} total`,
      bg:    "from-emerald-500 to-emerald-600",
      icon:  CheckCircle2,
    },
    {
      label: "Unpaid",
      value: summary.unpaid || 0,
      sub:   "pending payment",
      bg:    "from-rose-500 to-rose-600",
      icon:  Clock,
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <ReceptionSidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ReceptionSidebar />

      <main className="flex-1 p-4 lg:p-8 space-y-6 min-w-0">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Droplets className="w-6 h-6 text-indigo-500" />
              <FlaskConical className="w-6 h-6 text-violet-500 -ml-1" />
              PRP & GFC Sessions
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Track daily PRP and GFC treatments</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Refresh"
              className="p-2 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => { setExportFrom(todayISO()); setExportTo(todayISO()); setShowExportModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-emerald-700 transition"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" />
              Add Session
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`bg-linear-to-br ${s.bg} rounded-2xl p-5 text-white shadow-sm`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{s.label}</p>
                <s.icon className="w-5 h-5 opacity-80" />
              </div>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-xs opacity-75 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">

          <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1 shadow-sm flex-wrap">
            {[
              { key: "all", label: `All (${summary.total || 0})`, activeBg: "bg-gray-700 text-white" },
              ...PROCEDURES.map((proc) => {
                const d = summary.byType?.[proc] || {};
                return {
                  key: proc,
                  label: `${proc} (${(d.paid || 0) + (d.unpaid || 0)})`,
                  activeBg: `bg-${PROC_CONFIG[proc].dotBg.replace("bg-", "")} text-white`,
                };
              }),
            ].map(({ key, label, activeBg }) => (
              <button
                key={key}
                onClick={() => setActiveType(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeType === key
                    ? key === "all"
                      ? "bg-gray-700 text-white shadow-sm"
                      : `${PROC_CONFIG[key]?.dotBg} text-white shadow-sm`
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1 shadow-sm">
            {[
              { key: "all",    label: "All"   },
              { key: "paid",   label: `Paid (${summary.paid || 0})` },
              { key: "unpaid", label: `Unpaid (${summary.unpaid || 0})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveStatus(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeStatus === key
                    ? key === "unpaid"
                      ? "bg-amber-500 text-white shadow-sm"
                      : key === "paid"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-gray-700 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-50 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search patient…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="flex gap-1 mb-3 opacity-30">
                {PROCEDURES.map((p) => { const Icon = PROC_CONFIG[p].icon; return <Icon key={p} className="w-8 h-8" />; })}
              </div>
              <p className="font-medium text-gray-500">No sessions found</p>
              <p className="text-sm mt-1">Try a different date or click "Add Session"</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="px-5 py-3.5 font-semibold text-gray-600 w-10">#</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Patient</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Phone</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Type</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Branch</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Amount</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Method</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Time</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Status</th>
                    <th className="px-5 py-3.5 w-36"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((row, i) => {
                    const proc = row.procedure || "PRP";
                    const cfg  = PROC_CONFIG[proc] || PROC_CONFIG.PRP;
                    return (
                      <tr key={row.transactionId || `${row.patientId}-${i}`} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{i + 1}</td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs uppercase shrink-0 ${cfg.dotBg}`}>
                              {row.patientName?.[0] || "?"}
                            </div>
                            <span className="font-medium text-gray-900 truncate max-w-30">
                              {row.patientName || "Walk-in"}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-gray-500 font-mono text-xs whitespace-nowrap">
                          {maskPhone(row.patientPhone) || "—"}
                        </td>

                        <td className="px-5 py-3.5">
                          <TypeBadge type={proc} />
                        </td>

                        <td className="px-5 py-3.5">
                          {row.branch ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium whitespace-nowrap">
                              <Building2 className="w-3 h-3" />
                              {row.branch}
                            </span>
                          ) : "—"}
                        </td>

                        <td className="px-5 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                          {row.status === "paid" ? fmt(row.amount) : <span className="text-gray-400">—</span>}
                        </td>

                        <td className="px-5 py-3.5 text-gray-500 capitalize whitespace-nowrap">
                          {row.method || "—"}
                        </td>

                        <td className="px-5 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                          {fmtTime(row.date)}
                        </td>

                        <td className="px-5 py-3.5">
                          {row.status === "paid" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3" />
                              Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold whitespace-nowrap">
                              <Clock className="w-3 h-3" />
                              Unpaid
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.status === "unpaid" && (
                              <button
                                onClick={() => openPayModal(row)}
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition whitespace-nowrap"
                              >
                                Mark Paid
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(row)}
                              disabled={deletingId === (row.transactionId || row.sessionId)}
                              title="Delete session"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition disabled:opacity-50"
                            >
                              {deletingId === (row.transactionId || row.sessionId) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>{filtered.length} session{filtered.length !== 1 ? "s" : ""} shown</span>
                <span className="font-semibold text-gray-700">
                  Revenue: {fmt(filtered.filter(r => r.status === "paid").reduce((s, r) => s + (r.amount || 0), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>

      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-500" />
                Export PRP / GFC Records
              </h2>
              <button onClick={() => setShowExportModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={exportTo}
                  min={exportFrom}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <p className="text-xs text-gray-400">Exports all PRP & GFC sessions (paid + unpaid) for the selected date range to an Excel file.</p>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting || !exportFrom || !exportTo}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {exporting ? "Exporting…" : "Download Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Droplets className="w-5 h-5 text-indigo-500" />
                <FlaskConical className="w-5 h-5 text-violet-500 -ml-1" />
                Add Session
              </h2>
              <button onClick={() => { setShowAddModal(false); resetAddForm(); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Procedure <span className="text-red-500">*</span>
                </label>
                <ProcToggle
                  value={addForm.procedure}
                  onChange={(p) => setAddForm((f) => ({ ...f, procedure: p }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Session Number
                  <span className="ml-1.5 text-xs font-normal text-gray-400">(leave blank to auto-assign)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 3"
                    value={addForm.sessionNumber}
                    onChange={(e) => setAddForm((f) => ({ ...f, sessionNumber: e.target.value }))}
                    className="w-28 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-center font-semibold"
                  />
                  <span className="text-xs text-gray-400">
                    {addForm.sessionNumber
                      ? `This is the patient's ${addForm.sessionNumber}${["st","nd","rd"][addForm.sessionNumber - 1] || "th"} ${addForm.procedure} session`
                      : `Next ${addForm.procedure} session number will be assigned automatically`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Patient <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {addForm.patientId ? (
                    <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase ${PROC_CONFIG[addForm.procedure].dotBg}`}>
                        {addForm.patientName?.[0] || "P"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{addForm.patientName}</p>
                        <p className="text-xs text-gray-500 font-mono">{maskPhone(addForm.patientPhone)}</p>
                      </div>
                      <button onClick={clearPatient} className="p-1 hover:bg-indigo-100 rounded-lg">
                        <X className="w-4 h-4 text-indigo-600" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search by name or phone…"
                          value={addForm.patientSearch}
                          onChange={(e) => setAddForm((f) => ({ ...f, patientSearch: e.target.value }))}
                          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
                      </div>

                      {patientResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                          {patientResults.map((p) => (
                            <button
                              key={p._id}
                              onClick={() => selectPatient(p)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 transition text-left border-b border-gray-50 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold uppercase shrink-0">
                                {p.personal?.name?.[0] || "P"}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 text-sm truncate">{p.personal?.name}</p>
                                <p className="text-xs text-gray-500 font-mono">{maskPhone(p.personal?.phone)} · {p.personal?.branch}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {addForm.patientSearch.length > 1 && patientResults.length === 0 && !searching && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                          <p className="text-xs text-gray-500 mb-2 font-medium">Patient not found — enter walk-in details:</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Full name"
                              value={addForm.patientName}
                              onChange={(e) => setAddForm((f) => ({ ...f, patientName: e.target.value }))}
                              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <input
                              type="tel"
                              placeholder="Phone number"
                              value={addForm.patientPhone}
                              onChange={(e) => setAddForm((f) => ({ ...f, patientPhone: e.target.value }))}
                              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Status</label>
                <div className="flex gap-2">
                  {[true, false].map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setAddForm((f) => ({ ...f, isPaid: val }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition ${
                        addForm.isPaid === val
                          ? val
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {val ? "✓ Paid Now" : "⏳ Unpaid"}
                    </button>
                  ))}
                </div>
              </div>

              {addForm.isPaid && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        Amount <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="number" min="0" placeholder="0"
                          value={addForm.amount}
                          onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                          className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Discount</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="number" min="0" placeholder="0"
                          value={addForm.discount}
                          onChange={(e) => setAddForm((f) => ({ ...f, discount: e.target.value }))}
                          className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Payment Method <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <select
                        value={addForm.method}
                        onChange={(e) => setAddForm((f) => ({ ...f, method: e.target.value }))}
                        className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>{m.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {["upi", "card", "banking"].includes(addForm.method) && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        {addForm.method === "upi" ? "UPI / Transaction ID" : "Reference ID"}
                      </label>
                      <input
                        type="text" placeholder="Enter reference ID"
                        value={addForm.paymentId}
                        onChange={(e) => setAddForm((f) => ({ ...f, paymentId: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks (optional)</label>
                <textarea
                  rows={2} placeholder="Notes about this session…"
                  value={addForm.remarks}
                  onChange={(e) => setAddForm((f) => ({ ...f, remarks: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowAddModal(false); resetAddForm(); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${PROC_CONFIG[addForm.procedure]?.saveBtnBg || "bg-indigo-600 hover:bg-indigo-700"}`}
                >
                  {saving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : (() => { const Icon = PROC_CONFIG[addForm.procedure]?.icon || Droplets; return <Icon className="w-4 h-4" />; })()
                  }
                  {saving ? "Saving…" : `Save ${addForm.procedure}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPayModal && payTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Mark {payTarget.procedure || "PRP"} as Paid
              </h2>
              <button onClick={() => setShowPayModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm uppercase ${PROC_CONFIG[payTarget.procedure || "PRP"].dotBg}`}>
                  {payTarget.patientName?.[0] || "P"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{payTarget.patientName}</p>
                  <p className="text-xs text-gray-500 font-mono">{maskPhone(payTarget.patientPhone)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <TypeBadge type={payTarget.procedure || "PRP"} />
                  {payTarget.sessionNumber && (
                    <span className="text-xs text-gray-400 font-mono">#{payTarget.sessionNumber}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number" min="0" placeholder="0" autoFocus
                      value={payForm.amount}
                      onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Discount</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number" min="0" placeholder="0"
                      value={payForm.discount}
                      onChange={(e) => setPayForm((f) => ({ ...f, discount: e.target.value }))}
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={payForm.method}
                    onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                    className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {["upi", "card", "banking"].includes(payForm.method) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Reference ID</label>
                  <input
                    type="text" placeholder="Enter reference ID"
                    value={payForm.paymentId}
                    onChange={(e) => setPayForm((f) => ({ ...f, paymentId: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks (optional)</label>
                <input
                  type="text" placeholder="Notes…"
                  value={payForm.remarks}
                  onChange={(e) => setPayForm((f) => ({ ...f, remarks: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkPaid}
                  disabled={paying}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {paying ? "Processing…" : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
