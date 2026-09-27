import { fetchCallby, CallbyError } from "@/lib/callby";

const CHUNK = 1000; 

export async function syncCampaignSource({ phones, label, ref, dryRun = false }) {
  const unique = [...new Set(phones.filter(Boolean))];
  const totals = { matched: 0, updated: 0, alreadySet: 0, unmatched: 0, wouldUpdate: 0 };
  let failedChunks = 0;
  let lastError = null;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const res = await fetchCallby("/api/leads/source-update", {
        method: "POST",
        body: { phones: chunk, source: label, dryRun, ref },
      });
      const d = res?.data || {};
      totals.matched     += d.matched     || 0;
      totals.updated     += d.updated     || 0;
      totals.alreadySet  += d.alreadySet  || 0;
      totals.unmatched   += d.unmatched   || 0;
      totals.wouldUpdate += d.wouldUpdate || 0;
    } catch (err) {
      failedChunks += 1;
      lastError = err instanceof CallbyError ? err.message : "Could not reach callby";
    }
  }

  const chunks = Math.ceil(unique.length / CHUNK) || 0;
  const status = failedChunks === 0 ? "done" : failedChunks === chunks ? "failed" : "partial";
  return { status, label, ...totals, error: lastError, syncedAt: new Date() };
}
