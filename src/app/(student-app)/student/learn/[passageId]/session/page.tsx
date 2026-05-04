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
import MatchInteraction from "./_components/match-interaction";
import ArrangeInteraction from "./_components/arrange-interaction";
import TapTextInteraction from "./_components/tap-text-interaction";
import { SUBTYPE_TO_INTERACTION } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// 유사 정답 허용 (TEXT_INPUT 유형: 대소문자, 단복수, ing형 등)
// ---------------------------------------------------------------------------

function normalizeWord(w: string): string {
  return w.trim().toLowerCase().replace(/[.,!?;:'"()]/g, "");
}

/** 영단어 변형 생성 (기본형 ↔ 복수/과거/ing 등) */
function getWordVariants(word: string): string[] {
  const w = normalizeWord(word);
  const variants = [w];
  // 복수형 ↔ 단수형
  if (w.endsWith("ies")) variants.push(w.slice(0, -3) + "y");
  else if (w.endsWith("es")) variants.push(w.slice(0, -2));
  else if (w.endsWith("s") && !w.endsWith("ss")) variants.push(w.slice(0, -1));
  if (!w.endsWith("s")) { variants.push(w + "s"); variants.push(w + "es"); }
  if (w.endsWith("y")) variants.push(w.slice(0, -1) + "ies");
  // ing형
  if (w.endsWith("ing")) { variants.push(w.slice(0, -3)); variants.push(w.slice(0, -3) + "e"); }
  if (!w.endsWith("ing")) variants.push(w + "ing");
  if (w.endsWith("e") && !w.endsWith("ing")) variants.push(w.slice(0, -1) + "ing");
  // ed형
  if (w.endsWith("ed")) { variants.push(w.slice(0, -2)); variants.push(w.slice(0, -1)); }
  if (!w.endsWith("ed")) { variants.push(w + "ed"); variants.push(w + "d"); }
  // ly형
  if (w.endsWith("ly")) variants.push(w.slice(0, -2));
  return [...new Set(variants)];
}

function isAnswerCorrect(input: string, correctAnswer: string, subType: string): boolean {
  const a = normalizeWord(input);
  const b = normalizeWord(correctAnswer);
  // 정확히 일치
  if (a === b) return true;
  // 선택형 (A/B/C/D) — 정확 일치만
  if (/^[A-Da-d]$/.test(b) || /^[A-Da-d]$/.test(a)) return a === b;
  // TEXT_INPUT 유형 (WORD_SPELL, ERROR_CORRECT, GRAM_TRANSFORM): 유사 정답 허용
  const textInputTypes = ["WORD_SPELL", "ERROR_CORRECT", "GRAM_TRANSFORM"];
  if (textInputTypes.includes(subType)) {
    const variants = getWordVariants(b);
    return variants.includes(a);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const passageId = params.passageId as string;
  const sessionType = searchParams.get("type") as SessionType;
  const sessionSeq = Number(searchParams.get("seq") ?? "1");
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
          : await startSession(passageId, sessionType, sessionSeq, seasonId);
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
      // 특수 인터랙션(WORD_MATCH, WORD_ARRANGE 등)은 "CORRECT"/"WRONG"으로 전달
      const correct = option === "CORRECT"
        ? true
        : option === "WRONG"
          ? false
          : isAnswerCorrect(option, currentQuestion.correctAnswer, currentQuestion.subType);
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
          sessionSeq,
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
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--key-color)", borderTopColor: "transparent" }} />
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
        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: "var(--key-color)" }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <span className="text-[var(--fs-xs)] text-black font-medium tabular-nums">
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

            {/* Question text — **bold** 마크다운 지원 */}
            <p className="text-[var(--fs-lg)] font-semibold text-black mb-8 leading-relaxed whitespace-pre-line">
              {currentQuestion.questionText.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**")
                  ? <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded-sm font-bold">{part.slice(2, -2)}</mark>
                  : part
              )}
            </p>

            {/* Interaction by subType */}
            {(() => {
              const interaction = SUBTYPE_TO_INTERACTION[currentQuestion.subType];
              const raw = currentQuestion.rawData;

              // MATCHING (WORD_MATCH)
              if (interaction === "MATCHING" && raw?.pairs?.length > 0) {
                return (
                  <MatchInteraction
                    pairs={raw!.pairs}
                    onComplete={(correct) => handleSelect(correct ? "CORRECT" : "WRONG")}
                    disabled={showFeedback}
                  />
                );
              }

              // WORD_BANK (WORD_ARRANGE, SENT_CHUNK_ORDER)
              if (interaction === "WORD_BANK" && raw) {
                const pieces: string[] = raw!.chunks || raw!.correctOrder || [];
                const correctOrder: string[] | number[] = raw!.correctOrder || [];
                const distractors: string[] = raw!.distractorWords || [];

                if (pieces.length > 0) {
                  return (
                    <ArrangeInteraction
                      pieces={pieces}
                      correctOrder={correctOrder}
                      distractors={distractors}
                      onComplete={(correct) => handleSelect(correct ? "CORRECT" : "WRONG")}
                      disabled={showFeedback}
                    />
                  );
                }
              }

              // TAP_TEXT (ERROR_FIND)
              if (interaction === "TAP_TEXT" && raw?.words?.length > 0) {
                return (
                  <TapTextInteraction
                    words={raw!.words}
                    errorWord={raw!.errorWord || currentQuestion.correctAnswer}
                    onComplete={(correct, selected) => handleSelect(correct ? (raw!.errorWord || currentQuestion.correctAnswer) : selected)}
                    disabled={showFeedback}
                  />
                );
              }

              // 기본: 선택형
              if (currentQuestion.options) {
                return (
                  <div className="space-y-3">
                    {currentQuestion.options.map((opt) => {
                      const isSelected = selectedOption === opt.label;
                      const isAnswer = opt.label === currentQuestion.correctAnswer;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => handleSelect(opt.label)}
                          disabled={showFeedback}
                          className={cn(
                            "card-3d w-full text-left p-4",
                            showFeedback
                              ? isAnswer
                                ? "!border-emerald-400 !border-b-emerald-500 bg-emerald-50"
                                : isSelected
                                  ? "!border-rose-400 !border-b-rose-500 bg-rose-50"
                                  : "!border-gray-100 bg-gray-50 opacity-50"
                              : isSelected
                                ? "!border-orange-400 !border-b-orange-500 bg-orange-50"
                                : ""
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                showFeedback
                                  ? isAnswer
                                    ? "bg-emerald-500 text-white"
                                    : isSelected
                                      ? "bg-rose-500 text-white"
                                      : "bg-gray-200 text-gray-400"
                                  : isSelected
                                    ? "bg-orange-500 text-white"
                                    : "bg-gray-100 text-black"
                              )}
                            >
                              {opt.label}
                            </span>
                            <span
                              className={cn(
                                "text-[var(--fs-base)] leading-relaxed pt-1",
                                showFeedback && isAnswer
                                  ? "text-emerald-700 font-medium"
                                  : showFeedback && isSelected
                                    ? "text-rose-700"
                                    : "text-black"
                              )}
                            >
                              {opt.text}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              }

              // 기본: 단답형
              return (
                <ShortAnswerInput
                  onSubmit={handleSelect}
                  disabled={showFeedback}
                />
              );
            })()}
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
                isCorrect ? "bg-[#D7FFB8]" : "bg-[#FFDFE0]"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {isCorrect ? (
                  <Check className="size-6 text-[#58CC02]" />
                ) : (
                  <AlertCircle className="size-6 text-[#FF4B4B]" />
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
                  <p className="text-[var(--fs-xs)] text-black leading-relaxed">
                    {currentQuestion.explanation.content}
                  </p>
                  {currentQuestion.explanation.keyPoints && currentQuestion.explanation.keyPoints.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {currentQuestion.explanation.keyPoints.map((pt, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-[var(--fs-caption)] mt-0.5" style={{ color: "var(--key-color)" }}>•</span>
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
                  "btn-3d w-full mt-3 py-3.5 rounded-2xl font-bold text-[var(--fs-base)] text-white",
                  submitting && "opacity-50"
                )}
                style={{ backgroundColor: isCorrect ? "#58CC02" : "#FF4B4B" }}
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
              <h3 className="text-[var(--fs-lg)] font-bold text-black mb-2">세션을 중단할까요?</h3>
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
