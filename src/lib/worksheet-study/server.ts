// ============================================================================
// 학습지 스터디 모드 — 서버 런타임 (서버 전용)
//
// /g/w/[taskId](허브)·/g/w/[taskId]/study/*(플레이어)·/api/g/study/*(이벤트)가
// 공유하는 로드·상태·이벤트 반영 정본. 규범: docs/worksheet-study-spec.md §7.
//
// 무회귀 계약:
//  - 스터디 불가(문서가 영어 PRIME 아님 / mode "off" / 채점 스테이지 < 2)면
//    호출부가 기존 뷰어로 폴백할 수 있게 plan=null 로 알린다.
//  - 태스크 DONE 마킹은 /api/g/tasks/[taskId]/complete 와 동일 잠금 규칙.
// ============================================================================

import "server-only";
import { PRIME_REPORT_MARKER } from "@/actions/workbench/passage-constants";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { prisma } from "@/lib/prisma";
import { isTaskLocked } from "@/lib/study-assignments/status";
import type { OwnedStudentTask } from "@/lib/study-assignments/student-runtime";
import { compileStudyPlan, planIsViable } from "./compile";
import { accumulateWeakness, computeMasteryPct, computeStudyMastery } from "./grade";
import type {
  StudyEventsRequest,
  StudyItemEvent,
  StudyPlan,
  StudyStageFirstAttempt,
  StudyStageId,
  StudyStageState,
  StudyStateSummary,
  StudyWeakness,
  WorksheetStudyConfig,
} from "./types";
import { resolveStudyConfig } from "./types";

const STAGE_IDS = new Set<string>([
  "reading",
  "vocab-flash",
  "vocab-quiz",
  "vocab-match",
  "chunk",
  "grammar",
  "cloze",
  "order",
  "translation",
  "reproduction",
  "exam",
]);

export interface StudyContext {
  task: OwnedStudentTask;
  config: WorksheetStudyConfig;
  /** null = 스터디 모드 불가(뷰어 폴백) */
  plan: StudyPlan | null;
  summary: StudyStateSummary;
  stateId: string | null;
  /** CLOSED 또는 공개 전 — 새 진행 불가(완료 태스크 재열람은 허용) */
  locked: boolean;
}

type StageStatesJson = Partial<Record<StudyStageId, StudyStageState>>;

function parseStageStates(raw: unknown): StageStatesJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StageStatesJson = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!STAGE_IDS.has(k) || !v || typeof v !== "object") continue;
    const s = v as StudyStageState;
    if (s.status === "todo" || s.status === "in-progress" || s.status === "done") {
      out[k as StudyStageId] = s;
    }
  }
  return out;
}

function parseWeakness(raw: unknown): StudyWeakness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as StudyWeakness;
  if (!w.skills || !w.sentences || !Array.isArray(w.words) || !w.grammar) return null;
  return w;
}

/** 필수 완료 판정 — 현재 plan 의 모든 스테이지(무채점 통독·카드 포함)가 done. */
function requiredStagesDone(plan: StudyPlan, states: StageStatesJson): boolean {
  const requiredIds = plan.stages.map((s) => s.id);
  if (requiredIds.length === 0) return false;
  return requiredIds.every((id) => states[id]?.status === "done");
}

/**
 * 학습지 편집(plan 드리프트) 후 사라진 스테이지의 잔여 상태를 제외한다 —
 * 없어진 스테이지의 점수가 숙달도·완료 판정에 계속 반영되는 것을 막는다.
 */
function intersectStages(plan: StudyPlan | null, states: StageStatesJson): StageStatesJson {
  if (!plan) return states;
  const live = new Set<string>(plan.stages.map((s) => s.id));
  const out: StageStatesJson = {};
  for (const [k, v] of Object.entries(states)) {
    if (live.has(k)) out[k as StudyStageId] = v;
  }
  return out;
}

function buildSummary(plan: StudyPlan | null, row: {
  stageStates: unknown;
  weakness: unknown;
  masteryPct: number | null;
  totalTimeMs: number;
} | null): StudyStateSummary {
  const stages = intersectStages(plan, parseStageStates(row?.stageStates));
  // 저장된 masteryPct 가 아니라 현재 plan 에 살아 있는 스테이지로 재계산 —
  // 학습지 편집으로 스테이지가 사라져도 정답률이 과대 표시되지 않는다.
  const mastery = computeStudyMastery(stages);
  return {
    stages,
    masteryPct: mastery.firstTryPct,
    mastery,
    totalTimeMs: row?.totalTimeMs ?? 0,
    weakness: parseWeakness(row?.weakness),
    requiredDone: plan ? requiredStagesDone(plan, stages) : false,
  };
}

