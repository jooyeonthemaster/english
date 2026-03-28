"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, BookOpen, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLearningAnalytics } from "@/actions/learning-analytics";
import type { LearningAnalytics } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<LearningAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const analytics = await getLearningAnalytics();
        setData(analytics);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32 mb-6" />
        <div className="h-64 bg-gray-100 rounded-2xl mb-4" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">데이터를 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <button onClick={() => router.back()} className="mb-3 p-1 -ml-1">
          <ArrowLeft className="size-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-blue-500" />
          <h1 className="text-lg font-bold text-gray-900">영어 인바디</h1>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">영역별 분석</h2>
          <RadarChart scores={data.radarScores} />
        </div>
      </div>

      {/* Passage Mastery */}
      {data.passageMastery.length > 0 && (
        <div className="px-5 mb-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="size-4 text-blue-500" />
              <h2 className="text-sm font-bold text-gray-700">지문별 숙달도</h2>
            </div>
            <div className="space-y-3">
              {data.passageMastery.map((p) => (
                <div key={p.passageId}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-gray-600 truncate max-w-[70%]">
                      {p.passageTitle}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        p.masteryScore >= 80
                          ? "text-emerald-600"
                          : p.masteryScore >= 50
                            ? "text-blue-600"
                            : "text-amber-600"
                      )}
                    >
                      {p.masteryScore}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p.masteryScore}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full",
                        p.masteryScore >= 80
                          ? "bg-emerald-500"
                          : p.masteryScore >= 50
                            ? "bg-blue-500"
                            : "bg-amber-500"
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Weak Points */}
      {data.weakPoints.length > 0 && (
        <div className="px-5 mb-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="size-4 text-rose-500" />
              <h2 className="text-sm font-bold text-gray-700">오답 패턴</h2>
            </div>
            <div className="space-y-2">
              {data.weakPoints.map((w, i) => (
                <div
                  key={`${w.category}-${w.subCategory}-${i}`}
                  className="flex items-center gap-3 bg-rose-50 rounded-lg px-3 py-2"
                >
                  <span className="text-xs font-medium text-rose-600 bg-rose-100 px-2 py-0.5 rounded">
                    {w.category}
                  </span>
                  <span className="text-xs text-gray-700 flex-1">
                    {w.subCategory || "기타"}
                  </span>
                  <span className="text-xs font-bold text-rose-600">{w.wrongCount}회</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Trend */}
      {data.weeklyTrend.length > 0 && (
        <div className="px-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="size-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-gray-700">주간 추이</h2>
            </div>
            <div className="space-y-2">
              {data.weeklyTrend.map((w) => (
                <div
                  key={w.weekLabel}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="text-gray-500 w-24">{w.weekLabel}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${w.accuracy}%` }}
                    />
                  </div>
                  <span className="text-gray-600 font-medium w-10 text-right">
                    {w.accuracy}%
                  </span>
                  <span className="text-gray-400 w-12 text-right">
                    {w.sessionsCompleted}세션
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar Chart (SVG)
// ---------------------------------------------------------------------------

function RadarChart({
  scores,
}: {
  scores: { vocab: number; interpretation: number; grammar: number; comprehension: number };
}) {
  const categories = [
    { key: "vocab", label: "어휘", value: scores.vocab },
    { key: "comprehension", label: "이해", value: scores.comprehension },
    { key: "grammar", label: "문법", value: scores.grammar },
    { key: "interpretation", label: "해석", value: scores.interpretation },
  ];

  const cx = 120;
  const cy = 120;
  const maxR = 90;
  const levels = [25, 50, 75, 100];

  // 꼭짓점 좌표 (4각형, 위에서 시작)
  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / 4 - Math.PI / 2;
    const r = (value / 100) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const dataPoints = categories.map((c, i) => getPoint(i, c.value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="240" viewBox="0 0 240 240">
        {/* Grid levels */}
        {levels.map((level) => {
          const points = categories
            .map((_, i) => getPoint(i, level))
            .map((p) => `${p.x},${p.y}`)
            .join(" ");
          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          );
        })}

        {/* Axes */}
        {categories.map((_, i) => {
          const p = getPoint(i, 100);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <motion.polygon
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="#3b82f6"
          strokeWidth="2"
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6" />
        ))}

        {/* Labels */}
        {categories.map((c, i) => {
          const labelPoint = getPoint(i, 120);
          return (
            <text
              key={c.key}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[11px] fill-gray-600 font-medium"
            >
              {c.label}
            </text>
          );
        })}
      </svg>

      {/* Score values */}
      <div className="flex gap-4 mt-2">
        {categories.map((c) => (
          <div key={c.key} className="text-center">
            <p
              className={cn(
                "text-lg font-bold",
                c.value >= 80
                  ? "text-emerald-600"
                  : c.value >= 50
                    ? "text-blue-600"
                    : "text-amber-600"
              )}
            >
              {c.value}%
            </p>
            <p className="text-[10px] text-gray-400">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
