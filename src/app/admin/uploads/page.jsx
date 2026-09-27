"use client";

import { useEffect, useState } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  ArrowLeft,
  Receipt,
  Users,
  HeartPulse,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import UploadDropzone from "@/components/uploads/UploadDropzone";
import PreviewTable from "@/components/uploads/PreviewTable";
import BatchResultPanel from "@/components/uploads/BatchResultPanel";
import {
  buildTemplateBytes,
  buildErrorReportBytes,
  readUploadedWorkbook,
  downloadBytes,
} from "@/lib/uploads/excelTemplate";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

const UPLOAD_TYPES = [
  { key: "payables", label: "Payables", sub: "Vendor / Salary / Rent / Expenses", Icon: Receipt, enabled: true },
  { key: "receivables", label: "Receivables", sub: "Coming soon", Icon: Download, enabled: false },
  { key: "patients", label: "Patients", sub: "Coming soon", Icon: HeartPulse, enabled: false },
  { key: "employees", label: "Employees", sub: "Coming soon", Icon: Users, enabled: false },
];

export default function UploadsPage() {
  const toast = useToast();
  const [phase, setPhase] = useState("idle"); 
  const [lists, setLists] = useState(null);
  const [listsError, setListsError] = useState(false);
  const [building, setBuilding] = useState(false);

  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [validation, setValidation] = useState(null); 
  const [skipErrors, setSkipErrors] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [commitResult, setCommitResult] = useState(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payables/bulk/template");
        if (!res.ok) throw new Error();
        setLists(await res.json());
      } catch {
        setListsError(true);
      }
    })();
  }, []);

  const reset = () => {
    setPhase("idle");
    setFile(null);
    setRawRows([]);
    setValidation(null);
    setSkipErrors(false);
    setBatchLabel("");
    setCommitResult(null);
  };

  const downloadTemplate = async (withExamples) => {
    if (!lists) return;
    setBuilding(true);
    try {
      const bytes = await buildTemplateBytes(lists, { withExamples });
      downloadBytes(bytes, withExamples ? "payables-template.xlsx" : "payables-template-blank.xlsx");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't build the template.");
    } finally {
      setBuilding(false);
    }
  };

  const handleFile = async (f) => {
    setFile(f);
    setPhase("parsing");
    setValidation(null);
    setCommitResult(null);
    try {
      const { rows, missingHeaders, extraHeaders } = await readUploadedWorkbook(f);
      if (missingHeaders.length > 0) {
        toast.error(`The header row is missing: ${missingHeaders.join(", ")}. Start from a fresh template.`);
        setPhase("idle");
        return;
      }
      if (extraHeaders.length > 0) {
        toast.error(`Ignoring unknown column(s): ${extraHeaders.join(", ")}`);
      }
      if (rows.length === 0) {
        toast.error("No data rows found on the Payables sheet.");
        setPhase("idle");
        return;
      }
      if (rows.length > 500) {
        toast.error(`${rows.length} rows — the limit is 500. Split the file.`);
        setPhase("idle");
        return;
      }
      setRawRows(rows);
      const res = await fetch("/api/payables/bulk/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Validation failed");
        setPhase("idle");
        return;
      }
      setValidation(data);
      setSkipErrors(false);
      setPhase("preview");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't read that file.");
      setPhase("idle");
    }
  };

  const downloadErrorReport = async () => {
    if (!validation) return;
    const failed = validation.results
      .filter((r) => r.status === "error")
      .map((r) => ({ raw: rawRows[r.rowNumber - 2] || {}, rowNumber: r.rowNumber, errors: r.errors }));
    if (failed.length === 0) return;
    try {
      downloadBytes(await buildErrorReportBytes(failed), "payables-errors.xlsx");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't build the error report.");
    }
  };

  const commit = async () => {
    if (!validation) return;
    const confirmedHashes = validation.results
      .filter((r) => r.status === "ok" || r.status === "warning")
      .map((r) => r.rowHash);
    if (confirmedHashes.length === 0) {
      toast.error("Nothing ready to import.");
      return;
    }
    setPhase("committing");
    try {
      const res = await fetch("/api/payables/bulk/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchLabel,
          fileName: file?.name || "",
          rows: rawRows,
          confirmedHashes,
          skipErrors,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(data.error || "Something changed — review the refreshed preview.");
        if (data.results) setValidation({ summary: data.summary, results: data.results });
        setPhase("preview");
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Import failed");
        setPhase("preview");
        return;
      }
      setCommitResult(data);
      setPhase("done");
      toast.success(`Imported ${data.created} row(s) — ${data.docsCreated} payable document(s).`);
    } catch (err) {
      console.error(err);
      toast.error("Import failed");
      setPhase("preview");
    }
  };

  const revertBatch = async () => {
    if (!commitResult?.batchId) return;
    const n = commitResult.docsCreated;
    if (
      !window.confirm(
        `Revert batch #${commitResult.batchNo}?\n\n` +
          `This cancels up to ${n} payable document(s) created by this upload. ` +
          `Any that already have a payment recorded against them are left alone. ` +
          `Cancelled payables are soft-cancelled, not deleted.`,
      )
    ) {
      return;
    }
    setReverting(true);
    try {
      const res = await fetch(`/api/payables/bulk/${commitResult.batchId}/revert`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Revert failed");
        return;
      }
      toast.success(data.message || "Batch reverted");
      setCommitResult((prev) => ({ ...prev, reverted: true, revertInfo: data }));
    } catch {
      toast.error("Revert failed");
    } finally {
      setReverting(false);
    }
  };

  const busy = phase === "parsing" || phase === "committing";
  const summary = validation?.summary;
  const canCommit =
    summary && summary.ok + summary.warning > 0 && (summary.error === 0 || skipErrors);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Uploads</h1>
            <p className="text-sm text-slate-500">Bulk-create records from an Excel sheet</p>
          </div>
          {phase !== "idle" && (
            <button
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Start over
            </button>
          )}
        </div>

        {}
        {phase === "idle" && (
          <section className="space-y-6">
            <div>
              <h2 className="mb-3 text-sm font-bold text-slate-900">1. What are you uploading?</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {UPLOAD_TYPES.map((t) => (
                  <div
                    key={t.key}
                    className={`rounded-2xl border p-4 ${
                      t.enabled
                        ? "border-indigo-300 bg-white ring-1 ring-indigo-100"
                        : "border-slate-200 bg-slate-50 opacity-60"
                    }`}
                  >
                    <t.Icon className={`h-6 w-6 ${t.enabled ? "text-indigo-600" : "text-slate-400"}`} />
                    <p className="mt-2 text-sm font-bold text-slate-900">{t.label}</p>
                    <p className="text-xs text-slate-500">{t.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {}
            <div>
              <h2 className="mb-3 text-sm font-bold text-slate-900">2. Download the template</h2>
              {listsError ? (
                <p className="text-sm text-rose-600">Couldn't load master data — reload the page.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => downloadTemplate(true)}
                    disabled={!lists || building}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Template with examples &amp; my lists
                  </button>
                  <button
                    onClick={() => downloadTemplate(false)}
                    disabled={!lists || building}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="h-4 w-4" /> Blank sheet only
                  </button>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                No built-in dropdowns — the Excel writer can&apos;t add them. Valid values are on the{" "}
                <strong>Lists</strong> sheet; the <strong>Instructions</strong> sheet explains the amount / GST /
                TDS math and that a TDS row creates a second Payable. The server validates every value.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-bold text-slate-900">3. Upload the filled file</h2>
              <UploadDropzone onFile={handleFile} fileName={file?.name} disabled={busy} />
            </div>
          </section>
        )}

        {phase === "parsing" && (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Reading &amp; validating…
          </div>
        )}

        {(phase === "preview" || phase === "committing") && validation && (
          <section className="space-y-4">
            <PreviewTable summary={validation.summary} results={validation.results} />

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <button
                onClick={downloadErrorReport}
                disabled={validation.summary.error === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-4 w-4" /> Download error report ({validation.summary.error})
              </button>

              {validation.summary.error > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={skipErrors}
                    onChange={(e) => setSkipErrors(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  Skip the {validation.summary.error} error row(s) and import the rest
                </label>
              )}

              <div className="ml-auto flex items-center gap-3">
                <input
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="Batch label (e.g. Sept 2026 salaries)"
                  className={`${inputClass} w-64`}
                />
                <button
                  onClick={commit}
                  disabled={!canCommit || phase === "committing"}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {phase === "committing" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>Import {validation.summary.ok + validation.summary.warning} rows</>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === "done" && commitResult && (
          <BatchResultPanel
            result={commitResult}
            reverting={reverting}
            onRevert={revertBatch}
            onStartOver={reset}
          />
        )}
      </div>
    </div>
  );
}
