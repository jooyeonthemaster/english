"use client";

import { motion } from "framer-motion";
import { Award, BookOpen, FileText, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatsSummary } from "./stats-summary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExamRecord {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  percent: number;
  date: string;
}

interface TestRecord {
  id: string;
  title: string;
  testType: string;
  score: number;
  total: number;
  percent: number;
  date: string;
}

interface AssignmentRecord {
  id: string;
  title: string;
  className: string;
  score: number;
  maxScore: number;
  feedback: string | null;
  date: string;
}

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
  recentExams: ExamRecord[];
  recentTests: TestRecord[];
  assignmentGrades: AssignmentRecord[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GradesTab({
  analytics,
  recentExams,
  recentTests,
  assignmentGrades,
}: GradesTabProps) {
  const hasAnyAnalytics =
    analytics.overallScore > 0 ||
    analytics.grammarScore > 0 ||
    analytics.vocabScore > 0;

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 학습 분석 레이더 차트 (데이터 있을 때만) */}
      {hasAnyAnalytics && <StatsSummary analytics={analytics} />}

      {/* 시험 성적 */}
      {recentExams.length > 0 && (
        <GradeSection
          icon={<Award size={16} />}
          title="시험 성적"
          color="text-blue-600"
        >
          {recentExams.map((e) => (
            <ScoreCard
              key={e.id}
              title={e.title}
              score={e.score}
              maxScore={e.maxScore}
              percent={e.percent}
              date={e.date}
            />
          ))}
        </GradeSection>
      )}

      {/* 숙제 성적 */}
      {assignmentGrades.length > 0 && (
        <GradeSection
          icon={<FileText size={16} />}
          title="숙제 성적"
          color="text-emerald-600"
        >
          {assignmentGrades.map((a) => (
            <ScoreCard
              key={a.id}
              title={a.title}
              subtitle={a.className}
              score={a.score}
              maxScore={a.maxScore}
              percent={
                a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0
              }
              date={a.date}
              feedback={a.feedback}
            />
          ))}
        </GradeSection>
      )}

      {/* 단어 테스트 */}
      {recentTests.length > 0 && (
        <GradeSection
          icon={<BookOpen size={16} />}
          title="단어 테스트"
          color="text-purple-600"
        >
          {recentTests.map((t) => (
            <ScoreCard
              key={t.id}
              title={t.title}
              score={t.score}
              maxScore={t.total}
              percent={t.percent}
              date={t.date}
            />
          ))}
        </GradeSection>
      )}

      {/* 아무 데이터도 없을 때 */}
      {!hasAnyAnalytics &&
        recentExams.length === 0 &&
        assignmentGrades.length === 0 &&
        recentTests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <TrendingUp size={32} className="mb-2" />
            <p className="text-[var(--fs-base)]">
              아직 성적 데이터가 없습니다
            </p>
            <p className="text-[var(--fs-caption)] mt-1">
              학습을 시작하면 여기에 성적이 표시됩니다
            </p>
          </div>
        )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function GradeSection({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl p-5">
      <div className={cn("flex items-center gap-2 mb-3", color)}>
        {icon}
        <h3 className="text-[var(--fs-sm)] font-bold">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ScoreCard({
  title,
  subtitle,
  score,
  maxScore,
  percent,
  date,
  feedback,
}: {
  title: string;
  subtitle?: string;
  score: number;
  maxScore: number;
  percent: number;
  date: string;
  feedback?: string | null;
}) {
  const pct = Math.round(percent);
  const barColor =
    pct >= 90 ? "bg-emerald-400" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  const textColor =
    pct >= 90
      ? "text-emerald-600"
      : pct >= 70
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex-1 min-w-0">
          <p className="text-[var(--fs-sm)] font-medium text-black truncate">
            {title}
          </p>
          <div className="flex items-center gap-1.5">
            {subtitle && (
              <span className="text-[var(--fs-caption)] text-gray-400">
                {subtitle}
              </span>
            )}
            {date && (
              <span className="text-[var(--fs-caption)] text-gray-300">
                {new Date(date).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <span className={cn("text-[var(--fs-sm)] font-bold", textColor)}>
            {score}/{maxScore}
          </span>
        </div>
      </div>
      {/* 점수 바 */}
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* 피드백 */}
      {feedback && (
        <p className="text-[var(--fs-caption)] text-emerald-600 mt-1 bg-emerald-50 rounded-lg px-2 py-1">
          {feedback}
        </p>
      )}
    </div>
  );
}
