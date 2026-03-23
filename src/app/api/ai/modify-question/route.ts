import { generateObject } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const modifiedQuestionSchema = z.object({
  questionText: z.string(),
  options: z
    .array(z.object({ label: z.string(), text: z.string() }))
    .optional(),
  correctAnswer: z.string(),
  explanation: z.string(),
  keyPoints: z.array(z.string()),
  wrongOptionExplanations: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionId, instruction, currentState } = body as {
      questionId: string;
      instruction: string;
      currentState: {
        type: string;
        subType: string;
        questionText: string;
        options: { label: string; text: string }[];
        correctAnswer: string;
        difficulty: string;
        explanation: string;
        keyPoints: string[];
        tags: string[];
      };
    };

    // Fetch passage context
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        passage: {
          select: { content: true, title: true, grade: true,
            school: { select: { type: true } },
          },
        },
      },
    });

    if (!question) {
      return NextResponse.json(
        { error: "문제를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const passage = question.passage;
    const schoolType =
      passage?.school?.type === "MIDDLE" ? "중학교" : "고등학교";

    const optionsText =
      currentState.options.length > 0
        ? currentState.options
            .map((o) => `(${o.label}) ${o.text}`)
            .join("\n")
        : "없음";

    const { object } = await generateObject({
      model,
      schema: modifiedQuestionSchema,
      prompt: `당신은 한국 ${schoolType} 영어 시험 출제 전문가입니다.

## 현재 문제
- 유형: ${currentState.type} / ${currentState.subType || "없음"}
- 난이도: ${currentState.difficulty}
- 발문: ${currentState.questionText}
- 선택지:
${optionsText}
- 정답: ${currentState.correctAnswer}
- 해설: ${currentState.explanation || "없음"}
- 핵심 포인트: ${currentState.keyPoints.join(", ") || "없음"}
- 태그: ${currentState.tags.join(", ") || "없음"}

${passage ? `## 연결된 지문\n${passage.content}` : ""}

## 수정 요청
${instruction}

## 규칙
- 문제 유형(${currentState.type})과 난이도(${currentState.difficulty})는 유지하세요.
- 수정 요청에서 언급하지 않은 부분은 최대한 기존 내용을 유지하세요.
- 선택지가 있는 경우 반드시 기존과 동일한 개수를 유지하세요.
- 해설은 반드시 한국어로, 지문 근거와 함께 작성하세요.
- keyPoints는 3개 이상 유지하세요.
- 객관식이면 wrongOptionExplanations에 각 오답이 틀린 이유를 작성하세요.
- tags는 관련 태그를 한국어로 유지하세요.

수정된 문제 1개를 출력하세요.`,
    });

    return NextResponse.json({ question: object });
  } catch (error) {
    console.error("Question modification error:", error);
    return NextResponse.json(
      { error: "문제 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
