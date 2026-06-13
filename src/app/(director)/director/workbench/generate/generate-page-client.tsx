// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { QuestionReviewModal } from "@/components/workbench/question-review-modal";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { PassageContentModal } from "@/components/workbench/passage-content-modal";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  addPassagesToCollection,
  approveWorkbenchQuestion,
  bulkApproveWorkbenchQuestions,
  bulkDeleteWorkbenchPassages,
  bulkDeleteWorkbenchQuestions,
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
import {
  IntakeSurface,
  type IntakeView,
  type IntakeTab,
} from "./intake/intake-surface";
import { GenerateUploadPanel } from "./intake/generate-upload-panel";
import { useGenerateExtraction } from "./intake/use-generate-extraction";
import { ExtractionLoadingCards } from "./intake/extraction-loading-cards";
import { ExtractionDetailModal } from "./intake/extraction-detail-modal";
import { useTaskQueue } from "@/components/workbench/task-queue/context";
import { GenerationConfigPanel } from "./generation-config-panel";
import { BottomQueueSection } from "./bottom-queue-section";
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
import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkspaceShell } from "./workspace-shell";
import {
  ArrowDownToLine,
  ChevronRight,
  GripVertical,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Settings2,
} from "lucide-react";
import { useWorkspaceRows } from "./workspace/use-workspace-rows";
import { useWorkspaceGeneration } from "./workspace/use-workspace-generation";
import { PassageWorkspace } from "./workspace/passage-workspace";

// ─── Helpers ─────────────────────────────────────────────

// 우측 "유형·생성 설정" 컬럼 너비 (드래그 조절 가능).
// 336px = 유형 라벨이 잘리지 않는 최소폭이지만, 사용자가 의도적으로
// 줄이는 경우 300px까지 허용 (라벨은 truncate로 우아하게 줄어든다).
const CONFIG_PANE_WIDTH_KEY = "smoat:generate:config-pane-width";
const CONFIG_PANE_MIN = 300;
const CONFIG_PANE_DEFAULT = 360;
// 저장값 위생용 절대 상한 — 실제 드래그 한계는 컨테이너 폭에서
// [워크스페이스 최소 120px + 핸들 20px + 여유 4px]을 뺀 값으로 동적 계산.
const CONFIG_PANE_MAX = 1600;
const CONFIG_PANE_RESERVED = 144;

