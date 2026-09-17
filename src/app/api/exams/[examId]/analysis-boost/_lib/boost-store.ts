// ============================================================================
// analysis-boost 라우트의 영속 헬퍼 — aiMeta.boost 기록·게이트·좀비 정산 (W6 / v4)
//
// route.ts 가 500줄을 넘겨 흐름(인증→게이트→과금→실행→정산)만 남기고 DB 쓰기를
// 여기로 뗐다. 전부 라우트 전용 — 다른 표면은 import 하지 않는다(목록은 funnel.ts).
//
// 계약:
//  - 모든 findFirst 는 deletedAt:null — 보강 도중 분석 행이 휴지통에 가면 saved=false
//    로 떨어져 라우트가 BOOST_WRITE_CONFLICT(전액 환불)로 닫는다. 삭제된 행에 결과를
//    써 두고 과금하는 일이 없다.
//  - RUNNING 게이트는 **시험지 단위**(hasFreshRunningBoostForExam) — INTERNAL 행이
//    중복 생성된 사고에서도 한 시험지에 두 보강이 동시에 돌지 않는다.
//  - 게이트 CAS 는 3회 재시도 — 학생 제출 → sync 의 version 증가처럼 무관한 쓰기와
//    경합했을 뿐인데 「이미 진행 중」(409) 이라고 거짓말하지 않는다. 재판독에서 신선한
//    RUNNING 이 보일 때만 409, 3회 모두 빗나가면 GATE_CONFLICT(503).
//  - 좀비 정산(reconcileStaleBoostRun): RUNNING 이 BOOST_STALE_MS 를 넘긴 채 잡이
//    PROCESSING 이면 그 잡의 과금을 전액 환불하고 잡을 FAILED 로 닫는다 — 라우트 프로세스
//    가 응답 없이 죽은 경우(런타임 킬·배포) 크레딧이 되돌아오는 유일한 경로.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { refundCredits } from "@/lib/credits";
import { parseExamAnalysisResult } from "@/lib/exam-report/schemas";
import type { ExamLevelAnalysis, QuestionAnalysis } from "@/lib/exam-report/types";
import { BOOST_STALE_MS } from "@/lib/exam-report/funnel";
import {
  INTERNAL_BOOSTED_NUMBERS_KEY,
  readBoostedNumbers,
} from "@/lib/exam-scoring/report-bridge";

export const BOOST_OPERATION = "EXAM_ANALYSIS_BOOST" as const;

/** 게이트 CAS 재시도 횟수(무관한 version 증가와의 경합 흡수). */
const GATE_ATTEMPTS = 3;

