"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { QuestionReviewModal } from "@/components/workbench/question-review-modal";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import {
  PassageContentModal,
  type PassageContentModalPassage,
} from "@/components/workbench/passage-content-modal";
import { type QuestionCardItem } from "@/components/workbench/question-card";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  type PassageItem,
  type PassageCollectionItem,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  type PassageSortOrder,
} from "./generate-page-types";
import { PassageCardGrid } from "./passage-card-grid";
import { usePassageCollections } from "./use-passage-collections";
import { usePassageIntake } from "./use-passage-intake";
import { useExtractionReview } from "./use-extraction-review";
import { useQuestionReviewActions } from "./use-question-review-actions";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";
import {
  IntakeSurface,
  type IntakeView,
  type IntakeTab,
} from "./intake/intake-surface";
import { GenerateUploadPanel } from "./intake/generate-upload-panel";
import { ExamPassageLibrary } from "@/components/workbench/exam-passage-library";
import { KoreanExamPassageLibrary } from "@/components/workbench/korean-exam-passage-library";
import { useGenerateExtraction } from "./intake/use-generate-extraction";
import { ExtractionLoadingCards } from "./intake/extraction-loading-cards";
import { ExtractionDetailModal } from "./intake/extraction-detail-modal";
import { useTaskQueue } from "@/components/workbench/task-queue/context";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import { GenerationConfigPanel } from "./generation-config-panel";
import { EmbeddedQuestionBank } from "./embedded-question-bank";
import { useGenerationHandlers } from "./use-generation-handlers";
import { useKoreanSetGeneration } from "./use-korean-set-generation";
import { useRowSettingsPanel } from "./use-row-settings-panel";
import { usePointPicker } from "./use-point-picker";
import { useMobileStepFlow } from "./use-mobile-step-flow";
import { useGenerationSessionQueue } from "./generation-session-store";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";
import { type QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  getDefaultQuestionTypeGenerationSettings,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import {
  MobileStepHeader,
  MobileStepNav,
} from "@/components/workbench/mobile-step-flow";
import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkspaceShell } from "./workspace-shell";
import {
  countWords,
  rowNeedsVariant,
} from "./workspace/workspace-types";
import { useWorkspaceRows } from "./workspace/use-workspace-rows";
import { useWorkspaceGeneration } from "./workspace/use-workspace-generation";
import { PassageWorkspace } from "./workspace/passage-workspace";
import { PassageGenerateModal } from "./workspace/passage-generate-modal";
import { type TeacherPoint } from "./generation-config-panel-parts/point-picker-config";
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
import {
  GENERATE_TUTORIAL_ENABLED,
  MOBILE_FLOW_STEPS,
  SAVED_QUESTIONS_DONE_REFRESH_DELAY_MS,
  derivePastedTitle,
  type MobileStep,
} from "./generate-page-client-lib";
import {
  LoadingAnalysisOverlay,
  QuestionDetailModal,
} from "./generate-page-modals";
import { LibraryCart, WorkspaceCart } from "./generate-mobile-carts";

// ─── Component ───────────────────────────────────────────