/** Build a passage title from the first non-empty line of pasted content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

const UNDO_TOAST_DURATION = 8000;
const SAVED_QUESTIONS_DONE_REFRESH_DELAY_MS = 1500;

// ─── Component ───────────────────────────────────────────

export function GeneratePageClient({
  academyId,
  defaultMode = "auto",
}: {
  academyId: string;
  defaultMode?: "auto" | "manual";
}) {
  const searchParams = useSearchParams();
  const taskQueue = useTaskQueue();

  // ── Deep-link context (from /import or detail page) ──
  // Accept `?passageIds=cuid1,cuid2` for pre-selection,
  // and `?mode=auto|manual` to decide which config panel opens.
  //
  // Defensive parsing: URL may be percent-encoded, contain stray whitespace,
  // or be maliciously stuffed — we decode, split on comma, filter empties,
  // 마키(영역 드래그) 시작 영역을 "생성된 문제" 섹션 전체로 넓힌다(카드만 선택). 상단의
  // 지문 그리드(PassageCardGrid)는 자체 스크롤 영역을 boundary 로 쓰므로 서로 겹치지 않는다.
  const bottomQueueBoundaryRef = useRef<HTMLElement>(null);
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
  const initialModeRef = useRef<"auto" | "manual">(
    searchParams.get("mode") === "auto"
      ? "auto"
      : searchParams.get("mode") === "manual"
        ? "manual"
        : defaultMode,
  );
  const prefillAppliedRef = useRef(false);

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
  const [reviewActionPassageIds, setReviewActionPassageIds] = useState<
    Set<string>
  >(() => new Set());
  const [reviewBulkActionRunning, setReviewBulkActionRunning] = useState(false);

  // ── Collections ──
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  // ── Intake-first left panel (지문 추가 ↔ 내 지문) ──
  // Default to the intake surface, unless the user deep-linked passageIds (then
  // show the library so they see the pre-selection land).
  const [intakeView, setIntakeView] = useState<IntakeView>(
    initialPassageIdsRef.current.length > 0 ? "library" : "intake",
  );
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");
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

  // ── Mode: auto vs manual (seeded from ?mode= URL param) ──
  const [genMode, setGenMode] = useState<"auto" | "manual" | "set">(
    initialModeRef.current,
  );
  const [generationPlan, setGenerationPlan] =
    useState<QuestionGenerationPlan>("STANDARD");

  // ── Auto mode config ──
  const [autoCount, setAutoCount] = useState(1);

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

  // ── Review modal ──
  const [reviewModalId, setReviewModalId] = useState<string | null>(null);

  // ── Checkbox multi-select (seeded from ?passageIds= URL param) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialPassageIdsRef.current),
  );

  // ── 지문 워크스페이스 (불러오기 → 편집·AI 변형 → 생성) ──
  const workspaceApi = useWorkspaceRows();
  // 불러오기 직후 왼쪽 지문 목록을 샤라락 접는 신호 (증가 카운터).
  const [leftCollapseSignal, setLeftCollapseSignal] = useState(0);
  // 우측 "유형·생성 설정" 컬럼 접힘 상태 (워크스페이스와 나란히 배치).
  // 영구 저장하지 않는다 — 접힌 채 저장되면 다음 방문에서 생성 버튼·유형
  // 설정이 통째로 숨겨진 채 시작되는 사고가 난다 (세션 내 토글만 허용).
  const [configPaneOpen, setConfigPaneOpen] = useState(true);
  const toggleConfigPane = useCallback(() => {
    setConfigPaneOpen((prev) => !prev);
  }, []);
  // 설정 컬럼 너비 — 좌측 지문 패널과 동일하게 드래그 조절·더블클릭 초기화.
  // 너비는 영구 저장해도 안전 (접힘 상태와 달리 기능이 숨겨지지 않는다).
  const [configPaneWidth, setConfigPaneWidth] = useState<number>(() => {
    if (typeof window === "undefined") return CONFIG_PANE_DEFAULT;
    try {
      const raw = window.localStorage.getItem(CONFIG_PANE_WIDTH_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(n)) return CONFIG_PANE_DEFAULT;
      return Math.min(CONFIG_PANE_MAX, Math.max(CONFIG_PANE_MIN, n));
    } catch {
      return CONFIG_PANE_DEFAULT;
    }
  });
  // 클릭=접기 / 드래그=너비 조절 — workspace-shell 좌측 핸들과 동일 제스처.
  const handleConfigHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startWidth = configPaneWidth;
      // 드래그 한계는 우측 패널 컨테이너 폭 기준 — 워크스페이스 최소폭만
      // 남기고 끝까지 넓힐 수 있다 (좌측 지문 핸들과 동일 방식).
      const containerWidth =
        e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
      const maxWidth =
        containerWidth > 0
          ? Math.max(CONFIG_PANE_MIN, containerWidth - CONFIG_PANE_RESERVED)
          : CONFIG_PANE_MAX;
      let didDrag = false;
      let latest = startWidth;
      const onMove = (ev: PointerEvent) => {
        // 설정 컬럼은 오른쪽에 있으므로 왼쪽으로 끌수록 넓어진다.
        const delta = startX - ev.clientX;
        if (!didDrag) {
          if (Math.abs(delta) < 4) return;
          didDrag = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }
        latest = Math.min(maxWidth, Math.max(CONFIG_PANE_MIN, startWidth + delta));
        setConfigPaneWidth(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (didDrag) {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          try {
            window.localStorage.setItem(CONFIG_PANE_WIDTH_KEY, String(latest));
          } catch {
            /* ignore */
          }
        } else {
          toggleConfigPane();
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [configPaneWidth, toggleConfigPane],
  );
  const resetConfigPaneWidth = useCallback(() => {
    setConfigPaneWidth(CONFIG_PANE_DEFAULT);
    try {
      window.localStorage.setItem(
        CONFIG_PANE_WIDTH_KEY,
        String(CONFIG_PANE_DEFAULT),
      );
    } catch {
      /* ignore */
    }
  }, []);
  // 워크스페이스가 비워지면 왼쪽 지문 패널을 자동으로 편다 — 비우기 직후
  // 설정 패널만 전폭을 차지한 채 다음 행동이 막히는 화면 방지.
  const [leftOpenSignal, setLeftOpenSignal] = useState(0);

  // ── Analysis detail modal ──
  const [analysisModalPassage, setAnalysisModalPassage] = useState<any>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);

  // ── 미분석 지문 전체 내용 뷰어 모달 ──
  // 분석이 없는 지문은 "상세 보기" 시 보고서 생성 CTA 대신 원문 전체를 보여준다.
  const [contentModalPassage, setContentModalPassage] =
    useState<PassageItem | null>(null);

  // 추출/입력 지문 "전체 보기" — 자료 추출 상세 모달(복원 근거 + 추출 이미지) 재사용.
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);

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

    // `passages` arrives newest-first (createdAt desc), so "newest" keeps the
    // source order and "oldest" reverses it. Name sorts use the Korean locale.
    switch (passageSortOrder) {
      case "oldest":
        result.reverse();
        break;
      case "name_asc":
        result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "name_desc":
        result.sort((a, b) => b.title.localeCompare(a.title, "ko"));
        break;
      case "newest":
      default:
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
      const response = await fetch(`/api/passages/list?academyId=${academyId}`);
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

  const handleCopySelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      const ids = [...selectedIds];
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
              ?.collectionItems?.some((item) => item.collectionId === collectionId),
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

        toast.success(`${countLabel} "${folderName}"에 복사되었습니다`, {
          duration: UNDO_TOAST_DURATION,
          action: {
            label: "실행 취소",
            onClick: () => void undoFolderCopy(),
          },
        });
        setSelectedIds(new Set());
        const nextDraft = {
          ...draft,
          reviewStatus: isReviewed ? "REVIEWED" : "COMMITTED",
          confirmedAt: isReviewed ? null : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const applyPassageReviewState = <
          T extends { id?: string; extractionReviewDraft?: PassageItem["extractionReviewDraft"] } | null,
        >(
          current: T,
        ): T =>
          current?.id === passage.id
            ? { ...current, extractionReviewDraft: nextDraft }
            : current;

        setDetailPassage((prev) => applyPassageReviewState(prev));
        setContentModalPassage((prev) => applyPassageReviewState(prev));
        setAnalysisModalPassage((prev) => applyPassageReviewState(prev));
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
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds));
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
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
        const sourceCollectionIds = [...previousMembership.keys()].filter(
          (id) => id !== collectionId,
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
          const addResult = await addPassagesToCollection(collectionId, idsToAdd);
          if (!addResult.success) {
            toast.error(addResult.error || "폴더로 이동하지 못했습니다.");
            return;
          }
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          ids.length > 1 ? `${ids.length}개 지문이` : "지문이";

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

        toast.success(`${countLabel} "${folderName}"(으)로 이동되었습니다`, {
          duration: UNDO_TOAST_DURATION,
          action: {
            label: "실행 취소",
            onClick: () => void undoFolderMove(),
          },
        });
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        await loadPassages();
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

  const handleRemoveSelectedPassagesFromCollection = useCallback(async () => {
    const ids = [...selectedIds];
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
    const ids = [...selectedIds];
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
          ? `지문 ${validIds.length}개를 편집 워크스페이스에 펼쳤어요.`
          : `지문 ${validIds.length}/${ids.length}개를 편집 워크스페이스에 펼쳤어요.`,
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
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
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
      void loadPassages().then(() => {
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
        }
        if (complete) {
          clearExtractionPendingRef.current(jobId);
        }
        if (passageIds.length === 0) {
          toast.message(
            partial
              ? "일부 페이지만 추출됐어요. 작업 큐에서 확인하세요."
              : "추출은 끝났지만 등록할 지문이 없습니다.",
          );
          return;
        }
        if (!complete) {
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
          return;
        }
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
  }, []);

  const handleInlinePassageAnalyzed = useCallback(
    async (passageId: string) => {
      await loadPassages();
      setFreshAnalysisPassageIds((prev) => {
        const next = new Set(prev);
        next.add(passageId);
        return next;
      });
    },
    [loadPassages],
  );

  const handleToggleExtractionReview = useCallback(
    async (passage: PassageItem) => {
      const draft = passage.extractionReviewDraft;
      if (!draft) return;

      const isReviewed = draft.reviewStatus === "COMMITTED";
      if (isReviewed) {
        const ok = window.confirm(
          "검수를 취소하면 이 지문이 문제생성 목록에서 제거됩니다. 계속할까요?",
        );
        if (!ok) return;
      }

      setReviewActionPassageIds((prev) => {
        const next = new Set(prev);
        next.add(passage.id);
        return next;
      });

      try {
        if (isReviewed) {
          const res = await fetch(
            `/api/extraction/m1-passages/${draft.id}/unpromote`,
            {
              method: "POST",
              credentials: "include",
            },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error ?? "검수를 취소하지 못했습니다.");
          }
          setSelectedIds((prev) => {
            if (!prev.has(passage.id)) return prev;
            const next = new Set(prev);
            next.delete(passage.id);
            return next;
          });
          toast.success("검수완료를 취소했습니다.");
        } else {
          const res = await fetch("/api/extraction/m1-passages/promote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ draftIds: [draft.id] }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error ?? "검수완료로 표시하지 못했습니다.");
          }
          const promoted = data?.summary?.promoted ?? 0;
          const skipped = data?.summary?.skipped ?? 0;
          if (promoted + skipped <= 0) {
            throw new Error("검수 처리에 실패했습니다.");
          }
          toast.success("검수완료로 표시했습니다.");
        }

        await loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "검수 상태를 변경하지 못했습니다.",
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
    [loadPassages],
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
        const res = await fetch("/api/extraction/m1-passages/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ draftIds }),
        });
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

        await loadPassages();
        if (failed > 0) {
          toast.warning(
            `${promoted}개 검수완료, ${skipped + failed}개 건너뜀/실패`,
          );
        } else {
          toast.success(`${promoted + skipped}개 지문을 검수완료로 표시했습니다.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "검수완료 처리에 실패했습니다.",
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
    [loadPassages, reviewBulkActionRunning],
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
  const handleOpenAnalysisModal = useCallback(async (passageId: string) => {
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
            (result as { extractionReviewDraft?: PassageItem["extractionReviewDraft"] })
              .extractionReviewDraft ??
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
  }, [passages]);

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
  const handleLoadSelectedToWorkspace = useCallback(() => {
    const selected = passages.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast.error("왼쪽 '내 지문'에서 편집할 지문을 먼저 선택하세요.");
      return;
    }
    const { added, skipped } = workspaceApi.loadPassages(selected);
    if (added > 0) {
      toast.success(
        `지문 ${added}개를 편집 워크스페이스에 펼쳤어요.` +
          (skipped > 0 ? ` (${skipped}개는 이미 있어요)` : ""),
      );
      setSelectedIds(new Set());
      // 지문 목록을 옆으로 접어 작업 공간 확보 — 핸들로 언제든 다시 연다.
      setLeftCollapseSignal((s) => s + 1);
    } else if (skipped > 0) {
      toast.info("선택한 지문은 이미 워크스페이스에 있습니다.");
    }
  }, [passages, selectedIds, workspaceApi]);

  // ── Generation handlers (extracted to hook) ──
  const { handleBatchGenerate, handleGenerate, handleSaveQuestions } =
    useGenerationHandlers({
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
      autoCount,
      selectedPassage,
      analysisData,
      totalQuestions,
      setSessionQueue,
      reviewItem,
      setReviewModalId,
      loadSavedQuestions,
    });

  // ── 워크스페이스 생성 (변형본 저장 → 행별 설정으로 생성) ──
  const { generating: workspaceGenerating, handleWorkspaceGenerate, workspaceSummary } =
    useWorkspaceGeneration({
      api: workspaceApi,
      passages,
      genMode,
      generationPlan,
      typeCounts,
      questionTypeSettings,
      difficulty,
      customPrompt,
      autoCount,
      setSessionQueue,
      loadPassages,
    });
  const workspaceActive = workspaceApi.rows.length > 0;
  // 워크스페이스 활성 → 비활성 전환(비우기/마지막 행 제거) 감지 시 좌측 열기.
  const prevWorkspaceActiveRef = useRef(false);
  useEffect(() => {
    if (prevWorkspaceActiveRef.current && !workspaceActive) {
      setLeftOpenSignal((s) => s + 1);
    }
    prevWorkspaceActiveRef.current = workspaceActive;
  }, [workspaceActive]);
  // 체크된 지문 중 아직 워크스페이스에 없는 수 — loadPassages 의 dedupe 와
  // 동일한 집합(passageId + variantOfId)으로 판정해 안내문 거짓 양성 방지.
  const workspaceUnloadedSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const loaded = new Set(
      workspaceApi.rows
        .flatMap((r) => [r.passageId, r.variantOfId])
        .filter(Boolean),
    );
    return [...selectedIds].filter((id) => !loaded.has(id)).length;
  }, [selectedIds, workspaceApi.rows]);

  // ── Can generate? ──
  const canGenerate =
    selectedIds.size > 0 &&
    (genMode === "auto" ? autoCount > 0 : totalQuestions > 0);

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="flex w-full min-w-0 flex-col gap-4">
        {/* ═══ TOP SECTION: 학습지 관리(좌) + 문제생성 작업대(우) ═══ */}
        <WorkspaceShell
          leftLabel="지문"
          leftCollapseSignal={leftCollapseSignal}
          leftOpenSignal={leftOpenSignal}
          rightPaneMin={workspaceActive ? 560 : 400}
          header={
            <WorkflowPageTitle
              icon={QuestionGenerationIcon}
              title="문제 생성"
              description="지문을 선택해 편집·AI 변형한 뒤, 유형과 난이도를 설정해 문제를 생성합니다."
            />
          }
          left={
            /* ═══ LEFT PANEL: 지문 추가(intake) ↔ 내 지문(library) ═══ */
            <IntakeSurface
              intakeView={intakeView}
              setIntakeView={setIntakeView}
              intakeTab={intakeTab}
              setIntakeTab={setIntakeTab}
              libraryCount={passages.length}
              onSubmitPastedRows={handleCreatePastedPassages}
              pasteSaving={pasteSaving}
              upload={
                <GenerateUploadPanel
                  onBegin={handleExtractionBegin}
                  onResult={handleExtractionResult}
                  inFlightCount={extractionPending.length}
                />
              }
              library={
                <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
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
              onRemoveSelectedFromCollection={
                handleRemoveSelectedPassagesFromCollection
              }
              onDeleteSelectedPassages={handleDeleteSelectedPassages}
              passageBulkAction={passageBulkAction}
              genMode={genMode}
              totalQuestions={totalQuestions}
              handleBatchGenerate={handleBatchGenerate}
              questionCountByPassage={questionCountByPassage}
              freshAnalysisPassageIds={freshAnalysisPassageIds}
              onFreshAnalysisAcknowledged={acknowledgeFreshAnalysisPassage}
              reviewBulkActionRunning={reviewBulkActionRunning}
              onBulkCompleteExtractionReview={handleBulkCompleteExtractionReview}
              handleOpenAnalysisModal={handleOpenAnalysisModal}
              onViewPassageContent={setDetailPassage}
                />
                </div>
                {/* 선택 지문 → 편집 워크스페이스로 (학습지 생성과 동일한 동선) */}
                {selectedIds.size > 0 ? (
                  <div className="shrink-0 border-t border-slate-100 bg-white px-2.5 py-2">
                    <button
                      type="button"
                      onClick={handleLoadSelectedToWorkspace}
                      title={`선택한 ${selectedIds.size}개 지문을 편집 워크스페이스에 펼칩니다. 편집·AI 변형 후 문제를 생성하세요.`}
                      className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      <PencilLine className="size-4" aria-hidden="true" />
                      <span>선택 지문 편집하기</span>
                      <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                        {selectedIds.size}개 선택
                      </span>
                    </button>
                  </div>
                ) : null}
                </div>
              }
            />
          }
          right={
            /* ═══ RIGHT PANEL: 지문 워크스페이스 + 유형·생성 설정 ═══
                워크스페이스 컬럼은 지문을 불러왔을 때만 존재한다 — 빈 상태로
                중앙을 차지하는 대신, 불러오기 전엔 설정이 우측 전체를 쓰고
                라이브러리가 넓어진다. */
            <div className="flex h-full min-h-0 min-w-0">
              {workspaceActive ? (
              <div className="flex min-h-0 min-w-[120px] flex-1 flex-col">
                <div className="min-h-0 flex-1">
                  <PassageWorkspace
                    api={workspaceApi}
                    selectedCount={selectedIds.size}
                    onLoadSelected={handleLoadSelectedToWorkspace}
                    generating={workspaceGenerating}
                    sessionQueue={sessionQueue}
                    questionCountByPassage={questionCountByPassage}
                    setModeActive={genMode === "set"}
                  />
                </div>
                {/* 설정 컬럼이 접혀 있어도 생성 버튼은 항상 보이게 — 워크스페이스
                    하단에 미러링한다 (설정을 접었다가 생성을 못 누르는 사고 방지).
                    장문 세트 모드는 설정 패널과 동일하게 워크스페이스 생성 제외. */}
                {!configPaneOpen && workspaceActive && genMode !== "set" ? (
                  <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
                    <button
                      type="button"
                      onClick={toggleConfigPane}
                      className="flex h-10 shrink-0 items-center rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600"
                    >
                      유형·난이도 설정 열기
                    </button>
                    <button
                      type="button"
                      onClick={handleWorkspaceGenerate}
                      disabled={
                        workspaceSummary.totalQuestions === 0 ||
                        workspaceGenerating
                      }
                      className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {workspaceGenerating
                        ? "생성 중…"
                        : workspaceSummary.totalQuestions > 0
                          ? `${workspaceSummary.rowCount}개 지문 · ${workspaceSummary.totalQuestions}문제 생성`
                          : "유형을 선택하세요 (설정 열기)"}
                      {!workspaceGenerating &&
                      workspaceSummary.totalQuestions > 0 &&
                      workspaceSummary.creditCost > 0 ? (
                        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                          {workspaceSummary.creditCost}크레딧
                        </span>
                      ) : null}
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}
              {workspaceActive && !configPaneOpen ? (
                <button
                  type="button"
                  onClick={toggleConfigPane}
                  title="유형·생성 설정 열기"
                  className="flex min-h-0 w-6 shrink-0 select-none flex-col items-center justify-center gap-1.5 border-l border-slate-200 bg-slate-50/60 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span style={{ writingMode: "vertical-rl" }}>유형·생성 설정</span>
                </button>
              ) : (
                <>
                  {/* 설정 컬럼 리사이즈 핸들 — 워크스페이스가 있을 때만 의미가
                      있다 (빈 상태에선 설정이 우측 전체라 나눌 공간이 없음) */}
                  {workspaceActive ? (
                  <button
                    type="button"
                    onPointerDown={handleConfigHandlePointerDown}
                    onDoubleClick={resetConfigPaneWidth}
                    title="클릭하여 닫기 · 좌우로 드래그하여 너비 조절 · 더블 클릭하여 초기화"
                    className="group/chandle flex min-h-0 w-5 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1.5 border-l border-slate-200 bg-slate-50/40 py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    <span style={{ writingMode: "vertical-rl" }}>설정 닫기</span>
                    <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/chandle:opacity-70" />
                  </button>
                  ) : null}
                  {/* 설정 컬럼 — 워크스페이스 있음: 드래그로 300~560px /
                      빈 상태: 우측 패널 전체 */}
                  <div
                    className={
                      "flex h-full min-w-0 flex-col overflow-hidden " +
                      (workspaceActive ? "shrink-0" : "flex-1")
                    }
                    style={
                      workspaceActive
                        ? {
                            width: `min(${configPaneWidth}px, calc(100% - ${CONFIG_PANE_RESERVED}px))`,
                          }
                        : undefined
                    }
                  >
                    {/* 3컬럼 공통 44px 헤더 — 좌측 탭/워크스페이스 헤더와 끝선 정렬 */}
                    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 bg-white pl-3 pr-1.5">
                      <Settings2
                        className="h-3.5 w-3.5 text-slate-400"
                        aria-hidden="true"
                      />
                      <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-slate-800">
                        유형·생성 설정
                      </h3>
                      {workspaceActive ? (
                      <button
                        type="button"
                        onClick={toggleConfigPane}
                        title="설정 접기"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      >
                        <PanelRightClose className="h-4 w-4" aria-hidden="true" />
                      </button>
                      ) : null}
                    </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <GenerationConfigPanel
              genMode={genMode}
              setGenMode={setGenMode}
              generationPlan={generationPlan}
              setGenerationPlan={setGenerationPlan}
              autoCount={autoCount}
              setAutoCount={setAutoCount}
              typeCounts={typeCounts}
              setTypeCount={setTypeCount}
              setTypeCounts={setTypeCounts}
              questionTypeSettings={questionTypeSettings}
              setQuestionTypeSettings={setQuestionTypeSettings}
              totalQuestions={totalQuestions}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
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
              workspaceUnloadedSelectedCount={workspaceUnloadedSelectedCount}
              workspaceRowCount={workspaceSummary.rowCount}
              workspaceTotalQuestions={workspaceSummary.totalQuestions}
              workspaceCreditCost={workspaceSummary.creditCost}
              workspaceVariantCount={workspaceSummary.variantCount}
              workspaceGenerating={workspaceGenerating}
              onWorkspaceGenerate={handleWorkspaceGenerate}
            />
            </div>
                  </div>
                </>
              )}
            </div>
          }
        />

        {/* ═══ BOTTOM SECTION: 생성된 문제 (최신순) ═══ */}
        <section
          ref={bottomQueueBoundaryRef}
          className="relative rounded-lg border border-slate-200 bg-white shadow-sm"
        >
          <BottomQueueSection
            marqueeBoundaryRef={bottomQueueBoundaryRef}
            sessionQueue={sessionQueue}
            filteredQueue={filteredQueue}
            queueFilter={queueFilter}
            setQueueFilter={setQueueFilter}
            queueCounts={queueCounts}
            autoCount={autoCount}
            savedQuestions={savedQuestions}
            loadingSavedQuestions={loadingSavedQuestions}
            setDetailQuestion={setDetailQuestion}
            onApproveQuestion={handleApproveQuestion}
            onUnapproveQuestion={handleUnapproveQuestion}
            onBatchApproveQuestions={handleBatchApproveQuestions}
            onBatchDeleteQuestions={handleBatchDeleteQuestions}
            deletedQuestionIds={deletedQuestionIds}
            deletedQuestionSignatures={deletedQuestionSignatures}
            batchDeleting={deletingQuestions}
            onDeleteQuestion={handleDeleteQuestion}
            onEditQuestion={editor.openEditor}
          />
        </section>
      </main>
      {/* end vertical stack */}

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
              if (reviewItem.config.mode === "manual") {
                setGenMode("manual");
                setTypeCounts(reviewItem.config.typeCounts);
                setQuestionTypeSettings(
                  reviewItem.config.questionTypeSettings ||
                    getDefaultQuestionTypeGenerationSettings(),
                );
              } else {
                setGenMode("auto");
              }
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
          <div className="relative z-10 w-full max-w-[1200px] mx-4 my-4 bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
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
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-600 shadow-none transition-colors hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    검수취소
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50/60 px-2.5 text-[11px] font-semibold text-green-700 shadow-none transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    검수완료
                  </button>
                )}
                <button
                  onClick={() => setDetailQuestion(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
            {/* Content: 2 columns */}
            <div className="flex-1 overflow-hidden grid grid-cols-2">
              {/* Left: Passage */}
              <div className="border-r border-slate-200 overflow-y-auto">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <InteractivePassageView
                      content={detailQuestion.passage.content}
                      analysisData={(() => {
                        const p = passages.find(
                          (pp) => pp.id === detailQuestion.passage?.id,
                        );
                        if (!p?.analysis?.analysisData) return null;
                        try {
                          return typeof p.analysis.analysisData === "string"
                            ? JSON.parse(p.analysis.analysisData)
                            : p.analysis.analysisData;
                        } catch {
                          return null;
                        }
                      })()}
                      layout="vertical"
                    />
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
          !!contentModalPassage && reviewActionPassageIds.has(contentModalPassage.id)
        }
        onToggleExtractionReview={handleToggleExtractionReview}
      />

      {/* ─── 추출/입력 지문 "전체 보기" — 복원 근거 + 추출 이미지 상세 모달 ─── */}
      {detailPassage && (
        <ExtractionDetailModal
          passage={detailPassage}
          onClose={() => setDetailPassage(null)}
          onPassageAnalyzed={handleInlinePassageAnalyzed}
          reviewBusy={reviewActionPassageIds.has(detailPassage.id)}
          onToggleExtractionReview={handleToggleExtractionReview}
        />
      )}

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
