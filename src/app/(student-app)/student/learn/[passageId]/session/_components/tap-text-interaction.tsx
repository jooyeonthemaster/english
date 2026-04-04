"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ERROR_FIND — 문장에서 오류 단어 탭
// ---------------------------------------------------------------------------

interface TapTextInteractionProps {
  /** 문장을 단어별로 분리한 배열 */
  words: string[];
  /** 오류 단어 */
  errorWord: string;
  onComplete: (isCorrect: boolean, selectedWord: string) => void;
  disabled?: boolean;
}

export default function TapTextInteraction({
  words,
  errorWord,
  onComplete,
  disabled,
}: TapTextInteractionProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleWordClick = useCallback(
    (idx: number) => {
      if (disabled || completed) return;
      setSelectedIdx(idx);
    },
    [disabled, completed]
  );

  const handleSubmit = useCallback(() => {
    if (completed || selectedIdx === null) return;
    const selected = words[selectedIdx];
    // 오류 단어와 비교 (대소문자, 구두점 무시)
    const normalize = (s: string) => s.toLowerCase().replace(/[.,!?;:'"()]/g, "").trim();
    const correct = normalize(selected) === normalize(errorWord);
    setIsCorrect(correct);
    setCompleted(true);
    onComplete(correct, selected);
  }, [completed, selectedIdx, words, errorWord, onComplete]);

  // 오류 단어의 인덱스 찾기 (완료 후 표시용)
  const errorIdx = words.findIndex(
    (w) => w.toLowerCase().replace(/[.,!?;:'"()]/g, "").trim() === errorWord.toLowerCase().trim()
  );

  return (
    <div className="space-y-4">
      {/* 문장 (단어별 탭 가능) */}
      <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-gray-50 border border-gray-200">
        {words.map((word, i) => {
          const isSelected = selectedIdx === i;
          const isError = completed && i === errorIdx;
          const isWrongSelection = completed && isSelected && !isCorrect;

          return (
            <motion.button
              key={i}
              onClick={() => handleWordClick(i)}
              disabled={completed}
              whileTap={!completed ? { scale: 0.95 } : undefined}
              className={cn(
                "px-2 py-1 rounded-lg text-[var(--fs-base)] font-medium transition-all border-2",
                completed
                  ? isError
                    ? "bg-red-100 border-red-400 text-red-800 underline decoration-2"
                    : isWrongSelection
                      ? "bg-orange-100 border-orange-300 text-orange-700"
                      : isSelected && isCorrect
                        ? "bg-emerald-100 border-emerald-400 text-emerald-800"
                        : "border-transparent text-gray-700"
                  : isSelected
                    ? "bg-blue-100 border-blue-400 text-blue-800"
                    : "border-transparent text-gray-800 hover:bg-blue-50 hover:border-blue-200"
              )}
            >
              {word}
            </motion.button>
          );
        })}
      </div>

      {/* 선택 안내 */}
      {!completed && selectedIdx === null && (
        <p className="text-[var(--fs-xs)] text-gray-400 text-center">
          문법 오류가 있는 단어를 탭하세요
        </p>
      )}

      {/* 확인 버튼 */}
      {!completed && selectedIdx !== null && (
        <button
          onClick={handleSubmit}
          className="w-full py-3 rounded-xl bg-blue-500 text-white font-semibold text-[var(--fs-base)] active:scale-[0.98] transition-all"
        >
          확인
        </button>
      )}
    </div>
  );
}
