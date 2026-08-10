"use client";

// ============================================================================
// 조판대(Composing Desk) 공용 프리미티브 — 이 디렉터리의 **단일 마크업 진실원**.
//
// 왜 이 파일이 있나:
//   같은 의미의 조각이 파일마다 손코딩으로 갈라져 있었다.
//    · 버튼 높이 7종(h-7/h-8/h-9/h-10/h-11/h-12/min-h-8), 라운드 3종, 굵기
//      font-extrabold 5건 — 같은 위계의 버튼이 화면마다 다른 크기로 떴다.
//    · "작은 제목"이 4중 구현이었다: material-chip.tsx:83 GROUP_TITLE(12px bold
//      slate-700) / authoring-spec-parts.tsx:311 PopoverGroupTitle(11px bold
//      slate-600) / SettingRow 팝오버 제목(12px bold slate-800) / SpecGroup
//      캡션(11px bold slate-600). 넷 다 "이 아래 것들의 머리글"이라는 같은 뜻인데
//      크기·색·굵기가 전부 달라 위계가 화면마다 뒤집혔다.
//    · 팝오버 폭 3종(248/320/340) · 패딩 3종(p-1.5/p-3/p-4) · sideOffset 2종.
//   값을 상수로 못 박는 것만으로는 부족하다 — **마크업이 한 벌이어야** 다음 사람이
//   같은 조각을 다시 손코딩하지 않는다.
//
// 스타일 소유권
//   수치는 전부 ./authoring-tokens.ts 에서 온다. 이 파일에는 원시 px 리터럴이
//   단 한 개도 없다(scripts/check-authoring-tokens.mjs 게이트 1). 색·간격·높이를
//   여기서 새로 짓지 않는다 — 필요하면 토큰 파일을 고치고 여기는 소비만 한다.
//
// 굵기 조합 방식(중요):
//   DESK.* 는 크기와 굵기를 한 문자열에 묶어 둔다. 버튼처럼 "13px인데 굵기는
//   variant 가 정한다"는 조합이 필요할 때 `DESK.body + " font-bold"` 로 이어 붙이면
//   최종 굵기가 **Tailwind 출력 순서**에 달리게 된다(조용히 무시될 수 있는 종류의
//   의존이다). 그래서 두 가지를 쓴다.
//    1) 크기 토큰에서 굵기만 떼어 낸 SIZE_TEXT 를 만들고, 굵기는 variant 가 정확히
//       하나만 얹는다(최종 문자열에 font-weight 유틸리티가 항상 1개).
//    2) 합치는 것은 cn()(twMerge)이라 혹시 겹쳐도 뒤에 온 값이 이긴다.
//   ⚠️ 런타임에서 조합한 문자열은 Tailwind 가 스캔하지 못한다. 그래서 떼어 내는
//     쪽(replace)만 런타임이고, 새로 만드는 클래스는 반드시 소스에 문자로 적는다.
//
// 회귀 방지 계약
//  · **버튼 높이는 3종이다: h-9(md) · h-7(sm) · min-h-12(hero).** h-8/h-10/h-11 을
//    추가하지 않는다. h-10 은 자료 '행'이지 버튼이 아니다.
//    세 값의 정본은 전부 ./authoring-tokens.ts(BTN_MD/BTN_SM/BTN_HERO)이고 같은
//    파일의 회귀 방지 계약이 이 문단과 **같은 사실**을 적고 있다 — 한쪽만 고치지
//    말 것.
//    hero 가 넷째가 아니라 셋째인 이유(구 계약 "2종뿐"을 의도적으로 파기):
//    이 화면에는 **되돌릴 수 없는 행동이 정확히 하나**(크레딧 차감 = 지문 생성)
//    있는데, 그것이 [자료 붙이기]·[예시] 와 같은 h-9 상자에 앉아 있었다. 되돌릴 수
//    있는 행동과 없는 행동이 같은 무게를 갖는 것은 크기 표류가 아니라 **위계
//    오류**다. hero 는 크기 variant 가 아니라 "이 표면의 유일한 주 CTA" 라는
//    역할 표식이고, 그래서 한 표면에 **하나만** 존재한다(primary variant 가 하나뿐인
//    것과 같은 규칙). 둘째 hero 를 만들고 싶어지면 그건 hero 가 아니라 md 다.
//  · **font-extrabold 를 만들지 않는다.** 12~14px 한글에서 자간이 뭉개져 위계가
//    오히려 약해진다. 주 CTA 의 강조는 굵기가 아니라 채운 색(blue-600) + 면적이
//    한다. hero 도 700(DESK.title)에서 멈춘다 — 오너가 가리킨 참조 컴포넌트
//    (exam-paper-builder-client.tsx:2843 `text-[14px] font-extrabold`)의 **시각적
//    무게**만 가져오고 그 클래스 문자열은 가져오지 않는다. 14px/700 + 48px 높이 +
//    전폭 + 채운 파랑이면 무게는 이미 충분하고, 800 은 여기서 자간만 잃는다.
//  · 주 CTA 를 native disabled 로 막지 않는다(authoring-board.tsx:17-18 계약).
//    그래서 aria-disabled 도 disabled 와 **같은 시각 상태**를 갖는다 — 그래야
//    호출부가 "누를 수는 있지만 막혀 있다"를 native disabled 없이 표현할 수 있다.
//  · 제목 3종은 크기로만 갈린다: SectionTitle 14 > PopoverTitle 13 > FieldLabel 12.
//    구 계약 material-chip.tsx:226 의 *의도* — "제목이 본문보다 커야 한다" — 를
//    그대로 만족한다. 색을 낮추는 것(slate-900 → slate-500)은 되지만 크기를
//    0.5px 씩 내리는 방식으로 위계를 만들지 않는다.
//  · 화면에 뜨는 한국어는 이 파일이 짓지 않는다. 전부 호출부가 문구 사전
//    (passage-authoring-glossary.ts)에서 가져와 children/aria-label 로 넘긴다.
//  · Sparkles 금지(오너 지시). 이 기능의 대표 아이콘은 PenLine 이다.
// ============================================================================

