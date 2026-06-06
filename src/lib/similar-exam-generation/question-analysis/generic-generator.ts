import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel } from "@/lib/ai";

import type { QuestionAnalysis } from "./schema";

// 범용(빌트인 미매칭) 동형 생성기.
// 빌트인 22유형에 안 맞는 "신규/특수 유형"도 동형 생성은 되도록 — 분석(QuestionAnalysis)을
// 직조한 프롬프트로 직접 생성한다. 공유 엔진(유형별 스키마/후처리/품질)을 쓰지 않으므로
// 품질 보장은 best-effort(커스텀 유형 등록/관리·전용 검증은 별도 보류 기능).

const GENERIC_TIMEOUT_MS = 120_000;
const GENERIC_MAX_TOKENS = 12_000;
const GENERIC_MAX_RETRIES = 1;

// 동형 생성기와 동일한 결과 형태(generator.ts 의 GenerateSimilarQuestionResult).
export interface GenericGenerateResult {
  question: Record<string, unknown>;
  subType: string;
  relaxedFallback: boolean;
  llmCalls: number;
  llmAttempts: number;
}

// 견고화: 모든 제약 leaf 에 .catch(fallback) — LLM 이 범위/형식을 벗어나도 전체 파싱이
// 실패(=쌍 skip)하지 않고 안전 폴백. (analysis/schema.ts 와 동일 의도)
const genericQuestionSchema = z.object({
  direction: z.string().max(2000).catch("").default(""), // 발문
  // 학생에게 보일 본문/자료. 지문기반이면 (새) 지문 본문 또는 그 변형, 무지문이면
  // 단어쌍·보기 자료 등. 객관식 보기는 여기 말고 options 에.
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
  correctAnswer: z.string().max(4000).catch("").default(""), // 객관식=정답 label, 서술형=정답 텍스트
  correctAnswers: z.array(z.string().max(40).catch("")).max(20).catch([]).default([]),
  explanation: z.string().max(4000).catch("").default(""),
  keyPoints: z.array(z.string().max(600).catch("")).max(12).catch([]).default([]),
  answerShape: z
    .enum(["MULTIPLE_CHOICE", "SHORT_ANSWER"])
    .catch("MULTIPLE_CHOICE")
    .default("MULTIPLE_CHOICE"),
});

function getSourceOptionCount(analysis: QuestionAnalysis): number {
  return analysis.source.optionCount ?? analysis.source.options.length;
}

function isShortAnswerSummaryCompletion(analysis: QuestionAnalysis): boolean {
  return (
    analysis.classification.matchedType === "SUMMARY_COMPLETE_MC" &&
    analysis.classification.answerShape === "SHORT_ANSWER" &&
    getSourceOptionCount(analysis) === 0
  );
}

function isShortAnswerContentMatch(analysis: QuestionAnalysis): boolean {
  return (
    analysis.classification.matchedType === "CONTENT_MATCH" &&
    analysis.classification.answerShape === "SHORT_ANSWER" &&
    (getSourceOptionCount(analysis) >= 6 ||
      analysis.source.correctAnswerLabels.length >= 2 ||
      analysis.source.multipleAnswers)
  );
}

function isMultipleChoiceContentMatchWithNonStandardForm(analysis: QuestionAnalysis): boolean {
  return (
    analysis.classification.matchedType === "CONTENT_MATCH" &&
    analysis.classification.answerShape === "MULTIPLE_CHOICE" &&
    (getSourceOptionCount(analysis) !== 5 ||
      analysis.source.correctAnswerLabels.length >= 2 ||
      analysis.source.multipleAnswers)
  );
}

