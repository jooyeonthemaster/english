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

export const maxDuration = 120;

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
    const body = await request.json();
    const { passageId, count, difficulty, customPrompt } = body as {
      passageId: string;
      count: number;
      difficulty?: string;
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
    const diffLabel = difficulty || "INTERMEDIATE";

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
    const planController = new AbortController();
    const planTimeout = setTimeout(() => planController.abort(), 30000); // 30s for planning
    const { object: planResult } = await generateObject({
      abortSignal: planController.signal,
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

    // ═══ STEP 2: Generate questions per type using existing structured schemas ═══
    const TYPE_LABELS: Record<string, string> = {
      BLANK_INFERENCE: "빈칸 추론", GRAMMAR_ERROR: "어법 판단", VOCAB_CHOICE: "어휘 적절성",
      SENTENCE_ORDER: "글의 순서", SENTENCE_INSERT: "문장 삽입", TOPIC_MAIN_IDEA: "주제/요지",
      TITLE: "제목 추론", REFERENCE: "지칭 추론", CONTENT_MATCH: "내용 일치", IRRELEVANT: "무관한 문장",
      CONDITIONAL_WRITING: "조건부 영작", SENTENCE_TRANSFORM: "문장 전환", FILL_BLANK_KEY: "핵심 표현 빈칸",
      SUMMARY_COMPLETE: "요약문 완성", WORD_ORDER: "배열 영작", GRAMMAR_CORRECTION: "문법 오류 수정",
      CONTEXT_MEANING: "문맥 속 의미", SYNONYM: "동의어", ANTONYM: "반의어",
    };

    clearTimeout(planTimeout);
    console.log("[AUTO-GEN] Step 1 done. Plan:", JSON.stringify(planResult.plan.map(p => ({ type: p.subType, count: p.count }))));

    const allQuestions: any[] = [];

    // Generate each type SEQUENTIALLY
    for (const item of planResult.plan) {
      const { subType, count: typeCount, targetPoints } = item;
      if (typeCount <= 0) continue;

      console.log(`[AUTO-GEN] Step 2: Generating ${subType} x${typeCount}...`);

      const typePrompt = STRUCTURED_TYPE_PROMPTS[subType] || `${subType} 유형의 문제를 만드세요.`;
      const isStructured = !!QUESTION_SCHEMAS[subType];
      const responseSchema = isStructured
        ? getResponseSchema(subType)
        : fallbackResponseSchema;

      const structuredInstructions = isStructured
        ? `\n## 출력 형식 안내
- 반드시 아래 유형별 지시사항의 필드 이름을 정확히 사용하세요.
- 밑줄 표시: __단어__ 형태로 감싸세요 (double underscore).
- 빈칸 표시: _____ (underscore 5개 이상)으로 표시하세요.
- direction 필드에는 발문(한국어)을 넣으세요.
- correctAnswer 필드에는 정답 선지 label (객관식) 또는 정답 텍스트 (서술형)를 넣으세요.`
        : `\n## 출력 형식 안내
- 밑줄 친 표현은 __단어__ 형태로 감쌉니다
- 빈칸은 _____(5개 이상)으로 표시합니다`;

      let targetContext = "";
      if (targetPoints.length > 0) {
        targetContext = `\n\n## 이 유형에서 반드시 활용할 분석 포인트\n${targetPoints.map(p => `- ${p}`).join("\n")}`;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout per type
        const { object } = await generateObject({
          model,
          schema: responseSchema,
          abortSignal: controller.signal,
          prompt: `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passage.content}
${analysisContext}
${targetContext}

## 출제 유형 지시사항
${typePrompt}
${structuredInstructions}

## 생성 조건
- 문제 수: ${typeCount}문제
- 난이도: ${diffLabel}
- 객관식은 반드시 5개 선택지 (options 배열에 {label, text} 형태)
- 해설(explanation): 왜 정답인지 지문 근거와 함께 상세히 한국어로 작성
- keyPoints: 3개 이상의 학습 포인트
- wrongOptionExplanations: 각 오답이 틀린 이유를 한국어로 작성 (객관식인 경우 필수)
- tags: 관련 문법/어휘/유형 태그를 한국어로
- difficulty: "${diffLabel}"

위의 "활용할 분석 포인트"에 명시된 어휘/문법/출제포인트를 반드시 문제에 반영하세요.
정확히 ${typeCount}문제를 생성하세요.`,
        });

        const qs = (object.questions || []).map((q: any) => ({
          ...q,
          _typeId: subType,
          _typeLabel: TYPE_LABELS[subType] || subType,
        }));
        clearTimeout(timeout);
        allQuestions.push(...qs);
        console.log(`[AUTO-GEN] ${subType} done: ${qs.length} questions`);
      } catch (err) {
        console.error(`[AUTO-GEN] Failed ${subType}:`, err instanceof Error ? err.message : err);
      }
    }

    if (allQuestions.length === 0) {
      return NextResponse.json({ error: "문제 생성에 실패했습니다.", questions: [] });
    }

    return NextResponse.json({
      questions: allQuestions,
      rationale: planResult.rationale,
      count: allQuestions.length,
    });
  } catch (error) {
    console.error("Auto question generation error:", error);
    return NextResponse.json(
      { error: "자동 문제 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
