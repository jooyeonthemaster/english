import {
  isSummaryCompleteMc,
  splitSummaryCompleteMcQuestionText,
  summaryCompleteMcPassageForItem,
  summaryCompleteMcSummaryForItem,
} from "./summary-complete-mc-layout";
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
]);

const STRUCTURED_ATOMIC_SUBTYPES = new Set([
  ...INLINE_SOURCE_PASSAGE_SUBTYPES,
  "SUMMARY_COMPLETE_MC",
  "SENTENCE_ORDER",
]);

export function isStructuredAtomicSubtype(subType?: string | null): boolean {
  return STRUCTURED_ATOMIC_SUBTYPES.has(subType || "");
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

export function questionStemAndBody(item: PaperItem): { stem: string; body: string } {
  const subType = item.sourceQuestion.subType;

  if (isSummaryCompleteMc(subType)) {
    const { stem } = splitSummaryCompleteMcQuestionText(item.questionText);
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

function parseSentenceOrderSegments(questionText: string): StructSegment[] {
  const lines = questionText
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bodyLines = lines.slice(1); // 첫 줄(지시문)은 헤더에서 렌더

  let given = "";
  let collectingGiven = false;
  const paras: { label: string; text: string }[] = [];
  let current: { label: string; text: string } | null = null;
  const extra: string[] = [];

  for (const line of bodyLines) {
    const givenMatch = line.match(/^\[(?:주어진\s*문장|given)\]\s*(.*)$/i);
    if (givenMatch) {
      given = givenMatch[1].trim();
      current = null;
      collectingGiven = true;
      continue;
    }
    const paraMatch = line.match(/^\(([A-C])\)\s*(.+)$/);
    if (paraMatch) {
      collectingGiven = false;
      current = { label: `(${paraMatch[1]})`, text: paraMatch[2].trim() };
      paras.push(current);
      continue;
    }
    if (current) current.text = `${current.text} ${line}`.trim();
    else if (collectingGiven) given = `${given} ${line}`.trim();
    else extra.push(line);
  }

  const segs: StructSegment[] = [];
  if (given) segs.push({ kind: "box", boxStyle: "given", text: given });
  for (const para of paras) segs.push({ kind: "para", label: para.label, text: para.text });
  if (extra.length) segs.push({ kind: "text", text: extra.join("\n") });
  return segs;
}

// 구조화 유형의 본문 세그먼트(지시문 제외 — 지시문은 헤더에서 렌더).
export function structuredSegments(item: PaperItem): StructSegment[] {
  const subType = item.sourceQuestion.subType;

  if (isSummaryCompleteMc(subType)) {
    const passage = summaryCompleteMcPassageForItem(item);
    const { summary: rawSummary } = splitSummaryCompleteMcQuestionText(item.questionText);
    const summary = summaryCompleteMcSummaryForItem(item, rawSummary);
    const segs: StructSegment[] = [];
    if (passage) segs.push({ kind: "box", boxStyle: "passage", text: passage });
    segs.push({ kind: "arrow" });
    if (summary) segs.push({ kind: "box", boxStyle: "summary", text: summary });
    return segs;
  }

  if (subType === "SENTENCE_ORDER") {
    return parseSentenceOrderSegments(item.questionText);
  }

  // INLINE_SOURCE (주제/요지/제목/내용일치): 지시문 다음의 추가 안내문 + 출처 지문 박스.
  const passage = normalizePassageText(
    item.passageContent || item.sourceQuestion.passage?.content || "",
  );
  const bodyAfterStem = splitFirstParagraph(item.questionText).body;
  const segs: StructSegment[] = [];
  if (bodyAfterStem) segs.push({ kind: "text", text: bodyAfterStem });
  if (passage) segs.push({ kind: "box", boxStyle: "passage", text: passage });
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