/** aiMeta.boost 진행 기록 — 이 라우트만 쓰고 읽는다(다른 키는 보존 병합). */
export interface BoostMeta {
  status: "RUNNING" | "DONE" | "FAILED";
  startedAt: number;
  staffId: string;
  jobId?: string;
  completedAt?: number;
  boostedCount?: number;
  failedNumbers?: string[];
  chargedCredits?: number;
  refundedCredits?: number;
  usage?: { calls: number; promptTokens: number; completionTokens: number };
  error?: string;
  /** v4 — 배치 커밋마다 갱신(목록 funnel.boost.completed/total 의 근거). */
  progress?: { completed: number; total: number };
  /** v4 — 문항 보강은 됐으나 examLevel 종합이 실패(총평 없음·DONE 유지). */
  synthFailed?: boolean;
  /** v4 — 이번 실행이 종합 전용(0 cr, 배치 미실행)이었음. */
  synthOnly?: boolean;
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/** RUNNING 이면서 BOOST_STALE_MS 안(= 실제로 돌고 있을 수 있음). */
export function isFreshRunning(boost: Record<string, unknown>, now: number): boolean {
  if (boost.status !== "RUNNING") return false;
  const startedAt = typeof boost.startedAt === "number" ? boost.startedAt : 0;
  return now - startedAt < BOOST_STALE_MS;
}

/**
 * 이전 boost 기록에서 다음 기록으로 이월할 수 있는 필드만 형 검증해 뽑는다
 * (synthOnly 실행이 직전 문항 보강의 과금·성공 수를 지우지 않도록). status·error·
 * synthFailed·progress 는 이월하지 않는다 — 새 실행이 다시 정한다.
 */
export function carryPriorBoost(prior: Record<string, unknown>): Partial<BoostMeta> {
  const out: Partial<BoostMeta> = {};
  if (typeof prior.jobId === "string") out.jobId = prior.jobId;
  if (typeof prior.boostedCount === "number") out.boostedCount = prior.boostedCount;
  if (Array.isArray(prior.failedNumbers)) {
    out.failedNumbers = prior.failedNumbers.filter((n): n is string => typeof n === "string");
  }
  if (typeof prior.chargedCredits === "number") out.chargedCredits = prior.chargedCredits;
  if (typeof prior.refundedCredits === "number") out.refundedCredits = prior.refundedCredits;
  const usage = asRecord(prior.usage);
  if (
    typeof usage.calls === "number" &&
    typeof usage.promptTokens === "number" &&
    typeof usage.completionTokens === "number"
  ) {
    out.usage = {
      calls: usage.calls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    };
  }
  return out;
}

/**
 * 성공 문항만 perQuestion 에 병합하고 aiMeta.boost 를 기록한다(version CAS 3회).
 * analyses 가 비고 examLevel 도 없으면(실패 마감) analysis 컬럼은 건드리지 않고
 * aiMeta 만 갱신 — 관대 파스 재직렬화로 기존 분석을 불필요하게 다시 쓰지 않는다.
 * examLevel 이 주어지면(종합 성공 — 문항 병합 없이 synthOnly 로 온 경우 포함) 함께
 * 저장, undefined 면 기존 값 보존.
 */
export async function writeBoostResult(opts: {
  analysisId: string;
  academyId: string;
  analyses: QuestionAnalysis[];
  boost: BoostMeta;
  examLevel?: ExamLevelAnalysis;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.examAnalysis.findFirst({
      where: { id: opts.analysisId, academyId: opts.academyId, deletedAt: null },
      select: { analysis: true, aiMeta: true, version: true },
    });
    if (!row) return false;

    const aiMeta: Record<string, unknown> = { ...asRecord(row.aiMeta), boost: opts.boost };
    let data: Prisma.ExamAnalysisUpdateManyMutationInput = {
      aiMeta: toJson(aiMeta),
      version: { increment: 1 },
    };
    if (opts.analyses.length > 0 || opts.examLevel) {
      const prior = parseExamAnalysisResult(row.analysis) ?? { perQuestion: [], examLevel: null };
      const perQuestion = prior.perQuestion.map((q) => ({ ...q }));
      for (const analysis of opts.analyses) {
        const key = numberKey(analysis.number);
        const index = perQuestion.findIndex((item) => numberKey(item.number) === key);
        if (index >= 0) perQuestion[index] = analysis;
        else perQuestion.push(analysis);
      }
      if (opts.analyses.length > 0) {
        // 보강 완료 번호를 aiMeta.boostedNumbers 에 누적 기록(기존 ∪ 이번 배치).
        // 이후 syncInternalAnalysisForExam 재동기화의 mergePreservingBoost 가 이 번호들의
        // 보강분을 결정론 합성본으로 되돌리지 않도록 보존하는 근거다(과금-데이터 정합).
        // 살아있는 문항(perQuestion)으로 정리해 삭제된 번호는 흘려보낸다.
        const boostedNumbers = readBoostedNumbers(row.aiMeta);
        for (const analysis of opts.analyses) boostedNumbers.add(analysis.number.trim());
        const liveNumbers = new Set(perQuestion.map((q) => q.number.trim()));
        aiMeta[INTERNAL_BOOSTED_NUMBERS_KEY] = [...boostedNumbers].filter((n) =>
          liveNumbers.has(n),
        );
      }
      data = {
        ...data,
        aiMeta: toJson(aiMeta),
        analysis: toJson({ perQuestion, examLevel: opts.examLevel ?? prior.examLevel }),
      };
    }

    const write = await prisma.examAnalysis.updateMany({
      where: {
        id: opts.analysisId,
        academyId: opts.academyId,
        deletedAt: null,
        version: row.version,
      },
      data,
    });
    if (write.count === 1) return true;
    // CAS 충돌 — 신선한 스냅샷으로 재시도(병합은 멱등 upsert).
  }
  return false;
}

/**
 * 배치 진행률만 aiMeta.boost.progress 에 기록한다(version CAS 3회, v4).
 * 실패해도 절대 throw 하지 않는다 — 진행 기록은 카드 글로우용 부수 효과이고, 이것
 * 때문에 과금된 분석이 죽으면 안 된다. boost.status 가 이미 RUNNING 이 아니면
 * (다른 종료 경로가 먼저 닫음) 덮어쓰지 않는다.
 */
export async function writeBoostProgress(opts: {
  analysisId: string;
  academyId: string;
  progress: { completed: number; total: number };
}): Promise<void> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await prisma.examAnalysis.findFirst({
        where: { id: opts.analysisId, academyId: opts.academyId, deletedAt: null },
        select: { aiMeta: true, version: true },
      });
      if (!row) return;
      const aiMeta = asRecord(row.aiMeta);
      const boost = asRecord(aiMeta.boost);
      if (boost.status !== "RUNNING") return;
      const write = await prisma.examAnalysis.updateMany({
        where: {
          id: opts.analysisId,
          academyId: opts.academyId,
          deletedAt: null,
          version: row.version,
        },
        data: {
          aiMeta: toJson({ ...aiMeta, boost: { ...boost, progress: opts.progress } }),
          version: { increment: 1 },
        },
      });
      if (write.count === 1) return;
      // CAS 충돌 — 재조회 후 재시도(3회 소진 시 이번 틱만 생략, 다음 배치가 갱신).
    }
  } catch (err) {
    console.error("[analysis-boost] progress write failed", err);
  }
}

