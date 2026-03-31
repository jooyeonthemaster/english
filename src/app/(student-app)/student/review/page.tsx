"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  FileQuestion,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getWrongVocabWords,
  getWrongQuestions,
  getVocabListsForStudent,
} from "@/actions/student-app-vocab";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WrongWord {
  id: string;
  english: string;
  korean: string;
  partOfSpeech: string | null;
  listTitle: string;
  testType: string;
  givenAnswer: string;
  count: number;
}

interface WrongQuestion {
  id: string;
  questionText: string;
  correctAnswer: string;
  givenAnswer: string;
  category: string | null;
  subCategory: string | null;
  count: number;
  explanation: string | null;
  keyPoints: string[] | null;
}

interface VocabList {
  id: string;
  title: string;
  grade: number | null;
  wordCount: number;
  lastScore: number | null;
}

type Tab = "wrong" | "vocab";

const CATEGORY_LABELS: Record<string, string> = {
  GRAMMAR: "문법",
  VOCAB: "어휘",
  READING: "독해",
  WRITING: "서술형",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ReviewPage() {
  const [tab, setTab] = useState<Tab>("wrong");
  const [wrongWords, setWrongWords] = useState<WrongWord[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [vocabLists, setVocabLists] = useState<VocabList[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      getWrongVocabWords(),
      getWrongQuestions(),
      getVocabListsForStudent(),
    ])
      .then(([w, q, v]) => {
        setWrongWords(w);
        setWrongQuestions(q);
        setVocabLists(v);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const groupedQuestions = wrongQuestions.reduce<Record<string, WrongQuestion[]>>(
    (acc, q) => {
      const key = q.category ?? "기타";
      if (!acc[key]) acc[key] = [];
      acc[key].push(q);
      return acc;
    },
    {},
  );

  const filteredVocab = vocabLists.filter(
    (v) => !search.trim() || v.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="px-5 pt-3 pb-5">
      {/* Tabs */}
      <div className="flex gap-0.5 bg-gray-100 rounded-xl p-0.5 mb-5">
        <TabButton active={tab === "wrong"} onClick={() => setTab("wrong")}>
          <FileQuestion className="w-4 h-4" />
          오답 복습
        </TabButton>
        <TabButton active={tab === "vocab"} onClick={() => setTab("vocab")}>
          <BookOpen className="w-4 h-4" />
          단어 학습
        </TabButton>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-3xl" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {tab === "wrong" && (
            <WrongTab
              key="wrong"
              words={wrongWords}
              questions={groupedQuestions}
              totalQuestions={wrongQuestions.length}
              expandedQ={expandedQ}
              setExpandedQ={setExpandedQ}
            />
          )}
          {tab === "vocab" && (
            <VocabTab
              key="vocab"
              lists={filteredVocab}
              search={search}
              setSearch={setSearch}
            />
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all active:scale-95",
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Wrong Answers Tab
// ---------------------------------------------------------------------------
function WrongTab({
  words,
  questions,
  totalQuestions,
  expandedQ,
  setExpandedQ,
}: {
  words: WrongWord[];
  questions: Record<string, WrongQuestion[]>;
  totalQuestions: number;
  expandedQ: string | null;
  setExpandedQ: (id: string | null) => void;
}) {
  const [subTab, setSubTab] = useState<"words" | "questions">("words");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Sub tabs */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSubTab("words")}
          className={cn(
            "px-3 py-1 text-xs rounded-full font-medium transition-colors active:scale-95",
            subTab === "words"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-500",
          )}
        >
          단어 오답 ({words.length})
        </button>
        <button
          onClick={() => setSubTab("questions")}
          className={cn(
            "px-3 py-1 text-xs rounded-full font-medium transition-colors active:scale-95",
            subTab === "questions"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-500",
          )}
        >
          문제 오답 ({totalQuestions})
        </button>
      </div>

      {subTab === "words" && (
        <div className="space-y-2">
          {words.length === 0 ? (
            <EmptyState message="틀린 단어가 없습니다" />
          ) : (
            words.map((w, i) => (
              <motion.div
                key={w.id}
                className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        {w.english}
                      </span>
                      {w.partOfSpeech && (
                        <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded">
                          {w.partOfSpeech}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{w.korean}</p>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      w.count >= 5
                        ? "bg-red-50 text-red-500"
                        : w.count >= 3
                          ? "bg-amber-100 text-amber-600"
                          : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {w.count}회
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {subTab === "questions" && (
        <div className="space-y-5">
          {totalQuestions === 0 ? (
            <EmptyState message="틀린 문제가 없습니다" />
          ) : (
            Object.entries(questions).map(([cat, qs]) => (
              <div key={cat}>
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  {CATEGORY_LABELS[cat] ?? cat} ({qs.length})
                </h3>
                <div className="space-y-1.5">
                  {qs.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedQ(expandedQ === q.id ? null : q.id)
                        }
                        className="w-full p-5 text-left flex items-start gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 line-clamp-2">
                            {q.questionText}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {q.subCategory && (
                              <span className="text-[10px] bg-blue-50 text-blue-500 px-1 rounded">
                                {q.subCategory}
                              </span>
                            )}
                            <span className="text-[10px] text-red-500 font-bold">
                              {q.count}회 오답
                            </span>
                          </div>
                        </div>
                        {expandedQ === q.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400 mt-0.5" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 mt-0.5" />
                        )}
                      </button>
                      <AnimatePresence>
                        {expandedQ === q.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5 border-t border-gray-50 pt-2 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-red-50 rounded-xl p-2">
                                  <p className="text-[10px] text-red-500">내 답</p>
                                  <p className="text-xs text-red-600 font-medium">
                                    {q.givenAnswer}
                                  </p>
                                </div>
                                <div className="bg-emerald-50 rounded-xl p-2">
                                  <p className="text-[10px] text-emerald-500">정답</p>
                                  <p className="text-xs text-emerald-600 font-medium">
                                    {q.correctAnswer}
                                  </p>
                                </div>
                              </div>
                              {q.explanation && (
                                <div className="bg-blue-50 rounded-xl p-2">
                                  <p className="text-xs text-blue-700 leading-relaxed">
                                    {q.explanation}
                                  </p>
                                </div>
                              )}
                              {q.keyPoints?.map((pt, pi) => (
                                <div key={pi} className="flex items-start gap-1.5">
                                  <AlertCircle className="size-3 text-amber-500 mt-0.5 shrink-0" />
                                  <p className="text-xs text-gray-600">{pt}</p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Vocab Tab
// ---------------------------------------------------------------------------
function VocabTab({
  lists,
  search,
  setSearch,
}: {
  lists: VocabList[];
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="단어장 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="size-10 text-gray-200 mx-auto" />
          <p className="text-xs text-gray-400 mt-2">단어장이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {lists.map((list, i) => (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <Link
                href={`/student/vocab/${list.id}/test`}
                className="flex items-center gap-3 p-5 bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-95 transition-transform"
              >
                <div className="size-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {list.title}
                  </p>
                  <span className="text-[10px] text-gray-400">
                    {list.wordCount}단어
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {list.lastScore !== null && (
                    <div className="flex items-center gap-0.5">
                      <CheckCircle2
                        className={cn(
                          "size-3",
                          list.lastScore >= 90
                            ? "text-emerald-500"
                            : list.lastScore >= 70
                              ? "text-blue-500"
                              : "text-amber-500",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-bold",
                          list.lastScore >= 90
                            ? "text-emerald-500"
                            : list.lastScore >= 70
                              ? "text-blue-500"
                              : "text-amber-500",
                        )}
                      >
                        {Math.round(list.lastScore)}%
                      </span>
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <div className="size-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
        <span className="text-xl">🎉</span>
      </div>
      <p className="text-xs text-gray-500 mt-2 font-medium">{message}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">
        완벽해요! 계속 유지하세요
      </p>
    </div>
  );
}
