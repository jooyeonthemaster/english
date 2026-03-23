"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  BookOpen,
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn, formatDate, formatPercent, getScoreColor } from "@/lib/utils";
import { getChildGrades } from "@/actions/parent";
import type { ChildSummary, ChildGradesData } from "@/actions/parent";

const VOCAB_TYPE_LABELS: Record<string, string> = {
  EN_TO_KR: "영->한",
  KR_TO_EN: "한->영",
  SPELLING: "스펠링",
};

const CATEGORY_COLORS: Record<string, string> = {
  문법: "#3B82F6",
  어휘: "#10B981",
  독해: "#F59E0B",
  작문: "#8B5CF6",
};

function ChildSwitcher({
  children,
  selectedId,
  onSelect,
}: {
  children: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (children.length <= 1) return null;

  return (
    <div className="flex gap-2 px-1 py-1 bg-gray-100 rounded-xl" role="tablist" aria-label="자녀 선택">
      {children.map((child) => (
        <button
          key={child.id}
          onClick={() => onSelect(child.id)}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px]",
            selectedId === child.id
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
          role="tab"
          aria-selected={selectedId === child.id}
        >
          {child.name}
        </button>
      ))}
    </div>
  );
}

export function GradesClient({
  children,
  initialGrades,
}: {
  children: ChildSummary[];
  initialGrades: ChildGradesData | null;
}) {
  const [selectedChildId, setSelectedChildId] = useState(
    children[0]?.id || ""
  );
  const [grades, setGrades] = useState<ChildGradesData | null>(initialGrades);
  const [loading, setLoading] = useState(false);
  const [showAllExams, setShowAllExams] = useState(false);
  const [showAllVocab, setShowAllVocab] = useState(false);

  const fetchGrades = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const data = await getChildGrades(studentId);
      setGrades(data);
    } catch {
      setGrades(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChildId && selectedChildId !== children[0]?.id) {
      fetchGrades(selectedChildId);
    }
  }, [selectedChildId, children, fetchGrades]);

  function handleChildSwitch(id: string) {
    setSelectedChildId(id);
    setShowAllExams(false);
    setShowAllVocab(false);
    if (id !== children[0]?.id || !initialGrades) {
      fetchGrades(id);
    } else {
      setGrades(initialGrades);
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-6">
        <ChildSwitcher
          children={children.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedChildId}
          onSelect={handleChildSwitch}
        />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!grades) {
    return (
      <div className="px-5 pt-6 space-y-6">
        <ChildSwitcher
          children={children.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedChildId}
          onSelect={handleChildSwitch}
        />
        <div className="text-center py-20 text-sm text-gray-400">
          성적 데이터가 없습니다
        </div>
      </div>
    );
  }

  const displayedExams = showAllExams
    ? grades.recentExams
    : grades.recentExams.slice(0, 5);
  const displayedVocab = showAllVocab
    ? grades.vocabTests
    : grades.vocabTests.slice(0, 5);

  return (
    <div className="px-5 pt-6 pb-4 space-y-6">
      {/* Child Switcher */}
      <ChildSwitcher
        children={children.map((c) => ({ id: c.id, name: c.name }))}
        selectedId={selectedChildId}
        onSelect={handleChildSwitch}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">성적 현황</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {children.find((c) => c.id === selectedChildId)?.name}의 학습 분석
        </p>
      </div>

      {/* Score Trend Chart */}
      {grades.scoreTrend.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="size-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800">
              점수 추이
            </h2>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grades.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  formatter={(value) => [`${value}점`, "점수"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#3B82F6", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#3B82F6" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Recent Exam Results */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Award className="size-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-gray-800">
            최근 시험 결과
          </h2>
        </div>
        {grades.recentExams.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            시험 결과가 없습니다
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayedExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {exam.examTitle}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {exam.examDate ? formatDate(exam.examDate) : "-"}
                      {exam.rank && exam.totalStudents
                        ? ` | ${exam.rank}/${exam.totalStudents}등`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p
                      className={cn(
                        "text-lg font-bold",
                        getScoreColor(exam.percent)
                      )}
                    >
                      {exam.percent}점
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {exam.score}/{exam.maxScore}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {grades.recentExams.length > 5 && (
              <button
                onClick={() => setShowAllExams(!showAllExams)}
                className="flex items-center justify-center w-full mt-2 py-2.5 text-xs text-blue-500 font-medium min-h-[44px]"
              >
                {showAllExams ? (
                  <>
                    접기 <ChevronUp className="size-3.5 ml-1" />
                  </>
                ) : (
                  <>
                    더보기 ({grades.recentExams.length - 5}건)
                    <ChevronDown className="size-3.5 ml-1" />
                  </>
                )}
              </button>
            )}
          </>
        )}
      </section>

      {/* Category Analysis */}
      {grades.categoryScores.some((c) => c.score > 0) && (
        <section className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="size-4 text-purple-500" />
            <h2 className="text-sm font-semibold text-gray-800">
              영역별 분석
            </h2>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grades.categoryScores} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  formatter={(value) => [`${value}점`, "점수"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {grades.categoryScores.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_COLORS[entry.category] || "#3B82F6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Vocab Test Results */}
      {grades.vocabTests.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-800">
              단어 시험 기록
            </h2>
          </div>
          <div className="space-y-2">
            {displayedVocab.map((test) => (
              <div
                key={test.id}
                className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {test.listTitle}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {VOCAB_TYPE_LABELS[test.testType] || test.testType} |{" "}
                    {formatDate(test.takenAt)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p
                    className={cn(
                      "text-lg font-bold",
                      getScoreColor(test.percent)
                    )}
                  >
                    {test.percent}%
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {test.score}/{test.total}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {grades.vocabTests.length > 5 && (
            <button
              onClick={() => setShowAllVocab(!showAllVocab)}
              className="flex items-center justify-center w-full mt-2 py-2.5 text-xs text-blue-500 font-medium min-h-[44px]"
            >
              {showAllVocab ? (
                <>
                  접기 <ChevronUp className="size-3.5 ml-1" />
                </>
              ) : (
                <>
                  더보기 ({grades.vocabTests.length - 5}건)
                  <ChevronDown className="size-3.5 ml-1" />
                </>
              )}
            </button>
          )}
        </section>
      )}

      {/* Weak Areas */}
      {grades.weakAreas.length > 0 && (
        <section className="bg-red-50/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="size-4 text-red-500" />
            <h2 className="text-sm font-semibold text-gray-800">
              오답 패턴 / 약점 분석
            </h2>
          </div>
          <ul className="space-y-2">
            {grades.weakAreas.map((area, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700"
              >
                <span className="flex-shrink-0 w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
