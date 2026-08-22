import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import { hashContent } from "@/lib/passage-utils";
import {
  providerFromModel,
  readAiUsageCost,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  DEFAULT_ANALYSIS_TONE,
  isPartialAnalysisData,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import {
  getPassageAnalysisCreditCost,
  getPassageAnalysisWorksheetCreditCost,
} from "@/lib/passage-analysis-credit-costs";
import { prisma } from "@/lib/prisma";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { loadPersistedAnnotations } from "@/app/api/ai/passage-analysis/[passageId]/_lib/annotations";
import { classifyAnalysisError } from "@/app/api/ai/passage-analysis/[passageId]/_lib/error-classification";
import { generateLearningWorksheetResilient } from "@/lib/passage-report/analysis-report/generate";
import {
  defaultLlmText,
  generateAnalysisReportResilient,
  worksheetCoreEngine,
  type ResilientCheckpoint,
} from "@/lib/passage-report/analysis-report/resilient-generate";
import { analysisPhaseLabel, createStreamingLlmText } from "@/lib/passage-report/analysis-report/stream-llm";
import {
  loadPriorCheckpoint,
  persistCheckpoint,
} from "@/lib/passage-report/analysis-report/resilient-checkpoint";
import {
  analysisReportSchema,
  type AnalysisReport,
} from "@/lib/passage-report/analysis-report/schema";
import type { SectionKind } from "@/lib/passage-report/analysis-report/section-prompts";
import {
  buildSeedCheckpoint,
  computePartialAnalysisPlan,
  mergeReportPreservingExtras,
  type PartialAnalysisPlan,
} from "@/lib/passage-report/analysis-report/partial-analysis";
import {
  FULL_ANALYSIS_SECTIONS,
  isSectionKind,
} from "@/lib/studio/module-sections";
import { derivePassageAnalysisFromReport } from "@/lib/passage-report/analysis-report/derive-legacy";
import {
  buildKoPromptInputFromPassage,
  isKoreanPassage,
  saveKoPrimeReport,
} from "@/lib/passage-report/analysis-report/ko-entry";
import {
  generateKoAnalysisReportResilient,
  koDefaultLlmText,
} from "@/lib/passage-report/analysis-report/ko-resilient-generate";
import { generateFinalOnepageReport } from "@/lib/passage-report/analysis-report/final-onepage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 실전 학습지 포함(includeWorksheet) 시 LLM 3회 호출(기본 1 + 워크북/추론 2)이라
// 기본 분석(180s)보다 여유가 필요하다 — 옵트인 워크시트 라우트와 동일하게 300s.
export const maxDuration = 300;

const requestSchema = z.object({
  passageId: z.string().min(1),
  customPrompt: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  targetLevel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  analysisTone: z.unknown().optional(),
  /** true 면 기본 분석에 이어 실전 학습지(06)까지 한 번에 생성·병합한다 (+5크레딧). */
  includeWorksheet: z.boolean().optional(),
  /**
   * true 면 기본 분석 대신 파이널 원페이지(A4 딱 1장 족집게 시트)만 생성한다 (◈5).
   * 스펙 정본 .tmp-final-qa/final-onepage-spec.md §2 — includeWorksheet·targetSections·
   * 국어 지문과 조합 불가(400). PassageAnalysis 파생은 기록하지 않는다(스펙 F2).
   */
  finalOnepage: z.boolean().optional(),
  /**
   * 섹션 종량제(스펙 §3.4.1) — 지정 시 그 섹션만 부분 분석하고 부족분만 과금한다
   * (min(부족 수, 5)크레딧). enum 정본은 FULL_ANALYSIS_SECTIONS(module-sections.ts) —
   * 목록을 여기 재정의하지 않는다. includeWorksheet 와 동시 지정 불가(400).
   * 부재 시 기존 전체 분석과 동일 동작(무회귀).
   */
  targetSections: z
    .array(z.enum(FULL_ANALYSIS_SECTIONS as unknown as [SectionKind, ...SectionKind[]]))
    .min(1)
    .optional(),
  /**
   * 부분 분석을 발사한 스튜디오 모듈 카드(§3.4.1-11) — 잡 config 에만 기록되고
   * 스튜디오 카드 "분석 중" 표시가 이 카드 하나로 좁혀진다. 생성·과금 로직 무관여.
   */
  sourceModule: z.string().max(32).optional(),
  /**
   * true 면 응답을 SSE 로 바꿔 생성 중 사고/본문 델타를 흘린다(문제 생성 md-stream
   * 과 동일한 로딩 카드 미리보기). 생성·과금·저장 로직은 완전히 동일하고, 마지막에
   * 같은 JSON 페이로드를 {t:"done"} 프레임으로 싣는다. 미지정이면 기존 JSON 응답.
   */
  stream: z.boolean().optional(),
});

function getAnalysisGenerationPlan(value: unknown): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._generationPlan;
  return raw === "PREMIUM" || raw === "STANDARD" ? raw : null;
}

function getAnalysisTone(value: unknown): AnalysisTone | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._analysisTone;
  return typeof raw === "string" ? normalizeAnalysisTone(raw) : null;
}

