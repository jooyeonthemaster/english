import { generateObject, generateText } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { hashContent } from "@/lib/passage-utils";
import { passageAnalysisSchema } from "@/lib/passage-analysis-schema";
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import type { OperationType } from "@/lib/credit-costs";

export const maxDuration = 120;


// ---------------------------------------------------------------------------
// GET — analysis with cache
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ passageId: string }> }
) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { passageId } = await params;

    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        analysis: true,
        school: { select: { type: true } },
      },
    });

    if (!passage) {
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    const currentHash = hashContent(passage.content);
    if (passage.analysis && passage.analysis.contentHash === currentHash) {
      return NextResponse.json({
        data: JSON.parse(passage.analysis.analysisData),
        cached: true,
      });
    }

    // Cache miss — deduct credits before running analysis
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "PASSAGE_ANALYSIS", staff.id, { passageId });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    let analysisData: unknown;
    try {
      analysisData = await runFullAnalysis(passage);
    } catch (aiError) {
      await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", creditResult.transactionId, "Analysis failed");
      throw aiError;
    }

    await prisma.passageAnalysis.upsert({
      where: { passageId },
      update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      create: { passageId, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
    });

    return NextResponse.json({ data: analysisData, cached: false, creditsRemaining: creditResult.balanceAfter });
  } catch (error) {
    console.error("Passage analysis error:", error);
    return NextResponse.json({ error: "지문 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — custom analysis, retranslate, enhance grammar
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ passageId: string }> }
) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { passageId } = await params;
    const body = await request.json();

    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: { analysis: true, school: { select: { type: true } } },
    });

    if (!passage) {
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    // --- Action: retranslate a single sentence ---
    if (body.action === "retranslate") {
      let creditResult: { balanceAfter: number; transactionId: string };
      try {
        creditResult = await deductCredits(staff.academyId, "SENTENCE_RETRANSLATION", staff.id, { passageId });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          return NextResponse.json(
            { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
            { status: 402 },
          );
        }
        throw err;
      }

      try {
        const { english } = body;
        const { text } = await generateText({
          model,
          prompt: `다음 영어 문장을 자연스러운 한국어로 번역하세요. 번역만 출력하세요.\n\n영어: ${english}\n\n한국어 번역:`,
        });
        return NextResponse.json({ korean: text.trim(), creditsRemaining: creditResult.balanceAfter });
      } catch (aiError) {
        await refundCredits(staff.academyId, "SENTENCE_RETRANSLATION", creditResult.transactionId, "Retranslation failed");
        throw aiError;
      }
    }

    // --- Action: enhance a grammar point ---
    if (body.action === "enhanceGrammar") {
      let creditResult: { balanceAfter: number; transactionId: string };
      try {
        creditResult = await deductCredits(staff.academyId, "GRAMMAR_ENHANCEMENT", staff.id, { passageId });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          return NextResponse.json(
            { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
            { status: 402 },
          );
        }
        throw err;
      }

      try {
        const { grammarPoint } = body;
        const { object: enhanced } = await generateObject({
          model,
          schema: passageAnalysisSchema.shape.grammarPoints.element,
          prompt: `다음 영어 문법 포인트를 더 자세하고 정확하게 보완해주세요.
학생이 이해하기 쉽도록 설명을 개선하고, 예문을 더 적절한 것으로 교체하세요.

현재 문법 포인트:
- 패턴: ${grammarPoint.pattern}
- 설명: ${grammarPoint.explanation}
- 지문 발췌: ${grammarPoint.textFragment}
- 수준: ${grammarPoint.level}
- 예문: ${grammarPoint.examples.join(", ")}

보완된 문법 포인트를 생성하세요.
sentenceIndex는 ${grammarPoint.sentenceIndex}로 유지하세요.
id는 "${grammarPoint.id}"로 유지하세요.`,
        });
        return NextResponse.json({ grammarPoint: enhanced, creditsRemaining: creditResult.balanceAfter });
      } catch (aiError) {
        await refundCredits(staff.academyId, "GRAMMAR_ENHANCEMENT", creditResult.transactionId, "Grammar enhancement failed");
        throw aiError;
      }
    }

    // --- Action: full analysis with custom prompt ---
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "PASSAGE_ANALYSIS", staff.id, { passageId });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    const { customPrompt } = body;
    console.log("[ANALYSIS] Custom prompt received:", customPrompt ? `${customPrompt.slice(0, 200)}...` : "NONE");

    let analysisData: unknown;
    try {
      analysisData = await runFullAnalysis(passage, customPrompt);
    } catch (aiError) {
      await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", creditResult.transactionId, "Custom analysis failed");
      throw aiError;
    }

    const currentHash = hashContent(passage.content);
    await prisma.passageAnalysis.upsert({
      where: { passageId },
      update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      create: { passageId, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
    });

    return NextResponse.json({ data: analysisData, cached: false, creditsRemaining: creditResult.balanceAfter });
  } catch (error) {
    console.error("Passage analysis POST error:", error);
    return NextResponse.json({ error: "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// 5-Layer Full Analysis
// ---------------------------------------------------------------------------
async function runFullAnalysis(
  passage: {
    content: string;
    grade: number | null;
    school: { type: string } | null;
  },
  customPrompt?: string
) {
  const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
  const gradeLabel = passage.grade
    ? `${schoolType} ${passage.grade}학년`
    : schoolType;

  const teacherNote = customPrompt
    ? `\n\n## 선생님 지시사항 (최우선 반영)\n${customPrompt}`
    : "";

  const startTime = Date.now();
  console.log("[ANALYSIS] Starting generateText (JSON mode)...");

  const { text: rawJson } = await generateText({
    model,
    prompt: `당신은 한국 중고등학교 영어 내신 시험 대비 전문 분석가입니다.
아래 지문을 내신 시험 출제 관점에서 분석하고, 결과를 **JSON만** 출력하세요.
JSON 외에 다른 텍스트는 절대 출력하지 마세요.

대상: ${gradeLabel}
${teacherNote}

## 지문
${passage.content}

## 출력 JSON 형식
{
  "sentences": [
    { "index": 0, "english": "원문 그대로", "korean": "한국어 번역" }
  ],
  "vocabulary": [
    {
      "word": "단어", "meaning": "뜻", "partOfSpeech": "품사(한국어)", "pronunciation": "한국어발음",
      "sentenceIndex": 0, "difficulty": "basic|intermediate|advanced",
      "synonyms": ["최대3개"], "antonyms": ["최대2개"], "derivatives": ["최대3개"],
      "collocations": ["최대3개"], "englishDefinition": "영영풀이",
      "contextMeaning": "문맥 속 의미", "examType": "빈칸추론|동의어|영영풀이|문맥추론|어휘적절성"
    }
  ],
  "grammarPoints": [
    {
      "id": "gp-1", "pattern": "문법용어(한국어)", "explanation": "설명",
      "textFragment": "지문 원문 정확 일치", "sentenceIndex": 0,
      "examples": ["예문2-3개"], "level": "고1",
      "examType": "어법객관식|서술형고치기|문장전환|빈칸|어순배열",
      "commonMistake": "오답 함정", "transformations": ["변형 최대3개"],
      "gradeLevel": "중1|중2|중3|고1|고2|고3/수능",
      "relatedGrammar": ["연관문법 최대3개"], "csatFrequency": "최다빈출|빈출|간헐|해당없음"
    }
  ],
  "structure": {
    "mainIdea": "주제", "purpose": "목적", "textType": "유형",
    "paragraphSummaries": [{ "paragraphIndex": 0, "summary": "요약", "role": "역할" }],
    "keyPoints": ["출제 핵심 3-5개"],
    "logicFlow": [{ "role": "주장|근거|예시|결론", "sentenceIndices": [0], "summary": "요약" }],
    "connectorAnalysis": [{ "word": "연결어", "sentenceIndex": 0, "role": "역할", "examRelevance": "출제 연관" }],
    "topicSentenceIndex": 0, "blankSuitablePositions": ["위치설명"], "tone": "어조"
  },
  "syntaxAnalysis": [
    {
      "sentenceIndex": 0, "structure": "S/V/O/C 분석", "chunkReading": "끊어/읽기",
      "patternType": "특수구문", "transformPoint": "전환 가능", "complexity": "complex", "keyPhrase": "핵심구문"
    }
  ],
  "examDesign": {
    "paraphrasableSegments": [{
      "original": "지문에서 정확히 복사한 원문 구간",
      "alternatives": ["동의 표현1", "동의 표현2"],
      "sentenceIndex": 0,
      "reason": "이 표현이 출제 포인트인 이유 (예: 빈칸에 자주 출제되는 추상적 표현)",
      "questionExample": "다음 빈칸에 들어갈 말로 가장 적절한 것은? _____ (→ 원문 표현)",
      "difficulty": "중급",
      "relatedPoint": "관련 어휘/문법 (예: struggle = have difficulty -ing)"
    }],
    "structureTransformPoints": [{
      "original": "지문에서 정확히 복사한 원문 구간",
      "transformType": "변형유형 (수동태전환/분사구문/관계사절축약 등)",
      "example": "변형된 문장 전체",
      "sentenceIndex": 0,
      "reason": "이 변형이 출제에 유용한 이유 (예: 수동태↔능동태 전환은 서술형 단골)",
      "questionExample": "다음 문장을 주어진 조건에 맞게 바꿔 쓰시오.",
      "difficulty": "고급"
    }],
    "summaryKeyPoints": ["요약문 작성 핵심 내용"],
    "descriptiveConditions": ["서술형 조건 (예: 주어진 단어를 사용하여 3번 문장을 수동태로 전환하시오)"]
  }
}

## 규칙
- vocabulary: 핵심 어휘 8-12개, 각 단어 1번만, 쉬운 단어 제외
- grammarPoints: 빈출 문법 3-6개
- syntaxAnalysis: 복잡한 문장 2-3개만
- 모든 배열은 지정된 최대 개수 엄수
- examDesign의 original 필드는 지문 원문에서 정확히 복사 (축약/"..."/생략 절대 금지)
- examDesign의 reason, questionExample 필드를 반드시 채워서 출제 의도를 명확히
- paraphrasableSegments는 빈칸/동의어 출제에 적합한 핵심 표현 위주 (3-4개)
- structureTransformPoints는 서술형 출제에 적합한 구문 변형 위주 (2-3개)
- JSON만 출력, 다른 텍스트 없이`,
  });

  console.log(`[ANALYSIS] generateText completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Parse JSON from response
  let jsonStr = rawJson.trim();
  // Strip markdown code fences if present
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr);

  // Validate with Zod — use safeParse so we can fallback to raw data on validation errors
  const validation = passageAnalysisSchema.safeParse(parsed);
  const analysisData = validation.success ? validation.data : parsed;

  console.log("[ANALYSIS] Keys:", Object.keys(analysisData));
  return analysisData;
}
