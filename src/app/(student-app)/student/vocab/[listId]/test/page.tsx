"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getVocabListForTest } from "@/actions/student-app-vocab";
import { submitTestResult, recordWrongAnswers } from "@/actions/vocab-test";
import { useVocabTest, type TestType, type VocabItem } from "@/hooks/use-vocab-test";
import ModeSelector from "./_components/mode-selector";
import QuestionCard from "./_components/question-card";

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
