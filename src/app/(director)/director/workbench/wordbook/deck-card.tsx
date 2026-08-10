"use client";

// 단어장 카드 — deployments-panel 의 분리체(500줄 규약).
// 활성 카드: 미리보기·학생에게 보내기·보관 / 보관 카드: 미리보기·되살리기.

import { Archive, Eye, RotateCw, Send } from "lucide-react";
import type { VocabDeckRow } from "@/actions/vocab-drill-admin/decks";
import type { VocabDeckSpec } from "@/lib/vocab-drill/payload";
import { fmt, tierKo } from "./wordbook-ui";

/** 덱 spec → 조건 요약 칩 문자열 목록. 있는 조건만 — 직접 선택 덱은 빈 배열. */
export function specChips(spec: VocabDeckSpec): string[] {
  const chips: string[] = [];
  for (const g of spec.grades ?? []) chips.push(g);
  for (const t of spec.tiers ?? []) chips.push(tierKo(t));
  if (spec.posList?.length) chips.push(`품사 ${spec.posList.length}종`);
  if (spec.difficulties?.length) {
    chips.push(`난이도 ${[...spec.difficulties].sort((a, b) => a - b).join("·")}`);
  }
  return chips;
}

export interface DeckCardProps {
  deck: VocabDeckRow;
  archived: boolean;
  archiving: boolean;
  onPreview: () => void;
  onSend: () => void;
  onArchive: () => void;
  /** 보관 카드 전용 — 되살리기(보관은 되돌릴 수 있어야 한다) */
  onRestore?: () => void;
}

export function DeckCard({ deck, archived, archiving, onPreview, onSend, onArchive, onRestore }: DeckCardProps) {
  const chips = specChips(deck.spec);
  return (
    <article className={`rounded-lg border border-slate-200 p-3 ${archived ? "opacity-50" : ""}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800" title={deck.title}>
          {deck.title}
        </h4>
        {deck.slug ? (
          <span
            className="inline-flex h-[18px] shrink-0 items-center rounded bg-slate-100 px-1.5 text-[10.5px] font-semibold leading-none text-slate-500"
            title="처음부터 제공되는 기본 단어장입니다"
          >
            기본
          </span>
        ) : null}
      </div>
      {deck.subtitle ? (
        <p className="mt-0.5 truncate text-[11px] text-slate-400" title={deck.subtitle}>{deck.subtitle}</p>
      ) : null}
      <div className="mt-1.5 text-[12px] font-medium tabular-nums text-slate-600">단어 {fmt(deck.senseCountCache)}개</div>
      {chips.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1" title={chips.length > 4 ? chips.join(" · ") : undefined}>
          {chips.slice(0, 4).map((c) => (
            <span
              key={c}
              className="inline-flex h-[18px] items-center rounded border border-slate-200 px-1.5 text-[10.5px] leading-none text-slate-500 whitespace-nowrap"
            >
              {c}
            </span>
          ))}
          {chips.length > 4 ? (
            <span className="text-[10.5px] leading-[18px] tabular-nums text-slate-400">+{chips.length - 4}</span>
          ) : null}
        </div>
      ) : null}
      {!archived ? (
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPreview}
            title="들어갈 단어를 확인합니다"
            className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Eye className="size-3" /> 미리보기
          </button>
          <button
            type="button"
            onClick={onSend}
            className="flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Send className="size-3" /> 학생에게 보내기
          </button>
          <button
            type="button"
            onClick={onArchive}
            disabled={archiving}
            title="목록에서 치워 둡니다 (되살리기 가능)"
            className="ml-auto flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40"
          >
            <Archive className="size-3.5" />
          </button>
        </div>
      ) : (
        // 보관 카드 — 미리보기와 되살리기(적대검수 2026-08-04 2차: 비가역이었다)
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPreview}
            className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Eye className="size-3" /> 미리보기
          </button>
          <button
            type="button"
            onClick={onRestore}
            disabled={archiving}
            className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            <RotateCw className="size-3" /> 되살리기
          </button>
        </div>
      )}
    </article>
  );
}
