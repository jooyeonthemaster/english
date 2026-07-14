"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Cpu, Crosshair, FileText, Loader2, Target, X } from "lucide-react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { triggerHintGlowWithin } from "@/lib/hint-glow";

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
  /** 지문 전문 — 헤더를 토글하면 팝오버로 펼쳐 보여준다. */
  fullContent: string;
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
  /** 모바일 전용 — 이 모달은 '유형 담기(설정)'만 하고 즉시 생성하지 않는다.
   *  실제 생성은 워크스페이스 하단 '문제 확인' 일괄 생성이 담당(설정은 실시간 저장됨). */
  configOnly?: boolean;
  /** '포인트 짚어주기' 픽커 열림 — 카드가 2컬럼(지문 무대 + 설정 콘솔)으로 성장한다. */
  pickerOpen?: boolean;
  /** Esc 사다리 1단 — 픽커만 닫고 설정 콘솔로 복귀한다(모달은 유지). */
  onPickerClose?: () => void;
  /** 좌측 지문 무대 슬롯(PassagePointPicker) — pickerOpen 일 때만 렌더된다. */
  picker?: ReactNode;
  /** 이 지문에 반영된 교사 포인트 총수 — 푸터 '포인트 N개 반영' 칩. */
  appliedPointCount?: number;
  /** 푸터 '포인트 N개 반영' 칩 클릭 — 해당 유형 픽커 재진입(수정·복구 동선). */
  onPointChipClick?: () => void;
  /** 포인트는 있는데 문항 수가 0인 유형 존재 — 칩에 '문항 수를 지정하세요' 보조 문구. */
  pointCountMissing?: boolean;
  /** GenerationConfigPanel (hideGenerateButtons) */
  children: ReactNode;
}

