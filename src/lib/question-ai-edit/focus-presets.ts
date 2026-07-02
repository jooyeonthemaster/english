// ============================================================================
// AI 문제 수정 — 유형별 "빠른 포커스" 프리셋 칩
// ============================================================================
// 각 유형에서 자주 요청되는 수정 방향을 한 번에 입력할 수 있는 칩. 칩을 누르면 그
// instruction 이 프롬프트 입력란에 채워진다(사용자가 이어서 자유롭게 덧붙일 수 있음).
// label 은 짧게(칩 표시), instruction 은 모델에 전달되는 완성형 지시.
// ============================================================================

export interface EditFocusPreset {
  label: string;
  instruction: string;
}

/** 모든 유형 공통 — 끝에 항상 노출. */
export const COMMON_EDIT_PRESETS: EditFocusPreset[] = [
  { label: "해설 더 자세히", instruction: "해설을 지문 근거를 명확히 인용해 더 자세하고 친절하게 다시 써 줘. 핵심 포인트도 학습에 도움이 되도록 보강해 줘." },
  { label: "오답 더 매력적으로", instruction: "오답 선지를 더 그럴듯하고 헷갈리게(하지만 명확히 틀리게) 다듬고, 각 오답이 왜 틀렸는지 오답 해설을 정교하게 다시 써 줘." },
  { label: "난이도 올리기", instruction: "유형은 그대로 두되 난이도를 한 단계 올려 줘(정답 추론에 더 정교한 사고가 필요하도록). difficulty 도 그에 맞게 조정해 줘." },
  { label: "난이도 내리기", instruction: "유형은 그대로 두되 난이도를 한 단계 낮춰 더 평이하게 만들어 줘. difficulty 도 그에 맞게 조정해 줘." },
  { label: "발문 자연스럽게", instruction: "발문(direction)을 수능/내신 기출 어투로 더 자연스럽고 명확하게 다듬어 줘. 의미는 유지해." },
];

