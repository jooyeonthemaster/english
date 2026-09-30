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

// 객체 또는 JSON 문자열 → 객체(아니면 null).
function readLooseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// 기출 장문 세트 멤버(structuredData._gichul.set.key) — question-body-layout.isGichulSetMemberData 와 같은 판정.
// 그쪽이 이 모듈을 import 하므로 순환을 피하려고 로컬로 둔다(동치는 exam-paper-core-roundtrip 테스트가 잠근다).
function isGichulSetMemberQuestion(question: PassageQuestionLike): boolean {
  const gichul = readLooseObject(readLooseObject(question.structuredData)?._gichul);
  return Boolean(readLooseObject(gichul?.set)?.key);
}

export function shouldForceSourcePassage(question: PassageQuestionLike): boolean {
  // 기출 장문 세트 멤버는 문항 단위 강제 대상이 아니다. 지문은 세트 공유 지문 1박스가 맡고, 표시 여부는
  // 빌더의 세트 전체 토글(use-paper-items.updateItem)이 정한다. 웹은 멤버 안에 지문을 그리지 않는다
  // (structuredSegments 가 [] 를 돌려준다). 이 예외가 없으면 41 TITLE·45 CONTENT_MATCH 가 강제형으로 잡혀,
  // 저장기(save-draft `includePassage || shouldForceSourcePassage`)가 선생님이 끈 세트 지문을 true 로 덮어쓰고
  // 다시 열면 지문이 되살아났다(CM-R1). isSourcePassageForcedForItem 의 기출 예외와 같은 규칙이다.
  if (isGichulSetMemberQuestion(question)) return false;
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
export const ANSWER_BEARING_SOURCE_SUBTYPES = new Set([
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

// ============================================================================
// 인쇄 공용 규칙 (26-09-29, 계약 docs/EXAM-PAPER-MODEL.md §2·§3·§6) — 웹(빌더·재오픈·상세·인쇄)·HWPX·DOCX·
// 단일 문항 내보내기가 모두 이 함수들만 소비한다(저장본 → PaperItem 은 saved-paper-items.ts).
// ============================================================================

/**
 * 웹 렌더러가 includePassage 토글과 무관하게 지문을 **문항 안에 항상** 그리는 유형.
 * question-body-layout.structuredSegments 의 isSummaryCompleteSubtype(SUMMARY_COMPLETE·_MC) ·
 * isSummaryWritingSubtype · isTopicSentenceWritingSubtype 분기가 지문 박스를 무조건 넣는다.
 * 출제자가 빌더에서 본 화면이 「지문 있음」이므로 인쇄 규칙에서는 강제 규칙으로 취급한다(EXAM-PAPER-MODEL §2 강제 목록).
 * (HIDEABLE 목록의 SUMMARY_COMPLETE·TOPIC_SENTENCE_WRITING 토글은 웹에서 효과가 없다 — 보고됨.)
 */
export const ALWAYS_INLINE_SOURCE_PASSAGE_SUBTYPES: ReadonlySet<string> = new Set([
  "SUMMARY_COMPLETE",
  "SUMMARY_COMPLETE_MC",
  "SUMMARY_WRITING",
  "TOPIC_SENTENCE_WRITING",
]);

/**
 * 인쇄 강제 규칙(EXAM-PAPER-MODEL §2 강제 목록) — true 면 저장값과 무관하게 지문을 싣는다.
 *  (a) shouldForceSourcePassage: 기출 세트 멤버 아님 + source 흐름 + HIDEABLE 아님 + 내장 지문 표시 없음 + 지문 있음
 *      (TOPIC·MAIN_IDEA·TOPIC_MAIN_IDEA·TITLE·CONTENT_MATCH·SUMMARY_COMPLETE_MC·SUMMARY_WRITING·
 *       KO 지문 동봉형)
 *  (b) ALWAYS_INLINE_SOURCE_PASSAGE_SUBTYPES + 지문 있음(웹이 항상 그림)
 * 세트 규칙(KO 세트·기출 세트)은 resolveIncludePassage 가 이보다 먼저 판정한다.
 */
export function isSourcePassageForcedForPrint(question: PassageQuestionLike): boolean {
  if (shouldForceSourcePassage(question)) return true;
  return (
    ALWAYS_INLINE_SOURCE_PASSAGE_SUBTYPES.has(question.subType || "") &&
    hasSourcePassageContent(question)
  );
}

/** 세트 소속 — 규칙 분기용. "ko" 는 국어 세트(공유지문 1박스), "gichul" 은 기출 장문 세트. */
export type PassageSetKind = "ko" | "gichul" | "english" | null;

// 「지문이 있었다면」 판정용 자리표시 지문. 판정 함수들은 내용이 비었는지만 본다(인쇄에는 절대 쓰이지 않는다).
const ASSUMED_PASSAGE_CONTENT = "(source passage)";

function withSourcePassageAssumed<Q extends PassageQuestionLike>(question: Q): Q {
  if (hasSourcePassageContent(question)) return question;
  return { ...question, passage: { ...(question.passage ?? {}), content: ASSUMED_PASSAGE_CONTENT } } as Q;
}

/**
 * 저장값이 없을 때(settings NULL·similar-v1·새로 담은 문항)의 기본값 — makePaperItem 기본 규칙 그대로.
 *  - KO 세트 멤버: false (멤버 지문 박스 억제 — 공유지문은 그룹이 그린다)
 *  - 기출 세트 멤버 · 영어 세트 멤버: 지문 내용이 있으면 true
 *  - SUMMARY_WRITING · TOPIC_SENTENCE_WRITING: true
 *  - 그 밖: shouldIncludeSourcePassageByDefault
 * 지문을 따로 받는(source 흐름) 문항인데 인쇄할 지문이 없으면(삭제·미연결) 「지문이 있었다면」의 기본값을 쓴다
 * (26-09-30 MODEL-FINISH). 지문이 없으니 인쇄는 그대로(아무 경로도 빈 지문을 찍지 않는다)이고, 이 값은 의도 기록이다 —
 * 저장되면 나중에 지문이 복구됐을 때 기본값대로 찍히고, 「원문 지문 없음」 판정(wouldPrintSourcePassage)이 저장값
 * false(선생님 선택)와 「기본값이라 false」를 구분할 수 있게 된다. 그 밖의 흐름(내장·흐름 없음)은 종전 그대로.
 */
export function defaultIncludePassage(
  question: PassageQuestionLike,
  setKind: PassageSetKind,
): boolean {
  const q = getQuestionPassageFlow(question.subType) === "source" ? withSourcePassageAssumed(question) : question;
  if (setKind === "ko") return false;
  if (setKind === "gichul" || setKind === "english") return hasSourcePassageContent(q);
  if (q.subType === "SUMMARY_WRITING" || q.subType === "TOPIC_SENTENCE_WRITING") {
    return true;
  }
  return shouldIncludeSourcePassageByDefault(q);
}

/**
 * includePassage 단일 판정(EXAM-PAPER-MODEL §2). question.passage.content 에는 resolvePrintablePassage 로 고른
 * **인쇄될 지문**을 넣어 부른다(빈 스냅숏이 강제 판정을 가리지 않게).
 *
 *   KO 세트 멤버 → false (현행 강제: 멤버 지문 억제, 공유지문 1박스는 그룹 선두가 항상 그림)
 *   기출 세트 멤버 → 저장값이 boolean 이면 그 값, 아니면 기본값 (강제 규칙 미적용 — 빌더가 세트 전체
 *                    토글을 공유한다. 현행 재오픈 규칙 `saved !== false` 와 동치). shouldForceSourcePassage 가
 *                    기출 멤버를 빼므로 저장기도 세트 토글 값을 그대로 기록한다(CM-R1 — 감독 최종 결정 B안, EXAM-PAPER-MODEL §2 「기출 세트 결정」).
 *   그 밖 → 강제(isSourcePassageForcedForPrint) ? true
 *           : typeof saved === "boolean" ? saved
 *           : defaultIncludePassage
 */
export function resolveIncludePassage(input: {
  saved?: unknown;
  question: PassageQuestionLike;
  setKind: PassageSetKind;
}): boolean {
  const { saved, question, setKind } = input;
  if (setKind === "ko") return false;
  if (setKind === "gichul") {
    return typeof saved === "boolean" ? saved : defaultIncludePassage(question, setKind);
  }
  if (isSourcePassageForcedForPrint(question)) return true;
  if (typeof saved === "boolean") return saved;
  return defaultIncludePassage(question, setKind);
}

// ─── 지문 원천 결정(EXAM-PAPER-MODEL §3) ──────────────────────────────────────

export type PrintablePassageOrigin = "snapshot" | "db" | "detached" | "missing";

export type PrintablePassage = {
  /** 원문 그대로(정규화 전). 없으면 "". */
  content: string;
  title: string;
  origin: PrintablePassageOrigin;
  /** origin 이 detached 일 때 삭제된 원 지문 id(있으면). */
  detachedPassageId: string | null;
};

export type DetachedSourcePassage = {
  passageId: string | null;
  title: string;
  content: string;
  detachedAt: string | null;
};

/**
 * structuredData._sourcePassage(지문 삭제 시 원문 보관본 — passage-delete-guard.mergeSourcePassageSnapshot)
 * 를 읽는다. 객체·JSON 문자열 모두 수용. content 가 비면 null.
 */
export function readDetachedSourcePassage(structuredData: unknown): DetachedSourcePassage | null {
  const data =
    structuredData && typeof structuredData === "object" && !Array.isArray(structuredData)
      ? (structuredData as Record<string, unknown>)
      : readStructuredData({ subType: null, questionText: "", structuredData });
  const raw = data?._sourcePassage;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const snap = raw as Record<string, unknown>;
  const content = typeof snap.content === "string" ? snap.content : "";
  if (!content.trim()) return null;
  return {
    passageId: typeof snap.passageId === "string" && snap.passageId ? snap.passageId : null,
    title: typeof snap.title === "string" ? snap.title : "",
    content,
    detachedAt: typeof snap.detachedAt === "string" ? snap.detachedAt : null,
  };
}

/**
 * 인쇄할 지문 결정(EXAM-PAPER-MODEL §3): 비어 있지 않은 빌더 스냅숏 → DB 지문 → structuredData._sourcePassage.
 * 공백뿐인 스냅숏(빈 문자열 포함)은 「없음」이다. 제목은 [스냅숏 제목, DB 제목, 보관본 제목] 중 첫 비공백.
 */
export function resolvePrintablePassage(input: {
  savedPassageContent?: string | null;
  savedPassageTitle?: string | null;
  question: {
    passage?: { title?: string | null; content?: string | null } | null;
    structuredData?: unknown;
  };
}): PrintablePassage {
  const snapshot = typeof input.savedPassageContent === "string" ? input.savedPassageContent : "";
  const dbContent = input.question.passage?.content ?? "";
  const detached = readDetachedSourcePassage(input.question.structuredData);
  const pickTitle = (...titles: Array<string | null | undefined>) =>
    titles.find((t) => typeof t === "string" && t.trim()) ?? "";
  const savedTitle = input.savedPassageTitle ?? "";
  const dbTitle = input.question.passage?.title ?? "";
  if (snapshot.trim()) {
    return {
      content: snapshot,
      title: pickTitle(savedTitle, dbTitle, detached?.title),
      origin: "snapshot",
      detachedPassageId: null,
    };
  }
  if (dbContent.trim()) {
    return { content: dbContent, title: pickTitle(savedTitle, dbTitle), origin: "db", detachedPassageId: null };
  }
  if (detached) {
    return {
      content: detached.content,
      title: pickTitle(savedTitle, detached.title),
      origin: "detached",
      detachedPassageId: detached.passageId,
    };
  }
  return { content: "", title: pickTitle(savedTitle, dbTitle), origin: "missing", detachedPassageId: null };
}

/**
 * 지문이 있었다면 이 문항이 그것을 인쇄했을까(26-09-30 감독 결정 — 「원문 지문 없음」 경고의 기준).
 *  - 영어 세트·KO 세트 멤버: true — 공유 지문 박스는 지문만 있으면 그룹 선두에 찍힌다(buildGroups·applyKoSetSharedPassages)
 *  - 그 밖: resolveIncludePassage(saved, 지문이 있다고 가정한 문항) — 강제 유형(ALWAYS_INLINE 포함)은 항상 true,
 *    저장값 boolean 은 그 값(끌 수 있는 유형·정답 노출형의 false 는 선생님 선택), 저장값 없음은 기본값.
 *    기출 세트는 세트 토글(저장값) → 없으면 기본값.
 */
export function wouldPrintSourcePassage(input: {
  saved?: unknown;
  question: PassageQuestionLike;
  setKind: PassageSetKind;
}): boolean {
  if (input.setKind === "english" || input.setKind === "ko") return true;
  return resolveIncludePassage({
    saved: input.saved,
    question: withSourcePassageAssumed(input.question),
    setKind: input.setKind,
  });
}

/** 「원문 지문 없음」 판정의 인쇄 맥락 — 저장값(= PaperItem.includePassage)과 세트 종류. */
export type SourcePassagePrintContext = { saved?: unknown; setKind: PassageSetKind };

/**
 * 「원문 지문 없음」 단일 판정(경고 UI 배너·칩·토스트, 감사, 백필이 모두 이 함수를 쓴다).
 * 지문을 따로 받아야 하는(source 흐름) 문항인데 인쇄할 지문이 없고 본문에도 지문이 없으며,
 *  - context 가 있으면(시험지 안의 문항): 지문이 있었다면 인쇄했을 때만(wouldPrintSourcePassage) 참.
 *    PaperItem 판정은 paper-item-model.isPaperItemSourcePassageMissing 이 context 를 채워 부른다.
 *  - context 가 없으면(시험지 밖 — 백필의 원문 보관 대상 판정): 어떤 저장값으로든 찍힐 수 있으면 참.
 *    source 흐름 유형은 선생님이 켜면 모두 찍히므로 흐름·내장 검사만으로 참이다(종전 판정과 같다).
 * content 를 넘기지 않으면 question.passage.content 를 본다.
 */
export function isSourcePassageMissing(
  question: PassageQuestionLike,
  content?: string | null,
  context?: SourcePassagePrintContext,
): boolean {
  const text = (content ?? question.passage?.content ?? "").trim();
  if (text) return false;
  if (getQuestionPassageFlow(question.subType) !== "source") return false;
  if (hasEmbeddedPassageDisplay(question)) return false;
  if (!context) return true;
  return wouldPrintSourcePassage({ saved: context.saved, question, setKind: context.setKind });
}
