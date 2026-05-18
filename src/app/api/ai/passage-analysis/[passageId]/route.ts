import { generateObject, generateText } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { hashContent } from "@/lib/passage-utils";
import { passageAnalysisSchema } from "@/lib/passage-analysis-schema";
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import { generateQuestionText } from "@/lib/question-generation-llm";
import {
  getQuestionGenerationCreditCost,
  getQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { PassageAnnotationInput, PassageAnnotationType } from "@/actions/workbench";

async function loadPersistedAnnotations(
  passageId: string,
): Promise<PassageAnnotationInput[]> {
  const rows = await prisma.passageNote.findMany({
    where: { passageId },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    id: r.annotationId ?? r.id,
    type: ((r.noteType ?? "vocab") as PassageAnnotationType),
    text: r.content,
    memo: r.memo ?? "",
    from: r.highlightStart ?? 0,
    to: r.highlightEnd ?? 0,
  }));
}

export const maxDuration = 120;

type ClassifiedAnalysisError = {
  status: number;
  code: string;
  message: string;
  log: Record<string, unknown>;
};

class AnalysisJsonParseError extends Error {
  readonly finishReason?: string;
  readonly rawFinishReason?: string;
  readonly rawLength: number;
  readonly previewStart: string;
  readonly previewEnd: string;

  constructor(
    cause: unknown,
    raw: string,
    meta: { finishReason?: string; rawFinishReason?: string } = {},
  ) {
    super(cause instanceof Error ? cause.message : "AI response JSON parse failed");
    this.name = "AnalysisJsonParseError";
    this.cause = cause;
    this.finishReason = meta.finishReason;
    this.rawFinishReason = meta.rawFinishReason;
    this.rawLength = raw.length;
    this.previewStart = raw.slice(0, 500);
    this.previewEnd = raw.slice(-500);
  }
}

function getAnalysisGenerationPlan(value: unknown): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._generationPlan;
  return raw === "PREMIUM" || raw === "STANDARD" ? raw : null;
}

function shouldUseCachedAnalysis(
  cached: unknown,
  requestedPlan: QuestionGenerationPlan,
): boolean {
  const cachedPlan = getAnalysisGenerationPlan(cached);
  if (requestedPlan === "PREMIUM") return cachedPlan === "PREMIUM";
  return true;
}

function withAnalysisGenerationMetadata(
  analysisData: unknown,
  generationPlan: QuestionGenerationPlan,
) {
  if (!analysisData || typeof analysisData !== "object" || Array.isArray(analysisData)) {
    return analysisData;
  }

  return {
    ...(analysisData as Record<string, unknown>),
    _generationPlan: generationPlan,
    _generationTag: getQuestionGenerationPlanTag(generationPlan),
  };
}

function stripModelMetadataFromAnalysis(analysisData: unknown) {
  if (!analysisData || typeof analysisData !== "object" || Array.isArray(analysisData)) {
    return analysisData;
  }
  const { _modelUsed: _ignored, modelUsed: _ignoredModelUsed, ...rest } =
    analysisData as Record<string, unknown>;
  void _ignored;
  void _ignoredModelUsed;
  return rest;
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as Record<string, unknown>)[field];
}

function extractGoogleReason(responseBody: string): string | null {
  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: {
        status?: string;
        details?: Array<{ reason?: string }>;
      };
    };
    return (
      parsed.error?.details?.find((detail) => detail.reason)?.reason ??
      parsed.error?.status ??
      null
    );
  } catch {
    return null;
  }
}

