"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { toast } from "sonner";

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
import { questionSignature, type QueueItem } from "../../generate/generate-page-types";

import {
  type CustomGenJob,
  type CustomTypeListItem,
  type CustomTypeOverride,
} from "./custom-type-utils";
import { CustomTypeLab } from "./lab/custom-type-lab";
import {
  GenerationConfigPanel,
  type Difficulty,
} from "./custom-type-generation-config";
import { usePassageLibrary } from "../use-passage-library";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";

const POLL_INTERVAL_MS = 3000;

// 커스텀은 클라 세션 큐가 없다(DB 잡 폴링). BottomQueueSection 의 세션 큐 슬롯은 비워 두고
// 저장된 결과만 담당시킨다 — 진행 상황은 위쪽 작업 큐가 보여준다.
const EMPTY_QUEUE: QueueItem[] = [];
const ZERO_QUEUE_COUNTS = { generating: 0, done: 0, error: 0 };

function isActive(status: CustomGenJob["status"]): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

// CustomGenJob → QueueItem[](generating/error). COMPLETED 는 빈 배열 — 완료 문항은 savedQuestions(폴링)가
// 결과 카드로 표시하므로 큐에 넣지 않는다(중복/영구 로딩 방지). 출처 분리: generating/error=jobQueue,
// 완료=savedQuestions → 중복 원천 차단.
// 기본 문제 생성처럼 "지문 수만큼" 진행 카드를 띄운다(1잡=N지문 → N카드). 제목은 번호 placeholder.
// 실패는 잡 단위 1카드. (동형 문제 생성과 동일 패턴)
function jobToQueueItems(job: CustomGenJob): QueueItem[] {
  if (job.status === "COMPLETED") return [];
  const isErr = job.status === "FAILED";
  const passageN = Number(job.passageCount) > 0 ? Number(job.passageCount) : 1;
  const createdAt = typeof job.createdAt === "string" ? job.createdAt : undefined;

  if (isErr) {
    return [
      {
        id: job.id,
        passageId: job.id,
        passageTitle: "커스텀 문항 생성 실패",
        passageContent: "커스텀 문항 생성에 실패했습니다.",
        createdAt,
        passageMeta: {},
        analysisData: null,
        status: "error",
        progress: {},
        questions: [],
        error: job.errorMessage ?? undefined,
        config: { typeCounts: {}, difficulty: "", prompt: "", mode: "manual" },
      },
    ];
  }

  // 지문당 생성 문항 수 — 커스텀은 잡에 countPerPassage 가 명시돼 있다.
  const perPassage = Math.max(1, Number(job.countPerPassage) || 1);
  return Array.from({ length: passageN }, (_, i) => ({
    id: `${job.id}__${i}`,
    passageId: `${job.id}__${i}`,
    passageTitle:
      passageN > 1 ? `커스텀 문항 생성 (${i + 1}/${passageN})` : "커스텀 문항 생성",
    passageContent: "선택한 지문으로 커스텀 유형 문항을 생성하고 있습니다.",
    createdAt,
    passageMeta: {},
    analysisData: null,
    status: "generating" as const,
    progress: {},
    questions: [],
    // mode='manual' 이라 sum(typeCounts)=perPassage 가 'AI가 N문제…' 진행 라벨로 표시된다.
    config: { typeCounts: { CUSTOM: perPassage }, difficulty: "", prompt: "", mode: "manual" as const },
  }));
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
  // 유형 "편집" → 유형 실험실(스튜디오 탭) 풀스크린으로 열기.
  const [labTypeId, setLabTypeId] = useState<string | null>(null);

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

  // ── 좌측 인테이크(지문 추가 ↔ 내 지문) ──
  const [intakeView, setIntakeView] = useState<IntakeView>("intake");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});

  // ── 지문 — 기본/동형과 동일한 데이터/상태(공유 use-passage-library 훅) ──
  const onPastedRegistered = useCallback(() => setIntakeView("library"), []);
  const {
    passages,
    filterOptions,
    collections,
    loadingPassages,
    loadPassages,
    selectedCollectionId,
    setSelectedCollectionId,
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
    selectedIds,
    setSelectedIds,
    contentModalPassage,
    setContentModalPassage,
    detailPassage,
    setDetailPassage,
    pasteSaving,
    filteredPassages,
    passageStatusCounts,
    activeFilterCount,
    toggleCheckbox,
    selectAll,
    deselectAll,
    handleOpenAnalysisModal,
    handleCreatePastedPassages,
  } = usePassageLibrary({
    academyId,
    onPastedRegistered,
    pastedSuccessGuide: "유형을 골라 동형 문항을 생성하세요.",
  });

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
    [loadPassages, setPassageSearch, setSelectedCollectionId, setAnalysisStatusFilter, setSelectedIds],
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

  // 진행(PENDING/PROCESSING)·실패(FAILED) 잡만 generating/error 카드로. COMPLETED 는 제외(savedQuestions 담당).
  // 잡이 COMPLETED 로 전이되면 자동으로 큐에서 빠져 진행 카드가 사라지고 결과 카드로 매끄럽게 전환된다.
  const jobQueue = useMemo<QueueItem[]>(() => jobs.flatMap(jobToQueueItems), [jobs]);

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
    if (selectedIds.size === 0) {
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
      // 검수 전 자료(미승격 draft)는 여기서 실제 지문으로 승격한 뒤 사용한다.
      const { passageIds, failedCount } = await resolveSelectionToPassageIds(
        Array.from(selectedIds),
      );
      if (passageIds.length === 0) {
        toast.error("선택한 자료를 지문으로 준비하지 못했습니다.");
        return;
      }
      if (failedCount > 0) {
        toast.warning(`${failedCount}개 자료는 지문으로 준비하지 못해 제외했어요.`);
      }
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
            onEdit={(id) => setLabTypeId(id)}
          />
        }
      />

      {/* 생성/검수 결과 — 기본 문제 생성과 동일한 공유 BottomQueueSection. 진행 잡은 generating 카드로 즉시 표시. */}
      <section
        ref={bottomQueueBoundaryRef}
        className="relative rounded-lg border border-slate-200 bg-white shadow-sm"
      >
        <BottomQueueSection
          marqueeBoundaryRef={bottomQueueBoundaryRef}
          sessionQueue={EMPTY_QUEUE}
          filteredQueue={jobQueue}
          queueFilter="all"
          setQueueFilter={() => {}}
          queueCounts={ZERO_QUEUE_COUNTS}
          savedQuestions={savedQuestions}
          loadingSavedQuestions={loadingSavedQuestions}
          setDetailQuestion={setDetailQuestion}
          onBatchApproveQuestions={handleBatchApproveQuestions}
          onBatchDeleteQuestions={handleBatchDeleteQuestions}
          deletedQuestionIds={deletedQuestionIds}
          deletedQuestionSignatures={deletedQuestionSignatures}
          batchDeleting={deletingQuestions}
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

      {labTypeId ? (
        <CustomTypeLab
          typeId={labTypeId}
          initialTab="studio"
          onClose={() => setLabTypeId(null)}
          onChanged={() => void loadTypes()}
        />
      ) : null}
    </div>
  );
}
