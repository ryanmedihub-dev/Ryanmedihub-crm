"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Modal, Badge, EmptyState, InlineNotice, KpiRow, ManualDataNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { ownerFetch } from "@/lib/ownerFetch";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { OWNER_BRANCHES as BRANCH_OPTIONS } from "@/lib/owner/filters";
import { useToast } from "@/components/Toast";
import { rupee, num, roasFmt } from "@/lib/owner/format";

const PLATFORMS = ["Meta", "Google"];

const EMPTY_FORM = { date: "", branch: "", platform: "", campaignName: "", campaignId: "", amount: "", clicks: "" };

function toDateInputValue(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function AdSpendPage() {
  const toast = useToast();

  const [filters, setFilters] = useState({ branch: "All", platform: "All", from: "", to: "" });

  const [form, setForm]           = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const aiScope = useMemo(() => {
    const s = {};
    if (filters.branch !== "All") s.branch = filters.branch;
    if (filters.platform !== "All") s.platform = filters.platform;
    if (filters.from) s.from = filters.from;
    if (filters.to) s.to = filters.to;
    return s;
  }, [filters]);

  const entriesUrl = useMemo(() => {
    const params = new URLSearchParams(aiScope);
    
    
    if (filters.from && filters.to) params.set("withReturn", "true");
    return `/api/owner/ad-spend?${params.toString()}`;
  }, [aiScope, filters.from, filters.to]);

  const { data: entriesData, loading, mutate: fetchEntries } = useOwnerData(entriesUrl);
  const adSpendAi = useAiInsight("marketing.adSpend", aiScope, { kind: "brief" });
  const entries = entriesData?.entries || [];
  const returnByPlatform = entriesData?.returnByPlatform || null;
  const lastUpdated = entries.reduce((acc, e) => (!acc || new Date(e.createdAt) > new Date(acc.createdAt) ? e : acc), null);

  const { data: campaignsData } = useOwnerData("/api/owner/marketing/campaigns?status=Active&dateFrom=&dateTo=");
  const campaigns = campaignsData?.campaigns || [];

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
  };

  const handleEdit = (entry) => {
    setEditingId(entry._id);
    setForm({
      date: toDateInputValue(entry.date),
      branch: entry.branch,
      platform: entry.platform,
      campaignName: entry.campaignName || "",
      campaignId: entry.campaignId?._id || entry.campaignId || "",
      amount: String(entry.amount),
      clicks: entry.clicks == null ? "" : String(entry.clicks),
    });
    setFormError("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDelete = async () => {
    const entry = deleteTarget;
    if (!entry) return;
    setDeleteTarget(null);
    const r = await ownerFetch(`/api/owner/ad-spend?id=${entry._id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Entry deleted");
      if (editingId === entry._id) resetForm();
      fetchEntries();
    } else {
      toast.error(r.error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.date || !form.branch || !form.platform || form.amount === "") {
      setFormError("Date, branch, platform, and amount are required.");
      return;
    }
    if (Number(form.amount) < 0 || isNaN(Number(form.amount))) {
      setFormError("Amount must be a non-negative number.");
      return;
    }
    if (form.clicks !== "" && (isNaN(Number(form.clicks)) || Number(form.clicks) < 0)) {
      setFormError("Clicks must be a non-negative number.");
      return;
    }

    setSubmitting(true);
    const url = editingId ? `/api/owner/ad-spend?id=${editingId}` : "/api/owner/ad-spend";
    const method = editingId ? "PUT" : "POST";
    const selectedCampaign = campaigns.find((c) => c._id === form.campaignId);
    const r = await ownerFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        branch: form.branch,
        platform: form.platform,
        campaignId: form.campaignId || null,
        campaignName: selectedCampaign ? selectedCampaign.name : form.campaignName,
        amount: Number(form.amount),
        clicks: form.clicks === "" ? null : Number(form.clicks),
      }),
    });
    if (r.ok) {
      toast.success(editingId ? "Entry updated" : "Entry added");
      resetForm();
      fetchEntries();
    } else {
      setFormError(r.error);
    }
    setSubmitting(false);
  };

  const totalSpend = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const isEditing = !!editingId;
  const hasFilters = filters.branch !== "All" || filters.platform !== "All" || filters.from || filters.to;

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Ad Spend Entry"
          subtitle="Where the marketing number goes in — Meta & Google spend, entered by hand"
          aiState={adSpendAi}
          controls={
            <button className="icon-btn" onClick={() => fetchEntries()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="marketing.adSpend" scope={aiScope} title="Ad Spend Entry" aiState={adSpendAi} />

          <ManualDataNotice lastUpdatedAt={lastUpdated?.createdAt} lastUpdatedBy={lastUpdated?.enteredBy?.name} />

          <div className="grid cols-2">
            <Card
              title={isEditing ? "Edit entry" : "Add entry"}
              subtitle={isEditing ? "Updating an existing spend record" : "Log a new Meta or Google spend row"}
              actions={isEditing ? <Badge kind="purple">Editing</Badge> : null}
            >
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                  Date
                  <input
                    type="date"
                    className="control"
                    style={{ width: "100%" }}
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    required
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                  Branch
                  <select
                    className="control"
                    style={{ width: "100%" }}
                    value={form.branch}
                    onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))}
                    required
                  >
                    <option value="" disabled>Select branch</option>
                    {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                  Platform
                  <select
                    className="control"
                    style={{ width: "100%" }}
                    value={form.platform}
                    onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))}
                    required
                  >
                    <option value="" disabled>Select platform</option>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                  Campaign
                  <select
                    className="control"
                    style={{ width: "100%" }}
                    value={form.campaignId}
                    onChange={(e) => setForm((p) => ({ ...p, campaignId: e.target.value, campaignName: e.target.value ? "" : p.campaignName }))}
                  >
                    <option value="">Other / one-off (type a name below)</option>
                    {campaigns.filter((c) => !form.platform || c.platform === form.platform).map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                {!form.campaignId && (
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                    Campaign name (free text, for historical/one-off entries)
                    <input
                      type="text"
                      className="control"
                      style={{ width: "100%" }}
                      placeholder="e.g. Delhi_FUE_August"
                      value={form.campaignName}
                      onChange={(e) => setForm((p) => ({ ...p, campaignName: e.target.value }))}
                    />
                  </label>
                )}
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                  Amount (₹)
                  <input
                    type="number"
                    className="control"
                    style={{ width: "100%" }}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    required
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-muted)" }}>
                  Clicks (optional — enables CPC)
                  <input
                    type="number"
                    className="control"
                    style={{ width: "100%" }}
                    placeholder="Not tracked anywhere automatically — enter if known"
                    min="0"
                    value={form.clicks}
                    onChange={(e) => setForm((p) => ({ ...p, clicks: e.target.value }))}
                  />
                </label>

                {formError && <InlineNotice kind="error">{formError}</InlineNotice>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="primary" disabled={submitting}>
                    {submitting ? "Saving…" : isEditing ? "Save changes" : "Add entry"}
                  </button>
                  {isEditing && (
                    <button type="button" className="btn" onClick={resetForm}>
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </Card>

            <Card title="Filters" subtitle="Narrow the list below">
              <div style={{ display: "grid", gap: 12 }}>
                <select
                  className="control"
                  style={{ width: "100%" }}
                  value={filters.branch}
                  onChange={(e) => setFilters((p) => ({ ...p, branch: e.target.value }))}
                  aria-label="Filter by branch"
                >
                  {BRANCH_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  className="control"
                  style={{ width: "100%" }}
                  value={filters.platform}
                  onChange={(e) => setFilters((p) => ({ ...p, platform: e.target.value }))}
                  aria-label="Filter by platform"
                >
                  <option value="All">All platforms</option>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="date" className="control" style={{ flex: 1 }} value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} aria-label="From date" />
                  <input type="date" className="control" style={{ flex: 1 }} value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} aria-label="To date" />
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setFilters({ branch: "All", platform: "All", from: "", to: "" })}
                  disabled={!hasFilters}
                >
                  Clear filters
                </button>
              </div>
            </Card>
          </div>

          <Card
            title="Recent entries"
            subtitle={loading ? "Loading…" : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${formatCurrency(totalSpend)} total`}
          >
            <DataTable
              tall
              loading={loading}
              emptyMessage={
                <EmptyState
                  icon="✎"
                  title={hasFilters ? "No entries match these filters" : "No ad spend logged yet"}
                  hint={hasFilters ? "Widen or clear the filters." : "Add your first Meta or Google spend row with the form above."}
                />
              }
              columns={[
                { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                { key: "branch", label: "Branch" },
                { key: "platform", label: "Platform", render: (row) => <Badge kind={row.platform === "Meta" ? "purple" : "info"}>{row.platform}</Badge> },
                { key: "campaignName", label: "Campaign", render: (row) => row.campaignId?.name || row.campaignName || <span className="muted">—</span> },
                { key: "amount", label: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
                { key: "clicks", label: "Clicks", align: "right", render: (row) => (row.clicks == null ? <span className="muted">—</span> : row.clicks) },
                { key: "enteredBy", label: "Entered by", render: (row) => row.enteredBy?.name || "—" },
                {
                  key: "actions",
                  label: "",
                  align: "right",
                  render: (row) => (
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button type="button" className="ok-btn" onClick={() => handleEdit(row)}>Edit</button>
                      <button type="button" className="danger-btn" onClick={() => setDeleteTarget(row)}>Delete</button>
                    </div>
                  ),
                },
              ]}
              rows={loading ? [] : entries.map((e) => ({ ...e, id: e._id }))}
            />
          </Card>

          {returnByPlatform && (
            <Card
              title="Return"
              subtitle="Spend → leads → conversions for this filter, via the shared attribution rule (revenue counted whenever it lands, not bound to this period)"
            >
              {PLATFORMS.map((platform) => {
                const o = returnByPlatform[platform];
                if (!o) return null;
                return (
                  <div key={platform} style={{ marginBottom: 16 }}>
                    <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                      <Badge kind={platform === "Meta" ? "purple" : "info"}>{platform}</Badge>
                    </p>
                    <KpiRow
                      primaryIndex={-1}
                      items={[
                        { label: "Spend", value: rupee(o.spend), sub: "This period", kind: "info" },
                        { label: "Leads", value: num(o.leads), sub: "This period", kind: "info" },
                        { label: "CPL", value: rupee(o.cpl), sub: "Cost per lead", kind: "good" },
                        { label: "CPC", value: o.cpc == null ? "—" : rupee(o.cpc), sub: o.clicks == null ? "No clicks entered" : `${num(o.clicks)} clicks`, kind: "good" },
                        { label: "Converted", value: num(o.converted), sub: "So far", kind: "good" },
                        { label: "Revenue", value: rupee(o.revenue), sub: "So far", kind: "good" },
                        { label: "CAC", value: rupee(o.cac), sub: "Cost per conversion", kind: "warn" },
                        { label: "ROAS", value: roasFmt(o.roas), sub: "Revenue ÷ spend", kind: o.roas != null && o.roas >= 1 ? "good" : "bad" },
                      ]}
                    />
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this entry?"
        subtitle="This cannot be undone."
      >
        {deleteTarget && (
          <>
            <div className="metric-pair"><span className="muted">Date</span><span>{formatDate(deleteTarget.date)}</span></div>
            <div className="metric-pair"><span className="muted">Branch</span><span>{deleteTarget.branch}</span></div>
            <div className="metric-pair"><span className="muted">Platform</span><span>{deleteTarget.platform}</span></div>
            <div className="metric-pair"><span className="muted">Campaign</span><span>{deleteTarget.campaignId?.name || deleteTarget.campaignName || "—"}</span></div>
            <div className="metric-pair"><span className="muted">Amount</span><span>{formatCurrency(deleteTarget.amount)}</span></div>
            {deleteTarget.clicks != null && (
              <div className="metric-pair"><span className="muted">Clicks</span><span>{deleteTarget.clicks}</span></div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" className="danger-btn" onClick={confirmDelete}>Delete entry</button>
              <button type="button" className="btn" onClick={() => setDeleteTarget(null)}>Keep it</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
