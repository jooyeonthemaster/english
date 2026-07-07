"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ShoppingBasket, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { getPassageAnalysisCreditCost } from "@/lib/passage-analysis-credit-costs";
import {
  MobileStepHeader,
  MobileStepNav,
  useIsMobileViewport,
  type MobileFlowStep,
} from "@/components/workbench/mobile-step-flow";
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

// ── 모바일 스텝 플로우 (<lg 전용) ──
// 한 화면 = 한 기능: 지문 입력 → 내 지문함 → 워크스페이스 → 학습지 확인.
// PC(≥lg)는 기존 통합 레이아웃 그대로 — 숨김은 전부 lg:hidden / max-lg: 라서
// 데스크톱 DOM/동작에는 영향이 없다(문제 생성 페이지와 동일한 메커니즘).
type MobileStep = "input" | "library" | "workspace" | "results";
const MOBILE_FLOW_STEPS: readonly MobileFlowStep[] = [
  { key: "input", label: "지문 입력" },
  { key: "library", label: "내 지문함" },
  { key: "workspace", label: "워크스페이스" },
  { key: "results", label: "학습지 확인" },
];

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
  subjectScope,
  resultsSlot,
}: PassageRegistrationProps & {
  /**
   * 하단 '학습지 목록'(LearningListWithQueue) 노드 — 서버(page.tsx)가 만들어
   * 넘긴다. PC 에서는 폼 아래에 그대로 쌓이고, 모바일에서는 '학습지 확인' 스텝
   * 에서만 노출한다(문제 생성의 EmbeddedQuestionBank 위치와 동일 역할).
   */
  resultsSlot?: ReactNode;
  /**
   * 과목 스코프 — "KOREAN" 이면 국어 학습지 생성 라우트(/director/korean/passages/create)
   * 에서 렌더된다. 미전달(undefined) = 영어 기본(기존 동작 한 줄도 안 바뀜, 무회귀).
   * 지원되는 생성 액션(직접입력·변형 = createDirectInputPassageMaterial)에 subject 를
   * 전파해 새 지문이 Passage.subject="KOREAN" 으로 적재되게 한다.
   */
  subjectScope?: "KOREAN";
}) {
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
    handleCopyPassagesToCollection,
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

  // ── 학습지 구성(기본/실전 포함) — 하단 고정 바의 '생성하기'가 이 값을 써야
  //    하므로 워크스페이스 스택에서 이 컴포넌트로 끌어올린다(PC 는 스택 내부
  //    푸터가 같은 값을 그대로 쓴다 — 같은 저장 키 공유). ──
  const [includeWorksheet, setIncludeWorksheet] = usePersistedState<boolean>(
    "smoat:passages-create:include-worksheet",
    false,
    (v): v is boolean => typeof v === "boolean",
  );

  // ── 모바일 스텝 플로우 상태 ──
  const searchParams = useSearchParams();
  const isMobileViewport = useIsMobileViewport();
  // 워크스페이스 스텝 하단 '담긴 지문' 장바구니 펼침 상태(모바일).
  const [workspaceCartOpen, setWorkspaceCartOpen] = useState(false);
  // 내 지문함(library) 스텝 하단 '담긴 지문'(선택한 지문) 장바구니 펼침 상태(모바일).
  const [libraryCartOpen, setLibraryCartOpen] = useState(false);
  // ?step= 딥링크/복원 — 워크스페이스는 메모리 기반이라 새로 열면 항상 비어 있어
  // 지문함으로 대체한다.
  const initialMobileStepRef = useRef<MobileStep | null>(
    (() => {
      const raw = searchParams.get("step");
      if (raw === "input" || raw === "library" || raw === "results") return raw;
      if (raw === "workspace") return "library";
      return null;
    })(),
  );
  const [mobileStep, setMobileStep] = useState<MobileStep>(
    initialMobileStepRef.current ??
      (initialPassageIds && initialPassageIds.length > 0 ? "library" : "input"),
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
          // 국어 라우트에서 만든 변형 지문은 Passage.subject="KOREAN" 으로 적재해
          // 국어 화면에서만 보이게 한다. 미전달(영어) = 기존 영어 버킷 그대로(무회귀).
          subject: subjectScope,
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
    [loadPassages, subjectScope],
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
                // 국어 라우트 등록이면 Passage.subject="KOREAN" 태깅(국어 지문함 노출).
                subject: subjectScope,
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

  // ── 모바일 스텝 플로우: 전환 + URL(?step=) 동기화 ──
  // 스텝이 가리키는 인테이크/워크스페이스 상태를 함께 맞춘다. results 는 하단
  // 결과 섹션만 보여주므로 인테이크 상태를 건드리지 않는다(뒤로가면 그대로 복귀).
  const applyMobileStep = useCallback((step: MobileStep) => {
    setMobileStep(step);
    if (step === "input") {
      setWorkspaceOpen(false);
      setIntakeView("intake");
    } else if (step === "library") {
      setWorkspaceOpen(false);
      setIntakeView("library");
    } else if (step === "workspace") {
      setWorkspaceOpen(true);
    }
  }, []);

  const pushMobileStepUrl = useCallback((step: MobileStep) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") === step) return;
    url.searchParams.set("step", step);
    // router.push 대신 네이티브 pushState — 서버 리페치 없이 히스토리만 쌓아
    // 브라우저 뒤로가기가 '이전 단계'로 동작하게 한다.
    window.history.pushState(null, "", url.toString());
  }, []);

  const goToMobileStep = useCallback(
    (step: MobileStep) => {
      applyMobileStep(step);
      pushMobileStepUrl(step);
      window.scrollTo({ top: 0 });
    },
    [applyMobileStep, pushMobileStepUrl],
  );

  // 모바일 첫 진입 정렬 — 이 페이지는 intakeView 기본값이 "library"(PC 는 내
  // 지문함으로 열림)라, 모바일 스텝이 처음 감지될 때 현재 스텝에 맞춰 인테이크
  // 상태를 강제 정렬한다. 이게 없으면 아래 단방향 동기화가 첫 렌더에서 스텝을
  // "library"로 밀어 1단계(지문 입력)를 건너뛴다. PC(≥lg)에서는 실행되지 않아
  // 데스크톱 기본(내 지문함)은 그대로다.
  const didInitMobileStepRef = useRef(false);
  useEffect(() => {
    if (!isMobileViewport || didInitMobileStepRef.current) return;
    didInitMobileStepRef.current = true;
    applyMobileStep(mobileStep);
  }, [isMobileViewport, applyMobileStep, mobileStep]);

  // 브라우저 뒤로/앞으로 — URL 의 step 을 그대로 적용.
  useEffect(() => {
    if (!isMobileViewport) return;
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("step");
      const step: MobileStep =
        raw === "library" || raw === "workspace" || raw === "results"
          ? raw
          : "input";
      applyMobileStep(step);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMobileViewport, applyMobileStep]);

  // 기존 UI 동작(불러오기 성공 시 워크스페이스 자동 열림, 등록 후 지문함 전환
  // 등)이 intakeView/workspaceOpen 을 바꾸면 스텝을 뒤따라 맞춘다 — 스텝을
  // 모르는 기존 핸들러를 하나도 고치지 않기 위한 단방향 동기화. results 에서는
  // 인테이크 상태가 화면 밖(숨김)이므로 동기화하지 않는다.
  useEffect(() => {
    if (!isMobileViewport) return;
    if (mobileStep === "results") return;
    const derived: MobileStep = workspaceOpen
      ? "workspace"
      : intakeView === "library"
        ? "library"
        : "input";
    if (derived !== mobileStep) {
      setMobileStep(derived);
      pushMobileStepUrl(derived);
      window.scrollTo({ top: 0 });
    }
  }, [
    isMobileViewport,
    workspaceOpen,
    intakeView,
    mobileStep,
    pushMobileStepUrl,
  ]);

  // ── 모바일 하단 이전/다음 바 구성 ──
  const validRowCount = useMemo(
    () =>
      rows.filter((r) => r.content.trim().length >= MIN_CONTENT_CHARS).length,
    [rows],
  );
  const learningCreditTotal =
    getPassageAnalysisCreditCost({ includeWorksheet }) *
    Math.max(1, validRowCount);

  const mobilePrev =
    mobileStep === "input"
      ? null
      : {
          label: "이전",
          onClick: () =>
            goToMobileStep(
              mobileStep === "library"
                ? "input"
                : mobileStep === "workspace"
                  ? "library"
                  : workspaceActive
                    ? "workspace"
                    : "library",
            ),
        };

  const mobileNext = (() => {
    if (mobileStep === "input") {
      // 직접 입력 탭 등 소스 보드는 자체 하단 고정 바(등록/추출/담기)를 렌더하므로
      // 이 분기는 폴백일 뿐 — 공용 네비는 boardFixedFooterActive 로 숨겨진다.
      return {
        label: "내 지문함으로",
        onClick: () => goToMobileStep("library"),
      };
    }
    if (mobileStep === "library") {
      // 선택한 지문이 있으면 '다음'이 곧 워크스페이스 담기(PC '워크스페이스로'와
      // 같은 핸들러). 담기 성공 시 workspaceOpen 이 켜지고 동기화가 스텝을 넘긴다.
      if (selectedIds.size > 0)
        return {
          label: `선택 ${selectedIds.size}개 워크스페이스로`,
          onClick: () => handleLoadSelectedToWorkspace(),
        };
      if (workspaceActive)
        return {
          label: "워크스페이스로",
          onClick: () => goToMobileStep("workspace"),
        };
      // 비활 사유 = 선택 0개 → 눌러도 막지 말고 지문 카드를 글로우해 선택을 유도.
      return {
        label: "워크스페이스로",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(document.body, "[data-drag-item-id]", {
            max: 24,
            scrollBlock: "center",
          }),
      };
    }
    if (mobileStep === "workspace") {
      // 담긴 지문 중 유효(20자 이상)한 게 하나라도 있으면 → 전 지문 일괄 학습지
      // 생성. 생성이 시작되면 handleAnalyzeRows 가 워크스페이스를 비우고 지문함
      // 으로 복귀시키므로, 곧바로 '학습지 확인' 스텝으로 이동해 진행 큐를 본다.
      if (validRowCount > 0)
        return {
          label: bulkAnalyzing
            ? "생성 시작 중…"
            : `학습지 ${validRowCount}개 생성 (${learningCreditTotal.toLocaleString("ko-KR")} 크레딧)`,
          disabled: bulkAnalyzing,
          onClick: () => {
            void handleAnalyzeRows("STANDARD", { includeWorksheet });
            goToMobileStep("results");
          },
        };
      // 담긴 지문이 없거나 전부 짧음 → 비활성. 눌러도 막지 말고 지문 카드/추가
      // 버튼을 글로우해 지문 입력을 유도한다.
      return {
        label: "학습지 생성",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(document.body, "[data-passage-row-card]", {
            scrollBlock: "center",
          }),
      };
    }
    // results 스텝: 다음 버튼 없음(마지막 단계).
    return null;
  })();

  const mobileNextHint =
    mobileStep === "library" && selectedIds.size === 0 && !workspaceActive
      ? "지문 카드를 선택하면 워크스페이스로 보낼 수 있어요"
      : undefined;

  // 소스 보드(직접 입력·파일업로드·기출)는 각자 하단 고정 액션 바를 렌더하므로,
  // 지문 입력 스텝에서는 공용 스텝 네비를 숨기고 그 높이만큼 아래 여백을 예약한다.
  const boardFixedFooterActive =
    mobileStep === "input" &&
    intakeView === "intake" &&
    (intakeTab === "upload" || intakeTab === "paste" || intakeTab === "exam");

  // ── 워크스페이스 하단 고정 '담긴 지문' 장바구니 (모바일) ──
  // 워크스페이스에 담긴 지문들이 여기 모여, 펼치면 목록·빼기. 바로 아래 '학습지
  // 생성' 버튼이 담긴 전 지문으로 학습지를 만든다(문제 생성 장바구니와 동형).
  const cartRows = useMemo(
    () => rows.filter((r) => !isPristineEmptyRow(r)),
    [rows],
  );
  const removeCartRow = (localId: string) =>
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  const workspaceCart = (
    <>
      {workspaceCartOpen && cartRows.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {cartRows.map((r, i) => (
              <div
                key={r.localId}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
              >
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {r.title?.trim() || "제목 없는 지문"}
                </span>
                <button
                  type="button"
                  onClick={() => removeCartRow(r.localId)}
                  aria-label="담은 지문 빼기"
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
        onClick={() => setWorkspaceCartOpen((open) => !open)}
        aria-expanded={workspaceCartOpen}
        aria-label={
          workspaceCartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"
        }
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {cartRows.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {cartRows.length}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 지문 {cartRows.length}개
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {cartRows.length > 0
              ? "탭하여 담긴 지문 보기·빼기"
              : "내 지문함에서 지문을 담으면 여기 모여요"}
          </span>
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-slate-400 transition-transform" +
            (workspaceCartOpen ? " rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>
    </>
  );

  // ── 내 지문함(library) 하단 고정 '담긴 지문' 장바구니 (모바일) ──
  // 내 지문함에서 체크한 지문들이 여기 모여, 펼치면 목록·빼기. 바로 아래 '워크스페이스로'
  // 버튼이 담긴 지문을 워크스페이스로 보낸다(워크스페이스/문제생성 장바구니와 동형).
  const librarySelectedPassages = useMemo(
    () => passages.filter((p) => selectedIds.has(p.id)),
    [passages, selectedIds],
  );
  const libraryCart = (
    <>
      {libraryCartOpen && librarySelectedPassages.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {librarySelectedPassages.map((p, i) => (
              <div
                key={p.id}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
              >
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {p.title?.trim() || "제목 없는 지문"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCheckbox(p.id)}
                  aria-label="선택에서 빼기"
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
        onClick={() => setLibraryCartOpen((open) => !open)}
        aria-expanded={libraryCartOpen}
        aria-label={
          libraryCartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"
        }
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {librarySelectedPassages.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {librarySelectedPassages.length}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 지문 {librarySelectedPassages.length}개
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {librarySelectedPassages.length > 0
              ? "탭하여 담긴 지문 보기·빼기"
              : "지문 카드를 선택하면 여기 모여요"}
          </span>
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-slate-400 transition-transform" +
            (libraryCartOpen ? " rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>
    </>
  );

  return (
    <TooltipProvider>
      <div className="-mx-6 -mt-6 min-w-0 bg-[#F4F6F9] px-2 py-4 sm:px-4 lg:px-6 xl:px-8">
        <main
          className={
            // 모바일: 스텝퍼(1·2·3·4) 위에 문제생성과 동일한 상단 여백(약 10px)을 준다.
            // (학습지 페이지는 page.tsx 의 gap-6 래퍼 때문에 -mt-6 이 12px 더 당겨져
            //  스텝퍼가 앱바에 붙는다). 데스크톱은 lg:pt-0 으로 기존 그대로.
            "flex w-full min-w-0 flex-col gap-4 pt-3 lg:pt-0 " +
            // 하단 고정 바에 마지막 콘텐츠가 가리지 않게 모바일 여백 예약.
            // 소스 보드는 자체 고정 바, 워크스페이스는 장바구니+생성 바라 더 두껍다.
            (boardFixedFooterActive
              ? "max-lg:pb-[140px]"
              : mobileStep === "workspace"
                ? "max-lg:pb-[150px]"
                : mobileStep === "results"
                  ? "max-lg:pb-1"
                  : "max-lg:pb-[76px]")
          }
        >
          {/* 모바일 전용 스테퍼 — 현재 단계 표시 + 탭으로 즉시 이동 */}
          <MobileStepHeader
            steps={MOBILE_FLOW_STEPS}
            currentKey={mobileStep}
            onSelect={(key) => goToMobileStep(key as MobileStep)}
          />
          {/* ─── 직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스 ───
              모바일 '학습지 확인' 스텝에서는 이 폼을 숨기고(언마운트 아님 — 진행 중
              입력·워크스페이스 상태 유지) 아래 결과 섹션만 보여준다. */}
          <div className={mobileStep === "results" ? "max-lg:hidden" : undefined}>
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
            mobileStepTabs={mobileStep === "input" ? "sources" : "hidden"}
            includeWorksheet={includeWorksheet}
            setIncludeWorksheet={setIncludeWorksheet}
            libraryLabel="내 지문함"
            examBrowser={
              <ExamPassageLibrary
                onPick={handleImportExamPassages}
                busy={examImporting}
                pickLabel="다음으로 (내 지문함)"
                // 모바일: '다음으로 (내 지문함)' 선택 바를 하단 고정(스텝 플로우).
                mobileFixedFooter
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
                onCopyPassagesToCollection={handleCopyPassagesToCollection}
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
          </div>
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

      {/* ─── 학습지 목록 (진행 큐 포함) — 서버가 넘긴 노드. PC 에서는 위 회색 폼
          박스 밖 아래에 그대로 쌓이고(기존과 동일한 형제 위치·gap-6), 모바일에서는
          '학습지 확인' 스텝에서만 노출한다. ─── */}
      {resultsSlot ? (
        <section
          className={
            "flex flex-col gap-2" +
            (mobileStep === "results"
              ? " max-lg:pb-[76px]"
              : " max-lg:hidden")
          }
        >
          {resultsSlot}
        </section>
      ) : null}

      {/* 모바일 전용 하단 고정 이전/다음 바 — 소스 보드 스텝은 각 보드가 자체
          고정 바를 렌더하므로 숨긴다(중복 방지). fixed 라 위치는 무관. */}
      {!boardFixedFooterActive ? (
        <MobileStepNav
          prev={mobilePrev}
          next={mobileNext}
          hint={mobileNextHint}
          // 내 지문함/워크스페이스 스텝: 이전/다음 버튼 위에 '담긴 지문' 장바구니를 얹는다.
          cart={
            mobileStep === "library"
              ? libraryCart
              : mobileStep === "workspace"
                ? workspaceCart
                : undefined
          }
        />
      ) : null}
    </TooltipProvider>
  );
}