function isSectionMarkerGrammarCombination(analysis: QuestionAnalysis): boolean {
  const text = [
    analysis.source.direction,
    analysis.reproductionSpec.stemFormat,
    analysis.reproductionSpec.optionFormat,
    analysis.reproductionSpec.structureNotes,
    analysis.classification.noveltyNote,
  ]
    .join("\n")
    .toLowerCase();
  return (
    /\[i\].*\[v\]|\[i\]~\[v\]/i.test(text) &&
    /\(a\).*\(c\)|\(a\)~\(c\)/i.test(text) &&
    (text.includes("짝") || text.includes("row") || text.includes("combination"))
  );
}

function buildFormPreservationRules(analysis: QuestionAnalysis): string[] {
  const rules = [
    "- Preserve the source answer shape over the matched engine label.",
    "- If the source is SHORT_ANSWER, return options: [] and answerShape: SHORT_ANSWER.",
    "- Put all student-visible material needed to solve the question in direction or passageOrStimulus.",
  ];

  if (isShortAnswerSummaryCompletion(analysis)) {
    rules.push(
      "SOURCE FORM: short-answer summary completion, not multiple choice.",
      "Generate a Korean direction that asks students to complete a one-sentence summary.",
      "Use exactly the same blank count and labels as the source when known, such as (a), (b), (c).",
      "Do not create answer choices. Return options: [].",
      "passageOrStimulus must contain the complete summary sentence with the blank labels.",
      "correctAnswer must list every blank answer, for example: (a) facts / (b) uncertainty / (c) revision.",
      "The blank answers should be key words from the supplied passage or valid morphological variants when the source allows it.",
    );
  }

  if (isShortAnswerContentMatch(analysis)) {
    rules.push(
      "SOURCE FORM: short-answer content-match with many numbered statements.",
      "Generate a Korean direction asking students to write all statement numbers that match the passage.",
      "Do not create multiple-choice combinations such as ㄱ, ㄴ or option bundles. Return options: [].",
      "passageOrStimulus must include a visible numbered statement list under <보기>, using 1., 2., 3. labels.",
      "Use a similar number of statements to the source when possible.",
      "correctAnswer must be comma-separated statement numbers only, for example: 1, 5, 6, 8.",
      "Each listed statement must be independently checkable from the supplied passage.",
    );
  }

  if (isMultipleChoiceContentMatchWithNonStandardForm(analysis)) {
    const optionCount = Math.max(1, getSourceOptionCount(analysis));
    const answerCount = Math.max(
      analysis.source.multipleAnswers ? 2 : 1,
      analysis.source.correctAnswerLabels.length || 1,
    );
    rules.push(
      "SOURCE FORM: multiple-choice content-match with a non-standard form.",
      `Generate exactly ${optionCount} options, matching the source option count.`,
      `Generate exactly ${answerCount} correct option label(s), matching the source answer count.`,
      "correctAnswers must contain every correct option label.",
      "correctAnswer must contain the same labels joined by comma + space, for example: ①, ⑤.",
      "If the source asks for incorrect statements, keep that polarity: the correct labels must point to statements that do NOT match the passage.",
      "Do not collapse this into a standard single-answer CONTENT_MATCH item.",
    );
  }

  if (isSectionMarkerGrammarCombination(analysis)) {
    const optionCount = Math.max(1, getSourceOptionCount(analysis) || 5);
    rules.push(
      "SOURCE FORM: section-marker grammar combination.",
      "Build a marked passage divided into exactly five sections labeled [I], [II], [III], [IV], [V].",
      "Each section must contain exactly three grammar judgment markers: (a), (b), (c).",
      "Return the marked passage only in passageOrStimulus. Do not put the answer table, 보기 table, explanation, JSON, or code fences in passageOrStimulus.",
      `Return exactly ${optionCount} options. Each option text must contain exactly five section-marker pairs, one for every [I]~[V], in order.`,
      "Good option text example: [I](b) / [II](c) / [III](c) / [IV](a) / [V](c).",
      "Every option row must have the same shape. No option may omit a section.",
      "correctAnswer must be the single row label whose five marker pairs are all grammatically wrong.",
      "Do not use Markdown tables. Use the options array only.",
    );
  }

  if (analysis.classification.matchedType === "WORD_ORDER") {
    rules.push(
      "For WORD_ORDER, use numeric chunk labels only and make correctAnswer the full numeric order.",
      "Do not ask for only selected positions and do not use letters, Korean consonants, or circled numerals.",
    );
  }

  return rules;
}

