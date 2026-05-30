// ============================================================================
// Rule-based Tutor Activity Generator (v2)
// ----------------------------------------------------------------------------
// 분석 데이터에서 모바일 우선 v2 활동을 생성한다. 死유형 미생성, 영어 메타 distractor
// 금지(충분한 실제 오답이 없으면 생성 skip), seed Fisher-Yates 셔플, syntaxAnalysis/
// 어휘 신규 빌더, CHIP 시퀀스·SPAN 토큰정합. (스펙 §2, §7 Phase 4)
// ============================================================================

import { z } from "zod";
import type { PassageAnalysisData, SentenceAnalysis, VocabItem } from "@/types/passage-analysis";
import { getTutorModelNameForAudit } from "@/lib/tutor/ai";
import { TutorActivityDraftSchema, type TutorActivityDraft } from "@/lib/tutor/schemas";
import { normalizeForCompare, tokenizeSpan } from "@/lib/tutor/activity-payload-schema";
import { PASSAGE_POLICY_BY_TYPE } from "@/lib/tutor/visibility";
import type { TutorActivityType } from "@/lib/tutor/activity-types";

// 빌더는 입력 타입(default 필드 생략 가능)으로 구성하고, 조립 단계에서 파싱해 출력 타입으로 만든다.
type Draft = z.input<typeof TutorActivityDraftSchema>;
type Dimension = TutorActivityDraft["coverageRefs"][number]["dimension"];

// ── 시드 셔플(결정적, 정답 위치 편향 제거) ──────────────────────────────────
function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0 || 1;
}
function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed >>> 0 || 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uniqueStrings(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeForCompare(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

// 충분한 "실제" 오답이 있을 때만 4지선다 구성. 없으면 null → 생성 skip(템플릿 금지).
function buildChoice(
  correct: string,
  distractorPool: (string | undefined)[],
  seed: number,
  size = 4,
): { options: string[]; correctIndex: number } | null {
  const correctText = String(correct ?? "").trim();
  if (!correctText) return null;
  const pool = uniqueStrings(distractorPool).filter(
    (value) => normalizeForCompare(value) !== normalizeForCompare(correctText),
  );
  if (pool.length < size - 1) return null;
  const distractors = seededShuffle(pool, seed).slice(0, size - 1);
  const options = seededShuffle([correctText, ...distractors], seed + 7);
  const correctIndex = options.findIndex((value) => normalizeForCompare(value) === normalizeForCompare(correctText));
  if (correctIndex < 0) return null;
  return { options, correctIndex };
}

function ref(sentenceIndex: number, dimension: Dimension, weight = 0.85) {
  return [{ sentenceIndex: Math.max(0, sentenceIndex), dimension, weight }];
}

function sentenceLabel(sentence: SentenceAnalysis) {
  return `문장 ${sentence.index + 1}`;
}

function chunkSentence(english: string, chunkReading?: string): string[] {
  if (chunkReading && chunkReading.includes("/")) {
    const parts = chunkReading
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts.length <= 12) return parts;
  }
  const words = english.split(/\s+/).filter(Boolean);
  const size = words.length > 14 ? 3 : 2;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
  return chunks.length > 1 ? chunks : words;
}

// pieces(정답 순서)로부터 chips(셔플 표시순서)+correctOrder(ids in correct sequence) 생성.
function buildChips(pieces: string[], seed: number) {
  const ordered = pieces.map((text, id) => ({ id, text }));
  const chips = seededShuffle(ordered, seed);
  // 셔플이 우연히 원순서면 한 번 더 비틀기
  const sameOrder = chips.every((chip, index) => chip.id === index);
  const finalChips = sameOrder && chips.length > 1 ? seededShuffle(ordered, seed + 13) : chips;
  return { chips: finalChips, correctOrder: ordered.map((piece) => piece.id) };
}

function pickKeyWord(english: string, vocab: VocabItem[], sentenceIndex: number): string | null {
  const inSentence = vocab.find((item) => item.sentenceIndex === sentenceIndex && english.includes(item.word));
  if (inSentence) return inSentence.word;
  const words = english.split(/\s+/).map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""));
  return words.filter((word) => word.length >= 6).sort((a, b) => b.length - a.length)[0] ?? null;
}

