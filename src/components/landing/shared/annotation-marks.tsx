"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Five annotation styles — these MUST match the production passage editor
 * (passage-annotation-editor.tsx) so the landing page reads as the actual product.
 */

const baseInline: CSSProperties = {
  display: "inline",
  cursor: "default",
};

export type AnnotationKind =
  | "vocab"
  | "grammar"
  | "syntax"
  | "sentence"
  | "examPoint";

export const ANNOTATION_COLORS: Record<AnnotationKind, string> = {
  vocab: "#3b82f6",
  grammar: "#8b5cf6",
  syntax: "#0891b2",
  sentence: "#22c55e",
  examPoint: "#eab308",
};

export const ANNOTATION_LABEL: Record<AnnotationKind, string> = {
  vocab: "어휘",
  grammar: "문법",
  syntax: "구문",
  sentence: "핵심문장",
  examPoint: "출제포인트",
};

export function VocabMark({ children, drawing = false }: { children: ReactNode; drawing?: boolean }) {
  return (
    <span
      style={{
        ...baseInline,
        background: drawing
          ? "transparent"
          : "linear-gradient(to top, #dbeafe 35%, transparent 35%)",
        borderBottom: drawing ? "2px solid transparent" : "2px solid #3b82f6",
        padding: "0 1px",
        transition: "background 600ms ease, border-color 600ms ease",
      }}
    >
      {children}
    </span>
  );
}

export function GrammarMark({ children, drawing = false }: { children: ReactNode; drawing?: boolean }) {
  return (
    <span
      style={{
        ...baseInline,
        textDecoration: drawing ? "none" : "underline wavy #8b5cf6",
        textDecorationThickness: "2px",
        textUnderlineOffset: "3px",
        transition: "text-decoration-color 600ms ease",
      }}
    >
      {children}
    </span>
  );
}

export function SyntaxMark({ children, drawing = false }: { children: ReactNode; drawing?: boolean }) {
  return (
    <span
      style={{
        ...baseInline,
        borderBottom: drawing ? "2px dashed transparent" : "2px dashed #0891b2",
        padding: "0 1px",
        transition: "border-color 600ms ease",
      }}
    >
      {children}
    </span>
  );
}

export function SentenceMark({ children, drawing = false }: { children: ReactNode; drawing?: boolean }) {
  return (
    <span
      style={{
        ...baseInline,
        background: drawing
          ? "transparent"
          : "linear-gradient(to right, #22c55e 3px, #f0fdf4 3px)",
        padding: "2px 6px 2px 8px",
        borderRadius: "1px",
        transition: "background 600ms ease",
      }}
    >
      {children}
    </span>
  );
}

export function ExamPointMark({ children, drawing = false }: { children: ReactNode; drawing?: boolean }) {
  return (
    <span
      style={{
        ...baseInline,
        background: drawing
          ? "transparent"
          : "linear-gradient(to top, #fef08a 40%, transparent 40%)",
        padding: "0 1px",
        transition: "background 600ms ease",
      }}
    >
      {children}
    </span>
  );
}

export function MarkByKind({
  kind,
  children,
  drawing,
}: {
  kind: AnnotationKind;
  children: ReactNode;
  drawing?: boolean;
}) {
  switch (kind) {
    case "vocab":
      return <VocabMark drawing={drawing}>{children}</VocabMark>;
    case "grammar":
      return <GrammarMark drawing={drawing}>{children}</GrammarMark>;
    case "syntax":
      return <SyntaxMark drawing={drawing}>{children}</SyntaxMark>;
    case "sentence":
      return <SentenceMark drawing={drawing}>{children}</SentenceMark>;
    case "examPoint":
      return <ExamPointMark drawing={drawing}>{children}</ExamPointMark>;
  }
}
