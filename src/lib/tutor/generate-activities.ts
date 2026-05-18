import { generateText, Output } from "ai";
import type { PassageAnalysisData, SentenceAnalysis, VocabItem } from "@/types/passage-analysis";
import { getTutorModel, getTutorModelNameForAudit } from "@/lib/tutor/ai";
import { TutorDraftResponseSchema, type TutorActivityDraft } from "@/lib/tutor/schemas";

export const PLAYER_SUPPORTED_ACTIVITY_TYPES = new Set([
  "sentence_translate",
  "gist_select",
  "paraphrase_mc",
  "first_letter_recall",
  "progressive_cloze",
  "sentence_rebuild",
  "chunk_rebuild",
  "sentence_order",
  "insertion_point",
  "irrelevant_sentence",
  "vocab_choice",
  "vocab_spell",
  "vocab_match",
  "contextual_meaning",
  "collocation_select",
  "grammar_binary",
  "grammar_find",
  "grammar_correct",
  "structure_transform",
  "mastery_test",
]);

const COVERAGE_DIMENSIONS = ["interpret", "memorize", "order", "vocab", "grammar", "transfer"] as const;

function sentenceCoverage(
  sentenceIndex: number,
  dimension: TutorActivityDraft["coverageRefs"][number]["dimension"],
  weight = 0.85,
) {
  return [{ sentenceIndex, dimension, weight }];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function rotate<T>(items: T[]) {
  if (items.length <= 1) return items;
  const pivot = Math.max(1, Math.floor(items.length / 2));
  return [...items.slice(pivot), ...items.slice(0, pivot)];
}

function shuffleWithCorrectIndex(correct: string, distractors: string[], fallback: string[]) {
  const options = unique([correct, ...distractors, ...fallback]).slice(0, 4);
  while (options.length < 4) options.push(`오답 선택지 ${options.length}`);
  const rotated = rotate(options);
  return {
    options: rotated,
    correctIndex: Math.max(0, rotated.findIndex((entry) => entry === correct)),
  };
}

function splitWords(text: string) {
  return text.match(/\S+/g) ?? [];
}

function cleanWord(text: string) {
  return text.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

function makeFirstLetterPrompt(sentence: string) {
  return splitWords(sentence)
    .map((word) => {
      const cleaned = cleanWord(word);
      if (cleaned.length <= 2) return word;
      return word.replace(cleaned, `${cleaned[0]}${"_".repeat(Math.min(cleaned.length - 1, 8))}`);
    })
    .join(" ");
}

function makeChunks(sentence: string) {
  const words = splitWords(sentence);
  const chunkSize = words.length > 14 ? 3 : 2;
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize).join(" "));
  }
  return chunks.length > 1 ? chunks : words;
}

function pickLongWord(sentence: string) {
  const words = splitWords(sentence).map(cleanWord).filter(Boolean);
  return words.find((word) => word.length >= 6) ?? words[Math.max(0, Math.floor(words.length / 2))] ?? "";
}

function sentenceLabel(sentence: SentenceAnalysis) {
  return `문장 ${sentence.index + 1}`;
}

