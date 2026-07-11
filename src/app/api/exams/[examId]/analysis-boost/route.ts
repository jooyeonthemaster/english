// ============================================================================
// POST /api/exams/[examId]/analysis-boost — 자체 시험지 AI 심층분석 보강 (W6)
//
// FAST 인라인 관례(exam-report generate/route.ts 미러):
//   requireStaff → exam 로드(테넌트 가드·KOREAN 거부) → 살아있는 문항 N 확정 →
//   syncInternalAnalysisForExam(W2)로 INTERNAL ExamAnalysis 보장 →
//   aiMeta.boost RUNNING 게이트(version CAS — 진행중 중복 409. 완료 후 재실행은
//   재과금·재분석 허용: 강사가 원해서 다시 누른 것) →
//   WorkbenchAiJob(domain EXAM_ANALYSIS_BOOST) + ensureWorkbenchAiJobCharged
//   (N × EXAM_ANALYSIS_BOOST=1cr, 402 → 게이트 원복 + 잡 FAILED) →
//   runExamAnalysisBoost(텍스트 8문항/배치) → 성공 문항만 perQuestion 병합 저장
//   (aiMeta.boost 기록, version CAS 3회) →
//   부분실패 비례 환불 · 전량실패 전액 환불(generate 환불 패턴 미러) →
//   응답 { ok, boostedCount, failedNumbers, chargedCredits }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { InsufficientCreditsError, refundCredits } from "@/lib/credits";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { parseExamAnalysisResult } from "@/lib/exam-report/schemas";
import { createExamReportUsage } from "@/lib/exam-report/llm";
import type { QuestionAnalysis } from "@/lib/exam-report/types";
import {
  EXAM_ANALYSIS_BOOST_JOB_DOMAIN,
  runExamAnalysisBoost,
  type BoostQuestionInput,
} from "@/lib/exam-scoring/boost";
import {
  INTERNAL_BOOSTED_NUMBERS_KEY,
  readBoostedNumbers,
  syncInternalAnalysisForExam,
} from "@/lib/exam-scoring/report-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 라우트 시작 기준 데드라인 여유(마감 30s 전 컷 — 병합 저장·환불·잡 마감 몫). */
const DEADLINE_MARGIN_MS = 30_000;
/** RUNNING 게이트 좀비 판정 — maxDuration(300s) + 60s 여유. 이후엔 재실행 허용. */
const BOOST_STALE_MS = 360_000;
const OPERATION = "EXAM_ANALYSIS_BOOST" as const;
/** 문항당 단가(=1cr). 텍스트 배치라 vision 프로브 최소 15문항 floor 없음. */
const UNIT_COST = CREDIT_COSTS.EXAM_ANALYSIS_BOOST;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/** aiMeta.boost 진행 기록 — 이 라우트만 쓰고 읽는다(다른 키는 보존 병합). */
interface BoostMeta {
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
}

/**
 * 성공 문항만 perQuestion 에 병합하고 aiMeta.boost 를 기록한다(version CAS 3회).
 * analyses 가 비면(실패 마감) analysis 컬럼은 건드리지 않고 aiMeta 만 갱신 —
 * 관대 파스 재직렬화로 기존 분석을 불필요하게 다시 쓰는 것을 피한다.
 */
