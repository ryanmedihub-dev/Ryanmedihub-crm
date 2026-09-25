// Owner "AI Everywhere" engine knobs. Sibling to src/lib/sanya/config.js —
// same shape, separate budget/rate-limit so the two features never fight
// each other's ceiling. Everything that costs money or bounds behaviour is
// here, env-overridable, and read by both the engine and /owner/ai/health.

export const AI_ENABLED = process.env.AI_ENABLED !== "0";
export const AI_BRIEF_MODEL = process.env.AI_BRIEF_MODEL || "gpt-4o-mini";
export const AI_DEEP_MODEL = process.env.AI_DEEP_MODEL || "gpt-4o";
export const AI_MONTHLY_BUDGET_USD = Number(process.env.AI_MONTHLY_BUDGET_USD || 40);
export const AI_OUTPUT_LANGUAGE = process.env.AI_OUTPUT_LANGUAGE === "hinglish" ? "hinglish" : "english";
export const AI_LOG_PAYLOADS = process.env.AI_LOG_PAYLOADS === "1";
export const AI_TIMEOUT_MS = 30_000;
export const AI_MAX_OUTPUT_TOKENS = { brief: 900, verdicts: 1400, deep: 1400 };
export const AI_MAX_PAYLOAD_CHARS = 24_000; // facts JSON hard cap; compute() must aggregate below this
export const AI_VERDICT_MAX_ROWS = 50;
export const AI_DEFAULT_TTL_MIN = { brief: 60, verdicts: 60, deep: 180 };
export const AI_RATE_LIMIT = { runs: 120, windowMs: 10 * 60 * 1000 }; // per user, counted from AiRun (cache hits excluded)
export { costUsd, MODEL_PRICING_USD_PER_M } from "@/lib/sanya/config";
