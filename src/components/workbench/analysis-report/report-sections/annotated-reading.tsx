import { type ClipboardEvent, type FocusEvent, Fragment, type ReactNode, useRef } from "react";
import { normalizeEditableText } from "@/components/exams/paper-builder/components/editable-text";
import { cn } from "@/lib/utils";
import type { VocabularyNoteRef } from "./types";
import { handleEditableKeyDown, highlightKeywords } from "./editable-field";
import { findVocabularyInlineMatches, vocabularyGlossLabel } from "./vocabulary";

export function renderAnnotatedReadingText(text: string, highlights: string[], vocabNotes: VocabularyNoteRef[]): ReactNode {
  const matches = findVocabularyInlineMatches(text, vocabNotes);
  if (!matches.length) return highlightKeywords(text, highlights);

  const nodes: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      nodes.push(<Fragment key={`t-${cursor}`}>{highlightKeywords(text.slice(cursor, match.start), highlights)}</Fragment>);
    }
    const surface = text.slice(match.start, match.end);
    nodes.push(
      <span key={`v-${match.note.sectionIndex}-${match.note.rowIndex}-${index}`} className="par-read-word-note">
        <span className="par-read-word-surface">{surface}</span>
        <span className="par-read-word-gloss" contentEditable={false} data-par-ignore="true">
          <span className="par-read-word-gloss-head">{vocabularyGlossLabel(match.note)}</span>
          <span className="par-read-word-gloss-meaning">{match.note.row.meaning}</span>
        </span>
      </span>,
    );
    cursor = match.end;
  });

  if (cursor < text.length) nodes.push(<Fragment key={`t-${cursor}`}>{highlightKeywords(text.slice(cursor), highlights)}</Fragment>);
  return nodes;
}

export function readEditableTextIgnoringAnnotations(root: HTMLElement): string {
  let out = "";
  const addNewline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.dataset.parIgnore === "true") return;
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      const isBlock = el.tagName === "DIV" || el.tagName === "P" || el.tagName === "LI";
      if (isBlock) addNewline();
      walk(el);
      if (isBlock) addNewline();
    });
  };
  walk(root);
  return out;
}

export function AnnotatedReadingField({
  editable,
  value,
  onCommit,
  highlights,
  vocabNotes,
}: {
  editable: boolean;
  value: string;
  onCommit: (v: string) => void;
  highlights: string[];
  vocabNotes: VocabularyNoteRef[];
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const isEmpty = !value.trim();
  if (!editable) {
    return <p className="par-read-en par-read-en-annotated">{renderAnnotatedReadingText(value, highlights, vocabNotes)}</p>;
  }

  return (
    <p
      ref={ref}
      className={cn("par-read-en par-read-en-annotated par-edit-field", isEmpty && "par-edit-empty")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph="—"
      onBlur={(e: FocusEvent<HTMLElement>) => {
        const next = normalizeEditableText(readEditableTextIgnoringAnnotations(e.currentTarget));
        if (next !== value) onCommit(next);
      }}
      onKeyDown={handleEditableKeyDown}
      onPaste={(e: ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, pasted);
      }}
    >
      {renderAnnotatedReadingText(value, highlights, vocabNotes)}
    </p>
  );
}

const READING_SENTENCE_SPLIT_AT = 10_000;
const READING_SENTENCE_TARGET_CHARS = 88;

export function splitReadingSentenceText(text: string): string[] {
  const normalized = text.trim();
  if (normalized.length <= READING_SENTENCE_SPLIT_AT) return [text];
  const words = normalized.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > READING_SENTENCE_TARGET_CHARS) {
      parts.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) parts.push(current);
  return parts.length > 1 ? parts : [text];
}

export function joinReadingSentenceParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}
