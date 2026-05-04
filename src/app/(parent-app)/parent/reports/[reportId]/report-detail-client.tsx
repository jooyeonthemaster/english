"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck,
  Award,
  BookOpen,
  TrendingUp,
  ThumbsUp,
  AlertTriangle,
  MessageSquare,
  Lightbulb,
  GraduationCap,
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
import type { ParentReportDetail } from "@/actions/parent";

const TYPE_LABELS: Record<string, string> = {
  WEEKLY: "주간 학습 리포트",
  MONTHLY: "월간 학습 리포트",
  CUSTOM: "학습 분석 리포트",
};

const CATEGORY_COLORS: Record<string, string> = {
  문법: "#3B82F6",
  어휘: "#10B981",
  독해: "#F59E0B",
  작문: "#8B5CF6",
};

export function ReportDetailClient({
  report,
}: {
  report: ParentReportDetail;
}) {
  const { reportData } = report;

  return (
    <div className="bg-white min-h-screen">
      {/* Sticky Back Button */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-2">
        <Link
          href="/parent/reports"
          className="flex items-center gap-1.5 text-sm text-gray-500 min-h-[44px] w-fit"
        >
          <ArrowLeft className="size-4" />
          목록으로
        </Link>
      </div>

      {/* Report Content */}
      <div className="px-5 pt-6 pb-8 space-y-8">
        {/* Report Header */}
        <header className="text-center space-y-3 pb-6 border-b border-gray-100">
          {/* Academy Logo */}
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl gradient-primary shadow-lg shadow-blue-500/20">
              <span className="text-white font-bold text-xl tracking-tight">
                N
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-blue-500 tracking-wider uppercase">
              {report.academyName}
            </p>
            <h1 className="text-xl font-bold text-gray-900 mt-1">
              {TYPE_LABELS[report.type] || report.type}
            </h1>
          </div>
          <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <GraduationCap className="size-3.5" />
              {report.studentName}
            </span>
            {report.schoolName && (
              <>
                <span className="text-gray-300">|</span>
                <span>{report.schoolName}</span>
              </>
            )}
            <span className="text-gray-300">|</span>
            <span>{report.studentGrade}학년</span>
          </div>
          <p className="text-xs text-gray-400">{reportData.period}</p>
        </header>

        {/* Attendance Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100">
              <CalendarCheck className="size-4 text-blue-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900">출결 현황</h2>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              {
                label: "출석",
                value: reportData.attendance.present,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "지각",
                value: reportData.attendance.late,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                label: "결석",
                value: reportData.attendance.absent,
                color: "text-red-600",
                bg: "bg-red-50",
              },
              {
                label: "출석률",
                value: formatPercent(reportData.attendance.rate),
                color: "text-blue-600",
                bg: "bg-blue-50",
                isRate: true,
              },
            ].map((item) => (
              <div
                key={item.label}
                className={cn("rounded-xl p-3 text-center", item.bg)}
              >
                <p className="text-[10px] font-medium text-gray-500 mb-1">
                  {item.label}
                </p>
                <p className={cn("text-xl font-bold", item.color)}>
                  {"isRate" in item ? item.value : `${item.value}일`}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Exam Scores Section */}
        {reportData.exams.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100">
                <Award className="size-4 text-emerald-600" />
              </div>
              <h2 className="text-base font-bold text-gray-900">성적 현황</h2>
            </div>

            {/* Exam Score Table */}
            <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                      시험명
                    </th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">
                      날짜
                    </th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">
                      점수
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                      비율
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.exams.map((exam, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-t border-gray-50",
                        i % 2 === 1 && "bg-gray-50/50"
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-[120px]">
                        {exam.title}
                      </td>
                      <td className="text-center px-2 py-2.5 text-gray-500 text-xs">
                        {exam.date ? formatDate(exam.date) : "-"}
                      </td>
                      <td className="text-center px-2 py-2.5 text-gray-700">
                        {exam.score}/{exam.maxScore}
                      </td>
                      <td
                        className={cn(
                          "text-right px-4 py-2.5 font-bold",
                          getScoreColor(exam.percent)
                        )}
                      >
                        {exam.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Score Trend */}
        {reportData.scoreTrend.length > 1 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100">
                <TrendingUp className="size-4 text-indigo-600" />
              </div>
              <h2 className="text-base font-bold text-gray-900">점수 추이</h2>
            </div>
            <div className="h-[180px] bg-white rounded-xl border border-gray-100 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}점`]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #E5E7EB",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#3B82F6", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Category Scores */}
        {reportData.categoryScores.length > 0 &&
          reportData.categoryScores.some((c) => c.score > 0) && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-100">
                  <BookOpen className="size-4 text-purple-600" />
                </div>
                <h2 className="text-base font-bold text-gray-900">
                  영역별 점수
                </h2>
              </div>
              <div className="h-[180px] bg-white rounded-xl border border-gray-100 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.categoryScores} barSize={40}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#F3F4F6"
                    />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 12, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}점`]}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #E5E7EB",
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                      {reportData.categoryScores.map((entry) => (
                        <Cell
                          key={entry.category}
                          fill={
                            CATEGORY_COLORS[entry.category] || "#3B82F6"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

        {/* Vocab Summary */}
        {reportData.vocabSummary.testsCompleted > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100">
                <BookOpen className="size-4 text-amber-600" />
              </div>
              <h2 className="text-base font-bold text-gray-900">단어 학습</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-amber-50 p-3 text-center">
                <p className="text-[10px] font-medium text-gray-500 mb-1">
                  시험 횟수
                </p>
                <p className="text-xl font-bold text-amber-600">
                  {reportData.vocabSummary.testsCompleted}회
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 text-center">
                <p className="text-[10px] font-medium text-gray-500 mb-1">
                  평균 점수
                </p>
                <p className="text-xl font-bold text-amber-600">
                  {reportData.vocabSummary.averageScore}%
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 text-center">
                <p className="text-[10px] font-medium text-gray-500 mb-1">
                  학습 단어
                </p>
                <p className="text-xl font-bold text-amber-600">
                  {reportData.vocabSummary.totalWords}개
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 gap-4">
          {reportData.strengths.length > 0 && (
            <section className="bg-emerald-50/60 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsUp className="size-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-gray-900">강점</h2>
              </div>
              <ul className="space-y-2">
                {reportData.strengths.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reportData.weaknesses.length > 0 && (
            <section className="bg-red-50/60 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="size-4 text-red-500" />
                <h2 className="text-sm font-bold text-gray-900">약점</h2>
              </div>
              <ul className="space-y-2">
                {reportData.weaknesses.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span className="flex-shrink-0 w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Teacher Comment */}
        {reportData.teacherComment && (
          <section className="bg-blue-50/60 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="size-4 text-blue-600" />
              <h2 className="text-sm font-bold text-gray-900">강사 코멘트</h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {reportData.teacherComment}
            </p>
          </section>
        )}

        {/* Recommendations */}
        {reportData.recommendations.length > 0 && (
          <section className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="size-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-gray-900">추천 사항</h2>
            </div>
            <ul className="space-y-2">
              {reportData.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            {report.academyName} | {formatDate(report.createdAt)} 발행
          </p>
          <p className="text-[10px] text-gray-300 mt-1">
            영신ai English Academy ERP
          </p>
        </footer>
      </div>
    </div>
  );
}
