import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import type { PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";

import type { GenerationSubType } from "../schemas";
import { generateGenericSimilarQuestion } from "./generic-generator";
import type { QuestionAnalysis } from "./schema";

export interface GenerateSimilarQuestionArgs {
  /** 원본 문항 분석(분석기 산출). */
  analysis: QuestionAnalysis;
  /** 동형 문항을 입힐 별도 입력 지문(2-c). 지문없는 유형이면 빈 문자열 가능. */
  passage: string;
  gradeInfo?: string;
}

export interface GenerateSimilarQuestionResult {
  /** 후처리·품질검증을 통과한 생성 문항(공유 엔진 출력 형태). */
  question: Record<string, unknown>;
  /** 빌트인 유형 ID, 또는 빌트인 미매칭 시 "CUSTOM". */
  subType: string;
  relaxedFallback: boolean;
  llmCalls: number;
  llmAttempts: number;
}

/** 분석의 typeSettings → 엔진 QuestionTypeGenerationSettings (generation.ts 매핑과 동일). */
function toEngineTypeSettings(
  subType: GenerationSubType,
  ts: QuestionAnalysis["classification"]["typeSettings"],
): QuestionTypeGenerationSettings | undefined {
  switch (subType) {
    case "GRAMMAR_ERROR":
      if (ts.grammarMarkerCount == null && ts.grammarAnswerCount == null) return undefined;
      return {
        GRAMMAR_ERROR: {
          ...(ts.grammarMarkerCount != null ? { markerCount: ts.grammarMarkerCount } : {}),
          ...(ts.grammarAnswerCount != null ? { answerCount: ts.grammarAnswerCount } : {}),
        },
      };
    case "GRAMMAR_CORRECTION":
      if (ts.grammarCorrectionErrorCount == null) return undefined;
      return { GRAMMAR_CORRECTION: { errorCount: ts.grammarCorrectionErrorCount } };
    case "IRRELEVANT":
      if (ts.irrelevantSlotCount == null) return undefined;
      return { IRRELEVANT: { slotCount: ts.irrelevantSlotCount } };
    case "BLANK_INFERENCE":
      if (!ts.blankDoubleNegative) return undefined;
      return { BLANK_INFERENCE: { doubleNegative: true } };
    default:
      return undefined;
  }
}

/** 분석 결과를 "이 원본과 동형으로 만들라"는 동형 가이드 프롬프트로 직조. */
function shouldUseGenericForSourceForm(
  analysis: QuestionAnalysis,
  subType: GenerationSubType,
): boolean {
  const answerShape = analysis.classification.answerShape;
  const optionCount = analysis.source.optionCount ?? analysis.source.options.length;
  const correctAnswerCount = analysis.source.correctAnswerLabels.length;

  if (subType === "SUMMARY_COMPLETE_MC" && answerShape === "SHORT_ANSWER" && optionCount === 0) {
    return true;
  }

  if (
    subType === "CONTENT_MATCH" &&
    (answerShape === "SHORT_ANSWER" ||
      optionCount !== 5 ||
      correctAnswerCount >= 2 ||
      analysis.source.multipleAnswers)
  ) {
    return true;
  }

  return false;
}

function buildIsomorphicGuidance(analysis: QuestionAnalysis): string {
  const { testingPoint, transformation, reproductionSpec, variationAxes } = analysis;
  const lines: string[] = [
    "## 동형(同形) 생성 지시",
    "아래는 원본 문항의 분석입니다. 이 원본과 **출제 의도·구조가 동일한** 새 문항을 위 지문으로 만드세요.",
  ];

  if (testingPoint.summary) lines.push(`- 출제 포인트(반드시 동일하게 유지): ${testingPoint.summary}`);
  if (testingPoint.skills.length) lines.push(`- 평가 스킬: ${testingPoint.skills.join(", ")}`);

  if (transformation.applied) {
    if (transformation.description) lines.push(`- 변형 방식(동일 적용): ${transformation.description}`);
    if (transformation.rules.length) lines.push(`- 적용 규칙: ${transformation.rules.join(" / ")}`);
    if (transformation.changedSpans.length) {
      const spans = transformation.changedSpans
        .slice(0, 8)
        .map((s) => `"${s.from}"→"${s.to}"(${s.rule})`)
        .join(", ");
      lines.push(`- 원본 변형 예시(같은 규칙으로 새 지문에 맞게 새로 만들 것, 그대로 베끼지 말 것): ${spans}`);
    }
  }

  if (reproductionSpec.stemFormat) lines.push(`- 발문 형식: ${reproductionSpec.stemFormat}`);
  if (reproductionSpec.optionFormat) lines.push(`- 보기 형식: ${reproductionSpec.optionFormat}`);
  if (reproductionSpec.answerFormat) lines.push(`- 정답 형식: ${reproductionSpec.answerFormat}`);
  if (reproductionSpec.structureNotes) lines.push(`- 구조: ${reproductionSpec.structureNotes}`);

  if (variationAxes.length) {
    lines.push(`- 바꿔야 할 축(원본 복제 금지): ${variationAxes.join(" / ")}`);
  }
  lines.push("- 원본 지문·문장을 그대로 재사용하지 말고, 위에 제공된 새 지문에서 출제하세요.");

  if (analysis.classification.matchedType === "WORD_ORDER") {
    lines.push(
      "",
      "## HARD FORMAT RULES FOR WORD_ORDER",
      "- Ask for the complete order of every provided chunk, not selected positions.",
      "- Use numeric labels only: 1, 2, 3, ... Do not use letters, Korean consonants, or circled numerals.",
      "- correctAnswer must be the full hyphen-joined numeric sequence, for example: 3-1-2-5-4.",
      "- Every chunk must be used exactly once; the number of labels in correctAnswer must equal the number of chunks.",
      "- Do not generate an nth-position question such as asking only for the 5th or 8th element.",
      "- The completed sentence must be grammatical and natural English.",
    );
  }

  return lines.join("\n");
}

/**
 * 단일 동형 문항 생성(MVP). 분석을 동형 가이드로 변환해 공유 생성 엔진에 주입한다.
 * 단일 문항이라 호출 격리 문제(중복/톤/누출)가 없어 공유 엔진을 그대로 재사용.
 * (시험지 확장 시 세트 인지 자체 오케스트레이터로 대체 예정.)
 */
export async function generateSimilarQuestion(
  args: GenerateSimilarQuestionArgs,
): Promise<GenerateSimilarQuestionResult> {
  const { analysis, passage } = args;
  // 듣기·도표/그림 등은 텍스트 기반 동형 생성이 사실상 불가 → 생성하지 않는다.
  const stimulusKind = analysis.classification.stimulusKind;
  if (stimulusKind === "LISTENING" || stimulusKind === "VISUAL") {
    throw new Error(
      "듣기·도표/그림 기반 문항은 텍스트로 동형 생성할 수 없어 생성하지 않습니다.",
    );
  }
  const subType = analysis.classification.matchedType;
  if (!subType) {
    // 빌트인 미매칭(신규/특수 유형) → 분석 기반 범용 생성으로 동형 생성.
    // (커스텀 유형 등록·관리는 별도 보류 기능. 여기서는 일회성 생성만.)
    return generateGenericSimilarQuestion({
      analysis,
      passage,
      gradeInfo: args.gradeInfo,
    });
  }

  if (shouldUseGenericForSourceForm(analysis, subType)) {
    return generateGenericSimilarQuestion({
      analysis,
      passage,
      gradeInfo: args.gradeInfo,
    });
  }

  const diffLabel = analysis.classification.difficulty;
  const targetPoints = [
    ...analysis.testingPoint.skills,
    ...analysis.transformation.rules,
  ].slice(0, 12);

  const plan: PlanResult["plan"] = [
    {
      subType,
      count: 1,
      reason: "Generated as an isomorphic variant of the analyzed source question.",
      targetPoints,
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
      diffLabel,
      diffInstruction: DIFF_DESCRIPTION[diffLabel] ?? DIFF_DESCRIPTION.INTERMEDIATE,
      generationPlan: "STANDARD",
      typeSettings: toEngineTypeSettings(subType, analysis.classification.typeSettings),
      customPrompt: buildIsomorphicGuidance(analysis),
    },
    { logPrefix: "SIMILAR-EXAM-ISOMORPHIC" },
  );

  const question = result.questions[0];
  if (!question) {
    throw new Error("동형 문항 생성에 실패했습니다(빈 결과).");
  }

  return {
    question,
    subType,
    relaxedFallback: result.relaxedFallback,
    llmCalls: result.usageEvents.length,
    llmAttempts: result.attempts,
  };
}
