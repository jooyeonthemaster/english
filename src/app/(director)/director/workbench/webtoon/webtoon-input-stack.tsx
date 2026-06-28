"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { FilePen, Palette, Plus } from "lucide-react";
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

  /** '지문 추가' → 빈 입력창 대신 내 지문함으로 이동해 지문을 골라 담는다. */
  onAddPassage: () => void;
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
  onAddPassage,
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
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-slate-50/60">
      {/* 워크스페이스 헤더 — 박스 없이 하단 보더만 (문제생성·학습지 워크스페이스와
          동일 구성). */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 bg-white pl-3 pr-1.5">
        <FilePen
          className="h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <h3 className="shrink-0 text-[12.5px] font-bold text-slate-800">
          웹툰 워크스페이스
        </h3>
        <span className="min-w-0 flex-1" aria-hidden="true" />
      </div>

      <div className="grid min-h-0 flex-1 content-start grid-cols-1 items-start gap-2.5 overflow-y-auto p-3 xl:grid-cols-2">
        {/* Rows — 각 카드 아래 전용 '다음으로 (웹툰 유형 선택)' 버튼.
            화면이 넓으면(xl≥) 문제 생성 워크스페이스처럼 2열로 배치한다. */}
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
                  hideToolbar
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

          {/* 지문 추가 — 빈 입력창을 만들지 않고 내 지문함으로 이동해 지문을 골라
              담는다. 카드와 같은 그리드 셀(=카드 가로폭)에 흐른다. 버튼 디자인은
              문제생성·학습지 워크스페이스와 동일(점선·흰 배경). */}
          <button
            type="button"
            onClick={onAddPassage}
            disabled={saving}
            className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            지문 추가
          </button>

          {/* 빈 워크스페이스 안내 — 추가 버튼 아래 빈 공간 가운데에 회색 문구
              (문제생성·학습지 워크스페이스와 동일). */}
          {rows.length === 0 ? (
            <div className="col-span-full flex min-h-[320px] items-center justify-center">
              <p className="text-[13px] font-medium text-slate-400">
                지문을 먼저 선택해주세요
              </p>
            </div>
          ) : null}
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
