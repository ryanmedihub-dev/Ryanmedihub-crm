import SanyaUsage from "@/models/SanyaUsage";
import { OPENAI_TOOL_DEFS, runTool } from "./tools";
import { assertRequestBodyClean, PIIError } from "./pii";
import {
  SANYA_MODEL, SANYA_MONTHLY_BUDGET_USD, SANYA_RATE_LIMIT, SANYA_MAX_TOOL_ROUNDS, SANYA_MAX_HISTORY_TURNS,
  SANYA_MAX_OUTPUT_TOKENS, SANYA_MAX_QUESTION_CHARS, REFUSAL_PHRASE, SANYA_LOG_PAYLOADS, costUsd,
} from "./config";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function istToday() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function systemPrompt() {
  const today = istToday();
  return `You are Sanya, the Owner-panel assistant for Ryan Clinic (hair transplant; branches Delhi, Mumbai, Hyderabad, Noida plus collab cities).

Today's date (IST) is ${today}.

You answer ONLY from the results of the tools you call in this conversation. Rules:
1. Every figure you state must come from a tool result in this conversation. Never estimate, extrapolate, or "roughly" anything. If no tool covers what was asked, or the tool result doesn't contain it, reply starting with the exact words "${REFUSAL_PHRASE}" and say what you would need. A guessed number is worse than no answer.
2. Every answer that contains a number must end with a "Verify:" line linking the page(s) where those numbers can be checked — use the verifyAt link(s) from the tool results, written as markdown links, e.g. [Patients overview](/owner/patients?range=Custom&from=...&to=...).
3. Resolve relative periods to explicit dates before calling a tool: "today" = ${today}; "this month" = the 1st of this month to today; "last month" = the whole previous calendar month; "this week" starts Monday. State the resolved dates in the answer.
4. You cannot look up individual patients, leads or employees — tools are aggregate only. If asked about a person, say so and point to the relevant page.
5. Currency is INR: format as ₹12,34,567 (Indian grouping). Percentages to one decimal.
6. Reply in the language the owner writes in (English / Hindi / Hinglish). Be direct: lead with the number, then the breakdown, no filler.
7. If a tool result contains a dataError, say that part of the data was unavailable rather than answering around it.`;
}

async function monthToDateSpend() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await SanyaUsage.aggregate([
    { $match: { createdAt: { $gte: start } } },
    { $group: { _id: null, cost: { $sum: "$costUsd" } } },
  ]);
  return row?.cost || 0;
}

async function turnsInWindow(userEmail) {
  return SanyaUsage.countDocuments({ userEmail, createdAt: { $gte: new Date(Date.now() - SANYA_RATE_LIMIT.windowMs) } });
}