/**
 * 허브/플레이어 공용 컨텍스트 로드 — 문서 판별 + 컴파일 + 상태(있으면) 로드.
 * 상태 행 생성은 첫 이벤트 플러시 시점(ensureStudyState)으로 미룬다(뷰어만
 * 여는 학생의 빈 행 생성 방지).
 */
export async function loadStudyContext(
  task: OwnedStudentTask,
  academyId: string,
): Promise<StudyContext> {
  const config = resolveStudyConfig(task.payload);
  const locked =
    task.taskStatus !== "DONE" &&
    (isTaskLocked(task.availableFrom, new Date()) || task.assignmentStatus === "CLOSED");

  let plan: StudyPlan | null = null;
  if (config.mode !== "off" && task.refId) {
    const report = await prisma.passageReport.findFirst({
      where: { id: task.refId, academyId, deletedAt: null },
      select: { id: true, title: true, pages: true, generationPlan: true },
    });
    // 영어 PRIME 만 스터디 지원 — 국어(PRIME_KO)·Phase2 는 뷰어 폴백 (spec §1 비목표)
    if (report && report.generationPlan === PRIME_REPORT_MARKER) {
      const parsed = parseAnalysisReportForPreview(report.pages);
      if (parsed) {
        const compiled = compileStudyPlan({
          report: parsed,
          mode: config.mode,
          taskId: task.taskId,
          reportTitle: report.title,
        });
        if (planIsViable(compiled)) plan = compiled;
      }
    }
  }

  const row = plan
    ? await prisma.worksheetStudyState.findUnique({
        where: { taskId: task.taskId },
        select: {
          id: true,
          stageStates: true,
          weakness: true,
          masteryPct: true,
          totalTimeMs: true,
        },
      })
    : null;

  return {
    task,
    config,
    plan,
    summary: buildSummary(plan, row),
    stateId: row?.id ?? null,
    locked,
  };
}

/**
 * 진행 중 스테이지의 첫 시도 로그 — 플레이어의 "이어 풀기" 복원 입력.
 *
 * 로그는 (stateId, stageId, itemKey, attempt) 유니크라 attempt=1 만 뽑으면
 * 문항당 정확히 한 건, 곧 첫 시도 정본이다. 재도전(attempt=2)은 점수에 들어가지
 * 않으므로 제외한다.
 */
export async function loadStageFirstAttempts(
  stateId: string,
  stageId: StudyStageId,
): Promise<StudyStageFirstAttempt[]> {
  const rows = await prisma.worksheetStudyItemLog.findMany({
    where: { stateId, stageId, attempt: 1 },
    select: { itemKey: true, correct: true, selfGrade: true },
  });
  return rows.map((r) => ({
    itemKey: r.itemKey,
    correct: typeof r.correct === "boolean" ? r.correct : undefined,
    selfGrade:
      r.selfGrade === "O" || r.selfGrade === "D" || r.selfGrade === "X" ? r.selfGrade : undefined,
  }));
}

const MAX_EVENTS_PER_FLUSH = 120;
const MAX_RESPONSE_LEN = 500;

function sanitizeEvent(raw: unknown): StudyItemEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<StudyItemEvent>;
  if (typeof e.itemKey !== "string" || !e.itemKey || e.itemKey.length > 120) return null;
  if (typeof e.skill !== "string") return null;
  const attempt = Number(e.attempt);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 99) return null;
  const timeMs = Number(e.timeMs);
  return {
    itemKey: e.itemKey,
    skill: e.skill as StudyItemEvent["skill"],
    sentenceNo:
      Number.isInteger(e.sentenceNo) && (e.sentenceNo as number) > 0
        ? (e.sentenceNo as number)
        : undefined,
    wordKey: typeof e.wordKey === "string" && e.wordKey ? e.wordKey.slice(0, 80) : undefined,
    grammarCode:
      typeof e.grammarCode === "string" && e.grammarCode ? e.grammarCode.slice(0, 8) : undefined,
    attempt,
    correct: typeof e.correct === "boolean" ? e.correct : undefined,
    selfGrade: e.selfGrade === "O" || e.selfGrade === "D" || e.selfGrade === "X" ? e.selfGrade : undefined,
    response:
      typeof e.response === "string" && e.response ? e.response.slice(0, MAX_RESPONSE_LEN) : undefined,
    timeMs: Number.isFinite(timeMs) ? Math.max(0, Math.min(3_600_000, Math.round(timeMs))) : 0,
    hintUsed: e.hintUsed === true,
  };
}

