"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon, Loader2, Palette, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createWorkbenchPassage } from "@/actions/workbench";
import { FormSection } from "@/components/workbench/passage-registration/sections/form-section";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { usePassageLibrary } from "@/components/workbench/passage-registration/use-passage-library";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
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
import { WebtoonQueueCard } from "./webtoon-queue-card";
import { WebtoonTextEditor } from "./editor/webtoon-text-editor";

interface WebtoonPageClientProps {
  academyId: string;
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

export function WebtoonPageClient({ academyId }: WebtoonPageClientProps) {
  // ─── 지문 입력 스택 (내 지문함에서 불러온 지문 = 행) ───
  const [rows, setRows] = useState<PassageInputRow[]>([]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // ─── 웹툰 옵션 ───
  const [style, setStyle] = useState<WebtoonStyleId>("KOREAN_WEBTOON");
  const [language, setLanguage] = useState<WebtoonLanguageId>(
    DEFAULT_WEBTOON_LANGUAGE,
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // ─── 폼 접기 ───
  const [formCollapsed, setFormCollapsed] = useState(false);

  // ─── 웹툰 큐 (DB 폴링) ───
  const {
    items: queue,
    loading: queueLoading,
    handleBatchGenerate,
    handleRetry,
    handleRemove,
    handleToggleApprove,
    patchItem,
  } = useWebtoonState({ academyId });

  // ─── 생성한 웹툰 선택(체크박스) → 일괄 삭제 ───
  const [selectedWebtoonIds, setSelectedWebtoonIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleWebtoonSelected = useCallback((id: string) => {
    setSelectedWebtoonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // 큐에서 사라진 항목은 선택에서도 제거(삭제·재생성 후 정리).
  useEffect(() => {
    setSelectedWebtoonIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(queue.map((q) => q.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (live.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [queue]);
  const handleBulkRemoveWebtoons = useCallback(async () => {
    const ids = [...selectedWebtoonIds];
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => handleRemove(id)));
    setSelectedWebtoonIds(new Set());
  }, [selectedWebtoonIds, handleRemove]);

  // ─── 자막 편집기 ───
  const [editingWebtoonId, setEditingWebtoonId] = useState<string | null>(null);
  const editingWebtoon = useMemo(
    () => queue.find((q) => q.id === editingWebtoonId) ?? null,
    [queue, editingWebtoonId],
  );

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
  const openDetailById = useCallback(
    (passageId: string) => {
      const p = passages.find((x) => x.id === passageId);
      if (p) setDetailPassage(p);
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
            rightPane={
              <div className="flex min-h-0 flex-1 flex-col p-3">
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
                onViewPassageContent={setDetailPassage}
              />
            }
          />

          {/* ─── 생성한 웹툰 ─── */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-bold text-slate-900">
                    생성한 웹툰
                  </h2>
                  <p className="text-[12px] font-medium text-slate-400">
                    백그라운드에서 처리되며 완료되면 자동으로 표시됩니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedWebtoonIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkRemoveWebtoons}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 text-[11.5px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    선택 {selectedWebtoonIds.size}개 삭제
                  </button>
                )}
                {queueCounts.generating > 0 && (
                  <Badge className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    생성 중 {queueCounts.generating}
                  </Badge>
                )}
                {queueCounts.done > 0 && (
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    완료 {queueCounts.done}
                  </Badge>
                )}
                {queueCounts.error > 0 && (
                  <Badge className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
                    실패 {queueCounts.error}
                  </Badge>
                )}
                <Link
                  href="/director/workbench/webtoon/library"
                  className="text-[11.5px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  전체 보관함 →
                </Link>
              </div>
            </div>

            <div className="px-4 py-4">
              {queueLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <p className="text-[12px] text-slate-400">목록 불러오는 중...</p>
                </div>
              ) : queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 opacity-70">
                  <ImageIcon className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-[13px] text-slate-400">
                    아직 생성된 웹툰이 없습니다
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    위에서 지문을 불러오고 화풍·언어를 설정한 뒤 웹툰 생성을
                    눌러주세요
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {queue.map((item) => (
                    <WebtoonQueueCard
                      key={item.id}
                      item={item}
                      selected={selectedWebtoonIds.has(item.id)}
                      onToggleSelected={() => toggleWebtoonSelected(item.id)}
                      onRetry={handleRetry}
                      onRemove={handleRemove}
                      onEditText={setEditingWebtoonId}
                      onToggleApprove={handleToggleApprove}
                    />
                  ))}
                </div>
              )}
            </div>
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

      {editingWebtoonId ? (
        <WebtoonTextEditor
          key={editingWebtoonId}
          webtoonId={editingWebtoonId}
          title={editingWebtoon?.passage.title}
          onClose={() => setEditingWebtoonId(null)}
          onExported={(editedImageUrl) =>
            patchItem(editingWebtoonId, { editedImageUrl })
          }
        />
      ) : null}
    </TooltipProvider>
  );
}
