"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, AlertTriangle, TrendingUp, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLearningAnalytics } from "@/actions/learning-analytics";
import { SUBTYPE_TO_CATEGORY } from "@/lib/learning-constants";
import { getWrongAnswerDashboard } from "@/actions/student-wrong-answers";
import type { LearningAnalytics } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface WrongQuestion {
  id: string;
  questionId: string;
  questionText: string;
  correctAnswer: string;
  givenAnswer: string;
  category: string;
  subType: string;
  count: number;
}

interface PassageGroup {
  passageId: string;
  passageTitle: string;
  wrongQuestions: WrongQuestion[];
}

interface WrongDashboard {
  totalWrong: number;
  categorySummary: Record<string, { total: number; subTypes: Record<string, number> }>;
  passageGroups: PassageGroup[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<LearningAnalytics | null>(null);
  const [wrongData, setWrongData] = useState<WrongDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLearningAnalytics(), getWrongAnswerDashboard()])
      .then(([analytics, wrong]) => {
        setData(analytics);
        setWrongData(wrong);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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
      {/* 헤더에서 제목+뒤로가기 처리됨 — 여백만 */}
      <div className="pt-2" />

      {/* Radar Chart */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-3xl p-5 ">
          <h2 className="text-[var(--fs-md)] font-bold text-black mb-4">영역별 분석</h2>
          <RadarChart scores={data.radarScores} />
        </div>
      </div>

      {/* Passage Mastery */}
      {data.passageMastery.length > 0 && (
        <div className="px-5 mb-4">
          <div className="bg-white rounded-3xl p-5 ">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-black" />
              <h2 className="text-[var(--fs-md)] font-bold text-black">지문별 숙달도</h2>
            </div>
            <div className="space-y-3">
              {data.passageMastery.map((p) => (
                <div key={p.passageId}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[var(--fs-xs)] text-black truncate max-w-[70%]">
                      {p.passageTitle}
                    </span>
                    <span
                      className={cn(
                        "text-[var(--fs-xs)] font-bold",
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
                      className="h-full rounded-full"
                      style={{ backgroundColor: "var(--key-color)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 오답 패턴 카드 (드롭다운 + 복습하기) */}
      {(data.weakPoints.length > 0 || (wrongData && wrongData.totalWrong > 0)) && (
        <div className="px-5 mb-4">
          <WrongPatternCard
            weakPoints={data.weakPoints}
            categorySummary={wrongData?.categorySummary ?? {}}
          />
        </div>
      )}

      {/* Weekly Trend */}
      {data.weeklyTrend.length > 0 && (
        <div className="px-5">
          <div className="bg-white rounded-3xl p-5 ">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-emerald-500" />
              <h2 className="text-[var(--fs-md)] font-bold text-black">주간 추이</h2>
            </div>
            <div className="space-y-2">
              {data.weeklyTrend.map((w) => (
                <div
                  key={w.weekLabel}
                  className="flex items-center gap-3 text-[var(--fs-xs)]"
                >
                  <span className="text-gray-500 w-24">{w.weekLabel}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${w.accuracy}%` }}
                    />
                  </div>
                  <span className="text-black font-medium w-10 text-right">
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
          fill="color-mix(in srgb, var(--key-color) 15%, transparent)"
          stroke="var(--key-color)"
          strokeWidth="2"
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--key-color)" />
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
              className="text-[var(--fs-xs)] fill-gray-600 font-medium"
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
                "text-[var(--fs-lg)] font-bold",
                c.value >= 80
                  ? "text-emerald-600"
                  : c.value >= 50
                    ? "text-blue-600"
                    : "text-amber-600"
              )}
            >
              {c.value}%
            </p>
            <p className="text-[var(--fs-caption)] text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WrongPatternCard — 오답 패턴 (유형별 드롭다운 + 복습하기 버튼)
// ---------------------------------------------------------------------------

const SUBTYPE_LABELS: Record<string, string> = {
  WORD_MEANING: "단어 뜻 (영→한)", WORD_MEANING_REVERSE: "단어 뜻 (한→영)",
  WORD_FILL: "빈칸 채우기", WORD_MATCH: "매칭", WORD_SPELL: "스펠링",
  VOCAB_SYNONYM: "유의어/반의어", VOCAB_DEFINITION: "영영풀이",
  VOCAB_COLLOCATION: "연어", VOCAB_CONFUSABLE: "혼동 단어",
  SENTENCE_INTERPRET: "해석 고르기", SENTENCE_COMPLETE: "영문 고르기",
  WORD_ARRANGE: "단어 배열", KEY_EXPRESSION: "핵심 표현", SENT_CHUNK_ORDER: "끊어읽기",
  GRAMMAR_SELECT: "문법 고르기", ERROR_FIND: "오류 찾기", ERROR_CORRECT: "오류 수정",
  GRAM_TRANSFORM: "문장 전환", GRAM_BINARY: "문법 O/X",
  TRUE_FALSE: "O/X", CONTENT_QUESTION: "내용 이해",
  PASSAGE_FILL: "지문 빈칸", CONNECTOR_FILL: "연결어",
};

const CATEGORY_LABELS: Record<string, string> = {
  VOCAB: "어휘",
  INTERPRETATION: "해석",
  GRAMMAR: "문법",
  COMPREHENSION: "이해",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  VOCAB: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-400" },
  INTERPRETATION: { bg: "bg-blue-50", text: "text-blue-600", bar: "bg-blue-400" },
  GRAMMAR: { bg: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-400" },
  COMPREHENSION: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-400" },
};

function WrongPatternCard({
  weakPoints,
  categorySummary,
}: {
  weakPoints: { category: string; subCategory: string; wrongCount: number }[];
  categorySummary: Record<string, { total: number; subTypes: Record<string, number> }>;
}) {
  const router = useRouter();
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // weakPoints에서 카테고리별 합산 (categorySummary가 비어있을 때 폴백)
  const catTotals: Record<string, number> = {};
  const catSubTypes: Record<string, Record<string, number>> = {};
  for (const w of weakPoints) {
    const cat = w.category;
    catTotals[cat] = (catTotals[cat] ?? 0) + w.wrongCount;
    if (!catSubTypes[cat]) catSubTypes[cat] = {};
    catSubTypes[cat][w.subCategory] = (catSubTypes[cat][w.subCategory] ?? 0) + w.wrongCount;
  }
  // categorySummary가 있으면 우선 사용
  for (const [cat, data] of Object.entries(categorySummary)) {
    catTotals[cat] = data.total;
    catSubTypes[cat] = data.subTypes;
  }

  const totalWrong = Object.values(catTotals).reduce((s, v) => s + v, 0);
  // 4개 카테고리 전부 표시 (오답 0회 포함), 오답 많은 순
  const ALL_CATS = ["VOCAB", "INTERPRETATION", "GRAMMAR", "COMPREHENSION"] as const;
  const orderedCats = [...ALL_CATS].sort((a, b) => (catTotals[b] ?? 0) - (catTotals[a] ?? 0));

  // SUBTYPE_TO_CATEGORY 역매핑: 카테고리 → subType[]
  const catToSubTypes: Record<string, string[]> = {};
  for (const [subType, cat] of Object.entries(SUBTYPE_TO_CATEGORY)) {
    if (!catToSubTypes[cat]) catToSubTypes[cat] = [];
    catToSubTypes[cat].push(subType);
  }

  return (
    <div className="bg-white rounded-3xl p-5 ">
      {/* 헤더 + 복습하기 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-rose-500" />
          <h2 className="text-[var(--fs-md)] font-bold text-black">오답 패턴</h2>
          <span className="text-[var(--fs-caption)] text-gray-500">{totalWrong}회</span>
        </div>
        <button
          onClick={() => router.push("/student/learn/analytics/review")}
          className="flex items-center gap-1 px-3 py-1.5 text-white text-[var(--fs-xs)] font-bold rounded-lg active:opacity-80"
            style={{ backgroundColor: "var(--key-color)" }}
        >
          <RotateCcw className="w-3 h-3" />
          복습하기
        </button>
      </div>

      {/* 카테고리별 행 */}
      <div className="space-y-1">
        {orderedCats.map((cat) => {
          const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.VOCAB;
          const total = catTotals[cat] ?? 0;
          const subTypes = catSubTypes[cat] ?? {};
          const isExpanded = expandedCat === cat;
          const maxBar = Math.max(...Object.values(catTotals), 1);

          return (
            <div key={cat}>
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat)}
                className="w-full flex items-center gap-2 py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <span className={cn("text-[var(--fs-xs)] font-bold px-2 py-0.5 rounded-full w-14 text-center", colors.bg, colors.text)}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", colors.bar)}
                    style={{ width: `${(total / maxBar) * 100}%` }}
                  />
                </div>
                <span className="text-[var(--fs-xs)] font-bold text-gray-500 w-8 text-right">{total}회</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
              </button>

              {/* 세부 유형 드롭다운 */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className={cn("rounded-xl p-3 mb-1 ml-4", colors.bg)}>
                      <div className="space-y-1.5">
                        {(catToSubTypes[cat] ?? [])
                          .sort((a, b) => (subTypes[b] ?? 0) - (subTypes[a] ?? 0))
                          .map((subType) => {
                            const count = subTypes[subType] ?? 0;
                            const maxSub = Math.max(...Object.values(subTypes), 1);
                            return (
                              <div key={subType} className="flex items-center gap-2">
                                <span className={cn("text-[var(--fs-caption)] w-20 shrink-0 truncate", count > 0 ? "text-black" : "text-gray-400")}>
                                  {SUBTYPE_LABELS[subType] ?? subType}
                                </span>
                                <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                                  {count > 0 && (
                                    <div
                                      className={cn("h-full rounded-full", colors.bar)}
                                      style={{ width: `${(count / maxSub) * 100}%` }}
                                    />
                                  )}
                                </div>
                                <span className={cn("text-[var(--fs-caption)] font-bold flex-shrink-0 whitespace-nowrap", count > 0 ? "text-gray-500" : "text-gray-400")}>
                                  {count}회
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
