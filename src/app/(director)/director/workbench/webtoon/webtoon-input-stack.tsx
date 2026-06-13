"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Loader2, Palette, Plus, Languages, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { PassageInputRow } from "@/components/workbench/passage-registration/passage-input/passage-input-row";
import {
  isPristineEmptyRow,
  makeEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow as RowData,
} from "@/components/workbench/passage-registration/passage-input/types";
import {
  WEBTOON_STYLES,
  WEBTOON_LANGUAGES,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "./webtoon-page-types";

interface WebtoonInputStackProps {
  rows: RowData[];
  setRows: Dispatch<SetStateAction<RowData[]>>;
  /** True while the parent is persisting passages + queuing webtoons. */
  saving: boolean;

  style: WebtoonStyleId;
  setStyle: (s: WebtoonStyleId) => void;
  language: WebtoonLanguageId;
  setLanguage: (l: WebtoonLanguageId) => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;

  /** Persist every valid row → Passage, then queue a webtoon for each. */
  onGenerate: () => void;
}

/**
 * 웹툰 생성 페이지의 우측 "지문" 패널. 학습지 생성의 PassageInputRow 편집기를 그대로
 * 재사용하되(자료 관리에서 불러온 지문 = 행), 하단 액션을 학습지 분석 대신 화풍·언어·
 * 추가 지시 + "웹툰 생성"으로 교체한다.
 */
export function WebtoonInputStack({
  rows,
  setRows,
  saving,
  style,
  setStyle,
  language,
  setLanguage,
  customPrompt,
  setCustomPrompt,
  onGenerate,
}: WebtoonInputStackProps) {
  const updateRow = (localId: string, patch: Partial<RowData>) =>
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow()]);

  const removeRow = (localId: string) =>
    setRows((prev) => {
      if (prev.length > 1) return prev.filter((r) => r.localId !== localId);
      return [makeEmptyRow()];
    });

  const splitRow = (localId: string, chunks: string[]) =>
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.localId === localId);
      if (idx < 0) return prev;
      const built = chunks.map((c, i) => {
        const row = makeEmptyRow(c);
        if (i === 0 && prev[idx].title) row.title = prev[idx].title;
        return row;
      });
      return [...prev.slice(0, idx), ...built, ...prev.slice(idx + 1)];
    });

  const validRows = useMemo(
    () => rows.filter((r) => r.content.trim().length >= MIN_CONTENT_CHARS),
    [rows],
  );
  const n = validRows.length;
  const canGenerate = n > 0 && !saving;
  const total = CREDIT_COSTS.WEBTOON_IMAGE * Math.max(1, n);

  const countChip =
    n > 1 ? (
      <span className="inline-flex items-center rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
        {n}개
      </span>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 단일 스크롤 영역(안내+지문+옵션). 행을 flex-fill 하지 않아(grow=false)
          카드가 찌부되며 카드 밖으로 삐져나오던 문제를 원천 차단한다. CTA는 아래 고정. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5">
      {/* Intro */}
      <div className="mb-2">
        <p className="text-[12px] leading-relaxed text-slate-500">
          왼쪽 <b className="text-slate-600">자료 관리</b>에서 지문을 체크해{" "}
          <b className="text-blue-600">불러오거나</b>, 여기에 영어 지문을 직접
          붙여넣으세요. 여러 지문은 <b className="text-blue-600">“지문 추가”</b>로
          늘리면, 각 지문이 한 장의 세로형 웹툰으로 생성됩니다.
        </p>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <PassageInputRow
            key={row.localId}
            index={i}
            row={row}
            onChange={(patch) => updateRow(row.localId, patch)}
            onRemove={() => removeRow(row.localId)}
            canRemove={rows.length > 1 || !isPristineEmptyRow(row)}
            removeMode={rows.length > 1 ? "delete" : "clear"}
            disabled={saving}
            onSplit={(chunks) => splitRow(row.localId, chunks)}
            grow={false}
            editorHeightPx={300}
          />
        ))}
      </div>

      {/* 지문 추가 */}
      <div className="shrink-0 pt-2">
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 py-2.5 text-[13px] font-bold text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100/70 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          지문 추가
        </button>
      </div>

      {/* ── 화풍 ── */}
      <div className="mt-2.5 shrink-0">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Palette className="size-3.5 text-slate-400" />
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            화풍
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEBTOON_STYLES.map((s) => {
            const active = style === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                disabled={saving}
                title={s.description}
                aria-pressed={active}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${
                  active
                    ? "border-blue-400 bg-blue-50/70 text-blue-800 ring-1 ring-blue-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 대사 언어 ── */}
      <div className="mt-2.5 shrink-0">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Languages className="size-3.5 text-slate-400" />
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            대사 언어
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEBTOON_LANGUAGES.map((l) => {
            const active = language === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLanguage(l.id)}
                disabled={saving}
                title={`${l.label} — ${l.description}`}
                aria-pressed={active}
                aria-label={l.label}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${
                  active
                    ? "border-blue-400 bg-blue-50/70 text-blue-800 ring-1 ring-blue-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {l.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 추가 지시사항 ── */}
      <div className="mt-2.5 shrink-0">
        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
          추가 지시사항{" "}
          <span className="font-medium normal-case text-slate-400">(선택)</span>
        </span>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          disabled={saving}
          aria-label="추가 지시사항"
          placeholder="예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조..."
          className="min-h-[60px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-[12px] leading-relaxed outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
        />
      </div>

      </div>

      {/* Generate footer — 하단 고정 CTA */}
      <div className="mt-2.5 w-full shrink-0 border-t border-slate-100 pt-2.5">
        <Button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="h-9 w-full rounded-lg bg-blue-600 px-3 text-[13px] font-bold hover:bg-blue-700"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wand2 className="size-4" />
          )}
          웹툰 생성
          {countChip}
          <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
            {total.toLocaleString("ko-KR")} 크레딧
          </span>
        </Button>
      </div>
    </div>
  );
}
