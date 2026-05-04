/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  X,
  ArrowRightLeft,
  Target,
  Braces,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  PassageAnalysisData,
  VocabItem,
  GrammarPoint,
  SentenceAnalysis,
  SyntaxItem,
} from "@/types/passage-analysis";

// ─── Types ───────────────────────────────────────────────
interface Props {
  content: string;
  analysisData: PassageAnalysisData | null;
  /** "horizontal" (default): 지문|분석 가로 배치. "vertical": 지문 위, 분석 아래 세로 배치 */
  layout?: "horizontal" | "vertical";
}

interface Highlight {
  start: number;
  end: number;
  type: "vocab" | "grammar" | "syntax" | "exam";
  data: VocabItem | GrammarPoint | SyntaxItem | ExamPointData | null;
}

type ActiveDetail =
  | { kind: "vocab"; item: VocabItem; sentence: SentenceAnalysis | null }
  | { kind: "grammar"; item: GrammarPoint; sentence: SentenceAnalysis | null }
  | { kind: "syntax"; item: SyntaxItem; sentence: SentenceAnalysis | null }
  | { kind: "keySentence"; sentence: SentenceAnalysis; role: string; summary: string; isTopicSentence: boolean }
  | { kind: "examPoint"; text: string; alternatives?: string[]; transformType?: string; example?: string; reason?: string; questionExample?: string; difficulty?: string; relatedPoint?: string }
  | null;

type NoteCategory = "vocab" | "grammar" | "syntax" | "key" | "exam";

interface FocusedNote {
  id: string;
  category: NoteCategory;
  pulseKey: number;
}

interface KeySentenceCollectionData {
  role: string;
  summary: string;
  isTopicSentence: boolean;
}

interface ExamPointData {
  kind?: "paraphrase" | "transform" | string;
  sentenceIndex: number;
  original?: string;
  text?: string;
  example?: string;
  alternatives?: string[];
  transformType?: string;
  reason?: string;
  questionExample?: string;
  difficulty?: string;
  relatedPoint?: string;
}

interface CollectionEntry {
  id: string;
  category: NoteCategory;
  item: VocabItem | GrammarPoint | SyntaxItem | KeySentenceCollectionData | ExamPointData;
  sentence: SentenceAnalysis | null;
  sentenceIndex: number;
  visible: boolean;
}

// ─── Helpers ─────────────────────────────────────────────
function countWords(t: string) { return t.trim().split(/\s+/).filter(w => w.length > 0).length; }

const DIFF_LABELS: Record<string, { label: string; cls: string }> = {
  basic: { label: "기본", cls: "bg-emerald-100 text-emerald-700" },
  intermediate: { label: "심화", cls: "bg-blue-100 text-blue-700" },
  advanced: { label: "고난도", cls: "bg-red-100 text-red-700" },
};

const TYPE_PRIORITY: Record<Highlight["type"], number> = { exam: 4, grammar: 3, syntax: 2, vocab: 1 };

const CATEGORY_META: Record<NoteCategory, {
  label: string;
  title: string;
  dot: string;
  text: string;
  soft: string;
  border: string;
  active: string;
  ring: string;
}> = {
  vocab: {
    label: "어휘",
    title: "어휘 정리본",
    dot: "bg-blue-500",
    text: "text-blue-600",
    soft: "bg-blue-50",
    border: "border-blue-200",
    active: "bg-blue-50 border-blue-200 text-blue-700",
    ring: "ring-blue-300",
  },
  grammar: {
    label: "문법",
    title: "문법 정리본",
    dot: "bg-violet-500",
    text: "text-violet-600",
    soft: "bg-violet-50",
    border: "border-violet-200",
    active: "bg-violet-50 border-violet-200 text-violet-700",
    ring: "ring-violet-300",
  },
  syntax: {
    label: "구문",
    title: "구문 분석본",
    dot: "bg-cyan-500",
    text: "text-cyan-600",
    soft: "bg-cyan-50",
    border: "border-cyan-200",
    active: "bg-cyan-50 border-cyan-200 text-cyan-700",
    ring: "ring-cyan-300",
  },
  key: {
    label: "핵심문장",
    title: "핵심문장 정리본",
    dot: "bg-green-500",
    text: "text-green-600",
    soft: "bg-green-50",
    border: "border-green-200",
    active: "bg-green-50 border-green-200 text-green-700",
    ring: "ring-green-300",
  },
  exam: {
    label: "출제포인트",
    title: "출제포인트 정리본",
    dot: "bg-yellow-500",
    text: "text-yellow-600",
    soft: "bg-yellow-50",
    border: "border-yellow-200",
    active: "bg-yellow-50 border-yellow-200 text-yellow-700",
    ring: "ring-yellow-300",
  },
};

const FOCUS_STYLES: Record<NoteCategory, React.CSSProperties> = {
  vocab: {
    background: "linear-gradient(to top, #bfdbfe 78%, transparent 78%)",
    boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.38), 0 0 0 7px rgba(59, 130, 246, 0.12)",
    borderRadius: 4,
  },
  grammar: {
    background: "rgba(237, 233, 254, 0.92)",
    boxShadow: "0 0 0 2px rgba(139, 92, 246, 0.4), 0 0 0 7px rgba(139, 92, 246, 0.12)",
    borderRadius: 4,
  },
  syntax: {
    background: "rgba(207, 250, 254, 0.92)",
    boxShadow: "0 0 0 2px rgba(8, 145, 178, 0.4), 0 0 0 7px rgba(8, 145, 178, 0.12)",
    borderRadius: 4,
  },
  key: {
    background: "rgba(220, 252, 231, 0.9)",
    boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.42), 0 0 0 7px rgba(34, 197, 94, 0.12)",
    borderRadius: 6,
  },
  exam: {
    background: "linear-gradient(to top, #fde68a 82%, transparent 82%)",
    boxShadow: "0 0 0 2px rgba(234, 179, 8, 0.45), 0 0 0 7px rgba(234, 179, 8, 0.14)",
    borderRadius: 4,
  },
};

function vocabKey(v: VocabItem) {
  return `vocab:${v.sentenceIndex}:${v.word}:${v.meaning}`;
}

function grammarKey(g: GrammarPoint) {
  return `grammar:${g.id || `${g.sentenceIndex}:${g.pattern}:${g.textFragment}`}`;
}

function syntaxKey(s: SyntaxItem) {
  return `syntax:${s.sentenceIndex}:${s.keyPhrase || s.structure || s.chunkReading}`;
}

