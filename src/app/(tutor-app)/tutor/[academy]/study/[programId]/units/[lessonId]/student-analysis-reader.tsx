"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  BookOpen,
  Braces,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Languages,
  ListChecks,
  MessageSquareText,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  GrammarPoint,
  PassageAnalysisData,
  ParaphraseSegment,
  SentenceAnalysis,
  SyntaxItem,
  TransformPoint,
  VocabItem,
} from "@/types/passage-analysis";
import { cn } from "@/lib/utils";
import {
  buildSegments,
  collectHighlights,
  getSegmentStyle,
} from "@/components/workbench/interactive-passage-view/helpers";
import type {
  ExamPointData,
  Highlight,
} from "@/components/workbench/interactive-passage-view/types";

type ReaderSentence = {
  index: number;
  english: string;
  korean: string;
};

type ReaderTab = "brief" | "passage" | "exam" | "notes" | "flow";
type NoteFilter = "all" | "vocab" | "grammar" | "syntax";

type StudentExamPoint =
  | ({ source: "paraphrase" } & ParaphraseSegment)
  | ({ source: "transform" } & TransformPoint);

type FocusItem =
  | { kind: "sentence"; sentence: ReaderSentence }
  | { kind: "exam"; point: StudentExamPoint; sentence: ReaderSentence | null }
  | { kind: "vocab"; item: VocabItem; sentence: ReaderSentence | null }
  | { kind: "grammar"; item: GrammarPoint; sentence: ReaderSentence | null }
  | { kind: "syntax"; item: SyntaxItem; sentence: ReaderSentence | null };

const readerTabs: Array<{
  key: ReaderTab;
  label: string;
  Icon: typeof FileText;
}> = [
  { key: "brief", label: "요약", Icon: Sparkles },
  { key: "passage", label: "본문", Icon: BookOpen },
  { key: "exam", label: "출제", Icon: Target },
  { key: "notes", label: "필기", Icon: Languages },
  { key: "flow", label: "흐름", Icon: ListChecks },
];

const noteFilters: Array<{ key: NoteFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "vocab", label: "어휘" },
  { key: "grammar", label: "문법" },
  { key: "syntax", label: "구문" },
];

const difficultyLabel: Record<string, string> = {
  basic: "기본",
  intermediate: "심화",
  advanced: "고난도",
};

