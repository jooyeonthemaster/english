"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Question } from "@/hooks/use-vocab-test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SwipeCardProps {
  question: Question;
  questionIndex: number;
  isCorrect: boolean | null;
  selectedAnswer: string | null;
  onAnswer: (answer: string) => void;
  onNext: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SwipeCard({
  question,
  questionIndex,
  isCorrect,
  selectedAnswer,
  onAnswer,
  onNext,
}: SwipeCardProps) {
  const [spellingInput, setSpellingInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear spelling input when question changes
  useEffect(() => {
    setSpellingInput("");
    if (question.type === "SPELLING" && inputRef.current) {
      // Small delay to let animations settle before focusing
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [questionIndex, question.type]);

  // Auto-advance on correct answer
  useEffect(() => {
    if (isCorrect === true) {
      autoAdvanceRef.current = setTimeout(() => {
        onNext();
      }, 800);
    }
    return () => {
      if (autoAdvanceRef.current) {
        clearTimeout(autoAdvanceRef.current);
      }
    };
  }, [isCorrect, onNext]);

  const handleSpellingSubmit = () => {
    const trimmed = spellingInput.trim();
    if (!trimmed) return;
    onAnswer(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isCorrect === null) {
        handleSpellingSubmit();
      } else if (isCorrect === false) {
        onNext();
      }
    }
  };

  const isMultipleChoice =
    question.type === "EN_TO_KR" || question.type === "KR_TO_EN";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={questionIndex}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -12 }}
        transition={{
          type: "spring",
          stiffness: 350,
          damping: 30,
          mass: 0.8,
        }}
        className="flex flex-col gap-6"
      >
        {/* Flash overlay for correct/wrong */}
        <AnimatePresence>
          {isCorrect === true && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none fixed inset-0 z-50 bg-[#4CAF50]/6"
            />
          )}
          {isCorrect === false && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none fixed inset-0 z-50 bg-[#EF4444]/6"
            />
          )}
        </AnimatePresence>

        {/* Prompt word display card */}
        <div className="relative flex flex-col items-center justify-center rounded-2xl bg-white py-12 shadow-float">
          {/* Subtle gradient border effect */}
          <div
            className="absolute inset-0 rounded-2xl opacity-20"
            style={{
              background:
                "linear-gradient(135deg, #7CB342 0%, #AED581 50%, #7CB342 100%)",
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              WebkitMaskComposite: "xor",
              padding: "1px",
              borderRadius: "1rem",
            }}
          />

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="relative z-10 text-center text-[26px] font-bold tracking-[-0.02em] text-[#1A1F16] leading-tight px-6"
          >
            {question.prompt}
          </motion.p>
          {question.item.partOfSpeech && isMultipleChoice && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative z-10 mt-2.5 rounded-full bg-[#F3F4F0] px-3 py-1 text-[12px] font-medium text-[#9CA396]"
            >
              {question.item.partOfSpeech}
            </motion.span>
          )}
        </div>

        {/* Multiple choice options */}
        {isMultipleChoice && (
          <div className="grid grid-cols-2 gap-2.5 px-1">
            {question.options.map((option, idx) => {
              const isSelected = selectedAnswer === option;
              const isCorrectOption =
                option.toLowerCase().trim() ===
                question.correctAnswer.toLowerCase().trim();
              const answered = isCorrect !== null;

              let optionClasses =
                "bg-white border-[#E5E7E0] text-[#4A5043] shadow-card hover:shadow-card-hover active:scale-[0.97]";

              if (answered) {
                if (isCorrectOption) {
                  optionClasses =
                    "bg-gradient-to-br from-[#D1FAE5] to-[#A7F3D0] border-[#4CAF50] text-[#065F46] shadow-[0_0_12px_rgba(76,175,80,0.15)]";
                } else if (isSelected && !isCorrectOption) {
                  optionClasses =
                    "bg-gradient-to-br from-[#FEE2E2] to-[#FECACA] border-[#EF4444] text-[#991B1B]";
                } else {
                  optionClasses =
                    "bg-[#FAFBF8] border-[#E5E7E0] text-[#C8CCC2]";
                }
              }

              return (
                <motion.button
                  key={`${questionIndex}-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + idx * 0.05, duration: 0.25 }}
                  whileTap={answered ? undefined : { scale: 0.95 }}
                  onClick={() => {
                    if (!answered) onAnswer(option);
                  }}
                  disabled={answered}
                  className={cn(
                    "flex items-center justify-center rounded-xl border-[1.5px] p-4 text-[14px] font-semibold transition-all duration-200 min-h-[56px]",
                    optionClasses,
                    !answered && "cursor-pointer",
                    answered && "cursor-default"
                  )}
                >
                  {option}
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Spelling input */}
        {question.type === "SPELLING" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.25 }}
            className="flex flex-col gap-3 px-1"
          >
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={isCorrect !== null ? selectedAnswer ?? "" : spellingInput}
                onChange={(e) => {
                  if (isCorrect === null) setSpellingInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                readOnly={isCorrect !== null}
                placeholder="영단어를 입력하세요"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className={cn(
                  "w-full rounded-xl border-2 bg-white px-4 py-4 text-center text-[18px] font-bold tracking-[-0.01em] outline-none transition-all duration-200 placeholder:text-[#C8CCC2] placeholder:font-normal placeholder:text-[15px]",
                  isCorrect === null &&
                    "border-[#E5E7E0] focus:border-[#7CB342] focus:shadow-[0_0_0_3px_rgba(124,179,66,0.1)]",
                  isCorrect === true &&
                    "border-[#4CAF50] bg-gradient-to-br from-[#D1FAE5]/50 to-[#A7F3D0]/50 text-[#065F46]",
                  isCorrect === false &&
                    "border-[#EF4444] bg-gradient-to-br from-[#FEE2E2]/50 to-[#FECACA]/50 text-[#991B1B]"
                )}
              />
            </div>

            {/* Submit button or result feedback */}
            {isCorrect === null && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSpellingSubmit}
                disabled={!spellingInput.trim()}
                className={cn(
                  "flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-bold transition-all duration-200",
                  spellingInput.trim()
                    ? "gradient-primary text-white shadow-glow-green"
                    : "bg-[#F3F4F0] text-[#C8CCC2] cursor-not-allowed"
                )}
              >
                확인
              </motion.button>
            )}

            {/* Show correct answer on wrong */}
            {isCorrect === false && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-1.5"
              >
                <p className="text-[12px] font-medium text-[#9CA396]">정답</p>
                <p className="text-[18px] font-bold text-[#4CAF50]">
                  {question.correctAnswer}
                </p>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* "다음" button when wrong (MC auto-advances only on correct) */}
        {isCorrect === false && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-2 px-1"
          >
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onNext}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#1A1F16] text-[15px] font-bold text-white transition-colors active:bg-[#252B20]"
            >
              다음
            </motion.button>
          </motion.div>
        )}

        {/* Correct indicator */}
        {isCorrect === true && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="flex items-center justify-center"
          >
            <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#D1FAE5] to-[#A7F3D0] px-5 py-2.5 shadow-[0_0_16px_rgba(76,175,80,0.15)]">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                className="text-[#4CAF50]"
              >
                <path
                  d="M3.75 9.75L7.5 13.5L14.25 4.5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[14px] font-bold text-[#065F46]">
                정답!
              </span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
