"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Target,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PassageContentModal } from "@/components/workbench/passage-content-modal";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";
import { useTaskQueue } from "@/components/workbench/task-queue/context";
import {
  approveWorkbenchQuestion,
  bulkApproveWorkbenchQuestions,
  bulkDeleteWorkbenchQuestions,
  deleteWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";

// ── 경계: 문제 생성(기본 UI)의 재사용 가능 컴포넌트를 import 만 한다(무수정). 좌측 지문 추가/선택
//    UX, 하단 생성/검수 결과를 "정확하게 똑같이" 맞추기 위해 IntakeSurface·PassageCardGrid·
//    WorkspaceShell·BottomQueueSection·추출 파이프라인·타입을 그대로 차용. 커스텀 문항도 실제
//    Question 이라 검수/삭제/편집은 공유 워크벤치 액션이 그대로 통한다. ──
import { PassageCardGrid } from "../../generate/passage-card-grid";
import { WorkspaceShell } from "../../generate/workspace-shell";
import { BottomQueueSection } from "../../generate/bottom-queue-section";
import {
  IntakeSurface,
  type IntakeTab,
  type IntakeView,
} from "../../generate/intake/intake-surface";
import { GenerateUploadPanel } from "../../generate/intake/generate-upload-panel";
import {
  useGenerateExtraction,
  type ExtractionPromotedResult,
} from "../../generate/intake/use-generate-extraction";
import { ExtractionLoadingCards } from "../../generate/intake/extraction-loading-cards";
import { ExtractionDetailModal } from "../../generate/intake/extraction-detail-modal";
import type { PastedPassageInput } from "../../generate/intake/multi-passage-paste";
import {
  questionSignature,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  type PassageCollectionItem,
  type PassageItem,
  type PassageSortOrder,
  type QueueItem,
} from "../../generate/generate-page-types";

import {
  builtinLabel,
  type CustomGenJob,
  type CustomTypeListItem,
  type CustomTypeOverride,
  formatTime,
} from "./custom-type-utils";
import { CustomTypeReviseModal } from "./custom-type-revise-modal";

const POLL_INTERVAL_MS = 3000;

// 커스텀은 클라 세션 큐가 없다(DB 잡 폴링). BottomQueueSection 의 세션 큐 슬롯은 비워 두고
// 저장된 결과만 담당시킨다 — 진행 상황은 위쪽 작업 큐가 보여준다.
const EMPTY_QUEUE: QueueItem[] = [];
const ZERO_QUEUE_COUNTS = { generating: 0, done: 0, error: 0 };

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

// 난이도 톤 — 기본 문제 생성과 동일 팔레트(기본 파랑 / 중급 노랑 / 킬러 빨강).
const DIFFICULTY_TONES = [
  {
    value: "BASIC",
    label: "기본",
    selected: "bg-blue-50 text-blue-700 border-blue-300 shadow-sm shadow-blue-50",
    idle: "bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600",
  },
  {
    value: "INTERMEDIATE",
    label: "중급",
    selected: "bg-amber-50 text-amber-700 border-amber-300 shadow-sm shadow-amber-50",
    idle: "bg-white text-slate-400 border-slate-200 hover:border-amber-200 hover:text-amber-600",
  },
  {
    value: "KILLER",
    label: "킬러",
    selected: "bg-red-50 text-red-700 border-red-300 shadow-sm shadow-red-50",
    idle: "bg-white text-slate-400 border-slate-200 hover:border-red-200 hover:text-red-600",
  },
] as const;

function isActive(status: CustomGenJob["status"]): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

// generations API 응답(원시) → 공유 QuestionCardItem. createdAt 만 Date 로 복원한다.
interface RawGenQuestion {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  createdAt: string;
  passage: QuestionCardItem["passage"];
  explanation: QuestionCardItem["explanation"];
  structuredData: unknown;
}

function toCardItem(raw: RawGenQuestion): QuestionCardItem {
  return { ...raw, createdAt: new Date(raw.createdAt) };
}

const isMissingQuestionError = (error?: string) =>
  typeof error === "string" && error.includes("찾을 수 없");

// 붙여넣기 지문 제목 — 첫 비어있지 않은 줄에서 추출(기본 문제 생성과 동일).
function derivePastedTitle(content: string): string {
  const firstLine = (content.split(/\r?\n/).find((l) => l.trim().length > 0) || content).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

export function CustomTypeGeneratePanel({
  academyId,
  typesRefreshKey,
}: {
  academyId: string;
  typesRefreshKey: number;
}) {
  const taskQueue = useTaskQueue();

  // ── 커스텀 유형 + 생성 설정(기본 유형지정 모드와 동일: 유형별 개수 + 난이도 + 유형별 임시 override) ──
  const [types, setTypes] = useState<CustomTypeListItem[]>([]);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [typeOverrides, setTypeOverrides] = useState<Record<string, CustomTypeOverride>>({});
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("INTERMEDIATE");
  const [submitting, setSubmitting] = useState(false);
  const [editingType, setEditingType] = useState<{ id: string; name: string } | null>(null);

  const totalQuestions = useMemo(
    () => Object.values(typeCounts).reduce((a, b) => a + b, 0),
    [typeCounts],
  );

  const setTypeCount = useCallback((id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = Math.min(10, count);
      return next;
    });
  }, []);

  const setTypeOverride = useCallback((id: string, ov: CustomTypeOverride) => {
    setTypeOverrides((prev) => ({ ...prev, [id]: ov }));
  }, []);

  const resetTypeOverride = useCallback((id: string) => {
    setTypeOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── 작업(잡) ──
  const [jobs, setJobs] = useState<CustomGenJob[]>([]);
  const jobLoadSeq = useRef(0);

  // ── 생성/검수 결과 (공유 BottomQueueSection 과 동일 데이터 모델) ──
  const [savedQuestions, setSavedQuestions] = useState<QuestionCardItem[]>([]);
  const [loadingSavedQuestions, setLoadingSavedQuestions] = useState(true);
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<Set<string>>(() => new Set());
  const [deletedQuestionSignatures, setDeletedQuestionSignatures] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingQuestions, setDeletingQuestions] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<QuestionCardItem | null>(null);
  const qLoadSeq = useRef(0);
  const bottomQueueBoundaryRef = useRef<HTMLElement>(null);

  // ── 지문 (문제 생성과 동일한 데이터/상태) ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(true);

  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] =
    useState<PassageAnalysisStatusFilter>("all");
  const [passageSortOrder, setPassageSortOrder] = useState<PassageSortOrder>("newest");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [contentModalPassage, setContentModalPassage] = useState<PassageItem | null>(null);

  // ── 좌측 인테이크(지문 추가 ↔ 내 지문) ──
  const [intakeView, setIntakeView] = useState<IntakeView>("intake");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");
  const [pasteSaving, setPasteSaving] = useState(false);
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});

  // ── 유형 목록 ──
  const loadTypes = useCallback(async () => {
    const res = await fetch("/api/custom-question-types", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { types: CustomTypeListItem[] };
    setTypes(json.types ?? []);
  }, []);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes, typesRefreshKey]);

  // ── 지문 목록 (문제 생성과 동일한 /api/passages/list) ──
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      const res = await fetch(`/api/passages/list?academyId=${academyId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
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

  // ── 필터/정렬 (문제 생성과 동일 로직) ──
  const filteredPassages = useMemo(() => {
    const result = passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !p.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && p.analysis) return false;
      if (
        selectedCollectionId &&
        !p.collectionItems?.some((ci) => ci.collectionId === selectedCollectionId)
      ) {
        return false;
      }
      return true;
    });

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

  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length +
    (analysisStatusFilter === "all" ? 0 : 1);

  const toggleCheckbox = useCallback((id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 상세 보기 — 지문 전체 내용 뷰어(분석/미분석 모두 동일 뷰어). 목록이 이미 content 를 갖고 있어 추가 조회 불필요.
  const handleOpenAnalysisModal = useCallback(
    (passageId: string) => {
      const p = passages.find((pp) => pp.id === passageId);
      if (p) setContentModalPassage(p);
    },
    [passages],
  );

  // ── 직접 입력(붙여넣기) → 등록 후 선택(기본 문제 생성과 동일) ──
  const handleCreatePastedPassages = useCallback(
    async (rows: PastedPassageInput[]) => {
      const cleaned = rows
        .map((r) => ({ title: r.title.trim(), content: r.content.trim() }))
        .filter((r) => r.content.length >= 20);
      if (cleaned.length === 0) {
        toast.error("지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.");
        return;
      }
      setPasteSaving(true);
      try {
        const { createDirectInputPassageMaterial } = await import("@/actions/workbench");
        const createdIds: string[] = [];
        // 순차(병렬 아님): 액션이 passageOrder=last+1 을 할당해 동시 호출은 유니크 충돌 위험.
        for (const r of cleaned) {
          const title = r.title || derivePastedTitle(r.content);
          const result = (await createDirectInputPassageMaterial({
            title,
            content: r.content,
          })) as { success: boolean; id?: string };
          if (result?.success && result.id) createdIds.push(result.id);
        }
        if (createdIds.length === 0) {
          toast.error("지문 등록에 실패했습니다.");
          return;
        }
        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setSelectedIds(new Set(createdIds));
        setIntakeView("library");
        toast.success(
          createdIds.length === cleaned.length
            ? `${createdIds.length}개 지문이 등록되었습니다. 유형을 골라 동형 문항을 생성하세요.`
            : `${createdIds.length}/${cleaned.length}개 지문이 등록되었습니다. 일부는 실패했습니다.`,
        );
      } catch {
        toast.error("지문 등록 중 오류가 발생했습니다.");
      } finally {
        setPasteSaving(false);
      }
    },
    [loadPassages],
  );

  // ── 이미지/PDF 추출 완료 → 등록된 지문 선택 유도(기본 문제 생성과 동일) ──
  const handleExtractionPromoted = useCallback(
    ({
      passageIds,
      jobId,
      partial,
      expectedCount,
      resolvedCount,
      complete,
    }: ExtractionPromotedResult) => {
      void loadPassages().then(() => {
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setIntakeView("library");
        if (complete) clearExtractionPendingRef.current(jobId);
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
          `추출된 ${passageIds.length}개 지문이 ‘내 지문’에 추가됐어요. 동형을 입힐 지문을 선택하세요.`,
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

  // 추출 시작 즉시 '내 지문'으로 넘어가 로딩 카드를 띄우고, 작업 목록 드로어를 추출 탭으로 맞춘다.
  const handleExtractionBegin = useCallback(
    (id: string, count: number) => {
      beginExtractionJob(id, count);
      setIntakeView("library");
      taskQueue.setScope("extraction");
    },
    [beginExtractionJob, taskQueue],
  );

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

  // ── 잡 + 생성 결과 (멀티 유형이라 학원 전체 커스텀 생성분을 본다 — 기본 결과 패널과 동일) ──
  const loadJobs = useCallback(async () => {
    const seq = ++jobLoadSeq.current;
    const res = await fetch(`/api/custom-question-types/generation-jobs?limit=20`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { jobs: CustomGenJob[] };
    if (seq !== jobLoadSeq.current) return;
    setJobs(data.jobs ?? []);
  }, []);

  const loadSavedQuestions = useCallback(async () => {
    const seq = ++qLoadSeq.current;
    const res = await fetch(`/api/custom-question-types/generations?limit=100`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      if (seq === qLoadSeq.current) setLoadingSavedQuestions(false);
      return;
    }
    const data = (await res.json()) as { questions: RawGenQuestion[] };
    if (seq !== qLoadSeq.current) return;
    setSavedQuestions((data.questions ?? []).map(toCardItem));
    setLoadingSavedQuestions(false);
  }, []);

  useEffect(() => {
    void loadJobs();
    void loadSavedQuestions();
  }, [loadJobs, loadSavedQuestions]);

  const hasActiveJobs = useMemo(() => jobs.some((j) => isActive(j.status)), [jobs]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => {
      void loadJobs();
      void loadSavedQuestions();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJobs, loadJobs, loadSavedQuestions]);

  const reloadSaved = useCallback(() => {
    void loadSavedQuestions();
  }, [loadSavedQuestions]);

  // ── 검수/삭제(공유 워크벤치 액션 재사용) + 로컬 상태 동기화 ──
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

  const applyReviewState = useCallback((questionIds: string[], approved: boolean) => {
    if (questionIds.length === 0) return;
    const set = new Set(questionIds);
    setSavedQuestions((prev) => prev.map((q) => (set.has(q.id) ? { ...q, approved } : q)));
    setDetailQuestion((prev) => (prev && set.has(prev.id) ? { ...prev, approved } : prev));
  }, []);

  const handleApproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await approveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          reloadSaved();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수완료 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], true);
      toast.success("검수완료 처리됐습니다.");
      reloadSaved();
    },
    [applyReviewState, markQuestionDeletedLocally, reloadSaved],
  );

  const handleUnapproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await unapproveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          reloadSaved();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수취소 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], false);
      toast.success("검수취소 처리됐습니다.");
      reloadSaved();
    },
    [applyReviewState, markQuestionDeletedLocally, reloadSaved],
  );

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!questionId) return;
      const result = await deleteWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      markQuestionDeletedLocally(questionId);
      toast.success("삭제됐습니다.");
      reloadSaved();
    },
    [markQuestionDeletedLocally, reloadSaved],
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
        reloadSaved();
      } else if (!result.success) {
        toast.error(result.error || "일괄 검수완료 처리에 실패했습니다.");
      }
    },
    [applyReviewState, reloadSaved],
  );

  const handleBatchDeleteQuestions = useCallback(
    async (questionIds: string[]): Promise<boolean> => {
      const ids = [...new Set(questionIds)].filter(Boolean);
      if (ids.length === 0 || deletingQuestions) return false;

      setDeletingQuestions(true);
      try {
        const result = await bulkDeleteWorkbenchQuestions(ids);
        if (!result.success) {
          toast.error(result.error || "문제 삭제에 실패했습니다.");
          return false;
        }
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
        setDetailQuestion((prev) => (prev && deletedSet.has(prev.id) ? null : prev));

        if (result.deleted === 0) {
          toast.error("삭제된 문제가 없습니다.");
        } else if (result.deleted === result.requested) {
          toast.success(`${result.deleted}개 문제를 삭제했습니다.`);
        } else {
          toast.warning(`${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`);
        }
        reloadSaved();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "문제 삭제에 실패했습니다.");
        return false;
      } finally {
        setDeletingQuestions(false);
      }
    },
    [deletingQuestions, reloadSaved, savedQuestions, savedQuestionSig],
  );

  // 활성 유형(개수>0)마다 별도 잡을 등록 — 각 잡에 난이도 + 그 유형의 임시 override 동봉.
  const run = useCallback(async () => {
    const passageIds = Array.from(selectedIds);
    if (passageIds.length === 0) {
      toast.error("동형을 입힐 지문을 1개 이상 선택하세요.");
      return;
    }
    const active = Object.entries(typeCounts).filter(([, c]) => c > 0);
    if (active.length === 0) {
      toast.error("커스텀 유형과 개수를 1개 이상 선택하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const results = await Promise.all(
        active.map(([typeId, count]) =>
          fetch("/api/custom-question-types/generation-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              customTypeId: typeId,
              passageIds,
              countPerPassage: count,
              difficulty,
              ...(typeOverrides[typeId] ? { overrides: typeOverrides[typeId] } : {}),
            }),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      );
      const ok = results.filter(Boolean).length;
      if (ok === 0) throw new Error("생성 요청에 실패했습니다.");
      toast.success(
        `생성 작업 ${ok}건을 큐에 등록했어요. (지문 ${passageIds.length}개 × ${totalQuestions}문제)`,
      );
      await loadJobs();
      await loadSavedQuestions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "생성 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedIds, typeCounts, typeOverrides, difficulty, totalQuestions, loadJobs, loadSavedQuestions]);

  // 상세 모달 좌측 지문 분석(있으면) — 목록이 들고 있는 analysis 를 파싱.
  const detailAnalysisData = useMemo(() => {
    if (!detailQuestion?.passage) return null;
    const p = passages.find((pp) => pp.id === detailQuestion.passage?.id);
    if (!p?.analysis?.analysisData) return null;
    try {
      return typeof p.analysis.analysisData === "string"
        ? JSON.parse(p.analysis.analysisData)
        : p.analysis.analysisData;
    } catch {
      return null;
    }
  }, [detailQuestion, passages]);

  return (
    <div className="space-y-4 p-4">
      <WorkspaceShell
        leftLabel="지문"
        header={
          <WorkflowPageTitle
            icon={QuestionGenerationIcon}
            title="유형으로 생성"
            description="커스텀 유형을 고르고, 지문을 선택해 같은 출제 의도의 동형 문항을 생성합니다."
          />
        }
        left={
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
              <PassageCardGrid
                loadingCards={<ExtractionLoadingCards pending={extractionPending} />}
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
                genMode="manual"
                totalQuestions={totalQuestions}
                handleBatchGenerate={() => void run()}
                handleOpenAnalysisModal={handleOpenAnalysisModal}
                onViewPassageContent={setDetailPassage}
              />
            }
          />
        }
        right={
          <GenerationConfigPanel
            types={types}
            typeCounts={typeCounts}
            setTypeCount={setTypeCount}
            typeOverrides={typeOverrides}
            setTypeOverride={setTypeOverride}
            resetTypeOverride={resetTypeOverride}
            expandedTypeId={expandedTypeId}
            setExpandedTypeId={setExpandedTypeId}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            selectedCount={selectedIds.size}
            totalQuestions={totalQuestions}
            onResetCounts={() => setTypeCounts({})}
            submitting={submitting}
            onRun={run}
            onEdit={(id, name) => setEditingType({ id, name })}
          />
        }
      />

      {/* 작업 큐 — 진행 중/완료 잡(커스텀은 DB 잡 폴링이라 별도 표시). */}
      {jobs.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">작업 큐</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      ) : null}

      {/* 생성/검수 결과 — 기본 문제 생성과 동일한 공유 BottomQueueSection. */}
      <section
        ref={bottomQueueBoundaryRef}
        className="relative rounded-lg border border-slate-200 bg-white shadow-sm"
      >
        <BottomQueueSection
          marqueeBoundaryRef={bottomQueueBoundaryRef}
          sessionQueue={EMPTY_QUEUE}
          filteredQueue={EMPTY_QUEUE}
          queueFilter="all"
          setQueueFilter={() => {}}
          queueCounts={ZERO_QUEUE_COUNTS}
          autoCount={0}
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

      <PassageContentModal
        open={!!contentModalPassage}
        onClose={() => setContentModalPassage(null)}
        passage={contentModalPassage}
      />

      {/* 추출/입력 지문 "전체 보기" — 복원 근거 + 추출 이미지 상세 모달. */}
      {detailPassage && (
        <ExtractionDetailModal passage={detailPassage} onClose={() => setDetailPassage(null)} />
      )}

      {/* 문제 상세 모달 — 기본 문제 생성과 동일 구성(좌 지문 / 우 문제 + 검수 도장). */}
      {detailQuestion && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDetailQuestion(null)}
          />
          <div className="relative z-10 mx-4 my-4 flex w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
              <h2 className="text-[15px] font-bold text-slate-800">문제 상세</h2>
              <div className="flex shrink-0 items-center gap-2">
                {detailQuestion.approved ? (
                  <button
                    type="button"
                    onClick={() => handleUnapproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    검수취소
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50/60 px-2.5 text-[11px] font-semibold text-green-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    검수완료
                  </button>
                )}
                <button
                  onClick={() => setDetailQuestion(null)}
                  className="flex size-8 items-center justify-center rounded-lg hover:bg-slate-100"
                  aria-label="닫기"
                >
                  <X className="size-4 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 overflow-hidden">
              <div className="overflow-y-auto border-r border-slate-200">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <InteractivePassageView
                      content={detailQuestion.passage.content}
                      analysisData={detailAnalysisData}
                      layout="vertical"
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    지문 없음
                  </div>
                )}
              </div>
              <div className="relative overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-5">
                  <QuestionCard q={detailQuestion} num={1} readonly hideReviewStatusStamp />
                </div>
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
        onSaved={reloadSaved}
        onApproved={reloadSaved}
      />

      {editingType ? (
        <CustomTypeReviseModal
          typeId={editingType.id}
          typeName={editingType.name}
          onClose={() => setEditingType(null)}
          onRevised={() => void loadTypes()}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────── 우측 생성 설정 패널 (기본 유형지정 모드와 동일 구성) ───────────────────────────
function GenerationConfigPanel({
  types,
  typeCounts,
  setTypeCount,
  typeOverrides,
  setTypeOverride,
  resetTypeOverride,
  expandedTypeId,
  setExpandedTypeId,
  difficulty,
  setDifficulty,
  selectedCount,
  totalQuestions,
  onResetCounts,
  submitting,
  onRun,
  onEdit,
}: {
  types: CustomTypeListItem[];
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  typeOverrides: Record<string, CustomTypeOverride>;
  setTypeOverride: (id: string, ov: CustomTypeOverride) => void;
  resetTypeOverride: (id: string) => void;
  expandedTypeId: string | null;
  setExpandedTypeId: (id: string | null) => void;
  difficulty: Difficulty;
  setDifficulty: (v: Difficulty) => void;
  selectedCount: number;
  totalQuestions: number;
  onResetCounts: () => void;
  submitting: boolean;
  onRun: () => void;
  onEdit: (id: string, name: string) => void;
}) {
  const canRun = selectedCount > 0 && totalQuestions > 0;
  const activeTypeCount = Object.values(typeCounts).filter((c) => c > 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* 난이도 (상단) */}
        <div className="flex gap-2">
          {DIFFICULTY_TONES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDifficulty(d.value)}
              className={cn(
                "h-8 flex-1 rounded-lg border text-[12px] font-semibold transition-all",
                difficulty === d.value ? d.selected : d.idle,
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* 커스텀 유형 + 개수 (+ 유형별 상세 토글) */}
        {types.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-500">
            저장된 커스텀 유형이 없습니다. ‘유형 만들기’ 탭에서 먼저 유형을 만드세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {types.map((t) => (
              <CustomTypeBlock
                key={t.id}
                type={t}
                count={typeCounts[t.id] || 0}
                override={typeOverrides[t.id]}
                expanded={expandedTypeId === t.id}
                onToggleExpand={() => setExpandedTypeId(expandedTypeId === t.id ? null : t.id)}
                onSetCount={(c) => setTypeCount(t.id, c)}
                onSetOverride={(ov) => setTypeOverride(t.id, ov)}
                onResetOverride={() => resetTypeOverride(t.id)}
                onEdit={() => onEdit(t.id, t.name)}
              />
            ))}

            {totalQuestions > 0 ? (
              <div className="flex items-center justify-between rounded-xl border border-blue-200/60 bg-blue-50 px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <Target className="size-3.5 text-blue-600" />
                  <span className="text-[12px] font-semibold text-blue-800">
                    총 <strong className="text-blue-700">{totalQuestions}</strong>문제
                    <span className="ml-1 font-medium text-blue-500">({activeTypeCount}개 유형)</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onResetCounts}
                  className="text-[11px] font-medium text-blue-500 transition-colors hover:text-blue-700"
                >
                  초기화
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 실행 (하단 고정) */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={onRun}
          disabled={submitting || !canRun}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[13.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {submitting
            ? "등록 중…"
            : selectedCount === 0
              ? "지문을 선택하세요"
              : totalQuestions === 0
                ? "유형을 선택하세요"
                : `지문 ${selectedCount}개 × ${totalQuestions}문제 생성`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── 커스텀 유형 블록 (개수 + 상세 토글) ───────────────────────────
function CustomTypeBlock({
  type,
  count,
  override,
  expanded,
  onToggleExpand,
  onSetCount,
  onSetOverride,
  onResetOverride,
  onEdit,
}: {
  type: CustomTypeListItem;
  count: number;
  override: CustomTypeOverride | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetCount: (count: number) => void;
  onSetOverride: (ov: CustomTypeOverride) => void;
  onResetOverride: () => void;
  onEdit: () => void;
}) {
  const active = count > 0;
  const ov = override ?? {};
  const optionCount = ov.optionCount ?? type.optionCount;
  const correctAnswerCount = ov.correctAnswerCount ?? type.correctAnswerCount;
  // 답형·지문기반은 유형의 본질(동형성) → 여기서 바꾸지 않는다. 객관식 선지 수치 + 유형 고유 파라미터만 조절.
  // '복수 정답'은 정답 수와 동치(정답 수≥2면 자동 복수)라 별도 컨트롤을 두지 않는다.
  const isMc = type.answerShape === "MULTIPLE_CHOICE";
  const hasTunable = type.tunableParams.length > 0;
  const canExpand = isMc || hasTunable;
  const overridden = !!override;

  const patch = (next: CustomTypeOverride) => onSetOverride({ ...ov, ...next });
  const setParam = (key: string, v: number) =>
    onSetOverride({ ...ov, params: { ...ov.params, [key]: v } });

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-white transition-all",
        active ? "border-blue-300 shadow-sm shadow-blue-50" : "border-slate-200 shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 border-b px-2.5 py-1.5",
          active ? "border-blue-100 bg-blue-50/70" : "border-slate-100 bg-slate-50/70",
        )}
      >
        <button
          type="button"
          onClick={() => onSetCount(count + 1)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white"
        >
          <span
            className={cn(
              "w-full truncate text-[12.5px] font-bold",
              active ? "text-blue-800" : "text-slate-700",
            )}
          >
            {type.name}
          </span>
          <span className="text-[10px] text-slate-400">
            {builtinLabel(type.nearestBuiltin)} · 생성 {type.generatedCount}개
            {overridden ? " · 설정 변경됨" : ""}
          </span>
        </button>

        {active ? <CheckCircle2 className="size-3.5 shrink-0 text-blue-600" /> : null}

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onSetCount(Math.max(0, count - 1))}
            disabled={!active}
            className="flex size-7 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200"
            aria-label={`${type.name} 개수 줄이기`}
          >
            <Minus className="size-3.5" />
          </button>
          <span
            className={cn(
              "w-5 text-center text-[12px] font-bold tabular-nums",
              active ? "text-blue-700" : "text-slate-300",
            )}
          >
            {count}
          </span>
          <button
            type="button"
            onClick={() => onSetCount(count + 1)}
            className="flex size-7 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-white hover:text-blue-700"
            aria-label={`${type.name} 개수 늘리기`}
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {canExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-500 ring-1 ring-blue-100 transition-colors hover:bg-blue-100 hover:text-blue-700"
            title={expanded ? "상세 설정 접기" : "상세 설정 펼치기"}
            aria-label={expanded ? "상세 설정 접기" : "상세 설정 펼치기"}
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onEdit}
          title="자연어로 유형 수정(영구)"
          className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
          aria-label={`${type.name} 유형 수정`}
        >
          <Wand2 className="size-3.5" />
        </button>
      </div>

      {expanded && canExpand ? (
        <div className="space-y-2.5 px-3 py-2.5">
          <p className="text-[10.5px] leading-snug text-slate-400">
            이 생성 배치에만 적용되는 임시 설정입니다. 유형 정의를 영구히 바꾸려면 ✦ 수정을 쓰세요.
          </p>
          {isMc ? (
            <>
              <NumberStepper
                label="보기 수"
                value={optionCount}
                min={2}
                max={20}
                onChange={(v) => patch({ optionCount: v })}
              />
              <NumberStepper
                label="정답 수"
                value={correctAnswerCount}
                min={1}
                max={Math.max(1, optionCount)}
                onChange={(v) => patch({ correctAnswerCount: v })}
              />
              {correctAnswerCount >= 2 ? (
                <p className="text-[10.5px] leading-snug text-blue-500">
                  정답 {correctAnswerCount}개 — 복수 정답으로 ‘모두 고르시오’ 형식으로 출제됩니다.
                </p>
              ) : null}
            </>
          ) : null}

          {/* 유형 고유 수치 파라미터 — 분석에서 추출(요약문 빈칸 수 등). value=정의 기본값. */}
          {type.tunableParams.map((p) => (
            <NumberStepper
              key={p.key}
              label={p.label}
              value={ov.params?.[p.key] ?? p.value}
              min={p.min}
              max={Math.max(p.min, p.max)}
              onChange={(v) => setParam(p.key, v)}
            />
          ))}

          {overridden ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onResetOverride}
                className="text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
              >
                유형 정의 기본값으로
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
      {label}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-7 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${label} 줄이기`}
        >
          <Minus className="size-3" />
        </button>
        <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-7 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${label} 늘리기`}
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── 작업 카드 ───────────────────────────
function JobCard({ job }: { job: CustomGenJob }) {
  const done = job.savedCount + job.skippedCount;
  const percent = job.totalCount > 0 ? Math.min(100, Math.round((done / job.totalCount) * 100)) : 0;
  const tone =
    job.status === "FAILED"
      ? "border-rose-200 bg-rose-50/60"
      : job.status === "COMPLETED"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-blue-200 bg-blue-50/50";

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-3", tone)}>
      <div className="flex items-center gap-1.5">
        {job.status === "PENDING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            <Clock className="size-3" /> 대기 중
          </span>
        ) : job.status === "PROCESSING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700">
            <Loader2 className="size-3 animate-spin" /> 생성 중
          </span>
        ) : job.status === "COMPLETED" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
            <CheckCircle2 className="size-3" /> 완료
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
            <AlertCircle className="size-3" /> 실패
          </span>
        )}
        <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">{formatTime(job.createdAt)}</span>
      </div>

      {job.status === "PROCESSING" && job.totalCount > 0 ? (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] font-medium text-blue-600 tabular-nums">
            {done}/{job.totalCount} 처리 · 저장 {job.savedCount}
            {job.skippedCount > 0 ? ` · 제외 ${job.skippedCount}` : ""}
          </p>
        </div>
      ) : job.status === "COMPLETED" ? (
        <p className="text-[11px] font-medium text-emerald-700 tabular-nums">
          {job.savedCount}개 생성
          {job.skippedCount > 0 ? ` · ${job.skippedCount}개 제외` : ""}
          {job.savedCount === 0 && job.errorMessage ? (
            <span className="mt-1 block font-normal text-slate-500">{job.errorMessage}</span>
          ) : null}
        </p>
      ) : job.status === "FAILED" ? (
        <p className="text-[11px] leading-relaxed text-rose-600 line-clamp-3" title={job.errorMessage ?? undefined}>
          {job.errorMessage ?? "생성에 실패했습니다."}
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          지문 {job.passageCount}개 × {job.countPerPassage}개 생성 대기 중
        </p>
      )}
    </div>
  );
}
