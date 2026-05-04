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
    <div className="space-y-3">
      {/* 진행 카운터 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(matches.size / pairs.length) * 100}%`, backgroundColor: "#58CC02" }}
          />
        </div>
        <span className="text-xs font-bold text-black">{matches.size}/{pairs.length}</span>
      </div>

      <div className="flex gap-3">
        {/* 영어 열 */}
        <div className="flex-1 space-y-2.5">
          {pairs.map((p, i) => {
            const isMatched = matches.has(i);
            const isSelected = selectedEn === i;
            const isWrong = wrongPair?.en === i;
            return (
              <motion.button
                key={`en-${i}`}
                onClick={() => handleEnClick(i)}
                className={cn(
                  "card-3d w-full py-3.5 px-4 text-sm font-medium text-left",
                  isMatched
                    ? "!border-emerald-300 !border-b-emerald-400 bg-emerald-50 text-emerald-700 opacity-60"
                    : isWrong
                      ? "!border-red-300 !border-b-red-400 bg-red-50 text-red-700 animate-shake"
                      : isSelected
                        ? "!border-orange-400 !border-b-orange-500 bg-orange-50 text-orange-700"
                        : "text-black"
                )}
                disabled={isMatched}
              >
                {p.en}
                {isMatched && <span className="ml-1 text-emerald-500">✓</span>}
              </motion.button>
            );
          })}
        </div>

        {/* 한국어 열 */}
        <div className="flex-1 space-y-2.5">
          {shuffledKo.map((ko, i) => {
            const isMatched = matchedKoIndices.has(i);
            const isWrong = wrongPair?.ko === i;
            return (
              <motion.button
                key={`ko-${i}`}
                onClick={() => handleKoClick(i)}
                className={cn(
                  "card-3d w-full py-3.5 px-4 text-sm font-medium text-left",
                  isMatched
                    ? "!border-emerald-300 !border-b-emerald-400 bg-emerald-50 text-emerald-700 opacity-60"
                    : isWrong
                      ? "!border-red-300 !border-b-red-400 bg-red-50 text-red-700 animate-shake"
                      : selectedEn !== null
                        ? "bg-gray-50 text-black"
                        : "text-black"
                )}
                disabled={isMatched || selectedEn === null}
              >
                {ko}
                {isMatched && <span className="ml-1 text-emerald-500">✓</span>}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
