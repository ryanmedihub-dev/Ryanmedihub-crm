"use client";

import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";

// One shared animation runtime for the whole owner panel — domAnimation is the
// smaller framer-motion feature bundle (no layout/drag), loaded once here
// instead of per-component. reducedMotion="user" makes every `m.*` element
// respect prefers-reduced-motion automatically, no per-component checks.
export default function MotionRoot({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
