import {
  isSummaryCompleteMc,
  isSummaryCompleteSubtype,
  isSummaryWritingSubtype,
  splitSummaryCompleteMcQuestionText,
  splitSummaryWritingQuestionText,
  summaryCompleteMcPassageForItem,
  summaryCompleteMcSummaryForItem,
} from "./summary-complete-mc-layout";
import {
  formatSentenceInsertPassageMarkers,
  splitSentenceInsertGivenBlock,
} from "./option-display";
import { questionHasEmbeddedPassage } from "./passage-policy";
import { formatSourcePassageForQuestionItems } from "./source-passage-markers";
import { normalizePassageText, normalizeQuestionText } from "./text-normalization";
import type { PaperItem } from "./types";

// ---------------------------------------------------------------------------
// 문항을 "지시문(stem)"과 "본문(body)"으로 나누는 공통 로직.
//
// 시험지 렌더와 페이지네이션이 동일한 분리 규칙을 공유해야
// (1) 지시문이 잘리거나 (2) 인위적인 줄바꿈이 생기거나
// (3) 높이 추정이 실제 렌더와 어긋나는 문제를 막을 수 있다.
//
// - stem  : 문제 번호 옆에 항상 통째로 렌더되는 지시문(첫 단락).
// - body  : 지시문 뒤에 오는 내용(평문 유형의 본문 지문 등).
//           구조화 유형(요약문/순서/주제·요지·제목·내용일치)은 전용 컴포넌트가
//           item 으로부터 직접 그리므로 body 는 빈 문자열을 돌려준다.
// ---------------------------------------------------------------------------

// 지문 박스 등 구조화된 본문을 전용 컴포넌트로 그리며, 칸 경계에서 쪼개지 않고
// 한 덩어리로 배치(원자적)해야 하는 유형들.
const INLINE_SOURCE_PASSAGE_SUBTYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "WORD_ORDER",
  "SYNONYM",
]);

const STRUCTURED_ATOMIC_SUBTYPES = new Set([
  ...INLINE_SOURCE_PASSAGE_SUBTYPES,
  "SUMMARY_COMPLETE_MC",
  "SUMMARY_COMPLETE",
  // 요약문 영작: [해석]/[요약문]/[보기]/[앞글자] 박스와 영작 답란이 칸 경계에서
  // 쪼개지지 않도록 SUMMARY_COMPLETE 와 동일하게 원자 배치한다.
  "SUMMARY_WRITING",
  // 주제문 영작: [주제 힌트]/[주제문]/[보기]/[배열 단어] 박스와 영작 답란이 칸 경계에서
  // 쪼개지지 않도록 SUMMARY_WRITING 과 동일하게 원자 배치한다.
  "TOPIC_SENTENCE_WRITING",
  "SENTENCE_ORDER",
]);

const PASSAGE_BEFORE_BODY_SUBTYPES = new Set([
  "CONDITIONAL_WRITING",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
]);

export function isStructuredAtomicSubtype(subType?: string | null): boolean {
  return STRUCTURED_ATOMIC_SUBTYPES.has(subType || "");
}

export function isFlowStructuredSubtype(subType?: string | null): boolean {
  return isStructuredAtomicSubtype(subType) || subType === "SENTENCE_INSERT";
}

export function isInlineSourcePassageSubtype(subType?: string | null): boolean {
  return INLINE_SOURCE_PASSAGE_SUBTYPES.has(subType || "");
}

function splitFirstParagraph(text: string): { stem: string; body: string } {
  const normalized = normalizeQuestionText(text || "");
  if (!normalized) return { stem: "", body: "" };
  const blocks = normalized.split(/\n{2,}/);
  const stem = (blocks[0] || "").trim();
  const body = blocks.slice(1).join("\n\n").trim();
  return { stem, body };
}

