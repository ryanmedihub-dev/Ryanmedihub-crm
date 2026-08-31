import { redirect } from "next/navigation";

// "Retry & Recovery" folded into Live Workforce & Queue — the P0–P4 lanes there
// drill into the full retry-queue table.
export default function RetryRedirect() {
  redirect("/owner/live-workforce");
}
