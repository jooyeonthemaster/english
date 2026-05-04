"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Target, Zap, Trophy, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionResult, QuestProgressUpdate } from "@/lib/learning-types";
import { LEARNING_SUBTYPE_LABELS } from "@/lib/learning-constants";

interface ResultScreenProps {
  result: SessionResult;
  passageId: string;
}

export default function ResultScreen({ result, passageId }: ResultScreenProps) {
  const router = useRouter();
  const questUpdates = result.questUpdates ?? [];
  const completedQuests = questUpdates.filter((q) => q.justCompleted);

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center mb-6",
            "bg-orange-50"
          )}
        >
          <Sparkles className="size-10" style={{ color: "var(--key-color)" }} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-[var(--fs-xl)] font-bold text-black mb-2"
        >
          {result.score >= 80 ? "훌륭해요!" : result.score >= 50 ? "잘했어요!" : "괜찮아요!"}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-6 mb-6"
        >
          <div>
            <p className="text-[var(--fs-2xl)] font-bold text-black">{result.score}%</p>
            <p className="text-[var(--fs-xs)] text-gray-500">정답률</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-[var(--fs-2xl)] font-bold text-orange-500">+{result.xpEarned}</p>
            <p className="text-[var(--fs-xs)] text-gray-500">
              XP {result.xpMultiplier > 1 ? `(x${result.xpMultiplier})` : ""}
            </p>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-[var(--fs-base)] text-gray-500 mb-6"
        >
          {result.correctCount}/{result.totalCount} 문제 정답
        </motion.p>

        {/* 미션 진행도 섹션 */}
        {questUpdates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full text-left mb-6"
          >
            <div className="flex items-center gap-1.5 mb-3">
              <Target className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-orange-500" />
              <p className="text-[var(--fs-xs)] font-semibold text-gray-500 uppercase">
                오늘의 미션
              </p>
            </div>
            <div className="space-y-2.5">
              {questUpdates.map((q, i) => (
                <QuestProgressBar key={q.questId} quest={q} delay={0.6 + i * 0.15} />
              ))}
            </div>
          </motion.div>
        )}

        {/* 미션 달성 알림 */}
        {completedQuests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.0, type: "spring", stiffness: 200 }}
            className="w-full mb-6"
          >
            {completedQuests.map((q) => (
              <div
                key={q.questId}
                className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 mb-2"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-orange-500" />
                  <span className="text-[var(--fs-base)] font-bold text-orange-700">미션 달성!</span>
                </div>
                <p className="text-[var(--fs-xs)] text-orange-600 mb-2">{q.label}</p>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[var(--fs-xs)] font-bold text-orange-700">
                    {q.rewardType === "MULTIPLIER"
                      ? `10분간 XP x${q.rewardValue} 보너스!`
                      : `보너스 +${q.rewardValue} XP 획득!`}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* 틀린 유형 통계 */}
        {result.wrongQuestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="w-full text-left mb-6"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle className="size-3.5 text-rose-400" />
              <p className="text-[var(--fs-xs)] font-semibold text-gray-400 uppercase">
                오답 유형 ({result.wrongQuestions.length}개)
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(
                result.wrongQuestions.reduce<Record<string, number>>((acc, wq) => {
                  const label = LEARNING_SUBTYPE_LABELS[wq.subType] || wq.subType || "기타";
                  acc[label] = (acc[label] || 0) + 1;
                  return acc;
                }, {})
              )
                .sort((a, b) => b[1] - a[1])
                .map(([label, count]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg text-[var(--fs-xs)] font-medium border border-rose-100"
                  >
                    {label}
                    <span className="text-rose-400">{count}</span>
                  </span>
                ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="px-5 pb-8 space-y-2.5">
        <button
          onClick={() => router.push(`/student/learn/${passageId}`)}
          className="w-full py-3.5 rounded-xl bg-orange-500 text-white font-bold text-[var(--fs-base)] active:bg-blue-600"
        >
          레슨으로 돌아가기
        </button>
        <button
          onClick={() => router.push("/student/learn")}
          className="w-full py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-[var(--fs-base)] active:bg-gray-200"
        >
          학습 홈
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestProgressBar — 개별 미션 프로그레스바 (애니메이션 포함)
// ---------------------------------------------------------------------------

function QuestProgressBar({
  quest,
  delay,
}: {
  quest: QuestProgressUpdate;
  delay: number;
}) {
  const percent = Math.min(100, Math.round((quest.newProgress / quest.target) * 100));
  const prevPercent = Math.min(100, Math.round((quest.previousProgress / quest.target) * 100));

  const difficultyColor = quest.justCompleted
    ? "bg-emerald-500"
    : "bg-orange-500";

  const rewardLabel =
    quest.rewardType === "MULTIPLIER"
      ? `x${quest.rewardValue}`
      : `+${quest.rewardValue} XP`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className={cn(
        "rounded-xl p-3 border",
        quest.justCompleted
          ? "bg-emerald-50 border-emerald-200"
          : "bg-gray-50 border-gray-100"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[var(--fs-xs)] font-medium text-black flex-1 mr-2">
          {quest.label}
        </span>
        <span
          className={cn(
            "text-[var(--fs-caption)] font-bold px-1.5 py-0.5 rounded-full",
            quest.justCompleted
              ? "bg-emerald-100 text-emerald-600"
              : "bg-gray-200 text-gray-500"
          )}
        >
          {quest.justCompleted ? "달성!" : rewardLabel}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: `${prevPercent}%` }}
          animate={{ width: `${percent}%` }}
          transition={{ delay: delay + 0.3, duration: 0.6, ease: "easeOut" }}
          className={cn("h-full rounded-full", difficultyColor)}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[var(--fs-caption)] text-gray-500">
          {quest.newProgress}/{quest.target}
        </span>
        {quest.justCompleted && (
          <span className="text-[var(--fs-caption)] font-bold text-emerald-500">
            {quest.rewardType === "MULTIPLIER"
              ? `x${quest.rewardValue} 배율 활성!`
              : `+${quest.rewardValue} XP 획득!`}
          </span>
        )}
      </div>
    </motion.div>
  );
}
