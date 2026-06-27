"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createWorkbenchPassage } from "@/actions/workbench";
import { FormSection } from "@/components/workbench/passage-registration/sections/form-section";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { usePassageLibrary } from "@/components/workbench/passage-registration/use-passage-library";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
import { ExamPassageLibrary } from "@/components/workbench/exam-passage-library";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import { ExtractionDetailModal } from "@/app/(director)/director/workbench/generate/intake/extraction-detail-modal";
import { ExtractionLoadingCards } from "@/app/(director)/director/workbench/generate/intake/extraction-loading-cards";
import {
  useGenerateExtraction,
  type ExtractionPromotedResult,
} from "@/app/(director)/director/workbench/generate/intake/use-generate-extraction";
import type { PassageItem } from "@/app/(director)/director/workbench/generate/generate-page-types";
import {
  isPristineEmptyRow,
  makeRowFromSavedPassage,
  MIN_CONTENT_CHARS,
  type PassageInputRow,
} from "@/components/workbench/passage-registration/passage-input/types";
import {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import {
  DEFAULT_WEBTOON_LANGUAGE,
  type WebtoonLanguageId,
  type WebtoonStyleId,
} from "./webtoon-page-types";
import { useWebtoonState } from "./use-webtoon-state";
import { WebtoonInputStack } from "./webtoon-input-stack";
import { WebtoonLibraryClient } from "./library/library-page-client";
import type { CollectionItem } from "@/components/workbench/shared/types";

interface WebtoonPageClientProps {
  academyId: string;
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
}

/** Build a passage title from the first non-empty line of typed content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

export function WebtoonPageClient({
  academyId,
  collections: webtoonCollections,
  collectionMembership: webtoonCollectionMembership,
}: WebtoonPageClientProps) {
  // ─── 지문 입력 스택 (내 지문함에서 불러온 지문 = 행) ───
  const [rows, setRows] = useState<PassageInputRow[]>([]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // ─── '생성한 웹툰' 섹션 헤더 높이 — 임베드된 보관함의 폴더/툴바 sticky 오프셋
  //     기준점. 헤더·폴더·툴바가 한 덩어리로 상단고정되도록 높이를 측정해 내려준다. ───
  const [webtoonHeaderHeight, setWebtoonHeaderHeight] = useState(0);
  const webtoonHeaderCleanup = useRef<(() => void) | null>(null);
  const webtoonHeaderRef = useCallback((el: HTMLDivElement | null) => {
    webtoonHeaderCleanup.current?.();
    webtoonHeaderCleanup.current = null;
    if (!el) return;
    const update = () =>
      setWebtoonHeaderHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    webtoonHeaderCleanup.current = () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // ─── 웹툰 옵션 ───
  const [style, setStyle] = useState<WebtoonStyleId>("KOREAN_WEBTOON");
  const [language, setLanguage] = useState<WebtoonLanguageId>(
    DEFAULT_WEBTOON_LANGUAGE,
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // 새 웹툰을 큐잉한 뒤 임베드된 보관함(WebtoonLibraryClient)을 새로고침하는 신호.
  const [webtoonRefreshSignal, setWebtoonRefreshSignal] = useState(0);

  // ─── 폼 접기 ───
  const [formCollapsed, setFormCollapsed] = useState(false);

  // ─── 웹툰 큐 (DB 폴링) — 생성 트리거 + 상단 배지(생성 중·실패) 용도 ───
  const { items: queue, handleBatchGenerate } = useWebtoonState({ academyId });

  const queueCounts = useMemo(
    () => ({
      generating: queue.filter(
        (q) => q.status === "PENDING" || q.status === "GENERATING",
      ).length,
      done: queue.filter((q) => q.status === "COMPLETED").length,
      error: queue.filter((q) => q.status === "FAILED").length,
    }),
    [queue],
  );

  // ─── Intake (직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스) ───
  const [intakeView, setIntakeView] = useState<IntakeView>("library");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");

  // ─── 내 지문함 라이브러리 (학습지 생성과 동일한 저장 지문 intake) ───
  const showLibrary = useCallback(() => setIntakeView("library"), []);
  const library = usePassageLibrary({ academyId, onShowLibrary: showLibrary });
  const {
    passages,
    filteredPassages,
    filterOptions,
    collections,
    loadingPassages,
    passageStatusCounts,
    activeFilterCount,
    passageSearch,
    setPassageSearch,
    filterSchool,
    setFilterSchool,
    filterGrade,
    setFilterGrade,
    filterSemester,
    setFilterSemester,
    analysisStatusFilter,
    setAnalysisStatusFilter,
    passageSortOrder,
    setPassageSortOrder,
    selectedCollectionId,
    setSelectedCollectionId,
    passageBulkAction,
    selectedIds,
    setSelectedIds,
    toggleCheckbox,
    selectAll,
    deselectAll,
    freshAnalysisPassageIds,
    acknowledgeFreshAnalysisPassage,
    applyExtractionPromotion,
    pasteSaving,
    handleCreatePastedPassages,
    loadPassages,
    handleCreatePassageCollection,
    handleCopySelectedPassagesToCollection,
    handleMovePassagesToCollection,
    handleMoveSelectedPassagesToCollection,
    handleRemoveSelectedPassagesFromCollection,
    handleDeleteSelectedPassages,
  } = library;

  // ─── 워크스페이스 (지문 입력 스택) — 자료함 위 오버레이 ───
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceActive = useMemo(
    () => rows.some((r) => !isPristineEmptyRow(r)),
    [rows],
  );
  // 워크스페이스에 이미 담긴 Passage id — 내 지문함 카드 '담김' 표시.
  const workspacePassageIds = useMemo(
    () =>
      new Set(
        rows
          .map((r) => r.passageId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    [rows],
  );

  // ─── Load saved passages on mount ───
  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // ─── 내 지문함 선택 → 워크스페이스로 불러오기 ───
  // 저장된 Passage 를 입력 스택에 행으로 담는다. passageId 를 함께 실어, 웹툰
  // 생성 시 그 Passage 를 재사용(중복 생성 방지)한다.
  const handleLoadSelectedToWorkspace = useCallback(() => {
    const selected = passages.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast.error("'내 지문함'에서 워크스페이스로 보낼 지문을 먼저 선택하세요.");
      return;
    }
    const prev = rowsRef.current;
    const existing = new Set(
      prev.map((r) => r.passageId).filter((id): id is string => !!id),
    );
    const incoming = selected
      .filter((p) => !existing.has(p.id))
      .map((p) =>
        makeRowFromSavedPassage({
          passageId: p.id,
          title: p.title,
          content: formatExtractedTextForDisplay(p.content),
          source: p.source ?? null,
          collapsed: false,
        }),
      );
    if (incoming.length === 0) {
      toast.info("선택한 지문은 이미 워크스페이스에 있습니다.");
      setWorkspaceOpen(true);
      return;
    }
    const wasActive = prev.some((r) => !isPristineEmptyRow(r));
    const base = prev.length === 1 && isPristineEmptyRow(prev[0]) ? [] : prev;
    const next = [...base, ...incoming];
    rowsRef.current = next;
    setRows(next);
    setSelectedIds(new Set());
    setWorkspaceOpen(true);
    setFormCollapsed(false);
    toast.success(
      (wasActive
        ? `지문 ${incoming.length}개를 워크스페이스에 추가했어요.`
        : `지문 ${incoming.length}개를 워크스페이스에 담았어요.`) +
        " 화풍·언어를 설정해 웹툰을 생성하세요.",
    );
  }, [passages, selectedIds, setSelectedIds]);

  // ── 수능·모평 기출 지문 → 내 지문함 일괄 등록 (문제생성과 동일 메커니즘) ──
  // 등록 후 목록 재조회 → 새 지문 선택 → 내 지문함(library) 뷰로 전환. 이어서 왼쪽
  // 내 지문함에서 '불러오기'로 워크스페이스(지문 입력 스택)에 담아 웹툰을 만든다.
  const [examImporting, setExamImporting] = useState(false);
  const handleImportExamPassages = useCallback(
    async (picks: ExamPassagePick[]) => {
      if (!picks || picks.length === 0) return false;
      setExamImporting(true);
      try {
        const { importExamPassages } = await import("@/actions/workbench");
        const result = await importExamPassages(picks.map((p) => p.id));
        if (!result.success) {
          toast.error(result.error || "기출 지문 등록에 실패했습니다.");
          return false;
        }
        const created = result.createdIds;
        const skipped = result.skippedExamIds.length;

        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");

        if (created.length > 0) {
          setSelectedIds(new Set(created));
          setIntakeView("library");
          toast.success(
            skipped > 0
              ? `기출 지문 ${created.length}개를 내 지문함에 담았어요. (이미 등록된 ${skipped}개 제외)`
              : `기출 지문 ${created.length}개를 내 지문함에 담았어요.`,
          );
        } else if (skipped > 0) {
          setIntakeView("library");
          toast.info("선택한 기출 지문은 이미 내 지문함에 있어요.");
        }
        return true;
      } catch {
        toast.error("기출 지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setExamImporting(false);
      }
    },
    [
      loadPassages,
      setPassageSearch,
      setSelectedCollectionId,
      setAnalysisStatusFilter,
      setSelectedIds,
    ],
  );

  const { triggerRefresh, setScope } = useTaskQueue();

  // ─── Extraction (이미지·PDF) — 학습지와 동일하게 자동 승격 후 내 지문함 반영 ───
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({ passageIds, jobId, complete }: ExtractionPromotedResult) => {
      applyExtractionPromotion(passageIds);
      void loadPassages().then(() => {
        if (complete) clearExtractionPendingRef.current(jobId);
      });
      toast.success(
        complete
          ? "추출된 지문이 '내 지문함'에 추가됐어요. 선택해 워크스페이스로 보내세요."
          : "일부 지문이 '내 지문함'에 추가됐어요. 나머지는 계속 처리 중입니다.",
      );
    },
    [applyExtractionPromotion, loadPassages],
  );

  const {
    beginJob: beginExtractionJob,
    attachJob: attachExtractionJob,
    failJob: failExtractionJob,
    clearPending: clearExtractionPending,
    pending: extractionPending,
  } = useGenerateExtraction({ onPromoted: handleExtractionPromoted });
  useEffect(() => {
    clearExtractionPendingRef.current = clearExtractionPending;
  }, [clearExtractionPending]);

  const handleExtractionBegin = useCallback(
    (id: string, count: number) => {
      beginExtractionJob(id, count);
      setIntakeView("library");
      setScope("extraction");
    },
    [beginExtractionJob, setScope],
  );
  const handleExtractionResult = useCallback(
    (id: string, jobId: string | null) => {
      if (jobId) {
        attachExtractionJob(id, jobId);
        triggerRefresh();
      } else {
        failExtractionJob(id);
      }
    },
    [attachExtractionJob, failExtractionJob, triggerRefresh],
  );

  // ─── 카드 '상세 보기' → 지문 상세 모달 ───
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  // 방금 상세를 열어본 지문 id — 모달을 닫아도 유지해, 닫는 순간 카드를 한 번 반짝인다.
  const [lastViewedPassageId, setLastViewedPassageId] = useState<string | null>(
    null,
  );
  const handleViewPassageContent = useCallback((passage: PassageItem) => {
    setDetailPassage(passage);
    setLastViewedPassageId(passage.id);
  }, []);
  const openDetailById = useCallback(
    (passageId: string) => {
      const p = passages.find((x) => x.id === passageId);
      if (p) {
        setDetailPassage(p);
        setLastViewedPassageId(p.id);
      }
    },
    [passages],
  );

  // ─── 웹툰 생성 액션: 지문 카드 1개 → Passage 저장(또는 재사용) → 웹툰 큐잉 ───
  // 문제 생성 워크스페이스처럼 각 지문이 자기 설정(화풍·언어·지시)으로 따로 생성된다.
  const handleGenerateRow = useCallback(
    async (
      localId: string,
      opts: {
        style: WebtoonStyleId;
        language: WebtoonLanguageId;
        customPrompt: string;
      },
    ): Promise<boolean> => {
      const row = rowsRef.current.find((r) => r.localId === localId);
      if (!row) return false;
      const text = row.content.trim();
      if (text.length < MIN_CONTENT_CHARS) {
        toast.error(`지문을 ${MIN_CONTENT_CHARS}자 이상 입력해주세요.`);
        return false;
      }
      if (generating) return false;
      setGenerating(true);

      try {
        const title = row.title.trim() || derivePastedTitle(text);
        // 내 지문함에서 불러온 행은 이미 저장된 Passage 이므로 재사용한다.
        let passageId = row.passageId;
        if (!passageId) {
          const result = await createWorkbenchPassage({
            title,
            content: text,
            source: row.source?.trim() || undefined,
            sourceDraftId: row.sourceDraftId ?? undefined,
          });
          if (!result.success || !result.id) {
            toast.error(result.error || "지문 등록에 실패했습니다.");
            return false;
          }
          passageId = result.id;
        }

        const queued = await handleBatchGenerate(
          [{ id: passageId, title, content: text }],
          opts.style,
          opts.customPrompt,
          opts.language,
        );
        // 큐잉이 성공했을 때만 이 행을 워크스페이스에서 비운다. 실패하면
        // (네트워크/크레딧 부족 등) 작성한 지문을 보존해 바로 재시도할 수 있게 한다.
        if (queued > 0) {
          const next = rowsRef.current.filter((r) => r.localId !== localId);
          rowsRef.current = next;
          setRows(next);
          if (next.length === 0) {
            setWorkspaceOpen(false);
            setIntakeView("library");
          }
          void loadPassages();
          triggerRefresh();
          setWebtoonRefreshSignal((n) => n + 1);
          return true;
        }
        return false;
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "웹툰 생성 중 오류가 발생했습니다.",
        );
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [generating, handleBatchGenerate, loadPassages, triggerRefresh],
  );

  return (
    <TooltipProvider>
      <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
        <main className="flex w-full min-w-0 flex-col gap-4">
          {/* ─── 직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스 (액션=웹툰 생성) ─── */}
          <FormSection
            academyId={academyId}
            formCollapsed={formCollapsed}
            setFormCollapsed={setFormCollapsed}
            title="웹툰 생성"
            description="자료를 불러오거나 직접 입력한 지문을 한 장의 세로형 웹툰으로 생성합니다."
            titleIcon={Palette}
            libraryLabel="내 지문함"
            examBrowser={
              <ExamPassageLibrary
                onPick={handleImportExamPassages}
                busy={examImporting}
                pickLabel="다음으로 (내 지문함)"
              />
            }
            rightPane={
              <div className="flex min-h-0 flex-1 flex-col">
                <WebtoonInputStack
                  rows={rows}
                  setRows={setRows}
                  saving={generating}
                  style={style}
                  setStyle={setStyle}
                  language={language}
                  setLanguage={setLanguage}
                  customPrompt={customPrompt}
                  setCustomPrompt={setCustomPrompt}
                  onGenerateRow={handleGenerateRow}
                  onAddPassage={() => {
                    setWorkspaceOpen(false);
                    setIntakeView("library");
                  }}
                />
              </div>
            }
            intakeView={intakeView}
            setIntakeView={setIntakeView}
            intakeTab={intakeTab}
            setIntakeTab={setIntakeTab}
            onExtractionBegin={handleExtractionBegin}
            onExtractionResult={handleExtractionResult}
            extractionPending={extractionPending}
            onSubmitPastedRows={handleCreatePastedPassages}
            pasteSaving={pasteSaving}
            workspaceOpen={workspaceOpen}
            setWorkspaceOpen={setWorkspaceOpen}
            workspaceActive={workspaceActive}
            library={
              <PassageCardGrid
                loadingCards={
                  <ExtractionLoadingCards pending={extractionPending} />
                }
                passages={passages}
                filteredPassages={filteredPassages}
                filterOptions={filterOptions}
                collections={collections}
                loadingPassages={loadingPassages}
                passageSearch={passageSearch}
                setPassageSearch={setPassageSearch}
                filterSchool={filterSchool}
                setFilterSchool={setFilterSchool}
                filterGrade={filterGrade}
                setFilterGrade={setFilterGrade}
                filterSemester={filterSemester}
                setFilterSemester={setFilterSemester}
                analysisStatusFilter={analysisStatusFilter}
                setAnalysisStatusFilter={setAnalysisStatusFilter}
                passageSortOrder={passageSortOrder}
                setPassageSortOrder={setPassageSortOrder}
                passageStatusCounts={passageStatusCounts}
                activeFilterCount={activeFilterCount}
                selectedCollectionId={selectedCollectionId}
                setSelectedCollectionId={setSelectedCollectionId}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                toggleCheckbox={toggleCheckbox}
                selectAll={selectAll}
                deselectAll={deselectAll}
                onCopySelectedToCollection={
                  handleCopySelectedPassagesToCollection
                }
                onMoveSelectedToCollection={
                  handleMoveSelectedPassagesToCollection
                }
                onMovePassagesToCollection={handleMovePassagesToCollection}
                onCreateCollection={handleCreatePassageCollection}
                onRemoveSelectedFromCollection={
                  handleRemoveSelectedPassagesFromCollection
                }
                onDeleteSelectedPassages={handleDeleteSelectedPassages}
                passageBulkAction={passageBulkAction}
                genMode="manual"
                totalQuestions={0}
                handleBatchGenerate={handleLoadSelectedToWorkspace}
                freshAnalysisPassageIds={freshAnalysisPassageIds}
                onFreshAnalysisAcknowledged={acknowledgeFreshAnalysisPassage}
                onEditSelected={handleLoadSelectedToWorkspace}
                workspacePassageIds={workspacePassageIds}
                workspaceActive={workspaceActive}
                handleOpenAnalysisModal={openDetailById}
                onViewPassageContent={handleViewPassageContent}
                lastViewedPassageId={lastViewedPassageId}
                openPassageDetailId={detailPassage?.id ?? null}
              />
            }
          />

          {/* ─── 생성한 웹툰 ─── */}
          <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
            <div
              ref={webtoonHeaderRef}
              className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-slate-100 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-bold text-slate-900">
                    생성한 웹툰
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {queueCounts.error > 0 && (
                  <Badge className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
                    실패 {queueCounts.error}
                  </Badge>
                )}
              </div>
            </div>

            {/* 폴더창 + 필터 + 그리드 — 웹툰 관리(보관함)와 동일한 경험을 임베드 */}
            <WebtoonLibraryClient
              embedded
              stickyTopOffset={webtoonHeaderHeight}
              academyId={academyId}
              collections={webtoonCollections}
              collectionMembership={webtoonCollectionMembership}
              refreshSignal={webtoonRefreshSignal}
            />
          </section>
        </main>
      </div>

      {/* ─── 지문 상세 모달 — 원문/복원문/복원 근거. 페이지를 떠나지 않고 뜬다. ─── */}
      {detailPassage && (
        <ExtractionDetailModal
          passage={detailPassage}
          onClose={() => setDetailPassage(null)}
          onPassageAnalyzed={() => {
            void loadPassages();
          }}
          onPassageSaved={() => {
            void loadPassages();
          }}
        />
      )}

    </TooltipProvider>
  );
}
