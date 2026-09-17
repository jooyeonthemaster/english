"use client";

// 인라인 기출 브라우저 — 목록 행(정본 §11.2 「행 = BankInlineRow(memo)」).
//
//   ┌ □  2027 6월 · 21번  [함축의미] [3점]                     👁 ┐  1줄: 회차·번호 + 유형 배지 + 3점 배지 + 미리보기
//   │    In fact, scientists attributing consciousness to any…     │  2줄: preview 1줄 말줄임
//   └────────────────────────────────────────────────────────────────┘
//
// 계약
// - React.memo, props 는 원시값 + 안정 콜백만(§11.8). 객체·Set 을 내리지 마라 — 40행이 매 렌더 다시 그려진다.
//   체크 메타(passageId·passageTitle·typeGroup·points)는 클릭 순간에만 객체로 조립해 올린다(렌더마다 만들지 않는다).
// - 체크 = 「이 시험지에 들어 있음」 하나뿐. state: idle | picked | pending(스피너) | failed(경고 + title).
//   picked·pending 은 aria-checked=true(낙관), failed 는 false 로 되돌린다(§11.4-4).
// - 행 클릭 = 토글. 체크 시맨틱·키보드는 좌측 role="checkbox" 실버튼이 소유(ComposerListPane 행과 같은 배치).
//   Space/Enter 는 <button> 네이티브 클릭으로 흐른다(onKeyDown 재구현 금지 — 이중 토글).
// - 행 루트는 `<div role="listitem">`(§11.13.2) — 목록이 DragSelect(div 래퍼) 안에 놓이므로 <li> 는 부모가 <ul>
//   이 아니게 되어 쓸 수 없다. `data-drag-item-id` 가 마키 히트 대상, `data-exam-bank-row` 가 프로브·키보드 계약.
//   마키 5px 임계 아래의 클릭은 DragSelect 가 그대로 통과시켜 행 클릭 토글이 산다(drag-select.tsx handleUp 은
//   active 였을 때만 click 을 1회 삼킨다). 체크박스·👁 는 상호작용 요소라 DragSelect 가 시작점에서 자동 제외한다
//   (hardInteractive `[role='checkbox']` / buttonLike `button`).
// - roving tabindex: tabStop 인 행만 tabIndex=0. ↑↓ 이동은 목록 컨테이너가 DOM 형제로 처리하고 포커스 도착을
//   onFocusRow 로 올려 tabStop 을 옮긴다.
// - 호버로 상태를 바꾸는 코드 금지(§11.1 「틱틱」 원인) — hover 는 CSS 뿐.
// - 미학: 체크 행 `border-blue-300/80 bg-blue-50/60`(ComposerListPane 체크 행과 동일 — 같은 뜻은 같은 모양),
//   idle 행 `border-slate-100`, hover `bg-slate-50`. 배지 rounded-md, 아이콘 size-3.5, 폰트 11~12px.
//   ⚠ 행 루트에 인라인 style 을 두지 마라 — DragSelect(deferCommit)가 드래그 중 `style.backgroundColor` 로 틴트를
//   칠하고 놓을 때 원복한다. React 가 style 속성을 소유하면 리렌더가 틴트를 지우거나 원복이 꼬인다.

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { memo } from "react";

import { boardShortLabel, examShortLabel, typeBadgeClass } from "@/lib/exam-passages/format";
import { BankPreviewPopover } from "./bank-preview";
import type { ExamBankInlineRowState } from "./types";

const BOX_BASE = "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors";
const BOX_OFF = `${BOX_BASE} border-slate-300 bg-white text-transparent`;
const BOX_ON = `${BOX_BASE} border-blue-600 bg-blue-600 text-white`;
const BOX_PENDING = `${BOX_BASE} border-blue-300 bg-blue-50 text-blue-600`;
const BOX_FAILED = `${BOX_BASE} border-rose-300 bg-rose-50 text-rose-500`;
const BADGE = "inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 text-[10px] font-semibold leading-none";

/** 출처 자구 — 평가원 「2024 수능」 / 교육청 「2025 고1 3월」(구 bank-row.tsx 와 같은 규칙). */
export function bankInlineSourceLabel(row: { year: number; exam: string; board: string; grade: string }): string {
  return boardShortLabel(row.board) === "교육청"
    ? `${row.year} ${row.grade} ${row.exam}`
    : `${row.year} ${examShortLabel(row.exam)}`;
}

/**
 * 체크 메타 — 호스트가 미러(questionRowById)에 아직 없는 임시 id(`bank:<bankId>`)의 flatPicked 항목을 만들 재료
 * (§11.13.1 「미러에 없는 id 는 extraMeta 로 메타 공급」). 행이 이미 가진 원시값만 담는다 — 서버 왕복 없음.
 * types.ts 콜백의 3번째 인자(단위 H3 additive)와 구조가 같다. 이름을 달리 둔 이유: index.ts 재수출 충돌 회피 —
 * H3 착지 뒤 게이트에서 types.ts 의 것으로 접합한다.
 */
export interface BankInlineRowPickMeta {
  passageId: string;
  passageTitle: string;
  typeGroup: string;
  points: number;
}

