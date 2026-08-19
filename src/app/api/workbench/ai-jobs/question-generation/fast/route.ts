import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import { academyConcurrencyKey } from "@/lib/concurrency-config";
import {
  isKoreanSubject,
  readKoKindFromTags,
} from "@/lib/korean/core/passage-meta";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import {
  providerFromModel,
  readAiUsageCost,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  getQuestionGenerationCreditCost,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  resolveEffectiveGenerationPlan,
} from "@/lib/question-generation-plans";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import {
  closeQuestionGenerationAssignmentBudget,
  runWithQuestionGenerationAssignmentBudget,
} from "@/lib/question-generation-assignment-budget";
import { type PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import { toUserFacingQuestionGenerationError } from "@/lib/question-generation-llm";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import { preflightQuestionFeasibility } from "@/lib/question-quality";
import {
  buildQuestionDiversityContext,
  normalizeDiversityComparable,
  type QuestionDiversityContext,
} from "@/lib/question-diversity";
import {
  clampTeacherPoints,
  type TeacherPointPayload,
} from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import {
  readQuestionTypeDifficultySetting,
  readIrrelevantSlotCountSetting,
  validateIrrelevantAgainstPassage,
} from "@/lib/question-type-generation-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s = 같은 앱의 다른 무거운 inline 경로(passage-analysis/fast·question-set·
// generate-questions-auto)와 동일. PREMIUM(Claude)은 1회 ~25~35s, 긴/어려운 지문은
// 교정 재시도+relaxed 폴백까지 다회 필요해 120s로는 데드라인에 잘려 실패했다.
export const maxDuration = 300;

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

const requestSchema = z.object({
  passageId: z.string().min(1),
  mode: z.literal("MANUAL").default("MANUAL"),
  count: z.number().int().min(1).max(1).default(1),
  questionType: z.string().optional(),
  questionTypeSettings: z.unknown().optional(),
  difficulty: z.string().default("INTERMEDIATE"),
  customPrompt: z.string().optional(),
  generationPlan: z.unknown().optional(),
  // 같은 배치에서 병렬 생성되는 N개 중 몇 번째인지 — 다양성(타깃/정답 위치 분산)용.
  variantIndex: z.number().int().min(0).max(99).optional(),
  variantCount: z.number().int().min(1).max(99).optional(),
  // 낙관적 temp 의 id(클라이언트 nonce). config 에 그대로 저장했다 DB 폴링이 되읽어,
  // 큐 병합 때 temp↔DB 행을 설정 시그니처가 아닌 이 값으로 1:1 매칭한다. 같은 지문+유형을
  // 연속/동시 생성해도 카드(지문·빈칸연습)가 섞이지 않게 하는 핵심 식별자.
  clientTempId: z.string().min(1).max(200).optional(),
});

function getOperationType({
  questionType,
}: {
  questionType?: string;
}): OperationType {
  return questionType && VOCAB_TYPES.has(questionType)
    ? "QUESTION_GEN_VOCAB"
    : "QUESTION_GEN_SINGLE";
}

function buildManualPlan({
  questionType,
  count,
}: {
  questionType?: string;
  count: number;
}): PlanResult["plan"] {
  if (!questionType) {
    throw new Error("Manual question generation requires questionType.");
  }
  return [
    {
      subType: questionType,
      count,
      reason: "Manual teacher-selected question type.",
      targetPoints: [],
    },
  ];
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  operationType: OperationType;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter 실측 청구액(USD) — 있으면 RECORDED 단가로 기록. */
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
      operationType: input.operationType,
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      recordedCostUsd: input.recordedCostUsd,
      usageAt: input.usageAt,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[workbench-fast-question] Failed to record API cost", error);
  }
}

