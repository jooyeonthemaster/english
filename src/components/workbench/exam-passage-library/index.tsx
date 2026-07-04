"use client";

import { useRef, useState } from "react";
import { GraduationCap, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { Pagination } from "@/components/workbench/shared/pagination";
import type { ExamPassage, ExamPassagePick } from "@/lib/exam-passages/types";
import { useExamPassageLibrary } from "./use-exam-passage-library";
import { ExamFilterBar } from "./exam-filter-bar";
import { ExamPassageCard } from "./exam-passage-card";
import { ExamPaperCard } from "./exam-paper-card";
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
  /**
   * 모바일(<lg)에서 하단 선택 바를 화면 맨 아래 고정한다(문제 생성 스텝 플로우).
   * 이때 호스트는 공용 스텝 네비를 숨겨야 중복되지 않는다. PC 는 영향 없음.
   */
  mobileFixedFooter?: boolean;
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
  mobileFixedFooter = false,
}: ExamPassageLibraryProps) {
  const api = useExamPassageLibrary();
  const [preview, setPreview] = useState<ExamPassage | null>(null);
  const [picking, setPicking] = useState(false);
  // 비활(처럼 보이는) 담기 버튼을 눌렀을 때 어디를 골라야 하는지 카드들을 글로우.
  const bodyRef = useRef<HTMLDivElement>(null);

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

      {/* 본문 — 스크롤 영역 */}
      <div
        ref={bodyRef}
        className={
          "min-h-0 flex-1 overflow-y-auto px-3 py-3" +
          // 하단 고정 바에 마지막 카드가 가리지 않게 모바일 여백 예약.
          (mobileFixedFooter ? " max-lg:pb-24" : "")
        }
      >
        {api.loading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
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
        ) : api.browsingProblems ? (
          api.items.length === 0 ? (
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
              <div className="grid grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
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
          )
        ) : api.papers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <GraduationCap className="size-6" />
            </span>
            <p className="text-[13px] font-semibold text-slate-600">
              조건에 맞는 시험지가 없습니다
            </p>
            <p className="text-[11.5px] leading-relaxed text-slate-400">
              연도·회차 필터를 바꿔보세요.
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
            <div className="grid grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
              {api.papers.map((paper) => (
                <ExamPaperCard
                  key={paper.examId}
                  paper={paper}
                  onOpen={(p) => api.drillIntoPaper(p.examId, p.title)}
                  selected={api.isPaperSelected(paper.examId)}
                  onToggleSelect={api.togglePaper}
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

      {/* 선택 바 — 상시 노출. 가로로 긴 담기 버튼, 하나라도 고르면 활성화.
          mobileFixedFooter 면 모바일에서 화면 맨 아래 고정(스텝 플로우). */}
      <div
        className={
          "shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 shadow-[0_-3px_10px_rgba(15,23,42,0.05)]" +
          (mobileFixedFooter
            ? " max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:pb-[calc(env(safe-area-inset-bottom)+0.625rem)] max-lg:shadow-[0_-6px_20px_-10px_rgba(15,23,42,0.28)]"
            : "")
        }
      >
        {api.selectedCount > 0 ? (
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px] text-slate-600">
            <span>
              <span className="font-bold text-blue-700">
                {api.selectedCount}개
              </span>{" "}
              선택됨
            </span>
            <button
              type="button"
              onClick={api.clearSelection}
              className="rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              선택 해제
            </button>
          </div>
        ) : null}
        <button
          type="button"
          aria-disabled={working || api.selectedCount === 0}
          onClick={() => {
            if (working) return;
            // 아무것도 안 골랐으면 → 막지 말고 어디를 골라야 하는지 카드 글로우.
            if (api.selectedCount === 0) {
              triggerHintGlowWithin(bodyRef.current, "[data-exam-card]");
              return;
            }
            handlePick();
          }}
          className={
            "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-[13px] font-bold shadow-sm transition " +
            (working || api.selectedCount === 0
              ? "bg-slate-200 text-slate-400 shadow-none " +
                (working ? "cursor-wait" : "cursor-pointer")
              : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700")
          }
        >
          {working ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {working
            ? "담는 중…"
            : api.selectedCount > 0
              ? `${pickLabel} (${api.selectedCount})`
              : pickLabel}
        </button>
      </div>

      <ExamPassagePreviewModal
        passage={preview}
        selected={preview ? api.isSelected(preview.id) : false}
        onToggleSelect={api.toggleSelect}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
