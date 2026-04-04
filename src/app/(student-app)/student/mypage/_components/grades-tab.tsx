"use client";

import { motion } from "framer-motion";
import { StatsSummary } from "./stats-summary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GradesTabProps {
  analytics: {
    overallScore: number;
    grammarScore: number;
    vocabScore: number;
    readingScore: number;
    writingScore: number;
    listeningScore: number;
    grammarDetail: Record<string, number>;
    weakPoints: string[];
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GradesTab({ analytics }: GradesTabProps) {
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <StatsSummary analytics={analytics} />
    </motion.div>
  );
}