// ---------------------------------------------------------------------------
// 주제문 영작(TOPIC_SENTENCE_WRITING) 마커 분해 — SUMMARY_WRITING 미러.
//
// 직렬 포맷(학생 안전, topicSentenceWritingStudentParts 산출):
//   <발문>
//   [주제 힌트] <한국어>            ← hintEnabled && koreanGloss 일 때만
//   (scrambled) [배열 단어] w1 / w2 / ...
//   (cloze)     [주제문] <(A) _____ 마스킹본>   +  [보기] chip1 / chip2 ...
// 정답계열은 어느 마커에도 직렬화되지 않으므로 정답 제거 로직이 불필요하다.
// 마커는 "블록/라인 시작"에 앵커해 발문 안의 인라인 리터럴([보기] 등) 오인을 막는다.
// ---------------------------------------------------------------------------
export function isTopicSentenceWritingSubtype(subType: string | null | undefined) {
  return subType === "TOPIC_SENTENCE_WRITING";
}

const TSW_HINT_MARKER_RE = /(^|\n)\s*\[(?:주제\s*힌트|topic\s*hint)\]/i; // [주제 힌트]
const TSW_TOPIC_MARKER_RE = /(^|\n)\s*\[(?:주제문|topic\s*sentence)\]/i; // [주제문]
const TSW_WORDBANK_MARKER_RE = /(^|\n)\s*\[(?:보기|word\s*bank)\]/i; // [보기]
const TSW_SCRAMBLED_MARKER_RE = /(^|\n)\s*\[(?:배열\s*단어|word\s*order)\]/i; // [배열 단어]
const ANY_TSW_MARKER_RE =
  /^\s*\[(?:주제\s*힌트|topic\s*hint|주제문|topic\s*sentence|보기|word\s*bank|배열\s*단어|word\s*order)\]/i;

type TopicSentenceWritingSections = {
  stem: string;
  hint: string; // [주제 힌트]
  topic: string; // [주제문] (cloze, 마스킹본)
  wordBank: string; // [보기] (cloze)
  scrambled: string; // [배열 단어] (scrambled)
};

function cleanupTopicSection(text: string) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function splitTopicSentenceWritingQuestionText(text: string): TopicSentenceWritingSections {
  const normalized = normalizeQuestionText(text || "");
  const empty: TopicSentenceWritingSections = {
    stem: "",
    hint: "",
    topic: "",
    wordBank: "",
    scrambled: "",
  };
  if (!normalized) return empty;

  type MarkerSpec = { key: keyof TopicSentenceWritingSections; re: RegExp };
  const markerSpecs: MarkerSpec[] = [
    { key: "hint", re: TSW_HINT_MARKER_RE },
    { key: "topic", re: TSW_TOPIC_MARKER_RE },
    { key: "wordBank", re: TSW_WORDBANK_MARKER_RE },
    { key: "scrambled", re: TSW_SCRAMBLED_MARKER_RE },
  ];

  // 1차 방어: 발문(첫 \n\n 블록)을 stem 으로 떼어내고 남은 본문에서만 마커를 찾는다.
  const blocks = normalized.split(/\n{2,}/);
  const firstBlock = (blocks[0] || "").trim();
  const firstIsMarker = Boolean(firstBlock) && ANY_TSW_MARKER_RE.test(firstBlock);
  const firstParagraphStem = firstIsMarker ? "" : cleanupTopicSection(firstBlock);
  const body = firstIsMarker ? normalized : blocks.slice(1).join("\n\n");

  // 2차 방어: 본문에서 마커를 "블록/라인 시작"에 앵커해 탐색(인라인 리터럴 무시).
  const hits = markerSpecs
    .map((spec) => {
      const match = body.match(spec.re);
      return match && match.index !== undefined
        ? { key: spec.key, start: match.index, end: match.index + match[0].length }
        : null;
    })
    .filter(
      (hit): hit is { key: keyof TopicSentenceWritingSections; start: number; end: number } =>
        hit !== null,
    )
    .sort((a, b) => a.start - b.start);

  if (hits.length === 0) {
    return { ...empty, stem: firstParagraphStem || cleanupTopicSection(firstBlock) };
  }

  const result: TopicSentenceWritingSections = { ...empty };
  const stemTail = cleanupTopicSection(body.slice(0, hits[0].start));
  result.stem = [firstParagraphStem, stemTail].filter(Boolean).join(" ").trim();

  hits.forEach((hit, index) => {
    const nextStart = hits[index + 1]?.start ?? body.length;
    result[hit.key] = cleanupTopicSection(body.slice(hit.end, nextStart));
  });

  return result;
}