function firstLetterMask(english: string): string {
  return english
    .split(/\s+/)
    .map((word) => {
      const cleaned = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
      if (cleaned.length <= 2) return word;
      return word.replace(cleaned, `${cleaned[0]}${"_".repeat(Math.min(cleaned.length - 1, 8))}`);
    })
    .join(" ");
}

// ── 빌더: 어휘 ───────────────────────────────────────────────────────────────
function vocabChoiceDraft(item: VocabItem, analysis: PassageAnalysisData): Draft | null {
  const correct = item.contextMeaning || item.meaning;
  const choice = buildChoice(
    correct,
    analysis.vocabulary.filter((v) => v.word !== item.word).map((v) => v.contextMeaning || v.meaning),
    hashSeed(`vc:${item.word}`),
  );
  if (!choice) return null;
  return {
    mode: "vocab",
    type: "vocab_choice",
    title: `${item.word} 문맥 뜻`,
    instructions: "지문 속 쓰임에 가장 가까운 뜻을 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "stem",
      prompt: item.word,
      stem: item.word,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: item.sentenceIndex },
      explanation: item.contextMeaning || item.meaning,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 40,
    coverageRefs: ref(item.sentenceIndex, "vocab"),
  };
}

function contextualMeaningDraft(item: VocabItem, analysis: PassageAnalysisData): Draft | null {
  if (!item.contextMeaning) return null;
  const choice = buildChoice(
    item.contextMeaning,
    [item.meaning, ...analysis.vocabulary.filter((v) => v.word !== item.word).map((v) => v.contextMeaning || v.meaning)],
    hashSeed(`cm:${item.word}`),
  );
  if (!choice) return null;
  return {
    mode: "vocab",
    type: "contextual_meaning",
    title: `${item.word} 문맥 추론`,
    instructions: "사전 뜻이 아니라 이 문장에서 실제로 작동하는 의미를 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "stem",
      prompt: item.word,
      stem: item.word,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: item.sentenceIndex },
      explanation: item.contextMeaning,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 50,
    coverageRefs: ref(item.sentenceIndex, "vocab", 0.8),
  };
}

function collocationDraft(item: VocabItem, analysis: PassageAnalysisData): Draft | null {
  const correct = (item.collocations ?? [])[0];
  if (!correct) return null;
  const otherCollocations = analysis.vocabulary
    .filter((v) => v.word !== item.word)
    .flatMap((v) => v.collocations ?? []);
  const choice = buildChoice(correct, [...(item.collocations ?? []).slice(1), ...otherCollocations], hashSeed(`co:${item.word}`));
  if (!choice) return null;
  return {
    mode: "vocab",
    type: "vocab_collocation",
    title: `${item.word} 연어`,
    instructions: "본문 어휘와 자연스럽게 함께 쓰는 표현을 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "stem",
      prompt: item.word,
      stem: item.word,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: item.sentenceIndex },
      explanation: `${item.word}는 함께 쓰이는 표현까지 묶어 외워야 해요.`,
    },
    itemCount: 1,
    maxScore: 8,
    estimatedSec: 40,
    coverageRefs: ref(item.sentenceIndex, "vocab", 0.55),
  };
}

function confusableDraft(item: VocabItem): Draft | null {
  const confusables = item.confusableWords ?? [];
  if (confusables.length < 2) return null;
  const choice = buildChoice(item.word, confusables, hashSeed(`cf:${item.word}`));
  if (!choice) return null;
  return {
    mode: "vocab",
    type: "vocab_confusable",
    title: `${item.meaning} 혼동어 구분`,
    instructions: "뜻에 가장 알맞은 단어를 고르세요. (혼동하기 쉬운 단어 주의)",
    payload: {
      form: "CHOICE",
      variant: "plain",
      prompt: `'${item.contextMeaning || item.meaning}'에 해당하는 단어는?`,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: item.sentenceIndex },
      explanation: `${item.word}: ${item.contextMeaning || item.meaning}`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 45,
    coverageRefs: ref(item.sentenceIndex, "vocab", 0.6),
  };
}

