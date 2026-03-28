// ============================================================================
// 듀오링고 스타일 학습 문제 — AI 프롬프트 빌더
// ============================================================================
// learning-question-schemas.ts에서 분리 (500줄 제한)
// 5-layer 분석 데이터를 최대한 활용하는 카테고리별 프롬프트 생성
// ============================================================================

import type { PassageAnalysisData } from "@/types/passage-analysis";

// ---------------------------------------------------------------------------
// 공통 지문 노출 규칙
// ---------------------------------------------------------------------------

const CONTEXT_RULES = `
## 지문 노출 규칙 (필수 준수)
- 문제의 contextSentence/sentence/excerpt에는 해당 문제와 직접 관련된 **1~2문장만** 포함
- 문장이 15단어 미만이면 앞/뒤 1문장을 **반드시** 추가해 문맥 보충 (2~3문장으로 구성)
- 문장이 30단어 이상이면 해당 문장만 사용
- **절대로 지문 전체를 넣지 말 것** — 듀오링고 스타일 드릴은 짧은 문맥만 표시
- sentences[].index를 활용해 앞뒤 문장 참조

## 선택지 규칙 (필수 준수)
- 선택지(options)의 **정답 위치를 반드시 랜덤하게** 배치할 것
- 정답을 항상 A에 두지 말 것 — A, B, C, D에 고르게 분배
- correctAnswer 값은 정답이 위치한 label(A/B/C/D)로 설정

## 원문 인용 규칙 (가장 중요 — 반드시 준수)
- contextSentence, sentence, englishSentence, sentenceBefore, sentenceAfter, contextExcerpt, excerpt, originalSentence 필드에는 **지문 원문을 한 글자도 바꾸지 말고 그대로 복사**할 것
- 단어를 빼거나, 추가하거나, 순서를 바꾸거나, 요약하거나, 축약하는 것 **일체 금지**
- 반드시 sentences[].english 또는 지문 원문에서 **copy-paste** 수준으로 가져올 것
- 빈칸(_____)을 만들 때만 해당 단어/구를 _____로 교체 — 나머지는 원문 그대로 유지
- 예외: ERROR_FIND, ERROR_CORRECT는 의도적 오류 삽입이므로 변형 허용
`;

// ---------------------------------------------------------------------------
// 메인 프롬프트 빌더
// ---------------------------------------------------------------------------

export function buildCategoryPrompt(
  category: string,
  analysis: PassageAnalysisData,
  passageContent: string,
  counts: Record<string, number>,
): string {
  const countInstructions = Object.entries(counts)
    .map(([type, n]) => `- ${type}: ${n}개`)
    .join("\n");

  const base = `당신은 듀오링고 스타일 영어 학습 드릴 문제 생성 전문가입니다.
아래 지문과 분석 데이터를 기반으로 **빠르고 인터랙티브한** 학습 문제를 생성하세요.

## 핵심 원칙
- 문제당 풀이 시간: 5~15초 (시험 문제가 아닌 드릴 문제)
- 같은 내용을 다양한 각도에서 반복 노출하는 것이 목적
- 분석 데이터에 있는 단어/문법/문장을 **반드시** 활용
- 오답(distractor)은 그럴듯하지만 명확히 틀려야 함
- 해설(explanation)은 한국어로 간결하게 (1~2문장)
${CONTEXT_RULES}

## 지문 (참고용 — 문제에 전체 삽입 금지)
${passageContent}

## 생성할 문제 수
${countInstructions}
`;

  switch (category) {
    case "VOCAB": return base + buildVocabSection(analysis);
    case "INTERPRETATION": return base + buildInterpretationSection(analysis);
    case "GRAMMAR": return base + buildGrammarSection(analysis);
    case "COMPREHENSION": return base + buildComprehensionSection(analysis);
    case "ALL": return base + buildVocabSection(analysis) + buildInterpretationSection(analysis) + buildGrammarSection(analysis) + buildComprehensionSection(analysis);
    default: return base;
  }
}

// ---------------------------------------------------------------------------
// VOCAB 섹션 — vocabulary[] 전체 필드 활용
// ---------------------------------------------------------------------------

