import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import {
  getQuestionGenerationPlanFromTags,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { toUserFacingQuestionGenerationError } from "@/lib/question-generation-llm";
import { resolveEditModelId } from "@/lib/question-ai-edit/model-config";
import { runQuestionEdit } from "@/lib/question-ai-edit/run-edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 단일 모델 호출(+최대 1회 교정 재시도). Claude 180s 한계를 데드라인으로 묶고 환불
// 트랜잭션 여유를 남긴다. 생성 fast 경로와 동일한 300s 벽 안에서 동작.
export const maxDuration = 300;

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 환불 시도 — refundCredits 자체가 throw 해도(예: DB 오류) 차감만 남고 환불이 누락되는
// 것을 막기 위해, 실패를 삼키되 transactionId 와 함께 error 레벨로 남겨 운영자가 멱등
// 환불을 수동 재시도할 수 있게 한다(refundCredits 는 reason 키로 멱등).
async function safeRefund(academyId: string, transactionId: string, reason: string) {
  try {
    await refundCredits(academyId, "QUESTION_MODIFY", transactionId, reason);
  } catch (refundErr) {
    console.error(
      `[question-edit] REFUND FAILED — manual recovery needed. academyId=${academyId} txId=${transactionId} reason="${reason}":`,
      refundErr,
    );
  }
}

function readTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return raw.split(",").map((t) => t.trim()).filter(Boolean);
  }
}

const requestSchema = z.object({
  questionId: z.string().min(1),
  instruction: z.string().min(1).max(2000),
  // 반복 수정(누적): 직전 수정본을 베이스라인으로 넘긴다. subType·지문·플랜은 항상 DB
  // 문제에서 읽으므로(아래) 클라이언트가 유형을 바꿀 수는 없다(유형 고정 보장).
  baseline: z.record(z.string(), z.unknown()).optional(),
});
// 수정 모델은 서버가 결정한다(resolveEditModelId: env QUESTION_EDIT_MODEL → bake-off 기본).
// 클라이언트가 modelId 를 보내 PREMIUM(Claude)을 STANDARD 가격에 호출하는 우회를 차단하기
// 위해 요청 스키마에서 modelId 를 제거했다.

export async function POST(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const { questionId, instruction, baseline: baselineOverride } = parsed.data;

    const question = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId },
      include: {
        passage: {
          select: {
            content: true,
            grade: true,
            school: { select: { type: true } },
          },
        },
        explanation: true,
      },
    });
    if (!question) {
      return NextResponse.json({ error: "문제를 찾을 수 없습니다." }, { status: 404 });
    }

    const subType = question.subType || question.type;
    const tags = readTags(question.tags);
    const generationPlan: QuestionGenerationPlan =
      (isRec(question.structuredData) &&
        normalizeQuestionGenerationPlan(question.structuredData._generationPlan)) ||
      getQuestionGenerationPlanFromTags(tags) ||
      "STANDARD";

    // before(베이스라인) 구조화 객체 — structuredData 우선, 없으면 레거시 합성.
    let before: Rec;
    if (isRec(question.structuredData) && question.structuredData._typeId) {
      before = { ...(question.structuredData as Rec) };
    } else {
      let options: unknown;
      try {
        options = question.options ? JSON.parse(question.options) : undefined;
      } catch {
        options = undefined;
      }
      let keyPoints: unknown;
      let woe: unknown;
      try {
        keyPoints = question.explanation?.keyPoints
          ? JSON.parse(question.explanation.keyPoints)
          : undefined;
      } catch {
        /* ignore */
      }
      try {
        woe = question.explanation?.wrongOptionExplanations
          ? JSON.parse(question.explanation.wrongOptionExplanations)
          : undefined;
      } catch {
        /* ignore */
      }
      before = {
        _typeId: subType,
        direction: question.questionText,
        ...(options ? { options } : {}),
        correctAnswer: question.correctAnswer,
        difficulty: question.difficulty,
        ...(question.explanation?.content ? { explanation: question.explanation.content } : {}),
        ...(keyPoints ? { keyPoints } : {}),
        ...(woe ? { wrongOptionExplanations: woe } : {}),
      };
    }
    before.difficulty = before.difficulty ?? question.difficulty;
    before._generationPlan = generationPlan;
    before.tags = before.tags ?? tags;

    // 반복 수정: 클라이언트가 직전 수정본을 넘기면 그것을 베이스라인으로 쓰되,
    // 유형(_typeId)·플랜·태그는 DB 문제 기준으로 강제(클라이언트 위변조로 유형이
    // 바뀌는 것을 차단). 지문/subType 도 항상 DB 에서 온다.
    const baseline: Rec = baselineOverride
      ? {
          ...baselineOverride,
          _typeId: subType,
          _generationPlan: generationPlan,
          difficulty:
            typeof baselineOverride.difficulty === "string"
              ? baselineOverride.difficulty
              : question.difficulty,
          tags: before.tags,
        }
      : before;

    const schoolType = question.passage?.school?.type === "MIDDLE" ? "중학교" : "고등학교";
    const resolvedModel = resolveEditModelId();

    // 크레딧 선결제(QUESTION_MODIFY = 1 = 생성의 절반). 실패 시 환불.
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "QUESTION_MODIFY", staff.id, {
        questionId,
        op: "ai-edit",
        modelId: resolvedModel,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: "크레딧이 부족합니다.",
            balance: err.currentBalance,
            required: err.requiredCredits,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    const deadlineAt = Date.now() + 280_000;
    let result;
    try {
      result = await runQuestionEdit({
        subType,
        passageContent: question.passage?.content ?? "",
        baseline,
        instruction,
        schoolType,
        gradeInfo: question.passage?.grade ? String(question.passage.grade) : "",
        generationPlan,
        modelId: resolvedModel,
        deadlineAt,
      });
    } catch (aiError) {
      await safeRefund(staff.academyId, creditResult.transactionId, "AI 문제 수정 실패");
      return NextResponse.json(
        {
          error: toUserFacingQuestionGenerationError(
            aiError instanceof Error ? aiError.message : String(aiError),
          ),
        },
        { status: 502 },
      );
    }

    if (!result.ok || !result.after) {
      await safeRefund(staff.academyId, creditResult.transactionId, "AI 문제 수정 결과 없음");
      return NextResponse.json(
        { error: result.error || "수정본 생성에 실패했습니다." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      before: result.before,
      after: result.after,
      changes: result.changes,
      questionText: result.questionText,
      qualityWarnings: result.qualityWarnings,
      acceptedWithWarnings: result.acceptedWithWarnings,
      meta: result.meta,
      creditsRemaining: creditResult.balanceAfter,
    });
  } catch (error) {
    console.error("[question-edit] error:", error);
    return NextResponse.json(
      { error: "문제 수정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