export function StudentAnalysisReader({
  title,
  passage,
  sentences,
  analysisData,
}: {
  title: string;
  passage: string;
  sentences: ReaderSentence[];
  analysisData: PassageAnalysisData | null;
}) {
  const [activeTab, setActiveTab] = useState<ReaderTab>("brief");
  const [showTranslation, setShowTranslation] = useState(true);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("all");
  const [focus, setFocus] = useState<FocusItem | null>(null);

  const displaySentences = useMemo(
    () => normalizeSentences(analysisData?.sentences, sentences, passage),
    [analysisData?.sentences, passage, sentences],
  );

  const sentenceByIndex = useMemo(() => {
    return new Map(displaySentences.map((sentence) => [sentence.index, sentence]));
  }, [displaySentences]);

  const vocabBySentence = useMemo(
    () => groupBySentence(analysisData?.vocabulary ?? []),
    [analysisData?.vocabulary],
  );

  const grammarBySentence = useMemo(
    () => groupBySentence(analysisData?.grammarPoints ?? []),
    [analysisData?.grammarPoints],
  );

  const syntaxBySentence = useMemo(() => {
    const map = new Map<number, SyntaxItem>();
    for (const item of analysisData?.syntaxAnalysis ?? []) {
      map.set(item.sentenceIndex, item);
    }
    return map;
  }, [analysisData?.syntaxAnalysis]);

  const examPoints = useMemo<StudentExamPoint[]>(() => {
    const paraphrases = (analysisData?.examDesign?.paraphrasableSegments ?? []).map((point) => ({
      ...point,
      source: "paraphrase" as const,
    }));
    const transforms = (analysisData?.examDesign?.structureTransformPoints ?? []).map((point) => ({
      ...point,
      source: "transform" as const,
    }));
    return [...paraphrases, ...transforms].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
  }, [analysisData?.examDesign]);

  const examBySentence = useMemo(() => {
    const map = new Map<number, StudentExamPoint[]>();
    for (const point of examPoints) {
      const list = map.get(point.sentenceIndex) ?? [];
      list.push(point);
      map.set(point.sentenceIndex, list);
    }
    return map;
  }, [examPoints]);

  const keySentenceIndices = useMemo(() => {
    const indices = new Set<number>();
    const topic = analysisData?.structure?.topicSentenceIndex;
    if (typeof topic === "number") indices.add(topic);
    for (const item of analysisData?.structure?.logicFlow ?? []) {
      if (item.role === "주장" || item.role === "결론") {
        for (const index of item.sentenceIndices) indices.add(index);
      }
    }
    return indices;
  }, [analysisData?.structure]);

  const metrics = {
    sentence: displaySentences.length,
    vocab: analysisData?.vocabulary?.length ?? 0,
    grammar: analysisData?.grammarPoints?.length ?? 0,
    syntax: analysisData?.syntaxAnalysis?.length ?? 0,
    exam: examPoints.length,
  };

  if (!analysisData) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-black text-blue-600">분석 노트</p>
          <h3 className="mt-1 line-clamp-1 text-lg font-black text-slate-950">{title}</h3>
        </div>
        <div className="p-5">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            분석 데이터가 아직 준비되지 않았습니다.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-blue-600">분석 노트</p>
            <h3 className="mt-1 line-clamp-1 text-lg font-black text-slate-950">{title}</h3>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTranslation((value) => !value)}
            className="h-10 shrink-0 rounded-2xl border-slate-200 px-3 text-xs font-black"
          >
            {showTranslation ? <Eye className="mr-1.5 size-4" /> : <EyeOff className="mr-1.5 size-4" />}
            해석
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1">
          {readerTabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                setFocus(null);
              }}
              className={cn(
                "flex h-11 min-w-0 items-center justify-center gap-1 rounded-xl text-xs font-black transition sm:text-sm",
                activeTab === key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <MetricPill label="문장" value={metrics.sentence} tone="slate" />
          <MetricPill label="출제" value={metrics.exam} tone="amber" />
          <MetricPill label="어휘" value={metrics.vocab} tone="blue" />
          <MetricPill label="문법" value={metrics.grammar} tone="violet" />
          <MetricPill label="구문" value={metrics.syntax} tone="cyan" />
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:divide-x lg:divide-slate-100">
        <div className="min-w-0 p-4 sm:p-5">
          {activeTab === "brief" && (
            <BriefView
              analysisData={analysisData}
              examPoints={examPoints}
              sentenceByIndex={sentenceByIndex}
              onFocus={setFocus}
              onOpenExam={() => setActiveTab("exam")}
            />
          )}

          {activeTab === "passage" && (
            <PassageView
              sentences={displaySentences}
              showTranslation={showTranslation}
              vocabBySentence={vocabBySentence}
              grammarBySentence={grammarBySentence}
              syntaxBySentence={syntaxBySentence}
              examBySentence={examBySentence}
              keySentenceIndices={keySentenceIndices}
              onFocus={setFocus}
            />
          )}

          {activeTab === "exam" && (
            <ExamView
              examPoints={examPoints}
              sentenceByIndex={sentenceByIndex}
              onFocus={setFocus}
              onOpenPassage={() => setActiveTab("passage")}
            />
          )}

          {activeTab === "notes" && (
            <NotesView
              analysisData={analysisData}
              sentenceByIndex={sentenceByIndex}
              noteFilter={noteFilter}
              onFilterChange={setNoteFilter}
              onFocus={setFocus}
            />
          )}

          {activeTab === "flow" && (
            <FlowView
              analysisData={analysisData}
              sentenceByIndex={sentenceByIndex}
              onFocus={setFocus}
            />
          )}
        </div>

        <aside className="hidden bg-slate-50/70 p-5 lg:block">
          <div className="sticky top-20">
            <FocusPanel focus={focus} analysisData={analysisData} />
          </div>
        </aside>
      </div>

      {focus && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="상세 닫기"
            className="fixed inset-0 z-[60] bg-slate-950/25"
            onClick={() => setFocus(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[78dvh] max-w-2xl overflow-y-auto rounded-t-[28px] border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex justify-center">
              <div className="h-1.5 w-12 rounded-full bg-slate-200" />
            </div>
            <FocusPanel focus={focus} analysisData={analysisData} onClose={() => setFocus(null)} />
          </div>
        </div>
      )}
    </section>
  );
}

function BriefView({
  analysisData,
  examPoints,
  sentenceByIndex,
  onFocus,
  onOpenExam,
}: {
  analysisData: PassageAnalysisData;
  examPoints: StudentExamPoint[];
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (focus: FocusItem) => void;
  onOpenExam: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoBlock label="주제" value={analysisData.structure.mainIdea || "핵심 주제가 정리되지 않았습니다."} />
        <InfoBlock label="목적" value={analysisData.structure.purpose || "글의 목적이 정리되지 않았습니다."} />
      </div>

      {(analysisData.structure.keyPoints?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <p className="text-sm font-black text-slate-950">암기 핵심</p>
          </div>
          <div className="space-y-2">
            {analysisData.structure.keyPoints.map((point, index) => (
              <div key={`${point}-${index}`} className="flex gap-2 text-sm font-semibold leading-6 text-slate-700">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-700">
                  {index + 1}
                </span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-amber-700" />
            <p className="text-sm font-black text-slate-950">출제 포인트</p>
          </div>
          <button
            type="button"
            onClick={onOpenExam}
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-white px-2.5 text-xs font-black text-amber-700 shadow-sm ring-1 ring-amber-100"
          >
            전체
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        {examPoints.length > 0 ? (
          <div className="space-y-2">
            {examPoints.slice(0, 3).map((point, index) => (
              <ExamPointCard
                key={`${point.source}-${point.sentenceIndex}-${point.original}-${index}`}
                point={point}
                sentence={sentenceByIndex.get(point.sentenceIndex) ?? null}
                compact
                onFocus={onFocus}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-500">
            출제 포인트가 정리되지 않았습니다.
          </p>
        )}
      </section>
    </div>
  );
}

function PassageView({
  sentences,
  showTranslation,
  vocabBySentence,
  grammarBySentence,
  syntaxBySentence,
  examBySentence,
  keySentenceIndices,
  onFocus,
}: {
  sentences: ReaderSentence[];
  showTranslation: boolean;
  vocabBySentence: Map<number, VocabItem[]>;
  grammarBySentence: Map<number, GrammarPoint[]>;
  syntaxBySentence: Map<number, SyntaxItem>;
  examBySentence: Map<number, StudentExamPoint[]>;
  keySentenceIndices: Set<number>;
  onFocus: (focus: FocusItem) => void;
}) {
  return (
    <div className="space-y-3">
      {sentences.map((sentence) => {
        const vocab = vocabBySentence.get(sentence.index) ?? [];
        const grammar = grammarBySentence.get(sentence.index) ?? [];
        const syntax = syntaxBySentence.get(sentence.index);
        const examPoints = examBySentence.get(sentence.index) ?? [];
        const isKey = keySentenceIndices.has(sentence.index);

        return (
          <SentenceCard
            key={sentence.index}
            sentence={sentence}
            vocab={vocab}
            grammar={grammar}
            syntax={syntax}
            examPoints={examPoints}
            isKey={isKey}
            showTranslation={showTranslation}
            onFocus={onFocus}
          />
        );
      })}
    </div>
  );
}

function SentenceCard({
  sentence,
  vocab,
  grammar,
  syntax,
  examPoints,
  isKey,
  showTranslation,
  onFocus,
}: {
  sentence: ReaderSentence;
  vocab: VocabItem[];
  grammar: GrammarPoint[];
  syntax: SyntaxItem | undefined;
  examPoints: StudentExamPoint[];
  isKey: boolean;
  showTranslation: boolean;
  onFocus: (focus: FocusItem) => void;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm transition",
        isKey ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onFocus({ kind: "sentence", sentence })}
          className="inline-flex h-8 items-center gap-2 rounded-xl bg-slate-50 px-2.5 text-xs font-black text-slate-600"
        >
          문장 {sentence.index + 1}
          <ChevronRight className="size-3.5" />
        </button>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {isKey && <SmallBadge tone="emerald">핵심</SmallBadge>}
          {examPoints.length > 0 && <SmallBadge tone="amber">출제 {examPoints.length}</SmallBadge>}
          {vocab.length > 0 && <SmallBadge tone="blue">어휘 {vocab.length}</SmallBadge>}
          {grammar.length > 0 && <SmallBadge tone="violet">문법 {grammar.length}</SmallBadge>}
          {syntax && <SmallBadge tone="cyan">구문</SmallBadge>}
        </div>
      </div>

      <HighlightedSentenceText
        sentence={sentence}
        vocab={vocab}
        grammar={grammar}
        syntax={syntax}
        examPoints={examPoints}
        onFocus={onFocus}
      />

      {showTranslation && sentence.korean && (
        <p className="mt-3 border-l-2 border-blue-500 pl-3 text-sm font-semibold leading-6 text-slate-600">
          {sentence.korean}
        </p>
      )}

      {(examPoints.length > 0 || grammar.length > 0 || vocab.length > 0 || syntax) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examPoints.slice(0, 2).map((point, index) => (
            <InlineAction
              key={`${point.source}-${point.original}-${index}`}
              tone="amber"
              onClick={() => onFocus({ kind: "exam", point, sentence })}
            >
              {pointLabel(point)}
            </InlineAction>
          ))}
          {grammar.slice(0, 1).map((item) => (
            <InlineAction
              key={item.id || `${item.sentenceIndex}-${item.pattern}`}
              tone="violet"
              onClick={() => onFocus({ kind: "grammar", item, sentence })}
            >
              {item.pattern}
            </InlineAction>
          ))}
          {syntax && (
            <InlineAction
              tone="cyan"
              onClick={() => onFocus({ kind: "syntax", item: syntax, sentence })}
            >
              {syntax.patternType || "구문 분석"}
            </InlineAction>
          )}
        </div>
      )}
    </article>
  );
}

function HighlightedSentenceText({
  sentence,
  vocab,
  grammar,
  syntax,
  examPoints,
  onFocus,
}: {
  sentence: ReaderSentence;
  vocab: VocabItem[];
  grammar: GrammarPoint[];
  syntax: SyntaxItem | undefined;
  examPoints: StudentExamPoint[];
  onFocus: (focus: FocusItem) => void;
}) {
  const examTexts = examPoints.map((point) => ({
    text: point.original,
    data: examPointToData(point),
  }));
  const highlights = collectHighlights(sentence.english, vocab, grammar, syntax, examTexts);
  const segments = buildSegments(highlights);

  if (segments.length === 0) {
    return <p className="font-mono text-[15px] font-semibold leading-8 text-slate-950">{sentence.english}</p>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const segment of segments) {
    if (cursor < segment.start) {
      parts.push(
        <span key={`plain-${sentence.index}-${cursor}`}>
          {sentence.english.slice(cursor, segment.start)}
        </span>,
      );
    }

    const text = sentence.english.slice(segment.start, segment.end);
    const primary = pickPrimaryHighlight(segment.highlights);
    parts.push(
      <button
        key={`highlight-${sentence.index}-${segment.start}-${segment.end}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (primary) onFocus(highlightToFocus(primary, sentence));
        }}
        className="rounded px-0.5 text-left transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        style={getSegmentStyle(segment.types)}
      >
        {text}
      </button>,
    );
    cursor = segment.end;
  }

  if (cursor < sentence.english.length) {
    parts.push(
      <span key={`plain-${sentence.index}-end`}>
        {sentence.english.slice(cursor)}
      </span>,
    );
  }

  return <p className="font-mono text-[15px] font-semibold leading-8 text-slate-950">{parts}</p>;
}

function ExamView({
  examPoints,
  sentenceByIndex,
  onFocus,
  onOpenPassage,
}: {
  examPoints: StudentExamPoint[];
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (focus: FocusItem) => void;
  onOpenPassage: () => void;
}) {
  if (examPoints.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
        출제 포인트가 정리되지 않았습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {examPoints.map((point, index) => (
        <ExamPointCard
          key={`${point.source}-${point.sentenceIndex}-${point.original}-${index}`}
          point={point}
          sentence={sentenceByIndex.get(point.sentenceIndex) ?? null}
          onFocus={onFocus}
          onOpenPassage={onOpenPassage}
        />
      ))}
    </div>
  );
}

function ExamPointCard({
  point,
  sentence,
  compact,
  onFocus,
  onOpenPassage,
}: {
  point: StudentExamPoint;
  sentence: ReaderSentence | null;
  compact?: boolean;
  onFocus: (focus: FocusItem) => void;
  onOpenPassage?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <SmallBadge tone={point.source === "paraphrase" ? "blue" : "violet"}>{pointLabel(point)}</SmallBadge>
            {point.difficulty && <SmallBadge tone="slate">{point.difficulty}</SmallBadge>}
            <SmallBadge tone="amber">문장 {point.sentenceIndex + 1}</SmallBadge>
          </div>
          <p className="font-mono text-sm font-bold leading-7 text-slate-950">{point.original}</p>
        </div>
        <button
          type="button"
          onClick={() => onFocus({ kind: "exam", point, sentence })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"
          aria-label="출제 포인트 상세"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      {point.reason && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700">
          {point.reason}
        </p>
      )}
      {!compact && point.questionExample && (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700">
          {point.questionExample}
        </p>
      )}
      {!compact && onOpenPassage && (
        <button
          type="button"
          onClick={() => {
            onFocus({ kind: "exam", point, sentence });
            onOpenPassage();
          }}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600"
        >
          본문
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </article>
  );
}

function NotesView({
  analysisData,
  sentenceByIndex,
  noteFilter,
  onFilterChange,
  onFocus,
}: {
  analysisData: PassageAnalysisData;
  sentenceByIndex: Map<number, ReaderSentence>;
  noteFilter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  onFocus: (focus: FocusItem) => void;
}) {
  const showVocab = noteFilter === "all" || noteFilter === "vocab";
  const showGrammar = noteFilter === "all" || noteFilter === "grammar";
  const showSyntax = noteFilter === "all" || noteFilter === "syntax";

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {noteFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onFilterChange(filter.key)}
            className={cn(
              "h-9 shrink-0 rounded-xl border px-3 text-xs font-black transition",
              noteFilter === filter.key
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {showVocab && analysisData.vocabulary.length > 0 && (
        <NoteSection title="어휘" Icon={Languages} tone="blue">
          {analysisData.vocabulary.map((item, index) => (
            <VocabNote
              key={`${item.sentenceIndex}-${item.word}-${index}`}
              item={item}
              sentence={sentenceByIndex.get(item.sentenceIndex) ?? null}
              onFocus={onFocus}
            />
          ))}
        </NoteSection>
      )}

      {showGrammar && analysisData.grammarPoints.length > 0 && (
        <NoteSection title="문법" Icon={FileText} tone="violet">
          {analysisData.grammarPoints.map((item, index) => (
            <GrammarNote
              key={item.id || `${item.sentenceIndex}-${item.pattern}-${index}`}
              item={item}
              sentence={sentenceByIndex.get(item.sentenceIndex) ?? null}
              onFocus={onFocus}
            />
          ))}
        </NoteSection>
      )}

      {showSyntax && (analysisData.syntaxAnalysis?.length ?? 0) > 0 && (
        <NoteSection title="구문" Icon={Braces} tone="cyan">
          {(analysisData.syntaxAnalysis ?? []).map((item, index) => (
            <SyntaxNote
              key={`${item.sentenceIndex}-${item.structure}-${index}`}
              item={item}
              sentence={sentenceByIndex.get(item.sentenceIndex) ?? null}
              onFocus={onFocus}
            />
          ))}
        </NoteSection>
      )}
    </div>
  );
}

function VocabNote({
  item,
  sentence,
  onFocus,
}: {
  item: VocabItem;
  sentence: ReaderSentence | null;
  onFocus: (focus: FocusItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFocus({ kind: "vocab", item, sentence })}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-black text-slate-950">{item.word}</p>
          <p className="mt-1 text-sm font-semibold text-blue-700">{item.meaning}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {item.difficulty && <SmallBadge tone="blue">{difficultyLabel[item.difficulty] ?? item.difficulty}</SmallBadge>}
          <SmallBadge tone="slate">문장 {item.sentenceIndex + 1}</SmallBadge>
        </div>
      </div>
      {item.contextMeaning && <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.contextMeaning}</p>}
    </button>
  );
}

function GrammarNote({
  item,
  sentence,
  onFocus,
}: {
  item: GrammarPoint;
  sentence: ReaderSentence | null;
  onFocus: (focus: FocusItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFocus({ kind: "grammar", item, sentence })}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:bg-violet-50/40"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-base font-black text-slate-950">{item.pattern}</p>
        <SmallBadge tone="violet">문장 {item.sentenceIndex + 1}</SmallBadge>
      </div>
      {item.textFragment && <p className="font-mono text-sm font-bold leading-6 text-violet-800">{item.textFragment}</p>}
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.explanation}</p>
      {sentence?.korean && <p className="mt-2 text-xs font-semibold text-slate-400">{sentence.korean}</p>}
    </button>
  );
}

function SyntaxNote({
  item,
  sentence,
  onFocus,
}: {
  item: SyntaxItem;
  sentence: ReaderSentence | null;
  onFocus: (focus: FocusItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFocus({ kind: "syntax", item, sentence })}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/40"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-base font-black text-cyan-700">{item.patternType || "구문 분석"}</p>
        <SmallBadge tone="cyan">문장 {item.sentenceIndex + 1}</SmallBadge>
      </div>
      <p className="font-mono text-sm font-bold leading-6 text-slate-800">{item.structure}</p>
      {item.chunkReading && <p className="mt-2 font-mono text-sm font-semibold leading-6 text-cyan-800">{item.chunkReading}</p>}
    </button>
  );
}

function FlowView({
  analysisData,
  sentenceByIndex,
  onFocus,
}: {
  analysisData: PassageAnalysisData;
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (focus: FocusItem) => void;
}) {
  const logicFlow = analysisData.structure.logicFlow ?? [];
  const connectors = analysisData.structure.connectorAnalysis ?? [];

  return (
    <div className="space-y-4">
      {logicFlow.length > 0 && (
        <section className="space-y-3">
          {logicFlow.map((item, index) => (
            <button
              key={`${item.role}-${index}`}
              type="button"
              onClick={() => {
                const first = sentenceByIndex.get(item.sentenceIndices[0]);
                if (first) onFocus({ kind: "sentence", sentence: first });
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SmallBadge tone={flowTone(item.role)}>{item.role}</SmallBadge>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-800">{item.summary}</p>
                </div>
                <span className="shrink-0 text-xs font-black text-slate-400">
                  {item.sentenceIndices.map((sentenceIndex) => sentenceIndex + 1).join(", ")}
                </span>
              </div>
            </button>
          ))}
        </section>
      )}

      {connectors.length > 0 && (
        <NoteSection title="연결어" Icon={ArrowRightLeft} tone="amber">
          {connectors.map((item, index) => (
            <button
              key={`${item.word}-${index}`}
              type="button"
              onClick={() => {
                const sentence = sentenceByIndex.get(item.sentenceIndex);
                if (sentence) onFocus({ kind: "sentence", sentence });
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-base font-black text-slate-950">{item.word}</p>
                <SmallBadge tone="amber">{item.role}</SmallBadge>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.examRelevance}</p>
            </button>
          ))}
        </NoteSection>
      )}
    </div>
  );
}

function FocusPanel({
  focus,
  analysisData,
  onClose,
}: {
  focus: FocusItem | null;
  analysisData: PassageAnalysisData;
  onClose?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-blue-600">{focus ? focusTitle(focus) : "핵심 개요"}</p>
          <p className="mt-1 line-clamp-2 text-base font-black text-slate-950">
            {focus ? focusHeading(focus) : analysisData.structure.mainIdea || "분석 요약"}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500"
            aria-label="상세 닫기"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!focus && (
        <div className="space-y-3">
          <InfoBlock label="목적" value={analysisData.structure.purpose || "목적 분석 없음"} />
          {analysisData.examDesign?.summaryKeyPoints?.length ? (
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="mb-2 text-xs font-black text-slate-500">요약 키워드</p>
              <div className="space-y-2">
                {analysisData.examDesign.summaryKeyPoints.slice(0, 4).map((point, index) => (
                  <p key={`${point}-${index}`} className="text-sm font-semibold leading-6 text-slate-700">
                    {point}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {focus?.kind === "sentence" && <SentenceDetail sentence={focus.sentence} analysisData={analysisData} />}
      {focus?.kind === "exam" && <ExamDetail point={focus.point} sentence={focus.sentence} />}
      {focus?.kind === "vocab" && <VocabDetail item={focus.item} sentence={focus.sentence} />}
      {focus?.kind === "grammar" && <GrammarDetail item={focus.item} sentence={focus.sentence} />}
      {focus?.kind === "syntax" && <SyntaxDetail item={focus.item} sentence={focus.sentence} />}
    </div>
  );
}

function SentenceDetail({
  sentence,
  analysisData,
}: {
  sentence: ReaderSentence;
  analysisData: PassageAnalysisData;
}) {
  const flow = analysisData.structure.logicFlow?.find((item) => item.sentenceIndices.includes(sentence.index));
  const isTopic = analysisData.structure.topicSentenceIndex === sentence.index;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="mb-2 text-xs font-black text-slate-500">본문</p>
        <p className="font-mono text-sm font-bold leading-7 text-slate-950">{sentence.english}</p>
        {sentence.korean && <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{sentence.korean}</p>}
      </div>
      {(flow || isTopic) && (
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {isTopic && <SmallBadge tone="emerald">주제문</SmallBadge>}
            {flow && <SmallBadge tone={flowTone(flow.role)}>{flow.role}</SmallBadge>}
          </div>
          {flow && <p className="text-sm font-semibold leading-6 text-slate-700">{flow.summary}</p>}
        </div>
      )}
    </div>
  );
}

function ExamDetail({
  point,
  sentence,
}: {
  point: StudentExamPoint;
  sentence: ReaderSentence | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-amber-50 p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <SmallBadge tone={point.source === "paraphrase" ? "blue" : "violet"}>{pointLabel(point)}</SmallBadge>
          {point.difficulty && <SmallBadge tone="amber">{point.difficulty}</SmallBadge>}
        </div>
        <p className="font-mono text-sm font-bold leading-7 text-slate-950">{point.original}</p>
      </div>
      {point.reason && <DetailBlock label="출제 이유" value={point.reason} />}
      {point.questionExample && <DetailBlock label="예상 문항" value={point.questionExample} />}
      {point.source === "paraphrase" && point.alternatives?.length > 0 && (
        <div className="rounded-2xl bg-blue-50 p-4">
          <p className="mb-2 text-xs font-black text-blue-700">패러프레이징</p>
          <div className="flex flex-wrap gap-2">
            {point.alternatives.map((alternative, index) => (
              <span key={`${alternative}-${index}`} className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-blue-700">
                {alternative}
              </span>
            ))}
          </div>
        </div>
      )}
      {point.source === "transform" && point.example && <DetailBlock label="변형 예시" value={point.example} mono />}
      {sentence && (
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="mb-2 text-xs font-black text-slate-500">연결 문장</p>
          <p className="font-mono text-sm font-bold leading-7 text-slate-900">{sentence.english}</p>
          {sentence.korean && <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{sentence.korean}</p>}
        </div>
      )}
    </div>
  );
}

function VocabDetail({
  item,
  sentence,
}: {
  item: VocabItem;
  sentence: ReaderSentence | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-blue-50 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="mr-1 font-mono text-lg font-black text-slate-950">{item.word}</p>
          {item.partOfSpeech && <SmallBadge tone="blue">{item.partOfSpeech}</SmallBadge>}
          {item.difficulty && <SmallBadge tone="slate">{difficultyLabel[item.difficulty] ?? item.difficulty}</SmallBadge>}
        </div>
        <p className="mt-2 text-base font-black text-blue-700">{item.meaning}</p>
      </div>
      {item.contextMeaning && <DetailBlock label="문맥 의미" value={item.contextMeaning} />}
      {item.englishDefinition && <DetailBlock label="영영 풀이" value={item.englishDefinition} />}
      <WordList label="동의어" words={item.synonyms} tone="blue" />
      <WordList label="반의어" words={item.antonyms} tone="rose" />
      <WordList label="콜로케이션" words={item.collocations} tone="emerald" />
      {sentence && <DetailBlock label="본문 문장" value={sentence.english} mono />}
    </div>
  );
}

function GrammarDetail({
  item,
  sentence,
}: {
  item: GrammarPoint;
  sentence: ReaderSentence | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-violet-50 p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {item.level && <SmallBadge tone="violet">{item.level}</SmallBadge>}
          {item.examType && <SmallBadge tone="rose">{item.examType}</SmallBadge>}
        </div>
        <p className="text-base font-black text-slate-950">{item.pattern}</p>
        {item.textFragment && <p className="mt-2 font-mono text-sm font-bold leading-6 text-violet-800">{item.textFragment}</p>}
      </div>
      <DetailBlock label="설명" value={item.explanation} />
      {item.commonMistake && <DetailBlock label="오답 함정" value={item.commonMistake} />}
      <WordList label="변형 가능" words={item.transformations} tone="violet" />
      {sentence && <DetailBlock label="본문 문장" value={sentence.english} mono />}
    </div>
  );
}

function SyntaxDetail({
  item,
  sentence,
}: {
  item: SyntaxItem;
  sentence: ReaderSentence | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-cyan-50 p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <SmallBadge tone="cyan">{item.complexity}</SmallBadge>
          {item.patternType && <SmallBadge tone="slate">{item.patternType}</SmallBadge>}
        </div>
        <p className="font-mono text-sm font-bold leading-7 text-slate-950">{item.structure}</p>
      </div>
      {item.chunkReading && <DetailBlock label="끊어읽기" value={item.chunkReading} mono />}
      {item.keyPhrase && <DetailBlock label="핵심 구문" value={item.keyPhrase} mono />}
      {item.transformPoint && <DetailBlock label="변형 포인트" value={item.transformPoint} />}
      {sentence && <DetailBlock label="본문 문장" value={sentence.english} mono />}
    </div>
  );
}

function NoteSection({
  title,
  Icon,
  tone,
  children,
}: {
  title: string;
  Icon: typeof FileText;
  tone: "blue" | "violet" | "cyan" | "amber";
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={cn("flex size-8 items-center justify-center rounded-xl", toneClass(tone).soft)}>
          <Icon className={cn("size-4", toneClass(tone).text)} />
        </span>
        <p className="text-sm font-black text-slate-950">{title}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="mb-1 text-xs font-black text-slate-400">{label}</p>
      <p className="text-sm font-bold leading-6 text-slate-800">{value}</p>
    </div>
  );
}

function DetailBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="mb-2 text-xs font-black text-slate-500">{label}</p>
      <p className={cn("text-sm font-semibold leading-6 text-slate-700", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function WordList({
  label,
  words,
  tone,
}: {
  label: string;
  words: string[] | undefined;
  tone: "blue" | "rose" | "emerald" | "violet";
}) {
  if (!words?.length) return null;
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="mb-2 text-xs font-black text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className={cn("rounded-lg px-2 py-1 text-xs font-bold", toneClass(tone).soft, toneClass(tone).text)}>
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "blue" | "violet" | "cyan" | "amber";
}) {
  return (
    <span className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-black", toneClass(tone).soft, toneClass(tone).text)}>
      {label}
      <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] text-slate-700">{value}</span>
    </span>
  );
}

function SmallBadge({
  tone,
  children,
}: {
  tone: "slate" | "blue" | "violet" | "cyan" | "amber" | "emerald" | "rose";
  children: ReactNode;
}) {
  return (
    <Badge className={cn("h-6 rounded-lg border-0 px-2 text-[11px] font-black shadow-none hover:bg-inherit", toneClass(tone).soft, toneClass(tone).text)}>
      {children}
    </Badge>
  );
}

function InlineAction({
  tone,
  children,
  onClick,
}: {
  tone: "blue" | "violet" | "cyan" | "amber";
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex h-8 max-w-full items-center gap-1 rounded-xl px-2.5 text-xs font-black", toneClass(tone).soft, toneClass(tone).text)}
    >
      <span className="truncate">{children}</span>
      <ChevronRight className="size-3.5 shrink-0" />
    </button>
  );
}

function normalizeSentences(
  analysisSentences: SentenceAnalysis[] | undefined,
  fallback: ReaderSentence[],
  passage: string,
): ReaderSentence[] {
  if (analysisSentences?.length) {
    return analysisSentences.map((sentence) => ({
      index: sentence.index,
      english: sentence.english,
      korean: sentence.korean,
    }));
  }
  if (fallback.length) return fallback;
  return passage
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length > 0)
    .map((english, index) => ({ index, english: english.trim(), korean: "" }));
}

function groupBySentence<T extends { sentenceIndex: number }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const list = map.get(item.sentenceIndex) ?? [];
    list.push(item);
    map.set(item.sentenceIndex, list);
  }
  return map;
}

function examPointToData(point: StudentExamPoint): ExamPointData {
  if (point.source === "paraphrase") {
    return {
      kind: "paraphrase",
      sentenceIndex: point.sentenceIndex,
      original: point.original,
      alternatives: point.alternatives,
      reason: point.reason,
      questionExample: point.questionExample,
      difficulty: point.difficulty,
      relatedPoint: point.relatedPoint,
    };
  }
  return {
    kind: "transform",
    sentenceIndex: point.sentenceIndex,
    original: point.original,
    transformType: point.transformType,
    example: point.example,
    reason: point.reason,
    questionExample: point.questionExample,
    difficulty: point.difficulty,
  };
}

function highlightToFocus(highlight: Highlight, sentence: ReaderSentence): FocusItem {
  if (highlight.type === "vocab") {
    return { kind: "vocab", item: highlight.data as VocabItem, sentence };
  }
  if (highlight.type === "grammar") {
    return { kind: "grammar", item: highlight.data as GrammarPoint, sentence };
  }
  if (highlight.type === "syntax") {
    return { kind: "syntax", item: highlight.data as SyntaxItem, sentence };
  }
  const data = highlight.data as ExamPointData;
  const point: StudentExamPoint =
    data.kind === "paraphrase"
      ? {
          source: "paraphrase",
          sentenceIndex: data.sentenceIndex,
          original: data.original ?? data.text ?? "",
          alternatives: data.alternatives ?? [],
          reason: data.reason,
          questionExample: data.questionExample,
          difficulty: data.difficulty,
          relatedPoint: data.relatedPoint,
        }
      : {
          source: "transform",
          sentenceIndex: data.sentenceIndex,
          original: data.original ?? data.text ?? "",
          transformType: data.transformType ?? "구조 변형",
          example: data.example ?? "",
          reason: data.reason,
          questionExample: data.questionExample,
          difficulty: data.difficulty,
        };
  return { kind: "exam", point, sentence };
}

function pickPrimaryHighlight(highlights: Highlight[]): Highlight | null {
  const order = { exam: 4, grammar: 3, syntax: 2, vocab: 1 };
  return [...highlights].sort((a, b) => order[b.type] - order[a.type])[0] ?? null;
}

function pointLabel(point: StudentExamPoint) {
  return point.source === "paraphrase" ? "패러프레이징" : point.transformType || "구조 변형";
}

function focusTitle(focus: FocusItem) {
  if (focus.kind === "sentence") return `문장 ${focus.sentence.index + 1}`;
  if (focus.kind === "exam") return "출제 포인트";
  if (focus.kind === "vocab") return "어휘";
  if (focus.kind === "grammar") return "문법";
  return "구문";
}

function focusHeading(focus: FocusItem) {
  if (focus.kind === "sentence") return focus.sentence.english;
  if (focus.kind === "exam") return pointLabel(focus.point);
  if (focus.kind === "vocab") return focus.item.word;
  if (focus.kind === "grammar") return focus.item.pattern;
  return focus.item.patternType || "구문 분석";
}

function flowTone(role: string): "emerald" | "amber" | "blue" | "violet" | "slate" {
  if (role === "주장" || role === "결론") return "emerald";
  if (role === "예시" || role === "부연") return "blue";
  if (role === "반론" || role === "전환") return "amber";
  if (role === "근거") return "violet";
  return "slate";
}

function toneClass(tone: "slate" | "blue" | "violet" | "cyan" | "amber" | "emerald" | "rose") {
  switch (tone) {
    case "blue":
      return { soft: "bg-blue-50", text: "text-blue-700" };
    case "violet":
      return { soft: "bg-violet-50", text: "text-violet-700" };
    case "cyan":
      return { soft: "bg-cyan-50", text: "text-cyan-700" };
    case "amber":
      return { soft: "bg-amber-50", text: "text-amber-700" };
    case "emerald":
      return { soft: "bg-emerald-50", text: "text-emerald-700" };
    case "rose":
      return { soft: "bg-rose-50", text: "text-rose-700" };
    default:
      return { soft: "bg-slate-100", text: "text-slate-600" };
  }
}
