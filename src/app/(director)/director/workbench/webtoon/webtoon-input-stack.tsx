"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Palette, Plus } from "lucide-react";
import { PassageInputRow } from "@/components/workbench/passage-registration/passage-input/passage-input-row";
import {
  isPristineEmptyRow,
  makeEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow as RowData,
} from "@/components/workbench/passage-registration/passage-input/types";
import type {
  WebtoonStyleId,
  WebtoonLanguageId,
} from "./webtoon-page-types";
import { WebtoonOptionsModal } from "./webtoon-options-modal";

interface WebtoonInputStackProps {
  rows: RowData[];
  setRows: Dispatch<SetStateAction<RowData[]>>;
  /** True while the parent is persisting a passage + queuing a webtoon. */
  saving: boolean;

  // 직전 선택을 기억하는 공유 기본값 — 카드별 모달이 이 값을 시드로 쓴다.
  style: WebtoonStyleId;
  setStyle: (s: WebtoonStyleId) => void;
  language: WebtoonLanguageId;
  setLanguage: (l: WebtoonLanguageId) => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;

  /** 이 지문 하나로 웹툰을 큐잉한다. 성공하면 true. */
  onGenerateRow: (
    localId: string,
    opts: {
      style: WebtoonStyleId;
      language: WebtoonLanguageId;
      customPrompt: string;
    },
  ) => Promise<boolean>;
}

/** 본문 앞부분을 한 줄 미리보기로 자른다(모달 헤더용). */
function previewOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? flat.slice(0, 120) + "…" : flat;
}

/**
 * 웹툰 생성 페이지의 우측 "지문" 패널. 학습지 생성의 PassageInputRow 편집기를 그대로
 * 재사용하되, 문제 생성 워크스페이스처럼 각 지문 카드 아래 "다음으로 (웹툰 유형 선택)"
 * 버튼을 둔다. 누르면 이 지문 전용 모달이 열려 화풍·대사 언어·추가 지시를 설정하고
 * 그 지문 하나로 바로 웹툰을 생성한다.
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
  onGenerateRow,
}: WebtoonInputStackProps) {
  // 현재 설정 모달이 열린 행 localId (없으면 null).
  const [settingsRowId, setSettingsRowId] = useState<string | null>(null);
  const settingsRow = useMemo(
    () => rows.find((r) => r.localId === settingsRowId) ?? null,
    [rows, settingsRowId],
  );

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5">
        {/* Intro */}
        <div className="mb-2">
          <p className="text-[12px] leading-relaxed text-slate-500">
            왼쪽 <b className="text-slate-600">내 지문함</b>에서 지문을 체크해{" "}
            <b className="text-blue-600">불러오거나</b>, 여기에 영어 지문을 직접
            붙여넣으세요. 각 지문 아래{" "}
            <b className="text-blue-600">“다음으로 (웹툰 유형 선택)”</b> 버튼으로
            지문마다 화풍·대사 언어를 정해 한 장의 세로형 웹툰을 생성합니다.
          </p>
        </div>

        {/* Rows — 각 카드 아래 전용 '다음으로 (웹툰 유형 선택)' 버튼.
            화면이 넓으면(xl≥) 문제 생성 워크스페이스처럼 2열로 배치한다. */}
        <div className="grid grid-cols-1 items-start gap-2.5 xl:grid-cols-2">
          {rows.map((row, i) => {
            const canGenerate =
              row.content.trim().length >= MIN_CONTENT_CHARS && !saving;
            return (
              <div
                key={row.localId}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <PassageInputRow
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
                  disableMarking
                />
                {/* 푸터: 이 지문 전용 '다음으로 (웹툰 유형 선택)' */}
                <div className="border-t border-slate-100 bg-slate-50/50 p-2">
                  <button
                    type="button"
                    disabled={!canGenerate}
                    onClick={() => setSettingsRowId(row.localId)}
                    title="이 지문의 화풍·대사 언어를 설정하고 웹툰을 생성합니다"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>다음으로 (웹툰 유형 선택)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 지문 추가 — 기출 지문은 상단 "기출 지문" 탭에서 내 지문함으로 담는다. */}
        <div className="shrink-0 space-y-2 pt-2">
          <button
            type="button"
            onClick={addRow}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 py-2.5 text-[13px] font-bold text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100/70 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            빈 지문 추가
          </button>
        </div>
      </div>

      {/* 지문 카드별 웹툰 유형 선택 모달 */}
      {settingsRow ? (
        <WebtoonOptionsModal
          open={!!settingsRow}
          onOpenChange={(v) => {
            if (!v) setSettingsRowId(null);
          }}
          passageTitle={settingsRow.title.trim()}
          passagePreview={previewOf(settingsRow.content)}
          style={style}
          setStyle={setStyle}
          language={language}
          setLanguage={setLanguage}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          onConfirm={() =>
            onGenerateRow(settingsRow.localId, { style, language, customPrompt })
          }
        />
      ) : null}
    </div>
  );
}
