"use client";

import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, KpiRow, ErrorState, EmptyState, InlineNotice, AttentionRamp } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";

const RULE_LEVEL = {
  overdueFollowUps: 2,
  interestedNoCall: 3,
  bookingDoneStale: 3,
  surgeryBookedStale: 4,
  poorPerformers: 2,
};

const ageCol = { key: "age", label: "Age", align: "right", render: (r) => (r.age != null ? `${r.age}d` : "—") };

export default function AttentionPage() {
  const router = useRouter();
  const { data, loading, error, isValidating, mutate: load } = useOwnerData("/api/owner/ai/attention");
  const attentionAi = useAiInsight("ai.attention", {}, { kind: "brief" });

  const rules = data?.rules || [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Attention"
          subtitle="Documented threshold rules over data you already have — no AI, no scoring model, no confidence percentages"
          aiState={attentionAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="ai.attention" scope={{}} title="Attention" aiState={attentionAi} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Total Flagged", value: num(data?.totalFlagged), sub: "Across all rules", kind: "bad" },
                  { label: "Value at Risk", value: rupee(data?.totalValueAtRisk), sub: "Pending amounts on stale patients", kind: "bad" },
                  ...rules.map((r) => ({ label: r.label, value: num(r.count), sub: r.error ? "Data unavailable" : "Flagged", kind: r.error ? "neutral" : "warn" })),
                ]}
              />

              {rules.map((rule) => (
                <Card
                  key={rule.key}
                  title={rule.label}
                  subtitle={loading ? "Loading…" : `${rule.description}${rule.valueAtRisk ? ` · ${rupee(rule.valueAtRisk)} at risk` : ""}`}
                  actions={<AttentionRamp level={RULE_LEVEL[rule.key] || 2} label={rule.key === "surgeryBookedStale" ? "Critical" : "Attention"} />}
                >
                  {rule.error && <InlineNotice kind="error" title="Couldn't load this rule's data">{rule.error}</InlineNotice>}
                  <DataTable
                    tall={rule.items.length > 8}
                    loading={loading}
                    emptyMessage={<EmptyState icon="✓" title={rule.error ? "Unavailable" : "None flagged"} hint={rule.error ? "Try refreshing." : "Nothing meets this rule's threshold right now."} />}
                    onRowClick={rule.drillHref ? () => router.push(rule.drillHref) : undefined}
                    columns={
                      rule.key === "poorPerformers"
                        ? [
                            { key: "name", label: "Employee" },
                            { key: "role", label: "Role" },
                            { key: "branch", label: "Branch" },
                            { key: "score", label: "Score", align: "right" },
                          ]
                        : rule.items[0]?.pendingAmount !== undefined
                          ? [
                              { key: "name", label: "Patient" },
                              { key: "phone", label: "Phone" },
                              { key: "branch", label: "Branch" },
                              { key: "pendingAmount", label: "Pending", align: "right", render: (r) => rupee(r.pendingAmount) },
                              ageCol,
                            ]
                          : [
                              { key: "name", label: "Lead" },
                              { key: "phone", label: "Phone" },
                              { key: "agent", label: "Agent" },
                              ageCol,
                            ]
                    }
                    rows={loading ? [] : rule.items}
                  />
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