export interface BankInlineRowProps {
  id: string;
  passageId: string;
  passageTitle: string;
  year: number;
  exam: string;
  board: string;
  grade: string;
  qNum: number;
  setLabel?: string;
  typeGroup: string;
  points: number;
  preview: string;
  state: ExamBankInlineRowState;
  /** 클래스 없음 — 체크 불가(aria-disabled, 클릭 무시) */
  disabled: boolean;
  /** roving tabindex 의 현재 정지점 */
  tabStop: boolean;
  /** 3번째 meta 는 클릭 순간 조립. 호스트 콜백이 2인자여도 assignable(인자가 적은 함수 → 많은 시그니처) — 무시될 뿐 */
  onToggle: (bankId: string, next: boolean, meta: BankInlineRowPickMeta) => void;
  onFocusRow: (bankId: string) => void;
}

function BankInlineRowImpl({
  id,
  passageId,
  passageTitle,
  year,
  exam,
  board,
  grade,
  qNum,
  setLabel,
  typeGroup,
  points,
  preview,
  state,
  disabled,
  tabStop,
  onToggle,
  onFocusRow,
}: BankInlineRowProps) {
  const checked = state === "picked" || state === "pending";
  const source = bankInlineSourceLabel({ year, exam, board, grade });
  // 접근 이름은 화면 자구와 같은 출처 라벨을 쓴다 — 교육청 행은 학년이 빠지면 「2025 3월 21번」이 고1/고2/고3 중
  // 어느 시험인지 스크린리더로는 구분이 안 된다. 3점은 화면 배지와 같이 이름에 싣는다.
  const numberLabel = setLabel ?? String(qNum);
  const heading = `${source} · ${numberLabel}번 · ${typeGroup}${points === 3 ? " · 3점" : ""}`;
  const failDescId = `exam-bank-row-fail-${id}`;
  const toggle = () => {
    // pending(반입 대기·즉시 조판 뒤 DB 동기화 중)에도 **해제는 된다** — 체크 직후 몇 초 동안 취소가 막히면
    // 사용자는 「눌러도 안 빠진다」로 읽는다(p3 진단: uncheck 클릭이 [bank-toggle] 없이 증발). 재체크는 checked 라
    // 발생하지 않고, 해제는 호스트가 버퍼 삭제·취소 표식·GET abort 로 처리한다(§11.13.1-6).
    if (disabled) return;
    onToggle(id, !checked, { passageId, passageTitle, typeGroup, points });
  };

  return (
    <div
      role="listitem"
      data-drag-item-id={id}
      data-exam-bank-row={id}
      data-state={state}
      onClick={toggle}
      className={
        "group flex items-start gap-2 rounded-md border px-2.5 py-1.5 transition-colors " +
        (disabled ? "cursor-default " : "cursor-pointer ") +
        (checked
          ? "border-blue-300/80 bg-blue-50/60"
          : state === "failed"
            ? "border-rose-200 bg-rose-50/40"
            : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50")
      }
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        aria-busy={state === "pending" || undefined}
        aria-invalid={state === "failed" || undefined}
        aria-describedby={state === "failed" ? failDescId : undefined}
        aria-label={`${source} ${numberLabel}번 ${typeGroup}${points === 3 ? " 3점" : ""} 시험지에 넣기`}
        title={
          disabled
            ? "클래스를 먼저 선택하세요"
            : state === "failed"
              ? "시험지에 넣지 못했습니다 — 다시 체크해 주세요"
              : state === "pending"
                ? "시험지에 넣는 중"
                : undefined
        }
        tabIndex={tabStop ? 0 : -1}
        onFocus={() => onFocusRow(id)}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={
          // mt-0.5: 한글 글리프 박스가 line-height 를 넘쳐 첫 줄 시각 중심이 아래(ComposerListPane 실측).
          "mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
          (disabled ? "cursor-not-allowed opacity-40 " : "cursor-pointer ") +
          (state === "pending" ? BOX_PENDING : state === "failed" ? BOX_FAILED : checked ? BOX_ON : BOX_OFF)
        }
      >
        {state === "pending" ? (
          <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
        ) : state === "failed" ? (
          <AlertCircle className="size-3 text-rose-500" strokeWidth={2.5} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </button>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold leading-[18px] text-slate-700 tabular-nums">
            {source} · {numberLabel}번
          </span>
          <span className={`${BADGE} ${typeBadgeClass(typeGroup)}`}>{typeGroup}</span>
          {points === 3 ? (
            <span className={`${BADGE} border-slate-900 bg-slate-900 px-1 font-bold text-white`}>3점</span>
          ) : null}
          <span className="ml-auto -my-1 -mr-1 shrink-0">
            <BankPreviewPopover id={id} heading={heading} />
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-snug text-slate-600">{preview}</span>
        {state === "failed" ? (
          // 스크린리더용 실패 설명(aria-describedby) — 시각은 체크박스의 AlertCircle·title 이 맡는다.
          <span id={failDescId} className="sr-only">
            시험지에 넣지 못했습니다. 다시 체크해 주세요.
          </span>
        ) : null}
      </span>
    </div>
  );
}

export const BankInlineRow = memo(BankInlineRowImpl);

/** 첫 진입 1회 전용 스켈레톤(이후 재조회는 keep-previous — 스켈레톤 플래시 금지). data-drag-item-id 없음 = 마키 무대상. */
export function BankInlineRowSkeleton() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-slate-100 px-2.5 py-1.5" aria-hidden="true">
      <span className="mt-0.5 size-4 shrink-0 animate-pulse rounded-[5px] bg-slate-200" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex gap-1.5">
          <span className="h-[18px] w-20 animate-pulse rounded-md bg-slate-200" />
          <span className="h-[18px] w-14 animate-pulse rounded-md bg-slate-100" />
        </span>
        <span className="block h-3 w-4/5 animate-pulse rounded bg-slate-100" />
      </span>
    </div>
  );
}