function buildVocabSection(a: PassageAnalysisData): string {
  const vocabData = a.vocabulary?.map((v) => ({
    word: v.word, meaning: v.meaning, partOfSpeech: v.partOfSpeech,
    sentenceIndex: v.sentenceIndex, difficulty: v.difficulty,
    synonyms: v.synonyms, antonyms: v.antonyms,
    englishDefinition: v.englishDefinition,
    collocations: v.collocations, confusableWords: v.confusableWords,
    contextMeaning: v.contextMeaning,
  }));

  return `
## 분석 데이터 — 핵심 어휘 (전체 필드)
${JSON.stringify(vocabData, null, 2)}

## 문장 번역 (문맥 문장 참조용)
${JSON.stringify(a.sentences, null, 2)}

## 유형별 생성 규칙

### WORD_MEANING (영→한 4지선다)
- vocabulary의 각 단어에 대해 문제 생성
- contextSentence: sentences[sentenceIndex].english **원문 그대로 복사** (해당 문장 1개만)
- options: 정답 = vocabulary[].meaning, 오답 3개는 비슷한 품사의 다른 뜻
- label: "A","B","C","D"

### WORD_MEANING_REVERSE (한→영 4지선다)
- koreanMeaning = vocabulary[].meaning → 영어 단어 고르기
- contextSentence: sentences[sentenceIndex].english **원문 그대로 복사** (해당 문장 1개만)
- 오답 3개는 비슷한 스펠링/카테고리의 단어
- label: "A","B","C","D"

### WORD_FILL (문장 빈칸 3지선다)
- sentence: sentences[sentenceIndex].english에서 해당 단어만 _____로 교체 — **나머지 원문 그대로**
- sentence: 빈칸이 포함된 문장 1개만
- options: 정답 + 비슷하지만 문맥에 안 맞는 단어 2개
- label: "A","B","C"

### WORD_MATCH (5쌍 매칭)
- vocabulary에서 5개씩 묶어서 영어-한국어 쌍 생성
- 어휘가 5개 미만이면 지문에서 추가 단어 보충

### WORD_SPELL (철자 입력)
- koreanMeaning: vocabulary[].meaning
- hint: 단어의 첫 1~2글자 (예: "el" for "elaborate")
- correctAnswer: vocabulary[].word

### VOCAB_SYNONYM (유의어/반의어 3지선다)
- vocabulary[].synonyms와 vocabulary[].antonyms 필드를 **반드시** 활용
- synonyms가 있으면 targetRelation: "synonym", antonyms가 있으면 "antonym"
- contextSentence: sentences[sentenceIndex].english **원문 그대로 복사** (해당 문장 1개만)
- options: 정답(실제 유의어/반의어) + 혼동 오답 2개
- synonyms/antonyms가 없는 단어는 건너뛰기
- label: "A","B","C"

### VOCAB_DEFINITION (영영풀이 4지선다)
- vocabulary[].englishDefinition 필드를 **반드시** 활용
- englishDefinition을 보여주고 해당 단어를 고르는 문제
- contextSentence: sentences[sentenceIndex].english **원문 그대로 복사** (해당 문장 1개만)
- options: 정답 단어 + 다른 vocabulary 단어 3개
- englishDefinition이 없는 단어는 건너뛰기
- label: "A","B","C","D"

### VOCAB_COLLOCATION (연어 빈칸 3지선다)
- vocabulary[].collocations 필드를 **반드시** 활용
- 연어 표현을 문장에 넣고 핵심 부분을 빈칸 처리
- collocation: 전체 연어 (예: "make a decision")
- blankPart: 빈칸에 들어갈 부분 (예: "decision")
- sentence: **지문 원문 문장에서** 해당 연어의 핵심 부분만 _____로 교체 — 나머지 원문 그대로
- options: 정답 + 같은 동사와 어울리지만 문맥에 안 맞는 명사 2개
- collocations가 없는 단어는 건너뛰기
- label: "A","B","C"

### VOCAB_CONFUSABLE (혼동 단어 3지선다)
- vocabulary[].confusableWords 필드를 **반드시** 활용
- 원래 단어와 혼동 단어를 confusablePair로 제시
- sentence: **지문 원문 문장에서** 해당 단어만 _____로 교체 — 나머지 원문 그대로
- confusablePair: [정답 단어, 혼동 단어] (예: ["affect", "effect"])
- options: 정답 + 혼동 단어 + 추가 오답 1개
- confusableWords가 없는 단어는 건너뛰기
- label: "A","B","C"
`;
}

// ---------------------------------------------------------------------------
// INTERPRETATION 섹션 — sentences[] + syntaxAnalysis[] 활용
// ---------------------------------------------------------------------------

