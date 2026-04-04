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
      {/* 메인 XP 카드 — 6:3:1 (화이트 카드 + 블랙 텍스트 + 키컬러 포인트) */}
      <div
        className="rounded-3xl bg-white p-6"
        style={{ boxShadow: "0 2px 12px color-mix(in srgb, var(--key-color) 12%, transparent)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[var(--fs-sm)] font-medium text-black">이번 주 XP</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[var(--fs-2xl)] font-black tracking-tight" style={{ color: "var(--key-color)" }}>
                {xp.weekly.toLocaleString()}
              </span>
              <span className="text-[var(--fs-lg)] font-bold text-black">XP</span>
            </div>
            <p className="text-[var(--fs-xs)] text-black mt-1">
              누적 {xp.total.toLocaleString()} XP
            </p>
          </div>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
          >
            <Zap className="w-[var(--icon-lg)] h-[var(--icon-lg)]" style={{ color: "var(--key-color)" }} />
          </div>
        </div>

        {/* 스트릭 + 학습 상태 */}
        <div className="flex items-center gap-3">
          {stats.streak > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
            >
              <Flame className="w-[var(--icon-xs)] h-[var(--icon-xs)]" style={{ color: "var(--key-color)" }} />
              <span className="text-[var(--fs-xs)] font-bold text-black">{stats.streak}일 연속</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full">
            <TrendingUp className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-black" />
            <span className="text-[var(--fs-xs)] font-bold text-black">
              {stats.weekStudyDays > 0 ? "오늘 학습 완료" : "오늘 미학습"}
            </span>
          </div>
        </div>
      </div>

      {/* 랭킹 카드 */}
      <div
        className="rounded-3xl bg-white p-5"
        style={{ boxShadow: "0 2px 12px color-mix(in srgb, var(--key-color) 12%, transparent)" }}
      >
        {/* 탭 */}
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
          {(["individual", "school", "academy"] as RankingTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "flex-1 py-2.5 text-[var(--fs-sm)] font-semibold rounded-xl transition-all duration-200",
                rankTab === tab
                  ? "bg-white text-black shadow-sm"
                  : "text-black",
              )}
            >
              {tab === "individual" ? "개인" : tab === "school" ? "학교" : "학원"}
            </button>
          ))}
        </div>

        {/* 랭킹 표시 */}
        <div className="flex items-center justify-center gap-4 py-2">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Crown className="w-[var(--icon-lg)] h-[var(--icon-lg)] text-black" />
          </div>
          <div>
            <p className="text-[var(--fs-xl)] font-black text-black tracking-tight">
              {myRank?.label ?? "-"}
            </p>
            {myRank && myRank.total > 0 && (
              <p className="text-[var(--fs-sm)] text-black font-medium">전체 {myRank.total}명 중</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
