"use client";

import { type Variants, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right";

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  direction?: Direction;
}

const directionOffsets: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 12 },
  down: { x: 0, y: -12 },
  left: { x: 12, y: 0 },
  right: { x: -12, y: 0 },
};

function getContainerVariants(staggerDelay: number): Variants {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.05,
      },
    },
  };
}

function getItemVariants(direction: Direction): Variants {
  const offset = directionOffsets[direction];
  return {
    hidden: {
      opacity: 0,
      x: offset.x,
      y: offset.y,
      scale: 0.97,
    },
    show: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 380,
        damping: 28,
        mass: 0.8,
      },
    },
  };
}

export function StaggerList({
  children,
  className,
  staggerDelay = 0.06,
  direction = "up",
}: StaggerListProps) {
  return (
    <motion.div
      variants={getContainerVariants(staggerDelay)}
      initial="hidden"
      animate="show"
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  direction?: Direction;
}) {
  return (
    <motion.div variants={getItemVariants(direction)} className={cn(className)}>
      {children}
    </motion.div>
  );
}
