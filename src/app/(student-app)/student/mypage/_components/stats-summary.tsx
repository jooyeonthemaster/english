"use client";

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

interface StatsSummaryProps {
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
}

const GRAMMAR_LABELS: Record<string, string> = {
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

export function StatsSummary({ analytics }: StatsSummaryProps) {
  const radarData = [
    { subject: "문법", score: analytics.grammarScore, fullMark: 100 },
    { subject: "어휘", score: analytics.vocabScore, fullMark: 100 },
    { subject: "독해", score: analytics.readingScore, fullMark: 100 },
    { subject: "서술형", score: analytics.writingScore, fullMark: 100 },
    { subject: "듣기", score: analytics.listeningScore, fullMark: 100 },
  ];

  const grammarBarData = Object.entries(analytics.grammarDetail).map(([key, value]) => ({
    name: GRAMMAR_LABELS[key] ?? key,
    score: value,
  }));

  return (
    <div className="space-y-4">
      {/* Radar Chart */}
      <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <h3 className="text-[var(--fs-md)] font-bold text-gray-900 mb-1">종합 실력 리포트</h3>
        <div className="relative">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#E5E7EB" strokeWidth={0.5} />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 11, fill: "#6B7280", fontWeight: 600 }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="실력"
                dataKey="score"
                stroke="#3B82F6"
                fill="url(#radarGrad)"
                fillOpacity={0.4}
                strokeWidth={2}
              />
              <defs>
                <linearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.2} />
                </linearGradient>
              </defs>
            </RadarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-[var(--fs-2xl)] font-black text-gray-900">
                {Math.round(analytics.overallScore)}
              </p>
              <p className="text-[var(--fs-caption)] text-gray-500">종합점수</p>
            </div>
          </div>
        </div>
        {/* Score row */}
        <div className="grid grid-cols-5 gap-1">
          {radarData.map((item) => (
            <div key={item.subject} className="text-center">
              <p className="text-[var(--fs-lg)] font-bold text-gray-900">{Math.round(item.score)}</p>
              <p className="text-[var(--fs-caption)] text-gray-500">{item.subject}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Grammar detail */}
      {grammarBarData.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <h4 className="text-[var(--fs-xs)] font-bold text-gray-900 mb-2">문법 세부 분석</h4>
          <ResponsiveContainer width="100%" height={grammarBarData.length * 32 + 10}>
            <BarChart data={grammarBarData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis dataKey="name" type="category" width={50} tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => [`${value}점`, "점수"]} contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
              <Bar dataKey="score" radius={[0, 5, 5, 0]} barSize={14}>
                {grammarBarData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.score >= 80 ? "#10B981" : entry.score >= 60 ? "#3B82F6" : entry.score >= 40 ? "#F59E0B" : "#EF4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weak points */}
      {analytics.weakPoints.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <h4 className="text-[var(--fs-xs)] font-bold text-gray-900 mb-2">약점 Top 3</h4>
          <div className="space-y-1.5">
            {analytics.weakPoints.slice(0, 3).map((point, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-red-50 rounded-xl">
                <div className="size-5 rounded-full bg-red-100 flex items-center justify-center text-[var(--fs-caption)] font-bold text-red-500">
                  {i + 1}
                </div>
                <p className="text-[var(--fs-xs)] text-gray-700 font-medium">{point}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
