import { getKoTypeModule, isKoQuestionType } from "@/lib/korean/registry";
import type { BuilderQuestion } from "./types";

type PassageFlow = "embedded" | "source";
type PassageQuestionLike = Pick<
  BuilderQuestion,
  "subType" | "questionText" | "structuredData"
> & {
  passage?: { content?: string | null } | null;
};

export const QUESTION_PASSAGE_FLOW_RULES: Record<string, PassageFlow> = {
  BLANK_INFERENCE: "embedded",
  GRAMMAR_ERROR: "embedded",
  GRAMMAR_CHOICE_COMBO: "embedded",
  VOCAB_CHOICE: "embedded",
  SENTENCE_ORDER: "embedded",
  SENTENCE_INSERT: "embedded",
  TOPIC: "source",
  MAIN_IDEA: "source",
  TOPIC_MAIN_IDEA: "source",
  TITLE: "source",
  IMPLIED_MEANING: "embedded",
  REFERENCE: "embedded",
  CONTENT_MATCH: "source",
  SUMMARY_COMPLETE_MC: "source",
  IRRELEVANT: "embedded",
  CONDITIONAL_WRITING: "source",
  SENTENCE_TRANSFORM: "source",
  FILL_BLANK_KEY: "embedded",
  SUMMARY_COMPLETE: "source",
  // 요약문 영작: 원본 지문을 시험지에 "무조건 함께" 포함한다(사용자 요구·레퍼런스 형식).
  // SUMMARY_COMPLETE 와 동일하게 source + INLINE_SOURCE — 지문이 문제 안(요약문 위)에 인라인 렌더된다.
  SUMMARY_WRITING: "source",
  WORD_ORDER: "source",
  // 주제문 영작: 원본 지문을 시험지에 함께 포함(주제를 도출할 글이 필요). SUMMARY_WRITING 미러.
  TOPIC_SENTENCE_WRITING: "source",
  GRAMMAR_CORRECTION: "embedded",
  CONTEXT_MEANING: "embedded",
  SYNONYM: "source",
  ANTONYM: "embedded",
  // 커스텀 문항은 자료가 questionText 안에 통째로 포함됨(LayoutDoc 조립)
  // — 원본 지문 블록 중복 방지.
  CUSTOM: "embedded",
  CUSTOM_LAYOUT: "embedded",
};

const INLINE_SOURCE_PASSAGE_SUBTYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "SYNONYM",
]);

export function shouldRenderSourcePassageInsideQuestion(subType: string | null | undefined): boolean {
  // KO 지문 동봉 유형은 SUMMARY_WRITING 을 미러 — 지문을 문항 안(구조화 세그먼트
  // 박스)에 인라인 렌더한다. 문법 단독형(includesPassage=false)은 제외.
  if (isKoQuestionType(subType)) {
    const mod = getKoTypeModule(subType || "");
    return !!mod?.meta.includesPassage;
  }
  return INLINE_SOURCE_PASSAGE_SUBTYPES.has(subType || "");
}

const EMBEDDED_PASSAGE_FIELDS = [
  "passageWithBlank",
  "passageWithMarkers",
  "passageWithUnderline",
  "passageWithNumbers",
] as const;

const UNDERLINED_TEXT_PATTERN =
  /(^|[^_])__(?!_)(?=[^_\n]{1,180}__(?!_))(?=[^_\n]*[A-Za-z0-9\uAC00-\uD7A3])[^_\n_]+__(?!_)/;

function getQuestionPassageFlow(subType: string | null | undefined): PassageFlow | null {
  // KO 유형: 지문 동봉형은 source(별도 지문 박스 — 인라인 렌더), 문법 단독형은
  // 지문 미동봉이므로 flow 없음(null). 영어 규칙 테이블은 무변경.
  if (isKoQuestionType(subType)) {
    const mod = getKoTypeModule(subType || "");
    return mod?.meta.includesPassage ? "source" : null;
  }
  return QUESTION_PASSAGE_FLOW_RULES[subType || ""] ?? null;
}

function hasSourcePassageContent(question: PassageQuestionLike): boolean {
  return Boolean(question.passage?.content?.trim());
}