function synonymDraft(item: VocabItem, analysis: PassageAnalysisData): Draft | null {
  const synonym = (item.synonyms ?? [])[0];
  if (!synonym) return null;
  const choice = buildChoice(
    synonym,
    [
      ...(item.antonyms ?? []),
      ...analysis.vocabulary.filter((v) => v.word !== item.word).map((v) => v.word),
    ],
    hashSeed(`sy:${item.word}`),
  );
  if (!choice) return null;
  return {
    mode: "vocab",
    type: "vocab_synonym",
    title: `${item.word} 유의어`,
    instructions: "밑줄 친 단어와 의미가 가장 가까운 것을 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "stem",
      prompt: item.word,
      stem: item.word,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: item.sentenceIndex },
      explanation: `${item.word} ≈ ${synonym}`,
    },
    itemCount: 1,
    maxScore: 9,
    estimatedSec: 45,
    coverageRefs: ref(item.sentenceIndex, "vocab", 0.6),
  };
}

function formDraft(item: VocabItem): Draft | null {
  const derivative = (item.derivatives ?? [])[0];
  if (!derivative || !/[A-Za-z]/.test(derivative)) return null;
  return {
    mode: "vocab",
    type: "vocab_form",
    title: `${item.word} 파생어`,
    instructions: "뜻과 첫 글자를 보고 파생어를 완성하세요.",
    payload: {
      form: "TEXT",
      variant: "derive",
      prompt: `${item.word}의 파생어를 쓰세요.`,
      inputMode: "short",
      firstLetter: derivative[0],
      length: derivative.length,
      gradeMode: "rule_exact",
      acceptedAnswers: [derivative],
      source: { sentenceIndex: item.sentenceIndex },
      explanation: `${item.word} → ${derivative}`,
    },
    itemCount: 1,
    maxScore: 9,
    estimatedSec: 45,
    coverageRefs: ref(item.sentenceIndex, "vocab", 0.5),
  };
}

function vocabMatchDraft(vocab: VocabItem[]): Draft | null {
  const target = vocab.slice(0, 5);
  if (target.length < 2) return null;
  return {
    mode: "vocab",
    type: "vocab_match",
    title: "핵심 어휘 매칭",
    instructions: "영단어마다 지문 속 뜻을 연결하세요.",
    payload: {
      form: "MATCH",
      prompt: "단어와 뜻을 1:1로 연결하세요.",
      pairs: target.map((item) => ({ left: item.word, right: item.contextMeaning || item.meaning })),
      explanation: "단어 뜻은 본문 쓰임까지 묶어 외워야 오래 남아요.",
    },
    itemCount: target.length,
    maxScore: target.length * 5,
    estimatedSec: 90,
    coverageRefs: target.map((item) => ({ sentenceIndex: item.sentenceIndex, dimension: "vocab" as Dimension, weight: 0.5 })),
  };
}