export function PassageGenerateModal({
  open,
  onClose,
  passageNumber,
  title,
  contentPreview,
  fullContent,
  wordCount,
  questions,
  creditCost,
  needsVariant = false,
  generating,
  onGenerate,
  configOnly = false,
  pickerOpen = false,
  onPickerClose,
  picker,
  appliedPointCount = 0,
  onPointChipClick,
  pointCountMissing = false,
  children,
}: PassageGenerateModalProps) {
  // Esc 로 닫기 — 생성 중에는 막지 않는다(생성은 fire-and-forget 라 닫아도 진행).
  // 사다리: 픽커 열림 중 Esc 1회 = 픽커만 닫기(설정 복귀), 2회 = 모달 닫기.
  // 이 게이트가 없으면 Esc 한 번에 포인트 선택 작업 전체가 유실된다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pickerOpen && onPickerClose) {
        onPickerClose();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pickerOpen, onPickerClose]);

  // 본문(GenerationConfigPanel) 영역 — '유형을 선택하세요'가 비활일 때 눌리면 이
  // 안의 유형 카드들을 글로우해 "유형 문항 수를 올리세요"를 유도한다.
  const bodyRef = useRef<HTMLDivElement>(null);

  // 헤더 지문 미리보기 → 클릭 시 전문 팝오버 토글.
  const [showFull, setShowFull] = useState(false);
  // 모달이 닫히면 다음에 열 때 접힌 상태로 시작. 픽커가 열리면(지문이 무대에
  // 전문 노출) 팝오버도 접는다 — 픽커 위에 겹치는 팝오버 0건.
  useEffect(() => {
    if (!open || pickerOpen) setShowFull(false);
  }, [open, pickerOpen]);

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
        className={
          // 픽커 모드에서 카드가 2컬럼 폭으로 성장(max-width 모프).
          "relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-[max-width] duration-300 ease-out " +
          (pickerOpen ? "max-w-[1520px]" : "max-w-[1200px]")
        }
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 문제 생성 설정`}
      >
        {/* ── 헤더: 어떤 지문을 설정 중인지 크게 ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="relative min-w-0 flex-1">
            {/* 픽커 열림 중에는 지문 전문이 좌측 무대에 이미 노출 — 팝오버
                트리거를 숨기고 제목만 정적으로 표시한다. */}
            {pickerOpen ? (
              <div className="inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5">
                <FileText className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                <span className="smoat-gen-modal-title min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-slate-900">
                  {title}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                aria-expanded={showFull}
                title="클릭하면 지문 전문을 볼 수 있어요"
                className="inline-flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 transition-colors hover:bg-slate-100"
              >
                <FileText className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                <span className="smoat-gen-modal-title min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-slate-900">
                  {title}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    showFull ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
            )}

            {/* 지문 전문 팝오버 */}
            {showFull && !pickerOpen ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                  {fullContent}
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── 본문: 이 지문의 유형·생성 설정 (GenerationConfigPanel) ──
            픽커 모드: 좌 지문 무대(PassagePointPicker) + 우 설정 콘솔 2컬럼.
            모바일은 뷰 스왑 — 픽커 열림 중 콘솔을 숨겨 무대가 전폭을 쓴다. */}
        <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
          {pickerOpen && picker ? (
            <div className="flex min-h-0 min-w-0 flex-1">{picker}</div>
          ) : null}
          <div
            ref={bodyRef}
            className={
              // 픽커 모드에서는 콘솔 폭이 440px 로 줄어 유형 타일 2컬럼이 1글자
              // 말줄임으로 붕괴한다 — 컨테이너 조건으로 타일 그리드를 1컬럼 강제.
              pickerOpen && picker
                ? "hidden min-h-0 w-[440px] shrink-0 flex-col overflow-hidden border-l border-slate-200 lg:flex [&_[data-type-tile-grid]]:grid-cols-1"
                : "flex min-h-0 flex-1 flex-col overflow-hidden"
            }
          >
            {children}
          </div>
        </div>

        {/* ── 푸터: 이 지문으로 생성 ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5">
          {appliedPointCount > 0 ? (
            // 교사가 짚은 포인트가 생성 프롬프트에 필수 반영됨을 CTA 직전에 확약.
            // 클릭하면 해당 유형 픽커로 재진입한다(수정·"문항 수 0" 복구 동선).
            <div className="mb-2.5 flex items-center">
              <button
                type="button"
                onClick={onPointChipClick}
                disabled={!onPointChipClick}
                title="포인트 짚어주기 다시 열기"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-default disabled:hover:bg-blue-50"
              >
                <Crosshair className="size-3 shrink-0" aria-hidden="true" />
                <span>포인트 {appliedPointCount}개 반영</span>
                {pointCountMissing ? (
                  <span className="font-medium text-blue-600">
                    · 문항 수를 지정하세요
                  </span>
                ) : null}
              </button>
            </div>
          ) : null}
          {needsVariant ? (
            <p className="mb-2.5 rounded-md bg-slate-50 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-slate-500">
              편집·범위 지정된 지문이라 생성 시 ‘변형본’ 새 지문으로 저장된 뒤
              출제됩니다. 원본 지문은 그대로 보존돼요.
            </p>
          ) : null}
          <button
            type="button"
            // aria-disabled — 비활처럼 보이되 클릭은 살려, 유형 미선택(문제 0)일 때
            // 누르면 유형 카드들을 글로우해 "문항 수를 올리세요"를 유도한다.
            aria-disabled={configOnly ? questions === 0 : !canGenerate}
            onClick={() => {
              if (questions === 0) {
                triggerHintGlowWithin(bodyRef.current, "[data-question-type-id]");
                return;
              }
              // 모바일(configOnly): 유형만 담고(설정은 실시간 저장됨) 워크스페이스로
              // 복귀 — 실제 생성은 하단 '문제 확인'의 일괄 생성이 담당한다.
              if (configOnly) {
                onClose();
                return;
              }
              if (generating) return;
              onGenerate();
            }}
            className={
              "flex h-10 lg:h-12 w-full items-center justify-center gap-1.5 lg:gap-2 rounded-xl px-4 text-[12px] lg:text-[14.5px] font-bold transition-all duration-200 " +
              ((configOnly ? questions > 0 : canGenerate)
                ? "bg-blue-600 text-white shadow-md shadow-blue-200/50 hover:bg-blue-700 hover:shadow-lg"
                : "cursor-not-allowed bg-slate-100 text-slate-400")
            }
          >
            {generating && !configOnly ? (
              <>
                <Loader2 className="size-3.5 lg:size-5 animate-spin" aria-hidden="true" />
                <span>생성 중…</span>
              </>
            ) : questions > 0 ? (
              <>
                {configOnly ? (
                  <Check className="size-3.5 lg:size-5" aria-hidden="true" />
                ) : (
                  <Cpu className="size-3.5 lg:size-5" aria-hidden="true" />
                )}
                <span>
                  {configOnly
                    ? `유형 담기 (${questions}문제)`
                    : `다음으로 (${questions}문제생성)`}
                </span>
                {creditCost > 0 ? (
                  <CreditCostChip
                    amount={creditCost}
                    className="ml-0.5 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                  />
                ) : null}
              </>
            ) : (
              <>
                <Target className="size-3.5 lg:size-5" aria-hidden="true" />
                <span>유형을 선택하세요</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
