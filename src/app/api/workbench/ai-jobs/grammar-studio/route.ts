// ============================================================================
// 어법 훈련소 — 합성지문 AI 생성 잡 라우트 (v3 design §D5-3, 단위 D-2 신설)
//
// POST { unitIds, conceptIds, difficulty(1~4), count(≤10) }
//  1. 플래그·세션 가드 → 유닛/개념 정합 검증 → 유닛당 동시 1잡 가드(409)
//  2. 크레딧 사전 고지 검증 — AUTO_GEN_BATCH×count 비차감 잔액 게이트(402).
//     실제 차감·환불은 기존 트리거 워커(ensureWorkbenchAiJobCharged/refundCredits)
//     가 문항(잡)당 QUESTION_GEN_SINGLE 로 수행한다 — 두 단가는 2크레딧 동가.
//  3. 문항마다: buildConceptSeedPassage(개념 순환 시드, 1콜+게이트+재생성 1회)
//     → prisma.passage.create({source:"GRAMMAR_STUDIO"} — 기존 컬럼만, 스키마
//     무변경) → 기존 비동기 큐(question-generation route 의 잡 생성 관용 미러:
//     WorkbenchAiJob domain=QUESTION_GENERATION 재사용 + config.studioMeta 동봉
//     + tasks.trigger 동일 큐/동시성 키).
//
// [경로 선택 근거 — 비동기 큐 채택, fast 인라인 기각]
//  - 배치 상한 10문항 × 문항당 30~120s(사다리)면 fast(단일 요청 인라인)의 270s
//    벽을 정면 위반 — fast 는 구조적으로 단건 전용이다.
//  - "문항 1개 = 잡 1개(count=1) = 합성지문 1편" 분해가 기존 인프라와 정합이
//    가장 얇다: ①워커의 문항당 차감(QUESTION_GEN_SINGLE)·실패 전액 환불이
//    무개조로 계약을 충족하고(§D5-3 "실패 전액 환불(기존 잡 인프라)"), ②90~120
//    단어 단락에서 5밑줄 어법 문항은 1편당 1문항이 품질 상한이며(수능 29번 동형),
//    ③부분 실패가 문항 단위로 격리된다. count=N 단일 잡은 워커가 플랫 2크레딧만
//    차감해 과금 구멍이 생기므로 기각.
//
// subType=GRAMMAR_ERROR 고정 + generationPlan 은 PREMIUM 요청을 기존 단일 결정
// 함수(resolveEffectiveGenerationPlan — 규칙 중복 금지)에 태운다. 난이도 매핑
// (심화·킬러→KILLER)으로 단일 상품 모드에서도 어법 사다리 라우팅
// (run-question-generation.ts: GRAMMAR_ERROR × (PREMIUM || KILLER))이 실효된다.
// ============================================================================

import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildConceptSeedPassage } from "@/app/api/ai/generate-questions-auto/_lib/grammar-concept-seed";
import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { UNIT_BY_ID, unitLabel } from "@/lib/grammar-drill/curriculum";
import { recordAiCost } from "@/lib/platform-api-costs";
import { prisma } from "@/lib/prisma";
import {
  getQuestionGenerationCreditCost,
  resolveEffectiveGenerationPlan,
} from "@/lib/question-generation-plans";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import { grammarStudioPassageTitle } from "@/lib/wording/director-glossary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 시드 생성(문항당 1~2콜)이 요청 안에서 돈다 — 자동출제 라우트와 동일 상한.
export const maxDuration = 300;

/** Passage.source 마커 — 훈련소 산출 지문 식별(기존 free-form 컬럼 재사용) */
const GRAMMAR_STUDIO_PASSAGE_SOURCE = "GRAMMAR_STUDIO";

/** 요청당 문항 상한(§D5-3) */
const MAX_STUDIO_COUNT = 10;

/** 시드 배치 동시 실행 폭 — flash 콜 과속 방지(문항 10개 = 최대 4웨이브) */
const SEED_CONCURRENCY = 3;

/**
 * 드릴 난이도(1~4) → 생성 난이도 라벨.
 * 3(심화)·4(킬러)→KILLER: §3 루브릭의 심화(간섭 2겹·장거리)는 KILLER 어법
 * 루브릭(장거리 단서 필수 — constants.ts)과 합치하고, 단일 상품 모드에서
 * KILLER 만 어법 사다리로 라우팅되므로(O205 실측: 사다리가 더 싸고 빠르고
 * 품질 우위) §D5-3 「사다리 자동 관통」 계약이 이 매핑으로 실효된다.
 */
const DRILL_DIFF_TO_GENERATION_LABEL: Record<number, string> = {
  1: "BASIC",
  2: "INTERMEDIATE",
  3: "KILLER",
  4: "KILLER",
};

