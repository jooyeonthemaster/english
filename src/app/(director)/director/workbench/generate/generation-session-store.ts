"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  startAdaptivePoll,
  type AdaptivePollHandle,
} from "@/lib/adaptive-poll";

import type { QueueItem } from "./generate-page-types";

interface AiJobRow {
  id: string;
  status: string;
  title: string;
  passageId?: string | null;
  mode: string | null;
  questionType: string | null;
  requestedCount: number;
  successCount: number;
  errorMessage: string | null;
  config: unknown;
  result: unknown;
  createdAt: string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    unit: string | null;
    school: { name: string } | null;
    analysis?: { analysisData: string } | null;
  } | null;
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAnalysis(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jobToQueueItem(
  job: AiJobRow,
  { includeTerminalFailures = false }: { includeTerminalFailures?: boolean } = {},
): QueueItem | null {
  const terminalFailure = job.status === "FAILED" || job.status === "CANCELLED";
  if (terminalFailure && !includeTerminalFailures) return null;

  const config = parseRecord(job.config);
  const result = parseRecord(job.result);
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  const questions = Array.isArray(result.questions) ? result.questions : [];
  const questionIds = Array.isArray(result.questionIds)
    ? result.questionIds.filter((id): id is string => typeof id === "string")
    : [];
  const hasPassageSnapshot = !!job.passage;
  // 진행 중(PENDING/PROCESSING) 잡은 지문 스냅샷·결과가 없어도 카드로 만든다 —
  // view=summary 폴링(6/6 egress 절감)은 둘 다 항상 비어 있어, 이 가드가 DB 복원
  // 경로 전체를 죽이고 있었다(페이지 이탈 → 복귀 시 로딩 카드 전멸의 원인).
  // 완료 잡은 결과 문항 없이는 카드가 의미 없으므로 기존대로 숨긴다(hydration 이 별도 복원).
  const isActiveJob =
    !terminalFailure && job.status !== "COMPLETED" && job.status !== "PARTIAL";
  if (
    !hasPassageSnapshot &&
    questions.length === 0 &&
    !terminalFailure &&
    !isActiveJob
  ) {
    return null;
  }

  const passageId = job.passage?.id ?? job.passageId ?? "";
  if (!passageId) return null;

  const progressKey = questionType || "manual";
  const progressValue =
    job.status === "COMPLETED" || job.status === "PARTIAL"
      ? "done"
      : job.status === "FAILED" || job.status === "CANCELLED"
        ? "error"
        : "pending";

  const clientTempId =
    typeof config.clientTempId === "string" ? config.clientTempId : undefined;

  return {
    id: job.id,
    clientTempId,
    passageId,
    passageTitle: job.passage?.title || job.title,
    passageContent: job.passage?.content ?? "",
    createdAt: job.createdAt,
    passageMeta: {
      school: job.passage?.school?.name,
      grade: job.passage?.grade ?? null,
      semester: job.passage?.semester ?? null,
      unit: job.passage?.unit ?? null,
    },
    analysisData: parseAnalysis(job.passage?.analysis?.analysisData),
    status:
      progressValue === "pending"
        ? "generating"
        : progressValue === "error"
          ? "error"
          : "done",
    progress: { [progressKey]: progressValue },
    questions,
    questionIds,
    error: job.errorMessage ?? undefined,
    config: jobConfigToQueueConfig(job),
  };
}

/**
 * 잡 행 config → QueueItem.config 투영. jobToQueueItem 과 **매칭 프로브**
 * (rowAsMatchProbe)가 같은 규약을 읽어야 하므로 한 곳에 둔다 — 두 벌로 갈라지면
 * 설정 시그니처 폴백(nonce 없는 레거시 행)이 조용히 어긋난다.
 */
function jobConfigToQueueConfig(job: AiJobRow): QueueItem["config"] {
  const config = parseRecord(job.config);
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  const rawQuestionTypeSettings = parseRecord(config.questionTypeSettings);
  return {
    typeCounts: questionType
      ? { [questionType]: Number(config.count ?? job.requestedCount ?? 1) }
      : {},
    difficulty:
      typeof config.difficulty === "string" ? config.difficulty : "INTERMEDIATE",
    prompt: typeof config.customPrompt === "string" ? config.customPrompt : "",
    // 자동 생성 제거 — 문제 생성 잡은 항상 '유형 지정'(MANUAL) 으로 해석한다.
    mode: "manual" as const,
    generationPlan:
      config.generationPlan === "PREMIUM" ? "PREMIUM" : "STANDARD",
    questionTypeSettings: questionType
      ? { [questionType]: rawQuestionTypeSettings }
      : rawQuestionTypeSettings,
  };
}

function isFastTempItem(item: QueueItem): boolean {
  return item.id.startsWith("fast:");
}

/**
 * 낙관 temp id 프리픽스 — fast(단건)·set(지문 세트)·koset(국어 세트).
 * use-studio-question-gen.ts 의 OPTIMISTIC_TEMP_PREFIXES 와 **같은 값**이다
 * (재작성 금지 — 병합 판정 키).
 *
 * ⚠ 병합 억제(위 isFastTempItem)는 fast 한정 그대로 둔다. 이 넓은 판정은
 *   아래 **서버 진실 대조**(완료·실패 흡수, 고아 수확)에서만 쓴다 — 억제까지
 *   넓히면 nonce 없는 세트 행이 설정 시그니처 폴백으로 엉뚱한 카드를 먹을 수
 *   있어서, 이득 없이 위험만 늘어난다.
 */
function isOptimisticTempItem(item: QueueItem): boolean {
  return (
    item.id.startsWith("fast:") ||
    item.id.startsWith("set:") ||
    item.id.startsWith("koset:")
  );
}

const TERMINAL_SUCCESS_STATUSES = new Set(["COMPLETED", "PARTIAL"]);
const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "CANCELLED"]);

