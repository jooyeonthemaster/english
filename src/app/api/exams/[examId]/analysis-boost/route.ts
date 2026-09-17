// ============================================================================
// POST /api/exams/[examId]/analysis-boost — 스모트 시험지 AI 시험 분석 (W6)
//
// FAST 인라인 관례(exam-report generate/route.ts 미러):
//   requireStaff → exam 로드(테넌트 가드·KOREAN/ARCHIVED 거부) → 살아있는 문항 N 확정 →
//   syncInternalAnalysisForExam(W2)로 INTERNAL ExamAnalysis 보장(반환 analysisId 로
//   행 고정 — sync 가 수렴하는 행(createdAt ASC)과 같은 행에 쓴다) →
//   시험지 단위 RUNNING 게이트(중복 INTERNAL 행·휴지통 행까지 — 진행중이면 409) →
//   좀비 정산(RUNNING 이 BOOST_STALE_MS 를 넘긴 채 잡이 PROCESSING 이면 전액 환불 +
//   잡 FAILED — 응답 유실 실행의 크레딧이 돌아오는 유일한 경로) →
//   [synthOnly] body {synthOnly:true} + 모든 살아있는 문항이 이미 boostedNumbers 에
//   있으면 잡·과금·배치를 전부 건너뛰고 examLevel 종합만 다시 한다(0 cr — 「문항은
//   다 됐는데 총평만 실패」를 N cr 재과금 없이 복구). 커버리지가 모자라면 플래그 무시 →
//   aiMeta.boost RUNNING 게이트(version CAS 3회 — 무관한 version 증가와의 경합은
//   409 가 아니라 재시도. 완료 후 재실행은 재과금·재분석 허용: 강사가 원해서 다시 누른 것) →
//   WorkbenchAiJob(domain EXAM_ANALYSIS_BOOST, 생성 실패 = 게이트 FAILED + 500) +
//   ensureWorkbenchAiJobCharged(N × EXAM_ANALYSIS_BOOST=1cr, 402 → 게이트 원복 + 잡 FAILED) →
//   runExamAnalysisBoost(텍스트 8문항/배치, 동시 3) — 배치 커밋마다 aiMeta.boost.
//   progress CAS 기록(v4: 카드 글로우 진행률의 근거·실패해도 실행은 계속) →
//   성공 문항 ≥1 이면 synthesizeExamLevel(E1c 공용 모듈, 1회 재시도)로 examLevel 생성
//   (v4 — INTERNAL 의 「총평 백지」(스펙 §0 F1~F3) 해소. 실패해도 perQuestion 저장은
//   유지하고 boost.synthFailed=true) → 성공 문항만 perQuestion 병합 + examLevel 저장
//   (aiMeta.boost 기록, version CAS 3회) →
//   부분실패 비례 환불 · 전량실패 전액 환불(generate 환불 패턴 미러 — 환불액은
//   refundCredits 의 **실환불 반환값**으로 누적, 부분 환불분은 예외 경로까지 이월) →
//   응답 { ok, boostedCount, failedNumbers, chargedCredits }
//
// 클라 계약(v4): fireBoostRequest 는 응답을 기다리지 않는다(fire-and-forget). 라우트는
// 완주 후 응답하지만 진행·완료는 목록 폴(funnel.boost)이 aiMeta 에서 읽는다 —
// 그래서 어떤 조기 return 도 클라 상태에 의존하지 않고, 모든 종료 경로가 aiMeta.boost
// 를 DONE/FAILED 로 닫는다(닫지 않으면 카드가 BOOST_STALE_MS 까지 글로우로 남는다).
// 영속 헬퍼 ./_lib/boost-store.ts · 잡+과금 ./_lib/boost-charge.ts · 종합 ./_lib/boost-synth.ts ·
// synthOnly 경로 ./_lib/synth-only.ts — 이 파일은 흐름만 든다.
// 정본: docs/exam-analysis-v4-spec.md §3 U2.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { refundCredits } from "@/lib/credits";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { createExamReportUsage } from "@/lib/exam-report/llm";
import type { ExamType } from "@/lib/exam-report/types";
import type { ExamReportMeta } from "@/lib/exam-report/prompts-shared";
import { runExamAnalysisBoost, type BoostQuestionInput } from "@/lib/exam-scoring/boost";
import { readBoostedNumbers, syncInternalAnalysisForExam } from "@/lib/exam-scoring/report-bridge";
import {
  BOOST_OPERATION,
  acquireBoostGate,
  asRecord,
  hasFreshRunningBoostForExam,
  reconcileStaleBoostRun,
  toJson,
  writeBoostProgress,
  writeBoostResult,
  type BoostMeta,
} from "./_lib/boost-store";
import { openBoostJobAndCharge } from "./_lib/boost-charge";
import { synthesizeBoostExamLevel } from "./_lib/boost-synth";
import { gateFailureResponse, readSynthOnlyFlag, runSynthOnly } from "./_lib/synth-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 라우트 시작 기준 데드라인 여유(마감 30s 전 컷 — 병합 저장·환불·잡 마감 몫). */
const DEADLINE_MARGIN_MS = 30_000;
/**
 * 문항 배치 마감 뒤 examLevel 종합(E1c 텍스트 1콜)에 남겨 두는 예산. 배치가 마감
 * 직전까지 예산을 다 쓰면 종합 콜이 시작도 못 하고 TIMEOUT 으로 죽어 「문항은 다
 * 됐는데 총평만 없음」이 재현된다 — 배치 마감을 이만큼 앞당긴다.
 */
