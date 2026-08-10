"use client";

// ============================================================================
// 설계 레일 조각들 — AuthoringSpecPanel 이 쓰는 "한 줄 + 팝오버" 부품.
//
// 화면 구조 계약 — **한 항목 = 한 줄(h-9 / 36px)**. 선택지도 설명도 전부 팝오버
// 안이다. 레일 높이 예산이 그게 전부이기 때문이다. 줄에 설명문을 상시로 얹는 순간
// 레일에 자체 스크롤이 생기고, 사용자가 요구한 "설정은 한눈에"가 깨진다. 설명 자리는
// 팝오버 안(hint)과 SelectionNote 둘뿐이다.
//
// 왜 파일을 나눴나: 패널 본체는 "무엇을 묻는가"만 읽혀야 한다. 세그먼트 색 공식이
// 본체에 섞이면 항목이 하나 늘 때마다 400줄 규칙을 넘긴다.
//
// 이 파일이 더 이상 갖지 않는 것(개편 이력 — 되돌리지 말 것)
//  · 스타일 상수: SEG_ON/SEG_OFF 는 ./authoring-tokens.ts 가 정본이다. 여기서는
//    **재수출만** 한다. 구 SEG_ON('border-blue-600 bg-blue-50/40 text-blue-700')은
//    흰 배경 합성 시 #f9fbff(ΔL 0.01)라 채움 기여가 0이었고, 선택 신호가 1px
//    테두리 하나에만 걸려 있었다 — 게다가 이 문자열이 6곳에 손코딩 복제돼 있었다.
//  · 한국어 힌트 사전: @/lib/wording/passage-authoring-glossary.ts 가 정본이다.
//    화면 문구가 두 곳에 살면 한쪽만 고쳐져 "화면 설명"과 "실제 생성물"이 갈라진다.
//  · PopoverGroupTitle: ./authoring-primitives.tsx 의 PopoverTitle 로 합쳤다.
//    같은 뜻("이 아래 것들의 머리글")이 4개 구현으로 갈라져 크기·색·굵기가 전부
//    달랐다. 제목이 본문보다 커야 한다는 원 의도는 PopoverTitle 13 > 본문 12 로
//    그대로 만족한다.
//
// 회귀 방지 계약
//  · 라벨 문자열은 여기서 짓지 않는다 — schema.ts 의 *_LABELS 가 정본이다.
//    화면 문구와 서버 프롬프트가 갈라지면 신뢰가 깨진다.
//  · 활성/비활성 색은 SEG_ON/SEG_OFF 하나만 쓴다. 새 색을 만들지 말 것.
//    **선택(채운 파랑)과 열림(테두리+ring, ROW_OPEN)은 다른 신호다** — 합치면
//    "지금 고른 값"과 "지금 펼친 줄"이 같은 얼굴이 되어 무엇이 확정인지 안 읽힌다.
//  · **고르고 나서 팝오버를 닫지 않는다.** 고른 결과가 무엇을 뜻하는지(학년 설명·
//    읽기 시간·크레딧 합계)를 그 자리에서 되돌려 주는 게 이 화면의 목적인데,
//    선택 즉시 닫으면 그 되먹임을 아무도 못 본다. 편수는 특히 그렇다 — 크레딧
//    합계가 같은 프레임에서 갱신돼야 결제 놀람이 없다.
//  · 글자를 자르지 않는다. 라벨·설명은 줄바꿈(break-keep)으로 접지, truncate 로
//    숨기지 않는다. 선생님이 못 읽는 설명은 없는 것과 같다. 그래서 세그먼트·목록
//    항목의 높이는 h-9 가 아니라 **min-h-9** 다(접히면 자라야 하니까).
// ============================================================================

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  AuthoringPopover,
  FieldLabel,
  Kicker,
  PopoverTitle,
} from "./authoring-primitives";
import { DESK, FOCUS_RING, SEG_OFF, SEG_ON } from "./authoring-tokens";

// ── 재수출 ──────────────────────────────────────────────────────────────────
// 소비자(authoring-spec-panel.tsx)가 "설정 줄에 필요한 것"을 한 곳에서 가져오게
// 두되, **정본은 옮기지 않는다**. 값은 토큰 파일과 문구 사전에만 산다.