function getGenericSubType(analysis: QuestionAnalysis): string {
  if (isShortAnswerSummaryCompletion(analysis)) return "CUSTOM";
  return analysis.classification.matchedType ?? "CUSTOM";
}

const CIRCLED_NUMBER_LABELS = [
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "⑥",
  "⑦",
  "⑧",
  "⑨",
  "⑩",
  "⑪",
  "⑫",
  "⑬",
  "⑭",
  "⑮",
  "⑯",
  "⑰",
  "⑱",
  "⑲",
  "⑳",
];

function normalizeLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!text) return "";
  const circledIndex = CIRCLED_NUMBER_LABELS.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text
    .replace(/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/, "$1")
    .toLowerCase();
}

function collectAnswerLabels(correctAnswer: unknown, correctAnswers: unknown): string[] {
  const labels: string[] = [];
  const push = (value: unknown) => {
    const label = normalizeLabel(value);
    if (label && !labels.includes(label)) labels.push(label);
  };

  if (Array.isArray(correctAnswers)) {
    for (const value of correctAnswers) push(value);
  }

  const answerText = typeof correctAnswer === "string" ? correctAnswer : "";
  const matches = answerText.match(
    /[\u2460-\u2473]|\(?\s*(?:[A-Ja-j]|\d{1,3})\s*[\)\].:]?/g,
  );
  if (matches?.length) {
    for (const match of matches) push(match);
  } else if (answerText.trim()) {
    push(answerText);
  }

  return labels;
}

function countSectionRefs(text: unknown): number {
  return (typeof text === "string" ? text.match(/\[(?:I|II|III|IV|V)\]/g) : null)?.length ?? 0;
}

