import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel, GEMINI_MODEL_ID } from "@/lib/ai";
import { recordAiCost } from "@/lib/platform-api-costs";
// ── 경계: 기본 문제 생성 엔진은 import 만(절대 수정 금지). customPrompt/typeSettings 인자를 그대로 활용. ──
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import {
  runQuestionGenerationWithEmptyRetry,
  type RunGenerationInput,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import type { PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";

import { generateStructuredFromSpec } from "./generator-structured";
import type { CompiledCustomType } from "./types";

export interface GenerateFromCustomTypeArgs {
  spec: CompiledCustomType;
  /** 동형을 입힐 새 지문. 무지문 유형이면 빈 문자열 가능. */
  passage: string;
  gradeInfo?: string;
  /** 원가 기록 귀속용 학원 ID(라우트 세션/잡에서 전달). */
  academyId?: string | null;
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
// thinking 토큰이 maxOutputTokens 를 공유하므로 본문 잘림 방지로 상향(thinking budget 은 별도 한정).
const GENERIC_MAX_TOKENS = 24_000;
const GENERIC_MAX_RETRIES = 3;

// 보기 작성 전 자기점검 계획(in-call). optionCount개의 서로 다른 변별 축을 먼저 선언하게 해
// distinctness 를 의식시키는 nudge. distinctness 자체는 강제 게이트가 아니고(범용성), fitsContext 수만 구조검증.
const planItemSchema = z.object({
  label: z.string().max(40).catch("").default(""),
  discriminator: z.string().max(400).catch("").default(""), // 이 보기의 변별 특징(다의어=의미, 어법=규칙 등) — 서로 달라야
  fitsContext: z.boolean().catch(false).default(false), // 정답 후보 여부
});

// 라벨별 구조 해설 — 실제 emit 한 보기에 1:1 로 묶어 해설 드리프트/복수정답을 구조적으로 차단.
const verdictItemSchema = z.object({
  label: z.string().max(40).catch("").default(""),
  isCorrect: z.boolean().catch(false).default(false),
  why: z.string().max(2000).catch("").default(""),
});

// ── 티어 ④ generic 출력 스키마 — 모든 leaf 에 .catch 폴백(범위 이탈해도 전체 파싱 실패 방지). ──
// 필드 순서 = 생성 순서: optionPlan(보기 전) → options → correctAnswer → optionVerdicts(보기 후).
const genericQuestionSchema = z.object({
  direction: z.string().max(2000).catch("").default(""),
  passageOrStimulus: z.string().max(12000).catch("").default(""),
  optionPlan: z.array(planItemSchema).max(20).catch([]).default([]),
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
  optionVerdicts: z.array(verdictItemSchema).max(20).catch([]).default([]),
  explanation: z.string().max(4000).catch("").default(""),
  keyPoints: z.array(z.string().max(600).catch("")).max(12).catch([]).default([]),
  answerShape: z
    .enum(["MULTIPLE_CHOICE", "SHORT_ANSWER"])
    .catch("MULTIPLE_CHOICE")
    .default("MULTIPLE_CHOICE"),
});

type GenericQuestion = z.infer<typeof genericQuestionSchema>;
type VisibleLanguage = "ko" | "en";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readLanguageValue(value: unknown): VisibleLanguage | null {
  return value === "ko" || value === "en" ? value : null;
}

function languageName(value: VisibleLanguage): string {
  return value === "en" ? "English" : "Korean";
}

function readGenericLanguageSettings(spec: CompiledCustomType): {
  stemLanguage: VisibleLanguage | null;
  optionLanguage: VisibleLanguage | null;
} {
  const direct: Record<string, unknown> | null = isRecord(spec.typeSettings)
    ? spec.typeSettings
    : null;
  const nested: Record<string, unknown> | null =
    spec.nearestBuiltin && direct && isRecord(direct[spec.nearestBuiltin])
      ? (direct[spec.nearestBuiltin] as Record<string, unknown>)
      : null;
  const source: Record<string, unknown> | null = nested ?? direct;
  return {
    stemLanguage: readLanguageValue(source?.["stemLanguage"]),
    optionLanguage: readLanguageValue(source?.["optionLanguage"]),
  };
}

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

  for (const event of result.usageEvents) {
    await recordAiCost({
      sourceType: "CUSTOM_QTYPE_AI",
      sourceDetail: "builtin-generation",
      academyId: args.academyId,
      model: event.modelId || GEMINI_MODEL_ID,
      operationType: "CUSTOM_QTYPE_GEN",
      usage: event.usage,
    });
  }

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

  // MC(MULTIPLE_CHOICE) 한정 지시 — OTHER/SHORT_ANSWER 엔 라벨-픽 게이트를 강요하지 않음.
  // 정답 수는 항상 correctAnswerCount 로 정확히 강제(강사가 명시 지정). 복수정답은 발문 표현(모두 고르기)만 담당.
  const isMc = spec.answerShape === "MULTIPLE_CHOICE" && spec.optionCount > 0;
  const isMultiAnswer = spec.correctAnswerCount >= 2;
  const countPhrase = isMultiAnswer
    ? `정답 정확히 ${spec.correctAnswerCount}개(복수 정답 — 발문은 '모두 고르시오'로 안내하되 정답 개수는 밝히지 말 것)`
    : `정답 정확히 ${spec.correctAnswerCount}개`;

  const invariantBlock = spec.invariants.length
    ? `## 반드시 보존 (이 유형의 본질 — 모든 문항에서 유지)\n${spec.invariants.map((i) => `- ${i}`).join("\n")}`
    : "";
  const variableBlock =
    "## 매번 새로 (가변) — 원본 예시의 특정 단어/문장/소재를 그대로 쓰지 말고 매번 다른 소재로" +
    (spec.variableAxes.length ? `\n${spec.variableAxes.map((v) => `- ${v}`).join("\n")}` : "");
  // 유형 고유 수치 파라미터(요약문 빈칸 수 등) — 정의/override 값을 정확히 지키도록 지시.
  // 조절 불가(min===max=0 등 무의미)한 항목은 프롬프트에서 제외(구버전 유형의 잘못 추출분 방어).
  const usableTunable = spec.tunableParams.filter((p) => p.max > p.min);
  const tunableBlock = usableTunable.length
    ? `## 이 유형의 수치 규칙 (아래 개수를 정확히 지킬 것)\n${usableTunable
        .map((p) => `- ${p.label}: 정확히 ${p.value}개`)
        .join("\n")}`
    : "";

  const languageSettings = readGenericLanguageSettings(spec);
  const languageLines: string[] = [];
  if (languageSettings.stemLanguage) {
    languageLines.push(
      `- Write the visible direction/stem in ${languageName(languageSettings.stemLanguage)}.`,
    );
  }
  if (isMc && languageSettings.optionLanguage) {
    languageLines.push(
      `- Write every visible options[].text value in ${languageName(languageSettings.optionLanguage)}.`,
    );
    if (languageSettings.optionLanguage === "en") {
      languageLines.push(
        "- options[].text must be English-only. Do not include Korean translations or Korean explanatory wording inside option text.",
      );
    }
  }
  const languageBlock = languageLines.length
    ? ["## Visible language settings", ...languageLines].join("\n")
    : "";

  return [
    `당신은 한국 고등학교 ${gradeInfo} 영어 시험 출제 전문가입니다.`,
    "아래 [유형 정의]에 **충실히 따라** 동형(同形) 문항 1개를 만드세요. 이 유형은 표준 유형 풀에 없는 특수/변형 유형입니다.",
    "",
    spec.prompt,
    "",
    invariantBlock,
    variableBlock,
    tunableBlock,
    languageBlock,
    "",
    passageBlock,
    "",
    "## 출력 규칙 (순서대로 작성)",
    "- direction: 새 문항의 한국어 발문.",
    "- passageOrStimulus: 학생에게 보일 본문/자료. 지문기반이면 위 새 지문 또는 그 변형, 무지문이면 유형에 맞는 자료. 객관식 보기는 여기 말고 options 에.",
    isMc && spec.optionCount > 1
      ? `- optionPlan: **보기를 쓰기 전에 먼저** ${spec.optionCount}개 항목을 계획하라. 각 항목 discriminator = 그 보기의 변별 특징(위 '반드시 보존'의 보기 구별 규칙)이며 **항목끼리 명확히 달라야** 한다. fitsContext = 정답 후보 여부(${countPhrase}). 타겟/소재는 이 변별 축을 ${spec.optionCount}개 채울 만큼 충분히 구별되는 것으로 고르고, 부족하면 다른 타겟/소재로 바꿔라.`
      : "- optionPlan: (객관식 아니면 빈 배열)",
    optionRule,
    `- correctAnswer: 객관식이면 정답 label(복수면 comma+space 연결). 서술형이면 정답 텍스트. ${countPhrase}.`,
    "- correctAnswers: 복수정답이면 모든 정답 label 배열. 단일이면 비워도 됨.",
    isMc
      ? `- optionVerdicts: **emit 한 각 보기 label마다 정확히 1개** {label, isCorrect, why}. why 는 그 보기의 **실제 text 를 근거로** 작성(존재하지 않는 보기/문장 지어내지 말 것). isCorrect=true 인 것은 correctAnswer 와 정확히 일치(${countPhrase}).`
      : "- optionVerdicts: (객관식 아니면 빈 배열)",
    "- explanation: 전체 총평을 짧게(보기별 상세 근거는 optionVerdicts 에).",
    "- keyPoints: 학습 포인트 3개 이내.",
    "- 원본 지문/문장을 그대로 베끼지 말고 새 소재로 동형 재현. Markdown code fence·raw JSON·self-check·정답표 누출을 학생용 본문에 넣지 말 것.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

const CIRCLED_LABELS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
/** 라벨 정규화 — ①↔1, (A)↔a, "(C)." 등 장식/구두점 드리프트를 흡수해 비교 오탐 방지. */
function normLabel(value: string): string {
  const t = (value ?? "").trim();
  const ci = CIRCLED_LABELS.indexOf(t);
  if (ci >= 0) return String(ci + 1);
  // NFKC(전각·괄호숫자 등) → 소문자 → 앞뒤 비영숫자 전부 제거 → "(C)."·"c."·"C" 모두 "c".
  return t
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");
}
/** correctAnswer(+correctAnswers)에서 정답 라벨 집합을 정규화해 수집(MC 전용). 붙은 동그라미(①②)는 글자별로 분리. */
function collectCorrectLabels(obj: GenericQuestion): string[] {
  const set = new Set<string>();
  const addToken = (raw: string) => {
    const circled = [...raw].filter((ch) => CIRCLED_LABELS.includes(ch));
    if (circled.length > 1) {
      for (const ch of circled) {
        const n = normLabel(ch);
        if (n) set.add(n);
      }
      return;
    }
    const n = normLabel(raw);
    if (n) set.add(n);
  };
  for (const v of obj.correctAnswers) addToken(v);
  for (const part of obj.correctAnswer.split(/[,、\s]+/)) addToken(part);
  return [...set];
}

function validateGeneric(spec: CompiledCustomType, obj: GenericQuestion): string[] {
  const errors: string[] = [];
  // MC 라벨-픽 게이트는 MULTIPLE_CHOICE 한정. OTHER(배열/매칭 등)·SHORT_ANSWER 는 제외.
  const isMc = spec.answerShape === "MULTIPLE_CHOICE" && spec.optionCount > 0;

  if (isMc) {
    if (obj.options.length === 0) {
      errors.push("객관식 원본 형식인데 options 가 비어 있습니다.");
    } else if (obj.options.length !== spec.optionCount) {
      errors.push(`options 개수 ${obj.options.length}개가 원본 ${spec.optionCount}개와 다릅니다.`);
    }
  }

  // ── 구조 검증(MC): 정답 수·라벨 정합 + 라벨별 해설 1:1 → 해설 드리프트/복수정답 차단 ──
  if (isMc && obj.options.length > 0) {
    const optionLabels = new Set(obj.options.map((o) => normLabel(o.label)));
    // 라벨 중복/빈 라벨(학생에게 모호) 차단 — Set 비교만으론 중복이 묻힌다.
    if (optionLabels.size !== obj.options.length) {
      errors.push("보기 라벨이 중복되거나 비어 있습니다.");
    }
    const correctLabels = collectCorrectLabels(obj);

    // 정답 수는 강사가 지정한 correctAnswerCount 로 정확히 강제(복수정답 여부와 무관).
    if (correctLabels.length !== spec.correctAnswerCount) {
      errors.push(`정답 라벨 ${correctLabels.length}개가 지정 ${spec.correctAnswerCount}개와 다릅니다.`);
    }
    const missing = correctLabels.filter((l) => !optionLabels.has(l));
    if (missing.length) errors.push(`정답 라벨이 보기에 없습니다: ${missing.join(", ")}`);

    if (obj.optionVerdicts.length === 0) {
      errors.push("라벨별 해설(optionVerdicts)이 비어 있습니다.");
    } else {
      const verdictSet = new Set(obj.optionVerdicts.map((v) => normLabel(v.label)));
      if (verdictSet.size !== obj.optionVerdicts.length) {
        errors.push("라벨별 해설 라벨이 중복되거나 비어 있습니다.");
      }
      const covers =
        verdictSet.size === optionLabels.size && [...optionLabels].every((l) => verdictSet.has(l));
      if (!covers) errors.push("라벨별 해설이 실제 보기와 1:1로 대응하지 않습니다.");

      const verdictCorrect = obj.optionVerdicts
        .filter((v) => v.isCorrect)
        .map((v) => normLabel(v.label))
        .filter(Boolean);
      const expectedCorrect = spec.correctAnswerCount;
      if (verdictCorrect.length !== expectedCorrect) {
        errors.push(`해설이 정답으로 표시한 ${verdictCorrect.length}개가 ${expectedCorrect}개와 다릅니다.`);
      }
      const correctSet = new Set(correctLabels);
      const vcSet = new Set(verdictCorrect);
      const consistent =
        verdictCorrect.every((l) => correctSet.has(l)) && correctLabels.every((l) => vcSet.has(l));
      if (!consistent) errors.push("해설의 정답 표시와 correctAnswer 가 불일치합니다.");
    }

    // optionPlan 의 정답 후보 수만 구조검증. distinctness 는 강제 안 함(범용성 — best-answer/choose-all 유형 오탐 방지).
    if (obj.optionPlan.length > 0) {
      const planFits = obj.optionPlan.filter((p) => p.fitsContext).length;
      const expectedFits = spec.correctAnswerCount;
      if (planFits !== expectedFits) {
        errors.push(`계획(optionPlan) 정답 후보 ${planFits}개가 ${expectedFits}개와 다릅니다.`);
      }
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
        // thinking 켜되 budget 을 한정(이전엔 0=꺼짐). thinking 토큰은 maxOutputTokens 를 공유하므로 상한을 둬
        // 본문이 잘려 NoObjectGenerated/검증실패로 3회 모두 터지는 것을 막는다. 추론은 보기 distinctness·정답 유일성용.
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      });
      await recordAiCost({
        sourceType: "CUSTOM_QTYPE_AI",
        sourceDetail: "generic-generation",
        academyId: args.academyId,
        model: GEMINI_MODEL_ID,
        operationType: "CUSTOM_QTYPE_GEN",
        usage: result.usage,
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

      // 해설 = 전체 총평 + 라벨별 판정(optionVerdicts) 합본(저장 계약은 문자열 1개). 라벨에 묶여 드리프트 차단.
      const verdictLines = obj.optionVerdicts
        .map((v) => `${v.label.trim()}. ${v.isCorrect ? "(정답) " : ""}${v.why.trim()}`.trim())
        .filter((l) => l && l !== ".")
        .join("\n");
      const explanation = [obj.explanation.trim(), verdictLines].filter(Boolean).join("\n\n");

      // _typeId 는 일부러 비워 둠 → 문제 관리 카드가 평문(questionText+options)으로 폴백 렌더.
      const question: Record<string, unknown> = {
        subType: "CUSTOM",
        questionText,
        correctAnswer,
        explanation,
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
  // 레거시 호환: 컴파일러는 더 이상 BUILTIN_OVERRIDE 를 생성하지 않지만(무조건 GENERIC,
  // 2026-06-08 결정), DB 에 초기 저장된 구버전 spec(tier=BUILTIN_OVERRIDE)이 남아 있어
  // 이 분기를 유지한다. 해당 spec 이 모두 소거되면 generateBuiltinOverride 와 함께 삭제.
  if (args.spec.tier === "BUILTIN_OVERRIDE") {
    return generateBuiltinOverride(args);
  }
  // v2: FormatSpec 이 있으면 구조화 생성(형식 계약 + LayoutDoc + 검증 게이트).
  // 실패 시 v1 평문 생성으로 폴백해 "아예 0문항"이 되는 사고를 막는다.
  if (args.spec.format) {
    try {
      const structured = await generateStructuredFromSpec({
        spec: args.spec,
        format: args.spec.format,
        passage: args.passage,
        gradeInfo: args.gradeInfo,
        academyId: args.academyId,
      });
      return {
        question: structured.question,
        subType: "CUSTOM_LAYOUT",
        tier: "GENERIC",
        relaxedFallback: false,
        llmCalls: structured.llmAttempts,
        llmAttempts: structured.llmAttempts,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `[CUSTOM-TYPE-GENERATOR] structured(v2) failed → generic(v1) fallback: ${detail}`,
      );
    }
  }
  return generateGeneric(args);
}