import type { ComponentProps, ReactNode } from "react";

import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { BTN_HERO, BTN_MD, BTN_SM, DESK, FOCUS_RING } from "./authoring-tokens";

// ── 버튼 ────────────────────────────────────────────────────────────────────

/**
 * 크기 토큰에서 굵기를 떼어 낸 것. 굵기는 variant 가 정확히 하나만 얹는다.
 * (replace 는 '떼어 내기'라 Tailwind 스캔 대상이 아니다 — 새 클래스를 만들지 않는다.)
 */
const SIZE_TEXT = {
  sm: DESK.meta.replace(" font-medium", ""),
  md: DESK.body.replace(" font-semibold", ""),
  hero: DESK.title.replace(" font-bold", ""),
} as const;

const SIZE_BOX = {
  /** 인라인 트리거·보조 버튼 28px. 터치 하한(24px)을 넘긴다. */
  sm: `${BTN_SM} px-2 gap-1`,
  /** 주·보조 공용 36px. 이 화면의 모든 '누르는 것'은 기본적으로 이 크기다. */
  md: `${BTN_MD} px-3 gap-1`,
  /**
   * 주 CTA 48px 전폭 한 줄. 높이가 고정 h-12 가 아니라 min-h-12 인 근거는
   * 값의 소유자인 authoring-tokens.BTN_HERO 주석에 있다.
   * md 와 다른 점은 높이뿐이 아니다 —
   *  · `flex w-full` : 툴바의 한 칸이 아니라 **자기 줄**을 갖는다(display 를
   *    inline-flex 에서 flex 로 덮는다 — twMerge 가 뒤에 온 값을 남긴다).
   *  · `rounded-lg`  : 48px 상자에 6px 반경은 각져 보인다. 카드와 같은 8px.
   *  · `whitespace-normal break-keep leading-snug` : 기본값 whitespace-nowrap 을
   *    푼다. 좁은 폭에서 넘치는 대신 접히되, 한글이 **어절 중간**에서 끊겨
   *    "지문 3편 만들 / 기"가 되는 것은 break-keep 이 막는다. leading-none 은
   *    두 줄이 되는 순간 행이 붙어 읽히지 않으므로 snug(1.375)로 덮는다.
   *  · `shadow-sm`   : 이 표면에서 그림자를 갖는 유일한 요소다. 조판대는 상자와
   *    그림자를 걷어낸 화면이지만(밴드 상단 계약), 그건 **그릇**에 대한 규칙이고
   *    이건 컨트롤이다. 되돌릴 수 없는 단 하나의 행동만 평면에서 1px 떠 있다.
   */
  hero: `${BTN_HERO} flex w-full rounded-lg px-4 py-2 gap-2 whitespace-normal break-keep leading-snug text-center shadow-sm`,
} as const;

