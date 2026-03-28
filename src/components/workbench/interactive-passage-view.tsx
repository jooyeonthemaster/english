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
}

interface Highlight {
  start: number;
  end: number;
  type: "vocab" | "grammar" | "syntax" | "exam";
  data: VocabItem | GrammarPoint | SyntaxItem | null;
}

type ActiveDetail =
  | { kind: "vocab"; item: VocabItem; sentence: SentenceAnalysis | null }
  | { kind: "grammar"; item: GrammarPoint; sentence: SentenceAnalysis | null }
  | { kind: "syntax"; item: SyntaxItem; sentence: SentenceAnalysis | null }
  | { kind: "keySentence"; sentence: SentenceAnalysis; role: string; summary: string; isTopicSentence: boolean }
  | { kind: "examPoint"; text: string; alternatives?: string[]; transformType?: string; example?: string; reason?: string; questionExample?: string; difficulty?: string; relatedPoint?: string }
  | null;

// ─── Helpers ─────────────────────────────────────────────
function countWords(t: string) { return t.trim().split(/\s+/).filter(w => w.length > 0).length; }

const DIFF_LABELS: Record<string, { label: string; cls: string }> = {
  basic: { label: "기본", cls: "bg-emerald-100 text-emerald-700" },
  intermediate: { label: "심화", cls: "bg-blue-100 text-blue-700" },
  advanced: { label: "고난도", cls: "bg-red-100 text-red-700" },
};

const TYPE_PRIORITY: Record<Highlight["type"], number> = { exam: 4, grammar: 3, syntax: 2, vocab: 1 };

function collectHighlights(text: string, vocab: VocabItem[], grammar: GrammarPoint[], syntax: SyntaxItem | undefined, examTexts: { text: string; data: any }[]): Highlight[] {
  const hl: Highlight[] = [];
  for (const v of vocab) {
    const i = text.toLowerCase().indexOf(v.word.toLowerCase());
    if (i !== -1) hl.push({ start: i, end: i + v.word.length, type: "vocab", data: v });
  }
  for (const g of grammar) {
    const i = text.toLowerCase().indexOf(g.textFragment.toLowerCase());
    if (i !== -1) hl.push({ start: i, end: i + g.textFragment.length, type: "grammar", data: g });
  }
  if (syntax) {
    // Try keyPhrase first for precise highlight
    let matched = false;
    if (syntax.keyPhrase) {
      const phrase = syntax.keyPhrase.replace(/\.{2,}$/, "").trim();
      const i = text.toLowerCase().indexOf(phrase.toLowerCase());
      if (i !== -1) {
        hl.push({ start: i, end: i + phrase.length, type: "syntax", data: syntax });
        matched = true;
      }
    }
    // Fallback: highlight entire sentence so syntax is always clickable
    if (!matched && text.length > 0) {
      hl.push({ start: 0, end: text.length, type: "syntax", data: syntax });
    }
  }
  for (const et of examTexts) {
    const clean = et.text.replace(/\.{2,}$/, "").replace(/…$/, "").trim();
    if (clean.length < 3) continue;
    let i = text.toLowerCase().indexOf(clean.toLowerCase());
    if (i === -1 && clean.split(" ").length >= 3) {
      const prefix = clean.split(" ").slice(0, 4).join(" ");
      i = text.toLowerCase().indexOf(prefix.toLowerCase());
      if (i !== -1) {
        const endIdx = Math.min(i + clean.length + 20, text.indexOf(".", i + prefix.length) + 1 || text.length);
        hl.push({ start: i, end: endIdx, type: "exam", data: et.data });
        continue;
      }
    }
    if (i !== -1) hl.push({ start: i, end: i + clean.length, type: "exam", data: et.data });
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
  const s: React.CSSProperties = {};
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
    (s as any).textDecorationSkipInk = "none";
  }
  return s;
}

function highlightWord(text: string, word: string) {
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i === -1) return <span>{text}</span>;
  return <span>{text.slice(0, i)}<span className="bg-blue-200 font-medium rounded px-0.5">{text.slice(i, i + word.length)}</span>{text.slice(i + word.length)}</span>;
}

