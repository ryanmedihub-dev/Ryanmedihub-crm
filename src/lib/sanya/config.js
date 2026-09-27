

export const SANYA_MODEL = process.env.SANYA_MODEL || "gpt-4o";

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

export const SANYA_MONTHLY_BUDGET_USD = Number(process.env.SANYA_MONTHLY_BUDGET_USD || 25);

export const SANYA_RATE_LIMIT = { turns: Number(process.env.SANYA_RATE_LIMIT_TURNS || 20), windowMs: 10 * 60 * 1000 };

export const SANYA_MAX_TOOL_ROUNDS = 4; 
export const SANYA_MAX_HISTORY_TURNS = 12; 
export const SANYA_MAX_OUTPUT_TOKENS = 900;
export const SANYA_MAX_QUESTION_CHARS = 2000;

export const REFUSAL_PHRASE = "I don't have that data";

export const SANYA_LOG_PAYLOADS = process.env.SANYA_LOG_PAYLOADS === "1";