export function questionStemAndBody(item: PaperItem): { stem: string; body: string } {
  const subType = item.sourceQuestion.subType;

  if (isSummaryCompleteSubtype(subType)) {
    const { stem } = splitSummaryCompleteMcQuestionText(item.questionText);
    return { stem, body: "" };
  }

  // 요약문 영작: 지시문(stem)만 헤더에 두고, [해석]/[요약문]/[보기]/[앞글자] 본문은
  // structuredSegments() 가 박스로 그린다.
  if (isSummaryWritingSubtype(subType)) {
    const { stem } = splitSummaryWritingQuestionText(item.questionText);
    return { stem, body: "" };
  }

  // 주제문 영작: 지시문(stem)만 헤더에 두고, [주제 힌트]/[주제문]/[보기]/[배열 단어] 본문은
  // structuredSegments() 가 박스로 그린다(SUMMARY_WRITING 미러).
  if (isTopicSentenceWritingSubtype(subType)) {
    const { stem } = splitTopicSentenceWritingQuestionText(item.questionText);
    return { stem, body: "" };
  }

  // 순서/주제·요지·제목·내용일치: 지시문(첫 단락)만 헤더에 두고
  // 나머지는 전용 본문 컴포넌트가 그린다.
  if (isStructuredAtomicSubtype(subType)) {
    return { stem: splitFirstParagraph(item.questionText).stem, body: "" };
  }

  // 평문 유형: 첫 단락은 지시문, 나머지는 본문(삽입 지문 등).
  return splitFirstParagraph(item.questionText);
}

// ---------------------------------------------------------------------------
// 구조화 본문(지문 박스/요약 박스/순서 단락/↓)을 "세그먼트" 목록으로 분해한다.
// 이 세그먼트들을 줄 단위로 흘려보내면(평문 본문과 동일) 칸/페이지 경계에서
// 깔끔하게 쪼개지면서 칸을 가득 채울 수 있다.
// ---------------------------------------------------------------------------
export type StructSegment =
  | { kind: "box"; boxStyle: "passage" | "summary" | "given"; text: string }
  | { kind: "arrow" }
  | { kind: "para"; label: string; text: string }
  | { kind: "text"; text: string };

type SentenceOrderMarker = {
  letter: "A" | "B" | "C";
  start: number;
  contentStart: number;
  strong: boolean;
};

const SENTENCE_ORDER_GIVEN_HEADER_RE =
  /^\s*\[(?:주어진\s*문장|given)\]\s*/i;
const SENTENCE_ORDER_MARKER_RE =
  /(^|[\s\n])(\(([A-Ca-c])\)|\[([A-Ca-c])\]|([A-Ca-c])[.)]|([A-C]))\s+(?=\S)/g;

function cleanSentenceOrderText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function collectSentenceOrderMarkers(text: string): SentenceOrderMarker[] {
  const markers: SentenceOrderMarker[] = [];
  SENTENCE_ORDER_MARKER_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SENTENCE_ORDER_MARKER_RE.exec(text)) !== null) {
    const prefix = match[1] || "";
    const markerText = match[2] || "";
    const strongLetter = match[3] || match[4] || match[5] || "";
    const bareLetter = match[6] || "";
    const rawLetter = strongLetter || bareLetter;
    if (!rawLetter) continue;

    markers.push({
      letter: rawLetter.toUpperCase() as "A" | "B" | "C",
      start: match.index + prefix.length,
      contentStart: match.index + match[0].length,
      strong: Boolean(strongLetter) || /[.)\]]$/.test(markerText),
    });
  }

  return markers;
}

function pickSentenceOrderMarkers(markers: SentenceOrderMarker[]) {
  const strongMarkers = markers.filter((marker) => marker.strong);
  const candidates = strongMarkers.length >= 2 ? strongMarkers : markers;
  const picked: SentenceOrderMarker[] = [];
  let cursor = -1;

  for (const letter of ["A", "B", "C"] as const) {
    const next = candidates.find(
      (marker) => marker.letter === letter && marker.start > cursor,
    );
    if (!next) return strongMarkers.length > 0 ? strongMarkers : [];
    picked.push(next);
    cursor = next.start;
  }

  return picked;
}