export { SEG_OFF, SEG_ON } from "./authoring-tokens";
export {
  GRADE_BAND_KO_HINTS,
  LEXICAL_KO_HINTS,
  PASSAGE_GENRE_KO_HINTS,
  SYNTAX_KO_HINTS,
  TOPIC_FIELD_KO_HINTS,
  describeReadingLoad,
  formatReadingTime,
} from "@/lib/wording/passage-authoring-glossary";

// ── 조각 컴포넌트 ───────────────────────────────────────────────────────────

/**
 * 라디오 대신 쓰는 세그먼트 그룹. 선택지가 짧고 개수가 적을 때만 쓴다(학년·수준·
 * 편수). 라벨이 길어지는 축은 OptionList 로 간다.
 */
export function Segments<T extends string>({
  value,
  options,
  onSelect,
  disabled,
  ariaLabel,
  columns,
  lastSpansRow,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onSelect: (value: T) => void;
  disabled: boolean;
  ariaLabel: string;
  columns: number;
  /**
   * 마지막 한 칸이 행을 통째로 차지한다. 학년 7개를 3열(중등 3 / 고등 3)로 놓으면
   * "수능"만 마지막 줄에 고아처럼 남는데, 행을 채우면 "중·고 다음의 별도 단계"로
   * 읽힌다 — 빈칸이 아니라 의도로 보이게 하는 장치다.
   */
  lastSpansRow?: boolean;
}) {
  return (
    // gap-2(8px) — 이 기능의 gap 기본값이다. 구 gap-1.5(6px)는 6단 간격
    // (4/8/12/16/24/32) 밖이었고, 이 파일이 그 오프그리드 값의 진원지였다.
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-2",
        lastSpansRow && "[&>*:last-child]:col-span-full",
      )}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            disabled={disabled}
            aria-pressed={active}
            // 라벨이 길면("한 단계 어렵게") 레일을 최소폭으로 좁혔을 때 한 줄에
            // 못 들어간다. 자르지 않고 **어절 단위로 접는다**(break-keep) — 그래서
            // 높이가 h-9 가 아니라 min-h-9 다. 접혀도 36px 하한은 유지된다.
            className={cn(
              "inline-flex min-h-9 cursor-pointer items-center justify-center break-keep rounded-md border px-2 text-center leading-tight transition-colors",
              DESK.body,
              FOCUS_RING,
              "disabled:cursor-not-allowed disabled:opacity-50",
              active ? SEG_ON : SEG_OFF,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 세로 목록 — 선택지가 많고(6~9개) 각각 부연이 필요한 축(뼈대·소재·여러 편 소재).
 * 세그먼트로 접으면 한 칸이 3~4글자로 쪼그라들어 "설명문"·"논설문" 같은 라벨만
 * 남는데, 그것만 보고 무엇이 나올지 아는 사람은 없다. 그래서 항목마다 부연을
 * 한 줄씩 붙인다 — 이 축들은 세로로 길어져도 팝오버 안이라 레일을 밀지 않는다.
 *
 * 항목 여백 px-2 py-2 는 역할 드롭다운(material-role-menu)과 **같은 값**이다.
 * 같은 모양의 목록이 화면마다 다른 여백을 갖지 않게 한 벌로 맞춘다.
 */
export function OptionList<T extends string>({
  value,
  options,
  onSelect,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  onSelect: (value: T) => void;
  disabled: boolean;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="grid gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "flex min-h-9 cursor-pointer flex-col items-start justify-center gap-1 rounded-md border px-2 py-2 text-left transition-colors",
              FOCUS_RING,
              "disabled:cursor-not-allowed disabled:opacity-50",
              active ? SEG_ON : SEG_OFF,
            )}
          >
            <span className={cn(DESK.body, "break-keep leading-tight")}>
              {option.label}
            </span>
            {option.hint ? (
              // 부연은 접히기만 하고 잘리지 않는다. 선택된 항목은 배경이 채운
              // 파랑이므로 부연 색도 파랑 계열 밝은 값(blue-100)이어야 읽힌다 —
              // slate-500 을 그대로 두면 파랑 위 회색이 되어 사라진다.
              <span
                className={cn(
                  DESK.meta,
                  "break-keep leading-snug",
                  active ? "text-blue-100" : "text-slate-500",
                )}
              >
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 설정 줄 묶음 — 성격이 같은 줄끼리 머리표 하나로 묶고, 묶음 사이만 벌린다.
 *
 * 왜 필요한가: 같은 높이(36px)·같은 테두리·같은 색의 줄 여러 개가 좁은 간격으로
 * 이어지면 시선이 끊길 지점이 하나도 없다 — "빽빽하다"의 1순위 원인이었다. 실제
 * 성격은 넷으로 갈린다(난이도 4 / 내용 3 / 용도 1 / 수량·돈 2). 늘어나는 높이는
 * 머리표와 구분선뿐이고, 줄 내부 구조는 건드리지 않는다.
 *
 * 머리표는 Kicker(11/700 0.04em)를 쓴다. 레일 안에서 이것은 '제목'이 아니라
 * '구획 표지'라서, PopoverTitle(13) 이나 SectionTitle(14) 급으로 올리면 줄의
 * 값(13)보다 커져 시선이 내용이 아니라 표지에 먼저 걸린다. 구 값(11px bold
 * slate-600)의 의도 — "줄 라벨보다 굵어야 머리글로 읽힌다" — 는 kicker 의 700
 * 굵기와 0.04em 자간으로 그대로 만족한다.
 */
export function SpecGroup({
  title,
  /** 첫 묶음에는 위 구분선을 주지 않는다(패널 맨 위에 선이 뜨면 잘린 것처럼 보인다). */
  divided,
  children,
}: {
  title: string;
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={divided ? "mt-4 border-t border-slate-100 pt-4" : ""}>
      {/* 머리표 → 내용 사이는 8px(kicker→내용 규칙). */}
      <Kicker className="mb-2">{title}</Kicker>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * 팝오버 맨 아래 "고른 결과가 무슨 뜻인지" 한 줄. 줄(SettingRow)에는 못 얹는
 * 내용이다 — 레일 높이 예산이 라벨+값 한 줄뿐이라서. 대신 여기서는 선택 즉시
 * 갱신돼야 한다(그래서 고른 뒤에도 팝오버를 닫지 않는다).
 */
export function SelectionNote({ children }: { children: ReactNode }) {
  return (
    <p
      className={cn(
        DESK.meta,
        "mt-2 rounded-md bg-slate-50 px-2 py-2 leading-relaxed text-slate-600",
      )}
    >
      {children}
    </p>
  );
}

/**
 * ROW_OPEN(authoring-tokens.ts)의 data-[state=open] 변형.
 * Tailwind 는 **소스 문자열**을 스캔하므로 `ROW_OPEN.split(' ').map(...)` 같은
 * 런타임 조합은 클래스가 생성되지 않아 조용히 무효가 된다 — 그래서 이 한 줄만
 * 문자로 적는다. 값이 갈라지지 않도록 토큰 쪽을 고치면 여기도 같이 고친다.
 */
const ROW_OPEN_STATE =
  "data-[state=open]:border-blue-500 data-[state=open]:bg-white data-[state=open]:ring-2 data-[state=open]:ring-blue-100";

/**
 * 설정 한 줄. 평소에는 "라벨 · 현재값 ▾" 36px 한 줄만 차지하고, 누르면 팝오버로
 * 선택지를 편다.
 *
 * 읽는 순서를 값 쪽으로 기울였다: 라벨은 meta(12/500 slate-500), 값은
 * body(13/600 slate-900). 여러 줄을 훑을 때 필요한 건 "무엇을 묻는가"가 아니라
 * "지금 뭐로 돼 있나"이기 때문이다. 위계를 0.5px 씩 내려서 만들던 구 값
 * (라벨 11.5 / 값 12.5)은 폐기했다 — 한글 12 vs 12.5 는 1x DPI 에서 구별되지
 * 않으면서 표류의 최대 원천이었다. 지금은 **크기 1단 + 색 2단**으로 같은 위계를
 * 만든다. 라벨 칸에 62px 바닥을 깔아 값의 시작선을 세로로 맞춘다 — 값이 오른쪽
 * 끝에 붙어 들쭉날쭉하면 세로로 훑는 게 안 된다.
 *
 * **열림은 채우지 않는다.** data-[state=open] 은 ROW_OPEN(테두리 blue-500 +
 * ring-blue-100)이고, 선택(SEG_ON)만 채운 파랑이다. 둘을 같은 얼굴로 두면 줄
 * 전체가 파래져서 정작 열린 줄이 어디인지 안 보인다.
 *
 * 아주 좁은 레일에서는 라벨/값을 **두 줄로 쌓는다**(@max-[200px]). 실측: 호스트
 * 380px → 레일 171px → 줄 151 → 내폭 131 → 값 칸이 39px 밖에 안 남아 "약 150단어"도,
 * 편수 줄의 "· 크레딧 2"도 통째로 잘렸다 — 열어 보지 않아도 얼마가 나가는지 보인다는
 * 계약이 그 폭에서 깨진다. 쌓아도 라벨 18 + 값 20 = 38px 라 줄 높이는 min-h-9 로
 * 흡수된다.
 * ⚠️ 기준 컨테이너는 설정 패널 루트(authoring-spec-panel.tsx 의 @container)다.
 */
export function SettingRow({
  label,
  value,
  valueNote,
  hint,
  disabled,
  children,
}: {
  label: string;
  /** 지금 값 — 열지 않고도 읽혀야 한다. */
  value: string;
  /**
   * 값 뒤에 흐리게 붙는 곁말. **돈에만 쓴다**(크레딧 합계). 열어 보지 않아도
   * 얼마가 나가는지 보여야 결제 놀람이 없다. 다른 부연을 여기 얹으면 줄이 길어져
   * 값이 잘린다 — 그 순간 이 줄의 목적이 사라진다.
   */
  valueNote?: string;
  /** 이 설정이 무엇인지. 팝오버 안에서만 보여 준다(줄 자리를 먹지 않게). */
  hint?: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "group/row flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left transition-colors",
            "hover:border-blue-300 hover:bg-slate-50",
            FOCUS_RING,
            "disabled:cursor-not-allowed disabled:opacity-50",
            ROW_OPEN_STATE,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 @max-[200px]:flex-col @max-[200px]:items-start @max-[200px]:gap-0">
            {/* 폭을 min- 으로 잡는 이유: 지금 라벨(최대 "겨냥 문항")은 62px 안에
                들어가 값의 시작선이 세로로 맞는다. 나중에 더 긴 라벨이 생기면 칸이
                늘어나 그 줄만 값이 밀릴 뿐, 라벨이 잘리지는 않는다 — 정렬보다 안
                잘리는 쪽이 위다(고정 w- + nowrap 이면 글자가 값 위로 넘친다).
                좁을 때는 그 62px 바닥을 풀어 값에 폭을 전부 넘긴다. */}
            <FieldLabel className="min-w-[62px] shrink-0 whitespace-nowrap group-data-[state=open]/row:text-blue-700 @max-[200px]:min-w-0">
              {label}
            </FieldLabel>
            <span
              className={cn(
                DESK.body,
                "min-w-0 flex-1 truncate text-slate-900 group-data-[state=open]/row:text-blue-700 @max-[200px]:w-full @max-[200px]:flex-none",
              )}
            >
              {value}
              {valueNote ? (
                <span
                  className={cn(
                    DESK.meta,
                    "ml-1 text-slate-500 group-data-[state=open]/row:text-blue-600",
                  )}
                >
                  {`· ${valueNote}`}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown
            className="size-3.5 shrink-0 text-slate-400 transition-transform group-data-[state=open]/row:rotate-180 group-data-[state=open]/row:text-blue-600"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      {/*
        아래로 펼친다(셀렉트의 보편 동작). 레일이 화면 오른쪽 끝에 붙어 있으므로
        align="end" 로 **오른쪽 모서리를 줄에 맞춰** 왼쪽으로 펼쳐야 화면 밖으로
        새지 않는다. 폭은 트리거와 같게(width="trigger") 잡아 "그 줄이 펼쳐진 것"
        으로 읽히게 한다. 높이·여백·sideOffset 은 AuthoringPopover 가 고정한다.
      */}
      <AuthoringPopover width="trigger" aria-label={label}>
        <div className="px-2 py-2">
          <PopoverTitle>{label}</PopoverTitle>
          {hint ? (
            <p
              className={cn(
                DESK.meta,
                "mt-1 break-keep leading-relaxed text-slate-500",
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
        <div className="px-2 pb-2">{children}</div>
      </AuthoringPopover>
    </Popover>
  );
}
