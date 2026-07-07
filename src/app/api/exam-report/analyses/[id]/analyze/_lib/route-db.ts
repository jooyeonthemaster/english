// ============================================================================
// analyze 라우트 DB 헬퍼 — 잡 펜싱(A2·A3)·체크포인트 병합 저장(A4·A5)·과금 경계.
// route.ts 슬림화용 분할(부수효과 있음 — 순수 헬퍼는 route-helpers.ts).
// ============================================================================

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { deductCredits, InsufficientCreditsError } from "@/lib/credits";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { EXAM_ANALYSIS_STALE_MS } from "@/lib/exam-report/reconcile";
import { parseExamAnalysisResult, parseExamMap } from "@/lib/exam-report/schemas";
import type { AnalyzeCheckpoint } from "@/lib/exam-report/exam-analyze-direct";
import type { ExamAnalysisProgress } from "@/lib/exam-report/types";
import {
  mergeAiMeta,
  mergeAnswersIntoExamMap,
  mergeCheckpointIntoDb,
  numberKey,
  rawObject,
  toJson,
} from "./route-helpers";

/** 마지막 잡 활동이 이 시간 이내면 활성 실행으로 보고 재개를 거부한다(A3). */
export const ACTIVE_RUN_FRESH_MS = 15_000;

/** 배치 커밋 중 잡 펜스(startedAt) CAS 실패 — 다른 실행이 실행권을 가져감. */
export class FenceLostError extends Error {}

/** 202 — 다른 실행이 진행 중. 클라는 {resume} 없이 break 후 폴링을 유지한다. */
export function inProgressResponse(): NextResponse {
  return NextResponse.json(
    { inProgress: true, status: "ANALYZING" },
    { status: 202 },
  );
}

/** 실행권 펜스 — 잡 startedAt 을 토큰으로 쓰는 CAS 소유권(A2·A3). */
export interface JobFence {
  jobId: string;
  token: Date;
}

/** 펜스 갱신(리퍼 10분컷 회피 + 탈취 감지) — 상실 시 FenceLostError. */
export async function renewJobFence(fence: JobFence): Promise<void> {
  const nextToken = new Date();
  const fenced = await prisma.workbenchAiJob.updateMany({
    where: { id: fence.jobId, status: "PROCESSING", startedAt: fence.token },
    data: { startedAt: nextToken },
  });
  if (fenced.count !== 1) throw new FenceLostError();
  fence.token = nextToken;
}

/** 펜스 보유 상태에서만 잡 종결 전이(COMPLETED/FAILED) — 성공 여부 반환. */
export async function casJobFinish(
  fence: JobFence,
  data: Prisma.WorkbenchAiJobUpdateManyMutationInput,
): Promise<boolean> {
  const result = await prisma.workbenchAiJob
    .updateMany({
      where: { id: fence.jobId, status: "PROCESSING", startedAt: fence.token },
      data,
    })
    .catch(() => ({ count: 0 }));
  return result.count === 1;
}

/** 실행권 반납(yield) — startedAt null → 다음 재개가 15s 게이트 없이 진입. */
export async function yieldJobFence(fence: JobFence): Promise<void> {
  await prisma.workbenchAiJob
    .updateMany({
      where: { id: fence.jobId, status: "PROCESSING", startedAt: fence.token },
      data: { startedAt: null },
    })
    .catch(() => {});
}

export async function jobStatusNow(jobId: string): Promise<string | null> {
  const job = await prisma.workbenchAiJob
    .findUnique({ where: { id: jobId }, select: { status: true } })
    .catch(() => null);
  return job?.status ?? null;
}

/**
 * 시도 대상 0 + 종합 존재(alreadyAnalyzed)인데 status 가 DRAFT/FAILED 로 남아
 * 있으면 ANALYZED 로 자기치유 — 재시도 CTA 가 영원히 no-op 되는 것을 방지.
 */
