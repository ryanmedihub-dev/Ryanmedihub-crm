"use client";

import { useEffect, useRef, useState } from "react";

const FORMATTERS = {
  rupee: (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`,
  num: (n) => new Intl.NumberFormat("en-IN").format(Math.round(n)),
  pct: (n) => `${n.toFixed(1)}%`,
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function CountUp({ value, format = "num", duration = 600 }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (target - from) * easeOutCubic(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  const fmt = FORMATTERS[format] || FORMATTERS.num;
  return <span className="ai-count-up">{fmt(display)}</span>;
}
