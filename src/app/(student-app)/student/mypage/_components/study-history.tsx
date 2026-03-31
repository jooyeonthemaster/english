"use client";

import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

interface TestRecord {
  id: string;
  title: string;
  testType: string;
  score: number;
  total: number;
  percent: number;
  date: string;
}

interface ExamRecord {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  percent: number;
  date: string;
}

interface StudyHistoryProps {
  recentTests: TestRecord[];
  recentExams: ExamRecord[];
}

function scoreColor(pct: number) {
  if (pct >= 90) return "text-emerald-500";
  if (pct >= 70) return "text-blue-500";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

export function StudyHistory({ recentTests, recentExams }: StudyHistoryProps) {
  if (recentTests.length === 0 && recentExams.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-gray-400">아직 시험 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recentTests.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <h4 className="text-xs font-bold text-gray-900 mb-2">단어 시험</h4>
          <div className="space-y-1.5">
            {recentTests.map((t, i) => {
              const isUp = i > 0 && t.percent > recentTests[i - 1].percent;
              return (
                <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{t.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(t.date).toLocaleDateString("ko-KR")}
                      {" · "}
                      {t.testType === "EN_TO_KR" ? "영→한" : t.testType === "KR_TO_EN" ? "한→영" : "스펠링"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className={cn("text-xs font-bold", scoreColor(t.percent))}>
                      {Math.round(t.percent)}%
                    </span>
                    {i > 0 && (
                      <TrendingUp
                        className={cn("size-3", isUp ? "text-emerald-500" : "text-red-500 rotate-180")}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recentExams.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <h4 className="text-xs font-bold text-gray-900 mb-2">시험 결과</h4>
          <div className="space-y-1.5">
            {recentExams.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{e.title}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(e.date).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <span className={cn("text-xs font-bold", scoreColor(e.percent))}>
                  {e.score}/{e.maxScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
