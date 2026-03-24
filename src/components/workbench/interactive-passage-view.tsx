// @ts-nocheck
"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  BookOpen,
  Languages,
  Type,
  ChevronDown,
  ChevronUp,
  X,
  LetterText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type {
  PassageAnalysisData,
  VocabItem,
  GrammarPoint,
  SentenceAnalysis,
} from "@/types/passage-analysis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InteractivePassageViewProps {
  content: string;
  analysisData: PassageAnalysisData | null;
}

interface Highlight {
  start: number;
  end: number;
  type: "vocab" | "grammar";
  data: VocabItem | GrammarPoint;
}

type ActiveDetail =
  | { kind: "vocab"; item: VocabItem; sentence: SentenceAnalysis | null }
  | { kind: "grammar"; item: GrammarPoint; sentence: SentenceAnalysis | null }
  | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  basic: "bg-green-100 text-green-800",
  intermediate: "bg-amber-100 text-amber-800",
  advanced: "bg-red-100 text-red-800",
};

function buildHighlights(
  sentenceText: string,
  vocabItems: VocabItem[],
  grammarItems: GrammarPoint[],
  showVocab: boolean,
  showGrammar: boolean
): Highlight[] {
  const highlights: Highlight[] = [];

  if (showVocab) {
    for (const v of vocabItems) {
      const idx = sentenceText.toLowerCase().indexOf(v.word.toLowerCase());
      if (idx !== -1) {
        highlights.push({
          start: idx,
          end: idx + v.word.length,
          type: "vocab",
          data: v,
        });
      }
    }
  }

  if (showGrammar) {
    for (const g of grammarItems) {
      const idx = sentenceText
        .toLowerCase()
        .indexOf(g.textFragment.toLowerCase());
      if (idx !== -1) {
        highlights.push({
          start: idx,
          end: idx + g.textFragment.length,
          type: "grammar",
          data: g,
        });
      }
    }
  }

  // Sort by start position, then prefer shorter spans (more specific)
  highlights.sort((a, b) => a.start - b.start || a.end - b.end);

  // Remove overlapping highlights — keep the first one encountered
  const result: Highlight[] = [];
  let lastEnd = -1;
  for (const h of highlights) {
    if (h.start >= lastEnd) {
      result.push(h);
      lastEnd = h.end;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function VocabDetailPanel({
  item,
  sentence,
  onClose,
}: {
  item: VocabItem;
  sentence: SentenceAnalysis | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border bg-yellow-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{item.word}</span>
            {item.pronunciation && (
              <span className="text-sm text-muted-foreground">
                {item.pronunciation}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {item.partOfSpeech}
            </Badge>
            <Badge
              variant="secondary"
              className={`text-[10px] ${DIFFICULTY_COLORS[item.difficulty] || ""}`}
            >
              {item.difficulty}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground mr-1">뜻:</span>
        {item.meaning}
      </p>

      {sentence && (
        <div className="rounded-md bg-background/80 p-2.5 text-xs leading-relaxed">
          <span className="text-muted-foreground mr-1">문장:</span>
          {highlightWordInText(sentence.english, item.word)}
        </div>
      )}
    </div>
  );
}

function GrammarDetailPanel({
  item,
  sentence,
  onClose,
}: {
  item: GrammarPoint;
  sentence: SentenceAnalysis | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border bg-blue-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-lg font-bold">{item.pattern}</span>
          {item.level && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {item.level}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <p className="text-sm">{item.explanation}</p>

      <div className="rounded-md bg-background/80 p-2.5 text-xs leading-relaxed">
        <span className="text-muted-foreground mr-1">본문:</span>
        <span className="border-b-2 border-dashed border-blue-400">
          {item.textFragment}
        </span>
      </div>

      {item.examples && item.examples.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            예시:
          </span>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {item.examples.map((ex, i) => (
              <li key={i}>{ex}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function highlightWordInText(text: string, word: string) {
  const idx = text.toLowerCase().indexOf(word.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <span className="bg-yellow-200 font-medium rounded px-0.5">
        {text.slice(idx, idx + word.length)}
      </span>
      {text.slice(idx + word.length)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InteractivePassageView({
  content,
  analysisData,
}: InteractivePassageViewProps) {
  const [showVocab, setShowVocab] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const wordCount = useMemo(() => countWords(content), [content]);

  const sentenceMap = useMemo(() => {
    if (!analysisData) return new Map<number, SentenceAnalysis>();
    const map = new Map<number, SentenceAnalysis>();
    for (const s of analysisData.sentences) {
      map.set(s.index, s);
    }
    return map;
  }, [analysisData]);

  const vocabBySentence = useMemo(() => {
    if (!analysisData) return new Map<number, VocabItem[]>();
    const map = new Map<number, VocabItem[]>();
    for (const v of analysisData.vocabulary) {
      const arr = map.get(v.sentenceIndex) || [];
      arr.push(v);
      map.set(v.sentenceIndex, arr);
    }
    return map;
  }, [analysisData]);

  const grammarBySentence = useMemo(() => {
    if (!analysisData) return new Map<number, GrammarPoint[]>();
    const map = new Map<number, GrammarPoint[]>();
    for (const g of analysisData.grammarPoints) {
      const arr = map.get(g.sentenceIndex) || [];
      arr.push(g);
      map.set(g.sentenceIndex, arr);
    }
    return map;
  }, [analysisData]);

  const handleHighlightClick = useCallback(
    (highlight: Highlight) => {
      if (highlight.type === "vocab") {
        const vocab = highlight.data as VocabItem;
        // Toggle off if same item
        if (
          activeDetail?.kind === "vocab" &&
          activeDetail.item.word === vocab.word &&
          activeDetail.item.sentenceIndex === vocab.sentenceIndex
        ) {
          setActiveDetail(null);
          return;
        }
        setActiveDetail({
          kind: "vocab",
          item: vocab,
          sentence: sentenceMap.get(vocab.sentenceIndex) || null,
        });
      } else {
        const grammar = highlight.data as GrammarPoint;
        if (
          activeDetail?.kind === "grammar" &&
          activeDetail.item.id === grammar.id
        ) {
          setActiveDetail(null);
          return;
        }
        setActiveDetail({
          kind: "grammar",
          item: grammar,
          sentence: sentenceMap.get(grammar.sentenceIndex) || null,
        });
      }
    },
    [activeDetail, sentenceMap]
  );

  // Render a single sentence with highlights
  const renderSentence = useCallback(
    (sentence: SentenceAnalysis) => {
      const text = sentence.english;
      const vocab = vocabBySentence.get(sentence.index) || [];
      const grammar = grammarBySentence.get(sentence.index) || [];
      const highlights = buildHighlights(
        text,
        vocab,
        grammar,
        showVocab,
        showGrammar
      );

      const parts: React.ReactNode[] = [];
      let cursor = 0;

      for (let i = 0; i < highlights.length; i++) {
        const h = highlights[i];

        // Plain text before this highlight
        if (cursor < h.start) {
          parts.push(
            <span key={`plain-${sentence.index}-${cursor}`}>
              {text.slice(cursor, h.start)}
            </span>
          );
        }

        const fragment = text.slice(h.start, h.end);

        if (h.type === "vocab") {
          parts.push(
            <span
              key={`vocab-${sentence.index}-${h.start}`}
              className="bg-yellow-100 hover:bg-yellow-200 cursor-pointer rounded px-0.5 transition-colors"
              onClick={() => handleHighlightClick(h)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleHighlightClick(h);
                }
              }}
            >
              {fragment}
            </span>
          );
        } else {
          parts.push(
            <span
              key={`grammar-${sentence.index}-${h.start}`}
              className="border-b-2 border-dashed border-blue-400 cursor-pointer transition-colors hover:border-blue-600"
              onClick={() => handleHighlightClick(h)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleHighlightClick(h);
                }
              }}
            >
              {fragment}
            </span>
          );
        }

        cursor = h.end;
      }

      // Remaining plain text
      if (cursor < text.length) {
        parts.push(
          <span key={`plain-${sentence.index}-end`}>
            {text.slice(cursor)}
          </span>
        );
      }

      return (
        <React.Fragment key={`sentence-${sentence.index}`}>
          <sup className="text-[10px] font-bold text-muted-foreground mr-0.5 select-none">
            {sentence.index + 1}
          </sup>
          {parts}
          {" "}
          {showTranslation && (
            <span className="block text-xs text-muted-foreground pl-3 pb-1 leading-relaxed italic">
              {sentence.korean}
            </span>
          )}
        </React.Fragment>
      );
    },
    [
      vocabBySentence,
      grammarBySentence,
      showVocab,
      showGrammar,
      showTranslation,
      handleHighlightClick,
    ]
  );

  const hasAnalysis = analysisData !== null;

  return (
    <Card className="gap-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b flex-wrap">
        <div className="flex items-center gap-1.5">
          <ToggleButton
            active={showVocab}
            onClick={() => setShowVocab((v) => !v)}
            icon={Type}
            label="어휘"
          />
          <ToggleButton
            active={showGrammar}
            onClick={() => setShowGrammar((v) => !v)}
            icon={LetterText}
            label="문법"
          />
          <ToggleButton
            active={showTranslation}
            onClick={() => setShowTranslation((v) => !v)}
            icon={Languages}
            label="번역"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {wordCount} words
        </span>
      </div>

      {/* Passage body */}
      <CardContent className="py-4">
        {!hasAnalysis && (
          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
            <BookOpen className="size-3.5" />
            AI 분석을 실행하면 어휘/문법 하이라이트가 표시됩니다.
          </p>
        )}

        <div className="font-mono text-sm leading-[2]">
          {hasAnalysis
            ? analysisData.sentences.map((s) => renderSentence(s))
            : content}
        </div>
      </CardContent>

      {/* Detail panel */}
      {activeDetail && (
        <div className="px-4 pb-4">
          <Separator className="mb-4" />
          {activeDetail.kind === "vocab" ? (
            <VocabDetailPanel
              item={activeDetail.item}
              sentence={activeDetail.sentence}
              onClose={() => setActiveDetail(null)}
            />
          ) : (
            <GrammarDetailPanel
              item={activeDetail.item}
              sentence={activeDetail.sentence}
              onClose={() => setActiveDetail(null)}
            />
          )}
        </div>
      )}

      {/* Analysis summary (collapsible) */}
      {hasAnalysis && (
        <div className="px-4 pb-4">
          <Separator className="mb-3" />
          <button
            type="button"
            onClick={() => setSummaryOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {summaryOpen ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            분석 요약
            <span className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                어휘 {analysisData.vocabulary.length}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                문법 {analysisData.grammarPoints.length}
              </Badge>
            </span>
          </button>

          {summaryOpen && (
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="rounded-md bg-muted/50 p-3 space-y-2">
                <div>
                  <span className="font-medium text-muted-foreground">
                    주제:
                  </span>{" "}
                  {analysisData.structure.mainIdea}
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    목적:
                  </span>{" "}
                  {analysisData.structure.purpose}
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    유형:
                  </span>{" "}
                  {analysisData.structure.textType}
                </div>
              </div>

              {analysisData.structure.keyPoints &&
                analysisData.structure.keyPoints.length > 0 && (
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="font-medium text-muted-foreground block mb-1">
                      핵심 포인트:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {analysisData.structure.keyPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {analysisData.structure.paragraphSummaries &&
                analysisData.structure.paragraphSummaries.length > 0 && (
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="font-medium text-muted-foreground block mb-1">
                      단락 요약:
                    </span>
                    <div className="space-y-1">
                      {analysisData.structure.paragraphSummaries.map((ps) => (
                        <div key={ps.paragraphIndex}>
                          <span className="text-muted-foreground">
                            [{ps.role}]
                          </span>{" "}
                          {ps.summary}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