function buildInterpretationSection(a: PassageAnalysisData): string {
  const collocData = a.vocabulary?.map((v) => ({
    word: v.word, meaning: v.meaning, collocations: v.collocations,
  }));

  const chunkData = a.syntaxAnalysis?.map((s) => ({
    sentenceIndex: s.sentenceIndex, chunkReading: s.chunkReading,
    complexity: s.complexity,
  }));

  return `
## 분석 데이터 — 문장 번역
${JSON.stringify(a.sentences, null, 2)}

## 분석 데이터 — 핵심 어휘 (연어 참조용)
${JSON.stringify(collocData, null, 2)}

${a.examDesign ? `## 분석 데이터 — 출제 포인트\n${JSON.stringify(a.examDesign.paraphrasableSegments, null, 2)}` : ""}

${chunkData?.length ? `## 분석 데이터 — 끊어읽기 (구문 분석)\n${JSON.stringify(chunkData, null, 2)}` : ""}

## 유형별 생성 규칙

### SENTENCE_INTERPRET (영→한 해석 4지선다)
- englishSentence: sentences[].english **원문 그대로 복사** (1글자도 변경 금지)
- sentenceIndex: sentences[].index
- options: 정답 = sentences[].korean, 오답 3개는 미묘하게 다른 해석
- label: "A","B","C","D"

### SENTENCE_COMPLETE (한→영 4지선다)
- koreanSentence: sentences[].korean
- sentenceIndex: sentences[].index
- options: 정답 = sentences[].english, 오답 3개는 문법/어순이 다른 영문
- label: "A","B","C","D"

### WORD_ARRANGE (단어 배열)
- koreanSentence: sentences[].korean
- correctOrder: 영어 문장을 의미 단위(구/절)로 분리한 배열 (3~8 조각)
  - syntaxAnalysis[].chunkReading이 있으면 그 단위를 우선 참조
  - 너무 잘게 쪼개지 말 것 (단어 1개씩 X, 의미 단위로)
- distractorWords: 문장에 없지만 혼동될 수 있는 단어/구 1~3개

### KEY_EXPRESSION (핵심 표현 빈칸 3지선다)
- sentence: **지문 원문 문장에서** 핵심 표현만 _____로 교체 — 나머지 원문 그대로
- collocations, paraphrasableSegments 활용
- options: 정답 + 유사하지만 문맥에 안 맞는 표현 2개
- label: "A","B","C"

### SENT_CHUNK_ORDER (끊어읽기 순서 배열)
- syntaxAnalysis[].chunkReading 필드를 **반드시** 활용
- chunkReading을 "/" 기준으로 분리하여 chunks 배열 생성
- chunks 배열을 섞어서 제시 (correctOrder는 원래 순서의 인덱스)
- koreanHint: 해당 문장의 한국어 해석
- syntaxAnalysis가 없으면 이 유형은 빈 배열 반환
`;
}

// ---------------------------------------------------------------------------
// GRAMMAR 섹션 — grammarPoints[] 전체 필드 + structureTransformPoints 활용
// ---------------------------------------------------------------------------

function buildGrammarSection(a: PassageAnalysisData): string {
  const grammarData = a.grammarPoints?.map((g) => ({
    id: g.id, pattern: g.pattern, explanation: g.explanation,
    textFragment: g.textFragment, sentenceIndex: g.sentenceIndex,
    commonMistake: g.commonMistake, transformations: g.transformations,
    relatedGrammar: g.relatedGrammar,
  }));

  const transformPoints = a.examDesign?.structureTransformPoints;

  return `
## 분석 데이터 — 문법 포인트 (전체 필드)
${JSON.stringify(grammarData, null, 2)}

## 분석 데이터 — 문장 원문
${JSON.stringify(a.sentences, null, 2)}

${a.syntaxAnalysis ? `## 분석 데이터 — 구문 분석\n${JSON.stringify(a.syntaxAnalysis, null, 2)}` : ""}

${transformPoints?.length ? `## 분석 데이터 — 구조 변환 포인트\n${JSON.stringify(transformPoints, null, 2)}` : ""}

## 유형별 생성 규칙

### GRAMMAR_SELECT (문법 형태 3지선다)
- grammarPoints의 각 포인트에 대해 문제 생성
- sentence: sentences[sentenceIndex].english에서 문법 부분만 _____로 교체 — **나머지 원문 그대로**
- grammarPoint: 문법 포인트 이름 (pattern)
- options: 정답 + 문법적으로 틀린 형태 2개
  - **relatedGrammar 필드가 있으면 혼동 문법을 오답에 활용**
- label: "A","B","C"

### ERROR_FIND (오류 찾기 탭)
- grammarPoints의 **commonMistake를 활용하여 의도적 오류 삽입**
- sentence: 문법 오류가 1개 포함된 문장 (1개만)
- words: 문장을 단어별로 분리한 배열
- errorWord: 오류가 있는 단어
- correction: 올바른 형태
- grammarPoint: 관련 문법 포인트

### ERROR_CORRECT (오류 수정 입력)
- sentence: 오류가 포함된 문장 1개 (오류 부분에 밑줄 표시)
- errorPart: 밑줄 친 오류 부분
- correctAnswer: 올바른 형태 (학생이 타이핑)
- grammarPoint: 관련 문법 포인트

### GRAM_TRANSFORM (문장 전환)
- grammarPoints[].transformations와 structureTransformPoints를 **반드시** 활용
- originalSentence: sentences[sentenceIndex].english **원문 그대로 복사**
- instruction: 전환 지시 (예: "수동태로 바꾸시오", "분사구문으로 전환하시오")
  - transformations 필드의 변환 방향 참조 (능동↔수동, 분사구문 전환 등)
  - structureTransformPoints[].transformType 참조
- correctAnswer: 전환된 문장
- grammarPoint: 관련 문법 포인트
- transformations가 없으면 이 유형은 빈 배열 반환

### GRAM_BINARY (문법 O/X)
- grammarPoints를 기반으로 문법적으로 맞거나 틀린 문장 생성
- sentence: **지문 원문 문장 그대로** (isCorrect=true) 또는 commonMistake 기반 오류 삽입 (isCorrect=false)
- isCorrect: true(문법 정확) / false(문법 오류 포함)
  - 맞는 문장과 틀린 문장 비율을 대략 반반으로
  - 틀린 문장은 commonMistake를 활용하여 자연스러운 오류 삽입
- errorExplanation: 틀린 경우 오류 설명, 맞는 경우 빈 문자열 ""
- grammarPoint: 관련 문법 포인트
`;
}

// ---------------------------------------------------------------------------
// COMPREHENSION 섹션 — structure 전체 + connectorAnalysis + logicFlow 활용
// ---------------------------------------------------------------------------

function buildComprehensionSection(a: PassageAnalysisData): string {
  const connectors = a.structure?.connectorAnalysis;
  const logicFlow = a.structure?.logicFlow;
  const blankPositions = a.structure?.blankSuitablePositions;

  return `
## 분석 데이터 — 구조/내용 분석
${JSON.stringify(a.structure, null, 2)}

## 분석 데이터 — 문장 번역
${JSON.stringify(a.sentences, null, 2)}

${a.examDesign ? `## 분석 데이터 — 출제 포인트\n${JSON.stringify(a.examDesign.paraphrasableSegments?.slice(0, 3), null, 2)}` : ""}

${logicFlow?.length ? `## 분석 데이터 — 논리 흐름\n${JSON.stringify(logicFlow, null, 2)}` : ""}

${connectors?.length ? `## 분석 데이터 — 연결어 분석\n${JSON.stringify(connectors, null, 2)}` : ""}

${blankPositions?.length ? `## 분석 데이터 — 빈칸 적합 위치\n${JSON.stringify(blankPositions, null, 2)}` : ""}

## 유형별 생성 규칙

### TRUE_FALSE (O/X 판단)
- structure.keyPoints와 sentences를 기반으로 진술문 생성
- statement: 한국어 진술문 (지문 내용과 일치 또는 불일치)
- contextExcerpt: 진술문과 관련된 **지문 원문 1~2문장 그대로 복사 (영어)** — 필수
- isTrue: true/false
- 참/거짓 비율을 대략 반반으로
- 너무 명백하지 않게, 미묘한 차이를 두어 주의 깊게 읽게 유도

### CONTENT_QUESTION (내용 이해 4지선다)
- structure.keyPoints와 **logicFlow를 반드시 활용**
- question: 한국어 질문 (예: "저자가 주장하는 핵심 근거는?")
- contextExcerpt: 질문과 관련된 **지문 원문 1~2문장 그대로 복사**
- options: 한국어 답변 4개 (label "A"~"D")
- logicFlow의 역할(주장/근거/예시/반론/결론)에서 다양한 측면으로 출제

### PASSAGE_FILL (지문 빈칸 3지선다)
- paraphrasableSegments와 **blankSuitablePositions를 반드시 활용**
- excerpt: **지문 원문 1~2문장에서** 핵심 구문만 _____로 교체 — 나머지 원문 그대로
- blankPhrase: 빈칸에 들어갈 원래 표현
- options: 정답 + 유사 표현 2개
- label: "A","B","C"

### CONNECTOR_FILL (연결어 빈칸 3지선다)
- structure.connectorAnalysis를 **반드시** 활용
- sentenceBefore: 연결어 앞 **지문 원문 문장 그대로 복사**
- sentenceAfter: 연결어 뒤 **지문 원문 문장 그대로 복사**
- options: 정답 연결어 + 다른 역할의 연결어 2개
  - connectorAnalysis[].role(역접/인과/부연/대조 등)이 다른 연결어를 오답으로
- connectorAnalysis가 없으면 이 유형은 빈 배열 반환
- label: "A","B","C"
`;
}
