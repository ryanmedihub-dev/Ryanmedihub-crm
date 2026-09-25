"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ownerFetch } from "@/lib/ownerFetch";
import { SENTIMENT_TONE } from "@/lib/ai/client/aiLabels";

// Horizontal auto-scrolling strip of the latest insights across every
// feature. Pauses on hover; a static list under reduced-motion (the CSS
// marquee animation is already killed globally, so duplicating the items for
// a seamless loop only happens when motion is allowed).
export default function AiFeedTicker({ limit = 12 }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    ownerFetch(`/api/owner/ai/feed?limit=${limit}`).then((r) => {
      if (!cancelled && r.ok) setItems(r.data?.items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (items.length === 0) return null;

  const loop = [...items, ...items]; // duplicated for a seamless CSS marquee

  return (
    <div className="ai-feed-ticker" role="marquee" aria-label="Latest AI insights">
      <div className="ai-feed-ticker-track">
        {loop.map((it, i) => (
          <Link key={`${it.feature}-${i}`} href={it.page || "#"} className="ai-feed-item">
            <span className={`ai-feed-dot ai-feed-dot-${SENTIMENT_TONE[it.sentiment] || "info"}`} aria-hidden="true" />
            <span className="ai-feed-title">{it.title}</span>
            <span className="ai-feed-headline">{it.headline}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
