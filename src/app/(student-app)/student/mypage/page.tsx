"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import {
  Zap,
  Flame,
  ChevronRight,
  TrendingUp,
  Award,
  Lock,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStudentInbadi,
  getStudentBadges,
  getStudentHeatmap,
} from "@/actions/student-app";
import { logoutStudentAction } from "@/actions/auth";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface InbadiData {
  student: {
    id: string;
    name: string;
    grade: number;
    level: number;
    xp: number;
    xpForNextLevel: number;
    streak: number;
    schoolName: string | null;
  };
  analytics: {
    overallScore: number;
    grammarScore: number;
    vocabScore: number;
    readingScore: number;
    writingScore: number;
    listeningScore: number;
    level: string;
    grammarDetail: Record<string, number>;
    weakPoints: string[];
  };
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
}

interface BadgesData {
  earned: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    earnedAt: string;
  }[];
  locked: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
  }[];
}

interface HeatmapEntry {
  date: string;
  level: number;
}

// ---------------------------------------------------------------------------
// Level colors
// ---------------------------------------------------------------------------
const levelColors: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "bg-gradient-to-br from-yellow-400 to-amber-500", text: "text-white", border: "border-yellow-300" },
  A: { bg: "bg-gradient-to-br from-blue-400 to-blue-600", text: "text-white", border: "border-blue-300" },
  B: { bg: "bg-gradient-to-br from-emerald-400 to-emerald-600", text: "text-white", border: "border-emerald-300" },
  C: { bg: "bg-gradient-to-br from-amber-400 to-amber-500", text: "text-white", border: "border-amber-300" },
  D: { bg: "bg-gradient-to-br from-gray-300 to-gray-400", text: "text-white", border: "border-gray-300" },
};

function getLevelTitle(level: number): string {
  if (level >= 30) return "Master";
  if (level >= 20) return "Advanced";
  if (level >= 15) return "Intermediate";
  if (level >= 10) return "Pre-Intermediate";
  if (level >= 5) return "Elementary";
  return "Beginner";
}

