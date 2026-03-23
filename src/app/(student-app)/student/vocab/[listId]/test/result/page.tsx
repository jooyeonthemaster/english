"use client";

import { useSearchParams, useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  RotateCcw,
  Home,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

// ---------------------------------------------------------------------------
// Circular Progress
// ---------------------------------------------------------------------------
function CircularProgress({
  percent,
  size = 140,
  strokeWidth = 10,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const color =
    percent >= 90
      ? "#10B981"
      : percent >= 70
        ? "#3B82F6"
        : percent >= 50
          ? "#F59E0B"
          : "#EF4444";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F3F4F6"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.p
          className="text-3xl font-black text-gray-900"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: "spring" }}
        >
          {percent}%
        </motion.p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result Content (separated for Suspense)
// ---------------------------------------------------------------------------
function ResultContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const listId = params.listId as string;

  const score = Number(searchParams.get("score") ?? 0);
  const total = Number(searchParams.get("total") ?? 0);
  const time = Number(searchParams.get("time") ?? 0);
  const type = searchParams.get("type") ?? "EN_TO_KR";

  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const wrong = total - score;

  // XP calculation: base 10 + bonus for high scores
  const xpEarned = 10 + (percent >= 90 ? 20 : percent >= 70 ? 10 : 0);

  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  const getMessage = () => {
    if (percent === 100) return "완벽해요!";
    if (percent >= 90) return "훌륭해요!";
    if (percent >= 70) return "잘했어요!";
    if (percent >= 50) return "더 노력해봐요!";
    return "다시 도전해봐요!";
  };

  const getEmoji = () => {
    if (percent === 100) return "🎉";
    if (percent >= 90) return "🌟";
    if (percent >= 70) return "👍";
    if (percent >= 50) return "💪";
    return "📚";
  };

  return (
    <div className="px-5 pt-8 pb-4 min-h-screen flex flex-col">
      {/* Result Header */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.p
          className="text-4xl mb-2"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          {getEmoji()}
        </motion.p>
        <h1 className="text-xl font-bold text-gray-900">{getMessage()}</h1>
      </motion.div>

      {/* Circular Progress */}
      <div className="flex justify-center my-8">
        <CircularProgress percent={percent} />
      </div>

      {/* Stats Row */}
      <motion.div
        className="grid grid-cols-3 gap-3 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <CheckCircle2 className="size-5 text-emerald-500 mx-auto" />
          <p className="text-lg font-bold text-emerald-600 mt-1">{score}</p>
          <p className="text-[10px] text-emerald-500">맞은 개수</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <XCircle className="size-5 text-red-500 mx-auto" />
          <p className="text-lg font-bold text-red-600 mt-1">{wrong}</p>
          <p className="text-[10px] text-red-500">틀린 개수</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <Clock className="size-5 text-blue-500 mx-auto" />
          <p className="text-lg font-bold text-blue-600 mt-1">
            {minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}초`}
          </p>
          <p className="text-[10px] text-blue-500">소요 시간</p>
        </div>
      </motion.div>

      {/* XP Earned */}
      <motion.div
        className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-4 flex items-center gap-3 mb-6 border border-amber-100/50"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.7 }}
      >
        <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Zap className="size-5 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-700">+{xpEarned} XP 획득!</p>
          <p className="text-xs text-amber-500">계속 학습하면 레벨업!</p>
        </div>
      </motion.div>

      {/* Action Buttons */}
      <div className="mt-auto space-y-3">
        {wrong > 0 && (
          <Link
            href={`/student/vocab/${listId}/test?retry=wrong&type=${type}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-red-500 text-white rounded-xl font-medium press-scale"
          >
            <RotateCcw className="size-4" />
            틀린 단어만 재시험 ({wrong}개)
          </Link>
        )}
        <Link
          href={`/student/vocab/${listId}/test`}
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-blue-500 text-white rounded-xl font-medium press-scale"
        >
          <RotateCcw className="size-4" />
          다시 시험 보기
        </Link>
        <Link
          href="/student/vocab"
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-gray-100 text-gray-700 rounded-xl font-medium press-scale"
        >
          <Home className="size-4" />
          단어장 목록으로
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page (with Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------
export default function VocabTestResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-pulse text-gray-400">로딩 중...</div>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
