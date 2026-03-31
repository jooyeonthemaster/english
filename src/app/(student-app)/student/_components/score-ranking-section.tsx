"use client";

import { useState, useCallback } from "react";
import { Flame, Trophy, TrendingUp, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSchoolRanking,
  getAcademyRanking,
} from "@/actions/learning-gamification";
import { type RankingTab } from "../_constants/home-constants";

interface RankingItem {
  rank: number;
  studentId: string;
  name: string;
  xp: number;
  isMe: boolean;
}

interface ScoreRankingSectionProps {
  analytics: { overallScore: number; level: string };
  stats: { streak: number; weekStudyDays: number };
  ranking: RankingItem[];
}

const GRADE_CONFIG: Record<string, { gradient: string; text: string }> = {
  S: { gradient: "from-amber-400 to-orange-500", text: "text-amber-50" },
  A: { gradient: "from-blue-500 to-indigo-600", text: "text-blue-50" },
  B: { gradient: "from-emerald-400 to-teal-600", text: "text-emerald-50" },
  C: { gradient: "from-orange-400 to-amber-500", text: "text-orange-50" },
  D: { gradient: "from-gray-300 to-gray-400", text: "text-gray-50" },
};

export default function ScoreRankingSection({ analytics, stats, ranking }: ScoreRankingSectionProps) {
  const [rankTab, setRankTab] = useState<RankingTab>("individual");
  const [myRank, setMyRank] = useState<{ rank: number; total: number; label: string } | null>(() => {
    const me = ranking.find((r) => r.isMe);
    return me
      ? { rank: me.rank, total: ranking.length, label: `${me.rank}위` }
      : { rank: 0, total: ranking.length, label: "-" };
  });

  const handleTabChange = useCallback(async (tab: RankingTab) => {
    setRankTab(tab);
    if (tab === "individual") {
      const me = ranking.find((r) => r.isMe);
      setMyRank(me
        ? { rank: me.rank, total: ranking.length, label: `${me.rank}위` }
        : { rank: 0, total: ranking.length, label: "-" }
      );
      return;
    }
    try {
      if (tab === "school") {
        const r = await getSchoolRanking();
        setMyRank({ rank: r[0] ? 1 : 0, total: r.length, label: r[0] ? "1위" : "-" });
      } else {
        const r = await getAcademyRanking();
        setMyRank({ rank: r[0] ? 1 : 0, total: r.length, label: r[0] ? "1위" : "-" });
      }
    } catch { setMyRank(null); }
  }, [ranking]);

  const grade = GRADE_CONFIG[analytics.level] ?? GRADE_CONFIG.D;

  return (
    <div className="flex flex-col gap-3">
      {/* 메인 점수 카드 — 풀폭 그래디언트 */}
      <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-6", grade.gradient)}>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className={cn("text-sm font-medium opacity-80", grade.text)}>나의 학습 점수</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-5xl font-black text-white tracking-tight">
                  {Math.round(analytics.overallScore)}
                </span>
                <span className="text-lg font-bold text-white/70">점</span>
              </div>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-3xl font-black text-white">{analytics.level}</span>
            </div>
          </div>

          {/* 스트릭 + 학습 상태 */}
          <div className="flex items-center gap-3">
            {stats.streak > 0 && (
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Flame className="w-4 h-4 text-white" />
                <span className="text-xs font-bold text-white">{stats.streak}일 연속</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <TrendingUp className="w-4 h-4 text-white" />
              <span className="text-xs font-bold text-white">
                {stats.weekStudyDays > 0 ? "오늘 학습 완료" : "오늘 미학습"}
              </span>
            </div>
          </div>
        </div>

        {/* 배경 장식 */}
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-4 -bottom-12 w-32 h-32 rounded-full bg-white/5" />
      </div>

      {/* 랭킹 카드 */}
      <div className="rounded-3xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        {/* 탭 */}
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
          {(["individual", "school", "academy"] as RankingTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-200",
                rankTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400",
              )}
            >
              {tab === "individual" ? "개인" : tab === "school" ? "학교" : "학원"}
            </button>
          ))}
        </div>

        {/* 랭킹 표시 */}
        <div className="flex items-center justify-center gap-4 py-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
            <Crown className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <p className="text-3xl font-black text-gray-900 tracking-tight">
              {myRank?.label ?? "-"}
            </p>
            {myRank && myRank.total > 0 && (
              <p className="text-sm text-gray-400 font-medium">전체 {myRank.total}명 중</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
