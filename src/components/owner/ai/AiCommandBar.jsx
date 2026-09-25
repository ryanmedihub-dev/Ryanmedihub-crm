"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { OWNER_LINK_ITEMS } from "@/lib/ai/links";
import { useShell } from "@/components/owner/ShellContext";

// Substring match ranks by how early it appears; otherwise an in-order
// subsequence match (a loose "types most of the letters" fallback) ranks
// low. No fuzzy-search dependency for an 8-item shortlist.
function fuzzyScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++;
  return qi === q.length ? 10 : -1;
}

export default function AiCommandBar() {
  // Open state lives in ShellContext, not here — OwnerTopbar's "⌘K Ask AI"
  // button needs to open the same palette instance.
  const { cmdBarOpen: open, closeCommandBar, toggleCommandBar } = useShell();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandBar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCommandBar]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = setTimeout(() => inputRef.current?.focus(), 0);

    function onKey(e) {
      if (e.key === "Escape") {
        closeCommandBar();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll("input,button:not([disabled])");
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeCommandBar]);

  const results = useMemo(() => {
    if (!query.trim()) return OWNER_LINK_ITEMS.slice(0, 8);
    return OWNER_LINK_ITEMS.map((item) => ({ item, score: fuzzyScore(query, item.label) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.item);
  }, [query]);

  const askEnabled = query.trim().length > 0;
  const total = results.length + (askEnabled ? 1 : 0);

  function go(item) {
    closeCommandBar();
    router.push(item.href);
  }
  function askSanya() {
    closeCommandBar();
    router.push(`/owner/ai/sanya?q=${encodeURIComponent(query.trim())}`);
  }

  function onInputKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (total ? (i + 1) % total : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (total ? (i - 1 + total) % total : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex < results.length) go(results[activeIndex]);
      else if (askEnabled) askSanya();
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="ai-cmdbar-overlay" onClick={() => closeCommandBar()}>
      <div ref={panelRef} className="ai-cmdbar" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="ai-cmdbar-input"
          placeholder="Go to a page, or ask Sanya anything…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onInputKeyDown}
        />
        <div className="ai-cmdbar-results">
          {results.length > 0 && (
            <div className="ai-cmdbar-group">
              <div className="ai-cmdbar-group-label">Go to</div>
              {results.map((item, i) => (
                <button
                  key={item.href}
                  type="button"
                  className={`ai-cmdbar-item${i === activeIndex ? " ai-cmdbar-item-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(item)}
                >
                  {item.label}
                  <span className="ai-cmdbar-item-href">{item.href}</span>
                </button>
              ))}
            </div>
          )}
          {askEnabled && (
            <div className="ai-cmdbar-group">
              <div className="ai-cmdbar-group-label">Ask Sanya</div>
              <button
                type="button"
                className={`ai-cmdbar-item${activeIndex === results.length ? " ai-cmdbar-item-active" : ""}`}
                onMouseEnter={() => setActiveIndex(results.length)}
                onClick={askSanya}
              >
                “{query.trim()}”
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
