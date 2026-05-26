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
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import {
  readIrrelevantSlotCountSetting,
  validateIrrelevantAgainstPassage,
} from "@/lib/question-type-generation-settings";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { buildQuestionTargetCandidateBlock, getTypeQualityRubric, validateQuestionQuality } from "@/lib/question-quality";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import {
  getQuestionGenerationCreditCost,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import {
  buildGeminiCompactGenerationPrompt,
  buildQuestionGenerationPromptContract,
} from "@/lib/question-generation-prompt-contract";
import type { PassageAnnotationInput, PassageAnnotationType } from "@/actions/workbench";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

const DIFFICULTY_RUBRIC: Record<string, string> = {
  BASIC: `## 난이도 품질 기준
- BASIC은 원문 근거가 직접 드러나는 확인형 문제로 만드세요.
- 함정 선지는 명백히 구분되게 하되, 정답 근거는 반드시 지문에 있어야 합니다.`,
  INTERMEDIATE: `## 난이도 품질 기준
- INTERMEDIATE는 원문 한 문장 복사가 아니라 문맥 연결, 쉬운 패러프레이즈, 원인-결과 추론을 요구해야 합니다.
- 오답은 지문 일부와 연결되지만 핵심 논리에서 어긋나게 구성하세요.`,
  KILLER: `## 난이도 품질 기준 - KILLER
- "KILLER" 라벨만 붙이지 말고, 실제 상위권 변별 문제로 만드세요.
- 정답은 최소 2단계 사고가 필요해야 합니다: 지문 근거 확인 → 문맥/논리/함축 해석 → 선지 간 미세 차이 판별.
- 모든 오답은 전부 그럴듯해야 하며, 단순 반대말/무관 단어/길이 차이로 쉽게 지워지면 안 됩니다.
- 해설은 왜 정답인지뿐 아니라 매력적인 오답이 왜 틀렸는지 핵심 함정을 짚어야 합니다.
- 어휘형 KILLER는 단순 사전식 synonym/antonym을 피하고, 문맥상 뉘앙스/평가/논리 역할까지 보게 하세요.
- 함축 의미 추론 KILLER는 밑줄 표현 전후의 최소 두 근거를 연결해야 풀리게 하고, 오답은 지문 개념을 빌린 근접 오답으로 설계하세요.
- 지칭 추론은 대명사의 문법적 수/의미 역할/앞뒤 논리를 모두 확인해야 풀리게 하세요.
- 서술형 KILLER는 한 개 문법 포인트가 아니라 2개 이상의 조건을 동시에 만족하게 하세요.
- 요약문/영작/배열 문제의 정답은 자연스러운 영어 collocation이어야 하며, 어색한 조합은 금지합니다.
- 배열 영작의 scrambledWords는 정답 순서 그대로 두지 말고, punctuation-only 조각이 생기지 않게 의미 단위로 나누세요.`,
};

const MARKING_RUBRIC = `## 표시/위치 정확도 필수 규칙
- underlinedPronoun/underlinedWord/underlinedExpression/originalExpression/markedWords/markedExpressions는 원문에 실제로 존재하는 표현만 쓰세요.
- 특히 "it", "is", "in", "as" 같은 짧은 단어는 반드시 독립 단어로 존재하는 위치만 선택하세요. digital, commitments, within 같은 단어 내부의 일부를 선택하면 실패입니다.
- surroundingText는 선택한 표현을 포함하는 원문 그대로의 40~80자여야 하며, 철자/공백/문장부호를 바꾸지 마세요.
- passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers 같은 지문 전체 복사 필드는 생성하지 마세요.`;

/**
 * Pick annotation types that are most relevant for a given questionType so we
 * don't drown the prompt in unrelated markings. examPoint is always relevant
 * (it's the catch-all "this matters" signal from the teacher).
 */
function filterAnnotationsForType(
  anns: PassageAnnotationInput[],
  questionType: string,
): PassageAnnotationInput[] {
  if (!anns?.length) return [];
  const grammarTypes = new Set([
    "GRAMMAR_ERROR", "GRAMMAR_TRANSFORM", "WORD_ORDER",
  ]);
  const vocabTypes = VOCAB_TYPES;
  const structureTypes = new Set([
    "ORDERING", "SENTENCE_INSERT", "TOPIC_GIST", "TITLE",
    "MAIN_IDEA", "IMPLIED_MEANING", "IRRELEVANT_SENTENCE", "SUMMARY",
  ]);

  return anns.filter((a) => {
    if (a.type === "examPoint") return true;
    if (grammarTypes.has(questionType)) return a.type === "grammar" || a.type === "syntax";
    if (vocabTypes.has(questionType)) return a.type === "vocab";
    if (structureTypes.has(questionType)) return a.type === "sentence" || a.type === "syntax";
    // Default: BLANK_INFERENCE etc. — broad relevance, include all but narrow noise types
    return true;
  });
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ─── Helper: model generation with retry ───
async function generateWithRetry(
  schema: z.ZodType,
  prompt: string,
  generationPlan: QuestionGenerationPlan,
  maxTokens: number,
  maxRetries = 2,
) {
  const result = await generateQuestionObject({
    schema,
    prompt,
    generationPlan,
    logPrefix: "SINGLE-GEN",
    maxRetries,
    maxTokens,
  });
  return result;
}

// ─── Single-type question generation (called in parallel) ───
export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  try {
    // ── Auth + Credit deduction ──
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { passageId, questionType, count, difficulty, customPrompt, generationPlan: rawGenerationPlan, questionTypeSettings: rawTypeSettings } = body as {
      passageId: string;
      questionType: string;
      count: number;
      difficulty: string;
      customPrompt?: string;
      generationPlan?: unknown;
      questionTypeSettings?: unknown;
    };
    const typeSettingsForType =
      rawTypeSettings && typeof rawTypeSettings === "object" && !Array.isArray(rawTypeSettings)
        ? (rawTypeSettings as Record<string, unknown>)[questionType]
        : undefined;
    const generationPlan = normalizeQuestionGenerationPlan(rawGenerationPlan);

    const operationType: OperationType = VOCAB_TYPES.has(questionType)
      ? "QUESTION_GEN_VOCAB"
      : "QUESTION_GEN_SINGLE";
    const creditCost = getQuestionGenerationCreditCost(CREDIT_COSTS[operationType], generationPlan);

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, operationType, staff.id, {
        questionType,
        count,
        passageId,
        generationPlan,
        creditCost,
      }, creditCost);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId: staff.academyId },
      include: {
        school: { select: { type: true, name: true } },
        analysis: { select: { analysisData: true } },
        notes: { orderBy: { order: "asc" } },
      },
    });

    if (passage && request.nextUrl.searchParams.get("requireAnalysis") === "true" && !passage.analysis) {
      await refundCredits(
        staff.academyId,
        operationType,
        creditResult.transactionId,
        "Passage analysis required",
      );
      return NextResponse.json(
        { error: "지문 분석이 완료된 지문만 문제 생성에 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    if (!passage) {
      await refundCredits(staff.academyId, operationType, creditResult.transactionId, "Passage not found", creditCost);
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    // ── IRRELEVANT slot count guardrail ────────────────────────────────────
    let irrelevantSlotCount = 5;
    if (questionType === "IRRELEVANT") {
      const irrelevantSettings =
        typeSettingsForType && typeof typeSettingsForType === "object" && !Array.isArray(typeSettingsForType)
          ? (typeSettingsForType as { slotCount?: unknown })
          : null;
      const requestedSlotCount = readIrrelevantSlotCountSetting(irrelevantSettings);
      irrelevantSlotCount = requestedSlotCount;
      const passageSentenceCount = countPassageSentences(passage.content);
      const v = validateIrrelevantAgainstPassage(requestedSlotCount, passageSentenceCount);
      if (!v.ok) {
        await refundCredits(staff.academyId, operationType, creditResult.transactionId, v.error ?? "IRRELEVANT slot count invalid", creditCost);
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

    const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
    const gradeInfo = passage.grade ? `${passage.grade}학년` : "";

    // Use structured type prompt if available, otherwise fall back
    const typePrompt = STRUCTURED_TYPE_PROMPTS[questionType] || `${questionType} 유형의 문제를 만드세요.`;
    const typeQualityRubric = getTypeQualityRubric(questionType, difficulty);
    const targetCandidateBlock = buildQuestionTargetCandidateBlock(questionType, passage.content, {
      irrelevantSlotCount,
      requestedDifficulty: difficulty,
    });

    // NOTE: most of this section is a dead-code path; the live entry below
    // is runQuestionGenerationWithEmptyRetry, which receives typeSettings.
    const hasAiSchema = !!AI_QUESTION_SCHEMAS[questionType];
    const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[questionType];
    const responseSchema = hasAiSchema
      ? getAiResponseSchema(questionType, { irrelevantSlotCount })
      : isStructured
        ? z.object({ questions: z.array(QUESTION_SCHEMAS[questionType]) })
        : fallbackResponseSchema;

    // Teacher annotation block — direct intent signal piped into question generation.
    // Filter to types relevant for this questionType so we don't dilute the prompt.
    const allAnnotations: PassageAnnotationInput[] = (passage.notes ?? []).map((n) => ({
      id: n.annotationId ?? n.id,
      type: ((n.noteType ?? "vocab") as PassageAnnotationType),
      text: n.content,
      memo: n.memo ?? "",
      from: n.highlightStart ?? 0,
      to: n.highlightEnd ?? 0,
    }));
    const relevantAnnotations = filterAnnotationsForType(allAnnotations, questionType);
    const annotationBlock = buildQuestionAnnotationBlock(relevantAnnotations);

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

    const requestedQuestionCount = Math.max(1, Math.floor(Number(count) || 1));
    const generationStartedAt = Date.now();
    try {
      const generationResult = await runQuestionGenerationWithEmptyRetry(
        {
          plan: [
            {
              subType: questionType,
              count: requestedQuestionCount,
              reason: "Single teacher-selected question type.",
              targetPoints: [],
            },
          ],
          schoolType,
          gradeInfo,
          passageContent: passage.content,
          teacherIntentBlock: annotationBlock,
          analysisContext,
          diffLabel: difficulty,
          diffInstruction:
            DIFFICULTY_RUBRIC[difficulty] || DIFFICULTY_RUBRIC.INTERMEDIATE,
          generationPlan,
          customPrompt,
          typeSettings: typeSettingsForType
            ? ({ [questionType]: typeSettingsForType } as Record<string, unknown>)
            : undefined,
        },
        { logPrefix: "SINGLE-GEN" },
      );
      const questions = generationResult.questions.slice(0, requestedQuestionCount);

      if (questions.length === 0) {
        await refundCredits(
          staff.academyId,
          operationType,
          creditResult.transactionId,
          "No questions generated",
          creditCost,
        );
      }

      return NextResponse.json({
        questionType,
        difficulty,
        generationPlan,
        questions,
        creditsRemaining: creditResult.balanceAfter,
        ...(questions.length === 0
          ? { warning: "No questions generated after fallback." }
          : {}),
        ...(request.nextUrl.searchParams.get("debugTiming") === "1"
          ? {
              debugTiming: {
                generationAttempts: generationResult.attempts,
                relaxedFallback: generationResult.relaxedFallback ? 1 : 0,
                generationMs: Date.now() - generationStartedAt,
                totalMs: Date.now() - requestStartedAt,
              },
            }
          : {}),
      });
    } catch (aiError) {
      await refundCredits(
        staff.academyId,
        operationType,
        creditResult.transactionId,
        "AI generation failed",
        creditCost,
      );
      throw aiError;
    }

    /*
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
    const providerQualityContract =
      buildQuestionGenerationPromptContract(generationPlan);
    const compactGenerationPrompt = buildGeminiCompactGenerationPrompt({
      schoolType,
      gradeInfo,
      passageContent: passage.content,
      teacherIntentBlock: annotationBlock,
      analysisContext,
      targetCandidateBlock,
      typePrompt,
      typeQualityRubric,
      count,
      difficulty,
      customPrompt,
    });

    console.log(`[SINGLE-GEN] Generating ${questionType} x${count} via ${generationPlan} plan...`);

    let object: unknown;
    let generationAttempts = 0;
    let generationDurationMs = 0;
    const startTime = Date.now();
    try {
    const generationResult = await generateWithRetry(
      responseSchema,
      generationPlan === "STANDARD"
        ? compactGenerationPrompt
        :
      `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passage.content}
${targetCandidateBlock ? `\n${targetCandidateBlock}\n` : ""}
${annotationBlock ? `\n${annotationBlock}\n` : ""}${analysisContext}

## 출제 유형 지시사항
${typePrompt}
${typeQualityRubric ? `\n${typeQualityRubric}` : ""}
${structuredInstructions}

## 생성 조건
- 문제 수: ${count}문제
- 난이도: ${difficulty}
${DIFFICULTY_RUBRIC[difficulty] || DIFFICULTY_RUBRIC.INTERMEDIATE}
${MARKING_RUBRIC}
${providerQualityContract}
- difficulty 필드에 반드시 "${difficulty}"을 입력하세요. 다른 값을 넣지 마세요.
- 객관식은 해당 유형이 요구하는 개수의 선택지(options 배열에 {label, text} 형태)를 만드세요. 대부분은 5개이고, 무관한 문장은 설정된 slotCount를 따릅니다.
- 해설(explanation): 왜 정답인지 지문 근거와 함께 한국어로 작성 (3~5문장, 300자 이내로 간결하게)
- keyPoints: 3개의 학습 포인트 (각 1문장)
- wrongOptionExplanations: 각 오답이 틀린 이유를 한국어로 간결하게 (각 1~2문장)
- wrongOptionExplanations is REQUIRED for every multiple-choice item: include exactly one entry for each wrong option. If the schema is an array, each entry must be {label, explanation}. Never return an empty object.
- tags: 관련 문법/어휘/유형 태그를 한국어로
${customPrompt ? `\n## 선생님 추가 지시\n${customPrompt}` : ""}

정확히 ${count}문제를 생성하세요.`,
      generationPlan,
      Math.min(20_000, Math.max(4_096, (Number(count) || 1) * 4_096)),
    );
    object = generationResult.object;
    generationAttempts = generationResult.attempts;
    generationDurationMs = generationResult.durationMs;
    } catch (aiError) {
      // Refund credits on AI failure
      await refundCredits(staff.academyId, operationType, creditResult.transactionId, "AI generation failed", creditCost);
      throw aiError;
    }
    const duration = Date.now() - startTime;

    // Post-process + WORD_ORDER shuffle
    const requestedCount = Math.max(1, Math.floor(Number(count) || 1));
    const generatedQuestionsAll = isRecord(object) && Array.isArray(object.questions)
      ? object.questions.filter(isRecord)
      : [];
    if (generatedQuestionsAll.length !== requestedCount) {
      console.warn(
        `[SINGLE-GEN] ${questionType} returned ${generatedQuestionsAll.length}/${requestedCount} questions; trimming to requested count.`,
      );
    }
    const generatedQuestions = generatedQuestionsAll.slice(0, requestedCount);
    const questions: Record<string, unknown>[] = [];
    for (const q of generatedQuestions) {
      // Post-process: reconstruct passage fields from AI minimal output
      const ppResult = postProcessQuestion(questionType, passage.content, q);
      if (!ppResult.success) {
        console.warn(`[SINGLE-GEN] Post-process failed for ${questionType}: ${ppResult.error}`);
        continue; // Skip this question
      }
      if (ppResult.warnings.length > 0) {
        console.warn(`[SINGLE-GEN] Post-process warnings for ${questionType}:`, ppResult.warnings);
      }

      const mapped: Record<string, unknown> = { ...(ppResult.data as Record<string, unknown>) };

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

      const qualityIssues = validateQuestionQuality({
        typeId: questionType,
        question: mapped,
        passage: passage.content,
        requestedDifficulty: difficulty,
      });
      const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
      const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
      if (qualityErrors.length > 0) {
        console.warn(`[SINGLE-GEN] Quality errors for ${questionType}:`, qualityErrors);
        continue;
      }
      if (qualityWarnings.length > 0) {
        console.warn(`[SINGLE-GEN] Quality warnings for ${questionType}:`, qualityWarnings);
      }

      questions.push(mapped);
    }

    console.log(`[SINGLE-GEN] ${questionType} done: ${questions.length}/${count} questions (${duration}ms)`);

    return NextResponse.json({
      questionType,
      difficulty,
      generationPlan,
      questions,
      creditsRemaining: creditResult.balanceAfter,
      ...(request.nextUrl.searchParams.get("debugTiming") === "1"
        ? {
            debugTiming: {
              aiCallMs: duration,
              generationDurationMs,
              generationAttempts,
              totalMs: Date.now() - requestStartedAt,
            },
          }
        : {}),
    });
    */
  } catch (error) {
    console.error("Single question generation error:", error);
    return NextResponse.json(
      { error: "문제 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
