import { generateObject } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import {
  STRUCTURED_TYPE_PROMPTS,
  QUESTION_SCHEMAS,
} from "@/lib/question-schemas";
import {
  AI_QUESTION_SCHEMAS,
  getAiResponseSchema,
} from "@/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import type { OperationType } from "@/lib/credit-costs";

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

// ─── Fallback generic schema (for unknown types) ───
const fallbackQuestionSchema = z.object({
  type: z.string(),
  subType: z.string().optional(),
  direction: z.string().optional(),
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

// ─── Helper: generateObject with retry ───
async function generateWithRetry(
  schema: z.ZodType,
  prompt: string,
  maxRetries = 2,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) console.log(`[SINGLE-GEN] Retry attempt ${attempt}...`);
      const { object } = await generateObject({
        model,
        schema,
        prompt,
        providerOptions: {
          google: { thinkingConfig: { thinkingBudget: 4096 } },
        },
      });
      return object;
    } catch (err: any) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[SINGLE-GEN] Attempt ${attempt} failed:`, msg);
      if (err.finishReason) console.warn(`[SINGLE-GEN]   finishReason: ${err.finishReason}`);
      if (err.usage) console.warn(`[SINGLE-GEN]   tokens: input=${err.usage.inputTokens}, output=${err.usage.outputTokens}`);
      if (err.text) console.warn(`[SINGLE-GEN]   rawText (first 300): ${err.text.slice(0, 300)}`);
    }
  }
  throw lastError;
}

// ─── Single-type question generation (called in parallel) ───
export async function POST(request: NextRequest) {
  try {
    // ── Auth + Credit deduction ──
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { passageId, questionType, count, difficulty, customPrompt } = body as {
      passageId: string;
      questionType: string;
      count: number;
      difficulty: string;
      customPrompt?: string;
    };

    const operationType: OperationType = VOCAB_TYPES.has(questionType)
      ? "QUESTION_GEN_VOCAB"
      : "QUESTION_GEN_SINGLE";

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, operationType, staff.id, {
        questionType,
        count,
        passageId,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        school: { select: { type: true, name: true } },
        analysis: { select: { analysisData: true } },
      },
    });

    if (!passage) {
      await refundCredits(staff.academyId, operationType, creditResult.transactionId, "Passage not found");
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
    const gradeInfo = passage.grade ? `${passage.grade}학년` : "";

    // Use structured type prompt if available, otherwise fall back
    const typePrompt = STRUCTURED_TYPE_PROMPTS[questionType] || `${questionType} 유형의 문제를 만드세요.`;

    // Use AI-minimal schema if available, otherwise fall back to full schema
    const hasAiSchema = !!AI_QUESTION_SCHEMAS[questionType];
    const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[questionType];
    const responseSchema = hasAiSchema
      ? getAiResponseSchema(questionType)
      : isStructured
        ? z.object({ questions: z.array(QUESTION_SCHEMAS[questionType]) })
        : fallbackResponseSchema;

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

    const structuredInstructions = isStructured
      ? `

## 출력 형식 안내
- 반드시 아래 유형별 지시사항의 필드 이름을 정확히 사용하세요.
- direction 필드에는 발문(한국어)을 넣으세요.
- correctAnswer 필드에는 정답 선지 label (객관식) 또는 정답 텍스트 (서술형)를 넣으세요.
- ⚠️ 지문 전체를 복사하는 필드(passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers)는 절대 생성하지 마세요. 서버에서 자동 생성합니다.`
      : `
## 출력 형식 안내
- 밑줄 친 표현은 __단어__ 형태로 감쌉니다
- 빈칸은 _____(5개 이상)으로 표시합니다`;

    console.log(`[SINGLE-GEN] Generating ${questionType} x${count}...`);

    let object: unknown;
    const startTime = Date.now();
    try {
    object = await generateWithRetry(
      responseSchema,
      `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passage.content}
${analysisContext}

## 출제 유형 지시사항
${typePrompt}
${structuredInstructions}

## 생성 조건
- 문제 수: ${count}문제
- 난이도: ${difficulty}
- difficulty 필드에 반드시 "${difficulty}"을 입력하세요. 다른 값을 넣지 마세요.
- 객관식은 반드시 5개 선택지 (options 배열에 {label, text} 형태)
- 해설(explanation): 왜 정답인지 지문 근거와 함께 한국어로 작성 (3~5문장, 300자 이내로 간결하게)
- keyPoints: 3개의 학습 포인트 (각 1문장)
- wrongOptionExplanations: 각 오답이 틀린 이유를 한국어로 간결하게 (각 1~2문장)
- tags: 관련 문법/어휘/유형 태그를 한국어로
${customPrompt ? `\n## 선생님 추가 지시\n${customPrompt}` : ""}

정확히 ${count}문제를 생성하세요.`,
    );
    } catch (aiError) {
      // Refund credits on AI failure
      await refundCredits(staff.academyId, operationType, creditResult.transactionId, "AI generation failed");
      throw aiError;
    }
    const duration = Date.now() - startTime;

    // Post-process + WORD_ORDER shuffle
    const questions: any[] = [];
    for (const q of ((object as any).questions || [])) {
      // Post-process: reconstruct passage fields from AI minimal output
      const ppResult = postProcessQuestion(questionType, passage.content, q);
      if (!ppResult.success) {
        console.warn(`[SINGLE-GEN] Post-process failed for ${questionType}: ${ppResult.error}`);
        continue; // Skip this question
      }
      if (ppResult.warnings.length > 0) {
        console.warn(`[SINGLE-GEN] Post-process warnings for ${questionType}:`, ppResult.warnings);
      }

      const mapped: any = { ...ppResult.data };

      // WORD_ORDER: 강제 셔플 — AI가 정답 순서로 넣는 경우 방지
      if (questionType === "WORD_ORDER" && Array.isArray(mapped.scrambledWords) && mapped.scrambledWords.length > 1) {
        const arr = [...mapped.scrambledWords];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (arr.join("|") === mapped.scrambledWords.join("|")) {
          [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
        }
        mapped.scrambledWords = arr;
      }

      questions.push(mapped);
    }

    console.log(`[SINGLE-GEN] ${questionType} done: ${questions.length}/${count} questions`);

    return NextResponse.json({
      questionType,
      difficulty,
      questions,
      creditsRemaining: creditResult.balanceAfter,
    });
  } catch (error) {
    console.error("Single question generation error:", error);
    return NextResponse.json(
      { error: "문제 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
