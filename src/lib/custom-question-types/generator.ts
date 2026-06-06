import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel } from "@/lib/ai";
// ── 경계: 기본 문제 생성 엔진은 import 만(절대 수정 금지). customPrompt/typeSettings 인자를 그대로 활용. ──
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import {
  runQuestionGenerationWithEmptyRetry,
  type RunGenerationInput,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import type { PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";

import type { CompiledCustomType } from "./types";

export interface GenerateFromCustomTypeArgs {
  spec: CompiledCustomType;
  /** 동형을 입힐 새 지문. 무지문 유형이면 빈 문자열 가능. */
  passage: string;
  gradeInfo?: string;
}

export interface GenerateFromCustomTypeResult {
  /** saveGeneratedQuestionsForJob 가 기대하는 형태의 생성 문항. */
  question: Record<string, unknown>;
  subType: string;
  tier: CompiledCustomType["tier"];
  relaxedFallback: boolean;
  llmCalls: number;
  llmAttempts: number;
}

const GENERIC_TIMEOUT_MS = 120_000;
const GENERIC_MAX_TOKENS = 12_000;
const GENERIC_MAX_RETRIES = 2;

// ── 티어 ④ generic 출력 스키마 — 모든 leaf 에 .catch 폴백(범위 이탈해도 전체 파싱 실패 방지). ──
const genericQuestionSchema = z.object({
  direction: z.string().max(2000).catch("").default(""),
  passageOrStimulus: z.string().max(12000).catch("").default(""),
  options: z
    .array(
      z.object({
        label: z.string().max(40).catch("").default(""),
        text: z.string().max(4000).catch("").default(""),
      }),
    )
    .max(20)
    .catch([])
    .default([]),
  correctAnswer: z.string().max(4000).catch("").default(""),
  correctAnswers: z.array(z.string().max(40).catch("")).max(20).catch([]).default([]),
  explanation: z.string().max(4000).catch("").default(""),
  keyPoints: z.array(z.string().max(600).catch("")).max(12).catch([]).default([]),
  answerShape: z
    .enum(["MULTIPLE_CHOICE", "SHORT_ANSWER"])
    .catch("MULTIPLE_CHOICE")
    .default("MULTIPLE_CHOICE"),
});

type GenericQuestion = z.infer<typeof genericQuestionSchema>;

function assertGeneratable(spec: CompiledCustomType): void {
  if (spec.stimulusKind === "LISTENING" || spec.stimulusKind === "VISUAL") {
    throw new Error(
      "듣기·도표/그림 기반 유형은 텍스트로 동형 생성할 수 없어 생성하지 않습니다.",
    );
  }
}

// ─────────────────────────── 티어 ② 빌트인 오버라이드 ───────────────────────────
async function generateBuiltinOverride(
  args: GenerateFromCustomTypeArgs,
): Promise<GenerateFromCustomTypeResult> {
  const { spec, passage } = args;
  const subType = spec.nearestBuiltin;
  if (!subType) {
    // 안전망: 컴파일러가 BUILTIN_OVERRIDE 면 nearestBuiltin 이 있어야 함.
    throw new Error("빌트인 오버라이드 티어인데 nearestBuiltin 이 없습니다.");
  }

  const plan: PlanResult["plan"] = [
    {
      subType,
      count: 1,
      reason: "Isomorphic variant generated from a saved custom question type.",
      targetPoints: spec.targetPoints.slice(0, 12),
    },
  ];

  const result = await runQuestionGenerationWithEmptyRetry(
    {
      plan,
      schoolType: "고등학교",
      gradeInfo: args.gradeInfo ?? "",
      passageContent: passage,
      teacherIntentBlock: "",
      analysisContext: "",
      diffLabel: spec.difficulty,
      diffInstruction: DIFF_DESCRIPTION[spec.difficulty] ?? DIFF_DESCRIPTION.INTERMEDIATE,
      generationPlan: "STANDARD",
      typeSettings: (spec.typeSettings ?? undefined) as RunGenerationInput["typeSettings"],
      customPrompt: spec.prompt,
    },
    { logPrefix: "CUSTOM-TYPE-BUILTIN" },
  );

  const question = result.questions[0];
  if (!question) {
    throw new Error("커스텀 유형(빌트인 오버라이드) 생성에 실패했습니다(빈 결과).");
  }

  return {
    question,
    subType,
    tier: "BUILTIN_OVERRIDE",
    relaxedFallback: result.relaxedFallback,
    llmCalls: result.usageEvents.length,
    llmAttempts: result.attempts,
  };
}

// ─────────────────────────── 티어 ④ generic ───────────────────────────
function buildGenericPrompt(spec: CompiledCustomType, passage: string, gradeInfo: string): string {
  const passageBlock = spec.passageBased
    ? `## 새 지문 (이 지문으로 출제)\n${passage}`
    : `## 참고 지문 (이 유형은 읽기 지문이 필수가 아님 — 필요 없으면 활용하지 않아도 됨)\n${passage}`;

  const optionRule =
    spec.answerShape === "SHORT_ANSWER"
      ? "- options: 빈 배열(서술형/단답)."
      : spec.optionCount > 0
        ? `- options: {label,text} 배열을 정확히 ${spec.optionCount}개(라벨은 원본 형식 ①②③④⑤ 또는 1~5 등).`
        : "- options: 객관식이면 {label,text} 배열, 아니면 빈 배열.";

  return [
    `당신은 한국 고등학교 ${gradeInfo} 영어 시험 출제 전문가입니다.`,
    "아래 [유형 정의]에 **충실히 따라** 동형(同形) 문항 1개를 만드세요. 이 유형은 표준 유형 풀에 없는 특수/변형 유형입니다.",
    "",
    spec.prompt,
    "",
    passageBlock,
    "",
    "## 출력 규칙",
    "- direction: 새 문항의 한국어 발문.",
    "- passageOrStimulus: 학생에게 보일 본문/자료. 지문기반이면 위 새 지문 또는 그 변형, 무지문이면 유형에 맞는 자료. 객관식 보기는 여기 말고 options 에.",
    optionRule,
    `- correctAnswer: 객관식이면 정답 label(복수정답이면 comma+space 연결). 서술형이면 정답 텍스트. 정답 정확히 ${spec.correctAnswerCount}개.`,
    "- correctAnswers: 복수정답이면 모든 정답 label 배열. 단일이면 비워도 됨.",
    "- explanation: 정답 근거를 한국어로 명확히, 1200자 이내.",
    "- keyPoints: 학습 포인트 3개 이내.",
    "- 원본 지문/문장을 그대로 베끼지 말고 새 소재로 동형 재현. Markdown code fence·raw JSON·self-check·정답표 누출을 학생용 본문에 넣지 말 것.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function validateGeneric(spec: CompiledCustomType, obj: GenericQuestion): string[] {
  const errors: string[] = [];
  const expectsOptions = spec.answerShape !== "SHORT_ANSWER" && spec.optionCount > 0;

  if (expectsOptions) {
    if (obj.options.length === 0) {
      errors.push("객관식 원본 형식인데 options 가 비어 있습니다.");
    } else if (obj.options.length !== spec.optionCount) {
      errors.push(`options 개수 ${obj.options.length}개가 원본 ${spec.optionCount}개와 다릅니다.`);
    }
  }

  const visibleText = [obj.direction, obj.passageOrStimulus, obj.explanation].join("\n");
  if (/```|End of Response|Valid, parsable|^\s*\{[\s\S]*"questions"/m.test(visibleText)) {
    errors.push("모델 응답 래퍼/JSON/코드펜스가 학생용 본문에 섞였습니다.");
  }

  if (!obj.direction.trim() && !obj.passageOrStimulus.trim()) {
    errors.push("학생에게 보일 발문/자료가 비어 있습니다.");
  }

  return errors;
}

async function generateGeneric(
  args: GenerateFromCustomTypeArgs,
): Promise<GenerateFromCustomTypeResult> {
  const { spec, passage } = args;
  const prompt = buildGenericPrompt(spec, passage, args.gradeInfo ?? "");

  let lastError: unknown;
  for (let attempt = 0; attempt < GENERIC_MAX_RETRIES; attempt += 1) {
    try {
      const result = await generateObject({
        model: geminiModel,
        schema: genericQuestionSchema,
        maxOutputTokens: GENERIC_MAX_TOKENS,
        abortSignal: AbortSignal.timeout(GENERIC_TIMEOUT_MS),
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      });
      const obj = result.object;

      const validationErrors = validateGeneric(spec, obj);
      if (validationErrors.length > 0) {
        throw new Error(`generic 생성 형식 오류: ${validationErrors.join(" / ")}`);
      }

      const questionText = [obj.direction, obj.passageOrStimulus]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .join("\n\n");
      if (!questionText.trim()) throw new Error("generic 생성 결과가 비어 있습니다.");

      const correctAnswers = obj.correctAnswers.map((v) => v.trim()).filter(Boolean);
      const correctAnswer = obj.correctAnswer.trim() || correctAnswers.join(", ");

      // _typeId 는 일부러 비워 둠 → 문제 관리 카드가 평문(questionText+options)으로 폴백 렌더.
      const question: Record<string, unknown> = {
        subType: "CUSTOM",
        questionText,
        correctAnswer,
        explanation: obj.explanation,
        keyPoints: obj.keyPoints,
        difficulty: spec.difficulty,
        _genericCustom: true,
      };
      if (correctAnswers.length > 0) question.correctAnswers = correctAnswers;
      const shouldAttachOptions =
        obj.options.length > 0 &&
        obj.answerShape !== "SHORT_ANSWER" &&
        spec.answerShape !== "SHORT_ANSWER";
      if (shouldAttachOptions) question.options = obj.options;

      return {
        question,
        subType: "CUSTOM",
        tier: "GENERIC",
        relaxedFallback: false,
        llmCalls: 1,
        llmAttempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      let detail = error instanceof Error ? error.message : String(error);
      if (NoObjectGeneratedError.isInstance(error)) {
        const rawHead = (error.text ?? "").slice(0, 600);
        const causeMsg =
          error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
        detail = `${error.message} | finishReason=${error.finishReason ?? "?"} | cause=${causeMsg} | rawHead=${rawHead}`;
      }
      console.warn(`[CUSTOM-TYPE-GENERIC] attempt ${attempt} failed: ${detail}`);
    }
  }
  throw lastError;
}

/** 저장된 커스텀 유형 정의 + 새 지문 → 동형 문항 1개 생성(티어별 분기). */
export async function generateFromCustomType(
  args: GenerateFromCustomTypeArgs,
): Promise<GenerateFromCustomTypeResult> {
  assertGeneratable(args.spec);
  if (args.spec.tier === "BUILTIN_OVERRIDE") {
    return generateBuiltinOverride(args);
  }
  return generateGeneric(args);
}
