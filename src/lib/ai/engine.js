import AiRun from "@/models/AiRun";
import AiInsight from "@/models/AiInsight";
import { getFeature } from "./features";
import { createAliasBook } from "./alias";
import { fingerprint } from "./fingerprint";
import { OWNER_LINKS, isAllowedLink } from "./links";
import { BUSINESS_CONTEXT } from "./context";
import { SCHEMAS, validate } from "./schemas";
import { checkGrounding } from "./grounding";
import { streamStructured, completeStructured, PIIError } from "./openai";
import { capPayload } from "./features/_helpers";
import {
  AI_ENABLED, AI_MONTHLY_BUDGET_USD, AI_RATE_LIMIT, AI_DEFAULT_TTL_MIN,
  AI_MAX_OUTPUT_TOKENS, AI_OUTPUT_LANGUAGE, costUsd,
} from "./config";

// The Owner "AI Everywhere" engine: guard -> scope -> collect -> compute ->
// cache check -> budget/rate -> analyze (OpenAI) -> verify -> persist. Every
// stage emitted here is real work that happened, never a fake timer — the UI
// pipeline animation is driven 1:1 by these events. Every exit path writes
// exactly one AiRun.

async function monthToDateSpend() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await AiRun.aggregate([
    { $match: { createdAt: { $gte: start } } },
    { $group: { _id: null, cost: { $sum: "$costUsd" } } },
  ]);
  return row?.cost || 0;
}

async function runsInWindow(userEmail) {
  return AiRun.countDocuments({
    userEmail,
    cache: { $ne: "HIT" },
    createdAt: { $gte: new Date(Date.now() - AI_RATE_LIMIT.windowMs) },
  });
}

