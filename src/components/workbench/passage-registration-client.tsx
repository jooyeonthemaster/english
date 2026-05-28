"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCustomPrompts } from "@/actions/custom-prompts";
import { createWorkbenchPassage } from "@/actions/workbench";
import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import {
  isQuestionGenerationPlanTag,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { PassageAnalysisIcon } from "@/components/icons/workflow-icons";
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
}: PassageRegistrationProps) {
  const [saving, setSaving] = useState(false);
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form collapse state
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Core fields + annotations + image + metadata + analysis prompt — grouped into one custom hook
  // to preserve the original contiguous hook order (19 consecutive useStates).
  const {
    title,
    setTitle,
    content,
    setContent,
    annotations,
    setAnnotations,
    imageFile,
    setImageFile,
    imagePreview,
    setImagePreview,
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
    addToQueue,
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

  // ─── Selected extraction draft (left grid → editor) ───
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftRefreshToken, setDraftRefreshToken] = useState(0);
  const handleSelectDraft = useCallback((draft: M1PassageDraftWithJob) => {
    if (selectedDraftId === draft.id) {
      setSelectedDraftId(null);
      setTitle("");
      setContent("");
      setAnnotations([]);
      setImageFile(null);
      setImagePreview(null);
      setSource("");
      return;
    }

    const text =
      draft.teacherText?.trim() ||
      draft.restoredText?.trim() ||
      draft.rawText?.trim() ||
      "";
    const draftTitle = draft.title?.trim() || getDraftDisplayTitle(draft);
    setSelectedDraftId(draft.id);
    setTitle(draftTitle);
    setContent(text);
    setAnnotations([]);
    setImageFile(null);
    setImagePreview(null);
    const fileName =
      draft.job?.displayName?.trim() ||
      draft.job?.originalFileName?.trim() ||
      "";
    if (fileName) setSource(fileName);
  }, [
    selectedDraftId,
    setAnnotations,
    setContent,
    setImageFile,
    setImagePreview,
    setSource,
    setTitle,
  ]);
  const handleSelectedDraftSaved = useCallback(() => {
    setSelectedDraftId(null);
    setDraftRefreshToken((v) => v + 1);
  }, []);

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

  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const hasContent = content.trim().length > 0 || imageFile !== null;
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

          const draftTitle =
            draft.title?.trim() || getDraftDisplayTitle(draft);
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

      setBulkAnalyzing(false);

      if (success > 0) {
        toast.success(
          `${success}개 지문이 등록되었습니다. 백그라운드에서 분석 진행 중 (동시 3개씩).`,
        );
      }
      if (failed > 0) {
        toast.error(`${failed}개 지문 등록에 실패했습니다.`);
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
      addManyToQueue,
      enqueueManyPending,
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
      <div className="flex flex-col min-h-[calc(100vh-64px)]">
        {/* ─── Main Content Area ─── */}
        <div className="flex-1 overflow-y-auto bg-[#F4F6F9]">
          <div className="border-b border-slate-200/80 bg-white px-6 py-3">
            <WorkflowPageTitle
              icon={PassageAnalysisIcon}
              title="지문 분석"
              description="추출된 자료나 직접 입력한 지문을 바탕으로 어휘, 문법, 구조, 출제 포인트를 분석합니다."
            />
          </div>

          {/* ─── Collapsible Form Section ─── */}
          <FormSectionContainer
            academyId={academyId}
            formCollapsed={formCollapsed}
            setFormCollapsed={setFormCollapsed}
            hasContent={hasContent}
            wordCount={wordCount}
            saving={saving}
            setSaving={setSaving}
            title={title}
            setTitle={setTitle}
            content={content}
            setContent={setContent}
            annotations={annotations}
            setAnnotations={setAnnotations}
            imageFile={imageFile}
            setImageFile={setImageFile}
            imagePreview={imagePreview}
            setImagePreview={setImagePreview}
            fileInputRef={fileInputRef}
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
            savedPrompts={savedPrompts}
            setSavedPrompts={setSavedPrompts}
            showSavedPrompts={showSavedPrompts}
            setShowSavedPrompts={setShowSavedPrompts}
            newPromptName={newPromptName}
            setNewPromptName={setNewPromptName}
            savingPrompt={savingPrompt}
            setSavingPrompt={setSavingPrompt}
            addToQueue={addToQueue}
            selectedDraftId={selectedDraftId}
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
            toggleSelect={toggleSelect}
            selectAll={selectAll}
            clearSelection={clearSelection}
            setModalPassageId={setModalPassageId}
            retryAnalysis={retryAnalysis}
            removeFromQueue={removeFromQueue}
          />
        </div>

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