export async function selfHealAnalyzedStatus(
  analysisId: string,
  academyId: string,
  priorStatus: string,
): Promise<string> {
  if (priorStatus === "ANALYZED" || priorStatus === "ANALYZING") {
    return priorStatus;
  }
  const healed = await prisma.examAnalysis.updateMany({
    where: {
      id: analysisId,
      academyId,
      deletedAt: null,
      status: { in: ["DRAFT", "FAILED"] },
    },
    data: { status: "ANALYZED", version: { increment: 1 } },
  });
  return healed.count === 1 ? "ANALYZED" : priorStatus;
}

// ── 재개 게이트(A3) ─────────────────────────────────────────────────────────

export type ResumeGate =
  | { kind: "conflict" }
  | { kind: "inProgress" }
  | { kind: "ok"; fence: JobFence };

/**
 * 재개 진입 펜싱 — 잡이 신선하지 않으면 conflict(409), yield 되지 않은 채
 * 15초 이내 활동이 있으면 활성 실행으로 보고 inProgress(202), 그 외에는
 * updatedAt 불변 조건 CAS 로 실행권 1개만 획득한다.
 */
export async function acquireResumeFence(
  existingJob: { id: string; updatedAt: Date; startedAt: Date | null } | null,
): Promise<ResumeGate> {
  const now = Date.now();
  if (
    !existingJob ||
    now - existingJob.updatedAt.getTime() >= EXAM_ANALYSIS_STALE_MS
  ) {
    return { kind: "conflict" };
  }
  const yielded = existingJob.startedAt == null;
  if (!yielded && now - existingJob.updatedAt.getTime() < ACTIVE_RUN_FRESH_MS) {
    return { kind: "inProgress" };
  }
  const token = new Date();
  const grabbed = await prisma.workbenchAiJob.updateMany({
    where: {
      id: existingJob.id,
      status: "PROCESSING",
      updatedAt: existingJob.updatedAt,
    },
    data: { startedAt: token },
  });
  if (grabbed.count !== 1) return { kind: "inProgress" };
  return { kind: "ok", fence: { jobId: existingJob.id, token } };
}

// ── 체크포인트 저장(A4·A5) ──────────────────────────────────────────────────

export interface CheckpointWriteOptions {
  status?: "ANALYZED" | "FAILED";
  /** 지정 시 DB 본 aiMeta 에 usage 누적(mergeAiMeta) + aiMetaExtra 기록 */
  usagePatch?: Parameters<typeof mergeAiMeta>[1];
  aiMetaExtra?: Record<string, unknown>;
}

/**
 * DB 재조회 후 이번 실행 attempted 문항만 병합해 저장하는 커밋터 —
 * 병렬 편집 보존(A5) + version 증가(A4) + aiMeta.runStartedAt 갱신(A8).
 * v3.1: E1b 가 도출한 정답(cp.answers)을 structure(examMap)에도 병합해 함께 저장한다
 * (attempted 문항의 정답 필드만; 배점·유형 등 강사 인라인 수정은 불가침).
 * v3.2: 배치 커밋마다 aiMeta.progress(실제 진행률 스냅샷)를 갱신하고, jobId 지정 시
 * 잡 행 진행률(successCount/resultCount)도 동기화한다 — 목록/큐 카드/워크스페이스의
 * 진행률·ETA 단일 소스. 기존 호출부 호환: 신규 파라미터는 전부 옵션.
 */
