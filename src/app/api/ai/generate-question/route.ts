import { generateObject } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import {
  getResponseSchema,
  STRUCTURED_TYPE_PROMPTS,
  QUESTION_SCHEMAS,
} from "@/lib/question-schemas";

// ─── Fallback generic schema (for unknown types) ───
const fallbackQuestionSchema = z.object({
  type: z.string(),
  subType: z.string().optional(),
  questionText: z.string(),
  options: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
  correctAnswer: z.string(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
  explanation: z.string(),
  keyPoints: z.array(z.string()),
  wrongOptionExplanations: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()),
});

const fallbackResponseSchema = z.object({
  questions: z.array(fallbackQuestionSchema),
});

// ─── Single-type question generation (called in parallel) ───
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { passageId, questionType, count, difficulty, customPrompt } = body as {
      passageId: string;
      questionType: string;
      count: number;
      difficulty: string;
      customPrompt?: string;
    };

    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        school: { select: { type: true, name: true } },
        analysis: { select: { analysisData: true } },
      },
    });

    if (!passage) {
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
    const gradeInfo = passage.grade ? `${passage.grade}학년` : "";

    // Use structured type prompt if available, otherwise fall back
    const typePrompt = STRUCTURED_TYPE_PROMPTS[questionType] || `${questionType} 유형의 문제를 만드세요.`;
    const isStructured = !!QUESTION_SCHEMAS[questionType];

    // Include analysis context if available
    let analysisContext = "";
    if (passage.analysis?.analysisData) {
      try {
        const analysis = JSON.parse(passage.analysis.analysisData);
        if (analysis.grammarPoints) {
          analysisContext += "\n\n## 지문 문법 포인트\n";
          for (const gp of analysis.grammarPoints.slice(0, 5)) {
            analysisContext += `- ${gp.pattern}: ${gp.explanation}\n`;
          }
        }
        if (analysis.vocabulary) {
          analysisContext += "\n## 핵심 어휘\n";
          for (const v of analysis.vocabulary.slice(0, 8)) {
            analysisContext += `- ${v.word}: ${v.meaning}\n`;
          }
        }
      } catch { /* ignore */ }
    }

    // Use the type-specific schema for generateObject
    const responseSchema = isStructured
      ? getResponseSchema(questionType)
      : fallbackResponseSchema;

    const structuredInstructions = isStructured
      ? `

## 출력 형식 안내
- 반드시 아래 유형별 지시사항의 필드 이름을 정확히 사용하세요.
- 밑줄 표시: __단어__ 형태로 감싸세요 (double underscore).
- 빈칸 표시: _____ (underscore 5개 이상)으로 표시하세요.
- direction 필드에는 발문(한국어)을 넣으세요.
- correctAnswer 필드에는 정답 선지 label (객관식) 또는 정답 텍스트 (서술형)를 넣으세요.`
      : `
## 출력 형식 안내
- 밑줄 친 표현은 작은따옴표로 감쌉니다
- 빈칸은 _____(5개 이상)으로 표시합니다`;

    const { object } = await generateObject({
      model,
      schema: responseSchema,
      prompt: `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passage.content}
${analysisContext}

## 출제 유형 지시사항
${typePrompt}
${structuredInstructions}

## 생성 조건
- 문제 수: ${count}문제
- 난이도: ${difficulty}
- 객관식은 반드시 5개 선택지
- 해설(explanation): 왜 정답인지 지문 근거와 함께 상세히 한국어로 작성
- keyPoints: 3개 이상의 학습 포인트
- wrongOptionExplanations: 각 오답이 틀린 이유를 한국어로 작성 (객관식인 경우 필수)
- tags: 관련 문법/어휘/유형 태그를 한국어로
- difficulty: "${difficulty}"
${customPrompt ? `\n## 선생님 추가 지시\n${customPrompt}` : ""}

정확히 ${count}문제를 생성하세요.`,
    });

    // WORD_ORDER: 강제 셔플 — AI가 정답 순서로 넣는 경우 방지
    const questions = (object.questions || []).map((q: any) => {
      if (questionType === "WORD_ORDER" && Array.isArray(q.scrambledWords) && q.scrambledWords.length > 1) {
        const arr = [...q.scrambledWords];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (arr.join("|") === q.scrambledWords.join("|")) {
          [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
        }
        return { ...q, scrambledWords: arr };
      }
      return q;
    });

    return NextResponse.json({
      questionType,
      difficulty,
      questions,
    });
  } catch (error) {
    console.error("Single question generation error:", error);
    return NextResponse.json(
      { error: "문제 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
