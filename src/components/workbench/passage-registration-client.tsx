"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCustomPrompts } from "@/actions/custom-prompts";
import { createWorkbenchPassage } from "@/actions/workbench";
import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import {
  isQuestionGenerationPlanTag,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { usePassageQueue } from "@/hooks/use-passage-queue";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import { getDraftDisplayTitle } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/title";
import type {
  PassageRegistrationProps,
  SavedPrompt,
} from "./passage-registration/types";
import { mapRecentPassagesToQueueItems } from "./passage-registration/utils";
import { usePassageFormState } from "./passage-registration/use-passage-form-state";
import { usePassageBlocks } from "./passage-registration/use-passage-blocks";
import { blockHasContent } from "./passage-registration/block-types";
import { extractTextFromImage } from "./passage-registration/image-handlers";
import { useFilterState } from "./passage-registration/use-filter-state";
import { useCollectionsState } from "./passage-registration/use-collections-state";
import { FormSectionContainer } from "./passage-registration/sections/form-section-container";
import { QueueSectionContainer } from "./passage-registration/sections/queue-section-container";

export type { PassageRegistrationProps } from "./passage-registration/types";

export function PassageRegistrationClient({
  academyId,
  schools,
  recentPassages,
  initialCollections,
  draftCollections,
  draftMembership,
  initialDraftIds,
  initialPassageIds,
}: PassageRegistrationProps) {
  const [saving, setSaving] = useState(false);
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);

  // Form collapse state
  const [formCollapsed, setFormCollapsed] = useState(false);

  // ─── Passage blocks (center editor — scrollable, collapsible stack) ───
  const {
    blocks,
    updateBlock,
    addEmptyBlock,
    removeBlock,
    toggleCollapse,
    setAllCollapsed,
    toggleDraftBlock,
    addDraftBlocks,
    addPassageBlocks,
    reset: resetBlocks,
  } = usePassageBlocks();
  const initialDraftIdsKey = useMemo(
    () => (initialDraftIds ?? []).join(","),
    [initialDraftIds],
  );
  const initialPassageIdsKey = useMemo(
    () => (initialPassageIds ?? []).join(","),
    [initialPassageIds],
  );
  const appliedInitialDraftIdsRef = useRef<Set<string>>(new Set());
  const appliedInitialPassageIdsRef = useRef<Set<string>>(new Set());

  // Shared metadata + analysis prompt — grouped into one custom hook
  // to preserve the original contiguous hook order.
  const {
    schoolId,
    setSchoolId,
    grade,
    setGrade,
    semester,
    setSemester,
    unit,
    setUnit,
    publisher,
    setPublisher,
    publisherCustom,
    setPublisherCustom,
    source,
    setSource,
    tagInput,
    setTagInput,
    tags,
    setTags,
    analysisPrompt,
    setAnalysisPrompt,
    analysisTone,
    setAnalysisTone,
    savedPrompts,
    setSavedPrompts,
    showSavedPrompts,
    setShowSavedPrompts,
    newPromptName,
    setNewPromptName,
    savingPrompt,
    setSavingPrompt,
  } = usePassageFormState();

  // Convert server-loaded passages to queue items
  const initialQueueItems = useMemo(() => {
    return mapRecentPassagesToQueueItems(recentPassages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute once on mount — server data doesn't change
  const { triggerRefresh } = useTaskQueue();
  const refreshTaskQueueSoon = useCallback(() => {
    triggerRefresh();
    window.setTimeout(triggerRefresh, 750);
    window.setTimeout(triggerRefresh, 2_000);
    window.setTimeout(triggerRefresh, 4_000);
  }, [triggerRefresh]);

  // Queue system
  const {
    queue,
    activeCount,
    hasActiveAnalysis,
    addManyToQueue,
    enqueueManyPending,
    retryAnalysis,
    removeFromQueue,
    updateAnalysisData,
    updateQuestions,
  } = usePassageQueue(initialQueueItems, {
    cacheKey: `passage-analysis:${academyId}`,
    onJobsChanged: refreshTaskQueueSoon,
  });

  // Modal state
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);
  const modalPassage = queue.find((p) => p.id === modalPassageId) || null;

  // ─── Filtering ─── grouped 7 contiguous useStates into one custom hook.
  const {
    filterSearch,
    setFilterSearch,
    filterSchool,
    setFilterSchool,
    filterGrade,
    setFilterGrade,
    filterSemester,
    setFilterSemester,
    filterPublisher,
    setFilterPublisher,
    filterCollection,
    setFilterCollection,
    showFilters,
    setShowFilters,
  } = useFilterState();

  // ─── Selection ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // ─── Selected extraction drafts (left grid → center blocks) ───
  // Clicking a draft toggles it as a block in the center stack. The grid
  // highlight reflects every draft currently loaded as a block.
  const [draftRefreshToken, setDraftRefreshToken] = useState(0);
  const selectedDraftIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of blocks) if (b.sourceDraftId) ids.add(b.sourceDraftId);
    return ids;
  }, [blocks]);
  const handleSelectDraft = useCallback(
    (draft: M1PassageDraftWithJob) => {
      toggleDraftBlock(draft);
    },
    [toggleDraftBlock],
  );
  const handleSelectedDraftSaved = useCallback(() => {
    setDraftRefreshToken((v) => v + 1);
  }, []);

  useEffect(() => {
    const ids = (initialDraftIds ?? []).filter(
      (id) => !appliedInitialDraftIdsRef.current.has(id),
    );
    if (ids.length === 0) return;

    let cancelled = false;
    ids.forEach((id) => appliedInitialDraftIdsRef.current.add(id));

    void (async () => {
      try {
        const params = new URLSearchParams({
          view: "list",
          limit: String(Math.max(ids.length, 1)),
          draftIds: ids.join(","),
        });
        const res = await fetch(`/api/extraction/m1-passages?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          drafts?: M1PassageDraftWithJob[];
        };
        if (!res.ok || !Array.isArray(data.drafts)) {
          throw new Error("불러올 추출 지문을 찾지 못했습니다.");
        }

        const order = new Map(ids.map((id, index) => [id, index]));
        const drafts = data.drafts
          .filter((draft) => order.has(draft.id))
          .sort(
            (a, b) =>
              (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          );

        if (cancelled || drafts.length === 0) return;
        addDraftBlocks(drafts);
        setFormCollapsed(false);
        toast.success(
          drafts.length === 1
            ? "선택한 지문을 학습지 생성에 불러왔습니다."
            : `${drafts.length}개 지문을 학습지 생성에 불러왔습니다.`,
        );
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error
            ? err.message
            : "추출 지문을 불러오지 못했습니다.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addDraftBlocks, initialDraftIds, initialDraftIdsKey]);

  useEffect(() => {
    const ids = (initialPassageIds ?? []).filter(
      (id) => !appliedInitialPassageIdsRef.current.has(id),
    );
    if (ids.length === 0) return;

    let cancelled = false;
    ids.forEach((id) => appliedInitialPassageIdsRef.current.add(id));

    void (async () => {
      try {
        const params = new URLSearchParams({ passageIds: ids.join(",") });
        const res = await fetch(`/api/passages/list?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          passages?: Array<{
            id: string;
            title?: string | null;
            content?: string | null;
            source?: string | null;
          }>;
        };
        if (!res.ok || !Array.isArray(data.passages)) {
          throw new Error("불러올 지문을 찾지 못했습니다.");
        }

        const order = new Map(ids.map((id, index) => [id, index]));
        const passages = data.passages
          .filter((passage) => order.has(passage.id))
          .sort(
            (a, b) =>
              (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          );

        if (cancelled || passages.length === 0) return;
        addPassageBlocks(passages);
        setFormCollapsed(false);
        toast.success(
          passages.length === 1
            ? "선택한 지문을 학습지 생성에 불러왔습니다."
            : `${passages.length}개 지문을 학습지 생성에 불러왔습니다.`,
        );
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "지문을 불러오지 못했습니다.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addPassageBlocks, initialPassageIds, initialPassageIdsKey]);

  // ─── Collections (folders) ─── grouped useStates + effects in one custom hook to preserve the original contiguous hook order.
  const {
    collections,
    setCollections,
    showNewFolder,
    setShowNewFolder,
    newFolderName,
    setNewFolderName,
    editingFolderId,
    setEditingFolderId,
    editingFolderName,
    setEditingFolderName,
    showAddToFolder,
    setShowAddToFolder,
    addingToFolder,
    setAddingToFolder,
    collectionPassageIds,
    setCollectionPassageIds,
  } = useCollectionsState({ initialCollections, filterCollection });

  const visibleQueue = useMemo(
    () => queue.filter((p) => p.status !== "not_analyzed"),
    [queue],
  );

  // ─── Filtered queue ───
  const filteredQueue = useMemo(() => {
    let items = visibleQueue;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.contentPreview.toLowerCase().includes(q),
      );
    }
    if (filterSchool)
      items = items.filter((p) => p.schoolName === filterSchool);
    if (filterGrade)
      items = items.filter((p) => p.grade === parseInt(filterGrade));
    if (filterSemester)
      items = items.filter((p) => p.semester === filterSemester);
    if (filterPublisher)
      items = items.filter((p) => p.publisher === filterPublisher);
    if (filterCollection) {
      const ids = collectionPassageIds.get(filterCollection);
      if (ids) items = items.filter((p) => ids.has(p.id));
      else items = []; // still loading
    }
    return items;
  }, [
    filterSearch,
    filterSchool,
    filterGrade,
    filterSemester,
    filterPublisher,
    filterCollection,
    collectionPassageIds,
    visibleQueue,
  ]);

  // ─── Unique filter options from queue ───
  const filterOptions = useMemo(() => {
    const schoolNames = [
      ...new Set(
        visibleQueue.filter((p) => p.schoolName).map((p) => p.schoolName!),
      ),
    ];
    const grades = [
      ...new Set(visibleQueue.filter((p) => p.grade).map((p) => p.grade!)),
    ].sort();
    const publishers = [
      ...new Set(
        visibleQueue.filter((p) => p.publisher).map((p) => p.publisher!),
      ),
    ];
    return { schoolNames, grades, publishers };
  }, [visibleQueue]);

  const hasActiveFilters = !!(
    filterSearch ||
    filterSchool ||
    filterGrade ||
    filterSemester ||
    filterPublisher
  );

  // ─── Selection handlers ───
  const toggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId) {
          // Shift-click: select range
          const ids = filteredQueue.map((p) => p.id);
          const startIdx = ids.indexOf(lastSelectedId);
          const endIdx = ids.indexOf(id);
          if (startIdx !== -1 && endIdx !== -1) {
            const [lo, hi] =
              startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            for (let i = lo; i <= hi; i++) next.add(ids[i]);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
      setLastSelectedId(id);
    },
    [lastSelectedId, filteredQueue],
  );

  const selectAll = useCallback(() => {
    if (selectedIds.size === filteredQueue.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQueue.map((p) => p.id)));
    }
  }, [selectedIds, filteredQueue]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const hasContent = useMemo(() => blocks.some(blockHasContent), [blocks]);
  const effectivePublisher =
    publisher === "__CUSTOM__" ? publisherCustom : publisher;

  // Load saved prompts
  useEffect(() => {
    getCustomPrompts("PASSAGE_ANALYSIS").then((prompts) => {
      setSavedPrompts(prompts as SavedPrompt[]);
    });
  }, [setSavedPrompts]);

  // beforeunload warning
  useEffect(() => {
    if (!hasActiveAnalysis) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveAnalysis]);

  // ─── Bulk-analyze selected extraction drafts ───
  // Fire all passage writes in parallel and enqueue each passage as soon as
  // its write finishes, so the task cards appear before every draft completes.
  const handleBulkAnalyzeDrafts = useCallback(
    async (
      drafts: M1PassageDraftWithJob[],
      generationPlan: QuestionGenerationPlan,
    ) => {
      if (drafts.length === 0 || bulkAnalyzing) return;
      setBulkAnalyzing(true);

      try {
        const normalizedSchoolId =
          schoolId && schoolId !== "NONE" ? schoolId : "";
        const schoolName = schools.find((s) => s.id === normalizedSchoolId)?.name;
        const combinedPrompt = buildAnalysisPrompt(analysisPrompt, []);
        const parsedGrade = grade ? parseInt(grade) : undefined;
        const trimmedUnit = unit.trim();
        const sharedTags = tags.length > 0 ? tags : undefined;

        const results = await Promise.allSettled(
          drafts.map(async (draft) => {
            const text =
              draft.teacherText?.trim() ||
              draft.restoredText?.trim() ||
              draft.rawText?.trim() ||
              "";
            if (!text) throw new Error("EMPTY_CONTENT");

            const draftTitle = draft.title?.trim() || getDraftDisplayTitle(draft);
            const fileName =
              draft.job?.displayName?.trim() ||
              draft.job?.originalFileName?.trim() ||
              "";

            const result = await createWorkbenchPassage({
              title: draftTitle,
              content: text,
              schoolId: normalizedSchoolId || undefined,
              grade: parsedGrade,
              semester: semester || undefined,
              unit: trimmedUnit || undefined,
              publisher: effectivePublisher || undefined,
              source: fileName || undefined,
              tags: sharedTags,
              sourceDraftId: draft.id,
            });

            if (!result.success || !result.id) {
              throw new Error(result.error || "CREATE_FAILED");
            }

            const queuedItem = {
              passage: {
                id: result.id,
                title: draftTitle,
                content: text,
                schoolId: normalizedSchoolId || undefined,
                schoolName,
                grade: parsedGrade,
                semester: semester || undefined,
                unit: trimmedUnit || undefined,
                publisher: effectivePublisher || undefined,
                tags: sharedTags,
                source: fileName || undefined,
              },
              promptConfig: {
                customPrompt: combinedPrompt,
                focusAreas: [],
                targetLevel: "",
                generationPlan,
                analysisTone,
              },
            };

            enqueueManyPending([queuedItem]);
            return queuedItem;
          }),
        );

        const created = results.flatMap((r) =>
          r.status === "fulfilled" ? [r.value] : [],
        );
        const createFailed = results.length - created.length;
        const queued = await addManyToQueue(created, true);
        const success = queued.success;
        const failed = createFailed + queued.failed;

        if (success > 0) {
          toast.success(
            `${success}개 지문이 등록되었습니다. 백그라운드에서 분석 진행 중 (동시 3개씩).`,
          );
        }
        if (failed > 0) {
          toast.error(`${failed}개 지문 등록에 실패했습니다.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "일괄 분석 등록 중 오류가 발생했습니다.",
        );
      } finally {
        setBulkAnalyzing(false);
      }
    },
    [
      bulkAnalyzing,
      schoolId,
      schools,
      grade,
      semester,
      unit,
      effectivePublisher,
      tags,
      analysisPrompt,
      analysisTone,
      addManyToQueue,
      enqueueManyPending,
    ],
  );

  // ─── Analyze every filled block in the center stack at once ───
  // Mirrors the bulk-draft path: writes run in parallel and each passage is
  // enqueued as soon as its write finishes. Shared metadata/prompt apply to
  // all blocks; per-block title/content/annotations/source/image win.
  const handleAnalyzeBlocks = useCallback(
    async (
      generationPlan: QuestionGenerationPlan,
      tone: AnalysisTone,
    ) => {
      if (saving) return;
      const filled = blocks.filter(blockHasContent);
      if (filled.length === 0) {
        toast.error("지문 내용을 입력하거나 이미지를 업로드해주세요.");
        return;
      }

      setSaving(true);
      try {
        const normalizedSchoolId =
          schoolId && schoolId !== "NONE" ? schoolId : "";
        const schoolName = schools.find((s) => s.id === normalizedSchoolId)?.name;
        const parsedGrade = grade ? parseInt(grade) : undefined;
        const trimmedUnit = unit.trim();
        const sharedSource = source.trim();
        const sharedTags = tags.length > 0 ? tags : undefined;

        const results = await Promise.allSettled(
          filled.map(async (block) => {
            let text = block.content.trim();
            if (!text && block.imageFile) {
              const extracted = await extractTextFromImage(block.imageFile);
              if (!extracted) throw new Error("이미지에서 텍스트를 추출하지 못했습니다.");
              text = extracted;
            }
            if (!text) throw new Error("EMPTY_CONTENT");

            const finalTitle =
              block.title.trim() ||
              text.split(/[.\n]/)[0].slice(0, 60) ||
              "제목 없음";
            const blockSource = block.source.trim() || sharedSource;
            const combinedPrompt = buildAnalysisPrompt(
              analysisPrompt,
              block.annotations,
            );

            const result = await createWorkbenchPassage({
              title: finalTitle,
              content: text,
              schoolId: normalizedSchoolId || undefined,
              grade: parsedGrade,
              semester: semester || undefined,
              unit: trimmedUnit || undefined,
              publisher: effectivePublisher || undefined,
              source: blockSource || undefined,
              tags: sharedTags,
              sourceDraftId: block.sourceDraftId ?? undefined,
              annotations:
                block.annotations.length > 0
                  ? block.annotations.map((a) => ({
                      id: a.id,
                      type: a.type,
                      text: a.text,
                      memo: a.memo,
                      from: a.from,
                      to: a.to,
                    }))
                  : undefined,
            });

            if (!result.success || !result.id) {
              throw new Error(result.error || "CREATE_FAILED");
            }

            const queuedItem = {
              passage: {
                id: result.id,
                title: finalTitle,
                content: text,
                schoolId: normalizedSchoolId || undefined,
                schoolName,
                grade: parsedGrade,
                semester: semester || undefined,
                unit: trimmedUnit || undefined,
                publisher: effectivePublisher || undefined,
                tags: sharedTags,
                source: blockSource || undefined,
              },
              promptConfig: {
                customPrompt: combinedPrompt,
                focusAreas: [],
                targetLevel: "",
                generationPlan,
                analysisTone: tone,
              },
            };

            enqueueManyPending([queuedItem]);
            return queuedItem;
          }),
        );

        const created = results.flatMap((r) =>
          r.status === "fulfilled" ? [r.value] : [],
        );
        const createFailed = results.length - created.length;
        const queued = await addManyToQueue(created, true);
        const success = queued.success;
        const failed = createFailed + queued.failed;

        if (success > 0) {
          toast.success(
            success === 1
              ? "지문이 등록되었습니다. 백그라운드에서 AI 분석을 시작합니다."
              : `${success}개 지문이 등록되었습니다. 백그라운드에서 분석 진행 중 (동시 3개씩).`,
          );
          handleSelectedDraftSaved();
          resetBlocks();
        }
        if (failed > 0) {
          toast.error(`${failed}개 지문 등록에 실패했습니다.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "분석 등록 중 오류가 발생했습니다.",
        );
      } finally {
        setSaving(false);
      }
    },
    [
      saving,
      blocks,
      schoolId,
      schools,
      grade,
      semester,
      unit,
      source,
      effectivePublisher,
      tags,
      analysisPrompt,
      addManyToQueue,
      enqueueManyPending,
      handleSelectedDraftSaved,
      resetBlocks,
    ],
  );

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !isQuestionGenerationPlanTag(tag) && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
      setTagInput("");
    }
  }, [setTagInput, setTags, tagInput, tags]);

  const removeTag = (tag: string) =>
    setTags((prev) => prev.filter((t) => t !== tag));

  return (
    <TooltipProvider>
      <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
        <main className="flex w-full min-w-0 flex-col gap-4">
          {/* ─── Collapsible Form Section ─── */}
          <FormSectionContainer
            academyId={academyId}
            formCollapsed={formCollapsed}
            setFormCollapsed={setFormCollapsed}
            hasContent={hasContent}
            saving={saving}
            blocks={blocks}
            updateBlock={updateBlock}
            addEmptyBlock={addEmptyBlock}
            removeBlock={removeBlock}
            toggleCollapse={toggleCollapse}
            setAllCollapsed={setAllCollapsed}
            onAnalyze={handleAnalyzeBlocks}
            schools={schools}
            schoolId={schoolId}
            setSchoolId={setSchoolId}
            grade={grade}
            setGrade={setGrade}
            semester={semester}
            setSemester={setSemester}
            unit={unit}
            setUnit={setUnit}
            source={source}
            setSource={setSource}
            publisher={publisher}
            setPublisher={setPublisher}
            publisherCustom={publisherCustom}
            setPublisherCustom={setPublisherCustom}
            effectivePublisher={effectivePublisher}
            tagInput={tagInput}
            setTagInput={setTagInput}
            tags={tags}
            setTags={setTags}
            addTag={addTag}
            removeTag={removeTag}
            analysisPrompt={analysisPrompt}
            setAnalysisPrompt={setAnalysisPrompt}
            analysisTone={analysisTone}
            setAnalysisTone={setAnalysisTone}
            savedPrompts={savedPrompts}
            setSavedPrompts={setSavedPrompts}
            showSavedPrompts={showSavedPrompts}
            setShowSavedPrompts={setShowSavedPrompts}
            newPromptName={newPromptName}
            setNewPromptName={setNewPromptName}
            savingPrompt={savingPrompt}
            setSavingPrompt={setSavingPrompt}
            selectedDraftIds={selectedDraftIds}
            draftRefreshToken={draftRefreshToken}
            onSelectDraft={handleSelectDraft}
            onSelectedDraftSaved={handleSelectedDraftSaved}
            draftCollections={draftCollections ?? []}
            draftMembership={draftMembership ?? {}}
            onBulkAnalyze={handleBulkAnalyzeDrafts}
            bulkAnalyzing={bulkAnalyzing}
          />

          {/* ─── Toolbar + Card Grid ─── */}
          <QueueSectionContainer
            queue={visibleQueue}
            filteredQueue={filteredQueue}
            activeCount={activeCount}
            filterSearch={filterSearch}
            setFilterSearch={setFilterSearch}
            filterSchool={filterSchool}
            setFilterSchool={setFilterSchool}
            filterGrade={filterGrade}
            setFilterGrade={setFilterGrade}
            filterSemester={filterSemester}
            setFilterSemester={setFilterSemester}
            filterPublisher={filterPublisher}
            setFilterPublisher={setFilterPublisher}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            filterOptions={filterOptions}
            hasActiveFilters={hasActiveFilters}
            collections={collections}
            setCollections={setCollections}
            filterCollection={filterCollection}
            setFilterCollection={setFilterCollection}
            editingFolderId={editingFolderId}
            setEditingFolderId={setEditingFolderId}
            editingFolderName={editingFolderName}
            setEditingFolderName={setEditingFolderName}
            showNewFolder={showNewFolder}
            setShowNewFolder={setShowNewFolder}
            newFolderName={newFolderName}
            setNewFolderName={setNewFolderName}
            showAddToFolder={showAddToFolder}
            setShowAddToFolder={setShowAddToFolder}
            addingToFolder={addingToFolder}
            setAddingToFolder={setAddingToFolder}
            collectionPassageIds={collectionPassageIds}
            setCollectionPassageIds={setCollectionPassageIds}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            toggleSelect={toggleSelect}
            selectAll={selectAll}
            clearSelection={clearSelection}
            setModalPassageId={setModalPassageId}
            retryAnalysis={retryAnalysis}
            removeFromQueue={removeFromQueue}
          />
        </main>

        {/* ─── Analysis Modal ─── */}
        {modalPassage && (
          <PassageAnalysisModal
            open={!!modalPassageId}
            onClose={() => setModalPassageId(null)}
            passage={modalPassage.passageData}
            initialAnalysis={modalPassage.analysisData}
            initialPromptConfig={modalPassage.promptConfig}
            onAnalysisUpdate={(data) => {
              updateAnalysisData(modalPassage.id, data);
            }}
            onQuestionsUpdate={(questions) => {
              updateQuestions(modalPassage.id, questions);
            }}
            onDelete={(passageId) => {
              removeFromQueue(passageId);
              setModalPassageId(null);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
