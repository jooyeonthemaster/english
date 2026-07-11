"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * 랜딩 공용 스크롤 리빌 프리미티브.
 * - Reveal: 단독 블록 — 블러가 걷히며 떠오르는 등장
 * - Stagger: 컨테이너 — 자식 Item들이 순차 등장
 * - Item: Stagger 내부 요소 (pop=true면 스프링 팝)
 * prefers-reduced-motion에서는 페이드만 남긴다.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  amount = 0.3,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={
        reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  amount = 0.3,
  delay = 0,
  gap = 0.1,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
  delay?: number;
  gap?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function Item({
  children,
  className,
  y = 26,
  pop = false,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  pop?: boolean;
}) {
  const reduced = useReducedMotion();
  const variants: Variants = reduced
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.4 } },
      }
    : pop
      ? {
          hidden: { opacity: 0, scale: 0.8, y: 12 },
          show: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { type: "spring", stiffness: 320, damping: 22 },
          },
        }
      : {
          hidden: { opacity: 0, y, filter: "blur(5px)" },
          show: {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            transition: { duration: 0.65, ease: EASE },
          },
        };
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}