function shouldUseCachedAnalysis(
  cached: unknown,
  requestedPlan: QuestionGenerationPlan,
  requestedTone: AnalysisTone,
): boolean {
  // 부분 분석 마커(§3.4.1-7): 분석 섹션 6종 미만인 파생 캐시는 "완료"가 아니다 —
  // 부분 분석 뒤 전액 전체 분석 요청이 캐시 완료로 오탐되는 구멍 봉쇄. 판정은 공용 헬퍼
  // (3벌 복제본 전부 동일 적용 — 검수 M2). 마커 없는 기존 데이터는 기존 판정 그대로.
  if (isPartialAnalysisData(cached)) return false;
  const cachedPlan = getAnalysisGenerationPlan(cached);
  const cachedTone = getAnalysisTone(cached);
  if (cachedTone && cachedTone !== requestedTone) return false;
  if (!cachedTone && requestedTone !== DEFAULT_ANALYSIS_TONE) return false;
  if (requestedPlan === "PREMIUM") return cachedPlan === "PREMIUM";
  return true;
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter 실측 청구액 합(USD) — 있으면 RECORDED 단가로 기록. */
  recordedCostUsd?: number | null;
  usageAt: Date;
  metadata: Record<string, unknown>;
}) {
  try {
    await recordPlatformApiUsageCost({
      sourceKey: input.sourceKey,
      sourceType: "WORKBENCH_AI_JOB",
      sourceId: input.sourceId,
      sourceDetail: input.sourceDetail,
      academyId: input.academyId,
      provider: input.provider,
      model: input.model,
      operationType: "PASSAGE_ANALYSIS",
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      recordedCostUsd: input.recordedCostUsd,
      usageAt: input.usageAt,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[workbench-fast-analysis] Failed to record API cost", error);
  }
}

/** 스트리밍 미리보기 프레임 싱크 — 비스트리밍 모드에서는 no-op 이 들어온다. */
type StreamEmit = (event: Record<string, unknown>) => void;
const NOOP_EMIT: StreamEmit = () => {};

/**
 * SSE 래퍼 — 본체(runAnalysis)는 기존 그대로 NextResponse 를 반환하고, 여기서
 * 그 최종 JSON 을 {t:"done"|"error"} 프레임으로 옮긴다. 본체의 12개 return 지점을
 * 하나도 건드리지 않아 비스트리밍 경로는 바이트 동일하게 유지된다.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.json().catch(() => ({}));
  const wantStream = (rawBody as { stream?: unknown })?.stream === true;
  if (!wantStream) return runAnalysis(req, rawBody, NOOP_EMIT);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit: StreamEmit = (payload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // 클라이언트 이탈 — 이후 프레임은 버리되 생성·과금·저장은 계속한다.
          closed = true;
        }
      };
      // 개통 즉시 주석 프레임 — 프록시/런타임 초기 버퍼링을 뚫는다.
      try {
        controller.enqueue(encoder.encode(": open\n\n"));
      } catch {
        closed = true;
      }

      void (async () => {
        try {
          const res = await runAnalysis(req, rawBody, emit);
          const payload = await res.json().catch(() => ({}));
          emit(
            res.ok
              ? { t: "done", ...payload }
              : { t: "error", status: res.status, ...payload },
          );
        } catch (error) {
          emit({
            t: "error",
            error: "Passage analysis failed",
            details: error instanceof Error ? error.message : String(error),
          });
        }
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          closed = true;
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runAnalysis(
  req: NextRequest,
  rawBody: unknown,
  emit: StreamEmit,
): Promise<NextResponse> {
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const generationPlan = normalizeQuestionGenerationPlan(
    parsed.data.generationPlan,
  );
  const analysisTone = normalizeAnalysisTone(parsed.data.analysisTone);
  const includeWorksheet = parsed.data.includeWorksheet === true;
  // 섹션 종량제 부분 분석 대상(§3.4.1). null 이면 기존 전체 분석 경로 그대로.
  const targetSections = parsed.data.targetSections ?? null;
  // 실전 학습지는 분석 섹션이 아니라 옵트인 생성물(스펙 §3.4 특례) — 종량제와 조합 불가.
  if (targetSections && includeWorksheet) {
    return NextResponse.json(
      { error: "targetSections 와 includeWorksheet 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  // 파이널 원페이지(final-onepage-spec §2) — 별도 상품이라 실전 학습지·종량제와 조합 불가.
  const finalOnepage = parsed.data.finalOnepage === true;
  if (finalOnepage && includeWorksheet) {
    return NextResponse.json(
      { error: "finalOnepage 와 includeWorksheet 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  if (finalOnepage && targetSections) {
    return NextResponse.json(
      { error: "finalOnepage 와 targetSections 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: parsed.data.passageId, academyId: staff.academyId },
    include: {
      analysis: true,
      school: { select: { type: true } },
    },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }
  // 국어 지문은 부분 분석 미지원(§3.4.1-8) — 섹션 종량제는 영어 PRIME 리포트 전용이라
  // PRIME_KO 블록에 진입하기 전에 차단한다(잡 생성 전이라 뒷정리도 필요 없다).
  if (targetSections && isKoreanPassage(passage)) {
    return NextResponse.json(
      { error: "국어 지문은 부분 분석을 지원하지 않습니다" },
      { status: 400 },
    );
  }
  // 파이널 원페이지는 국어(PRIME_KO) v1 미지원(스펙 F7) — 같은 이유로 잡 생성 전 차단.
  if (finalOnepage && isKoreanPassage(passage)) {
    return NextResponse.json(
      { error: "국어 지문은 파이널 원페이지를 지원하지 않습니다" },
      { status: 400 },
    );
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "PASSAGE_ANALYSIS",
    passageId: passage.id,
  });

  const active = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
      passageId: passage.id,
      status: { in: ["PENDING", "PROCESSING"] },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true },
  });
  if (active) {
    // 이 경로는 LLM 을 한 번도 부르지 않으므로 델타가 0프레임이다. 스트림 요청이면
    // 사유를 담은 phase 프레임을 1회 흘려 패널이 마운트되게 한다 — 그러지 않으면
    // 사용자에겐 "스트리밍이 고장난 것"으로 보인다(26-07-25 실사고).
    if (emit !== NOOP_EMIT) {
      emit({ t: "phase", label: "이미 진행 중인 분석에 연결됨" });
    }
    return NextResponse.json({
      jobId: active.id,
      status: active.status,
      createdAt: active.createdAt.toISOString(),
      fastPath: false,
      attachedToExisting: true,
    });
  }

  const now = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      generationPlan,
      requestedCount: 1,
      startedAt: now,
      config: {
        customPrompt: parsed.data.customPrompt ?? "",
        focusAreas: parsed.data.focusAreas ?? [],
        targetLevel: parsed.data.targetLevel ?? "",
        generationPlan,
        analysisTone,
        includeWorksheet,
        fastPath: true,
        // 파이널 원페이지 잡 표식(스펙 §2) — 재시도·워커 승격 시 parse 복원용.
        // 부재 시 키 자체가 실리지 않는다(기존 잡 config 무회귀).
        ...(finalOnepage ? { finalOnepage: true } : {}),
        // §3.4.1-9·11: 스튜디오(getStudioPassageDetail)가 진행 중 잡의 대상 섹션·발사
        // 카드를 읽어 그 카드만 "생성 중"으로 표시한다. 전체 분석은 필드 자체가 없다(무회귀).
        ...(targetSections ? { targetSections } : {}),
        ...(targetSections && parsed.data.sourceModule
          ? { sourceModule: parsed.data.sourceModule }
          : {}),
      },
    },
  });

  const currentHash = hashContent(passage.content);
  // 청구액 스레딩(§3.4.1-3): 부분 요청은 종량제 금액으로 아래에서 덮어쓴다. 환불 3경로
  // (품질 게이트·최외곽 catch)가 전부 이 변수를 써야 부분 요청 오환불이 없다 —
  // catch 에서 정액을 재계산하면 1크레딧 청구에 5크레딧 환불이 난다.
  let chargedCost = getPassageAnalysisCreditCost({ includeWorksheet });
  let creditTxId: string | null = null;
  let creditMs = 0;
  let generationMs = 0;
  let generationStartedAt: number | null = null;
  let persistenceMs = 0;
  let resilientCheckpoint: ResilientCheckpoint | null = null;

  // ── PRIME_KO 게이트: 국어 지문은 KO 회복형 생성기·PRIME_KO 마커로만 처리 ──────
  // 영어 분석기·derive-legacy(PassageAnalysis 파생)·실전 학습지로 절대 흐르지 않는다.
  // 자기완결 블록(자체 과금/환불/잡 상태) — 아래 영어 경로는 무변경.
  if (isKoreanPassage(passage)) {
    const koCreditCost = getPassageAnalysisCreditCost({ includeWorksheet: false });
    let koCreditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId: job.id,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: { passageId: passage.id, generationPlan, koPrime: true, creditCost: koCreditCost, fastPath: true },
        creditCost: koCreditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      koCreditTxId = credit.transactionId;

      generationStartedAt = Date.now();
      const koResilient = await generateKoAnalysisReportResilient(
        buildKoPromptInputFromPassage({
          content: passage.content,
          tags: passage.tags,
          grade: passage.grade,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          customPrompt: parsed.data.customPrompt,
        }),
        {
          contentHash: currentHash,
          deadlineAt: requestStartedAt + 255_000,
          // 영어 경로와 동형 — 폴백은 반드시 KO 기본 구현이어야 한다
          // (영어 defaultLlmText 를 넣으면 logPrefix·재시도 정책이 KO 계약과 어긋남).
          llmText:
            emit === NOOP_EMIT
              ? undefined
              : createStreamingLlmText({ emit, fallback: koDefaultLlmText }),
        },
      );
      generationMs = Date.now() - generationStartedAt;

      // KO LLM 호출 토큰·실측 원가 합산 기록(플랫폼 원가 추적 — 영어 경로와 parity).
      const koTokens = koResilient.usages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (koTokens.input > 0 || koTokens.output > 0) {
        const koModelId = koResilient.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:analysis`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS",
          academyId: job.academyId,
          provider: providerFromModel(koModelId),
          model: koModelId,
          inputTokens: koTokens.input,
          outputTokens: koTokens.output,
          recordedCostUsd: koTokens.costUsd > 0 ? koTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, koPrime: true, fastPath: true, calls: koResilient.usages.length },
        });
      }

      // 품질 게이트 — 개관 폴백이거나 목표 섹션 절반 미만이면 환불 + FAILED.
      const targetsCount = koResilient.completeness.present.length + koResilient.completeness.missing.length;
      const koDegraded =
        koResilient.completeness.fallback.includes("ko-overview") ||
        koResilient.completeness.present.length < Math.ceil(targetsCount / 2);
      if (koDegraded) {
        if (koCreditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            koCreditTxId,
            "PRIME_KO analysis incomplete — refunded",
            koCreditCost,
          ).catch((refundErr) => console.error("PRIME_KO incomplete refund failed", refundErr));
        }
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: "일시적인 AI 문제로 국어 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
            result: JSON.parse(JSON.stringify({
              koPrime: true,
              resilient: {
                complete: koResilient.completeness.complete,
                present: koResilient.completeness.present,
                missing: koResilient.completeness.missing,
                fallback: koResilient.completeness.fallback,
                rounds: koResilient.rounds,
              },
            })),
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          {
            error: "Passage analysis incomplete",
            code: "PASSAGE_ANALYSIS_INCOMPLETE",
            details: "일시적인 AI 문제로 국어 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
            completeness: koResilient.completeness,
          },
          { status: 502 },
        );
      }

      await saveKoPrimeReport(prisma, {
        academyId: passage.academyId,
        passageId: passage.id,
        staffId: staff.id,
        report: koResilient.report,
      });

      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: 0,
        creditMs,
        generationMs,
        persistenceMs: 0,
        totalRunMs: Date.now() - requestStartedAt,
        cached: false,
        fastPath: true,
      };
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          successCount: 1,
          failedCount: 0,
          resultCount: 1,
          result: JSON.parse(JSON.stringify({
            cached: false,
            passageId: passage.id,
            generationPlan,
            koPrime: true,
            debugTiming,
            fastPath: true,
            resilient: {
              complete: koResilient.completeness.complete,
              present: koResilient.completeness.present,
              missing: koResilient.completeness.missing,
              fallback: koResilient.completeness.fallback,
              rounds: koResilient.rounds,
              draftUsed: koResilient.draftUsed,
            },
          })),
          completedAt,
        },
      });
      return NextResponse.json({
        jobId: job.id,
        status: "COMPLETED",
        data: null,
        koPrime: true,
        cached: false,
        generationPlan,
        creditsRemaining: credit.balanceAfter,
        createdAt: job.createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        debugTiming,
        fastPath: true,
      });
    } catch (koErr) {
      if (koErr instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${koErr.currentBalance}, need ${koErr.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { error: "Insufficient credits", balance: koErr.currentBalance, required: koErr.requiredCredits },
          { status: 402 },
        );
      }
      if (koCreditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          koCreditTxId,
          "PRIME_KO fast passage analysis failed",
          koCreditCost,
        ).catch((refundErr) => console.error("PRIME_KO fast refund failed", refundErr));
      }
      const classified = classifyAnalysisError(koErr);
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Passage analysis failed", details: classified.message, code: classified.code },
        { status: classified.status },
      );
    }
  }

  // ── 파이널 원페이지 게이트: final 요청은 전용 생성기·PRIME_FINAL 마커로만 처리 ──
  // 기본 분석·실전 학습지·캐시 단락으로 절대 흐르지 않는다(항상 신선 생성). PassageAnalysis
  // 파생도 기록하지 않는다(스펙 F2 — 기본 분석 캐시 보존). PRIME_KO 게이트와 동형의
  // 자기완결 블록(자체 과금/환불/잡 상태) — 아래 영어 경로는 무변경.
  if (finalOnepage) {
    const finalCreditCost = getPassageAnalysisCreditCost({ includeWorksheet: false });
    let finalCreditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId: job.id,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: { passageId: passage.id, generationPlan, finalOnepage: true, creditCost: finalCreditCost, fastPath: true },
        creditCost: finalCreditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      finalCreditTxId = credit.transactionId;

      // 비스트리밍 생성(단일 LLM 콜) — 델타 배선 없이 phase 라벨만 흘려 미리보기 패널
      // 마운트를 보장한다(0프레임이면 스트리밍 고장으로 보인다 — 26-07-25 실사고 참고).
      if (emit !== NOOP_EMIT) {
        emit({ t: "phase", label: "파이널 원페이지 생성 중" });
      }

      // 필기 주석·강사 지시 병합 — 기존 영어 경로와 동일 규칙.
      const persistedAnns = await loadPersistedAnnotations(passage.id);
      const annotationPrompt =
        persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
      const mergedPrompt = [annotationPrompt, parsed.data.customPrompt]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .join("\n\n");
      // brand = 학원명 — 구식 생성 라우트(prime/[passageId] POST)와 동일 규약. 없으면 생성기 기본값.
      const academy = await prisma.academy.findUnique({
        where: { id: staff.academyId },
        select: { name: true },
      });

      generationStartedAt = Date.now();
      const finalResult = await generateFinalOnepageReport(
        {
          passageContent: passage.content,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          grade: passage.grade,
          customPrompt: mergedPrompt || undefined,
          ...(academy?.name ? { brand: academy.name } : {}),
        },
        // luna(102~130s/시도) 전환으로 예산 최대화 — maxDuration 300s 벽에서 30s만
        // 남긴다(질문생성 fast 의 270s 선례). 파이널 후처리는 upsert 1건이라 충분.
        { deadlineAt: requestStartedAt + 270_000 },
      );
      generationMs = Date.now() - generationStartedAt;

      // 품질 게이트 실패(F5·F6·수리 2회 소진) — 전액 환불 + FAILED(502).
      if (!finalResult.ok) {
        if (finalCreditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            finalCreditTxId,
            "PRIME_FINAL onepage incomplete — refunded",
            finalCreditCost,
          ).catch((refundErr) => console.error("PRIME_FINAL incomplete refund failed", refundErr));
        }
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage:
              "일시적인 AI 문제로 파이널 원페이지를 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
            result: JSON.parse(JSON.stringify({
              finalOnepage: true,
              error: finalResult.error,
              debugTiming: { queueWaitMs: 0, creditMs, generationMs, persistenceMs: 0, totalRunMs: Date.now() - requestStartedAt, fastPath: true },
            })),
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          {
            error: "Final onepage incomplete",
            code: "PASSAGE_ANALYSIS_INCOMPLETE",
            details: "일시적인 AI 문제로 파이널 원페이지를 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
          },
          { status: 502 },
        );
      }

      // LLM 토큰·실측 원가 기록(플랫폼 원가 추적 — 기존 경로와 parity).
      const finalTokens = readAiUsageTokens(finalResult.usage.usage);
      const finalCost = readAiUsageCost(finalResult.usage.usage);
      if (finalTokens.inputTokens > 0 || finalTokens.outputTokens > 0) {
        const finalModelId = finalResult.usage.modelId || "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:final-onepage`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS_FINAL",
          academyId: job.academyId,
          provider: providerFromModel(finalModelId),
          model: finalModelId,
          inputTokens: finalTokens.inputTokens,
          outputTokens: finalTokens.outputTokens,
          recordedCostUsd: finalCost.costUsd ?? null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, finalOnepage: true, fastPath: true, durationMs: finalResult.usage.durationMs },
        });
      }

      if (emit !== NOOP_EMIT) {
        emit({ t: "phase", label: "파이널 원페이지 저장 중" });
      }

      // PRIME_FINAL 행 upsert(스펙 F3) — 기본 학습지의 PRIME 행과 별도로 지문당 1행,
      // 재생성 = 갱신. 기존 PRIME upsert 패턴(findFirst→update/create) 복제.
      const finalReport = finalResult.report;
      const persistenceStartedAt = Date.now();
      const existingFinal = await prisma.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: "PRIME_FINAL", deletedAt: null },
        select: { id: true },
      });
      const finalRowData = {
        title: finalReport.meta.titleKo,
        status: "PUBLISHED",
        pages: finalReport as never,
        theme: { themeId: finalReport.themeId } as never,
        templateId: "prime-final",
        generationPlan: "PRIME_FINAL",
        lastEditedById: staff.id,
        lastEditedAt: new Date(),
      };
      if (existingFinal) {
        await prisma.passageReport.update({ where: { id: existingFinal.id }, data: { ...finalRowData, version: { increment: 1 } } });
      } else {
        await prisma.passageReport.create({ data: { academyId: passage.academyId, passageId: passage.id, createdById: staff.id, ...finalRowData } });
      }
      persistenceMs = Date.now() - persistenceStartedAt;

      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: 0,
        creditMs,
        generationMs,
        persistenceMs,
        totalRunMs: Date.now() - requestStartedAt,
        cached: false,
        fastPath: true,
      };
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          successCount: 1,
          failedCount: 0,
          resultCount: 1,
          result: JSON.parse(JSON.stringify({
            cached: false,
            passageId: passage.id,
            generationPlan,
            finalOnepage: true,
            debugTiming,
            fastPath: true,
          })),
          completedAt,
        },
      });
      return NextResponse.json({
        jobId: job.id,
        status: "COMPLETED",
        data: null,
        finalOnepage: true,
        cached: false,
        generationPlan,
        creditsRemaining: credit.balanceAfter,
        createdAt: job.createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        debugTiming,
        fastPath: true,
      });
    } catch (finalErr) {
      if (finalErr instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${finalErr.currentBalance}, need ${finalErr.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { error: "Insufficient credits", balance: finalErr.currentBalance, required: finalErr.requiredCredits },
          { status: 402 },
        );
      }
      if (finalCreditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          finalCreditTxId,
          "PRIME_FINAL fast passage analysis failed",
          finalCreditCost,
        ).catch((refundErr) => console.error("PRIME_FINAL fast refund failed", refundErr));
      }
      const classified = classifyAnalysisError(finalErr);
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Passage analysis failed", details: classified.message, code: classified.code },
        { status: classified.status },
      );
    }
  }

  try {
    // ── 부분 분석 플랜(§3.4.1-1·2) ─────────────────────────────────────────
    // 부분 요청은 아래 전체-분석 캐시 단락을 타지 않는다 — 대신 여기서 보유 섹션을
    // 산출해 "missing=∅ → 이미 준비됨"을 자체 단락으로 처리한다.
    // 신선도(스펙 스테일 규칙·검수 M5): PassageAnalysis 행이 없거나 contentHash ≠ 현재
    // 본문 해시면 스테일 — 행 부재 = 검증 불가 = 스테일(getStudioPassageDetail 과 동일
    // 술어). 행 부재를 신선 취급하면 카드는 "needs·N크레딧"인데 라우트는 0크레딧 즉시
    // 완료로 갈려 카드가 영구 교착한다.
    let plan: PartialAnalysisPlan | null = null;
    let freshReport: AnalysisReport | null = null;
    if (targetSections) {
      const primeRow = await prisma.passageReport.findFirst({
        where: {
          passageId: passage.id,
          academyId: passage.academyId,
          generationPlan: "PRIME",
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { pages: true },
      });
      if (primeRow && passage.analysis?.contentHash === currentHash) {
        const parsedPrime = analysisReportSchema.safeParse(primeRow.pages);
        if (parsedPrime.success) freshReport = parsedPrime.data;
      }
      plan = computePartialAnalysisPlan({ targetSections, freshReport });
      chargedCost = plan.creditCost;

      if (plan.missing.length === 0) {
        // 요청 섹션을 이미 전부 보유 — 과금·LLM 없이 즉시 완료(§3.4.1-2).
        // LLM 0프레임 경로라 스트림 요청이면 phase 1회로 패널 마운트를 보장한다
        // (기존 캐시 단락과 동형 — 26-07-25 실사고 참고).
        if (emit !== NOOP_EMIT) {
          emit({ t: "phase", label: "이미 준비된 분석 불러오는 중" });
        }
        const completedAt = new Date();
        const debugTiming = {
          queueWaitMs: 0,
          creditMs: 0,
          generationMs: 0,
          persistenceMs: 0,
          totalRunMs: Date.now() - requestStartedAt,
          cached: true,
          fastPath: true,
        };
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: JSON.parse(JSON.stringify({
              alreadyPrepared: true,
              partial: true,
              cached: true,
              passageId: passage.id,
              generationPlan,
              analysisTone,
              targetSections: plan.targets,
              sectionsGenerated: [],
              creditCost: 0,
              debugTiming,
              fastPath: true,
            })),
            completedAt,
          },
        });
        return NextResponse.json({
          jobId: job.id,
          status: "COMPLETED",
          data: null,
          alreadyPrepared: true,
          partial: true,
          targetSections: plan.targets,
          sectionsGenerated: [],
          creditCost: 0,
          cached: true,
          generationPlan,
          analysisTone,
          createdAt: job.createdAt.toISOString(),
          completedAt: completedAt.toISOString(),
          debugTiming,
          fastPath: true,
          skippedGeneration: true,
        });
      }
    }

    // 실전 학습지 포함 요청은 캐시 단락을 타지 않는다 — 사용자가 명시적으로
    // "기본 + 실전" 풀 생성을 선택한 것이므로 항상 신선하게 생성한다.
    // 부분 요청(targetSections)도 타지 않는다 — 위 자체 단락이 대체한다(§3.4.1-2).
    //
    // ⚠ PRIME 리포트 존재가 캐시 단락의 **필수 조건**이다(26-08-15 실측 확정,
    //    docs/class-studio-spec.md §3.10.19 E19-11).
    //    이 단락은 PassageAnalysis(파생 캐시)만 보고 응답하면서 PassageReport(PRIME,
    //    = 사용자가 말하는 "학습지")는 **만들지 않는다**. 그래서 "분석 캐시는 신선한데
    //    PRIME 행이 없는" 지문은 몇 번을 요청해도 COMPLETED·cached=true·차감 0 으로
    //    끝나고 학습지가 영원히 생기지 않았다 — 실DB 표본 400개 중 **208개(52%)** 가
    //    이 상태였고, 실제 POST 로 재현 확인했다(리포트 0개, 잔액 불변).
    //    캐시 단락은 "산출물이 이미 있을 때 재생성을 아끼는 것"이 목적이므로,
    //    산출물이 없으면 단락해서는 안 된다.
    const primeReportExists =
      (await prisma.passageReport.count({
        where: {
          passageId: passage.id,
          academyId: passage.academyId,
          generationPlan: "PRIME",
          deletedAt: null,
        },
      })) > 0;
    if (
      !includeWorksheet &&
      !targetSections &&
      primeReportExists &&
      passage.analysis &&
      passage.analysis.contentHash === currentHash
    ) {
      const cachedAnalysis = JSON.parse(passage.analysis.analysisData);
      if (shouldUseCachedAnalysis(cachedAnalysis, generationPlan, analysisTone)) {
        // LLM 을 부르지 않는 경로다. 가짜 사고 프레임은 만들지 않는다(허위 표시) —
        // 대신 "캐시를 썼다"는 사실만 1회 알린다. tail 은 비어 있다.
        if (emit !== NOOP_EMIT) {
          emit({ t: "phase", label: "저장된 분석 불러오는 중" });
        }
        const completedAt = new Date();
        const debugTiming = {
          queueWaitMs: 0,
          creditMs: 0,
          generationMs: 0,
          persistenceMs: 0,
          totalRunMs: Date.now() - requestStartedAt,
          cached: true,
          fastPath: true,
        };

        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: JSON.parse(JSON.stringify({
              cached: true,
              passageId: passage.id,
              generationPlan,
              analysisTone,
              debugTiming,
              fastPath: true,
            })),
            completedAt,
          },
        });

        return NextResponse.json({
          jobId: job.id,
          status: "COMPLETED",
          data: cachedAnalysis,
          cached: true,
          generationPlan,
          analysisTone: getAnalysisTone(cachedAnalysis) || analysisTone,
          createdAt: job.createdAt.toISOString(),
          completedAt: completedAt.toISOString(),
          debugTiming,
          fastPath: true,
          skippedGeneration: true,
        });
      }
    }

    // 실전 학습지는 옵트인 라우트(prime/[passageId]/worksheet)와 동일 단가.
    // 부분 요청은 종량제 금액(chargedCost=plan.creditCost)이 위에서 스레딩돼 온다.
    const worksheetCost = getPassageAnalysisWorksheetCreditCost(includeWorksheet);
    const creditStartedAt = Date.now();
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType: "PASSAGE_ANALYSIS",
      metadata: {
        passageId: passage.id,
        generationPlan,
        analysisTone,
        creditCost: chargedCost,
        includeWorksheet,
        fastPath: true,
        ...(plan ? { partial: true, targetSections: plan.targets } : {}),
      },
      creditCost: chargedCost,
    });
    creditMs = Date.now() - creditStartedAt;
    creditTxId = credit.transactionId;

    const persistedAnns = await loadPersistedAnnotations(passage.id);
    const annotationPrompt =
      persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
    const mergedPrompt = [annotationPrompt, parsed.data.customPrompt]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join("\n\n");

    generationStartedAt = Date.now();
    // 회복형 생성: 전체 초안으로 통과 섹션을 부분 구제 → 실패/누락 섹션만 정확히 골라
    // 섹션 단위로 다시 생성(직전 실패를 교정 지시로 주입) → 완성된 섹션은 건너뛰고
    // 진전마다 체크포인트를 남겨 다음 시도가 이어받게 하며, 필수(passage)는 무조건 채워
    // 항상 렌더 가능한 보고서를 완성한다. (기존 all-or-nothing generateAnalysisReportCore 대체)
    const priorCheckpoint = await loadPriorCheckpoint(prisma, {
      academyId: staff.academyId,
      passageId: passage.id,
      contentHash: currentHash,
      excludeJobId: job.id,
    });
    // 부분 요청(§3.4.1-4): 보유 섹션을 체크포인트로 시드(리포트가 선행 잡 체크포인트에
    // 우선)해 생성기가 스킵하게 하고, targetKinds = 보유 ∪ 요청 — 시드 섹션이 재검증·
    // 완성도 집계에 포함되고 부족분만 섹션 단위로 생성된다. 문장 번호 정합은 시드된
    // passage 기준 reconcileSentenceRefs 가 보장한다. 전체 요청은 기존 값 그대로.
    const seedCheckpoint = plan
      ? buildSeedCheckpoint({ freshReport, prior: priorCheckpoint, contentHash: currentHash })
      : priorCheckpoint;
    let partialTargetKinds: SectionKind[] | null = null;
    if (plan) {
      const wanted = new Set<SectionKind>([...plan.targets, ...plan.present]);
      partialTargetKinds = FULL_ANALYSIS_SECTIONS.filter((k) => wanted.has(k));
    }
    // 26-08-12 luna 전환: 코어 엔진이 parallel(기본)이면 섹션들이 동시 생성되므로
    // 델타 스트리밍(단일 텍스트 줄기)을 걸 수 없다 — 대신 onPhase 로 섹션 시작 이벤트를
    // 흘려 로딩 카드가 진행 단계를 표시한다. draft 롤백(env=draft) 시 기존 델타
    // 스트리밍 그대로 복원.
    const coreEngine = worksheetCoreEngine();
    const resilient = await generateAnalysisReportResilient(
      {
        passageContent: passage.content,
        schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: passage.grade,
        customPrompt: mergedPrompt || undefined,
      },
      {
        contentHash: currentHash,
        // Vercel maxDuration(300s) 벽 안에서 마치고 부분 결과를 남기도록 데드라인을 둔다.
        // 실전 학습지(includeWorksheet)까지 한 요청에서 생성하면 코어 뒤로 워크북+추론
        // 호출이 더 붙으므로, 코어 데드라인을 낮춰 학습지 몫(≈135s)을 벽 안에 남겨 둔다.
        deadlineAt: requestStartedAt + (includeWorksheet ? 150_000 : 255_000),
        checkpoint: seedCheckpoint,
        ...(partialTargetKinds ? { targetKinds: partialTargetKinds } : {}),
        engine: coreEngine,
        // 스트리밍 요청 + draft 엔진일 때만 게이트웨이 SSE 를 직접 읽는 구현으로 갈아끼운다.
        // 실패 시 defaultLlmText 로 폴백하므로 생성 성공률은 무회귀(stream-llm.ts).
        llmText:
          emit === NOOP_EMIT || coreEngine === "parallel"
            ? undefined
            : createStreamingLlmText({ emit, fallback: defaultLlmText }),
        // draft 롤백 시엔 createStreamingLlmText 가 자체 phase 를 이미 흘리므로 중복 방지.
        ...(emit === NOOP_EMIT || coreEngine === "draft"
          ? {}
          : { onPhase: (label: string) => emit({ t: "phase", label: analysisPhaseLabel(label) }) }),
        // promise 를 반환해 resilient 가 await — fire-and-forget 시 지연 쓰기가 최종
        // COMPLETED 결과를 덮어쓰는 레이스를 차단(쓰기 직렬화).
        onCheckpoint: (cp) => {
          resilientCheckpoint = cp;
          return persistCheckpoint(prisma, job.id, cp);
        },
      },
    );
    generationMs = Date.now() - generationStartedAt;
    // 부분 요청(§3.4.1-6): 신선본 기준 3중 보존 병합 — 비분석 섹션(self-check)·기보유
    // 분석 섹션 되살림·실전 학습지 필드 오버레이(strip 소거 복원, 검수 M1). 스테일 본은
    // 어떤 섹션도 얹지 않는다(구본문 문항의 학생 서빙 금지 — 스펙 스테일 규칙, 검수 M6).
    let primeReport = plan
      ? mergeReportPreservingExtras(resilient.report, freshReport)
      : resilient.report;

    // 회복형 분석의 모든 LLM 호출(초안+섹션) 토큰을 합산해 비용 회계에 기록 — 기존
    // 단일 호출 회계와 parity. (사용자 과금이 아니라 플랫폼 원가 추적용.)
    const analysisTokens = resilient.usages.reduce(
      (acc, u) => {
        const t = readAiUsageTokens(u.usage);
        const c = readAiUsageCost(u.usage);
        acc.input += t.inputTokens;
        acc.output += t.outputTokens;
        if (c.costUsd) acc.costUsd += c.costUsd;
        return acc;
      },
      { input: 0, output: 0, costUsd: 0 },
    );
    if (analysisTokens.input > 0 || analysisTokens.output > 0) {
      const usageModelId = resilient.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:analysis`,
        sourceId: job.id,
        sourceDetail: "PASSAGE_ANALYSIS",
        academyId: job.academyId,
        provider: providerFromModel(usageModelId),
        model: usageModelId,
        inputTokens: analysisTokens.input,
        outputTokens: analysisTokens.output,
        recordedCostUsd: analysisTokens.costUsd > 0 ? analysisTokens.costUsd : null,
        usageAt: new Date(),
        metadata: { passageId: passage.id, generationPlan, fastPath: true, calls: resilient.usages.length },
      });
    }

    // 품질 게이트: 본문(passage)이 결정론 폴백이거나 확보 섹션이 너무 적으면(=AI 사실상 실패)
    // COMPLETED·과금하지 않고 환불 + FAILED 로 흘린다. 체크포인트는 보존돼 재시도가 완성분을 이어받는다.
    // 부분 요청은 대체 게이트(§3.4.1-5): 돈 받은 missing 중 하나라도 미완성이면 부분 성공
    // 어중간 과금 금지 — 전액 환불. (present<4 기준은 전체 분석 전용이라 쓰지 않는다.)
    const degraded = plan
      ? resilient.completeness.fallback.includes("passage") ||
        plan.missing.some((k) => !resilient.completeness.present.includes(k))
      : resilient.completeness.fallback.includes("passage") ||
        resilient.completeness.present.length < 4;
    if (degraded) {
      if (creditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          creditTxId,
          "Resilient passage analysis incomplete — refunded",
          chargedCost,
        ).catch((refundErr) => console.error("Fast analysis incomplete refund failed", refundErr));
      }
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage:
            "일시적인 AI 문제로 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도하면 만들어 둔 부분을 이어서 완성합니다.",
          result: JSON.parse(JSON.stringify({
            debugTiming: { queueWaitMs: 0, creditMs, generationMs, persistenceMs: 0, totalRunMs: Date.now() - requestStartedAt, fastPath: true },
            checkpoint: resilientCheckpoint,
            partial: true,
            resilient: {
              complete: resilient.completeness.complete,
              present: resilient.completeness.present,
              missing: resilient.completeness.missing,
              fallback: resilient.completeness.fallback,
              rounds: resilient.rounds,
            },
          })),
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Passage analysis incomplete",
          code: "PASSAGE_ANALYSIS_INCOMPLETE",
          details: "일시적인 AI 문제로 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
          completeness: resilient.completeness,
        },
        { status: 502 },
      );
    }

    // ── 실전 학습지 한 번에 생성 (옵트인) ──────────────────────────────
    // 기본 분석 성공 후 워크북(어법 선택·어휘 빈칸·배열) + 수능추론을 생성해
    // learning-worksheet 섹션을 풀 콘텐츠로 교체한다. 워크시트만 실패하면
    // 기본 학습지는 그대로 저장하고 워크시트 몫만 환불한다.
    let worksheetFailed = false;
    if (includeWorksheet) {
      // 학습지도 코어와 동일한 회복형 — 워크북·수능추론 유닛을 다중 라운드로 끝까지 완성한다.
      // 같은 300s 벽을 공유하므로 데드라인(285s)을 두고 내부 호출이 self-abort 하게 한다.
      const worksheet = await generateLearningWorksheetResilient(
        {
          passageContent: passage.content,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          grade: passage.grade,
        },
        primeReport,
        {
          deadlineAt: requestStartedAt + 285_000,
          // 코어와 동일하게 스트리밍 요청일 때만 델타를 흘린다 — 학습지 단계에서
          // 미리보기 패널이 멈춘 것처럼 보이지 않게 한다(워크북·추론 2콜).
          stream: emit === NOOP_EMIT ? undefined : { emit },
        },
      );
      // 유효한 학습지 섹션일 때만 교체한다. null(유효한 학습지 생성 실패)이면 기존 코어
      // learning-worksheet(있으면)를 그대로 두거나 섹션을 비운다 — 무효 섹션 저장 금지.
      if (worksheet.section) {
        primeReport = {
          ...primeReport,
          sections: [
            ...primeReport.sections.filter((s) => s.kind !== "learning-worksheet"),
            worksheet.section,
          ],
        } as AnalysisReport;
      }
      // 학습지 LLM 호출(워크북+추론, 라운드별) 토큰 합산 기록.
      const wsTokens = worksheet.usages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (wsTokens.input > 0 || wsTokens.output > 0) {
        const wsModelId = worksheet.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:worksheet`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS_WORKSHEET",
          academyId: job.academyId,
          provider: providerFromModel(wsModelId),
          model: wsModelId,
          inputTokens: wsTokens.input,
          outputTokens: wsTokens.output,
          recordedCostUsd: wsTokens.costUsd > 0 ? wsTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, fastPath: true, calls: worksheet.usages.length },
        });
      }
      // 두 유닛 모두 못 만든 경우(=실전 학습지 가치 전무)에만 워크시트 몫 환불. 부분(워크북/추론
      // 하나라도 확보)은 제공된 것으로 본다. 기본 분석은 항상 그대로 저장된다.
      if (worksheet.present.length === 0) {
        worksheetFailed = true;
        if (creditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            creditTxId,
            "실전 학습지 생성 실패 — 기본 학습지는 저장, 워크시트 몫 환불",
            worksheetCost,
          ).catch((refundErr) => console.error("Fast analysis worksheet refund failed", refundErr));
        }
      }
    }

    // 카드/문제생성 호환용 파생 데이터 (별도 LLM 호출 없음)
    const analysisData = derivePassageAnalysisFromReport(primeReport);
    // 부분 분석 마커(§3.4.1-7): 병합 리포트의 분석 섹션이 7종 미만이면 보유 kind 를 기록 —
    // shouldUseCachedAnalysis 가 이걸 보고 "캐시 완료" 오탐을 막는다. 전체 분석 경로는
    // 마커를 쓰지 않는다(기존 데이터·동작 불변).
    if (plan) {
      const held = new Set(primeReport.sections.map((s) => s.kind).filter(isSectionKind));
      if (held.size < FULL_ANALYSIS_SECTIONS.length) {
        (analysisData as unknown as Record<string, unknown>)._partialSections =
          FULL_ANALYSIS_SECTIONS.filter((k) => held.has(k));
      }
    }

    const persistenceStartedAt = Date.now();
    await prisma.$transaction(async (tx) => {
      // 1) PRIME 보고서 저장/갱신 (모달이 읽어 A4 렌더)
      const existingPrime = await tx.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: "PRIME", deletedAt: null },
        select: { id: true },
      });
      const primeData = {
        title: primeReport.meta.titleKo,
        status: "PUBLISHED",
        pages: primeReport as never,
        theme: { themeId: primeReport.themeId } as never,
        templateId: "prime",
        generationPlan: "PRIME",
        lastEditedById: staff.id,
        lastEditedAt: new Date(),
      };
      if (existingPrime) {
        await tx.passageReport.update({ where: { id: existingPrime.id }, data: { ...primeData, version: { increment: 1 } } });
      } else {
        await tx.passageReport.create({ data: { academyId: passage.academyId, passageId: passage.id, createdById: staff.id, ...primeData } });
      }
      // 2) 파생 PassageAnalysis (지문 카드 칩·문제생성 컨텍스트 호환)
      await tx.passageAnalysis.upsert({
        where: { passageId: passage.id },
        update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
        create: { passageId: passage.id, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      });
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const completedAt = new Date();
    const debugTiming = {
      queueWaitMs: 0,
      creditMs,
      generationMs,
      persistenceMs,
      totalRunMs: Date.now() - requestStartedAt,
      cached: false,
      fastPath: true,
    };

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: 1,
        failedCount: 0,
        resultCount: 1,
        result: JSON.parse(JSON.stringify({
          cached: false,
          passageId: passage.id,
          generationPlan,
          analysisTone,
          includeWorksheet,
          worksheetFailed,
          debugTiming,
          fastPath: true,
          // 부분 분석 기록(§3.4.1-9) — 실제 새로 생성한 섹션(=missing)과 청구액.
          ...(plan
            ? {
                partial: true,
                targetSections: plan.targets,
                sectionsGenerated: plan.missing,
                creditCost: plan.creditCost,
              }
            : {}),
          // 회복형 생성 진단 — 어느 섹션을 부분구제/재생성/폴백했는지, 완성 여부.
          resilient: {
            complete: resilient.completeness.complete,
            present: resilient.completeness.present,
            missing: resilient.completeness.missing,
            fallback: resilient.completeness.fallback,
            rounds: resilient.rounds,
            draftUsed: resilient.draftUsed,
          },
        })),
        completedAt,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: "COMPLETED",
      data: analysisData,
      cached: false,
      generationPlan,
      analysisTone,
      includeWorksheet,
      worksheetFailed,
      creditsRemaining: credit.balanceAfter,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      debugTiming,
      fastPath: true,
      ...(plan
        ? {
            partial: true,
            targetSections: plan.targets,
            sectionsGenerated: plan.missing,
            creditCost: plan.creditCost,
          }
        : {}),
    });
  } catch (err) {
    if (generationStartedAt !== null && generationMs === 0) {
      generationMs = Date.now() - generationStartedAt;
    }

    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }

    // 청구 총액(분석 + 옵트인 워크시트 몫) 그대로 환불 — 부분 환불은 위의
    // worksheetFailed 경로에서만 발생하고, 여기는 기본 분석 자체가 실패한 경우다.
    // 금액은 스레딩된 chargedCost(§3.4.1-3) — 부분 요청에서 정액 재계산은 오환불이다.
    if (creditTxId) {
      await refundCredits(
        job.academyId,
        "PASSAGE_ANALYSIS",
        creditTxId,
        "Fast workbench passage analysis failed",
        chargedCost,
      ).catch((refundErr) => {
        console.error("Fast passage analysis refund failed", refundErr);
      });
    }

    const classified = classifyAnalysisError(err);
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: classified.message,
        result: JSON.parse(JSON.stringify({
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
            fastPath: true,
          },
          // 부분 진행분 보존 — 다음 시도가 완성된 섹션을 건너뛰고 이어받게.
          ...(resilientCheckpoint ? { checkpoint: resilientCheckpoint, partial: true } : {}),
        })),
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Passage analysis failed", details: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}
