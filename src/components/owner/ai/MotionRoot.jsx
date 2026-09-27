"use client";

import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";

export default function MotionRoot({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