export function sentenceOrderSegmentsFromQuestionText(questionText: string): StructSegment[] {
  const body = splitFirstParagraph(questionText).body.replace(/\r/g, "").trim();
  if (!body) return [];

  const headerMatch = body.match(SENTENCE_ORDER_GIVEN_HEADER_RE);
  const bodyAfterHeader = headerMatch
    ? body.slice(headerMatch[0].length).trim()
    : body;
  const markers = pickSentenceOrderMarkers(collectSentenceOrderMarkers(bodyAfterHeader));
  const segs: StructSegment[] = [];

  if (markers.length === 0) {
    if (bodyAfterHeader) {
      segs.push(
        headerMatch
          ? { kind: "box", boxStyle: "given", text: cleanSentenceOrderText(bodyAfterHeader) }
          : { kind: "text", text: bodyAfterHeader },
      );
    }
    return segs;
  }

  const given = cleanSentenceOrderText(bodyAfterHeader.slice(0, markers[0].start));
  if (given) segs.push({ kind: "box", boxStyle: "given", text: given });

  markers.forEach((marker, index) => {
    const nextStart = markers[index + 1]?.start ?? bodyAfterHeader.length;
    const text = cleanSentenceOrderText(
      bodyAfterHeader.slice(marker.contentStart, nextStart),
    );
    if (text) segs.push({ kind: "para", label: `(${marker.letter})`, text });
  });

  return segs;
}

function parseSentenceInsertSegments(questionText: string): StructSegment[] {
  const body = splitFirstParagraph(questionText).body;
  const renderedBody = formatSentenceInsertPassageMarkers(body, "SENTENCE_INSERT");
  const { beforeText, givenText } = splitSentenceInsertGivenBlock(renderedBody, "SENTENCE_INSERT");
  const segs: StructSegment[] = [];

  if (givenText) {
    segs.push({
      kind: "box",
      boxStyle: "given",
      text: givenText.replace(/\s*\n\s*/g, " "),
    });
  }
  if (beforeText) {
    segs.push({ kind: "text", text: beforeText });
  }
  if (!segs.length && renderedBody) {
    segs.push({ kind: "text", text: renderedBody });
  }

  return segs;
}

// 구조화 유형의 본문 세그먼트(지시문 제외 — 지시문은 헤더에서 렌더).
function stripOriginalBlock(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !/^\[(?:original|\uC6D0\uBB38)\]\s*/i.test(block))
    .join("\n\n")
    .trim();
}