async function openai(body, { signal } = {}) {
  assertRequestBodyClean(body); 
  if (SANYA_LOG_PAYLOADS) console.log("[sanya] outgoing payload:\n" + JSON.stringify(body, null, 2));
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

export async function runSanyaTurn({ user, messages, emit, signal }) {
  const startedAt = Date.now();
  const log = {
    userEmail: user.email, userRole: user.role, model: SANYA_MODEL,
    questionChars: 0, answerChars: 0, historyTurns: 0, toolCalls: [], modelRounds: 0,
    promptTokens: 0, completionTokens: 0, costUsd: 0, latencyMs: 0, refused: false, outcome: "ok", errorMessage: null,
  };
  const finish = async (outcome, errorMessage) => {
    log.outcome = outcome;
    log.errorMessage = errorMessage || null;
    log.latencyMs = Date.now() - startedAt;
    log.costUsd = costUsd(SANYA_MODEL, log.promptTokens, log.completionTokens);
    try {
      await SanyaUsage.create(log);
    } catch (err) {
      console.error("[sanya] usage log failed:", err?.message);
    }
  };

  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    
    const history = (Array.isArray(messages) ? messages : [])
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, SANYA_MAX_QUESTION_CHARS) }))
      .slice(-(SANYA_MAX_HISTORY_TURNS + 1));
    const last = history[history.length - 1];
    if (!last || last.role !== "user") throw new Error("The last message must be from the user");
    log.questionChars = last.content.length;
    log.historyTurns = history.length - 1;

    
    const turns = await turnsInWindow(user.email);
    if (turns >= SANYA_RATE_LIMIT.turns) {
      const msg = `Rate limit: ${SANYA_RATE_LIMIT.turns} questions per ${SANYA_RATE_LIMIT.windowMs / 60000} minutes. Try again shortly.`;
      emit({ type: "error", message: msg, code: "rate_limited" });
      await finish("rate_limited", msg);
      return;
    }
    const spend = await monthToDateSpend();
    if (spend >= SANYA_MONTHLY_BUDGET_USD) {
      const msg = `Monthly cost ceiling reached ($${spend.toFixed(2)} of $${SANYA_MONTHLY_BUDGET_USD}). Sanya is paused until the 1st; raise SANYA_MONTHLY_BUDGET_USD to continue.`;
      emit({ type: "error", message: msg, code: "budget_exceeded" });
      await finish("budget_exceeded", msg);
      return;
    }

    
    
    
    
    
    
    const convo = [{ role: "system", content: systemPrompt() }, ...history];
    const verify = [];
    let answer = "";
    let rounds = 0;

    for (;;) {
      if (rounds >= SANYA_MAX_TOOL_ROUNDS) {
        
        
        rounds += 1;
        log.modelRounds += 1;
        const res = await openai({
          model: SANYA_MODEL, messages: convo, max_tokens: SANYA_MAX_OUTPUT_TOKENS, temperature: 0.2,
          stream: true, stream_options: { include_usage: true },
        }, { signal });
        const out = await pumpStream(res, (text) => emit({ type: "delta", text }), (u) => addUsage(log, u));
        answer = out.text;
        break;
      }
      rounds += 1;
      log.modelRounds += 1;
      const res = await openai({
        model: SANYA_MODEL, messages: convo, tools: OPENAI_TOOL_DEFS, tool_choice: "auto",
        max_tokens: SANYA_MAX_OUTPUT_TOKENS, temperature: 0.2,
        stream: true, stream_options: { include_usage: true },
      }, { signal });
      const out = await pumpStream(res, (text) => emit({ type: "delta", text }), (u) => addUsage(log, u));

      if (!out.toolCalls.length) {
        answer = out.text;
        break;
      }

      convo.push({ role: "assistant", content: out.text || null, tool_calls: out.toolCalls });
      for (const call of out.toolCalls) {
        const name = call.function?.name;
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }
        const t0 = Date.now();
        let content;
        try {
          const result = await runTool(name, args);
          verify.push(result.verifyAt);
          content = JSON.stringify({ ...result.data, verifyAt: result.verifyAt });
          log.toolCalls.push({ name, args, ms: Date.now() - t0, ok: true, error: null });
          emit({ type: "tool", name, args, verifyAt: result.verifyAt, ms: Date.now() - t0, ok: true });
        } catch (err) {
          if (err instanceof PIIError) throw err; 
          const message = err?.message || "tool failed";
          content = JSON.stringify({ error: message });
          log.toolCalls.push({ name, args, ms: Date.now() - t0, ok: false, error: message });
          emit({ type: "tool", name, args, ms: Date.now() - t0, ok: false, error: message });
        }
        convo.push({ role: "tool", tool_call_id: call.id, name, content });
      }
    }

    log.answerChars = answer.length;
    log.refused = answer.trim().toLowerCase().startsWith(REFUSAL_PHRASE.toLowerCase());
    await finish("ok");
    emit({
      type: "done",
      verify: dedupeVerify(verify),
      usage: { promptTokens: log.promptTokens, completionTokens: log.completionTokens, costUsd: log.costUsd, latencyMs: log.latencyMs, toolCalls: log.toolCalls.length, model: SANYA_MODEL },
      refused: log.refused,
    });
  } catch (err) {
    const pii = err instanceof PIIError;
    const message = pii
      ? "Blocked: a tool result contained something that looked personal, so nothing was sent to the model. This is logged."
      : err?.name === "AbortError" ? "Cancelled." : err?.message || "Sanya failed";
    console.error("[sanya] turn error:", err);
    emit({ type: "error", message, code: pii ? "pii_blocked" : "error" });
    await finish(pii ? "pii_blocked" : "error", err?.message);
  }
}

function addUsage(log, usage) {
  log.promptTokens += usage?.prompt_tokens || 0;
  log.completionTokens += usage?.completion_tokens || 0;
}

async function pumpStream(res, onDelta, onUsage) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.usage) onUsage(json.usage);
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        text += delta.content;
        onDelta(delta.content);
      }
      for (const tc of delta.tool_calls || []) {
        const i = tc.index ?? 0;
        calls[i] ||= { id: "", type: "function", function: { name: "", arguments: "" } };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  return { text, toolCalls: calls.filter(Boolean) };
}

function dedupeVerify(list) {
  const seen = new Set();
  return list.filter((v) => v && !seen.has(v.href) && seen.add(v.href));
}
