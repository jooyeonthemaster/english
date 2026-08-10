"use client";

// ============================================================================
// 직접 입력 표면의 출력 방식 세그먼트 — "그대로 추출 / AI로 원문 복원 / AI로 지문 생성".
//
// multi-passage-paste.tsx 에서 분리한 이유는 줄 수뿐이 아니다. 세 모드는 각각
// "무료냐", "국어에서 쓸 수 있냐", "좁은 화면에서 어떻게 접히냐"라는 서로 다른
// 규약을 갖는데, 이게 본체의 상태 로직과 섞이면 모드를 하나 더 붙일 때마다
// 삼항 분기가 겹쳐 읽을 수 없게 된다. 여기서는 옵션 표 하나만 보면 된다.
//
// 회귀 방지 계약
//  · 라벨은 절대 잘리지 않는다. **좁은 화면에서는 한 열로 쌓는다(grid-cols-1).**
//    구버전은 grid-cols-2 + 세 번째 모드 col-span-2 였는데, 실제로 재보면 그
//    구성이 계약을 지키지 못한다: 320px 뷰포트에서 한 칸은 약 142px 인데
//    "AI로 원문 복원"(11px 기준 ~73px) + 뱃지("지문당" 33px + Coins 칩 21px +
//    px-1 8px = ~62px) = 약 139px 에 gap 까지 더해 이미 넘친다. 즉 계약이
//    주장한 "안 잘린다"는 그 레이아웃에서 참이 아니었다(grid-cols-3 이 더
//    나쁘다는 상대 비교였을 뿐이다). 한 열로 쌓으면 폭 압박이 구조적으로
//    사라져 계약이 비로소 참이 되고, 라벨을 이 표면의 표준 버튼 토큰
//    (DESK.body 13/600)으로 올릴 수 있다 — 진입 스위치의 가독성은 장식이
//    아니라 기능이라는 아래 대비 계약과 같은 방향이다.
//    grid-cols-1 은 sm 이상에서 컨테이너가 flex 로 바뀌는 순간 무시되므로
//    해제 변형이 따로 필요 없다(col-span-* 를 쓰던 이유와 동일).
//  · 크레딧이 드는 모드(paid)만 활성 뱃지가 blue 다. 무료 모드는 slate.
//    ※ 활성 버튼이 blue-600 **채움**으로 바뀐 뒤로는(아래 대비 계약) 뱃지 자체를
//      파랗게 칠할 수 없다 — 같은 색군 위라 사라진다. 그래서 활성 뱃지는 둘 다
//      흰 알약이고, 유·무료 구분은 **글자색**(paid=blue-700 / free=slate-600)이
//      진다. 계약이 요구한 "유료만 파랗다"는 신호는 그대로 살아 있다.
//  · 이 세그먼트는 "AI로 지문 생성"의 **유일한 진입 스위치**다. 그래서 대비는
//    장식이 아니라 기능이다. 구버전은 blue-50 말풍선 위에 blue-50/40 활성 채움
//    (합성 결과 #f9fbff, 흰 배경 대비 ΔL 0.01 = 채움 기여 0)과 slate-400 비활성
//    글자(2.34:1, WCAG AA 미달), 9px 가격 뱃지(약 1.9:1)를 겹쳐 놓아 "무엇이
//    켜져 있는지"조차 읽히지 않았다. 활성=blue-600 채움/흰 글자, 비활성=slate-600
//    (4.7:1 이상), 뱃지 DESK.kicker(11/700) 가 그 수리다. 되돌리지 말 것.
//  · 크기·색·문구는 전부 조판대 토큰(authoring-tokens.ts)과 문구 사전
//    (passage-authoring-glossary.ts)을 거친다. 이 파일은 intake/ 아래에 있지만
//    "AI로 지문 만들기"의 표면이므로 scripts/check-authoring-tokens.mjs 의
//    ENROLLED_FILES 에 등록돼 있다 — 원시 px·한글 리터럴을 다시 들이면 CI 가
//    죽는다.
//  · 국어 고정 라우트에서는 AI 파이프라인(복원·생성)이 영어 전용이라 native
//    disabled + 사유 title 로 막는다. 여기만은 hint-glow 규약의 예외다 —
//    "지금 이 라우트에서는 영영 못 쓴다"는 상태라 유도할 행동이 없기 때문이다.
//    다만 title= 은 hover 가 있는 기기에서만 읽힌다. 좁은 화면에서는 같은 사유를
//    그리드 아래에 글로 깐다 — 터치 사용자에게 "왜 회색인지"를 남기는 유일한 길이다.
// ============================================================================

import type { ReactNode } from "react";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  DESK,
  FOCUS_RING,
} from "@/app/(director)/director/workbench/generate/intake/authoring/authoring-tokens";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";

