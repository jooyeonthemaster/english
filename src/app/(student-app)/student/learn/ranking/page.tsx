"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, School, Building2, Medal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getIndividualRanking,
  getSchoolRanking,
  getAcademyRanking,
} from "@/actions/learning-gamification";
import type {
  RankingEntry,
  SchoolRankingEntry,
  AcademyRankingEntry,
} from "@/lib/learning-types";

type Tab = "individual" | "school" | "academy";

const TABS: { value: Tab; label: string; icon: typeof User }[] = [
  { value: "individual", label: "개인", icon: User },
  { value: "school", label: "학교", icon: School },
  { value: "academy", label: "학원", icon: Building2 },
];

const RANK_MEDALS = ["", "🥇", "🥈", "🥉"];

export default function RankingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("individual");
  const [individualData, setIndividualData] = useState<{
    top5: RankingEntry[];
    myRank: RankingEntry | null;
  } | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolRankingEntry[] | null>(null);
  const [academyData, setAcademyData] = useState<AcademyRankingEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (tab === "individual" && !individualData) {
          const data = await getIndividualRanking();
          setIndividualData(data);
        } else if (tab === "school" && !schoolData) {
          const data = await getSchoolRanking();
          setSchoolData(data);
        } else if (tab === "academy" && !academyData) {
          const data = await getAcademyRanking();
          setAcademyData(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tab, individualData, schoolData, academyData]);

  return (
    <div className="max-w-lg mx-auto pb-8">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <button onClick={() => router.back()} className="mb-3 p-1 -ml-1">
          <ArrowLeft className="size-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="size-5 text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900">주간 랭킹</h1>
        </div>
        <p className="text-xs text-gray-500">매주 월요일 초기화</p>
      </div>

      {/* Tabs */}
      <div className="px-5 mb-4">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
                tab === t.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tab === "individual" && individualData ? (
          <IndividualTab data={individualData} />
        ) : tab === "school" && schoolData ? (
          <GenericTab
            entries={schoolData.map((s) => ({
              rank: s.rank,
              name: s.schoolName,
              xp: s.averageXp,
              sub: `${s.studentCount}명`,
            }))}
          />
        ) : tab === "academy" && academyData ? (
          <GenericTab
            entries={academyData.map((a) => ({
              rank: a.rank,
              name: a.academyName,
              xp: a.averageXp,
              sub: `${a.studentCount}명`,
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual Tab
// ---------------------------------------------------------------------------

function IndividualTab({
  data,
}: {
  data: { top5: RankingEntry[]; myRank: RankingEntry | null };
}) {
  return (
    <div>
      {/* Top 5 */}
      <div className="space-y-2">
        {data.top5.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "flex items-center gap-3 rounded-xl p-3.5",
              entry.isMe ? "bg-blue-50 border border-blue-200" : "bg-gray-50",
              entry.rank <= 3 && "bg-amber-50/50"
            )}
          >
            <span className="w-8 text-center text-lg">
              {entry.rank <= 3 ? RANK_MEDALS[entry.rank] : (
                <span className="text-sm font-bold text-gray-400">{entry.rank}</span>
              )}
            </span>
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="size-4 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className={cn("text-sm font-semibold", entry.isMe && "text-blue-600")}>
                {entry.name} {entry.isMe && "(나)"}
              </p>
            </div>
            <span className="text-sm font-bold text-gray-700">{entry.weeklyXp} XP</span>
          </motion.div>
        ))}
      </div>

      {/* My rank (if not in top 5) */}
      {data.myRank && !data.top5.some((e) => e.isMe) && (
        <>
          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">...</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="flex items-center gap-3 rounded-xl p-3.5 bg-blue-50 border border-blue-200">
            <span className="w-8 text-center text-sm font-bold text-gray-400">
              {data.myRank.rank}
            </span>
            <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
              <User className="size-4 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-600">{data.myRank.name} (나)</p>
            </div>
            <span className="text-sm font-bold text-blue-600">{data.myRank.weeklyXp} XP</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic Tab (School / Academy)
// ---------------------------------------------------------------------------

function GenericTab({
  entries,
}: {
  entries: { rank: number; name: string; xp: number; sub: string }[];
}) {
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <motion.div
          key={`${entry.rank}-${entry.name}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={cn(
            "flex items-center gap-3 rounded-xl p-3.5",
            entry.rank <= 3 ? "bg-amber-50/50" : "bg-gray-50"
          )}
        >
          <span className="w-8 text-center text-lg">
            {entry.rank <= 3 ? RANK_MEDALS[entry.rank] : (
              <span className="text-sm font-bold text-gray-400">{entry.rank}</span>
            )}
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">{entry.name}</p>
            <p className="text-xs text-gray-400">{entry.sub}</p>
          </div>
          <span className="text-sm font-bold text-gray-700">
            평균 {entry.xp} XP
          </span>
        </motion.div>
      ))}
      {entries.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">아직 데이터가 없어요</p>
      )}
    </div>
  );
}