function makeGistDraft(analysis: PassageAnalysisData, sentences: SentenceAnalysis[]): TutorActivityDraft | null {
  const mainIdea = analysis.structure?.mainIdea || analysis.structure?.keyPoints?.[0] || sentences[0]?.korean;
  if (!mainIdea || sentences.length === 0) return null;
  const distractors = [
    ...(analysis.structure?.keyPoints ?? []).filter((point) => point !== mainIdea),
    "지문의 일부 예시만을 지나치게 일반화한 설명",
    "글의 주장과 반대로 정리한 설명",
    "세부 소재를 주제로 착각한 설명",
  ];
  const shuffled = shuffleWithCorrectIndex(mainIdea, distractors, [
    "글쓴이의 목적과 무관한 배경 설명",
    "단어 뜻만 나열한 설명",
  ]);
  return {
    mode: "interpret",
    type: "gist_select",
    title: "지문 핵심 주제 고르기",
    instructions: "전체 지문의 중심 생각과 가장 가까운 설명을 고르세요.",
    payload: {
      prompt: "이 지문의 핵심 주제로 가장 적절한 것은?",
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: analysis.structure?.purpose || "첫 문장과 결론 문장을 연결해 중심 흐름을 확인하세요.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 60,
    coverageRefs: sentences.slice(0, 6).map((sentence) => ({
      sentenceIndex: sentence.index,
      dimension: "interpret",
      weight: 0.25,
    })),
  };
}

function makeSentenceTranslateDraft(sentence: SentenceAnalysis): TutorActivityDraft {
  return {
    mode: "interpret",
    type: "sentence_translate",
    title: `${sentenceLabel(sentence)} 직독직해`,
    instructions: "영어 문장을 읽고 핵심 의미가 드러나도록 한국어로 적어보세요.",
    payload: {
      prompt: sentence.english,
      sentenceIndex: sentence.index,
      answerText: sentence.korean,
      explanation: `${sentenceLabel(sentence)}은 직역보다 핵심 관계를 놓치지 않는 해석이 중요합니다.`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 75,
    coverageRefs: sentenceCoverage(sentence.index, "interpret"),
  };
}

function makeFirstLetterDraft(sentence: SentenceAnalysis): TutorActivityDraft {
  return {
    mode: "memorize",
    type: "first_letter_recall",
    title: `${sentenceLabel(sentence)} 첫 글자 암기`,
    instructions: "첫 글자 힌트를 보고 원문 문장을 최대한 정확히 복원하세요.",
    payload: {
      prompt: makeFirstLetterPrompt(sentence.english),
      koreanHint: sentence.korean,
      sentenceIndex: sentence.index,
      answers: [sentence.english],
      explanation: "첫 글자 암기는 통문장 암기와 서술형 대비를 동시에 잡는 훈련입니다.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 90,
    coverageRefs: sentenceCoverage(sentence.index, "memorize"),
  };
}

function makeClozeDraft(sentence: SentenceAnalysis): TutorActivityDraft | null {
  const target = pickLongWord(sentence.english);
  if (!target) return null;
  return {
    mode: "memorize",
    type: "progressive_cloze",
    title: `${sentenceLabel(sentence)} 핵심어 빈칸`,
    instructions: "문맥상 빈칸에 들어갈 원문 표현을 입력하세요.",
    payload: {
      prompt: sentence.english.replace(target, "_____"),
      koreanHint: sentence.korean,
      sentenceIndex: sentence.index,
      answers: [target],
      explanation: `빈칸 앞뒤의 수식 관계를 보면 ${target}의 역할이 드러납니다.`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 55,
    coverageRefs: sentenceCoverage(sentence.index, "memorize", 0.75),
  };
}

function makeSentenceRebuildDraft(sentence: SentenceAnalysis): TutorActivityDraft {
  const chunks = makeChunks(sentence.english);
  return {
    mode: "memorize",
    type: "sentence_rebuild",
    title: `${sentenceLabel(sentence)} 어순 조립`,
    instructions: "아래 조각을 눌러 원문 어순대로 문장을 완성하세요.",
    payload: {
      chunks: rotate(chunks),
      koreanHint: sentence.korean,
      sentenceIndex: sentence.index,
      answerText: sentence.english,
      explanation: "영어는 의미 단위가 쌓이는 순서가 곧 논리입니다. 원문 어순을 소리 내어 확인하세요.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 90,
    coverageRefs: sentenceCoverage(sentence.index, "memorize", 0.8),
  };
}

function makeSentenceOrderDraft(sentences: SentenceAnalysis[]): TutorActivityDraft | null {
  if (sentences.length < 3) return null;
  const targetSentences = sentences.slice(0, Math.min(6, sentences.length));
  return {
    mode: "order",
    type: "sentence_order",
    title: "문장 흐름 배열",
    instructions: "문장들의 논리 흐름이 자연스럽도록 순서를 맞추세요.",
    payload: {
      shuffled: rotate([...targetSentences].reverse()).map((sentence) => ({
        index: sentence.index,
        text: sentence.english,
      })),
      correctOrder: targetSentences.map((sentence) => sentence.index),
      explanation: "도입, 문제 제기, 예시, 해결, 결론으로 이어지는 흐름 단서를 확인하세요.",
    },
    itemCount: targetSentences.length,
    maxScore: 18,
    estimatedSec: 120,
    coverageRefs: targetSentences.map((sentence) => ({
      sentenceIndex: sentence.index,
      dimension: "order",
      weight: 0.75,
    })),
  };
}

function makeInsertionDraft(sentences: SentenceAnalysis[]): TutorActivityDraft | null {
  if (sentences.length < 4) return null;
  const targetPosition = Math.min(2, sentences.length - 2);
  const target = sentences[targetPosition];
  const remaining = sentences.filter((_, index) => index !== targetPosition);
  const options = Array.from({ length: remaining.length + 1 }).map((_, index) => ({
    label: `${index + 1}번 위치`,
    before: index === 0 ? "글의 맨 앞" : remaining[index - 1].english,
    after: index === remaining.length ? "글의 맨 뒤" : remaining[index].english,
  }));
  return {
    mode: "order",
    type: "insertion_point",
    title: `${sentenceLabel(target)} 삽입 위치`,
    instructions: "제시문이 들어갈 위치를 앞뒤 문맥 단서로 판단하세요.",
    payload: {
      targetSentence: target.english,
      options,
      correctIndex: targetPosition,
      explanation: "제시문 앞에는 배경 또는 원인이, 뒤에는 그 결과나 부연이 이어지는지 확인하세요.",
    },
    itemCount: 1,
    maxScore: 14,
    estimatedSec: 100,
    coverageRefs: sentences.slice(0, 6).map((sentence) => ({
      sentenceIndex: sentence.index,
      dimension: "order",
      weight: sentence.index === target.index ? 0.7 : 0.25,
    })),
  };
}

function makeVocabChoiceDraft(item: VocabItem, analysis: PassageAnalysisData): TutorActivityDraft {
  const distractors = analysis.vocabulary
    .filter((candidate) => candidate.word !== item.word)
    .map((candidate) => candidate.meaning);
  const shuffled = shuffleWithCorrectIndex(item.meaning, distractors, [
    "문맥과 반대되는 의미",
    "품사는 비슷하지만 뜻이 다른 표현",
    "본문과 무관한 일반적 의미",
  ]);
  return {
    mode: "vocab",
    type: "vocab_choice",
    title: `${item.word} 문맥 뜻`,
    instructions: "지문 속 쓰임에 가장 가까운 한국어 뜻을 고르세요.",
    payload: {
      stem: item.word,
      sentenceIndex: item.sentenceIndex,
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: item.contextMeaning || item.meaning,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 45,
    coverageRefs: sentenceCoverage(item.sentenceIndex, "vocab"),
  };
}

function makeVocabSpellDraft(item: VocabItem): TutorActivityDraft {
  return {
    mode: "vocab",
    type: "vocab_spell",
    title: `${item.meaning} 철자 쓰기`,
    instructions: "뜻과 첫 글자 힌트를 보고 지문 속 영어 단어를 입력하세요.",
    payload: {
      meaning: item.meaning,
      firstLetter: item.word[0],
      length: item.word.length,
      sentenceIndex: item.sentenceIndex,
      answerText: item.word,
      explanation: `${item.word}: ${item.contextMeaning || item.meaning}`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 45,
    coverageRefs: sentenceCoverage(item.sentenceIndex, "vocab", 0.75),
  };
}

function makeVocabMatchDraft(items: VocabItem[]): TutorActivityDraft | null {
  const targetItems = items.slice(0, 5);
  if (targetItems.length < 2) return null;
  return {
    mode: "vocab",
    type: "vocab_match",
    title: "핵심 어휘 매칭",
    instructions: "영단어마다 지문 속 한국어 뜻을 연결하세요.",
    payload: {
      leftItems: targetItems.map((item) => item.word),
      rightItems: rotate(targetItems.map((item) => item.meaning)),
      correctPairs: Object.fromEntries(targetItems.map((item) => [item.word, item.meaning])),
      explanation: "단어 뜻을 외울 때는 본문 문장의 쓰임까지 같이 묶어야 오래 남습니다.",
    },
    itemCount: targetItems.length,
    maxScore: targetItems.length * 5,
    estimatedSec: 100,
    coverageRefs: targetItems.map((item) => ({
      sentenceIndex: item.sentenceIndex,
      dimension: "vocab",
      weight: 0.5,
    })),
  };
}

function makeContextMeaningDraft(item: VocabItem, analysis: PassageAnalysisData): TutorActivityDraft | null {
  if (!item.contextMeaning && !item.englishDefinition) return null;
  const correct = item.contextMeaning || item.meaning;
  const distractors = analysis.vocabulary
    .filter((candidate) => candidate.word !== item.word)
    .map((candidate) => candidate.contextMeaning || candidate.meaning);
  const shuffled = shuffleWithCorrectIndex(correct, distractors, [
    "사전의 대표뜻이지만 이 문맥과 어긋나는 의미",
    "뒤 문장과 연결되지 않는 의미",
  ]);
  return {
    mode: "vocab",
    type: "contextual_meaning",
    title: `${item.word} 문맥 추론`,
    instructions: "사전 뜻이 아니라 이 문장에서 실제로 작동하는 의미를 고르세요.",
    payload: {
      stem: item.word,
      sentenceIndex: item.sentenceIndex,
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: correct,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 55,
    coverageRefs: sentenceCoverage(item.sentenceIndex, "vocab", 0.8),
  };
}

function makeCollocationDraft(item: VocabItem): TutorActivityDraft | null {
  const collocations = item.collocations ?? [];
  if (collocations.length === 0) return null;
  const correct = collocations[0];
  const shuffled = shuffleWithCorrectIndex(correct, collocations.slice(1), [
    `${item.word} with a wrong preposition`,
    `make ${item.word}`,
    `do ${item.word}`,
  ]);
  return {
    mode: "vocab",
    type: "collocation_select",
    title: `${item.word} 연어 선택`,
    instructions: "본문 어휘와 함께 외워야 할 자연스러운 표현을 고르세요.",
    payload: {
      stem: item.word,
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: `${item.word}는 단어 하나보다 함께 쓰이는 표현까지 묶어 외워야 합니다.`,
    },
    itemCount: 1,
    maxScore: 8,
    estimatedSec: 45,
    coverageRefs: sentenceCoverage(item.sentenceIndex, "vocab", 0.55),
  };
}

function makeGrammarDrafts(analysis: PassageAnalysisData): TutorActivityDraft[] {
  return analysis.grammarPoints.slice(0, 3).flatMap((point) => {
    const sentenceIndex = point.sentenceIndex;
    const binary: TutorActivityDraft = {
      mode: "grammar",
      type: "grammar_binary",
      title: `${point.pattern} 판단`,
      instructions: "아래 설명이 지문 속 어법 포인트와 맞는지 판단하세요.",
      payload: {
        statement: `"${point.textFragment}"에서 핵심 출제 포인트는 ${point.pattern}입니다.`,
        options: ["맞다", "아니다"],
        correctIndex: 0,
        explanation: point.explanation,
      },
      itemCount: 1,
      maxScore: 10,
      estimatedSec: 50,
      coverageRefs: sentenceCoverage(sentenceIndex, "grammar"),
    };
    const find: TutorActivityDraft = {
      mode: "grammar",
      type: "grammar_find",
      title: `${point.pattern} 원문 찾기`,
      instructions: "설명에 해당하는 원문 표현을 그대로 입력하세요.",
      payload: {
        prompt: point.explanation,
        sentenceIndex,
        answerText: point.textFragment,
        explanation: point.commonMistake || point.explanation,
      },
      itemCount: 1,
      maxScore: 12,
      estimatedSec: 70,
      coverageRefs: sentenceCoverage(sentenceIndex, "grammar", 0.85),
    };
    return [binary, find];
  });
}

function makeTransferDraft(analysis: PassageAnalysisData): TutorActivityDraft | null {
  const point = analysis.examDesign?.structureTransformPoints?.[0];
  if (!point) return null;
  return {
    mode: "transfer",
    type: "structure_transform",
    title: "구문 전환 서술형",
    instructions: "조건에 맞게 핵심 구문을 바꾸어 쓰세요.",
    payload: {
      prompt: point.questionExample || `${point.transformType} 방식으로 바꾸어 쓰세요: ${point.original}`,
      source: point.original,
      transformType: point.transformType,
      answerText: point.example,
      explanation: point.reason || "전환 후에도 원문의 의미 관계가 유지되어야 합니다.",
    },
    itemCount: 1,
    maxScore: 14,
    estimatedSec: 100,
    coverageRefs: sentenceCoverage(point.sentenceIndex, "transfer"),
  };
}

export function buildRuleBasedTutorDrafts(analysis: PassageAnalysisData): TutorActivityDraft[] {
  const sentences = analysis.sentences.slice(0, 6);
  const vocab = analysis.vocabulary.slice(0, 8);
  const drafts: TutorActivityDraft[] = [];

  const gistDraft = makeGistDraft(analysis, sentences);
  if (gistDraft) drafts.push(gistDraft);

  for (const sentence of sentences.slice(0, 3)) {
    drafts.push(makeSentenceTranslateDraft(sentence));
  }

  for (const sentence of sentences.slice(0, 3)) {
    drafts.push(makeFirstLetterDraft(sentence));
    const cloze = makeClozeDraft(sentence);
    if (cloze) drafts.push(cloze);
  }

  for (const sentence of sentences.slice(0, 2)) {
    drafts.push(makeSentenceRebuildDraft(sentence));
  }

  const orderDraft = makeSentenceOrderDraft(sentences);
  if (orderDraft) drafts.push(orderDraft);
  const insertionDraft = makeInsertionDraft(sentences);
  if (insertionDraft) drafts.push(insertionDraft);

  for (const item of vocab.slice(0, 4)) {
    drafts.push(makeVocabChoiceDraft(item, analysis));
  }
  for (const item of vocab.slice(0, 3)) {
    drafts.push(makeVocabSpellDraft(item));
  }
  const vocabMatch = makeVocabMatchDraft(vocab);
  if (vocabMatch) drafts.push(vocabMatch);
  for (const item of vocab.slice(0, 2)) {
    const contextDraft = makeContextMeaningDraft(item, analysis);
    if (contextDraft) drafts.push(contextDraft);
    const collocationDraft = makeCollocationDraft(item);
    if (collocationDraft) drafts.push(collocationDraft);
  }

  drafts.push(...makeGrammarDrafts(analysis));
  const transferDraft = makeTransferDraft(analysis);
  if (transferDraft) drafts.push(transferDraft);

  return drafts.filter((draft) => draft.coverageRefs.every((ref) => COVERAGE_DIMENSIONS.includes(ref.dimension)));
}

export async function generateTutorDraftsWithModel(analysis: PassageAnalysisData) {
  const startedAt = Date.now();
  const result = await generateText({
    model: getTutorModel(),
    output: Output.object({ schema: TutorDraftResponseSchema }),
    system: [
      "You are a conservative Korean high-school English exam item writer for a mobile study product.",
      "Generate grounded, compact JSON only. Never invent words, sentences, facts, or answer keys outside the supplied analysis.",
      "Every item must be solvable by the supplied passage analysis alone.",
      "Distractors must be plausible but clearly wrong from the passage. Never make trick questions that depend on outside knowledge.",
      "Student-visible text must be concise Korean. Do not leak answers in titles, instructions, or prompts.",
      "Do not include model/provider names in any student-visible text.",
    ].join("\n"),
    prompt: JSON.stringify({
      task:
        "Generate 16-24 mobile-first activities that cover interpretation, memorization, sentence order, vocabulary, grammar, and transfer. Prefer short tasks a student can complete on a phone in under 2 minutes.",
      analysis,
      qualityBar: [
        "Reject your own item if the correct answer is ambiguous.",
        "Use exact source sentence indices in coverageRefs.",
        "For multiple choice, provide exactly 4 options unless the source task genuinely needs 5.",
        "For sentence rebuild/order/insertion, use only source sentence text or chunks from source sentence text.",
        "For vocabulary, the target word must be one of vocabWordsMustComeFrom.",
        "For grammar, the point must be tied to a supplied grammarPoints entry.",
        "Explanations should teach the clue, not merely repeat the answer.",
      ],
      constraints: {
        allowedActivityTypes: Array.from(PLAYER_SUPPORTED_ACTIVITY_TYPES),
        requiredCoverageDimensions: COVERAGE_DIMENSIONS,
        vocabWordsMustComeFrom: analysis.vocabulary.map((item) => item.word),
        sentenceIndicesMustComeFrom: analysis.sentences.map((item) => item.index),
        payloadRules: {
          multipleChoice: "Use options plus correctIndex.",
          textAnswer: "Use answerText or answers for accepted hidden answers.",
          matching: "Use leftItems, rightItems, and correctPairs.",
          rebuild: "Use chunks and answerText.",
          insertion: "Use targetSentence, options, and correctIndex.",
        },
      },
    }),
  });
  return {
    activities: result.output.activities,
    model: getTutorModelNameForAudit(),
    latencyMs: Date.now() - startedAt,
    usage: result.usage,
  };
}

function isUniqueStringArray(value: unknown, minLength: number, maxLength = 6) {
  if (!Array.isArray(value)) return false;
  const strings = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (strings.length < minLength || strings.length > maxLength) return false;
  return new Set(strings.map((item) => item.toLowerCase())).size === strings.length;
}

function hasValidChoicePayload(payload: Record<string, unknown>) {
  if (!isUniqueStringArray(payload.options, 4, 5)) return false;
  const options = payload.options as unknown[];
  const correctIndex = Number(payload.correctIndex ?? payload.answerIndex ?? payload.correctOptionIndex);
  return Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length;
}

function hasTextAnswerPayload(payload: Record<string, unknown>) {
  const answers = [
    payload.answerText,
    payload.answer,
    payload.correctText,
    payload.modelAnswer,
    payload.expected,
    ...(Array.isArray(payload.answers) ? payload.answers : []),
    ...(Array.isArray(payload.acceptedAnswers) ? payload.acceptedAnswers : []),
  ];
  return answers.some((answer) => String(answer ?? "").trim().length >= 2);
}

function hasRebuildPayload(payload: Record<string, unknown>) {
  return isUniqueStringArray(payload.chunks, 2, 30) && hasTextAnswerPayload(payload);
}

function hasOrderPayload(payload: Record<string, unknown>, sentenceIndices: Set<number>) {
  if (!Array.isArray(payload.shuffled) || !Array.isArray(payload.correctOrder)) return false;
  const order = payload.correctOrder.map(Number);
  if (order.length < 3 || order.some((index) => !sentenceIndices.has(index))) return false;
  return payload.shuffled.every((item) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return sentenceIndices.has(Number(record.index)) && String(record.text ?? "").trim().length > 0;
  });
}

function hasInsertionPayload(payload: Record<string, unknown>) {
  if (String(payload.targetSentence ?? "").trim().length < 8) return false;
  if (!Array.isArray(payload.options) || payload.options.length < 3 || payload.options.length > 7) return false;
  const correctIndex = Number(payload.correctIndex ?? payload.answerIndex);
  return Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < payload.options.length;
}

function hasMatchingPayload(payload: Record<string, unknown>) {
  if (!isUniqueStringArray(payload.leftItems, 2, 10) || !isUniqueStringArray(payload.rightItems, 2, 10)) return false;
  return payload.correctPairs && typeof payload.correctPairs === "object" && !Array.isArray(payload.correctPairs);
}

function containsHangul(value: unknown) {
  return /[가-힣]/.test(String(value ?? ""));
}

function normalizeComparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[“”‘’"'`.,!?;:()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

function exactSourceSentenceSet(analysis: PassageAnalysisData) {
  return new Set(analysis.sentences.map((sentence) => normalizeComparable(sentence.english)).filter(Boolean));
}

function isSourceSentence(value: unknown, sourceSentences: Set<string>) {
  return sourceSentences.has(normalizeComparable(value));
}

function hasReasonableTimingAndScore(draft: TutorActivityDraft) {
  return draft.maxScore >= 1 && draft.maxScore <= 40 && draft.estimatedSec >= 10 && draft.estimatedSec <= 240;
}

export function validateGroundedDrafts(
  drafts: TutorActivityDraft[],
  analysis: PassageAnalysisData,
): TutorActivityDraft[] {
  const sentenceIndices = new Set(analysis.sentences.map((sentence) => sentence.index));
  const vocabWords = new Set(analysis.vocabulary.map((item) => item.word.toLowerCase()));
  const sourceSentences = exactSourceSentenceSet(analysis);
  return drafts.filter((draft) => {
    if (!PLAYER_SUPPORTED_ACTIVITY_TYPES.has(draft.type)) return false;
    if (!draft.title.trim() || draft.title.length > 80) return false;
    if (!draft.instructions?.trim()) return false;
    if (!containsHangul(draft.title) || !containsHangul(draft.instructions)) return false;
    if (!hasReasonableTimingAndScore(draft)) return false;
    const refsOk = draft.coverageRefs.every(
      (ref) =>
        sentenceIndices.has(ref.sentenceIndex) &&
        COVERAGE_DIMENSIONS.includes(ref.dimension) &&
        ref.weight >= 0 &&
        ref.weight <= 1,
    );
    if (!refsOk) return false;
    const payload = draft.payload as Record<string, unknown>;
    if (
      [
        "vocab_choice",
        "gist_select",
        "paraphrase_mc",
        "contextual_meaning",
        "collocation_select",
        "grammar_binary",
        "irrelevant_sentence",
        "mastery_test",
      ].includes(draft.type) &&
      !hasValidChoicePayload(payload)
    ) {
      return false;
    }
    if (draft.type === "sentence_order" && !hasOrderPayload(payload, sentenceIndices)) return false;
    if (draft.type === "insertion_point" && (!hasInsertionPayload(payload) || !isSourceSentence(payload.targetSentence, sourceSentences))) {
      return false;
    }
    if (["sentence_rebuild", "chunk_rebuild"].includes(draft.type)) {
      if (!hasRebuildPayload(payload)) return false;
      if (!isSourceSentence(payload.answerText, sourceSentences)) return false;
    }
    if (draft.type === "vocab_match" && !hasMatchingPayload(payload)) return false;
    if (
      [
        "sentence_translate",
        "progressive_cloze",
        "first_letter_recall",
        "vocab_spell",
        "grammar_find",
        "grammar_correct",
        "structure_transform",
      ].includes(draft.type) &&
      !hasTextAnswerPayload(payload)
    ) {
      return false;
    }
    if (["vocab_choice", "contextual_meaning", "collocation_select"].includes(draft.type)) {
      const word = String(payload.stem ?? payload.word ?? "").toLowerCase();
      return !word || vocabWords.has(word);
    }
    if (draft.type === "vocab_spell") {
      const word = String(payload.answerText ?? payload.answer ?? "").toLowerCase();
      return !word || vocabWords.has(word);
    }
    return true;
  });
}