export function createCheckpointWriter(opts: {
  analysisId: string;
  attemptedKeySet: ReadonlySet<string>;
  /**
   * successCount 집계 범위 키(병합 후 OK 수 기준). 전체 실행은 examMap 전 문항,
   * 문항단위 실행은 지정 문항 — attempted 한정으로 세면 자가연쇄 다라운드에서
   * 라운드 전환 시 successCount 가 역행(8→2)하고 완주해도 과소표기된다(검수 MEDIUM).
   * 미지정 시 기존 기준(attemptedKeySet) 폴백(호출부 호환).
   */
  successScopeKeys?: ReadonlySet<string>;
  /** 진행률 total 폴백 — DB structure(examMap) 파스 실패 시에만 사용 */
  totalQuestions?: number;
  /** msPerQuestion 실측 기준 — 이번 라운드 시작 시각(epoch ms) */
  runStartedAtMs?: number;
  /**
   * 잡 행 진행률 동기화 대상. 커밋터는 펜스 소유 흐름(renewJobFence 직후)에서만
   * 호출되고, PROCESSING 조건 updateMany 라 종결 잡(리퍼 FAILED·완료 COMPLETED)은
   * 건드리지 않는다 — 리퍼/종결 CAS 와 경합 안전.
   */
  jobId?: string;
}) {
  return async (
    cp: AnalyzeCheckpoint,
    write?: CheckpointWriteOptions,
  ): Promise<void> => {
    const row = await prisma.examAnalysis.findUnique({
      where: { id: opts.analysisId },
      select: { analysis: true, aiMeta: true, structure: true },
    });
    const dbExamMap = parseExamMap(row?.structure);
    const merged = mergeCheckpointIntoDb({
      dbAnalysis: parseExamAnalysisResult(row?.analysis),
      checkpoint: cp,
      attemptedKeys: opts.attemptedKeySet,
    });
    // E1b 도출 정답 → examMap 병합(structure 컬럼). null(examMap 부재)이면 미변경.
    const mergedMap = mergeAnswersIntoExamMap({
      dbExamMap,
      answers: cp.answers,
      attemptedKeys: opts.attemptedKeySet,
    });

    // ── 진행률 스냅샷 — 병합 후 실제 판정(perQuestion 존재) 수 기준(가짜 % 금지) ──
    const judgedKeys = new Set(merged.perQuestion.map((q) => numberKey(q.number)));
    const total =
      dbExamMap?.questions.length ?? opts.totalQuestions ?? merged.perQuestion.length;
    const completed = dbExamMap
      ? dbExamMap.questions.filter((q) => judgedKeys.has(numberKey(q.number))).length
      : Math.min(merged.perQuestion.length, total);
    const progress: ExamAnalysisProgress = { completed, total, updatedAt: Date.now() };
    if (opts.runStartedAtMs) {
      // 이번 라운드 실측: 경과시간 / 이번 실행 "신규" 판정 수. cp.perQuestion 에는
      // prior 판정(이전 라운드 커밋분)까지 실릴 수 있어 그대로 나누면 분모 오염으로
      // msPerQuestion 이 과소 산출 → ETA 왜곡(검수 MEDIUM) — attemptedKeySet 소속만
      // 센다. 기존값과 평균(지수평활)으로 라운드 간 튐 완화 — 0/음수 방지.
      const newlyJudged = cp.perQuestion.filter((q) =>
        opts.attemptedKeySet.has(numberKey(q.number)),
      ).length;
      const rawMs = Math.max(
        1,
        Math.round((Date.now() - opts.runStartedAtMs) / Math.max(1, newlyJudged)),
      );
      const prevMs = rawObject(rawObject(row?.aiMeta).progress).msPerQuestion;
      progress.msPerQuestion =
        typeof prevMs === "number" && Number.isFinite(prevMs) && prevMs > 0
          ? Math.round((prevMs + rawMs) / 2)
          : rawMs;
    }

    const aiMeta = write?.usagePatch
      ? {
          ...mergeAiMeta(row?.aiMeta, {
            ...write.usagePatch,
            extra: write.aiMetaExtra,
          }),
          progress,
        }
      : { ...rawObject(row?.aiMeta), runStartedAt: Date.now(), progress };
    await prisma.examAnalysis.update({
      where: { id: opts.analysisId },
      data: {
        ...(write?.status ? { status: write.status } : {}),
        analysis: toJson(merged),
        ...(mergedMap ? { structure: toJson(mergedMap) } : {}),
        aiMeta: toJson(aiMeta),
        version: { increment: 1 },
      },
    });

    // ── 잡 행 진행률 동기화 — successCount=집계 범위(successScopeKeys) 중 병합 후 OK,
    // resultCount=판정 총수. 실패해도 체크포인트 커밋은 이미 완료(진행률은 다음 커밋이
    // 따라잡음) — 무해 무시.
    if (opts.jobId) {
      const scope = opts.successScopeKeys ?? opts.attemptedKeySet;
      const okCount = merged.perQuestion.filter(
        (q) => scope.has(numberKey(q.number)) && q.analysisStatus === "OK",
      ).length;
      await prisma.workbenchAiJob
        .updateMany({
          where: { id: opts.jobId, status: "PROCESSING" },
          data: { successCount: okCount, resultCount: merged.perQuestion.length },
        })
        .catch(() => {});
    }
  };
}