export function structuredSegments(item: PaperItem): StructSegment[] {
  const subType = item.sourceQuestion.subType;

  if (isSummaryCompleteSubtype(subType)) {
    const passage = summaryCompleteMcPassageForItem(item);
    const { summary: rawSummary } = splitSummaryCompleteMcQuestionText(item.questionText);
    const summary = summaryCompleteMcSummaryForItem(item, rawSummary);
    const segs: StructSegment[] = [];
    if (passage) segs.push({ kind: "box", boxStyle: "passage", text: passage });
    if (isSummaryCompleteMc(subType)) segs.push({ kind: "arrow" });
    if (summary) segs.push({ kind: "box", boxStyle: "summary", text: summary });
    return segs;
  }

  // 요약문 영작: [지문](테두리 박스) → [해석](회색) → [요약문]((A)(B) 빈칸선) → [보기](회색 칩).
  // 지문은 "무조건" 문제 안(요약문 위)에 인라인 렌더한다(사용자 요구·레퍼런스 형식, SUMMARY_COMPLETE 미러).
  // 화살표(↓)는 SUMMARY_COMPLETE_MC 전용이라 쓰지 않는다.
  // 정답계열은 questionText 에 애초에 직렬화되지 않으므로(이미 안전 직렬화) 마스킹 불필요.
  if (isSummaryWritingSubtype(subType)) {
    const passage = summaryCompleteMcPassageForItem(item);
    const sw = splitSummaryWritingQuestionText(item.questionText);
    const segs: StructSegment[] = [];
    if (passage) segs.push({ kind: "box", boxStyle: "passage", text: passage });
    if (sw.gloss) segs.push({ kind: "box", boxStyle: "given", text: `[해석] ${sw.gloss}` });
    if (sw.summary) segs.push({ kind: "box", boxStyle: "summary", text: `[요약문] ${sw.summary}` });
    if (sw.wordBank) segs.push({ kind: "box", boxStyle: "given", text: `[보기] ${sw.wordBank}` });
    if (sw.firstLetter)
      segs.push({ kind: "box", boxStyle: "given", text: `[앞글자] ${sw.firstLetter}` });
    return segs;
  }

  // 주제문 영작: [지문](테두리 박스) → [주제 힌트](회색) →
  //   cloze:    [주제문]((A)(B) 빈칸선, 본문색) + [보기](회색 칩)
  //   scrambled:[배열 단어](회색 칩)
  // SUMMARY_WRITING 미러. 정답계열은 questionText 에 직렬화되지 않으므로 마스킹 불필요.
  if (isTopicSentenceWritingSubtype(subType)) {
    const passage = summaryCompleteMcPassageForItem(item);
    const tsw = splitTopicSentenceWritingQuestionText(item.questionText);
    const segs: StructSegment[] = [];
    if (passage) segs.push({ kind: "box", boxStyle: "passage", text: passage });
    if (tsw.hint) segs.push({ kind: "box", boxStyle: "given", text: `[주제 힌트] ${tsw.hint}` });
    if (tsw.topic) segs.push({ kind: "box", boxStyle: "summary", text: `[주제문] ${tsw.topic}` });
    if (tsw.wordBank) segs.push({ kind: "box", boxStyle: "given", text: `[보기] ${tsw.wordBank}` });
    if (tsw.scrambled)
      segs.push({ kind: "box", boxStyle: "given", text: `[배열 단어] ${tsw.scrambled}` });
    return segs;
  }

  if (subType === "SENTENCE_ORDER") {
    return sentenceOrderSegmentsFromQuestionText(item.questionText);
  }

  // INLINE_SOURCE (주제/요지/제목/내용일치): 지시문 다음의 추가 안내문 + 출처 지문 박스.
  if (subType === "SENTENCE_INSERT") {
    return parseSentenceInsertSegments(item.questionText);
  }

  const bodyAfterStem = splitFirstParagraph(item.questionText).body;
  const rawPassage = normalizePassageText(
    item.passageContent || item.sourceQuestion.passage?.content || "",
  );
  const passage =
    subType === "WORD_ORDER" || subType === "SENTENCE_TRANSFORM"
      ? formatSourcePassageForQuestionItems(rawPassage, [item])
      : rawPassage;
  const alreadyHasEmbeddedPassage = questionHasEmbeddedPassage(item.sourceQuestion);
  const segs: StructSegment[] = [];
  if (PASSAGE_BEFORE_BODY_SUBTYPES.has(subType || "")) {
    if (passage) segs.push({ kind: "box", boxStyle: "passage", text: passage });
    const textBody =
      subType === "SENTENCE_TRANSFORM"
        ? stripOriginalBlock(bodyAfterStem)
        : bodyAfterStem;
    if (textBody) segs.push({ kind: "text", text: textBody });
  } else {
    if (bodyAfterStem) segs.push({ kind: "text", text: bodyAfterStem });
    if (!alreadyHasEmbeddedPassage && passage) {
      segs.push({ kind: "box", boxStyle: "passage", text: passage });
    }
  }
  return segs;
}

// 지시문과 본문을 다시 하나의 questionText 로 합친다(인라인 편집 커밋용).
export function recombineQuestionText(stem: string, body: string): string {
  const trimmedStem = stem.trim();
  const trimmedBody = body.trim();
  if (!trimmedBody) return trimmedStem;
  if (!trimmedStem) return trimmedBody;
  return `${trimmedStem}\n\n${trimmedBody}`;
}
