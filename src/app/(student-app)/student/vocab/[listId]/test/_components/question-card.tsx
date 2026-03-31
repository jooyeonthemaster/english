"use client";

import { useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestType } from "@/hooks/use-vocab-test";
import FlashOverlay from "./flash-overlay";

interface QuestionCardProps {
  prompt: string;
  options: string[];
  type: TestType;
  isCorrect: boolean | null;
  correctAnswer: string;
  selectedAnswer: string | null;
  onAnswer: (answer: string) => void;
  onNext: () => void;
  state: string;
}

export default function QuestionCard({
  prompt,
  options,
  type,
  isCorrect,
  correctAnswer,
  selectedAnswer,
  onAnswer,
  onNext,
  state,
}: QuestionCardProps) {
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
