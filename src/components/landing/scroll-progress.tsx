"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** 랜딩 최상단 스크롤 진행바 — 어디까지 왔는지 보여줘 끝까지 내리게 유도한다. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    mass: 0.4,
  });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[80] h-[3px] origin-left bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-400"
      style={{ scaleX }}
    />
  );
}