function validateGenericObject(
  analysis: QuestionAnalysis,
  obj: z.infer<typeof genericQuestionSchema>,
): string[] {
  const errors: string[] = [];
  const expectedOptionCount = getSourceOptionCount(analysis);
  const expectsOptions =
    analysis.classification.answerShape !== "SHORT_ANSWER" && expectedOptionCount > 0;

  if (expectsOptions) {
    if (obj.options.length === 0) {
      errors.push("객관식 원본 형식인데 options가 비어 있습니다.");
    } else if (obj.options.length !== expectedOptionCount) {
      errors.push(`options 개수 ${obj.options.length}개가 원본 ${expectedOptionCount}개와 다릅니다.`);
    }
  }

  const visibleText = [obj.direction, obj.passageOrStimulus, obj.explanation].join("\n");
  if (/```|End of Response|All conditions satisfied|Valid, parsable|^\s*\{[\s\S]*"questions"/m.test(visibleText)) {
    errors.push("모델 응답 래퍼/JSON/코드펜스가 학생용 문항 본문에 섞였습니다.");
  }

  if (isMultipleChoiceContentMatchWithNonStandardForm(analysis)) {
    const expectedAnswerCount = Math.max(
      analysis.source.multipleAnswers ? 2 : 1,
      analysis.source.correctAnswerLabels.length || 1,
    );
    const optionLabels = new Set(obj.options.map((option) => normalizeLabel(option.label)));
    const answerLabels = collectAnswerLabels(obj.correctAnswer, obj.correctAnswers);
    if (answerLabels.length !== expectedAnswerCount) {
      errors.push(
        `정답 라벨 ${answerLabels.length}개가 원본 정답 수 ${expectedAnswerCount}개와 다릅니다.`,
      );
    }
    const missing = answerLabels.filter((label) => !optionLabels.has(label));
    if (missing.length) {
      errors.push(`정답 라벨이 options에 없습니다: ${missing.join(", ")}`);
    }
  }

  if (isSectionMarkerGrammarCombination(analysis)) {
    for (const option of obj.options) {
      const sectionCount = countSectionRefs(option.text);
      if (sectionCount !== 5) {
        errors.push(
          `조합형 어법 선지 ${option.label || "(라벨 없음)"}의 구역 참조가 ${sectionCount}개입니다.`,
        );
      }
    }
    if (/\[보기\]|\|\s*①\s*\||\|\s*1\s*\|/.test(obj.passageOrStimulus)) {
      errors.push("조합형 어법의 보기 표가 passageOrStimulus에 들어갔습니다.");
    }
  }

  if (!obj.direction.trim() && !obj.passageOrStimulus.trim()) {
    errors.push("학생에게 보일 발문/자료가 비어 있습니다.");
  }

  return errors;
}

function buildGenericPrompt(analysis: QuestionAnalysis, passage: string, gradeInfo: string): string {
  const src = analysis.source;
  const cls = analysis.classification;
  const tp = analysis.testingPoint;
  const tr = analysis.transformation;
  const rep = analysis.reproductionSpec;
  const passageBased = src.passageBased !== false;
  const formRules = buildFormPreservationRules(analysis);

  const optionLines = (src.options ?? [])
    .map((o) => `${o.label}. ${o.text}${o.isCorrect ? "  (정답)" : ""}`)
    .join("\n");

  const lines: string[] = [
    `당신은 한국 고등학교 ${gradeInfo} 영어 시험 출제 전문가입니다.`,
    `아래 [원본 문항 분석]과 **동일한 유형·출제 의도**의 새 문항 1개를 만드세요. 이 유형은 표준 유형 풀에 없는 특수/변형 유형이므로, 분석을 충실히 따라 동형(同形)으로 재현하세요.`,
    "",
    "## 이 유형 설명",
    cls.noveltyNote || tp.summary || "원본과 같은 형식·논리의 문항",
    "",
    "## 원본 발문",
    src.direction || "(분석에 발문 없음)",
    optionLines ? `\n## 원본 보기 구조\n${optionLines}` : "",
    "",
    "## 출제 포인트(반드시 동일 유지)",
    tp.summary || "",
    tp.skills.length ? `평가 스킬: ${tp.skills.join(", ")}` : "",
    tr.applied
      ? `\n## 변형 방식(동일 적용)\n${tr.description || ""}${tr.rules.length ? `\n규칙: ${tr.rules.join(" / ")}` : ""}`
      : "",
    "",
    "## 재현 형식",
    rep.stemFormat ? `발문 형식: ${rep.stemFormat}` : "",
    rep.optionFormat ? `보기 형식: ${rep.optionFormat}` : "",
    rep.answerFormat ? `정답 형식: ${rep.answerFormat}` : "",
    rep.structureNotes ? `구조: ${rep.structureNotes}` : "",
    analysis.variationAxes.length ? `바꿔야 할 축(원본 복제 금지): ${analysis.variationAxes.join(" / ")}` : "",
    "",
    "## Hard form preservation rules",
    ...formRules,
    "",
    passageBased
      ? `## 새 지문 (이 지문으로 출제)\n${passage}`
      : `## 참고 지문 (이 유형은 읽기 지문이 필수가 아닙니다)\n분석의 유형 설명·재현 형식을 그대로 따라 자료/발문/정답을 구성하세요. 형식은 어휘 관계, 자유 작문(쌩 영작), 어법 변형, 어휘 등 **분석이 가리키는 무엇이든** 됩니다(단어 쌍에 한정하지 말 것). 적절하면 아래 지문의 어휘·소재를 활용하되, 필요 없으면 활용하지 않아도 됩니다.\n${passage}`,
    "",
    "## 출력 규칙",
    "- direction: 새 문항의 한국어 발문.",
    "- passageOrStimulus: 학생에게 보일 본문/자료. 지문기반이면 위 새 지문 또는 그 변형, 무지문이면 분석이 가리키는 형식의 자료(예: 어휘 관계 보기, 작문 지시·조건문, 어휘 목록 등 — 유형에 맞게). 자료가 따로 필요 없으면 비워도 됨. 객관식 보기는 여기 넣지 말고 options 에 넣을 것.",
    "- options: 객관식이면 {label,text} 배열을 원본 보기 개수와 동일하게(라벨은 ①②③④⑤ 또는 1~5 등 원본 형식). 서술형·작문·단답이면 빈 배열.",
    "- correctAnswer: 객관식이면 정답 보기 label. 복수정답이면 모든 정답 label을 comma + space로 연결.",
    "- correctAnswers: 복수정답이면 모든 정답 label 배열. 단일 정답이면 비워도 됨.",
    "- explanation: 정답 근거를 한국어로 명확히. 1200자 이내로 간결하게.",
    "- 원본 지문/문장을 그대로 베끼지 말고 새 소재로 동형 재현. 정답 수는 원본과 동일하게 맞출 것.",
    "- Markdown code fence, raw JSON, self-check notes, answer table leakage를 학생용 본문에 넣지 말 것.",
  ];

  return lines.filter((line) => line !== "").join("\n");
}

