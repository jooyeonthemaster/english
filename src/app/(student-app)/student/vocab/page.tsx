"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Search,
  ChevronRight,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getVocabListsForStudent } from "@/actions/student-app-vocab";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VocabList {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  wordCount: number;
  lastScore: number | null;
  lastTestDate: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function VocabListPage() {
  const [lists, setLists] = useState<VocabList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState<number | null>(null);

  useEffect(() => {
    const filters: { grade?: number; search?: string } = {};
    if (filterGrade) filters.grade = filterGrade;
    if (search.trim()) filters.search = search.trim();

    setLoading(true);
    getVocabListsForStudent(filters)
      .then(setLists)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterGrade, search]);

  // Group by grade
  const grouped = lists.reduce<Record<string, VocabList[]>>((acc, list) => {
    const key = list.grade ? `${list.grade}학년` : "기타";
    if (!acc[key]) acc[key] = [];
    acc[key].push(list);
    return acc;
  }, {});

  return (
    <div className="px-5 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/student" className="press-scale">
          <ArrowLeft className="size-5 text-gray-600" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">단어 시험</h1>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <input
          type="text"
          placeholder="단어장 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      </div>

      {/* Grade Filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto hide-scrollbar">
        <button
          onClick={() => setFilterGrade(null)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
            filterGrade === null
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-500"
          )}
        >
          전체
        </button>
        {[1, 2, 3].map((g) => (
          <button
            key={g}
            onClick={() => setFilterGrade(filterGrade === g ? null : g)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              filterGrade === g
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-500"
            )}
          >
            {g}학년
          </button>
        ))}
      </div>

      {/* Lists */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="size-12 text-gray-200 mx-auto" />
          <p className="text-sm text-gray-400 mt-3">단어장이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([grade, items]) => (
            <div key={grade}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {grade}
              </h2>
              <div className="space-y-2">
                {items.map((list, i) => (
                  <motion.div
                    key={list.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <Link
                      href={`/student/vocab/${list.id}/test`}
                      className="flex items-center gap-3 p-4 bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] press-scale transition-shadow hover:shadow-lg"
                    >
                      <div className="size-11 rounded-xl bg-blue-50 flex items-center justify-center">
                        <BookOpen className="size-5 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {list.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            {list.wordCount}단어
                          </span>
                          {list.unit && (
                            <span className="text-xs text-gray-400">
                              {list.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {list.lastScore !== null && (
                          <div className="flex items-center gap-1">
                            <CheckCircle2
                              className={cn(
                                "size-3.5",
                                list.lastScore >= 90
                                  ? "text-emerald-400"
                                  : list.lastScore >= 70
                                    ? "text-blue-400"
                                    : "text-amber-400"
                              )}
                            />
                            <span
                              className={cn(
                                "text-xs font-bold",
                                list.lastScore >= 90
                                  ? "text-emerald-500"
                                  : list.lastScore >= 70
                                    ? "text-blue-500"
                                    : "text-amber-500"
                              )}
                            >
                              {Math.round(list.lastScore)}%
                            </span>
                          </div>
                        )}
                        <ChevronRight className="size-4 text-gray-300" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
