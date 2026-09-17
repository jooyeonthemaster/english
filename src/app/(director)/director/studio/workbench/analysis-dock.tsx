"use client";

// ============================================================================
// 시험 분석 판 하단 도크 — 「분석 시작」 CTA (26-09-03 사용자 지시)
//
// 지시 원문: "미분석 시험에 대해서 분석을 하는 이 버튼은 위치가 저 우측 탭이
// 아니라, [지문관리 하단 「실전 문제 생성」 버튼] 이런 식으로 좌측 탭에 고정이
// 된 상태로 있어야지. 철저하게 그 지문 관리 페이지의 느낌을 철저하게 확인하고
// 작업하도록 해."
//
// 그래서 **지문관리(library-pane) 하단 CTA 바의 토큰을 글자 단위로 승계**한다:
//   바   = `shrink-0 border-t border-slate-100 bg-white px-5 py-3`(스크롤러 밖
//          flex 형제 — 목록을 아무리 내려도 늘 하단)
//   버튼 = `flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg
//          px-2 text-[13px] font-bold text-white shadow-sm transition-colors`
//          + 활성 `cursor-pointer bg-blue-600 hover:bg-blue-700`
//          / 비활 `cursor-not-allowed bg-blue-300 shadow-none`
//   아이콘 = Cpu `h-4 w-4 shrink-0`(진행 중엔 Loader2 로 자리 교체 — 라벨 불변)
//   칩   = CreditCostChip, 파랑 바탕용 `bg-white/20 … text-white`
//   ⚠ **native disabled 금지 · aria-disabled 만**: 지문관리의 근거를 그대로 승계한다
//     — 비활성 클릭이 「무엇을 골라야 하는가」를 카드 글로우로 가르쳐야 하는데
//     disabled 는 그 클릭 자체를 삼킨다.
//
// 무엇을 쏘는가는 **레일과 같은 단일 소스**다(rail-next-step-actions
// `analyzeRequestFor`) — 판정은 next-step.ts, 실행은 그 함수 하나. 도크가 자기
// 산식을 갖는 순간 「카드는 되는데 레일은 안 된다」류 모순이 시작된다.
// 잠금은 레일과 같은 useRequestedLock(키 = 대상 id + kind).
//
// 대상은 **지금 선택된 것**이다(행 또는 후보) — 지문관리의 CTA 가 「선택한 지문」에
// 거는 것과 같은 규칙. 선택이 없거나 그 대상이 분석 계열이 아니면 비활성이고,
// 클릭하면 분석 가능한 카드를 글로우로 짚어 준다(hintSelectCards 관용구).
//
// 계약 셀렉터: `[data-analysis-dock]`(바) · `[data-analysis-dock-cta]`(버튼,
// `data-analysis-dock-kind` 로 현재 kind 노출).
// ============================================================================

import { useCallback } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ExamCandidateRow,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import { deriveExamAnalyzeStep } from "@/lib/exam-report/next-step";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { triggerHintGlow } from "@/lib/hint-glow";
import { RailConfirmButton } from "./analysis-rail/rail-confirm-button";
import { NEXT_STEP_COSTS } from "./analysis-rail/rail-next-step";
import {
  analyzeRequestFor,
  releaseOnFailure,
  useRequestedLock,
} from "./analysis-rail/rail-next-step-actions";

const BUTTON_BASE =
  "flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-white shadow-sm transition-colors";
const BUTTON_ON = "cursor-pointer bg-blue-600 hover:bg-blue-700";
const BUTTON_OFF = "cursor-not-allowed bg-blue-300 shadow-none";
/** 파랑 바탕 위 크레딧 칩 — 지문관리 행 푸터와 같은 관용구. */
const CHIP_CLASS =
  "shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10.5px] text-white";

/** 비활성 클릭 시 짚어 줄 카드 상한(지문관리 hintSelectCards 와 같은 24). */
const HINT_CARD_CAP = 24;

