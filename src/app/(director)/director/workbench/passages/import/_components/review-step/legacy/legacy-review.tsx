"use client";

// ============================================================================
// LegacyReview — M1 legacy path rendering (items=0, only ResultDraft rows).
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import type { ResultDraft } from "@/lib/extraction/types";
import { LegacyEditorPanel } from "./legacy-editor-panel";
import type { LoadedPage } from "../types";

interface LegacyReviewProps {
  pages: LoadedPage[];
  drafts: ResultDraft[];
  selectedId: string | null;
  focusedPageIndex: number | null;
  onSelect: (id: string) => void;
  onFocus: (page: number) => void;
  onTitle: (v: string) => void;
  onContent: (v: string) => void;
  onDelete: () => void;
  selected: ResultDraft | null;
}

export function LegacyReview({
  pages,
  drafts,
  selectedId,
  focusedPageIndex,
  onSelect,
  onFocus,
  onTitle,
  onContent,
  onDelete,
  selected,
}: LegacyReviewProps) {
  // P1-5 — 레거시 모드로 전환되는 조건을 사용자에게 명시적으로 알린다.
  // items[] 가 0이고 ExtractionResult[] (drafts)만 있을 때 이 경로로 들어온다.
  return (
    <>
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div
          className="border-b border-sky-200 bg-sky-50/70 px-4 py-2 text-[11px] text-sky-800"
          role="status"
        >
          M1 레거시 모드로 표시 중 — 블록 단위 리뷰가 지원되지 않아 지문
          단위로만 편집합니다. (items 0개)
        </div>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-[13px] font-bold text-slate-800">
            추출된 지문
          </div>
          <div className="text-[11px] text-slate-500">
            {drafts.length}개 (레거시 모드)
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {drafts.map((d) => {
            const isSel = d.id === selectedId;
            return (
              <button
                key={d.id}
                onClick={() => onSelect(d.id)}
                className={
                  "block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
                  (isSel ? "bg-sky-50" : "hover:bg-slate-50")
                }
              >
                <div className="truncate text-[13px] font-semibold text-slate-800">
                  {d.title}
                </div>
                <div className="line-clamp-2 text-[11px] text-slate-500">
                  {d.content.slice(0, 120)}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {pages.map((p) => (
              <figure
                key={p.pageIndex}
                id={`page-${p.pageIndex}`}
                className={
                  "overflow-hidden rounded-xl border bg-white shadow-sm " +
                  (focusedPageIndex === p.pageIndex
                    ? "border-sky-400 ring-2 ring-sky-200"
                    : "border-slate-200")
                }
                onClick={() => onFocus(p.pageIndex)}
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={`페이지 ${p.pageIndex + 1}`}
                    className="block w-full"
                  />
                ) : (
                  <div className="flex h-60 items-center justify-center text-[12px] text-slate-400">
                    이미지를 불러올 수 없습니다
                  </div>
                )}
              </figure>
            ))}
          </div>
        </div>
      </main>

      <aside className="flex w-[520px] shrink-0 flex-col border-l border-slate-200 bg-white">
        {selected ? (
          <LegacyEditorPanel
            selected={selected}
            onTitle={onTitle}
            onContent={onContent}
            onDelete={onDelete}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-slate-400">
            지문을 선택해 주세요.
          </div>
        )}
      </aside>
    </>
  );
}
