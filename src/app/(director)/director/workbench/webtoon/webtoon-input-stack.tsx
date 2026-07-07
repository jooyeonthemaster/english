"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Check, FilePen, Palette, Plus } from "lucide-react";
import { PassageInputRow } from "@/components/workbench/passage-registration/passage-input/passage-input-row";
import {
  isPristineEmptyRow,
  makeEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow as RowData,
} from "@/components/workbench/passage-registration/passage-input/types";
import type { WebtoonImagePlanId } from "@/lib/webtoon-models";
import {
  styleLabel,
  WEBTOON_LANGUAGES,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "./webtoon-page-types";
import { WebtoonOptionsModal } from "./webtoon-options-modal";

export interface WebtoonRowOptions {
  plan: WebtoonImagePlanId;
  style: WebtoonStyleId;
  language: WebtoonLanguageId;
  customPrompt: string;
}

interface WebtoonInputStackProps {
  rows: RowData[];
  setRows: Dispatch<SetStateAction<RowData[]>>;
  /** True while the parent is persisting a passage + queuing a webtoon. */
  saving: boolean;

  // 직전 선택을 기억하는 공유 기본값 — 카드별 모달이 이 값을 시드로 쓴다.
  plan: WebtoonImagePlanId;
  setPlan: (p: WebtoonImagePlanId) => void;
  style: WebtoonStyleId;
  setStyle: (s: WebtoonStyleId) => void;
  language: WebtoonLanguageId;
  setLanguage: (l: WebtoonLanguageId) => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;

  /** 이 지문 하나로 웹툰을 큐잉한다. 성공하면 true. (PC 즉시 생성 경로) */
  onGenerateRow: (
    localId: string,
    opts: WebtoonRowOptions,
  ) => Promise<boolean>;

  /** '지문 추가' → 빈 입력창 대신 내 지문함으로 이동해 지문을 골라 담는다. */
  onAddPassage: () => void;

  // ── 모바일 스텝 플로우(<lg 전용) — PC 무영향 ──
  /**
   * 모바일이면 카드별 모달이 '즉시 생성' 대신 '유형 담기'로 동작한다. 담긴 유형은
   * 워크스페이스 하단 '웹툰 N개 생성'에서 한 번에 생성된다(문제 생성과 동형).
   */
  isMobile?: boolean;
  /** 유형이 담긴(설정 완료) 행 localId 집합 — 카드에 담김 배지를 표시한다. */
  configuredRowIds?: Set<string>;
  /** 담긴 유형 요약(모바일 카드 배지용) — localId → 옵션. */
  rowOptions?: Record<string, WebtoonRowOptions>;
  /** 모바일: 이 지문에 유형을 담는다(생성하지 않음). */
  onSaveRowOptions?: (localId: string, opts: WebtoonRowOptions) => void;
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
  plan,
  setPlan,
  style,
  setStyle,
  language,
  setLanguage,
  customPrompt,
  setCustomPrompt,
  onGenerateRow,
  onAddPassage,
  isMobile = false,
  configuredRowIds,
  rowOptions,
  onSaveRowOptions,
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

      {/* 모바일/좁은 화면(<xl)은 flex-col 로 카드를 자연 높이로 쌓는다 — CSS grid
          1열에서는 카드의 overflow-hidden 때문에 트랙이 에디터 높이(300px)로 잘못
          계산돼 카드(422px)가 다음 카드를 침범(중첩)했다. 넓은 화면(xl≥)만 2열 grid. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 xl:grid xl:grid-cols-2 xl:content-start xl:items-start">
        {/* Rows — 각 카드 아래 전용 '다음으로 (웹툰 유형 선택)' 버튼.
            화면이 넓으면(xl≥) 문제 생성 워크스페이스처럼 2열로 배치한다. */}
          {rows.map((row, i) => {
            const canGenerate =
              row.content.trim().length >= MIN_CONTENT_CHARS && !saving;
            const configured = !!configuredRowIds?.has(row.localId);
            const opts = rowOptions?.[row.localId];
            return (
              <div
                key={row.localId}
                data-webtoon-row={row.localId}
                className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
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
                  hideWordCount
                />
                {/* 푸터: 이 지문 전용 유형 선택.
                    PC(즉시 생성): '다음으로 (웹툰 유형 선택)'.
                    모바일(담기): '유형 선택하고 지문 담기' → 담기면 '유형 담김'
                    상태(수정 가능)로 바뀌고, 하단 바 '웹툰 N개 생성'이 일괄 생성한다. */}
                <div className="border-t border-slate-100 bg-slate-50/50 p-2">
                  {isMobile && configured ? (
                    <button
                      type="button"
                      data-webtoon-configure-button={row.localId}
                      disabled={!canGenerate}
                      onClick={() => {
                        // 담긴 유형을 모달에 다시 시드해 그대로 수정할 수 있게 한다.
                        if (opts) {
                          setPlan(opts.plan);
                          setStyle(opts.style);
                          setLanguage(opts.language);
                          setCustomPrompt(opts.customPrompt);
                        }
                        setSettingsRowId(row.localId);
                      }}
                      title="담긴 유형을 수정합니다"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[13px] font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        유형 담김
                        {opts
                          ? ` · ${styleLabel(opts.style)} · ${
                              WEBTOON_LANGUAGES.find(
                                (l) => l.id === opts.language,
                              )?.short ?? ""
                            }`
                          : ""}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-blue-400">
                        수정
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-webtoon-configure-button={row.localId}
                      disabled={!canGenerate}
                      onClick={() => setSettingsRowId(row.localId)}
                      title={
                        isMobile
                          ? "이 지문의 화풍·대사 언어를 골라 담습니다"
                          : "이 지문의 화풍·대사 언어를 설정하고 웹툰을 생성합니다"
                      }
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {isMobile
                          ? "유형 선택하고 지문 담기"
                          : "다음으로 (웹툰 유형 선택)"}
                      </span>
                    </button>
                  )}
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

          {/* 모바일 하단 고정 바(스텝 네비 + 장바구니) 높이만큼 워크스페이스 내부에
              여백을 예약한다 — 마지막 카드의 '유형 담기' 버튼이 고정 바 뒤로 가려지지
              않도록. PC 는 고정 바가 없으므로 렌더하지 않는다(무영향). */}
          {isMobile ? (
            <div aria-hidden className="col-span-full h-[150px] shrink-0" />
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
          plan={plan}
          setPlan={setPlan}
          style={style}
          setStyle={setStyle}
          language={language}
          setLanguage={setLanguage}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          confirmMode={isMobile ? "save" : "generate"}
          onConfirm={() => {
            const opts = { plan, style, language, customPrompt };
            // 모바일: 즉시 생성하지 않고 이 지문에 유형을 담는다(하단 바에서 일괄 생성).
            if (isMobile && onSaveRowOptions) {
              onSaveRowOptions(settingsRow.localId, opts);
              return Promise.resolve(true);
            }
            // PC: 기존대로 이 지문 하나로 즉시 생성.
            return onGenerateRow(settingsRow.localId, opts);
          }}
        />
      ) : null}
    </div>
  );
}
