"use client";

// ============================================================================
// 레일 「다음 단계」 블록 — 표시 전용(v4, 26-09-02).
// 정본: docs/exam-analysis-v4-spec.md §3 U5-1·U5-4 · §4 다음 단계 블록 · §2.5 셀렉터
//
// 내용(kind·title·description·cta·progress)은 전부 deriveExamNextStep 산출물 —
// 이 컴포넌트는 판정을 하지 않는다. 동작은 호출부(rail-next-step-actions.ts)가
// onAction 으로 넣는다. onAction 이 없으면 CTA 를 그리지 않는다(레일이 해결
// 못 하는 kind — 예: resume-upload 는 허브 등록 흐름 소관 — 에 죽은 버튼 금지).
//
// CTA 문법(§4): h-10 full-width · 프라이머리 = dossier-pick-bar ACTION 토큰 미러
// (bg-blue-600 rounded-lg text-[12.5px] font-bold — 디자인 언어 bold 예외) ·
// 과금(creditCost)·danger 는 RailConfirmButton 2단 + 「Ncr」 코스트 칩 ·
// INTERNAL 배포 링크만 <a target=_blank data-rail-escape-allowed>(§1-8 유일 예외).
// 크레딧 숫자는 step.cta.creditCost(호출부가 CREDIT_COSTS 로 산출) 외 출처 없음.
// 톤(26-09-02 수정 루프 U5-spec-1): 과금 CTA 도 cta.tone 이 primary 면 채운 blue
// (RailConfirmButton tone="primary" + 밝은 코스트 칩) — 무료 프라이머리와 같은
// 위계. 과금이지만 secondary 는 charge(아웃라인), danger(retry-failed)는 rose 유지.
// 표기 통일: formatCredits(n) = `${n}cr`(공백 없음) — 학생 아코디언 라벨과 동일.
// ============================================================================

import { ExternalLink, Loader2 } from "lucide-react";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type {
  ExamNextStep,
  ExamNextStepCosts,
} from "@/lib/exam-report/next-step";
import { cn } from "@/lib/utils";
import { RailConfirmButton } from "./rail-confirm-button";

/** deriveExamNextStep 단가 — 유일 출처 CREDIT_COSTS(§1-9). */
export const NEXT_STEP_COSTS: ExamNextStepCosts = {
  boostPerQuestion: CREDIT_COSTS.EXAM_ANALYSIS_BOOST,
  reportPerStudent: CREDIT_COSTS.EXAM_STUDENT_REPORT,
};

// 중앙 도크(analysis-dock BUTTON_BASE)와 **같은 규격**: h-10 · rounded-lg · 13px·bold.
// 26-09-04 실측으로 폰트가 16 vs 17px 로 갈려 있던 것을 맞췄다(높이는 둘 다 52px).
const CTA_BASE =
  "flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg text-[13px] transition-colors disabled:cursor-default disabled:opacity-50";
const CTA_PRIMARY = `${CTA_BASE} bg-blue-600 font-bold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800`;
const CTA_SECONDARY = `${CTA_BASE} border border-slate-200 bg-white font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50`;

/** 보조 액션 계약 — 액션 훅이 계속 산출한다. **현재 도크는 그리지 않는다**
 *  (26-09-04 「버튼만 남겨」) — 되살릴 때 이 타입을 그대로 쓰면 된다. */
export interface RailNextStepSecondary {
  label: string;
  onClick: () => void;
}

/** 크레딧 표기 단일 서식 — 「5cr」(숫자는 항상 CREDIT_COSTS 파생, §1-9). */
export function formatCredits(n: number): string {
  return `${n}cr`;
}

export function CostChip({
  cost,
  onDark = false,
}: {
  cost: number;
  /** 채운 blue 버튼 위(primary) — 밝은 반투명 칩 */
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-semibold tabular-nums ring-1 ring-inset",
        onDark
          ? "bg-white/15 text-white ring-white/30"
          : "bg-amber-50 text-amber-700 ring-amber-200/60",
      )}
    >
      {formatCredits(cost)}
    </span>
  );
}

