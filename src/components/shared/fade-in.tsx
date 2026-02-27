"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: Direction;
  scale?: boolean;
  duration?: number;
}

const directionOffsets: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 16 },
  down: { x: 0, y: -16 },
  left: { x: 16, y: 0 },
  right: { x: -16, y: 0 },
};

export function FadeIn({
  children,
  delay = 0,
  className,
  direction = "up",
  scale = false,
  duration,
}: FadeInProps) {
  const offset = directionOffsets[direction];

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
        scale: scale ? 0.92 : 1,
      }}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
      }}
      transition={
        duration
          ? { duration, delay, ease: "easeOut" }
          : {
              type: "spring",
              stiffness: 380,
              damping: 30,
              mass: 0.8,
              delay,
            }
      }
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
