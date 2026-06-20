"use client";

import { useState } from "react";
import { GraduationCap, Loader2, CheckSquare, Square, Download } from "lucide-react";
import { toast } from "sonner";

import { Pagination } from "@/components/workbench/shared/pagination";
import type { ExamPassage, ExamPassagePick } from "@/lib/exam-passages/types";
import { useExamPassageLibrary } from "./use-exam-passage-library";
import { ExamFilterBar } from "./exam-filter-bar";
import { ExamPassageCard } from "./exam-passage-card";
import { ExamPassagePreviewModal } from "./exam-passage-preview-modal";

export interface ExamPassageLibraryProps {
  /**
   * 선택한 지문을 호스트로 넘긴다(불러오기). 호스트가 내 지문함 등록 / 입력 스택 행
   * 추가 등 자기 경로로 처리한다. false 를 반환하면 선택을 유지(실패).
   */
  onPick: (picks: ExamPassagePick[]) => boolean | void | Promise<boolean | void>;
  /** 불러오기 버튼 라벨(기본 "내 지문함에 담기"). */
  pickLabel?: string;
  /** 호스트가 지속 처리 중일 때 true(버튼 비활성·스피너). */
  busy?: boolean;
  /** 상단 안내 문구. */
  headerHint?: string;
}

/**
 * 수능·모평 영어 기출 지문 라이브러리 브라우저(공유).
 * 문제생성(탭) / 학습지생성·웹툰(모달)에서 동일 컴포넌트로 마운트되고,
 * onPick 으로 호스트별 로딩 경로(내 지문함 등록 / 입력 스택 행)를 위임한다.
 */
export function ExamPassageLibrary({
  onPick,
  pickLabel = "내 지문함에 담기",
  busy = false,
  headerHint,
}: ExamPassageLibraryProps) {
  const api = useExamPassageLibrary();
  const [preview, setPreview] = useState<ExamPassage | null>(null);
  const [picking, setPicking] = useState(false);

  const handlePick = async () => {
    if (api.selectedCount === 0 || picking || busy) return;
    setPicking(true);
    try {
      const requested = api.selectedCount;
      const picks = await api.collectSelectedPicks();
      if (picks.length === 0) return;
      // 일부 선택분의 본문을 해석하지 못했으면(코퍼스 미스 등) 가져온 것만 진행하고 알린다.
      if (picks.length < requested) {
        toast.info(
          `${requested}개 중 ${picks.length}개만 불러옵니다. 나머지는 잠시 후 다시 시도해주세요.`,
        );
      }
      const result = await onPick(picks);
      if (result !== false) api.clearSelection();
    } finally {
      setPicking(false);
    }
  };

  const working = picking || busy;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <ExamFilterBar api={api} />

      {/* 결과 헤더 */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-1.5">
        <span className="text-[11.5px] font-medium text-slate-500">
          {api.loading ? (
            "불러오는 중…"
          ) : (
            <>
              <span className="font-bold text-slate-700">
                {api.total.toLocaleString()}
              </span>
              개 기출 지문
              {headerHint ? (
                <span className="ml-1.5 text-slate-400">· {headerHint}</span>
              ) : null}
            </>
          )}
        </span>
        {api.items.length > 0 ? (
          <button
            type="button"
            onClick={api.toggleSelectPage}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {api.pageAllSelected ? (
              <CheckSquare className="size-3.5 text-blue-600" />
            ) : (
              <Square className="size-3.5" />
            )}
            이 페이지 전체
          </button>
        ) : null}
      </div>

      {/* 본문 — 스크롤 영역 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {api.loading ? (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[148px] animate-pulse rounded-xl border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : api.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              {api.error}
            </p>
            <p className="text-[11.5px] text-slate-400">
              잠시 후 다시 시도해주세요.
            </p>
          </div>
        ) : api.items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <GraduationCap className="size-6" />
            </span>
            <p className="text-[13px] font-semibold text-slate-600">
              조건에 맞는 기출 지문이 없습니다
            </p>
            <p className="text-[11.5px] leading-relaxed text-slate-400">
              검색어나 필터를 바꿔보세요.
              {api.activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={api.clearFilters}
                  className="ml-1 font-semibold text-blue-600 hover:underline"
                >
                  필터 초기화
                </button>
              ) : null}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
              {api.items.map((p) => (
                <ExamPassageCard
                  key={p.id}
                  passage={p}
                  selected={api.isSelected(p.id)}
                  onToggle={api.toggleSelect}
                  onPreview={setPreview}
                />
              ))}
            </div>
            <Pagination
              page={api.page}
              totalPages={api.totalPages}
              onGoToPage={api.setPage}
            />
          </>
        )}
      </div>

      {/* 선택 바 — 페이지·필터 넘나들어 누적 */}
      {api.selectedCount > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2.5 shadow-[0_-3px_10px_rgba(15,23,42,0.05)]">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-slate-600">
            <span className="font-bold text-blue-700">
              {api.selectedCount}개
            </span>
            선택됨
            <button
              type="button"
              onClick={api.clearSelection}
              className="rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              선택 해제
            </button>
          </div>
          <button
            type="button"
            onClick={handlePick}
            disabled={working}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {working ? "담는 중…" : `${pickLabel} (${api.selectedCount})`}
          </button>
        </div>
      ) : null}

      <ExamPassagePreviewModal
        passage={preview}
        selected={preview ? api.isSelected(preview.id) : false}
        onToggleSelect={api.toggleSelect}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
