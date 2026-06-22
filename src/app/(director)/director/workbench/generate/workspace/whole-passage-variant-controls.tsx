"use client";

import { useState } from "react";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Check,
  GitCompareArrows,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Shuffle,
  X,
} from "lucide-react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type {
  VariantDirection,
  WholePassageTransformMode,
} from "@/lib/passage-transform/schema";

// ============================================================================
// 지문 "전체 변형" 인라인 컨트롤 — 워크스페이스 행에서 관련/상반 주제·난이도·길이
// 변형으로 새 지문 한 편을 만들어 "새 행"으로 추가한다(원본 유지).
//  - VariantMenuButton: 6개 변형 액션 드롭다운 트리거
//  - WholePassageVariantPreviewPanel: 생성 결과 검토 + 추가/다시생성/취소
// 디자인 언어는 워크스페이스(blue-600/slate)와 동일. (Sparkles=금지 아이콘이라
// import 하지 않음 — 의도적으로 제외)
// ============================================================================

export interface VariantAction {
  key: string;
  mode: WholePassageTransformMode;
  direction?: VariantDirection;
  label: string;
  hint: string;
  Icon: typeof Shuffle;
}

/** 메뉴에 노출하는 6개 변형 액션 (그룹: 주제 / 난이도 / 길이). */
export const VARIANT_ACTIONS: VariantAction[] = [
  {
    key: "RELATED_TOPIC",
    mode: "RELATED_TOPIC",
    label: "관련 주제",
    hint: "같은 분야의 다른 소재로 새 지문",
    Icon: Shuffle,
  },
  {
    key: "OPPOSITE_TOPIC",
    mode: "OPPOSITE_TOPIC",
    label: "상반 주제",
    hint: "같은 소재, 반대 관점의 새 지문",
    Icon: GitCompareArrows,
  },
  {
    key: "DIFFICULTY_EASIER",
    mode: "DIFFICULTY",
    direction: "EASIER",
    label: "더 쉽게",
    hint: "주제·내용 유지, 어휘·구문만 쉽게",
    Icon: ArrowDownNarrowWide,
  },
  {
    key: "DIFFICULTY_HARDER",
    mode: "DIFFICULTY",
    direction: "HARDER",
    label: "더 어렵게",
    hint: "주제·내용 유지, 어휘·구문만 어렵게",
    Icon: ArrowUpNarrowWide,
  },
  {
    key: "LENGTH_SHORTER",
    mode: "LENGTH",
    direction: "SHORTER",
    label: "축약",
    hint: "핵심만 남겨 더 짧게",
    Icon: Minimize2,
  },
  {
    key: "LENGTH_LONGER",
    mode: "LENGTH",
    direction: "LONGER",
    label: "확장",
    hint: "관련 설명·예시를 더해 길게",
    Icon: Maximize2,
  },
];

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "주제", keys: ["RELATED_TOPIC", "OPPOSITE_TOPIC"] },
  { title: "난이도", keys: ["DIFFICULTY_EASIER", "DIFFICULTY_HARDER"] },
  { title: "길이", keys: ["LENGTH_SHORTER", "LENGTH_LONGER"] },
];

export function VariantMenuButton({
  disabled,
  busy,
  onPick,
}: {
  disabled: boolean;
  busy: boolean;
  onPick: (action: VariantAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const byKey = (k: string) => VARIANT_ACTIONS.find((a) => a.key === k)!;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        title="이 지문을 바탕으로 관련/상반 주제·난이도·길이를 바꾼 새 지문을 생성합니다"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-blue-300 bg-white px-2.5 text-[11.5px] font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {busy ? "변형 생성 중" : "변형 지문 생성"}
        {!busy ? (
          <CreditCostChip
            amount={CREDIT_COSTS.PASSAGE_VARIANT}
            className="rounded-sm bg-blue-50 px-1 py-px text-[10px] text-blue-500 ring-1 ring-inset ring-blue-200"
          />
        ) : null}
      </button>

      {open && !disabled ? (
        <>
          {/* 바깥 클릭 닫기 */}
          <div
            className="fixed inset-0 z-20"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+4px)] z-30 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-300/40"
          >
            <div className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-blue-700/80">
              새 지문으로 변형
            </div>
            {GROUPS.map((g) => (
              <div key={g.title} className="px-1 py-0.5">
                <p className="px-1.5 pb-0.5 pt-1 text-[10px] font-semibold text-slate-400">
                  {g.title}
                </p>
                {g.keys.map((k) => {
                  const a = byKey(k);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        onPick(a);
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-blue-50"
                    >
                      <a.Icon
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-bold text-slate-700">
                          {a.label}
                        </span>
                        <span className="block text-[10.5px] leading-snug text-slate-400">
                          {a.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function WholePassageVariantPreviewPanel({
  label,
  variantText,
  sourceWords,
  title,
  summary,
  busy,
  disabled,
  onTitleChange,
  onApply,
  onRegenerate,
  onCancel,
}: {
  /** 변형 종류 라벨 (예: "관련 주제"). */
  label: string;
  variantText: string;
  /** 원본 단어 수 — 길이 비교 표시용. */
  sourceWords: number;
  title: string;
  summary: string;
  busy: boolean;
  disabled?: boolean;
  onTitleChange: (v: string) => void;
  onApply: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const blocked = busy || disabled;
  const variantWords = wordCount(variantText);
  return (
    <div className="overflow-hidden rounded-lg border border-blue-200 bg-blue-50/40 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-white/70 px-3 py-2">
        <p className="text-[12px] font-bold text-blue-800">
          AI 변형 지문 — <span className="text-blue-600">{label}</span>{" "}
          <span className="font-medium text-blue-500">
            — 새 지문으로 추가하면 원본은 그대로 유지됩니다
          </span>
        </p>
        <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-blue-500">
          {sourceWords} → {variantWords} words
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold text-slate-500">
            제목
          </span>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={blocked}
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            placeholder="변형본 제목"
          />
        </label>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-700">
          {variantText}
        </div>
        {summary ? (
          <p className="text-[11px] leading-relaxed text-blue-600/90">
            {summary}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onApply}
            disabled={blocked || !title.trim()}
            className="flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            새 지문으로 추가
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={blocked}
            className="flex h-7 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-[11.5px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            다시 생성
            <CreditCostChip
              amount={CREDIT_COSTS.PASSAGE_VARIANT}
              className="rounded-sm bg-blue-50 px-1 py-px text-[10px] text-blue-500 ring-1 ring-inset ring-blue-100"
            />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={blocked}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