function examKey(d: ExamPointData) {
  return `exam:${d.kind || "point"}:${d.sentenceIndex}:${d.original || d.text || d.example || ""}`;
}

function keySentenceKey(index: number) {
  return `key:${index}`;
}

function noteDomId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `passage-note-${Math.abs(hash)}-${id.length}`;
}

function highlightCategory(type: Highlight["type"]): NoteCategory {
  return type === "exam" ? "exam" : type;
}

function highlightNoteId(h: Highlight) {
  if (!h.data) return null;
  if (h.type === "vocab") return vocabKey(h.data as VocabItem);
  if (h.type === "grammar") return grammarKey(h.data as GrammarPoint);
  if (h.type === "syntax") return syntaxKey(h.data as SyntaxItem);
  return examKey(h.data as ExamPointData);
}

function buildSearchIndex(text: string) {
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

function findTextRange(text: string, query: string): { start: number; end: number } | null {
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

function collectHighlights(text: string, vocab: VocabItem[], grammar: GrammarPoint[], syntax: SyntaxItem | undefined, examTexts: { text: string; data: ExamPointData }[]): Highlight[] {
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

interface Segment {
  start: number;
  end: number;
  types: Set<Highlight["type"]>;
  highlights: Highlight[];
}

function buildSegments(allHighlights: Highlight[]): Segment[] {
  if (allHighlights.length === 0) return [];
  const points = new Set<number>();
  for (const h of allHighlights) { points.add(h.start); points.add(h.end); }
  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], e = sorted[i + 1];
    const active = allHighlights.filter(h => h.start <= s && h.end >= e);
    if (active.length > 0) {
      segments.push({ start: s, end: e, types: new Set(active.map(h => h.type)), highlights: active });
    }
  }
  return segments;
}

function getSegmentStyle(types: Set<Highlight["type"]>): React.CSSProperties {
  const s: React.CSSProperties & { textDecorationSkipInk?: string } = {};
  if (types.has("exam")) {
    s.background = "linear-gradient(to top, #fef08a 40%, transparent 40%)";
  } else if (types.has("vocab")) {
    s.background = "linear-gradient(to top, #dbeafe 35%, transparent 35%)";
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

function highlightWord(text: string, word: string) {
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i === -1) return <span>{text}</span>;
  return <span>{text.slice(0, i)}<span className="bg-blue-200 font-medium rounded px-0.5">{text.slice(i, i + word.length)}</span>{text.slice(i + word.length)}</span>;
}

// ─── Main Component ──────────────────────────────────────
export function InteractivePassageView({ content, analysisData, layout = "horizontal" }: Props) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>(null);
  const [activeCollection, setActiveCollection] = useState<NoteCategory | null>(null);
  const [focusedNote, setFocusedNote] = useState<FocusedNote | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  // Track last clicked segment for cycling through overlapping highlights
  const lastClickRef = React.useRef<{ key: string; index: number }>({ key: "", index: -1 });

  const wordCount = useMemo(() => countWords(content), [content]);
  const hasAnalysis = analysisData !== null;

  React.useEffect(() => {
    if (!focusedNote) return;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(noteDomId(focusedNote.id));
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
  }, [focusedNote]);

  // ─── Data maps ─────────────────────────────────────────
  const sentenceMap = useMemo(() => {
    if (!analysisData) return new Map<number, SentenceAnalysis>();
    return new Map((analysisData.sentences || []).map(s => [s.index, s]));
  }, [analysisData]);

  const vocabBySentence = useMemo(() => {
    if (!analysisData) return new Map<number, VocabItem[]>();
    const m = new Map<number, VocabItem[]>();
    for (const v of analysisData.vocabulary || []) { const a = m.get(v.sentenceIndex) || []; a.push(v); m.set(v.sentenceIndex, a); }
    return m;
  }, [analysisData]);

  const grammarBySentence = useMemo(() => {
    if (!analysisData) return new Map<number, GrammarPoint[]>();
    const m = new Map<number, GrammarPoint[]>();
    for (const g of analysisData.grammarPoints || []) { const a = m.get(g.sentenceIndex) || []; a.push(g); m.set(g.sentenceIndex, a); }
    return m;
  }, [analysisData]);

  const syntaxBySentence = useMemo(() => {
    if (!analysisData?.syntaxAnalysis) return new Map<number, SyntaxItem>();
    return new Map(analysisData.syntaxAnalysis.map(s => [s.sentenceIndex, s]));
  }, [analysisData]);

  const keySentenceIndices = useMemo(() => {
    if (!analysisData) return new Set<number>();
    const set = new Set<number>();
    if (analysisData.structure?.topicSentenceIndex != null) set.add(analysisData.structure.topicSentenceIndex);
    if (analysisData.structure?.logicFlow) {
      for (const f of analysisData.structure.logicFlow) {
        if (f.role === "주장" || f.role === "결론") for (const idx of f.sentenceIndices) set.add(idx);
      }
    }
    return set;
  }, [analysisData]);

  // Exam highlights — include both paraphrasable + transform points with their data
  const examHighlightsBySentence = useMemo(() => {
    if (!analysisData?.examDesign) return new Map<number, { text: string; data: ExamPointData }[]>();
    const m = new Map<number, { text: string; data: ExamPointData }[]>();
    for (const seg of analysisData.examDesign.paraphrasableSegments || []) {
      const a = m.get(seg.sentenceIndex) || [];
      a.push({ text: seg.original, data: { kind: "paraphrase", ...seg } });
      m.set(seg.sentenceIndex, a);
    }
    for (const tp of analysisData.examDesign.structureTransformPoints || []) {
      const a = m.get(tp.sentenceIndex) || [];
      a.push({ text: tp.original, data: { kind: "transform", ...tp } });
      m.set(tp.sentenceIndex, a);
    }
    return m;
  }, [analysisData]);

  const noteSummary = useMemo(() => {
    const visibleKeys: Record<NoteCategory, Set<string>> = {
      vocab: new Set(),
      grammar: new Set(),
      syntax: new Set(),
      key: new Set(),
      exam: new Set(),
    };
    const emptyCounts = { vocab: 0, grammar: 0, syntax: 0, key: 0, exam: 0 };
    if (!analysisData) {
      return { counts: emptyCounts, rawCounts: emptyCounts, visibleKeys };
    }

    for (const sentence of analysisData.sentences || []) {
      const vocab = vocabBySentence.get(sentence.index) || [];
      const grammar = grammarBySentence.get(sentence.index) || [];
      const syntax = syntaxBySentence.get(sentence.index);
      const examTexts = examHighlightsBySentence.get(sentence.index) || [];
      const highlights = collectHighlights(sentence.english, vocab, grammar, syntax, examTexts);

      for (const h of highlights) {
        if (h.type === "vocab" && h.data) visibleKeys.vocab.add(vocabKey(h.data as VocabItem));
        if (h.type === "grammar" && h.data) visibleKeys.grammar.add(grammarKey(h.data as GrammarPoint));
        if (h.type === "syntax" && h.data) visibleKeys.syntax.add(syntaxKey(h.data as SyntaxItem));
        if (h.type === "exam" && h.data) visibleKeys.exam.add(examKey(h.data));
      }
    }

    for (const index of keySentenceIndices) {
      if (sentenceMap.has(index)) visibleKeys.key.add(keySentenceKey(index));
    }

    const rawCounts = {
      vocab: analysisData.vocabulary?.length || 0,
      grammar: analysisData.grammarPoints?.length || 0,
      syntax: analysisData.syntaxAnalysis?.length || 0,
      key: keySentenceIndices.size,
      exam: (analysisData.examDesign?.paraphrasableSegments?.length || 0) + (analysisData.examDesign?.structureTransformPoints?.length || 0),
    };

    return {
      counts: {
        vocab: visibleKeys.vocab.size,
        grammar: visibleKeys.grammar.size,
        syntax: visibleKeys.syntax.size,
        key: visibleKeys.key.size,
        exam: visibleKeys.exam.size,
      },
      rawCounts,
      visibleKeys,
    };
  }, [analysisData, vocabBySentence, grammarBySentence, syntaxBySentence, examHighlightsBySentence, keySentenceIndices, sentenceMap]);

  const collections = useMemo<Record<NoteCategory, CollectionEntry[]>>(() => {
    const empty = { vocab: [], grammar: [], syntax: [], key: [], exam: [] };
    if (!analysisData) return empty;

    const vocab = (analysisData.vocabulary || []).map((item) => {
      const id = vocabKey(item);
      return {
        id,
        category: "vocab" as const,
        item,
        sentence: sentenceMap.get(item.sentenceIndex) || null,
        sentenceIndex: item.sentenceIndex,
        visible: noteSummary.visibleKeys.vocab.has(id),
      };
    });

    const grammar = (analysisData.grammarPoints || []).map((item) => {
      const id = grammarKey(item);
      return {
        id,
        category: "grammar" as const,
        item,
        sentence: sentenceMap.get(item.sentenceIndex) || null,
        sentenceIndex: item.sentenceIndex,
        visible: noteSummary.visibleKeys.grammar.has(id),
      };
    });

    const syntax = (analysisData.syntaxAnalysis || []).map((item) => {
      const id = syntaxKey(item);
      return {
        id,
        category: "syntax" as const,
        item,
        sentence: sentenceMap.get(item.sentenceIndex) || null,
        sentenceIndex: item.sentenceIndex,
        visible: noteSummary.visibleKeys.syntax.has(id),
      };
    });

    const key = Array.from(keySentenceIndices)
      .sort((a, b) => a - b)
      .map((index) => {
        const sentence = sentenceMap.get(index) || null;
        const flow = analysisData.structure?.logicFlow?.find(f => f.sentenceIndices.includes(index));
        const isTopicSentence = analysisData.structure?.topicSentenceIndex === index;
        const item = {
          role: flow?.role || (isTopicSentence ? "주제문" : "핵심"),
          summary: flow?.summary || sentence?.korean || "",
          isTopicSentence,
        };
        const id = keySentenceKey(index);
        return {
          id,
          category: "key" as const,
          item,
          sentence,
          sentenceIndex: index,
          visible: noteSummary.visibleKeys.key.has(id),
        };
      });

    const paraphrases = (analysisData.examDesign?.paraphrasableSegments || []).map((seg) => ({ kind: "paraphrase", ...seg }));
    const transforms = (analysisData.examDesign?.structureTransformPoints || []).map((tp) => ({ kind: "transform", ...tp }));
    const exam = [...paraphrases, ...transforms].map((item) => {
      const id = examKey(item);
      return {
        id,
        category: "exam" as const,
        item,
        sentence: sentenceMap.get(item.sentenceIndex) || null,
        sentenceIndex: item.sentenceIndex,
        visible: noteSummary.visibleKeys.exam.has(id),
      };
    });

    return { vocab, grammar, syntax, key, exam };
  }, [analysisData, sentenceMap, keySentenceIndices, noteSummary]);

  const handleCollectionEntrySelect = useCallback((entry: CollectionEntry) => {
    if (!entry.visible) return;
    setFocusedNote({ id: entry.id, category: entry.category, pulseKey: Date.now() });
  }, []);

  // ─── Click handler (single highlight) ──────────────────
  const activateHighlight = useCallback((h: Highlight, sentence: SentenceAnalysis) => {
    setActiveCollection(null);
    if (h.type === "vocab") {
      const v = h.data as VocabItem;
      setActiveDetail({ kind: "vocab", item: v, sentence: sentenceMap.get(v.sentenceIndex) || null });
    } else if (h.type === "grammar") {
      const g = h.data as GrammarPoint;
      setActiveDetail({ kind: "grammar", item: g, sentence: sentenceMap.get(g.sentenceIndex) || null });
    } else if (h.type === "syntax") {
      setActiveDetail({ kind: "syntax", item: h.data as SyntaxItem, sentence });
    } else if (h.type === "exam" && h.data) {
      const d = h.data;
      if (d.kind === "paraphrase") {
        setActiveDetail({ kind: "examPoint", text: d.original, alternatives: d.alternatives, reason: d.reason, questionExample: d.questionExample, difficulty: d.difficulty, relatedPoint: d.relatedPoint });
      } else {
        setActiveDetail({ kind: "examPoint", text: d.original, transformType: d.transformType, example: d.example, reason: d.reason, questionExample: d.questionExample, difficulty: d.difficulty });
      }
    }
  }, [sentenceMap]);

  // ─── Cycle click handler (for overlapping highlights) ──
  const handleSegmentClick = useCallback((segKey: string, highlights: Highlight[], sentence: SentenceAnalysis) => {
    // Sort by priority descending so first click = highest priority
    const sorted = [...highlights].sort((a, b) => TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type]);
    if (sorted.length <= 1) {
      activateHighlight(sorted[0], sentence);
      return;
    }
    // Cycle: if same segment was clicked, advance index; otherwise start from 0
    let nextIndex = 0;
    if (lastClickRef.current.key === segKey) {
      nextIndex = (lastClickRef.current.index + 1) % sorted.length;
    }
    lastClickRef.current = { key: segKey, index: nextIndex };
    activateHighlight(sorted[nextIndex], sentence);
  }, [activateHighlight]);

  const handleKeySentenceClick = useCallback((sentence: SentenceAnalysis) => {
    setActiveCollection(null);
    const flow = analysisData?.structure?.logicFlow?.find(f => f.sentenceIndices.includes(sentence.index));
    const isTopic = analysisData?.structure?.topicSentenceIndex === sentence.index;
    setActiveDetail({
      kind: "keySentence",
      sentence,
      role: flow?.role || (isTopic ? "주제문" : "핵심"),
      summary: flow?.summary || sentence.korean,
      isTopicSentence: !!isTopic,
    });
  }, [analysisData]);

  // ─── Render sentence ──────────────────────────────────
  const renderSentence = useCallback((sentence: SentenceAnalysis) => {
    const text = sentence.english;
    const vocab = vocabBySentence.get(sentence.index) || [];
    const grammar = grammarBySentence.get(sentence.index) || [];
    const syntax = syntaxBySentence.get(sentence.index);
    const examTexts = examHighlightsBySentence.get(sentence.index) || [];
    const isKey = keySentenceIndices.has(sentence.index);
    const isTopic = analysisData?.structure?.topicSentenceIndex === sentence.index;
    const flow = analysisData?.structure?.logicFlow?.find(f => f.sentenceIndices.includes(sentence.index));
    const allHighlights = collectHighlights(text, vocab, grammar, syntax, examTexts);
    const segments = buildSegments(allHighlights);

    const TYPE_COLORS: Record<string, string> = { vocab: "bg-blue-500", grammar: "bg-violet-500", syntax: "bg-cyan-500", exam: "bg-yellow-500" };

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let focusAnchorAttached = false;
    for (const seg of segments) {
      if (cursor < seg.start) parts.push(<span key={`p-${sentence.index}-${cursor}`}>{text.slice(cursor, seg.start)}</span>);
      const frag = text.slice(seg.start, seg.end);
      const style = getSegmentStyle(seg.types);
      const segKey = `${sentence.index}-${seg.start}`;
      // Deduplicate highlight types for this segment
      const uniqueTypes = [...new Set(seg.highlights.map(h => h.type))];
      const hasOverlap = uniqueTypes.length > 1;
      const focusedHighlight = focusedNote
        ? seg.highlights.find((h) => highlightNoteId(h) === focusedNote.id)
        : null;
      const focusCategory = focusedHighlight ? highlightCategory(focusedHighlight.type) : null;
      const hoverCls = seg.types.has("exam") ? "hover:opacity-80" : seg.types.has("grammar") && !seg.types.has("vocab") && !seg.types.has("exam") ? "hover:bg-violet-50" : seg.types.has("syntax") && seg.types.size === 1 ? "hover:bg-cyan-50" : "";
      parts.push(
        <span
          key={`h-${segKey}`}
          id={focusedHighlight && focusedNote && !focusAnchorAttached ? noteDomId(focusedNote.id) : undefined}
          className={`cursor-pointer transition-colors ${hoverCls} relative scroll-mt-20 ${focusedHighlight ? "z-10" : ""}`}
          style={focusCategory ? { ...style, ...FOCUS_STYLES[focusCategory] } : style}
          onClick={(e) => { e.stopPropagation(); handleSegmentClick(segKey, seg.highlights, sentence); }} role="button" tabIndex={0}
          title={hasOverlap ? `클릭하여 순환: ${uniqueTypes.map(t => t === "vocab" ? "어휘" : t === "grammar" ? "문법" : t === "syntax" ? "구문" : "출제포인트").join(" → ")}` : undefined}
        >
          {frag}
          {hasOverlap && (
            <span className="absolute -top-1 -right-0.5 flex gap-px pointer-events-none">
              {uniqueTypes.map(t => (
                <span key={t} className={`w-1 h-1 rounded-full ${TYPE_COLORS[t]}`} />
              ))}
            </span>
          )}
        </span>
      );
      if (focusedHighlight) focusAnchorAttached = true;
      cursor = seg.end;
    }
    if (cursor < text.length) parts.push(<span key={`p-${sentence.index}-end`}>{text.slice(cursor)}</span>);

    // Use text-decoration instead of border-bottom so it wraps across multiple lines
    const syntaxInlineStyle = syntax ? { textDecoration: "underline dashed #22d3ee", textUnderlineOffset: "4px", textDecorationSkipInk: "none" as const } : undefined;
    const isFocusedKeySentence = focusedNote?.id === keySentenceKey(sentence.index);

    return (
      <div
        key={`s-${sentence.index}`}
        id={isFocusedKeySentence && focusedNote ? noteDomId(focusedNote.id) : undefined}
        className={`mb-3 scroll-mt-20 transition-all ${isKey ? "border-l-[3px] border-green-500 pl-2 bg-green-50/30 rounded-r" : ""} ${isFocusedKeySentence ? "ring-2 ring-green-400 ring-offset-2 shadow-sm" : ""}`}
        style={isFocusedKeySentence ? FOCUS_STYLES.key : undefined}
      >
        <div className="flex items-start gap-1">
          {/* 줄번호 + 핵심문장/구문 뱃지 */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <sup className="text-[10px] font-bold text-slate-400 select-none w-3">{sentence.index + 1}</sup>
            {isTopic && (
              <span className={`text-[8px] font-bold text-green-600 bg-green-100 px-1 py-0.5 rounded leading-none ${isKey ? "cursor-pointer hover:bg-green-200" : ""}`}
                onClick={isKey ? () => handleKeySentenceClick(sentence) : undefined}>주제문</span>
            )}
            {flow && isKey && !isTopic && (
              <span className="text-[8px] font-bold text-green-600 bg-green-100 px-1 py-0.5 rounded leading-none cursor-pointer hover:bg-green-200"
                onClick={() => handleKeySentenceClick(sentence)}>{flow.role}</span>
            )}
            {syntax && (
              <span
                className="text-[8px] font-bold text-cyan-600 bg-cyan-50 px-1 py-0.5 rounded leading-none cursor-pointer hover:bg-cyan-100 transition-colors"
                onClick={() => { setActiveCollection(null); setActiveDetail({ kind: "syntax", item: syntax, sentence }); }}
                title="구문 분석 보기"
              >
                구문
              </span>
            )}
          </div>
          {/* 본문 텍스트: 내부 하이라이트 개별 클릭 */}
          <span className="font-mono text-[14px] leading-[1.9]" style={syntaxInlineStyle}>{parts}</span>
        </div>
        {showTranslation && (
          <p className={`text-[12px] text-slate-400 mt-0.5 leading-relaxed ${isKey ? "pl-6" : "pl-4"}`}>{sentence.korean}</p>
        )}
      </div>
    );
  }, [vocabBySentence, grammarBySentence, syntaxBySentence, examHighlightsBySentence, keySentenceIndices, analysisData, showTranslation, focusedNote, handleSegmentClick, handleKeySentenceClick]);

  // ─── Count badges ──────────────────────────────────────
  const counts = hasAnalysis ? noteSummary.counts : null;
  const rawCounts = hasAnalysis ? noteSummary.rawCounts : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {counts && <>
            {rawCounts.vocab > 0 && <CategoryChip category="vocab" count={counts.vocab} rawCount={rawCounts.vocab} active={activeCollection === "vocab"} onClick={() => { setActiveCollection(v => v === "vocab" ? null : "vocab"); setActiveDetail(null); }} />}
            {rawCounts.grammar > 0 && <CategoryChip category="grammar" count={counts.grammar} rawCount={rawCounts.grammar} active={activeCollection === "grammar"} onClick={() => { setActiveCollection(v => v === "grammar" ? null : "grammar"); setActiveDetail(null); }} />}
            {rawCounts.syntax > 0 && <CategoryChip category="syntax" count={counts.syntax} rawCount={rawCounts.syntax} active={activeCollection === "syntax"} onClick={() => { setActiveCollection(v => v === "syntax" ? null : "syntax"); setActiveDetail(null); }} />}
            {rawCounts.key > 0 && <CategoryChip category="key" count={counts.key} rawCount={rawCounts.key} active={activeCollection === "key"} onClick={() => { setActiveCollection(v => v === "key" ? null : "key"); setActiveDetail(null); }} />}
            {rawCounts.exam > 0 && <CategoryChip category="exam" count={counts.exam} rawCount={rawCounts.exam} active={activeCollection === "exam"} onClick={() => { setActiveCollection(v => v === "exam" ? null : "exam"); setActiveDetail(null); }} />}
          </>}
        </div>
        <div className="flex items-center gap-2">
          {hasAnalysis && (
            <button onClick={() => setShowTranslation(v => !v)}
              className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${showTranslation ? "text-slate-700 bg-slate-100" : "text-slate-400 hover:text-slate-600"}`}>
              번역 {showTranslation ? "ON" : "OFF"}
            </button>
          )}
          <span className="text-[11px] text-slate-400">{wordCount} words</span>
        </div>
      </div>

      <div className={layout === "vertical"
        ? "flex flex-col divide-y divide-slate-100"
        : "grid grid-cols-1 lg:grid-cols-[1fr_1fr] lg:divide-x divide-y lg:divide-y-0 divide-slate-100 min-h-[400px]"
      }>
        {/* 지문 필기노트 */}
        <div className={layout === "vertical" ? "p-5 overflow-y-auto max-h-[45vh]" : "p-5 overflow-y-auto max-h-[700px]"}>
          {!hasAnalysis && <p className="text-[13px] text-slate-400 mb-3">AI 분석을 실행하면 어휘·문법·구문 하이라이트가 표시됩니다.</p>}
          <div>{hasAnalysis ? (analysisData.sentences || []).map(s => renderSentence(s)) : <div className="font-mono text-sm leading-[2]">{content}</div>}</div>
        </div>

        {/* 분석 요약 + 상세 패널 */}
        <div className={layout === "vertical" ? "p-5 space-y-4" : "p-5 overflow-y-auto max-h-[700px] space-y-4"}>
          {activeCollection && hasAnalysis && (
            <CategoryCollectionPanel
              category={activeCollection}
              entries={collections[activeCollection]}
              visibleCount={noteSummary.counts[activeCollection]}
              rawCount={noteSummary.rawCounts[activeCollection]}
              focusedNoteId={focusedNote?.id || null}
              onSelect={handleCollectionEntrySelect}
              onClose={() => setActiveCollection(null)}
            />
          )}

          {/* 분석 요약 — 항상 상단 */}
          {hasAnalysis && !activeCollection && (
            <div>
              <button type="button" onClick={() => setSummaryOpen(v => !v)}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 hover:text-slate-900 transition-colors w-full mb-3">
                {summaryOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                분석 요약
              </button>
              {summaryOpen && <SummarySection data={analysisData} />}
            </div>
          )}

          {/* Active detail (클릭한 항목) — 요약 아래 */}
          {activeDetail && !activeCollection && (
            <div>
              {activeDetail.kind === "vocab" && <VocabPanel item={activeDetail.item} sentence={activeDetail.sentence} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "grammar" && <GrammarPanel item={activeDetail.item} sentence={activeDetail.sentence} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "syntax" && <SyntaxPanel item={activeDetail.item} sentence={activeDetail.sentence} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "keySentence" && <KeySentencePanel detail={activeDetail} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "examPoint" && <ExamPointPanel detail={activeDetail} onClose={() => setActiveDetail(null)} />}
            </div>
          )}

          {!activeDetail && !activeCollection && !hasAnalysis && (
            <p className="text-[13px] text-slate-400">지문의 하이라이트를 클릭하면 상세 분석이 여기에 표시됩니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  category,
  count,
  rawCount,
  active,
  onClick,
}: {
  category: NoteCategory;
  count: number;
  rawCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[category];
  const hasMismatch = rawCount > count;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`본문 표시 ${count}개 / 분석 원본 ${rawCount}개`}
      className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors ${
        active ? meta.active : `${meta.text} border-transparent hover:bg-slate-50`
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      <span>{meta.label}</span>
      <span>{count}</span>
      {hasMismatch && <span className="text-slate-400">/{rawCount}</span>}
    </button>
  );
}

function CategoryCollectionPanel({
  category,
  entries,
  visibleCount,
  rawCount,
  focusedNoteId,
  onSelect,
  onClose,
}: {
  category: NoteCategory;
  entries: CollectionEntry[];
  visibleCount: number;
  rawCount: number;
  focusedNoteId: string | null;
  onSelect: (entry: CollectionEntry) => void;
  onClose: () => void;
}) {
  const meta = CATEGORY_META[category];
  const visible = entries.filter((entry) => entry.visible);
  const hidden = entries.filter((entry) => !entry.visible);
  const Icon = category === "vocab" ? BookOpen : category === "key" ? MessageSquare : category === "exam" ? Target : Braces;

  return (
    <div className={`rounded-xl border ${meta.border} bg-white p-4 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg ${meta.soft} flex items-center justify-center shrink-0`}>
              <Icon className={`w-4 h-4 ${meta.text}`} />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{meta.title}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <span>본문 필기 {visibleCount}</span>
                <span>분석 원본 {rawCount}</span>
                {hidden.length > 0 && <span className="text-amber-600">매칭 필요 {hidden.length}</span>}
              </div>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((entry) => renderCollectionEntry(category, entry, focusedNoteId, onSelect))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-400">
          본문에 표시된 항목이 없습니다.
        </div>
      )}

      {hidden.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] font-semibold text-slate-500">원문 매칭 필요</span>
            <Badge variant="outline" className="text-[10px] h-5 text-amber-700 border-amber-200 bg-amber-50">{hidden.length}</Badge>
          </div>
          <div className="space-y-2">
            {hidden.map((entry) => renderCollectionEntry(category, entry, focusedNoteId, onSelect))}
          </div>
        </div>
      )}
    </div>
  );
}

function renderCollectionEntry(
  category: NoteCategory,
  entry: CollectionEntry,
  focusedNoteId: string | null,
  onSelect: (entry: CollectionEntry) => void
) {
  const statusBadge = entry.visible ? (
    <Badge className="h-5 border-0 bg-emerald-50 text-[10px] text-emerald-700">본문 표시</Badge>
  ) : (
    <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 text-[10px] text-amber-700">매칭 필요</Badge>
  );
  const isFocused = focusedNoteId === entry.id;

  return (
    <div
      key={entry.id}
      role={entry.visible ? "button" : undefined}
      tabIndex={entry.visible ? 0 : undefined}
      title={entry.visible ? "본문에서 위치 강조" : undefined}
      onClick={entry.visible ? () => onSelect(entry) : undefined}
      onKeyDown={entry.visible ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(entry);
        }
      } : undefined}
      className={`rounded-lg border p-3 transition-all ${
        entry.visible ? "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60" : "border-dashed border-slate-200 bg-slate-50/80"
      } ${isFocused ? `${CATEGORY_META[category].active} ${CATEGORY_META[category].ring} ring-2 ring-offset-1 shadow-sm` : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-400">{entry.sentenceIndex + 1}번 문장</span>
        {statusBadge}
      </div>
      {category === "vocab" && <VocabCollectionItem entry={entry} />}
      {category === "grammar" && <GrammarCollectionItem entry={entry} />}
      {category === "syntax" && <SyntaxCollectionItem entry={entry} />}
      {category === "key" && <KeyCollectionItem entry={entry} />}
      {category === "exam" && <ExamCollectionItem entry={entry} />}
    </div>
  );
}

function VocabCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item as VocabItem;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[15px] font-bold text-slate-900">{item.word}</span>
            {item.partOfSpeech && <Badge variant="outline" className="h-5 text-[10px]">{item.partOfSpeech}</Badge>}
            {DIFF_LABELS[item.difficulty] && <Badge className={`h-5 border-0 text-[10px] ${DIFF_LABELS[item.difficulty].cls}`}>{DIFF_LABELS[item.difficulty].label}</Badge>}
          </div>
          {item.pronunciation && <span className="text-[11px] text-slate-400">{item.pronunciation}</span>}
        </div>
        <span className="text-right text-[13px] font-semibold text-blue-700">{item.meaning}</span>
      </div>
      {item.contextMeaning && <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[12px] text-slate-600">{item.contextMeaning}</p>}
      {entry.sentence && <p className="rounded-md border border-slate-100 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-600">{highlightWord(entry.sentence.english, item.word)}</p>}
      {(item.synonyms?.length > 0 || item.antonyms?.length > 0 || item.collocations?.length > 0) && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {item.synonyms?.slice(0, 4).map((v, i) => <span key={`s-${i}`} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">동의 {v}</span>)}
          {item.antonyms?.slice(0, 4).map((v, i) => <span key={`a-${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">반의 {v}</span>)}
          {item.collocations?.slice(0, 4).map((v, i) => <span key={`c-${i}`} className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">{v}</span>)}
        </div>
      )}
    </div>
  );
}

function GrammarCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item as GrammarPoint;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14px] font-bold text-slate-900">{item.pattern}</span>
        {item.level && <Badge variant="outline" className="h-5 shrink-0 text-[10px]">{item.level}</Badge>}
      </div>
      {item.textFragment && <p className="rounded-md border border-violet-100 bg-violet-50/50 px-2 py-1.5 font-mono text-[12px] text-violet-800">{item.textFragment}</p>}
      <p className="text-[12px] leading-relaxed text-slate-600">{item.explanation}</p>
      {item.commonMistake && <p className="rounded-md bg-rose-50 px-2 py-1.5 text-[12px] text-rose-700"><span className="font-semibold">오답 함정:</span> {item.commonMistake}</p>}
      {item.transformations?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {item.transformations.slice(0, 4).map((v, i) => <span key={i} className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{v}</span>)}
        </div>
      )}
    </div>
  );
}

function SyntaxCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item as SyntaxItem;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[13px] font-bold text-cyan-700">구문 분석</span>
        <Badge className="h-5 border-0 bg-cyan-50 text-[10px] text-cyan-700">{item.complexity}</Badge>
        {item.patternType && <Badge variant="outline" className="h-5 text-[10px]">{item.patternType}</Badge>}
      </div>
      <p className="rounded-md border border-slate-100 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-700">{item.structure}</p>
      {item.chunkReading && <p className="rounded-md bg-cyan-50 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-cyan-800">{item.chunkReading}</p>}
      {item.transformPoint && <p className="text-[12px] text-slate-600">{item.transformPoint}</p>}
    </div>
  );
}

function KeyCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Badge className="h-5 border-0 bg-green-50 text-[10px] text-green-700">{item.role}</Badge>
        {item.isTopicSentence && <Badge className="h-5 border-0 bg-green-50 text-[10px] text-green-700">주제문</Badge>}
      </div>
      {item.summary && <p className="text-[13px] leading-relaxed text-slate-700">{item.summary}</p>}
      {entry.sentence && (
        <>
          <p className="rounded-md border border-slate-100 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-700">{entry.sentence.english}</p>
          <p className="text-[12px] leading-relaxed text-slate-400">{entry.sentence.korean}</p>
        </>
      )}
    </div>
  );
}

function ExamCollectionItem({ entry }: { entry: CollectionEntry }) {
  const item = entry.item;
  const isParaphrase = item.kind === "paraphrase";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`h-5 border-0 text-[10px] ${isParaphrase ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
          {isParaphrase ? "패러프레이징" : item.transformType || "구조 변형"}
        </Badge>
        {item.difficulty && <Badge variant="outline" className="h-5 text-[10px]">{item.difficulty}</Badge>}
      </div>
      <p className="rounded-md border border-yellow-100 bg-yellow-50/70 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-800">{item.original}</p>
      {item.reason && <p className="text-[12px] leading-relaxed text-slate-600"><span className="font-semibold text-yellow-700">이유:</span> {item.reason}</p>}
      {item.questionExample && <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[12px] leading-relaxed text-slate-700">{item.questionExample}</p>}
      {item.alternatives?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {item.alternatives.slice(0, 4).map((v, i) => <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{v}</span>)}
        </div>
      )}
      {item.example && <p className="rounded-md bg-violet-50 px-2 py-1.5 font-mono text-[12px] text-violet-800">{item.example}</p>}
    </div>
  );
}

// ─── Vocab Panel ─────────────────────────────────────────
function VocabPanel({ item, sentence, onClose }: { item: VocabItem; sentence: SentenceAnalysis | null; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-slate-900">{item.word}</span>
            {item.pronunciation && <span className="text-sm text-slate-400">{item.pronunciation}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{item.partOfSpeech}</Badge>
            {DIFF_LABELS[item.difficulty] && <Badge className={`text-[10px] border-0 ${DIFF_LABELS[item.difficulty].cls}`}>{DIFF_LABELS[item.difficulty].label}</Badge>}
            {item.examType && <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">출제: {item.examType}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <div className="text-[14px]"><span className="text-slate-500 mr-1">뜻:</span><span className="font-medium text-slate-800">{item.meaning}</span></div>
      {item.contextMeaning && <div className="text-[13px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2"><span className="text-slate-400 mr-1">문맥:</span>{item.contextMeaning}</div>}
      {item.englishDefinition && <div className="text-[13px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 italic"><span className="text-slate-400 mr-1 not-italic">영영:</span>{item.englishDefinition}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        {item.synonyms?.length > 0 && <div><span className="text-slate-400 mr-1">동의어:</span>{item.synonyms.map((s, i) => <span key={i} className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 mr-1 font-medium">{s}</span>)}</div>}
        {item.antonyms?.length > 0 && <div><span className="text-slate-400 mr-1">반의어:</span>{item.antonyms.map((s, i) => <span key={i} className="bg-red-50 text-red-700 rounded px-1.5 py-0.5 mr-1 font-medium">{s}</span>)}</div>}
      </div>
      {item.derivatives?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mr-1">파생어:</span>{item.derivatives.map((d, i) => <span key={i} className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 mr-1">{d}</span>)}</div>}
      {item.collocations?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mr-1">콜로케이션:</span>{item.collocations.map((c, i) => <span key={i} className="bg-green-50 text-green-700 rounded px-1.5 py-0.5 mr-1">{c}</span>)}</div>}
      {sentence && <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[12px] leading-relaxed"><span className="text-slate-400 mr-1">문장:</span>{highlightWord(sentence.english, item.word)}</div>}
    </div>
  );
}

// ─── Grammar Panel ───────────────────────────────────────
function GrammarPanel({ item, onClose }: { item: GrammarPoint; sentence: SentenceAnalysis | null; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-lg font-bold text-slate-900">{item.pattern}</span>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {item.gradeLevel && <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">{item.gradeLevel}</Badge>}
            {item.examType && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">출제: {item.examType}</Badge>}
            {item.csatFrequency && item.csatFrequency !== "해당없음" && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">수능 {item.csatFrequency}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <p className="text-[14px] text-slate-700 leading-relaxed">{item.explanation}</p>
      <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[13px]"><span className="text-slate-400 mr-1">본문:</span><span className="border-b-2 border-dashed border-violet-400">{item.textFragment}</span></div>
      {item.commonMistake && <div className="text-[13px] bg-rose-50 border border-rose-100 rounded-lg px-3 py-2"><span className="text-rose-500 font-semibold mr-1">오답 함정:</span><span className="text-rose-700">{item.commonMistake}</span></div>}
      {item.transformations?.length > 0 && <div className="text-[13px]"><div className="flex items-center gap-1 text-slate-500 mb-1"><ArrowRightLeft className="w-3 h-3" /><span className="font-medium">변형 가능:</span></div><ul className="space-y-1 pl-4">{item.transformations.map((t, i) => <li key={i} className="list-disc text-slate-600">{t}</li>)}</ul></div>}
      {item.relatedGrammar?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mr-1">연관 문법:</span>{item.relatedGrammar.map((g, i) => <span key={i} className="bg-violet-50 text-violet-600 rounded px-1.5 py-0.5 mr-1">{g}</span>)}</div>}
      {item.examples?.length > 0 && <div className="text-[12px]"><span className="text-slate-400 mb-1 block">예문:</span><ul className="space-y-1 pl-4 text-slate-600">{item.examples.map((e, i) => <li key={i} className="list-disc">{e}</li>)}</ul></div>}
    </div>
  );
}

// ─── Syntax Panel ────────────────────────────────────────
function SyntaxPanel({ item, onClose }: { item: SyntaxItem; sentence: SentenceAnalysis | null; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-cyan-200 bg-gradient-to-b from-cyan-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Braces className="w-4 h-4 text-cyan-600" />
          <span className="text-[15px] font-bold text-slate-900">구문 분석</span>
          <Badge className="text-[10px] border-0 bg-cyan-100 text-cyan-700">{item.complexity}</Badge>
          {item.patternType && <Badge variant="outline" className="text-[10px]">{item.patternType}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[13px] font-mono leading-relaxed"><span className="text-slate-400 mr-1 font-sans">구조:</span>{item.structure}</div>
      <div className="rounded-lg bg-cyan-50/50 border border-cyan-100 p-2.5 text-[13px] font-mono leading-relaxed"><span className="text-cyan-600 mr-1 font-sans font-medium">끊어읽기:</span>{item.chunkReading}</div>
      {item.keyPhrase && <div className="text-[13px]"><span className="text-slate-400 mr-1">핵심 구문:</span><span className="font-medium">{item.keyPhrase}</span></div>}
      {item.transformPoint && <div className="text-[13px] flex items-start gap-1.5"><ArrowRightLeft className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" /><span className="text-slate-600">{item.transformPoint}</span></div>}
    </div>
  );
}

// ─── Key Sentence Panel ──────────────────────────────────
function KeySentencePanel({ detail, onClose }: { detail: Extract<ActiveDetail, { kind: "keySentence" }>; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-green-200 bg-gradient-to-b from-green-50/50 to-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-600" />
          <span className="text-[15px] font-bold text-slate-900">핵심 문장</span>
          <Badge className="text-[10px] border-0 bg-green-100 text-green-700">{detail.role}</Badge>
          {detail.isTopicSentence && <Badge className="text-[10px] border-0 bg-green-100 text-green-700">주제문</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>
      <p className="text-[14px] text-slate-700 leading-relaxed">{detail.summary}</p>
      <div className="rounded-lg bg-white border border-slate-100 p-2.5 text-[12px] font-mono leading-relaxed">{detail.sentence.english}</div>
      <p className="text-[12px] text-slate-500">{detail.sentence.korean}</p>
      {detail.isTopicSentence && (
        <div className="text-[12px] text-green-700 bg-green-50 rounded-lg px-3 py-2">
          이 문장은 글의 <span className="font-semibold">주제문(Topic Sentence)</span>으로, 글 전체의 핵심 주장을 담고 있습니다. 빈칸 추론, 주제/요지 문제에서 출제 가능성이 높습니다.
        </div>
      )}
      {detail.role === "주장" && !detail.isTopicSentence && (
        <div className="text-[12px] text-green-700 bg-green-50 rounded-lg px-3 py-2">
          글의 <span className="font-semibold">핵심 주장</span>을 담은 문장입니다. 주제/요지 파악 문제와 빈칸 추론에서 자주 출제됩니다.
        </div>
      )}
      {detail.role === "결론" && (
        <div className="text-[12px] text-green-700 bg-green-50 rounded-lg px-3 py-2">
          글의 <span className="font-semibold">결론</span>으로, 전체 논지를 마무리합니다. 요약문 완성, 제목 추론 문제에서 핵심 단서가 됩니다.
        </div>
      )}
    </div>
  );
}

// ─── Exam Point Panel ────────────────────────────────────
function ExamPointPanel({ detail, onClose }: { detail: Extract<ActiveDetail, { kind: "examPoint" }>; onClose: () => void }) {
  const isParaphrase = !!detail.alternatives;
  const isTransform = !!detail.transformType;

  return (
    <div className="rounded-xl border border-yellow-200 bg-gradient-to-b from-yellow-50/30 to-white p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-yellow-600" />
          <span className="text-[15px] font-bold text-slate-900">출제 포인트</span>
          {isParaphrase && <Badge className="text-[10px] border-0 bg-blue-100 text-blue-700">빈칸/동의어</Badge>}
          {isTransform && <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">서술형/변형</Badge>}
          {detail.difficulty && <Badge className="text-[10px] border-0 bg-slate-100 text-slate-600">{detail.difficulty}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
      </div>

      {/* 원문 */}
      <div className="rounded-lg border border-slate-100 p-3 text-[13px] font-mono" style={{ background: "linear-gradient(to top, #fef9c3 30%, white 30%)" }}>
        {detail.text}
      </div>

      {/* 출제 이유 */}
      {detail.reason && (
        <div className="text-[13px] bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
          <span className="text-yellow-700 font-semibold mr-1">출제 이유:</span>
          <span className="text-slate-700">{detail.reason}</span>
        </div>
      )}

      {/* 예상 문항 */}
      {detail.questionExample && (
        <div className="text-[13px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <span className="text-slate-500 font-semibold mr-1 block mb-1">예상 출제 문항:</span>
          <span className="text-slate-800 italic">{detail.questionExample}</span>
        </div>
      )}

      {/* 패러프레이징 */}
      {detail.alternatives && detail.alternatives.length > 0 && (
        <div className="text-[13px]">
          <span className="text-blue-600 font-semibold mb-1.5 block">패러프레이징 대안:</span>
          <div className="space-y-1">
            {detail.alternatives.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="text-blue-400">→</span>
                <span className="text-blue-700 bg-blue-50 rounded px-2 py-1 font-medium">{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 구조 변형 */}
      {detail.transformType && (
        <div className="text-[13px]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-violet-600 font-semibold">구조 변형: {detail.transformType}</span>
          </div>
          {detail.example && (
            <div className="bg-violet-50 rounded-lg px-3 py-2 text-[12px] font-mono text-violet-800">
              → {detail.example}
            </div>
          )}
        </div>
      )}

      {/* 관련 포인트 */}
      {detail.relatedPoint && (
        <div className="text-[12px] text-slate-500">
          <span className="font-medium mr-1">관련:</span>
          <span className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{detail.relatedPoint}</span>
        </div>
      )}
    </div>
  );
}

// ─── Summary Section ─────────────────────────────────────
function SummarySection({ data }: { data: PassageAnalysisData }) {
  return (
    <div className="space-y-3 text-[13px]">
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-slate-50 rounded-lg p-3"><span className="text-[11px] text-slate-400 block mb-1">주제</span><span className="text-slate-700">{data.structure.mainIdea}</span></div>
        <div className="bg-slate-50 rounded-lg p-3"><span className="text-[11px] text-slate-400 block mb-1">목적 / 유형</span><span className="text-slate-700">{data.structure.purpose} · {data.structure.textType}{data.structure.tone && ` · ${data.structure.tone}`}</span></div>
      </div>
      {data.structure.logicFlow?.length > 0 && (
        <div>
          <span className="text-[12px] font-semibold text-slate-600 block mb-2">논리 흐름</span>
          <div className="flex items-center gap-1 flex-wrap">
            {data.structure.logicFlow.map((f, i) => (
              <React.Fragment key={i}>
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-[11px]">
                  <span className="font-semibold text-blue-600">{f.role}</span>
                  <span className="text-slate-500 truncate max-w-[150px]">{f.summary}</span>
                </span>
                {i < data.structure.logicFlow!.length - 1 && <span className="text-slate-300">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {data.structure.connectorAnalysis?.length > 0 && (
        <div>
          <span className="text-[12px] font-semibold text-slate-600 block mb-2">연결어</span>
          {data.structure.connectorAnalysis.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] mb-1">
              <span className="font-mono font-bold text-blue-600 shrink-0">{c.word}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{c.role}</Badge>
              <span className="text-slate-500 truncate">{c.examRelevance}</span>
            </div>
          ))}
        </div>
      )}
      {data.structure.keyPoints?.length > 0 && (
        <div>
          <span className="text-[12px] font-semibold text-slate-600 block mb-2 flex items-center gap-1"><Target className="w-3 h-3" />출제 핵심</span>
          <ul className="space-y-1 pl-4">{data.structure.keyPoints.map((kp, i) => <li key={i} className="list-disc text-[12px] text-slate-600">{kp}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
