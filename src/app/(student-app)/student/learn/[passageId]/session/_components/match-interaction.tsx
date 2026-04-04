"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// WORD_MATCH — 영어-한국어 5쌍 매칭
// ---------------------------------------------------------------------------

interface MatchPair {
  en: string;
  ko: string;
}

interface MatchInteractionProps {
  pairs: MatchPair[];
  onComplete: (isCorrect: boolean) => void;
  disabled?: boolean;
}

export default function MatchInteraction({ pairs, onComplete, disabled }: MatchInteractionProps) {
  const [shuffledKo] = useState(() =>
    [...pairs].sort(() => Math.random() - 0.5).map((p) => p.ko)
  );
  const [selectedEn, setSelectedEn] = useState<number | null>(null);
  const [matches, setMatches] = useState<Map<number, number>>(new Map()); // enIdx → koIdx
  const [wrongPair, setWrongPair] = useState<{ en: number; ko: number } | null>(null);
  const [completed, setCompleted] = useState(false);

  const correctMap = new Map(
    pairs.map((p, i) => [i, shuffledKo.indexOf(p.ko)])
  );

  const handleEnClick = useCallback(
    (idx: number) => {
      if (disabled || completed || matches.has(idx)) return;
      setSelectedEn(idx);
      setWrongPair(null);
    },
    [disabled, completed, matches]
  );

  const handleKoClick = useCallback(
    (koIdx: number) => {
      if (disabled || completed || selectedEn === null) return;
      if ([...matches.values()].includes(koIdx)) return; // 이미 매칭됨

      const isCorrectPair = correctMap.get(selectedEn) === koIdx;

      if (isCorrectPair) {
        const next = new Map(matches);
        next.set(selectedEn, koIdx);
        setMatches(next);
        setSelectedEn(null);
        setWrongPair(null);

        // 전부 매칭되면 완료
        if (next.size === pairs.length) {
          setCompleted(true);
          onComplete(true);
        }
      } else {
        setWrongPair({ en: selectedEn, ko: koIdx });
        setTimeout(() => {
          setWrongPair(null);
          setSelectedEn(null);
        }, 600);
      }
    },
    [disabled, completed, selectedEn, matches, correctMap, pairs.length, onComplete]
  );

  const matchedKoIndices = new Set(matches.values());

  return (
    <div className="flex gap-3">
      {/* 영어 열 */}
      <div className="flex-1 space-y-2">
        {pairs.map((p, i) => {
          const isMatched = matches.has(i);
          const isSelected = selectedEn === i;
          const isWrong = wrongPair?.en === i;
          return (
            <motion.button
              key={`en-${i}`}
              onClick={() => handleEnClick(i)}
              className={cn(
                "w-full py-3 px-3 rounded-xl text-[var(--fs-sm)] font-medium border-2 transition-all text-left",
                isMatched
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : isWrong
                    ? "bg-red-50 border-red-300 text-red-700 animate-shake"
                    : isSelected
                      ? "bg-blue-50 border-blue-400 text-blue-700"
                      : "bg-white border-gray-200 text-gray-900"
              )}
              disabled={isMatched}
            >
              {p.en}
            </motion.button>
          );
        })}
      </div>

      {/* 한국어 열 */}
      <div className="flex-1 space-y-2">
        {shuffledKo.map((ko, i) => {
          const isMatched = matchedKoIndices.has(i);
          const isWrong = wrongPair?.ko === i;
          return (
            <motion.button
              key={`ko-${i}`}
              onClick={() => handleKoClick(i)}
              className={cn(
                "w-full py-3 px-3 rounded-xl text-[var(--fs-sm)] font-medium border-2 transition-all text-left",
                isMatched
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : isWrong
                    ? "bg-red-50 border-red-300 text-red-700 animate-shake"
                    : selectedEn !== null
                      ? "bg-gray-50 border-gray-300 text-gray-700 hover:border-blue-300"
                      : "bg-white border-gray-200 text-gray-600"
              )}
              disabled={isMatched || selectedEn === null}
            >
              {ko}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
