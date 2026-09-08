// 기출 문항 미리보기 — 순수 토큰화·모델(정본 docs/gichul-question-bank-spec.md §11.2 「텍스트만, 조판기 렌더 금지」).
//
// bank-preview.tsx(팝오버·fetch·렌더)에서 분리한 이유: 파일 500줄 규칙 + 이 부분은 DOM·React 와 무관한 순수
// 함수라 단위 하네스가 그대로 import 할 수 있다. 구 bank-question-preview.tsx 에서 **이동 복제**(§11.8).
//
// 시험지 빌더(paper-builder)는 PaperItem 파이프라인이라 무거워 import 하지 않고, 빌더와 **같은 문법**만
// 토큰화한다(paper-item-utils.tsx renderFormattedInline 정규식·option-display.ts 변환).
//   __x__ → 밑줄 · __(A) x__/__① x__ → 마커+밑줄 · _____ → 빈칸 · ①~⑤ → 볼드 파랑 마커 · [주어진 문장] → 회색 박스
//   (A)(B)(C) 단락 → 라벨(글의순서) · ↓ + 요약 박스 → 요약문
// 선지: 마커 4유형(어법·어휘·무관·삽입)은 목록 미렌더(빌더 동일).

import type { ExamBankItem } from "@/lib/exam-passages/question-bank-types";

export type PreviewToken =
  | { kind: "text"; text: string }
  | { kind: "underline"; text: string; marker: string | null; index: number | null }
  | { kind: "marker"; text: string; index: number | null }
  | { kind: "blank"; label: string | null };

const CIRCLED_LETTER_SUBTYPES = new Set(["GRAMMAR_ERROR", "VOCAB_CHOICE", "IRRELEVANT", "SENTENCE_INSERT"]);
const OPTION_LIST_HIDDEN_SUBTYPES = new Set(["GRAMMAR_ERROR", "IRRELEVANT", "SENTENCE_INSERT", "VOCAB_CHOICE"]);
/** 지문 박스 유형 — 본문이 별도 Passage 에서 온다(팝오버 2단계 fetch 대상). */
export const PASSAGE_BOX_SUBTYPES = new Set(["TOPIC", "MAIN_IDEA", "TITLE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"]);
const INLINE_RE = /__([^_]+)__|_{3,}|([①-⑳ⓐ-ⓩ])|\(([a-jA-J])\)/g;

function circled(index: number): string {
  return index >= 0 && index < 20 ? String.fromCodePoint(0x2460 + index) : `(${index + 1})`;
}
function circledIndex(ch: string): number | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  if (cp >= 0x2460 && cp <= 0x2473) return cp - 0x2460;
  if (cp >= 0x24d0 && cp <= 0x24e9) return cp - 0x24d0;
  return null;
}
function letterIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}
function letterMarkerDisplay(letter: string, subType: string): string {
  return CIRCLED_LETTER_SUBTYPES.has(subType) ? circled(letterIndex(letter)) : `(${letter.toUpperCase()})`;
}

