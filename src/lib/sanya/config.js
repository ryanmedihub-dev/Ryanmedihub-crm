// Sanya (Owner panel assistant) knobs. Everything that costs money or bounds
// behaviour is here, env-overridable, and read by both the route and
// /owner/ai/health.

export const SANYA_MODEL = process.env.SANYA_MODEL || "gpt-4o";

// USD per 1M tokens (input, output). Used to compute costUsd per turn and to
// enforce the monthly ceiling. Unknown model → priced as gpt-4o so the ceiling
// still bites rather than silently reading zero.
export const MODEL_PRICING_USD_PER_M = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};
export function costUsd(model, promptTokens, completionTokens) {
  const p = MODEL_PRICING_USD_PER_M[model] || MODEL_PRICING_USD_PER_M["gpt-4o"];
  return ((promptTokens || 0) * p.input + (completionTokens || 0) * p.output) / 1_000_000;
}

// Hard monthly cost ceiling across ALL owner users. When month-to-date spend
// (from SanyaUsage) reaches this, the assistant refuses with a clear message
// until the 1st. Default is deliberately small; raise it in env once real
// usage is known from /owner/ai/health.
export const SANYA_MONTHLY_BUDGET_USD = Number(process.env.SANYA_MONTHLY_BUDGET_USD || 25);

// Per-user rate limit (turns per window), counted from SanyaUsage so it holds
// across serverless instances.
export const SANYA_RATE_LIMIT = { turns: Number(process.env.SANYA_RATE_LIMIT_TURNS || 20), windowMs: 10 * 60 * 1000 };

// Bounds on one turn.
export const SANYA_MAX_TOOL_ROUNDS = 4; // model → tools → model … at most this many tool rounds
export const SANYA_MAX_HISTORY_TURNS = 12; // prior user/assistant messages replayed
export const SANYA_MAX_OUTPUT_TOKENS = 900;
export const SANYA_MAX_QUESTION_CHARS = 2000;

// The assistant's fixed refusal phrase. The system prompt requires it verbatim
// when the tools can't answer; the route detects it to log `refused`.
export const REFUSAL_PHRASE = "I don't have that data";

// Print every outgoing OpenAI request body (tool results included) to the
// server log — for reading a real payload by eye. Off unless set.
export const SANYA_LOG_PAYLOADS = process.env.SANYA_LOG_PAYLOADS === "1";
