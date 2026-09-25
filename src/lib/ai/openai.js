import { assertNoPII, PIIError } from "@/lib/sanya/pii";
import { AI_LOG_PAYLOADS, AI_TIMEOUT_MS } from "./config";

// Plain fetch to chat/completions, same pattern as src/lib/sanya/engine.js —
// no SDK. Structured output via response_format: json_schema (strict).

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function buildBody({ model, system, user, schemaName, schema, maxTokens, stream }) {
  return {
    model,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    temperature: 0.3,
    max_tokens: maxTokens,
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

// Aborting with no reason (or a DOMException) keeps err.name === "AbortError" on the
// rejected fetch, which engine.js relies on to tell a timeout apart from a client
// disconnect — passing a plain Error as the reason would rename it and break that check.
function combineSignals(signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function callOpenAI(body, signal) {
  // `user` content IS the facts JSON sent to OpenAI — the one place it must
  // pass the PII guard. Fails closed: throws PIIError, request never sent.
  assertNoPII(JSON.parse(body.messages[1].content));
  if (AI_LOG_PAYLOADS) console.log("[ai] outgoing payload:\n" + JSON.stringify(body, null, 2));
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

/**
 * Streamed structured completion. onDelta(textChunk) fires as JSON text
 * arrives. Returns { text, promptTokens, completionTokens }.
 */
export async function streamStructured({ model, system, user, schemaName, schema, maxTokens, signal, onDelta }) {
  const combined = combineSignals(signal);
  try {
    const body = buildBody({ model, system, user, schemaName, schema, maxTokens, stream: true });
    const res = await callOpenAI(body, combined.signal);
    return await pumpStream(res, onDelta);
  } finally {
    combined.cleanup();
  }
}

/** Non-stream variant, same contract — used for the verdicts route and the one automatic retry on schema_invalid. */
export async function completeStructured({ model, system, user, schemaName, schema, maxTokens, signal }) {
  const combined = combineSignals(signal);
  try {
    const body = buildBody({ model, system, user, schemaName, schema, maxTokens, stream: false });
    const res = await callOpenAI(body, combined.signal);
    const json = await res.json();
    const usage = json.usage || {};
    return {
      text: json.choices?.[0]?.message?.content || "",
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
    };
  } finally {
    combined.cleanup();
  }
}

async function pumpStream(res, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let promptTokens = 0;
  let completionTokens = 0;
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
      if (json.usage) {
        promptTokens += json.usage.prompt_tokens || 0;
        completionTokens += json.usage.completion_tokens || 0;
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onDelta?.(delta);
      }
    }
  }
  return { text, promptTokens, completionTokens };
}

export { PIIError };