export function GeneratePageClient({
  academyId,
  defaultMode = "manual",
  subjectScope,
}: {
  academyId: string;
  defaultMode?: "manual";
  subjectScope?: "KOREAN";
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
  // 이미 관측한 큐 항목 id — 새로고침 시 서버 폴링이 과거 잡 N개를 한꺼번에
  // 채우며 큐가 0 → N 으로 커지는데(하이드레이션), 이를 '사용자가 방금 생성함'
  // 으로 오인해 결과 섹션으로 스크롤하면 매 새로고침마다 화면이 중간으로 튄다.
  // 새로 등장한 항목 중 '방금(수 초 내)' 만들어진 것이 있을 때만 스크롤해
  // 하이드레이션(과거 createdAt)과 실제 생성(최근 createdAt)을 구분한다.
  const seenQueueIdsRef = useRef<Set<string> | null>(null);
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
  // 직접 입력 보드 연동 — 하단 고정 바의 '다음'이 등록(다음으로 내 지문함)
  // 버튼을 대신한다. ref 로 시작 동작을, 콜백으로 누적 수·작업 상태를 받는다.
  const pasteStartRef = useRef<(() => void) | null>(null);
  const [pasteBoard, setPasteBoard] = useState({ count: 0, busy: false });
  const handlePasteBoardState = useCallback(
    (state: { count: number; busy: boolean }) => setPasteBoard(state),
    [],
  );

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
    // 최초 마운트(첫 하이드레이션 포함): 현재 항목을 모두 '관측함'으로 등록만
    // 하고 스크롤하지 않는다. 이후 등장하는 항목만 후보로 본다.
    if (seenQueueIdsRef.current === null) {
      seenQueueIdsRef.current = new Set(sessionQueue.map((item) => item.id));
      return;
    }
    const seen = seenQueueIdsRef.current;
    const fresh = sessionQueue.filter((item) => !seen.has(item.id));
    for (const item of fresh) seen.add(item.id);

    // 새로 등장한 항목 중 '방금(8초 내) 생성된 것'이 하나라도 있을 때만 스크롤.
    // 폴링이 느려 하이드레이션이 지연돼도 과거 createdAt 은 최근이 아니므로
    // 새로고침 튐이 발생하지 않는다.
    const now = Date.now();
    const hasJustCreated = fresh.some((item) => {
      const t = item.createdAt ? Date.parse(item.createdAt) : NaN;
      return Number.isFinite(t) && now - t < 8_000;
    });
    if (!hasJustCreated) return;

    window.requestAnimationFrame(() => {
      bottomQueueBoundaryRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [sessionQueue]);

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

  // ── "포인트 짚어주기" (point-picker-design.md §2) ──
  // 지문 스코프의 교사 지정 출제 포인트 — passageId → typeId → TeacherPoint[].
  // 지문 간 누출을 막기 위해 반드시 passageId 로 스코프하고, 본문이 바뀌면
  // (해시 불일치 effect — use-point-picker.tsx) 그 지문의 포인트를 통째로
  // 무효화한다. 이 상태만 본체에 남는 이유: 아래 useGenerationHandlers/
  // useWorkspaceGeneration 이 픽커 훅(usePointPicker)보다 먼저 소비한다.
  const [teacherPointsByPassage, setTeacherPointsByPassage] = useState<
    Record<string, Record<string, TeacherPoint[]>>
  >({});

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

  // ── Saved questions from DB (persists across page visits) ──
  const [savedQuestions, setSavedQuestions] = useState<QuestionCardItem[]>([]);
  const [loadingSavedQuestions, setLoadingSavedQuestions] = useState(true);

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
  // 과목 스코프를 API 에 전파 — 국어 라우트는 국어 지문만, 영어(기본)는 국어
  // 지문이 서버에서부터 제외돼 내려온다(클라이언트 필터 불필요).
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      const response = await fetch(
        `/api/passages/list?academyId=${academyId}&includeUnreviewed=true${
          subjectScope === "KOREAN" ? "&scope=KOREAN" : ""
        }`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "지문 목록을 불러오지 못했습니다.");
      }
      setPassages(data.passages || []);
      if (data.filters) setFilterOptions(data.filters);
      if (data.collections) setCollections(data.collections);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "지문 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingPassages(false);
    }
  }, [academyId, subjectScope]);

  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // 컬렉션(폴더)·지문 벌크 조작 + patchPassages — use-passage-collections.ts 로 추출.
  const {
    patchPassages,
    passageBulkAction,
    deletingDetailId,
    handleCreatePassageCollection,
    handleRenamePassageCollection,
    handleRemovePassagesFromFolder,
    handleCopySelectedPassagesToCollection,
    handleMovePassagesToCollection,
    handleMoveSelectedPassagesToCollection,
    handleCopyPassagesToCollection,
    handleRemoveSelectedPassagesFromCollection,
    handleDeleteSelectedPassages,
    handleDeleteDetailPassage,
  } = usePassageCollections({
    academyId,
    subjectScope,
    loadPassages,
    passages,
    setPassages,
    collections,
    setCollections,
    selectedIds,
    setSelectedIds,
    selectedCollectionId,
    selectedPassage,
    setSelectedPassage,
    setAnalysisData,
    setDetailPassage,
  });

  // 추출 검수 토글·일괄 검수완료 클러스터 — use-extraction-review.ts 로 추출.
  const {
    reviewActionPassageIds,
    reviewBulkActionRunning,
    handleToggleExtractionReview,
    handleBulkCompleteExtractionReview,
  } = useExtractionReview({
    patchPassages,
    setPassages,
    setSelectedIds,
    setDetailPassage,
    setContentModalPassage,
    setAnalysisModalPassage,
  });

  // 백그라운드 학습자료 생성(서버 분석 잡) 폴링. 잡이 끝나면 해당 지문만
  // 제자리 패치해 새로고침 느낌 없이 카드가 "분석 완료" 모습(배지·글로우)으로
  // 바뀐다.
  const analysisActivityJobs = usePassageAnalysisActivity({
    onSettled: useCallback(
      // 타입 주석 사유: useCallback 래핑이 옵션 객체의 문맥 타입(onSettled
      // 시그니처)을 파라미터까지 전달하지 못한다(noImplicitAny) — 훅 선언
      // (PassageAnalysisActivityOptions.onSettled)과 동일 타입을 명시.
      (completedPassageIds: string[], failedPassageIds: string[]) => {
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

  // 지문 등록/가져오기(직접 입력·기출 가져오기·추출 승격 후처리·신규 글로우
  // 확인/인라인 분석 반영) — use-passage-intake.ts 로 추출.
  const {
    pasteSaving,
    handleCreatePastedPassages,
    examImporting,
    handleImportExamPassages,
    handleImportKoreanExamPassages,
    clearExtractionPendingRef,
    handleExtractionPromoted,
    acknowledgeFreshAnalysisPassage,
    handleInlinePassageAnalyzed,
  } = usePassageIntake({
    loadPassages,
    patchPassages,
    derivePastedTitle,
    setPassageSearch,
    setSelectedCollectionId,
    setAnalysisStatusFilter,
    setSelectedIds,
    setIntakeView,
    setFreshAnalysisPassageIds,
    setFreshLearningPassageIds,
    setRecentExtractionPassageIds,
  });

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

  // 문항 검수 액션 클러스터 — use-question-review-actions.ts 로 추출.
  const {
    markQuestionDeletedLocally,
    handleApproveQuestion,
    handleUnapproveQuestion,
  } = useQuestionReviewActions({
    setSavedQuestions,
    setDetailQuestion,
    setSessionQueue,
    loadSavedQuestions,
  });

  const editor = useQuestionEditor(markQuestionDeletedLocally);

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
        // 타입가드: filter(Boolean) 은 null 을 못 좁힌다 — 술어로 명시
        // (Boolean 판정 동일, 런타임 무변경).
        .filter((p): p is PassageItem => Boolean(p));
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
      // 교사 지정 출제 포인트 — 훅이 생성 요청의 questionTypeSettings[typeId]
      // 에 wire 형태(teacherPoints)로 머지한다(point-picker-design.md §2).
      teacherPointsByPassage,
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
    teacherPointsByPassage,
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
          // 타입가드: filter(Boolean) 은 undefined 를 못 좁힌다 — 술어로
          // 명시(Boolean 판정 동일, 런타임 무변경). Set<string> 보장.
          .filter((id): id is string => Boolean(id)),
      ),
    [workspaceApi.rows],
  );

  // ── 모바일 스텝 플로우: 전환 + URL(?step=) 동기화 + 하단 이전/다음 바 모델
  // — use-mobile-step-flow.ts 훅으로 추출(스텝 상태·popstate·인테이크 동기 포함).
  const {
    isMobileViewport,
    mobileStep,
    goToMobileStep,
    mobilePrev,
    mobileNext,
    mobileNextHint,
    boardFixedFooterActive,
    workspacePending,
  } = useMobileStepFlow({
    initialMobileStepRef,
    initialPassageIdsRef,
    setWorkspaceOpen,
    setIntakeView,
    workspaceVisible,
    workspaceActive,
    intakeView,
    intakeTab,
    pasteBoard,
    pasteStartRef,
    selectedIds,
    handleLoadSelectedToWorkspace,
    workspaceApi,
    workspaceRowStats,
    handleWorkspaceGenerate,
    queueCounts,
  });
  // 워크스페이스 스텝 하단 고정 '담긴 유형' 장바구니 펼침 상태(모바일).
  const [workspaceCartOpen, setWorkspaceCartOpen] = useState(false);
  // 내 지문함(library) 스텝 하단 고정 '담긴 지문'(선택한 지문) 장바구니 펼침 상태(모바일).
  const [libraryCartOpen, setLibraryCartOpen] = useState(false);

  // ── 지문별 개별 설정 (워크스페이스) ───────────────────────────────
  // activeRow/editingRow 파생 + 행 선택·생성 모달 핸들러 + 우측 패널 '유효
  // 설정'(panel*) fork — use-row-settings-panel.ts 훅으로 추출.
  const {
    activeRowId,
    setActiveRowId,
    genModalOpen,
    activeRow,
    editingRow,
    activeRowIndex,
    selectRow,
    handleSetActiveRow,
    closeGenModal,
    handleGenerateActiveRow,
    panelDifficulty,
    panelSetDifficulty,
    panelTypeCounts,
    panelSetTypeCount,
    panelSetTypeCounts,
    panelTotalQuestions,
    panelQuestionTypeSettings,
    panelSetQuestionTypeSettings,
    panelGenMode,
    panelSetGenMode,
    panelGenerationPlan,
    panelSetGenerationPlan,
    panelSetPresetId,
    panelSetPresetCounts,
    panelOnSetPresetChange,
    panelOnSetPresetCountsChange,
    panelSetMemberOverrides,
    panelSetMemberOverridesByPreset,
    panelOnSetMemberOverridesChange,
    panelOnSetMemberOverridesByPresetChange,
  } = useRowSettingsPanel({
    workspaceApi,
    workspaceVisible,
    handleWorkspaceGenerate,
    difficulty,
    setDifficulty,
    typeCounts,
    setTypeCount,
    setTypeCounts,
    totalQuestions,
    questionTypeSettings,
    setQuestionTypeSettings,
    genMode,
    setGenMode,
    generationPlan,
    setGenerationPlan,
  });

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
      pasteSubjectScope={subjectScope}
      showUploadTab
      suppressTutorial={generateTourOpen}
      overlay={workspaceVisible ? workspacePane : undefined}
      onDismissOverlay={() => setWorkspaceOpen(false)}
      workspaceActive={workspaceActive}
      onReopenWorkspace={() => setWorkspaceOpen(true)}
      mobileStepTabs={mobileStep === "input" ? "sources" : "hidden"}
      pasteStartRef={pasteStartRef}
      onPasteStateChange={handlePasteBoardState}
      upload={
        // 국어 라우트도 파일업로드(추출) 탭을 연다 — 잡에 subject:'KOREAN' 이
        // 실려 SourceMaterial/승급 Passage 까지 과목이 전파되고, AI 원문 복원
        // (영어 전용)은 패널이 subject 게이트로 숨긴다.
        <GenerateUploadPanel
          onBegin={handleExtractionBegin}
          onResult={handleExtractionResult}
          inFlightCount={extractionPending.length}
          suppressTutorial={generateTourOpen}
          subject={subjectScope}
        />
      }
      examBrowser={
        subjectScope === "KOREAN" ? (
          // 국어 라우트 — 국어 기출 코퍼스 picker(subject=KOREAN 로 지문함 등록).
          <KoreanExamPassageLibrary
            onPick={handleImportKoreanExamPassages}
            busy={examImporting}
            pickLabel="다음으로 (내 지문함)"
            mobileFixedFooter
          />
        ) : (
          <ExamPassageLibrary
            onPick={handleImportExamPassages}
            busy={examImporting}
            pickLabel="다음으로 (내 지문함)"
            headerHint="고른 지문이 내 지문함에 담겨요"
            // 모바일: '다음으로 (내 지문함)' 선택 바를 하단 고정(공용 스텝 네비 대체).
            mobileFixedFooter
          />
        )
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
              subjectScope={subjectScope}
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
  const {
    activeRowSubject,
    activeRowKoContent,
    activeRowKoKind,
    koSetMode,
    koSetStats,
    koSetGenerating,
    handleGenerateKoSetActiveRow,
  } = useKoreanSetGeneration({
    subjectScope,
    activeRow,
    editingRow,
    panelGenMode,
    passages,
    generationPlan,
    customPrompt,
    workspaceApi,
    loadPassages,
    loadSavedQuestions,
    setSessionQueue,
    taskQueue,
    closeGenModal,
    setSetRefreshNonce,
  });

  // ── "포인트 짚어주기" 배선 — use-point-picker.tsx 로 추출 ──
  // 픽커 상태·staleness 무효화·핸들러·pointPickerNode JSX 클러스터.
  const {
    handleOpenPointPicker,
    closePointPicker,
    activeRowPointCounts,
    activeRowPointTotal,
    zeroCountPointTypeIds,
    handlePointChipClick,
    pointPickerNode,
  } = usePointPicker({
    workspaceApi,
    teacherPointsByPassage,
    setTeacherPointsByPassage,
    genModalOpen,
    activeRow,
    panelQuestionTypeSettings,
    panelTypeCounts,
    panelSetTypeCount,
  });

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
        questions={
          koSetMode ? koSetStats.questions : (activeRowStats?.questions ?? 0)
        }
        creditCost={
          koSetMode ? koSetStats.creditCost : (activeRowStats?.creditCost ?? 0)
        }
        needsVariant={rowNeedsVariant(activeRow)}
        generating={workspaceGenerating || koSetGenerating}
        onGenerate={
          koSetMode ? handleGenerateKoSetActiveRow : handleGenerateActiveRow
        }
        // 모바일: 모달은 '유형 담기'만(즉시 생성 안 함) — 생성은 아래 '문제 확인'
        // 하단 바가 담긴 전 지문을 일괄 처리한다. 데스크톱은 기존 지문별 생성 유지.
        configOnly={isMobileViewport}
        // 포인트 짚어주기 — 픽커 열림 시 모달이 2컬럼(지문 무대 + 설정 콘솔)
        // 으로 성장하고, Esc 사다리 1단(onPickerClose)은 픽커만 닫는다.
        pickerOpen={pointPickerNode !== null}
        onPickerClose={closePointPicker}
        picker={pointPickerNode}
        appliedPointCount={activeRowPointTotal}
        onPointChipClick={handlePointChipClick}
        pointCountMissing={zeroCountPointTypeIds.length > 0}
      >
        <GenerationConfigPanel
          genMode={panelGenMode}
          setGenMode={panelSetGenMode}
          editingRow={editingRow}
          activePassageId={activeRow?.passageId ?? null}
          passageSubject={activeRowSubject}
          koPassageContent={activeRowKoContent}
          koPassageKind={activeRowKoKind}
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
          // 포인트 짚어주기 — 등재 유형의 세부설정에 진입 행을 렌더하고(콜백
          // 없으면 미렌더), 적용된 유형 타일에 "포인트 N" 배지를 띄운다.
          onOpenPointPicker={handleOpenPointPicker}
          teacherPointCounts={activeRowPointCounts}
        />
      </PassageGenerateModal>
    ) : null;

  // ── 모바일 하단 고정 장바구니 2종 — generate-mobile-carts.tsx 로 추출 ──
  const workspaceCart = (
    <WorkspaceCart
      workspaceCartOpen={workspaceCartOpen}
      setWorkspaceCartOpen={setWorkspaceCartOpen}
      workspacePending={workspacePending}
      workspaceApi={workspaceApi}
      workspaceRowStats={workspaceRowStats}
    />
  );

  const librarySelectedPassages = passages.filter((p) =>
    selectedIds.has(p.id),
  );
  const libraryCart = (
    <LibraryCart
      libraryCartOpen={libraryCartOpen}
      setLibraryCartOpen={setLibraryCartOpen}
      librarySelectedPassages={librarySelectedPassages}
      toggleCheckbox={toggleCheckbox}
    />
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
                title={
                  subjectScope === "KOREAN" ? "국어 문제 생성" : "문제 생성"
                }
                description={
                  subjectScope === "KOREAN"
                    ? "국어 지문을 등록한 뒤, 국어 유형과 난이도를 설정해 문제를 생성합니다."
                    : "지문을 선택해 편집·AI 변형한 뒤, 유형과 난이도를 설정해 문제를 생성합니다."
                }
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
            subjectScope={subjectScope}
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
            // 내 지문함: '담긴 지문', 워크스페이스: '담긴 유형' 장바구니 바를 버튼 위에 얹는다.
            cart={
              mobileStep === "library"
                ? libraryCart
                : mobileStep === "workspace"
                  ? workspaceCart
                  : undefined
            }
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
      <QuestionDetailModal
        detailQuestion={detailQuestion}
        setDetailQuestion={setDetailQuestion}
        handleApproveQuestion={handleApproveQuestion}
        handleUnapproveQuestion={handleUnapproveQuestion}
        editor={editor}
      />

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
        // 캐스트 사유: 이 모달의 passage 는 본체가 PassageItem(계열)만 넣으므로
        // (contentModalPassage 상태·setContentModalPassage 주입 경로 전부),
        // 콜백이 되받는 인자는 런타임상 PassageItem 이다. 훅 시그니처
        // ((passage: PassageItem) => Promise<void>)는 구조적 최소형
        // PassageContentModalPassage 파라미터와 반변(contravariance) 방향이
        // 어긋나(publisher·difficulty 부재) 직접 캐스트가 불가 — unknown 경유.
        onToggleExtractionReview={
          handleToggleExtractionReview as unknown as (
            passage: PassageContentModalPassage,
          ) => void
        }
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
      <LoadingAnalysisOverlay loadingAnalysisModal={loadingAnalysisModal} />
    </div>
  );
}
