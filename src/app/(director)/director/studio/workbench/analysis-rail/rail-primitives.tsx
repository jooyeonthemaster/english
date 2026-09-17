"use client";

// ============================================================================
// 레일 공용 소형 프리미티브 — 탭 버튼·메타 행·접이 프로즈(26-09-02 v4 분리).
//
// analysis-detail-rail.tsx 가 여정 스트립·다음 단계 블록(v4 §3 U5-1)을 얹으며
// 500줄 상한을 넘겨 표시 전용 조각을 이리로 뺐다. 동작·자구·토큰은 분리 전과
// 동일(무회귀) — 새 시각 문법을 여기서 만들지 않는다.
// ============================================================================

import { useState, type ReactNode } from "react";
import type { ExamQuestionKind } from "@/lib/exam-report/types";
import { cn } from "@/lib/utils";
import type { RailSectionKey } from "./use-analysis-console";

export const KIND_LABEL: Record<ExamQuestionKind, string> = {
  MC: "객관식",
  SHORT: "단답형",
  ESSAY: "서술형",
};

/** 상단 탭 1개 — 언더라인 문법(26-09-02 사용자 지시 "상단 탭으로 올려줘":
 *  회색 접이 밴드 IA 폐기). 활성 탭은 셸 소유(aside·드로어 동기), 계약
 *  셀렉터 data-rail-tab. 5탭 × 296px 플로어 → 라벨 2자 + 카운트만. */
export function RailTab({
  tabKey,
  label,
  count,
  active,
  onSelect,
}: {
  tabKey: RailSectionKey;
  label: string;
  count?: number;
  active: boolean;
  onSelect: (key: RailSectionKey) => void;
}) {
  return (
    <button
      type="button"
      data-rail-tab={tabKey}
      aria-selected={active}
      onClick={() => onSelect(tabKey)}
      className={cn(
        "relative -mb-px flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 text-[11.5px] font-semibold transition-colors",
        active
          ? "border-blue-600 text-slate-900"
          : "border-transparent text-slate-400 hover:text-slate-600",
      )}
    >
      {label}
      {count != null ? (
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium tabular-nums",
            active ? "text-blue-600" : "text-slate-300",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** 메타 1행 — 라벨 고정폭 + 값 truncate(절단 시 title 로 전문 제공). */
export function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 py-1">
      <dt className="w-14 shrink-0 text-[11px] text-slate-400">{label}</dt>
      <dd
        className="min-w-0 flex-1 truncate text-right text-[12px] font-medium tabular-nums text-slate-700"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/** 메타 블록 — [정보] 탭·분석 중·상세 없는 종결 상태가 공유하는 2급 카드. */
export function MetaBlock({
  rows,
}: {
  rows: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <dl className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
      {rows.map((m) => (
        <MetaRow key={m.label} label={m.label} value={m.value} />
      ))}
    </dl>
  );
}

/**
 * 총평 서브블록 — 긴 프로즈는 접어 시작(정보 위계 방어, V2-M2).
 *
 * 【26-09-03 사용자 지시】 "이 섹션이랑 이 섹션이랑 좀 구분이 되도록 해줘."
 * 「오답 설계 총평」과 「출제 범위 추정」이 **라벨만 다른 같은 모양**으로 연달아
 * 쌓여 어디서 끊기는지 안 읽혔다(둘 다 무테 프로즈 + 12px 회색 본문 + [더 보기]).
 * → **라벨이 있으면 독립 섹션이다 → 카드로 감싼다.** 카드 토큰은 새로 만들지
 *   않고 같은 탭의 이웃(rail-synthesis 「난이도 프로필」·「유형 분포」)이 이미 쓰는
 *   `rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2` 를 그대로 쓴다 —
 *   총평 탭 전체가 한 벌의 카드 언어가 된다.
 * 라벨 없는 호출(총평 첫 문단 overview)은 **무테 그대로**다: 그건 섹션이 아니라
 * 탭의 리드 문장이고, 전부 카드가 되면 아무것도 구분되지 않는다.
 * `icon` 은 라벨 옆 12px 글리프(옵션) — 스캔 시 두 섹션을 글자 없이 가른다.
 */
export function ClampedProse({
  label,
  text,
  startOpen = false,
  icon,
}: {
  label?: string;
  text: string;
  startOpen?: boolean;
  /** 라벨 왼쪽 글리프 — label 이 있을 때만 그린다. */
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  if (!text.trim()) return null;
  return (
    <div
      className={cn(
        "min-w-0",
        label && "rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2",
      )}
    >
      {label ? (
        <p className="mb-1 flex min-w-0 items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
          {icon}
          <span className="min-w-0 truncate">{label}</span>
        </p>
      ) : null}
      <p
        className={cn(
          "whitespace-pre-wrap break-keep text-[12px] leading-relaxed text-slate-600",
          !open && "line-clamp-4",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 cursor-pointer text-[11px] font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline"
      >
        {open ? "접기" : "더 보기"}
      </button>
    </div>
  );
}
