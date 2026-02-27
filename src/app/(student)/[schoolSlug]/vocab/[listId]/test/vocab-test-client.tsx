"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Languages, BookA, Keyboard, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { TestProgress } from "@/components/vocab/test-progress";
import { SwipeCard } from "@/components/vocab/swipe-card";
import { TestResultSummary } from "@/components/vocab/test-result-summary";
import {
  useVocabTest,
  type VocabItem,
  type TestType,
} from "@/hooks/use-vocab-test";
import { submitTestResult, recordWrongAnswers } from "@/actions/vocab-test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VocabTestClientProps {
  items: VocabItem[];
  listId: string;
  listTitle: string;
  schoolSlug: string;
}

// ---------------------------------------------------------------------------
// Test type selection cards
// ---------------------------------------------------------------------------
const TEST_MODES = [
  {
    type: "EN_TO_KR" as TestType,
    title: "영 \u2192 한",
    description: "영단어를 보고 한국어 뜻 맞추기",
    icon: Languages,
    gradient: "from-[#7CB342] to-[#689F38]",
    bgGlow: "rgba(124, 179, 66, 0.12)",
    iconColor: "#7CB342",
  },
  {
    type: "KR_TO_EN" as TestType,
    title: "한 \u2192 영",
    description: "한국어 뜻을 보고 영단어 맞추기",
    icon: BookA,
    gradient: "from-[#4CAF50] to-[#388E3C]",
    bgGlow: "rgba(76, 175, 80, 0.12)",
    iconColor: "#4CAF50",
  },
  {
    type: "SPELLING" as TestType,
    title: "스펠링",
    description: "한국어 뜻을 보고 영단어 입력하기",
    icon: Keyboard,
    gradient: "from-[#F59E0B] to-[#D97706]",
    bgGlow: "rgba(245, 158, 11, 0.12)",
    iconColor: "#F59E0B",
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function VocabTestClient({
  items,
  listId,
  listTitle,
  schoolSlug,
}: VocabTestClientProps) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<TestType | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const savingRef = useRef(false);

  // The test type defaults to EN_TO_KR but only matters once startTest is called
  const testType = selectedType ?? "EN_TO_KR";

  const {
    state,
    currentQuestion,
    currentIndex,
    totalQuestions,
    score,
    wrongItems,
    elapsedTime,
    answerQuestion,
    nextQuestion,
    isCorrect,
    selectedAnswer,
    startTest,
    retryWrongOnly,
  } = useVocabTest(items, testType);

  // Start test when type is selected and state is ready
  useEffect(() => {
    if (selectedType !== null && state === "ready") {
      startTest();
    }
  }, [selectedType, state, startTest]);

  // Save results when test completes
  useEffect(() => {
    if (state !== "complete" || resultSaved || savingRef.current) return;

    savingRef.current = true;

    const save = async () => {
      try {
        const percent =
          totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

        await submitTestResult({
          listId,
          testType,
          score,
          total: totalQuestions,
          percent,
          duration: elapsedTime,
        });

        if (wrongItems.length > 0) {
          await recordWrongAnswers(
            wrongItems.map((w) => ({
              itemId: w.item.id,
              testType,
              givenAnswer: w.givenAnswer,
            }))
          );
        }

        setResultSaved(true);
      } catch (err) {
        console.error("Failed to save test results:", err);
      } finally {
        savingRef.current = false;
      }
    };

    save();
  }, [state, resultSaved, listId, testType, score, totalQuestions, elapsedTime, wrongItems]);

  const handleStartTest = useCallback((type: TestType) => {
    setSelectedType(type);
    setResultSaved(false);
    savingRef.current = false;
  }, []);

  const handleGoBack = useCallback(() => {
    router.push(`/${schoolSlug}/vocab/${listId}`);
  }, [router, schoolSlug, listId]);

  const handleExit = useCallback(() => {
    router.back();
  }, [router]);

  const handleRetryWrong = useCallback(() => {
    setResultSaved(false);
    savingRef.current = false;
    retryWrongOnly();
  }, [retryWrongOnly]);

  // ---------------------------------------------------------------------------
  // Render: Type selection screen
  // ---------------------------------------------------------------------------
  if (selectedType === null) {
    return (
      <>
        <TopBarBack
          title="단어 테스트"
          showBack
          onBack={handleExit}
          rightAction={
            <button
              onClick={handleExit}
              className="flex size-9 items-center justify-center rounded-full text-[#6B7265] transition-colors hover:bg-[#F3F4F0] active:scale-95"
              aria-label="닫기"
            >
              <X className="size-5" />
            </button>
          }
        />

        <div className="flex flex-col px-5 pt-6 pb-8">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 300, damping: 25 }}
          >
            <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#1A1F16]">
              테스트 유형 선택
            </h2>
            <p className="mt-1.5 text-[14px] text-[#6B7265]">
              <span className="font-medium text-[#4A5043]">{listTitle}</span>
              {" "}
              <span className="text-[#9CA396]">({items.length}개 단어)</span>
            </p>
          </motion.div>

          {/* Test type cards */}
          <div className="mt-7 flex flex-col gap-3">
            {TEST_MODES.map((mode, idx) => {
              const Icon = mode.icon;
              const disabled = items.length < 4 && mode.type !== "SPELLING";

              return (
                <motion.button
                  key={mode.type}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.12 + idx * 0.08,
                    type: "spring",
                    stiffness: 350,
                    damping: 28,
                  }}
                  whileTap={disabled ? undefined : { scale: 0.97 }}
                  onClick={() => !disabled && handleStartTest(mode.type)}
                  disabled={disabled}
                  className={cn(
                    "group relative flex items-center gap-4 rounded-2xl bg-white p-4 text-left transition-all duration-200",
                    disabled
                      ? "cursor-not-allowed"
                      : "cursor-pointer shadow-card hover:shadow-card-hover"
                  )}
                >
                  {/* Disabled overlay */}
                  {disabled && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#FAFBF8]/80 backdrop-blur-[2px]">
                      <div className="flex items-center gap-2 rounded-full bg-[#F3F4F0] px-3 py-1.5">
                        <Lock className="size-3.5 text-[#9CA396]" />
                        <span className="text-[12px] font-medium text-[#9CA396]">
                          4개 이상 단어 필요
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Gradient icon container */}
                  <div
                    className={cn(
                      "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br transition-transform duration-200",
                      mode.gradient,
                      !disabled && "group-hover:scale-105"
                    )}
                  >
                    <Icon className="size-6 text-white" />
                  </div>

                  {/* Text */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[16px] font-bold tracking-[-0.02em] text-[#1A1F16]">
                      {mode.title}
                    </span>
                    <span className="text-[13px] text-[#9CA396] leading-relaxed">
                      {mode.description}
                    </span>
                  </div>

                  {/* Arrow indicator */}
                  {!disabled && (
                    <div className="ml-auto shrink-0">
                      <svg
                        className="size-5 text-[#C8CCC2] transition-colors group-hover:text-[#7CB342]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Test complete screen
  // ---------------------------------------------------------------------------
  if (state === "complete") {
    return (
      <>
        <TopBarBack
          title="테스트 결과"
          showBack
          onBack={handleGoBack}
        />
        <TestResultSummary
          score={score}
          total={totalQuestions}
          elapsedTime={elapsedTime}
          wrongItems={wrongItems}
          onRetryWrong={wrongItems.length > 0 ? handleRetryWrong : undefined}
          onGoBack={handleGoBack}
        />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Active test
  // ---------------------------------------------------------------------------
  return (
    <>
      <TopBarBack
        title="단어 테스트"
        showBack
        onBack={handleExit}
        rightAction={
          <button
            onClick={handleExit}
            className="flex size-9 items-center justify-center rounded-full text-[#6B7265] transition-colors hover:bg-[#F3F4F0] active:scale-95"
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
        }
      />

      <div className="flex flex-col px-5 pt-4">
        {/* Progress */}
        <TestProgress
          current={currentIndex + 1}
          total={totalQuestions}
        />

        {/* Question card */}
        {currentQuestion && (
          <div className="mt-4">
            <SwipeCard
              question={currentQuestion}
              questionIndex={currentIndex}
              isCorrect={isCorrect}
              selectedAnswer={selectedAnswer}
              onAnswer={answerQuestion}
              onNext={nextQuestion}
            />
          </div>
        )}
      </div>
    </>
  );
}
