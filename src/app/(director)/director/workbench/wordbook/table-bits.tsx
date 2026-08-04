"use client";

// 탐색·의미 이동 테이블 공용 원자 — sense-table ↔ shift-table 이 같이 쓴다.
// (한쪽에 두면 순환 import — 셸→sense-table→shift-table 단방향을 지키기 위한 파일)

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Plus } from "lucide-react";
import type {
  WordbookBasketItem,
  WordbookSenseRow,
  WordbookShiftRow,
} from "./wordbook-types";

/** th 공통 클래스 — 헤더 밀도·색의 단일 출처. */
export const TH =
  "h-8 whitespace-nowrap px-2 text-left text-[11px] font-semibold text-slate-500";

/** sense 행 → 바스켓 아이템 — 담는 단위는 뜻이다. */
export function senseItem(r: WordbookSenseRow): WordbookBasketItem {
  const { senseId, lemmaId, lemma, pos, senseKo, tier, difficulty } = r;
  return { senseId, lemmaId, lemma, pos, senseKo, tier, difficulty };
}

/** 의미 이동 행 → 바스켓 아이템 — 담는 대상은 B축(지금 시험에 나오는 뜻)이다. */
export function shiftItem(r: WordbookShiftRow): WordbookBasketItem {
  return {
    senseId: r.bSenseId,
    lemmaId: r.lemmaId,
    lemma: r.lemma,
    pos: r.pos,
    senseKo: r.bSenseKo,
    tier: r.bTier,
    difficulty: r.bDifficulty,
  };
}

/** 담기 버튼 — 클릭(토글·shift 범위)과 pointerdown(쓸어담기 시작)을 부모가 판정. */
export function BasketButton({
  active,
  title,
  onPointerDown,
  onClick,
}: {
  active: boolean;
  title: string;
  onPointerDown: (e: ReactPointerEvent) => void;
  onClick: (e: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={(e) => {
        // 행 클릭(도시에 열기)과 겹치지 않도록 전파를 끊는다.
        e.stopPropagation();
        onClick(e);
      }}
      title={title}
      aria-pressed={active}
      className={`flex size-6 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "border border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600"
      }`}
    >
      {active ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
    </button>
  );
}

/** 의미 이동 A/B 뜻 셀 — 점유율 숫자+얇은 바. */
export function ShareCell({
  senseKo,
  share,
  fill,
}: {
  senseKo: string;
  share: number;
  fill: string;
}) {
  const pct = Math.round(share * 100);
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="min-w-0 flex-1 truncate font-semibold text-slate-900"
          title={senseKo}
        >
          {senseKo}
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
          {pct}%
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