function spellDraft(item: VocabItem): Draft | null {
  if (!/^[A-Za-z]/.test(item.word)) return null;
  return {
    mode: "vocab",
    type: "vocab_spell",
    title: `${item.meaning} 철자 쓰기`,
    instructions: "뜻과 첫 글자·길이 힌트를 보고 영어 단어를 입력하세요.",
    payload: {
      form: "TEXT",
      variant: "spell",
      prompt: item.contextMeaning || item.meaning,
      inputMode: "short",
      firstLetter: item.word[0],
      length: item.word.length,
      gradeMode: "rule_exact",
      acceptedAnswers: [item.word],
      source: { sentenceIndex: item.sentenceIndex },
      explanation: `${item.word}: ${item.contextMeaning || item.meaning}`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 45,
    coverageRefs: ref(item.sentenceIndex, "vocab", 0.7),
  };
}

// ── 빌더: 해석 ───────────────────────────────────────────────────────────────
function translateDraft(sentence: SentenceAnalysis): Draft {
  return {
    mode: "interpret",
    type: "sentence_translate",
    title: `${sentenceLabel(sentence)} 직독직해`,
    instructions: "영어 문장을 읽고 핵심 의미가 드러나도록 한국어로 적어보세요.",
    payload: {
      form: "TEXT",
      variant: "translate",
      prompt: sentence.english,
      inputMode: "long",
      gradeMode: "ai",
      modelAnswer: sentence.korean,
      source: { sentenceIndex: sentence.index },
      explanation: "직역보다 주어·동사·연결어의 관계를 놓치지 않는 게 핵심이에요.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 75,
    coverageRefs: ref(sentence.index, "interpret"),
  };
}

function chunkReadingDraft(sentence: SentenceAnalysis, analysis: PassageAnalysisData): Draft | null {
  const syntax = analysis.syntaxAnalysis?.find((item) => item.sentenceIndex === sentence.index);
  if (!syntax?.chunkReading || !syntax.chunkReading.includes("/")) return null;
  const pieces = chunkSentence(sentence.english, syntax.chunkReading);
  if (pieces.length < 2) return null;
  const { chips, correctOrder } = buildChips(pieces, hashSeed(`cr:${sentence.index}`));
  return {
    mode: "interpret",
    type: "chunk_reading",
    title: `${sentenceLabel(sentence)} 끊어읽기`,
    instructions: "의미 단위(끊어읽기) 순서대로 조각을 배열하세요.",
    payload: {
      form: "CHIP",
      variant: "chunk_reading",
      prompt: "의미 덩어리를 읽는 순서대로 이어보세요.",
      chips,
      correctOrder,
      source: { sentenceIndex: sentence.index },
      explanation: syntax.readingTip || "끊어읽기 단위를 의식하면 긴 문장도 빠르게 해석돼요.",
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 60,
    coverageRefs: ref(sentence.index, "interpret", 0.8),
  };
}

function structureRoleDraft(sentence: SentenceAnalysis, analysis: PassageAnalysisData): Draft | null {
  const syntax = analysis.syntaxAnalysis?.find((item) => item.sentenceIndex === sentence.index);
  if (!syntax?.patternType) return null;
  const pool = [
    "단순 문장 (S+V)",
    "수동태",
    "관계사절",
    "분사구문",
    "가정법",
    "도치",
    "강조구문",
    "병렬구조",
  ].filter((label) => normalizeForCompare(label) !== normalizeForCompare(syntax.patternType ?? ""));
  const choice = buildChoice(syntax.patternType, pool, hashSeed(`sr:${sentence.index}`));
  if (!choice) return null;
  return {
    mode: "interpret",
    type: "structure_role",
    title: `${sentenceLabel(sentence)} 구문 유형`,
    instructions: "밑줄 친 문장의 핵심 구문 유형을 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "stem",
      prompt: syntax.keyPhrase || sentence.english,
      stem: syntax.keyPhrase || sentence.english,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: sentence.index },
      explanation: syntax.plainExplanation || `이 문장의 구문 유형은 ${syntax.patternType}입니다.`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 50,
    coverageRefs: ref(sentence.index, "interpret", 0.7),
  };
}

function gistDraft(analysis: PassageAnalysisData): Draft | null {
  const mainIdea = analysis.structure?.mainIdea;
  if (!mainIdea) return null;
  const choice = buildChoice(
    mainIdea,
    [
      ...(analysis.structure?.keyPoints ?? []),
      ...(analysis.structure?.paragraphSummaries ?? []).map((p) => p.summary),
      analysis.structure?.purpose,
    ],
    hashSeed(`gist:${mainIdea}`),
  );
  if (!choice) return null;
  return {
    mode: "interpret",
    type: "gist_select",
    title: "지문 핵심 주제 고르기",
    instructions: "전체 지문의 중심 생각과 가장 가까운 설명을 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "plain",
      prompt: "이 지문의 핵심 주제로 가장 적절한 것은?",
      options: choice.options,
      correctIndex: choice.correctIndex,
      explanation: analysis.structure?.purpose || "첫 문장과 결론을 연결해 중심 흐름을 확인하세요.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 60,
    coverageRefs: ref(analysis.structure?.topicSentenceIndex ?? 0, "interpret", 0.4),
  };
}

// ── 빌더: 순서 ───────────────────────────────────────────────────────────────
function sentenceOrderDraft(sentences: SentenceAnalysis[]): Draft | null {
  const target = sentences.slice(0, Math.min(5, sentences.length));
  if (target.length < 3) return null;
  const { chips, correctOrder } = buildChips(target.map((s) => s.english), hashSeed(`so:${target[0].index}`));
  return {
    mode: "order",
    type: "sentence_order",
    title: "문장 흐름 배열",
    instructions: "원문을 가리고, 논리 흐름이 자연스럽도록 문장 순서를 맞추세요.",
    payload: {
      form: "CHIP",
      variant: "order",
      prompt: "도입 → 전개 → 결론의 흐름 단서를 떠올려 순서를 맞추세요.",
      chips,
      correctOrder,
      source: { sentenceIndices: target.map((s) => s.index) },
      explanation: "연결어·지시어·예시와 결론의 위치가 순서 단서예요.",
    },
    itemCount: target.length,
    maxScore: 16,
    estimatedSec: 110,
    coverageRefs: target.map((s) => ({ sentenceIndex: s.index, dimension: "order" as Dimension, weight: 0.7 })),
  };
}

function connectorDraft(analysis: PassageAnalysisData): Draft | null {
  const connector = analysis.structure?.connectorAnalysis?.[0];
  if (!connector?.word) return null;
  const pool = ["However", "Therefore", "For example", "In addition", "On the other hand", "As a result", "In contrast"].filter(
    (label) => normalizeForCompare(label) !== normalizeForCompare(connector.word),
  );
  const choice = buildChoice(connector.word, pool, hashSeed(`con:${connector.word}`));
  if (!choice) return null;
  return {
    mode: "order",
    type: "connector_select",
    title: "연결어 고르기",
    instructions: "문맥 흐름에 가장 알맞은 연결어를 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "plain",
      prompt: `다음 흐름(${connector.role})에 알맞은 연결어는?`,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: connector.sentenceIndex },
      explanation: connector.examRelevance || `${connector.word}는 ${connector.role} 관계를 나타내요.`,
    },
    itemCount: 1,
    maxScore: 9,
    estimatedSec: 45,
    coverageRefs: ref(connector.sentenceIndex, "order", 0.6),
  };
}

