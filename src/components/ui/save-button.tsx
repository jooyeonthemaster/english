"use client";

import * as React from "react";
import { ChevronDown, Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** "저장" 버튼 오른쪽 캐럿 팝오버에 들어가는 부차 저장 액션. */
export interface SaveSecondaryAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/**
 * 앱 전역에서 통일된 "저장" 버튼.
 *
 * 규칙(디자인 통일 기준):
 *  - 바탕은 검정(slate-900), 라벨은 "저장" 한 단어만.
 *  - 플로피디스크(Save) 아이콘 고정. 저장 중에는 스피너로 교체.
 *  - 수정사항이 없으면 비활성화(`disabled`) → 회색(slate-300).
 *
 * 네이티브 `<button>` 속성을 그대로 전달하므로 `onClick`, `type="submit"`,
 * `form`, `disabled`, `title` 등을 평소처럼 쓰면 된다. `saving` 이 true 면
 * 자동으로 비활성화되고 스피너가 돈다.
 *
 * `secondaryActions` 를 주면 "저장" 오른쪽에 캐럿 토글이 붙고, 누르면 부차
 * 저장 기능들이 팝오버 말풍선으로 떠서 선택할 수 있다(예: 다른 이름으로 저장).
 * `iconOnly` 는 split 형태에서도 그대로 동작한다 — 주버튼은 size-8 정사각,
 * 캐럿은 폭만 좁은 막대(w-5)로 붙어 좁은 모달 헤더에서도 줄을 넘기지 않는다.
 * `className` 은 주버튼·캐럿 양쪽에 전달되지만, iconOnly split 에서는 캐럿 폭(w-5)만
 * 호출부보다 뒤에 병합된다 — 호출부가 `size-7` 같은 정사각 클래스를 줘도 캐럿이
 * 주버튼과 1:1 덩어리로 부풀지 않게 하기 위해서다(높이는 호출부가 정한다).
 */
export interface SaveButtonProps extends React.ComponentProps<"button"> {
  /** 저장 진행 중 — 스피너 표시 + 자동 비활성화. */
  saving?: boolean;
  /** 부차 저장 액션. 있으면 캐럿 토글 + 팝오버를 렌더한다. */
  secondaryActions?: SaveSecondaryAction[];
  /** "저장" 라벨을 숨기고 아이콘만 정사각형 버튼으로 렌더한다(공간이 좁은 헤더용). */
  iconOnly?: boolean;
}

const BASE_CLASS =
  "flex h-8 items-center justify-center gap-1 bg-slate-900 px-2 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300";

/**
 * iconOnly split 의 **캐럿에만** 적용하는 호출부 className 필터.
 *
 * 왜: `className` 은 주버튼·캐럿 양쪽에 전달되는데, 호출부가 정사각 클래스를 주면
 * (sheet-compose-surface.tsx:575 `className="size-7"`) cn(twMerge) 에서 뒤에 온
 * `size-7` 이 캐럿의 `w-5`·`h-8` 을 **둘 다** 지워 캐럿이 주버튼과 1:1 정사각이 된다
 * — 실측(w2560 조판 헤더) 36px : 36px, 정본은 32 : 20 = 1.6:1 의 종속 막대다.
 * 게다가 globals.css:1942 `body.smoat-large-ui button.size-7 { width: 2.25rem !important }`
 * 가 '큰 UI' 모드에서 캐럿을 강제로 정사각으로 부풀린다(:130 주석이 경고한 그 함정).
 *
 * 그래서 폭 계열 토큰(w-/min-w-/max-w-)은 캐럿에서 걷어내고, `size-N` 은 높이만
 * (`h-N`) 남긴다 — 헤더 높이는 호출부가 정하고 폭은 컴포넌트가 지킨다.
 * 변형 접두사가 붙은 토큰(`sm:size-7` 등)은 건드리지 않는다(현재 호출부 0건).
 */
function caretClassName(className: string | undefined): string | undefined {
  if (!className) return className;
  const kept = className
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const square = /^size-(.+)$/.exec(token);
      if (square) return `h-${square[1]}`;
      if (/^(?:w|min-w|max-w)-/.test(token)) return null;
      return token;
    })
    .filter((token): token is string => !!token);
  return kept.length > 0 ? kept.join(" ") : undefined;
}

