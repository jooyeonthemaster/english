import { generateObject } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";

const questionOptionSchema = z.object({
  label: z.string(),
  text: z.string(),
});

const generatedQuestionSchema = z.object({
  type: z.string(),
  subType: z.string().optional(),
  questionText: z.string(),
  options: z.array(questionOptionSchema).optional(),
  correctAnswer: z.string(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
  explanation: z.string(),
  keyPoints: z.array(z.string()),
  wrongOptionExplanations: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()),
});

const responseSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const {
      passageId,
      questionTypes,
      difficultyDistribution,
      count,
    } = body as {
      passageId: string;
      questionTypes: string[];
      difficultyDistribution: { BASIC: number; INTERMEDIATE: number; KILLER: number };
      count: number;
    };

    // ── Credit deduction ──
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "QUESTION_GEN_SINGLE", staff.id, {
        passageId,
        questionTypes,
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

    // Fetch passage
    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        school: { select: { type: true, name: true } },
        analysis: { select: { analysisData: true } },
      },
    });

    if (!passage) {
      await refundCredits(staff.academyId, "QUESTION_GEN_SINGLE", creditResult.transactionId, "Passage not found");
      return NextResponse.json(
        { error: "지문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const schoolType =
      passage.school?.type === "MIDDLE"
        ? "중학교"
        : passage.school?.type === "HIGH"
        ? "고등학교"
        : "영어";

    const gradeInfo = passage.grade ? `${passage.grade}학년` : "";

    // Build difficulty instruction
    const basicCount = Math.round((difficultyDistribution.BASIC / 100) * count);
    const intermediateCount = Math.round(
      (difficultyDistribution.INTERMEDIATE / 100) * count
    );
    const killerCount = count - basicCount - intermediateCount;

    // Build question type instruction
    const typeMap: Record<string, string> = {
      MULTIPLE_CHOICE: "객관식 (5지선다)",
      SHORT_ANSWER: "주관식 (서술형)",
      FILL_BLANK: "빈칸 채우기",
      ORDERING: "순서 배열",
      VOCAB: "어휘 문제",
    };

    const subTypeMap: Record<string, string> = {
      BLANK_INFERENCE: "빈칸 추론 (문맥상 적절한 단어/구문 고르기)",
      GRAMMAR_ERROR: "어법상 틀린 것 고르기",
      SENTENCE_INSERT: "주어진 문장 넣기 (문장 삽입 위치 찾기)",
      SENTENCE_ORDER: "문장 순서 배열하기",
      MAIN_IDEA: "주제/요지/제목 고르기",
      PURPOSE: "글의 목적 파악",
      IMPLICATION: "함축 의미 추론",
      REFERENCE: "지칭 대상 파악 (밑줄 친 부분이 가리키는 것)",
      TRUE_FALSE: "글의 내용과 일치/불일치",
      SUMMARY: "요약문 완성",
      VOCAB_MEANING: "밑줄 친 단어의 의미",
      VOCAB_SYNONYM: "동의어/유의어 고르기",
      CONNECTIVE: "연결어 넣기",
      IRRELEVANT_SENTENCE: "흐름과 관계없는 문장 고르기",
    };

    const requestedTypes = questionTypes
      .map((t) => subTypeMap[t] || typeMap[t] || t)
      .join(", ");

    // Include analysis data if available
    let analysisContext = "";
    if (passage.analysis?.analysisData) {
      try {
        const analysis = JSON.parse(passage.analysis.analysisData);
        if (analysis.grammarPoints) {
          analysisContext += "\n\n## 지문 문법 포인트\n";
          for (const gp of analysis.grammarPoints) {
            analysisContext += `- ${gp.pattern}: ${gp.explanation} (예: "${gp.textFragment}")\n`;
          }
        }
        if (analysis.vocabulary) {
          analysisContext += "\n## 핵심 어휘\n";
          for (const v of analysis.vocabulary) {
            analysisContext += `- ${v.word}: ${v.meaning} (${v.partOfSpeech})\n`;
          }
        }
        if (analysis.structure) {
          analysisContext += `\n## 글 구조\n- 주제: ${analysis.structure.mainIdea}\n- 목적: ${analysis.structure.purpose}\n- 유형: ${analysis.structure.textType}\n`;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    let object: z.infer<typeof responseSchema>;
    try {
      const { object: _object } = await generateObject({
        model,
        schema: responseSchema,
        prompt: `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신 시험 출제 전문가입니다.
아래 영어 지문을 기반으로 고품질 시험 문제를 생성하세요.

## 지문 정보
- 제목: ${passage.title}
- 학교: ${passage.school?.name || "미지정"}
- 학년: ${gradeInfo || "미지정"}
- 난이도: ${passage.difficulty || "미지정"}

## 지문 내용
${passage.content}
${analysisContext}

## 출제 요구사항
- 총 문제 수: ${count}문제
- 문제 유형: ${requestedTypes}
- 난이도 배분:
  - BASIC (기본): ${basicCount}문제 (교과서 기본 내용 확인)
  - INTERMEDIATE (중급): ${intermediateCount}문제 (응용 및 추론)
  - KILLER (킬러): ${killerCount}문제 (고난도 변별력)

## 출제 규칙 (반드시 준수)
1. 객관식은 반드시 5개 선택지를 제공하세요 (label: "1"~"5")
2. 모든 문제는 지문 내용을 정확히 반영해야 합니다
3. 오답 선택지는 그럴듯하지만 명확히 구분 가능해야 합니다
4. 해설(explanation)은 반드시 상세하게 작성하세요:
   - 왜 정답인지 근거를 지문에서 인용하여 설명
   - 핵심 문법/어휘 포인트 설명
   - 학생이 실수하기 쉬운 함정 포인트 설명
   - 모든 해설은 한국어로 작성
5. tags에는 관련 문법/어휘/유형을 한국어로 표기하세요
6. wrongOptionExplanations에 오답 번호별 "왜 틀렸는지" 한국어로 설명을 반드시 포함하세요 (예: {"1": "~이므로 오답", "2": "~와 다르므로 오답"})
7. questionText(발문)는 반드시 한국어로 작성하세요. 지문 인용 부분만 영어 그대로 표기합니다
8. **선택지(options) 언어 규칙 (매우 중요)**:
   - 빈칸 추론 문제: 빈칸에 들어갈 표현이므로 선택지는 반드시 **영어**로 작성
   - 어법/어휘/문장삽입/순서배열 문제: 영어 표현을 판단하는 문제이므로 선택지는 **영어**로 작성
   - 주제/요지/제목/내용일치/글의 목적 문제: 내용을 이해했는지 묻는 문제이므로 선택지는 **한국어**로 작성
   - 서술형 문제: 발문과 조건은 한국어, 작성할 내용은 영어
9. 문제 번호는 넣지 마세요 (나중에 자동 부여됨)
10. KILLER 난이도 문제는 지문 변형, 순서 배열, 빈칸 추론, 어법 종합 등 고차원 사고를 요구하세요
11. 한국 중학교/고등학교 영어 내신 시험의 실제 출제 패턴과 형식을 정확히 따르세요
12. 반드시 요청된 문제 수(${count}문제)를 정확히 생성하세요. 더 적게 생성하지 마세요
13. keyPoints는 반드시 3개 이상 포함하세요 (이 문제에서 학생이 배워야 할 핵심 포인트)
14. "밑줄 친" 표현을 쓸 때는 해당 단어를 반드시 작은따옴표로 감싸세요 (예: "밑줄 친 'conduit'과"). UI에서 자동으로 밑줄이 렌더링됩니다
15. 빈칸은 반드시 언더스코어 5개 이상으로 표시하세요 (예: "The key is to focus on _____ rather than goals.")`,
      });
      object = _object;
    } catch (aiError) {
      await refundCredits(staff.academyId, "QUESTION_GEN_SINGLE", creditResult.transactionId, "AI generation failed");
      throw aiError;
    }

    return NextResponse.json({ questions: object.questions, creditsRemaining: creditResult.balanceAfter });
  } catch (error) {
    console.error("Question generation error:", error);
    return NextResponse.json(
      { error: "문제 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