function classifyAnalysisError(error: unknown): ClassifiedAnalysisError {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = getErrorField(error, "statusCode");
  const responseBody =
    typeof getErrorField(error, "responseBody") === "string"
      ? (getErrorField(error, "responseBody") as string)
      : "";
  const providerReason = extractGoogleReason(responseBody);
  const combined = [message, responseBody, providerReason]
    .filter(Boolean)
    .join("\n");

  const log = {
    name: getErrorField(error, "name"),
    message,
    statusCode,
    providerReason,
  };

  if (
    combined.includes("API_KEY_INVALID") ||
    /API Key not found|valid API key/i.test(combined)
  ) {
    return {
      status: 500,
      code: "GOOGLE_API_KEY_INVALID",
      message:
        "Google Gemini API 키가 유효하지 않습니다. GOOGLE_GENERATIVE_AI_API_KEY를 새 키로 교체한 뒤 서버를 재시작해주세요.",
      log,
    };
  }

  if (/API key is missing|API key.*missing/i.test(combined)) {
    return {
      status: 500,
      code: "GOOGLE_API_KEY_MISSING",
      message:
        "Google Gemini API 키가 설정되어 있지 않습니다. GOOGLE_GENERATIVE_AI_API_KEY 환경변수를 확인해주세요.",
      log,
    };
  }

  if (providerReason === "PERMISSION_DENIED") {
    return {
      status: 502,
      code: "GOOGLE_API_PERMISSION_DENIED",
      message:
        "Google Gemini API 권한이 거부되었습니다. API 사용 설정, 결제, 키 제한 설정을 확인해주세요.",
      log,
    };
  }

  if (statusCode === 429 || providerReason === "RESOURCE_EXHAUSTED") {
    return {
      status: 429,
      code: "GOOGLE_API_RATE_LIMITED",
      message:
        "Google Gemini API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.",
      log,
    };
  }

  if (error instanceof AnalysisJsonParseError) {
    const truncated =
      error.finishReason === "length" ||
      error.rawFinishReason === "MAX_TOKENS" ||
      /Unexpected end of JSON input/i.test(error.message);

    return {
      status: 502,
      code: truncated ? "AI_RESPONSE_TRUNCATED" : "AI_RESPONSE_JSON_PARSE_FAILED",
      message: truncated
        ? "AI 응답이 중간에 끊겨 분석을 저장하지 못했습니다. 출력 길이를 늘려두었으니 다시 시도해주세요."
        : "AI 응답 형식이 일부 깨져 분석을 저장하지 못했습니다. 다시 시도해주세요.",
      log: {
        ...log,
        finishReason: error.finishReason,
        rawFinishReason: error.rawFinishReason,
        rawLength: error.rawLength,
        previewStart: error.previewStart,
        previewEnd: error.previewEnd,
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 502,
      code: "AI_RESPONSE_JSON_PARSE_FAILED",
      message:
        "AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도하거나 프롬프트를 줄여주세요.",
      log,
    };
  }

  return {
    status: 500,
    code: "PASSAGE_ANALYSIS_FAILED",
    message: "지문 분석 중 오류가 발생했습니다.",
    log,
  };
}


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
    const generationPlan = normalizeQuestionGenerationPlan(
      _request.nextUrl.searchParams.get("generationPlan"),
    );
    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.PASSAGE_ANALYSIS,
      generationPlan,
    );

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
      const cachedAnalysis = JSON.parse(passage.analysis.analysisData);
      if (shouldUseCachedAnalysis(cachedAnalysis, generationPlan)) {
        return NextResponse.json({
          data: stripModelMetadataFromAnalysis(cachedAnalysis),
          cached: true,
          generationPlan: getAnalysisGenerationPlan(cachedAnalysis) || generationPlan,
        });
      }
      console.log("[ANALYSIS] Cache skipped because requested plan is premium and cached analysis is not premium.");
    }

    // Cache miss — deduct credits before running analysis
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "PASSAGE_ANALYSIS", staff.id, {
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

    let analysisData: unknown;
    try {
      // Auto-inject persisted teacher annotations so cache-miss re-analyses
      // always reflect the latest marking intent (no caller wiring needed).
      const persistedAnns = await loadPersistedAnnotations(passageId);
      const autoPrompt = persistedAnns.length > 0
        ? buildAnalysisPrompt("", persistedAnns)
        : undefined;
      const rawAnalysis = await runFullAnalysis(passage, autoPrompt, generationPlan);
      analysisData = withAnalysisGenerationMetadata(rawAnalysis, generationPlan);
    } catch (aiError) {
      await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", creditResult.transactionId, "Analysis failed", creditCost);
      throw aiError;
    }

    await prisma.passageAnalysis.upsert({
      where: { passageId },
      update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      create: { passageId, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
    });

    return NextResponse.json({
      data: analysisData,
      cached: false,
      creditsRemaining: creditResult.balanceAfter,
      generationPlan,
    });
  } catch (error) {
    const classified = classifyAnalysisError(error);
    console.error("Passage analysis error:", classified.log, error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
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
    const generationPlan = normalizeQuestionGenerationPlan(body.generationPlan);
    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.PASSAGE_ANALYSIS,
      generationPlan,
    );

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
      creditResult = await deductCredits(staff.academyId, "PASSAGE_ANALYSIS", staff.id, {
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

    const { customPrompt } = body;
    // Always merge persisted annotations, then layer the caller's custom prompt
    // on top so explicit instructions still win precedence.
    const persistedAnns = await loadPersistedAnnotations(passageId);
    const annotationBlock = persistedAnns.length > 0
      ? buildAnalysisPrompt("", persistedAnns)
      : "";
    const mergedPrompt = [annotationBlock, customPrompt]
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .join("\n\n");
    console.log("[ANALYSIS] Custom prompt received:", customPrompt ? `${customPrompt.slice(0, 200)}...` : "NONE");
    console.log("[ANALYSIS] Persisted annotations:", persistedAnns.length);

    let analysisData: unknown;
    try {
      const rawAnalysis = await runFullAnalysis(passage, mergedPrompt || undefined, generationPlan);
      analysisData = withAnalysisGenerationMetadata(rawAnalysis, generationPlan);
    } catch (aiError) {
      await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", creditResult.transactionId, "Custom analysis failed", creditCost);
      throw aiError;
    }

    const currentHash = hashContent(passage.content);
    await prisma.passageAnalysis.upsert({
      where: { passageId },
      update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      create: { passageId, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
    });

    return NextResponse.json({
      data: analysisData,
      cached: false,
      creditsRemaining: creditResult.balanceAfter,
      generationPlan,
    });
  } catch (error) {
    const classified = classifyAnalysisError(error);
    console.error("Passage analysis POST error:", classified.log, error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}

// ---------------------------------------------------------------------------
// 5-Layer Full Analysis
// ---------------------------------------------------------------------------
function findFirstBalancedJson(text: string): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (inString) {
      if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return { start, end: i + 1 };
      }
    }
  }

  return null;
}

function repairInvalidJsonEscapes(text: string): string {
  const validEscapes = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
  const out: string[] = [];
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!inString) {
      if (char === "\"") inString = true;
      out.push(char);
      continue;
    }

    if (char === "\"") {
      inString = false;
      out.push(char);
      continue;
    }

    if (char !== "\\") {
      out.push(char);
      continue;
    }

    const next = text[i + 1];
    if (next === undefined) continue;

    if (next === "u") {
      const hex = text.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out.push(text.slice(i, i + 6));
        i += 5;
      } else {
        out.push("u");
        i += 1;
      }
      continue;
    }

    if (validEscapes.has(next)) {
      out.push("\\" + next);
      i += 1;
      continue;
    }

    out.push(next);
    i += 1;
  }

  return out.join("");
}

