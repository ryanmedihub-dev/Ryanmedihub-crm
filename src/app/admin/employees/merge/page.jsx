"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, GitMerge, Loader2, Undo2, CheckCircle2, AlertTriangle } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import { useToast } from "@/components/Toast";
import EmployeeComparePanel from "@/components/employees/EmployeeComparePanel";
import MergeImpactTable from "@/components/employees/MergeImpactTable";
import ConflictResolver from "@/components/employees/ConflictResolver";

export default function EmployeeMergePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [survivorId, setSurvivorId] = useState("");
  const [duplicateId, setDuplicateId] = useState(searchParams.get("duplicate") || "");

  // Survivor and Duplicate each get their own result set — sharing one meant typing in
  // either box silently overwrote what the other box's dropdown would show next time it opened.
  const [survivorOptions, setSurvivorOptions] = useState([]);
  const [survivorSearching, setSurvivorSearching] = useState(false);
  const [duplicateOptions, setDuplicateOptions] = useState([]);
  const [duplicateSearching, setDuplicateSearching] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [dupSearch, setDupSearch] = useState("");
  const [dupVisible, setDupVisible] = useState(20);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fieldChoices, setFieldChoices] = useState({});
  const [resolutions, setResolutions] = useState({});
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const searchSurvivor = useCallback(async (term) => {
    setSurvivorSearching(true);
    try {
      const json = await fetch(`/api/employees/get?search=${encodeURIComponent(term || "")}&limit=30`).then((r) => r.json());
      setSurvivorOptions(json.employees || []);
    } catch {
      setSurvivorOptions([]);
    } finally {
      setSurvivorSearching(false);
    }
  }, []);

  const searchDuplicate = useCallback(async (term) => {
    setDuplicateSearching(true);
    try {
      const json = await fetch(`/api/employees/get?search=${encodeURIComponent(term || "")}&limit=30`).then((r) => r.json());
      setDuplicateOptions(json.employees || []);
    } catch {
      setDuplicateOptions([]);
    } finally {
      setDuplicateSearching(false);
    }
  }, []);

  useEffect(() => {
    searchSurvivor("");
    searchDuplicate("");
    fetch("/api/employees/merge/suggestions")
      .then((r) => r.json())
      .then((j) => setSuggestions(j.pairs || []))
      .catch(() => setSuggestions([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSuggestions = useMemo(() => {
    const q = dupSearch.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(
      (p) =>
        p.a.name?.toLowerCase().includes(q) ||
        p.b.name?.toLowerCase().includes(q) ||
        p.a.employeeId?.toLowerCase().includes(q) ||
        p.b.employeeId?.toLowerCase().includes(q) ||
        p.a.phone?.includes(q) ||
        p.b.phone?.includes(q),
    );
  }, [suggestions, dupSearch]);

  useEffect(() => setDupVisible(20), [dupSearch]);

  const loadPreview = useCallback(async () => {
    if (!survivorId || !duplicateId) return;
    setPreviewLoading(true);
    setResult(null);
    try {
      const json = await fetch(
        `/api/employees/merge/preview?survivorId=${survivorId}&duplicateId=${duplicateId}`,
      ).then((r) => r.json());
      setPreview(json);
      if (json.success) {
        // seed field choices from suggestions
        const seed = {};
        (json.fieldDiff || []).forEach((f) => {
          if (f.differs) seed[f.field] = f.suggest || "survivor";
        });
        setFieldChoices(seed);
        const rSeed = {};
        (json.conflicts || []).forEach((c) => (rSeed[c.key] = c.defaultResolution));
        setResolutions(rSeed);
      }
    } catch {
      setPreview({ success: false, error: "Failed to load preview" });
    } finally {
      setPreviewLoading(false);
    }
  }, [survivorId, duplicateId]);

  useEffect(() => {
    if (step >= 2 && survivorId && duplicateId) loadPreview();
  }, [step, survivorId, duplicateId, loadPreview]);

  const conflictsResolved = useMemo(
    () => (preview?.conflicts || []).every((c) => resolutions[c.key] && resolutions[c.key] !== "MANUAL"),
    [preview, resolutions],
  );
  const canMerge =
    preview?.success && (preview.blockers || []).length === 0 && conflictsResolved && confirmText.trim() === (preview.survivor?.name || "").trim();

  const doMerge = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/employees/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivorId,
          duplicateId,
          fieldChoices,
          conflictResolutions: resolutions,
          confirmToken: preview.confirmToken,
          note: "",
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.preview) {
        setPreview(json.preview);
        toast.error("The picture changed — re-check the impact and confirm again.");
        setStep(3);
        return;
      }
      if (!json.success && json.verification) {
        setResult(json);
        toast.error(json.warning || "Merge finished with warnings");
        setStep(4);
        return;
      }
      if (!json.success) {
        toast.error(json.error || (json.blockers || []).join(" · ") || "Merge failed");
        return;
      }
      setResult(json);
      toast.success(`Merged — ${json.totalReferences} reference(s) repointed`);
      setStep(4);
    } catch {
      toast.error("Merge failed");
    } finally {
      setSubmitting(false);
    }
  };

  const doRevert = async () => {
    if (!result?.mergeId) return;
    if (!confirm("Undo this merge? Both records go back to exactly how they were.")) return;
    setSubmitting(true);
    try {
      const json = await fetch(`/api/employees/merge/${result.mergeId}/revert`, { method: "POST" }).then((r) => r.json());
      if (json.success) {
        toast.success("Merge reverted");
        router.push("/admin/employees");
      } else {
        toast.error(json.error || "Revert failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fmtOpt = (e) => `${e.name}${e.employeeId ? ` (${e.employeeId})` : ""} — ${e.role}${e.branch ? ` · ${e.branch}` : ""}`;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <button onClick={() => router.push("/admin/employees")} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to employees
        </button>

        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <GitMerge className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Merge duplicate employees</h1>
            <p className="text-sm text-gray-500">Repoint every reference from the duplicate onto the survivor. Reversible.</p>
          </div>
        </div>

        {/* step rail */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          {["Find", "Compare", "Impact", "Confirm"].map((label, i) => (
            <div key={label} className={`flex items-center gap-2 ${step === i + 1 ? "text-indigo-700" : "text-gray-400"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full ${step === i + 1 ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>{i + 1}</span>
              {label}
              {i < 3 && <span className="text-gray-300">—</span>}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Survivor (kept)">
                <SearchableSelect
                  options={survivorOptions}
                  value={survivorId}
                  onChange={(v) => setSurvivorId(v)}
                  placeholder="Search employee…"
                  valueKey="_id"
                  formatOption={fmtOpt}
                  onSearch={searchSurvivor}
                  searching={survivorSearching}
                />
              </Field>
              <Field label="Duplicate (retired)">
                <SearchableSelect
                  options={duplicateOptions}
                  value={duplicateId}
                  onChange={(v) => setDuplicateId(v)}
                  placeholder="Search employee…"
                  valueKey="_id"
                  formatOption={fmtOpt}
                  onSearch={searchDuplicate}
                  searching={duplicateSearching}
                />
              </Field>
            </div>

            {suggestions.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Likely duplicates ({filteredSuggestions.length})
                  </p>
                  <input
                    type="text"
                    value={dupSearch}
                    onChange={(e) => setDupSearch(e.target.value)}
                    placeholder="Filter by name, ID or phone…"
                    className="w-56 max-w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
                {filteredSuggestions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">No matches for &ldquo;{dupSearch}&rdquo;</p>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-50">
                      {filteredSuggestions.slice(0, dupVisible).map((p) => (
                        <li key={`${p.a._id}-${p.b._id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="font-medium text-gray-800">{p.a.name}</span>
                            <span className="text-gray-400"> ↔ </span>
                            <span className="font-medium text-gray-800">{p.b.name}</span>
                            <span className="ml-2 text-[11px] text-gray-400">
                              {p.reason} · {p.a.patientCount + p.b.patientCount} patients
                            </span>
                          </span>
                          <button
                            onClick={() => {
                              const survivor = p.a.patientCount >= p.b.patientCount ? p.a : p.b;
                              const dup = survivor === p.a ? p.b : p.a;
                              setSurvivorId(survivor._id);
                              setDuplicateId(dup._id);
                              setStep(2);
                            }}
                            className="shrink-0 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            Review
                          </button>
                        </li>
                      ))}
                    </ul>
                    {filteredSuggestions.length > dupVisible && (
                      <button
                        onClick={() => setDupVisible((n) => n + 20)}
                        className="mt-2 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Show more ({filteredSuggestions.length - dupVisible} remaining)
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <NavButtons onNext={() => setStep(2)} nextDisabled={!survivorId || !duplicateId || survivorId === duplicateId} />
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 &&
          (previewLoading || !preview ? (
            <p className="py-10 text-center text-sm text-gray-400">Analysing…</p>
          ) : !preview.success ? (
            <StepError error={preview.error} onBack={() => setStep(1)} />
          ) : (
            <div className="space-y-4">
              <EmployeeComparePanel
                survivor={preview.survivor}
                duplicate={preview.duplicate}
                fieldDiff={preview.fieldDiff}
                choices={fieldChoices}
                onChange={setFieldChoices}
              />
              <div className="grid gap-3 sm:grid-cols-2 text-xs text-gray-500">
                <RefCount title={`${preview.survivor?.name} · survivor`} n={preview.survivor?.patientCount ?? 0} unit="patients" />
                <RefCount title={`${preview.duplicate?.name} · duplicate`} n={preview.totalReferences} unit="references to repoint" />
              </div>
              {preview.suggestedSurvivor === "duplicate" && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Heads up — <strong>{preview.duplicate?.name}</strong> has more history. Consider swapping which one is the survivor.
                </p>
              )}
              <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </div>
          ))}

        {/* STEP 3 */}
        {step === 3 &&
          (previewLoading || !preview ? (
            <p className="py-10 text-center text-sm text-gray-400">Analysing…</p>
          ) : !preview.success ? (
            <StepError error={preview.error} onBack={() => setStep(2)} />
          ) : (
            <div className="space-y-4">
              {(preview.blockers || []).length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Merge blocked</p>
                  <ul className="mt-1 list-disc pl-5">{preview.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              )}
              {(preview.warnings || []).map((w, i) => (
                <p key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{w}</p>
              ))}
              <MergeImpactTable references={preview.references} totalReferences={preview.totalReferences} finance={preview.finance} />
              <ConflictResolver conflicts={preview.conflicts} value={resolutions} onChange={setResolutions} />
              <NavButtons
                onBack={() => setStep(2)}
                onNext={() => setStep(4)}
                nextDisabled={(preview.blockers || []).length > 0 || !conflictsResolved}
              />
            </div>
          ))}

        {/* STEP 4 */}
        {step === 4 && !result && preview?.success && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-700">
                This repoints <strong>{preview.totalReferences}</strong> document(s) onto{" "}
                <strong>{preview.survivor.name}</strong> and retires <strong>{preview.duplicate.name}</strong>.
                Type the survivor&apos;s name to confirm.
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={preview.survivor.name}
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={doMerge}
                disabled={!canMerge || submitting}
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                Merge
              </button>
            </div>
          </div>
        )}

        {/* RESULT */}
        {step === 4 && result && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-5 shadow-sm ${result.success ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="flex items-center gap-2 text-sm font-bold">
                {result.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
                {result.success ? "Merge complete" : "Merge committed with warnings"}
              </p>
              <p className="mt-1 text-sm text-gray-700">{result.totalReferences} reference(s) repointed.</p>
              {result.verification && !result.verification.clean && (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                  {result.verification.stillReferenced.map((s, i) => (
                    <li key={i}>{s.model}.{s.path} still has {s.remaining}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => router.push("/admin/employees")} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Done
              </button>
              <button
                onClick={doRevert}
                disabled={submitting}
                className="rounded-xl bg-white border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                Undo this merge
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}
function RefCount({ title, n, unit = "reference(s)" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="font-semibold text-gray-700 truncate">{title}</p>
      <p>{n} {unit}</p>
    </div>
  );
}
function NavButtons({ onBack, onNext, nextDisabled }) {
  return (
    <div className="flex gap-3 pt-1">
      {onBack && (
        <button onClick={onBack} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Back
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
function StepError({ error, onBack }) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error || "Couldn't build the merge preview."}
      </p>
      <button onClick={onBack} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
        Back
      </button>
    </div>
  );
}
