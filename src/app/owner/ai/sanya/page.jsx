import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function SanyaAssistantPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Sanya Assistant" subtitle="Deferred — the largest, least-certain item in this series" />
        <div className="content">
          <ComingSoon
            icon="◆"
            title="Deliberately deferred"
            message={
              "A tool-calling chat assistant belongs here — fixed, read-only, parameterized tools over the Employees/Calls/Leads/Patients/Marketing aggregations, the model never touching the database or seeing PII directly, owner-role only, always able to say \"I don't have that data\" instead of guessing. Building it well needs a model choice, whose API key to use, and a monthly cost ceiling settled first — those were deferred in favor of shipping Attendance, Attention, and Suggestions. The existing /saniya assistant still runs; it was locked down to owner/super-admin and stripped of the patient/lead/team PII it used to send to the model as part of this same round of work, but it is not this tool and was not rebuilt on this architecture."
            }
          />
        </div>
      </div>
    </div>
  );
}
