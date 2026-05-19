"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  Braces,
  ChevronRight,
  FileText,
  Languages,
  Lightbulb,
  ListChecks,
  Target,
  X,
} from "lucide-react";
import { useTutorModalLock } from "@/app/(tutor-app)/tutor/[academy]/_components/tutor-modal-context";
import type {
  ConnectorItem,
  GrammarPoint,
  LogicFlowItem,
  ParaphraseSegment,
  PassageAnalysisData,
  SentenceAnalysis,
  SyntaxItem,
  TransformPoint,
  VocabItem,
} from "@/types/passage-analysis";
import { cn } from "@/lib/utils";
import {
  buildSegments,
  collectHighlights,
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

type StudentExamPoint =
  | ({ source: "paraphrase" } & ParaphraseSegment)
  | ({ source: "transform" } & TransformPoint);

type SheetKey = "overview" | "exam" | "vocab" | "grammar" | "syntax" | "flow";

type FocusItem =
  | { kind: "vocab"; item: VocabItem; sentence: ReaderSentence | null }
  | { kind: "grammar"; item: GrammarPoint; sentence: ReaderSentence | null }
  | { kind: "syntax"; item: SyntaxItem; sentence: ReaderSentence | null }
  | { kind: "exam"; point: StudentExamPoint; sentence: ReaderSentence | null }
  | { kind: "chooser"; sentence: ReaderSentence; highlights: Highlight[]; text: string };

const difficultyLabel: Record<string, string> = {
  basic: "기본",
  intermediate: "심화",
  advanced: "고난도",
};

export function LessonReader({
  sentences,
  analysisData,
}: {
  sentences: ReaderSentence[];
  analysisData: PassageAnalysisData | null;
}) {
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [focus, setFocus] = useState<FocusItem | null>(null);

  const displaySentences = useMemo(
    () => normalizeSentences(analysisData?.sentences, sentences),
    [analysisData?.sentences, sentences],
  );
  const sentenceByIndex = useMemo(
    () => new Map(displaySentences.map((sentence) => [sentence.index, sentence])),
    [displaySentences],
  );

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

  if (!analysisData) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[13px] font-medium text-slate-500">
          분석 데이터가 아직 준비되지 않았습니다.
        </div>
      </div>
    );
  }

  const counts = {
    exam: examPoints.length,
    vocab: analysisData.vocabulary.length,
    grammar: analysisData.grammarPoints.length,
    syntax: analysisData.syntaxAnalysis?.length ?? 0,
    flow: analysisData.structure.logicFlow?.length ?? 0,
  };

  return (
    <>
      <div className="px-3 pb-6 pt-3">
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Chip Icon={Lightbulb} label="주제·핵심" onClick={() => setSheet("overview")} />
          <Chip Icon={Target} label="출제" count={counts.exam} onClick={() => setSheet("exam")} />
          <Chip Icon={Languages} label="어휘" count={counts.vocab} onClick={() => setSheet("vocab")} />
          <Chip Icon={FileText} label="문법" count={counts.grammar} onClick={() => setSheet("grammar")} />
          <Chip Icon={Braces} label="구문" count={counts.syntax} onClick={() => setSheet("syntax")} />
          <Chip Icon={ListChecks} label="흐름" count={counts.flow} onClick={() => setSheet("flow")} />
        </div>

        <Legend />

        <div className="mt-3 space-y-3.5">
          {displaySentences.map((sentence) => (
            <SentenceBlock
              key={sentence.index}
              sentence={sentence}
              vocab={vocabBySentence.get(sentence.index) ?? []}
              grammar={grammarBySentence.get(sentence.index) ?? []}
              syntax={syntaxBySentence.get(sentence.index)}
              examPoints={examBySentence.get(sentence.index) ?? []}
              isKey={keySentenceIndices.has(sentence.index)}
              isTopic={analysisData.structure.topicSentenceIndex === sentence.index}
              onFocus={setFocus}
            />
          ))}
        </div>
      </div>

      {sheet && (
        <Sheet title={sheetTitle(sheet)} onClose={() => setSheet(null)}>
          {sheet === "overview" && <OverviewSheet analysisData={analysisData} />}
          {sheet === "exam" && (
            <ExamSheet
              examPoints={examPoints}
              sentenceByIndex={sentenceByIndex}
              onFocus={(point, sentence) => {
                setSheet(null);
                setFocus({ kind: "exam", point, sentence });
              }}
            />
          )}
          {sheet === "vocab" && (
            <VocabListSheet
              items={analysisData.vocabulary}
              sentenceByIndex={sentenceByIndex}
              onFocus={(item, sentence) => {
                setSheet(null);
                setFocus({ kind: "vocab", item, sentence });
              }}
            />
          )}
          {sheet === "grammar" && (
            <GrammarListSheet
              items={analysisData.grammarPoints}
              sentenceByIndex={sentenceByIndex}
              onFocus={(item, sentence) => {
                setSheet(null);
                setFocus({ kind: "grammar", item, sentence });
              }}
            />
          )}
          {sheet === "syntax" && (
            <SyntaxListSheet
              items={analysisData.syntaxAnalysis ?? []}
              sentenceByIndex={sentenceByIndex}
              onFocus={(item, sentence) => {
                setSheet(null);
                setFocus({ kind: "syntax", item, sentence });
              }}
            />
          )}
          {sheet === "flow" && (
            <FlowSheet
              logicFlow={analysisData.structure.logicFlow ?? []}
              connectors={analysisData.structure.connectorAnalysis ?? []}
              sentenceByIndex={sentenceByIndex}
            />
          )}
        </Sheet>
      )}

      {focus && (
        <Sheet title={focusTitle(focus)} onClose={() => setFocus(null)}>
          {focus.kind === "vocab" && <VocabDetail item={focus.item} sentence={focus.sentence} />}
          {focus.kind === "grammar" && <GrammarDetail item={focus.item} sentence={focus.sentence} />}
          {focus.kind === "syntax" && <SyntaxDetail item={focus.item} sentence={focus.sentence} />}
          {focus.kind === "exam" && <ExamDetail point={focus.point} sentence={focus.sentence} />}
          {focus.kind === "chooser" && (
            <ChooserSheet
              text={focus.text}
              highlights={focus.highlights}
              onSelect={(highlight) => setFocus(highlightToFocus(highlight, focus.sentence))}
            />
          )}
        </Sheet>
      )}
    </>
  );
}

