"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// WORD_ARRANGE / SENT_CHUNK_ORDER — 단어/청크 배열
// ---------------------------------------------------------------------------

interface ArrangeInteractionProps {
  /** 셔플된 조각들 */
  pieces: string[];
  /** 정답 순서 (문자열 배열 또는 인덱스 배열) */
  correctOrder: string[] | number[];
  /** 힌트 (한국어 해석 등) */
  hint?: string;
  /** 함정 단어 (WORD_ARRANGE용) */
  distractors?: string[];
  onComplete: (isCorrect: boolean) => void;
  disabled?: boolean;
}

export default function ArrangeInteraction({
  pieces,
  correctOrder,
  hint,
  distractors,
  onComplete,
  disabled,
}: ArrangeInteractionProps) {
  // 사용 가능한 조각들 (pieces + distractors 셔플)
  const [allPieces] = useState(() => {
    const all = [...pieces, ...(distractors || [])];
    return all.sort(() => Math.random() - 0.5);
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 정답 문자열 배열로 정규화
  const correctStrings: string[] =
    typeof correctOrder[0] === "number"
      ? (correctOrder as number[]).map((idx) => pieces[idx])
      : (correctOrder as string[]);

  const handlePieceClick = useCallback(
    (piece: string, fromSelected: boolean) => {
      if (disabled || completed) return;

      if (fromSelected) {
        // 선택 해제
        setSelected((prev) => {
          const idx = prev.indexOf(piece);
          if (idx === -1) return prev;
          return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
      } else {
        // 선택
        setSelected((prev) => [...prev, piece]);
      }
    },
    [disabled, completed]
  );

  const handleSubmit = useCallback(() => {
    if (completed) return;
    const correct =
      selected.length === correctStrings.length &&
      selected.every((s, i) => s === correctStrings[i]);
    setIsCorrect(correct);
    setCompleted(true);
    onComplete(correct);
  }, [completed, selected, correctStrings, onComplete]);

  // 아직 선택 안 된 조각들
  const available = allPieces.filter(
    (p) => {
      const selectedCount = selected.filter((s) => s === p).length;
      const totalCount = allPieces.filter((a) => a === p).length;
      return selectedCount < totalCount;
    }
  );

  return (
    <div className="space-y-4">
      {/* 선택된 배열 영역 */}
      <div
        className={cn(
          "min-h-[3.5rem] rounded-xl border-2 border-dashed p-2 flex flex-wrap gap-1.5",
          completed
            ? isCorrect
              ? "border-emerald-300 bg-emerald-50"
              : "border-red-300 bg-red-50"
            : "border-gray-300 bg-gray-50"
        )}
      >
        <AnimatePresence>
          {selected.map((piece, i) => (
            <motion.button
              key={`sel-${i}-${piece}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={() => handlePieceClick(piece, true)}
              disabled={completed}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[var(--fs-sm)] font-medium border transition-all",
                completed
                  ? isCorrect
                    ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                    : "bg-red-100 border-red-300 text-red-800"
                  : "bg-blue-100 border-blue-300 text-blue-800 active:scale-95"
              )}
            >
              {piece}
              {!completed && <X className="inline ml-1 size-3 opacity-50" />}
            </motion.button>
          ))}
        </AnimatePresence>
        {selected.length === 0 && (
          <span className="text-[var(--fs-xs)] text-gray-400 self-center px-2">
            아래에서 순서대로 선택하세요
          </span>
        )}
      </div>

      {/* 사용 가능한 조각들 */}
      <div className="flex flex-wrap gap-1.5">
        {available.map((piece, i) => (
          <motion.button
            key={`avl-${i}-${piece}`}
            onClick={() => handlePieceClick(piece, false)}
            disabled={completed}
            whileTap={{ scale: 0.95 }}
            className="px-3 py-1.5 rounded-lg text-[var(--fs-sm)] font-medium bg-white border-2 border-gray-200 text-gray-800 hover:border-blue-300 transition-all"
          >
            {piece}
          </motion.button>
        ))}
      </div>

      {/* 확인 버튼 */}
      {!completed && selected.length > 0 && (
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