/** 유형(subType)별 포커스 프리셋. */
export const EDIT_FOCUS_PRESETS: Record<string, EditFocusPreset[]> = {
  // ── 객관식 ──────────────────────────────────────────────────────────────
  GRAMMAR_ERROR: [
    { label: "조동사 중심", instruction: "어법 포인트를 조동사(can/must/should/might 등)와 조동사+have p.p. 중심으로 다시 구성해 줘. 밑줄·정답·오답해설을 모두 그 포인트에 맞춰 정합하게 고쳐." },
    { label: "시제·시상 중심", instruction: "어법 포인트를 시제·시상(현재완료/과거완료/시제일치) 중심으로 다시 구성해 줘. 정답 밑줄과 해설을 시제 판단으로 맞춰." },
    { label: "수일치 중심", instruction: "어법 포인트를 주어-동사 수일치(단수/복수, 도치·삽입구 속 수일치) 중심으로 바꿔 줘." },
    { label: "관계사 중심", instruction: "어법 포인트를 관계대명사/관계부사(that/which/what, 전치사+관계대명사) 중심으로 바꿔 줘." },
    { label: "능동·수동(태)", instruction: "어법 포인트를 능동/수동태 판단 중심으로 바꿔 줘." },
    { label: "준동사", instruction: "어법 포인트를 to부정사 vs 동명사, 분사구문, 분사의 능동/수동 중심으로 바꿔 줘." },
    { label: "병렬 구조", instruction: "어법 포인트를 등위/상관 접속사의 병렬 구조 중심으로 바꿔 줘." },
  ],
  GRAMMAR_CHOICE_COMBO: [
    { label: "시제 vs 태", instruction: "(A)(B)(C) 선택 지점을 시제와 태 판단 중심으로 다시 구성하고 정답 조합을 그에 맞춰." },
    { label: "관계사·접속사", instruction: "선택 지점을 관계사 vs 접속사, that/what 구분 중심으로 바꿔 줘." },
    { label: "수일치·준동사", instruction: "선택 지점을 수일치와 준동사(to-v/v-ing) 중심으로 바꿔 줘." },
  ],
  BLANK_INFERENCE: [
    { label: "빈칸 위치 바꾸기", instruction: "빈칸 위치를 글의 주제가 더 또렷이 드러나는 다른 핵심 표현으로 옮겨 줘. 정답과 오답을 새 위치에 맞춰 다시 만들어." },
    { label: "추론형(패러프레이즈)", instruction: "정답을 원문 표현 그대로가 아니라 의미를 보존한 패러프레이즈로 바꿔(추론이 필요하도록). 오답도 매력적으로 다시 구성해." },
    { label: "오답 정교화", instruction: "오답 4개를 지문 흐름상 한 번씩 끌릴 만하지만 명확히 틀린 표현으로 정교하게 다시 만들어 줘." },
    { label: "주제 직결로", instruction: "빈칸이 글의 요지와 직결되도록 정답 표현을 다시 골라 줘." },
  ],
  VOCAB_CHOICE: [
    { label: "동의어 변형 적용", instruction: "정답 외 단어도 원문과 의미가 같은 동의어로 바꿔(SYNONYM_VARIANT, 원문 단어 암기 방지). 부적절한 정답 단어 1개만 문맥상 어긋나게 만들어." },
    { label: "오답 단어 교체", instruction: "표시 단어 중 정답이 아닌 단어들을 더 자연스러운 문맥 어휘로 교체하고, 정답 단어의 부적절성을 더 분명히 해 줘." },
    { label: "정답 위치 바꾸기", instruction: "부적절한 단어(정답)를 다른 위치의 단어로 옮기고 해설을 그에 맞춰." },
  ],
  SENTENCE_ORDER: [
    { label: "연결 단서 강화", instruction: "단락 (A)(B)(C)의 연결 단서(지시어·연결어·대명사)를 더 분명히 해 순서가 논리적으로 유일하게 결정되도록 다듬어 줘." },
    { label: "함정 순서 추가", instruction: "그럴듯하지만 틀린 순서를 매력적인 오답으로 보강하고 오답 해설을 정교하게." },
    { label: "주어진 문장 다듬기", instruction: "주어진 문장(givenSentence)을 글 전체 흐름의 도입으로 더 자연스럽게 다듬어 줘." },
  ],
  SENTENCE_INSERT: [
    { label: "정답 위치 유일화", instruction: "주어진 문장이 들어갈 자리가 단 한 곳으로만 결정되도록 앞뒤 연결 단서를 강화해 줘." },
    { label: "주어진 문장 교체", instruction: "주어진 문장을 글의 논리적 공백을 더 잘 메우는 문장으로 바꾸고 정답 위치를 다시 정해." },
    { label: "오답 위치 강화", instruction: "정답이 아닌 위치들도 한 번씩 끌릴 만하게 만들어 변별력을 높여 줘." },
  ],
  TOPIC: [
    { label: "오답 매력 강화", instruction: "주제 오답 선지를 지문의 부분 정보만 담아 끌리지만 전체 주제는 아니도록 정교하게 다시 써 줘." },
    { label: "정답 더 포괄적으로", instruction: "정답 선지가 글 전체 주제를 더 정확·포괄적으로 담도록 다듬어 줘." },
  ],
  MAIN_IDEA: [
    { label: "오답 매력 강화", instruction: "요지 오답 선지를 지문의 지엽적 진술로 만들어 변별력을 높여 줘." },
    { label: "정답 한국어 다듬기", instruction: "정답 요지 선지(한국어)를 글의 핵심 주장과 더 정확히 일치하도록 다듬어 줘." },
  ],
  TOPIC_MAIN_IDEA: [
    { label: "오답 매력 강화", instruction: "오답 선지를 부분 정보 기반으로 정교하게 다시 만들어 변별력을 높여 줘." },
    { label: "정답 정합화", instruction: "정답 선지가 글 전체 주제·요지와 더 정확히 일치하도록 다듬어 줘." },
  ],
  TITLE: [
    { label: "함축적 제목", instruction: "정답 제목을 글의 핵심을 함축적·비유적으로 담은 표현으로 다듬고, 오답은 지엽적이거나 지나치게 포괄적인 제목으로 정교화해 줘." },
    { label: "오답 정교화", instruction: "제목 오답 선지를 한 번씩 끌리지만 전체 주제는 빗나가게 다시 만들어 줘." },
  ],
  IMPLIED_MEANING: [
    { label: "함축 추론 강화", instruction: "밑줄 표현의 표면 의미와 함축 의미 간 추론 간극(reasoningGap)을 더 분명히 하고, 정답이 함축 의미를 정확히 담도록 다듬어 줘." },
    { label: "오답 정교화", instruction: "오답을 표면 의미·부분 의미에 머무르는 매력적 함정으로 다시 만들어 줘." },
  ],
  REFERENCE: [
    { label: "지칭 모호성 제거", instruction: "밑줄 대명사가 가리키는 대상이 문맥상 명확히 하나로 결정되도록 다듬고, 오답 대상을 매력적으로 구성해 줘." },
    { label: "오답 대상 강화", instruction: "정답이 아닌 지칭 후보들도 한 번씩 끌릴 만하게 다시 구성해 줘." },
  ],
  CONTENT_MATCH: [
    { label: "오답 근거 명확화", instruction: "각 선지가 지문의 특정 문장과 일치/불일치하는지 근거를 분명히 하고, 오답 해설에 해당 근거를 명시해 줘." },
    { label: "함정 선지 정교화", instruction: "지문을 살짝 비튼(숫자·범위·인과 뒤집기) 매력적 함정 선지로 다시 만들어 변별력을 높여 줘." },
  ],
  SUMMARY_COMPLETE_MC: [
    { label: "요약문 정교화", instruction: "요약문이 글 전체를 더 정확히 압축하도록 다듬고, (A)(B) 빈칸 정답과 오답 조합을 그에 맞춰 다시 구성해 줘." },
    { label: "오답 조합 강화", instruction: "(A)(B) 오답 조합을 한쪽만 맞는 매력적 함정으로 정교하게 다시 만들어 줘." },
  ],
  IRRELEVANT: [
    { label: "무관 문장 교체", instruction: "무관한 문장(정답)을 주제는 비슷해 보이지만 글의 논리 흐름에서 명확히 벗어나는 문장으로 더 정교하게 다시 써 줘." },
    { label: "흐름 자연스럽게", instruction: "정답 문장을 제외한 나머지 문장들의 논리적 연결을 더 매끄럽게 다듬어 줘." },
  ],

  // ── 서술형 ──────────────────────────────────────────────────────────────
  CONDITIONAL_WRITING: [
    { label: "조건 구체화", instruction: "영작 조건(어휘·문법·어순 제약)을 더 구체적이고 검증 가능하게 다듬고, 모범답안과 채점 기준을 그에 맞춰 갱신해 줘." },
    { label: "문법 포인트 지정", instruction: "조건에 특정 문법 포인트(예: 관계사, 분사구문)를 반드시 쓰도록 명시하고 모범답안을 그에 맞춰." },
    { label: "모범답안 정교화", instruction: "모범답안을 조건을 모두 충족하는 자연스러운 영어 문장으로 다듬고 채점 기준을 정리해 줘." },
  ],
  SENTENCE_TRANSFORM: [
    { label: "전환 포인트 지정", instruction: "문장 전환 포인트(능동↔수동, 직접↔간접, 가정법 등)를 명확히 하고 조건·모범답안을 그에 맞춰 갱신해 줘." },
    { label: "조건 구체화", instruction: "전환 조건을 더 구체적으로 명시하고 모범답안을 정교화해 줘." },
  ],
  FILL_BLANK_KEY: [
    { label: "핵심 표현 교체", instruction: "빈칸으로 만들 핵심 표현을 글의 주제와 더 직결되는 표현으로 바꾸고 정답을 그에 맞춰." },
    { label: "단서 조정", instruction: "빈칸 앞뒤 문맥 단서를 조정해 정답이 합리적으로 유추되도록 다듬어 줘." },
  ],
  SUMMARY_COMPLETE: [
    { label: "요약문 정교화", instruction: "요약문이 글을 더 정확히 압축하도록 다듬고 빈칸 정답을 그에 맞춰 갱신해 줘." },
    { label: "빈칸 난이도 조정", instruction: "빈칸 정답을 추론이 더 필요한 핵심 어휘로 바꿔 줘." },
  ],
  SUMMARY_WRITING: [
    { label: "보기 단어 조정", instruction: "보기(wordBank)를 더 적절한 후보로 조정하되 정답 단어는 학생에게 노출되지 않게 유지해 줘. 오답 후보(distractor)를 매력적으로." },
    { label: "첫글자 단서", instruction: "빈칸 첫글자 단서 모드로 바꿔 줘: clueMode 를 firstLetter 로 설정하고 각 빈칸의 정답(answer)을 정확히 채워 줘(첫글자 단서는 정답에서 자동으로 만들어짐). 난이도를 약간 낮춰." },
    { label: "요약문·해석 다듬기", instruction: "요약문과 한국어 해석(koreanGloss)을 더 자연스럽게 다듬되 빈칸 정답은 그대로 유지해 줘." },
  ],
  WORD_ORDER: [
    { label: "단어 재구성", instruction: "배열할 단어들을 글 맥락에 맞는 다른 핵심 문장으로 바꾸고 모범답안을 그에 맞춰. 난이도를 적절히." },
    { label: "힌트 조정", instruction: "배열 문제의 한국어 힌트(contextHint)를 더 명확히 다듬어 줘." },
  ],
  TOPIC_SENTENCE_WRITING: [
    { label: "제시어·미끼 조정", instruction: "제시어(scrambledWords 또는 wordBank)를 더 적절한 후보로 조정하되, 미끼(distractor)는 정답의 동의어·활용형으로 매력적으로 만들어 줘. 정답 어순(modelAnswer)이 드러나지 않도록 제시어는 반드시 셔플하고, 정답 단어 자체는 학생면에 노출하지 마." },
    { label: "빈칸 조정", instruction: "빈칸완성(cloze) 모드의 주제문 빈칸을 글의 주제와 더 직결되는 핵심 표현으로 조정하고 각 빈칸의 정답(blanks.answer)을 그에 맞춰 정확히 채워 줘. 빈칸 개수는 유지하고, 마스킹된 주제문(summaryWithBlanks)에는 정답 어구를 절대 포함하지 마." },
    { label: "주제 표현 다듬기", instruction: "추출한 주제 자체(모범답안 modelAnswer)를 글 전체를 더 정확히 포괄하는 주제문/명사구로 다듬고, 제시어·빈칸을 그에 정합하게 다시 맞춰 줘. 정답계열은 학생면에 노출하지 마." },
    { label: "힌트·해석 조정", instruction: "한국어 [주제 힌트](koreanGloss)를 더 자연스럽게 다듬되, 정답 어구를 1:1로 직역해 나열하지 말고 전체 의미만 전달하도록 작성해 줘." },
  ],
  GRAMMAR_CORRECTION: [
    { label: "오류 포인트 지정", instruction: "정정 대상 문법 오류를 특정 포인트(예: 수일치, 시제, 태)로 다시 구성하고 밑줄·정답·정정안을 정합하게 고쳐 줘." },
    { label: "정정안 정교화", instruction: "각 밑줄 구간의 오류와 정정안(correctedPart)을 더 명확히 하고 해설을 정교화해 줘." },
    { label: "오류 개수 유지", instruction: "오류 구간 개수는 유지하면서 각 오류의 문법 포인트를 더 명확하게 다듬어 줘." },
  ],

  // ── 어휘 ────────────────────────────────────────────────────────────────
  CONTEXT_MEANING: [
    { label: "오답 정교화", instruction: "밑줄 단어의 문맥상 의미를 묻는 오답 선지를 사전적 의미·유사 의미로 매력적으로 다시 구성해 줘." },
    { label: "대상 단어 교체", instruction: "밑줄 단어를 다의어/문맥 의존도가 높은 다른 단어로 바꾸고 선지를 그에 맞춰." },
  ],
  SYNONYM: [
    { label: "대상 단어 교체", instruction: "동의어를 묻는 대상 단어를 글의 핵심 어휘로 바꾸고 정답·오답 선지를 그에 맞춰 다시 구성해 줘." },
    { label: "오답 정교화", instruction: "오답 선지를 의미가 비슷해 보이지만 다른 단어로 정교하게 다시 만들어 줘." },
  ],
  ANTONYM: [
    { label: "반의어 쌍 조정", instruction: "표시된 단어-반의어 쌍을 다듬고, 정확히 한 쌍만 잘못된 반의어 쌍(정답)이 되도록 구성해 줘." },
    { label: "오답 쌍 강화", instruction: "올바른 반의어 쌍들을 더 분명한 반의 관계로, 잘못된 쌍(정답)은 더 미묘하게 다듬어 줘." },
  ],
};

export function getEditFocusPresets(subType: string): EditFocusPreset[] {
  return [...(EDIT_FOCUS_PRESETS[subType] ?? []), ...COMMON_EDIT_PRESETS];
}
