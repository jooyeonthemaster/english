"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 상단바 스텝 스트립 (docs/class-studio-spec.md
// §3.10.1·§3.10.9 「단계 안내 계약」)
//
// `① 대상` `② 자료` `③ 배포` 3칩으로 좌→중→우 시선 흐름을 상단에서 요약한다.
// 상태 판정은 오케스트레이터 소유(props 로만 받는다):
//   ①완료 = 클래스 선택됨(step1Done, 요약 = step1Label 예: "2학년 · 3명")
//   ②진행 = ①완료 & 도시에 닫힘 / ②완료·③진행 = 도시에 열림(step2Done·step3Active)
// §3.10.12(26-08-13): 클래스 선택 후 레일이 자동 접히므로 ① 칩이 대상 요약의
// 유일 상시 표면이자 **레일 재진입 버튼**이 된다(onStep1Click — 대상 수정·클래스
// 변경 동선). 나머지 칩은 프레젠테이션 전용. 폭이 좁으면 md 미만 숨김(hidden md:flex).
// md~lg 는 칩 3개+화살표만(① 요약 스팬은 hidden lg:inline — md 폭 초과 방지),
// 루트 overflow-hidden + min-w-0 이 잔여 초과분의 상단바 침범을 막는다.
// 상단바 좌측 클러스터 뒤 ml-3 배치, ml-auto 우측 메타 클러스터 정렬 불변.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// ③ 칩 라벨이 「배포」 대신 「조판」이 된다 — 이 파일은 라벨만 분기한다
// (step3Active 의 의미 교체는 오케스트레이터 소관). memo 원시 props 방어선
// 무접촉 — prop 추가 없이 모듈 상수 분기만. 복구는 env 1줄
// (NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { memo } from "react";
import { Check, ChevronRight } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

export interface StepStripProps {
  /** ① 완료 = 작업 클래스 선택됨 */
  step1Done: boolean;
  /** ① 완료 요약(예: "2학년 · 3명") — 미완료면 null */
  step1Label: string | null;
  /** ② 완료 = 도시에 열림(지문 선택됨) */
  step2Done: boolean;
  /** ③ 진행 = 도시에(배포 실행대) 표시 중 */
  step3Active: boolean;
  /**
   * ① 칩 클릭(§3.10.12) — 접힌 클래스 레일 토글(재진입). 참조 안정 전제
   * (memo 방어선). 미전달이면 기존 프레젠테이션 전용(클릭 없음) 그대로.
   */
  onStep1Click?: () => void;
}

type StepState = "done" | "active" | "waiting";

// ── 칩 한 개 — 완료(파랑 체크+요약) / 진행(볼드 파랑) / 대기(muted) ──────────

function StepChip({
  n,
  label,
  state,
  summary,
  onClick,
}: {
  n: number;
  label: string;
  state: StepState;
  /** 완료 칩 우측 요약(①만 사용) */
  summary?: string | null;
  /** 있으면 칩이 버튼으로 승격(①의 레일 재진입 — §3.10.12) */
  onClick?: () => void;
}) {
  const chipTone =
    state === "done"
      ? "bg-blue-50/80 text-blue-700 font-semibold"
      : state === "active"
        ? "border border-blue-300 bg-white text-blue-700 font-bold"
        : "bg-slate-100/60 text-slate-400 font-medium";
  const badgeTone =
    state === "waiting"
      ? "bg-slate-200 text-slate-500"
      : "bg-blue-600 text-white";

  const body = (
    <>
      <span
        aria-hidden
        className={`flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${badgeTone}`}
      >
        {state === "done" ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className="shrink-0">{label}</span>
      {state === "done" && summary && (
        <span className="hidden min-w-0 truncate text-[10.5px] font-medium text-blue-500 lg:inline">
          {summary}
        </span>
      )}
    </>
  );
  const cls = `flex h-7 min-w-0 shrink items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2.5 text-[11.5px] ${chipTone}`;
  if (onClick) {
    return (
      <button
        type="button"
        // data-tour="step-chip-target": 온보딩 투어(E26) 앵커 — 레일이 접힌
        // 뒤에도 상존하는 클래스 공간 재진입점(①칩은 클릭 가능한 유일 칩).
        data-tour="step-chip-target"
        onClick={onClick}
        title="클래스·학생 패널 열기/접기"
        className={`${cls} cursor-pointer transition-colors hover:bg-blue-100/70`}
      >
        {body}
      </button>
    );
  }
  return <span className={cls}>{body}</span>;
}

// ── 스트립 본체 ──────────────────────────────────────────────────────────────
// memo: 오케스트레이터는 큐 폴링(5초)마다 리렌더된다 — props 는 원시값뿐이라
// 얕은 비교로 재렌더가 끊긴다.

function StepStripInner({
  step1Done,
  step1Label,
  step2Done,
  step3Active,
  onStep1Click,
}: StepStripProps) {
  const s1: StepState = step1Done ? "done" : "active";
  const s2: StepState = step2Done ? "done" : step1Done ? "active" : "waiting";
  const s3: StepState = step3Active ? "active" : "waiting";

  return (
    <div
      aria-label="진행 단계"
      data-tour="step-strip"
      className="ml-3 hidden min-w-0 shrink items-center gap-0.5 overflow-hidden md:flex"
    >
      <StepChip
        n={1}
        label="대상"
        state={s1}
        summary={step1Label}
        onClick={onStep1Click}
      />
      <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-slate-300" />
      <StepChip n={2} label="자료" state={s2} />
      <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-slate-300" />
      {/* §M off 면 ③ 은 조판이 실행 단계다 — 라벨만 교체(state 판정 불변) */}
      <StepChip n={3} label={SHOW_MOBILE ? "배포" : "조판"} state={s3} />
    </div>
  );
}

export const StepStrip = memo(StepStripInner);