// ── 빌더: 암기 ───────────────────────────────────────────────────────────────
function rebuildDraft(sentence: SentenceAnalysis, analysis: PassageAnalysisData): Draft | null {
  const syntax = analysis.syntaxAnalysis?.find((item) => item.sentenceIndex === sentence.index);
  const pieces = chunkSentence(sentence.english, syntax?.chunkReading);
  if (pieces.length < 2) return null;
  const { chips, correctOrder } = buildChips(pieces, hashSeed(`rb:${sentence.index}`));
  return {
    mode: "memorize",
    type: "sentence_rebuild",
    title: `${sentenceLabel(sentence)} 어순 조립`,
    instructions: "조각을 원문 어순대로 눌러 문장을 완성하세요.",
    payload: {
      form: "CHIP",
      variant: "rebuild",
      prompt: "원문 어순대로 조각을 배열하세요.",
      chips,
      correctOrder,
      hint: sentence.korean,
      source: { sentenceIndex: sentence.index },
      explanation: "영어는 의미 단위가 쌓이는 순서가 곧 논리예요.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 80,
    coverageRefs: ref(sentence.index, "memorize", 0.8),
  };
}

function clozeDraft(sentence: SentenceAnalysis, analysis: PassageAnalysisData): Draft | null {
  const key = pickKeyWord(sentence.english, analysis.vocabulary, sentence.index);
  if (!key) return null;
  const blanked = sentence.english.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), "______");
  if (blanked === sentence.english) return null;
  return {
    mode: "memorize",
    type: "progressive_cloze",
    title: `${sentenceLabel(sentence)} 핵심어 빈칸`,
    instructions: "문맥상 빈칸에 들어갈 원문 표현을 입력하세요.",
    payload: {
      form: "TEXT",
      variant: "cloze",
      prompt: blanked,
      inputMode: "short",
      firstLetter: key[0],
      gradeMode: "rule_exact",
      acceptedAnswers: [key],
      hint: sentence.korean,
      source: { sentenceIndex: sentence.index },
      explanation: `빈칸에는 '${key}'가 들어가요.`,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 50,
    coverageRefs: ref(sentence.index, "memorize", 0.75),
  };
}