/**
 * 위계는 **색과 채움**으로만 만든다.
 *  primary   채운 파랑 — 화면에 하나(주 CTA)
 *  secondary 흰 바탕 + 테두리 — 나란히 놓이는 보조 행동
 *  ghost     테두리 없음 — 목록 안 인라인 행동(닫기·모두 보기)
 *  danger    테두리 rose — 되돌릴 수 없는 행동에만
 */
const VARIANT_SKIN = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger:
    "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700",
} as const;

/** 주 CTA 만 700, 나머지는 600. font-extrabold 는 존재하지 않는다. */
const VARIANT_WEIGHT = {
  primary: "font-bold",
  secondary: "font-semibold",
  ghost: "font-semibold",
  danger: "font-semibold",
} as const;

export type AuthoringButtonSize = keyof typeof SIZE_BOX;
export type AuthoringButtonVariant = keyof typeof VARIANT_SKIN;

export interface AuthoringButtonProps extends ComponentProps<"button"> {
  size?: AuthoringButtonSize;
  variant?: AuthoringButtonVariant;
}

/**
 * 이 화면의 모든 버튼. type 기본값이 "button" 인 이유는, 발주 밴드가 form 안에
 * 들어가는 순간 type 없는 버튼이 전부 submit 이 되어 첫 버튼(자료 붙이기)이
 * 생성을 실행해 버리기 때문이다.
 *
 * size="hero" 는 **전폭 자기 줄**을 전제한다(w-full). 툴바처럼 다른 버튼과 나란한
 * flex 줄에 넣으면 그 줄을 통째로 먹으므로, 넣기 전에 "이게 이 표면의 유일한 주
 * CTA 인가"를 먼저 답할 것. 아니면 md 다.
 *
 * 상태 표현 주의: 아래 두 줄이 native disabled 와 aria-disabled 에 **같은 얼굴**
 * (opacity-50)을 준다. 48px 전폭 hero 에서 반투명은 "고장난 바"로 읽히므로,
 * 색으로만 상태를 말하고 싶으면 호출부가 `aria-disabled:opacity-100` 로 덮는다
 * (authoring-composer.tsx 의 주 CTA 가 그렇게 한다 — 근거는 그 파일에).
 */
export function AuthoringButton({
  size = "md",
  variant = "secondary",
  className,
  type = "button",
  ...props
}: AuthoringButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md leading-none transition-colors",
        SIZE_BOX[size],
        SIZE_TEXT[size],
        VARIANT_WEIGHT[variant],
        VARIANT_SKIN[variant],
        FOCUS_RING,
        // native disabled 와 aria-disabled 가 같은 얼굴을 갖는다 — 주 CTA 는
        // native disabled 로 막지 않는다는 계약을 시각적으로 뒷받침한다.
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

// ── 제목 3종 + 머리표 ───────────────────────────────────────────────────────
// 넷은 "이 아래 것들의 머리글"이라는 같은 역할을 크기 하나로만 구분한다.
//   Kicker 11  — 컬럼·섹션 머리표(발주 / 조판 결과 / 지문 설정). 문단이 아니라 표지다.
//   SectionTitle 14 — 모달·결과 밴드·결과 카드의 제목
//   PopoverTitle 13 — 팝오버·드롭다운 안 머리글
//   FieldLabel 12  — 한 줄짜리 컨트롤의 라벨(설정 줄·사이드 칼럼 필드)

export interface KickerProps {
  children: ReactNode;
  /** 포커스가 든 컬럼의 머리표만 파랑으로 올린다(발주 밴드 focus-within). */
  tone?: "default" | "accent";
  id?: string;
  className?: string;
}

export function Kicker({
  children,
  tone = "default",
  id,
  className,
}: KickerProps) {
  return (
    <p
      id={id}
      className={cn(
        DESK.kicker,
        tone === "accent" ? "text-blue-700" : "text-slate-500",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionTitle({
  children,
  id,
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <h3 id={id} className={cn(DESK.title, "text-slate-900", className)}>
      {children}
    </h3>
  );
}

/**
 * 팝오버·드롭다운 안 머리글. 구 GROUP_TITLE(12px) / PopoverGroupTitle(11px) /
 * SettingRow 팝오버 제목(12px)을 하나로 합친 것이다. 아래 본문(FieldLabel 12,
 * 힌트 12)보다 **커야** 머리글로 읽힌다 — 11px 이던 시절엔 제목이 본문보다 작아
 * 위계가 뒤집혀 있었다(회귀 금지 지점).
 */
export function PopoverTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn(DESK.body, "text-slate-900", className)}>{children}</p>
  );
}

/**
 * 컨트롤 라벨. htmlFor 를 주면 <label> 로 나가고(클릭 시 포커스 이동), 없으면
 * 그냥 <span> 이다 — 팝오버 트리거 안처럼 label 로 감쌀 수 없는 자리가 있다.
 */
export function FieldLabel({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  const cls = cn(DESK.meta, "text-slate-500", className);
  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} className={cls}>
        {children}
      </label>
    );
  }
  return <span className={cls}>{children}</span>;
}

