"use client";

import { useEffect, useRef, useState } from "react";
import {
  GraduationCap,
  Loader2,
  Download,
  ShoppingBasket,
  ChevronDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { Pagination } from "@/components/workbench/shared/pagination";
import type { ExamPassage, ExamPassagePick } from "@/lib/exam-passages/types";
import type {
  ExamPassageWebtoonAssetSummary,
  ExamPassageWebtoonAvailabilityResponse,
} from "@/lib/exam-passages/webtoon-assets";
import { useExamPassageLibrary } from "./use-exam-passage-library";
import { ExamFilterBar } from "./exam-filter-bar";
import { ExamPassageCard } from "./exam-passage-card";
import { ExamPaperCard } from "./exam-paper-card";
import { ExamPassagePreviewModal } from "./exam-passage-preview-modal";
import { ExamPassageWebtoonModal } from "./exam-passage-webtoon-modal";

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
  /** 웹툰 생성 화면에서만: 승인된 기출 웹툰 미리보기/다운로드를 노출한다. */
  enableWebtoonDownloads?: boolean;
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
  enableWebtoonDownloads = false,
}: ExamPassageLibraryProps) {
  const api = useExamPassageLibrary();
  const [preview, setPreview] = useState<ExamPassage | null>(null);
  const [webtoonPreview, setWebtoonPreview] = useState<ExamPassage | null>(null);
  const [webtoonAssetsByPassageId, setWebtoonAssetsByPassageId] = useState<
    Record<string, ExamPassageWebtoonAssetSummary[]>
  >({});
  const [picking, setPicking] = useState(false);
  // 모바일 하단 고정 장바구니 펼침 상태(내 지문함·워크스페이스 장바구니와 동형).
  const [cartOpen, setCartOpen] = useState(false);
  // 비활(처럼 보이는) 담기 버튼을 눌렀을 때 어디를 골라야 하는지 카드들을 글로우.
  const bodyRef = useRef<HTMLDivElement>(null);

  // 페이지 넘김 시 스크롤 영역 맨 위(첫 카드)로 부드럽게 되돌린다.
  const handleGoToPage = (next: number) => {
    api.setPage(next);
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

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

  useEffect(() => {
    if (!enableWebtoonDownloads || !api.browsingProblems || api.items.length === 0) {
      if (!enableWebtoonDownloads) setWebtoonAssetsByPassageId({});
      return;
    }
    const ids = api.items.map((item) => item.id).join(",");
    let cancelled = false;
    fetch(`/api/exam-passages/webtoons?ids=${encodeURIComponent(ids)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("기출 웹툰 정보를 불러오지 못했습니다.");
        return (await res.json()) as ExamPassageWebtoonAvailabilityResponse;
      })
      .then((data) => {
        if (!cancelled && data.ok) {
          setWebtoonAssetsByPassageId((prev) => ({ ...prev, ...data.byPassageId }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWebtoonAssetsByPassageId({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enableWebtoonDownloads, api.browsingProblems, api.items]);

  const handleAssetUpdated = (asset: ExamPassageWebtoonAssetSummary) => {
    setWebtoonAssetsByPassageId((prev) => {
      const current = prev[asset.examPassageId] ?? [];
      const next = current.some((item) => item.id === asset.id)
        ? current.map((item) => (item.id === asset.id ? asset : item))
        : [...current, asset];
      return { ...prev, [asset.examPassageId]: next };
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <ExamFilterBar api={api} />

      {/* 본문 — 스크롤 영역 */}
      <div
        ref={bodyRef}
        className={
          "min-h-0 flex-1 overflow-y-auto px-3 py-3" +
          // 하단 고정 바(장바구니 + 담기 버튼)에 마지막 카드가 가리지 않게 여백 예약.
          (mobileFixedFooter ? " max-lg:!pb-32" : "")
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
                    webtoonAssets={webtoonAssetsByPassageId[p.id] ?? []}
                    onPreviewWebtoon={
                      enableWebtoonDownloads ? setWebtoonPreview : undefined
                    }
                  />
                ))}
              </div>
              <Pagination
                page={api.page}
                totalPages={api.totalPages}
                onGoToPage={handleGoToPage}
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
              onGoToPage={handleGoToPage}
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
        {/* 모바일 하단 고정 장바구니 — 내 지문함·워크스페이스 장바구니와 동형.
            담기 버튼 위에 얹혀, 담은 지문을 펼쳐 보고 하나씩 뺄 수 있다.
            mobileFixedFooter(문제 생성 스텝 플로우)일 때만, <lg 에서만 노출. */}
        {mobileFixedFooter ? (
          <div className="mb-2 lg:hidden">
            {cartOpen && api.selectedRecords.length > 0 ? (
              <div className="mb-2 flex max-h-[38vh] min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {api.selectedRecords.map((r, i) => (
                    <div
                      key={r.id}
                      className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
                    >
                      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                        {examCartLabel(r)}
                      </span>
                      <button
                        type="button"
                        onClick={() => api.toggleSelect(r.id)}
                        aria-label="담기에서 빼기"
                        className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setCartOpen((open) => !open)}
              aria-expanded={cartOpen}
              aria-label={
                cartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"
              }
              className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left"
            >
              <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ShoppingBasket className="size-5" aria-hidden="true" />
                {api.selectedCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
                    {api.selectedCount}
                  </span>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12.5px] font-bold text-slate-900">
                  담긴 지문 {api.selectedCount}개
                </span>
                <span className="truncate text-[10.5px] text-slate-400">
                  {api.selectedCount > 0
                    ? "탭하여 담긴 지문 보기·빼기"
                    : "지문 카드를 선택하면 여기 모여요"}
                </span>
              </span>
              <ChevronDown
                className={
                  "size-4 shrink-0 text-slate-400 transition-transform" +
                  (cartOpen ? " rotate-180" : "")
                }
                aria-hidden="true"
              />
            </button>
          </div>
        ) : null}
        {api.selectedCount > 0 ? (
          <div
            className={
              "mb-1.5 flex items-center justify-between gap-2 text-[12.5px] text-slate-600" +
              // 모바일은 위 장바구니 바가 대신하므로 이 요약 줄은 PC 에서만.
              (mobileFixedFooter ? " max-lg:hidden" : "")
            }
          >
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
      <ExamPassageWebtoonModal
        passage={webtoonPreview}
        assets={
          webtoonPreview ? (webtoonAssetsByPassageId[webtoonPreview.id] ?? []) : []
        }
        onClose={() => setWebtoonPreview(null)}
        onAssetUpdated={handleAssetUpdated}
      />
    </div>
  );
}

/** 장바구니 한 줄 라벨 — "2027 6월 32번" 처럼 연도·회차·문항번호로 간결히. */
function examCartLabel(r: ExamPassage): string {
  const q = r.qNumbers.length > 0 ? `${r.qNumbers.join("·")}번` : "";
  return [r.year, r.exam, q].filter(Boolean).join(" ") || "기출 지문";
}
