import { DIFFICULTY_RUBRIC, MARKING_RUBRIC } from "./constants";
import {
  buildGeminiCompactGenerationPrompt,
  buildGeminiCompactPlanningPrompt,
  buildQuestionGenerationPromptContract,
} from "@/lib/question-generation-prompt-contract";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

interface PlanningPromptInput {
  schoolType: string;
  gradeInfo: string;
  count: number;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  customPrompt?: string;
  diffLabel: string;
  generationPlan?: QuestionGenerationPlan;
}

export function buildPlanningPrompt({
  schoolType,
  gradeInfo,
  count,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  customPrompt,
  diffLabel,
  generationPlan,
}: PlanningPromptInput): string {
  if (generationPlan === "STANDARD") {
    return buildGeminiCompactPlanningPrompt({
      schoolType,
      gradeInfo,
      count,
      passageContent,
      teacherIntentBlock,
      analysisContext,
      customPrompt,
      diffLabel,
    });
  }

  const hasAnalysisContext = analysisContext.trim().length > 0;
  const analysisBlock = hasAnalysisContext
    ? analysisContext
    : "\n\n## Saved passage analysis\nNone. This passage has not been analyzed yet.";
  const sourcePolicy = hasAnalysisContext
    ? "Use the saved passage analysis as high-priority guidance, but keep every planned question grounded in the original passage."
    : "No saved passage analysis is available. Plan from the original passage text and teacher annotations only. Do not reject any question type only because analysis data is missing; targetPoints should cite concrete words, sentences, logic, or exam-worthy spots from the passage itself.";
  return `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신 시험 출제위원입니다.

아래 지문과 분석 데이터를 검토하고 ${count}문제를 출제할 최적의 유형 배분 계획을 세우세요.

## 핵심 규칙
1. 표시된 "추천 출제유형"과 "출제 설계 포인트"를 우선 반영하세요.
2. 같은 유형을 3문제 이상 내지 말고, 다양한 유형으로 분산하세요.
3. 분석 데이터에 근거 없는 유형은 선택하지 마세요.
4. targetPoints에는 사용할 구체적 분석 항목을 명시하세요.

## 지문
${passageContent}
${teacherIntentBlock ? `\n${teacherIntentBlock}\n` : ""}${analysisBlock}

## Source policy
${sourcePolicy}

## 사용 가능한 유형
객관식: BLANK_INFERENCE, GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, TOPIC_MAIN_IDEA, TITLE, IMPLIED_MEANING, REFERENCE, CONTENT_MATCH, IRRELEVANT
서술형: CONDITIONAL_WRITING, SENTENCE_TRANSFORM, FILL_BLANK_KEY, SUMMARY_COMPLETE, WORD_ORDER, GRAMMAR_CORRECTION
어휘: CONTEXT_MEANING, SYNONYM, ANTONYM

${DIFFICULTY_RUBRIC[diffLabel] || DIFFICULTY_RUBRIC.INTERMEDIATE}

총 ${count}문제의 배분 계획을 세우세요.${customPrompt ? `\n\n## 선생님 추가 지시\n${customPrompt}` : ""}`;
}

interface GenerationPromptInput {
  schoolType: string;
  gradeInfo: string;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  targetPoints: string[];
  typePrompt: string;
  structuredInstructions: string;
  targetCandidateBlock?: string;
  typeQualityRubric?: string;
  typeCount: number;
  diffLabel: string;
  diffInstruction: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
}

