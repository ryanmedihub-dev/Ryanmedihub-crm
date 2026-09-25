"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, Badge, InlineNotice } from "@/components/owner";
import AiOrb from "@/components/owner/ai/AiOrb";
import { useOwnerData } from "@/lib/owner/useOwnerData";

// Sanya — tool-calling assistant over the Owner panel's own aggregations.
// Everything shown here is generated; every number links to the page it can
// be verified on (the "Verify" chips come from the tools the model called,
// so they appear even if the model forgets to cite them). History is
// in-session only (React state) — nothing is stored client-side.

const STARTERS = [
  "How many patients did we get this month, by status?",
  "Revenue, expense and profit per branch for last month",
  "What needs attention right now?",
  "How are the Agents doing this month?",
  "Lead funnel for the last 7 days",
  "Which marketing platform has the best ROAS this month?",
];

// A tool event's `name` back into a short human label for the chip — same
// de-snake-casing the "What Sanya can look up" card already does.
function toolLabel(name) {
  return String(name || "").replace(/^get_/, "").replace(/_/g, " ");
}

function fmtDateArg(a) {
  if (!a) return "";
  const parts = [];
  if (a.section) parts.push(a.section);
  if (a.dateFrom) parts.push(a.dateFrom === a.dateTo ? a.dateFrom : `${a.dateFrom} → ${a.dateTo}`);
  if (a.branch && a.branch !== "All") parts.push(a.branch);
  if (typeof a.isactive === "boolean") parts.push(a.isactive ? "active" : "inactive");
  return parts.join(" · ");
}

// Minimal markdown: paragraphs, **bold**, bullet lines, [text](href) links.
function renderMarkdown(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let list = null;
  const flush = () => {
    if (list) {
      out.push(<ul key={`ul-${out.length}`} style={{ margin: "4px 0 8px", paddingLeft: 20 }}>{list}</ul>);
      list = null;
    }
  };
  const inline = (s, k) => {
    const nodes = [];
    const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let m;
    let i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) nodes.push(s.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) nodes.push(<strong key={`${k}-b${i++}`}>{tok.slice(2, -2)}</strong>);
      else {
        const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
        const href = mm[2];
        nodes.push(
          href.startsWith("/") ? (
            <Link key={`${k}-l${i++}`} href={href}>{mm[1]}</Link>
          ) : (
            <span key={`${k}-l${i++}`}>{mm[1]}</span>
          ),
        );
      }
      last = m.index + tok.length;
    }
    if (last < s.length) nodes.push(s.slice(last));
    return nodes;
  };
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (/^[-*•]\s+/.test(t)) {
      list ||= [];
      list.push(<li key={`li-${idx}`}>{inline(t.replace(/^[-*•]\s+/, ""), idx)}</li>);
      return;
    }
    flush();
    if (!t) return;
    out.push(<p key={`p-${idx}`} style={{ margin: "0 0 8px" }}>{inline(t, idx)}</p>);
  });
  flush();
  return out;
}