// ── 팝오버 ──────────────────────────────────────────────────────────────────

/**
 * 폭 3종. 이 셋 말고 다른 폭을 만들지 않는다.
 *  sm      280 — 짧은 선택지 목록(예시 문장)
 *  md      340 — 설명이 한 줄씩 붙는 목록(역할 드롭다운과 같은 폭)
 *  trigger 트리거와 같은 폭 — 설정 줄이 "그 줄이 펼쳐진 것"으로 읽혀야 하는 자리.
 *          레일을 최소폭까지 좁혔을 때 선택지가 뭉개지지 않도록 min-w 로 바닥을
 *          받친다(그 경우 Radix 가 알아서 화면 안쪽으로 밀어 넣는다).
 */
const POPOVER_WIDTH = {
  sm: "w-[280px]",
  md: "w-[340px]",
  trigger: "w-(--radix-popover-trigger-width) min-w-[280px]",
} as const;

export type AuthoringPopoverWidth = keyof typeof POPOVER_WIDTH;

export interface AuthoringPopoverProps
  extends Omit<ComponentProps<typeof PopoverContent>, "sideOffset"> {
  width?: AuthoringPopoverWidth;
}

/**
 * PopoverContent 래퍼. Popover / PopoverTrigger 는 호출부가 직접 쓴다(트리거
 * 마크업이 자리마다 다르므로 감싸면 오히려 prop 이 늘어난다).
 *
 * 고정하는 것 세 가지.
 *  · sideOffset=6 — 현행 4 / 6 두 값이 섞여 있어 같은 화면에서 팝오버가 다른
 *    거리에 떴다.
 *  · p-1 + 항목 px-2 py-2 — 팝오버 자체는 얇은 그릇이고 여백은 항목이 갖는다.
 *    그래야 항목 배경(선택 시 채운 파랑)이 그릇 가장자리까지 닿아 목록으로 읽힌다.
 *  · 높이 상한 = 화면에 남은 공간. 긴 목록이 화면 밖으로 자라는 대신 팝오버
 *    **안에서** 스크롤된다(레일·컬럼에 스크롤이 생기지 않는다 — 스크롤 2개 계약).
 */
export function AuthoringPopover({
  width = "md",
  align = "end",
  side = "bottom",
  className,
  children,
  ...props
}: AuthoringPopoverProps) {
  return (
    <PopoverContent
      side={side}
      align={align}
      sideOffset={6}
      className={cn(
        "max-h-[min(var(--radix-popover-content-available-height),30rem)] rounded-lg p-1",
        POPOVER_WIDTH[width],
        className,
      )}
      {...props}
    >
      {children}
    </PopoverContent>
  );
}

// ── 게이지 ──────────────────────────────────────────────────────────────────

export interface GaugeProps {
  /** 이번 생성에 실제로 실리는 양. */
  value: number;
  /** 자료가 가진 전체 양. 0 이면 0% 로 그린다(0 나누기 방지). */
  total: number;
  /** 화면에 보이는 제목이 따로 있으면 aria-labelledby 대신 이걸로 이름을 준다. */
  ariaLabel?: string;
  className?: string;
}

/**
 * 전달 분량 게이지. "AI 는 여기 보이는 내용만 읽어요" 같은 거짓 문구를 대체하는,
 * 이 화면의 정직성 장치다 — 60,000자를 붙여도 실제로 실리는 것은 역할별 예산까지다.
 *
 * 트랙 h-1(4px)은 간격 그리드가 아니라 **선**이라 6단 간격 규칙의 대상이 아니다
 * (설계 바이블 §1 명시 예외: 1px rule 과 2px accent bar 는 간격이 아니다).
 */
export function Gauge({ value, total, ariaLabel, className }: GaugeProps) {
  const safeTotal = total > 0 ? total : 0;
  const ratio = safeTotal > 0 ? value / safeTotal : 0;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={cn(DESK.num, "shrink-0 text-slate-700")}>
        {`${percent}%`}
      </span>
    </div>
  );
}
