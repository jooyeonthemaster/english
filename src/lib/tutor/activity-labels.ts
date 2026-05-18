export const tutorModeLabels: Record<string, string> = {
  interpret: "해석",
  memorize: "암기",
  order: "순서",
  vocab: "어휘",
  grammar: "어법",
  transfer: "전이",
  mastery: "마스터리",
};

export const tutorModeDescriptions: Record<string, string> = {
  interpret: "직독직해와 주제 파악",
  memorize: "통문장 암기와 빈칸 복원",
  order: "문장 배열과 삽입",
  vocab: "문맥 어휘와 철자",
  grammar: "어법 판단과 원문 근거",
  transfer: "서술형 전환",
  mastery: "종합 점검",
};

export const tutorActivityTypeLabels: Record<string, string> = {
  sentence_translate: "직독직해",
  gist_select: "주제 선택",
  paraphrase_mc: "바꿔 말하기",
  first_letter_recall: "첫 글자 암기",
  progressive_cloze: "빈칸 복원",
  sentence_rebuild: "문장 조립",
  chunk_rebuild: "구문 조립",
  sentence_order: "문장 순서",
  insertion_point: "문장 삽입",
  irrelevant_sentence: "흐름 판단",
  vocab_choice: "뜻 선택",
  vocab_spell: "철자 쓰기",
  vocab_match: "어휘 매칭",
  contextual_meaning: "문맥 의미",
  collocation_select: "연어 선택",
  grammar_binary: "어법 판단",
  grammar_find: "어법 찾기",
  grammar_correct: "어법 고치기",
  structure_transform: "구문 전환",
  mastery_test: "종합 평가",
};

const studentActivityTitleFallbacks: Record<string, string> = {
  sentence_translate: "직독직해 쓰기",
  gist_select: "지문 핵심 주제 고르기",
  paraphrase_mc: "같은 뜻 표현 고르기",
  first_letter_recall: "첫 글자 힌트로 문장 복원",
  progressive_cloze: "핵심어 빈칸 복원",
  sentence_rebuild: "원문 어순 조립",
  chunk_rebuild: "구문 조각 조립",
  sentence_order: "문장 흐름 순서 맞추기",
  insertion_point: "문장 삽입 위치 찾기",
  irrelevant_sentence: "흐름에서 어색한 문장 찾기",
  vocab_choice: "문맥 속 단어 뜻 고르기",
  vocab_spell: "뜻을 보고 철자 쓰기",
  vocab_match: "핵심 어휘 뜻 연결하기",
  contextual_meaning: "문맥 의미 추론",
  collocation_select: "자연스러운 연어 고르기",
  grammar_binary: "어법 설명 맞다/아니다",
  grammar_find: "원문 어법 근거 찾기",
  grammar_correct: "어법 오류 고치기",
  structure_transform: "구문 전환 서술형",
  mastery_test: "종합 점검 문제",
};

const studentInstructionFallbacks: Record<string, string> = {
  sentence_translate: "영어 문장을 읽고 핵심 의미가 드러나도록 한국어로 적어보세요.",
  gist_select: "전체 지문의 중심 생각과 가장 가까운 설명을 고르세요.",
  paraphrase_mc: "원문과 같은 의미를 유지하는 선택지를 고르세요.",
  first_letter_recall: "첫 글자 힌트를 보고 원문 문장을 최대한 정확히 복원하세요.",
  progressive_cloze: "문맥상 빈칸에 들어갈 원문 표현을 입력하세요.",
  sentence_rebuild: "아래 조각을 눌러 원문 어순대로 문장을 완성하세요.",
  chunk_rebuild: "뜻 단위 조각을 자연스러운 영어 순서로 이어 붙이세요.",
  sentence_order: "문장들의 논리 흐름이 자연스럽도록 순서를 맞추세요.",
  insertion_point: "제시문이 들어갈 위치를 앞뒤 문맥 단서로 판단하세요.",
  irrelevant_sentence: "글의 흐름에서 어색한 문장을 찾아 표시하세요.",
  vocab_choice: "지문 속 쓰임에 가장 가까운 한국어 뜻을 고르세요.",
  vocab_spell: "뜻과 힌트를 보고 지문 속 영어 단어를 정확히 입력하세요.",
  vocab_match: "영단어마다 지문 속 한국어 뜻을 연결하세요.",
  contextual_meaning: "사전 뜻이 아니라 이 문장에서 실제로 작동하는 의미를 고르세요.",
  collocation_select: "본문 어휘와 함께 외워야 할 자연스러운 표현을 고르세요.",
  grammar_binary: "어법 설명이 지문 속 원문 근거와 맞는지 판단하세요.",
  grammar_find: "설명에 해당하는 원문 표현을 그대로 입력하세요.",
  grammar_correct: "어색한 표현을 원문 의미에 맞게 고쳐 쓰세요.",
  structure_transform: "조건에 맞게 핵심 구문을 바꾸어 쓰세요.",
  mastery_test: "지문 전체 흐름을 떠올리며 가장 근거가 분명한 답을 고르세요.",
};

export const tutorDimensionLabels: Record<string, string> = {
  interpret: "해석",
  memorize: "암기",
  order: "순서",
  vocab: "어휘",
  grammar: "어법",
  transfer: "전이",
};

export function labelTutorMode(mode: string) {
  return tutorModeLabels[mode] ?? mode;
}

export function labelTutorActivityType(type: string) {
  return tutorActivityTypeLabels[type] ?? type;
}

export function containsHangul(value: string) {
  return /[가-힣]/.test(value);
}

function cleanDisplayText(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sentencePrefix(payload?: Record<string, unknown>) {
  const index = Number(payload?.sentenceIndex);
  return Number.isInteger(index) && index >= 0 ? `문장 ${index + 1} ` : "";
}

function stemPrefix(payload?: Record<string, unknown>) {
  const stem = cleanDisplayText(String(payload?.stem ?? payload?.word ?? ""));
  return stem ? `${stem} · ` : "";
}

export function studentActivityTitle(
  type: string,
  rawTitle?: string | null,
  payload?: Record<string, unknown>,
) {
  const title = cleanDisplayText(rawTitle);
  if (title && containsHangul(title)) return title;

  const fallback = studentActivityTitleFallbacks[type] ?? labelTutorActivityType(type);
  if (
    [
      "sentence_translate",
      "first_letter_recall",
      "progressive_cloze",
      "sentence_rebuild",
      "chunk_rebuild",
      "grammar_find",
      "grammar_correct",
    ].includes(type)
  ) {
    return `${sentencePrefix(payload)}${fallback}`.trim();
  }
  if (["vocab_choice", "vocab_spell", "contextual_meaning", "collocation_select"].includes(type)) {
    return `${stemPrefix(payload)}${fallback}`;
  }
  return fallback;
}

export function studentActivityInstruction(
  type: string,
  rawInstructions?: string | null,
  payload?: Record<string, unknown>,
) {
  const instructions = cleanDisplayText(rawInstructions);
  if (instructions && containsHangul(instructions)) return instructions;

  const fallback = studentInstructionFallbacks[type] ?? "지문 근거를 확인하며 문제를 풀고 채점해 보세요.";
  if (type === "vocab_spell" && payload?.firstLetter) {
    return `${fallback} 첫 글자 힌트는 ${String(payload.firstLetter).toUpperCase()}입니다.`;
  }
  return fallback;
}
