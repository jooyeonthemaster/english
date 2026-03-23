"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { ArrowLeft, TrendingUp, Zap, BookOpen, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentProgress } from "@/actions/student-app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ProgressData {
  vocabTrend: { date: string; title: string; percent: number }[];
  examTrend: { date: string; title: string; percent: number }[];
  dailyStudy: { date: string; minutes: number; vocabTests: number; xp: number }[];
  currentLevel: number;
  currentXp: number;
  xpForNextLevel: number;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-float border border-gray-100 px-3 py-2">
      <p className="text-[10px] text-gray-400">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs font-bold" style={{ color: entry.color }}>
          {entry.name}: {Math.round(entry.value)}
          {entry.name.includes("%") || entry.name === "점수" ? "%" : ""}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentProgress()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-5 pt-6 animate-pulse">
        <div className="h-5 w-32 bg-gray-100 rounded mb-6" />
        <div className="h-64 bg-gray-100 rounded-2xl mb-4" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-gray-400">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const xpPercent = Math.min(
    100,
    (data.currentXp / data.xpForNextLevel) * 100
  );

  // Format dates for charts
  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="px-5 pt-6 pb-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/student/mypage" className="press-scale">
          <ArrowLeft className="size-5 text-gray-600" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">성적 추이</h1>
      </div>

      {/* XP / Level Card */}
      <motion.div
        className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="size-5" />
            <span className="text-sm font-bold">Level {data.currentLevel}</span>
          </div>
          <span className="text-xs text-white/70">
            {data.currentXp}/{data.xpForNextLevel} XP
          </span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${xpPercent}%` }}
            transition={{ duration: 1 }}
          />
        </div>
      </motion.div>

      {/* Vocab Score Trend */}
      {data.vocabTrend.length > 0 && (
        <motion.div
          className="bg-white rounded-2xl shadow-card border border-gray-100 p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="size-4 text-blue-500" />
            <h3 className="text-sm font-bold text-gray-900">단어 시험 점수 추이</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={data.vocabTrend.map((d) => ({
                ...d,
                date: formatDate(d.date),
              }))}
            >
              <defs>
                <linearGradient id="vocabGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="percent"
                name="점수"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#vocabGradient)"
                dot={{ r: 3, fill: "#3B82F6" }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Exam Score Trend */}
      {data.examTrend.length > 0 && (
        <motion.div
          className="bg-white rounded-2xl shadow-card border border-gray-100 p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="size-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-gray-900">시험 점수 추이</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={data.examTrend.map((d) => ({
                ...d,
                date: formatDate(d.date),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="percent"
                name="점수"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10B981" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Daily XP Trend */}
      {data.dailyStudy.length > 0 && (
        <motion.div
          className="bg-white rounded-2xl shadow-card border border-gray-100 p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="size-4 text-amber-500" />
            <h3 className="text-sm font-bold text-gray-900">일별 XP 획득</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={data.dailyStudy.map((d) => ({
                ...d,
                date: formatDate(d.date),
              }))}
            >
              <defs>
                <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="xp"
                name="XP"
                stroke="#F59E0B"
                strokeWidth={2}
                fill="url(#xpGradient)"
                dot={{ r: 2, fill: "#F59E0B" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Empty state */}
      {data.vocabTrend.length === 0 && data.examTrend.length === 0 && (
        <div className="text-center py-16">
          <TrendingUp className="size-12 text-gray-200 mx-auto" />
          <p className="text-sm text-gray-400 mt-3">아직 기록이 없습니다</p>
          <p className="text-xs text-gray-300 mt-1">
            시험을 보면 여기에 추이가 표시됩니다
          </p>
        </div>
      )}
    </div>
  );
}