function isTerminalStatus(status: string): boolean {
  return (
    TERMINAL_SUCCESS_STATUSES.has(status) ||
    TERMINAL_FAILURE_STATUSES.has(status)
  );
}

function readClientTempId(config: unknown): string | undefined {
  const record = parseRecord(config);
  return typeof record.clientTempId === "string"
    ? record.clientTempId
    : undefined;
}

// DB 복원 대상 터미널 카드(실패/완료)의 신선도 창 — 이보다 오래된 잡은 큐에
// 부활시키지 않는다(과거 실패·완료가 방문 때마다 재등장하는 flood 방지, 은행 동선 유지).
const FRESH_TERMINAL_WINDOW_MS = 15 * 60_000;

// 고아 낙관 카드 수확선(2026-08-18) — 서버에 대응 잡 행이 **아예 없는** 채로
// 이만큼 늙은 「생성 중」 카드는 요청이 서버에 닿지 못한 것이다(발사 직전 이탈·
// 네트워크 선실패로 잡 생성조차 안 된 경우). 서버 자체 좀비 청소가 10분 초과
// 활성 잡을 FAILED 로 확정하므로(api/workbench/ai-jobs/route.ts), 그보다 넉넉히
// 뒤인 12분을 잡아 "살아 있는 잡을 성급히 죽이는" 오판을 배제한다. 잡 목록은
// 최근 100건 캡이라 초대형 배치에서는 늦게 걸릴 수 있다 — 마지막 안전판이다.
const STALE_LOCAL_CARD_MS = 12 * 60_000;

function sameTypeCounts(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key, index) => key === bKeys[index] && Number(a[key]) === Number(b[key]),
  );
}

function sameQuestionTypeSettings(a: unknown, b: unknown): boolean {
  return JSON.stringify(parseRecord(a)) === JSON.stringify(parseRecord(b));
}

