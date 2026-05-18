interface BuildAnalysisPromptArgs {
  passageContent: string;
  schoolType: "MIDDLE" | "HIGH" | null;
  grade: number | null;
  customPrompt?: string;
}

/**
 * Compose the 5-layer analysis prompt sent to Gemini. Pulled out of the route
 * handler so the long Korean instruction block does not bloat the orchestrator
 * file — the JSON shape and Korean wording is what changes most often when we
 * tune analysis behaviour, so keeping it isolated makes targeted edits easier.
 */
export function buildFullAnalysisPrompt({
  passageContent,
  schoolType,
  grade,
  customPrompt,
}: BuildAnalysisPromptArgs): string {
  const schoolLabel = schoolType === "MIDDLE" ? "중학교" : "고등학교";
  const gradeLabel = grade ? `${schoolLabel} ${grade}학년` : schoolLabel;
  const teacherNote = customPrompt
    ? `\n\n## 선생님 지시사항 (최우선 반영)\n${customPrompt}`
    : "";

  return `당신은 한국 중고등학교 영어 내신 시험 대비 전문 분석가입니다.
아래 지문을 내신 시험 출제 관점에서 분석하고, 결과를 **JSON만** 출력하세요.
JSON 외에 다른 텍스트는 절대 출력하지 마세요.

대상: ${gradeLabel}
${teacherNote}

## 지문
${passageContent}

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
- JSON만 출력, 다른 텍스트 없이`;
}
