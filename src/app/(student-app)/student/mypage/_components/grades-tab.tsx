"use client";

import { motion } from "framer-motion";
import { StatsSummary } from "./stats-summary";
import { StudyHeatmap } from "./study-heatmap";
import { StudyHistory } from "./study-history";
import { BadgeGrid } from "./badge-grid";

// ---------------------------------------------------------------------------
// Types — derived from parent page's data fetches
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
  heatmap: { date: string; level: number }[];
  recentTests: {
    id: string;
    title: string;
    testType: string;
    score: number;
    total: number;
    percent: number;
    date: string;
  }[];
  recentExams: {
    id: string;
    title: string;
    score: number;
    maxScore: number;
    percent: number;
    date: string;
  }[];
  badges: {
    earned: { id: string; name: string; description: string; icon: string; category: string; earnedAt: string }[];
    locked: { id: string; name: string; description: string; icon: string; category: string }[];
  } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GradesTab({ analytics, heatmap, recentTests, recentExams, badges }: GradesTabProps) {
  return (
    <motion.div
      className="space-y-[var(--sp-2)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 종합 실력 레이더 + 문법 분석 + 약점 */}
      <StatsSummary analytics={analytics} />

      {/* 학습 캘린더 (90일 히트맵) */}
      <StudyHeatmap data={heatmap} />

      {/* 단어 시험 + 시험 결과 */}
      <StudyHistory recentTests={recentTests} recentExams={recentExams} />

      {/* 배지 */}
      {badges && (
        <BadgeGrid earned={badges.earned} locked={badges.locked} />
      )}
    </motion.div>
  );
}