const ENTRY = AUTHORING_COPY.ENTRY;

export type OutputMode = "verbatim" | "restored" | "authoring";

/** TextInputBoard 가 아는 모드만 — authoring 은 그 보드의 계약 밖이다. */
export type TextBoardMode = Exclude<OutputMode, "authoring">;

interface OutputModeOption {
  v: OutputMode;
  label: string;
  badge: ReactNode;
  /** 크레딧이 드는 모드인가 — 활성 뱃지 색(blue) 분기. */
  paid: boolean;
  /** 국어 고정 모드에서 막는 사유. null 이면 국어에서도 쓸 수 있다. */
  koreanBlockedTitle: string | null;
}

/** 유료 모드 뱃지 — "지문당 ⓒN". 문구는 사전, 숫자는 크레딧 표준 칩. */
function PaidBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ENTRY.perPassage} <CreditCostChip amount={amount} />
    </span>
  );
}

const OUTPUT_MODE_OPTIONS: OutputModeOption[] = [
  {
    v: "verbatim",
    label: ENTRY.verbatim,
    badge: ENTRY.freeBadge,
    paid: false,
    koreanBlockedTitle: null,
  },
  {
    v: "restored",
    label: ENTRY.restored,
    badge: <PaidBadge amount={CREDIT_COSTS.PASSAGE_RESTORATION} />,
    paid: true,
    koreanBlockedTitle: ENTRY.koRestoredBlocked,
  },
  {
    v: "authoring",
    label: ENTRY.authoring,
    badge: <PaidBadge amount={CREDIT_COSTS.PASSAGE_AUTHORING} />,
    paid: true,
    koreanBlockedTitle: ENTRY.koAuthoringBlocked,
  },
];

export interface OutputModeToggleProps {
  /** 현재 적용 중인 모드(국어 고정 보정까지 끝난 값). */
  value: OutputMode;
  /** 국어 고정 라우트인가 — AI 모드를 막는다. */
  koreanFixed: boolean;
  /** 저장·복원 중 잠금. */
  disabled: boolean;
  onSelect: (next: OutputMode) => void;
}

export function OutputModeToggle({
  value,
  koreanFixed,
  disabled,
  onSelect,
}: OutputModeToggleProps) {
  // 막힌 이유가 title= 안에만 있으면 터치 기기에서는 **영원히 읽을 수 없다**
  // (hover 가 없다). 회색 처리된 버튼 두 개만 보이고 왜 안 되는지는 알 길이 없어
  // "고장 났다"로 읽힌다 → 좁은 화면에서는 같은 문장을 그리드 아래에 펼쳐 둔다.
  // sm 이상에서는 title= 이 실제로 동작하므로 감춘다(같은 말을 두 번 하지 않는다).
  const koreanBlockedReasons = koreanFixed
    ? OUTPUT_MODE_OPTIONS.map((opt) => opt.koreanBlockedTitle).filter(
        (title): title is string => title !== null,
      )
    : [];

  return (
    <div
      className="w-full min-w-0 sm:flex sm:items-center sm:gap-3"
      data-generate-tour="paste-output-mode"
    >
      <div className="grid w-full min-w-0 grid-cols-1 gap-1 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
        {OUTPUT_MODE_OPTIONS.map((opt) => {
          const active = value === opt.v;
          // 국어 지문은 AI 파이프라인(복원·생성) 비활성 — 그대로 등록만.
          const koDisabled = koreanFixed && opt.koreanBlockedTitle !== null;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onSelect(opt.v)}
              disabled={disabled || koDisabled}
              title={koDisabled ? (opt.koreanBlockedTitle ?? undefined) : undefined}
              aria-pressed={active}
              className={
                `inline-flex h-9 w-full min-w-0 cursor-pointer flex-nowrap items-center justify-center gap-1 overflow-hidden rounded-md border px-2 text-center leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:gap-2 sm:px-3 ${DESK.body} ${FOCUS_RING} ` +
                (active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900")
              }
            >
              <span className="truncate">{opt.label}</span>
              <span
                className={
                  `shrink-0 rounded px-1 ${DESK.kicker} ` +
                  (active
                    ? opt.paid
                      ? "bg-white text-blue-700"
                      : "bg-white text-slate-600"
                    : "bg-slate-100 text-slate-600")
                }
              >
                {opt.badge}
              </span>
            </button>
          );
        })}
      </div>
      {koreanBlockedReasons.length > 0 ? (
        <ul className="mt-1 space-y-1 sm:hidden">
          {koreanBlockedReasons.map((reason) => (
            <li
              key={reason}
              className={`${DESK.meta} leading-snug text-slate-500`}
            >
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
