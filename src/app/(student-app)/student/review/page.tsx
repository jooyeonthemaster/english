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
} from "@/actions/student-app";

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
    <div className="px-[var(--space-md)] pt-[var(--space-sm)] pb-[var(--space-md)]">
      {/* Tabs */}
      <div className="flex gap-0.5 bg-gray-100 rounded-[var(--card-radius-sm)] p-0.5 mb-[var(--space-md)]">
        <TabButton active={tab === "wrong"} onClick={() => setTab("wrong")}>
          <FileQuestion className="size-[var(--icon-sm)]" />
          오답 복습
        </TabButton>
        <TabButton active={tab === "vocab"} onClick={() => setTab("vocab")}>
          <BookOpen className="size-[var(--icon-sm)]" />
          단어 학습
        </TabButton>
      </div>

      {loading ? (
        <div className="space-y-[var(--space-sm)] animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-[var(--card-radius)]" />
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
        "flex-1 flex items-center justify-center gap-1.5 py-2 text-[var(--text-xs)] font-medium rounded-[var(--card-radius-sm)] transition-all",
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
      <div className="flex gap-2 mb-[var(--space-sm)]">
        <button
          onClick={() => setSubTab("words")}
          className={cn(
            "px-3 py-1 text-[var(--text-xs)] rounded-full font-medium transition-colors",
            subTab === "words"
              ? "bg-[var(--student-primary)] text-white"
              : "bg-gray-100 text-gray-500",
          )}
        >
          단어 오답 ({words.length})
        </button>
        <button
          onClick={() => setSubTab("questions")}
          className={cn(
            "px-3 py-1 text-[var(--text-xs)] rounded-full font-medium transition-colors",
            subTab === "questions"
              ? "bg-[var(--student-primary)] text-white"
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
                className="bg-white rounded-[var(--card-radius)] border border-gray-100 p-[var(--space-sm)]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-sm)] font-bold text-gray-900">
                        {w.english}
                      </span>
                      {w.partOfSpeech && (
                        <span className="text-[var(--text-2xs)] text-gray-400 bg-gray-50 px-1 rounded">
                          {w.partOfSpeech}
                        </span>
                      )}
                    </div>
                    <p className="text-[var(--text-xs)] text-gray-500 mt-0.5">{w.korean}</p>
                  </div>
                  <span
                    className={cn(
                      "text-[var(--text-2xs)] font-bold px-2 py-0.5 rounded-full",
                      w.count >= 5
                        ? "bg-[var(--student-wrong-light)] text-[var(--student-wrong)]"
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
        <div className="space-y-[var(--space-md)]">
          {totalQuestions === 0 ? (
            <EmptyState message="틀린 문제가 없습니다" />
          ) : (
            Object.entries(questions).map(([cat, qs]) => (
              <div key={cat}>
                <h3 className="text-[var(--text-2xs)] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  {CATEGORY_LABELS[cat] ?? cat} ({qs.length})
                </h3>
                <div className="space-y-1.5">
                  {qs.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white rounded-[var(--card-radius)] border border-gray-100 overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedQ(expandedQ === q.id ? null : q.id)
                        }
                        className="w-full p-[var(--space-sm)] text-left flex items-start gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--text-xs)] font-medium text-gray-800 line-clamp-2">
                            {q.questionText}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {q.subCategory && (
                              <span className="text-[var(--text-2xs)] bg-[var(--student-primary-light)] text-[var(--student-primary)] px-1 rounded">
                                {q.subCategory}
                              </span>
                            )}
                            <span className="text-[var(--text-2xs)] text-[var(--student-wrong)] font-bold">
                              {q.count}회 오답
                            </span>
                          </div>
                        </div>
                        {expandedQ === q.id ? (
                          <ChevronUp className="size-[var(--icon-sm)] text-gray-400 mt-0.5" />
                        ) : (
                          <ChevronDown className="size-[var(--icon-sm)] text-gray-400 mt-0.5" />
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
                            <div className="px-[var(--space-sm)] pb-[var(--space-sm)] border-t border-gray-50 pt-2 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-[var(--student-wrong-light)] rounded-[var(--card-radius-sm)] p-2">
                                  <p className="text-[var(--text-2xs)] text-[var(--student-wrong)]">내 답</p>
                                  <p className="text-[var(--text-xs)] text-red-600 font-medium">
                                    {q.givenAnswer}
                                  </p>
                                </div>
                                <div className="bg-[var(--student-success-light)] rounded-[var(--card-radius-sm)] p-2">
                                  <p className="text-[var(--text-2xs)] text-[var(--student-success)]">정답</p>
                                  <p className="text-[var(--text-xs)] text-emerald-600 font-medium">
                                    {q.correctAnswer}
                                  </p>
                                </div>
                              </div>
                              {q.explanation && (
                                <div className="bg-[var(--student-primary-light)] rounded-[var(--card-radius-sm)] p-2">
                                  <p className="text-[var(--text-xs)] text-blue-700 leading-relaxed">
                                    {q.explanation}
                                  </p>
                                </div>
                              )}
                              {q.keyPoints?.map((pt, pi) => (
                                <div key={pi} className="flex items-start gap-1.5">
                                  <AlertCircle className="size-3 text-[var(--student-accent)] mt-0.5 shrink-0" />
                                  <p className="text-[var(--text-xs)] text-gray-600">{pt}</p>
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
      <div className="relative mb-[var(--space-sm)]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-[var(--icon-sm)] text-gray-400" />
        <input
          type="text"
          placeholder="단어장 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-[var(--card-radius-sm)] text-[var(--text-xs)] focus:outline-none focus:ring-2 focus:ring-[var(--student-primary)]/20 focus:border-[var(--student-primary)]"
        />
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-[var(--space-xl)]">
          <BookOpen className="size-10 text-gray-200 mx-auto" />
          <p className="text-[var(--text-xs)] text-gray-400 mt-2">단어장이 없습니다</p>
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
                className="flex items-center gap-3 p-[var(--space-sm)] bg-white rounded-[var(--card-radius)] border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <div className="size-9 rounded-[var(--card-radius-sm)] bg-[var(--student-primary-light)] flex items-center justify-center">
                  <BookOpen className="size-[var(--icon-sm)] text-[var(--student-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--text-sm)] font-medium text-gray-800 truncate">
                    {list.title}
                  </p>
                  <span className="text-[var(--text-2xs)] text-gray-400">
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
                            ? "text-[var(--student-success)]"
                            : list.lastScore >= 70
                              ? "text-[var(--student-primary)]"
                              : "text-[var(--student-accent)]",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[var(--text-2xs)] font-bold",
                          list.lastScore >= 90
                            ? "text-[var(--student-success)]"
                            : list.lastScore >= 70
                              ? "text-[var(--student-primary)]"
                              : "text-[var(--student-accent)]",
                        )}
                      >
                        {Math.round(list.lastScore)}%
                      </span>
                    </div>
                  )}
                  <ChevronRight className="size-[var(--icon-sm)] text-gray-300" />
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
    <div className="text-center py-[var(--space-xl)]">
      <div className="size-12 rounded-full bg-[var(--student-success-light)] flex items-center justify-center mx-auto">
        <span className="text-[var(--text-xl)]">🎉</span>
      </div>
      <p className="text-[var(--text-xs)] text-gray-500 mt-2 font-medium">{message}</p>
      <p className="text-[var(--text-2xs)] text-gray-400 mt-0.5">
        완벽해요! 계속 유지하세요
      </p>
    </div>
  );
}