// ── 교사 지정 포인트 × 다양성 자기모순 차단 (point-picker-design.md §2-⑤) ────
// "포인트 짚어주기"로 교사가 지정한 quote 는 생성 프롬프트에서 "필수 반영" 대상인데,
// 같은 표현이 최근 문항의 usedTargets(회피 목록)에 남아 있으면 "이 타깃을 피하라"와
// "이 타깃을 반드시 쓰라"가 한 프롬프트에 동시에 주입되는 자기모순이 된다.
// 아래 두 헬퍼는 회피 목록에서 교사 quote 와 부분 문자열 포함 관계(정규화 비교)로
// 겹치는 항목만 제외한다. teacherPoints 가 없거나 형태가 어긋나면 diversity 를
// 일절 손대지 않아 기존 동작과 바이트 동일하다.

/**
 * 요청 questionTypeSettings 에서 교사 지정 포인트 quote 들을 방어적으로 읽는다.
 * - 클라 캡 = 서버 클램프 단일 규칙(point-picker-config clampTeacherPoints)을
 *   그대로 재사용해, run-question-generation 이 실제 소비할 포인트 집합과 동일하게
 *   자른다(미등재 유형 → []).
 * - 재앵커링(§2-②, passage.content indexOf 축자 계약)에 실패할 quote 는 프롬프트에
 *   실리지 않으므로 회피 제외 근거가 없다 — 지문에 축자 포함된 것만 반환한다.
 */
function readTeacherPointQuotes(
  questionType: string | undefined,
  typeSettings: unknown,
  passageContent: string,
): string[] {
  if (!questionType) return [];
  if (typeof typeSettings !== "object" || typeSettings === null) return [];
  const raw = (typeSettings as Record<string, unknown>).teacherPoints;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const candidates = raw.filter(
    (point): point is TeacherPointPayload =>
      typeof point === "object" &&
      point !== null &&
      typeof (point as { text?: unknown }).text === "string",
  );
  if (candidates.length === 0) return [];
  const clamped = clampTeacherPoints(questionType, typeSettings, candidates);
  return clamped
    .map((point) => point.text)
    .filter(
      (text) => text.trim().length > 0 && passageContent.includes(text),
    );
}

/**
 * diversity 회피 목록(usedTargets)에서 교사 quote 와 겹치는 항목을 제외한다.
 * 겹침 = 정규화(normalizeDiversityComparable) 후 부분 문자열 포함 관계 양방향 —
 * usedTargets 는 140자 절단("…")될 수 있어 prefix 포함도 잡아야 한다.
 * usedAnswerLabels/usedPointCodes(위치 스티어링 채널)는 타깃 표현 회피가 아니므로
 * 건드리지 않는다. 원본 객체는 불변 — 새 컨텍스트를 만들어 돌려준다.
 */
