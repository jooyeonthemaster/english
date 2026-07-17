// ============================================================================
// POST /api/exam-report/analyses/[id]/analyze — v3 E1 직접분석(FAST 인라인)
//
// v3 파이프라인: E1a examMap 추출(무과금 프로브, 첫 실행만) → 문항수 N 확정 →
// max(15,N) 선차감 → E1b 문항 심층분석(8/배치, vision) → E1c 종합.
// 게이트: DRAFT|ANALYZED|FAILED + sourceFiles 존재(structureConfirmed 폐기).
//
// 계약(v2 불변식 계승): 시도 대상 = 문항단위(examMap 대조, 유효 0→400) 또는
// 전체(prior OK 제외). 과금 = 첫 실행 max(15,N), 이후 시도당 1(사전 FAILED 무료).
// 재개는 잡 펜싱 CAS 로 실행권 1개 보장. 배치 커밋 = 펜스 갱신 + DB 재조회 병합 +
// version 증가 + aiMeta.runStartedAt/progress 갱신. S3 미완이면 재개(연속 2회 실패 종결).
// 잡 COMPLETED 는 {PROCESSING+펜스} 가드 — 리퍼 선점 시 부활 금지·순액 재청구.
// v3.2: 미종결 yield 시 서버 자가연쇄(after self-POST, 라운드 캡 20)로 클라 없이 완주.
// 이중과금 차단: 첫 실행 전액과금 후 aiMeta.paidFullRun=true → 전체 재개의 미시도
// 문항 무료(전액환불 종결 시 false 로 회수).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { refundCredits } from "@/lib/credits";
import {
  analyzeExamDirect,
  MAX_QUESTION_ATTEMPTS,
  selectAnalysisTargetKeys,
} from "@/lib/exam-report/exam-analyze-direct";
import { getExamReportAiConfig } from "@/lib/exam-report/model-config";
import type { ExamReportMeta } from "@/lib/exam-report/prompts";
import {
  parseExamAiMeta,
  parseExamAnalysisResult,
  parseExamMap,
} from "@/lib/exam-report/schemas";
import { EXAM_REPORT_JOB_DOMAIN, type ExamType } from "@/lib/exam-report/types";
import {
  casJobFinish,
  createCheckpointWriter,
  FenceLostError,
  inProgressResponse,
  jobStatusNow,
  rechargeAfterStaleReap,
  renewJobFence,
  selfHealAnalyzedStatus,
  yieldJobFence,
} from "./_lib/route-db";
import {
  AUTO_RESUME_MAX_ROUNDS,
  createRunJobAndCharge,
  extractAndSaveExamMap,
  loadExamImages,
  scheduleSelfResume,
  setupResume,
  type RunSetup,
} from "./_lib/route-run";
import {
  computeRunPlan,
  computeRunSets,
  computeTerminalKeys,
  mergeCheckpointIntoDb,
  numberKey,
  parseSourceFilePages,
  rawObject,
  readAttemptCounts,
  readNumberField,
  readNumbers,
  readStringArrayField,
  toJson,
  type RunPlan,
} from "./_lib/route-helpers";
import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 무거운 인라인 경로 공통값 — 270s 데드라인 후 재개 루프로 마무리한다.
export const maxDuration = 300;