function extractJsonFromModelResponse(raw: string): string {
  let text = raw.trim();

  for (let guard = 0; guard < 3; guard += 1) {
    const before = text;
    text = text
      .replace(/^```[ \t]*[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "")
      .replace(/\r?\n?[ \t]*```[ \t]*$/, "")
      .trim();
    if (text === before) break;
  }

  text = text.replace(/^json\s*\r?\n/i, "").trim();

  const region = findFirstBalancedJson(text);
  if (!region) {
    throw new Error("NO_BALANCED_JSON_OBJECT");
  }

  return repairInvalidJsonEscapes(text.slice(region.start, region.end).trim());
}

async function runFullAnalysis(
  passage: {
    content: string;
    grade: number | null;
    school: { type: string } | null;
  },
  customPrompt?: string,
  generationPlan: QuestionGenerationPlan = "STANDARD",
) {
  const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
  const gradeLabel = passage.grade
    ? `${schoolType} ${passage.grade}학년`
    : schoolType;

  const teacherNote = customPrompt
    ? `\n\n## 선생님 지시사항 (최우선 반영)\n${customPrompt}`
    : "";

  const startTime = Date.now();
  console.log(`[ANALYSIS] Starting generateText (JSON mode) via ${generationPlan} plan...`);

  const analysisResult = await generateQuestionText({
    generationPlan,
    logPrefix: "ANALYSIS",
    maxTokens: 20000,
    temperature: 0.1,
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

  const { text: rawJson, finishReason, rawFinishReason, usage } = analysisResult;
  console.log("[ANALYSIS] generateText completed", {
    seconds: ((Date.now() - startTime) / 1000).toFixed(1),
    finishReason,
    rawFinishReason,
    usage,
    rawLength: rawJson.length,
  });

  // Parse JSON from response
  let parsed: unknown;
  try {
    const jsonStr = extractJsonFromModelResponse(rawJson);
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new AnalysisJsonParseError(error, rawJson, { finishReason, rawFinishReason });
  }

  // Validate with Zod — use safeParse so we can fallback to raw data on validation errors
  const validation = passageAnalysisSchema.safeParse(parsed);
  const analysisData = validation.success ? validation.data : parsed;

  console.log(
    "[ANALYSIS] Keys:",
    analysisData && typeof analysisData === "object" ? Object.keys(analysisData) : [],
  );
  return analysisData;
}
