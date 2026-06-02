/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React from "react";
import type {
  GrammarPoint,
  SyntaxItem,
  VocabItem,
} from "@/types/passage-analysis";
import type { ExamPointData, Highlight, NoteCategory, Segment } from "./types";

export function countWords(t: string) {
  return t.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

export function vocabKey(v: VocabItem) {
  return `vocab:${v.sentenceIndex}:${v.word}:${v.meaning}`;
}

export function grammarKey(g: GrammarPoint) {
  return `grammar:${g.id || `${g.sentenceIndex}:${g.pattern}:${g.textFragment}`}`;
}

export function syntaxKey(s: SyntaxItem) {
  return `syntax:${s.sentenceIndex}:${s.keyPhrase || s.structure || s.chunkReading}`;
}

export function examKey(d: ExamPointData) {
  return `exam:${d.kind || "point"}:${d.sentenceIndex}:${d.original || d.text || d.example || ""}`;
}

export function keySentenceKey(index: number) {
  return `key:${index}`;
}

export function noteDomId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `passage-note-${Math.abs(hash)}-${id.length}`;
}

export function highlightCategory(type: Highlight["type"]): NoteCategory {
  return type === "exam" ? "exam" : type;
}

export function highlightNoteId(h: Highlight) {
  if (!h.data) return null;
  if (h.type === "vocab") return vocabKey(h.data as VocabItem);
  if (h.type === "grammar") return grammarKey(h.data as GrammarPoint);
  if (h.type === "syntax") return syntaxKey(h.data as SyntaxItem);
  return examKey(h.data as ExamPointData);
}

export function buildSearchIndex(text: string) {
  let normalized = "";
  const map: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/…/g, ".");

    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        normalized += " ";
        map.push(i);
        lastWasSpace = true;
      }
      continue;
    }

    normalized += ch;
    map.push(i);
    lastWasSpace = false;
  }

  return { normalized: normalized.trim(), map };
}

export function findTextRange(text: string, query: string): { start: number; end: number } | null {
  const cleanQuery = query?.replace(/\.{2,}$/, "").replace(/…$/, "").trim();
  if (!cleanQuery) return null;

  const direct = text.toLowerCase().indexOf(cleanQuery.toLowerCase());
  if (direct !== -1) return { start: direct, end: direct + cleanQuery.length };

  const source = buildSearchIndex(text);
  const target = buildSearchIndex(cleanQuery).normalized;
  if (!target) return null;

  const matched = source.normalized.indexOf(target);
  if (matched === -1) return null;

  const start = source.map[matched] ?? 0;
  const endSourceIndex = source.map[Math.min(matched + target.length - 1, source.map.length - 1)] ?? start;
  return { start, end: Math.min(endSourceIndex + 1, text.length) };
}

export function collectHighlights(
  text: string,
  vocab: VocabItem[],
  grammar: GrammarPoint[],
  syntax: SyntaxItem | undefined,
  examTexts: { text: string; data: ExamPointData }[],
): Highlight[] {
  const hl: Highlight[] = [];
  for (const v of vocab) {
    const range = findTextRange(text, v.word);
    if (range) hl.push({ ...range, type: "vocab", data: v });
  }
  for (const g of grammar) {
    const range = findTextRange(text, g.textFragment);
    if (range) hl.push({ ...range, type: "grammar", data: g });
  }
  if (syntax) {
    // Try keyPhrase first for precise highlight
    let matched = false;
    if (syntax.keyPhrase) {
      const range = findTextRange(text, syntax.keyPhrase);
      if (range) {
        hl.push({ ...range, type: "syntax", data: syntax });
        matched = true;
      }
    }
    // Fallback: highlight entire sentence so syntax is always clickable
    if (!matched && text.length > 0) {
      hl.push({ start: 0, end: text.length, type: "syntax", data: syntax });
    }
  }
  for (const et of examTexts) {
    const clean = et.text?.replace(/\.{2,}$/, "").replace(/…$/, "").trim();
    if (!clean || clean.length < 3) continue;
    const range = findTextRange(text, clean);
    if (!range && clean.split(" ").length >= 3) {
      const prefix = clean.split(" ").slice(0, 4).join(" ");
      const prefixRange = findTextRange(text, prefix);
      if (prefixRange) {
        const endIdx = Math.min(prefixRange.start + clean.length + 20, text.indexOf(".", prefixRange.end) + 1 || text.length);
        hl.push({ start: prefixRange.start, end: endIdx, type: "exam", data: et.data });
        continue;
      }
    }
    if (range) hl.push({ ...range, type: "exam", data: et.data });
  }
  return hl;
}

export function buildSegments(allHighlights: Highlight[]): Segment[] {
  if (allHighlights.length === 0) return [];
  const points = new Set<number>();
  for (const h of allHighlights) {
    points.add(h.start);
    points.add(h.end);
  }
  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    const active = allHighlights.filter((h) => h.start <= s && h.end >= e);
    if (active.length > 0) {
      segments.push({ start: s, end: e, types: new Set(active.map((h) => h.type)), highlights: active });
    }
  }
  return segments;
}

export function getSegmentStyle(types: Set<Highlight["type"]>): React.CSSProperties {
  const s: React.CSSProperties & { textDecorationSkipInk?: string } = {};
  if (types.has("exam")) {
    s.background = "linear-gradient(to top, var(--hl-exam-bg) 40%, transparent 40%)";
  } else if (types.has("vocab")) {
    s.background = "linear-gradient(to top, var(--hl-vocab-bg) 35%, transparent 35%)";
  }
  if (types.has("vocab")) {
    s.borderBottom = "2px solid #3b82f6";
  } else if (types.has("syntax") && !types.has("grammar")) {
    s.borderBottom = "2px dashed #0891b2";
  }
  if (types.has("exam") && types.has("vocab")) {
    s.borderBottom = "2px solid #3b82f6";
  }
  if (types.has("grammar")) {
    s.textDecoration = "underline wavy #8b5cf6";
    s.textUnderlineOffset = "3px";
    s.textDecorationSkipInk = "none";
  }
  return s;
}

export function highlightWord(text: string, word: string) {
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)}
      <span className="bg-blue-200 font-medium rounded px-0.5">{text.slice(i, i + word.length)}</span>
      {text.slice(i + word.length)}
    </span>
  );
}
