import { generateObject } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";

const explanationSchema = z.object({
  explanation: z.string(),
  keyPoints: z.array(z.string()),
  wrongOptionExplanations: z.record(z.string(), z.string()).optional(),
  relatedGrammar: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { questionId } = body as { questionId: string };

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "QUESTION_EXPLANATION", staff.id, { questionId });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        passage: { select: { content: true, title: true } },
      },
    });

    if (!question) {
      await refundCredits(staff.academyId, "QUESTION_EXPLANATION", creditResult.transactionId, "Question not found");
      return NextResponse.json(
        { error: "문제를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const options = question.options
      ? JSON.parse(question.options)
      : [];
    const optionsText = options.length > 0
      ? options
          .map((o: { label: string; text: string }) => `${o.label}. ${o.text}`)
          .join("\n")
      : "주관식 문제";

    let object: z.infer<typeof explanationSchema>;
    try {
    const { object: _object } = await generateObject({
      model,
      schema: explanationSchema,
      prompt: `당신은 한국 중고등학교 영어 시험 해설을 작성하는 전문가입니다.
아래 문제에 대한 상세한 해설을 작성하세요.

## 문제 정보
- 유형: ${question.type} ${question.subType ? `(${question.subType})` : ""}
- 난이도: ${question.difficulty}

## 지문 (있는 경우)
${question.passage?.content || "지문 없음"}

## 문제
${question.questionText}

## 선택지
${optionsText}

## 정답
${question.correctAnswer}

## 해설 작성 규칙
1. explanation: 왜 이 답이 정답인지 논리적으로 설명 (한국어)
2. keyPoints: 이 문제에서 알아야 할 핵심 포인트 3-5개
3. wrongOptionExplanations: 각 오답 번호별로 왜 틀렸는지 설명 (객관식인 경우)
4. relatedGrammar: 관련 문법 규칙이 있다면 설명
5. 학생이 쉽게 이해할 수 있는 명확한 한국어로 작성하세요`,
    });
    object = _object;
    } catch (aiError) {
      await refundCredits(staff.academyId, "QUESTION_EXPLANATION", creditResult.transactionId, "Explanation generation failed");
      throw aiError;
    }

    // Save to database
    const existing = await prisma.questionExplanation.findUnique({
      where: { questionId },
    });

    if (existing) {
      await prisma.questionExplanation.update({
        where: { questionId },
        data: {
          content: object.explanation,
          keyPoints: JSON.stringify(object.keyPoints),
          wrongOptionExplanations: object.wrongOptionExplanations
            ? JSON.stringify(object.wrongOptionExplanations)
            : null,
          relatedGrammar: object.relatedGrammar || null,
          aiGenerated: true,
        },
      });
    } else {
      await prisma.questionExplanation.create({
        data: {
          questionId,
          content: object.explanation,
          keyPoints: JSON.stringify(object.keyPoints),
          wrongOptionExplanations: object.wrongOptionExplanations
            ? JSON.stringify(object.wrongOptionExplanations)
            : null,
          relatedGrammar: object.relatedGrammar || null,
          aiGenerated: true,
        },
      });
    }

    return NextResponse.json({ data: object, creditsRemaining: creditResult.balanceAfter });
  } catch (error) {
    console.error("Explanation generation error:", error);
    return NextResponse.json(
      { error: "해설 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