// ── 과금 경계 ───────────────────────────────────────────────────────────────

/** 신규 실행 과금 — 실패 시 status 원복 + 잡 FAILED + 402/500 응답 생성. */
export async function chargeNewRun(opts: {
  jobId: string;
  analysisId: string;
  academyId: string;
  staffId: string;
  priorStatus: string;
  cost: number;
  metadata: Record<string, unknown>;
}): Promise<
  { ok: true; creditTxId: string } | { ok: false; response: NextResponse }
> {
  try {
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: opts.jobId,
      academyId: opts.academyId,
      staffId: opts.staffId,
      operationType: "EXAM_ANALYSIS",
      metadata: opts.metadata,
      creditCost: opts.cost,
    });
    return { ok: true, creditTxId: credit.transactionId };
  } catch (err) {
    await prisma.examAnalysis
      .updateMany({
        where: {
          id: opts.analysisId,
          academyId: opts.academyId,
          status: "ANALYZING",
        },
        data: { status: opts.priorStatus, version: { increment: 1 } },
      })
      .catch(() => {});
    await prisma.workbenchAiJob
      .update({
        where: { id: opts.jobId },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: "크레딧 부족",
          completedAt: new Date(),
        },
      })
      .catch(() => {});
    if (err instanceof InsufficientCreditsError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "크레딧이 부족합니다.",
            code: "INSUFFICIENT_CREDITS",
            balance: err.currentBalance,
            required: err.requiredCredits,
          },
          { status: 402 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: "크레딧 처리 중 오류가 발생했습니다.", code: "CREDIT_ERROR" },
        { status: 500 },
      ),
    };
  }
}

/**
 * 리퍼 선점(FAILED+전액환불) 후 완료 도달 — 순액(원청구-실패환불분) 재청구.
 * ensureWorkbenchAiJobCharged 는 잡 creditTxId 기존재로 no-op 이라 재청구가
 * 불가능해 deductCredits 로 신규 청구한다. 실패 여부만 보고(결과 저장은 호출부).
 */
export async function rechargeAfterStaleReap(opts: {
  academyId: string;
  staffId: string;
  analysisId: string;
  jobId: string;
  creditTxId: string | null;
  failedBillableCount: number;
}): Promise<{ rechargeFailed: boolean }> {
  try {
    if (!opts.creditTxId) return { rechargeFailed: false };
    const tx = await prisma.creditTransaction.findUnique({
      where: { id: opts.creditTxId },
      select: { amount: true },
    });
    const originalCost = tx ? Math.abs(tx.amount) : 0;
    const rechargeCost = Math.max(0, originalCost - opts.failedBillableCount);
    if (rechargeCost > 0) {
      await deductCredits(
        opts.academyId,
        "EXAM_ANALYSIS",
        opts.staffId,
        {
          examAnalysisId: opts.analysisId,
          jobId: opts.jobId,
          rechargeAfterStaleReap: true,
        },
        rechargeCost,
      );
    }
    return { rechargeFailed: false };
  } catch (e) {
    console.error("[exam-analyze] recharge after stale reap failed", e);
    return { rechargeFailed: true };
  }
}
