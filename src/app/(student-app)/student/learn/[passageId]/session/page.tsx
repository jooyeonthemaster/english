"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ChevronRight, ChevronDown, Sparkles, AlertCircle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { startSession, submitSession } from "@/actions/learning-session";
import { checkDailyMission } from "@/actions/learning-gamification";
import type { SessionStartData, SessionQuestion, SessionResult } from "@/lib/learning-types";
import type { SessionType } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const passageId = params.passageId as string;
  const sessionType = searchParams.get("type") as SessionType;
  const seasonId = searchParams.get("seasonId") ?? undefined;

  const [data, setData] = useState<SessionStartData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, { answer: string; correct: boolean }>>(
    new Map()
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(new Date().toISOString());

  // 틀린 문제 재출제 큐
  const [retryQueue, setRetryQueue] = useState<SessionQuestion[]>([]);
  // 지문 펼침 상태
  const [passageOpen, setPassageOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const sessionData = await startSession(passageId, sessionType, seasonId);
        setData(sessionData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [passageId, sessionType, seasonId]);

  // 현재 문제 (원래 문제 + 재출제 큐)
  const allQuestions = data ? [...data.questions, ...retryQueue] : [];
  const currentQuestion = allQuestions[currentIndex] ?? null;
  const totalOriginal = data?.questions.length ?? 0;
  const progress = totalOriginal > 0 ? Math.min(currentIndex / totalOriginal, 1) : 0;

  // 문제 바뀔 때 지문 필요한 문제면 자동 펼침
  useEffect(() => {
    if (currentQuestion?.includesPassage) {
      setPassageOpen(true);
    } else {
      setPassageOpen(false);
    }
  }, [currentQuestion?.id, currentQuestion?.includesPassage]);

  const handleSelect = useCallback(
    (option: string) => {
      if (showFeedback || !currentQuestion) return;

      setSelectedOption(option);
      const correct = option.trim() === currentQuestion.correctAnswer.trim();
      setIsCorrect(correct);
      setShowFeedback(true);

      // 기록 (첫 시도만)
      if (!answers.has(currentQuestion.id)) {
        setAnswers((prev) => {
          const next = new Map(prev);
          next.set(currentQuestion.id, { answer: option, correct });
          return next;
        });
      }

      // 틀리면 재출제 큐에 추가
      if (!correct) {
        setRetryQueue((prev) => [...prev, currentQuestion]);
      }
    },
    [showFeedback, currentQuestion, answers]
  );

  const handleNext = useCallback(async () => {
    setShowFeedback(false);
    setSelectedOption(null);

    const nextIndex = currentIndex + 1;

    if (nextIndex >= allQuestions.length) {
      // 세션 완료
      setSubmitting(true);
      try {
        const answerList = Array.from(answers.entries()).map(([questionId, { answer, correct }]) => ({
          questionId,
          givenAnswer: answer,
          isCorrect: correct,
        }));

        const sessionResult = await submitSession({
          passageId,
          sessionType,
          seasonId,
          answers: answerList,
          startedAt,
        });

        // 미션 체크
        await checkDailyMission();

        setResult(sessionResult);
      } catch (err) {
        console.error(err);
      } finally {
        setSubmitting(false);
      }
    } else {
      setCurrentIndex(nextIndex);
    }
  }, [currentIndex, allQuestions.length, answers, passageId, sessionType, seasonId, startedAt]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || !currentQuestion) {
    if (result) return <ResultScreen result={result} passageId={passageId} />;
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        문제를 불러올 수 없습니다
      </div>
    );
  }

  if (result) return <ResultScreen result={result} passageId={passageId} />;

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="size-5" />
        </button>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-xs text-gray-400 font-medium tabular-nums">
          {Math.min(currentIndex + 1, totalOriginal)}/{totalOriginal}
        </span>
      </div>

      {/* Question */}
      <div className="flex-1 px-5 pt-4 pb-6 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentQuestion.id}-${currentIndex}`}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            {/* Passage card */}
            {data.passageContent && (
              <PassageCard
                content={currentQuestion.passageSnippet || data.passageContent}
                open={passageOpen}
                onToggle={() => setPassageOpen((v) => !v)}
                highlighted={currentQuestion.includesPassage}
              />
            )}

            {/* Question text */}
            <p className="text-base font-semibold text-gray-900 mb-6 leading-relaxed">
              {currentQuestion.questionText}
            </p>

            {/* Options */}
            {currentQuestion.options && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOption === opt.text;
                  const isAnswer = opt.text.trim() === currentQuestion.correctAnswer.trim();

                  return (
                    <button
                      key={opt.label}
                      onClick={() => handleSelect(opt.text)}
                      disabled={showFeedback}
                      className={cn(
                        "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                        showFeedback
                          ? isAnswer
                            ? "border-emerald-400 bg-emerald-50"
                            : isSelected
                              ? "border-rose-400 bg-rose-50"
                              : "border-gray-100 bg-gray-50 opacity-50"
                          : isSelected
                            ? "border-blue-400 bg-blue-50"
                            : "border-gray-200 bg-white active:border-blue-300 active:bg-blue-50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                            showFeedback
                              ? isAnswer
                                ? "bg-emerald-500 text-white"
                                : isSelected
                                  ? "bg-rose-500 text-white"
                                  : "bg-gray-200 text-gray-400"
                              : isSelected
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-500"
                          )}
                        >
                          {opt.label}
                        </span>
                        <span
                          className={cn(
                            "text-sm leading-relaxed",
                            showFeedback && isAnswer
                              ? "text-emerald-700 font-medium"
                              : showFeedback && isSelected
                                ? "text-rose-700"
                                : "text-gray-700"
                          )}
                        >
                          {opt.text}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Short answer (no options) */}
            {!currentQuestion.options && (
              <ShortAnswerInput
                onSubmit={handleSelect}
                disabled={showFeedback}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Feedback bar */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "mt-auto rounded-2xl p-4",
                isCorrect ? "bg-emerald-50" : "bg-rose-50"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {isCorrect ? (
                  <Check className="size-5 text-emerald-500" />
                ) : (
                  <AlertCircle className="size-5 text-rose-500" />
                )}
                <span
                  className={cn(
                    "text-sm font-bold",
                    isCorrect ? "text-emerald-700" : "text-rose-700"
                  )}
                >
                  {isCorrect ? "정답!" : "오답"}
                </span>
              </div>
              {!isCorrect && (
                <p className="text-xs text-rose-600 mb-1">
                  정답: {currentQuestion.correctAnswer}
                </p>
              )}
              <button
                onClick={handleNext}
                disabled={submitting}
                className={cn(
                  "w-full mt-2 py-3 rounded-xl font-bold text-sm text-white transition-all",
                  isCorrect
                    ? "bg-emerald-500 active:bg-emerald-600"
                    : "bg-rose-500 active:bg-rose-600",
                  submitting && "opacity-50"
                )}
              >
                {submitting ? "제출 중..." : "계속"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passage Card (접을 수 있는 지문 영역)
// ---------------------------------------------------------------------------

function PassageCard({
  content,
  open,
  onToggle,
  highlighted,
}: {
  content: string;
  open: boolean;
  onToggle: () => void;
  highlighted: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-4 rounded-xl border transition-colors",
        highlighted
          ? "border-blue-200 bg-blue-50/50"
          : "border-gray-200 bg-gray-50/50"
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <BookOpen
          className={cn(
            "size-4 flex-shrink-0",
            highlighted ? "text-blue-500" : "text-gray-400"
          )}
        />
        <span
          className={cn(
            "text-xs font-semibold flex-1",
            highlighted ? "text-blue-600" : "text-gray-500"
          )}
        >
          {highlighted ? "지문 (이 문제에 필요)" : "지문 보기"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            highlighted ? "text-blue-400" : "text-gray-400",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="max-h-48 overflow-y-auto rounded-lg bg-white p-3 border border-gray-100">
            <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-line">
              {content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Short Answer Input
// ---------------------------------------------------------------------------

function ShortAnswerInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
        }}
        disabled={disabled}
        placeholder="답을 입력하세요"
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 focus:outline-none transition-colors"
      />
      <button
        onClick={() => value.trim() && onSubmit(value.trim())}
        disabled={disabled || !value.trim()}
        className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-40 active:bg-blue-600"
      >
        확인
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result Screen
// ---------------------------------------------------------------------------

function ResultScreen({
  result,
  passageId,
}: {
  result: SessionResult;
  passageId: string;
}) {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center mb-6",
            result.score >= 80 ? "bg-emerald-100" : result.score >= 50 ? "bg-blue-100" : "bg-amber-100"
          )}
        >
          <Sparkles
            className={cn(
              "size-10",
              result.score >= 80
                ? "text-emerald-500"
                : result.score >= 50
                  ? "text-blue-500"
                  : "text-amber-500"
            )}
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-gray-900 mb-2"
        >
          {result.score >= 80 ? "훌륭해요!" : result.score >= 50 ? "잘했어요!" : "괜찮아요!"}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-6 mb-6"
        >
          <div>
            <p className="text-3xl font-bold text-gray-900">{result.score}%</p>
            <p className="text-xs text-gray-500">정답률</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-3xl font-bold text-blue-500">+{result.xpEarned}</p>
            <p className="text-xs text-gray-500">
              XP {result.xpMultiplier > 1 ? `(x${result.xpMultiplier})` : ""}
            </p>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-sm text-gray-500 mb-8"
        >
          {result.correctCount}/{result.totalCount} 문제 정답
        </motion.p>

        {/* Wrong questions summary */}
        {result.wrongQuestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full text-left mb-6"
          >
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
              틀린 문제 ({result.wrongQuestions.length}개)
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {result.wrongQuestions.map((wq) => (
                <div
                  key={wq.questionId}
                  className="bg-rose-50 rounded-xl p-3 text-xs"
                >
                  <p className="text-gray-700 mb-1 line-clamp-2">{wq.questionText}</p>
                  <p className="text-rose-600">
                    정답: <span className="font-medium">{wq.correctAnswer}</span>
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="px-5 pb-8 space-y-2.5">
        <button
          onClick={() => router.push(`/student/learn/${passageId}`)}
          className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-bold text-sm active:bg-blue-600"
        >
          레슨으로 돌아가기
        </button>
        <button
          onClick={() => router.push("/student/learn")}
          className="w-full py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm active:bg-gray-200"
        >
          학습 홈
        </button>
      </div>
    </div>
  );
}
