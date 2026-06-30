"use client";

import { cn } from "@/lib/utils";
import { BookOpen, Brain, FileText, GraduationCap, Languages, MessageSquare, Pencil, ScanText, Zap } from "lucide-react";

export interface CreditSummary {
  balance: number;
  monthlyAllocation: number;
  bonusCredits: number;
  totalConsumed: number;
  totalAllocated: number;
  isLow: boolean;
  threshold: number;
  planName?: string;
  planTier?: string;
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  operationType?: string;
  description?: string;
  staffId?: string;
  createdAt: string;
}

export const TYPE_LABELS: Record<string, string> = {
  CONSUMPTION: "사용",
  ALLOCATION: "배정",
  TOP_UP: "충전",
  ADJUSTMENT: "조정",
  REFUND: "환불",
  RESET: "리셋",
  ROLLOVER: "이월",
};

export const FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "CONSUMPTION", label: "사용" },
  { value: "ALLOCATION", label: "배정" },
  { value: "TOP_UP", label: "충전" },
  { value: "REFUND", label: "환불" },
  { value: "ADJUSTMENT", label: "조정" },
];

export const OPERATION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  QUESTION_GEN_SINGLE: FileText,
  QUESTION_GEN_VOCAB: BookOpen,
  AUTO_GEN_BATCH: Zap,
  LEARNING_QUESTION_GEN: GraduationCap,
  PASSAGE_ANALYSIS: Brain,
  GRAMMAR_ENHANCEMENT: Languages,
  SENTENCE_RETRANSLATION: Languages,
  QUESTION_EXPLANATION: FileText,
  QUESTION_MODIFY: Pencil,
  AI_CHAT: MessageSquare,
  TEXT_EXTRACTION: ScanText,
};

export const OPERATION_COLORS: Record<string, { bg: string; text: string }> = {
  QUESTION_GEN_SINGLE: { bg: "bg-blue-50", text: "text-blue-500" },
  QUESTION_GEN_VOCAB: { bg: "bg-sky-50", text: "text-sky-500" },
  AUTO_GEN_BATCH: { bg: "bg-violet-50", text: "text-violet-500" },
  LEARNING_QUESTION_GEN: { bg: "bg-indigo-50", text: "text-indigo-500" },
  PASSAGE_ANALYSIS: { bg: "bg-emerald-50", text: "text-emerald-500" },
  GRAMMAR_ENHANCEMENT: { bg: "bg-teal-50", text: "text-teal-500" },
  SENTENCE_RETRANSLATION: { bg: "bg-cyan-50", text: "text-cyan-500" },
  QUESTION_EXPLANATION: { bg: "bg-blue-50", text: "text-blue-500" },
  QUESTION_MODIFY: { bg: "bg-slate-100", text: "text-slate-500" },
  AI_CHAT: { bg: "bg-pink-50", text: "text-pink-500" },
  TEXT_EXTRACTION: { bg: "bg-gray-100", text: "text-gray-500" },
};

export function OverviewCard({
  label,
  value,
  icon: Icon,
  accent,
  comingSoon = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: "emerald" | "blue" | "indigo" | "gray" | "red";
  comingSoon?: boolean;
}) {
  const accentMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-500", value: "text-emerald-700" },
    blue: { bg: "bg-blue-50", text: "text-blue-500", value: "text-blue-700" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-500", value: "text-indigo-700" },
    gray: { bg: "bg-gray-100", text: "text-gray-500", value: "text-gray-700" },
    red: { bg: "bg-red-50", text: "text-red-500", value: "text-red-700" },
  };
  const colors = accentMap[accent];

  if (comingSoon) {
    return (
      <div
        className="relative bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 overflow-hidden select-none"
        aria-disabled
      >
        <div className="pointer-events-none opacity-40 grayscale">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-gray-400">{label}</span>
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100">
              <Icon className="size-3.5 text-gray-400" strokeWidth={1.8} />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-bold tabular-nums tracking-tight text-gray-400">
              {value.toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-400 font-medium">크레딧</span>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-[1px]">
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-500 shadow-sm">
            준비중
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-gray-400">{label}</span>
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-lg", colors.bg)}>
          <Icon className={cn("size-3.5", colors.text)} strokeWidth={1.8} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-[22px] font-bold tabular-nums tracking-tight", colors.value)}>
          {value.toLocaleString()}
        </span>
        <span className="text-[11px] text-gray-400 font-medium">크레딧</span>
      </div>
    </div>
  );
}