function whitelistScope(rawScope, scopeParams) {
  const out = {};
  for (const k of scopeParams) {
    const v = rawScope?.[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

function systemPrompt(feature, kind) {
  const allowed = OWNER_LINKS.filter((l) => l === "/owner/dashboard" || l.startsWith(feature.page));
  const language = AI_OUTPUT_LANGUAGE === "hinglish" ? "natural Hinglish in Roman script" : "English";
  return `You are the Owner Intelligence engine for Ryan Clinic's CRM. You analyse ONE page of the owner panel: "${feature.title}".
${BUSINESS_CONTEXT}
Rules:
1. Use ONLY the FACTS JSON. Every number you write must appear in FACTS (you may round or format it). Never estimate, extrapolate or invent.
2. Refer to people/teams/campaigns ONLY by their alias (E07, T02, C05). Never invent names.
3. If FACTS has dataErrors, truncated:true, or zero-sample groups, say so in dataGaps and lower confidence.
4. Compare against prev (previous period) and cohort values when present. Name the driver, not just the change.
5. Actions must be concrete and doable this week by the owner or a manager. link must be one of ALLOWED_LINKS or "".
6. No medical advice. No judgments on protected traits. Judge work output only.
7. Language: ${language}. Crisp, executive tone. No filler, no emojis.
Page focus: ${feature.focus?.[kind] || ""}
ALLOWED_LINKS: ${JSON.stringify(allowed)}`;
}

function userPrompt(feature, scope, facts) {
  const { search, ...safeScope } = scope; // never send free-text search to the model
  return JSON.stringify({ page: feature.title, scope: safeScope, facts });
}

function dropDisallowedLinks(output) {
  if (Array.isArray(output?.actions)) {
    for (const a of output.actions) if (a.link && !isAllowedLink(a.link)) a.link = "";
  }
  return output;
}

async function logRun(base) {
  try {
    await AiRun.create(base);
  } catch (err) {
    console.error("[ai] run log failed:", err?.message);
  }
}

export async function runInsight({ featureKey, kind, rawScope, session, force = false, emit = () => {}, signal }) {
  const startedAt = Date.now();
  const stageMs = { collect: 0, compute: 0, analyze: 0, verify: 0 };
  const userEmail = session?.user?.email || "unknown";
  const base = { feature: featureKey, kind, userEmail, cache: force ? "FORCED" : "MISS" };

  // 1. guard --------------------------------------------------------------
  const feature = getFeature(featureKey);
  if (!AI_ENABLED) {
    emit({ type: "status", status: "disabled" });
    await logRun({ ...base, outcome: "disabled", stageMs, latencyMs: Date.now() - startedAt });
    return;
  }
  if (!feature || !feature.kinds?.includes(kind)) {
    emit({ type: "error", code: "unconfigured", message: `Unknown feature/kind: ${featureKey}/${kind}` });
    await logRun({ ...base, outcome: "unconfigured", stageMs, latencyMs: Date.now() - startedAt, errorMessage: "unknown feature/kind" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    emit({ type: "status", status: "unconfigured" });
    await logRun({ ...base, outcome: "unconfigured", stageMs, latencyMs: Date.now() - startedAt, errorMessage: "OPENAI_API_KEY missing" });
    return;
  }

  // 2. scope ----------------------------------------------------------------
  const scope = whitelistScope(rawScope, feature.scopeParams || []);
  const scopeKey = fingerprint(scope);
  base.scopeKey = scopeKey;
  const model = feature.model?.[kind];
  base.model = model;
  const insightKey = `${featureKey}|${kind}|${scopeKey}`;

  let raw, facts, rowsAnalyzed, book;
  try {
    // 3. collect --------------------------------------------------------------
    emit({ type: "stage", stage: "collect", state: "start" });
    const t0 = Date.now();
    raw = await feature.collect(scope, { session, signal }, kind);
    stageMs.collect = Date.now() - t0;
    emit({ type: "stage", stage: "collect", state: "done", ms: stageMs.collect });

    // 4. compute ----------------------------------------------------------------
    emit({ type: "stage", stage: "compute", state: "start" });
    const t1 = Date.now();
    book = createAliasBook();
    ({ facts, rowsAnalyzed } = feature.compute(raw, book, scope, kind));
    facts = capPayload(facts);
    stageMs.compute = Date.now() - t1;
    emit({ type: "stage", stage: "compute", state: "done", ms: stageMs.compute });
  } catch (err) {
    emit({ type: "error", code: "source_error", message: err?.message || "Source failed" });
    await logRun({ ...base, outcome: "source_error", stageMs, latencyMs: Date.now() - startedAt, errorMessage: err?.message?.slice(0, 300) });
    return;
  }

  const fp = fingerprint(facts);
  const payloadChars = JSON.stringify(facts).length;

  // 5. cache ------------------------------------------------------------------
  if (!force) {
    const cached = await AiInsight.findOne({ key: insightKey }).lean();
    if (cached && cached.expiresAt > new Date() && cached.fingerprint === fp) {
      emit({
        type: "done", cached: true, generatedAt: cached.generatedAt, output: cached.output,
        entities: cached.entities, facts: cached.facts, grounding: cached.grounding,
        meta: { model: cached.model, generatedAt: cached.generatedAt },
      });
      await logRun({ ...base, cache: "HIT", outcome: "ok", stageMs, latencyMs: Date.now() - startedAt, payloadChars, rowsAnalyzed, grounded: cached.grounding?.grounded ?? null });
      return;
    }
  }

  // 6. budget + rate ------------------------------------------------------------
  const spend = await monthToDateSpend();
  if (spend >= AI_MONTHLY_BUDGET_USD) {
    const stale = await AiInsight.findOne({ key: insightKey }).lean();
    if (stale) {
      emit({
        type: "done", cached: true, stale: true, status: "budget_exceeded", generatedAt: stale.generatedAt,
        output: stale.output, entities: stale.entities, facts: stale.facts, grounding: stale.grounding,
        meta: { model: stale.model, generatedAt: stale.generatedAt },
      });
    } else {
      emit({ type: "status", status: "budget_exceeded" });
    }
    await logRun({ ...base, outcome: "budget_exceeded", stageMs, latencyMs: Date.now() - startedAt, payloadChars, rowsAnalyzed });
    return;
  }
  const runsSoFar = await runsInWindow(userEmail);
  if (runsSoFar >= AI_RATE_LIMIT.runs) {
    emit({ type: "status", status: "rate_limited" });
    await logRun({ ...base, outcome: "rate_limited", stageMs, latencyMs: Date.now() - startedAt, payloadChars, rowsAnalyzed });
    return;
  }

  // 7. analyze ------------------------------------------------------------------
  const system = systemPrompt(feature, kind);
  const user = userPrompt(feature, scope, facts);
  const schemaName = `owner_ai_${kind}`;
  const maxTokens = AI_MAX_OUTPUT_TOKENS[kind];

  let text, promptTokens = 0, completionTokens = 0;
  try {
    emit({ type: "stage", stage: "analyze", state: "start" });
    const t2 = Date.now();
    if (kind === "verdicts") {
      const out = await completeStructured({ model, system, user, schemaName, schema: SCHEMAS[kind], maxTokens, signal });
      text = out.text; promptTokens = out.promptTokens; completionTokens = out.completionTokens;
    } else {
      const out = await streamStructured({
        model, system, user, schemaName, schema: SCHEMAS[kind], maxTokens, signal,
        onDelta: (t) => emit({ type: "delta", text: t }),
      });
      text = out.text; promptTokens = out.promptTokens; completionTokens = out.completionTokens;
    }
    stageMs.analyze = Date.now() - t2;
    emit({ type: "stage", stage: "analyze", state: "done", ms: stageMs.analyze, promptTokens, completionTokens });
  } catch (err) {
    const pii = err instanceof PIIError;
    const timeout = err?.name === "AbortError";
    const outcome = pii ? "pii_blocked" : timeout ? "timeout" : "error";
    emit({ type: "error", code: outcome, message: pii ? "Blocked: the outgoing payload looked like it contained personal data." : (err?.message || "AI request failed") });
    await logRun({ ...base, outcome, stageMs, latencyMs: Date.now() - startedAt, payloadChars, rowsAnalyzed, errorMessage: err?.message?.slice(0, 300) });
    return;
  }

  // 8. verify ------------------------------------------------------------------
  emit({ type: "stage", stage: "verify", state: "start" });
  const t3 = Date.now();
  let parsed, cleaned;
  try {
    parsed = JSON.parse(text);
    cleaned = validate(kind, parsed);
  } catch (err) {
    // one automatic retry, non-streamed, before giving up
    try {
      const retry = await completeStructured({ model, system, user, schemaName, schema: SCHEMAS[kind], maxTokens, signal });
      promptTokens += retry.promptTokens; completionTokens += retry.completionTokens;
      parsed = JSON.parse(retry.text);
      cleaned = validate(kind, parsed);
    } catch (err2) {
      emit({ type: "error", code: "schema_invalid", message: "AI response did not match the expected shape." });
      await logRun({ ...base, outcome: "schema_invalid", stageMs, latencyMs: Date.now() - startedAt, promptTokens, completionTokens, costUsd: costUsd(model, promptTokens, completionTokens), payloadChars, rowsAnalyzed, errorMessage: err2?.message?.slice(0, 300) });
      return;
    }
  }
  cleaned = dropDisallowedLinks(cleaned);
  const grounding = checkGrounding(cleaned, facts);
  const rehydrated = book.rehydrate(cleaned);
  const entities = Object.fromEntries(book.entities().map((e) => [e.alias, e]));
  stageMs.verify = Date.now() - t3;
  emit({ type: "stage", stage: "verify", state: "done", ms: stageMs.verify, grounding });

  // 9. persist ------------------------------------------------------------------
  const generatedAt = new Date();
  const ttlMin = feature.ttlMin?.[kind] ?? AI_DEFAULT_TTL_MIN[kind];
  const expiresAt = new Date(generatedAt.getTime() + ttlMin * 60_000);
  const cost = costUsd(model, promptTokens, completionTokens);

  await AiInsight.findOneAndUpdate(
    { key: insightKey },
    { key: insightKey, feature: featureKey, kind, scope, fingerprint: fp, output: rehydrated, entities, facts, model, generatedAt, expiresAt, grounding },
    { upsert: true },
  );

  const latencyMs = Date.now() - startedAt;
  await logRun({
    ...base, outcome: "ok", stageMs, latencyMs, promptTokens, completionTokens, costUsd: cost,
    payloadChars, rowsAnalyzed, grounded: grounding.grounded, ungroundedCount: grounding.ungrounded.length, confidence: rehydrated.confidence || null,
  });

  emit({
    type: "done", cached: false, output: rehydrated, entities, facts, grounding,
    meta: { model, latencyMs, promptTokens, completionTokens, costUsd: cost, stageMs, generatedAt },
  });
}
