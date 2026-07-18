import { logger, task } from "@trigger.dev/sdk/v3";
import type { Prisma } from "@prisma/client";

import {
  WORKBENCH_QUESTION_GENERATION_QUEUE_CONCURRENCY,
  WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
  WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import { normalizePassageWhitespace } from "@/lib/question-postprocess/text-utils";
import { runExplanationVerifyGate } from "@/app/api/ai/generate-questions-auto/_lib/explanation-verify-gate";

// ============================================================================
// 해설 사실검증 async 워커 (E-gate 임계경로 분리, 연구노트 O153)
// ----------------------------------------------------------------------------
// fast 라우트는 deferExplanationVerify=true 로 생성해 인라인 E-gate 를 건너뛰고
// 문항을 _explanationVerifyStatus="PENDING" 으로 저장한다. 이 워커가 그 PENDING
// 문항을 임계경로 밖(넉넉한 maxDuration)에서 grok 검증→표적수리→재검증(X3)한다.
//   - VERIFIED_REPAIRED: 수리본이 재검증 통과 → 해설 필드 교체 + structuredData 병합.
//   - VERIFIED: 첫 검증 PASS(수리 불필요).
//   - FAILED: enforce 재검증 실패(또는 warn 잔존) → verified=false 표시만. 문항은
//     삭제·자동승인하지 않는다(AI 문항은 approved=false, 교사 검수가 백스톱).
// 멱등: 이미 판정된(PENDING 아님) 문항은 건너뛴다 — Trigger 재시도/중복 인큐 안전.
// 게이트 자체 장애는 never-fail(무판정 통과) — 인라인과 동일 계약.
// ============================================================================

type Input = {
  questionIds: string[];
  passageId: string;
  academyId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 수리본 채택 시 QuestionExplanation(content/keyPoints/wrongOptionExplanations)와
 * Question.structuredData 를 한 트랜잭션으로 갱신한다. 직렬화 형태는 저장 경로
 * (question-generation-persistence.ts)와 정확히 동일하게 맞춘다(문자열은 그대로,
 * 배열/객체는 JSON.stringify, null 은 null). 문항 본체(questionText·options·정답)는
 * 해설 수리로 바뀌지 않으므로 건드리지 않는다.
 */
async function persistRepairedExplanation(
  questionId: string,
  updatedQuestion: Record<string, unknown>,
  newStructuredData: Record<string, unknown>,
): Promise<void> {
  const explanation = updatedQuestion.explanation;
  const keyPoints = updatedQuestion.keyPoints;
  const wrongOptionExplanations = updatedQuestion.wrongOptionExplanations;

  const explanationData: {
    content?: string;
    keyPoints?: string | null;
    wrongOptionExplanations?: string | null;
  } = {
    keyPoints:
      keyPoints === undefined || keyPoints === null
        ? null
        : typeof keyPoints === "string"
          ? keyPoints
          : JSON.stringify(keyPoints),
    wrongOptionExplanations:
      wrongOptionExplanations === undefined || wrongOptionExplanations === null
        ? null
        : typeof wrongOptionExplanations === "string"
          ? wrongOptionExplanations
          : JSON.stringify(wrongOptionExplanations),
  };
  if (typeof explanation === "string" && explanation.trim()) {
    explanationData.content = explanation;
  }

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: { structuredData: toPrismaJson(newStructuredData) },
    });
    // updateMany: 해설 행이 있으면 갱신(없으면 0행 — throw 없이 멱등). 대상 문항은
    // 비어있지 않은 해설을 가져 PENDING 이 붙었으므로 정상 경로에선 항상 1행이다.
    await tx.questionExplanation.updateMany({
      where: { questionId },
      data: explanationData,
    });
  });
}

async function updateStructuredDataOnly(
  questionId: string,
  newStructuredData: Record<string, unknown>,
): Promise<void> {
  await prisma.question.update({
    where: { id: questionId },
    data: { structuredData: toPrismaJson(newStructuredData) },
  });
}

