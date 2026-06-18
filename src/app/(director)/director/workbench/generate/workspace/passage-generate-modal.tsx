"use client";

import { useEffect, type ReactNode } from "react";
import { Cpu, FileText, Loader2, Target, X } from "lucide-react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";

// ============================================================================
// 지문별 '문제 생성' 모달 — 한 지문만의 유형·난이도·플랜을 설정하고 그 지문
// 하나로 문제를 생성한다. 본문(children)에는 GenerationConfigPanel 을 그대로
// 호스팅하고(hideGenerateButtons), 생성 CTA 는 이 모달 푸터가 소유한다.
//
// 레이아웃: 우측 사이드 컬럼을 없애고 "지문 = 자기 설정"을 한눈에 보이게 하는
// 재설계의 중심. 어떤 지문을 설정 중인지 헤더에 크게 박아 혼동을 없앤다.
// ============================================================================

interface PassageGenerateModalProps {
  open: boolean;
  onClose: () => void;
  /** "지문 N" 라벨용 (1-based 는 호출부에서 index+1 로 전달). */
  passageNumber: number;
  title: string;
  /** 본문 앞부분 미리보기 (어떤 지문인지 즉시 식별). */
  contentPreview: string;
  wordCount: number;
  /** 현재 설정으로 만들어질 문제 수. */
  questions: number;
  /** 현재 설정의 크레딧 비용. */
  creditCost: number;
  /** 변형본 저장이 필요한 지문인지(편집·범위 지정) — 안내 문구용. */
  needsVariant?: boolean;
  generating: boolean;
  /** 이 지문으로 생성 — 호출부에서 생성 실행 후 모달을 닫는다. */
  onGenerate: () => void;
  /** GenerationConfigPanel (hideGenerateButtons) */
  children: ReactNode;
}

export function PassageGenerateModal({
  open,
  onClose,
  passageNumber,
  title,
  contentPreview,
  wordCount,
  questions,
  creditCost,
  needsVariant = false,
  generating,
  onGenerate,
  children,
}: PassageGenerateModalProps) {
  // Esc 로 닫기 — 생성 중에는 막지 않는다(생성은 fire-and-forget 라 닫아도 진행).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canGenerate = questions > 0 && !generating;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 문제 생성 설정`}
      >
        {/* ── 헤더: 어떤 지문을 설정 중인지 크게 ── */}
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-violet-600 px-1 text-[11px] font-bold leading-none text-white tabular-nums">
                {passageNumber}
              </span>
              <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-slate-900">
                {title}
              </h2>
              <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-400">
                {wordCount} words
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-400">
              {contentPreview}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── 본문: 이 지문의 유형·생성 설정 (GenerationConfigPanel) ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {children}
        </div>

        {/* ── 푸터: 이 지문으로 생성 ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5">
          {needsVariant ? (
            <p className="mb-2.5 rounded-md bg-slate-50 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-slate-500">
              편집·범위 지정된 지문이라 생성 시 ‘변형본’ 새 지문으로 저장된 뒤
              출제됩니다. 원본 지문은 그대로 보존돼요.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!canGenerate) return;
              onGenerate();
            }}
            disabled={!canGenerate}
            className={
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-bold transition-all duration-200 " +
              (canGenerate
                ? "bg-violet-600 text-white shadow-md shadow-violet-200/50 hover:bg-violet-700 hover:shadow-lg"
                : "cursor-not-allowed bg-slate-100 text-slate-400")
            }
          >
            {generating ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                <span>생성 중…</span>
              </>
            ) : questions > 0 ? (
              <>
                <Cpu className="size-5" aria-hidden="true" />
                <span>이 지문으로 {questions}문제 생성하기</span>
                {creditCost > 0 ? (
                  <CreditCostChip
                    amount={creditCost}
                    className="ml-0.5 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                  />
                ) : null}
              </>
            ) : (
              <>
                <Target className="size-5" aria-hidden="true" />
                <span>유형을 선택하세요</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
