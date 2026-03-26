import { Mark, mergeAttributes } from "@tiptap/core";

// ─── 1. Vocab Mark: 핵심 어휘 ────────────────────────────
export const VocabMark = Mark.create({
  name: "vocabHighlight",
  addAttributes() {
    return {
      memo: { default: "" },
      id: { default: "" },
    };
  },
  parseHTML() { return [{ tag: 'span[data-vocab]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-vocab": "", class: "ann-vocab" }), 0];
  },
});

// ─── 2. Grammar Mark: 문법/어법 ─────────────────────────
export const GrammarMark = Mark.create({
  name: "grammarHighlight",
  addAttributes() {
    return {
      memo: { default: "" },
      id: { default: "" },
    };
  },
  parseHTML() { return [{ tag: 'span[data-grammar]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-grammar": "", class: "ann-grammar" }), 0];
  },
});

// ─── 3. Syntax Mark: 구문 분석 ──────────────────────────
export const SyntaxMark = Mark.create({
  name: "syntaxHighlight",
  addAttributes() {
    return {
      memo: { default: "" },
      id: { default: "" },
    };
  },
  parseHTML() { return [{ tag: 'span[data-syntax]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-syntax": "", class: "ann-syntax" }), 0];
  },
});

// ─── 4. Key Sentence Mark: 핵심 문장 ────────────────────
export const SentenceMark = Mark.create({
  name: "sentenceHighlight",
  addAttributes() {
    return {
      memo: { default: "" },
      id: { default: "" },
    };
  },
  parseHTML() { return [{ tag: 'span[data-sentence]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-sentence": "", class: "ann-sentence" }), 0];
  },
});

// ─── 5. Exam Point Mark: 출제 포인트 ────────────────────
export const ExamPointMark = Mark.create({
  name: "examPointHighlight",
  addAttributes() {
    return {
      memo: { default: "" },
      id: { default: "" },
    };
  },
  parseHTML() { return [{ tag: 'span[data-exam]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-exam": "", class: "ann-exam" }), 0];
  },
});

// ─── Types ───────────────────────────────────────────────
export interface Annotation {
  id: string;
  type: AnnotationType;
  text: string;
  memo: string;
  from: number;
  to: number;
}

export type AnnotationType = "vocab" | "grammar" | "syntax" | "sentence" | "examPoint";

export function generateAnnotationId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const MARK_NAME_MAP: Record<AnnotationType, string> = {
  vocab: "vocabHighlight",
  grammar: "grammarHighlight",
  syntax: "syntaxHighlight",
  sentence: "sentenceHighlight",
  examPoint: "examPointHighlight",
};