// ---------------------------------------------------------------------------
// Heatmap Component
// ---------------------------------------------------------------------------
function StudyHeatmap({ data }: { data: HeatmapEntry[] }) {
  const heatmapData = useMemo(() => {
    const today = new Date();
    const cells: { date: string; level: number; dayOfWeek: number; weekIndex: number }[] = [];
    const dataMap = new Map(data.map((d) => [d.date, d.level]));

    // Go back ~13 weeks (91 days)
    for (let i = 90; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayOfWeek = date.getDay();
      const weekIndex = Math.floor((90 - i + ((today.getDay() + 6) % 7)) / 7);

      cells.push({
        date: dateStr,
        level: dataMap.get(dateStr) ?? 0,
        dayOfWeek,
        weekIndex,
      });
    }

    return cells;
  }, [data]);

  const greenLevels = [
    "bg-gray-100", // 0 - none
    "bg-emerald-200", // 1 - low
    "bg-emerald-400", // 2 - medium
    "bg-emerald-600", // 3 - high
  ];

  // Group by week
  const weeks: typeof heatmapData[] = [];
  let currentWeek: typeof heatmapData = [];
  let lastWeekIndex = -1;

  for (const cell of heatmapData) {
    if (cell.weekIndex !== lastWeekIndex) {
      if (currentWeek.length > 0) weeks.push(currentWeek);
      currentWeek = [];
      lastWeekIndex = cell.weekIndex;
    }
    currentWeek.push(cell);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  return (
    <div className="overflow-x-auto hide-scrollbar">
      <div className="flex gap-[3px] min-w-fit">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, di) => {
              const cell = week.find((c) => c.dayOfWeek === di);
              if (!cell) {
                return <div key={di} className="size-[13px]" />;
              }
              return (
                <div
                  key={di}
                  className={cn(
                    "size-[13px] rounded-[3px] transition-colors",
                    greenLevels[cell.level]
                  )}
                  title={`${cell.date}: Level ${cell.level}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-[10px] text-gray-400 mr-1">적음</span>
        {greenLevels.map((color, i) => (
          <div key={i} className={cn("size-[10px] rounded-[2px]", color)} />
        ))}
        <span className="text-[10px] text-gray-400 ml-1">많음</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function StudentMyPage() {
  const router = useRouter();
  const [inbadi, setInbadi] = useState<InbadiData | null>(null);
  const [badges, setBadges] = useState<BadgesData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"analysis" | "badges" | "history">("analysis");

  useEffect(() => {
    Promise.all([
      getStudentInbadi(),
      getStudentBadges(),
      getStudentHeatmap(),
    ])
      .then(([i, b, h]) => {
        setInbadi(i);
        setBadges(b);
        setHeatmap(h);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <MyPageSkeleton />;
  if (!inbadi) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-gray-400">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { student, analytics } = inbadi;
  const xpPercent = Math.min(100, (student.xp / student.xpForNextLevel) * 100);
  const gradeStyle = levelColors[analytics.level] ?? levelColors.D;

  // Radar data
  const radarData = [
    { subject: "문법", score: analytics.grammarScore, fullMark: 100 },
    { subject: "어휘", score: analytics.vocabScore, fullMark: 100 },
    { subject: "독해", score: analytics.readingScore, fullMark: 100 },
    { subject: "서술형", score: analytics.writingScore, fullMark: 100 },
    { subject: "듣기", score: analytics.listeningScore, fullMark: 100 },
  ];

  // Grammar detail bar data
  const grammarLabels: Record<string, string> = {
    tense: "시제",
    passive: "수동태",
    relative: "관계사",
    subjunctive: "가정법",
    participle: "분사",
    conjunction: "접속사",
    infinitive: "부정사",
    gerund: "동명사",
    comparison: "비교급",
    article: "관사",
  };

  const grammarBarData = Object.entries(analytics.grammarDetail).map(([key, value]) => ({
    name: grammarLabels[key] ?? key,
    score: value,
  }));

  const handleLogout = async () => {
    await logoutStudentAction();
    router.push("/student/login");
  };

  return (
    <div className="pb-4">
      {/* Header - Blue gradient */}
      <motion.div
        className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 px-5 pt-6 pb-8 text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">영어 인바디</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-white/70 hover:text-white text-xs"
          >
            <LogOut className="size-3.5" />
            로그아웃
          </button>
        </div>

        {/* Student Info */}
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="size-16 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold backdrop-blur-sm border-2 border-white/30">
            {student.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{student.name}</h2>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium backdrop-blur-sm">
                Lv.{student.level} {getLevelTitle(student.level)}
              </span>
            </div>
            <p className="text-sm text-white/70 mt-0.5">
              {student.schoolName ? `${student.schoolName} ` : ""}
              {student.grade}학년
            </p>
            {/* XP Bar */}
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-white/60 mb-1">
                <span>XP</span>
                <span>{student.xp}/{student.xpForNextLevel}</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPercent}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-2 mt-4 bg-white/10 rounded-xl px-3 py-2 backdrop-blur-sm">
          <Flame className="size-5 text-orange-300" />
          <span className="text-sm font-medium">{student.streak}일 연속 출석</span>
        </div>
      </motion.div>

      {/* Radar Chart Section */}
      <motion.div
        className="px-5 -mt-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-gray-900">종합 실력 리포트</h3>
            <div className={cn("px-3 py-1 rounded-full text-sm font-bold", gradeStyle.bg, gradeStyle.text)}>
              {analytics.level}등급
            </div>
          </div>

          {/* Radar */}
          <div className="relative">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="#E5E7EB" strokeWidth={0.5} />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 12, fill: "#6B7280", fontWeight: 600 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: "#9CA3AF" }}
                  axisLine={false}
                />
                <Radar
                  name="실력"
                  dataKey="score"
                  stroke="#3B82F6"
                  fill="url(#radarGradient)"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <defs>
                  <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
              </RadarChart>
            </ResponsiveContainer>
            {/* Overall score overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-3xl font-black text-gray-900">
                  {Math.round(analytics.overallScore)}
                </p>
                <p className="text-[10px] text-gray-400 font-medium">종합점수</p>
              </div>
            </div>
          </div>

          {/* Score breakdown row */}
          <div className="grid grid-cols-5 gap-1 mt-2">
            {radarData.map((item) => (
              <div key={item.subject} className="text-center">
                <p className="text-lg font-bold text-gray-900">{Math.round(item.score)}</p>
                <p className="text-[10px] text-gray-400">{item.subject}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="px-5 mt-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { key: "analysis" as const, label: "상세 분석" },
            { key: "badges" as const, label: "배지" },
            { key: "history" as const, label: "시험 기록" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-5 mt-4">
        <AnimatePresence mode="wait">
          {activeTab === "analysis" && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Grammar Detail */}
              {grammarBarData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">문법 세부 분석</h4>
                  <ResponsiveContainer width="100%" height={grammarBarData.length * 36 + 20}>
                    <BarChart
                      data={grammarBarData}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={55}
                        tick={{ fontSize: 11, fill: "#6B7280" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}점`, "점수"]}
                        contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                      />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={18}>
                        {grammarBarData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={
                              entry.score >= 80
                                ? "#10B981"
                                : entry.score >= 60
                                  ? "#3B82F6"
                                  : entry.score >= 40
                                    ? "#F59E0B"
                                    : "#EF4444"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Weak Points */}
              {analytics.weakPoints.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">약점 Top 3</h4>
                  <div className="space-y-2">
                    {analytics.weakPoints.slice(0, 3).map((point, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-red-50 rounded-xl"
                      >
                        <div className="size-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600">
                          {i + 1}
                        </div>
                        <p className="text-sm text-gray-700 font-medium">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Heatmap */}
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                <h4 className="text-sm font-bold text-gray-900 mb-3">학습 캘린더</h4>
                <StudyHeatmap data={heatmap} />
              </div>

              {/* Progress Link */}
              <Link
                href="/student/mypage/progress"
                className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl press-scale"
              >
                <div className="flex items-center gap-3">
                  <TrendingUp className="size-5 text-blue-500" />
                  <span className="text-sm font-semibold text-blue-700">
                    성적 추이 자세히 보기
                  </span>
                </div>
                <ChevronRight className="size-4 text-blue-400" />
              </Link>
            </motion.div>
          )}

          {activeTab === "badges" && (
            <motion.div
              key="badges"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Earned Badges */}
              {badges && badges.earned.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">
                    획득한 배지 ({badges.earned.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {badges.earned.map((badge) => (
                      <motion.div
                        key={badge.id}
                        className="flex flex-col items-center gap-1.5 p-3 bg-gradient-to-b from-amber-50 to-white rounded-xl border border-amber-100"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-2xl">{badge.icon}</span>
                        <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">
                          {badge.name}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Locked Badges */}
              {badges && badges.locked.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">
                    미획득 배지 ({badges.locked.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {badges.locked.map((badge) => (
                      <div
                        key={badge.id}
                        className="flex flex-col items-center gap-1.5 p-3 bg-gray-50 rounded-xl border border-gray-100 opacity-50"
                      >
                        <div className="relative">
                          <span className="text-2xl grayscale">{badge.icon}</span>
                          <Lock className="size-3 text-gray-400 absolute -bottom-0.5 -right-0.5" />
                        </div>
                        <span className="text-[11px] font-medium text-gray-400 text-center leading-tight">
                          {badge.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {badges && badges.earned.length === 0 && badges.locked.length === 0 && (
                <div className="text-center py-12">
                  <Award className="size-12 text-gray-200 mx-auto" />
                  <p className="text-sm text-gray-400 mt-2">아직 배지가 없습니다</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {/* Vocab Tests */}
              {inbadi.recentTests.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">단어 시험</h4>
                  <div className="space-y-2">
                    {inbadi.recentTests.map((test, i) => {
                      const isUp = i > 0 && test.percent > inbadi.recentTests[i - 1].percent;
                      return (
                        <div
                          key={test.id}
                          className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {test.title}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {new Date(test.date).toLocaleDateString("ko-KR")}
                              {" "}
                              {test.testType === "EN_TO_KR"
                                ? "영→한"
                                : test.testType === "KR_TO_EN"
                                  ? "한→영"
                                  : "스펠링"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span
                              className={cn(
                                "text-sm font-bold",
                                test.percent >= 90
                                  ? "text-emerald-500"
                                  : test.percent >= 70
                                    ? "text-blue-500"
                                    : test.percent >= 50
                                      ? "text-amber-500"
                                      : "text-red-500"
                              )}
                            >
                              {Math.round(test.percent)}%
                            </span>
                            {i > 0 && (
                              <TrendingUp
                                className={cn(
                                  "size-3",
                                  isUp
                                    ? "text-emerald-400"
                                    : "text-red-400 rotate-180"
                                )}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Exam Results */}
              {inbadi.recentExams.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">시험 결과</h4>
                  <div className="space-y-2">
                    {inbadi.recentExams.map((exam) => (
                      <div
                        key={exam.id}
                        className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {exam.title}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {new Date(exam.date).toLocaleDateString("ko-KR")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-bold",
                            exam.percent >= 90
                              ? "text-emerald-500"
                              : exam.percent >= 70
                                ? "text-blue-500"
                                : exam.percent >= 50
                                  ? "text-amber-500"
                                  : "text-red-500"
                          )}
                        >
                          {exam.score}/{exam.maxScore}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inbadi.recentTests.length === 0 && inbadi.recentExams.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-400">아직 시험 기록이 없습니다</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function MyPageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-5 pt-6 pb-8">
        <div className="h-5 w-24 bg-white/20 rounded mb-4" />
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-white/20" />
          <div className="flex-1">
            <div className="h-5 w-32 bg-white/20 rounded" />
            <div className="h-3 w-24 bg-white/20 rounded mt-2" />
            <div className="h-1.5 bg-white/20 rounded-full mt-3" />
          </div>
        </div>
      </div>
      <div className="px-5 -mt-4">
        <div className="bg-white rounded-2xl shadow-card p-5 h-80" />
      </div>
    </div>
  );
}