const DEADLINE_MS = 270_000;
/** S3 종합 연속 실패 이 횟수면 synthFailed 로 종결한다(A6). */
const SYNTH_MAX_FAILURES = 2;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + DEADLINE_MS;

  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const requestedNumbers = readNumbers(await req.json().catch(() => ({})));

  // ── 소유·삭제 검증 + sourceFiles/examMap 파스 ────────────────────────────
  const analysis = await prisma.examAnalysis.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      academyId: true,
      title: true,
      schoolName: true,
      grade: true,
      examType: true,
      status: true,
      sourceFiles: true,
      structure: true,
      analysis: true,
      aiMeta: true,
    },
  });
  if (!analysis) {
    return NextResponse.json(
      { error: "시험 분석을 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  if (analysis.academyId !== auth.academyId) {
    return NextResponse.json(
      { error: "접근 권한이 없습니다.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // v3 게이트: 시험지 사진(sourceFiles)이 있어야 직접분석을 실행할 수 있다.
  const pages = parseSourceFilePages(analysis.sourceFiles);
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "분석할 시험지 사진이 없습니다. 먼저 사진을 업로드하세요.", code: "NO_SOURCE" },
      { status: 400 },
    );
  }

  const priorStatus = analysis.status;
  const priorAnalysis = parseExamAnalysisResult(analysis.analysis);
  // paidFullRun: 첫 실행 전액과금 완료 흔적 — 전체 재개의 미시도 문항 무료 근거.
  const priorPaidFullRun = parseExamAiMeta(analysis.aiMeta).paidFullRun === true;
  // 라이브락 종료(A9): 문항별 자동 재분석 시도 횟수를 aiMeta.attemptCounts 로 유지하고,
  // 상한(MAX_QUESTION_ATTEMPTS) 도달 문항은 "종결 실패"로 확정해 전체(자동) 실행의
  // 재선택에서 제외한다. 남은 비-OK 가 전부 종결이면 시도 대상이 0 이 되어 완료 처리로
  // 수렴한다(도돌이표 실패 문항이 데드라인을 소진해 15/15 에서 멈추던 결함 차단).
  const priorAttemptCounts = readAttemptCounts(analysis.aiMeta);
  const terminalKeys = computeTerminalKeys(priorAttemptCounts);
  const examMeta: ExamReportMeta = {
    title: analysis.title,
    schoolName: analysis.schoolName ?? undefined,
    grade: analysis.grade ?? undefined,
    examType: analysis.examType as ExamType,
  };

  // examMap 은 첫 실행에 없다(E1a 로 생성). 이미 있으면 재개/재분석 경로.
  const priorExamMap = parseExamMap(analysis.structure);
  const hasExamMap = priorExamMap != null && priorExamMap.questions.length > 0;

  // ── 실행 계획: examMap 이 있을 때만 사전 계산(재개/재분석 short-circuit) ──
  let plan: RunPlan | null = null;
  if (hasExamMap) {
    plan = computeRunPlan({
      questions: priorExamMap.questions,
      prior: priorAnalysis,
      requestedNumbers,
      paidFullRun: priorPaidFullRun,
      excludeKeys: terminalKeys,
    });
    if (plan.invalidNumbers) {
      return NextResponse.json(
        { error: "재분석할 문항 번호가 시험지에 없습니다.", code: "INVALID_NUMBERS" },
        { status: 400 },
      );
    }
    if (plan.alreadyAnalyzed && priorStatus !== "ANALYZING") {
      const healedStatus = await selfHealAnalyzedStatus(id, auth.academyId, priorStatus);
      return NextResponse.json({ alreadyAnalyzed: true, status: healedStatus });
    }
  }

  // ── CAS 진입 ─────────────────────────────────────────────────────────────
  const cas = await prisma.examAnalysis.updateMany({
    where: {
      id,
      academyId: auth.academyId,
      deletedAt: null,
      status: { in: ["DRAFT", "ANALYZED", "FAILED"] },
    },
    data: { status: "ANALYZING" },
  });

  const existingJob = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: auth.academyId,
      domain: EXAM_REPORT_JOB_DOMAIN,
      status: "PROCESSING",
      deletedAt: null,
      config: { path: ["examAnalysisId"], equals: id },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, creditTxId: true, updatedAt: true, startedAt: true, config: true },
  });

  const imageLoadFailed = () =>
    NextResponse.json(
      { error: "시험지 사진을 불러오지 못했습니다. 다시 시도해 주세요.", code: "IMAGE_LOAD_FAILED" },
      { status: 500 },
    );

  let isResume = false;
  let images: AtlasChatImageInput[];
  let examMap = priorExamMap;
  let setup: RunSetup;

  if (cas.count === 1) {
    // ── 신규 실행: 고아 잡 종결 → 이미지 로드 → (필요 시) E1a → 잡 생성 + 과금 ──
    // 체인 사망 후 리퍼보다 사용자가 먼저 재개하면 구 PROCESSING 잡이 고아로 남고,
    // 나중에 리퍼가 그 고아를 FAILED+전액환불 처리한다 — 분석이 성공 완료된 뒤에
    // 원 청구가 통째로 환불되는 순서역전(검수 CRITICAL). 새 잡 생성 전에 **환불 없이**
    // 종결해 원천 차단한다(과금은 paidFullRun 무료 재개의 근거로 유지해야 하므로
    // 환불 금지 — 환불하면 이 실행의 무료 재개와 합쳐져 이중 보상).
    if (existingJob) {
      await prisma.workbenchAiJob
        .updateMany({
          where: { id: existingJob.id, status: "PROCESSING" },
          data: {
            status: "FAILED",
            errorMessage: "superseded: 새 실행으로 대체",
            completedAt: new Date(),
          },
        })
        .catch(() => {});
    }
    try {
      images = await loadExamImages(pages);
    } catch {
      await prisma.examAnalysis
        .updateMany({
          where: { id, academyId: auth.academyId, status: "ANALYZING" },
          data: { status: priorStatus, version: { increment: 1 } },
        })
        .catch(() => {});
      return imageLoadFailed();
    }
    if (!hasExamMap) {
      // E1a examMap 추출(무과금). 실패 시 status 원복 + 에러 응답(헬퍼가 처리).
      const extracted = await extractAndSaveExamMap({
        analysisId: id,
        academyId: auth.academyId,
        images,
        examMeta,
        deadlineAt,
        priorStatus,
      });
      if (!extracted.ok) return extracted.response;
      examMap = extracted.examMap;
      // 첫 실행 과금 기준: prior 없음 → isFirstRun → max(15,N).
      // (이례적으로 examMap 만 소실된 paidFullRun 행이면 재과금하지 않는다.)
      plan = computeRunPlan({
        questions: examMap.questions,
        prior: null,
        paidFullRun: priorPaidFullRun,
        excludeKeys: terminalKeys,
      });
    }
    const created = await createRunJobAndCharge({
      analysisId: id,
      academyId: auth.academyId,
      staffId: auth.id,
      title: analysis.title,
      priorStatus,
      plan: plan!,
      questionCount: examMap!.questions.length,
    });
    if (!created.ok) return created.response;
    setup = created.setup;
  } else {
    // ── 재개: 펜싱 게이트 + config 스냅샷 복원(헬퍼) ──────────────────────────
    const resumed = await setupResume({
      analysisId: id,
      academyId: auth.academyId,
      hasExamMap,
      existingJob,
    });
    if (!resumed.ok) return resumed.response;
    isResume = true;
    setup = resumed.setup;
    try {
      images = await loadExamImages(pages);
    } catch {
      await yieldJobFence(setup.fence);
      return imageLoadFailed();
    }
  }

  const { fence, creditTxId, runTargetNumbers, runForceNumbers, runFreeKeys } = setup;
  const jobId = fence.jobId;
  const runExamMap = examMap!;

  // 이번 실행 attempted 집합 — exam-analyze-direct 와 동일 규칙(selectAnalysisTargetKeys).
  const attemptedKeySet = selectAnalysisTargetKeys({
    questionNumbers: runExamMap.questions.map((q) => q.number),
    priorPerQuestion: priorAnalysis?.perQuestion ?? [],
    targetNumbers: runTargetNumbers,
    forceNumbers: runForceNumbers,
    excludeKeys: terminalKeys,
  });
  const attemptedKeys = runExamMap.questions
    .map((q) => numberKey(q.number))
    .filter((k) => attemptedKeySet.has(k));

  // 진입 기록: aiMeta.runStartedAt(리컨실 판정 기준, A8) + 신규 실행은 synth 리셋.
  await prisma.examAnalysis.update({
    where: { id },
    data: {
      aiMeta: toJson({
        ...rawObject(analysis.aiMeta),
        runStartedAt: Date.now(),
        // 신규 실행: synth 리셋 + 직전 실행의 환불 기록 제거(무환불 종결 경로가
        // stale 값을 배너 문구로 되살리는 것 방지 — 착지검증 edge)
        // + 자가연쇄 라운드 카운터 0 리셋(폭주 가드 기준점).
        ...(isResume
          ? {}
          : {
              synthFailures: 0,
              synthFailed: false,
              refundedCredits: 0,
              autoResumeRounds: 0,
              // terminal 전이 환불 원장(문항키) — 논리 실행(=청구 tx) 단위라 신규
              // 실행 진입 시 리셋. 유지하면 새 청구분의 정당한 환불이 억제된다.
              refundedFailedKeys: [],
              // 첫 실행 전액과금(max(15,N)) 성공 → 이후 전체 재개에서 중단 미시도
              // 문항을 무료 처리하는 근거(이중과금 차단).
              ...(plan?.isFirstRun && plan.cost > 0 ? { paidFullRun: true } : {}),
            }),
      }),
      version: { increment: 1 },
    },
  });

  // successCount 집계 범위(검수 MEDIUM): 전체 실행은 examMap 전 문항 — 자가연쇄
  // 다라운드에서 이번 라운드 attempted 만 세면 완주해도 22/28 과소표기되고 라운드
  // 전환 시 successCount 가 역행(8→2)한다. 문항단위 실행은 지정 문항 그대로
  // (requestedCount=잡 생성 시 값과 분모 짝 유지 — 대상이 라운드 간 불변이라 무손실).
  const successScopeKeys: ReadonlySet<string> = runTargetNumbers
    ? attemptedKeySet
    : new Set(runExamMap.questions.map((q) => numberKey(q.number)));

  const persistCheckpoint = createCheckpointWriter({
    analysisId: id,
    attemptedKeySet,
    successScopeKeys,
    // 진행률(aiMeta.progress)·잡 카드 동기화 — 배치 커밋마다 실제 %/ETA 소스 갱신.
    totalQuestions: runExamMap.questions.length,
    runStartedAtMs: startedAt,
    jobId,
  });

  // ── 실행 ─────────────────────────────────────────────────────────────────
  const hadPriorOk = (priorAnalysis?.perQuestion ?? []).some(
    (q) => q.analysisStatus === "OK",
  );

  // A9 보강(적대 리뷰 CRITICAL): 이번 논리 실행에서 이미 비례 환불된 문항키 원장.
  // terminal 전이 환불(yield 경로)과 종결 환불(runFailedBillable)이 같은 키를 두 번
  // 세지 않도록 모든 환불 계산에서 제외한다. 신규 실행 진입 시 [] 로 리셋되므로
  // 항상 현재 청구(creditTxId) 범위의 키만 담긴다. refundCredits 자체의 tx 누적 캡
  // (원청구 초과 환불 불가)이 최후 방어선.
  const priorRefundedKeys = new Set(
    isResume
      ? (readStringArrayField(analysis.aiMeta, "refundedFailedKeys") ?? []).map(numberKey)
      : [],
  );
  const priorRefundedCredits = isResume
    ? readNumberField(analysis.aiMeta, "refundedCredits")
    : 0;

  try {
    const outcome = await analyzeExamDirect({
      examMap: runExamMap,
      images,
      examMeta,
      targetNumbers: runTargetNumbers,
      forceNumbers: runForceNumbers,
      excludeKeys: terminalKeys,
      prior: priorAnalysis,
      deadlineAt,
      onBatchComplete: async (cp) => {
        // 배치 완료마다 직렬 커밋(analyze 가 순차 보장) — 펜스 갱신 + 병합 저장.
        await renewJobFence(fence);
        await persistCheckpoint(cp);
      },
    });

    const model = getExamReportAiConfig("examAnalysis").model;
    const { succeeded: runSucceeded, failedBillable: runFailedBillable } =
      computeRunSets({
        attemptedKeys,
        freeKeys: runFreeKeys,
        finalPerQuestion: outcome.checkpoint.perQuestion,
      });
    // 이미 terminal 전이 시점에 환불된 키는 종결 환불·재청구 계산에서 제외
    // (문항단위 재분석이 terminal 키를 재시도하는 경로에서 이중 환불 차단).
    const refundableFailed = runFailedBillable.filter(
      (key) => !priorRefundedKeys.has(key),
    );
    const usagePatch = {
      model,
      calls: outcome.usage.calls,
      promptTokens: outcome.usage.promptTokens,
      completionTokens: outcome.usage.completionTokens,
      durationMs: Date.now() - startedAt,
      failedNumbers: outcome.failedNumbers,
    };

    // A9 라이브락 종료: 이번 라운드 시도(attemptedKeys) 문항의 최종 판정으로
    // attemptCounts 를 갱신한다 — 여전히 FAILED 면 +1(상한 도달 시 다음 라운드부터
    // 종결 실패로 재선택 제외), OK 로 복구되면 제거(재분석 시 조기 락아웃 방지).
    // 모든 persistCheckpoint 에 실어 라운드 간 유지한다.
    const finalStatusByKey = new Map(
      outcome.checkpoint.perQuestion.map((q) => [numberKey(q.number), q.analysisStatus]),
    );
    const nextAttemptCounts: Record<string, number> = { ...priorAttemptCounts };
    for (const key of attemptedKeys) {
      const finalStatus = finalStatusByKey.get(key);
      if (finalStatus === "FAILED") {
        nextAttemptCounts[key] = (nextAttemptCounts[key] ?? 0) + 1;
      } else if (finalStatus === "OK") {
        delete nextAttemptCounts[key];
      }
    }

    // A6: S3 연속 실패 카운트(재개 간 aiMeta 로 유지) — 2회면 synthFailed 종결.
    const synthFailures =
      (isResume ? readNumberField(analysis.aiMeta, "synthFailures") : 0) +
      (outcome.synthFailed ? 1 : 0);
    const synthTerminal =
      outcome.synthPending && synthFailures >= SYNTH_MAX_FAILURES;

    if (!outcome.finished && !synthTerminal) {
      // ── 미종결(마감 or S3 잔여): 체크포인트 저장 + 잡 yield → 서버 자가연쇄 재개 ──
      // 라운드 카운터: 이번 논리 실행 누적(신규 진입 시 0 리셋) +1 — 폭주 가드 기준.
      const autoResumeRounds =
        (isResume ? readNumberField(analysis.aiMeta, "autoResumeRounds") : 0) + 1;

      // terminal 전이 환불(적대 리뷰 CRITICAL): 이번 라운드에 시도 상한에 도달한
      // billable 실패 문항은 다음 라운드부터 자동 실행에서 제외되므로, 종결 라운드의
      // runFailedBillable(그 라운드 시도분 한정)에 영영 잡히지 않는다 — 여기 전이
      // 시점에 비례 환불해야 "과금됐지만 분석물도 환불도 없는" 누수가 막힌다.
      // (terminal 전이가 종결 라운드에서 일어나면 그 키는 그 라운드 attempted 라
      // 기존 종결 환불이 처리 — 이 경로는 yield 라운드 전이 전용.)
      // reason 에 라운드를 실어 라운드별 환불이 reason 멱등에 서로 막히지 않게 한다.
      const newlyTerminalBillable = attemptedKeys.filter(
        (key) =>
          finalStatusByKey.get(key) === "FAILED" &&
          (nextAttemptCounts[key] ?? 0) >= MAX_QUESTION_ATTEMPTS &&
          !runFreeKeys.has(key) &&
          !priorRefundedKeys.has(key),
      );
      // throw(진짜 실패)는 null 로 받아 원장 기록을 생략한다 — 기록해 버리면 그 키의
      // 환불이 영구 소실된다(적대 리뷰 h). 멱등 0(이미 같은 reason 으로 환불됨)은
      // 정상 반환이므로 원장에 기록해 중복 시도를 막는다.
      let terminalRefunded: number | null = 0;
      if (creditTxId && newlyTerminalBillable.length > 0) {
        terminalRefunded = await refundCredits(
          auth.academyId,
          "EXAM_ANALYSIS",
          creditTxId,
          `exam-analysis-terminal-${jobId}-r${autoResumeRounds}`,
          newlyTerminalBillable.length,
        ).catch((e) => {
          console.error("[exam-analyze] terminal refund failed", e);
          return null;
        });
      }
      const refundedFailedKeys =
        creditTxId && newlyTerminalBillable.length > 0 && terminalRefunded !== null
          ? [...priorRefundedKeys, ...newlyTerminalBillable]
          : [...priorRefundedKeys];

      await renewJobFence(fence);
      await persistCheckpoint(outcome.checkpoint, {
        usagePatch,
        aiMetaExtra: {
          runStartedAt: Date.now(),
          synthFailures,
          autoResumeRounds,
          attemptCounts: nextAttemptCounts,
          refundedFailedKeys,
          refundedCredits: priorRefundedCredits + (terminalRefunded ?? 0),
        },
      });
      await yieldJobFence(fence);

      // 서버 자가연쇄: 클라이언트 없이 완주하도록 자기 자신에게 재개 POST 발사(after).
      // 캡 도달 시 체인 중단 — 클라 감시견/이어서 분석 CTA 가 폴백으로 잇는다.
      if (autoResumeRounds < AUTO_RESUME_MAX_ROUNDS) {
        scheduleSelfResume(req, id);
      }

      const judged = new Set(
        outcome.checkpoint.perQuestion.map((q) => numberKey(q.number)),
      );
      const completed = runExamMap.questions.filter((q) =>
        judged.has(numberKey(q.number)),
      ).length;
      return NextResponse.json({
        resume: true,
        status: "ANALYZING",
        completed,
        total: runExamMap.questions.length,
      });
    }

    // ── 종결 ────────────────────────────────────────────────────────────────
    const isTotalInitialFailure =
      runSucceeded.length === 0 && !hadPriorOk && !runTargetNumbers;

    if (isTotalInitialFailure) {
      // 초기 전량 실패 → 전액 환불 + status FAILED + 잡 FAILED(펜스 가드).
      const failed = await casJobFinish(fence, {
        status: "FAILED",
        failedCount: attemptedKeys.length,
        errorMessage: "모든 문항 분석에 실패했습니다.",
        completedAt: new Date(),
      });
      if (!failed) {
        if ((await jobStatusNow(jobId)) === "PROCESSING") {
          return inProgressResponse();
        }
      }
      // D2: 무성공 종결 = 즉시 전액 환불(리퍼 의존 금지). 실제 환불액을 캡처해
      // aiMeta 에 영속화(FAILED 배너의 "환불" 문구 조건화 근거) + 응답에 포함한다.
      let refundedCredits = 0;
      if (creditTxId) {
        refundedCredits = await refundCredits(
          auth.academyId,
          "EXAM_ANALYSIS",
          creditTxId,
          `exam-analysis-fail-${jobId}`,
        ).catch((e) => {
          console.error("[exam-analyze] full refund failed", e);
          return 0;
        });
      }
      await persistCheckpoint(outcome.checkpoint, {
        status: "FAILED",
        usagePatch,
        // 전액환불 종결 → 전액과금 흔적(paidFullRun) 회수(다음 실행은 다시 정상 과금).
        // 전량 실패 종결이라 attemptCounts·환불 원장은 리셋(다음 실행은 새 청구/카운트).
        // refundCredits 의 tx 누적 캡 덕에 전이 환불이 선행됐어도 잔여분만 환불된다 —
        // refundedCredits 는 누적(전이+전액)으로 기록해 배너가 총액을 보이게 한다.
        aiMetaExtra: {
          synthFailures,
          refundedCredits: priorRefundedCredits + refundedCredits,
          paidFullRun: false,
          attemptCounts: {},
          refundedFailedKeys: [],
        },
      });
      return NextResponse.json({
        status: "FAILED",
        failedNumbers: outcome.failedNumbers,
        refundedCredits: priorRefundedCredits + refundedCredits,
      });
    }

    // successCount 통일(검수 MEDIUM): runSucceeded(이번 라운드 attempted 중 OK)만 쓰면
    // 다라운드 완주 시 마지막 라운드 분량만 남아 과소표기 — 체크포인트 writer 와 동일한
    // "집계 범위(successScopeKeys) 중 병합 후 OK 수" 기준으로 기록한다.
    // failedCount 는 기존 의미(이번 실행 billable 실패 = 환불 기준) 유지.
    const mergedForCount = mergeCheckpointIntoDb({
      dbAnalysis: priorAnalysis,
      checkpoint: outcome.checkpoint,
      attemptedKeys: attemptedKeySet,
    });
    const mergedOkCount = mergedForCount.perQuestion.filter(
      (q) => successScopeKeys.has(numberKey(q.number)) && q.analysisStatus === "OK",
    ).length;

    // A2: COMPLETED 는 PROCESSING+펜스 보유 시에만 — 리퍼 선점 시 부활 금지.
    const completedOk = await casJobFinish(fence, {
      status: "COMPLETED",
      successCount: mergedOkCount,
      failedCount: runFailedBillable.length,
      resultCount: outcome.checkpoint.perQuestion.length,
      completedAt: new Date(),
    });

    const completionAiExtra: Record<string, unknown> = {
      synthFailures,
      attemptCounts: nextAttemptCounts,
      // 종결 시 원장 확정(관측용) — 이번 종결 환불분(refundableFailed)까지 포함.
      refundedFailedKeys:
        creditTxId && refundableFailed.length > 0
          ? [...priorRefundedKeys, ...refundableFailed]
          : [...priorRefundedKeys],
      ...(synthTerminal ? { synthFailed: true } : {}),
    };

    if (!completedOk) {
      if ((await jobStatusNow(jobId)) === "PROCESSING") {
        return inProgressResponse();
      }
      // 리퍼가 FAILED+전액환불 처리함 → 잡은 FAILED 유지, 결과는 저장하고 순액 재청구.
      // 재청구 = 원청구 - failedBillableCount 이므로, terminal 전이로 이미 환불된
      // 키(priorRefundedKeys)도 실패분에 합산해야 그 문항이 재청구로 되살아나지 않는다.
      const { rechargeFailed } = await rechargeAfterStaleReap({
        academyId: auth.academyId,
        staffId: auth.id,
        analysisId: id,
        jobId,
        creditTxId,
        failedBillableCount: refundableFailed.length + priorRefundedKeys.size,
      });
      await persistCheckpoint(outcome.checkpoint, {
        status: "ANALYZED",
        usagePatch,
        aiMetaExtra: {
          ...completionAiExtra,
          staleReaped: true,
          ...(rechargeFailed ? { rechargeFailed: true } : {}),
        },
      });
      return NextResponse.json({
        status: "ANALYZED",
        failedNumbers: outcome.failedNumbers,
        resume: false,
      });
    }

    // 일부라도 성공 → ANALYZED. 실패 문항 비례 환불(billable 만, terminal 전이 환불분
    // 제외) — D2: 즉시 실행 + 실제 환불액 캡처. refundedCredits 는 이번 논리 실행
    // 누적(전이 환불 + 종결 환불)으로 기록해 배너가 총액을 보이게 한다.
    let refundedCredits = 0;
    if (creditTxId && refundableFailed.length > 0) {
      refundedCredits = await refundCredits(
        auth.academyId,
        "EXAM_ANALYSIS",
        creditTxId,
        `exam-analysis-partial-${jobId}`,
        refundableFailed.length,
      ).catch((e) => {
        console.error("[exam-analyze] partial refund failed", e);
        return 0;
      });
    }

    await persistCheckpoint(outcome.checkpoint, {
      status: "ANALYZED",
      usagePatch,
      aiMetaExtra: {
        ...completionAiExtra,
        refundedCredits: priorRefundedCredits + refundedCredits,
      },
    });

    return NextResponse.json({
      status: "ANALYZED",
      failedNumbers: outcome.failedNumbers,
      resume: false,
      refundedCredits: priorRefundedCredits + refundedCredits,
    });
  } catch (err) {
    if (err instanceof FenceLostError) {
      const statusNow = await jobStatusNow(jobId);
      if (statusNow === "PROCESSING") {
        return inProgressResponse();
      }
      if (statusNow === "COMPLETED") {
        // 다른 실행이 이미 완료·과금 처리함 — 현 상태만 반영하고 종료(중복 청구/FAILED 금지).
        return NextResponse.json({ status: "ANALYZED", resume: false });
      }
      // 리퍼가 잡을 FAILED+전액환불했을 수 있다(triggerless 15분 컷). 이미 커밋된 성공
      // 문항이 있으면 결과를 살리고 순액(원청구-실패분)을 재청구해 매출 유실을 막는다.
      const committedRow = await prisma.examAnalysis
        .findUnique({ where: { id }, select: { analysis: true, aiMeta: true } })
        .catch(() => null);
      const committed = parseExamAnalysisResult(committedRow?.analysis);
      const okKeys = new Set(
        (committed?.perQuestion ?? [])
          .filter((q) => q.analysisStatus === "OK")
          .map((q) => numberKey(q.number)),
      );
      const succeededCount = attemptedKeys.filter((k) => okKeys.has(k)).length;
      if (succeededCount > 0) {
        // terminal 전이로 이미 환불된 키도 실패분에 합산해 재청구가 그 문항을
        // 되살리지 않게 한다(완료 경로와 동일 규칙). 단 attempted 와 원장이 겹치는
        // 경우(문항단위 재시도)는 원장 쪽에서만 세어 이중 차감을 막는다(적대 리뷰 f).
        const nonRefundedAttempted = attemptedKeys.filter(
          (k) => !priorRefundedKeys.has(k),
        );
        const succeededNonRefunded = nonRefundedAttempted.filter((k) =>
          okKeys.has(k),
        ).length;
        await rechargeAfterStaleReap({
          academyId: auth.academyId,
          staffId: auth.id,
          analysisId: id,
          jobId,
          creditTxId,
          failedBillableCount:
            nonRefundedAttempted.length -
            succeededNonRefunded +
            priorRefundedKeys.size,
        });
        await prisma.examAnalysis
          .updateMany({
            where: { id, academyId: auth.academyId, status: "ANALYZING" },
            data: { status: "ANALYZED", version: { increment: 1 } },
          })
          .catch(() => {});
        return NextResponse.json({ status: "ANALYZED", resume: false });
      }
      // 커밋된 성공분 없음 → 리퍼 환불(전액)은 그대로 두고 FAILED(재시도 유도).
      // 단 전액과금 흔적(paidFullRun)은 함께 회수한다 — 리퍼는 aiMeta 를 모르므로
      // 여기서 회수하지 않으면 "전액 환불 + 전량 무료 재실행 = 최종 과금 0" 누수
      // (검수 CRITICAL). aiMeta 는 현재 행 재조회(committedRow) 병합 — 실행 중
      // 기록을 되감지 않는다(아래 에러 경로 회수 로직 미러).
      await prisma.examAnalysis
        .updateMany({
          where: { id, academyId: auth.academyId, status: "ANALYZING" },
          data: {
            status: "FAILED",
            aiMeta: toJson({
              ...rawObject(committedRow?.aiMeta ?? analysis.aiMeta),
              paidFullRun: false,
            }),
            version: { increment: 1 },
          },
        })
        .catch(() => {});
      return NextResponse.json(
        { error: "문항 분석이 중단되었습니다. 다시 시도해 주세요.", code: "ANALYZE_FAILED" },
        { status: 500 },
      );
    }

    // 예기치 못한 실패 → 잡 FAILED(펜스 가드) 성공 시에만 전액 환불(D2: 즉시 실행).
    const failed = await casJobFinish(fence, {
      status: "FAILED",
      failedCount: 1,
      errorMessage:
        err instanceof Error ? err.message.slice(0, 500) : "분석 실패",
      completedAt: new Date(),
    });
    // 환불 정책(검수 HIGH): 예외라도 배치 커밋으로 이미 저장된 결과가 있으면 전액이
    // 아니라 부분 환불이어야 한다 — 전액 환불하면 커밋 성공분이 무상 + 최소요금
    // max(15,N) 우회 언더차지. 커밋된 결과를 재조회(FenceLost 분기의 okKeys 로직
    // 재사용)해 갈래를 나눈다:
    //   (i) 커밋 0(성공 0 + FAILED 0) → 현행 전액 환불 + paidFullRun 회수 유지,
    //  (ii) 커밋 존재 → "커밋된 FAILED 중 billable(freeKeys 제외)" 수만 costOverride
    //       부분 환불. paidFullRun 은 true 유지 — 미시도분은 무료 재개로 상환되므로
    //       환불까지 하면 이중 보상이 된다.
    let refundedCredits = 0;
    let fullRefunded = false;
    if (failed && creditTxId) {
      const committedRow = await prisma.examAnalysis
        .findUnique({ where: { id }, select: { analysis: true } })
        .catch(() => null);
      const committedStatusByKey = new Map(
        (parseExamAnalysisResult(committedRow?.analysis)?.perQuestion ?? []).map(
          (q) => [numberKey(q.number), q.analysisStatus],
        ),
      );
      const committedAttempted = attemptedKeys.filter((k) =>
        committedStatusByKey.has(k),
      );
      if (committedAttempted.length === 0) {
        // (i) 이번 실행 커밋이 전무 → 전액 환불(기존 동작).
        refundedCredits = await refundCredits(
          auth.academyId,
          "EXAM_ANALYSIS",
          creditTxId,
          `exam-analysis-error-${jobId}`,
        ).catch((e) => {
          console.error("[exam-analyze] error refund failed", e);
          return 0;
        });
        fullRefunded = refundedCredits > 0;
      } else {
        // (ii) 커밋 존재 → billable 실패분만 부분 환불(성공 커밋분 매출 보존).
        // terminal 전이 환불분(priorRefundedKeys)은 제외 — 이중 환불 차단.
        const committedFailedBillable = committedAttempted.filter(
          (k) =>
            committedStatusByKey.get(k) === "FAILED" &&
            !runFreeKeys.has(k) &&
            !priorRefundedKeys.has(k),
        ).length;
        if (committedFailedBillable > 0) {
          refundedCredits = await refundCredits(
            auth.academyId,
            "EXAM_ANALYSIS",
            creditTxId,
            `exam-analysis-error-${jobId}`,
            committedFailedBillable,
          ).catch((e) => {
            console.error("[exam-analyze] error refund failed", e);
            return 0;
          });
        }
      }
    }
    if (!failed && (await jobStatusNow(jobId)) === "PROCESSING") {
      return inProgressResponse();
    }
    // 실제 환불액을 aiMeta 에 영속화(FAILED 배너 조건화 근거) + status FAILED.
    // aiMeta 는 요청 시작 스냅샷이 아니라 현재 행을 다시 읽어 병합 — 실행 중
    // 기록(probeRuns 리셋·runStartedAt 갱신)을 되감지 않는다(착지검증 edge).
    const currentRow = await prisma.examAnalysis
      .findUnique({ where: { id }, select: { aiMeta: true } })
      .catch(() => null);
    await prisma.examAnalysis
      .updateMany({
        where: { id, academyId: auth.academyId, status: "ANALYZING" },
        data: {
          status: "FAILED",
          aiMeta: toJson({
            ...rawObject(currentRow?.aiMeta ?? analysis.aiMeta),
            // 누적 기록(전이 환불 + 이번 에러 환불) — 이 경로 단독값으로 덮으면
            // yield 라운드의 전이 환불 총액이 배너에서 사라진다.
            refundedCredits: priorRefundedCredits + refundedCredits,
            // 전액환불이 실제 실행됐을 때만 전액과금 흔적 회수 — 부분환불(커밋 존재)은
            // 미시도분 무료 재개(paidFullRun)로 상환되므로 유지(검수 HIGH 정책).
            ...(fullRefunded ? { paidFullRun: false } : {}),
          }),
          version: { increment: 1 },
        },
      })
      .catch(() => {});
    return NextResponse.json(
      { error: "문항 분석 중 오류가 발생했습니다.", code: "ANALYZE_FAILED", refundedCredits },
      { status: 500 },
    );
  }
}
