"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";
import type { WrongItem } from "@/hooks/use-vocab-test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TestResultSummaryProps {
  score: number;
  total: number;
  elapsedTime: number;
  wrongItems: WrongItem[];
  onRetryWrong?: () => void;
  onGoBack: () => void;
}

// ---------------------------------------------------------------------------
// Animated Counter
// ---------------------------------------------------------------------------
function AnimatedNumber({ value, delay = 0.6 }: { value: number; delay?: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: "easeOut",
      delay,
    });
    return controls.stop;
  }, [motionValue, value, delay]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return unsubscribe;
  }, [rounded]);

  return <>{display}</>;
}

// ---------------------------------------------------------------------------
// Circular Progress Ring with Gradient + Glow
// ---------------------------------------------------------------------------
function ScoreRing({
  percent,
  size = 168,
  strokeWidth = 12,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  const isGreat = percent >= 80;
  const isOkay = percent >= 50;

  // Gradient IDs
  const gradientId = `score-gradient-${Math.random().toString(36).slice(2, 9)}`;
  const glowColor = isGreat
    ? "rgba(16, 185, 129, 0.3)"
    : isOkay
      ? "rgba(245, 158, 11, 0.3)"
      : "rgba(239, 68, 68, 0.3)";

  const stopColor1 = isGreat ? "#4CAF50" : isOkay ? "#F59E0B" : "#EF4444";
  const stopColor2 = isGreat ? "#AED581" : isOkay ? "#F97316" : "#DC2626";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Glow behind ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          transform: "scale(1.3)",
        }}
      />

      <svg width={size} height={size} className="-rotate-90 relative z-10">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stopColor1} />
            <stop offset="100%" stopColor={stopColor2} />
          </linearGradient>
        </defs>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F3F4F0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle with gradient stroke */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
          className="flex flex-col items-center"
        >
          <span
            className="text-[32px] font-extrabold tabular-nums"
            style={{ color: stopColor1 }}
          >
            <AnimatedNumber value={Math.round(percent)} />
          </span>
          <span className="text-[12px] font-medium text-[#9CA396] -mt-1">
            점
          </span>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celebration particles for high scores
// ---------------------------------------------------------------------------
function CelebrationEffect() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 200 - 100,
    y: Math.random() * -120 - 40,
    rotation: Math.random() * 360,
    scale: 0.4 + Math.random() * 0.6,
    delay: Math.random() * 0.5,
  }));

  const emojis = ["*", "+", "."];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden" style={{ height: 200 }}>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute text-[#7CB342]/30 text-[24px] font-bold"
          initial={{ opacity: 0, y: 60, x: 0, scale: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 0],
            y: [60, p.y],
            x: [0, p.x],
            scale: [0, p.scale, 0],
            rotate: [0, p.rotation],
          }}
          transition={{
            duration: 1.8,
            delay: 0.8 + p.delay,
            ease: "easeOut",
          }}
        >
          {emojis[p.id % emojis.length]}
        </motion.span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time formatter
// ---------------------------------------------------------------------------
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TestResultSummary({
  score,
  total,
  elapsedTime,
  wrongItems,
  onRetryWrong,
  onGoBack,
}: TestResultSummaryProps) {
  const percent = total > 0 ? (score / total) * 100 : 0;
  const isGreat = percent >= 80;

  return (
    <div className="relative flex flex-col items-center px-5 pb-32">
      {/* Celebration effect for high scores */}
      {isGreat && <CelebrationEffect />}

      {/* Score ring */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mt-8"
      >
        <ScoreRing percent={percent} />
      </motion.div>

      {/* Score text with animated count */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mt-5 flex flex-col items-center gap-1.5"
      >
        <p className="text-[30px] font-extrabold tracking-[-0.03em] text-[#1A1F16]">
          <AnimatedNumber value={score} delay={0.5} />
          <span className="text-[20px] font-semibold text-[#9CA396]">
            {" / "}{total}
          </span>
        </p>

        {/* Motivational message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className={cn(
            "text-[14px] font-medium",
            isGreat ? "text-[#4CAF50]" : percent >= 50 ? "text-[#F59E0B]" : "text-[#9CA396]"
          )}
        >
          {isGreat
            ? "훌륭해요!"
            : percent >= 50
              ? "조금만 더 힘내요!"
              : "꾸준히 연습해 봐요!"}
        </motion.p>

        <p className="text-[13px] text-[#9CA396]">
          소요 시간: {formatTime(elapsedTime)}
        </p>
      </motion.div>

      {/* Wrong words section */}
      {wrongItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-8 w-full"
        >
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex size-5 items-center justify-center rounded-md bg-[#FEE2E2]">
              <span className="text-[10px] font-bold text-[#EF4444]">!</span>
            </div>
            <p className="text-[14px] font-bold text-[#1A1F16]">
              틀린 단어
              <span className="ml-1.5 text-[#EF4444]">{wrongItems.length}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {wrongItems.map((wrong, idx) => (
              <motion.div
                key={wrong.item.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + idx * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                className="relative overflow-hidden rounded-xl border border-[#FEE2E2] bg-white p-3.5 shadow-card"
              >
                {/* Gradient red accent line */}
                <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#EF4444] to-[#FCA5A5]" />

                <div className="flex items-center justify-between pl-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-bold text-[#1A1F16]">
                      {wrong.item.english}
                    </span>
                    <span className="text-[13px] text-[#9CA396]">
                      {wrong.item.korean}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[12px] font-medium text-[#EF4444] line-through">
                      {wrong.givenAnswer}
                    </span>
                    <span className="text-[12px] font-semibold text-[#4CAF50]">
                      {wrong.correctAnswer}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="fixed bottom-0 left-0 right-0 z-40 mx-auto w-full max-w-[430px] bg-gradient-to-t from-white via-white to-white/0 px-5 pb-6 pt-4"
      >
        <div className="flex flex-col gap-2.5">
          {wrongItems.length > 0 && onRetryWrong && (
            <button
              onClick={onRetryWrong}
              className="flex h-[52px] w-full items-center justify-center rounded-xl gradient-primary text-[15px] font-bold text-white shadow-glow-green transition-all duration-200 active:scale-[0.98]"
            >
              틀린 단어만 재시험
            </button>
          )}
          <button
            onClick={onGoBack}
            className={cn(
              "flex h-[52px] w-full items-center justify-center rounded-xl text-[15px] font-bold transition-all duration-200 active:scale-[0.98]",
              wrongItems.length > 0
                ? "border border-[#E5E7E0] bg-white text-[#4A5043] hover:bg-[#FAFBF8]"
                : "gradient-primary text-white shadow-glow-green"
            )}
          >
            목록으로 돌아가기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
