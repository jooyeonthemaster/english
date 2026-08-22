"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 실전 문제 생성 조립 훅 (docs/class-studio-spec.md §3.8.8)
//
// 계보: 문제 생성 페이지(generate-page-client.tsx)의 지문별 생성 모달 배선
// (1312-1445 훅 조립 · 1669-1817 모달 JSX)을 스튜디오에 재호스팅한다 —
// 전역 생성 설정 useState 군(초기값 동일 복제) + useWorkspaceGeneration +
// useRowSettingsPanel + useKoreanSetGeneration 조립. 발사 체인은 기존 그대로:
// handleGenerateActiveRow → handleWorkspaceGenerate(targetLocalId — 반드시
// 전달, 미전달 시 체크만 해둔 지문 오발사 §3.8.11 함정 8. useRowSettingsPanel
// 이 activeRowId 를 넘기는 구현을 그대로 쓴다) → 변형본 저장 → 낙관 큐 →
// scheduleFastGeneration(전역 동시성 ≤5) → md-stream/fast 폴백.
//
// §3.9v2 증분: ① 포인트 짚어주기(D8) — teacherPointsByPassage 상태 +
// usePointPicker 를 생성 페이지 원본과 동일 배선(발사 페이로드
// settings.teacherPoints 머지 복원, configOnly 만 의도적 미전달) ② 실전 문제
// 일괄 발사(§3.9v2.5-4) — batchGenerateQuestions/batchQuestionCost additive
// 반환 필드(BatchGeneratePane 이 소비, 이름은 batch-types.ts 계약 고정).
//
// 폴러 1개 규칙(문항판): useGenerationSessionQueue 는 studio-home-client 1곳
// 에서만 호출한다 — 이 훅은 그 setSessionQueue 를 주입받아 스탬프 래퍼만
// 씌운다(여기서 훅을 또 부르면 5초 ai-jobs 폴링이 배수로 늘어난다 — §12
// egress 폭탄 선례의 문항판).
//
// ⚠ 워크북(학습 모듈) 발사는 이 훅의 handleGenerateActiveRow 를 재사용하지
//   말 것(§3.8.11 함정 7) — 발사 직후 그 행의 typeCounts 를 소거하는 부작용
//   이 있어 실전용 유형 지정이 같이 날아간다. 워크북 = queueApi.launchModules
//   직결(B1/A5 소관).
// ⚠ QueueItem temp id 프리픽스(fast:/set:/koset:)는 낙관↔DB 병합 판정의 키 —
//   재작성 금지(§3.8.11 함정 10). 아래 스탬프는 id 를 읽기만 하고 절대 바꾸지
//   않는다.
//
// 스튜디오 발사 스탬프(§3.8.8 문항판): setSessionQueue 래퍼가 낙관 카드 추가
// (temp 프리픽스 신규 항목)를 가로채 tempId 를 localStorage
// `studio-qgen-stamps:{academyId}` (TTL 48h · cap 40 — use-studio-queue.ts 의
// 학습지판 스탬프와 동일 규약)에 기록한다. fast 완료 시 제자리 교체
// (replaceQueueItemInPlace: 스탬프된 temp 소멸 + jobId 카드 등장)도 같은
// 업데이트 diff 로 잡아 jobId 를 승격 기록한다 — 다음 DB 폴링(≤5s)까지
// 완료 카드가 도크에서 깜빡 사라지는 공백을 막는다. 도크 종결 필터(§3.8.9)는
// isStampedQueueItem 으로 "이 스튜디오에서 발사한 것"만 종결 카드로 남긴다
// (무필터 = 학원 최근 100잡 소음, 실측 89건 — §3.8.11 함정 5).
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { toast } from "sonner";

