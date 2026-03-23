"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  FileQuestion,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getWrongVocabWords, getWrongQuestions } from "@/actions/student-app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WrongWord {
  id: string;
  itemId: string;
  english: string;
  korean: string;
  partOfSpeech: string | null;
  listTitle: string;
  testType: string;
  givenAnswer: string;
  count: number;
  lastMissedAt: string;
}

interface WrongQuestion {
  id: string;
  questionId: string;
  questionText: string;
  questionType: string;
  options: { label: string; text: string }[] | null;
  correctAnswer: string;
  givenAnswer: string;
  category: string | null;
  subCategory: string | null;
  count: number;
  lastWrongAt: string;
  explanation: string | null;
  keyPoints: string[] | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function WrongAnswersPage() {
  const [tab, setTab] = useState<"vocab" | "questions">("vocab");
  const [wrongWords, setWrongWords] = useState<WrongWord[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getWrongVocabWords(), getWrongQuestions()])
      .then(([w, q]) => {
        setWrongWords(w);
        setWrongQuestions(q);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Group questions by category
  const categoryLabels: Record<string, string> = {
    GRAMMAR: "문법",
    VOCAB: "어휘",
    READING: "독해",
    WRITING: "서술형",
  };

  const groupedQuestions = wrongQuestions.reduce<Record<string, WrongQuestion[]>>(
    (acc, q) => {
      const key = q.category ?? "기타";
      if (!acc[key]) acc[key] = [];
      acc[key].push(q);
      return acc;
    },
    {}
  );

  return (
    <div className="px-5 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/student" className="press-scale">
          <ArrowLeft className="size-5 text-gray-600" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">오답 노트</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab("vocab")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg transition-all",
            tab === "vocab"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          )}
        >
          <BookOpen className="size-4" />
          단어 오답
        </button>
        <button
          onClick={() => setTab("questions")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg transition-all",
            tab === "questions"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          )}
        >
          <FileQuestion className="size-4" />
          문제 오답
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {tab === "vocab" && (
            <motion.div
              key="vocab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              {wrongWords.length === 0 ? (
                <EmptyState message="틀린 단어가 없습니다" />
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    총 {wrongWords.length}개의 틀린 단어 (오답 횟수순)
                  </p>
                  {wrongWords.map((word, i) => (
                    <motion.div
                      key={word.id}
                      className="bg-white rounded-2xl border border-gray-100 shadow-card p-4"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-gray-900">
                              {word.english}
                            </p>
                            {word.partOfSpeech && (
                              <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                {word.partOfSpeech}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {word.korean}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[11px] text-gray-400">
                              {word.listTitle}
                            </span>
                            <span className="text-[11px] text-gray-300">|</span>
                            <span className="text-[11px] text-gray-400">
                              {word.testType === "EN_TO_KR"
                                ? "영→한"
                                : word.testType === "KR_TO_EN"
                                  ? "한→영"
                                  : "스펠링"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-bold",
                              word.count >= 5
                                ? "bg-red-100 text-red-600"
                                : word.count >= 3
                                  ? "bg-amber-100 text-amber-600"
                                  : "bg-gray-100 text-gray-600"
                            )}
                          >
                            {word.count}회
                          </span>
                        </div>
                      </div>
                      {word.givenAnswer && (
                        <div className="mt-2 pt-2 border-t border-gray-50">
                          <p className="text-xs text-red-400">
                            내 답: <span className="line-through">{word.givenAnswer}</span>
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </>
              )}
            </motion.div>
          )}

          {tab === "questions" && (
            <motion.div
              key="questions"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-5"
            >
              {wrongQuestions.length === 0 ? (
                <EmptyState message="틀린 문제가 없습니다" />
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    총 {wrongQuestions.length}개의 오답
                  </p>
                  {Object.entries(groupedQuestions).map(([category, questions]) => (
                    <div key={category}>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        {categoryLabels[category] ?? category} ({questions.length})
                      </h3>
                      <div className="space-y-2">
                        {questions.map((q, i) => (
                          <motion.div
                            key={q.id}
                            className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                          >
                            <button
                              onClick={() =>
                                setExpandedQuestion(
                                  expandedQuestion === q.id ? null : q.id
                                )
                              }
                              className="w-full p-4 text-left"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 line-clamp-2">
                                    {q.questionText}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    {q.subCategory && (
                                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                        {q.subCategory}
                                      </span>
                                    )}
                                    <span
                                      className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded font-bold",
                                        q.count >= 3
                                          ? "bg-red-100 text-red-600"
                                          : "bg-gray-100 text-gray-500"
                                      )}
                                    >
                                      {q.count}회 오답
                                    </span>
                                  </div>
                                </div>
                                {expandedQuestion === q.id ? (
                                  <ChevronUp className="size-4 text-gray-400 shrink-0 mt-1" />
                                ) : (
                                  <ChevronDown className="size-4 text-gray-400 shrink-0 mt-1" />
                                )}
                              </div>
                            </button>

                            <AnimatePresence>
                              {expandedQuestion === q.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                                    {/* Your answer vs correct */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="bg-red-50 rounded-lg p-2.5">
                                        <p className="text-[10px] text-red-400 font-medium">
                                          내 답
                                        </p>
                                        <p className="text-xs text-red-600 mt-0.5 font-medium">
                                          {q.givenAnswer}
                                        </p>
                                      </div>
                                      <div className="bg-emerald-50 rounded-lg p-2.5">
                                        <p className="text-[10px] text-emerald-400 font-medium">
                                          정답
                                        </p>
                                        <p className="text-xs text-emerald-600 mt-0.5 font-medium">
                                          {q.correctAnswer}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Explanation */}
                                    {q.explanation && (
                                      <div className="bg-blue-50 rounded-lg p-3">
                                        <p className="text-[10px] text-blue-400 font-medium mb-1">
                                          해설
                                        </p>
                                        <p className="text-xs text-blue-700 leading-relaxed">
                                          {q.explanation}
                                        </p>
                                      </div>
                                    )}

                                    {/* Key Points */}
                                    {q.keyPoints && q.keyPoints.length > 0 && (
                                      <div className="space-y-1">
                                        {q.keyPoints.map((point, pi) => (
                                          <div
                                            key={pi}
                                            className="flex items-start gap-2"
                                          >
                                            <AlertCircle className="size-3 text-amber-500 mt-0.5 shrink-0" />
                                            <p className="text-xs text-gray-600">
                                              {point}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <div className="size-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
        <span className="text-2xl">🎉</span>
      </div>
      <p className="text-sm text-gray-500 mt-3 font-medium">{message}</p>
      <p className="text-xs text-gray-400 mt-1">
        완벽해요! 계속 유지하세요
      </p>
    </div>
  );
}
