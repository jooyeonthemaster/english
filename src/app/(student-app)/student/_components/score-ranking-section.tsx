"use client";

import { useState, useCallback } from "react";
import { Flame, Trophy, TrendingUp, Crown, Zap } from "lucide-react";
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
  xp: { total: number; weekly: number };
  stats: { streak: number; weekStudyDays: number };
  ranking: RankingItem[];
}

export default function ScoreRankingSection({ xp, stats, ranking }: ScoreRankingSectionProps) {
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

  return (
    <div className="flex flex-col gap-3">
      {/* 메인 XP 카드 */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[var(--fs-sm)] font-medium text-blue-100/80">이번 주 XP</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[var(--fs-2xl)] font-black text-white tracking-tight">
                  {xp.weekly.toLocaleString()}
                </span>
                <span className="text-[var(--fs-lg)] font-bold text-white/70">XP</span>
              </div>
              <p className="text-[var(--fs-xs)] text-white/70 mt-1">
                누적 {xp.total.toLocaleString()} XP
              </p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Zap className="w-[var(--icon-lg)] h-[var(--icon-lg)] text-white" />
            </div>
          </div>

          {/* 스트릭 + 학습 상태 */}
          <div className="flex items-center gap-3">
            {stats.streak > 0 && (
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Flame className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-white" />
                <span className="text-[var(--fs-xs)] font-bold text-white">{stats.streak}일 연속</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <TrendingUp className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-white" />
              <span className="text-[var(--fs-xs)] font-bold text-white">
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
                "flex-1 py-2.5 text-[var(--fs-sm)] font-semibold rounded-xl transition-all duration-200",
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
            <Crown className="w-[var(--icon-lg)] h-[var(--icon-lg)] text-amber-500" />
          </div>
          <div>
            <p className="text-[var(--fs-xl)] font-black text-gray-900 tracking-tight">
              {myRank?.label ?? "-"}
            </p>
            {myRank && myRank.total > 0 && (
              <p className="text-[var(--fs-sm)] text-gray-500 font-medium">전체 {myRank.total}명 중</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