function readStructuredData(question: PassageQuestionLike): Record<string, unknown> | null {
  const raw = question.structuredData;
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function structuredDataHasEmbeddedPassage(question: PassageQuestionLike): boolean {
  const data = readStructuredData(question);
  if (!data) return false;
  if (EMBEDDED_PASSAGE_FIELDS.some((field) => typeof data[field] === "string" && String(data[field]).trim())) {
    return true;
  }
  return Array.isArray(data.paragraphs) && data.paragraphs.length > 0;
}

function questionTextLooksEmbedded(questionText: string): boolean {
  const text = questionText.trim();
  if (!text) return false;
  const wordCount = text.split(/\s+/).length;
  if (UNDERLINED_TEXT_PATTERN.test(text) && wordCount > 35) return true;
  if (/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/.test(text) && wordCount > 35) return true;
  return false;
}

function hasEmbeddedPassageDisplay(question: PassageQuestionLike): boolean {
  // KO(국어): 지문 취급은 레지스트리 명시 등록(getQuestionPassageFlow)이 진실원천.
  // 원문자/밑줄 휴리스틱(questionTextLooksEmbedded)은 한국어 발문·<보기>에서 오탐
  // 여지가 있어 스킵한다(구조화 필드 검사만 — 방어적 게이트, 영어 경로 무변경).
  if (isKoQuestionType(question.subType)) {
    return structuredDataHasEmbeddedPassage(question);
  }
  return (
    structuredDataHasEmbeddedPassage(question) ||
    questionTextLooksEmbedded(question.questionText || "")
  );
}

// source 흐름이라 기본은 출처 지문을 켜두지만(단독 출제 시 발문의 "다음 글"이 필요),
// 강제(토글 잠금)는 하지 않는 유형. 같은 지문을 공유하는 문항들에서 중복 지문을
// 숨기고 싶을 수 있어 출제자가 끌 수 있게 둔다. 기본값(ON)은 그대로 유지된다
// — shouldIncludeSourcePassageByDefault 가 flow === "source" 로 결정하기 때문.
// (별도 출처 지문 블록을 쓰는 서술형/어휘 유형만. 주제·제목·요지 등 INLINE 유형은
//  지문이 문제 안에 렌더되어 토글이 무의미하므로 제외 → 그대로 강제.)
const HIDEABLE_SOURCE_PASSAGE_SUBTYPES = new Set([
  "CONDITIONAL_WRITING", // 조건부 영작
  "SENTENCE_TRANSFORM", // 문장 전환
  "SUMMARY_COMPLETE", // 요약문 완성
  "WORD_ORDER", // 배열 영작
  "TOPIC_SENTENCE_WRITING", // 주제문 영작
  "SYNONYM", // 동의어
]);

export function shouldForceSourcePassage(question: PassageQuestionLike): boolean {
  if (HIDEABLE_SOURCE_PASSAGE_SUBTYPES.has(question.subType || "")) return false;
  if (hasEmbeddedPassageDisplay(question)) return false;
  return hasSourcePassageContent(question) && getQuestionPassageFlow(question.subType) === "source";
}

export function questionHasEmbeddedPassage(question: PassageQuestionLike): boolean {
  const flow = getQuestionPassageFlow(question.subType);
  const hasEmbeddedDisplay = hasEmbeddedPassageDisplay(question);
  if (flow === "embedded") return true;
  if (flow === "source") return hasEmbeddedDisplay;
  return hasEmbeddedDisplay;
}

// 정답이 "원본 지문 문장 그대로"인 유형 — 지문을 함께 보여주면 학생이 베껴 써서 영작이
// 무력화된다(본문 답 노출). 조건부 영작은 [영작할 우리말](한국어)만으로 출제가 성립하므로
// 원본 영어 지문을 기본 미동봉한다. (HIDEABLE 이라 출제자가 필요 시 다시 켤 수는 있다.)
const ANSWER_BEARING_SOURCE_SUBTYPES = new Set([
  "CONDITIONAL_WRITING",
  // 문장 전환: 정답이 원문 문장의 변형이라 전체 지문을 보여주면 정답에 가까운 원문이
  // 노출된다. 전환 대상 문장은 [원문] 블록으로 따로 제공되므로 전체 지문은 기본 미동봉한다.
  "SENTENCE_TRANSFORM",
]);

export function shouldIncludeSourcePassageByDefault(question: PassageQuestionLike): boolean {
  if (!hasSourcePassageContent(question)) return false;
  if (ANSWER_BEARING_SOURCE_SUBTYPES.has(question.subType || "")) return false;
  const flow = getQuestionPassageFlow(question.subType);
  if (flow === "source") return !hasEmbeddedPassageDisplay(question);
  if (flow === "embedded") return false;
  return !questionHasEmbeddedPassage(question);
}
