"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 문항 네비게이터(하단 시트 오버레이)
//
// 전 문항 번호 그리드: 답함 = 파랑 채움 / 안 함 = outline / 현재 = 링 / 플래그 =
// 우상단 깃발 점. 탭 = 해당 문항으로 이동. 터치 타깃 h-11 이상(계약 §디자인).
// ============================================================================

import { Flag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialogA11y } from "./use-dialog-a11y";

export interface NavigatorItem {
  questionId: string;
  orderNum: number;
  answered: boolean;
  flagged: boolean;
}

interface NavigatorSheetProps {
  items: NavigatorItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function NavigatorSheet({
  items,
  currentIndex,
  onSelect,
  onClose,
}: NavigatorSheetProps) {
  const answeredCount = items.filter((item) => item.answered).length;
  const firstUnansweredIndex = items.findIndex((item) => !item.answered);
  const { containerRef, initialFocusRef } = useDialogA11y({ onClose });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="문항 이동"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-[#E5E8EB] bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#191F28]">문항 이동</h2>
            <p className="mt-0.5 text-xs text-[#8B95A1] tabular-nums">
              {answeredCount} / {items.length} 문항 응답
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {firstUnansweredIndex >= 0 && (
              <button
                type="button"
                onClick={() => onSelect(firstUnansweredIndex)}
                className="flex h-8 items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                첫 미응답으로
              </button>
            )}
            <button
              ref={initialFocusRef}
              type="button"
              onClick={onClose}
              aria-label="네비게이터 닫기"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#8B95A1] transition-colors hover:bg-[#F7F8FA]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {items.map((item, index) => {
              const isCurrent = index === currentIndex;
              return (
                <button
                  key={item.questionId}
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-label={`${item.orderNum}번 문항으로 이동${item.answered ? " (응답함)" : " (미응답)"}${item.flagged ? " (표시함)" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "relative flex h-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors tabular-nums",
                    item.answered
                      ? "border-[#3182F6] bg-[#3182F6] text-white"
                      : "border-[#E5E8EB] bg-white text-[#4E5968] hover:bg-[#F7F8FA]",
                    isCurrent && "ring-2 ring-[#3182F6] ring-offset-2",
                  )}
                >
                  {item.orderNum}
                  {item.flagged && (
                    <Flag
                      className={cn(
                        "absolute right-1 top-1 h-3 w-3",
                        item.answered ? "text-white" : "text-[#3182F6]",
                      )}
                      fill="currentColor"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#8B95A1]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-[#3182F6]" /> 응답함
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-[#E5E8EB] bg-white" />{" "}
              미응답
            </span>
            <span className="flex items-center gap-1.5">
              <Flag className="h-3 w-3 text-[#3182F6]" fill="currentColor" /> 표시한 문항
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
