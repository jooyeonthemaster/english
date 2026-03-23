"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ArrowLeft, Volume2, X, Check, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { getVocabListForTest } from "@/actions/student-app";
import { submitTestResult, recordWrongAnswers } from "@/actions/vocab-test";
import { useVocabTest, type TestType, type VocabItem } from "@/hooks/use-vocab-test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ListData {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  items: VocabItem[];
  recentScores: { percent: number; testType: string; date: string }[];
}

// ---------------------------------------------------------------------------
// Test Mode Selector
// ---------------------------------------------------------------------------
function ModeSelector({
  onSelect,
  listTitle,
  wordCount,
}: {
  onSelect: (mode: TestType) => void;
  listTitle: string;
  wordCount: number;
}) {
  const modes = [
    {
      type: "EN_TO_KR" as TestType,
      label: "영 → 한",
      desc: "영어를 보고 한국어 뜻 고르기",
      icon: "🇬🇧→🇰🇷",
      color: "from-blue-500 to-blue-600",
    },
    {
      type: "KR_TO_EN" as TestType,
      label: "한 → 영",
      desc: "한국어를 보고 영어 단어 고르기",
      icon: "🇰🇷→🇬🇧",
      color: "from-emerald-500 to-emerald-600",
    },
    {
      type: "SPELLING" as TestType,
      label: "스펠링",
      desc: "한국어를 보고 영어 직접 입력",
      icon: "✏️",
      color: "from-purple-500 to-purple-600",
    },
  ];

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-gray-900">{listTitle}</h1>
        <p className="text-sm text-gray-400 mt-1">{wordCount}단어</p>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">시험 유형 선택</h2>
      <div className="space-y-3">
        {modes.map((mode) => (
          <motion.button
            key={mode.type}
            onClick={() => onSelect(mode.type)}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-card text-left press-scale"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div
              className={cn(
                "size-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-xl",
                mode.color
              )}
            >
              {mode.icon === "✏️" ? (
                <Keyboard className="size-6 text-white" />
              ) : (
                <span className="text-lg">{mode.icon}</span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{mode.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{mode.desc}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer Flash Overlay
// ---------------------------------------------------------------------------
function FlashOverlay({ correct }: { correct: boolean }) {
  return (
    <motion.div
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center rounded-2xl pointer-events-none",
        correct ? "bg-emerald-500/10" : "bg-red-500/10"
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        {correct ? (
          <div className="size-16 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="size-8 text-white" strokeWidth={3} />
          </div>
        ) : (
          <div className="size-16 rounded-full bg-red-500 flex items-center justify-center">
            <X className="size-8 text-white" strokeWidth={3} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Question Card
// ---------------------------------------------------------------------------
function QuestionCard({
  prompt,
  options,
  type,
  isCorrect,
  correctAnswer,
  selectedAnswer,
  onAnswer,
  onNext,
  state,
}: {
  prompt: string;
  options: string[];
  type: TestType;
  isCorrect: boolean | null;
  correctAnswer: string;
  selectedAnswer: string | null;
  onAnswer: (answer: string) => void;
  onNext: () => void;
  state: string;
}) {
  const [spellingInput, setSpellingInput] = useState("");
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-150, 0, 150], [-5, 0, 5]);
  const opacity = useTransform(x, [-200, 0, 200], [0.5, 1, 0.5]);

  const handleSpellingSubmit = () => {
    if (spellingInput.trim()) {
      onAnswer(spellingInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (state === "reviewing") {
        onNext();
      } else {
        handleSpellingSubmit();
      }
    }
  };

  return (
    <motion.div
      className="relative"
      style={{ x, rotate, opacity }}
      drag={state === "reviewing" ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 80) {
          onNext();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 relative overflow-hidden">
        <AnimatePresence>
          {isCorrect !== null && <FlashOverlay correct={isCorrect} />}
        </AnimatePresence>

        {/* Prompt */}
        <div className="text-center mb-8">
          <motion.p
            className="text-2xl font-bold text-gray-900"
            key={prompt}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            {prompt}
          </motion.p>
          {type === "SPELLING" && (
            <p className="text-xs text-gray-400 mt-2">영어로 입력하세요</p>
          )}
        </div>

        {/* Multiple Choice Options */}
        {type !== "SPELLING" && (
          <div className="space-y-2.5">
            {options.map((option, i) => {
              const isSelected = selectedAnswer === option;
              const isCorrectOption = option === correctAnswer;
              const showResult = isCorrect !== null;

              return (
                <motion.button
                  key={`${option}-${i}`}
                  onClick={() => {
                    if (state === "testing") onAnswer(option);
                  }}
                  disabled={state !== "testing"}
                  className={cn(
                    "w-full p-3.5 rounded-xl text-left text-sm font-medium transition-all duration-200 border-2",
                    showResult && isCorrectOption
                      ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                      : showResult && isSelected && !isCorrectOption
                        ? "bg-red-50 border-red-400 text-red-700"
                        : isSelected
                          ? "bg-blue-50 border-blue-400 text-blue-700"
                          : "bg-gray-50 border-transparent text-gray-700 hover:bg-gray-100"
                  )}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileTap={state === "testing" ? { scale: 0.98 } : {}}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "size-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        showResult && isCorrectOption
                          ? "bg-emerald-500 text-white"
                          : showResult && isSelected && !isCorrectOption
                            ? "bg-red-500 text-white"
                            : "bg-gray-200 text-gray-600"
                      )}
                    >
                      {showResult && isCorrectOption ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : showResult && isSelected && !isCorrectOption ? (
                        <X className="size-3.5" strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span>{option}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Spelling Input */}
        {type === "SPELLING" && (
          <div className="space-y-3">
            <input
              type="text"
              value={spellingInput}
              onChange={(e) => setSpellingInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={state !== "testing"}
              placeholder="답 입력..."
              autoFocus
              className={cn(
                "w-full px-4 py-3 rounded-xl text-center text-lg font-medium border-2 focus:outline-none transition-colors",
                isCorrect === true
                  ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                  : isCorrect === false
                    ? "bg-red-50 border-red-400 text-red-700"
                    : "bg-gray-50 border-gray-200 focus:border-blue-400"
              )}
            />
            {isCorrect === false && (
              <motion.p
                className="text-center text-sm text-emerald-600 font-medium"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                정답: {correctAnswer}
              </motion.p>
            )}
            {state === "testing" && (
              <button
                onClick={handleSpellingSubmit}
                disabled={!spellingInput.trim()}
                className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium disabled:opacity-40 press-scale"
              >
                확인
              </button>
            )}
          </div>
        )}

        {/* Next button when reviewing */}
        {state === "reviewing" && (
          <motion.button
            onClick={onNext}
            className="w-full mt-4 py-3 bg-gray-900 text-white rounded-xl font-medium press-scale"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            다음
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Test Page
// ---------------------------------------------------------------------------
export default function VocabTestPage() {
  const params = useParams();
  const router = useRouter();
  const listId = params.listId as string;

  const [listData, setListData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testType, setTestType] = useState<TestType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getVocabListForTest(listId)
      .then(setListData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [listId]);

  const items = listData?.items ?? [];

  const test = useVocabTest(items, testType ?? "EN_TO_KR");

  const handleSelectMode = useCallback(
    (mode: TestType) => {
      setTestType(mode);
      // Small delay so hook picks up the testType
      setTimeout(() => test.startTest(), 50);
    },
    [test]
  );

  // When test is complete, submit results
  useEffect(() => {
    if (test.state !== "complete" || submitting) return;

    setSubmitting(true);
    const percent = test.totalQuestions > 0
      ? Math.round((test.score / test.totalQuestions) * 100)
      : 0;

    Promise.all([
      submitTestResult({
        listId,
        testType: testType!,
        score: test.score,
        total: test.totalQuestions,
        percent,
        duration: test.elapsedTime,
      }),
      test.wrongItems.length > 0
        ? recordWrongAnswers(
            test.wrongItems.map((w) => ({
              itemId: w.item.id,
              testType: testType!,
              givenAnswer: w.givenAnswer,
            }))
          )
        : Promise.resolve(),
    ]).then(() => {
      router.push(
        `/student/vocab/${listId}/test/result?score=${test.score}&total=${test.totalQuestions}&time=${test.elapsedTime}&type=${testType}`
      );
    }).catch(console.error);
  }, [test.state, test.score, test.totalQuestions, test.elapsedTime, test.wrongItems, submitting, listId, testType, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (!listData || items.length === 0) {
    return (
      <div className="px-5 pt-6">
        <button onClick={() => router.back()} className="press-scale">
          <ArrowLeft className="size-5 text-gray-600" />
        </button>
        <div className="text-center py-16">
          <p className="text-sm text-gray-400">단어가 없습니다</p>
        </div>
      </div>
    );
  }

  // Mode selection screen
  if (!testType || test.state === "ready") {
    return (
      <div>
        <div className="px-5 pt-6">
          <button onClick={() => router.back()} className="press-scale">
            <ArrowLeft className="size-5 text-gray-600" />
          </button>
        </div>
        <ModeSelector
          onSelect={handleSelectMode}
          listTitle={listData.title}
          wordCount={items.length}
        />
      </div>
    );
  }

  // Test in progress
  if (test.state === "testing" || test.state === "reviewing") {
    const progress = ((test.currentIndex + (test.state === "reviewing" ? 1 : 0)) / test.totalQuestions) * 100;

    return (
      <div className="px-5 pt-6 pb-4">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="press-scale">
            <ArrowLeft className="size-5 text-gray-600" />
          </button>
          <div className="flex-1">
            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
              />
            </div>
          </div>
          <span className="text-xs font-medium text-gray-400 w-12 text-right">
            {test.currentIndex + 1}/{test.totalQuestions}
          </span>
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          {test.currentQuestion && (
            <motion.div
              key={test.currentIndex}
              initial={{ opacity: 0, x: 30, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <QuestionCard
                prompt={test.currentQuestion.prompt}
                options={test.currentQuestion.options}
                type={test.currentQuestion.type}
                isCorrect={test.isCorrect}
                correctAnswer={test.correctAnswer}
                selectedAnswer={test.selectedAnswer}
                onAnswer={test.answerQuestion}
                onNext={test.nextQuestion}
                state={test.state}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Score indicator */}
        <div className="flex justify-center gap-1.5 mt-6">
          <div className="flex items-center gap-1 px-3 py-1 bg-emerald-50 rounded-full">
            <Check className="size-3 text-emerald-500" />
            <span className="text-xs font-bold text-emerald-600">{test.score}</span>
          </div>
          <div className="flex items-center gap-1 px-3 py-1 bg-red-50 rounded-full">
            <X className="size-3 text-red-500" />
            <span className="text-xs font-bold text-red-600">
              {test.currentIndex - test.score + (test.state === "reviewing" && test.isCorrect === false ? 1 : 0)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Complete state - show loading while submitting
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <motion.div
          className="size-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <p className="text-sm text-gray-400 mt-4">결과 저장 중...</p>
      </div>
    </div>
  );
}
