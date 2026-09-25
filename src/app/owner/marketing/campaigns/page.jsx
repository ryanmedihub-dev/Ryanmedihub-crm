"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, FilterBar, DataTable, Badge, Modal, ErrorState, EmptyState, ManualDataNotice,
} from "@/components/owner";
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
import { ownerFetch } from "@/lib/ownerFetch";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { ALL_BRANCHES } from "@/lib/branches";
import { rupee, fmtDate, num } from "@/lib/owner/format";
import { useToast } from "@/components/Toast";

const PLATFORMS = ["Meta", "Google"];
const STATUSES = ["Active", "Paused", "Ended"];
const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Paused", label: "Paused" },
  { value: "Ended", label: "Ended" },
  { value: "All", label: "All statuses" },
];
const PLATFORM_OPTIONS = [{ value: "", label: "All platforms" }, ...PLATFORMS.map((p) => ({ value: p, label: p }))];
const STATUS_KIND = { Active: "good", Paused: "warn", Ended: "neutral" };

const EMPTY_FORM = {
  name: "", platform: "", branch: "", status: "Active", objective: "",
  targetLocations: "", targetAgeMin: "", targetAgeMax: "", targetGender: "All",
  dailyBudget: "", startDate: "", endDate: "", platformCampaignId: "", notes: "",
};