/** 인라인 문법 토큰화(빌더 renderFormattedInline 과 같은 정규식·표시 변환). */
export function tokenizeInline(text: string, subType: string): PreviewToken[] {
  const out: PreviewToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      const c = m[1].match(/^([①-⑳ⓐ-ⓩ])\s*(.+)$/);
      const p = c ? null : m[1].match(/^\(([a-jA-J])\)\s*(.+)$/);
      if (c) {
        const idx = circledIndex(c[1]);
        out.push({ kind: "underline", text: c[2], marker: idx === null ? c[1] : circled(idx), index: idx });
      } else if (p) {
        out.push({ kind: "underline", text: p[2], marker: letterMarkerDisplay(p[1], subType), index: letterIndex(p[1]) });
      } else {
        out.push({ kind: "underline", text: m[1], marker: null, index: null });
      }
    } else if (m[2] !== undefined) {
      const idx = circledIndex(m[2]);
      out.push({ kind: "marker", text: idx === null ? m[2] : circled(idx), index: idx });
    } else if (m[3] !== undefined) {
      if (/^[a-j]$/.test(m[3])) out.push({ kind: "text", text: `(${m[3]})` });
      else if (subType === "SUMMARY_COMPLETE_MC") out.push({ kind: "blank", label: `(${m[3].toUpperCase()})` });
      else out.push({ kind: "marker", text: letterMarkerDisplay(m[3], subType), index: letterIndex(m[3]) });
    } else {
      out.push({ kind: "blank", label: null });
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export interface PreviewModel {
  subType: string;
  stem: string;
  given: string;
  passage: string | null;
  paragraphs: { label: string; text: string }[];
  summary: string;
  footnotes: string[];
  /** null = 마커 유형(선지 목록 미렌더) */
  options: { label: string; text: string }[] | null;
  answerIndex: number | null;
  answerLabel: string;
  sourcePassageMissing: boolean;
}

const GIVEN_RE = /(?:^|\n)[ \t]*\[(?:주어진\s*문장|given)\][ \t]*([\s\S]*?)(?=\n\n|$)/i;

export function answerIndexOf(item: Pick<ExamBankItem, "correctAnswer" | "options">): number | null {
  const a = item.correctAnswer.trim();
  if (!a) return null;
  const byLabel = item.options.findIndex((o) => o.label.trim() === a);
  if (byLabel >= 0) return byLabel;
  const ci = circledIndex(a);
  if (ci !== null) return ci;
  const letter = a.match(/^\(?([A-Ja-j])\)?$/);
  if (letter) return letterIndex(letter[1]);
  const num = a.match(/^\(?(\d{1,2})\)?$/);
  if (num) return Number(num[1]) - 1;
  return null;
}

/** 은행 항목 → 미리보기 구조(순수). passageText=null 이면 지문 박스 유형은 sourcePassageMissing 으로 표시. */
export function buildPreviewModel(item: ExamBankItem, passageText: string | null): PreviewModel {
  const subType = item.subType;
  const normalized = (item.questionText ?? "").replace(/\r\n?/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  let rest = blocks.slice(1).join("\n\n");
  // 각주(* word: 뜻)는 본문에서 떼고 item.footnotes 로 그린다.
  rest = rest
    .split("\n")
    .filter((line) => !/^\s*\*+\s*\S/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let given = "";
  const g = GIVEN_RE.exec(rest);
  if (g && g.index !== undefined) {
    given = (g[1] ?? "").trim();
    rest = `${rest.slice(0, g.index)}\n${rest.slice(g.index + g[0].length)}`.replace(/\n{2,}/g, "\n\n").trim();
  }

  const paragraphs: { label: string; text: string }[] = [];
  let summary = "";
  let passage: string | null = rest;
  let sourcePassageMissing = false;

  if (subType === "SENTENCE_ORDER") {
    for (const line of rest.split("\n")) {
      const pm = line.match(/^\s*\(([A-D])\)\s*(.*)$/);
      if (pm) paragraphs.push({ label: `(${pm[1]})`, text: pm[2].trim() });
      else if (paragraphs.length > 0 && line.trim()) paragraphs[paragraphs.length - 1].text += ` ${line.trim()}`;
    }
    passage = paragraphs.length > 0 ? null : rest;
  } else if (subType === "SUMMARY_COMPLETE_MC") {
    summary = rest.replace(/^↓\s*/, "").trim() || String(item.structuredData?.summaryWithBlanks ?? "");
    passage = passageText;
    sourcePassageMissing = !passageText;
  } else if (PASSAGE_BOX_SUBTYPES.has(subType)) {
    passage = passageText ?? (rest || null);
    sourcePassageMissing = !passageText && !rest;
  }

  const answerIndex = answerIndexOf(item);
  const options = OPTION_LIST_HIDDEN_SUBTYPES.has(subType)
    ? null
    : item.options.map((o, i) => ({ label: circled(i), text: o.text }));
  return {
    subType,
    stem: item.direction || blocks[0] || "",
    given,
    passage: passage && passage.trim() ? passage : null,
    paragraphs,
    summary,
    footnotes: item.footnotes ?? [],
    options,
    answerIndex,
    answerLabel: answerIndex === null ? item.correctAnswer : circled(answerIndex),
    sourcePassageMissing,
  };
}
