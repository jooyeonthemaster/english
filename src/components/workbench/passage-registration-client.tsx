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
import { useTaskQueue } from "@/components/workbench/task-queue";
import { usePassageQueue } from "@/hooks/use-passage-queue";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import { getDraftDisplayTitle } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/title";
import type {
  PassageRegistrationProps,
  SavedPrompt,
} from "./passage-registration/types";
import { mapRecentPassagesToQueueItems } from "./passage-registration/utils";
import { usePassageFormState } from "./passage-registration/use-passage-form-state";
import { useFilterState } from "./passage-registration/use-filter-state";
import { useCollectionsState } from "./passage-registration/use-collections-state";
import {
  useCreateExtraction,
  type ExtractionPromotedResult,
} from "./passage-registration/use-create-extraction";
import {
  makeEmptyRow,
  makeRowFromDraft,
  isPristineEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow,
} from "./passage-registration/passage-input/types";
import { FormSectionContainer } from "./passage-registration/sections/form-section-container";
import { QueueSectionContainer } from "./passage-registration/sections/queue-section-container";
import type {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";

export type { PassageRegistrationProps } from "./passage-registration/types";

/** Build a passage title from the first non-empty line of typed content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

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
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);

  // Form collapse state
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Metadata + analysis prompt + tags + saved prompts (shared across passages).
  // The single-passage editor fields the hook also exposes are no longer used —
  // passage text/marks now live per-row in the `rows` stack below.
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

  // ─── Multi-passage input stack (the right "지문" section) ───
  // Each row carries its own title/content/annotations + optional AI 복원, and
  // remembers the extraction draft it was loaded from so analysis updates that
  // Passage instead of forking a duplicate.
  const [rows, setRows] = useState<PassageInputRow[]>(() => [makeEmptyRow()]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Convert server-loaded passages to queue items
  const initialQueueItems = useMemo(() => {
    return mapRecentPassagesToQueueItems(recentPassages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute once on mount — server data doesn't change
  const { triggerRefresh, setScope } = useTaskQueue();
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

  // ─── Selection (bottom analyzed-passage queue) ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // ─── Draft → rows ───
  const [draftRefreshToken, setDraftRefreshToken] = useState(0);
  const bumpDraftRefresh = useCallback(
    () => setDraftRefreshToken((v) => v + 1),
    [],
  );

  // Load extraction drafts into the right "지문" stack as rows. Used by both the
  // single-card 가져오기 click and the 자료 관리 checkbox → 불러오기 bulk action.
  // Deduped by sourceDraftId so re-loading the same draft never duplicates it.
  const handleLoadDrafts = useCallback((drafts: M1PassageDraftWithJob[]) => {
    const prev = rowsRef.current;
    const existing = new Set(
      prev.map((r) => r.sourceDraftId).filter((id): id is string => !!id),
    );
    const incoming = drafts
      .filter((d) => !existing.has(d.id))
      .map((d) => ({
        d,
        text: formatExtractedTextForDisplay(
          d.teacherText?.trim() ||
            d.restoredText?.trim() ||
            d.rawText?.trim() ||
            "",
        ),
      }))
      .filter((x) => x.text.length > 0)
      .map(({ d, text }) =>
        makeRowFromDraft({
          title: d.title?.trim() || getDraftDisplayTitle(d),
          content: text,
          sourceDraftId: d.id,
          source:
            d.job?.displayName?.trim() ||
            d.job?.originalFileName?.trim() ||
            null,
        }),
      );

    if (incoming.length === 0) {
      toast.info("이미 불러온 지문이거나 본문이 비어 있어요.");
      return;
    }
    // Drop a single pristine empty row so loaded passages take its place.
    const base = prev.length === 1 && isPristineEmptyRow(prev[0]) ? [] : prev;
    // Expand the first loaded row when it lands in an empty stack so the teacher
    // can mark immediately; otherwise loaded rows stay collapsed (loading many
    // is cheap — the editor mounts lazily on expand).
    if (base.length === 0) incoming[0] = { ...incoming[0], collapsed: false };
    const next = [...base, ...incoming];
    rowsRef.current = next;
    setRows(next);
    setFormCollapsed(false);
    toast.success(
      `${incoming.length}개 지문을 불러왔어요. 마킹 후 분석을 시작하세요.`,
    );
  }, []);

  const handleSelectDraftLoad = useCallback(
    (draft: M1PassageDraftWithJob) => handleLoadDrafts([draft]),
    [handleLoadDrafts],
  );

  // ─── Intake (이미지·PDF) — 문제 생성 intake 포팅 ───
  const [intakeView, setIntakeView] = useState<IntakeView>("library");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("upload");

  // 추출 완료 → 잡의 draft들이 auto-promote(Passage화) → 자료 목록 즉시 새로고침.
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({ jobId, complete }: ExtractionPromotedResult) => {
      bumpDraftRefresh();
      triggerRefresh();
      if (complete) {
        window.setTimeout(() => clearExtractionPendingRef.current(jobId), 1500);
      }
      toast.success(
        complete
          ? "추출이 완료돼 자료 목록에 추가됐어요. 분석할 자료를 선택해 불러오세요."
          : "일부 지문이 자료 목록에 추가됐어요. 나머지는 계속 처리 중입니다.",
      );
    },
    [bumpDraftRefresh, triggerRefresh],
  );

  const {
    beginJob: beginExtractionJob,
    attachJob: attachExtractionJob,
    failJob: failExtractionJob,
    clearPending: clearExtractionPending,
    pending: extractionPending,
  } = useCreateExtraction({ onPromoted: handleExtractionPromoted });
  useEffect(() => {
    clearExtractionPendingRef.current = clearExtractionPending;
  }, [clearExtractionPending]);

  // 추출 시작 즉시: 자료 관리(library) 탭으로 전환해 진행 카드를 보여주고, 작업 큐
  // 드로어 스코프를 추출로 맞춘다.
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
        bumpDraftRefresh();
        triggerRefresh();
      } else {
        failExtractionJob(id);
      }
    },
    [attachExtractionJob, failExtractionJob, bumpDraftRefresh, triggerRefresh],
  );

  // ─── Deep link (?draftIds= / ?passageIds=) → rows ───
  // Ported from main's block-based loader: /passages/create?draftIds=… and
  // ?passageIds=… preload extraction drafts / saved passages into the input
  // stack on mount. Applied at most once per id (StrictMode-safe via refs).
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
        handleLoadDrafts(drafts);
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
  }, [handleLoadDrafts, initialDraftIds, initialDraftIdsKey]);

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
        const incoming = data.passages
          .filter((passage) => order.has(passage.id))
          .sort(
            (a, b) =>
              (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          )
          .map((passage) => ({ passage, text: passage.content?.trim() || "" }))
          .filter((x) => x.text.length > 0)
          .map(({ passage, text }) => ({
            ...makeEmptyRow(text),
            title: passage.title?.trim() || "",
            source: passage.source?.trim() || null,
            collapsed: true,
          }));

        if (cancelled || incoming.length === 0) return;
        // Mirror handleLoadDrafts' stack-merge: drop a single pristine empty
        // row; expand the first loaded row when it lands in an empty stack.
        const prev = rowsRef.current;
        const base =
          prev.length === 1 && isPristineEmptyRow(prev[0]) ? [] : prev;
        if (base.length === 0) {
          incoming[0] = { ...incoming[0], collapsed: false };
        }
        const next = [...base, ...incoming];
        rowsRef.current = next;
        setRows(next);
        setFormCollapsed(false);
        toast.success(
          incoming.length === 1
            ? "선택한 지문을 학습지 생성에 불러왔습니다."
            : `${incoming.length}개 지문을 학습지 생성에 불러왔습니다.`,
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
  }, [initialPassageIds, initialPassageIdsKey]);

  // ─── Collections (folders) ───
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

  // ─── Selection handlers (bottom queue) ───
  const toggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId) {
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

  // ─── Analyze every row in the stack (each carries its own annotations) ───
  // Fire all passage writes in parallel and enqueue each as soon as its write
  // finishes, so the task cards appear before every row completes. Each row's
  // marks both persist (PassageNote) AND fold into that passage's analysis
  // prompt; sourceDraftId keeps a loaded draft linked to its Passage.
  const handleAnalyzeRows = useCallback(
    async (plan: QuestionGenerationPlan) => {
      const current = rowsRef.current;
      const valid = current.filter(
        (r) => r.content.trim().length >= MIN_CONTENT_CHARS,
      );
      if (valid.length === 0) {
        toast.error(`지문을 ${MIN_CONTENT_CHARS}자 이상 입력해주세요.`);
        return;
      }
      if (bulkAnalyzing) return;
      setBulkAnalyzing(true);

      try {
        const normalizedSchoolId =
          schoolId && schoolId !== "NONE" ? schoolId : "";
        const schoolName = schools.find((s) => s.id === normalizedSchoolId)?.name;
        const parsedGrade = grade ? parseInt(grade) : undefined;
        const trimmedUnit = unit.trim();
        const sharedTags = tags.length > 0 ? tags : undefined;
        const sharedSource = source.trim();

        const results = await Promise.allSettled(
          valid.map(async (row) => {
            const text = row.content.trim();
            const rowTitle = row.title.trim() || derivePastedTitle(text);
            const rowSource = row.source?.trim() || sharedSource || undefined;

            const result = await createWorkbenchPassage({
              title: rowTitle,
              content: text,
              schoolId: normalizedSchoolId || undefined,
              grade: parsedGrade,
              semester: semester || undefined,
              unit: trimmedUnit || undefined,
              publisher: effectivePublisher || undefined,
              source: rowSource,
              tags: sharedTags,
              sourceDraftId: row.sourceDraftId ?? undefined,
              annotations:
                row.annotations.length > 0
                  ? row.annotations.map((a) => ({
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

            const combinedPrompt = buildAnalysisPrompt(
              analysisPrompt,
              row.annotations,
            );

            const queuedItem = {
              passage: {
                id: result.id,
                title: rowTitle,
                content: text,
                schoolId: normalizedSchoolId || undefined,
                schoolName,
                grade: parsedGrade,
                semester: semester || undefined,
                unit: trimmedUnit || undefined,
                publisher: effectivePublisher || undefined,
                tags: sharedTags,
                source: rowSource,
              },
              promptConfig: {
                customPrompt: combinedPrompt,
                focusAreas: [],
                targetLevel: "",
                generationPlan: plan,
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
          const fresh = [makeEmptyRow()];
          rowsRef.current = fresh;
          setRows(fresh);
          bumpDraftRefresh();
          triggerRefresh();
        }
        if (failed > 0) {
          toast.error(`${failed}개 지문 등록에 실패했습니다.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "분석 등록 중 오류가 발생했습니다.",
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
      source,
      tags,
      analysisPrompt,
      analysisTone,
      addManyToQueue,
      enqueueManyPending,
      bumpDraftRefresh,
      triggerRefresh,
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
            rows={rows}
            setRows={setRows}
            analyzing={bulkAnalyzing}
            onAnalyze={handleAnalyzeRows}
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
            tagInput={tagInput}
            setTagInput={setTagInput}
            tags={tags}
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
            draftRefreshToken={draftRefreshToken}
            onSelectDraft={handleSelectDraftLoad}
            onLoadSelectedDrafts={handleLoadDrafts}
            draftCollections={draftCollections ?? []}
            draftMembership={draftMembership ?? {}}
            intakeView={intakeView}
            setIntakeView={setIntakeView}
            intakeTab={intakeTab}
            setIntakeTab={setIntakeTab}
            onExtractionBegin={handleExtractionBegin}
            onExtractionResult={handleExtractionResult}
            extractionPending={extractionPending}
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
