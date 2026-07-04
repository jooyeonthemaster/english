// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Loader2, ShoppingBasket, SquarePen, X, XCircle } from "lucide-react";
import { QuestionReviewModal } from "@/components/workbench/question-review-modal";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { PassageContentModal } from "@/components/workbench/passage-content-modal";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  addPassagesToCollection,
  approveWorkbenchQuestion,
  bulkApproveWorkbenchQuestions,
  bulkDeleteWorkbenchPassages,
  bulkDeleteWorkbenchQuestions,
  createPassageCollection,
  updatePassageCollection,
  deleteWorkbenchQuestion,
  removePassagesFromCollection,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import {
  type PassageItem,
  type PassageCollectionItem,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  questionSignature,
  type PassageSortOrder,
} from "./generate-page-types";
import { PassageCardGrid } from "./passage-card-grid";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";
import {
  IntakeSurface,
  type IntakeView,
  type IntakeTab,
} from "./intake/intake-surface";
import { GenerateUploadPanel } from "./intake/generate-upload-panel";
import { ExamPassageLibrary } from "@/components/workbench/exam-passage-library";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import { useGenerateExtraction } from "./intake/use-generate-extraction";
import { ExtractionLoadingCards } from "./intake/extraction-loading-cards";
import { ExtractionDetailModal } from "./intake/extraction-detail-modal";
import { useTaskQueue } from "@/components/workbench/task-queue/context";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import { GenerationConfigPanel } from "./generation-config-panel";
import { EmbeddedQuestionBank } from "./embedded-question-bank";
import { useGenerationHandlers } from "./use-generation-handlers";
import { useGenerationSessionQueue } from "./generation-session-store";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  getDefaultQuestionTypeGenerationSettings,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import {
  MobileStepHeader,
  MobileStepNav,
  useIsMobileViewport,
} from "@/components/workbench/mobile-step-flow";
import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkspaceShell } from "./workspace-shell";
import {
  countWords,
  diffQuestionTypeSettings,
  isOverrideEmpty,
  overrideHasTypeCounts,
  rowNeedsVariant,
  type RowOverride,
} from "./workspace/workspace-types";
import { useWorkspaceRows } from "./workspace/use-workspace-rows";
import { useWorkspaceGeneration } from "./workspace/use-workspace-generation";
import { PassageWorkspace } from "./workspace/passage-workspace";
import { PassageGenerateModal } from "./workspace/passage-generate-modal";
import { LearningGenerationIndicator } from "@/components/workbench/learning-generation-indicator";
import { useLearningGenerationTasks } from "@/lib/learning-generation-tracker";
import {
  usePassageAnalysisActivity,
  notePassageAnalysisStarted,
  notePassageAnalysisStartFailed,
} from "@/hooks/use-passage-analysis-activity";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { GeneratePageTour } from "./tutorial/generate-page-tour";
import {
  dispatchGenerateTourMilestone,
  openGenerateTour,
} from "@/lib/generate-tour-demo";

// 튜토리얼(문제 생성 투어) 임시 비활성화 — 미완성 기능이라 배포에서 숨긴다.
// 재활성화: 아래 값을 true 로 바꾸면 "튜토리얼" 버튼과 투어 오버레이가 다시 노출된다.
const GENERATE_TUTORIAL_ENABLED = false;

// ─── Helpers ─────────────────────────────────────────────

const REVIEW_ACTION_TIMEOUT_MS = 30_000;

// ── 모바일 스텝 플로우 (<lg 전용) ──
// 한 화면 = 한 기능: 지문 입력 → 내 지문함 → 워크스페이스 → 문제 확인.
// PC(≥lg)는 기존 통합 레이아웃 그대로 — 숨김은 전부 max-lg: 클래스라서
// 데스크톱 DOM/동작에는 영향이 없다.
type MobileStep = "input" | "library" | "workspace" | "results";
const MOBILE_FLOW_STEPS = [
  { key: "input", label: "지문 입력" },
  { key: "library", label: "내 지문함" },
  { key: "workspace", label: "워크스페이스" },
  { key: "results", label: "문제 확인" },
] as const;

