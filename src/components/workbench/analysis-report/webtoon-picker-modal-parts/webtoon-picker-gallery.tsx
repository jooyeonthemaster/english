"use client";

import { ImageIcon, Loader2, Wand2 } from "lucide-react";
import {
  languageLabel,
  styleLabel,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";
import {
  pickWebtoonUrl,
  type TrackedItem,
  type WebtoonListItem,
} from "./webtoon-picker-utils";

/**
 * 지문 웹툰 모달의 보관함 본문 — 로딩 · 오류 · 빈 상태 · (진행 자리표시자 + 완료 카드)
 * 격자. 목록·폴링·선택 상태는 호스트(webtoon-picker-modal)가 소유하고 여기서는
 * 그리기만 한다.
 */
export function WebtoonPickerGallery({
  loading,
  error,
  visible,
  activeTracking,
  scoped,
  etaLabel,
  pickLabel,
  onRetry,
  onGoGenerate,
  onPick,
  onRatio,
}: {
  loading: boolean;
  error: string | null;
  /** 지금 보여 줄 완료 웹툰(이 지문 전용 목록 또는 전체 목록). */
  visible: WebtoonListItem[];
  activeTracking: TrackedItem[];
  /** "이 지문만" 스코프 여부 — 빈 상태 문구만 바꾼다. */
  scoped: boolean;
  /** 진행 배너에 쓰는 예상 소요 시간(등급별 etaLabel). */
  etaLabel: string;
  pickLabel?: string;
  onRetry: () => void;
  onGoGenerate: () => void;
  onPick: (it: WebtoonListItem) => void;
  /** 썸네일이 로드되면 세로/가로 비율을 알린다(삽입 시 비율 재디코드 생략). */
  onRatio: (id: string, ratio: number) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
      {loading && visible.length === 0 && activeTracking.length === 0 ? (
        <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">웹툰을 불러오는 중...</span>
        </div>
      ) : error && visible.length === 0 && activeTracking.length === 0 ? (
        // 보여줄 콘텐츠가 전혀 없을 때만 전체 에러 패널. 폴링 중 일시적 새로고침
        // 실패가 진행 중/완료 썸네일을 가리지 않도록 한다(아래 인라인 배너로 표시).
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[12px] text-rose-600">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
          >
            다시 시도
          </button>
        </div>
      ) : visible.length === 0 && activeTracking.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-center">
          <ImageIcon className="h-6 w-6 text-slate-300" />
          <p className="text-[13px] text-slate-400">
            {scoped
              ? "이 지문으로 생성한 완료된 웹툰이 없습니다."
              : "완료된 웹툰이 없습니다."}
          </p>
          <button
            type="button"
            onClick={onGoGenerate}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700"
          >
            <Wand2 className="h-3.5 w-3.5" />
            지금 생성하기
          </button>
        </div>
      ) : (
        <>
          {activeTracking.length > 0 ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
              <span className="text-[11.5px] leading-relaxed text-blue-800">
                웹툰을 생성하는 중이에요 ({etaLabel}). 이 창을 닫고 다른 작업을
                계속하셔도 완료되면 여기 보관함에 표시됩니다.
              </span>
            </div>
          ) : null}
          {error ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <span className="text-[11.5px] text-rose-600">{error}</span>
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                다시 시도
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {/* 진행 중 자리표시자 */}
            {activeTracking.map((t) => (
              <div
                key={t.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-[10.5px] font-semibold">생성 중…</span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[11.5px] font-semibold text-slate-700">
                    {t.passageTitle || "웹툰"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">대기/생성 중</p>
                </div>
              </div>
            ))}
            {visible.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it)}
                className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-all hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                <div className="relative aspect-[9/16] w-full overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pickWebtoonUrl(it) as string}
                    alt={it.passage.title}
                    loading="lazy"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth > 0) {
                        onRatio(it.id, img.naturalHeight / img.naturalWidth);
                      }
                    }}
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                    {styleLabel(it.style)}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[11.5px] font-semibold text-slate-700">
                    {it.passage.title}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">
                    {languageLabel(it.language)}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                    {pickLabel ?? "문서에 삽입 →"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