/** 이벤트 요청 방어 파스 — 손상 요청은 null. */
export function parseEventsRequest(raw: unknown): StudyEventsRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StudyEventsRequest>;
  if (typeof r.stageId !== "string" || !STAGE_IDS.has(r.stageId)) return null;
  if (typeof r.planHash !== "string") return null;
  if (!Array.isArray(r.events)) return null;
  const events = r.events
    .slice(0, MAX_EVENTS_PER_FLUSH)
    .map(sanitizeEvent)
    .filter((e): e is StudyItemEvent => e !== null);
  let stageDone: StudyEventsRequest["stageDone"];
  if (r.stageDone && typeof r.stageDone === "object") {
    const d = r.stageDone as { score?: unknown; timeMs?: unknown; firstCorrect?: unknown; firstTotal?: unknown };
    const score = Number(d.score);
    const timeMs = Number(d.timeMs);
    const firstCorrect = Number(d.firstCorrect);
    const firstTotal = Number(d.firstTotal);
    if (Number.isFinite(score) && Number.isFinite(timeMs)) {
      stageDone = {
        score: Math.max(0, Math.min(100, Math.round(score))),
        timeMs: Math.max(0, Math.min(6 * 3_600_000, Math.round(timeMs))),
        firstCorrect: Number.isFinite(firstCorrect) ? Math.max(0, firstCorrect) : 0,
        firstTotal: Number.isFinite(firstTotal) ? Math.max(0, Math.round(firstTotal)) : 0,
      };
    }
  }
  let progress: StudyEventsRequest["progress"];
  if (r.progress && typeof r.progress === "object") {
    const p = r.progress as { answered?: unknown; total?: unknown; firstCorrect?: unknown; firstTotal?: unknown };
    const answered = Number(p.answered);
    const total = Number(p.total);
    if (Number.isInteger(answered) && answered >= 0 && Number.isInteger(total) && total > 0 && total <= 999) {
      const firstCorrect = Number(p.firstCorrect);
      const firstTotal = Number(p.firstTotal);
      progress = {
        answered: Math.min(answered, total),
        total,
        firstCorrect: Number.isFinite(firstCorrect) ? Math.max(0, firstCorrect) : 0,
        firstTotal: Number.isFinite(firstTotal) ? Math.max(0, Math.round(firstTotal)) : 0,
      };
    }
  }
  return { stageId: r.stageId as StudyStageId, planHash: r.planHash, events, stageDone, progress };
}

/**
 * 이벤트 플러시 반영 — 로그 append(멱등) + 스테이지 상태 병합 + 취약점/숙달도
 * 증분 재계산 + (필수 규칙이면) 태스크 DONE 마킹.
 *
 * 이벤트 무거절 원칙(spec §7.1): planHash 가 현재 컴파일과 달라도 절대 거절하지
 * 않는다 — v1 의 409 거절은 코드 배포·학습지 편집 시 진행 중 세션의 답안을 통째로
 * 유실시켰다(2026-07-20 실측). 응답 planStale 로 부드러운 안내만 하게 한다.
 */
