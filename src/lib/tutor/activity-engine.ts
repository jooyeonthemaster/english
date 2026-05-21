import type { TutorActivity } from "@prisma/client";

type GradeResult = {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
};

type JsonRecord = Record<string, unknown>;

const MULTIPLE_CHOICE_TYPES = new Set([
  "vocab_choice",
  "gist_select",
  "paraphrase_mc",
  "contextual_meaning",
  "collocation_select",
  "grammar_binary",
  "insertion_point",
  "irrelevant_sentence",
  "mastery_test",
]);

const TEXT_ANSWER_TYPES = new Set([
  "sentence_translate",
  "progressive_cloze",
  "first_letter_recall",
  "sentence_rebuild",
  "chunk_rebuild",
  "vocab_spell",
  "grammar_find",
  "grammar_correct",
  "structure_transform",
]);

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[“”‘’"'`.,!?;:()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

function answerText(responseRecord: JsonRecord, response: unknown) {
  return String(responseRecord.answer ?? responseRecord.text ?? responseRecord.value ?? response ?? "");
}

function explanation(payload: JsonRecord, fallback: string) {
  return String(payload.explanation ?? payload.reason ?? fallback);
}

function optionLabel(value: unknown) {
  const record = asRecord(value);
  return String(record.text ?? record.label ?? record.value ?? value ?? "").trim();
}

function appendAnswerHint(base: string, answerHint: string, isCorrect: boolean) {
  const trimmedHint = answerHint.trim();
  if (isCorrect || !trimmedHint) return base;
  if (base.includes(trimmedHint)) return base;
  return `${base} 정답: ${trimmedHint}`;
}

function expectedTexts(payload: JsonRecord) {
  const values = [
    payload.answerText,
    payload.answer,
    payload.correctText,
    payload.modelAnswer,
    payload.expected,
    ...(Array.isArray(payload.answers) ? payload.answers : []),
    ...(Array.isArray(payload.acceptedAnswers) ? payload.acceptedAnswers : []),
  ];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function textOverlapRatio(submitted: string, expected: string) {
  const submittedTokens = normalize(submitted).split(/\s+/).filter((token) => token.length > 1);
  const expectedTokens = normalize(expected).split(/\s+/).filter((token) => token.length > 1);
  if (submittedTokens.length === 0 || expectedTokens.length === 0) return 0;
  const expectedSet = new Set(expectedTokens);
  const hitCount = submittedTokens.filter((token) => expectedSet.has(token)).length;
  return hitCount / Math.max(expectedTokens.length, submittedTokens.length);
}

function isTextCorrect(submittedRaw: string, expectedRaw: string) {
  const submitted = normalize(submittedRaw);
  const expected = normalize(expectedRaw);
  if (!submitted || !expected) return false;
  if (submitted === expected) return true;
  const minMeaningfulLength = Math.min(8, Math.max(4, Math.floor(expected.length * 0.35)));
  if (submitted.length >= minMeaningfulLength && (expected.includes(submitted) || submitted.includes(expected))) {
    return true;
  }
  return textOverlapRatio(submitted, expected) >= 0.55;
}

function gradeMultipleChoice(payload: JsonRecord, responseRecord: JsonRecord, response: unknown, scoreMax: number): GradeResult {
  const selected = Number(responseRecord.selectedIndex ?? responseRecord.index ?? response);
  const expected = Number(payload.correctIndex ?? payload.answerIndex ?? payload.correctOptionIndex);
  const isCorrect = Number.isFinite(selected) && Number.isFinite(expected) && selected === expected;
  const options = Array.isArray(payload.options) ? payload.options : [];
  const answerHint = Number.isFinite(expected) ? optionLabel(options[expected]) : "";
  return {
    isCorrect,
    scoreEarned: isCorrect ? scoreMax : 0,
    scoreMax,
    explanation: appendAnswerHint(
      explanation(payload, "선택한 답과 지문 근거를 다시 연결해 보세요."),
      answerHint,
      isCorrect,
    ),
  };
}

function gradeTextAnswer(
  activity: TutorActivity,
  payload: JsonRecord,
  responseRecord: JsonRecord,
  response: unknown,
  scoreMax: number,
): GradeResult {
  const submitted = answerText(responseRecord, response);
  const expected = expectedTexts(payload);
  const isCorrect = expected.some((item) => isTextCorrect(submitted, item));
  const fallback =
    activity.type === "sentence_translate"
      ? "핵심 의미가 빠졌다면 문장의 주어, 동사, 연결어를 먼저 표시해 보세요."
      : "원문 표현과 어순을 다시 확인해 보세요.";
  return {
    isCorrect,
    scoreEarned: isCorrect ? scoreMax : 0,
    scoreMax,
    explanation: appendAnswerHint(explanation(payload, fallback), expected[0] ?? "", isCorrect),
  };
}

function gradeSentenceOrder(payload: JsonRecord, responseRecord: JsonRecord, response: unknown, scoreMax: number): GradeResult {
  const submitted = Array.isArray(responseRecord.order) ? responseRecord.order : response;
  const expected = Array.isArray(payload.correctOrder) ? payload.correctOrder : [];
  const isCorrect =
    Array.isArray(submitted) &&
    submitted.length === expected.length &&
    submitted.every((item, index) => Number(item) === Number(expected[index]));
  const shuffled = Array.isArray(payload.shuffled) ? payload.shuffled : [];
  const answerHint = expected
    .map((expectedIndex) => {
      const matched = shuffled.find((item, index) => Number(asRecord(item).index ?? index) === Number(expectedIndex));
      return optionLabel(matched ?? shuffled[Number(expectedIndex)]);
    })
    .filter(Boolean)
    .join(" → ");
  return {
    isCorrect,
    scoreEarned: isCorrect ? scoreMax : 0,
    scoreMax,
    explanation: appendAnswerHint(
      explanation(payload, "연결어, 지시어, 예시와 결론의 위치를 기준으로 순서를 다시 확인하세요."),
      answerHint,
      isCorrect,
    ),
  };
}

function readCorrectPairs(payload: JsonRecord) {
  const explicit = asRecord(payload.correctPairs);
  if (Object.keys(explicit).length > 0) return explicit;
  if (!Array.isArray(payload.pairs)) return {};
  return Object.fromEntries(
    payload.pairs
      .map((item) => asRecord(item))
      .map((item) => [String(item.left ?? item.word ?? ""), String(item.right ?? item.meaning ?? "")])
      .filter(([left, right]) => left && right),
  );
}

function gradeMatching(payload: JsonRecord, responseRecord: JsonRecord, scoreMax: number): GradeResult {
  const correctPairs = readCorrectPairs(payload);
  const submittedPairs = asRecord(responseRecord.matches ?? responseRecord.pairs);
  const entries = Object.entries(correctPairs);
  if (entries.length === 0) {
    return {
      isCorrect: false,
      scoreEarned: 0,
      scoreMax,
      explanation: explanation(payload, "매칭 정답 기준을 확인할 수 없습니다."),
    };
  }
  const correctCount = entries.filter(([left, right]) => normalize(submittedPairs[left]) === normalize(right)).length;
  const scoreEarned = Math.round((correctCount / entries.length) * scoreMax);
  return {
    isCorrect: correctCount === entries.length,
    scoreEarned,
    scoreMax,
    explanation: explanation(payload, `총 ${entries.length}개 중 ${correctCount}개를 정확히 연결했습니다.`),
  };
}

export function gradeTutorActivity(activity: TutorActivity, response: unknown): GradeResult {
  const payload = asRecord(activity.payload);
  const responseRecord = asRecord(response);
  const scoreMax = Math.max(1, activity.maxScore);

  if (MULTIPLE_CHOICE_TYPES.has(activity.type) && payload.correctIndex !== undefined) {
    return gradeMultipleChoice(payload, responseRecord, response, scoreMax);
  }

  if (activity.type === "sentence_order") {
    return gradeSentenceOrder(payload, responseRecord, response, scoreMax);
  }

  if (activity.type === "vocab_match") {
    return gradeMatching(payload, responseRecord, scoreMax);
  }

  if (TEXT_ANSWER_TYPES.has(activity.type) || expectedTexts(payload).length > 0) {
    return gradeTextAnswer(activity, payload, responseRecord, response, scoreMax);
  }

  return {
    isCorrect: false,
    scoreEarned: 0,
    scoreMax,
    explanation: "이 활동은 자동 채점 기준이 부족합니다. 선생님 화면에서 활동 데이터를 확인해야 합니다.",
  };
}
