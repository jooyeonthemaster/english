"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FlashOverlay({ correct }: { correct: boolean }) {
  return (
    <motion.div
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center rounded-2xl pointer-events-none",
        correct ? "bg-emerald-500/10" : "bg-red-500/10"
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        {correct ? (
          <div className="size-16 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="size-8 text-white" strokeWidth={3} />
          </div>
        ) : (
          <div className="size-16 rounded-full bg-red-500 flex items-center justify-center">
            <X className="size-8 text-white" strokeWidth={3} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
