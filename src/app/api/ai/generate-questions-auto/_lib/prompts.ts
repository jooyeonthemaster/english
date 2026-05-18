interface PlanningPromptInput {
  schoolType: string;
  gradeInfo: string;
  count: number;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  customPrompt?: string;
}

export function buildPlanningPrompt({
  schoolType,
  gradeInfo,
  count,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  customPrompt,
}: PlanningPromptInput): string {
  return `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신 시험 출제위원입니다.

아래 지문과 분석 데이터를 검토하고, ${count}문제를 출제할 **최적의 유형 배분 계획**을 세우세요.

## 핵심 규칙
1. ★표시된 "추천 출제유형"과 "출제 설계 포인트"를 **반드시 우선 반영**하세요.
2. 같은 유형을 3문제 이상 내지 마세요. 다양한 유형으로 분산하세요.
3. 분석 데이터에 근거 없는 유형은 선택하지 마세요.
4. targetPoints에 활용할 구체적 분석 항목(어휘명, 문법 패턴명, 출제포인트 원문)을 명시하세요.

## 지문
${passageContent}
${teacherIntentBlock ? `\n${teacherIntentBlock}\n` : ""}${analysisContext}

## 사용 가능한 유형
객관식: BLANK_INFERENCE, GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, TOPIC_MAIN_IDEA, TITLE, REFERENCE, CONTENT_MATCH, IRRELEVANT
서술형: CONDITIONAL_WRITING, SENTENCE_TRANSFORM, FILL_BLANK_KEY, SUMMARY_COMPLETE, WORD_ORDER, GRAMMAR_CORRECTION
어휘: CONTEXT_MEANING, SYNONYM, ANTONYM

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
  typeCount: number;
  diffLabel: string;
  diffInstruction: string;
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
  typeCount,
  diffLabel,
  diffInstruction,
}: GenerationPromptInput): string {
  const targetContext =
    targetPoints.length > 0
      ? `\n\n## 이 유형에서 반드시 활용할 분석 포인트\n${targetPoints
          .map((p) => `- ${p}`)
          .join("\n")}`
      : "";

  return `당신은 한국 ${schoolType} ${gradeInfo} 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passageContent}
${teacherIntentBlock ? `\n${teacherIntentBlock}\n` : ""}${analysisContext}
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
정확히 ${typeCount}문제를 생성하세요.`;
}

export const STRUCTURED_OUTPUT_INSTRUCTIONS = `\n## 출력 형식 안내
- 반드시 아래 유형별 지시사항의 필드 이름을 정확히 사용하세요.
- direction 필드에는 발문(한국어)을 넣으세요.
- correctAnswer 필드에는 정답 선지 label (객관식) 또는 정답 텍스트 (서술형)를 넣으세요.
- ⚠️ 지문 전체를 복사하는 필드(passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers)는 절대 생성하지 마세요. 서버에서 자동 생성합니다.`;

export const UNSTRUCTURED_OUTPUT_INSTRUCTIONS = `\n## 출력 형식 안내
- 밑줄 친 표현은 __단어__ 형태로 감쌉니다
- 빈칸은 _____(5개 이상)으로 표시합니다`;