/** Build a passage title from the first non-empty line of pasted content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException) ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

async function fetchReviewAction(input: RequestInfo | URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REVIEW_ACTION_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

const UNDO_TOAST_DURATION = 8000;
const SAVED_QUESTIONS_DONE_REFRESH_DELAY_MS = 1500;

// ─── Component ───────────────────────────────────────────

export function GeneratePageClient({
  academyId,
  defaultMode = "manual",
}: {
  academyId: string;
  defaultMode?: "manual";
}) {
  const searchParams = useSearchParams();
  const taskQueue = useTaskQueue();
  const [generateTourOpen, setGenerateTourOpen] = useState(false);
  const [
    generateTourResultHighlightCount,
    setGenerateTourResultHighlightCount,
  ] = useState(0);

  // 백그라운드로 돌고 있는 학습자료 생성 — 지문 카드 배지 + 우하단 버퍼링 창.
  // (usePassageAnalysisActivity 호출은 loadPassages 정의 뒤에 있다 — 완료
  // 시점에 목록을 다시 불러 카드를 "분석 완료" 모습으로 즉시 바꾸기 위해.)
  const learningGenerationTasks = useLearningGenerationTasks();

  // ── Deep-link context (from /import or detail page) ──
  // Accept `?passageIds=cuid1,cuid2` for pre-selection,
  // and `?mode=auto|manual` to decide which config panel opens.
  //
  // Defensive parsing: URL may be percent-encoded, contain stray whitespace,
  // or be maliciously stuffed — we decode, split on comma, filter empties,
  // 마키(영역 드래그) 시작 영역을 "생성된 문제" 섹션 전체로 넓힌다(카드만 선택). 상단의
  // 지문 그리드(PassageCardGrid)는 자체 스크롤 영역을 boundary 로 쓰므로 서로 겹치지 않는다.
  const bottomQueueBoundaryRef = useRef<HTMLElement>(null);
  const previousSessionQueueLengthRef = useRef<number | null>(null);
  // dedupe and cap at 100 ids so downstream `Set` construction + the cross-
  // tenant validity filter (useEffect below) never have to chew on junk.
  const initialPassageIdsRef = useRef<string[]>(
    (() => {
      const raw = searchParams.get("passageIds") || "";
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        decoded = raw;
      }
      const parts = decoded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Dedupe while preserving order, cap at 100.
      const seen = new Set<string>();
      const out: string[] = [];
      for (const id of parts) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= 100) break;
      }
      return out;
    })(),
  );
  // 자동 생성 제거 — ?mode=auto 딥링크는 더 이상 지원하지 않고 '유형 지정'으로 연다.
  const initialModeRef = useRef<"manual">(
    searchParams.get("mode") === "manual" ? "manual" : defaultMode,
  );
  const prefillAppliedRef = useRef(false);

  // ?step= 딥링크/복원 — 모바일 스텝 플로우의 초기 단계. 워크스페이스는
  // 메모리 기반이라 새로 열면 항상 비어 있으므로 지문함으로 대체한다.
  const initialMobileStepRef = useRef<MobileStep | null>(
    (() => {
      const raw = searchParams.get("step");
      if (raw === "input" || raw === "library" || raw === "results") return raw;
      if (raw === "workspace") return "library";
      return null;
    })(),
  );

  // ── Passage data ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [loadingPassages, setLoadingPassages] = useState(true);
  const [freshAnalysisPassageIds, setFreshAnalysisPassageIds] = useState<
    Set<string>
  >(() => new Set());
  // 방금 학습자료 생성(분석)이 완료된 지문 — 카드에 초록 글로우.
  // 추출 완료(freshAnalysisPassageIds, 파란 글로우)와 색으로 구분된다.
  const [freshLearningPassageIds, setFreshLearningPassageIds] = useState<
    Set<string>
  >(() => new Set());
  // 이번 세션에서 추출 완료된 지문 id — 추출한 순서 그대로 그리드 맨 앞에
  // 고정하는 데 쓴다(최근 배치가 앞). "newest" 정렬에서만 적용.
  const [recentExtractionPassageIds, setRecentExtractionPassageIds] = useState<
    string[]
  >([]);
  const [reviewActionPassageIds, setReviewActionPassageIds] = useState<
    Set<string>
  >(() => new Set());
  const [reviewBulkActionRunning, setReviewBulkActionRunning] = useState(false);

  // ── Collections ──
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  // ── Intake/library panel (지문 추가 ↔ 내 지문) ──
  // Default to the intake surface, unless the user deep-linked passageIds (then
  // show the library so they see the pre-selection land).
  const [intakeView, setIntakeView] = useState<IntakeView>(
    initialPassageIdsRef.current.length > 0 ||
      initialMobileStepRef.current === "library"
      ? "library"
      : "intake",
  );
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");
  // 모바일(<lg) 현재 스텝 — PC 렌더링에는 관여하지 않는다.
  const [mobileStep, setMobileStep] = useState<MobileStep>(
    initialMobileStepRef.current ??
      (initialPassageIdsRef.current.length > 0 ? "library" : "input"),
  );
  // 직접 입력 보드 연동 — 하단 고정 바의 '다음'이 등록(다음으로 내 지문함)
  // 버튼을 대신한다. ref 로 시작 동작을, 콜백으로 누적 수·작업 상태를 받는다.
  const pasteStartRef = useRef<(() => void) | null>(null);
  const [pasteBoard, setPasteBoard] = useState({ count: 0, busy: false });
  const handlePasteBoardState = useCallback(
    (state: { count: number; busy: boolean }) => setPasteBoard(state),
    [],
  );
  const [pasteSaving, setPasteSaving] = useState(false);
  const [passageBulkAction, setPassageBulkAction] = useState<
    "move" | "remove" | "delete" | null
  >(null);

  // ── Search/filter state ──
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] =
    useState<PassageAnalysisStatusFilter>("all");
  const [passageSortOrder, setPassageSortOrder] =
    useState<PassageSortOrder>("newest");

  // ── Selected passage ──
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(
    null,
  );
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // ── Mode: 유형 지정 vs 장문 세트 (seeded from ?mode= URL param) ──
  const [genMode, setGenMode] = useState<"manual" | "set">(
    initialModeRef.current,
  );
  const [generationPlan, setGenerationPlan] =
    useState<QuestionGenerationPlan>("STANDARD");

  // ── Manual mode config ──
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [questionTypeSettings, setQuestionTypeSettings] =
    useState<QuestionTypeGenerationSettings>(() =>
      getDefaultQuestionTypeGenerationSettings(),
    );
  const [difficulty, setDifficulty] = useState<
    "BASIC" | "INTERMEDIATE" | "KILLER"
  >("INTERMEDIATE");
  const [customPrompt, setCustomPrompt] = useState("");

  // ── Saved prompts ──
  const [savedPrompts, setSavedPrompts] = useState<
    { id: string; name: string; content: string }[]
  >([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // ── Session queue ──
  const [sessionQueue, setSessionQueue] = useGenerationSessionQueue();
  const [queueFilter, setQueueFilter] = useState<"all" | "error">("all");

  useEffect(() => {
    const previousLength = previousSessionQueueLengthRef.current;
    previousSessionQueueLengthRef.current = sessionQueue.length;

    if (previousLength === null || sessionQueue.length <= previousLength) {
      return;
    }

    window.requestAnimationFrame(() => {
      bottomQueueBoundaryRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [sessionQueue.length]);

  // ── Review modal ──
  const [reviewModalId, setReviewModalId] = useState<string | null>(null);

  // ── Checkbox multi-select (seeded from ?passageIds= URL param) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialPassageIdsRef.current),
  );

  // ── 지문 워크스페이스 (불러오기 → 편집·AI 변형 → 생성) ──
  const workspaceApi = useWorkspaceRows();
  // 워크스페이스가 '내 지문함'을 덮어 표시되는지 여부. true면 가운데 컬럼이
  // 내 지문함 대신 워크스페이스로 교체된다 (왼쪽 패널 모달 방식 폐기).
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  // 지문별 '문제 생성' 모달의 대상 행. 우측 사이드 설정 컬럼을 폐기하고, 각
  // 지문 카드의 '문제 생성' 버튼으로 이 지문만의 유형·난이도를 설정하는 모달을
  // 연다 — "어떤 지문의 설정인지" 혼동을 없애는 재설계의 핵심.
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [genModalOpen, setGenModalOpen] = useState(false);

  // ── Analysis detail modal ──
  const [analysisModalPassage, setAnalysisModalPassage] = useState<any>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);

  // ── 미분석 지문 전체 내용 뷰어 모달 ──
  // 분석이 없는 지문은 "상세 보기" 시 보고서 생성 CTA 대신 원문 전체를 보여준다.
  const [contentModalPassage, setContentModalPassage] =
    useState<PassageItem | null>(null);

  // 추출/입력 지문 "전체 보기" — 자료 추출 상세 모달(복원 근거 + 추출 이미지) 재사용.
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  // 방금 상세를 열어본 지문 id — 모달을 닫아도 유지해, 닫는 순간 해당 카드를
  // 한 번 배경 반짝임으로 강조한다(어디까지 봤는지 빠르게 찾게).
  const [lastViewedPassageId, setLastViewedPassageId] = useState<string | null>(
    null,
  );
  const handleViewPassageContent = useCallback((passage: PassageItem) => {
    setDetailPassage(passage);
    setLastViewedPassageId(passage.id);
  }, []);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);

  // ── Saved questions from DB (persists across page visits) ──
  const [savedQuestions, setSavedQuestions] = useState<QuestionCardItem[]>([]);
  const [loadingSavedQuestions, setLoadingSavedQuestions] = useState(true);

  // ── Deleted-question tombstones ──
  // The 현재 세션 cards are derived from AI jobs that re-poll every 5s, and the
  // job's questionIds survive even after we delete the underlying Question rows.
  // We keep a client-side tombstone set so deleted questions stay hidden in this
  // session instead of flickering back in on the next poll.
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Companion signature tombstones — a session card may resolve to its saved row
  // by signature (legacy jobs without aligned questionIds) rather than by id, so
  // the id set alone can't always hide it after deletion.
  const [deletedQuestionSignatures, setDeletedQuestionSignatures] = useState<
    Set<string>
  >(() => new Set());
  const [deletingQuestions, setDeletingQuestions] = useState(false);

  // Signature of a saved question, matching the session-queue card signature so
  // a deleted question can be tombstoned by signature as well as by id.
  const savedQuestionSig = useCallback(
    (q: QuestionCardItem) =>
      questionSignature({
        passageId: q.passage?.id,
        subType: q.subType,
        questionText: q.questionText,
        correctAnswer: q.correctAnswer,
        options: q.options,
      }),
    [],
  );

  // 지문별 "이미 생성된" 문제 수(실시간). 하단 생성/검수 결과(savedQuestions)는
  // 생성 완료 시 갱신되므로, 이를 지문 id 로 집계해 지문 카드의 서버 _count(페이지
  // 로드 시점 총계)와 합쳐(max) 뱃지에 쓴다 — 새로고침 없이 방금 생성한 문제도 반영.
  const questionCountByPassage = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of savedQuestions) {
      const pid = q.passage?.id;
      if (pid) map.set(pid, (map.get(pid) ?? 0) + 1);
    }
    return map;
  }, [savedQuestions]);

  // 지문별 생성된 문제 목록(요약 토글용). 지문 카드 하단에서 어떤 문제들이
  // 생성됐는지 펼쳐 보여준다.
  const questionsByPassage = useMemo(() => {
    const map = new Map<string, QuestionCardItem[]>();
    for (const q of savedQuestions) {
      const pid = q.passage?.id;
      if (!pid) continue;
      const list = map.get(pid);
      if (list) list.push(q);
      else map.set(pid, [q]);
    }
    return map;
  }, [savedQuestions]);

  // ── Question detail modal ──
  const [detailQuestion, setDetailQuestion] = useState<QuestionCardItem | null>(
    null,
  );
  // 로컬에서 문제를 삭제 처리(tombstone) — 5초 세션-큐 폴링이 되살리지 못하게
  // id/시그니처로 숨기고, 저장 목록·상세 모달에서도 제거한다. 실제 삭제와,
  // "이미 삭제된 좀비 문제"를 검수하려다 실패한 경우 모두 같은 정리 경로를 쓴다.
  const markQuestionDeletedLocally = useCallback(
    (deletedId: string) => {
      let deletedSig: string | null = null;
      setSavedQuestions((prev) => {
        const target = prev.find((q) => q.id === deletedId);
        if (target) deletedSig = savedQuestionSig(target);
        return prev.filter((q) => q.id !== deletedId);
      });
      setDeletedQuestionIds((prev) => {
        if (prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.add(deletedId);
        return next;
      });
      if (deletedSig) {
        setDeletedQuestionSignatures((prev) => {
          if (prev.has(deletedSig as string)) return prev;
          const next = new Set(prev);
          next.add(deletedSig as string);
          return next;
        });
      }
      setDetailQuestion((prev) => (prev?.id === deletedId ? null : prev));
    },
    [savedQuestionSig],
  );

  const editor = useQuestionEditor(markQuestionDeletedLocally);

  // ── Computed ──
  const totalQuestions = useMemo(
    () => Object.values(typeCounts).reduce((a, b) => a + b, 0),
    [typeCounts],
  );
  const activeTypes = useMemo(
    () => Object.keys(typeCounts).filter((k) => typeCounts[k] > 0),
    [typeCounts],
  );

  const filteredPassages = useMemo(() => {
    const result = passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.content.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !p.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && p.analysis) return false;
      if (
        selectedCollectionId &&
        !p.collectionItems?.some(
          (ci) => ci.collectionId === selectedCollectionId,
        )
      )
        return false;
      return true;
    });

    // 카드에 보이는 날짜는 "등록일(createdAt)" 이므로 최신순/오래된순도
    // createdAt 기준으로 정렬해 보이는 순서와 일치시킨다. (`passages` 자체는
    // 서버에서 updatedAt desc 로 도착하지만, 그 순서에 의존하면 수정된 지문이
    // 옛 등록일을 단 채 위로 올라와 뒤죽박죽으로 보인다.) Name sorts use ko locale.
    const createdTime = (p: PassageItem) =>
      p.createdAt ? new Date(p.createdAt).getTime() : 0;
    switch (passageSortOrder) {
      case "oldest":
        result.sort((a, b) => createdTime(a) - createdTime(b));
        break;
      case "name_asc":
        result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "name_desc":
        result.sort((a, b) => b.title.localeCompare(a.title, "ko"));
        break;
      case "newest":
      default:
        result.sort((a, b) => createdTime(b) - createdTime(a));
        // 방금 추출된 지문은 "추출한 순서" 그대로 맨 앞에 고정한다. 일괄
        // promote 가 지문별 createdAt/updatedAt 을 뒤섞을 수 있고, 재추출
        // dedup 은 기존(오래된) 행을 재사용하므로 시간 정렬만으로는 새
        // 추출분이 앞에 온다는 보장이 없다.
        if (recentExtractionPassageIds.length > 0) {
          const pinRank = new Map(
            recentExtractionPassageIds.map((id, i) => [id, i]),
          );
          const pinned: PassageItem[] = [];
          const rest: PassageItem[] = [];
          for (const p of result) {
            (pinRank.has(p.id) ? pinned : rest).push(p);
          }
          pinned.sort((a, b) => pinRank.get(a.id)! - pinRank.get(b.id)!);
          return [...pinned, ...rest];
        }
        break;
    }

    return result;
  }, [
    passages,
    passageSearch,
    filterSchool,
    filterGrade,
    filterSemester,
    analysisStatusFilter,
    selectedCollectionId,
    passageSortOrder,
    recentExtractionPassageIds,
  ]);

  const passageStatusCounts = useMemo(
    () => ({
      all: passages.length,
      analyzed: passages.filter((p) => !!p.analysis).length,
      unanalyzed: passages.filter((p) => !p.analysis).length,
    }),
    [passages],
  );

  const filteredQueue = useMemo(() => {
    if (queueFilter === "all") return sessionQueue;
    if (queueFilter === "error")
      return sessionQueue.filter((q) => q.status === "error");
    return sessionQueue;
  }, [sessionQueue, queueFilter]);

  const reviewItem = useMemo(
    () => sessionQueue.find((q) => q.id === reviewModalId) || null,
    [sessionQueue, reviewModalId],
  );

  const queueCounts = useMemo(
    () => ({
      generating: sessionQueue.filter((q) => q.status === "generating").length,
      done: sessionQueue.filter(
        (q) => q.status === "done" || q.status === "reviewed",
      ).length,
      error: sessionQueue.filter((q) => q.status === "error").length,
    }),
    [sessionQueue],
  );

  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length +
    (analysisStatusFilter === "all" ? 0 : 1);

  // ── Load passages ──
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      const response = await fetch(
        `/api/passages/list?academyId=${academyId}&includeUnreviewed=true`,
      );
      const data = await response.json();
      setPassages(data.passages || []);
      if (data.filters) setFilterOptions(data.filters);
      if (data.collections) setCollections(data.collections);
    } catch {
      /* ignore */
    } finally {
      setLoadingPassages(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // 특정 지문만 다시 받아 기존 배열에 제자리 병합한다. loadPassages 와 달리
  // 로딩 상태를 켜지 않아 그리드 전체가 "새로고침"되는 느낌 없이 해당 카드만
  // 분석 완료 모습으로 바뀐다. 목록에 없는 지문은 건드리지 않는다.
  const patchPassages = useCallback(
    async (passageIds: string[]) => {
      if (passageIds.length === 0) return;
      try {
        const params = new URLSearchParams({
          academyId,
          passageIds: passageIds.join(","),
        });
        const response = await fetch(`/api/passages/list?${params}`);
        const data = await response.json();
        const fetched: PassageItem[] = data.passages || [];
        if (fetched.length === 0) return;
        const byId = new Map(fetched.map((p) => [p.id, p]));
        setPassages((prev) => prev.map((p) => byId.get(p.id) ?? p));
      } catch {
        /* ignore — 다음 전체 로드에서 따라잡는다 */
      }
    },
    [academyId],
  );

  const patchExtractionReviewState = useCallback(
    (
      updates: Array<{
        passageId: string;
        draft: PassageItem["extractionReviewDraft"];
      }>,
    ) => {
      if (updates.length === 0) return;
      const byPassageId = new Map(
        updates.map((update) => [update.passageId, update.draft]),
      );
      const applyReviewState = <
        T extends {
          id?: string;
          extractionReviewDraft?: PassageItem["extractionReviewDraft"];
        } | null,
      >(
        current: T,
      ): T =>
        current?.id && byPassageId.has(current.id)
          ? {
              ...current,
              extractionReviewDraft: byPassageId.get(current.id) ?? null,
            }
          : current;

      setPassages((prev) =>
        prev.map((passage) =>
          byPassageId.has(passage.id)
            ? {
                ...passage,
                extractionReviewDraft: byPassageId.get(passage.id) ?? null,
              }
            : passage,
        ),
      );
      setDetailPassage((prev) => applyReviewState(prev));
      setContentModalPassage((prev) => applyReviewState(prev));
      setAnalysisModalPassage((prev) => applyReviewState(prev));
    },
    [],
  );

  // 백그라운드 학습자료 생성(서버 분석 잡) 폴링. 잡이 끝나면 해당 지문만
  // 제자리 패치해 새로고침 느낌 없이 카드가 "분석 완료" 모습(배지·글로우)으로
  // 바뀐다.
  const analysisActivityJobs = usePassageAnalysisActivity({
    onSettled: useCallback(
      (completedPassageIds, failedPassageIds) => {
        const settled = [...completedPassageIds, ...failedPassageIds];
        if (settled.length === 0) return;
        void patchPassages(settled);
        if (completedPassageIds.length > 0) {
          setFreshLearningPassageIds((prev) => {
            const next = new Set(prev);
            completedPassageIds.forEach((id) => next.add(id));
            return next;
          });
          dispatchGenerateTourMilestone("learning-generation-completed");
        }
      },
      [patchPassages],
    ),
  });
  const learningGeneratingPassageIds = useMemo(() => {
    const ids = new Set<string>(analysisActivityJobs.map((j) => j.passageId));
    for (const t of learningGenerationTasks) {
      if (t.status === "generating") ids.add(t.passageId);
    }
    return ids;
  }, [analysisActivityJobs, learningGenerationTasks]);

  // ── 선택 지문 일괄 학습자료 생성 ──
  const [learningBulkActionRunning, setLearningBulkActionRunning] =
    useState(false);
  const handleBulkGenerateLearning = useCallback(
    async (targets: PassageItem[]) => {
      if (targets.length === 0 || learningBulkActionRunning) return;
      const cost = targets.length * CREDIT_COSTS.PASSAGE_ANALYSIS;
      if (
        !window.confirm(
          `선택한 ${targets.length}개 지문의 학습자료를 생성합니다.\n${cost}크레딧이 사용됩니다. 진행할까요?`,
        )
      )
        return;

      setLearningBulkActionRunning(true);
      // 클릭 즉시 카드에 '학습자료 생성중' 표시(낙관적). 시작 실패분은 아래서 거둔다.
      targets.forEach((p) => notePassageAnalysisStarted(p.id, p.title));
      toast.success(`${targets.length}개 지문의 학습자료 생성을 시작했습니다.`);
      try {
        const failedTitles: string[] = [];
        const CONCURRENCY = 4;
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
          const chunk = targets.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async (p) => {
              try {
                const res = await fetch(
                  "/api/workbench/ai-jobs/passage-analysis",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      passageId: p.id,
                      customPrompt: "",
                      focusAreas: [],
                      targetLevel: "",
                      forcePrimeReport: true,
                    }),
                  },
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data?.error || !data?.jobId) {
                  throw new Error(data?.error || "start failed");
                }
              } catch {
                notePassageAnalysisStartFailed(p.id);
                failedTitles.push(p.title);
              }
            }),
          );
        }
        if (failedTitles.length > 0) {
          toast.error(
            `${failedTitles.length}개 지문은 시작하지 못했습니다: ${failedTitles
              .slice(0, 3)
              .join(", ")}${failedTitles.length > 3 ? " 외" : ""}`,
          );
        }
        if (failedTitles.length < targets.length) {
          dispatchGenerateTourMilestone("learning-generation-started");
          setSelectedIds(new Set());
        }
      } finally {
        setLearningBulkActionRunning(false);
        notifyCreditsChanged();
      }
    },
    [learningBulkActionRunning],
  );

  const handleCreatePassageCollection = useCallback(
    async (name: string, parentId?: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const result = await createPassageCollection({
        name: trimmed,
        parentId: parentId || undefined,
      });
      if (!result.success) {
        toast.error(result.error || "폴더 생성 실패");
        return null;
      }

      const created: PassageCollectionItem = {
        id: result.id,
        parentId: parentId || null,
        name: trimmed,
        _count: { items: 0 },
      };
      setCollections((prev) =>
        [...prev.filter((collection) => collection.id !== result.id), created]
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      toast.success(`"${trimmed}" 폴더를 만들었습니다.`);
      void loadPassages();
      return result.id;
    },
    [loadPassages],
  );

  const handleRenamePassageCollection = useCallback(
    async (collectionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      // 낙관적 갱신 후 서버 반영(실패 시 토스트). 폴더 카운트/멤버십엔 영향 없음.
      setCollections((prev) =>
        prev
          .map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c))
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      const result = await updatePassageCollection(collectionId, {
        name: trimmed,
      });
      if (!result?.success) {
        toast.error(result?.error || "폴더 이름 변경 실패");
        void loadPassages();
      }
    },
    [loadPassages],
  );

  // 상위(↑) 버튼이 "전체 지문"(루트)일 때 카드를 떨어뜨리면 현재 폴더에서 빼낸다.
  const handleRemovePassagesFromFolder = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || !collectionId || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const result = await removePassagesFromCollection(collectionId, ids);
        if (!result.success) {
          toast.error(result.error || "폴더에서 빼기 실패");
          return;
        }
        toast.success(`${ids.length}개 지문을 폴더에서 뺐습니다.`);
        void loadPassages();
      } finally {
        setPassageBulkAction(null);
      }
    },
    [passageBulkAction, loadPassages],
  );

  const handleCopySelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const selectedPassages = passages.filter((passage) =>
          selectedIds.has(passage.id),
        );
        const idsToAdd = ids.filter(
          (id) =>
            !selectedPassages
              .find((passage) => passage.id === id)
              ?.collectionItems?.some(
                (item) => item.collectionId === collectionId,
              ),
        );
        if (idsToAdd.length === 0) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }

        const result = await addPassagesToCollection(collectionId, idsToAdd);
        if (!result.success) {
          toast.error(result.error || "폴더에 복사하지 못했습니다.");
          return;
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          idsToAdd.length > 1 ? `${idsToAdd.length}개 지문이` : "지문이";

        const undoFolderCopy = async () => {
          setPassageBulkAction("move");
          try {
            const undoResult = await removePassagesFromCollection(
              collectionId,
              idsToAdd,
            );
            if (!undoResult.success) {
              toast.error(
                undoResult.error || "폴더 복사를 실행 취소하지 못했습니다.",
              );
              return;
            }
            await loadPassages();
            toast.success("폴더 복사를 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 복사를 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };

        // 선택한 것 중 이미 이 폴더에 있어 새로 담지 않은(중복 제외) 개수.
        const skippedCopy = ids.length - idsToAdd.length;
        const skippedCopySuffix =
          skippedCopy > 0 ? ` · 이미 들어있던 ${skippedCopy}개 제외` : "";
        toast.success(
          `${countLabel} "${folderName}"에 복사되었습니다${skippedCopySuffix}`,
          {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () => void undoFolderCopy(),
            },
          },
        );
        setSelectedIds(new Set());
        await loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더에 복사하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages, selectedIds],
  );

  const handleMovePassagesToCollection = useCallback(
    async (
      passageIds: string[],
      collectionId: string,
      keepFolderIds: string[] = [],
    ) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const keepSet = new Set(keepFolderIds);
        const selectedPassages = passages.filter((passage) =>
          idSet.has(passage.id),
        );
        const previousMembership = new Map<string, string[]>();
        for (const passage of selectedPassages) {
          for (const item of passage.collectionItems ?? []) {
            const list = previousMembership.get(item.collectionId) ?? [];
            list.push(passage.id);
            previousMembership.set(item.collectionId, list);
          }
        }
        // Keep the item in folders the user ticked — only remove from the rest.
        const sourceCollectionIds = [...previousMembership.keys()].filter(
          (id) => id !== collectionId && !keepSet.has(id),
        );
        const targetExistingIds = new Set(
          previousMembership.get(collectionId) ?? [],
        );
        const idsToAdd = ids.filter((id) => !targetExistingIds.has(id));
        const hasFolderChanges =
          idsToAdd.length > 0 || sourceCollectionIds.length > 0;

        if (!hasFolderChanges) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }

        const removeResults = await Promise.all(
          sourceCollectionIds.map((sourceId) =>
            removePassagesFromCollection(
              sourceId,
              previousMembership.get(sourceId) ?? [],
            ),
          ),
        );
        const failedRemove = removeResults.find((result) => !result.success);
        if (failedRemove) {
          toast.error(
            failedRemove.error || "폴더 이동 중 일부 제거에 실패했습니다.",
          );
          return;
        }

        if (idsToAdd.length > 0) {
          const addResult = await addPassagesToCollection(
            collectionId,
            idsToAdd,
          );
          if (!addResult.success) {
            toast.error(addResult.error || "폴더로 이동하지 못했습니다.");
            return;
          }
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel = ids.length > 1 ? `${ids.length}개 지문이` : "지문이";

        const undoFolderMove = async () => {
          setPassageBulkAction("move");
          try {
            const undoResults = await Promise.all([
              ...(idsToAdd.length > 0
                ? [removePassagesFromCollection(collectionId, idsToAdd)]
                : []),
              ...sourceCollectionIds.map((sourceId) =>
                addPassagesToCollection(
                  sourceId,
                  previousMembership.get(sourceId) ?? [],
                ),
              ),
            ]);
            const failedUndo = undoResults.find((result) => !result.success);
            if (failedUndo) {
              toast.error(
                failedUndo.error || "폴더 이동을 실행 취소하지 못했습니다.",
              );
              return;
            }

            await loadPassages();
            toast.success("폴더 이동을 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 이동을 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };

        // 끌어온 것 중 이미 이 폴더에 있어 새로 담지 않은(중복 제외) 개수.
        const skippedMove = ids.length - idsToAdd.length;
        const skippedMoveSuffix =
          skippedMove > 0 ? ` · 이미 들어있던 ${skippedMove}개 제외` : "";
        toast.success(
          `${countLabel} "${folderName}"(으)로 이동되었습니다${skippedMoveSuffix}`,
          {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () => void undoFolderMove(),
            },
          },
        );
        setPassages((prev) =>
          prev.map((passage) => {
            if (!idSet.has(passage.id)) return passage;
            const collectionItems = (passage.collectionItems ?? []).filter(
              (item) => !sourceCollectionIds.includes(item.collectionId),
            );
            if (
              !collectionItems.some(
                (item) => item.collectionId === collectionId,
              )
            ) {
              collectionItems.push({ collectionId });
            }
            return { ...passage, collectionItems };
          }),
        );
        setCollections((prev) =>
          prev.map((collection) => {
            const removed = sourceCollectionIds.includes(collection.id)
              ? (previousMembership
                  .get(collection.id)
                  ?.filter((id) => idSet.has(id)).length ?? 0)
              : 0;
            const added = collection.id === collectionId ? idsToAdd.length : 0;
            if (removed === 0 && added === 0) return collection;
            return {
              ...collection,
              _count: {
                ...collection._count,
                items: Math.max(0, collection._count.items - removed + added),
              },
            };
          }),
        );
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        dispatchGenerateTourMilestone("passage-folder-drop-completed");
        void loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더로 이동하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleMoveSelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      await handleMovePassagesToCollection([...selectedIds], collectionId);
    },
    [handleMovePassagesToCollection, selectedIds],
  );

  // Copy (add to target, keep in current folders) by explicit ids — powers the
  // 복사 option of the drag chooser. Mirrors the move handler's optimistic
  // updates but only adds (never removes from sources).
  const handleCopyPassagesToCollection = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const targetPassages = passages.filter((passage) =>
          idSet.has(passage.id),
        );
        const idsToAdd = ids.filter(
          (id) =>
            !targetPassages
              .find((passage) => passage.id === id)
              ?.collectionItems?.some(
                (item) => item.collectionId === collectionId,
              ),
        );
        if (idsToAdd.length === 0) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }
        const addResult = await addPassagesToCollection(collectionId, idsToAdd);
        if (!addResult.success) {
          toast.error(addResult.error || "폴더에 복사하지 못했습니다.");
          return;
        }
        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          idsToAdd.length > 1 ? `${idsToAdd.length}개 지문이` : "지문이";
        const undoFolderCopy = async () => {
          setPassageBulkAction("move");
          try {
            const undo = await removePassagesFromCollection(
              collectionId,
              idsToAdd,
            );
            if (!undo.success) {
              toast.error(undo.error || "폴더 복사를 실행 취소하지 못했습니다.");
              return;
            }
            await loadPassages();
            toast.success("폴더 복사를 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 복사를 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };
        // 끌어온 것 중 이미 이 폴더에 있어 새로 담지 않은(중복 제외) 개수.
        const skippedCopy = ids.length - idsToAdd.length;
        const skippedCopySuffix =
          skippedCopy > 0 ? ` · 이미 들어있던 ${skippedCopy}개 제외` : "";
        toast.success(
          `${countLabel} "${folderName}"에 복사되었습니다${skippedCopySuffix}`,
          {
            duration: UNDO_TOAST_DURATION,
            action: { label: "실행 취소", onClick: () => void undoFolderCopy() },
          },
        );
        setPassages((prev) =>
          prev.map((passage) => {
            if (!idSet.has(passage.id)) return passage;
            const collectionItems = passage.collectionItems ?? [];
            if (
              collectionItems.some((item) => item.collectionId === collectionId)
            ) {
              return passage;
            }
            return {
              ...passage,
              collectionItems: [...collectionItems, { collectionId }],
            };
          }),
        );
        setCollections((prev) =>
          prev.map((collection) =>
            collection.id === collectionId
              ? {
                  ...collection,
                  _count: {
                    ...collection._count,
                    items: collection._count.items + idsToAdd.length,
                  },
                }
              : collection,
          ),
        );
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        void loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더에 복사하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleRemoveSelectedPassagesFromCollection = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
    const collectionId = selectedCollectionId;
    if (!collectionId || ids.length === 0 || passageBulkAction) return;

    setPassageBulkAction("remove");
    try {
      const idSet = new Set(ids);
      const idsToRemove = passages
        .filter(
          (passage) =>
            idSet.has(passage.id) &&
            passage.collectionItems?.some(
              (item) => item.collectionId === collectionId,
            ),
        )
        .map((passage) => passage.id);

      if (idsToRemove.length === 0) {
        toast.info("이 폴더에서 제거할 지문이 없습니다.");
        return;
      }

      const result = await removePassagesFromCollection(
        collectionId,
        idsToRemove,
      );
      if (!result.success) {
        toast.error(result.error || "폴더에서 삭제하지 못했습니다.");
        return;
      }

      const undoFolderRemove = async () => {
        setPassageBulkAction("remove");
        try {
          const undoResult = await addPassagesToCollection(
            collectionId,
            idsToRemove,
          );
          if (!undoResult.success) {
            toast.error(
              undoResult.error || "폴더 삭제를 실행 취소하지 못했습니다.",
            );
            return;
          }
          await loadPassages();
          toast.success("폴더 삭제를 실행 취소했습니다.");
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "폴더 삭제를 실행 취소하지 못했습니다.",
          );
        } finally {
          setPassageBulkAction(null);
        }
      };

      toast.success(`${idsToRemove.length}개 지문을 폴더에서 삭제했습니다.`, {
        duration: UNDO_TOAST_DURATION,
        action: {
          label: "실행 취소",
          onClick: () => void undoFolderRemove(),
        },
      });
      setSelectedIds(new Set());
      await loadPassages();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "폴더에서 삭제하지 못했습니다.",
      );
    } finally {
      setPassageBulkAction(null);
    }
  }, [
    loadPassages,
    passageBulkAction,
    passages,
    selectedCollectionId,
    selectedIds,
  ]);

  const handleDeleteSelectedPassages = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
    if (ids.length === 0 || passageBulkAction) return;
    if (!window.confirm(`${ids.length}개 지문을 삭제하시겠습니까?`)) return;

    setPassageBulkAction("delete");
    try {
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === 0) {
        toast.error("삭제된 지문이 없습니다.");
      } else if (result.deleted === result.requested) {
        toast.success(`${result.deleted}개 지문을 삭제했습니다.`);
      } else {
        toast.warning(
          `${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`,
        );
      }

      setPassages((prev) =>
        prev.filter((passage) => !ids.includes(passage.id)),
      );
      setSelectedIds(new Set());
      if (selectedPassage && ids.includes(selectedPassage.id)) {
        setSelectedPassage(null);
        setAnalysisData(null);
      }
      await loadPassages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setPassageBulkAction(null);
    }
  }, [loadPassages, passageBulkAction, selectedIds, selectedPassage]);

  // 상세 모달에서 단일 지문 삭제 — 확인 후 삭제하고 목록·모달을 정리한다.
  const handleDeleteDetailPassage = useCallback(
    async (passage: PassageItem) => {
      if (deletingDetailId) return;
      if (!window.confirm("이 지문을 삭제하시겠습니까?")) return;

      setDeletingDetailId(passage.id);
      try {
        const result = await bulkDeleteWorkbenchPassages([passage.id]);
        if (!result.success || result.deleted === 0) {
          toast.error(result.error || "삭제에 실패했습니다.");
          return;
        }
        toast.success("지문이 삭제되었습니다.");
        setPassages((prev) => prev.filter((p) => p.id !== passage.id));
        setSelectedIds((prev) => {
          if (!prev.has(passage.id)) return prev;
          const next = new Set(prev);
          next.delete(passage.id);
          return next;
        });
        setDetailPassage(null);
        await loadPassages();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      } finally {
        setDeletingDetailId(null);
      }
    },
    [deletingDetailId, loadPassages],
  );

  // ── Apply deep-link pre-selection once passages are loaded ──
  // Runs once — filters the incoming ?passageIds= against the academy-scoped
  // list so stale / cross-academy ids can't bleed through a shared URL.
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (loadingPassages) return;
    const ids = initialPassageIdsRef.current;
    if (ids.length === 0) {
      prefillAppliedRef.current = true;
      return;
    }
    if (passages.length === 0) {
      // 첫 로드가 끝났는데 라이브러리가 비어 있으면 딥링크 id 는 유효할 수
      // 없다 — 시드된 원시 선택만 정리하고 종결한다. (보류 상태로 남기면
      // 이후 붙여넣기 자동 선택을 아래 setSelectedIds 와이프가 지워버린다.)
      setSelectedIds(new Set());
      prefillAppliedRef.current = true;
      return;
    }
    const validIds = ids.filter((id) => passages.some((p) => p.id === id));
    if (validIds.length > 0) {
      const first = passages.find((p) => p.id === validIds[0]);
      if (first) setSelectedPassage(first);
      // 딥링크 지문은 곧장 워크스페이스로 불러온다 — 편집·변형 후 생성하는 새 흐름.
      const validPassages = validIds
        .map((id) => passages.find((p) => p.id === id))
        .filter(Boolean);
      workspaceApi.loadPassages(validPassages as PassageItem[]);
      toast.success(
        validIds.length === ids.length
          ? `지문 ${validIds.length}개를 워크스페이스에 담았어요.`
          : `지문 ${validIds.length}/${ids.length}개를 워크스페이스에 담았어요.`,
      );
    }
    // 시드된 원시 선택을 정리 — 검증 전 id(다른 학원/삭제된 지문)가 선택
    // 카운트에 남거나, 워크스페이스와 라이브러리 체크의 이중 상태가 생기는
    // 것을 막는다 (수동 '선택 지문 불러오기'와 동작 일치).
    setSelectedIds(new Set());
    prefillAppliedRef.current = true;
  }, [loadingPassages, passages, workspaceApi]);

  // ── Load saved questions from DB ──
  const loadSavedQuestions = useCallback(async () => {
    try {
      const { getWorkbenchQuestions } = await import("@/actions/workbench");
      const result = await getWorkbenchQuestions(academyId, {
        page: 1,
        limit: 100,
        aiGenerated: true,
      });
      if (result?.questions) {
        setSavedQuestions(result.questions as QuestionCardItem[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSavedQuestions(false);
    }
  }, [academyId]);
  useEffect(() => {
    if (loadingPassages) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) loadSavedQuestions();
    };

    const canUseIdle =
      typeof window !== "undefined" && "requestIdleCallback" in window;
    const idleId = canUseIdle
      ? window.requestIdleCallback(run)
      : window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      if (canUseIdle) {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [loadingPassages, loadSavedQuestions]);

  useEffect(() => {
    if (queueCounts.done <= 0) return;
    const timeoutId = window.setTimeout(() => {
      loadSavedQuestions();
    }, SAVED_QUESTIONS_DONE_REFRESH_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [queueCounts.done, loadSavedQuestions]);

  // ── Load saved prompts ──
  const loadSavedPrompts = useCallback(async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(
      prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })),
    );
  }, []);
  useEffect(() => {
    loadSavedPrompts();
  }, [loadSavedPrompts]);

  // ── Parse analysis from passage data (already loaded with list) ──
  useEffect(() => {
    if (!selectedPassage) {
      setAnalysisData(null);
      return;
    }
    if (selectedPassage.analysis?.analysisData) {
      try {
        const parsed =
          typeof selectedPassage.analysis.analysisData === "string"
            ? JSON.parse(selectedPassage.analysis.analysisData)
            : selectedPassage.analysis.analysisData;
        setAnalysisData(parsed);
      } catch {
        setAnalysisData(null);
      }
    } else {
      setAnalysisData(null);
    }
    setLoadingAnalysis(false);
  }, [selectedPassage?.id]);

  // ── Handlers ──
  const setTypeCount = useCallback((id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  }, []);

  const handleSelectPassage = useCallback((p: PassageItem) => {
    setSelectedPassage(p);
  }, []);

  // ── Checkbox toggle ──
  const toggleCheckbox = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        // If exactly 1 selected, also set as selectedPassage
        if (next.size === 1) {
          const selectedId = Array.from(next)[0];
          const p = passages.find((pp) => pp.id === selectedId);
          if (p) setSelectedPassage(p);
        }
        return next;
      });
    },
    [passages],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Persist N pasted passages (1번·2번·N) as real Passages (academy-scoped,
  // "직접 입력") AND register each as 추출된 자료, then select them all so the
  // user can generate right away. Loops the proven single-passage action so the
  // shared SourceMaterial/ExtractionJob lineage stays identical; passageOrder is
  // assigned sequentially per academy by the action. They show up in 추출된 자료
  // 관리 / 학습지 생성 / 분석된 학습지 관리 lists immediately.
  const handleCreatePastedPassages = useCallback(
    async (rows: { title: string; content: string }[]) => {
      const cleaned = rows
        .map((r) => ({ title: r.title.trim(), content: r.content.trim() }))
        .filter((r) => r.content.length >= 20);
      if (cleaned.length === 0) {
        toast.error("지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.");
        return false;
      }
      setPasteSaving(true);
      try {
        const { createDirectInputPassageMaterial } =
          await import("@/actions/workbench");
        const createdIds: string[] = [];
        // Sequential (not parallel): the action assigns passageOrder = last+1,
        // so concurrent calls could collide on the (jobId, passageOrder) unique.
        for (const r of cleaned) {
          const title = r.title || derivePastedTitle(r.content);
          const result = await createDirectInputPassageMaterial({
            title,
            content: r.content,
          });
          if (result?.success && result.id) createdIds.push(result.id);
        }
        if (createdIds.length === 0) {
          toast.error("지문 등록에 실패했습니다.");
          return false;
        }

        // Refetch the academy passage list in place so the new passages become
        // canonical PassageItems (no full reload), then reset filters that would
        // hide freshly pasted (미분석) cards, select all of them, and flip to the
        // library so the user sees them land.
        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setSelectedIds(new Set(createdIds));
        setIntakeView("library");
        toast.success(
          createdIds.length === cleaned.length
            ? `${createdIds.length}개 지문이 등록되었습니다. 유형·난이도를 설정해 문제를 생성하세요.`
            : `${createdIds.length}/${cleaned.length}개 지문이 등록되었습니다. 일부는 실패했습니다.`,
        );
        return true;
      } catch {
        toast.error("지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setPasteSaving(false);
      }
    },
    [loadPassages],
  );

  // ── 수능·모평 기출 지문 → 내 지문함 일괄 등록 ──
  // 기출 브라우저에서 고른 지문(picks)을 id 만 서버로 보내 등록(본문은 서버가
  // 코퍼스에서 해석). 직접 입력과 같은 후처리: 목록 재조회 → 새 지문 선택 → 내
  // 지문함으로 전환. 멱등(이미 등록분은 서버가 건너뜀).
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
              ? `기출 지문 ${created.length}개를 내 지문함에 담았어요. (이미 등록된 ${skipped}개 제외) 유형·난이도를 설정해 문제를 생성하세요.`
              : `기출 지문 ${created.length}개를 내 지문함에 담았어요. 유형·난이도를 설정해 문제를 생성하세요.`,
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
    [loadPassages],
  );

  // ── Image/PDF extraction completion → drafts promoted to Passages ──
  // Refetch the list in place so the new passages appear as cards, drop the
  // job's loading cards (after the real ones are loaded → seamless), flip to the
  // library, and offer "전체 선택" (opt-in, not auto — avoids a huge batch).
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({
      passageIds,
      jobId,
      partial,
      expectedCount,
      resolvedCount,
      complete,
    }: {
      passageIds: string[];
      jobId: string;
      partial: boolean;
      expectedCount: number;
      resolvedCount: number;
      complete: boolean;
    }) => {
      // 알림·화면 전환은 즉시 — 목록 재조회(RTT)를 기다리지 않는다. 추출 중
      // 로딩 카드 제거만 실제 카드가 로드된 뒤(then)로 미뤄 깜빡임을 막는다.
      setPassageSearch("");
      setSelectedCollectionId("");
      setAnalysisStatusFilter("all");
      setIntakeView("library");
      if (passageIds.length > 0) {
        setFreshAnalysisPassageIds((prev) => {
          const next = new Set(prev);
          passageIds.forEach((id) => next.add(id));
          return next;
        });
        // 새 배치를 앞에 두고, 배치 안에서는 추출 순서를 유지한다.
        setRecentExtractionPassageIds((prev) => [
          ...passageIds,
          ...prev.filter((id) => !passageIds.includes(id)),
        ]);
        dispatchGenerateTourMilestone("file-extraction-completed");
      }

      if (passageIds.length === 0) {
        toast.message(
          partial
            ? "일부 페이지만 추출됐어요. 작업 큐에서 확인하세요."
            : "추출은 끝났지만 등록할 지문이 없습니다.",
        );
      } else if (!complete) {
        const missing = Math.max(1, expectedCount - resolvedCount);
        toast.warning(
          `추출된 지문 ${resolvedCount}/${expectedCount}개만 등록됐습니다. 남은 ${missing}개는 작업 큐 또는 자료 관리에서 확인해주세요.`,
          {
            action: {
              label: "등록된 지문 선택",
              onClick: () => setSelectedIds(new Set(passageIds)),
            },
            duration: 14000,
          },
        );
      } else {
        toast.success(
          `추출된 ${passageIds.length}개 지문이 ‘내 지문’에 추가됐어요. 문제를 생성할 지문을 선택하세요.`,
          {
            action: {
              label: "전체 선택",
              onClick: () => setSelectedIds(new Set(passageIds)),
            },
            duration: 12000,
          },
        );
      }

      void loadPassages().then(() => {
        if (complete) {
          clearExtractionPendingRef.current(jobId);
        }
      });
    },
    [loadPassages],
  );

  const acknowledgeFreshAnalysisPassage = useCallback((passageId: string) => {
    setFreshAnalysisPassageIds((prev) => {
      if (!prev.has(passageId)) return prev;
      const next = new Set(prev);
      next.delete(passageId);
      return next;
    });
    setFreshLearningPassageIds((prev) => {
      if (!prev.has(passageId)) return prev;
      const next = new Set(prev);
      next.delete(passageId);
      return next;
    });
  }, []);

  const handleInlinePassageAnalyzed = useCallback(
    async (passageId: string) => {
      await patchPassages([passageId]);
      setFreshLearningPassageIds((prev) => {
        const next = new Set(prev);
        next.add(passageId);
        return next;
      });
    },
    [patchPassages],
  );

  const handleToggleExtractionReview = useCallback(
    async (passage: PassageItem) => {
      const draft = passage.extractionReviewDraft;
      if (!draft) return;

      const isReviewed = draft.reviewStatus === "COMMITTED";

      setReviewActionPassageIds((prev) => {
        const next = new Set(prev);
        next.add(passage.id);
        return next;
      });

      try {
        if (isReviewed) {
          // 검수취소는 비파괴적으로 — 지문(Passage)은 문제생성 목록에 그대로
          // 두고 검수 상태만 REVIEWED 로 되돌린다(점 초록→빨강).
          const res = await fetchReviewAction(
            `/api/extraction/m1-passages/${draft.id}/uncommit`,
            {
              method: "POST",
              credentials: "include",
            },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error ?? "검수를 취소하지 못했습니다.");
          }
          const reviewedAt = new Date().toISOString();
          patchExtractionReviewState([
            {
              passageId: passage.id,
              draft: {
                ...draft,
                reviewStatus: "REVIEWED",
                confirmedAt: null,
                updatedAt: reviewedAt,
              },
            },
          ]);
          toast.success("검수완료를 취소했습니다.");
        } else {
          const res = await fetchReviewAction(
            "/api/extraction/m1-passages/promote",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              // 사용자가 '검수완료'로 표시 — 명시적으로 검수완료 처리.
              body: JSON.stringify({ draftIds: [draft.id], markReviewed: true }),
            },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error ?? "검수완료로 표시하지 못했습니다.");
          }
          const promoted = data?.summary?.promoted ?? 0;
          const skipped = data?.summary?.skipped ?? 0;
          if (promoted + skipped <= 0) {
            throw new Error("검수 처리에 실패했습니다.");
          }
          const reviewedAt = new Date().toISOString();
          patchExtractionReviewState([
            {
              passageId: passage.id,
              draft: {
                ...draft,
                reviewStatus: "COMMITTED",
                confirmedAt: reviewedAt,
                updatedAt: reviewedAt,
              },
            },
          ]);
          toast.success("검수완료로 표시했습니다.");
          void patchPassages([passage.id]);
        }
      } catch (err) {
        toast.error(
          isAbortError(err)
            ? "검수 처리 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
            : err instanceof Error
              ? err.message
              : "검수 상태를 변경하지 못했습니다.",
        );
      } finally {
        setReviewActionPassageIds((prev) => {
          if (!prev.has(passage.id)) return prev;
          const next = new Set(prev);
          next.delete(passage.id);
          return next;
        });
      }
    },
    [patchExtractionReviewState, patchPassages],
  );

  const handleBulkCompleteExtractionReview = useCallback(
    async (targetPassages: PassageItem[]) => {
      if (reviewBulkActionRunning) return;

      const reviewDraftPassages = targetPassages.filter(
        (passage) => passage.extractionReviewDraft,
      );
      const pendingPassages = reviewDraftPassages.filter(
        (passage) =>
          passage.extractionReviewDraft?.reviewStatus !== "COMMITTED",
      );
      const alreadyCommittedCount =
        reviewDraftPassages.length - pendingPassages.length;

      if (pendingPassages.length === 0) {
        window.alert(
          alreadyCommittedCount > 0
            ? `선택한 ${alreadyCommittedCount}개 자료가 이미 모두 검수완료되어 있습니다.`
            : "선택한 지문 중 검수할 추출 자료가 없습니다.",
        );
        return;
      }

      const ok =
        alreadyCommittedCount > 0
          ? window.confirm(
              `선택한 ${reviewDraftPassages.length}개 중 ${alreadyCommittedCount}개는 이미 검수완료되어 있습니다.\n` +
                `검수 필요한 ${pendingPassages.length}개만 검수완료 처리할까요?`,
            )
          : window.confirm(
              `선택한 ${pendingPassages.length}개 지문을 검수완료로 표시할까요?`,
            );
      if (!ok) return;

      const draftIds = pendingPassages
        .map((passage) => passage.extractionReviewDraft?.id)
        .filter((id): id is string => Boolean(id));
      if (draftIds.length === 0) return;

      setReviewBulkActionRunning(true);
      setReviewActionPassageIds((prev) => {
        const next = new Set(prev);
        pendingPassages.forEach((passage) => next.add(passage.id));
        return next;
      });

      try {
        const res = await fetchReviewAction(
          "/api/extraction/m1-passages/promote",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            // 사용자가 '검수완료'로 일괄 표시 — 명시적으로 검수완료 처리.
            body: JSON.stringify({ draftIds, markReviewed: true }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "검수완료 처리에 실패했습니다.");
        }

        const promoted = data?.summary?.promoted ?? 0;
        const skipped = data?.summary?.skipped ?? 0;
        const failed = data?.summary?.failed ?? 0;
        if (promoted + skipped <= 0) {
          throw new Error("검수완료 처리에 실패했습니다.");
        }

        const reviewedAt = new Date().toISOString();
        patchExtractionReviewState(
          pendingPassages.map((passage) => ({
            passageId: passage.id,
            draft: passage.extractionReviewDraft
              ? {
                  ...passage.extractionReviewDraft,
                  reviewStatus: "COMMITTED",
                  confirmedAt: reviewedAt,
                  updatedAt: reviewedAt,
                }
              : null,
          })),
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          pendingPassages.forEach((passage) => next.delete(passage.id));
          return next;
        });
        dispatchGenerateTourMilestone("passage-review-completed");
        void patchPassages(pendingPassages.map((passage) => passage.id));
        if (failed > 0) {
          toast.warning(
            `${promoted}개 검수완료, ${skipped + failed}개 건너뜀/실패`,
          );
        } else {
          toast.success(
            `${promoted + skipped}개 지문을 검수완료로 표시했습니다.`,
          );
        }
      } catch (err) {
        toast.error(
          isAbortError(err)
            ? "검수완료 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
            : err instanceof Error
              ? err.message
              : "검수완료 처리에 실패했습니다.",
        );
      } finally {
        setReviewBulkActionRunning(false);
        setReviewActionPassageIds((prev) => {
          const next = new Set(prev);
          pendingPassages.forEach((passage) => next.delete(passage.id));
          return next;
        });
      }
    },
    [patchExtractionReviewState, patchPassages, reviewBulkActionRunning],
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

  // 추출 버튼을 누른 즉시 '내 지문'으로 넘어가 추출 중 로딩 카드를 띄우고, 작업 목록
  // 드로어 탭을 'extraction'으로 맞춰 열면 바로 이 추출 작업이 보이게 한다.
  const handleExtractionBegin = useCallback(
    (id: string, count: number) => {
      beginExtractionJob(id, count);
      setIntakeView("library");
      taskQueue.setScope("extraction");
    },
    [beginExtractionJob, taskQueue],
  );
  // 잡 생성됨(jobId) → 폴링 시작 + 작업 목록 즉시 새로고침 / 시작 실패(null) → 로딩 카드 제거.
  const handleExtractionResult = useCallback(
    (id: string, jobId: string | null) => {
      if (jobId) {
        attachExtractionJob(id, jobId);
        taskQueue.triggerRefresh();
      } else {
        failExtractionJob(id);
      }
    },
    [attachExtractionJob, failExtractionJob, taskQueue],
  );

  // ── Open analysis detail modal ──
  // 분석 완료 지문 → 분석/보고서 모달. 미분석 지문 → 원문 전체 뷰어 모달.
  // (지문 카드에서 이미 분기하지만, 어떤 경로로 호출돼도 동일하게 동작하도록
  //  서버에서 받은 analysis 유무로 한 번 더 분기해 조건을 철저히 보장한다.)
  const handleOpenAnalysisModal = useCallback(
    async (passageId: string) => {
      setLoadingAnalysisModal(true);
      try {
        const { getWorkbenchPassage } = await import("@/actions/workbench");
        const result = await getWorkbenchPassage(passageId);
        if (result) {
          const listPassage = passages.find((item) => item.id === passageId);
          const enrichedResult = {
            ...result,
            extractionReviewDraft:
              listPassage?.extractionReviewDraft ??
              (
                result as {
                  extractionReviewDraft?: PassageItem["extractionReviewDraft"];
                }
              ).extractionReviewDraft ??
              null,
          };
          if (result.analysis) {
            setAnalysisModalPassage(enrichedResult);
          } else {
            setContentModalPassage(enrichedResult as unknown as PassageItem);
          }
        } else {
          toast.error("지문 데이터를 불러올 수 없습니다.");
        }
      } catch {
        toast.error("지문 로딩 실패");
      } finally {
        setLoadingAnalysisModal(false);
      }
    },
    [passages],
  );

  const applyReviewState = useCallback(
    (questionIds: string[], approved: boolean) => {
      if (questionIds.length === 0) return;
      const set = new Set(questionIds);
      setSavedQuestions((prev) =>
        prev.map((q) => (set.has(q.id) ? { ...q, approved } : q)),
      );
      setDetailQuestion((prev) =>
        prev && set.has(prev.id) ? { ...prev, approved } : prev,
      );
      setSessionQueue((prev) =>
        prev.map((item) => {
          if (!item.questionIds?.some((id) => id && set.has(id))) return item;
          const questions = item.questions.map((q, qi) => {
            const id = item.questionIds?.[qi];
            return id && set.has(id) ? { ...q, approved } : q;
          });
          return {
            ...item,
            questions,
            status: questions.every((q) => q.approved)
              ? "reviewed"
              : item.status === "reviewed"
                ? "done"
                : item.status,
          };
        }),
      );
    },
    [setSessionQueue],
  );

  // 서버가 "문제를 찾을 수 없습니다"로 거절하면, 그 문제는 이미 삭제된 좀비다
  // (세션 큐 폴링 직전에 지워졌거나 다른 기기에서 삭제됨). 로컬에서 카드를
  // 정리하고 목록을 새로고침해, 같은 좀비를 다시 검수하려는 일을 막는다.
  const isMissingQuestionError = (error?: string) =>
    typeof error === "string" && error.includes("찾을 수 없");

  const handleApproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await approveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          loadSavedQuestions();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수완료 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], true);
      toast.success("검수완료 처리됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions, applyReviewState, markQuestionDeletedLocally],
  );

  const handleUnapproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await unapproveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          loadSavedQuestions();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수취소 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], false);
      toast.success("검수취소 처리됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions, applyReviewState, markQuestionDeletedLocally],
  );

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!questionId) return;
      if (!confirm("이 문제를 삭제하시겠습니까?")) return;
      const result = await deleteWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      setSavedQuestions((prev) => prev.filter((q) => q.id !== questionId));
      setDetailQuestion((prev) => (prev?.id === questionId ? null : prev));
      toast.success("삭제됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions],
  );

  const handleBatchApproveQuestions = useCallback(
    async (questionIds: string[]) => {
      if (questionIds.length === 0) return;
      const result = await bulkApproveWorkbenchQuestions(questionIds);
      if (result.success && result.approvedIds.length > 0) {
        const failed = Math.max(0, result.requested - result.approved);
        applyReviewState(result.approvedIds, true);
        toast.success(
          `${result.approved}개 문제가 검수완료 처리됐습니다.${failed > 0 ? ` (${failed}개 건너뜀)` : ""}`,
        );
        loadSavedQuestions();
      } else if (!result.success) {
        toast.error(result.error || "일괄 검수완료 처리에 실패했습니다.");
      }
    },
    [applyReviewState, loadSavedQuestions],
  );

  const handleBatchDeleteQuestions = useCallback(
    async (questionIds: string[]): Promise<boolean> => {
      // Confirmation is handled by the in-app AlertDialog in BottomQueueSection
      // before this runs — no native window.confirm here.
      const ids = [...new Set(questionIds)].filter(Boolean);
      if (ids.length === 0 || deletingQuestions) return false;

      setDeletingQuestions(true);
      try {
        const result = await bulkDeleteWorkbenchQuestions(ids);
        if (!result.success) {
          toast.error(result.error || "문제 삭제에 실패했습니다.");
          return false;
        }

        // Tombstone ONLY the rows the server actually deleted — never the full
        // request. On a partial delete (cross-academy / already-gone ids) the
        // survivors must stay visible, and loadSavedQuestions() reconciles them.
        const deletedIds = result.deletedIds ?? [];
        const deletedSet = new Set(deletedIds);
        const deletedSigs = savedQuestions
          .filter((q) => deletedSet.has(q.id))
          .map(savedQuestionSig);
        setDeletedQuestionIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.add(id));
          return next;
        });
        if (deletedSigs.length > 0) {
          setDeletedQuestionSignatures((prev) => {
            const next = new Set(prev);
            deletedSigs.forEach((sig) => next.add(sig));
            return next;
          });
        }
        setSavedQuestions((prev) => prev.filter((q) => !deletedSet.has(q.id)));
        setDetailQuestion((prev) =>
          prev && deletedSet.has(prev.id) ? null : prev,
        );

        if (result.deleted === 0) {
          toast.error("삭제된 문제가 없습니다.");
        } else if (result.deleted === result.requested) {
          toast.success(`${result.deleted}개 문제를 삭제했습니다.`);
        } else {
          toast.warning(
            `${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`,
          );
        }
        loadSavedQuestions();
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "문제 삭제에 실패했습니다.",
        );
        return false;
      } finally {
        setDeletingQuestions(false);
      }
    },
    [deletingQuestions, loadSavedQuestions, savedQuestions, savedQuestionSig],
  );

  // ── 워크스페이스 불러오기 ──
  const handleLoadSelectedToWorkspace = useCallback(async () => {
    const selected = passages.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast.error("'내 지문함'에서 워크스페이스로 보낼 지문을 먼저 선택하세요.");
      return;
    }
    // 이미 작업 중인 워크스페이스가 있으면 '추가' 어휘로 안내한다.
    const wasActive = workspaceApi.rows.length > 0;
    // 검수 전 자료(미승격 draft)는 실제 지문으로 승격한 뒤 워크스페이스로 불러온다.
    let resolved = selected;
    if (selected.some((p) => isDraftPseudoId(p.id))) {
      const { resolvedById, failedCount } = await resolveSelectionToPassageIds(
        selected.map((p) => p.id),
      );
      resolved = selected
        .map((p) => {
          const realId = resolvedById[p.id];
          if (!realId) return null;
          // 승격된 draft 는 새 실제 passageId 로 교체(검수 메타는 비운다).
          return isDraftPseudoId(p.id)
            ? { ...p, id: realId, source: null, extractionReviewDraft: null }
            : p;
        })
        .filter(Boolean);
      if (failedCount > 0) {
        toast.warning(`${failedCount}개 자료는 지문으로 준비하지 못해 제외했어요.`);
      }
      // 승격된 draft 가 '내 지문'에 실제 카드로 반영되도록 목록 새로고침.
      void loadPassages();
      if (resolved.length === 0) return;
    }
    const { added, skipped } = workspaceApi.loadPassages(resolved);
    if (added > 0) {
      toast.success(
        (wasActive
          ? `지문 ${added}개를 워크스페이스에 추가했어요.`
          : `지문 ${added}개를 워크스페이스에 담았어요.`) +
          (skipped > 0 ? ` (${skipped}개는 이미 있어요)` : ""),
      );
      setSelectedIds(new Set());
      // 내 지문함을 덮으며 워크스페이스를 펼친다 (가운데 컬럼 교체).
      setWorkspaceOpen(true);
      dispatchGenerateTourMilestone("workspace-opened");
    } else if (skipped > 0) {
      toast.info("선택한 지문은 이미 워크스페이스에 있습니다.");
      setWorkspaceOpen(true);
      dispatchGenerateTourMilestone("workspace-opened");
    }
  }, [passages, selectedIds, workspaceApi, loadPassages]);

  // ── Generation handlers (extracted to hook) ──
  const {
    handleBatchGenerate,
    handleGenerate,
    handleSaveQuestions,
    retryGeneration,
  } = useGenerationHandlers({
      passages,
      selectedIds,
      setSelectedIds,
      genMode,
      generationPlan,
      typeCounts,
      setTypeCounts,
      activeTypes,
      difficulty,
      customPrompt,
      questionTypeSettings,
      selectedPassage,
      analysisData,
      totalQuestions,
      setSessionQueue,
      reviewItem,
      setReviewModalId,
      loadSavedQuestions,
      onGenerationCompleted: () =>
        dispatchGenerateTourMilestone("question-generation-completed"),
      loadPassages,
    });

  // 하단 지문 세트 섹션 갱신 신호 — 세트 생성 완료 시 올린다(아래 onSetCreated).
  const [setRefreshNonce, setSetRefreshNonce] = useState(0);

  // ── 워크스페이스 생성 (변형본 저장 → 행별 설정으로 생성) ──
  const {
    generating: workspaceGenerating,
    handleWorkspaceGenerate,
    workspaceSummary,
    rowStats: workspaceRowStats,
  } = useWorkspaceGeneration({
    api: workspaceApi,
    passages,
    genMode,
    generationPlan,
    typeCounts,
    questionTypeSettings,
    difficulty,
    customPrompt,
    selectedIds,
    setSelectedIds,
    setSessionQueue,
    loadPassages,
    loadSavedQuestions,
    // 세트 생성은 일반 큐 카드를 done 으로 안 올리므로(낙관적 카드 제거만) 하단
    // 지문 세트 섹션이 자동 갱신되도록 별도 신호를 올린다.
    onSetCreated: () => setSetRefreshNonce((n) => n + 1),
  });
  const workspaceActive = workspaceApi.rows.length > 0;
  // 워크스페이스가 '내 지문함'을 덮어 표시되는 상태. 브레드크럼의 '워크스페이스'
  // 탭으로 비어 있어도 진입할 수 있고(빈 상태엔 '지문 추가' 버튼만 표시),
  // 행 유무와 무관하게 workspaceOpen 만 본다.
  const workspaceVisible = workspaceOpen;
  // 워크스페이스가 처음 생기면 자동으로 펼쳐 내 지문함을 덮는다.
  const prevWorkspaceActiveRef = useRef(false);
  useEffect(() => {
    if (!prevWorkspaceActiveRef.current && workspaceActive) {
      setWorkspaceOpen(true);
    }
    prevWorkspaceActiveRef.current = workspaceActive;
  }, [workspaceActive]);
  const workspacePassageIds = useMemo(
    () =>
      new Set(
        workspaceApi.rows
          .flatMap((r) => [r.passageId, r.variantOfId])
          .filter(Boolean),
      ),
    [workspaceApi.rows],
  );

  // ── 모바일 스텝 플로우: 전환 + URL(?step=) 동기화 ──
  const isMobileViewport = useIsMobileViewport();
  // 워크스페이스 스텝 하단 고정 '담긴 유형' 장바구니 펼침 상태(모바일).
  const [workspaceCartOpen, setWorkspaceCartOpen] = useState(false);

  // 스텝이 가리키는 인테이크 상태를 함께 맞춘다. results 는 하단 결과
  // 섹션만 보여주므로 인테이크 상태를 건드리지 않는다(뒤로가면 그대로 복귀).
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
    // router.push 대신 네이티브 pushState — 서버 리페치 없이 히스토리만
    // 쌓아 브라우저 뒤로가기가 '이전 단계'로 동작하게 한다.
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

  // 기존 UI 동작('다음으로' CTA, 워크스페이스 자동 열림/닫힘 등)이
  // intakeView/workspaceOpen 을 바꾸면 스텝을 뒤따라 맞춘다 — 스텝을 모르는
  // 기존 핸들러를 하나도 고치지 않기 위한 단방향 동기화. results 에서는
  // 인테이크 상태가 화면 밖(숨김)이므로 동기화하지 않는다.
  useEffect(() => {
    if (!isMobileViewport) return;
    if (mobileStep === "results") return;
    const derived: MobileStep = workspaceVisible
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
    workspaceVisible,
    intakeView,
    mobileStep,
    pushMobileStepUrl,
  ]);

  // ── 지문별 개별 설정 (워크스페이스) ───────────────────────────────
  // 워크스페이스 행을 클릭하면 우측 '유형·생성 설정'이 그 지문만 편집한다.
  // 편집 대상 행이 있으면(editingRow) 난이도·유형 개수·유형별 세부옵션을
  // 행 오버라이드로 읽고/쓰며(전체 설정값을 시드로 fork), 생성 모드·프롬프트
  // 등은 그대로 전체 공통값을 쓴다. 행이 없으면 기존처럼 전체 설정을 편집.
  const activeRow =
    workspaceVisible && activeRowId
      ? (workspaceApi.rows.find((r) => r.localId === activeRowId) ?? null)
      : null;
  const editingRow = activeRow !== null;
  // 설정 패널 헤더에 카드와 똑같은 ① 번호 배지를 비추기 위한 인덱스
  // (왼쪽 선택 지문 ↔ 오른쪽 설정의 정체성 일치 신호).
  const activeRowIndex = activeRow
    ? workspaceApi.rows.findIndex((r) => r.localId === activeRow.localId)
    : -1;

  // 워크스페이스가 사라지면 개별 설정 선택을 해제하고 생성 모달도 닫는다.
  useEffect(() => {
    if (!workspaceVisible) {
      if (activeRowId !== null) setActiveRowId(null);
      if (genModalOpen) setGenModalOpen(false);
    }
  }, [workspaceVisible, activeRowId, genModalOpen]);

  // 지문 카드 본문 클릭 → 그 지문을 선택(설정 대상)으로 바인딩 (선택 링 표시).
  const selectRow = useCallback((localId: string) => {
    setActiveRowId(localId);
  }, []);

  // 카드의 '문제 생성' 버튼/설정 배지 클릭 → 이 지문을 선택하고 생성 모달을 연다.
  const handleSetActiveRow = useCallback(
    (localId: string) => {
      selectRow(localId);
      setGenModalOpen(true);
    },
    [selectRow],
  );

  // 모달을 닫는다 — 선택(링)은 유지하지 않고 해제해 깔끔하게 비운다.
  const closeGenModal = useCallback(() => {
    setGenModalOpen(false);
    setActiveRowId(null);
  }, []);

  // 이 지문 하나로 생성 — 생성을 시작(fire-and-forget)하고 모달을 닫는다.
  const handleGenerateActiveRow = useCallback(() => {
    if (!activeRowId) return;
    // 생성은 시작 시점에 행 설정을 동기적으로 캡처하므로(setOverride 는 불변
    // 업데이트라 캡처된 참조에 영향 없음), 호출 직후 이 지문의 유형 지정을
    // 비워 초기화해도 안전하다. 난이도·유형별 세부 설정은 보존한다.
    void handleWorkspaceGenerate(activeRowId);
    const row = workspaceApi.rows.find((r) => r.localId === activeRowId);
    if (row?.override && overrideHasTypeCounts(row.override)) {
      const next = { ...row.override, typeCounts: {} };
      workspaceApi.setOverride(
        activeRowId,
        isOverrideEmpty(next) ? null : next,
      );
    }
    closeGenModal();
  }, [activeRowId, handleWorkspaceGenerate, closeGenModal, workspaceApi]);

  // 활성 행의 오버라이드를 부분 수정한다. 결과가 전체 설정과 같아지면(빈
  // 오버라이드) null 로 저장해 '전체 설정 따름'으로 되돌린다.
  const writeActiveOverride = useCallback(
    (updater: (base: RowOverride) => RowOverride) => {
      if (!activeRowId) return;
      const row = workspaceApi.rows.find((r) => r.localId === activeRowId);
      const base: RowOverride = row?.override
        ? { ...row.override }
        : { typeCounts: {}, difficulty: null };
      const next = updater(base);
      workspaceApi.setOverride(
        activeRowId,
        isOverrideEmpty(next) ? null : next,
      );
    },
    [activeRowId, workspaceApi],
  );

  // 우측 패널에 넘길 '유효 설정' — 편집 중이면 행 오버라이드(없으면 전체
  // 설정 시드), 아니면 전체 설정. 세터는 편집 중이면 오버라이드에 쓴다.
  const panelDifficulty = editingRow
    ? (activeRow.override?.difficulty ?? difficulty)
    : difficulty;
  const panelSetDifficulty = editingRow
    ? (v: "BASIC" | "INTERMEDIATE" | "KILLER") =>
        writeActiveOverride((o) => ({ ...o, difficulty: v }))
    : setDifficulty;

  // 개별 설정 중인 행은 '빈 슬레이트'에서 시작한다 — 지정하지 않은 지문은
  // 0개(생성 제외)이므로, 전체 설정 유형을 시드로 채우지 않는다(채우면 화면엔
  // 보이는데 실제로는 생성/합산되지 않아 어긋난다). 행에 이미 개별 지정이
  // 있으면 그 값을 보여준다.
  const panelTypeCounts = editingRow
    ? overrideHasTypeCounts(activeRow.override)
      ? activeRow.override!.typeCounts
      : {}
    : typeCounts;
  const panelSetTypeCount = editingRow
    ? (id: string, count: number) =>
        writeActiveOverride((o) => {
          const seed = overrideHasTypeCounts(o) ? o.typeCounts : {};
          const nextCounts = { ...seed };
          if (count <= 0) delete nextCounts[id];
          else nextCounts[id] = count;
          return { ...o, typeCounts: nextCounts };
        })
    : setTypeCount;
  // 패널은 setTypeCounts 를 값/업데이터 함수 양쪽으로 호출한다(정렬·증감 등).
  // 업데이터에는 '현재 행 typeCounts'(개별 지정 없으면 빈 슬레이트)를 넘긴다.
  const panelSetTypeCounts = editingRow
    ? (
        v:
          | Record<string, number>
          | ((prev: Record<string, number>) => Record<string, number>),
      ) =>
        writeActiveOverride((o) => {
          const seed = overrideHasTypeCounts(o) ? o.typeCounts : {};
          const next = typeof v === "function" ? v(seed) : v;
          return { ...o, typeCounts: next };
        })
    : setTypeCounts;
  const panelTotalQuestions = editingRow
    ? Object.values(panelTypeCounts).reduce((a, b) => a + b, 0)
    : totalQuestions;

  const panelQuestionTypeSettings = editingRow
    ? { ...questionTypeSettings, ...(activeRow.override?.questionTypeSettings ?? {}) }
    : questionTypeSettings;
  const panelSetQuestionTypeSettings = editingRow
    ? (
        v:
          | QuestionTypeGenerationSettings
          | ((
              prev: QuestionTypeGenerationSettings,
            ) => QuestionTypeGenerationSettings),
      ) =>
        writeActiveOverride((o) => {
          const merged = {
            ...questionTypeSettings,
            ...(o.questionTypeSettings ?? {}),
          };
          const nextFull = typeof v === "function" ? v(merged) : v;
          return {
            ...o,
            questionTypeSettings: diffQuestionTypeSettings(
              nextFull,
              questionTypeSettings,
            ),
          };
        })
    : setQuestionTypeSettings;

  // 생성 모드(자동/유형지정/장문세트)와 생성 플랜(일반/프리미엄)도 개별 설정
  // 대상이다 — 행 편집 중이면 그 행 오버라이드에 쓰고/읽고(없으면 전체 설정을
  // 시드로), 아니면 전체 공통 설정을 그대로 쓴다.
  const panelGenMode = editingRow
    ? (activeRow.override?.mode ?? genMode)
    : genMode;
  const panelSetGenMode = editingRow
    ? (m: "manual" | "set") =>
        writeActiveOverride((o) => ({ ...o, mode: m }))
    : setGenMode;
  const panelGenerationPlan = editingRow
    ? (activeRow.override?.generationPlan ?? generationPlan)
    : generationPlan;
  const panelSetGenerationPlan = editingRow
    ? (p: "STANDARD" | "PREMIUM") =>
        writeActiveOverride((o) => ({ ...o, generationPlan: p }))
    : setGenerationPlan;
  // 세트 프리셋 선택도 지문별로 저장한다(자동/유형지정과 동일 원리). 편집 중인
  // 행의 override.setPresetId/difficulty 를 controlled 값으로 넘기고, 변경 시 그 행에 쓴다.
  const panelSetPresetId = editingRow
    ? (activeRow.override?.setPresetId ?? null)
    : undefined;
  const panelSetPresetCounts = editingRow
    ? (activeRow.override?.setPresetCounts ??
        (activeRow.override?.setPresetId ? { [activeRow.override.setPresetId]: 1 } : {}))
    : undefined;
  const panelOnSetPresetChange = editingRow
    ? (presetId: string | null) =>
        writeActiveOverride((o) => {
          const nextCounts = { ...(o.setPresetCounts ?? {}) };
          if (presetId) {
            nextCounts[presetId] = Math.max(1, Number(nextCounts[presetId] ?? 1));
          }
          return {
            ...o,
            mode: "set",
            setPresetId: presetId ?? undefined,
            setPresetCounts: presetId ? nextCounts : {},
            // 프리셋이 바뀌면 멤버 인덱스가 달라지므로 legacy 멤버 오버라이드는 리셋한다.
            setMemberOverrides:
              presetId === o.setPresetId ? o.setMemberOverrides : undefined,
          };
        })
    : undefined;
  const panelOnSetPresetCountsChange = editingRow
    ? (next: Record<string, number>) =>
        writeActiveOverride((o) => {
          const first =
            Object.entries(next).find(([, count]) => Number(count) > 0)?.[0] ??
            undefined;
          return {
            ...o,
            mode: "set",
            setPresetId: first,
            setPresetCounts: next,
          };
        })
    : undefined;
  // 세트 멤버별 난이도·세부설정도 지문별로 저장한다(프리셋 멤버 순서 평행 배열).
  const panelSetMemberOverrides = editingRow
    ? (activeRow.override?.setMemberOverrides ?? [])
    : undefined;
  const panelSetMemberOverridesByPreset = editingRow
    ? (activeRow.override?.setMemberOverridesByPreset ??
        (activeRow.override?.setPresetId && activeRow.override?.setMemberOverrides
          ? { [activeRow.override.setPresetId]: activeRow.override.setMemberOverrides }
          : {}))
    : undefined;
  const panelOnSetMemberOverridesChange = editingRow
    ? (
        next: Array<{
          difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
          generationPlan?: "STANDARD" | "PREMIUM";
          typeSettings?: Record<string, unknown>;
        }>,
      ) =>
        writeActiveOverride((o) => ({
          ...o,
          mode: "set",
          setMemberOverrides: next,
        }))
    : undefined;
  const panelOnSetMemberOverridesByPresetChange = editingRow
    ? (
        next: Record<
          string,
          Array<{
            difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
            generationPlan?: "STANDARD" | "PREMIUM";
            typeSettings?: Record<string, unknown>;
          }>
        >,
      ) =>
        writeActiveOverride((o) => ({
          ...o,
          mode: "set",
          setMemberOverridesByPreset: next,
        }))
    : undefined;

  // ── Can generate? ──
  const canGenerate = selectedIds.size > 0 && totalQuestions > 0;

  useEffect(() => {
    if (intakeView !== "library" || selectedIds.size === 0) return;
    const hasPendingReviewSelection = passages.some(
      (passage) =>
        selectedIds.has(passage.id) &&
        passage.extractionReviewDraft?.reviewStatus !== "COMMITTED",
    );
    dispatchGenerateTourMilestone("passage-selected");
    if (hasPendingReviewSelection) {
      dispatchGenerateTourMilestone("review-passage-selected");
    }
    const id = window.setInterval(() => {
      dispatchGenerateTourMilestone("passage-selected");
      if (hasPendingReviewSelection) {
        dispatchGenerateTourMilestone("review-passage-selected");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [intakeView, passages, selectedIds]);

  const workspacePane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <PassageWorkspace
          api={workspaceApi}
          generating={workspaceGenerating}
          sessionQueue={sessionQueue}
          questionCountByPassage={questionCountByPassage}
          questionsByPassage={questionsByPassage}
          onOpenQuestionDetail={(q) => setDetailQuestion(q)}
          globalDifficulty={difficulty}
          globalGenerationPlan={generationPlan}
          setModeActive={genMode === "set"}
          activeRowId={activeRowId}
          onSetActiveRow={selectRow}
          onOpenRowSettings={handleSetActiveRow}
          onClearActiveRow={() => setActiveRowId(null)}
          rowStats={workspaceRowStats}
          onAddPassage={() => {
            // 워크스페이스를 닫고 내 지문함으로 돌아가 지문을 골라 담는다.
            setWorkspaceOpen(false);
            setIntakeView("library");
          }}
        />
      </div>
    </div>
  );

  const libraryPane = (
    <IntakeSurface
      intakeView={intakeView}
      setIntakeView={setIntakeView}
      intakeTab={intakeTab}
      setIntakeTab={setIntakeTab}
      libraryCount={passages.length}
      libraryLabel="내 지문함"
      onSubmitPastedRows={handleCreatePastedPassages}
      pasteSaving={pasteSaving}
      suppressTutorial={generateTourOpen}
      overlay={workspaceVisible ? workspacePane : undefined}
      onDismissOverlay={() => setWorkspaceOpen(false)}
      workspaceActive={workspaceActive}
      onReopenWorkspace={() => setWorkspaceOpen(true)}
      mobileStepTabs={mobileStep === "input" ? "sources" : "hidden"}
      pasteStartRef={pasteStartRef}
      onPasteStateChange={handlePasteBoardState}
      upload={
        <GenerateUploadPanel
          onBegin={handleExtractionBegin}
          onResult={handleExtractionResult}
          inFlightCount={extractionPending.length}
          suppressTutorial={generateTourOpen}
        />
      }
      examBrowser={
        <ExamPassageLibrary
          onPick={handleImportExamPassages}
          busy={examImporting}
          pickLabel="다음으로 (내 지문함)"
          headerHint="고른 지문이 내 지문함에 담겨요"
          // 모바일: '다음으로 (내 지문함)' 선택 바를 하단 고정(공용 스텝 네비 대체).
          mobileFixedFooter
        />
      }
      library={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              onRenameCollection={handleRenamePassageCollection}
              onRemovePassagesFromFolder={handleRemovePassagesFromFolder}
              onRemoveSelectedFromCollection={
                handleRemoveSelectedPassagesFromCollection
              }
              onDeleteSelectedPassages={handleDeleteSelectedPassages}
              passageBulkAction={passageBulkAction}
              genMode={genMode}
              totalQuestions={totalQuestions}
              handleBatchGenerate={handleBatchGenerate}
              questionCountByPassage={questionCountByPassage}
              questionsByPassage={questionsByPassage}
              onOpenQuestionDetail={setDetailQuestion}
              learningGeneratingPassageIds={learningGeneratingPassageIds}
              learningCompletedPassageIds={freshLearningPassageIds}
              freshAnalysisPassageIds={freshAnalysisPassageIds}
              onFreshAnalysisAcknowledged={acknowledgeFreshAnalysisPassage}
              reviewBulkActionRunning={reviewBulkActionRunning}
              onBulkCompleteExtractionReview={
                handleBulkCompleteExtractionReview
              }
              onBulkGenerateLearning={handleBulkGenerateLearning}
              learningBulkActionRunning={learningBulkActionRunning}
              learningCreditCostPerPassage={CREDIT_COSTS.PASSAGE_ANALYSIS}
              onEditSelected={handleLoadSelectedToWorkspace}
              workspacePassageIds={workspacePassageIds}
              workspaceActive={workspaceActive}
              handleOpenAnalysisModal={handleOpenAnalysisModal}
              onViewPassageContent={handleViewPassageContent}
              onPassageRenamed={(passageId, title) =>
                setPassages((prev) =>
                  prev.map((p) => (p.id === passageId ? { ...p, title } : p)),
                )
              }
              lastViewedPassageId={lastViewedPassageId}
              openPassageDetailId={detailPassage?.id ?? null}
              onToggleExtractionReview={handleToggleExtractionReview}
              reviewActionPassageIds={reviewActionPassageIds}
            />
          </div>
        </div>
      }
    />
  );

  // ── 지문별 '문제 생성' 모달 ──
  // 우측 사이드 설정 컬럼을 폐기하고, 각 지문 카드의 '문제 생성' 버튼으로 이
  // 모달을 연다. 어떤 지문을 설정 중인지 헤더에 크게 박아 혼동을 없앤다. 기존
  // GenerationConfigPanel 을 그대로 호스팅하되(hideGenerateButtons), 생성 CTA 는
  // 모달 푸터가 소유해 이 지문 하나만 독립 생성한다.
  const activeRowStats = activeRowId
    ? workspaceRowStats.get(activeRowId)
    : undefined;
  const genModal =
    genModalOpen && activeRow ? (
      <PassageGenerateModal
        open
        onClose={closeGenModal}
        passageNumber={activeRowIndex >= 0 ? activeRowIndex + 1 : 1}
        title={activeRow.title}
        contentPreview={activeRow.content.trim().slice(0, 140)}
        fullContent={activeRow.content}
        wordCount={countWords(activeRow.content)}
        questions={activeRowStats?.questions ?? 0}
        creditCost={activeRowStats?.creditCost ?? 0}
        needsVariant={rowNeedsVariant(activeRow)}
        generating={workspaceGenerating}
        onGenerate={handleGenerateActiveRow}
        // 모바일: 모달은 '유형 담기'만(즉시 생성 안 함) — 생성은 아래 '문제 확인'
        // 하단 바가 담긴 전 지문을 일괄 처리한다. 데스크톱은 기존 지문별 생성 유지.
        configOnly={isMobileViewport}
      >
        <GenerationConfigPanel
          genMode={panelGenMode}
          setGenMode={panelSetGenMode}
          editingRow={editingRow}
          activePassageId={activeRow?.passageId ?? null}
          setPresetId={panelSetPresetId}
          onSetPresetChange={panelOnSetPresetChange}
          setPresetCounts={panelSetPresetCounts}
          onSetPresetCountsChange={panelOnSetPresetCountsChange}
          setMemberOverrides={panelSetMemberOverrides}
          onSetMemberOverridesChange={panelOnSetMemberOverridesChange}
          setMemberOverridesByPreset={panelSetMemberOverridesByPreset}
          onSetMemberOverridesByPresetChange={
            panelOnSetMemberOverridesByPresetChange
          }
          generationPlan={panelGenerationPlan}
          setGenerationPlan={panelSetGenerationPlan}
          typeCounts={panelTypeCounts}
          setTypeCount={panelSetTypeCount}
          setTypeCounts={panelSetTypeCounts}
          questionTypeSettings={panelQuestionTypeSettings}
          setQuestionTypeSettings={panelSetQuestionTypeSettings}
          totalQuestions={panelTotalQuestions}
          passageSentenceCount={
            activeRow ? countPassageSentences(activeRow.content) : undefined
          }
          difficulty={panelDifficulty}
          setDifficulty={panelSetDifficulty}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          savedPrompts={savedPrompts}
          showSavedPrompts={showSavedPrompts}
          setShowSavedPrompts={setShowSavedPrompts}
          showSaveInput={showSaveInput}
          setShowSaveInput={setShowSaveInput}
          savePromptName={savePromptName}
          setSavePromptName={setSavePromptName}
          savingPrompt={savingPrompt}
          setSavingPrompt={setSavingPrompt}
          editingPromptId={editingPromptId}
          setEditingPromptId={setEditingPromptId}
          editingName={editingName}
          setEditingName={setEditingName}
          loadSavedPrompts={loadSavedPrompts}
          canGenerate={canGenerate}
          selectedIds={selectedIds}
          handleBatchGenerate={handleBatchGenerate}
          workspaceActive={workspaceActive}
          workspaceSelectedOnlyCount={workspaceSummary.selectedOnlyCount}
          workspaceRowCount={workspaceSummary.rowCount}
          workspaceTotalQuestions={workspaceSummary.totalQuestions}
          workspaceCreditCost={workspaceSummary.creditCost}
          workspaceVariantCount={workspaceSummary.variantCount}
          workspaceGenerating={workspaceGenerating}
          onWorkspaceGenerate={handleWorkspaceGenerate}
          hideGenerateButtons
          tourActive={generateTourOpen}
        />
      </PassageGenerateModal>
    ) : null;

  // ── 모바일 하단 이전/다음 바 구성 ──
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
  // 워크스페이스 스텝: 이번 세션에 생성(중/완료/오류)된 문제가 하나라도 있어야
  // '문제 확인'이 의미 있다. 없으면 하단 CTA 를 비활성으로 눌러 '다음으로(유형선택)'
  // 으로 먼저 생성하도록 유도한다(결과로의 이동 자체는 상단 스텝 헤더 4번 탭으로
  // 언제든 가능 — 자유 이동은 막지 않는다).
  const hasSessionQuestions =
    queueCounts.done > 0 ||
    queueCounts.generating > 0 ||
    queueCounts.error > 0;
  // 담긴 지문 중 '유형이 설정된'(=생성 대기) 지문 수·문제 수 — 모바일 '문제 확인'
  // 버튼이 담긴 전 지문을 일괄 생성할지, 결과만 볼지 판단하는 데 쓴다.
  const workspacePending = (() => {
    let rows = 0;
    let questions = 0;
    for (const row of workspaceApi.rows) {
      const st = workspaceRowStats.get(row.localId);
      if (st && st.questions > 0) {
        rows += 1;
        questions += st.questions;
      }
    }
    return { rows, questions };
  })();
  const mobileNext = (() => {
    if (mobileStep === "input") {
      // 직접 입력 탭에 등록할 지문이 쌓여 있으면 '다음' = 등록하고 내 지문함
      // (콘텐츠 안의 '다음으로 (내 지문함)' 버튼을 하단 바로 옮긴 것 — 등록
      // 성공 시 intakeView 가 library 로 바뀌며 스텝이 자동으로 넘어간다).
      if (intakeTab === "paste" && intakeView === "intake" && pasteBoard.count > 0)
        return {
          label: pasteBoard.busy
            ? "등록 중…"
            : `다음으로 (내 지문함) · 지문 ${pasteBoard.count}개`,
          onClick: () => pasteStartRef.current?.(),
          disabled: pasteBoard.busy,
        };
      return {
        label: "내 지문함으로",
        onClick: () => goToMobileStep("library"),
      };
    }
    if (mobileStep === "library") {
      // 선택한 지문이 있으면 '다음'이 곧 워크스페이스 담기 — PC 의
      // '편집(워크스페이스로)' 버튼과 같은 핸들러를 쓴다. 담기 성공 시
      // workspaceOpen 이 켜지고 동기화 효과가 스텝을 넘긴다.
      if (selectedIds.size > 0)
        return {
          label: `선택 ${selectedIds.size}개 워크스페이스로`,
          onClick: () => void handleLoadSelectedToWorkspace(),
        };
      if (workspaceActive)
        return {
          label: "워크스페이스로",
          onClick: () => goToMobileStep("workspace"),
        };
      // 비활 사유 = 선택 0개 → 눌러도 막지 말고 지문 카드들을 글로우해 선택을 유도.
      return {
        label: "워크스페이스로",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(document.body, "[data-drag-item-id]", {
            max: 24,
            // 대상이 화면 밖일 수 있으니 하단 고정 바에 가리지 않게 가운데로 스크롤.
            scrollBlock: "center",
          }),
      };
    }
    if (mobileStep === "workspace") {
      const totalWorkspaceRows = workspaceApi.rows.length;
      // ① 담긴 지문 중 하나라도 유형이 있으면 → 생성 준비 단계. 단 '모든' 담긴
      //    지문이 각각 유형을 담아야 활성(사용자 요청). 활성 시 담긴 전 지문을 한 번에
      //    일괄 생성한 뒤 각 typeCounts 를 비우고(재생성 방지) 결과 스텝으로 이동한다.
      if (workspacePending.rows > 0) {
        if (workspacePending.rows === totalWorkspaceRows)
          return {
            label: `${workspacePending.rows}개 지문 문제 생성 (${workspacePending.questions}문제)`,
            onClick: () => {
              void handleWorkspaceGenerate();
              workspaceApi.rows.forEach((row) => {
                if (row.override && overrideHasTypeCounts(row.override)) {
                  const next = { ...row.override, typeCounts: {} };
                  workspaceApi.setOverride(
                    row.localId,
                    isOverrideEmpty(next) ? null : next,
                  );
                }
              });
              goToMobileStep("results");
            },
          };
        // 일부 지문만 유형을 담음 → 비활성. 눌러도 막지 말고 지문 행들을 글로우해
        // 남은 지문에도 유형을 담도록 유도한다.
        const remaining = totalWorkspaceRows - workspacePending.rows;
        return {
          label: `${remaining}개 지문에 유형을 더 담아주세요`,
          disabled: true,
          onDisabledHint: () =>
            triggerHintGlowWithin(
              document.body,
              '[data-generate-tour="row-generate-button"]',
              { scrollBlock: "center" },
            ),
        };
      }
      // ② 담긴 유형은 없지만 이미 생성물이 있으면 → 결과 보기.
      if (hasSessionQuestions)
        return {
          label: queueCounts.generating > 0 ? "문제 확인 (생성 중)" : "문제 확인",
          onClick: () => goToMobileStep("results"),
        };
      // ③ 아무 지문도 유형 설정이 안 됐고 생성물도 없음 → 비활성. 눌러도 막지 말고
      //    지문별 '유형선택하고 지문 담기' 버튼들을 글로우해 유형 담기를 유도한다.
      return {
        label: "문제 확인",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(
            document.body,
            '[data-generate-tour="row-generate-button"]',
            // 생성 버튼이 긴 지문 아래·고정 바 뒤에 가려질 수 있으니 가운데로 스크롤.
            { scrollBlock: "center" },
          ),
      };
    }
    return null;
  })();
  const mobileNextHint =
    mobileStep === "library" && selectedIds.size === 0 && !workspaceActive
      ? "지문 카드를 선택하면 워크스페이스로 보낼 수 있어요"
      : // 워크스페이스 안내는 하단 '담긴 유형' 장바구니 바가 대신하므로 힌트 생략.
        undefined;

  // 파일업로드·직접입력·기출 탭(지문 입력 스텝)에서는 각 보드가 자체 하단 고정
  // 액션 바(담긴 지문 + 추출/등록/담기 버튼)를 렌더하므로, 중복되는 공용 스텝 네비를
  // 숨기고 그 높이만큼 아래 여백을 예약한다(고정 바에 콘텐츠가 가리지 않게).
  const boardFixedFooterActive =
    mobileStep === "input" &&
    intakeView === "intake" &&
    (intakeTab === "upload" || intakeTab === "paste" || intakeTab === "exam");

  // ── 워크스페이스 하단 고정 '담긴 유형' 장바구니 (모바일) ──
  // 지문마다 유형을 담으면(모달 '유형 담기') 여기 모여, 펼치면 목록·빼기.
  // 담긴 유형이 곧 일괄 생성 대상 — 바로 아래 '문제 생성' 버튼이 전부 생성한다.
  const workspaceConfiguredRows = workspaceApi.rows
    .map((row) => {
      const st = workspaceRowStats.get(row.localId);
      return {
        localId: row.localId,
        title: row.title,
        questions: st?.questions ?? 0,
      };
    })
    .filter((r) => r.questions > 0);
  const clearRowTypes = (localId: string) => {
    const row = workspaceApi.rows.find((r) => r.localId === localId);
    if (!row?.override) return;
    const next = { ...row.override, typeCounts: {} };
    workspaceApi.setOverride(localId, isOverrideEmpty(next) ? null : next);
  };
  const workspaceCart = (
    <>
      {workspaceCartOpen && workspaceConfiguredRows.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {workspaceConfiguredRows.map((r, i) => (
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
                <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-600">
                  {r.questions}문제
                </span>
                <button
                  type="button"
                  onClick={() => clearRowTypes(r.localId)}
                  aria-label="담은 유형 빼기"
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
        aria-label={workspaceCartOpen ? "담긴 유형 목록 접기" : "담긴 유형 목록 펼치기"}
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {workspacePending.rows > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {workspacePending.rows}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 유형 {workspacePending.rows}지문
            {workspacePending.questions > 0
              ? ` · ${workspacePending.questions}문제`
              : ""}
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {workspacePending.rows > 0
              ? "탭하여 담긴 지문 유형 보기·빼기"
              : "지문마다 ‘유형 담기’로 담으면 여기 모여요"}
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

  return (
    // min-h 뷰포트 채움은 PC 전용 — 모바일은 콘텐츠만큼만 차지해 아래
    // 사이트 푸터 위에 빈 공간이 생기지 않게 한다.
    <div className="-m-6 min-w-0 bg-[#F4F6F9] px-2 py-4 sm:px-4 lg:min-h-[calc(100vh-56px)] lg:px-6 xl:px-8">
      {/* 하단 고정 바 여유는 아래 사이트 푸터가 대신 제공 — 예약 패딩 최소화.
          파일업로드 탭만 크롭 보드의 하단 고정 액션 바 높이를 예약한다. */}
      <main
        className={
          "flex w-full min-w-0 flex-col gap-4 " +
          // 워크스페이스 스텝은 하단 고정 바가 '담긴 유형' 장바구니 + 생성 버튼이라
          // 더 두꺼워 그만큼 여백을 예약(마지막 지문 카드가 안 가리게).
          (boardFixedFooterActive
            ? "max-lg:pb-[140px]"
            : mobileStep === "workspace"
              ? "max-lg:pb-[150px]"
              : "max-lg:pb-1")
        }
      >
        {/* 모바일 전용 스테퍼 — 현재 단계 표시 + 탭으로 즉시 이동 */}
        <MobileStepHeader
          steps={MOBILE_FLOW_STEPS}
          currentKey={mobileStep}
          onSelect={(key) => goToMobileStep(key as MobileStep)}
        />
        {/* ═══ TOP SECTION: 내 지문함(=워크스페이스가 덮음) + 설정 ═══
            워크스페이스를 좌측 모달 패널로 띄우지 않는다. 대신 지문을
            워크스페이스로 보내면 가운데 컬럼에서 내 지문함을 그대로 덮는다.
            모바일 '문제 확인' 스텝에서는 이 섹션을 숨기고(언마운트 아님 —
            진행 중 입력·워크스페이스 상태 유지) 결과 섹션만 보여준다. */}
        <div
          className={
            "min-w-0" + (mobileStep === "results" ? " max-lg:hidden" : "")
          }
        >
        <WorkspaceShell
          leftActive={false}
          rightPaneMin={400}
          // 모바일은 상단 앱바("문제 생성")·스테퍼와 중복이라 이 헤더를 숨긴다.
          hideHeaderOnMobile
          header={
            <div
              data-generate-tour="page-title"
              className="flex items-start justify-between gap-3"
            >
              <WorkflowPageTitle
                icon={QuestionGenerationIcon}
                title="문제 생성"
                description="지문을 선택해 편집·AI 변형한 뒤, 유형과 난이도를 설정해 문제를 생성합니다."
              />
              {GENERATE_TUTORIAL_ENABLED ? (
                <button
                  type="button"
                  onClick={() => openGenerateTour()}
                  className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  title="문제 생성 튜토리얼을 다시 봅니다"
                >
                  튜토리얼
                </button>
              ) : null}
            </div>
          }
          left={null}
          right={
            <div className="flex h-full min-h-0 min-w-0">
              {/* 우측 사이드 설정 컬럼을 폐기 — 가운데(내 지문함=워크스페이스)가
                  전체 폭을 쓰고, 유형·생성 설정은 지문별 '문제 생성' 모달에서만
                  편집한다. 워크스페이스는 IntakeSurface 본문을 덮는 오버레이. */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {libraryPane}
              </div>
            </div>
          }
        />
        </div>

        {/* ═══ 문제 관리 + 생성/검수 결과 (통합) — 결과 박스 위 ═══ */}
        {/* BottomQueueSection 을 EmbeddedQuestionBank 안으로 병합: 생성 큐는
            목록 맨 앞에, 완료 문제는 파란 글로우. 튜어/마키 boundary 는
            이 섹션에 그대로 유지한다. 모바일에서는 '문제 확인' 스텝에서만
            노출한다(마운트는 유지 — 생성 큐 폴링·필터 상태 보존). */}
        <section
          ref={bottomQueueBoundaryRef}
          data-generate-tour="results-section"
          className={mobileStep !== "results" ? "max-lg:hidden" : undefined}
        >
          <EmbeddedQuestionBank
            academyId={academyId}
            sessionQueue={sessionQueue}
            queueCounts={queueCounts}
            queueFilter={queueFilter}
            setQueueFilter={setQueueFilter}
            onRetryGeneration={retryGeneration}
            marqueeBoundaryRef={bottomQueueBoundaryRef}
            setRefreshKey={setRefreshNonce}
          />
        </section>

        {/* 모바일 전용 하단 고정 이전/다음 바 */}
        {!boardFixedFooterActive ? (
          <MobileStepNav
            prev={mobilePrev}
            next={mobileNext}
            hint={mobileNextHint}
            // 워크스페이스 스텝: 이전/생성 버튼 위에 '담긴 유형' 장바구니 바를 얹는다.
            cart={mobileStep === "workspace" ? workspaceCart : undefined}
          />
        ) : null}
      </main>
      {GENERATE_TUTORIAL_ENABLED ? (
        <GeneratePageTour
          onOpenChange={setGenerateTourOpen}
          onResultHighlightCountChange={setGenerateTourResultHighlightCount}
          onFileTutorialStart={() => setDetailQuestion(null)}
        />
      ) : null}
      {/* end vertical stack */}

      {/* ─── 지문별 '문제 생성' 모달 ─── */}
      {genModal}

      {/* ─── Review Modal ─── */}
      {reviewItem && (
        <QuestionReviewModal
          open={!!reviewModalId}
          onClose={() => setReviewModalId(null)}
          passageTitle={reviewItem.passageTitle}
          passageContent={reviewItem.passageContent}
          analysisData={reviewItem.analysisData}
          passageMeta={reviewItem.passageMeta}
          questions={reviewItem.questions}
          onSave={handleSaveQuestions}
          onRegenerate={() => {
            setReviewModalId(null);
            const p = passages.find((pp) => pp.id === reviewItem.passageId);
            if (p) {
              handleSelectPassage(p);
              // 자동 생성 제거 — 재생성은 '유형 지정'으로 연다.
              setGenMode("manual");
              setTypeCounts(reviewItem.config.typeCounts);
              setQuestionTypeSettings(
                reviewItem.config.questionTypeSettings ||
                  getDefaultQuestionTypeGenerationSettings(),
              );
              setGenerationPlan(reviewItem.config.generationPlan || "STANDARD");
              setDifficulty(reviewItem.config.difficulty as any);
              setCustomPrompt(reviewItem.config.prompt);
            }
          }}
        />
      )}

      {/* ─── Question Detail Modal ─── */}
      {detailQuestion && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDetailQuestion(null)}
          />
          <div
            data-generate-tour="question-detail-modal"
            className="relative z-10 w-full max-w-[1200px] mx-4 my-4 bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 shrink-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="text-[15px] font-bold text-slate-800">
                  문제 상세
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {detailQuestion.approved ? (
                  <button
                    type="button"
                    onClick={() => handleUnapproveQuestion(detailQuestion.id)}
                    title="검수취소"
                    aria-label="검수취소"
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApproveQuestion(detailQuestion.id)}
                    title="검수완료"
                    aria-label="검수완료"
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* 수정하기 — 검수완료 버튼 오른쪽. 상세를 닫고 편집기를 연다. */}
                <button
                  type="button"
                  onClick={() => {
                    const id = detailQuestion.id;
                    setDetailQuestion(null);
                    editor.openEditor(id);
                  }}
                  title="수정하기"
                  aria-label="수정하기"
                  className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <SquarePen className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDetailQuestion(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Content: 2 columns */}
            <div className="flex-1 overflow-hidden grid grid-cols-2">
              {/* Left: Passage */}
              <div className="border-r border-slate-200 overflow-y-auto">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <div className="whitespace-pre-wrap font-mono text-sm leading-[2] text-slate-800">
                      {detailQuestion.passage.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    지문 없음
                  </div>
                )}
              </div>
              {/* Right: Question */}
              <div className="relative overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-5">
                  <QuestionCard
                    q={detailQuestion}
                    num={1}
                    readonly
                    hideReviewStatusStamp
                  />
                </div>
                {/* 검수 도장 — 이 팝업 전용으로 우측 문제 박스 우측 상단에 고정 + 확대.
                    공용 ReviewStatusStamp는 그대로 두고 transform scale로만 키운다. */}
                <ReviewStatusStamp
                  approved={detailQuestion.approved}
                  className="absolute right-9 top-9 z-10 origin-top-right scale-125"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <EditQuestionDialog
        open={editor.editDialogOpen}
        onOpenChange={(open) => {
          if (!open) editor.closeEditor();
          else editor.setEditDialogOpen(true);
        }}
        loading={editor.questionLoading}
        loadError={editor.questionLoadError}
        editingQuestion={editor.editingQuestion}
        editingQuestionId={editor.editingQuestionId}
        onClose={editor.closeEditor}
        onDeleted={editor.handleEditorDeleted}
        onRetry={editor.openEditor}
        onSaved={loadSavedQuestions}
        onApproved={loadSavedQuestions}
      />

      {/* ─── Analysis Detail Modal ─── */}
      {analysisModalPassage && (
        <PassageAnalysisModal
          open={!!analysisModalPassage}
          onClose={() => setAnalysisModalPassage(null)}
          passage={analysisModalPassage}
          initialAnalysis={
            analysisModalPassage.analysis?.analysisData
              ? typeof analysisModalPassage.analysis.analysisData === "string"
                ? JSON.parse(analysisModalPassage.analysis.analysisData)
                : analysisModalPassage.analysis.analysisData
              : null
          }
          reviewBusy={reviewActionPassageIds.has(analysisModalPassage.id)}
          onToggleExtractionReview={handleToggleExtractionReview}
        />
      )}

      {/* ─── 미분석 지문 전체 내용 모달 (분석 모달 폴백용) ─── */}
      <PassageContentModal
        open={!!contentModalPassage}
        onClose={() => setContentModalPassage(null)}
        passage={contentModalPassage}
        reviewBusy={
          !!contentModalPassage &&
          reviewActionPassageIds.has(contentModalPassage.id)
        }
        onToggleExtractionReview={handleToggleExtractionReview}
      />

      {/* ─── 추출/입력 지문 "전체 보기" — 복원 근거 + 추출 이미지 상세 모달 ─── */}
      {detailPassage && (
        <ExtractionDetailModal
          passage={detailPassage}
          onClose={() => setDetailPassage(null)}
          onPassageAnalyzed={handleInlinePassageAnalyzed}
          onPassageSaved={(passageId) => {
            // 카드 목록만 제자리 패치한다. detailPassage 객체를 갱신하면
            // 모달의 에디터 리셋 effect 가 돌아 마킹이 날아가므로 건드리지
            // 않는다(모달 헤더 제목은 editorTitle 을 직접 보여준다).
            void patchPassages([passageId]);
          }}
          reviewBusy={reviewActionPassageIds.has(detailPassage.id)}
          onToggleExtractionReview={handleToggleExtractionReview}
          deleteBusy={deletingDetailId === detailPassage.id}
          onDelete={handleDeleteDetailPassage}
        />
      )}

      {/* ─── 백그라운드 학습자료 생성 버퍼링 창 ─── */}
      <LearningGenerationIndicator analysisJobs={analysisActivityJobs} />

      {/* Loading overlay for analysis modal fetch */}
      {loadingAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="bg-white rounded-xl px-6 py-4 shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-[13px] text-slate-700 font-medium">
              학습지 생성 데이터 로딩 중...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