async function writeBoostResult(opts: {
  analysisId: string;
  academyId: string;
  analyses: QuestionAnalysis[];
  boost: BoostMeta;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.examAnalysis.findFirst({
      where: { id: opts.analysisId, academyId: opts.academyId },
      select: { analysis: true, aiMeta: true, version: true },
    });
    if (!row) return false;

    const aiMeta: Record<string, unknown> = { ...asRecord(row.aiMeta), boost: opts.boost };
    let data: Prisma.ExamAnalysisUpdateManyMutationInput = {
      aiMeta: toJson(aiMeta),
      version: { increment: 1 },
    };
    if (opts.analyses.length > 0) {
      const prior = parseExamAnalysisResult(row.analysis) ?? { perQuestion: [], examLevel: null };
      const perQuestion = prior.perQuestion.map((q) => ({ ...q }));
      for (const analysis of opts.analyses) {
        const key = numberKey(analysis.number);
        const index = perQuestion.findIndex((item) => numberKey(item.number) === key);
        if (index >= 0) perQuestion[index] = analysis;
        else perQuestion.push(analysis);
      }
      // 보강 완료 번호를 aiMeta.boostedNumbers 에 누적 기록(기존 ∪ 이번 배치).
      // 이후 syncInternalAnalysisForExam 재동기화의 mergePreservingBoost 가 이 번호들의
      // 보강분을 결정론 합성본으로 되돌리지 않도록 보존하는 근거다(과금-데이터 정합).
      // 살아있는 문항(perQuestion)으로 정리해 삭제된 번호는 흘려보낸다.
      const boostedNumbers = readBoostedNumbers(row.aiMeta);
      for (const analysis of opts.analyses) boostedNumbers.add(analysis.number.trim());
      const liveNumbers = new Set(perQuestion.map((q) => q.number.trim()));
      aiMeta[INTERNAL_BOOSTED_NUMBERS_KEY] = [...boostedNumbers].filter((n) => liveNumbers.has(n));
      data = {
        ...data,
        aiMeta: toJson(aiMeta),
        analysis: toJson({ perQuestion, examLevel: prior.examLevel }),
      };
    }

    const write = await prisma.examAnalysis.updateMany({
      where: { id: opts.analysisId, academyId: opts.academyId, version: row.version },
      data,
    });
    if (write.count === 1) return true;
    // CAS 충돌 — 신선한 스냅샷으로 재시도(병합은 멱등 upsert).
  }
  return false;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const requestStartedAt = Date.now();

  if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) {
    return NextResponse.json(
      { error: "시험지 배포 기능이 비활성화되어 있습니다.", code: "FEATURE_DISABLED" },
      { status: 403 },
    );
  }

  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { examId } = await params;

  // ── 시험지 로드(테넌트 가드) + 살아있는 문항 확정 ─────────────────────────
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: auth.academyId },
    select: {
      id: true,
      title: true,
      subject: true,
      questions: {
        orderBy: { orderNum: "asc" },
        select: {
          orderNum: true,
          points: true,
          question: {
            select: {
              id: true,
              type: true,
              subType: true,
              questionText: true,
              options: true,
              correctAnswer: true,
              structuredData: true,
              deletedAt: true,
              passage: { select: { id: true, content: true } },
              explanation: { select: { content: true } },
            },
          },
        },
      },
    },
  });
  if (!exam) {
    return NextResponse.json(
      { error: "시험지를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  // KO 시험지 차단(설계 §6-7 — 액션+UI 이중 가드의 서버 축).
  if (exam.subject === "KOREAN") {
    return NextResponse.json(
      { error: "국어 시험지는 곧 지원됩니다.", code: "KO_UNSUPPORTED" },
      { status: 400 },
    );
  }

  // 살아있는(휴지통에 없는) 문항만 — 과금 N 과 분석 대상이 반드시 같은 집합.
  const liveLinks = exam.questions.filter((link) => link.question.deletedAt == null);
  const questionCount = liveLinks.length;
  if (questionCount === 0) {
    return NextResponse.json(
      { error: "분석할 문항이 없습니다. 시험지에 문항을 추가한 후 다시 시도해주세요.", code: "NO_QUESTIONS" },
      { status: 400 },
    );
  }
  const totalCost = questionCount * UNIT_COST;

  // ── INTERNAL ExamAnalysis 보장(W2 브리지) ──────────────────────────────────
  try {
    await syncInternalAnalysisForExam(exam.id);
  } catch (err) {
    return NextResponse.json(
      {
        error: "시험지 내부 분석을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.",
        code: "SYNC_FAILED",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const analysisRow = await prisma.examAnalysis.findFirst({
    where: {
      sourceExamId: exam.id,
      academyId: auth.academyId,
      sourceType: "INTERNAL",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, aiMeta: true, version: true },
  });
  if (!analysisRow) {
    return NextResponse.json(
      { error: "시험지 내부 분석 레코드가 없습니다.", code: "INTERNAL_ANALYSIS_MISSING" },
      { status: 500 },
    );
  }

  // ── 진행중 중복 실행 게이트(aiMeta.boost + version CAS) ────────────────────
  // 멱등 정책: 완료(DONE/FAILED) 후 재실행은 재과금·재분석 허용. RUNNING 만 409.
  const metaRecord = asRecord(analysisRow.aiMeta);
  const priorBoost = asRecord(metaRecord.boost);
  const priorStartedAt = typeof priorBoost.startedAt === "number" ? priorBoost.startedAt : 0;
  if (priorBoost.status === "RUNNING" && Date.now() - priorStartedAt < BOOST_STALE_MS) {
    return NextResponse.json(
      { error: "이미 심층분석 보강이 진행 중입니다.", code: "ALREADY_RUNNING" },
      { status: 409 },
    );
  }
  const runningBoost: BoostMeta = {
    status: "RUNNING",
    startedAt: requestStartedAt,
    staffId: auth.id,
  };
  const gate = await prisma.examAnalysis.updateMany({
    where: { id: analysisRow.id, academyId: auth.academyId, version: analysisRow.version },
    data: {
      aiMeta: toJson({ ...metaRecord, boost: runningBoost }),
      version: { increment: 1 },
    },
  });
  if (gate.count !== 1) {
    // 동시 요청이 먼저 게이트를 잡았다(또는 다른 쓰기와 경합) — 중복 실행 차단.
    return NextResponse.json(
      { error: "이미 심층분석 보강이 진행 중입니다.", code: "ALREADY_RUNNING" },
      { status: 409 },
    );
  }

  // ── 과금용 잡 생성 + 과금(N × 1cr, costOverride) ──────────────────────────
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: auth.academyId,
      createdById: auth.id,
      domain: EXAM_ANALYSIS_BOOST_JOB_DOMAIN,
      status: "PROCESSING",
      title: `AI 심층분석 보강 — ${exam.title}`,
      requestedCount: questionCount,
      startedAt: new Date(),
      config: {
        fastPath: true,
        examId: exam.id,
        examAnalysisId: analysisRow.id,
        questionCount,
      },
    },
  });

  let creditTxId: string | null = null;
  try {
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: auth.academyId,
      staffId: auth.id,
      operationType: OPERATION,
      metadata: {
        examId: exam.id,
        examAnalysisId: analysisRow.id,
        questionCount,
        unitCost: UNIT_COST,
        creditCost: totalCost,
        fastPath: true,
      },
      creditCost: totalCost,
    });
    creditTxId = credit.transactionId;
  } catch (err) {
    // 402/차감 실패 — 게이트 해제(FAILED) + 잡 FAILED. 환불 없음(차감 자체가 실패).
    await writeBoostResult({
      analysisId: analysisRow.id,
      academyId: auth.academyId,
      analyses: [],
      boost: {
        ...runningBoost,
        status: "FAILED",
        jobId: job.id,
        completedAt: Date.now(),
        error: "CHARGE_FAILED",
      },
    });
    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: questionCount,
          errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "크레딧이 부족합니다.", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: questionCount,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "심층분석 보강을 시작하지 못했습니다.", code: "CHARGE_FAILED" },
      { status: 500 },
    );
  }

  // ── 보강 실행 + 병합 저장 + 정산 ───────────────────────────────────────────
  try {
    const usage = createExamReportUsage();
    const boostInputs: BoostQuestionInput[] = liveLinks.map((link) => ({
      orderNum: link.orderNum,
      points: link.points,
      question: {
        id: link.question.id,
        type: link.question.type,
        subType: link.question.subType,
        questionText: link.question.questionText,
        options: link.question.options,
        correctAnswer: link.question.correctAnswer,
        structuredData: link.question.structuredData,
        passage: link.question.passage,
        explanation: link.question.explanation,
      },
    }));

    const outcome = await runExamAnalysisBoost({
      examTitle: exam.title,
      questions: boostInputs,
      deadlineAt: requestStartedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS,
      usage,
    });

    const boostedCount = outcome.analyses.length;
    const failedCount = outcome.failedNumbers.length;

    // 환불액: 부분실패 = 실패 문항 비례, 전량실패 = 전액(과금 원칙: 모델×실호출).
    const refundTarget = failedCount * UNIT_COST;
    let refundedCredits = 0;
    if (refundTarget > 0 && creditTxId) {
      try {
        await refundCredits(
          auth.academyId,
          OPERATION,
          creditTxId,
          boostedCount === 0
            ? "AI 심층분석 보강 전량 실패 — 전액 환불"
            : `AI 심층분석 보강 부분 실패(${failedCount}/${questionCount}문항) — 비례 환불`,
          refundTarget,
        );
        refundedCredits = refundTarget;
      } catch (refundErr) {
        console.error("[analysis-boost] refund failed", refundErr);
      }
    }
    const chargedCredits = totalCost - refundedCredits;

    const finalBoost: BoostMeta = {
      status: boostedCount > 0 ? "DONE" : "FAILED",
      startedAt: requestStartedAt,
      staffId: auth.id,
      jobId: job.id,
      completedAt: Date.now(),
      boostedCount,
      failedNumbers: outcome.failedNumbers,
      chargedCredits,
      refundedCredits,
      usage: {
        calls: outcome.usage.calls,
        promptTokens: outcome.usage.promptTokens,
        completionTokens: outcome.usage.completionTokens,
      },
      ...(boostedCount === 0 ? { error: "ALL_BATCHES_FAILED" } : {}),
    };
    const saved = await writeBoostResult({
      analysisId: analysisRow.id,
      academyId: auth.academyId,
      analyses: outcome.analyses,
      boost: finalBoost,
    });
    if (boostedCount > 0 && !saved) {
      // 분석은 나왔지만 CAS 3회 모두 충돌 — 결과를 버리고 전액 환불(과금 정합 우선).
      // 보강은 멱등 재실행 가능하므로 강사가 다시 누르면 된다.
      throw new Error("BOOST_WRITE_CONFLICT: analysis merge failed after 3 CAS attempts");
    }

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: boostedCount === 0 ? "FAILED" : failedCount > 0 ? "PARTIAL" : "COMPLETED",
        successCount: boostedCount,
        failedCount,
        resultCount: boostedCount,
        result: toJson({
          examId: exam.id,
          examAnalysisId: analysisRow.id,
          boostedCount,
          failedNumbers: outcome.failedNumbers,
          refundedCredits,
          usage: outcome.usage,
          fastPath: true,
          totalRunMs: Date.now() - requestStartedAt,
        }),
        ...(boostedCount === 0 ? { errorMessage: "All boost batches failed" } : {}),
        completedAt: new Date(),
      },
    });

    if (boostedCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          boostedCount: 0,
          failedNumbers: outcome.failedNumbers,
          chargedCredits,
          error: "일시적인 문제로 심층분석을 완성하지 못했습니다. 크레딧은 환불되었습니다. 잠시 후 다시 시도해주세요.",
          code: "BOOST_FAILED",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      boostedCount,
      failedNumbers: outcome.failedNumbers,
      chargedCredits,
    });
  } catch (err) {
    // 예기치 못한 실패(병합 CAS 소진 포함) — 전액 환불 + 게이트 FAILED + 잡 FAILED.
    let refundedCredits = 0;
    if (creditTxId) {
      try {
        await refundCredits(
          auth.academyId,
          OPERATION,
          creditTxId,
          "AI 심층분석 보강 실패 — 전액 환불",
          totalCost,
        );
        refundedCredits = totalCost;
      } catch (refundErr) {
        console.error("[analysis-boost] refund failed", refundErr);
      }
    }
    await writeBoostResult({
      analysisId: analysisRow.id,
      academyId: auth.academyId,
      analyses: [],
      boost: {
        status: "FAILED",
        startedAt: requestStartedAt,
        staffId: auth.id,
        jobId: job.id,
        completedAt: Date.now(),
        boostedCount: 0,
        chargedCredits: totalCost - refundedCredits,
        refundedCredits,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      },
    });
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: questionCount,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    return NextResponse.json(
      {
        ok: false,
        boostedCount: 0,
        failedNumbers: [],
        chargedCredits: totalCost - refundedCredits,
        error: "일시적인 문제로 심층분석을 완성하지 못했습니다. 크레딧은 환불되었습니다. 잠시 후 다시 시도해주세요.",
        code: "BOOST_FAILED",
      },
      { status: 502 },
    );
  }
}