function sameGenerationRequest(a: QueueItem, b: QueueItem): boolean {
  return (
    a.passageId === b.passageId &&
    a.config.mode === b.config.mode &&
    a.config.difficulty === b.config.difficulty &&
    (a.config.generationPlan || "STANDARD") ===
      (b.config.generationPlan || "STANDARD") &&
    a.config.prompt === b.config.prompt &&
    sameTypeCounts(a.config.typeCounts, b.config.typeCounts) &&
    sameQuestionTypeSettings(
      a.config.questionTypeSettings,
      b.config.questionTypeSettings,
    )
  );
}

/**
 * 낙관적 temp(아직 jobId 를 모르는 in-flight 카드)와 DB 폴링이 가져온 잡 행이
 * "같은 작업"인지 판정한다.
 *
 * temp.id 는 곧 그 작업의 클라이언트 nonce(tempId)이고, fast 경로 잡은 그 값을
 * config.clientTempId 로 왕복 저장해 두므로 — nonce 가 있으면 그걸로 정확히 1:1
 * 매칭한다. 같은 지문+유형+설정을 연속/동시에 여러 번 생성해도 작업이 서로
 * 구분돼, 카드(지문·빈칸연습)가 섞이던 문제를 없앤다.
 *
 * nonce 가 없는 잡(레거시 행, 또는 slow/세트 등 다른 경로)만 기존 설정 시그니처로
 * 폴백한다 — 이들은 같은 설정 동시 다발 생성 동선이 드물어 회귀 위험이 낮다.
 */
function dbItemMatchesTemp(temp: QueueItem, dbItem: QueueItem): boolean {
  if (dbItem.clientTempId) {
    return dbItem.clientTempId === temp.id;
  }
  return sameGenerationRequest(temp, dbItem);
}

/**
 * 잡 행 → **매칭 전용** QueueItem 프로브.
 *
 * jobToQueueItem 은 완료 잡을 요약 뷰에서 null 로 떨군다(문항 없는 완료 카드는
 * 의미가 없으므로) — 그래서 "이 완료 잡이 저 낙관 카드의 결과인가"를 물어볼
 * 대상 자체가 없었다. 이 프로브는 표시에 쓰지 않고 오직 dbItemMatchesTemp 의
 * 좌우항을 맞추는 데만 쓴다(설정 시그니처 폴백 규약을 한 벌로 유지).
 */
function rowAsMatchProbe(job: AiJobRow): QueueItem | null {
  const passageId = job.passage?.id ?? job.passageId ?? "";
  if (!passageId) return null;
  return {
    id: job.id,
    clientTempId: readClientTempId(job.config),
    passageId,
    passageTitle: job.passage?.title || job.title,
    passageContent: "",
    createdAt: job.createdAt,
    passageMeta: {},
    analysisData: null,
    status: "generating",
    progress: {},
    questions: [],
    config: jobConfigToQueueConfig(job),
  };
}

/** 실패 흡수 시 카드에 실을 진행 표식 — 유형 키 1개에 error. */
function failureProgressFor(job: AiJobRow): QueueItem["progress"] {
  const config = parseRecord(job.config);
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  return { [questionType || "manual"]: "error" };
}

