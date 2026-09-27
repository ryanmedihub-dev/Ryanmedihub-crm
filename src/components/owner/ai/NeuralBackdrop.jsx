"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/owner/ThemeContext";

const NODE_COUNT = 60;
const LINK_DIST = 140;
const FPS = 30;
const FRAME_MS = 1000 / FPS;

export default function NeuralBackdrop() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const weakDevice = (navigator.hardwareConcurrency || 8) <= 4;
    if (reduced || weakDevice) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = 0, height = 0, dpr = 1;
    let nodes = [];
    let raf = null;
    let lastFrame = 0;
    let running = true;

    function seedNodes() {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
      }));
    }

    function resize() {
      const rect = canvas.parentElement?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight };
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedNodes();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || document.body);
    resize();

    const dark = document.querySelector(".owner-app")?.getAttribute("data-theme") !== "light";
    const lineAlpha = dark ? 0.09 : 0.04;
    const nodeAlpha = dark ? 0.35 : 0.18;

    function tick(now) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }
      ctx.fillStyle = `rgba(139,92,246,${nodeAlpha})`;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(139,92,246,${lineAlpha})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
    }

    function onVisibility() {
      running = !document.hidden;
      if (running && raf === null) raf = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    
  }, [theme]);

  return <canvas ref={canvasRef} className="ai-neural-backdrop" aria-hidden="true" />;
}