const SYNTH_RESERVE_MS = 60_000;
/** 문항당 단가(=1cr). 텍스트 배치라 vision 프로브 최소 15문항 floor 없음. */
const UNIT_COST = CREDIT_COSTS.EXAM_ANALYSIS_BOOST;

const BOOST_FAILED_MESSAGE =
  "일시적인 문제로 AI 분석을 완성하지 못했습니다. 크레딧은 환불되었습니다. 잠시 후 다시 시도해주세요.";

/** ExamAnalysis.examType(문자열 컬럼) → ExamReportMeta.examType(관대 — 미상은 OTHER). */
function toExamType(value: string | null | undefined): ExamType {
  return value === "MIDTERM" || value === "FINAL" || value === "MOCK" ? value : "OTHER";
}

export async function POST(
  req: NextRequest,
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
  const synthOnlyRequested = await readSynthOnlyFlag(req);

  // ── 시험지 로드(테넌트 가드) + 살아있는 문항 확정 ─────────────────────────
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: auth.academyId },
    select: {
      id: true,
      title: true,
      subject: true,
      status: true,
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
  // 보관함 시험지 차단 — 목록 API 후보(loadCandidates)도 같은 경계로 걸러 카드가 없다.
  if (exam.status === "ARCHIVED") {
    return NextResponse.json(
      { error: "보관된 시험지는 분석할 수 없습니다. 보관을 해제한 후 다시 시도해주세요.", code: "EXAM_ARCHIVED" },
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

  // ── INTERNAL ExamAnalysis 보장(W2 브리지) — 반환 id 로 행 고정 ─────────────
  let analysisId: string;
  try {
    ({ analysisId } = await syncInternalAnalysisForExam(exam.id));
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
    where: { id: analysisId, academyId: auth.academyId, deletedAt: null },
    // examType/schoolName 은 examLevel 종합 입력. structure 는 여기서 읽지 않는다 —
    // 종합 단계(boost-synth)가 그 시점의 최신 지도를 analysis 와 함께 다시 읽는다.
    select: { id: true, aiMeta: true, examType: true, schoolName: true },
  });
  if (!analysisRow) {
    return NextResponse.json(
      { error: "시험지 내부 분석 레코드가 없습니다.", code: "INTERNAL_ANALYSIS_MISSING" },
      { status: 500 },
    );
  }
  const examMeta: ExamReportMeta = {
    title: exam.title,
    examType: toExamType(analysisRow.examType),
    ...(analysisRow.schoolName ? { schoolName: analysisRow.schoolName } : {}),
  };

  // ── 진행중 중복 실행 게이트(시험지 단위) + 좀비 정산 ───────────────────────
  // 멱등 정책: 완료(DONE/FAILED) 후 재실행은 재과금·재분석 허용. 신선한 RUNNING 만 409.
  const now = Date.now();
  if (await hasFreshRunningBoostForExam(exam.id, auth.academyId, now)) {
    return NextResponse.json(
      { error: "이미 AI 분석이 진행 중입니다.", code: "ALREADY_RUNNING" },
      { status: 409 },
    );
  }
  const priorBoost = asRecord(asRecord(analysisRow.aiMeta).boost);
  await reconcileStaleBoostRun({ priorBoost, academyId: auth.academyId, now });
  const routeDeadlineAt = requestStartedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS;

  // ── synthOnly(0 cr) — 이력이 있고 살아있는 문항 전부가 이미 보강돼 있을 때만 ──
  const priorStatus = priorBoost.status;
  const hasBoostHistory =
    priorStatus === "DONE" || priorStatus === "FAILED" || priorStatus === "RUNNING";
  if (synthOnlyRequested && hasBoostHistory) {
    const boosted = readBoostedNumbers(analysisRow.aiMeta);
    const covered = liveLinks.every((link) => boosted.has(String(link.orderNum)));
    if (covered) {
      return runSynthOnly({
        analysisId: analysisRow.id,
        academyId: auth.academyId,
        staffId: auth.id,
        priorBoost,
        questionCount,
        examMeta,
        requestStartedAt,
        routeDeadlineAt,
      });
    }
    // 커버리지 부족 — 플래그 무시, 정상 과금 경로.
  }

  const runningBoost: BoostMeta = {
    status: "RUNNING",
    startedAt: requestStartedAt,
    staffId: auth.id,
    // 첫 체크포인트 전에도 카드가 0/N 으로 분모를 알도록 게이트에 함께 싣는다.
    progress: { completed: 0, total: questionCount },
  };
  const gate = await acquireBoostGate({
    analysisId: analysisRow.id,
    academyId: auth.academyId,
    running: runningBoost,
  });
  if (!gate.ok) return gateFailureResponse(gate);

  // ── 과금용 잡 생성 + 과금(N × 1cr) — 실패는 헬퍼가 게이트를 FAILED 로 닫고 응답을 돌려준다 ──
  const charge = await openBoostJobAndCharge({
    academyId: auth.academyId,
    staffId: auth.id,
    examId: exam.id,
    examTitle: exam.title,
    analysisId: analysisRow.id,
    questionCount,
    unitCost: UNIT_COST,
    totalCost,
    runningBoost,
  });
  if (!charge.ok) return charge.response;
  const job = { id: charge.jobId };
  const creditTxId: string = charge.creditTxId;

  // ── 보강 실행 + 종합 + 병합 저장 + 정산 ────────────────────────────────────
  // 환불 누계는 try 바깥 — 부분 환불이 이미 일어난 뒤 예외 경로로 떨어져도 그 금액을
  // 잊지 않는다(잔여만 추가 환불·chargedCredits/aiMeta/잡 모두 실환불 기준).
  let refundedCredits = 0;
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
      // 배치 마감은 종합 예산만큼 앞당긴다(SYNTH_RESERVE_MS 주석).
      deadlineAt: routeDeadlineAt - SYNTH_RESERVE_MS,
      usage,
      onBatchComplete: (progress) =>
        writeBoostProgress({ analysisId: analysisRow.id, academyId: auth.academyId, progress }),
    });

    const boostedCount = outcome.analyses.length;
    const failedCount = outcome.failedNumbers.length;

    // v4 examLevel 종합(E1c 공용 모듈, 1회 재시도) — 성공 문항이 있을 때만. 실패는
    // perQuestion 저장을 막지 않고 synthFailed 로만 남긴다(synthOnly 로 0 cr 복구).
    const synth =
      boostedCount > 0
        ? await synthesizeBoostExamLevel({
            analysisId: analysisRow.id,
            academyId: auth.academyId,
            newAnalyses: outcome.analyses,
            examMeta,
            routeDeadlineAt,
            usage,
          })
        : { synthFailed: false as const };

    // 환불액: 부분실패 = 실패 문항 비례, 전량실패 = 전액(과금 원칙: 모델×실호출).
    const refundTarget = failedCount * UNIT_COST;
    if (refundTarget > 0 && creditTxId) {
      try {
        refundedCredits += await refundCredits(
          auth.academyId,
          BOOST_OPERATION,
          creditTxId,
          boostedCount === 0
            ? "AI 시험 분석 전량 실패 — 전액 환불"
            : `AI 시험 분석 부분 실패(${failedCount}/${questionCount}문항) — 비례 환불`,
          refundTarget,
        );
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
      // 최종 진행률은 항상 N/N(실패 문항도 「결과 확정」) — 카드가 100% 로 닫힌다.
      progress: { completed: questionCount, total: questionCount },
      ...(synth.synthFailed ? { synthFailed: true } : {}),
      ...(boostedCount === 0 ? { error: "ALL_BATCHES_FAILED" } : {}),
    };
    const saved = await writeBoostResult({
      analysisId: analysisRow.id,
      academyId: auth.academyId,
      analyses: outcome.analyses,
      boost: finalBoost,
      examLevel: synth.examLevel,
    });
    if (boostedCount > 0 && !saved) {
      // 분석은 나왔지만 CAS 3회 모두 충돌(또는 행이 그 사이 삭제) — 결과를 버리고
      // 전액 환불(과금 정합 우선). 보강은 멱등 재실행 가능하므로 강사가 다시 누르면 된다.
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
          synthFailed: synth.synthFailed,
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
          error: BOOST_FAILED_MESSAGE,
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
      ...(synth.synthFailed ? { synthFailed: true } : {}),
    });
  } catch (err) {
    // 예기치 못한 실패(병합 CAS 소진 포함) — 잔여 전액 환불 + 게이트 FAILED + 잡 FAILED.
    console.error("[analysis-boost] run failed", err);
    const remainingRefund = Math.max(0, totalCost - refundedCredits);
    if (creditTxId && remainingRefund > 0) {
      try {
        refundedCredits += await refundCredits(
          auth.academyId,
          BOOST_OPERATION,
          creditTxId,
          "AI 시험 분석 실패 — 전액 환불",
          remainingRefund,
        );
      } catch (refundErr) {
        console.error("[analysis-boost] refund failed", refundErr);
      }
    }
    const chargedCredits = totalCost - refundedCredits;
    const errorText = err instanceof Error ? err.message : String(err);
    // 정리 쓰기는 각각 격리 — 하나가 던져도 나머지가 닫히고, 안 닫힌 것은 로그로 남는다
    // (FAILED 가 안 실리면 카드는 BOOST_STALE_MS 까지 글로우 → 좀비 정산이 다음 발사에서 수습).
    try {
      const closed = await writeBoostResult({
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
          chargedCredits,
          refundedCredits,
          error: errorText.slice(0, 300),
        },
      });
      if (!closed) console.error("[analysis-boost] FAILED gate write did not land (run failed)");
    } catch (writeErr) {
      console.error("[analysis-boost] FAILED gate write threw (run failed)", writeErr);
    }
    try {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: questionCount,
          errorMessage: errorText,
          result: toJson({ refundedCredits, chargedCredits }),
          completedAt: new Date(),
        },
      });
    } catch (jobErr) {
      console.error("[analysis-boost] job FAILED update threw", jobErr);
    }
    return NextResponse.json(
      {
        ok: false,
        boostedCount: 0,
        failedNumbers: [],
        chargedCredits,
        error: BOOST_FAILED_MESSAGE,
        code: "BOOST_FAILED",
      },
      { status: 502 },
    );
  }
}