export function RailNextStepBlock({
  step,
  onAction,
  busy = false,
  disabled = false,
  note,
  escapeHref,
}: {
  step: ExamNextStep;
  /** 없으면 CTA 미표시(레일이 해결 못 하는 단계). */
  onAction?: (() => void) | null;
  busy?: boolean;
  disabled?: boolean;
  /** CTA 가 **없는** 단계에서만 그리는 보조 문장(진행 안내·이사 안내). */
  note?: string | null;
  /** INTERNAL add-students — 배포 화면 새 탭(§1-8 유일 탈출구). */
  escapeHref?: string | null;
}) {
  const { cta, progress } = step;
  const percent =
    progress && progress.total > 0
      ? Math.round(
          Math.min(1, Math.max(0, progress.completed / progress.total)) * 100,
        )
      : null;
  const confirmTone =
    cta?.tone === "danger"
      ? "danger"
      : cta?.creditCost != null
        ? cta.tone === "primary"
          ? "primary"
          : "charge"
        : null;

  // 【26-09-04 사용자 지시】 "이 버튼만 남기고 나머지 다른 것들 좀 정리해."
  // CTA 가 있으면 **버튼 하나만** 그린다 — 아이브로우·제목·진행 바·안내·보조 링크
  // 전부 걷어냈다(도크는 카드가 아니라 액션 바다). 걷어낸 정보는 사라진 게 아니라
  // 제자리에 이미 있다: 관점 이름은 탭 본문 첫 줄 캡션, 미채점 문항 안내는 학생
  // 아코디언의 amber 스트립, 진행률은 헤더 진행 바·카드 힌트 줄.
  // ⚠ CTA 가 **없는** 단계(analyzing·boost-running·reports-generating, 그리고 분석
  //   계열처럼 CTA 가 중앙 도크로 이사한 kind)까지 비우면 도크가 빈 상자가 된다 —
  //   그 경우에만 제목 1줄(+진행 바·안내)을 남긴다. 껍데기 카드(blue tint)도 CTA
  //   단독일 땐 그리지 않는다(버튼 안의 버튼처럼 보이는 상자-속-상자 방지).
  const ctaNode =
    cta && escapeHref ? (
      <a
        href={escapeHref}
        target="_blank"
        rel="noopener noreferrer"
        data-next-step-cta
        data-rail-escape-allowed
        className={CTA_SECONDARY}
      >
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        {cta.label}
      </a>
    ) : cta && onAction && confirmTone ? (
      <RailConfirmButton
        tone={confirmTone}
        busy={busy}
        disabled={disabled}
        onConfirm={onAction}
        confirmLabel={
          cta.creditCost != null
            ? `한 번 더 누르면 ${formatCredits(cta.creditCost)} 차감`
            : `한 번 더 누르면 ${cta.label}`
        }
        label={
          <>
            {cta.label}
            {cta.creditCost != null ? (
              <CostChip cost={cta.creditCost} onDark={confirmTone === "primary"} />
            ) : null}
          </>
        }
        className={cn(
          "h-10 w-full rounded-lg text-[13px]",
          // §4: bold 는 프라이머리 CTA 토큰에만 — 아웃라인(charge·danger)은 semibold.
          confirmTone === "primary" ? "font-bold" : "font-semibold",
        )}
        data-next-step-cta
      />
    ) : cta && onAction ? (
      <button
        type="button"
        data-next-step-cta
        disabled={busy || disabled}
        onClick={onAction}
        className={cn(cta.tone === "primary" ? CTA_PRIMARY : CTA_SECONDARY)}
      >
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : null}
        {cta.label}
      </button>
    ) : null;

  if (ctaNode) {
    return (
      <div data-next-step={step.kind} className="min-w-0">
        {ctaNode}
        {/* 26-09-05: **비활성** CTA 는 이유를 말해야 한다(선택 전 단계 — 왜 눌리지
            않는지 모르는 버튼이 가장 나쁘다). 활성 CTA 에는 여전히 안내를 안 붙인다
            (「버튼만 남겨」 지시 유지). */}
        {disabled && note ? (
          <p className="mt-1.5 break-keep text-center text-[11px] leading-relaxed text-slate-400">
            {note}
          </p>
        ) : null}
      </div>
    );
  }

  // CTA 없음 — 상태 1줄(+진행 바·안내). 여기까지 비우면 도크가 빈 상자가 된다.
  return (
    <div
      data-next-step={step.kind}
      className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5"
    >
      <p
        data-next-step-title
        className="break-keep text-[13px] font-semibold leading-snug text-slate-900"
      >
        {step.title}
      </p>

      {progress && progress.total > 0 ? (
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
            {progress.completed}/{progress.total}
          </span>
        </div>
      ) : null}

      {note ? (
        <p className="mt-1.5 break-keep text-[11px] leading-relaxed text-blue-600">
          {note}
        </p>
      ) : null}
    </div>
  );
}