export const workbenchExplanationVerifyTask = task({
  id: "workbench-explanation-verify",
  queue: {
    // 생성 워커와 큐를 공유(학원별 concurrencyKey) — 검증은 지연 민감도가 낮아
    // 생성 슬롯을 넘지 않게 뒤로 밀리는 게 안전하다(전용 큐·env 추가 없이).
    name: WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
    concurrencyLimit: WORKBENCH_QUESTION_GENERATION_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  // 검증/수리 X3(grok@high)는 문항당 수십 초, 배치(여러 문항)면 누적된다 — 넉넉히.
  maxDuration: 600,
  async run(payload: Input) {
    const { questionIds, passageId, academyId } = payload;
    const taskStartedAt = Date.now();

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return { skipped: true as const, reason: "NO_QUESTION_IDS" };
    }

    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId },
      select: { content: true },
    });
    if (!passage) {
      return { skipped: true as const, reason: "PASSAGE_NOT_FOUND" };
    }
    // 인라인 게이트와 동일 정규화 — 검증기가 보는 지문을 문항 렌더 표면과 일치시킨다
    // (run-question-generation.ts 엔진 입구 정규화와 바이트 동일 규칙).
    const passageContent = normalizePassageWhitespace(passage.content)
      .replace(/_{2,}/g, " ")
      .replace(/[ \t]{2,}/g, " ");

    let verified = 0;
    let repaired = 0;
    let failed = 0;
    let skipped = 0;

    for (const questionId of questionIds) {
      try {
        const question = await prisma.question.findFirst({
          where: { id: questionId, academyId, deletedAt: null },
          include: { explanation: true },
        });
        if (!question || !isRecord(question.structuredData)) {
          skipped += 1;
          continue;
        }
        const structured = question.structuredData;
        // 멱등: PENDING 만 처리한다(이미 VERIFIED/VERIFIED_REPAIRED/FAILED, 또는
        // 비대상이라 표시가 없는 문항은 건너뛴다).
        if (structured._explanationVerifyStatus !== "PENDING") {
          skipped += 1;
          continue;
        }

        const subType =
          typeof structured._typeId === "string"
            ? structured._typeId
            : typeof question.subType === "string"
              ? question.subType
              : "";
        const generationPlan =
          typeof structured._generationPlan === "string"
            ? structured._generationPlan
            : "PREMIUM";

        const result = await runExplanationVerifyGate({
          subType,
          generationPlan,
          question: structured,
          passage: passageContent,
          // 임계경로 밖이라 넉넉한 예산 — 인라인 예산 가드(190s)를 넘겨 실제 검증한다.
          deadlineAt: taskStartedAt + 480_000,
        });

        if (result.updatedQuestion) {
          const newStructuredData: Record<string, unknown> = {
            ...result.updatedQuestion,
            _explanationVerified: true,
            _explanationVerifyStatus: "VERIFIED_REPAIRED",
          };
          await persistRepairedExplanation(
            questionId,
            result.updatedQuestion,
            newStructuredData,
          );
          repaired += 1;
        } else if (result.issue || result.warning) {
          // enforce 재검증 실패(issue) 또는 warn 잔존(warning) — verified=false 표시만.
          await updateStructuredDataOnly(questionId, {
            ...structured,
            _explanationVerified: false,
            _explanationVerifyStatus: "FAILED",
            _explanationVerifyIssue: result.issue?.message ?? result.warning,
          });
          failed += 1;
        } else if (result.skippedInsufficientBudget) {
          // 480s 예산에선 발생하지 않지만 방어적으로 PENDING 유지(재실행 시 재시도).
          skipped += 1;
        } else {
          await updateStructuredDataOnly(questionId, {
            ...structured,
            _explanationVerified: true,
            _explanationVerifyStatus: "VERIFIED",
          });
          verified += 1;
        }
      } catch (error) {
        // 개별 문항 실패는 다음 문항을 막지 않는다(문항은 PENDING 으로 남아 재실행 대상).
        logger.error("explanation verify failed for question", {
          questionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("workbench explanation verify completed", {
      passageId,
      total: questionIds.length,
      verified,
      repaired,
      failed,
      skipped,
      totalRunMs: Date.now() - taskStartedAt,
    });

    return { success: true as const, verified, repaired, failed, skipped };
  },
});