export function buildGenerationPrompt({
  schoolType,
  gradeInfo,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  targetPoints,
  typePrompt,
  structuredInstructions,
  targetCandidateBlock,
  typeQualityRubric,
  typeCount,
  diffLabel,
  diffInstruction,
  generationPlan,
  customPrompt,
}: GenerationPromptInput): string {
  if (generationPlan === "STANDARD") {
    return buildGeminiCompactGenerationPrompt({
      schoolType,
      gradeInfo,
      passageContent,
      teacherIntentBlock,
      analysisContext,
      targetPoints,
      targetCandidateBlock,
      typePrompt,
      typeQualityRubric,
      count: typeCount,
      difficulty: diffLabel,
      difficultyInstruction: diffInstruction,
      customPrompt,
    });
  }

  const hasAnalysisContext = analysisContext.trim().length > 0;
  const analysisBlock = hasAnalysisContext
    ? analysisContext
    : "\n\n## Saved passage analysis\nNone. Generate directly from the original passage.";
  const sourcePolicy = hasAnalysisContext
    ? "Reflect the saved analysis points when they are relevant, while grounding the final question and explanation in the passage text."
    : "No saved analysis exists. Do not invent analysis-only facts or require pre-analysis. Build the question from the original passage, teacher annotations, and concrete passage evidence.";
  const targetContext =
    targetPoints.length > 0
      ? `\n\n## 이 유형에서 반드시 사용할 분석 포인트\n${targetPoints
          .map((p) => `- ${p}`)
          .join("\n")}`
      : "";
  const providerQualityContract =
    buildQuestionGenerationPromptContract(generationPlan);

  return `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passageContent}
${targetCandidateBlock ? `\n${targetCandidateBlock}\n` : ""}
${teacherIntentBlock ? `\n${teacherIntentBlock}\n` : ""}${analysisBlock}

## Source policy
${sourcePolicy}
${targetContext}

## 출제 유형 지시사항
${typePrompt}
${typeQualityRubric ? `\n${typeQualityRubric}` : ""}
${structuredInstructions}

## 생성 조건
- 문제 수: ${typeCount}문제
- 난이도: ${diffLabel} (${diffInstruction})
${DIFFICULTY_RUBRIC[diffLabel] || DIFFICULTY_RUBRIC.INTERMEDIATE}
${MARKING_RUBRIC}
${providerQualityContract}
${customPrompt ? `\n## Teacher instructions\n${customPrompt}` : ""}
- If saved passage analysis is "None", treat targetPoints as passage evidence rather than analysis items.
- difficulty 필드에 반드시 "${diffLabel}"을 입력하세요. 다른 값을 넣지 마세요.
- 객관식은 해당 유형이 요구하는 개수의 선택지(options 배열에 {label, text} 형태)를 만드세요. 대부분은 5개이고, 무관한 문장과 확장 어법 판단의 밑줄 표현 수는 상세 설정의 개수를 따릅니다.
- 해설(explanation)은 왜 정답인지 지문 근거와 함께 한국어로 작성하세요.
- keyPoints는 3개의 학습 포인트로 작성하세요.
- wrongOptionExplanations는 객관식 문제마다 반드시 정답을 제외한 모든 오답에 대해 작성하세요. 복수 정답 문항은 전체 선지 수에서 정답 수를 뺀 만큼 작성합니다. 확장 어법 판단은 모든 선지를 정답으로 만들지 말고 오답 분석이 남게 하세요.
- wrongOptionExplanations가 배열 스키마이면 각 항목은 {label, explanation} 형태로 작성하세요.
- tags는 관련 문법/어휘/유형 태그를 한국어로 작성하세요.

위의 분석 포인트를 반드시 문제에 반영하고, 정확히 ${typeCount}문제를 생성하세요.`;
}

export const STRUCTURED_OUTPUT_INSTRUCTIONS = `\n## 출력 형식 안내
- 반드시 해당 유형 스키마의 필드 이름을 정확히 사용하세요.
- direction 필드는 발문을 한국어로 작성하세요.
- correctAnswer 필드는 객관식은 정답 선택지 label, 서술형은 정답 텍스트를 넣으세요.
- passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers 같은 지문 전체 복사 필드는 생성하지 마세요. 서버에서 자동 생성합니다.`;

export const UNSTRUCTURED_OUTPUT_INSTRUCTIONS = `\n## 출력 형식 안내
- 밑줄 친 표현은 __단어__ 형태로 표시합니다.
- 빈칸은 _____(5개 이상)로 표시합니다.`;