const requestSchema = z.object({
  // §9 계약은 unitIds 복수형 — v3 범위는 유닛 단일(자동 폴더·동시 1잡 가드가
  // 유닛 축). 복수 유닛 배치는 조용히 [0]만 쓰지 않고 명시 거절한다.
  unitIds: z.array(z.string().min(1)).min(1).max(1),
  /** 빈 배열 = 유닛 전체 개념 순환 시드 */
  conceptIds: z.array(z.string().min(1)).max(8).default([]),
  difficulty: z.number().int().min(1).max(4).default(2),
  count: z.number().int().min(1).max(MAX_STUDIO_COUNT).default(MAX_STUDIO_COUNT),
});

interface SeedFailure {
  index: number;
  conceptIds: string[];
  reason: string;
}

/** 소폭 병렬 실행기 — 순서 보존, SEED_CONCURRENCY 폭 청크 */
async function runChunked<T, R>(
  items: T[],
  width: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += width) {
    const chunk = items.slice(start, start + width);
    const settled = await Promise.all(
      chunk.map((item, offset) => run(item, start + offset)),
    );
    results.push(...settled);
  }
  return results;
}

export async function POST(req: NextRequest) {
  // 다크런칭 방어선 — 페이지 게이트(ENABLE_GRAMMAR_STUDIO) 뒤 라우트지만 직접
  // 호출도 봉인한다(플래그 off = 표면 부재와 동일하게 404).
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_STUDIO) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const unitId = parsed.data.unitIds[0];
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) {
    return NextResponse.json({ error: "Unknown unit", unitId }, { status: 400 });
  }
  const invalidConcepts = parsed.data.conceptIds.filter(
    (id) => !unit.conceptIds.includes(id),
  );
  if (invalidConcepts.length > 0) {
    return NextResponse.json(
      { error: "Concepts do not belong to the unit", invalidConcepts },
      { status: 400 },
    );
  }

  // 고아 PROCESSING 잡이 유닛을 영구 봉쇄하지 않게 — 기존 리퍼를 먼저 돌린다
  // (question-generation route 관용, passageId 무스코프 학원 단위).
  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
  });

  // ── 유닛당 동시 1잡 가드(§D5-3) — studioMeta.unitId 활성 잡 존재 시 409 ──
  const busy = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "QUESTION_GENERATION",
      deletedAt: null,
      status: { in: ["PENDING", "PROCESSING"] },
      config: { path: ["studioMeta", "unitId"], equals: unitId },
    },
    select: { id: true },
  });
  if (busy) {
    return NextResponse.json(
      { error: "Unit generation already in progress", code: "STUDIO_UNIT_BUSY" },
      { status: 409 },
    );
  }

  // ── 크레딧 사전 고지 검증 — AUTO_GEN_BATCH×count 비차감 잔액 게이트 ──
  // 실차감은 워커가 잡당 QUESTION_GEN_SINGLE(2)로 수행: AUTO_GEN_BATCH(2)×count
  // = QUESTION_GEN_SINGLE×잡수 로 동가(단가 상수가 갈라지면 고지만 어긋나고
  // 과금은 워커 단가를 따른다 — credit-costs.ts 참조).
  // 티어 동기(26-08-18 난이도 기반): 워커는 잡의 generationPlan 으로 2배를
  // 적용하므로 사전 고지·잔액 검사도 같은 규칙(드릴 난이도 3·4 = KILLER → 2배)
  // 으로 계산해야 어긋나지 않는다.
  const effectiveDifficulty =
    DRILL_DIFF_TO_GENERATION_LABEL[parsed.data.difficulty] ?? "INTERMEDIATE";
  const planForBilling = resolveEffectiveGenerationPlan(
    "PREMIUM",
    effectiveDifficulty,
  );
  const perQuestionCredits = getQuestionGenerationCreditCost(
    CREDIT_COSTS.AUTO_GEN_BATCH,
    planForBilling,
  );
  const totalCredits = perQuestionCredits * parsed.data.count;
  const balanceRow = await prisma.creditBalance.findUnique({
    where: { academyId: staff.academyId },
    select: { balance: true },
  });
  const availableBalance = balanceRow?.balance ?? 0;
  if (availableBalance < totalCredits) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        balance: availableBalance,
        required: totalCredits,
      },
      { status: 402 },
    );
  }

  const effectiveGenerationPlan = planForBilling;
  const conceptPool =
    parsed.data.conceptIds.length > 0 ? parsed.data.conceptIds : unit.conceptIds;
  const batchId = crypto.randomUUID();
  const deadlineAt = Date.now() + 240_000;

  // ── 문항별: 개념 순환 시드 → 합성지문 → Passage → 잡 + 트리거 ──
  const seedPlans = Array.from({ length: parsed.data.count }, (_, i) => ({
    conceptIds: [conceptPool[i % conceptPool.length]],
  }));

  const seeds = await runChunked(seedPlans, SEED_CONCURRENCY, (plan) =>
    buildConceptSeedPassage({
      conceptIds: plan.conceptIds,
      difficulty: parsed.data.difficulty,
      deadlineAt,
    }),
  );

  // 시드 콜 실측 원가 기록(관측용 — 청구와 무관, 실패해도 요청은 계속).
  for (const [i, seed] of seeds.entries()) {
    for (const event of seed.usageEvents) {
      void recordAiCost({
        sourceType: "WORKBENCH_AI_JOB",
        sourceDetail: `GRAMMAR_STUDIO_SEED:${unitId}:${batchId}:${i}`,
        academyId: staff.academyId,
        model: event.modelId,
        operationType: "AUTO_GEN_BATCH",
        usage: event.usage,
      }).catch(() => undefined);
    }
  }

  const jobIds: string[] = [];
  const seedFailures: SeedFailure[] = [];

  for (const [i, seed] of seeds.entries()) {
    const planConcepts = seedPlans[i].conceptIds;
    if (!seed.ok) {
      // 시드 실패 = 잡 미생성 = 미차감 — 문항 단위로만 제외하고 배치는 계속.
      seedFailures.push({ index: i, conceptIds: planConcepts, reason: seed.reason });
      continue;
    }

    const passage = await prisma.passage.create({
      data: {
        academyId: staff.academyId,
        title: grammarStudioPassageTitle(unitLabel(unitId), unit.title, seed.title),
        content: seed.paragraph,
        source: GRAMMAR_STUDIO_PASSAGE_SOURCE,
        // 기계 키 태그(grammar-studio:*)는 표시 경로(getDisplayQuestionTags)에서
        // 자동 숨김 — 유닛 역추적용.
        tags: JSON.stringify([`grammar-studio:${unitId}`]),
      },
      select: { id: true, title: true },
    });

    const job = await prisma.workbenchAiJob.create({
      data: {
        academyId: staff.academyId,
        createdById: staff.id,
        domain: "QUESTION_GENERATION",
        status: "PENDING",
        title: passage.title,
        passageId: passage.id,
        mode: "MANUAL",
        questionType: "GRAMMAR_ERROR",
        generationPlan: effectiveGenerationPlan,
        difficulty: effectiveDifficulty,
        requestedCount: 1,
        config: {
          // 워커 parseConfig 소비 키 — question-generation route 관용 그대로.
          mode: "MANUAL",
          count: 1,
          questionType: "GRAMMAR_ERROR",
          questionTypeSettings: null,
          difficulty: effectiveDifficulty,
          customPrompt: "",
          generationPlan: effectiveGenerationPlan,
          requestedGenerationPlan: "PREMIUM",
          // 훈련소 확장 메타 — 워커는 무시(additive), 폴더 귀속·동시 1잡 가드·
          // 감사 추적이 소비한다.
          studioMeta: {
            unitId,
            conceptIds: planConcepts,
            requestedConceptIds: parsed.data.conceptIds,
            drillDifficulty: parsed.data.difficulty,
            batchId,
            seedAttempts: seed.attempts,
            // interface 배열은 Prisma InputJsonValue 인덱스 시그니처를 못 채운다
            // — 평면 리터럴로 투영(내용 동일).
            seedEvidences: seed.evidences.map((e) => ({
              conceptId: e.conceptId,
              quote: e.quote,
              note: e.note,
            })),
          },
        },
      },
    });

    try {
      const handle = await tasks.trigger(
        "workbench-question-generation",
        { jobId: job.id },
        {
          idempotencyKey: `workbench-question-generation:${job.id}`,
          queue: WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
          concurrencyKey: academyConcurrencyKey(staff.academyId),
        },
      );
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: { triggerRunId: handle.id },
      });
      jobIds.push(job.id);
    } catch (err) {
      // 인큐 실패 — 차감 전 구간이라 환불 불요. 잡만 FAILED 로 닫고 계속.
      const message =
        err instanceof Error ? err.message : "Failed to enqueue Trigger.dev task.";
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      seedFailures.push({
        index: i,
        conceptIds: planConcepts,
        reason: `잡 인큐 실패: ${message}`,
      });
    }
  }

  if (jobIds.length === 0) {
    return NextResponse.json(
      {
        error: "No questions could be enqueued",
        code: "STUDIO_ALL_SEEDS_FAILED",
        seedFailures,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    jobIds,
    unitId,
    batchId,
    requested: parsed.data.count,
    enqueued: jobIds.length,
    seedFailures,
    creditsPerQuestion: perQuestionCredits,
    totalCredits: perQuestionCredits * jobIds.length,
    generationPlan: effectiveGenerationPlan,
    difficulty: effectiveDifficulty,
    status: "PENDING",
  });
}