export function useGenerationSessionQueue(): [
  QueueItem[],
  Dispatch<SetStateAction<QueueItem[]>>,
] {
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [dbQueue, setDbQueue] = useState<QueueItem[]>([]);
  // 터미널(완료·실패) 잡을 "처음 관측한" 클라이언트 시각 — 과거 잡(re-roll 이전부터
  // 있던 것)이 새 temp 를 오염시키지 않게 하는 게이트. 양쪽 모두 클라이언트
  // 시계라 서버-클라이언트 시계 오차와 무관하다. 재발사(retryQuestionItem)는
  // nonce 까지 재사용하므로 **완료 흡수에도** 반드시 같은 게이트가 필요하다.
  const terminalFirstSeenRef = useRef<Map<string, number>>(new Map());
  // DB 복원(페이지 복귀) 지원 — 신선한 완료 잡의 결과 카드는 요약 응답에 문항이
  // 없어 full 뷰 1회 조회로 채운다. attempted 는 실패 시 재폭주 방지용 1회 마킹.
  const hydratedDoneRef = useRef<Map<string, QueueItem>>(new Map());
  const hydrationAttemptedRef = useRef<Set<string>>(new Set());
  // 로컬 낙관 카드가 이미 다루는 잡은 hydration 대상에서 제외(이중 카드 방지).
  const localIdsRef = useRef<Set<string>>(new Set());
  // 폴링 run 이 읽는 로컬 큐 거울 — 서버 진실과 대조할 대상. 커밋 후 갱신이라
  // 한 틱 늦을 수 있지만 대조는 멱등이라 다음 폴에서 그대로 다시 잡힌다.
  const localQueueRef = useRef<QueueItem[]>([]);
  const localActiveRef = useRef(0);
  const pollRef = useRef<AdaptivePollHandle | null>(null);
  const localActiveCount = useMemo(
    () =>
      localQueue.reduce(
        (n, item) => (item.status === "generating" ? n + 1 : n),
        0,
      ),
    [localQueue],
  );
  useEffect(() => {
    localIdsRef.current = new Set(localQueue.map((item) => item.id));
    localQueueRef.current = localQueue;
  }, [localQueue]);
  useEffect(() => {
    localActiveRef.current = localActiveCount;
  }, [localActiveCount]);

  useEffect(() => {
    const handle = startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 5 * 60_000,
      run: async (signal) => {
        try {
          const res = await fetch(
            "/api/workbench/ai-jobs?domain=QUESTION_GENERATION&limit=100&view=summary",
            { credentials: "include", cache: "no-store", signal },
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { jobs?: AiJobRow[] };
          if (signal.aborted) return null;
          const jobs = data.jobs ?? [];
          const observedAt = Date.now();

          // ── 터미널 잡 최초 관측 시각 기록 ──
          // temp 가 생기기 전부터 보이던 완료/실패 잡은 "과거 잡"으로 분류해
          // 매칭에서 제외한다. 같은 설정 재생성(re-roll)이 일상 동선이라, 직전
          // 잡이 지금 진행 중인 temp 를 가짜 종결로 뒤집는 오염을 차단한다.
          const terminalRows = jobs.filter((job) => isTerminalStatus(job.status));
          for (const job of terminalRows) {
            if (!terminalFirstSeenRef.current.has(job.id)) {
              terminalFirstSeenRef.current.set(job.id, observedAt);
            }
          }
          // 응답에서 사라진 id 정리 (응답은 최근 100개 캡).
          if (terminalFirstSeenRef.current.size > 300) {
            const liveIds = new Set(terminalRows.map((job) => job.id));
            for (const id of terminalFirstSeenRef.current.keys()) {
              if (!liveIds.has(id)) terminalFirstSeenRef.current.delete(id);
            }
          }
          const notPastJob = (item: QueueItem, job: AiJobRow) => {
            const itemTime = item.createdAt ? Date.parse(item.createdAt) : 0;
            const firstSeen = terminalFirstSeenRef.current.get(job.id);
            return firstSeen == null || firstSeen >= itemTime;
          };

          // ── 서버 진실 대조(2026-08-18) ─────────────────────────────────────
          // 낙관 「생성 중」 카드의 수명이 **오직 자기 in-flight 요청의 resolve**
          // 에만 걸려 있었다: 스트림이 끊기거나, 탭이 백그라운드에서 얼거나,
          // 표면이 리마운트돼 그 응답을 받을 주체가 사라지면 — DB 는 COMPLETED
          // 인데 카드는 영원히 돌았다(실측 근거: 최근 7일 문제생성 잡 295건이
          // 전부 COMPLETED/FAILED 로 종결, 고아 PENDING/PROCESSING 0건. 즉
          // 서버가 아니라 이 결선이 원인이다).
          //
          // 요약 폴링이 완료를 못 본 이유도 구조적이다 — jobToQueueItem 은
          // 요약 뷰의 완료 잡(지문 스냅샷·문항 둘 다 없음)을 null 로 떨궈,
          // "끝났다"는 사실이 dbQueue 까지 도달할 통로 자체가 없었다.
          // 여기서 **행 상태를 직접** 읽어 낙관 카드를 종결시킨다.
          const succeededRows = jobs.filter((job) =>
            TERMINAL_SUCCESS_STATUSES.has(job.status),
          );
          const failedRows = jobs.filter((job) =>
            TERMINAL_FAILURE_STATUSES.has(job.status),
          );
          const probeCache = new Map<string, QueueItem | null>();
          const probeOf = (job: AiJobRow) => {
            if (!probeCache.has(job.id)) {
              probeCache.set(job.id, rowAsMatchProbe(job));
            }
            return probeCache.get(job.id) ?? null;
          };
          const matches = (item: QueueItem, job: AiJobRow) => {
            if (job.id === item.id) return true;
            const probe = probeOf(job);
            return probe ? dbItemMatchesTemp(item, probe) : false;
          };

          const absorbedJobIdByLocalId = new Map<string, string>();
          const failedRowByLocalId = new Map<string, AiJobRow>();
          const orphanLocalIds = new Set<string>();
          for (const item of localQueueRef.current) {
            if (item.status !== "generating") continue;
            const done = succeededRows.find(
              (job) => matches(item, job) && notPastJob(item, job),
            );
            if (done) {
              absorbedJobIdByLocalId.set(item.id, done.id);
              continue;
            }
            if (!isOptimisticTempItem(item)) continue;
            const failed = failedRows.find(
              (job) => matches(item, job) && notPastJob(item, job),
            );
            if (failed) {
              failedRowByLocalId.set(item.id, failed);
              continue;
            }
            // 고아 수확 — 대응 잡 행이 아예 없는 늙은 카드(STALE_LOCAL_CARD_MS).
            const age = item.createdAt
              ? observedAt - Date.parse(item.createdAt)
              : Number.NaN;
            if (!Number.isFinite(age) || age < STALE_LOCAL_CARD_MS) continue;
            if (jobs.some((job) => matches(item, job))) continue;
            orphanLocalIds.add(item.id);
          }

          // 흡수 대상 잡의 문항을 **같은 틱에** 채운다 — 낙관 카드를 걷어낸 자리에
          // 완료 카드가 곧바로 서서, 사라졌다 다시 뜨는 깜빡임이 없다. ids= 타겟
          // 조회라 페이로드는 그 잡들뿐이다(구 limit=20 full 조회와 대비).
          const absorbedJobIds = [
            ...new Set(absorbedJobIdByLocalId.values()),
          ].filter((id) => !hydratedDoneRef.current.has(id));
          if (absorbedJobIds.length > 0) {
            try {
              const targeted = await fetch(
                `/api/workbench/ai-jobs?domain=QUESTION_GENERATION&view=full&ids=${absorbedJobIds
                  .slice(0, 20)
                  .join(",")}`,
                { credentials: "include", cache: "no-store", signal },
              );
              if (targeted.ok) {
                const targetedData = (await targeted.json()) as {
                  jobs?: AiJobRow[];
                };
                for (const row of targetedData.jobs ?? []) {
                  const item = jobToQueueItem(row);
                  if (
                    item &&
                    (item.status === "done" || item.status === "reviewed")
                  ) {
                    hydratedDoneRef.current.set(row.id, item);
                  }
                }
              }
            } catch {
              // 문항 채우기 실패는 치명 아님 — 문항은 이미 은행에 저장돼 있고,
              // 아래 카드 종결(「생성 중」 소거)은 그대로 진행한다.
            }
          }
          if (signal.aborted) return null;

          if (
            absorbedJobIdByLocalId.size > 0 ||
            failedRowByLocalId.size > 0 ||
            orphanLocalIds.size > 0
          ) {
            setLocalQueue((prev) => {
              let changed = false;
              const next: QueueItem[] = [];
              for (const item of prev) {
                if (item.status !== "generating") {
                  next.push(item);
                  continue;
                }
                if (absorbedJobIdByLocalId.has(item.id)) {
                  // 서버가 완료를 확정했다 → 낙관 카드는 역할이 끝났다. 결과
                  // 카드는 방금 채운 hydration 분(dbQueue)이 대신 선다. 뒤늦게
                  // in-flight 응답이 도착하면 replaceQueueItemInPlace 가 같은
                  // jobId 로 다시 심으므로 중복도, 소실도 없다.
                  changed = true;
                  continue;
                }
                const failed = failedRowByLocalId.get(item.id);
                if (failed) {
                  changed = true;
                  next.push({
                    ...item,
                    status: "error",
                    progress: failureProgressFor(failed),
                    error: failed.errorMessage ?? undefined,
                    streamPreview: undefined,
                  });
                  continue;
                }
                if (orphanLocalIds.has(item.id)) {
                  changed = true;
                  next.push({
                    ...item,
                    status: "error",
                    error:
                      "생성 요청이 서버에 접수되지 않았습니다. 다시 생성해 주세요.",
                    streamPreview: undefined,
                  });
                  continue;
                }
                next.push(item);
              }
              return changed ? next : prev;
            });
          }

          // 신선한(최근 15분) 완료 잡 중 로컬 카드가 없는 것만 full 뷰 1회 조회로
          // 결과 카드를 복원한다 — 생성 중 페이지를 벗어났다 완료 후 돌아온 경우.
          // 오래된 완료 잡은 기존대로 은행 동선(큐 카드 부활 금지).
          const now = Date.now();
          const isFresh = (row: AiJobRow) => {
            const t = Date.parse(row.createdAt);
            return Number.isFinite(t) && now - t <= FRESH_TERMINAL_WINDOW_MS;
          };
          const needHydration = jobs.filter(
            (j) =>
              (j.status === "COMPLETED" || j.status === "PARTIAL") &&
              isFresh(j) &&
              !hydratedDoneRef.current.has(j.id) &&
              !hydrationAttemptedRef.current.has(j.id) &&
              !localIdsRef.current.has(j.id),
          );
          if (needHydration.length > 0) {
            for (const j of needHydration) hydrationAttemptedRef.current.add(j.id);
            try {
              const fullRes = await fetch(
                "/api/workbench/ai-jobs?domain=QUESTION_GENERATION&limit=20&view=full",
                { credentials: "include", cache: "no-store", signal },
              );
              if (fullRes.ok) {
                const fullData = (await fullRes.json()) as { jobs?: AiJobRow[] };
                for (const row of fullData.jobs ?? []) {
                  if (!needHydration.some((n) => n.id === row.id)) continue;
                  const item = jobToQueueItem(row);
                  if (
                    item &&
                    (item.status === "done" || item.status === "reviewed")
                  ) {
                    hydratedDoneRef.current.set(row.id, item);
                  }
                }
              }
            } catch {
              // hydration 실패는 치명 아님 — 문항은 은행에 있고, attempted 마킹으로 재폭주 방지.
            }
          }
          if (hydratedDoneRef.current.size > 100) {
            const liveIds = new Set(jobs.map((j) => j.id));
            for (const id of hydratedDoneRef.current.keys()) {
              if (!liveIds.has(id)) hydratedDoneRef.current.delete(id);
            }
          }

          // dbQueue = 진행 중 카드(요약 복원) + 신선한 실패 카드 + hydration 완료 카드.
          const summaryItems = jobs
            .map((job) => jobToQueueItem(job))
            .filter(Boolean) as QueueItem[];
          const freshErrorItems = jobs
            .filter(
              (j) =>
                (j.status === "FAILED" || j.status === "CANCELLED") && isFresh(j),
            )
            .map((job) => jobToQueueItem(job, { includeTerminalFailures: true }))
            .filter((item): item is QueueItem => !!item && item.status === "error");
          const hydratedItems = jobs
            .map((j) => hydratedDoneRef.current.get(j.id))
            .filter(Boolean) as QueueItem[];
          setDbQueue([...summaryItems, ...freshErrorItems, ...hydratedItems]);
          // Signature: status + successCount per job → snaps back to the fast
          // cadence on any start/progress/completion, backs off when idle.
          // 진행 중(PENDING/PROCESSING) 잡이 있는 동안은 서명에 시각을 섞어 백오프를
          // 막는다 — 생성 중에는 status 가 한동안 안 변해 idleMs(5분)까지 늘어지고,
          // 그만큼 완료 반영이 늦어지기 때문. PROCESSING(실제 생성 구간)이 가장 길어
          // PENDING 만 보면 정작 긴 구간에서 폴링이 느려진다. 잡이 없으면 기존 백오프.
          //
          // 로컬 낙관 카드가 떠 있는 동안도 같은 이유로 빠른 주기를 유지한다:
          // 발사 직후엔 아직 잡 행이 안 보일 수 있고(요청 왕복 전), 바로 그 구간이
          // 위 서버 진실 대조가 가장 필요한 때다.
          const base = jobs
            .map((j) => `${j.id}:${j.status}:${j.successCount}`)
            .join("|");
          const anyActive = jobs.some(
            (j) => j.status === "PENDING" || j.status === "PROCESSING",
          );
          return anyActive || localActiveRef.current > 0
            ? `${base}|t${Date.now()}`
            : base;
        } catch {
          // Keep local optimistic rows visible when a poll fails.
          return null;
        }
      },
    });
    pollRef.current = handle;
    return () => {
      pollRef.current = null;
      handle();
    };
  }, []);

  // 발사·종결 순간 서버 진실을 즉시 확인한다 — idleMs(5분)까지 백오프해 잠든
  // 루프가 새 발사를 못 보고 있는 구간을 없앤다(그만큼 위 대조가 늦어진다).
  // 최초 마운트(0 → 0)는 초기 tick 과 겹치므로 건너뛴다.
  const prevActiveCountRef = useRef(0);
  useEffect(() => {
    if (prevActiveCountRef.current === localActiveCount) return;
    prevActiveCountRef.current = localActiveCount;
    pollRef.current?.bump();
  }, [localActiveCount]);

  const queue = useMemo(() => {
    const byId = new Map<string, QueueItem>();
    // 로컬 낙관 카드(fast temp)가 있는 작업은 상태 무관 로컬 카드가 진실원 —
    // DB 복원 카드(generating/error)를 중복으로 얹지 않는다. 완료(done) DB 카드만
    // 예외로 temp 를 대체한다(아래 completedDbItems 흡수).
    const fastTemps = localQueue.filter(isFastTempItem);
    const completedDbItems = dbQueue.filter(
      (item) => item.status === "done" || item.status === "reviewed",
    );
    for (const item of localQueue) {
      if (
        isFastTempItem(item) &&
        completedDbItems.some((dbItem) => dbItemMatchesTemp(item, dbItem))
      ) {
        continue;
      }
      byId.set(item.id, item);
    }
    for (const item of dbQueue) {
      if (
        item.status !== "done" &&
        item.status !== "reviewed" &&
        fastTemps.some((temp) => dbItemMatchesTemp(temp, item))
      ) {
        continue;
      }
      const localItem = byId.get(item.id);
      // 로컬이 이미 종결(done/error)인데 DB 요약이 아직 '생성 중'이면 **로컬이
      // 최신**이다. 무조건 덮어쓰던 기존 결선은, 완료 직후 다음 폴링까지(≤5s)
      // 카드를 '생성 중'으로 되돌려 놓았다 — 제자리 교체로 id 가 jobId 가 되는
      // 순간 위 temp 억제가 풀리기 때문이다.
      if (
        item.status === "generating" &&
        localItem &&
        localItem.status !== "generating"
      ) {
        continue;
      }
      byId.set(
        item.id,
        localItem
          ? { ...item, createdAt: localItem.createdAt ?? item.createdAt }
          : item,
      );
    }
    return Array.from(byId.values()).sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });
  }, [dbQueue, localQueue]);

  return [queue, setLocalQueue];
}