import { getCustomPrompts } from "@/actions/custom-prompts";
import { useTaskQueue } from "@/components/workbench/task-queue/context";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import {
  getQuestionGenerationCreditCost,
  planForDifficulty,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  getDefaultQuestionTypeGenerationSettings,
  readQuestionTypeDifficultySetting,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import {
  countWords,
  type PassageItem,
  type QueueItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import { VOCAB_GENERATION_TYPE_IDS } from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/constants";
import type { TeacherPoint } from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import type { GenerationConfigPanelProps } from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/types";
import { useKoreanSetGeneration } from "@/app/(director)/director/workbench/generate/use-korean-set-generation";
import { usePointPicker } from "@/app/(director)/director/workbench/generate/use-point-picker";
import { useRowSettingsPanel } from "@/app/(director)/director/workbench/generate/use-row-settings-panel";
import { useWorkspaceGeneration } from "@/app/(director)/director/workbench/generate/workspace/use-workspace-generation";
import {
  effectiveRowContent,
  isOverrideEmpty,
  overrideHasTypeCounts,
  rowNeedsVariant,
  type WorkspaceRow,
} from "@/app/(director)/director/workbench/generate/workspace/workspace-types";
import type { WorkspaceRowsApi } from "@/app/(director)/director/workbench/generate/workspace/use-workspace-rows";
import type {
  BatchQuestionLaunchResult,
  BatchQuestionSettings,
} from "./batch-types";

// ── 스튜디오 발사 스탬프 (localStorage — 학습지판 use-studio-queue.ts:85-123 규약 복제) ──

const QGEN_STAMP_TTL_MS = 48 * 60 * 60 * 1000;
const QGEN_STAMP_CAP = 40;

/**
 * 낙관 temp id 프리픽스 — fast/set(영어 워크스페이스 발사)·koset(국어 세트).
 * generation-session-store 의 isFastTempItem("fast:") 등 병합 판정과 같은 값을
 * 읽기 전용으로 참조한다(재작성 금지 — §3.8.11 함정 10).
 */
const OPTIMISTIC_TEMP_PREFIXES = ["fast:", "set:", "koset:"] as const;

function isOptimisticTempId(id: string): boolean {
  return OPTIMISTIC_TEMP_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function qgenStampKeyFor(academyId: string): string {
  return `studio-qgen-stamps:${academyId}`;
}

/** 영속본 로드 — TTL(48h) 지난 항목은 걷어낸다. 손상 시 빈 스탬프. */
function loadQgenStamps(academyId: string): Map<string, number> {
  const map = new Map<string, number>();
  if (typeof window === "undefined") return map;
  try {
    const raw = window.localStorage.getItem(qgenStampKeyFor(academyId));
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cutoff = Date.now() - QGEN_STAMP_TTL_MS;
    for (const [id, at] of Object.entries(parsed)) {
      if (typeof at === "number" && at >= cutoff) map.set(id, at);
    }
  } catch {
    /* 손상된 영속본은 빈 스탬프로 — 세션 내 동작은 유지 */
  }
  return map;
}

/** 영속 저장 — 최신순 캡(QGEN_STAMP_CAP) 적용. 같은 내용 재기록은 멱등. */
function persistQgenStamps(
  academyId: string,
  stamps: Map<string, number>,
): void {
  if (typeof window === "undefined") return;
  try {
    const entries = [...stamps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, QGEN_STAMP_CAP);
    window.localStorage.setItem(
      qgenStampKeyFor(academyId),
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    /* 저장 실패해도 세션 내(메모리) 스탬프는 유지 */
  }
}

// ── 죽은 값 상수 (hideGenerateButtons 로 패널 하단 생성 버튼이 없어 미소비 —
//    타입상 필수라 참조 안정 더미로 채운다. §3.8.11 함정 1: 인라인 생성 금지) ──
const EMPTY_SELECTED_IDS: Set<string> = new Set();
const NOOP = () => {};

/** PassageGenerateModal 껍데기에 그대로 spread 하는 props (children 제외). */
export interface StudioGenModalShellProps {
  open: boolean;
  onClose: () => void;
  passageNumber: number;
  title: string;
  contentPreview: string;
  fullContent: string;
  wordCount: number;
  questions: number;
  creditCost: number;
  needsVariant: boolean;
  generating: boolean;
  onGenerate: () => void;
  // ── 포인트 짚어주기(§3.9v2.7 D8) — 생성 페이지 원본 배선
  //    (generate-page-client.tsx:1741-1749) 미러. configOnly 만 의도적 미전달
  //    (스튜디오는 모바일도 즉시 생성 — 스펙 명시 차이). ──
  /** 픽커 열림 — 모달이 2컬럼(지문 무대+설정 콘솔, max-w 1520px)으로 성장 */
  pickerOpen: boolean;
  /** Esc 사다리 1단 — 픽커만 닫고 설정 콘솔 복귀(모달 유지) */
  onPickerClose: () => void;
  /** 좌측 지문 무대 슬롯(PassagePointPicker) — pickerOpen 일 때만 렌더 */
  picker: ReactNode;
  /** 이 지문에 반영된 교사 포인트 총수 — 푸터 '포인트 N개 반영' 칩 */
  appliedPointCount: number;
  /** 푸터 포인트 칩 클릭 — 해당 유형 픽커 재진입(수정·복구 동선) */
  onPointChipClick: () => void;
  /** 포인트는 있는데 문항 수 0인 유형 존재 — 칩 보조 문구 트리거 */
  pointCountMissing: boolean;
}

export interface UseStudioQuestionGenArgs {
  academyId: string;
  /** 내 지문함 목록(usePassageLibrary) — 변형본 제목 충돌 검사·메타 승계에 쓴다 */
  passages: PassageItem[];
  /** 지문 목록 재로드 — 변형본 저장 후 목록 반영 */
  loadPassages: () => Promise<void>;
  /** 워크스페이스 행 엔진(useWorkspaceRows) — library-pane 이 이미 호스팅 중 */
  workspaceApi: WorkspaceRowsApi;
  /**
   * studio-home-client 의 useGenerationSessionQueue 세터(폴러 1개 규칙).
   * 이 훅이 스탬프 래퍼를 씌워 내부 발사 경로에만 쓴다 — 도크 등 다른 소비처는
   * 원본 세터를 그대로 쓰면 된다(스탬프는 발사(낙관 카드 추가) 시점에만 필요).
   */
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  /** 워크스페이스 오버레이 표시 여부 — false 가 되면 선택·모달을 자동 해제 */
  workspaceVisible: boolean;
  /** 발사 직후(모달 닫힘과 동시) 호출 — 도크 펼침 등 후처리용 */
  onAfterLaunch?: () => void;
  /**
   * 직행 발사 대상(§3.10.18 E18-e, additive) — 지문관리 하단 「실전 문제 생성」이
   * 선택 지문을 행으로 적재하고 그 localId 전부를 여기에 싣는다. 길이가 2 이상
   * 이면 모달 푸터 발사가 **batch 경로**(모달에서 정한 같은 설정을 전 행에 적용)
   * 로 간다. 미전달·길이 ≤1 이면 기존 단건(activeRow) 경로와 **완전히 동일**하다.
   *
   * batch 가 여기서 안전한 이유: 워크스페이스 표면이 폐기돼(§3.10.18 E18-a) 행은
   * 발사 직전에만 채워지는 헤드리스 스테이징이고, 직행 관문이 적재 전
   * workspaceApi.clear() 를 부르므로 **rows ≡ 선택 집합**이 불변식이다. 즉
   * "전 행 발사"가 곧 "선택분만 발사"다(구 설계에서 무관한 잔존 행까지 발사되던
   * 위험이 소멸). 참조 안정은 불필요 — 아래에서 ref 미러로만 읽는다.
   */
  directTargetLocalIds?: string[];
}

export interface StudioQuestionGenApi {
  /** 모달 대상 행 — 없으면 null(모달 미렌더) */
  activeRow: WorkspaceRow | null;
  activeRowId: string | null;
  genModalOpen: boolean;
  /** 행의 「실전 문제 생성」 버튼 — 행 선택 + 유형선택 모달 오픈 */
  openForRow: (localId: string) => void;
  /** 모달 닫기 — 선택(링)까지 해제(기존 계약) */
  closeGenModal: () => void;
  /** 행 본문 클릭 — 선택 링만(모달 안 염). PassageWorkspace onSetActiveRow 용 */
  selectRow: (localId: string) => void;
  /** 선택 해제 — PassageWorkspace onClearActiveRow 용 */
  clearActiveRow: () => void;
  /**
   * 모달 푸터 CTA — activeRow 하나만 발사(targetLocalId 보장)하고 모달을 닫는다.
   * 국어 지문 + 세트 모드면 KO 세트 경로로 자동 분기(generate-page 와 동일).
   * ⚠ 실전 문제 전용 — 워크북 발사에 재사용 금지(함정 7).
   */
  handleGenerateActiveRow: () => void;
  /** 발사 준비 락(변형본 저장 구간 포함) — 진행 중 재클릭은 조용히 무시된다 */
  generating: boolean;
  /** localId → {questions, creditCost} — PassageWorkspace rowStats 로 그대로 전달 */
  rowStats: Map<string, { questions: number; creditCost: number }>;
  /**
   * GenerationConfigPanel 전체 props 완성본(hideGenerateButtons 포함) —
   * StudioQuestionGenModal 이 그대로 spread 한다. 렌더마다 새 참조이므로
   * memo 컴포넌트에 통째로 내리지 말 것(모달은 조건 렌더라 무해).
   */
  panelProps: GenerationConfigPanelProps;
  /** PassageGenerateModal 껍데기 props — activeRow 없으면 null(모달 미렌더 게이트) */
  modalProps: StudioGenModalShellProps | null;
  /** 이 스튜디오에서 발사한 temp/job id 집합 — 도크 종결 필터(§3.8.9) 재료 */
  stampedQuestionIds: ReadonlySet<string>;
  /** 큐 항목이 스튜디오 발사분인지 — id ∈ stamps ∪ clientTempId ∈ stamps */
  isStampedQueueItem: (item: QueueItem) => boolean;
  /**
   * 실전 문제 일괄 발사(§3.9v2.5-4) — 발사 적격 행(본문 20자 이상 —
   * use-workspace-generation 발사 루프와 동일 판정)에만 동일 설정 오버라이드를
   * **덮어쓰고**(일괄 = 명시적 전체 적용 의미론) 무인자 발사. 반환은 동기
   * (발사 적격 행 수, 적격 0 = error) — 실제 발사는 오버라이드 커밋 직후
   * effect 1틱 뒤에 나간다(setOverride 는 비동기 상태 커밋이라 같은 틱 발사는
   * 옛 rows 를 읽는다). 발사 후 적격 행 typeCounts 는 {} 로 소거된다(연타
   * 중복 방지 — use-row-settings-panel.ts:115-130 의미론 미러).
   */
  batchGenerateQuestions: (s: BatchQuestionSettings) => BatchQuestionLaunchResult;
  /**
   * 일괄 발사 크레딧 견적 — 문제 생성 페이지 workspaceCreditCost 정본 산출부
   * (use-workspace-generation.computeRowGenStats manual 분기)와 동일 헬퍼 조합.
   * 전 행 동일 typeCounts 전제로 행 1개 비용 × rowCount.
   */
  batchQuestionCost: (s: BatchQuestionSettings, rowCount: number) => number;
}

export function useStudioQuestionGen({
  academyId,
  passages,
  loadPassages,
  workspaceApi,
  setSessionQueue,
  workspaceVisible,
  onAfterLaunch,
  directTargetLocalIds,
}: UseStudioQuestionGenArgs): StudioQuestionGenApi {
  // ── 전역 생성 설정 상태 — generate-page-client.tsx:347-362 초기값 그대로 복제
  //    (스튜디오는 ?mode= 딥링크가 없어 genMode 기본 "manual" 고정) ──
  const [genMode, setGenMode] = useState<"manual" | "set">("manual");
  const [generationPlan, setGenerationPlan] =
    useState<QuestionGenerationPlan>("STANDARD");
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [questionTypeSettings, setQuestionTypeSettings] =
    useState<QuestionTypeGenerationSettings>(() =>
      getDefaultQuestionTypeGenerationSettings(),
    );
  const [difficulty, setDifficulty] = useState<
    "BASIC" | "INTERMEDIATE" | "KILLER"
  >("INTERMEDIATE");
  const [customPrompt, setCustomPrompt] = useState("");

  // ── "포인트 짚어주기" (point-picker-design.md §2 · §3.9v2.7 D8) ──
  // 지문 스코프의 교사 지정 출제 포인트 — passageId → typeId → TeacherPoint[].
  // 지문 간 누출을 막기 위해 반드시 passageId 로 스코프하고, 본문이 바뀌면
  // (해시 불일치 effect — use-point-picker.tsx) 그 지문의 포인트를 통째로
  // 무효화한다. 선언 순서 계약(generate-page-client.tsx:422-430 동일): 아래
  // useWorkspaceGeneration 이 픽커 훅(usePointPicker)보다 먼저 이 상태를
  // 소비하므로 반드시 그 호출보다 위에 선언한다.
  const [teacherPointsByPassage, setTeacherPointsByPassage] = useState<
    Record<string, Record<string, TeacherPoint[]>>
  >({});

  // 저장된 프롬프트 클러스터 — GenerationConfigPanel 프롬프트 섹션 계약
  // (generate-page-client.tsx:365-373 동일 복제).
  const [savedPrompts, setSavedPrompts] = useState<
    { id: string; name: string; content: string }[]
  >([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadSavedPrompts = useCallback(async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(
      prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })),
    );
  }, []);

  const setTypeCount = useCallback((id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  }, []);

  const totalQuestions = useMemo(
    () => Object.values(typeCounts).reduce((a, b) => a + b, 0),
    [typeCounts],
  );

  // ── 스튜디오 발사 스탬프 — ref 소유(렌더 중 lazy init) + 영속 write-through ──
  // 스탬프 변동은 반드시 setSessionQueue 호출(=리렌더)에 동반되므로 별도
  // state 없이도 소비처는 다음 렌더에서 최신 집합을 읽는다.
  const stampsRef = useRef<Map<string, number> | null>(null);
  if (stampsRef.current === null) {
    stampsRef.current = loadQgenStamps(academyId);
  }
  const stampedSetRef = useRef<ReadonlySet<string> | null>(null);
  if (stampedSetRef.current === null) {
    stampedSetRef.current = new Set(stampsRef.current.keys());
  }

  /**
   * 큐 업데이트 diff 로 스탬프를 기록한다(멱등 — StrictMode 이중 호출 안전).
   * ① 신규 temp(fast:/set:/koset:) id = 발사 스탬프.
   * ② 스탬프된 temp 가 사라지며 비-temp id 가 등장한 업데이트 = fast 완료의
   *    제자리 교체(replaceQueueItemInPlace) — jobId 를 승격 기록해 DB 폴링
   *    도착 전(≤5s)에도 완료 카드가 도크 종결 필터를 통과하게 한다.
   */
  const recordLaunchStamps = useCallback(
    (prev: QueueItem[], next: QueueItem[]) => {
      if (prev === next) return;
      const stamps = stampsRef.current!;
      const prevIds = new Set(prev.map((item) => item.id));
      const added = next.filter((item) => !prevIds.has(item.id));
      if (added.length === 0) return;
      const nextIds = new Set(next.map((item) => item.id));
      const removedStampedTemp = prev.some(
        (item) =>
          !nextIds.has(item.id) &&
          isOptimisticTempId(item.id) &&
          stamps.has(item.id),
      );
      const now = Date.now();
      let mutated = false;
      for (const item of added) {
        if (!isOptimisticTempId(item.id) && !removedStampedTemp) continue;
        if (!stamps.has(item.id)) {
          stamps.set(item.id, now);
          mutated = true;
        }
      }
      if (mutated) {
        stampedSetRef.current = new Set(stamps.keys());
        persistQgenStamps(academyId, stamps);
      }
    },
    [academyId],
  );

  // 발사 경로 전용 래퍼 — 항상 함수형 업데이트로 감싸 diff 를 가로챈다.
  // temp id 는 읽기만 하고 항목 자체는 그대로 통과시킨다(함정 10).
  const stampingSetSessionQueue = useCallback<
    Dispatch<SetStateAction<QueueItem[]>>
  >(
    (action) => {
      setSessionQueue((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        recordLaunchStamps(prev, next);
        return next;
      });
    },
    [setSessionQueue, recordLaunchStamps],
  );

  const isStampedQueueItem = useCallback((item: QueueItem): boolean => {
    const stamps = stampsRef.current!;
    return (
      stamps.has(item.id) ||
      (!!item.clientTempId && stamps.has(item.clientTempId))
    );
  }, []);

  // ── 워크스페이스 생성 엔진 — generate-page-client.tsx:1312-1335 배선과 동일
  //    (스튜디오엔 '내 지문 체크' 선택-only 발사 경로가 없어 selectedIds 미전달 —
  //     optional 계약. teacherPointsByPassage 전달로 발사 페이로드에
  //     settings.teacherPoints 머지 복원 — use-workspace-generation.ts:600-609
  //     의 mergeTeacherPointsIntoTypeSettings 가 실제 머지 지점) ──
  const {
    generating: workspaceGenerating,
    handleWorkspaceGenerate,
    rowStats,
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
    setSessionQueue: stampingSetSessionQueue,
    loadPassages,
  });

  // ── 행별 설정 패널 fork — generate-page-client.tsx:1398-1445 배선과 동일 ──
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
    handleGenerateActiveRow: baseHandleGenerateActiveRow,
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

  // 저장된 프롬프트는 모달 최초 오픈 시 1회만 로드한다 — 스튜디오 홈은 폴링이
  // 겹치는 무거운 표면이라 마운트 즉시 조회(generate-page 방식)를 피한다
  // (§3.4 질의 절감 원칙. 패널 프롬프트 섹션은 로드 전 빈 목록으로 무해).
  const promptsLoadedRef = useRef(false);
  useEffect(() => {
    if (!genModalOpen || promptsLoadedRef.current) return;
    promptsLoadedRef.current = true;
    void loadSavedPrompts();
  }, [genModalOpen, loadSavedPrompts]);

  // ── 국어 세트 분기 — generate-page-client.tsx:1672-1695 배선과 동일.
  //    activeRowSubject(국어 지문이면 패널이 국어 유형 그룹만 노출)도 여기서
  //    나온다. 스튜디오는 국어 전용 라우트가 아니므로 subjectScope 미전달. ──
  const taskQueue = useTaskQueue();
  // 스튜디오엔 저장 문항 목록·지문 세트 섹션이 없다 — 둘 다 no-op 수용부.
  const noopLoadSavedQuestions = useCallback(async () => {}, []);
  const [, setSetRefreshNonce] = useState(0);
  const {
    activeRowSubject,
    activeRowKoContent,
    activeRowKoKind,
    koSetMode,
    koSetStats,
    koSetGenerating,
    handleGenerateKoSetActiveRow,
  } = useKoreanSetGeneration({
    activeRow,
    editingRow,
    panelGenMode,
    passages,
    generationPlan,
    customPrompt,
    workspaceApi,
    loadPassages,
    loadSavedQuestions: noopLoadSavedQuestions,
    setSessionQueue: stampingSetSessionQueue,
    taskQueue,
    closeGenModal,
    setSetRefreshNonce,
  });

  // ── 포인트 짚어주기 픽커 클러스터 — generate-page-client.tsx:1699-1716 배선
  //    동일 미러(§3.9v2.7 D8). staleness effect(본문 해시 불일치 → 포인트 무효화
  //    +토스트)는 workspaceApi.rows·teacherPointsByPassage 참조 변화에만 반응
  //    한다 — 스튜디오의 5초 ai-jobs 폴링은 sessionQueue 만 갱신하므로 이
  //    effect 를 재점화하지 않는다(중복 토스트 없음, 정적 검증). ──
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

  // 모달 푸터 CTA — KO 세트 모드 분기(generate-page-client.tsx:1736-1738 동형).
  // 두 경로 모두 내부에서 모달을 닫는다. ⚠ 실전 문제 전용 — 워크북 재사용 금지.
  // 직행 다중 발사 브릿지(§3.10.18 E18-e) — batchGenerateQuestions 는 아래에서
  // 선언되므로(선언 순서 = 훅 규칙) ref 미러로 넘겨받는다. 미러는 매 렌더 갱신
  // 되고 이 함수는 클릭 핸들러에서만 불리므로 항상 커밋된 최신본을 읽는다.
  const batchLaunchRef = useRef<
    ((s: BatchQuestionSettings) => BatchQuestionLaunchResult) | null
  >(null);
  const directTargetsRef = useRef<string[] | undefined>(directTargetLocalIds);

  const handleGenerateActiveRow = useCallback(() => {
    if (!activeRow) return;
    // 선택 N>1 직행 — 모달에서 정한 설정을 선택 지문 전부에 적용해 발사한다.
    // (모달 UI 는 단일 행 기준이라, 이 분기가 없으면 N-1 개가 조용히 누락된다.)
    const targets = directTargetsRef.current;
    const batch = batchLaunchRef.current;
    if (targets && targets.length > 1 && batch) {
      // ⚠ 설정의 출처는 **활성 행의 override** 다 — 전역 state 가 아니다.
      //   모달이 열려 있는 동안 use-row-settings-panel 은 editingRow 판정으로
      //   패널 세터를 writeActiveOverride(=setOverride(activeRowId,…))에 묶는다
      //   (use-row-settings-panel.ts:152-200). 즉 사용자가 고른 유형·난이도·
      //   플랜은 전역 typeCounts 가 아니라 이 행의 override 에만 적힌다.
      //   전역을 읽으면 언제나 빈 typeCounts → batch 가 "생성할 유형이 없습니다"
      //   로 튕겨 N개 전부 무발사가 된다(실측 확인된 결함).
      const ov = activeRow.override;
      // 세트 모드는 다중 발사 대상이 아니다(장문 세트는 지문 1개 전용 경로).
      // 여기서 막지 않으면 batch 가 전역 genMode(=manual)만 보고 통과시켜,
      // 사용자가 이 행에 지정한 세트 모드를 조용히 일반 생성으로 바꿔버린다
      // (적대 검수 확정 major).
      if ((ov?.mode ?? genMode) === "set") {
        toast.error(
          "장문 세트는 지문 1개씩만 생성할 수 있습니다. 지문을 하나만 선택해 주세요.",
        );
        return;
      }
      const result = batch({
        typeCounts:
          ov && overrideHasTypeCounts(ov) ? ov.typeCounts : typeCounts,
        difficulty: ov?.difficulty ?? difficulty,
        generationPlan: ov?.generationPlan ?? generationPlan,
        // 3필드 밖 설정(유형별 세부설정·추가 지시문 등) 보존.
        overrideTemplate: ov ?? null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      // 모달만 닫는다. ⚠ 이 시점에 행을 비우면 안 된다 — batch 는 큐잉만 하고
      // 실제 발사는 다음 커밋의 effect 다(호출부의 스테이징 청산은 발사 다음
      // 직행 진입 시점으로 미뤄져 있다 — library-pane 의 close effect 주석 참조).
      closeGenModal();
      return;
    }
    if (koSetMode) handleGenerateKoSetActiveRow();
    else baseHandleGenerateActiveRow();
    onAfterLaunch?.();
  }, [
    activeRow,
    koSetMode,
    handleGenerateKoSetActiveRow,
    baseHandleGenerateActiveRow,
    onAfterLaunch,
    typeCounts,
    difficulty,
    generationPlan,
    genMode,
    closeGenModal,
  ]);

  const clearActiveRow = useCallback(
    () => setActiveRowId(null),
    [setActiveRowId],
  );

  // ── 실전 문제 일괄 발사 (§3.9v2.5-4) ─────────────────────────────────
  // setOverride 는 React 상태 커밋이라 같은 틱의 handleWorkspaceGenerate 는
  // 오버라이드가 아직 없는 rows 클로저를 읽는다 → 2단계로 분리: ① 동기 단계
  // (검증+적격 행 덮어쓰기+요청 큐잉) ② 커밋 직후 effect 에서 무인자 발사+소거.
  // setOverride 는 참조 안정(useWorkspaceRows 빈 deps useCallback) —
  // workspaceApi 객체 자체는 렌더마다 새로 만들어지므로 통째 의존 금지.
  const { rows: wsRows, setOverride: wsSetOverride } = workspaceApi;

  // 매-편집 변경 값(rows·genMode·generating·유형 세부설정)은 deps 로 물지 않고
  // ref 미러로 호출 시점에 읽는다 — batchGenerateQuestions/batchQuestionCost 가
  // 워크스페이스 타이핑 중 재생성되면 QuestionGenBridge(library-pane 업링크)가
  // 재발행돼 오케스트레이터 전역 리렌더가 난다. 두 콜백은 클릭 핸들러에서만
  // 불리므로 커밋 후 동기화된 미러 읽기가 항상 최신이다. 이 동기화 effect 는
  // 아래 발사 effect 보다 먼저 선언한다(effect 선언 순서 = 실행 순서) — 같은
  // 커밋에서 미러 갱신이 발사·소거보다 앞서야 오버라이드 반영본 rows 를 읽는다.
  const wsRowsRef = useRef(wsRows);
  const genModeRef = useRef(genMode);
  const workspaceGeneratingRef = useRef(workspaceGenerating);
  const questionTypeSettingsRef = useRef(questionTypeSettings);
  // 26-08-18 난이도 기반 티어: 견적(batchQuestionCost)이 s.difficulty 미지정 시
  // 폴백할 전역 난이도 — 같은 ref 미러 관용구.
  const difficultyRef = useRef(difficulty);
  useEffect(() => {
    wsRowsRef.current = wsRows;
    genModeRef.current = genMode;
    workspaceGeneratingRef.current = workspaceGenerating;
    questionTypeSettingsRef.current = questionTypeSettings;
    difficultyRef.current = difficulty;
  });

  const pendingBatchRef = useRef<{ localIds: string[] } | null>(null);
  // 연타 이중발사 동기 락 — 큐잉~발사 effect 사이 1틱 창은 generating 상태
  // 가드가 아직 false 라 뚫린다. 발사 effect 에서 발사 직후 해제한다.
  const batchArmedRef = useRef(false);
  const [batchLaunchNonce, setBatchLaunchNonce] = useState(0);

  const batchGenerateQuestions = useCallback(
    (s: BatchQuestionSettings): BatchQuestionLaunchResult => {
      if (batchArmedRef.current) {
        // 직전 호출이 큐잉만 하고 아직 발사 effect 를 안 탄 상태 — 동기 재진입
        // 을 봉인한다(발사 후 재진입은 아래 generating 가드 소관).
        return {
          launchedRows: 0,
          error: "이미 생성을 시작했습니다. 잠시 후 다시 시도해 주세요.",
        };
      }
      const rows = wsRowsRef.current;
      if (rows.length === 0) {
        return {
          launchedRows: 0,
          error: "워크스페이스에 지문이 없습니다. 지문을 먼저 담아 주세요.",
        };
      }
      if (genModeRef.current === "set") {
        // handleWorkspaceGenerate 내부의 무인자 발사 가드(장문 세트 금지 토스트)
        // 와 같은 조건 — 오버라이드를 덮어쓰기 전에 사전 차단해 행 설정 오염
        // 없이 error 로 반환한다(§3.9v2.9 가드 존중).
        return {
          launchedRows: 0,
          error:
            "장문 세트 모드에서는 일괄 생성을 사용할 수 없습니다. 설정에서 모드를 변경해 주세요.",
        };
      }
      if (workspaceGeneratingRef.current) {
        // generating 락 중 발사하면 내부 가드가 조용히 무시해 "launchedRows>0
        // 인데 무발사 + typeCounts 소거"가 되므로 사전 차단한다.
        return {
          launchedRows: 0,
          error: "이미 문제 생성이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
        };
      }
      const validCounts: Record<string, number> = {};
      for (const [typeId, raw] of Object.entries(s.typeCounts)) {
        const n = Math.floor(Number(raw) || 0);
        if (n > 0) validCounts[typeId] = n;
      }
      if (Object.keys(validCounts).length === 0) {
        return {
          launchedRows: 0,
          error: "생성할 유형이 없습니다. 유형을 선택해 주세요.",
        };
      }
      // 발사 부적격 행 사전 제외 — use-workspace-generation 발사 루프와 동일
      // 판정(effectiveRowContent 20자 미만 = 토스트 후 건너뜀). 부적격 행은
      // launchedRows 집계·오버라이드 덮어쓰기·사후 typeCounts 소거에서 전부
      // 빠진다(과대보고·설정 오염 방지).
      const eligibleRows = rows.filter(
        (row) => effectiveRowContent(row).length >= 20,
      );
      if (eligibleRows.length === 0) {
        return {
          launchedRows: 0,
          error:
            "본문이 너무 짧아 생성할 수 없습니다. 지문 본문을 확인해 주세요.",
        };
      }
      // 적격 행 **덮어쓰기**(일괄 = 명시적 전체 적용 의미론 — 스펙 확정). 이전
      // 행별 오버라이드(모드·세부설정 포함)는 의도적으로 대체된다 — 남겨두면
      // override.mode==='set' 잔재가 행을 세트 경로로 끌고 간다.
      for (const row of eligibleRows) {
        wsSetOverride(row.localId, {
          // overrideTemplate(§3.10.18 E18-e) — 유형별 세부설정·추가 지시문·
          // 생성 모드 등 3필드 밖 설정을 함께 복제한다. 미전달이면 스프레드가
          // 빈 객체라 아래 3필드만 남는 기존 동작과 바이트 동일.
          ...(s.overrideTemplate ?? {}),
          typeCounts: { ...validCounts },
          difficulty: s.difficulty,
          generationPlan: s.generationPlan,
        });
      }
      batchArmedRef.current = true;
      pendingBatchRef.current = {
        localIds: eligibleRows.map((r) => r.localId),
      };
      setBatchLaunchNonce((n) => n + 1);
      return { launchedRows: eligibleRows.length };
    },
    [wsSetOverride],
  );

  // ② 커밋 후 발사 — 이 렌더의 handleWorkspaceGenerate 클로저는 오버라이드가
  // 반영된 rows 를 본다. ref 가드로 요청당 정확히 1회만 발사(마운트 시 null 이라
  // StrictMode 이중 마운트도 무해).
  useEffect(() => {
    const pending = pendingBatchRef.current;
    if (!pending) return;
    pendingBatchRef.current = null;
    // 무인자 = 전 행 발사(use-workspace-generation.ts:345-353). 행 설정은 호출
    // 진입 시 동기 캡처되므로(불변 업데이트) 직후 소거해도 안전하다.
    void handleWorkspaceGenerate();
    // 발사가 나갔으니 동기 락 해제 — 이후 재진입은 generating 가드가 받는다.
    batchArmedRef.current = false;
    // 발사 직후 후처리(도크 펼침) — 단건 발사(handleGenerateActiveRow)와 동일
    // 계약으로 호출한다.
    onAfterLaunch?.();
    // 발사(적격) 행만 typeCounts {} 소거 — 연타 중복 발사 방지(use-row-settings
    // -panel.ts:115-130 의미론 미러: 난이도·플랜은 보존, typeCounts 만 비운다).
    // 위 미러 동기화 effect 가 먼저 실행돼 wsRowsRef 는 오버라이드 커밋본이다.
    const rows = wsRowsRef.current;
    for (const localId of pending.localIds) {
      const row = rows.find((r) => r.localId === localId);
      if (row?.override && overrideHasTypeCounts(row.override)) {
        const next = { ...row.override, typeCounts: {} };
        wsSetOverride(localId, isOverrideEmpty(next) ? null : next);
      }
    }
  }, [batchLaunchNonce, handleWorkspaceGenerate, onAfterLaunch, wsSetOverride]);

  // 직행 다중 발사 브릿지 결선(§3.10.18 E18-e) — 위 handleGenerateActiveRow 가
  // 선언 순서상 batchGenerateQuestions 보다 앞서므로 ref 로 잇는다.
  // ⚠ 렌더 중 대입이 아니라 **커밋 후 effect**(deps 없음 = 매 렌더)다 — 이
  //   파일의 wsRowsRef 미러 동기화와 같은 관용구이며 react-hooks/refs 규칙을
  //   지킨다. 두 값 모두 클릭 핸들러에서만 읽히므로 커밋 후 갱신이면 충분하다.
  useEffect(() => {
    batchLaunchRef.current = batchGenerateQuestions;
    directTargetsRef.current = directTargetLocalIds;
  });

  const batchQuestionCost = useCallback(
    (s: BatchQuestionSettings, rowCount: number): number => {
      // 방어: 소비처가 rowCount 를 누락 호출하면(BatchGeneratePane 초기 구현이
      // fn(settings) 1인자 호출 — 병렬 중간 상태) 현재 워크스페이스 행 수로
      // 폴백해 NaN 견적을 막는다. 계약 시그니처(batch-types 정본)는 불변.
      const effRowCount = Number.isFinite(rowCount)
        ? rowCount
        : wsRowsRef.current.length;
      if (effRowCount <= 0) return 0;
      // 정본 산출부 미러: 생성 페이지 workspaceCreditCost = workspaceSummary
      // .creditCost ← use-workspace-generation.computeRowGenStats(manual 분기,
      // 유형별 세부설정 오버라이드 없음 케이스). 일괄 발사는 전 행에 동일
      // typeCounts 를 깔므로 행당 비용이 전부 같다 — 행 1개 비용 × rowCount.
      // 단가·티어 해석은 전부 정본 헬퍼(CREDIT_COSTS·VOCAB_GENERATION_TYPE_IDS·
      // readQuestionTypeDifficultySetting·planForDifficulty·
      // getQuestionGenerationCreditCost) 재사용 — 자체 산식 없음(computeRowGenStats
      // 는 비공개라 직수입 불가).
      // 26-08-18 난이도 기반 티어: s.generationPlan 은 견적에 쓰지 않는다 — 유형별
      // 실효 난이도(템플릿 유형설정 → 전역 유형설정 → s.difficulty → 전역 난이도)가
      // KILLER 면 2배. 덮어쓴 override 를 computeRowGenStats 가 읽는 순서와 동일.
      const fallbackDifficulty = s.difficulty ?? difficultyRef.current;
      let perRow = 0;
      for (const [typeId, raw] of Object.entries(s.typeCounts)) {
        const n = Math.floor(Number(raw) || 0);
        if (n <= 0) continue;
        const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
          ? CREDIT_COSTS.QUESTION_GEN_VOCAB
          : CREDIT_COSTS.QUESTION_GEN_SINGLE;
        const typeDifficulty = readQuestionTypeDifficultySetting(
          s.overrideTemplate?.questionTypeSettings?.[typeId] ??
            questionTypeSettingsRef.current[typeId],
          fallbackDifficulty,
        );
        perRow += getQuestionGenerationCreditCost(
          unit * n,
          planForDifficulty(typeDifficulty),
        );
      }
      return perRow * effRowCount;
    },
    [],
  );

  // ── 모달 props 조립 — generate-page-client.tsx:1718-1817 JSX 를 객체로 평탄화 ──
  const activeRowStats = activeRowId ? rowStats.get(activeRowId) : undefined;
  // 직행 다중 발사(§3.10.18 E18-e)에서는 같은 설정이 **선택 지문 전부**에
  // 적용된다 — 푸터의 문항 수·크레딧을 행 1개분으로 두면 화면이 거짓말을 한다
  // ("3지문 선택 → 1문제생성" 실측). 대상 수만큼 곱해 정직하게 표시한다.
  // 미전달·1개면 배수 1 이라 기존 표시와 바이트 동일.
  const directRowMultiplier =
    directTargetLocalIds && directTargetLocalIds.length > 1
      ? directTargetLocalIds.length
      : 1;

  const modalProps: StudioGenModalShellProps | null = activeRow
    ? {
        open: true,
        onClose: closeGenModal,
        passageNumber: activeRowIndex >= 0 ? activeRowIndex + 1 : 1,
        // 다중 직행이면 "이 설정이 N개 지문 전부에 적용된다"를 제목이 말한다 —
        // 첫 지문 제목만 두면 나머지 N-1 개가 화면에서 사라진 것처럼 보인다.
        title:
          directRowMultiplier > 1
            ? `${activeRow.title} 외 ${directRowMultiplier - 1}개`
            : activeRow.title,
        contentPreview: activeRow.content.trim().slice(0, 140),
        fullContent: activeRow.content,
        wordCount: countWords(activeRow.content),
        questions: koSetMode
          ? koSetStats.questions
          : (activeRowStats?.questions ?? 0) * directRowMultiplier,
        creditCost: koSetMode
          ? koSetStats.creditCost
          : (activeRowStats?.creditCost ?? 0) * directRowMultiplier,
        needsVariant: rowNeedsVariant(activeRow),
        generating: workspaceGenerating || koSetGenerating,
        onGenerate: handleGenerateActiveRow,
        // 포인트 짚어주기 — 픽커 열림 시 모달이 2컬럼(지문 무대+설정 콘솔)으로
        // 성장하고, Esc 사다리 1단(onPickerClose)은 픽커만 닫는다
        // (generate-page-client.tsx:1741-1749 미러 — configOnly 만 의도적 제외).
        pickerOpen: pointPickerNode !== null,
        onPickerClose: closePointPicker,
        picker: pointPickerNode,
        appliedPointCount: activeRowPointTotal,
        onPointChipClick: handlePointChipClick,
        pointCountMissing: zeroCountPointTypeIds.length > 0,
      }
    : null;

  const panelProps: GenerationConfigPanelProps = {
    genMode: panelGenMode,
    setGenMode: panelSetGenMode,
    editingRow,
    activePassageId: activeRow?.passageId ?? null,
    passageSubject: activeRowSubject,
    koPassageContent: activeRowKoContent,
    koPassageKind: activeRowKoKind,
    setPresetId: panelSetPresetId,
    onSetPresetChange: panelOnSetPresetChange,
    setPresetCounts: panelSetPresetCounts,
    onSetPresetCountsChange: panelOnSetPresetCountsChange,
    setMemberOverrides: panelSetMemberOverrides,
    onSetMemberOverridesChange: panelOnSetMemberOverridesChange,
    setMemberOverridesByPreset: panelSetMemberOverridesByPreset,
    onSetMemberOverridesByPresetChange: panelOnSetMemberOverridesByPresetChange,
    generationPlan: panelGenerationPlan,
    setGenerationPlan: panelSetGenerationPlan,
    typeCounts: panelTypeCounts,
    setTypeCount: panelSetTypeCount,
    setTypeCounts: panelSetTypeCounts,
    questionTypeSettings: panelQuestionTypeSettings,
    setQuestionTypeSettings: panelSetQuestionTypeSettings,
    totalQuestions: panelTotalQuestions,
    passageSentenceCount: activeRow
      ? countPassageSentences(activeRow.content)
      : undefined,
    difficulty: panelDifficulty,
    setDifficulty: panelSetDifficulty,
    customPrompt,
    setCustomPrompt,
    savedPrompts,
    showSavedPrompts,
    setShowSavedPrompts,
    showSaveInput,
    setShowSaveInput,
    savePromptName,
    setSavePromptName,
    savingPrompt,
    setSavingPrompt,
    editingPromptId,
    setEditingPromptId,
    editingName,
    setEditingName,
    loadSavedPrompts,
    // hideGenerateButtons 로 아래 3개는 죽은 값(패널 하단 버튼 미렌더) —
    // 타입상 필수라 참조 안정 더미로 채운다(recon Contracts 항목 확정).
    canGenerate: false,
    selectedIds: EMPTY_SELECTED_IDS,
    handleBatchGenerate: NOOP,
    hideGenerateButtons: true,
    // 포인트 짚어주기 배선(§3.9v2.7 D8) — 등재 유형 세부설정에 진입 행을
    // 렌더하고, 적용된 유형 타일에 "포인트 N" 배지를 띄운다
    // (generate-page-client.tsx:1813-1814 미러).
    onOpenPointPicker: handleOpenPointPicker,
    teacherPointCounts: activeRowPointCounts,
  };

  return {
    activeRow,
    activeRowId,
    genModalOpen,
    openForRow: handleSetActiveRow,
    closeGenModal,
    selectRow,
    clearActiveRow,
    handleGenerateActiveRow,
    generating: workspaceGenerating || koSetGenerating,
    rowStats,
    panelProps,
    modalProps,
    stampedQuestionIds: stampedSetRef.current!,
    isStampedQueueItem,
    batchGenerateQuestions,
    batchQuestionCost,
  };
}
