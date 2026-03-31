"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { startSession, startReviewSession } from "@/actions/learning-session";
import { submitSession } from "@/actions/learning-session-submit";
import { checkDailyMission } from "@/actions/learning-gamification";
import type { SessionStartData, SessionQuestion, SessionResult } from "@/lib/learning-types";
import type { SessionType } from "@/lib/learning-constants";
import PassageCard from "./_components/passage-card";
import ShortAnswerInput from "./_components/short-answer-input";
import ResultScreen from "./_components/result-screen";

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
  const reviewMode = searchParams.get("mode") === "review";
  const reviewQuestionIds = searchParams.get("questionIds")?.split(",").filter(Boolean) ?? [];
  const reviewCategory = searchParams.get("category") ?? undefined;

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
  // 나가기 확인
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    // reviewMode가 아닌 경우 sessionType이 필수
    if (!reviewMode && !sessionType) return;

    let cancelled = false;
    setLoading(true);
    setData(null);
    setCurrentIndex(0);
    setAnswers(new Map());
    setRetryQueue([]);

    async function load() {
      try {
        const sessionData = reviewMode && reviewQuestionIds.length > 0
          ? await startReviewSession(passageId, reviewQuestionIds, reviewCategory)
          : await startSession(passageId, sessionType, seasonId);
        if (!cancelled) setData(sessionData);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passageId, sessionType, seasonId, reviewMode]);

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
          onClick={() => setShowExitConfirm(true)}
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
        <span className="text-[var(--fs-xs)] text-gray-500 font-medium tabular-nums">
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
            <p className="text-[var(--fs-lg)] font-semibold text-gray-900 mb-6 leading-relaxed whitespace-pre-line">
              {currentQuestion.questionText}
            </p>

            {/* Options */}
            {currentQuestion.options && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOption === opt.label;
                  const isAnswer = opt.label === currentQuestion.correctAnswer;

                  return (
                    <button
                      key={opt.label}
                      onClick={() => handleSelect(opt.label)}
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
                            "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--fs-xs)] font-bold",
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
                            "text-[var(--fs-base)] leading-relaxed",
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
                    "text-[var(--fs-base)] font-bold",
                    isCorrect ? "text-emerald-700" : "text-rose-700"
                  )}
                >
                  {isCorrect ? "정답!" : "오답"}
                </span>
              </div>
              {!isCorrect && (
                <p className="text-[var(--fs-xs)] text-rose-600 mb-1">
                  정답: {currentQuestion.options
                    ? `${currentQuestion.correctAnswer}. ${currentQuestion.options.find(o => o.label === currentQuestion.correctAnswer)?.text || ""}`
                    : currentQuestion.correctAnswer}
                </p>
              )}
              {/* 해설 */}
              {currentQuestion.explanation && (
                <div className="mt-2 bg-white/60 rounded-xl p-3">
                  <p className="text-[var(--fs-xs)] text-gray-700 leading-relaxed">
                    {currentQuestion.explanation.content}
                  </p>
                  {currentQuestion.explanation.keyPoints && currentQuestion.explanation.keyPoints.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {currentQuestion.explanation.keyPoints.map((pt, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-[var(--fs-caption)] text-blue-500 mt-0.5">•</span>
                          <p className="text-[var(--fs-xs)] text-gray-600">{pt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleNext}
                disabled={submitting}
                className={cn(
                  "w-full mt-3 py-3 rounded-xl font-bold text-[var(--fs-base)] text-white transition-all",
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

      {/* 나가기 확인 모달 */}
      <AnimatePresence>
        {showExitConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExitConfirm(false)}
              className="fixed inset-0 bg-black/40 z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl p-6 w-[280px] shadow-xl"
            >
              <h3 className="text-[var(--fs-lg)] font-bold text-gray-900 mb-2">세션을 중단할까요?</h3>
              <p className="text-[var(--fs-xs)] text-gray-500 mb-5">
                진행 상황이 저장되지 않습니다.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[var(--fs-base)] font-bold active:bg-gray-200"
                >
                  계속하기
                </button>
                <button
                  onClick={() => router.back()}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-[var(--fs-base)] font-bold active:bg-rose-600"
                >
                  나가기
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