function excludeTeacherPointsFromDiversity(
  diversity: QuestionDiversityContext,
  quotes: string[],
): QuestionDiversityContext {
  const normalizedQuotes = quotes
    .map((quote) => normalizeDiversityComparable(quote))
    .filter((quote) => quote.length > 0);
  if (normalizedQuotes.length === 0) return diversity;
  const overlapsTeacherQuote = (target: string): boolean => {
    const normalizedTarget = normalizeDiversityComparable(target);
    if (!normalizedTarget) return false;
    return normalizedQuotes.some(
      (quote) =>
        normalizedTarget.includes(quote) || quote.includes(normalizedTarget),
    );
  };
  const bySubType: QuestionDiversityContext["bySubType"] = {};
  for (const [subType, signals] of Object.entries(diversity.bySubType)) {
    bySubType[subType] = {
      ...signals,
      usedTargets: signals.usedTargets.filter(
        (target) => !overlapsTeacherQuote(target),
      ),
    };
  }
  return { ...diversity, bySubType };
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const config = {
    ...parsed.data,
    generationPlan: normalizeQuestionGenerationPlan(parsed.data.generationPlan),
  };
  const effectiveDifficulty =
    config.mode === "MANUAL" && config.questionType
      ? readQuestionTypeDifficultySetting(
          config.questionTypeSettings,
          config.difficulty,
        )
      : readQuestionTypeDifficultySetting(undefined, config.difficulty);
  // 26-08-18 난이도 기반 티어: KILLER → PREMIUM(2배·프리미엄 파이프라인), 그 외
  // STANDARD — 결정 함수 단일 소스(resolveEffectiveGenerationPlan). 요청
  // generationPlan·유형별 저장 설정의 generationPlan 은 서버 미소비(좀비 차단).
  const effectiveGenerationPlan = resolveEffectiveGenerationPlan(
    config.generationPlan,
    effectiveDifficulty,
  );

  if (config.mode === "MANUAL" && !config.questionType) {
    return NextResponse.json(
      { error: "questionType is required for manual generation" },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: config.passageId, academyId: staff.academyId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: { select: { analysisData: true } },
      notes: { orderBy: { order: "asc" } },
    },
  });

  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
    passageId: passage.id,
  });

  // ── IRRELEVANT slot count guardrail (MANUAL mode only) ────────────────
  if (config.mode === "MANUAL" && config.questionType === "IRRELEVANT") {
    const requestedSlotCount = readIrrelevantSlotCountSetting(config.questionTypeSettings);
    const passageSentenceCount = countPassageSentences(passage.content);
    const v = validateIrrelevantAgainstPassage(requestedSlotCount, passageSentenceCount);
    if (!v.ok) {
      return NextResponse.json(
        {
          error: v.error,
          code: "IRRELEVANT_SLOT_COUNT_TOO_HIGH",
          passageSentenceCount,
          requestedSlotCount,
          maxSlotCount: v.effective,
        },
        { status: 400 },
      );
    }
  }

  // ── SHIP-FIRST 사전 적합성 게이트: 기계적 불가(예: SENTENCE_ORDER 문장수 부족)만
  // 차감·잡 생성 전에 거른다. 출제 포인트 품질 판단이 아니라 형식 불가능만 차단. ──
  if (config.mode === "MANUAL") {
    const feas = preflightQuestionFeasibility(
      config.questionType,
      effectiveDifficulty,
      passage.content,
    );
    if (!feas.ok) {
      return NextResponse.json(
        { error: feas.error, code: feas.code, ...feas.detail },
        { status: 400 },
      );
    }
  }

  // ── 사전 잔액 게이트 ──────────────────────────────────────────────
  // 잡 레코드를 만들기 전에 비차감(read-only) 잔액을 확인한다. 잔액이
  // 부족하면 FAILED 잡 행을 남기지 않고 즉시 402로 거절한다. (크레딧 0
  // 학원이 "전체 유형 일괄 생성"을 눌러 수천 건의 FAILED 행을 양산하던
  // 폭주 패턴을 차단 — 2026-06-09 단일 학원 1,482건 사건이 그 예.)
  // 최종 권위는 여전히 ensureWorkbenchAiJobCharged 의 원자적 차감(balance
  // gte)이며, 이 사전 체크는 doomed 잡 생성을 피하는 최적화일 뿐이다.
  const operationType = getOperationType(config);
  const creditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS[operationType],
    effectiveGenerationPlan,
  );
  const preflightBalance = await prisma.creditBalance.findUnique({
    where: { academyId: staff.academyId },
    select: { balance: true },
  });
  const availableBalance = preflightBalance?.balance ?? 0;
  if (availableBalance < creditCost) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        balance: availableBalance,
        required: creditCost,
      },
      { status: 402 },
    );
  }

  const now = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "QUESTION_GENERATION",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: config.mode,
      questionType: config.questionType ?? null,
      generationPlan: effectiveGenerationPlan,
      difficulty: effectiveDifficulty,
      requestedCount: config.count,
      startedAt: now,
      config: {
        mode: config.mode,
        count: config.count,
        questionType: config.questionType ?? null,
        questionTypeSettings: config.questionTypeSettings ?? null,
        difficulty: effectiveDifficulty,
        customPrompt: config.customPrompt ?? "",
        generationPlan: effectiveGenerationPlan,
        // 클라 요청 플랜 원본(정규화 전 감사 추적용) — 이원 티어에서는 요청 플랜이
        // 곧 라우팅 플랜이다(effectiveGenerationPlan 과 동일).
        requestedGenerationPlan: config.generationPlan,
        fastPath: true,
        clientTempId: config.clientTempId ?? null,
      },
    },
  });

  let creditTxId: string | null = null;
  let creditMs = 0;
  const planningMs = 0;
  let generationMs = 0;
  let generationAttempts = 0;
  let persistenceMs = 0;
  let generationRejectionSummary: unknown = null;

  try {
    const creditStartedAt = Date.now();
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType,
      metadata: {
        passageId: passage.id,
        mode: config.mode,
        questionType: config.questionType,
        count: config.count,
        generationPlan: effectiveGenerationPlan,
        difficulty: effectiveDifficulty,
        creditCost,
        fastPath: true,
      },
      creditCost,
    });
    creditMs = Date.now() - creditStartedAt;
    creditTxId = credit.transactionId;

    const schoolType =
      passage.school?.type === "MIDDLE"
        ? "\uc911\ud559\uad50"
        : "\uace0\ub4f1\ud559\uad50";
    const gradeInfo = passage.grade ? `${passage.grade}\ud559\ub144` : "";
    const teacherAnnotations = extractTeacherAnnotations(passage);
    const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
    const analysisContext = buildAnalysisContext(passage);
    const diffLabel = effectiveDifficulty;
    const diffInstruction =
      DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;

    // AUTO(플래너가 유형을 정하는) 모드는 제거됨 — 항상 교사가 지정한 단일
    // 유형으로 생성한다. (AUTO 는 프로덕션 실패율 48.9% 의 최악 경로였다.)
    const plan: PlanResult["plan"] = buildManualPlan({
      questionType: config.questionType,
      count: config.count,
    });
    const rationale = "";

    if (plan.length === 0) {
      throw new Error("No question generation plan was produced.");
    }

    // ── 다양성 컨텍스트: 같은 지문+유형의 기존 문항에서 사용된 타깃/정답 위치를
    // 추출해 회피 목록·위치 스티어링·보기 셔플을 활성화한다. 조회 실패는
    // 생성 자체를 막지 않는다 (빈 컨텍스트로 진행 — 셔플/배치 분산은 유지).
    // 단건 생성(variantCount<=1)은 결정형 오프셋이 위치를 고정시키므로
    // variantIndex 를 비워 무작위 분산을 쓰게 한다.
    const effectiveVariantIndex =
      (config.variantCount ?? 1) > 1 ? config.variantIndex : undefined;
    let diversity: QuestionDiversityContext = {
      bySubType: {},
      variantIndex: effectiveVariantIndex,
      variantCount: config.variantCount,
    };
    try {
      const planSubTypes = [...new Set(plan.map((item) => item.subType))];
      const recentQuestions = await prisma.question.findMany({
        where: {
          academyId: staff.academyId,
          passageId: passage.id,
          subType: { in: planSubTypes },
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { subType: true, structuredData: true, correctAnswer: true },
      });
      diversity = buildQuestionDiversityContext(recentQuestions, {
        variantIndex: effectiveVariantIndex,
        variantCount: config.variantCount,
      });
    } catch (error) {
      console.warn(
        "[workbench-fast-question] Failed to build diversity context",
        error,
      );
    }

    // §2-⑤ 교사 지정 포인트 자기모순 차단: 교사 quote 와 겹치는(부분 문자열 포함)
    // 회피 항목을 usedTargets 에서 제외한다. teacherPoints 미지정이면 완전 no-op.
    // 실패해도 생성 자체를 막지 않는다 (회피 목록이 조금 넓게 남을 뿐).
    try {
      const teacherPointQuotes = readTeacherPointQuotes(
        config.questionType,
        config.questionTypeSettings,
        passage.content,
      );
      if (teacherPointQuotes.length > 0) {
        diversity = excludeTeacherPointsFromDiversity(
          diversity,
          teacherPointQuotes,
        );
      }
    } catch (error) {
      console.warn(
        "[workbench-fast-question] Failed to exclude teacher points from diversity",
        error,
      );
    }

    const generationStartedAt = Date.now();
    const generationResult = await runWithQuestionGenerationAssignmentBudget(
      {
        jobId: job.id,
        route: "FAST",
        generationPlan: effectiveGenerationPlan,
        questionType: config.questionType ?? "UNSPECIFIED",
        difficulty: effectiveDifficulty,
      },
      () => runQuestionGenerationWithEmptyRetry({
        plan,
        schoolType,
        gradeInfo,
        passageContent: passage.content,
        teacherIntentBlock,
        analysisContext,
        diffLabel,
        diffInstruction,
        generationPlan: effectiveGenerationPlan,
        customPrompt: config.customPrompt,
        typeSettings:
          config.mode === "MANUAL" && config.questionType
            ? { [config.questionType]: config.questionTypeSettings }
            : undefined,
        diversity,
        // KO(국어) 게이트(KO-GEN-4): trigger 워커·auto 라우트와 동일 배선 —
        // 국어 지문이면 태그의 KO_KIND 를 지문 갈래로 전달해 생성 프롬프트
        // ('지문 갈래:' 라벨)와 koContext.passageKind 저장이 경로 간 일치하게
        // 한다. 영어 지문은 undefined 로 기존과 완전 동일(무회귀). findFirst 가
        // include 조회라 subject·tags 스칼라는 이미 페치되어 있다.
        koPassageKind: isKoreanSubject(passage.subject)
          ? (readKoKindFromTags(passage.tags) ?? undefined)
          : undefined,
      }, {
        logPrefix: "WORKBENCH-FAST-Q-GEN",
        // Vercel maxDuration 300s. 270s 후엔 새 시도를 멈춰 함수 강제종료(잡 고아
        // → 환불 누락)를 막고, catch 에서 정상 실패+환불로 흐르게 한다. 30s 여유로
        // 후처리·저장·환불을 마친다. 느린 PREMIUM(Claude) 다수 재시도의 핵심 안전판.
        deadlineAt: requestStartedAt + 270_000,
        // 해설 사실검증 E-gate 를 인라인 임계경로에서 분리한다 — grok 검증/수리
        // (69~152s×수콜)가 인라인 데드라인을 잠식해 fail-open 되던 O153 회귀를 막고,
        // 생성은 빠르게 저장한 뒤 아래 async 워커(workbench-explanation-verify)가
        // 검증/수리를 이어받는다. 문항은 PENDING 으로 저장된다.
        deferExplanationVerify: true,
      }),
    );
    const questions = generationResult.questions;
    for (const [idx, event] of generationResult.usageEvents.entries()) {
      const usage = readAiUsageTokens(event.usage);
      const actualCost = readAiUsageCost(event.usage);
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:generation:${idx}`,
        sourceId: job.id,
        sourceDetail: `QUESTION_GENERATION:${event.subType}`,
        academyId: job.academyId,
        provider: providerFromModel(event.modelId),
        model: event.modelId,
        operationType,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        recordedCostUsd: actualCost.costUsd,
        usageAt: new Date(),
        metadata: {
          passageId: passage.id,
          generationPlan: event.generationPlan ?? effectiveGenerationPlan,
          difficulty: event.difficulty ?? diffLabel,
          fastPath: true,
          qualityMode: event.qualityMode,
          attempts: event.attempts,
          durationMs: event.durationMs,
          ...(actualCost.generationId
            ? { generationId: actualCost.generationId }
            : {}),
        },
      });
    }
    generationAttempts = generationResult.attempts;
    generationMs = Date.now() - generationStartedAt;
    const relaxedFallback = generationResult.relaxedFallback;
    generationRejectionSummary = generationResult.rejectionSummary;

    const questionsForDisplay = questions.slice(0, config.count).map((question) => {
      const questionPlan = normalizeQuestionGenerationPlan(
        question._generationPlan ?? effectiveGenerationPlan,
      );
      const tags = mergeQuestionGenerationPlanTag(
        readQuestionTags(question.tags),
        questionPlan,
      );
      return {
        ...question,
        _generationPlan: questionPlan,
        tags,
      };
    });

    if (questionsForDisplay.length === 0) {
      throw new Error(
        `No questions generated after ${generationAttempts} generation attempt${
          generationAttempts === 1 ? "" : "s"
        }. ${generationResult.rejectionSummary.message}`,
      );
    }

    const persistenceStartedAt = Date.now();
    const createdQuestionIds = await saveGeneratedQuestionsForJob({
      academyId: job.academyId,
      passageId: passage.id,
      questions: questionsForDisplay,
      generationPlan: effectiveGenerationPlan,
      skipPassageEligibilityCheck: true,
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const completedAt = new Date();
    const debugTiming = {
      queueWaitMs: 0,
      creditMs,
      planningMs,
      generationAttempts,
      relaxedFallback: relaxedFallback ? 1 : 0,
      generationMs,
      persistenceMs,
      totalRunMs: Date.now() - requestStartedAt,
    };

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: questionsForDisplay.length,
        failedCount: 0,
        resultCount: questionsForDisplay.length,
        result: JSON.parse(JSON.stringify({
          passageId: passage.id,
          questions: questionsForDisplay,
          questionIds: createdQuestionIds,
          rationale,
          generationPlan: effectiveGenerationPlan,
          debugTiming,
          fastPath: true,
        })),
        completedAt,
      },
    });
    await closeQuestionGenerationAssignmentBudget(job.id).catch(() => undefined);

    // 해설 사실검증 async 분리(O153): 생성·저장은 이미 끝났고, 인라인에서 defer 한
    // E-gate 를 워커가 임계경로 밖에서 이어받는다. Trigger 장애가 이미 저장된 생성
    // 응답을 실패시키지 않도록 .catch 로 삼킨다(문항은 PENDING 으로 남아 재실행 가능).
    // 이원 티어(26-07-20): STANDARD 는 E-gate 기본 off(인라인 통합 검수리가 대체)라
    // PENDING 스탬프가 없다 — PENDING 문항이 하나라도 있을 때만 워커를 인큐해
    // 스탠다드 배치의 무의미한 워커 기동(이중 검증 비용)을 차단한다.
    const hasPendingExplanationVerify = questionsForDisplay.some(
      (question) =>
        (question as Record<string, unknown>)._explanationVerifyStatus ===
        "PENDING",
    );
    if (hasPendingExplanationVerify) {
      await tasks
        .trigger(
          "workbench-explanation-verify",
          {
            questionIds: createdQuestionIds,
            passageId: passage.id,
            academyId: job.academyId,
            // 워커의 검증비 원장 행을 생성 잡에 조인하기 위한 식별자(O190 결함② 배선).
            jobId: job.id,
          },
          {
            idempotencyKey: `explanation-verify:${job.id}`,
            concurrencyKey: academyConcurrencyKey(staff.academyId),
          },
        )
        .catch((e) => console.warn("[fast-question] verify enqueue failed", e));
    }

    return NextResponse.json({
      jobId: job.id,
      status: "COMPLETED",
      questions: questionsForDisplay,
      questionIds: createdQuestionIds,
      generationPlan: effectiveGenerationPlan,
      creditsRemaining: credit.balanceAfter,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      debugTiming,
    });
  } catch (err) {
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

    if (creditTxId) {
      await refundCredits(
        job.academyId,
        operationType,
        creditTxId,
        "Fast workbench question generation failed",
        creditCost,
      ).catch((refundErr) => {
        console.error("Fast question generation refund failed", refundErr);
      });
    }

    const message =
      err instanceof Error ? err.message : "Question generation failed.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: toUserFacingQuestionGenerationError(message),
        result: JSON.parse(JSON.stringify({
          passageId: passage.id,
          generationPlan: effectiveGenerationPlan,
          difficulty: effectiveDifficulty,
          rawError: message,
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            planningMs,
            generationAttempts,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
          },
          rejectionSummary: generationRejectionSummary,
          fastPath: true,
        })),
        completedAt: new Date(),
      },
    });
    await closeQuestionGenerationAssignmentBudget(job.id).catch(() => undefined);

    return NextResponse.json(
      { error: "Question generation failed", details: message },
      { status: 500 },
    );
  }
}
