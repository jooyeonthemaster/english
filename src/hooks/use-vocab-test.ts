"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type TestType = "EN_TO_KR" | "KR_TO_EN" | "SPELLING";
export type TestState = "ready" | "testing" | "reviewing" | "complete";

export interface VocabItem {
  id: string;
  english: string;
  korean: string;
  partOfSpeech?: string | null;
}

export interface Question {
  item: VocabItem;
  prompt: string; // The word/text shown as the question
  correctAnswer: string; // The correct answer text
  options: string[]; // 4 options for MC, empty for SPELLING
  type: TestType;
}

export interface WrongItem {
  item: VocabItem;
  givenAnswer: string;
  correctAnswer: string;
}

interface UseVocabTestReturn {
  state: TestState;
  currentQuestion: Question | null;
  currentIndex: number;
  totalQuestions: number;
  score: number;
  wrongItems: WrongItem[];
  elapsedTime: number;
  answerQuestion: (answer: string) => void;
  nextQuestion: () => void;
  isCorrect: boolean | null;
  correctAnswer: string;
  selectedAnswer: string | null;
  startTest: () => void;
  retryWrongOnly: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick N random distractors from pool, excluding the correct value */
function pickDistractors(
  pool: string[],
  correct: string,
  count: number
): string[] {
  const candidates = pool.filter(
    (v) => v.toLowerCase().trim() !== correct.toLowerCase().trim()
  );
  const shuffled = shuffle(candidates);
  return shuffled.slice(0, count);
}

/** Generate questions from vocab items for a given test type */
function generateQuestions(
  items: VocabItem[],
  testType: TestType
): Question[] {
  const shuffled = shuffle(items);

  // Build pools for distractors
  const koreanPool = items.map((i) => i.korean);
  const englishPool = items.map((i) => i.english);

  return shuffled.map((item) => {
    if (testType === "EN_TO_KR") {
      const distractors = pickDistractors(koreanPool, item.korean, 3);
      const options = shuffle([item.korean, ...distractors]);
      return {
        item,
        prompt: item.english,
        correctAnswer: item.korean,
        options,
        type: testType,
      };
    } else if (testType === "KR_TO_EN") {
      const distractors = pickDistractors(englishPool, item.english, 3);
      const options = shuffle([item.english, ...distractors]);
      return {
        item,
        prompt: item.korean,
        correctAnswer: item.english,
        options,
        type: testType,
      };
    } else {
      // SPELLING — no options
      return {
        item,
        prompt: item.korean,
        correctAnswer: item.english,
        options: [],
        type: testType,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useVocabTest(
  items: VocabItem[],
  testType: TestType
): UseVocabTestReturn {
  const [state, setState] = useState<TestState>("ready");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongItems, setWrongItems] = useState<WrongItem[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const allItemsRef = useRef(items);

  // Keep ref updated
  useEffect(() => {
    allItemsRef.current = items;
  }, [items]);

  // Timer management — runs during both "testing" and "reviewing" states
  // so that total elapsed time reflects the full test experience
  useEffect(() => {
    if (state === "testing" || state === "reviewing") {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setElapsedTime((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state]);

  const startTest = useCallback(() => {
    const generated = generateQuestions(allItemsRef.current, testType);
    setQuestions(generated);
    setCurrentIndex(0);
    setScore(0);
    setWrongItems([]);
    setIsCorrect(null);
    setSelectedAnswer(null);
    setElapsedTime(0);
    setState("testing");
  }, [testType]);

  const retryWrongOnly = useCallback(() => {
    const wrongVocabItems = wrongItems.map((w) => w.item);
    if (wrongVocabItems.length === 0) return;
    const generated = generateQuestions(wrongVocabItems, testType);
    setQuestions(generated);
    setCurrentIndex(0);
    setScore(0);
    setWrongItems([]);
    setIsCorrect(null);
    setSelectedAnswer(null);
    setElapsedTime(0);
    setState("testing");
  }, [wrongItems, testType]);

  const answerQuestion = useCallback(
    (answer: string) => {
      if (state !== "testing" || isCorrect !== null) return;

      const question = questions[currentIndex];
      if (!question) return;

      setSelectedAnswer(answer);

      const correct =
        answer.toLowerCase().trim() ===
        question.correctAnswer.toLowerCase().trim();

      setIsCorrect(correct);

      if (correct) {
        setScore((prev) => prev + 1);
      } else {
        setWrongItems((prev) => [
          ...prev,
          {
            item: question.item,
            givenAnswer: answer,
            correctAnswer: question.correctAnswer,
          },
        ]);
      }

      setState("reviewing");
    },
    [state, isCorrect, questions, currentIndex]
  );

  const nextQuestion = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setState("complete");
    } else {
      setCurrentIndex((prev) => prev + 1);
      setIsCorrect(null);
      setSelectedAnswer(null);
      setState("testing");
    }
  }, [currentIndex, questions.length]);

  const currentQuestion =
    questions.length > 0 && currentIndex < questions.length
      ? questions[currentIndex]
      : null;

  return {
    state,
    currentQuestion,
    currentIndex,
    totalQuestions: questions.length,
    score,
    wrongItems,
    elapsedTime,
    answerQuestion,
    nextQuestion,
    isCorrect,
    correctAnswer: currentQuestion?.correctAnswer ?? "",
    selectedAnswer,
    startTest,
    retryWrongOnly,
  };
}
