import { SectionLanding } from "@/components/owner";

export default function AiLanding() {
  return (
    <SectionLanding
      title="AI"
      subtitle="What each page does and what data it uses — no page here claims more certainty than the data supports"
      items={[
        {
          href: "/owner/ai/attendance",
          label: "Attendance",
          note: "Call activity per employee + a manual, human-confirmed Attendance record. Not automatic — see the page for why.",
          ready: true,
        },
        {
          href: "/owner/ai/attention",
          label: "Attention",
          note: "Threshold rules over data you already have — overdue follow-ups, stale interested leads, stalled bookings, poor performers. No AI.",
          ready: true,
        },
        {
          href: "/owner/ai/suggestions",
          label: "Suggestions",
          note: "Evidence-first observations from the same aggregates, each with the numbers behind it. Rules-based, not an LLM — by design (deferred).",
          ready: true,
        },
        {
          href: "/owner/ai/sanya",
          label: "Sanya Assistant",
          note: "Deferred — the largest, least-certain item in this series. Shipping the rest first.",
        },
        { href: "/owner/ai/health", label: "AI Health & Audit", note: "Coming later" },
        { href: "/owner/ai/clinical-quality", label: "Clinical AI Quality", note: "Coming later" },
      ]}
    />
  );
}
