"use client";

// ============================================================================
// 자료 역할 드롭다운 — 이 화면에 **남는 유일한 자료 팝오버**.
//
// 무엇을 대체했나 (material-chip.tsx 의 세부 팝오버 → 삭제):
//   옛 팝오버는 한 창에 결정 4개(역할 7칸 2열 격자 · 자료별 요청 textarea ·
//   판독 본문 미리보기 · 전체 보기 버튼)를 담고, 실측 716px 짜리 내용을 448px
//   창에 넣어 **62%를 숨긴 채** 스크롤을 요구했다. 시선 정지 13회, 좌우 방향
//   반전 4회, 7번째 항목만 col-span-2(324px 버튼에 라벨 75px), 그리고 아무것도
//   커밋하지 않는 가짜 '확인' 버튼까지 있었다.
//   → 결정 4개 중 **1개(역할)만** 여기 남기고 나머지는 자료 검토 모달로 옮겼다.
//
// 왜 2열 격자가 아니라 세로 1열인가:
//   2열이면 항목 수가 홀수일 때 마지막 하나가 col-span-2 가 되어 같은 목록 안에
//   폭이 다른 항목이 생긴다(역할이 7개 → 8개가 되며 실제로 터진 자리다). 세로
//   1열은 항목이 몇 개가 되든 좌측 기준선이 하나이고, 라벨 아래에 힌트를 한 줄씩
//   붙일 수 있어 "고르는 근거"를 숨기지 않아도 된다.
//
// 높이 실측 (검수 기준: 스크롤 0):
//   항목 = py-2(8+8) + 라벨 13px(≈18) + gap-1(4) + 힌트 12px(≈18) = 56px
//   56 × 8 + p-1(8) = 456px. 역할이 7개였을 때는 400px 이었다.
//   → 716px/스크롤 있음 → 456px/스크롤 0, 결정 1개, 시선 정지 8회, 방향 반전 0회.
//   이 높이가 유지되려면 MATERIAL_ROLE_HINTS 가 340px 안에서 **1줄**이어야 한다
//   (그래서 schema.ts 의 힌트가 전부 20자 이내다). 힌트를 길게 고치면 이 창은
//   조용히 두 배가 된다 — 힌트를 늘릴 거면 여기 실측값도 같이 고친다.
//
// 회귀 방지 계약
//  · **역할 설명문은 자르지 않는다**(line-clamp/truncate 금지). 고르는 유일한
//    근거다. 옛 계약 material-chip.tsx:20-21 을 그대로 승계한다 — 짧게 다시 쓰는
//    것은 자르는 것이 아니므로 그 취지("고르는 근거를 없애지 마라")는 지켜진다.
//  · 사용자가 직접 고르는 순간 roleLocked=true 로 잠근다. 그 뒤에는 자동분류가
//    절대 덮지 않는다(material-intake.ts 의 휴리스틱이 사용자를 이기면 안 된다).
//    ※ 잠그는 주체는 이 컴포넌트가 아니라 호출부다 — onChange 를 받은 쪽이
//      { role, roleLocked: true } 로 함께 반영한다.
//  · **가짜 커밋 버튼(파란 '확인')을 만들지 않는다.** 모든 변경은 onChange 로 즉시
//    반영되므로 저장 개념이 없다(material-reader-modal.tsx:19 계약과 같은 취지).
//  · 선택 표시는 SEG_ON(채운 파랑) 하나만 쓴다. bg-blue-50/40 류 알파 채움은
//    흰 배경 합성 시 #f9fbff(ΔL 0.01)라 선택 신호가 1px 테두리에만 걸린다.
//  · 자동분류는 AI 가 아니라 파일명·앞부분 키워드 휴리스틱이다. 이 창의 어떤
//    문구에도 "AI가 골랐어요"라고 쓰지 않는다 — 거짓이다.
// ============================================================================

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MATERIAL_ROLES,
  type MaterialRole,
} from "@/lib/passage-authoring/schema";
import {
  AUTHORING_COPY,
  MATERIAL_ROLE_HINTS,
  MATERIAL_ROLE_LABELS,
} from "@/lib/wording/passage-authoring-glossary";
import { cn } from "@/lib/utils";

import { BTN_SM, DESK, FOCUS_RING, SEG_ON } from "./authoring-tokens";

export interface MaterialRoleMenuProps {
  value: MaterialRole;
  /** 호출부가 roleLocked: true 를 함께 반영한다(자동분류 잠금은 호출부 소유). */
  onChange: (role: MaterialRole) => void;
  disabled?: boolean;
  /** 여러 자료가 있을 때 어떤 자료의 역할인지 스크린리더에 알린다. */
  materialName?: string;
  className?: string;
}

export function MaterialRoleMenu({
  value,
  onChange,
  disabled = false,
  materialName,
  className,
}: MaterialRoleMenuProps) {
  const label = materialName
    ? `${materialName} — ${AUTHORING_COPY.MATERIAL.roleLabel}`
    : AUTHORING_COPY.MATERIAL.roleLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2",
            BTN_SM,
            DESK.meta,
            "font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
            "disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS_RING,
            className,
          )}
        >
          {MATERIAL_ROLE_LABELS[value]}
          <ChevronDown className="size-3.5 text-slate-400" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      {/* w-[340px] p-1 : 여백은 그릇이 아니라 항목이 갖는다. 그래야 선택된 항목의
          채운 파랑이 그릇 가장자리까지 닿아 "목록"으로 읽힌다. */}
      <DropdownMenuContent align="end" sideOffset={6} className="w-[340px] p-1">
        {MATERIAL_ROLES.map((role) => {
          const on = value === role;
          return (
            <DropdownMenuItem
              key={role}
              onSelect={() => onChange(role)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 rounded-md px-2 py-2",
                on
                  ? // focus: 를 함께 덮는다 — 안 그러면 선택된 항목에 커서가 얹히는
                    // 순간 하우스 기본값(focus:bg-accent)이 채운 파랑을 지운다.
                    `${SEG_ON} focus:bg-blue-600 focus:text-white`
                  : "focus:bg-slate-50 focus:text-slate-900",
              )}
            >
              <span className={DESK.body}>{MATERIAL_ROLE_LABELS[role]}</span>
              {/* 설명문은 자르지 않는다(계약). 20자 이내라 340px 안에서 1줄이다. */}
              <span
                className={cn(
                  DESK.meta,
                  "leading-snug",
                  on ? "text-blue-100" : "text-slate-500",
                )}
              >
                {MATERIAL_ROLE_HINTS[role]}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
