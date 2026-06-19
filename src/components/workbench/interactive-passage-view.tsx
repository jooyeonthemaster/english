/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React, { useState, useMemo, useCallback } from "react";
import { MousePointerClick } from "lucide-react";
import type {
  PassageAnalysisData,
  SentenceAnalysis,
  SyntaxItem,
  VocabItem,
  GrammarPoint,
} from "@/types/passage-analysis";
import { TYPE_PRIORITY } from "./interactive-passage-view/constants";
import {
  countWords,
  examKey,
  grammarKey,
  keySentenceKey,
  noteDomId,
  syntaxKey,
  vocabKey,
  collectHighlights,
} from "./interactive-passage-view/helpers";
import { SentenceRow } from "./interactive-passage-view/sentence-row";
import type {
  ActiveDetail,
  CollectionEntry,
  ExamPointData,
  FocusedNote,
  Highlight,
  NoteCategory,
} from "./interactive-passage-view/types";
import { AnalysisSummaryAccordion } from "./interactive-passage-view/analysis-summary-accordion";
import { CategoryChip } from "./interactive-passage-view/category-chip";
import { CategoryCollectionPanel } from "./interactive-passage-view/category-collection-panel";
import {
  ExamPointPanel,
  GrammarPanel,
  KeySentencePanel,
  SyntaxPanel,
  VocabPanel,
} from "./interactive-passage-view/panels";

interface Props {
  content: string;
  analysisData: PassageAnalysisData | null;
  /** "horizontal" (default): 지문|분석 가로 배치. "vertical": 지문 위, 분석 아래 세로 배치 */
  layout?: "horizontal" | "vertical";
  /** 헤더 우측 (번역 ON 앞)에 추가로 삽입할 컨트롤 (예: 분석/원문 탭 토글) */
  headerExtra?: React.ReactNode;
  /** 헤더 첫 행(분석 포인트 + 번역 + words)을 숨기고 chips만 노출 */
  hideHeaderControls?: boolean;
  /** 번역 표시 외부 제어 (controlled) */
  showTranslation?: boolean;
  onShowTranslationChange?: (v: boolean) => void;
}

// ─── Main Component ──────────────────────────────────────
export function InteractivePassageView({
  content,
  analysisData,
  layout = "horizontal",
  headerExtra,
  hideHeaderControls = false,
  showTranslation: showTranslationProp,
  onShowTranslationChange,
}: Props) {
  const [internalShowTranslation, setInternalShowTranslation] = useState(true);
  const isControlledTranslation = showTranslationProp !== undefined;
  const showTranslation = isControlledTranslation ? showTranslationProp : internalShowTranslation;
  const setShowTranslation = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(showTranslation) : next;
    if (isControlledTranslation) onShowTranslationChange?.(resolved);
    else setInternalShowTranslation(resolved);
  };
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>(null);
  const [activeCollection, setActiveCollection] = useState<NoteCategory | null>(null);
  const [focusedNote, setFocusedNote] = useState<FocusedNote | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
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

  const onSyntaxBadgeClick = useCallback((sentence: SentenceAnalysis, syntax: SyntaxItem) => {
    setActiveCollection(null);
    setActiveDetail({ kind: "syntax", item: syntax, sentence });
  }, []);

  // ─── Render sentence ──────────────────────────────────
  const renderSentence = useCallback((sentence: SentenceAnalysis) => {
    const vocab = vocabBySentence.get(sentence.index) || [];
    const grammar = grammarBySentence.get(sentence.index) || [];
    const syntax = syntaxBySentence.get(sentence.index);
    const examTexts = examHighlightsBySentence.get(sentence.index) || [];
    const isKey = keySentenceIndices.has(sentence.index);
    const isTopic = analysisData?.structure?.topicSentenceIndex === sentence.index;
    const flow = analysisData?.structure?.logicFlow?.find(f => f.sentenceIndices.includes(sentence.index));
    return (
      <SentenceRow
        key={`s-${sentence.index}`}
        sentence={sentence}
        vocab={vocab}
        grammar={grammar}
        syntax={syntax}
        examTexts={examTexts}
        isKey={isKey}
        isTopic={!!isTopic}
        flow={flow}
        showTranslation={showTranslation}
        focusedNote={focusedNote}
        analysisData={analysisData}
        onSegmentClick={handleSegmentClick}
        onKeySentenceClick={handleKeySentenceClick}
        onSyntaxBadgeClick={onSyntaxBadgeClick}
      />
    );
  }, [vocabBySentence, grammarBySentence, syntaxBySentence, examHighlightsBySentence, keySentenceIndices, analysisData, showTranslation, focusedNote, handleSegmentClick, handleKeySentenceClick, onSyntaxBadgeClick]);

  // ─── Count badges ──────────────────────────────────────
  const counts = hasAnalysis ? noteSummary.counts : null;
  const rawCounts = hasAnalysis ? noteSummary.rawCounts : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="border-b px-5 py-3">
        {!hideHeaderControls && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {counts && (
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:flex">
                  <MousePointerClick className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-700">분석 포인트</span>
                  {counts && (
                    <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">칩을 눌러 목록 보기</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              {hasAnalysis && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-600">번역</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showTranslation}
                    onClick={() => setShowTranslation(v => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${showTranslation ? "border-blue-300 bg-blue-500" : "border-slate-200 bg-slate-200"}`}
                  >
                    <span
                      className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${showTranslation ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>
              )}
              <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-400">{wordCount} words</span>
            </div>
          </div>
        )}
        {counts && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {rawCounts.vocab > 0 && <CategoryChip category="vocab" count={counts.vocab} rawCount={rawCounts.vocab} active={activeCollection === "vocab"} onClick={() => { setActiveCollection(v => v === "vocab" ? null : "vocab"); setActiveDetail(null); }} />}
            {rawCounts.grammar > 0 && <CategoryChip category="grammar" count={counts.grammar} rawCount={rawCounts.grammar} active={activeCollection === "grammar"} onClick={() => { setActiveCollection(v => v === "grammar" ? null : "grammar"); setActiveDetail(null); }} />}
            {rawCounts.key > 0 && <CategoryChip category="key" count={counts.key} rawCount={rawCounts.key} active={activeCollection === "key"} onClick={() => { setActiveCollection(v => v === "key" ? null : "key"); setActiveDetail(null); }} />}
            {rawCounts.exam > 0 && <CategoryChip category="exam" count={counts.exam} rawCount={rawCounts.exam} active={activeCollection === "exam"} onClick={() => { setActiveCollection(v => v === "exam" ? null : "exam"); setActiveDetail(null); }} />}
          </div>
        )}
      </div>

      <div className={layout === "vertical"
        ? "flex flex-col divide-y divide-slate-100"
        : "grid grid-cols-1 lg:grid-cols-[1fr_1fr] lg:divide-x divide-y lg:divide-y-0 divide-slate-100 min-h-[400px]"
      }>
        {/* 지문 필기노트 */}
        <div className={layout === "vertical" ? "p-5 overflow-y-auto max-h-[45vh]" : "p-5 overflow-y-auto max-h-[700px]"}>
          {!hasAnalysis && <p className="text-[13px] text-slate-400 mb-3">AI 분석을 실행하면 어휘·어법·출제 포인트와 문장별 읽기 포인트가 표시됩니다.</p>}
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
            <AnalysisSummaryAccordion data={analysisData} open={summaryOpen} onToggle={() => setSummaryOpen(v => !v)} />
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
