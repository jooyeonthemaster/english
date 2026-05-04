"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { startSession } from "@/actions/learning-session";
import { submitSession } from "@/actions/learning-session-submit";
import { checkDailyMission } from "@/actions/learning-gamification";
import { getPassageTranslations } from "@/actions/student-app-resources";
import type { SessionStartData, SessionQuestion } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedSentence {
  index: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StoriesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const passageId = params.passageId as string;
  const seasonId = searchParams.get("seasonId") ?? undefined;

  const [data, setData] = useState<SessionStartData | null>(null);
  const [sentences, setSentences] = useState<ParsedSentence[]>([]);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [revealedCount, setRevealedCount] = useState(1); // 보여진 문장 수
  const [showTranslation, setShowTranslation] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const [translations, setTranslations] = useState<Record<number, string>>({});

  // 중간 문제
  const [activeQuestion, setActiveQuestion] = useState<SessionQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<
    { questionId: string; givenAnswer: string; isCorrect: boolean }[]
  >([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(new Date().toISOString());

  useEffect(() => {
    async function load() {
      try {
        const [sessionData, trans] = await Promise.all([
          startSession(passageId, "COMPREHENSION", 1, seasonId),
          getPassageTranslations(passageId),
        ]);
        setData(sessionData);
        setTranslations(trans);

        // 지문을 문장 단위로 파싱
        const content = sessionData.passageContent;
        const parsed = content
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 0)
          .map((text, i) => ({ index: i, text: text.trim() }));
        setSentences(parsed);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [passageId, seasonId]);

  // 중간 문제 삽입 위치 계산 (문장 수 기준 균등 배치)
  const questionPositions = data?.questions
    ? data.questions.map((_, i) => {
        const totalSentences = sentences.length;
        const interval = Math.floor(totalSentences / (data.questions.length + 1));
        return (i + 1) * interval;
      })
    : [];

  const handleTapNext = () => {
    if (activeQuestion) return; // 문제 풀고 있을 때는 진행 X

    // 중간 문제 체크
    const qIdx = questionPositions.indexOf(revealedCount);
    if (qIdx !== -1 && data?.questions[qIdx] && questionIndex <= qIdx) {
      setActiveQuestion(data.questions[qIdx]);
      setQuestionIndex(qIdx + 1);
      return;
    }

    if (revealedCount < sentences.length) {
      setRevealedCount((prev) => prev + 1);
      // 자동 스크롤
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    } else {
      // 완료
      handleComplete();
    }
  };

  const handleQuestionAnswer = (answer: string) => {
    if (showAnswer || !activeQuestion) return;
    const correct = answer.trim() === activeQuestion.correctAnswer.trim();
    setSelectedAnswer(answer);
    setShowAnswer(true);
    setQuestionAnswers((prev) => [
      ...prev,
      { questionId: activeQuestion.id, givenAnswer: answer, isCorrect: correct },
    ]);
  };

  const handleQuestionContinue = () => {
    setActiveQuestion(null);
    setSelectedAnswer(null);
    setShowAnswer(false);
    // 다음 문장 표시
    if (revealedCount < sentences.length) {
      setRevealedCount((prev) => prev + 1);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  };

  const handleComplete = async () => {
    if (!data) return;
    try {
      const result = await submitSession({
        passageId,
        sessionType: "COMPREHENSION",
        sessionSeq: 1,
        seasonId,
        answers: questionAnswers,
        startedAt: startedAt.current,
      });
      await checkDailyMission();
      setXpEarned(result.xpEarned);
      setCompleted(true);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTranslation = (index: number) => {
    setShowTranslation((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        지문을 불러올 수 없습니다
      </div>
    );
  }

  if (completed) {
    return (
      <div className="max-w-lg mx-auto min-h-screen flex flex-col items-center justify-center px-6 bg-white">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center mb-6"
        >
          <Check className="size-10 text-orange-500" />
        </motion.div>
        <h1 className="text-2xl font-bold mb-2">통독 완료!</h1>
        <p className="text-blue-500 font-bold text-xl mb-8">+{xpEarned} XP</p>
        <button
          onClick={() => router.push(`/student/learn/${passageId}`)}
          className="w-full py-3.5 rounded-xl bg-orange-500 text-white font-bold text-sm active:bg-orange-600"
        >
          레슨으로 돌아가기
        </button>
      </div>
    );
  }

  const progress = sentences.length > 0 ? revealedCount / sentences.length : 0;

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 bg-white">
        <button
          onClick={() => router.back()}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="size-5" />
        </button>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
            animate={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">Stories</span>
      </div>

      {/* Title */}
      <div className="px-5 py-3 bg-white border-b border-gray-100">
        <h2 className="text-base font-bold text-black">{data.passageTitle}</h2>
      </div>

      {/* Sentences */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4"
        onClick={!activeQuestion ? handleTapNext : undefined}
      >
        <div className="space-y-4">
          {sentences.slice(0, revealedCount).map((sentence, i) => (
            <motion.div
              key={sentence.index}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <p
                className="text-[15px] leading-7 text-gray-800 cursor-pointer select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTranslation(sentence.index);
                }}
              >
                {sentence.text}
              </p>
              <AnimatePresence>
                {showTranslation.has(sentence.index) && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-1.5 mt-1"
                  >
                    {translations[sentence.index] ?? "해석 데이터가 없습니다"}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* 중간 문제 오버레이 */}
        <AnimatePresence>
          {activeQuestion && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-200 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="size-4 text-orange-500" />
                <span className="text-xs font-bold text-orange-600">이해도 체크</span>
              </div>
              <p className="text-sm font-semibold text-black mb-4">
                {activeQuestion.questionText}
              </p>
              {activeQuestion.options && (
                <div className="space-y-2">
                  {activeQuestion.options.map((opt) => {
                    const isSelected = selectedAnswer === opt.text;
                    const isCorrectOption =
                      opt.text.trim() === activeQuestion.correctAnswer.trim();
                    return (
                      <button
                        key={opt.label}
                        onClick={() => handleQuestionAnswer(opt.text)}
                        disabled={showAnswer}
                        className={cn(
                          "w-full text-left rounded-xl border-2 p-3 text-sm transition-all",
                          showAnswer
                            ? isCorrectOption
                              ? "border-emerald-400 bg-emerald-50"
                              : isSelected
                                ? "border-rose-400 bg-rose-50"
                                : "border-gray-100 opacity-50"
                            : "border-gray-200 active:border-orange-300"
                        )}
                      >
                        <span className="font-medium">{opt.label}</span> {opt.text}
                      </button>
                    );
                  })}
                </div>
              )}
              {showAnswer && (
                <button
                  onClick={handleQuestionContinue}
                  className="w-full mt-3 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold active:bg-orange-600"
                >
                  계속 읽기
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tap hint */}
        {!activeQuestion && revealedCount < sentences.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex items-center justify-center gap-1 mt-8 text-gray-400"
          >
            <ChevronDown className="size-4 animate-bounce" />
            <span className="text-xs">탭하여 계속</span>
          </motion.div>
        )}

        {/* Final tap */}
        {!activeQuestion && revealedCount >= sentences.length && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleComplete}
            className="w-full mt-8 py-3.5 rounded-xl bg-orange-500 text-white font-bold text-sm active:bg-orange-600"
          >
            통독 완료!
          </motion.button>
        )}
      </div>
    </div>
  );
}
