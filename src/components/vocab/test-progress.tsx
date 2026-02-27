"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";

interface TestProgressProps {
  current: number;
  total: number;
  className?: string;
}

function AnimatedCounter({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.4,
      ease: "easeOut",
    });
    return controls.stop;
  }, [motionValue, value]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return unsubscribe;
  }, [rounded]);

  return <>{display}</>;
}

export function TestProgress({ current, total, className }: TestProgressProps) {
  const percent = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Count text + percentage */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[13px] font-medium text-[#9CA396]">
          <span className="text-[15px] font-bold text-[#7CB342] tabular-nums">
            <AnimatedCounter value={current} />
          </span>
          <span className="mx-0.5 text-[#C8CCC2]">/</span>
          <span className="tabular-nums">{total}</span>
        </span>

        <motion.span
          key={current}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="text-[12px] font-semibold text-[#7CB342] tabular-nums"
        >
          {Math.round(percent)}%
        </motion.span>
      </div>

      {/* Progress bar */}
      <div className="relative h-[6px] w-full overflow-hidden rounded-full bg-[#F3F4F0]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full gradient-primary"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Pulse effect at leading edge */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <div className="size-[6px] rounded-full bg-white animate-pulse-ring" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
