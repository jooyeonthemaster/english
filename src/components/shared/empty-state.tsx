"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  gradientBg?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  gradientBg = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 30,
        mass: 0.8,
      }}
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4",
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 20,
          delay: 0.1,
        }}
        className="relative"
      >
        {gradientBg && (
          <div className="absolute inset-0 -m-3 rounded-full bg-gradient-to-br from-[#F1F8E9] via-[#F9FBE7] to-[#F0FDFA]" />
        )}
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={cn(
            "relative flex size-16 items-center justify-center rounded-2xl",
            gradientBg
              ? "bg-white/80 shadow-card"
              : "bg-[#FAFBF8]"
          )}
        >
          <Icon className="size-7 text-[#9CA396]" strokeWidth={1.6} />
        </motion.div>
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-5 text-[16px] font-bold tracking-tight text-[#1A1F16]"
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-1.5 text-center text-[13px] leading-relaxed text-[#6B7265]"
      >
        {description}
      </motion.p>

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="mt-5"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
