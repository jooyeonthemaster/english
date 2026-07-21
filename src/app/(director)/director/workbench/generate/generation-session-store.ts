"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { startAdaptivePoll } from "@/lib/adaptive-poll";

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
  // 자동 생성 제거 — 문제 생성 잡은 항상 '유형 지정'(MANUAL) 으로 해석한다.
  const mode = "manual" as const;
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  const rawQuestionTypeSettings = parseRecord(config.questionTypeSettings);
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
    config: {
      typeCounts: questionType
        ? { [questionType]: Number(config.count ?? job.requestedCount ?? 1) }
        : {},
      difficulty:
        typeof config.difficulty === "string"
          ? config.difficulty
          : "INTERMEDIATE",
      prompt:
        typeof config.customPrompt === "string" ? config.customPrompt : "",
      mode,
      generationPlan:
        config.generationPlan === "PREMIUM" ? "PREMIUM" : "STANDARD",
      questionTypeSettings: questionType
        ? { [questionType]: rawQuestionTypeSettings }
        : rawQuestionTypeSettings,
    },
  };
}

function isFastTempItem(item: QueueItem): boolean {
  return item.id.startsWith("fast:");
}

// DB 복원 대상 터미널 카드(실패/완료)의 신선도 창 — 이보다 오래된 잡은 큐에
// 부활시키지 않는다(과거 실패·완료가 방문 때마다 재등장하는 flood 방지, 은행 동선 유지).
const FRESH_TERMINAL_WINDOW_MS = 15 * 60_000;

function sameTypeCounts(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && Number(a[key]) === Number(b[key]));
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

export function useGenerationSessionQueue(): [
  QueueItem[],
  Dispatch<SetStateAction<QueueItem[]>>,
] {
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [dbQueue, setDbQueue] = useState<QueueItem[]>([]);
  // 실패 잡을 "처음 관측한" 클라이언트 시각 — 과거 실패 잡(re-roll 이전부터
  // 있던 것)이 새 temp 를 오염시키지 않게 하는 게이트. 양쪽 모두 클라이언트
  // 시계라 서버-클라이언트 시계 오차와 무관하다.
  const failedFirstSeenRef = useRef<Map<string, number>>(new Map());
  // DB 복원(페이지 복귀) 지원 — 신선한 완료 잡의 결과 카드는 요약 응답에 문항이
  // 없어 full 뷰 1회 조회로 채운다. attempted 는 실패 시 재폭주 방지용 1회 마킹.
  const hydratedDoneRef = useRef<Map<string, QueueItem>>(new Map());
  const hydrationAttemptedRef = useRef<Set<string>>(new Set());
  // 로컬 낙관 카드가 이미 다루는 잡은 hydration 대상에서 제외(이중 카드 방지).
  const localIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    localIdsRef.current = new Set(localQueue.map((item) => item.id));
  }, [localQueue]);

  useEffect(() => {
    return startAdaptivePoll({
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
          const failedJobItems = jobs
            .map((job) => jobToQueueItem(job, { includeTerminalFailures: true }))
            .filter(
              (item): item is QueueItem =>
                !!item && item.status === "error",
            );

          // 실패 잡 최초 관측 시각 기록 — temp 가 생기기 전부터 보이던 실패
          // 잡은 "과거 실패"로 분류해 매칭에서 제외한다. 같은 설정 재생성
          // (re-roll)이 일상 동선이라, 직전 실패 잡이 지금 진행 중인 temp 를
          // 가짜 '실패'로 뒤집는 오염을 시간 창 없이 차단한다.
          const observedAt = Date.now();
          for (const f of failedJobItems) {
            if (!failedFirstSeenRef.current.has(f.id)) {
              failedFirstSeenRef.current.set(f.id, observedAt);
            }
          }
          // 응답에서 사라진 id 정리 (응답은 최근 100개 캡).
          if (failedFirstSeenRef.current.size > 300) {
            const liveIds = new Set(failedJobItems.map((f) => f.id));
            for (const id of failedFirstSeenRef.current.keys()) {
              if (!liveIds.has(id)) failedFirstSeenRef.current.delete(id);
            }
          }

          if (failedJobItems.length > 0) {
            setLocalQueue((prev) =>
              prev.map((item) => {
                if (
                  !isFastTempItem(item) ||
                  item.status !== "generating"
                ) {
                  return item;
                }
                const itemTime = item.createdAt
                  ? Date.parse(item.createdAt)
                  : 0;
                const failedMatch = failedJobItems.find((failed) => {
                  if (!dbItemMatchesTemp(item, failed)) return false;
                  // temp 가 만들어지기 전에 이미 관측된 실패 잡은 과거 실패.
                  const firstSeen = failedFirstSeenRef.current.get(failed.id);
                  return firstSeen == null || firstSeen >= itemTime;
                });
                if (!failedMatch) return item;
                return {
                  ...item,
                  status: "error" as const,
                  progress: failedMatch.progress,
                  error: failedMatch.error,
                };
              }),
            );
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
                  if (item && (item.status === "done" || item.status === "reviewed")) {
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
              (j) => (j.status === "FAILED" || j.status === "CANCELLED") && isFresh(j),
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
          const base = jobs
            .map((j) => `${j.id}:${j.status}:${j.successCount}`)
            .join("|");
          const anyActive = jobs.some(
            (j) => j.status === "PENDING" || j.status === "PROCESSING",
          );
          return anyActive ? `${base}|t${Date.now()}` : base;
        } catch {
          // Keep local optimistic rows visible when a poll fails.
          return null;
        }
      },
    });
  }, []);

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