export function SaveButton({
  saving = false,
  disabled,
  secondaryActions,
  iconOnly = false,
  className,
  type = "button",
  ...props
}: SaveButtonProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isDisabled = disabled || saving;
  const icon = saving ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
  ) : (
    <Save className="h-3.5 w-3.5" aria-hidden />
  );

  // 부차 저장이 없으면 단일 표준 버튼.
  if (!secondaryActions || secondaryActions.length === 0) {
    return (
      <button
        type={type}
        disabled={isDisabled}
        aria-label={iconOnly ? "저장" : undefined}
        className={cn(
          BASE_CLASS,
          iconOnly ? "size-8 rounded-md px-0" : "min-w-[64px] rounded-md",
          className,
        )}
        {...props}
      >
        {icon}
        {!iconOnly && "저장"}
      </button>
    );
  }

  // 캐럿은 주버튼과 독립이다 — "변경사항이 없어 저장은 비활성"이어도 '다른 이름으로
  // 저장' 같은 부차 액션은 눌려야 한다. 다만 열 수 있는 항목이 하나도 없으면(모든
  // action.disabled) 주버튼과 함께 잠근다 → 기존 호출부(부차 액션에 주버튼과 같은
  // disabled 를 중복 지정)의 렌더는 이전과 완전히 동일하게 유지된다.
  const everySecondaryDisabled = secondaryActions.every((action) => !!action.disabled);
  const menuDisabled = saving || (isDisabled && everySecondaryDisabled);

  // 부차 저장이 있으면 split(저장 + 캐럿 토글 → 팝오버 말풍선).
  return (
    <div className="flex shrink-0 items-stretch">
      <button
        type={type}
        disabled={isDisabled}
        aria-label={iconOnly ? "저장" : undefined}
        className={cn(
          BASE_CLASS,
          iconOnly ? "size-8 px-0" : "min-w-[64px]",
          "rounded-l-md border-r border-white/20",
          className,
        )}
        {...props}
      >
        {icon}
        {!iconOnly && "저장"}
      </button>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={menuDisabled}
            aria-label="저장 옵션"
            // iconOnly 에서는 폭 전용 클래스(w-5)를 쓴다 — size-* 로 만들면 모바일
            // '큰 UI' 레이어(globals.css:1948 button.size-8 → 2.6rem !important)에 걸려
            // 캐럿까지 정사각으로 부풀어 헤더가 넘친다.
            className={cn(
              BASE_CLASS,
              "rounded-r-md",
              iconOnly ? "px-0" : "px-1.5",
              // ── 톤 동조(주버튼이 비활일 때) ──
              // 왜: 주버튼은 BASE_CLASS 의 `disabled:bg-slate-300`(:52) 으로 밝은 회색이
              // 되는데 캐럿은 menuDisabled(:125) 가 독립이라 slate-900 검정으로 남는다. 한 컨트롤이
              // 회색 반쪽 + 검정 반쪽으로 갈려 "두 개"로 읽히고, 헤더에서 가장 무거운
              // 요소가 「저장 옵션」 캐럿이 되어 시선을 뺏는다(E21 조판 헤더 실측:
              // w2560 y=67 에서 x2438..2473 rgb(202,213,226) | x2474..2509 rgb(15,23,43),
              // 이웃 버튼은 전부 흰 바탕 outline). 클릭 가능성은 유지하되(hover 로 승격)
              // 색 무게만 주버튼과 맞춘다. iconOnly split 경로로 한정해 라벨형 호출부
              // (preview-toolbar·korean-report-modal·ai-edit-view)의 렌더는 그대로 둔다.
              iconOnly && isDisabled && !menuDisabled
                ? "bg-slate-300 text-slate-700 hover:bg-slate-400 hover:text-slate-900"
                : null,
              // iconOnly 에서만 호출부 className 의 폭 계열을 걷어낸다(caretClassName 주석 참조).
              // className 이 없으면 두 경로의 병합 결과가 완전히 동일하다(기존 호출부 무변경).
              iconOnly ? caretClassName(className) : className,
              iconOnly ? "w-5" : null,
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-auto min-w-[180px] border-slate-200 p-1"
        >
          <PopoverArrow />
          <div className="flex flex-col">
            {secondaryActions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  setMenuOpen(false);
                  action.onClick();
                }}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