function toDateInputValue(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function CampaignsPage() {
  const toast = useToast();

  const [filterState, setFilterState] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const aiScope = useMemo(() => {
    if (!filterState) return {};
    const s = { dateFrom: filterState.range.from, dateTo: filterState.range.to };
    if (filterState.filters.branch && filterState.filters.branch !== "All") s.branch = filterState.filters.branch;
    if (filterState.filters.status) s.status = filterState.filters.status;
    if (filterState.filters.platform) s.platform = filterState.filters.platform;
    return s;
  }, [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    return `/api/owner/marketing/campaigns?${new URLSearchParams(aiScope).toString()}`;
  }, [filterState, aiScope]);

  const campaignsAi = useAiInsight("marketing.campaigns", aiScope, { kind: "brief", enabled: !!filterState });
  const verdicts = useAiVerdicts("marketing.campaigns", aiScope, { enabled: !!filterState });

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const campaigns = data?.campaigns || [];

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c._id);
    setForm({
      name: c.name, platform: c.platform, branch: c.branch, status: c.status, objective: c.objective || "",
      targetLocations: (c.targetLocations || []).join(", "),
      targetAgeMin: c.targetAgeMin ?? "", targetAgeMax: c.targetAgeMax ?? "", targetGender: c.targetGender || "All",
      dailyBudget: String(c.dailyBudget ?? ""), startDate: toDateInputValue(c.startDate), endDate: toDateInputValue(c.endDate),
      platformCampaignId: c.platformCampaignId || "", notes: c.notes || "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    const targetLocations = form.targetLocations.split(",").map((s) => s.trim()).filter(Boolean);
    if (!form.name.trim() || !form.platform || !form.branch || targetLocations.length === 0) {
      setFormError("Name, platform, branch, and at least one target location are required.");
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setFormError("End date must be after start date.");
      return;
    }

    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      platform: form.platform,
      branch: form.branch,
      status: form.status,
      objective: form.objective,
      targetLocations,
      targetAgeMin: form.targetAgeMin === "" ? null : Number(form.targetAgeMin),
      targetAgeMax: form.targetAgeMax === "" ? null : Number(form.targetAgeMax),
      targetGender: form.targetGender,
      dailyBudget: Number(form.dailyBudget) || 0,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      platformCampaignId: form.platformCampaignId,
      notes: form.notes,
    };

    const r = editingId
      ? await ownerFetch(`/api/owner/marketing/campaigns/${editingId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await ownerFetch("/api/owner/marketing/campaigns", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });

    setSubmitting(false);
    if (r.ok) {
      toast.success(editingId ? "Campaign updated" : "Campaign created");
      setFormOpen(false);
      load();
    } else {
      setFormError(r.error);
    }
  };

  const confirmEnd = async () => {
    const c = deleteTarget;
    if (!c) return;
    setDeleteTarget(null);
    const r = await ownerFetch(`/api/owner/marketing/campaigns/${c._id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Campaign ended");
      load();
    } else {
      toast.error(r.error);
    }
  };

  const lastUpdated = campaigns.reduce((acc, c) => (!acc || new Date(c.updatedAt) > new Date(acc.updatedAt) ? c : acc), null);

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Active Ads"
          subtitle="Hand-maintained campaign records — no Meta/Google API integration"
          aiState={campaignsAi}
          controls={
            <button className="primary" onClick={openCreate}>+ New Campaign</button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="marketing.campaigns" scope={aiScope} title="Active Ads" enabled={!!filterState} aiState={campaignsAi} />

          <ManualDataNotice lastUpdatedAt={lastUpdated?.updatedAt} lastUpdatedBy={lastUpdated?.updatedBy?.name} />

          <FilterBar
            show={["date", "branch"]}
            extras={[
              { key: "status", label: "Status", options: STATUS_OPTIONS },
              { key: "platform", label: "Platform", options: PLATFORM_OPTIONS },
            ]}
            defaults={{ status: "Active", platform: "" }}
            onChange={({ filters, range }) => setFilterState({ filters, range })}
          />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <Card title="Campaigns" subtitle={loading ? "Loading…" : `${campaigns.length} campaigns · spend/clicks/CPC for the selected period`}>
              <AiScanOverlay active={verdicts.loading}>
              <DataTable
                tall
                loading={loading}
                emptyMessage={<EmptyState icon="◈" title="No campaigns" hint="Create one with the button above." />}
                columns={[
                  { key: "name", label: "Name", render: (c) => c.name },
                  aiVerdictColumn({ byId: verdicts.byId, loading: verdicts.loading, labelSet: "campaign" }),
                  { key: "platform", label: "Platform", render: (c) => <Badge kind={c.platform === "Meta" ? "purple" : "info"}>{c.platform}</Badge> },
                  { key: "status", label: "Status", render: (c) => <Badge kind={STATUS_KIND[c.status]}>{c.status}</Badge> },
                  { key: "branch", label: "Branch", render: (c) => c.branch },
                  { key: "dailyBudget", label: "Daily Budget", align: "right", render: (c) => rupee(c.dailyBudget) },
                  { key: "targetLocations", label: "Target Locations", render: (c) => (c.targetLocations || []).join(", ") || "—" },
                  {
                    key: "dates", label: "Date Range",
                    render: (c) => `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`,
                  },
                  { key: "spend", label: "Spend (period)", align: "right", render: (c) => rupee(c.spend) },
                  {
                    key: "cpc", label: "CPC (period)", align: "right",
                    render: (c) => (c.cpc == null ? <span className="muted">No clicks entered</span> : rupee(c.cpc)),
                  },
                  { key: "updated", label: "Last Updated", render: (c) => `${fmtDate(c.updatedAt)} · ${c.updatedBy?.name || "—"}` },
                  {
                    key: "actions", label: "", align: "right",
                    render: (c) => (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button type="button" className="ok-btn" onClick={() => openEdit(c)}>Edit</button>
                        {c.status !== "Ended" && (
                          <button type="button" className="danger-btn" onClick={() => setDeleteTarget(c)}>End</button>
                        )}
                      </div>
                    ),
                  },
                ]}
                rows={campaigns.map((c) => ({ ...c, id: c._id }))}
              />
              </AiScanOverlay>
              <p className="muted" style={{ marginTop: 10, fontSize: "var(--fs-12)" }}>
                Leads / CPL / Converted / CAC aren&apos;t shown per campaign — the lead source tag only
                distinguishes platform (Meta/Google), never campaign, so per-campaign attribution isn&apos;t
                possible with current data.
              </p>
            </Card>
          )}
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? "Edit Campaign" : "New Campaign"}>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
            Name
            <input className="control" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Platform
              <select className="control" value={form.platform} onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))} required>
                <option value="" disabled>Select platform</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Branch
              <select className="control" value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} required>
                <option value="" disabled>Select branch</option>
                {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Status
              <select className="control" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Daily Budget (₹)
              <input type="number" className="control" min="0" value={form.dailyBudget} onChange={(e) => setForm((p) => ({ ...p, dailyBudget: e.target.value }))} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
            Target Locations (comma-separated)
            <input className="control" placeholder="e.g. Delhi, Noida, Gurugram" value={form.targetLocations} onChange={(e) => setForm((p) => ({ ...p, targetLocations: e.target.value }))} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Min Age
              <input type="number" className="control" min="0" value={form.targetAgeMin} onChange={(e) => setForm((p) => ({ ...p, targetAgeMin: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Max Age
              <input type="number" className="control" min="0" value={form.targetAgeMax} onChange={(e) => setForm((p) => ({ ...p, targetAgeMax: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Gender
              <select className="control" value={form.targetGender} onChange={(e) => setForm((p) => ({ ...p, targetGender: e.target.value }))}>
                <option value="All">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              Start Date
              <input type="date" className="control" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
              End Date
              <input type="date" className="control" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
            Objective
            <input className="control" value={form.objective} onChange={(e) => setForm((p) => ({ ...p, objective: e.target.value }))} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
            Notes
            <textarea className="control" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>

          {formError && <p style={{ color: "var(--crit)" }}>{formError}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Saving…" : editingId ? "Save changes" : "Create campaign"}
            </button>
            <button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="End this campaign?" subtitle="It won't be deleted — its spend history stays intact and it moves to Ended status.">
        {deleteTarget && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" className="danger-btn" onClick={confirmEnd}>End campaign</button>
            <button type="button" className="btn" onClick={() => setDeleteTarget(null)}>Keep it</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