// ─── Main Component ──────────────────────────────────────
export function InteractivePassageView({ content, analysisData }: Props) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  // Track last clicked segment for cycling through overlapping highlights
  const lastClickRef = React.useRef<{ key: string; index: number }>({ key: "", index: -1 });

  const wordCount = useMemo(() => countWords(content), [content]);
  const hasAnalysis = analysisData !== null;

  // ─── Data maps ─────────────────────────────────────────
  const sentenceMap = useMemo(() => {
    if (!analysisData) return new Map<number, SentenceAnalysis>();
    return new Map(analysisData.sentences.map(s => [s.index, s]));
  }, [analysisData]);

  const vocabBySentence = useMemo(() => {
    if (!analysisData) return new Map<number, VocabItem[]>();
    const m = new Map<number, VocabItem[]>();
    for (const v of analysisData.vocabulary) { const a = m.get(v.sentenceIndex) || []; a.push(v); m.set(v.sentenceIndex, a); }
    return m;
  }, [analysisData]);

  const grammarBySentence = useMemo(() => {
    if (!analysisData) return new Map<number, GrammarPoint[]>();
    const m = new Map<number, GrammarPoint[]>();
    for (const g of analysisData.grammarPoints) { const a = m.get(g.sentenceIndex) || []; a.push(g); m.set(g.sentenceIndex, a); }
    return m;
  }, [analysisData]);

  const syntaxBySentence = useMemo(() => {
    if (!analysisData?.syntaxAnalysis) return new Map<number, SyntaxItem>();
    return new Map(analysisData.syntaxAnalysis.map(s => [s.sentenceIndex, s]));
  }, [analysisData]);

  const keySentenceIndices = useMemo(() => {
    if (!analysisData) return new Set<number>();
    const set = new Set<number>();
    if (analysisData.structure.topicSentenceIndex != null) set.add(analysisData.structure.topicSentenceIndex);
    if (analysisData.structure.logicFlow) {
      for (const f of analysisData.structure.logicFlow) {
        if (f.role === "주장" || f.role === "결론") for (const idx of f.sentenceIndices) set.add(idx);
      }
    }
    return set;
  }, [analysisData]);

  // Exam highlights — include both paraphrasable + transform points with their data
  const examHighlightsBySentence = useMemo(() => {
    if (!analysisData?.examDesign) return new Map<number, { text: string; data: any }[]>();
    const m = new Map<number, { text: string; data: any }[]>();
    for (const seg of analysisData.examDesign.paraphrasableSegments) {
      const a = m.get(seg.sentenceIndex) || [];
      a.push({ text: seg.original, data: { kind: "paraphrase", ...seg } });
      m.set(seg.sentenceIndex, a);
    }
    for (const tp of analysisData.examDesign.structureTransformPoints) {
      const a = m.get(tp.sentenceIndex) || [];
      a.push({ text: tp.original, data: { kind: "transform", ...tp } });
      m.set(tp.sentenceIndex, a);
    }
    return m;
  }, [analysisData]);

  // ─── Click handler (single highlight) ──────────────────
  const activateHighlight = useCallback((h: Highlight, sentence: SentenceAnalysis) => {
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
    const flow = analysisData?.structure.logicFlow?.find(f => f.sentenceIndices.includes(sentence.index));
    const isTopic = analysisData?.structure.topicSentenceIndex === sentence.index;
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
    const isTopic = analysisData?.structure.topicSentenceIndex === sentence.index;
    const flow = analysisData?.structure.logicFlow?.find(f => f.sentenceIndices.includes(sentence.index));
    const allHighlights = collectHighlights(text, vocab, grammar, syntax, examTexts);
    const segments = buildSegments(allHighlights);

    const TYPE_COLORS: Record<string, string> = { vocab: "bg-blue-500", grammar: "bg-violet-500", syntax: "bg-cyan-500", exam: "bg-yellow-500" };

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const seg of segments) {
      if (cursor < seg.start) parts.push(<span key={`p-${sentence.index}-${cursor}`}>{text.slice(cursor, seg.start)}</span>);
      const frag = text.slice(seg.start, seg.end);
      const style = getSegmentStyle(seg.types);
      const segKey = `${sentence.index}-${seg.start}`;
      // Deduplicate highlight types for this segment
      const uniqueTypes = [...new Set(seg.highlights.map(h => h.type))];
      const hasOverlap = uniqueTypes.length > 1;
      const hoverCls = seg.types.has("exam") ? "hover:opacity-80" : seg.types.has("grammar") && !seg.types.has("vocab") && !seg.types.has("exam") ? "hover:bg-violet-50" : seg.types.has("syntax") && seg.types.size === 1 ? "hover:bg-cyan-50" : "";
      parts.push(
        <span key={`h-${segKey}`} className={`cursor-pointer transition-colors ${hoverCls} relative`} style={style}
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
      cursor = seg.end;
    }
    if (cursor < text.length) parts.push(<span key={`p-${sentence.index}-end`}>{text.slice(cursor)}</span>);

    // Use text-decoration instead of border-bottom so it wraps across multiple lines
    const syntaxStyle = syntax ? "" : "";
    const syntaxInlineStyle = syntax ? { textDecoration: "underline dashed #22d3ee", textUnderlineOffset: "4px", textDecorationSkipInk: "none" as const } : undefined;

    return (
      <div key={`s-${sentence.index}`} className={`mb-3 ${isKey ? "border-l-[3px] border-green-500 pl-2 bg-green-50/30 rounded-r" : ""}`}>
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
                onClick={() => setActiveDetail({ kind: "syntax", item: syntax, sentence })}
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
  }, [vocabBySentence, grammarBySentence, syntaxBySentence, examHighlightsBySentence, keySentenceIndices, analysisData, showTranslation, handleSegmentClick, handleKeySentenceClick]);

  // ─── Count badges ──────────────────────────────────────
  const counts = hasAnalysis ? {
    vocab: analysisData.vocabulary.length,
    grammar: analysisData.grammarPoints.length,
    syntax: analysisData.syntaxAnalysis?.length || 0,
    key: keySentenceIndices.size,
    exam: (analysisData.examDesign?.paraphrasableSegments.length || 0) + (analysisData.examDesign?.structureTransformPoints.length || 0),
  } : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-3">
          {counts && <>
            {counts.vocab > 0 && <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />어휘 {counts.vocab}</span>}
            {counts.grammar > 0 && <span className="flex items-center gap-1 text-[11px] text-violet-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />문법 {counts.grammar}</span>}
            {counts.syntax > 0 && <span className="flex items-center gap-1 text-[11px] text-cyan-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />구문 {counts.syntax}</span>}
            {counts.key > 0 && <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />핵심문장 {counts.key}</span>}
            {counts.exam > 0 && <span className="flex items-center gap-1 text-[11px] text-yellow-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />출제포인트 {counts.exam}</span>}
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

      {/* ─── 2-Column Layout ─── */}
      <div className="grid grid-cols-[1fr_1fr] divide-x divide-slate-100 min-h-[400px]">
        {/* LEFT: 지문 필기노트 */}
        <div className="p-5 overflow-y-auto max-h-[700px]">
          {!hasAnalysis && <p className="text-[13px] text-slate-400 mb-3">AI 분석을 실행하면 어휘·문법·구문 하이라이트가 표시됩니다.</p>}
          <div>{hasAnalysis ? analysisData.sentences.map(s => renderSentence(s)) : <div className="font-mono text-sm leading-[2]">{content}</div>}</div>
        </div>

        {/* RIGHT: 분석 요약 + 상세 패널 */}
        <div className="p-5 overflow-y-auto max-h-[700px] space-y-4">
          {/* 분석 요약 — 항상 상단 */}
          {hasAnalysis && (
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
          {activeDetail && (
            <div>
              {activeDetail.kind === "vocab" && <VocabPanel item={activeDetail.item} sentence={activeDetail.sentence} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "grammar" && <GrammarPanel item={activeDetail.item} sentence={activeDetail.sentence} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "syntax" && <SyntaxPanel item={activeDetail.item} sentence={activeDetail.sentence} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "keySentence" && <KeySentencePanel detail={activeDetail} onClose={() => setActiveDetail(null)} />}
              {activeDetail.kind === "examPoint" && <ExamPointPanel detail={activeDetail} onClose={() => setActiveDetail(null)} />}
            </div>
          )}

          {!activeDetail && !hasAnalysis && (
            <p className="text-[13px] text-slate-400">지문의 하이라이트를 클릭하면 상세 분석이 여기에 표시됩니다.</p>
          )}
        </div>
      </div>
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
function GrammarPanel({ item, sentence, onClose }: { item: GrammarPoint; sentence: SentenceAnalysis | null; onClose: () => void }) {
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
function SyntaxPanel({ item, sentence, onClose }: { item: SyntaxItem; sentence: SentenceAnalysis | null; onClose: () => void }) {
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
