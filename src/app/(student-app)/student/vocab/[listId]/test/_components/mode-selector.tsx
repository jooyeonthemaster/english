"use client";

import { motion } from "framer-motion";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestType } from "@/hooks/use-vocab-test";

const MODES = [
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

interface ModeSelectorProps {
  onSelect: (mode: TestType) => void;
  listTitle: string;
  wordCount: number;
}

export default function ModeSelector({ onSelect, listTitle, wordCount }: ModeSelectorProps) {
  return (
    <div className="px-5 pt-6 pb-4">
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-gray-900">{listTitle}</h1>
        <p className="text-sm text-gray-400 mt-1">{wordCount}단어</p>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">시험 유형 선택</h2>
      <div className="space-y-3">
        {MODES.map((mode) => (
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