export async function applyStudyEvents(
  ctx: StudyContext,
  academyId: string,
  studentId: string,
  req: StudyEventsRequest,
): Promise<{ taskDone: boolean; planStale: boolean; summary: StudyStateSummary }> {
  const { task, plan, config } = ctx;
  if (!plan) throw new Error("STUDY_UNAVAILABLE");
  const planStale = req.planHash !== plan.planHash;

  // 상태 행 확보 (첫 플러시 시 생성)
  const state = await prisma.worksheetStudyState.upsert({
    where: { taskId: task.taskId },
    create: {
      academyId,
      taskId: task.taskId,
      assignmentId: task.assignmentId,
      studentId,
      reportId: task.refId ?? "",
      planHash: req.planHash,
      startedAt: new Date(),
    },
    update: {},
    select: {
      id: true,
      stageStates: true,
      weakness: true,
      masteryPct: true,
      totalTimeMs: true,
      completedAt: true,
      updatedAt: true,
    },
  });

  // 로그 append — (stateId, stageId, itemKey, attempt) 유니크로 중복 플러시 무해.
  // createMany 는 실제 삽입 건수를 돌려주므로, 그것으로 "이번에 처음 기록된"
  // 이벤트만 골라 취약점·시간을 가산한다(재전송·재진입 이중 집계 차단).
  let freshEvents = req.events;
  if (req.events.length > 0) {
    const existing = await prisma.worksheetStudyItemLog.findMany({
      where: {
        stateId: state.id,
        stageId: req.stageId,
        itemKey: { in: [...new Set(req.events.map((e) => e.itemKey))] },
      },
      select: { itemKey: true, attempt: true },
    });
    const seen = new Set(existing.map((r) => `${r.itemKey}::${r.attempt}`));
    // 같은 배치 안의 중복(무채점 스테이지에서 이전/다음 재통과 등)도 1회만 집계
    freshEvents = req.events.filter((e) => {
      const k = `${e.itemKey}::${e.attempt}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await prisma.worksheetStudyItemLog.createMany({
      data: req.events.map((e) => ({
        academyId,
        stateId: state.id,
        studentId,
        stageId: req.stageId,
        itemKey: e.itemKey,
        skill: e.skill,
        sentenceNo: e.sentenceNo ?? null,
        wordKey: e.wordKey ?? null,
        grammarCode: e.grammarCode ?? null,
        attempt: e.attempt,
        correct: e.correct ?? null,
        selfGrade: e.selfGrade ?? null,
        response: e.response ?? null,
        timeMs: e.timeMs,
        hintUsed: e.hintUsed,
        // 뜻 스냅샷 동봉 — 누적 취약 단어장이 학습지 재파싱 없이 자립(스키마 주석 참조)
        wordMeaning: e.wordKey ? (plan.vocabMeanings[e.wordKey] ?? null) : null,
      })),
      skipDuplicates: true,
    });
  }

  const stageMeta = plan.stages.find((s) => s.id === req.stageId);
  const flushTime = freshEvents.reduce((acc, e) => acc + e.timeMs, 0);

  type StateSnapshot = {
    stageStates: unknown;
    weakness: unknown;
    totalTimeMs: number;
    completedAt: Date | null;
    updatedAt: Date;
  };

  /** 스냅샷 기준 병합 계산 — 낙관적 재시도마다 최신 스냅샷으로 다시 돈다 */
  const computeMerge = (snap: StateSnapshot) => {
    // 스테이지 상태 병합 — 사라진 스테이지의 잔여 상태는 제외(plan 드리프트 대응)
    const stages = intersectStages(plan, parseStageStates(snap.stageStates));
    const prev = stages[req.stageId];
    const nowIso = new Date().toISOString();
    // 부분 진행 병합 — answered 는 max 승격(재입장 세션의 리셋된 카운트가 기존
    // 진행을 깎지 않게), first* 스냅샷은 firstTotal 이 큰 쪽 유지
    const mergeProgress = (base: StudyStageState): StudyStageState => {
      if (!req.progress) return base;
      const keepPrev = (prev?.firstTotal ?? 0) > req.progress.firstTotal;
      return {
        ...base,
        answered: Math.max(prev?.answered ?? 0, req.progress.answered),
        total: req.progress.total,
        firstCorrect: keepPrev ? prev?.firstCorrect : req.progress.firstCorrect,
        firstTotal: keepPrev ? prev?.firstTotal : req.progress.firstTotal,
      };
    };
    if (req.stageDone) {
      // 최초 완주 점수는 이후 재학습으로 갱신하지 않는다 (첫 학습 정직성)
      if (prev?.status === "done") {
        stages[req.stageId] = { ...prev, lastAt: nowIso };
      } else {
        // 소요시간 = 벽시계(stageDone.timeMs)와 이벤트 누적(선행 플러시 + 이번
        // 플러시)의 max — 합산하면 이중 계상, 벽시계만 쓰면 중도 이탈 후 재입장
        // 세션의 선행 학습 시간이 유실된다.
        // 무채점 스테이지(통독·카드)는 점수를 저장하지 않는다 — 플레이어가 보내는
        // 관성값(100)이 교사면 평균에 섞이지 않게 한다.
        const graded = stageMeta?.graded !== false;
        stages[req.stageId] = {
          status: "done",
          ...(graded
            ? {
                score: req.stageDone.score,
                firstCorrect: req.stageDone.firstCorrect,
                firstTotal: req.stageDone.firstTotal,
              }
            : {}),
          timeMs: Math.max((prev?.timeMs ?? 0) + flushTime, req.stageDone.timeMs),
          completedAt: nowIso,
          lastAt: nowIso,
        };
      }
    } else if (!prev || prev.status === "todo") {
      stages[req.stageId] = mergeProgress({
        status: "in-progress",
        timeMs: (prev?.timeMs ?? 0) + flushTime,
        lastAt: nowIso,
      });
    } else if (prev.status === "in-progress") {
      stages[req.stageId] = mergeProgress({
        ...prev,
        timeMs: (prev.timeMs ?? 0) + flushTime,
        lastAt: nowIso,
      });
    } else {
      // done 스테이지 재학습(복습) — 점수는 불변, 활동 시각만 갱신(라이브 표시)
      stages[req.stageId] = { ...prev, lastAt: nowIso };
    }

    // 취약점 누적 — 이미 done 인 스테이지의 재학습(복습) 이벤트와, 이미 로그에
    // 있던 재전송 이벤트는 제외한다(첫 학습만 1회 집계 = 로그 기반 교사면 통계와 정합)
    const countable = prev?.status === "done" ? [] : freshEvents;
    const weakness = accumulateWeakness(parseWeakness(snap.weakness), countable);
    const masteryPct = computeMasteryPct(stages);
    const requiredDone = requiredStagesDone(plan, stages);
    const nowCompleted = requiredDone && !snap.completedAt ? new Date() : null;
    const totalTimeMs = snap.totalTimeMs + flushTime;
    return {
      stages,
      weakness,
      masteryPct,
      requiredDone,
      totalTimeMs,
      data: {
        planHash: req.planHash,
        stageStates: stages as object,
        weakness: weakness as unknown as object,
        masteryPct,
        // 총 학습 시간 = 이벤트 timeMs 누적 (stageDone.timeMs 는 스테이지 상태
        // 전용 — 여기 더하면 이중 계상)
        totalTimeMs,
        ...(nowCompleted ? { completedAt: nowCompleted } : {}),
      },
    };
  };

  // 낙관적 동시성 — pagehide beacon 은 클라의 in-flight 가드를 우회해 fetch 플러시와
  // 동시 도착할 수 있다. updatedAt 조건부 갱신으로 lost update 를 막고, 충돌 시
  // 최신 스냅샷을 다시 읽어 재병합한다(최대 3회, 이후 최종 병합으로 무조건 기록 —
  // 이 배치의 stageDone·이벤트 반영이 유실되는 것이 최악이므로).
  let snap: StateSnapshot = {
    stageStates: state.stageStates,
    weakness: state.weakness,
    totalTimeMs: state.totalTimeMs,
    completedAt: state.completedAt,
    updatedAt: state.updatedAt,
  };
  let merged = computeMerge(snap);
  let applied = false;
  for (let tryN = 0; tryN < 3; tryN++) {
    const res = await prisma.worksheetStudyState.updateMany({
      where: { id: state.id, updatedAt: snap.updatedAt },
      data: merged.data,
    });
    if (res.count > 0) {
      applied = true;
      break;
    }
    const fresh = await prisma.worksheetStudyState.findUnique({
      where: { id: state.id },
      select: {
        stageStates: true,
        weakness: true,
        totalTimeMs: true,
        completedAt: true,
        updatedAt: true,
      },
    });
    if (!fresh) break;
    snap = fresh;
    merged = computeMerge(snap);
  }
  if (!applied) {
    await prisma.worksheetStudyState.update({ where: { id: state.id }, data: merged.data });
  }
  const { stages, weakness, masteryPct, requiredDone } = merged;

  // 과제 완료 연동 — 필수 규칙 + 전 스테이지 done + 아직 DONE 아님 + 잠금 아님
  let taskDone = task.taskStatus === "DONE";
  if (
    config.required &&
    requiredDone &&
    task.taskStatus !== "DONE" &&
    task.assignmentStatus !== "CLOSED" &&
    !isTaskLocked(task.availableFrom, new Date())
  ) {
    await prisma.studyAssignmentTask.update({
      where: { id: task.taskId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        startedAt: task.startedAt ?? new Date(),
      },
    });
    taskDone = true;
  }

  return {
    taskDone,
    planStale,
    summary: {
      stages,
      masteryPct,
      // 저장 캐시(masteryPct)와 같은 stages 로 계산한 진도·표본을 함께 돌려준다 —
      // 플레이어·리포트가 정답률만 단독으로 크게 띄우지 않도록(2607 §3.4)
      mastery: computeStudyMastery(stages),
      totalTimeMs: merged.totalTimeMs,
      weakness,
      requiredDone,
    },
  };
}