export default function SanyaAssistantPage() {
  const { data: meta } = useOwnerData("/api/owner/ai/sanya");
  const [messages, setMessages] = useState([]); // { role, content, tools:[], verify:[], usage, error, streaming }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = useCallback(
    async (text) => {
      const q = (text ?? input).trim();
      if (!q || busy) return;
      setInput("");
      setBusy(true);

      const history = messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.content && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const userMsg = { role: "user", content: q };
      const draft = { role: "assistant", content: "", tools: [], verify: [], usage: null, error: null, streaming: true };
      setMessages((prev) => [...prev, userMsg, draft]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn) =>
        setMessages((prev) => {
          const next = [...prev];
          const last = { ...next[next.length - 1] };
          fn(last);
          next[next.length - 1] = last;
          return next;
        });

      try {
        const res = await fetch("/api/owner/ai/sanya", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...history, userMsg] }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.message) msg = j.message;
          } catch {
            /* not JSON */
          }
          patch((m) => { m.error = msg; m.streaming = false; });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            let ev;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === "delta") patch((m) => { m.content += ev.text; });
            else if (ev.type === "tool") patch((m) => { m.tools = [...m.tools, ev]; });
            else if (ev.type === "done") patch((m) => { m.verify = ev.verify || []; m.usage = ev.usage; m.refused = ev.refused; m.streaming = false; });
            else if (ev.type === "error") patch((m) => { m.error = ev.message; m.errorCode = ev.code; m.streaming = false; });
          }
        }
        patch((m) => { m.streaming = false; });
      } catch (err) {
        patch((m) => { m.error = err?.name === "AbortError" ? "Stopped." : err?.message || "Network error"; m.streaming = false; });
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [input, busy, messages],
  );

  const stop = () => abortRef.current?.abort();
  const clear = () => { if (!busy) setMessages([]); };

  // Prefill + auto-send once from a "?q=" (AiCommandBar's "Ask Sanya" hands
  // off here). Guarded by a ref, not state, so React's dev-mode double-invoke
  // of effects can never send the question twice.
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoSentRef = useRef(false);
  useEffect(() => {
    const q = searchParams.get("q");
    if (!q || autoSentRef.current) return;
    autoSentRef.current = true;
    setInput(q);
    send(q);
    router.replace("/owner/ai/sanya");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Sanya"
          subtitle="Asks the Owner panel's own numbers — every figure links to the page it came from"
          controls={
            <button className="btn" onClick={clear} disabled={busy || !messages.length} title="Start a new conversation">
              New chat
            </button>
          }
        />

        <div className="content">
          <InlineNotice kind="info" title="Generated by AI — verify before acting">
            Sanya answers only from a fixed set of read-only tools over the same aggregations the Owner pages use
            (model: <code>{meta?.model || "…"}</code>). It never sees the database or any patient/employee name or
            phone. When the tools can&apos;t answer, it says &quot;I don&apos;t have that data&quot; instead of guessing.
            {meta && (
              <span className="muted"> Limits: {meta.rateLimit.turns} questions / {meta.rateLimit.windowMs / 60000} min per user; ${meta.monthlyBudgetUsd}/month ceiling.</span>
            )}
          </InlineNotice>

          <div className="grid cols-chat">
            <Card title="Conversation" subtitle={messages.length ? `${messages.filter((m) => m.role === "user").length} question${messages.length > 2 ? "s" : ""} this session` : "In-session only — cleared when you leave"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 240, maxHeight: "60vh", overflowY: "auto", padding: "4px 2px" }}>
                {!messages.length && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {STARTERS.map((s) => (
                      <button key={s} className="btn" onClick={() => send(s)} disabled={busy}>{s}</button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => {
                  const orbState = m.error ? "error" : m.streaming ? (m.tools.length && !m.content ? "thinking" : "speaking") : "idle";
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        alignSelf: m.role === "user" ? "flex-end" : "stretch",
                        maxWidth: m.role === "user" ? "80%" : "100%",
                      }}
                    >
                      {m.role === "assistant" && (
                        <div style={{ flex: "none", paddingTop: 2 }}>
                          <AiOrb state={orbState} size={28} pulseKey={m.content.length} />
                        </div>
                      )}
                      <div
                        style={{
                          flex: 1, minWidth: 0,
                          background: m.role === "user" ? "var(--accent-bg)" : "var(--surface-2)",
                          border: `1px solid ${m.role === "user" ? "var(--accent-border)" : "var(--line)"}`,
                          borderRadius: "var(--r-md)",
                          padding: "10px 14px",
                          fontSize: "var(--fs-14)",
                          lineHeight: 1.5,
                        }}
                      >
                        {m.role === "user" ? (
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                        ) : (
                          <>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                              <Badge kind="info" dot>AI generated</Badge>
                              {m.refused && <Badge kind="neutral">no data</Badge>}
                            </div>
                            {m.tools.length > 0 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                                {m.tools.map((t, j) => (
                                  <span key={j} className={`ai-tool-chip${t.ok ? "" : " ai-tool-chip-error"}`}>
                                    ▸ {t.ok ? "Checked" : "Failed"} {toolLabel(t.name)}{t.args ? ` (${fmtDateArg(t.args)})` : ""}
                                    {Number.isFinite(t.ms) ? ` · ${t.ms}ms` : ""}{t.ok ? "" : ` — ${t.error}`}
                                  </span>
                                ))}
                              </div>
                            )}
                            {m.error ? (
                              <div style={{ color: "var(--crit-fg)" }}>{m.error}</div>
                            ) : m.content ? (
                              <div>{renderMarkdown(m.content)}</div>
                            ) : (
                              <span className="muted">{m.tools.length ? "Reading…" : "Thinking…"}</span>
                            )}
                            {!!m.verify?.length && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                                <span className="muted" style={{ fontSize: "var(--fs-12)" }}>Verify:</span>
                                {m.verify.map((v) => (
                                  <Link key={v.href} href={v.href} className="btn" style={{ fontSize: "var(--fs-12)", padding: "2px 8px" }}>
                                    {v.label} ↗
                                  </Link>
                                ))}
                              </div>
                            )}
                            {m.usage && (
                              <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 6 }}>
                                {m.usage.toolCalls} tool call{m.usage.toolCalls === 1 ? "" : "s"} · {m.usage.promptTokens + m.usage.completionTokens} tokens · ${m.usage.costUsd.toFixed(4)} · {(m.usage.latencyMs / 1000).toFixed(1)}s
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}
              >
                <textarea
                  className="control"
                  rows={2}
                  style={{ flex: 1, resize: "vertical", minHeight: 44 }}
                  placeholder="Ask about patients, revenue, leads, calls, marketing, staff… (Enter to send, Shift+Enter for a new line)"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                />
                {busy ? (
                  <button type="button" className="btn" onClick={stop}>Stop</button>
                ) : (
                  <button type="submit" className="primary" disabled={!input.trim()}>Ask</button>
                )}
              </form>
            </Card>

            <Card title="What Sanya can look up" subtitle="Read-only, aggregate only">
              {meta ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-13)", lineHeight: 1.45 }}>
                  {meta.tools.map((t) => (
                    <li key={t.name} style={{ marginBottom: 8 }}>
                      <strong>{t.name.replace(/^get_/, "").replace(/_/g, " ")}</strong>
                      <div className="muted">{t.description.replace(/ Same numbers as .*$/, "")}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">Loading…</span>
              )}
              <p className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 12 }}>
                Not available: individual patients, leads or employees by name; anything outside these tools.
                Usage, latency and cost are tracked on <Link href="/owner/ai/health">AI Health</Link>.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
