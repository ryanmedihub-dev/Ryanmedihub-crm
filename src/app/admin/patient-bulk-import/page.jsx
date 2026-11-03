"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Database,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Download,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Check,
  History,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  Clock,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { MAIN_BRANCHES } from "@/lib/branches";

const BATCH_SIZES = [25, 50, 100];

export default function PatientBulkImportPage() {
  const { data: session, status: authStatus } = useSession();
  const toast = useToast();
  const fileInputRef = useRef(null);

  // Workflow states: "idle" | "analyzing" | "preview" | "importing" | "done"
  const [phase, setPhase] = useState("idle");

  // Analysis data
  const [fileName, setFileName] = useState("");
  const [counts, setCounts] = useState(null);
  const [records, setRecords] = useState([]);

  // Configuration options
  const [fallbackBranch, setFallbackBranch] = useState("Delhi");
  const [batchSize, setBatchSize] = useState(50);
  const [mode, setMode] = useState("dry_run"); // Default to dry_run as requested
  const [confirmed, setConfirmed] = useState(false);
  const [updateExistingStatus, setUpdateExistingStatus] = useState(true);

  // Table filtering & pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Execution & Progress state
  const [progress, setProgress] = useState({
    currentBatch: 0,
    totalBatches: 0,
    processedCount: 0,
    totalToProcess: 0,
    created: 0,
    statusUpdated: 0,
    alreadyClosed: 0,
    ambiguous: 0,
    skipped: 0,
    errors: 0,
    percentage: 0,
    logs: [],
  });

  const [finalReport, setFinalReport] = useState(null);

  // Audit history
  const [pastLogs, setPastLogs] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchPastLogs();
  }, []);

  const fetchPastLogs = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch("/api/admin/patient-bulk-import/logs");
      const data = await res.json();
      if (data.success && data.logs) {
        setPastLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to fetch past import logs:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 1. Analyze bundled file directly
  const handleAnalyzeBundled = async () => {
    try {
      setPhase("analyzing");
      setFileName("data/imports (Bundled Dataset)");
      const res = await fetch("/api/admin/patient-bulk-import/analyze");
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to analyze bundled import file");
        setPhase("idle");
        return;
      }
      setCounts(data.counts);
      setRecords(data.records);
      setPhase("preview");
      toast.success(`Analyzed ${data.counts.total} rows against live RyanCRM database`);
    } catch (err) {
      console.error(err);
      toast.error("Network error while analyzing file");
      setPhase("idle");
    }
  };

  // 2. Analyze user-uploaded file
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setPhase("analyzing");
      setFileName(file.name);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/patient-bulk-import/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to analyze uploaded file");
        setPhase("idle");
        return;
      }

      setCounts(data.counts);
      setRecords(data.records);
      setPhase("preview");
      toast.success(`Analyzed ${data.counts.total} rows from ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Error uploading and analyzing file");
      setPhase("idle");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Filter preview records
  const filteredRecords = useMemo(() => {
    let list = records;

    if (filterTab === "new_patient") {
      list = list.filter((r) => r.classification === "new_patient");
    } else if (filterTab === "status_update") {
      list = list.filter(
        (r) =>
          r.classification === "existing_needs_update" ||
          r.classification === "missing_name_existing_in_db"
      );
    } else if (filterTab === "already_closed") {
      list = list.filter((r) => r.classification === "existing_already_closed");
    } else if (filterTab === "ambiguous") {
      list = list.filter((r) => r.classification === "ambiguous_match");
    } else if (filterTab === "missing_name") {
      list = list.filter((r) => r.classification === "missing_name_skipped");
    } else if (filterTab === "missing_branch") {
      list = list.filter((r) => r.issues?.includes("missing_branch") && r.classification === "new_patient");
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.phone?.includes(q) ||
          r.phoneNormalized?.includes(q) ||
          r.branch?.toLowerCase().includes(q) ||
          r.service?.toLowerCase().includes(q) ||
          r.existingPatient?.name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [records, filterTab, searchTerm]);

  // Paginated records
  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Execute Batch Import (Dry Run or Commit)
  const startImport = async () => {
    if (mode === "commit" && !confirmed) {
      toast.warning("Please check the confirmation box before committing the live import");
      return;
    }

    // Determine target records: new patients + optionally existing patients requiring status update
    const targetRecords = records.filter((r) => {
      if (r.classification === "new_patient") return true;
      if (
        updateExistingStatus &&
        (r.classification === "existing_needs_update" ||
          r.classification === "missing_name_existing_in_db")
      ) {
        return true;
      }
      return false;
    });

    if (targetRecords.length === 0) {
      toast.warning("No records selected for import or update");
      return;
    }

    const importId = `import_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const totalToProcess = targetRecords.length;
    const batches = [];
    for (let i = 0; i < totalToProcess; i += batchSize) {
      batches.push(targetRecords.slice(i, i + batchSize));
    }
    const totalBatches = batches.length;

    setPhase("importing");
    setProgress({
      currentBatch: 0,
      totalBatches,
      processedCount: 0,
      totalToProcess,
      created: 0,
      statusUpdated: 0,
      alreadyClosed: 0,
      ambiguous: 0,
      skipped: 0,
      errors: 0,
      percentage: 0,
      logs: [
        `Starting ${mode === "dry_run" ? "DRY RUN SIMULATION" : "LIVE COMMIT"} [${importId}] with ${totalBatches} batches...`,
      ],
    });

    let cumulativeCreated = 0;
    let cumulativeStatusUpdated = 0;
    let cumulativeAlreadyClosed = 0;
    let cumulativeAmbiguous = 0;
    let cumulativeSkipped = 0;
    let cumulativeErrors = 0;
    const allImportedResults = [];

    for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
      const batchRecords = batches[bIndex];
      const batchNo = bIndex + 1;

      try {
        const res = await fetch("/api/admin/patient-bulk-import/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            importId,
            batchIndex: bIndex,
            totalBatches,
            mode,
            records: batchRecords,
            defaultBranch: fallbackBranch,
            allowMissingNameExistingUpdate: true,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Batch ${batchNo} failed`);
        }

        cumulativeCreated += data.summary.created || 0;
        cumulativeStatusUpdated += data.summary.statusUpdated || 0;
        cumulativeAlreadyClosed += data.summary.alreadyClosed || 0;
        cumulativeAmbiguous += data.summary.ambiguous || 0;
        cumulativeSkipped += data.summary.skipped || 0;
        cumulativeErrors += data.summary.errors || 0;

        if (Array.isArray(data.results)) {
          allImportedResults.push(...data.results);
        }

        const processedSoFar = Math.min((bIndex + 1) * batchSize, totalToProcess);
        const pct = Math.round((processedSoFar / totalToProcess) * 100);

        setProgress((prev) => ({
          ...prev,
          currentBatch: batchNo,
          processedCount: processedSoFar,
          created: cumulativeCreated,
          statusUpdated: cumulativeStatusUpdated,
          alreadyClosed: cumulativeAlreadyClosed,
          ambiguous: cumulativeAmbiguous,
          skipped: cumulativeSkipped,
          errors: cumulativeErrors,
          percentage: pct,
          logs: [
            `Batch ${batchNo}/${totalBatches}: ${data.summary.created} creates, ${data.summary.statusUpdated} status updates (${data.summary.errors} errors)`,
            ...prev.logs.slice(0, 15),
          ],
        }));
      } catch (err) {
        console.error(`Batch ${batchNo} error:`, err);
        cumulativeErrors += batchRecords.length;
        setProgress((prev) => ({
          ...prev,
          currentBatch: batchNo,
          errors: cumulativeErrors,
          logs: [`Batch ${batchNo} ERROR: ${err.message}`, ...prev.logs.slice(0, 15)],
        }));
      }
    }

    setFinalReport({
      importId,
      mode,
      totalProcessed: totalToProcess,
      created: cumulativeCreated,
      statusUpdated: cumulativeStatusUpdated,
      alreadyClosed: cumulativeAlreadyClosed,
      ambiguous: cumulativeAmbiguous,
      skipped: cumulativeSkipped,
      errors: cumulativeErrors,
      results: allImportedResults,
    });

    setPhase("done");
    fetchPastLogs();

    if (mode === "dry_run") {
      toast.info(`Dry run simulation complete: ${cumulativeCreated} creates, ${cumulativeStatusUpdated} updates verified.`);
    } else {
      toast.success(`Import complete! ${cumulativeCreated} created, ${cumulativeStatusUpdated} updated to CLOSED.`);
    }
  };

  // Download results as CSV
  const downloadResultsCsv = () => {
    if (!finalReport?.results || finalReport.results.length === 0) return;

    const headers = ["Row Index", "Patient Name", "Phone", "Phone Normalized", "Branch", "Result", "Old Status", "New Status", "Patient ID", "Reason"];
    const rows = finalReport.results.map((r) => [
      r.rowIndex,
      `"${(r.name || "").replace(/"/g, '""')}"`,
      `"${r.phone || ""}"`,
      `"${r.phoneNormalized || ""}"`,
      `"${r.branch || ""}"`,
      `"${r.result || ""}"`,
      `"${r.oldStatus || ""}"`,
      `"${r.newStatus || ""}"`,
      `"${r.patientId || ""}"`,
      `"${(r.reason || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `ryan_import_audit_${finalReport.importId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setPhase("idle");
    setFileName("");
    setCounts(null);
    setRecords([]);
    setFinalReport(null);
    setConfirmed(false);
    setCurrentPage(1);
    setSearchTerm("");
    setFilterTab("all");
  };

  const isAuthorized =
    authStatus === "authenticated" &&
    (session?.user?.role === "super-admin" || session?.user?.role === "owner");

  if (authStatus === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Super Admin Access Required</h2>
          <p className="mt-2 text-sm text-slate-600">
            The Patient Bulk Import utility is restricted to Super Admin and Owner accounts only.
          </p>
          <Link
            href="/admin/patients"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Return to Patients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Link href="/admin/patients" className="hover:text-indigo-600">
                  Admin
                </Link>
                <span>/</span>
                <span>Bulk Tools</span>
                <span>/</span>
                <span className="text-indigo-600">Patient Bulk Import</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Historical Completed Surgery Patients Import
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
                  <ShieldCheck className="h-3 w-3" /> Super Admin
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Import historical surgery patients with{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono font-bold text-slate-800">
                  ops.status = &quot;CLOSED&quot;
                </code>
                . Non-destructive: updates status only for existing records and preserves all other fields.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                <History className="h-3.5 w-3.5 text-slate-500" />
                {showHistory ? "Hide Past Imports" : "Import Audit History"}
              </button>
              {phase !== "idle" && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-slate-500" /> Start Over
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        {/* Past Import Logs Drawer */}
        {showHistory && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Recent Import Audit History</h3>
              </div>
              <button
                onClick={fetchPastLogs}
                disabled={loadingHistory}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {pastLogs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No import records found yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-2 px-3">Import ID</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3">Imported By</th>
                      <th className="py-2 px-3 text-right">Created</th>
                      <th className="py-2 px-3 text-right">Status Updated</th>
                      <th className="py-2 px-3 text-right">Already Closed</th>
                      <th className="py-2 px-3 text-right">Errors</th>
                      <th className="py-2 px-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {pastLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-mono text-slate-900 font-medium">{log.importId}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold text-[10px] ${
                              log.mode === "committed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {log.mode.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {log.importedBy?.name} ({log.importedBy?.email})
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-600">{log.created}</td>
                        <td className="py-2 px-3 text-right font-semibold text-indigo-600">{log.statusUpdated || 0}</td>
                        <td className="py-2 px-3 text-right text-slate-500">{log.alreadyClosed || log.existing || 0}</td>
                        <td className="py-2 px-3 text-right text-rose-500">{log.errors || 0}</td>
                        <td className="py-2 px-3 text-slate-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Phase 1: Upload & Action Card */}
        {phase === "idle" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border-2 border-indigo-200 bg-linear-to-br from-indigo-50/60 via-white to-purple-50/40 p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
                    <Database className="h-6 w-6" />
                  </div>
                  <div className="space-y-1 grow">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        Bundled Historical Surgery Dataset
                      </h2>
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        1,447 Records
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Matches the 1,447 historical completed surgery records in{" "}
                      <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-100 text-indigo-700">
                        data/imports
                      </code>{" "}
                      against the LIVE RyanCRM database. Identifies new patients to create, existing patients requiring
                      status update, and ambiguous records before any live write.
                    </p>
                    <div className="pt-3">
                      <button
                        onClick={handleAnalyzeBundled}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Analyze Dataset (data/imports)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-2">Or Upload a Custom CSV / TSV File</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Upload any valid tab-separated or comma-separated historical dataset.
                </p>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center hover:bg-slate-50 cursor-pointer transition"
                >
                  <Upload className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Click to select file or drag and drop</p>
                  <p className="text-xs text-slate-400 mt-1">.tsv, .csv, or .txt</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Pre-Commit Safety Rules
                </div>
                <ul className="mt-3 space-y-2.5 text-xs text-slate-600 leading-normal">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    <span>
                      <strong>Status-Only Updates:</strong> For existing patients not in CLOSED status, only{" "}
                      <code className="text-slate-800 font-mono font-bold">ops.status</code> is updated. Surgery,
                      payments, medical, personal, and financial data are completely untouched.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    <span>
                      <strong>Ambiguous Match Safety:</strong> Phone numbers matching multiple CRM patients are flagged
                      for manual review and never updated automatically.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    <span>
                      <strong>Missing Data Enforcement:</strong> Rows without required names are skipped from creation.
                      Fallback branch is explicitly chosen and displayed in the preview.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Phase: Analyzing Loader */}
        {phase === "analyzing" && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-xs">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-3" />
            <h3 className="text-base font-bold text-slate-900">Querying Live RyanCRM Database...</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Checking all 1,447 normalized phones against existing patient records to calculate exact mutually exclusive categories.
            </p>
          </div>
        )}

        {/* Phase 2: Preview & Execution */}
        {(phase === "preview" || phase === "importing" || phase === "done") && counts && (
          <div className="space-y-6">
            {/* KPI Cards: Mutually Exclusive Reconciliation */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Rows</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{counts.total}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">100% Reconciled</p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">New Patients</p>
                <p className="mt-1 text-2xl font-black text-emerald-700">{counts.new_patient_creations}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Create with CLOSED</p>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Status Updates</p>
                <p className="mt-1 text-2xl font-black text-indigo-700">{counts.total_status_updates}</p>
                <p className="text-[11px] text-indigo-600 mt-0.5">Update ops.status only</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Already CLOSED</p>
                <p className="mt-1 text-2xl font-black text-slate-700">{counts.existing_already_closed}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Skip (No action needed)</p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Ambiguous Matches</p>
                <p className="mt-1 text-2xl font-black text-amber-700">{counts.ambiguous_matches}</p>
                <p className="text-[11px] text-amber-600 mt-0.5">Flagged for manual review</p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Missing Name</p>
                <p className="mt-1 text-2xl font-black text-rose-700">{counts.missing_name_skipped}</p>
                <p className="text-[11px] text-rose-600 mt-0.5">Skipped (Cannot create)</p>
              </div>
            </div>

            {/* Execution Controls Card */}
            {phase === "preview" && (
              <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Execution Configuration</h3>
                    <p className="text-xs text-slate-500">
                      Select fallback branch for new patients missing location and choose operation mode.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {/* Fallback Branch */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Fallback Branch ({counts.new_patients_missing_branch} new patients):
                      </label>
                      <select
                        value={fallbackBranch}
                        onChange={(e) => setFallbackBranch(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                      >
                        {MAIN_BRANCHES.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Batch Size */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">Batch Size:</label>
                      <select
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value))}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                      >
                        {BATCH_SIZES.map((sz) => (
                          <option key={sz} value={sz}>
                            {sz} records/batch
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
                      <button
                        onClick={() => setMode("dry_run")}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          mode === "dry_run"
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Dry Run (Test)
                      </button>
                      <button
                        onClick={() => setMode("commit")}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          mode === "commit"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Live Commit
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={updateExistingStatus}
                        onChange={(e) => setUpdateExistingStatus(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>
                        Update <strong className="text-indigo-700">ops.status = &quot;CLOSED&quot;</strong> for existing
                        non-CLOSED patients ({counts.total_status_updates} records, preserving all existing clinical/payment
                        data).
                      </span>
                    </label>

                    {mode === "commit" && (
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>
                          <strong>I confirm:</strong> Commit live import of {counts.new_patient_creations} new patients and{" "}
                          {updateExistingStatus ? counts.total_status_updates : 0} status updates.
                        </span>
                      </label>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={startImport}
                      disabled={mode === "commit" && !confirmed}
                      className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                        mode === "dry_run"
                          ? "bg-indigo-600 hover:bg-indigo-700"
                          : confirmed
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-slate-300 cursor-not-allowed opacity-70"
                      }`}
                    >
                      {mode === "dry_run" ? (
                        <>
                          <RefreshCw className="h-4 w-4" /> Run Dry Run Simulation (
                          {counts.new_patient_creations + (updateExistingStatus ? counts.total_status_updates : 0)} operations)
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Commit Live Import (
                          {counts.new_patient_creations + (updateExistingStatus ? counts.total_status_updates : 0)} operations)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Importing Progress Card */}
            {phase === "importing" && (
              <div className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                      {mode === "dry_run" ? "Simulating Batch Operations..." : "Executing Live Batch Operations..."}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Batch {progress.currentBatch} of {progress.totalBatches} — {progress.processedCount} of{" "}
                      {progress.totalToProcess} records processed
                    </p>
                  </div>
                  <span className="text-lg font-black text-indigo-600">{progress.percentage}%</span>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-linear-to-r from-indigo-500 to-purple-600 transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-xl bg-emerald-50 p-2.5 border border-emerald-100">
                    <p className="text-[11px] font-bold text-emerald-700">Created</p>
                    <p className="text-xl font-black text-emerald-800">{progress.created}</p>
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-2.5 border border-indigo-100">
                    <p className="text-[11px] font-bold text-indigo-700">Status Updated</p>
                    <p className="text-xl font-black text-indigo-800">{progress.statusUpdated}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200">
                    <p className="text-[11px] font-bold text-slate-700">Already Closed</p>
                    <p className="text-xl font-black text-slate-800">{progress.alreadyClosed}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-2.5 border border-rose-100">
                    <p className="text-[11px] font-bold text-rose-700">Errors</p>
                    <p className="text-xl font-black text-rose-800">{progress.errors}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto space-y-1">
                  {progress.logs.map((log, idx) => (
                    <div key={idx} className="leading-tight">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final Completion Report */}
            {phase === "done" && finalReport && (
              <div className="rounded-2xl border-2 border-emerald-200 bg-linear-to-br from-emerald-50/50 via-white to-slate-50 p-6 shadow-md space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-200">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {finalReport.mode === "dry_run" ? "Dry Run Completed (Zero Live Changes)" : "Live Import & Updates Completed!"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Import ID: <code className="font-mono font-semibold text-slate-800">{finalReport.importId}</code>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={downloadResultsCsv}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4 text-slate-500" /> Download Audit Report (CSV)
                    </button>
                    {finalReport.mode === "commit" && (
                      <Link
                        href="/admin/patients?branch=All"
                        target="_blank"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
                      >
                        <ExternalLink className="h-4 w-4" /> View in Patient Management
                      </Link>
                    )}
                    <button
                      onClick={handleReset}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-slate-500" /> Start Another Import
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-2xs">
                    <p className="text-[11px] font-bold uppercase text-emerald-700">
                      {finalReport.mode === "dry_run" ? "Simulated Creations" : "Created with CLOSED"}
                    </p>
                    <p className="mt-1 text-2xl font-black text-emerald-700">{finalReport.created}</p>
                  </div>
                  <div className="rounded-xl border border-indigo-200 bg-white p-3 shadow-2xs">
                    <p className="text-[11px] font-bold uppercase text-indigo-700">
                      {finalReport.mode === "dry_run" ? "Simulated Status Updates" : "Status Updated to CLOSED"}
                    </p>
                    <p className="mt-1 text-2xl font-black text-indigo-700">{finalReport.statusUpdated}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <p className="text-[11px] font-bold uppercase text-slate-500">Already Closed</p>
                    <p className="mt-1 text-2xl font-black text-slate-700">{finalReport.alreadyClosed}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-white p-3 shadow-2xs">
                    <p className="text-[11px] font-bold uppercase text-rose-700">Failed / Errors</p>
                    <p className="mt-1 text-2xl font-black text-rose-700">{finalReport.errors || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => {
                      setFilterTab("all");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "all"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    All ({records.length})
                  </button>
                  <button
                    onClick={() => {
                      setFilterTab("new_patient");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "new_patient"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    }`}
                  >
                    New Patients ({counts.new_patient_creations})
                  </button>
                  <button
                    onClick={() => {
                      setFilterTab("status_update");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "status_update"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                    }`}
                  >
                    Status Updates ({counts.total_status_updates})
                  </button>
                  <button
                    onClick={() => {
                      setFilterTab("already_closed");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "already_closed"
                        ? "bg-slate-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Already CLOSED ({counts.existing_already_closed})
                  </button>
                  <button
                    onClick={() => {
                      setFilterTab("ambiguous");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "ambiguous"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                    }`}
                  >
                    Ambiguous ({counts.ambiguous_matches})
                  </button>
                  <button
                    onClick={() => {
                      setFilterTab("missing_name");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "missing_name"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                    }`}
                  >
                    Missing Name ({counts.missing_name_skipped})
                  </button>
                  <button
                    onClick={() => {
                      setFilterTab("missing_branch");
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterTab === "missing_branch"
                        ? "bg-orange-600 text-white shadow-xs"
                        : "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
                    }`}
                  >
                    Missing Branch ({counts.new_patients_missing_branch})
                  </button>
                </div>

                <div className="relative min-w-[240px]">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search name, phone, branch..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-14">#</th>
                      <th className="py-2.5 px-3">Patient Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3">Branch</th>
                      <th className="py-2.5 px-3">Service</th>
                      <th className="py-2.5 px-3">Gender</th>
                      <th className="py-2.5 px-3">Live CRM Status</th>
                      <th className="py-2.5 px-3">Planned Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No matching records found.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map((r) => {
                        const isNew = r.classification === "new_patient";
                        const isUpdate =
                          r.classification === "existing_needs_update" ||
                          r.classification === "missing_name_existing_in_db";
                        const isClosed = r.classification === "existing_already_closed";
                        const isAmbiguous = r.classification === "ambiguous_match";
                        const isMissingName = r.classification === "missing_name_skipped";

                        return (
                          <tr key={r.rowIndex} className="hover:bg-slate-50/75 transition-colors">
                            <td className="py-2 px-3 font-mono text-slate-400">{r.rowIndex}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {r.name || (r.existingPatient ? `${r.existingPatient.name} (DB)` : "—")}
                            </td>
                            <td className="py-2 px-3 font-mono">
                              {r.phoneNormalized ? (
                                <span className="text-slate-900">{r.phoneNormalized}</span>
                              ) : (
                                <span className="text-rose-500 font-semibold">{r.phone || "Missing"}</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {r.branch ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                  {r.branch}
                                </span>
                              ) : isNew ? (
                                <span className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-800">
                                  Fallback: {fallbackBranch}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 max-w-[200px] truncate text-slate-600" title={r.service}>
                              {r.service || <span className="text-slate-400">—</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-500">{r.gender || "—"}</td>
                            <td className="py-2 px-3">
                              {isClosed && (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                                  <Check className="h-3 w-3 text-slate-500" /> CLOSED
                                </span>
                              )}
                              {isUpdate && (
                                <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 border border-indigo-200">
                                  <Clock className="h-3 w-3" /> {r.existingPatient?.status}
                                </span>
                              )}
                              {isAmbiguous && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" /> 2 DB matches
                                </span>
                              )}
                              {(isNew || isMissingName) && (
                                <span className="text-slate-400">Not in CRM</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {isNew && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 border border-emerald-200">
                                  <Check className="h-3 w-3" /> Create (CLOSED)
                                </span>
                              )}
                              {isUpdate && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 border border-indigo-200">
                                  <ArrowRight className="h-3 w-3" /> Update to CLOSED
                                </span>
                              )}
                              {isClosed && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 border border-slate-200">
                                  Skip (Already CLOSED)
                                </span>
                              )}
                              {isAmbiguous && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 border border-amber-200">
                                  Skip (Manual Review)
                                </span>
                              )}
                              {isMissingName && (
                                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 border border-rose-200">
                                  Skip (Missing Name)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div>
                  Showing {filteredRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, filteredRecords.length)} of {filteredRecords.length} records
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 mr-2">
                    <span>Rows:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded border border-slate-200 bg-white p-1 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-semibold text-slate-700">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded border border-slate-200 bg-white p-1 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
