"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  createWorkbenchPassage,
  updateWorkbenchPassage,
  savePassageAnnotations,
} from "@/actions/workbench";
import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import {
  isQuestionGenerationPlanTag,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { usePassageQueue } from "@/hooks/use-passage-queue";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import { getDraftDisplayTitle } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/title";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
import type { PassageItem } from "@/app/(director)/director/workbench/generate/generate-page-types";
import { ExamPassageLibrary } from "@/components/workbench/exam-passage-library";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import { ExtractionDetailModal } from "@/app/(director)/director/workbench/generate/intake/extraction-detail-modal";
import {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import {
  useGenerateExtraction,
  type ExtractionPromotedResult,
} from "@/app/(director)/director/workbench/generate/intake/use-generate-extraction";
import { ExtractionLoadingCards } from "@/app/(director)/director/workbench/generate/intake/extraction-loading-cards";
import type {
  PassageRegistrationProps,
  SavedPrompt,
} from "./passage-registration/types";
import { usePassageFormState } from "./passage-registration/use-passage-form-state";
import { usePassageLibrary } from "./passage-registration/use-passage-library";
import {
  makeRowFromDraft,
  makeRowFromSavedPassage,
  isPristineEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow,
} from "./passage-registration/passage-input/types";
import { FormSectionContainer } from "./passage-registration/sections/form-section-container";
import { useLearningGenerationPublisher } from "@/app/(director)/director/workbench/passages/create/learning-generation-context";

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
  initialDraftIds,
  initialPassageIds,
}: PassageRegistrationProps) {
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);

  // Form collapse state
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Metadata + analysis prompt + tags + saved prompts (shared across passages).
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

  // ─── Intake (직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스) ───
  const [intakeView, setIntakeView] = useState<IntakeView>("library");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");

  // ─── 내 지문함 라이브러리 (문제생성 intake 이식) ───
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

  // ─── Multi-passage workspace stack (지문 입력 및 필기창) ───
  // 문제생성 워크스페이스처럼 비어서 시작 — 내 지문함에서 불러오거나 '지문 추가'로
  // 채운다. 비어 있으면 카드/푸터 없이 '지문 추가' 버튼만 보인다.
  const [rows, setRows] = useState<PassageInputRow[]>(() => []);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // 워크스페이스(필기 스택)가 자료함 위를 덮어 떠 있는지.
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

  const { triggerRefresh, setScope } = useTaskQueue();

  // ─── Analysis engine (백그라운드 분석 잡 실행) — 하단 UI 없이 엔진만 사용 ───
  const {
    queue,
    hasActiveAnalysis,
    addManyToQueue,
    enqueueManyPending,
  } = usePassageQueue([], {
    cacheKey: `passage-analysis:${academyId}`,
    onJobsChanged: triggerRefresh,
  });

  // 진행 중(생성중) 지문 — 카드에 '생성중' 표시. 큐 상태에서 파생.
  const learningGeneratingPassageIds = useMemo(
    () =>
      new Set(
        queue
          .filter((q) => q.status === "pending" || q.status === "analyzing")
          .map((q) => q.id),
      ),
    [queue],
  );

  // 하단 '학습지 목록'에 진행 중 로딩 큐를 띄우도록, 큐의 생성중 항목을 컨텍스트로
  // 발행한다. 폴러는 이 워크스페이스 한 곳뿐이므로(이중 폴링 방지) 하단은 구독만 한다.
  const publishGeneratingItems = useLearningGenerationPublisher();
  const generatingItems = useMemo(
    () => queue.filter((q) => q.status === "pending" || q.status === "analyzing"),
    [queue],
  );
  const generatingSignature = useMemo(
    () => generatingItems.map((q) => `${q.id}:${q.status}`).join("|"),
    [generatingItems],
  );
  const generatingItemsRef = useRef(generatingItems);
  generatingItemsRef.current = generatingItems;
  useEffect(() => {
    publishGeneratingItems(generatingItemsRef.current);
  }, [generatingSignature, publishGeneratingItems]);
  // 방금 생성(분석) 완료된 지문 — 카드에 초록 글로우.
  const [freshLearningPassageIds, setFreshLearningPassageIds] = useState<
    Set<string>
  >(() => new Set());
  // 완료된 잡 감지 → 내 지문함 카드를 분석 완료 모습으로 새로고침.
  const doneIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const done = new Set(
      queue.filter((q) => q.status === "done").map((q) => q.id),
    );
    const newlyDone = [...done].filter((id) => !doneIdsRef.current.has(id));
    doneIdsRef.current = done;
    if (newlyDone.length === 0) return;
    void loadPassages();
    setFreshLearningPassageIds((prev) => {
      const next = new Set(prev);
      newlyDone.forEach((id) => next.add(id));
      return next;
    });
  }, [queue, loadPassages]);

  // ─── Load saved passages on mount ───
  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // ─── 내 지문함 선택 → 워크스페이스로 불러오기 (분기점) ───
  // 저장된 Passage 를 필기 스택에 행으로 담는다. passageId 를 함께 실어, 분석 시
  // 그 Passage 를 업데이트(중복 생성 방지)한다.
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
          // 불러온 지문은 기본적으로 모두 펼쳐 둔다.
          collapsed: false,
        }),
      );
    if (incoming.length === 0) {
      toast.info("선택한 지문은 이미 워크스페이스에 있습니다.");
      setWorkspaceOpen(true);
      return;
    }
    const wasActive = prev.some((r) => !isPristineEmptyRow(r));
    // 기존 행은 사용자가 둔 상태 그대로 두고(강제로 접지 않음), 새로 불러온 지문만
    // 펼친 채로 뒤에 붙인다.
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
        " 마킹 후 생성하세요.",
    );
  }, [passages, selectedIds, setSelectedIds]);

  // '지문 추가'(워크스페이스) → 워크스페이스를 닫고 내 지문함으로 돌아가 지문을
  // 골라 담는다(문제생성 워크스페이스와 동일). 워크스페이스 자체는 작업 중인 행이
  // 남아 있으면 탭으로 다시 열 수 있다.
  const handleAddPassageFromWorkspace = useCallback(() => {
    setWorkspaceOpen(false);
    setIntakeView("library");
  }, []);

  // ── 수능·모평 기출 지문 → 내 지문함 일괄 등록 (문제생성과 동일 메커니즘) ──
  // 본문은 서버가 코퍼스에서 해석(클라는 id 만). 등록 후 목록 재조회 → 새 지문 선택
  // → 내 지문함(library) 뷰로 전환해 바로 워크스페이스로 불러올 수 있게 한다.
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

  // 변형 지문 생성 → 새 Passage 로 저장하고 워크스페이스에 새 행으로 추가한다.
  // 원본은 그대로 두고(변형 lineage 만 기록), 내 지문함에도 즉시 반영된다.
  const handleAddVariant = useCallback(
    async (args: {
      sourcePassageId: string | null;
      title: string;
      content: string;
      mode: string;
      direction?: string;
    }) => {
      const content = args.content.trim();
      const title = args.title.trim() || "변형 지문";
      if (content.length < MIN_CONTENT_CHARS) {
        toast.error("변형 지문이 너무 짧습니다.");
        return false;
      }
      try {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const result = await createDirectInputPassageMaterial({
          title,
          content,
          sourcePassageId: args.sourcePassageId ?? undefined,
          variantKind: args.mode,
          variantDirection: args.direction,
        });
        if (!result?.success || !result.id) {
          toast.error(result?.error || "변형 지문 저장에 실패했습니다.");
          return false;
        }
        const newRow = makeRowFromSavedPassage({
          passageId: result.id,
          title,
          content,
          collapsed: false,
        });
        setRows((prev) => [...prev, newRow]);
        void loadPassages();
        toast.success("변형 지문을 새 지문으로 추가했어요.");
        return true;
      } catch {
        toast.error("변형 지문 저장 중 오류가 발생했습니다.");
        return false;
      }
    },
    [loadPassages],
  );

  // ─── Extraction (이미지·PDF) — 문제생성과 동일하게 자동 승격 후 내 지문함 반영 ───
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

  // ─── Deep link (?draftIds=) → workspace rows (extraction drafts) ───
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

  const mergeIntoWorkspace = useCallback((incoming: PassageInputRow[]) => {
    if (incoming.length === 0) return;
    const prev = rowsRef.current;
    // 기존 행은 그대로 두고, 새로 불러온 지문은 모두 펼친 채로 붙인다.
    const base = prev.length === 1 && isPristineEmptyRow(prev[0]) ? [] : prev;
    const expanded = incoming.map((r) => ({ ...r, collapsed: false }));
    const next = [...base, ...expanded];
    rowsRef.current = next;
    setRows(next);
    setFormCollapsed(false);
    setWorkspaceOpen(true);
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
        const incoming = drafts
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
        mergeIntoWorkspace(incoming);
        toast.success(`${incoming.length}개 지문을 워크스페이스에 불러왔습니다.`);
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "추출 지문을 불러오지 못했습니다.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftIds, initialDraftIdsKey, mergeIntoWorkspace]);

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
          .map(({ passage, text }) =>
            makeRowFromSavedPassage({
              passageId: passage.id,
              title: passage.title?.trim() || "",
              content: text,
              source: passage.source?.trim() || null,
            }),
          );
        if (cancelled || incoming.length === 0) return;
        mergeIntoWorkspace(incoming);
        toast.success(
          incoming.length === 1
            ? "선택한 지문을 워크스페이스에 불러왔습니다."
            : `${incoming.length}개 지문을 워크스페이스에 불러왔습니다.`,
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
  }, [initialPassageIds, initialPassageIdsKey, mergeIntoWorkspace]);

  const effectivePublisher =
    publisher === "__CUSTOM__" ? publisherCustom : publisher;

  // Load saved prompts
  useEffect(() => {
    getCustomPrompts("PASSAGE_ANALYSIS").then((prompts) => {
      setSavedPrompts(prompts as SavedPrompt[]);
    });
  }, [setSavedPrompts]);

  // beforeunload warning while analyses run
  useEffect(() => {
    if (!hasActiveAnalysis) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveAnalysis]);

  // ─── Analyze every row in the workspace stack ───
  // passageId 가 있는 행(내 지문함에서 옴)은 그 Passage 를 업데이트하고, 없으면
  // 새 Passage 를 만든다. 어느 쪽이든 분석 엔진에 큐잉해 백그라운드로 생성한다.
  const handleAnalyzeRows = useCallback(
    async (
      plan: QuestionGenerationPlan,
      options?: { includeWorksheet?: boolean },
    ) => {
      const includeWorksheet = options?.includeWorksheet === true;
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
            const annotations =
              row.annotations.length > 0
                ? row.annotations.map((a) => ({
                    id: a.id,
                    type: a.type,
                    text: a.text,
                    memo: a.memo,
                    from: a.from,
                    to: a.to,
                  }))
                : undefined;

            let passageId: string;
            if (row.passageId) {
              // 내 지문함에서 온 행 → 기존 Passage 업데이트(중복 생성 방지).
              const upd = await updateWorkbenchPassage(row.passageId, {
                title: rowTitle,
                content: text,
                schoolId: normalizedSchoolId || undefined,
                grade: parsedGrade,
                semester: semester || undefined,
                unit: trimmedUnit || undefined,
                publisher: effectivePublisher || undefined,
                source: rowSource,
                tags: sharedTags,
              });
              if (!upd.success) throw new Error(upd.error || "UPDATE_FAILED");
              if (annotations) {
                await savePassageAnnotations(row.passageId, annotations);
              }
              passageId = row.passageId;
            } else {
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
                annotations,
              });
              if (!result.success || !result.id) {
                throw new Error(result.error || "CREATE_FAILED");
              }
              passageId = result.id;
            }

            const combinedPrompt = buildAnalysisPrompt(
              analysisPrompt,
              row.annotations,
            );

            const queuedItem = {
              passage: {
                id: passageId,
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
                includeWorksheet,
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
            `${success}개 지문 학습지 생성을 시작했어요. 백그라운드에서 진행됩니다(동시 3개씩).`,
          );
          rowsRef.current = [];
          setRows([]);
          // 생성 시작 후 워크스페이스를 닫고 내 지문함으로 복귀해 진행 상황을 본다.
          setWorkspaceOpen(false);
          setIntakeView("library");
          void loadPassages();
          triggerRefresh();
        }
        if (failed > 0) {
          toast.error(`${failed}개 지문 처리에 실패했습니다.`);
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
      loadPassages,
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

  // ─── 카드 '상세 보기' → 지문 상세 모달 (문제생성과 동일한 ExtractionDetailModal) ───
  // 학습지(분석 결과)를 바로 띄우는 게 아니라, 페이지를 떠나지 않고 원문/복원문/
  // 복원 근거 + '학습자료 열기·추가생성' 팝업을 띄운다.
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  const openDetailById = useCallback(
    (passageId: string) => {
      const p = passages.find((x) => x.id === passageId);
      if (p) setDetailPassage(p);
    },
    [passages],
  );

  return (
    <TooltipProvider>
      <div className="-mx-6 -mt-6 min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
        <main className="flex w-full min-w-0 flex-col gap-4">
          {/* ─── 직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스 ─── */}
          <FormSectionContainer
            academyId={academyId}
            formCollapsed={formCollapsed}
            setFormCollapsed={setFormCollapsed}
            rows={rows}
            setRows={setRows}
            analyzing={bulkAnalyzing}
            onAnalyze={handleAnalyzeRows}
            onAddPassage={handleAddPassageFromWorkspace}
            onAddVariant={handleAddVariant}
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
            intakeView={intakeView}
            setIntakeView={setIntakeView}
            intakeTab={intakeTab}
            setIntakeTab={setIntakeTab}
            onExtractionBegin={handleExtractionBegin}
            onExtractionResult={handleExtractionResult}
            extractionPending={extractionPending}
            workspaceOpen={workspaceOpen}
            setWorkspaceOpen={setWorkspaceOpen}
            workspaceActive={workspaceActive}
            onSubmitPastedRows={handleCreatePastedPassages}
            pasteSaving={pasteSaving}
            libraryLabel="내 지문함"
            examBrowser={
              <ExamPassageLibrary
                onPick={handleImportExamPassages}
                busy={examImporting}
                pickLabel="다음으로 (내 지문함)"
              />
            }
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
                learningGeneratingPassageIds={learningGeneratingPassageIds}
                learningCompletedPassageIds={freshLearningPassageIds}
                onEditSelected={handleLoadSelectedToWorkspace}
                workspacePassageIds={workspacePassageIds}
                workspaceActive={workspaceActive}
                handleOpenAnalysisModal={openDetailById}
                onViewPassageContent={setDetailPassage}
              />
            }
          />
        </main>

        {/* ─── 지문 상세 모달 — 원문/복원문/복원 근거 + 학습자료 열기·추가생성.
            페이지를 떠나지 않고 뜬다(문제생성과 동일). ─── */}
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
      </div>
    </TooltipProvider>
  );
}
