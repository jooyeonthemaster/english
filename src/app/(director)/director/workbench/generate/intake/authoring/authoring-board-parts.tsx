"use client";

// ============================================================================
// AuthoringBoard 의 잔여 조각 — 규정 배너와 예시 요청문 고르개만 남는다.
//
// 여기 있던 BoardHeader / StepTitle("① 자료 넣기") / SpecRailHeader /
// InstructionField / AuthoringCta 는 전부 삭제됐다. 화면을 "설명 → 단계 →
// 입력"으로 쌓는 구성 자체가 실패였기 때문이다(설명이 화면의 대부분을 차지하고
// 정작 손댈 곳은 아래로 밀렸다). 지금은 발주 밴드 하나(authoring-composer.tsx)가
// 그 역할을 전부 흡수하고, 설정은 우측 레일(authoring-spec-rail.tsx)이 맡는다.
//
// 회귀 방지 계약
//  · **amber/orange 금지**(page-frame.tsx:9, v3 §D1 R5). 구 KoreanFixedBanner 는
//    amber-200/amber-50/amber-600/amber-700 4색 배너였다. 이 배너가 말하는 것은
//    "지금은 못 쓴다"는 **규정**이지 경고가 아니다 — 경고색을 쓰면 선생님이 무언가
//    잘못했다고 읽는다. 안내는 slate + Info, 조치 필요는 rose + AlertTriangle 이다.
//  · 화면 문구는 전량 passage-authoring-glossary.ts 경유(게이트 ⑤). 예시 요청문
//    목록(INSTRUCTION_EXAMPLES)의 정본도 그 사전이다 — 이 파일은 소비만 한다.
//    (구 구현은 이 파일이 배열을 소유해 사전과 두 벌로 갈라져 있었다.)
//  · 팝오버는 <AuthoringPopover> 한 벌로만 그린다. 구 w-[320px] p-1.5 는 이
//    디렉터리에서 유일한 폭·패딩이었다(폭 3종·패딩 3종 난립의 한 축).
//  · Sparkles(별 반짝이) 아이콘 금지 — 오너 지시. 이 디렉터리 어디에도 다시
//    들여오지 말 것.
// ============================================================================

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AUTHORING_COPY,
  INSTRUCTION_EXAMPLES,
} from "@/lib/wording/passage-authoring-glossary";

import { AuthoringButton, AuthoringPopover } from "./authoring-primitives";
import { DESK, SURFACE } from "./authoring-tokens";

/**
 * 국어 고정 라우트에서 뜨는 규정 안내 — 왜 못 쓰는지만 알리고 화면은 그대로 둔다.
 * 이 문장은 사전에서 **유일한 합쇼체**다(규칙을 알리는 문장이라 해요체로 쓰면
 * 오히려 톤이 흔들린다). 톤은 slate — 금지색을 쓰지 않는다.
 */
export function KoreanFixedBanner() {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2",
        SURFACE.sunken,
      )}
    >
      <Info
        className="mt-1 size-3.5 shrink-0 text-slate-500"
        aria-hidden="true"
      />
      <p className={cn(DESK.meta, "min-w-0 leading-snug text-slate-700")}>
        {AUTHORING_COPY.NOTICE.koreanFixed}
      </p>
    </div>
  );
}

/**
 * 예시 요청문 고르개 — 늘 펼쳐 두면 툴바 아래에 예시 12개가 상주해 발주 밴드를
 * 잡아먹는다. 그래서 툴바 버튼 뒤로 접었다.
 *
 * 고른 항목은 "사라진 것"이 아니라 "이미 넣은 것"으로 읽혀야 한다 — 구현은
 * slate-400(1.49:1 on white 기준 사실상 안 보임)이었다. 지금은 취소선 + slate-500
 * 으로 **상태**를 말한다(정보를 나르는 텍스트의 색 하한이 slate-500 이다).
 */
export function ExamplePicker({
  disabled,
  instruction,
  onPick,
}: {
  disabled: boolean;
  instruction: string;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AuthoringButton variant="secondary" disabled={disabled}>
          {AUTHORING_COPY.CTA.example}
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </AuthoringButton>
      </PopoverTrigger>
      {/* width='md'(340) — 역할 드롭다운과 같은 폭이다.
          ⚠️ "요청문이 접히지 않는 최소 폭"이라고 적혀 있던 자리인데 **사실이 아니었다**.
          글자가 쓸 수 있는 폭은 340 − p-1(8) − px-2(16) = 316px 뿐이라, 29글리프짜리
          문구 하나가 ≈314px 로 경계에 걸려 혼자 두 줄이 됐다(26-07-26 오너 지적).
          폭이 문구를 보장하지 않는다 — 예산은 문구 쪽에서 지킨다
          (passage-authoring-glossary.INSTRUCTION_EXAMPLES 의 "한 줄 예산" 주석). */}
      <AuthoringPopover width="md" align="start">
        {INSTRUCTION_EXAMPLES.map((example) => {
          const already = instruction.includes(example);
          return (
            <button
              key={example}
              type="button"
              disabled={already}
              onClick={() => {
                onPick(example);
                setOpen(false);
              }}
              className={cn(
                DESK.body,
                // items-center + min-h-9: 문구가 전부 한 줄이므로 항목 높이를 36px 로
                // 고정해 목록의 리듬을 맞춘다(종전 items-start 는 두 줄 항목을 전제한
                // 정렬이라, 한 줄짜리들 사이에서 글자가 위로 붙어 보였다).
                // break-keep: 예산을 넘긴 문구가 들어오더라도 한글이 **글자 단위**로
                // 끊기는 것(기본 word-break: normal 의 한국어 동작)만은 막는다.
                // 자르지는 않는다 — 못 읽는 문구는 없는 것과 같다(디렉터리 공통 계약).
                "flex min-h-9 w-full cursor-pointer items-center break-keep rounded-md px-2 py-2 text-left leading-snug text-slate-700 transition-colors",
                "hover:bg-blue-50 hover:text-blue-700",
                "disabled:cursor-not-allowed disabled:text-slate-500 disabled:line-through disabled:hover:bg-transparent disabled:hover:text-slate-500",
              )}
            >
              {example}
            </button>
          );
        })}
      </AuthoringPopover>
    </Popover>
  );
}