function firstLetterDraft(sentence: SentenceAnalysis): Draft {
  return {
    mode: "memorize",
    type: "first_letter_recall",
    title: `${sentenceLabel(sentence)} 첫 글자 복원`,
    instructions: "첫 글자 힌트를 보고 원문 문장을 최대한 정확히 복원하세요.",
    payload: {
      form: "TEXT",
      variant: "first_letter",
      prompt: firstLetterMask(sentence.english),
      inputMode: "long",
      gradeMode: "rule_exact",
      acceptedAnswers: [sentence.english],
      hint: sentence.korean,
      source: { sentenceIndex: sentence.index },
      explanation: "첫 글자 복원은 통문장 암기와 서술형 대비를 동시에 잡아줘요.",
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 90,
    coverageRefs: ref(sentence.index, "memorize", 0.85),
  };
}

// ── 빌더: 어법 ───────────────────────────────────────────────────────────────
function grammarJudgeDraft(analysis: PassageAnalysisData, point: PassageAnalysisData["grammarPoints"][number]): Draft | null {
  const pool = [
    ...analysis.grammarPoints.filter((p) => p.id !== point.id).map((p) => p.pattern),
    "단순 시제 일치",
    "관사 용법",
    "전치사 선택",
    "수동태",
    "관계대명사",
    "병렬 구조",
  ];
  const choice = buildChoice(point.pattern, pool, hashSeed(`gj:${point.id}`));
  if (!choice) return null;
  return {
    mode: "grammar",
    type: "grammar_judge",
    title: `${point.pattern} 판단`,
    instructions: "밑줄 친 표현의 핵심 어법 포인트로 옳은 것을 고르세요.",
    payload: {
      form: "CHOICE",
      variant: "stem",
      prompt: point.textFragment,
      stem: point.textFragment,
      options: choice.options,
      correctIndex: choice.correctIndex,
      source: { sentenceIndex: point.sentenceIndex },
      explanation: point.studentExplanation || point.explanation,
    },
    itemCount: 1,
    maxScore: 10,
    estimatedSec: 50,
    coverageRefs: ref(point.sentenceIndex, "grammar"),
  };
}

function grammarErrorSpanDraft(
  analysis: PassageAnalysisData,
  point: PassageAnalysisData["grammarPoints"][number],
): Draft | null {
  const sentence = analysis.sentences.find((s) => s.index === point.sentenceIndex);
  if (!sentence) return null;
  const tokens = tokenizeSpan(sentence.english);
  const fragTokens = tokenizeSpan(point.textFragment);
  if (fragTokens.length === 0 || fragTokens.length > tokens.length) return null;
  let span: [number, number] | null = null;
  for (let i = 0; i + fragTokens.length <= tokens.length; i += 1) {
    const slice = tokens.slice(i, i + fragTokens.length);
    if (normalizeForCompare(slice.join(" ")) === normalizeForCompare(point.textFragment)) {
      span = [i, i + fragTokens.length - 1];
      break;
    }
  }
  if (!span) return null;
  return {
    mode: "grammar",
    type: "grammar_error_span",
    title: `${point.pattern} 근거 찾기`,
    instructions: "설명에 해당하는 어법 포인트 구간을 원문에서 탭하세요.",
    payload: {
      form: "SPAN",
      variant: "grammar_error",
      prompt: point.explanation,
      spanTokens: tokens,
      correctSpan: span,
      textFragment: point.textFragment,
      source: { sentenceIndex: point.sentenceIndex },
      explanation: point.commonMistake || point.explanation,
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 60,
    coverageRefs: ref(point.sentenceIndex, "grammar", 0.85),
  };
}

function grammarCorrectDraft(point: PassageAnalysisData["grammarPoints"][number]): Draft | null {
  const corrected = (point.transformations ?? [])[0];
  if (!corrected || !point.commonMistake) return null;
  return {
    mode: "grammar",
    type: "grammar_correct",
    title: `${point.pattern} 고치기`,
    instructions: "어법상 어색한 부분을 원문 의미에 맞게 고쳐 쓰세요.",
    payload: {
      form: "TEXT",
      variant: "correct",
      prompt: point.commonMistake,
      sentenceWithError: point.commonMistake,
      inputMode: "short",
      gradeMode: "hybrid",
      acceptedAnswers: [corrected, point.textFragment],
      modelAnswer: point.textFragment,
      rubric: [point.explanation],
      source: { sentenceIndex: point.sentenceIndex },
      explanation: point.explanation,
    },
    itemCount: 1,
    maxScore: 12,
    estimatedSec: 75,
    coverageRefs: ref(point.sentenceIndex, "grammar", 0.8),
  };
}

// ── 빌더: 전이(서술형) ──────────────────────────────────────────────────────
function transformDraft(analysis: PassageAnalysisData): Draft | null {
  const point = analysis.examDesign?.structureTransformPoints?.[0];
  if (!point?.original || !point.example) return null;
  return {
    mode: "transfer",
    type: "structure_transform",
    title: "구문 전환 서술형",
    instructions: "조건에 맞게 핵심 구문을 바꾸어 쓰세요.",
    payload: {
      form: "TEXT",
      variant: "transform",
      prompt: point.original,
      inputMode: "long",
      transformType: point.transformType,
      conditions: [
        `${point.transformType} 형태로 전환할 것`,
        "원문의 의미 관계를 유지할 것",
      ],
      gradeMode: "ai",
      modelAnswer: point.example,
      source: { sentenceIndex: point.sentenceIndex },
      explanation: point.reason || "전환 후에도 원문의 의미가 유지되어야 해요.",
    },
    itemCount: 1,
    maxScore: 14,
    estimatedSec: 100,
    coverageRefs: ref(point.sentenceIndex, "transfer"),
  };
}

function conditionalWritingDraft(analysis: PassageAnalysisData): Draft | null {
  const conditions = analysis.examDesign?.descriptiveConditions ?? [];
  const keyPoints = analysis.examDesign?.summaryKeyPoints ?? analysis.structure?.keyPoints ?? [];
  if (conditions.length === 0 || keyPoints.length === 0) return null;
  return {
    mode: "transfer",
    type: "conditional_writing",
    title: "조건 영작 서술형",
    instructions: "주어진 조건을 모두 만족하도록 영어로 작성하세요.",
    payload: {
      form: "TEXT",
      variant: "conditional",
      prompt: `다음 내용을 조건에 맞게 영어로 작성하세요: ${keyPoints[0]}`,
      inputMode: "long",
      conditions: conditions.slice(0, 3),
      gradeMode: "hybrid",
      modelAnswer: keyPoints[0],
      source: { sentenceIndex: 0 },
      explanation: "조건을 하나씩 만족했는지 점검하며 작성하세요.",
    },
    itemCount: 1,
    maxScore: 14,
    estimatedSec: 110,
    coverageRefs: ref(0, "transfer", 0.7),
  };
}

// ── refKey(반복 숙달용) 부여 ───────────────────────────────────────────────
function refKeyFor(draft: Draft): string {
  const sentenceIndex = draft.coverageRefs[0]?.sentenceIndex ?? 0;
  const stem = (draft.payload as { stem?: string }).stem;
  switch (draft.payload.form) {
    case "CHOICE":
      return draft.type.startsWith("vocab") && stem ? `vocab:${normalizeForCompare(stem)}` : `${draft.coverageRefs[0]?.dimension}:${draft.type}:${sentenceIndex}`;
    default:
      return `${draft.coverageRefs[0]?.dimension}:${draft.type}:${sentenceIndex}`;
  }
}

// ── 조립 ────────────────────────────────────────────────────────────────────
export function buildRuleBasedTutorDrafts(analysis: PassageAnalysisData): TutorActivityDraft[] {
  const sentences = analysis.sentences.slice(0, 6);
  const vocab = analysis.vocabulary.slice(0, 8);
  const drafts: (Draft | null)[] = [];

  // 어휘
  for (const item of vocab.slice(0, 4)) drafts.push(vocabChoiceDraft(item, analysis));
  for (const item of vocab.slice(0, 3)) drafts.push(contextualMeaningDraft(item, analysis));
  for (const item of vocab.slice(0, 3)) drafts.push(collocationDraft(item, analysis));
  for (const item of vocab.slice(0, 2)) drafts.push(confusableDraft(item));
  for (const item of vocab.slice(0, 2)) drafts.push(synonymDraft(item, analysis));
  for (const item of vocab.slice(0, 2)) drafts.push(formDraft(item));
  drafts.push(vocabMatchDraft(vocab));
  for (const item of vocab.slice(0, 4)) drafts.push(spellDraft(item));

  // 해석
  for (const sentence of sentences.slice(0, 3)) drafts.push(translateDraft(sentence));
  for (const sentence of sentences.slice(0, 3)) drafts.push(chunkReadingDraft(sentence, analysis));
  for (const sentence of sentences.slice(0, 2)) drafts.push(structureRoleDraft(sentence, analysis));
  drafts.push(gistDraft(analysis));

  // 순서
  drafts.push(sentenceOrderDraft(sentences));
  drafts.push(connectorDraft(analysis));

  // 암기
  for (const sentence of sentences.slice(0, 3)) drafts.push(rebuildDraft(sentence, analysis));
  for (const sentence of sentences.slice(0, 3)) drafts.push(clozeDraft(sentence, analysis));
  for (const sentence of sentences.slice(0, 2)) drafts.push(firstLetterDraft(sentence));

  // 어법
  for (const point of analysis.grammarPoints.slice(0, 3)) {
    drafts.push(grammarJudgeDraft(analysis, point));
    drafts.push(grammarErrorSpanDraft(analysis, point));
    drafts.push(grammarCorrectDraft(point));
  }

  // 전이
  drafts.push(transformDraft(analysis));
  drafts.push(conditionalWritingDraft(analysis));

  const built = drafts.filter((draft): draft is Draft => draft !== null);
  // 정책·refKey 부여
  for (const draft of built) {
    const policy = PASSAGE_POLICY_BY_TYPE[draft.type as TutorActivityType] ?? "visible";
    (draft.payload as { passagePolicy?: string }).passagePolicy = policy;
    if (!(draft.payload as { refKey?: string }).refKey) {
      (draft.payload as { refKey?: string }).refKey = refKeyFor(draft);
    }
  }
  // 파싱해 v2 스키마(payload superRefine 포함)를 통과한 것만 반환. 폴백 쓰레기 0건.
  return built.flatMap((draft) => {
    const parsed = TutorActivityDraftSchema.safeParse(draft);
    return parsed.success ? [parsed.data] : [];
  });
}

// LLM 범용 생성 경로는 v2에서 rule-based + 내신형(exam-aligned)로 대체되어 사용 중단.
// 호출부 호환을 위해 시그니처만 유지(빈 결과 반환).
export async function generateTutorDraftsWithModel(_analysis: PassageAnalysisData) {
  return {
    activities: [] as TutorActivityDraft[],
    model: getTutorModelNameForAudit(),
    latencyMs: 0,
    usage: undefined,
  };
}

// v2 스키마 통과 + 死유형 제거를 단일 검증으로. 통과 못하면 폴백 없이 제외.
export function validateGroundedDrafts(
  drafts: Draft[],
  analysis: PassageAnalysisData,
): TutorActivityDraft[] {
  const sentenceIndices = new Set(analysis.sentences.map((sentence) => sentence.index));
  const out: TutorActivityDraft[] = [];
  for (const draft of drafts) {
    const parsed = TutorActivityDraftSchema.safeParse(draft);
    if (!parsed.success) continue;
    if (parsed.data.coverageRefs.every((refItem) => sentenceIndices.has(refItem.sentenceIndex) || refItem.sentenceIndex === 0)) {
      out.push(parsed.data);
    }
  }
  return out;
}