function Chip({
  Icon,
  label,
  count,
  onClick,
}: {
  Icon: typeof Lightbulb;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-[11px] font-bold text-slate-700 active:bg-slate-200"
    >
      <Icon className="size-3.5 text-blue-600" />
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-blue-700">
          {count}
        </span>
      )}
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] font-bold text-slate-400">
      <LegendItem swatchStyle={{ borderBottom: "1.5px solid #3b82f6" }} label="어휘" />
      <LegendItem
        swatchStyle={{
          textDecoration: "underline wavy #8b5cf6",
          textUnderlineOffset: "3px",
        }}
        label="문법"
      />
      <LegendItem swatchStyle={{ borderBottom: "2px dashed #0891b2" }} label="구문" />
      <LegendItem
        swatchStyle={{
          background: "linear-gradient(to top, rgba(254, 240, 138, 0.5) 28%, transparent 28%)",
        }}
        label="출제"
      />
      <span className="text-slate-300">중첩은 탭하면 선택</span>
    </div>
  );
}

function LegendItem({
  swatchStyle,
  label,
}: {
  swatchStyle: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block font-mono text-[10px] font-bold text-slate-500"
        style={swatchStyle}
      >
        ab
      </span>
      <span>{label}</span>
    </span>
  );
}

function SentenceBlock({
  sentence,
  vocab,
  grammar,
  syntax,
  examPoints,
  isKey,
  isTopic,
  onFocus,
}: {
  sentence: ReaderSentence;
  vocab: VocabItem[];
  grammar: GrammarPoint[];
  syntax: SyntaxItem | undefined;
  examPoints: StudentExamPoint[];
  isKey: boolean;
  isTopic: boolean;
  onFocus: (focus: FocusItem) => void;
}) {
  return (
    <article
      className={cn(
        "border-l-2 pl-2.5",
        isTopic ? "border-blue-600" : isKey ? "border-blue-300" : "border-slate-100",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-slate-300">#{sentence.index + 1}</span>
        {isTopic && (
          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
            주제문
          </span>
        )}
        {!isTopic && isKey && (
          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
            핵심
          </span>
        )}
        {examPoints.length > 0 && (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
            출제 {examPoints.length}
          </span>
        )}
      </div>
      <HighlightedSentence
        sentence={sentence}
        vocab={vocab}
        grammar={grammar}
        syntax={syntax}
        examPoints={examPoints}
        onFocus={onFocus}
      />
      {sentence.korean && (
        <p className="mt-1.5 text-[12px] font-medium leading-6 text-slate-500">
          {sentence.korean}
        </p>
      )}
    </article>
  );
}

function HighlightedSentence({
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
    return (
      <p className="font-mono text-[14.5px] font-medium leading-7 text-slate-900">
        {sentence.english}
      </p>
    );
  }

  const parts: ReactNode[] = [];
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
    const uniqueHighlights = dedupeHighlights(segment.highlights);
    parts.push(
      <button
        key={`hl-${sentence.index}-${segment.start}-${segment.end}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (uniqueHighlights.length === 0) return;
          if (uniqueHighlights.length === 1) {
            onFocus(highlightToFocus(uniqueHighlights[0], sentence));
            return;
          }
          onFocus({ kind: "chooser", sentence, highlights: uniqueHighlights, text });
        }}
        className="rounded px-0.5 text-left transition active:bg-blue-100/40"
        style={studentSegmentStyle(segment.types)}
      >
        {text}
      </button>,
    );
    cursor = segment.end;
  }
  if (cursor < sentence.english.length) {
    parts.push(<span key={`plain-${sentence.index}-end`}>{sentence.english.slice(cursor)}</span>);
  }
  return (
    <p className="font-mono text-[14.5px] font-medium leading-7 text-slate-900">{parts}</p>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useTutorModalLock(true);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="닫기"
        className="fixed inset-0 z-[100] bg-slate-950/40"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[110] mx-auto flex max-h-[82dvh] max-w-2xl flex-col rounded-t-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-9 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 pb-3 pt-1">
          <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:bg-slate-200"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-8">{children}</div>
      </div>
    </>,
    document.body,
  );
}

function OverviewSheet({ analysisData }: { analysisData: PassageAnalysisData }) {
  return (
    <div className="space-y-3">
      <Block label="주제" value={analysisData.structure.mainIdea || "정리된 주제가 없습니다."} />
      <Block label="목적" value={analysisData.structure.purpose || "정리된 목적이 없습니다."} />
      {analysisData.structure.tone && <Block label="어조" value={analysisData.structure.tone} />}
      {(analysisData.structure.keyPoints?.length ?? 0) > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-400">암기 핵심</p>
          <ol className="space-y-2">
            {analysisData.structure.keyPoints.map((point, index) => (
              <li
                key={`${point}-${index}`}
                className="flex gap-2 text-[13px] font-medium leading-6 text-slate-700"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
                  {index + 1}
                </span>
                {point}
              </li>
            ))}
          </ol>
        </section>
      )}
      {(analysisData.examDesign?.summaryKeyPoints?.length ?? 0) > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-400">요약 키워드</p>
          <ul className="space-y-1.5">
            {(analysisData.examDesign?.summaryKeyPoints ?? []).map((point, index) => (
              <li
                key={`${point}-${index}`}
                className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-medium leading-6 text-slate-700"
              >
                {point}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ExamSheet({
  examPoints,
  sentenceByIndex,
  onFocus,
}: {
  examPoints: StudentExamPoint[];
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (point: StudentExamPoint, sentence: ReaderSentence | null) => void;
}) {
  if (examPoints.length === 0) {
    return <Empty>정리된 출제 포인트가 없습니다.</Empty>;
  }
  return (
    <ul className="space-y-2">
      {examPoints.map((point, index) => (
        <li key={`${point.source}-${point.sentenceIndex}-${index}`}>
          <button
            type="button"
            onClick={() => onFocus(point, sentenceByIndex.get(point.sentenceIndex) ?? null)}
            className="flex w-full items-start gap-3 rounded-xl border border-slate-100 px-3 py-3 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap gap-1">
                <Tag tone="blue">{pointLabel(point)}</Tag>
                {point.difficulty && <Tag tone="slate">{point.difficulty}</Tag>}
                <Tag tone="slate">#{point.sentenceIndex + 1}</Tag>
              </div>
              <p className="font-mono text-[12.5px] font-bold leading-6 text-slate-900">
                {point.original}
              </p>
              {point.reason && (
                <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-5 text-slate-500">
                  {point.reason}
                </p>
              )}
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-slate-300" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function VocabListSheet({
  items,
  sentenceByIndex,
  onFocus,
}: {
  items: VocabItem[];
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (item: VocabItem, sentence: ReaderSentence | null) => void;
}) {
  if (items.length === 0) return <Empty>정리된 어휘가 없습니다.</Empty>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item.sentenceIndex}-${item.word}-${index}`}>
          <button
            type="button"
            onClick={() => onFocus(item, sentenceByIndex.get(item.sentenceIndex) ?? null)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[13.5px] font-bold text-slate-900">{item.word}</p>
              <p className="mt-0.5 line-clamp-1 text-[12px] font-medium text-blue-700">
                {item.meaning}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {item.difficulty && (
                <Tag tone="slate">{difficultyLabel[item.difficulty] ?? item.difficulty}</Tag>
              )}
              <Tag tone="slate">#{item.sentenceIndex + 1}</Tag>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GrammarListSheet({
  items,
  sentenceByIndex,
  onFocus,
}: {
  items: GrammarPoint[];
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (item: GrammarPoint, sentence: ReaderSentence | null) => void;
}) {
  if (items.length === 0) return <Empty>정리된 문법 포인트가 없습니다.</Empty>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item.id || `${item.sentenceIndex}-${item.pattern}`}-${index}`}>
          <button
            type="button"
            onClick={() => onFocus(item, sentenceByIndex.get(item.sentenceIndex) ?? null)}
            className="flex w-full items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-slate-900">{item.pattern}</p>
              {item.textFragment && (
                <p className="mt-0.5 line-clamp-1 font-mono text-[12px] font-medium text-violet-700">
                  {item.textFragment}
                </p>
              )}
              <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-5 text-slate-500">
                {item.explanation}
              </p>
            </div>
            <Tag tone="slate">#{item.sentenceIndex + 1}</Tag>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SyntaxListSheet({
  items,
  sentenceByIndex,
  onFocus,
}: {
  items: SyntaxItem[];
  sentenceByIndex: Map<number, ReaderSentence>;
  onFocus: (item: SyntaxItem, sentence: ReaderSentence | null) => void;
}) {
  if (items.length === 0) return <Empty>정리된 구문이 없습니다.</Empty>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item.sentenceIndex}-${index}`}>
          <button
            type="button"
            onClick={() => onFocus(item, sentenceByIndex.get(item.sentenceIndex) ?? null)}
            className="flex w-full items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold text-cyan-700">
                {item.patternType || "구문 분석"}
              </p>
              <p className="mt-0.5 line-clamp-2 font-mono text-[12px] font-medium leading-5 text-slate-700">
                {item.structure}
              </p>
            </div>
            <Tag tone="slate">#{item.sentenceIndex + 1}</Tag>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FlowSheet({
  logicFlow,
  connectors,
  sentenceByIndex,
}: {
  logicFlow: LogicFlowItem[];
  connectors: ConnectorItem[];
  sentenceByIndex: Map<number, ReaderSentence>;
}) {
  if (logicFlow.length === 0 && connectors.length === 0) {
    return <Empty>정리된 흐름이 없습니다.</Empty>;
  }
  return (
    <div className="space-y-4">
      {logicFlow.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-400">논리 흐름</p>
          <ol className="space-y-2">
            {logicFlow.map((item, index) => (
              <li
                key={`${item.role}-${index}`}
                className="rounded-xl border border-slate-100 px-3 py-2.5"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Tag tone="blue">{item.role}</Tag>
                  <span className="text-[10px] font-bold text-slate-400">
                    {item.sentenceIndices.map((idx) => `#${idx + 1}`).join(" ")}
                  </span>
                </div>
                <p className="text-[12.5px] font-medium leading-6 text-slate-700">
                  {item.summary}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {connectors.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <ArrowRightLeft className="size-3.5 text-blue-600" />
            <p className="text-[11px] font-bold text-slate-400">연결어</p>
          </div>
          <ul className="space-y-1.5">
            {connectors.map((item, index) => {
              const sentence = sentenceByIndex.get(item.sentenceIndex);
              return (
                <li
                  key={`${item.word}-${index}`}
                  className="rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[13px] font-bold text-slate-900">{item.word}</p>
                    <Tag tone="slate">{item.role}</Tag>
                  </div>
                  <p className="mt-1 text-[12px] font-medium leading-5 text-slate-500">
                    {item.examRelevance}
                  </p>
                  {sentence && (
                    <p className="mt-1.5 line-clamp-2 font-mono text-[11.5px] font-medium leading-5 text-slate-400">
                      {sentence.english}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function VocabDetail({ item, sentence }: { item: VocabItem; sentence: ReaderSentence | null }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-blue-50 px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-mono text-[16px] font-bold text-slate-900">{item.word}</p>
          {item.partOfSpeech && <Tag tone="blue">{item.partOfSpeech}</Tag>}
          {item.difficulty && (
            <Tag tone="slate">{difficultyLabel[item.difficulty] ?? item.difficulty}</Tag>
          )}
        </div>
        <p className="mt-1.5 text-[13px] font-bold text-blue-700">{item.meaning}</p>
      </div>
      {item.contextMeaning && <Block label="문맥 의미" value={item.contextMeaning} />}
      {item.englishDefinition && <Block label="영영 풀이" value={item.englishDefinition} />}
      <WordList label="동의어" words={item.synonyms} tone="blue" />
      <WordList label="반의어" words={item.antonyms} tone="rose" />
      <WordList label="콜로케이션" words={item.collocations} tone="emerald" />
      {sentence && <Block label="본문 문장" value={sentence.english} mono />}
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
      <div className="rounded-xl bg-violet-50 px-3 py-3">
        <div className="mb-1 flex flex-wrap gap-1.5">
          {item.level && <Tag tone="violet">{item.level}</Tag>}
          {item.examType && <Tag tone="slate">{item.examType}</Tag>}
        </div>
        <p className="text-[14px] font-bold text-slate-900">{item.pattern}</p>
        {item.textFragment && (
          <p className="mt-1 font-mono text-[12.5px] font-bold leading-6 text-violet-700">
            {item.textFragment}
          </p>
        )}
      </div>
      <Block label="설명" value={item.explanation} />
      {item.commonMistake && <Block label="오답 함정" value={item.commonMistake} />}
      <WordList label="변형 방향" words={item.transformations} tone="violet" />
      {sentence && <Block label="본문 문장" value={sentence.english} mono />}
    </div>
  );
}

function SyntaxDetail({ item, sentence }: { item: SyntaxItem; sentence: ReaderSentence | null }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-cyan-50 px-3 py-3">
        <div className="mb-1 flex flex-wrap gap-1.5">
          <Tag tone="cyan">{item.complexity}</Tag>
          {item.patternType && <Tag tone="slate">{item.patternType}</Tag>}
        </div>
        <p className="font-mono text-[13px] font-bold leading-6 text-slate-900">
          {item.structure}
        </p>
      </div>
      {item.chunkReading && <Block label="끊어읽기" value={item.chunkReading} mono />}
      {item.keyPhrase && <Block label="핵심 구문" value={item.keyPhrase} mono />}
      {item.transformPoint && <Block label="변형 포인트" value={item.transformPoint} />}
      {sentence && <Block label="본문 문장" value={sentence.english} mono />}
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
      <div className="rounded-xl bg-slate-50 px-3 py-3">
        <div className="mb-1 flex flex-wrap gap-1.5">
          <Tag tone="blue">{pointLabel(point)}</Tag>
          {point.difficulty && <Tag tone="slate">{point.difficulty}</Tag>}
        </div>
        <p className="font-mono text-[13px] font-bold leading-6 text-slate-900">{point.original}</p>
      </div>
      {point.reason && <Block label="출제 이유" value={point.reason} />}
      {point.questionExample && <Block label="예상 문항" value={point.questionExample} />}
      {point.source === "paraphrase" && point.alternatives?.length > 0 && (
        <WordList label="패러프레이징" words={point.alternatives} tone="blue" />
      )}
      {point.source === "transform" && point.example && (
        <Block label="변형 예시" value={point.example} mono />
      )}
      {sentence && <Block label="본문 문장" value={sentence.english} mono />}
    </div>
  );
}

function Block({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="mb-1 text-[10px] font-bold text-slate-400">{label}</p>
      <p
        className={cn(
          "text-[12.5px] font-medium leading-6 text-slate-700",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
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
  const cls = toneClass(tone);
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className={cn("rounded-lg px-2 py-1 text-[11.5px] font-bold", cls.soft, cls.text)}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "slate" | "blue" | "violet" | "cyan";
  children: ReactNode;
}) {
  const cls = toneClass(tone);
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-bold",
        cls.soft,
        cls.text,
      )}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-[12.5px] font-medium text-slate-500">
      {children}
    </div>
  );
}

function toneClass(tone: "slate" | "blue" | "violet" | "cyan" | "rose" | "emerald") {
  switch (tone) {
    case "blue":
      return { soft: "bg-blue-50", text: "text-blue-700" };
    case "violet":
      return { soft: "bg-violet-50", text: "text-violet-700" };
    case "cyan":
      return { soft: "bg-cyan-50", text: "text-cyan-700" };
    case "rose":
      return { soft: "bg-rose-50", text: "text-rose-700" };
    case "emerald":
      return { soft: "bg-emerald-50", text: "text-emerald-700" };
    default:
      return { soft: "bg-slate-100", text: "text-slate-600" };
  }
}

function normalizeSentences(
  analysisSentences: SentenceAnalysis[] | undefined,
  fallback: ReaderSentence[],
): ReaderSentence[] {
  if (analysisSentences?.length) {
    return analysisSentences.map((sentence) => ({
      index: sentence.index,
      english: sentence.english,
      korean: sentence.korean,
    }));
  }
  return fallback;
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

function studentSegmentStyle(types: Set<Highlight["type"]>): React.CSSProperties {
  const style: React.CSSProperties & { textDecorationSkipInk?: string } = {};
  if (types.has("exam")) {
    style.background =
      "linear-gradient(to top, rgba(254, 240, 138, 0.5) 28%, transparent 28%)";
  }
  if (types.has("grammar")) {
    style.textDecoration = "underline wavy #8b5cf6";
    style.textUnderlineOffset = "3px";
    style.textDecorationSkipInk = "none";
  } else if (types.has("syntax")) {
    style.borderBottom = "2px dashed #0891b2";
  } else if (types.has("vocab")) {
    style.borderBottom = "1.5px solid #3b82f6";
  }
  return style;
}

function dedupeHighlights(highlights: Highlight[]): Highlight[] {
  const seen = new Set<string>();
  const out: Highlight[] = [];
  for (const highlight of highlights) {
    const key = highlightKey(highlight);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(highlight);
  }
  return out;
}

function highlightKey(highlight: Highlight): string {
  if (highlight.type === "vocab") {
    const data = highlight.data as VocabItem;
    return `vocab:${data.sentenceIndex}:${data.word}:${data.meaning}`;
  }
  if (highlight.type === "grammar") {
    const data = highlight.data as GrammarPoint;
    return `grammar:${data.id || `${data.sentenceIndex}:${data.pattern}`}`;
  }
  if (highlight.type === "syntax") {
    const data = highlight.data as SyntaxItem;
    return `syntax:${data.sentenceIndex}:${data.keyPhrase || data.structure}`;
  }
  const data = highlight.data as ExamPointData;
  return `exam:${data.kind || "point"}:${data.sentenceIndex}:${data.original || data.text || ""}`;
}

function pointLabel(point: StudentExamPoint) {
  return point.source === "paraphrase" ? "패러프레이징" : point.transformType || "구조 변형";
}

function sheetTitle(sheet: SheetKey) {
  switch (sheet) {
    case "overview":
      return "주제 · 핵심";
    case "exam":
      return "출제 포인트";
    case "vocab":
      return "어휘";
    case "grammar":
      return "문법";
    case "syntax":
      return "구문";
    default:
      return "흐름";
  }
}

function focusTitle(focus: FocusItem) {
  if (focus.kind === "vocab") return focus.item.word;
  if (focus.kind === "grammar") return focus.item.pattern;
  if (focus.kind === "syntax") return focus.item.patternType || "구문 분석";
  if (focus.kind === "exam") return pointLabel(focus.point);
  return "필기 항목 선택";
}

function ChooserSheet({
  text,
  highlights,
  onSelect,
}: {
  text: string;
  highlights: Highlight[];
  onSelect: (highlight: Highlight) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
        <p className="mb-1 text-[10px] font-bold text-slate-400">선택한 구간</p>
        <p className="font-mono text-[13px] font-bold leading-6 text-slate-900">{text}</p>
      </div>
      <p className="px-1 text-[11px] font-bold text-slate-400">
        이 구간에 {highlights.length}개의 필기 포인트가 있어요. 보고 싶은 항목을 선택하세요.
      </p>
      <ul className="space-y-1.5">
        {highlights.map((highlight, index) => (
          <li key={`${highlightKey(highlight)}-${index}`}>
            <button
              type="button"
              onClick={() => onSelect(highlight)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-left active:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn("text-[10px] font-bold", chooserCategoryTone(highlight.type))}
                >
                  {chooserCategoryLabel(highlight.type)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-5 text-slate-900">
                  {chooserItemHeading(highlight)}
                </p>
                {chooserItemSubtitle(highlight) && (
                  <p className="mt-0.5 line-clamp-1 text-[11.5px] font-medium text-slate-500">
                    {chooserItemSubtitle(highlight)}
                  </p>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-slate-300" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function chooserCategoryLabel(type: Highlight["type"]): string {
  if (type === "vocab") return "어휘";
  if (type === "grammar") return "문법";
  if (type === "syntax") return "구문";
  return "출제 포인트";
}

function chooserCategoryTone(type: Highlight["type"]): string {
  if (type === "vocab") return "text-blue-700";
  if (type === "grammar") return "text-violet-700";
  if (type === "syntax") return "text-cyan-700";
  return "text-slate-700";
}

function chooserItemHeading(highlight: Highlight): string {
  if (highlight.type === "vocab") return (highlight.data as VocabItem).word;
  if (highlight.type === "grammar") return (highlight.data as GrammarPoint).pattern;
  if (highlight.type === "syntax") {
    const data = highlight.data as SyntaxItem;
    return data.patternType || "구문 분석";
  }
  const data = highlight.data as ExamPointData;
  return data.kind === "paraphrase" ? "패러프레이징" : data.transformType || "구조 변형";
}

function chooserItemSubtitle(highlight: Highlight): string | null {
  if (highlight.type === "vocab") return (highlight.data as VocabItem).meaning;
  if (highlight.type === "grammar") {
    const data = highlight.data as GrammarPoint;
    return data.textFragment || data.explanation || null;
  }
  if (highlight.type === "syntax") {
    const data = highlight.data as SyntaxItem;
    return data.keyPhrase || data.structure || null;
  }
  const data = highlight.data as ExamPointData;
  return data.reason || null;
}