/** 빌트인 미매칭 유형의 동형 문항 1개를 분석 기반으로 직접 생성한다. */
export async function generateGenericSimilarQuestion(args: {
  analysis: QuestionAnalysis;
  passage: string;
  gradeInfo?: string;
}): Promise<GenericGenerateResult> {
  const prompt = buildGenericPrompt(args.analysis, args.passage, args.gradeInfo ?? "");

  let lastError: unknown;
  for (let attempt = 0; attempt <= GENERIC_MAX_RETRIES; attempt += 1) {
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
      const validationErrors = validateGenericObject(args.analysis, obj);
      if (validationErrors.length > 0) {
        throw new Error(`범용 생성 형식 오류: ${validationErrors.join(" / ")}`);
      }

      const questionText = [obj.direction, obj.passageOrStimulus]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .join("\n\n");
      const genericSubType = getGenericSubType(args.analysis);
      const correctAnswers = obj.correctAnswers.map((value) => value.trim()).filter(Boolean);
      const correctAnswer = obj.correctAnswer.trim() || correctAnswers.join(", ");

      // saveGeneratedQuestionsForJob 가 기대하는 형태로 빌드.
      // _typeId 는 일부러 비워 둠 → 문제 관리 카드가 유형별 구조 렌더 대신 평문 렌더(questionText+options)로 폴백.
      const question: Record<string, unknown> = {
        subType: genericSubType,
        questionText,
        correctAnswer,
        explanation: obj.explanation,
        keyPoints: obj.keyPoints,
        difficulty: args.analysis.classification.difficulty,
        _genericSimilar: true,
      };
      if (correctAnswers.length > 0) question.correctAnswers = correctAnswers;
      const shouldAttachOptions =
        obj.options.length > 0 &&
        obj.answerShape !== "SHORT_ANSWER" &&
        args.analysis.classification.answerShape !== "SHORT_ANSWER";
      if (shouldAttachOptions) question.options = obj.options;

      if (!questionText.trim()) throw new Error("범용 생성 결과가 비어 있습니다.");

      return {
        question,
        subType: genericSubType,
        relaxedFallback: false,
        llmCalls: 1,
        llmAttempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      let detail = error instanceof Error ? error.message : String(error);
      if (NoObjectGeneratedError.isInstance(error)) {
        const rawHead = (error.text ?? "").slice(0, 800);
        const causeMsg =
          error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
        detail = `${error.message} | finishReason=${error.finishReason ?? "?"} | cause=${causeMsg} | rawHead=${rawHead}`;
      }
      console.warn(`[SIMILAR-EXAM-GENERIC] attempt ${attempt} failed: ${detail}`);
    }
  }
  throw lastError;
}
