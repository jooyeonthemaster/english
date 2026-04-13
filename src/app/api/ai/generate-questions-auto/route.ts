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

export const maxDuration = 300;

// ─── Step 1 Schema: AI plans which types to use ───
const planSchema = z.object({
  plan: z.array(z.object({
    subType: z.string().describe("Question type ID"),
    count: z.number().describe("Number of questions for this type"),
    reason: z.string().describe("왜 이 유형을 선택했는지 분석 데이터 근거와 함께 설명"),
    targetPoints: z.array(z.string()).describe("이 유형에서 활용할 분석 포인트 (어휘, 문법, 출제포인트 등에서 선별)"),
  })),
  rationale: z.string().describe("전체 출제 전략 요약 (한국어)"),
});

// ─── Fallback schema for types without structured schema ───
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

export async function POST(request: NextRequest) {
  try {
    // ── Auth + Credit deduction ──
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { passageId, count, difficulty, customPrompt } = body as {
      passageId: string;
      count: number;
      difficulty?: string;
      customPrompt?: string;
    };

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "AUTO_GEN_BATCH", staff.id, {
        passageId,
        count,
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
      await refundCredits(staff.academyId, "AUTO_GEN_BATCH", creditResult.transactionId, "Passage not found");
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
    const gradeInfo = passage.grade ? `${passage.grade}학년` : "";
    const diffLabel = difficulty || "INTERMEDIATE";
    const diffDescription: Record<string, string> = {
      BASIC: "기본 — 교과서 수준, 직접적 이해 위주, 쉬운 어휘와 단순 문법",
      INTERMEDIATE: "중급 — 모의고사 중위권 수준, 추론 필요, 패러프레이징 포함",
      KILLER: "킬러 — 수능 1등급 컷 수준, 고난도 추론/함축 의미 파악, 복잡한 구문과 어휘, 매력적인 오답",
    };
    const diffInstruction = diffDescription[diffLabel] || diffDescription.INTERMEDIATE;

    // ── Build analysis context ──
    let analysisContext = "";
    if (passage.analysis?.analysisData) {
      try {
        const a = JSON.parse(passage.analysis.analysisData);

        if (a.vocabulary?.length) {
          analysisContext += "\n\n## 핵심 어휘 분석\n";
          for (const v of a.vocabulary) {
            let line = `- **${v.word}** (${v.partOfSpeech || ""}): ${v.meaning}`;
            if (v.difficulty) line += ` [${v.difficulty}]`;
            if (v.synonyms?.length) line += ` | 동의어: ${v.synonyms.join(", ")}`;
            if (v.contextMeaning) line += ` | 문맥 의미: ${v.contextMeaning}`;
            if (v.examType) line += ` | ★추천 출제유형: ${v.examType}`;
            analysisContext += line + "\n";
          }
        }

        if (a.grammarPoints?.length) {
          analysisContext += "\n## 문법 포인트\n";
          for (const gp of a.grammarPoints) {
            let line = `- **${gp.pattern}**: ${gp.explanation}`;
            if (gp.textFragment) line += ` | "${gp.textFragment}"`;
            if (gp.commonMistake) line += ` | 흔한 실수: ${gp.commonMistake}`;
            if (gp.transformations?.length) line += ` | 변환: ${gp.transformations.join("; ")}`;
            if (gp.examType) line += ` | ★추천 출제유형: ${gp.examType}`;
            analysisContext += line + "\n";
          }
        }

        if (a.structure) {
          analysisContext += "\n## 지문 구조\n";
          analysisContext += `- 주제: ${a.structure.mainIdea}\n`;
          if (a.structure.blankSuitablePositions?.length)
            analysisContext += `- ★빈칸 적합 위치: ${a.structure.blankSuitablePositions.join("; ")}\n`;
          if (a.structure.orderClues?.length)
            analysisContext += `- ★순서/삽입 단서: ${a.structure.orderClues.join("; ")}\n`;
          if (a.structure.connectorAnalysis?.length) {
            analysisContext += "- 담화 연결어:\n";
            for (const c of a.structure.connectorAnalysis)
              analysisContext += `  - "${c.word}" (${c.role})\n`;
          }
        }

        if (a.examDesign) {
          analysisContext += "\n## ★출제 설계 포인트 (반드시 활용)\n";
          if (a.examDesign.paraphrasableSegments?.length) {
            for (const ps of a.examDesign.paraphrasableSegments) {
              analysisContext += `- 패러프레이징: "${ps.original}" → ${ps.alternatives?.join(" / ") || ""}`;
              if (ps.reason) analysisContext += ` (${ps.reason})`;
              if (ps.questionExample) analysisContext += ` | 예시문항: ${ps.questionExample}`;
              analysisContext += "\n";
            }
          }
          if (a.examDesign.structureTransformPoints?.length) {
            for (const tp of a.examDesign.structureTransformPoints) {
              analysisContext += `- 구조변환: "${tp.original}" → ${tp.transformType}: "${tp.example}"`;
              if (tp.reason) analysisContext += ` (${tp.reason})`;
              if (tp.questionExample) analysisContext += ` | 예시문항: ${tp.questionExample}`;
              analysisContext += "\n";
            }
          }
        }
      } catch { /* ignore */ }
    }

    // ═══ STEP 1: AI plans question type distribution ═══
    console.log("[AUTO-GEN] Step 1: Planning started for passage:", passage.title?.slice(0, 30));
    let planResult: z.infer<typeof planSchema>;
    let allQuestions: any[];
    try {
    const { object: _planResult } = await generateObject({
      model,
      schema: planSchema,
      prompt: `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신 시험 출제위원입니다.

아래 지문과 분석 데이터를 검토하고, ${count}문제를 출제할 **최적의 유형 배분 계획**을 세우세요.

## 핵심 규칙
1. ★표시된 "추천 출제유형"과 "출제 설계 포인트"를 **반드시 우선 반영**하세요.
2. 같은 유형을 3문제 이상 내지 마세요. 다양한 유형으로 분산하세요.
3. 분석 데이터에 근거 없는 유형은 선택하지 마세요.
4. targetPoints에 활용할 구체적 분석 항목(어휘명, 문법 패턴명, 출제포인트 원문)을 명시하세요.

## 지문
${passage.content}
${analysisContext}

## 사용 가능한 유형
객관식: BLANK_INFERENCE, GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, TOPIC_MAIN_IDEA, TITLE, REFERENCE, CONTENT_MATCH, IRRELEVANT
서술형: CONDITIONAL_WRITING, SENTENCE_TRANSFORM, FILL_BLANK_KEY, SUMMARY_COMPLETE, WORD_ORDER, GRAMMAR_CORRECTION
어휘: CONTEXT_MEANING, SYNONYM, ANTONYM

총 ${count}문제의 배분 계획을 세우세요.${customPrompt ? `\n\n## 선생님 추가 지시\n${customPrompt}` : ""}`,
    });
    planResult = _planResult;

    // ═══ STEP 2: Generate questions per type using existing structured schemas ═══
    const TYPE_LABELS: Record<string, string> = {
      BLANK_INFERENCE: "빈칸 추론", GRAMMAR_ERROR: "어법 판단", VOCAB_CHOICE: "어휘 적절성",
      SENTENCE_ORDER: "글의 순서", SENTENCE_INSERT: "문장 삽입", TOPIC_MAIN_IDEA: "주제/요지",
      TITLE: "제목 추론", REFERENCE: "지칭 추론", CONTENT_MATCH: "내용 일치", IRRELEVANT: "무관한 문장",
      CONDITIONAL_WRITING: "조건부 영작", SENTENCE_TRANSFORM: "문장 전환", FILL_BLANK_KEY: "핵심 표현 빈칸",
      SUMMARY_COMPLETE: "요약문 완성", WORD_ORDER: "배열 영작", GRAMMAR_CORRECTION: "문법 오류 수정",
      CONTEXT_MEANING: "문맥 속 의미", SYNONYM: "동의어", ANTONYM: "반의어",
    };

    console.log("[AUTO-GEN] Step 1 done. Plan:", JSON.stringify(planResult.plan.map(p => ({ type: p.subType, count: p.count }))));

    allQuestions = [];

    // ── Helper: generateObject with retry ──
    async function generateWithRetry(
      schema: z.ZodType,
      prompt: string,
      maxRetries = 2,
    ) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) console.log(`[AUTO-GEN] Retry attempt ${attempt}...`);
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
          console.warn(`[AUTO-GEN] Attempt ${attempt} failed:`, msg);
          // Log diagnostic info for debugging
          if (err.finishReason) console.warn(`[AUTO-GEN]   finishReason: ${err.finishReason}`);
          if (err.usage) console.warn(`[AUTO-GEN]   tokens: input=${err.usage.inputTokens}, output=${err.usage.outputTokens}`);
          if (err.text) console.warn(`[AUTO-GEN]   rawText (first 300): ${err.text.slice(0, 300)}`);
        }
      }
      throw lastError;
    }

    // Generate each type SEQUENTIALLY
    for (const item of planResult.plan) {
      const { subType, count: typeCount, targetPoints } = item;
      if (typeCount <= 0) continue;

      console.log(`[AUTO-GEN] Step 2: Generating ${subType} x${typeCount}...`);

      const typePrompt = STRUCTURED_TYPE_PROMPTS[subType] || `${subType} 유형의 문제를 만드세요.`;
      // Use AI-minimal schema if available, otherwise fall back to full schema
      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];
      const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[subType];
      const responseSchema = hasAiSchema
        ? getAiResponseSchema(subType)
        : isStructured
          ? z.object({ questions: z.array(QUESTION_SCHEMAS[subType]) })
          : fallbackResponseSchema;

      const structuredInstructions = isStructured
        ? `\n## 출력 형식 안내
- 반드시 아래 유형별 지시사항의 필드 이름을 정확히 사용하세요.
- direction 필드에는 발문(한국어)을 넣으세요.
- correctAnswer 필드에는 정답 선지 label (객관식) 또는 정답 텍스트 (서술형)를 넣으세요.
- ⚠️ 지문 전체를 복사하는 필드(passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers)는 절대 생성하지 마세요. 서버에서 자동 생성합니다.`
        : `\n## 출력 형식 안내
- 밑줄 친 표현은 __단어__ 형태로 감쌉니다
- 빈칸은 _____(5개 이상)으로 표시합니다`;

      let targetContext = "";
      if (targetPoints.length > 0) {
        targetContext = `\n\n## 이 유형에서 반드시 활용할 분석 포인트\n${targetPoints.map(p => `- ${p}`).join("\n")}`;
      }

      try {
        const object = await generateWithRetry(
          responseSchema,
          `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passage.content}
${analysisContext}
${targetContext}

## 출제 유형 지시사항
${typePrompt}
${structuredInstructions}

## 생성 조건
- 문제 수: ${typeCount}문제
- **난이도: ${diffLabel} (${diffInstruction})**
- difficulty 필드에 반드시 "${diffLabel}"을 입력하세요. 다른 값을 넣지 마세요.
- 객관식은 반드시 5개 선택지 (options 배열에 {label, text} 형태)
- 해설(explanation): 왜 정답인지 지문 근거와 함께 한국어로 작성 (3~5문장, 300자 이내로 간결하게)
- keyPoints: 3개의 학습 포인트 (각 1문장)
- wrongOptionExplanations: 각 오답이 틀린 이유를 한국어로 간결하게 (각 1~2문장)
- tags: 관련 문법/어휘/유형 태그를 한국어로

위의 "활용할 분석 포인트"에 명시된 어휘/문법/출제포인트를 반드시 문제에 반영하세요.
정확히 ${typeCount}문제를 생성하세요.`,
        );

        const qs: any[] = [];
        for (const q of ((object as any).questions || [])) {
          // Post-process: reconstruct passage fields from AI minimal output
          const ppResult = postProcessQuestion(subType, passage.content, q);
          if (!ppResult.success) {
            console.warn(`[AUTO-GEN] Post-process failed for ${subType}: ${ppResult.error}`);
            continue; // Skip this question
          }
          if (ppResult.warnings.length > 0) {
            console.warn(`[AUTO-GEN] Post-process warnings for ${subType}:`, ppResult.warnings);
          }

          const mapped: any = { ...ppResult.data, _typeId: subType, _typeLabel: TYPE_LABELS[subType] || subType };

          // WORD_ORDER: 강제 셔플 — AI가 정답 순서로 넣는 경우 방지
          if (subType === "WORD_ORDER" && Array.isArray(mapped.scrambledWords) && mapped.scrambledWords.length > 1) {
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
          qs.push(mapped);
        }
        allQuestions.push(...qs);
        console.log(`[AUTO-GEN] ${subType} done: ${qs.length} questions`);
      } catch (err) {
        console.error(`[AUTO-GEN] Failed ${subType}:`, err instanceof Error ? err.message : err);
      }
    }

    } catch (aiError) {
      // Refund credits on AI failure
      await refundCredits(staff.academyId, "AUTO_GEN_BATCH", creditResult.transactionId, "Auto generation failed");
      throw aiError;
    }

    if (allQuestions.length === 0) {
      // Refund if no questions were produced
      await refundCredits(staff.academyId, "AUTO_GEN_BATCH", creditResult.transactionId, "No questions generated");
      return NextResponse.json({ error: "문제 생성에 실패했습니다.", questions: [], creditsRemaining: creditResult.balanceAfter });
    }

    return NextResponse.json({
      questions: allQuestions,
      rationale: planResult.rationale,
      count: allQuestions.length,
      creditsRemaining: creditResult.balanceAfter,
    });
  } catch (error) {
    console.error("Auto question generation error:", error);
    return NextResponse.json(
      { error: "자동 문제 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