/**
 * 시험지 단위 RUNNING 게이트 — 이 시험지의 **모든** INTERNAL 분석 행(휴지통 포함)에서
 * 신선한 RUNNING 이 하나라도 있으면 true. 삭제된 행을 포함하는 이유: 보강 도중 행이
 * 삭제되고 sync 가 새 행을 만들면, 새 행만 보는 게이트는 두 번째 보강을 통과시켜
 * 같은 시험지를 이중 과금한다.
 */
export async function hasFreshRunningBoostForExam(
  examId: string,
  academyId: string,
  now: number,
): Promise<boolean> {
  const rows = await prisma.examAnalysis.findMany({
    where: { sourceExamId: examId, academyId, sourceType: "INTERNAL" },
    select: { aiMeta: true },
  });
  return rows.some((row) => isFreshRunning(asRecord(asRecord(row.aiMeta).boost), now));
}

export type BoostGateResult =
  | { ok: true }
  | { ok: false; code: "ALREADY_RUNNING" | "GATE_CONFLICT" | "NOT_FOUND" };

/**
 * RUNNING 게이트 CAS(3회). 매 시도마다 aiMeta/version 을 새로 읽어 신선한 RUNNING 이
 * 보이면 ALREADY_RUNNING, CAS 가 3회 모두 빗나가면 GATE_CONFLICT(무관한 쓰기 폭주 —
 * 클라는 잠시 후 재시도). 행이 없거나 삭제됐으면 NOT_FOUND.
 */
export async function acquireBoostGate(opts: {
  analysisId: string;
  academyId: string;
  running: BoostMeta;
}): Promise<BoostGateResult> {
  for (let attempt = 0; attempt < GATE_ATTEMPTS; attempt++) {
    const row = await prisma.examAnalysis.findFirst({
      where: { id: opts.analysisId, academyId: opts.academyId, deletedAt: null },
      select: { aiMeta: true, version: true },
    });
    if (!row) return { ok: false, code: "NOT_FOUND" };
    const meta = asRecord(row.aiMeta);
    if (isFreshRunning(asRecord(meta.boost), Date.now())) {
      return { ok: false, code: "ALREADY_RUNNING" };
    }
    const gate = await prisma.examAnalysis.updateMany({
      where: {
        id: opts.analysisId,
        academyId: opts.academyId,
        deletedAt: null,
        version: row.version,
      },
      data: {
        aiMeta: toJson({ ...meta, boost: opts.running }),
        version: { increment: 1 },
      },
    });
    if (gate.count === 1) return { ok: true };
    // version 경합(학생 제출 → sync 등) — 재판독 후 재시도.
  }
  return { ok: false, code: "GATE_CONFLICT" };
}

/**
 * 좀비 실행 정산 — 직전 boost 가 RUNNING 인데 BOOST_STALE_MS 를 넘겼고 잡이 아직
 * PROCESSING 이면: 그 잡의 과금 트랜잭션을 전액 환불(refundCredits 는 사유 단위 멱등·
 * 잔여 환불 가능액 캡)하고 잡을 FAILED 로 닫는다. 어떤 실패도 throw 하지 않는다 —
 * 정산 실패가 새 실행을 막으면 강사는 영원히 재시도할 수 없다(로그만 남긴다).
 */
export async function reconcileStaleBoostRun(opts: {
  priorBoost: Record<string, unknown>;
  academyId: string;
  now: number;
}): Promise<void> {
  const { priorBoost } = opts;
  if (priorBoost.status !== "RUNNING" || isFreshRunning(priorBoost, opts.now)) return;
  const jobId = typeof priorBoost.jobId === "string" ? priorBoost.jobId : null;
  if (!jobId) return;
  try {
    const job = await prisma.workbenchAiJob.findFirst({
      where: { id: jobId, academyId: opts.academyId },
      select: { id: true, status: true, creditTxId: true, requestedCount: true },
    });
    if (!job || job.status !== "PROCESSING") return;
    let refunded = 0;
    if (job.creditTxId) {
      try {
        refunded = await refundCredits(
          opts.academyId,
          BOOST_OPERATION,
          job.creditTxId,
          "보강 응답 유실 — 전액 환불",
        );
      } catch (refundErr) {
        console.error("[analysis-boost] stale-run refund failed", { jobId }, refundErr);
      }
    }
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: job.requestedCount ?? 0,
        errorMessage: "Boost response lost (stale RUNNING gate reconciled on next fire)",
        result: toJson({ staleReconciledAt: opts.now, refundedCredits: refunded }),
        completedAt: new Date(),
      },
    });
    console.warn("[analysis-boost] stale run reconciled", { jobId, refunded });
  } catch (err) {
    console.error("[analysis-boost] stale-run reconcile failed", { jobId }, err);
  }
}