export function StudioAnalysisDock({
  row,
  candidate,
  boardRef,
}: {
  /** 레일에 열린 분석 행(없으면 null) */
  row: ExamReportSummaryRow | null;
  /** 레일에 열린 후보(행과 배타) */
  candidate: ExamCandidateRow | null;
  /** 목록 스크롤 박스 — 비활성 클릭 시 글로우 대상 탐색 루트. */
  boardRef: React.RefObject<HTMLDivElement | null>;
}) {
  // 판정은 레일과 같은 파일. 다만 도크는 **분석 계열 전용 도출**을 본다
  // (deriveExamAnalyzeStep) — 26-09-04 에 INTERNAL 강화가 학생 퍼널 뒤로 밀리면서,
  // 「다음 단계」만 보면 채점이 밀려 있는 동안 이 버튼이 통째로 사라진다.
  // 상세(detail)는 판이 안 들지만 분석 계열 kind 는 전부 요약 행만으로 결정된다.
  const step = deriveExamAnalyzeStep({
    row,
    candidate,
    costs: NEXT_STEP_COSTS,
  });
  const request = step ? analyzeRequestFor(step, { row, candidate }) : null;

  const targetId = row?.id ?? candidate?.examId ?? "none";
  const running =
    row?.status === "ANALYZING" || row?.funnel?.boost?.status === "RUNNING";
  const { requested, mark, release } = useRequestedLock(
    `${targetId}:${step?.kind ?? "none"}`,
    running,
  );

  // 선택이 없을 때 무엇을 고르라는 건지 몸으로 가르친다 — 「분석 전」 카드와
  // 후보 카드를 글로우로 짚는다(지문관리 hintSelectCards 이식).
  const hintTargets = useCallback(() => {
    const root = boardRef.current;
    if (!root) return;
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[data-analysis-candidate], [data-analysis-depth='SHALLOW']",
      ),
    )
      .map((el) => el.closest<HTMLElement>('[role="button"]') ?? el)
      .slice(0, HINT_CARD_CAP);
    triggerHintGlow(cards);
  }, [boardRef]);

  const label = step?.cta?.label ?? "AI 분석 시작";
  const cost = step?.cta?.creditCost ?? null;
  const fire = () => {
    if (!request || requested) return;
    mark();
    releaseOnFailure(request(), release);
  };

  // ── ① 대상 없음/분석 계열 아님 → 비활성(지문관리 관용구) ──────────────────
  //   native disabled 를 쓰지 않는 이유는 파일 머리 주석 참조 — 이 클릭이
  //   「무엇을 골라야 하는가」를 글로우로 가르쳐야 한다.
  if (!request) {
    return (
      <DockBar>
        <button
          type="button"
          data-analysis-dock-cta
          aria-disabled="true"
          title="분석할 시험지를 왼쪽 목록에서 선택하세요"
          onClick={hintTargets}
          className={`${BUTTON_BASE} ${BUTTON_OFF}`}
        >
          <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">AI 분석 시작</span>
        </button>
      </DockBar>
    );
  }

  // ── ② 발사 직후 「요청됨」 잠금 ─────────────────────────────────────────
  if (requested) {
    return (
      <DockBar>
        <button
          type="button"
          data-analysis-dock-cta
          data-analysis-dock-kind={step?.kind}
          aria-disabled="true"
          title="요청됨 — 잠시 후 카드에 진행률이 표시됩니다"
          className={`${BUTTON_BASE} ${BUTTON_OFF}`}
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          <span className="truncate">요청됨</span>
        </button>
      </DockBar>
    );
  }

  // ── ③ 과금 CTA = **2단 확인**(레일이 쓰던 RailConfirmButton 그대로) ──────
  //   도크로 자리를 옮겼다고 한 번 클릭에 20cr 이 나가면 안 된다 — 위치 변경
  //   지시가 안전장치 해제 지시는 아니다. 무장 상태 자구·타이머·더블클릭
  //   무시창까지 레일과 같은 부품을 쓴다(안전 규약 두 벌 금지).
  if (cost != null) {
    return (
      <DockBar>
        <RailConfirmButton
          tone="primary"
          onConfirm={fire}
          confirmLabel={`한 번 더 누르면 ${cost.toLocaleString("ko-KR")} 차감`}
          icon={<Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />}
          label={
            <>
              <span className="truncate">{label}</span>
              <CreditCostChip amount={cost} className={CHIP_CLASS} />
            </>
          }
          className={cn(BUTTON_BASE, "px-2")}
          data-analysis-dock-cta
          data-analysis-dock-kind={step?.kind}
        />
      </DockBar>
    );
  }

  // ── ④ 무과금 분석(총평 재생성 등) — 1클릭 ──────────────────────────────
  return (
    <DockBar>
      <button
        type="button"
        data-analysis-dock-cta
        data-analysis-dock-kind={step?.kind}
        aria-disabled="false"
        title={step?.description}
        onClick={fire}
        className={`${BUTTON_BASE} ${BUTTON_ON}`}
      >
        <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    </DockBar>
  );
}

/** 지문관리 하단 CTA 바와 같은 껍데기(스크롤러 밖 shrink-0 형제). */
function DockBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-analysis-dock
      className="shrink-0 border-t border-slate-100 bg-white px-5 py-3"
    >
      {children}
    </div>
  );
}
