"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookMarked, CheckCircle2, Printer, X } from "lucide-react";
import type {
  GrammarPoint,
  ParaphraseSegment,
  PassageAnalysisData,
  SentenceAnalysis,
  SyntaxItem,
  TransformPoint,
  VocabItem,
} from "@/types/passage-analysis";

interface StudyNotePassage {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  _count: { questions: number; notes: number };
}

interface PassageStudyNotePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passages: StudyNotePassage[];
}

type PageCategory = "summary" | "body" | "vocab" | "grammar" | "syntax" | "exam";

interface StudyNoteBlock {
  id: string;
  passageId: string;
  passageTitle: string;
  category: PageCategory;
  label: string;
  pointCount: number;
  forceNewPage?: boolean;
  keepWithNext?: boolean;
  node: React.ReactNode;
}

interface PaginatedStudyPage {
  id: string;
  passageId: string;
  passageTitle: string;
  blocks: StudyNoteBlock[];
  categories: Partial<Record<PageCategory, number>>;
}

interface ExamEntry {
  id: string;
  kind: "paraphrase" | "transform";
  sentenceIndex: number;
  title: string;
  original: string;
  detail?: string;
  alternatives?: string[];
  questionExample?: string;
  difficulty?: string;
}

const CATEGORY_META: Record<PageCategory, { label: string; dot: string; fg: string; bg: string; border: string }> = {
  summary: { label: "요약", dot: "bg-slate-600", fg: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
  body: { label: "본문/번역", dot: "bg-emerald-500", fg: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  vocab: { label: "어휘", dot: "bg-blue-500", fg: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  grammar: { label: "어법", dot: "bg-violet-500", fg: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  syntax: { label: "구문", dot: "bg-cyan-500", fg: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200" },
  exam: { label: "출제", dot: "bg-yellow-500", fg: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
};

function safeParseAnalysis(analysis: StudyNotePassage["analysis"]): PassageAnalysisData | null {
  if (!analysis?.analysisData) return null;
  try {
    return typeof analysis.analysisData === "string" ? JSON.parse(analysis.analysisData) : analysis.analysisData;
  } catch {
    return null;
  }
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getSemesterLabel(semester: string | null) {
  if (!semester) return null;
  if (semester === "FIRST") return "1학기";
  if (semester === "SECOND") return "2학기";
  return semester;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeText(text: string) {
  let normalized = "";
  const map: number[] = [];
  let lastWasSpace = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index].toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-");
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        normalized += " ";
        map.push(index);
        lastWasSpace = true;
      }
      continue;
    }
    normalized += ch;
    map.push(index);
    lastWasSpace = false;
  }

  return { normalized: normalized.trim(), map };
}

function findTextRange(text: string, query?: string | null) {
  const cleanQuery = query?.replace(/\.{2,}$/, "").trim();
  if (!cleanQuery || cleanQuery.length < 2) return null;

  const direct = text.toLowerCase().indexOf(cleanQuery.toLowerCase());
  if (direct !== -1) return { start: direct, end: direct + cleanQuery.length, type: "direct" as const };

  const source = normalizeText(text);
  const target = normalizeText(cleanQuery).normalized;
  if (!target) return null;

  const matched = source.normalized.indexOf(target);
  if (matched === -1) return null;
  const start = source.map[matched] ?? 0;
  const end = source.map[Math.min(matched + target.length - 1, source.map.length - 1)] ?? start;
  return { start, end: Math.min(end + 1, text.length), type: "normalized" as const };
}

function renderOverviewSentence(sentence: SentenceAnalysis, data: PassageAnalysisData) {
  const ranges: Array<{ start: number; end: number; kind: "vocab" | "grammar" | "exam" }> = [];

  for (const vocab of data.vocabulary || []) {
    if (vocab.sentenceIndex !== sentence.index) continue;
    const range = findTextRange(sentence.english, vocab.word);
    if (range) ranges.push({ start: range.start, end: range.end, kind: "vocab" });
  }
  for (const grammar of data.grammarPoints || []) {
    if (grammar.sentenceIndex !== sentence.index) continue;
    const range = findTextRange(sentence.english, grammar.textFragment);
    if (range) ranges.push({ start: range.start, end: range.end, kind: "grammar" });
  }
  for (const point of data.examDesign?.paraphrasableSegments || []) {
    if (point.sentenceIndex !== sentence.index) continue;
    const range = findTextRange(sentence.english, point.original);
    if (range) ranges.push({ start: range.start, end: range.end, kind: "exam" });
  }

  const selected = ranges.sort((a, b) => a.start - b.start).filter((range, index, list) => index === 0 || range.start >= list[index - 1].end);
  if (selected.length === 0) return sentence.english;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  selected.forEach((range, index) => {
    if (cursor < range.start) parts.push(<span key={`plain-${index}`}>{sentence.english.slice(cursor, range.start)}</span>);
    parts.push(
      <span key={`mark-${index}`} className={`overview-mark overview-mark-${range.kind}`}>
        {sentence.english.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  });
  if (cursor < sentence.english.length) parts.push(<span key="tail">{sentence.english.slice(cursor)}</span>);
  return parts;
}

function getCounts(data: PassageAnalysisData) {
  return {
    vocab: data.vocabulary?.length || 0,
    grammar: data.grammarPoints?.length || 0,
    syntax: data.syntaxAnalysis?.length || 0,
    exam: (data.examDesign?.paraphrasableSegments?.length || 0) + (data.examDesign?.structureTransformPoints?.length || 0),
  };
}

function getPageCategories(blocks: StudyNoteBlock[]) {
  const categories: Partial<Record<PageCategory, number>> = {};
  blocks.forEach((block) => {
    categories[block.category] = (categories[block.category] || 0) + block.pointCount;
  });
  return categories;
}

function pushBlock(
  blocks: StudyNoteBlock[],
  passage: StudyNotePassage,
  category: PageCategory,
  label: string,
  pointCount: number,
  node: React.ReactNode,
  options: { id?: string; forceNewPage?: boolean; keepWithNext?: boolean } = {},
) {
  blocks.push({
    id: options.id || `${passage.id}-${category}-${blocks.length}`,
    passageId: passage.id,
    passageTitle: passage.title,
    category,
    label,
    pointCount,
    forceNewPage: options.forceNewPage,
    keepWithNext: options.keepWithNext,
    node,
  });
}

function TinyMeta({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <span className="tiny-meta">{children}</span>;
}

function DenseSectionTitle({ category, title, count }: { category: PageCategory; title: string; count?: number }) {
  const meta = CATEGORY_META[category];
  return (
    <div className={`dense-section-title ${meta.border}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      <span className={meta.fg}>{title}</span>
      {typeof count === "number" && <b>{count}</b>}
    </div>
  );
}

function FirstPageSummaryBlock({ passage, data }: { passage: StudyNotePassage; data: PassageAnalysisData }) {
  const counts = getCounts(data);
  const semester = getSemesterLabel(passage.semester);
  const logicFlow = data.structure?.logicFlow || [];

  return (
    <div className="first-summary-block">
      <div className="compact-title-row">
        <div className="min-w-0">
          <p className="eyebrow">PASSAGE STUDY NOTE</p>
          <h1>{passage.title}</h1>
          <div className="meta-row">
            {passage.school && <TinyMeta>{passage.school.name}</TinyMeta>}
            {passage.grade && <TinyMeta>{passage.grade}학년</TinyMeta>}
            {semester && <TinyMeta>{semester}</TinyMeta>}
            {passage.unit && <TinyMeta>{passage.unit}</TinyMeta>}
            <TinyMeta>{countWords(passage.content)} words</TinyMeta>
          </div>
        </div>
        <div className="count-grid">
          <span>어휘<b>{counts.vocab}</b></span>
          <span>어법<b>{counts.grammar}</b></span>
          <span>구문<b>{counts.syntax}</b></span>
          <span>출제<b>{counts.exam}</b></span>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-cell strong">
          <p>주제</p>
          <b>{data.structure?.mainIdea || "-"}</b>
        </div>
        <div className="summary-cell">
          <p>목적/유형</p>
          <span>{[data.structure?.purpose, data.structure?.textType, data.structure?.tone].filter(Boolean).join(" · ") || "-"}</span>
        </div>
        {data.structure?.keyPoints?.length ? (
          <div className="summary-cell wide">
            <p>출제 핵심</p>
            <span>{data.structure.keyPoints.join(" · ")}</span>
          </div>
        ) : null}
      </div>

      {logicFlow.length > 0 && (
        <div className="flow-line">
          {logicFlow.map((flow, index) => (
            <React.Fragment key={`${flow.role}-${index}`}>
              <span><b>{flow.role}</b>{flow.summary}</span>
              {index < logicFlow.length - 1 && <i>→</i>}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function TranslationOverviewBlock({ data }: { data: PassageAnalysisData }) {
  return (
    <div className="translation-overview-block">
      <DenseSectionTitle category="body" title="본문 + 번역" count={data.sentences?.length || 0} />
      <table className="translation-table">
        <tbody>
          {(data.sentences || []).map((sentence) => (
            <tr key={sentence.index}>
              <td className="sentence-no">{sentence.index + 1}</td>
              <td>
                <p className="english-line">{renderOverviewSentence(sentence, data)}</p>
                <p className="korean-line">{sentence.korean}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VocabularyDenseBlock({ items }: { items: VocabItem[] }) {
  return (
    <table className="dense-table vocab-table">
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.word}-${index}`}>
            <td className="term-cell">
              <b>{item.word}</b>
              {item.pronunciation && <small>{item.pronunciation}</small>}
              <em>{item.sentenceIndex + 1}번</em>
            </td>
            <td>
              <strong>{item.meaning}</strong>
              {item.contextMeaning && <span>문맥: {item.contextMeaning}</span>}
              {item.englishDefinition && <i>{item.englishDefinition}</i>}
            </td>
            <td className="tag-cell">
              {[item.partOfSpeech, item.difficulty, item.examType].filter(Boolean).map((tag) => <mark key={tag}>{tag}</mark>)}
              {item.synonyms?.length ? <span>syn. {item.synonyms.slice(0, 3).join(", ")}</span> : null}
              {item.collocations?.length ? <span>col. {item.collocations.slice(0, 2).join(", ")}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GrammarDenseBlock({ items }: { items: GrammarPoint[] }) {
  return (
    <table className="dense-table grammar-table">
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.pattern}-${index}`}>
            <td className="term-cell">
              <b>{item.pattern}</b>
              <em>{item.sentenceIndex + 1}번</em>
              {[item.gradeLevel, item.examType].filter(Boolean).map((tag) => <mark key={tag}>{tag}</mark>)}
            </td>
            <td>
              <code>{item.textFragment}</code>
              <span>{item.explanation}</span>
            </td>
            <td>
              {item.commonMistake && <span>함정: {item.commonMistake}</span>}
              {item.transformations?.length ? <span>변형: {item.transformations.slice(0, 2).join(" / ")}</span> : null}
              {item.examples?.length ? <i>예: {item.examples[0]}</i> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SyntaxDenseBlock({ items }: { items: SyntaxItem[] }) {
  return (
    <table className="dense-table syntax-table">
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.sentenceIndex}-${index}`}>
            <td className="term-cell">
              <b>{item.sentenceIndex + 1}번</b>
              <mark>{item.complexity}</mark>
              {item.patternType && <em>{item.patternType}</em>}
            </td>
            <td>
              <code>{item.structure}</code>
              {item.chunkReading && <span>{item.chunkReading}</span>}
            </td>
            <td>
              {item.keyPhrase && <strong>{item.keyPhrase}</strong>}
              {item.transformPoint && <span>{item.transformPoint}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function toExamEntries(data: PassageAnalysisData): ExamEntry[] {
  const paraphrases: ExamEntry[] = (data.examDesign?.paraphrasableSegments || []).map((item: ParaphraseSegment, index) => ({
    id: `p-${index}`,
    kind: "paraphrase",
    sentenceIndex: item.sentenceIndex,
    title: "빈칸/동의어",
    original: item.original,
    detail: item.reason,
    alternatives: item.alternatives,
    questionExample: item.questionExample,
    difficulty: item.difficulty,
  }));
  const transforms: ExamEntry[] = (data.examDesign?.structureTransformPoints || []).map((item: TransformPoint, index) => ({
    id: `t-${index}`,
    kind: "transform",
    sentenceIndex: item.sentenceIndex,
    title: item.transformType || "구조 변형",
    original: item.original,
    detail: item.reason || item.example,
    questionExample: item.questionExample,
    difficulty: item.difficulty,
  }));
  return [...paraphrases, ...transforms].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
}

function ExamDenseBlock({ items }: { items: ExamEntry[] }) {
  return (
    <table className="dense-table exam-table">
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="term-cell">
              <b>{item.sentenceIndex + 1}번</b>
              <mark>{item.title}</mark>
              {item.difficulty && <em>{item.difficulty}</em>}
            </td>
            <td>
              <code>{item.original}</code>
              {item.detail && <span>{item.detail}</span>}
            </td>
            <td>
              {item.alternatives?.length ? <span>대안: {item.alternatives.slice(0, 4).join(" / ")}</span> : null}
              {item.questionExample && <i>{item.questionExample}</i>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExamSummaryDenseBlock({ data }: { data: PassageAnalysisData }) {
  const summaryKeyPoints = data.examDesign?.summaryKeyPoints || [];
  const descriptiveConditions = data.examDesign?.descriptiveConditions || [];
  if (!summaryKeyPoints.length && !descriptiveConditions.length) return null;
  return (
    <div className="exam-summary-dense">
      {summaryKeyPoints.length > 0 && <p><b>요약문 핵심</b>{summaryKeyPoints.join(" · ")}</p>}
      {descriptiveConditions.length > 0 && <p><b>서술형 조건</b>{descriptiveConditions.join(" · ")}</p>}
    </div>
  );
}

function buildStudyNoteBlocks(items: Array<{ passage: StudyNotePassage; data: PassageAnalysisData }>) {
  const blocks: StudyNoteBlock[] = [];

  for (const { passage, data } of items) {
    pushBlock(
      blocks,
      passage,
      "summary",
      "지문 요약",
      1,
      <FirstPageSummaryBlock passage={passage} data={data} />,
      { id: `${passage.id}-summary`, forceNewPage: true, keepWithNext: true },
    );
    pushBlock(
      blocks,
      passage,
      "body",
      "본문/번역",
      data.sentences?.length || 0,
      <TranslationOverviewBlock data={data} />,
      { id: `${passage.id}-translation` },
    );

    const vocabulary = data.vocabulary || [];
    if (vocabulary.length > 0) {
      pushBlock(blocks, passage, "vocab", "어휘", 0, <DenseSectionTitle category="vocab" title="어휘 정리" count={vocabulary.length} />, {
        id: `${passage.id}-vocab-title`,
        forceNewPage: true,
        keepWithNext: true,
      });
      chunkArray(vocabulary, 9).forEach((chunk, index) => {
        pushBlock(blocks, passage, "vocab", `어휘 ${index + 1}`, chunk.length, <VocabularyDenseBlock items={chunk} />, {
          id: `${passage.id}-vocab-${index}`,
        });
      });
    }

    const grammar = data.grammarPoints || [];
    if (grammar.length > 0) {
      pushBlock(blocks, passage, "grammar", "어법", 0, <DenseSectionTitle category="grammar" title="어법/문법 정리" count={grammar.length} />, {
        id: `${passage.id}-grammar-title`,
        forceNewPage: true,
        keepWithNext: true,
      });
      chunkArray(grammar, 4).forEach((chunk, index) => {
        pushBlock(blocks, passage, "grammar", `어법 ${index + 1}`, chunk.length, <GrammarDenseBlock items={chunk} />, {
          id: `${passage.id}-grammar-${index}`,
        });
      });
    }

    const syntax = data.syntaxAnalysis || [];
    if (syntax.length > 0) {
      pushBlock(blocks, passage, "syntax", "구문", 0, <DenseSectionTitle category="syntax" title="구문 정리" count={syntax.length} />, {
        id: `${passage.id}-syntax-title`,
        forceNewPage: true,
        keepWithNext: true,
      });
      chunkArray(syntax, 4).forEach((chunk, index) => {
        pushBlock(blocks, passage, "syntax", `구문 ${index + 1}`, chunk.length, <SyntaxDenseBlock items={chunk} />, {
          id: `${passage.id}-syntax-${index}`,
        });
      });
    }

    const examEntries = toExamEntries(data);
    const hasExamSummary = !!data.examDesign?.summaryKeyPoints?.length || !!data.examDesign?.descriptiveConditions?.length;
    if (examEntries.length > 0 || hasExamSummary) {
      pushBlock(blocks, passage, "exam", "출제", 0, <DenseSectionTitle category="exam" title="출제 포인트 정리" count={examEntries.length} />, {
        id: `${passage.id}-exam-title`,
        forceNewPage: true,
        keepWithNext: true,
      });
      if (hasExamSummary) {
        pushBlock(blocks, passage, "exam", "요약/서술형", 1, <ExamSummaryDenseBlock data={data} />, {
          id: `${passage.id}-exam-summary`,
        });
      }
      chunkArray(examEntries, 4).forEach((chunk, index) => {
        pushBlock(blocks, passage, "exam", `출제 ${index + 1}`, chunk.length, <ExamDenseBlock items={chunk} />, {
          id: `${passage.id}-exam-${index}`,
        });
      });
    }
  }

  return blocks;
}

function paginateStudyBlocks(blocks: StudyNoteBlock[], blockHeights: Map<string, number>, availableHeight: number) {
  const pages: PaginatedStudyPage[] = [];
  let currentBlocks: StudyNoteBlock[] = [];
  let usedHeight = 0;

  const flush = () => {
    if (currentBlocks.length === 0) return;
    const first = currentBlocks[0];
    pages.push({
      id: `page-${pages.length + 1}-${first.passageId}`,
      passageId: first.passageId,
      passageTitle: first.passageTitle,
      blocks: currentBlocks,
      categories: getPageCategories(currentBlocks),
    });
    currentBlocks = [];
    usedHeight = 0;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const height = blockHeights.get(block.id) || 0;
    if (block.forceNewPage && currentBlocks.length > 0) flush();
    if (block.keepWithNext && currentBlocks.length > 0) {
      const next = blocks[index + 1];
      const nextHeight = next ? blockHeights.get(next.id) || 0 : 0;
      if (usedHeight + height + nextHeight > availableHeight) flush();
    }
    if (currentBlocks.length > 0 && usedHeight + height > availableHeight) flush();
    currentBlocks.push(block);
    usedHeight += height;
  }
  flush();
  return pages;
}

function PagePointChip({ category, count }: { category: PageCategory; count: number }) {
  const meta = CATEGORY_META[category];
  if (count <= 0) return null;
  return (
    <span className={`page-point-chip ${meta.bg} ${meta.fg} ${meta.border}`}>
      <i className={meta.dot} />
      {meta.label} {count}
    </span>
  );
}

function StudyNoteBlockView({ block }: { block: StudyNoteBlock }) {
  return (
    <div className="study-note-block" data-block-id={block.id}>
      {block.node}
    </div>
  );
}

function StudyNotePageFrame({
  page,
  pageIndex,
  totalPages,
}: {
  page: PaginatedStudyPage;
  pageIndex: number;
  totalPages: number;
}) {
  const entries = Object.entries(page.categories)
    .filter(([, count]) => (count || 0) > 0) as Array<[PageCategory, number]>;

  return (
    <article className="study-note-page">
      <div className="study-note-page-header">
        <div className="min-w-0">
          <p>STUDY NOTE</p>
          <h2>{page.passageTitle}</h2>
        </div>
        <b>{pageIndex + 1} / {totalPages}</b>
      </div>
      <div className="study-note-page-points">
        {entries.map(([category, count]) => (
          <PagePointChip key={category} category={category} count={count} />
        ))}
      </div>
      <div className="study-note-page-content">
        {page.blocks.map((block) => (
          <StudyNoteBlockView key={block.id} block={block} />
        ))}
      </div>
      <footer>
        <span>{page.passageTitle}</span>
        <span>Page {pageIndex + 1}</span>
      </footer>
    </article>
  );
}

function StudyNoteMeasurementLayer({
  blocks,
  contentRef,
}: {
  blocks: StudyNoteBlock[];
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="study-note-measure-layer" aria-hidden="true">
      <article className="study-note-page">
        <div className="study-note-page-header">
          <div>
            <p>STUDY NOTE</p>
            <h2>measurement</h2>
          </div>
          <b>0 / 0</b>
        </div>
        <div className="study-note-page-points">
          <PagePointChip category="summary" count={1} />
          <PagePointChip category="body" count={1} />
        </div>
        <div ref={contentRef} className="study-note-page-content">
          {blocks.map((block) => (
            <StudyNoteBlockView key={block.id} block={block} />
          ))}
        </div>
        <footer>
          <span>measurement</span>
          <span>Page 0</span>
        </footer>
      </article>
    </div>
  );
}

export function PassageStudyNotePrintDialog({
  open,
  onOpenChange,
  passages,
}: PassageStudyNotePrintDialogProps) {
  const analyzedPassages = useMemo(
    () =>
      passages
        .map((passage) => ({ passage, data: safeParseAnalysis(passage.analysis) }))
        .filter((item): item is { passage: StudyNotePassage; data: PassageAnalysisData } => !!item.data),
    [passages],
  );
  const skippedCount = passages.length - analyzedPassages.length;
  const blocks = useMemo(() => buildStudyNoteBlocks(analyzedPassages), [analyzedPassages]);
  const blocksKey = useMemo(() => blocks.map((block) => block.id).join("|"), [blocks]);
  const measureContentRef = useRef<HTMLDivElement | null>(null);
  const [paginationResult, setPaginationResult] = useState<{ key: string; pages: PaginatedStudyPage[] }>({
    key: "",
    pages: [],
  });
  const paginationReady = analyzedPassages.length === 0 || paginationResult.key === blocksKey;
  const pages = paginationReady ? paginationResult.pages : [];

  const measureAndPaginate = useCallback(() => {
    const contentEl = measureContentRef.current;
    if (!contentEl || blocks.length === 0) {
      setPaginationResult({ key: blocksKey, pages: [] });
      return;
    }

    const availableHeight = contentEl.getBoundingClientRect().height;
    const blockHeights = new Map<string, number>();
    contentEl.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      const id = el.dataset.blockId;
      if (!id) return;
      const styles = window.getComputedStyle(el);
      const marginBottom = Number.parseFloat(styles.marginBottom || "0") || 0;
      blockHeights.set(id, el.getBoundingClientRect().height + marginBottom);
    });

    setPaginationResult({
      key: blocksKey,
      pages: paginateStudyBlocks(blocks, blockHeights, availableHeight),
    });
  }, [blocks, blocksKey]);

  useLayoutEffect(() => {
    if (!open) return;

    let cancelled = false;
    let frame = window.requestAnimationFrame(() => {
      if (!cancelled) measureAndPaginate();
    });

    const fonts = "fonts" in document ? document.fonts : null;
    fonts?.ready.then(() => {
      if (cancelled) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) measureAndPaginate();
      });
    });

    const handleResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) measureAndPaginate();
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, measureAndPaginate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <style>{`
        #passage-study-note-print-root .print-scroll { overflow: auto; }
        #passage-study-note-print-root .study-note-paper-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          min-width: min-content;
        }
        #passage-study-note-print-root .study-note-page {
          position: relative;
          box-sizing: border-box;
          width: 210mm;
          height: 297mm;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: white;
          border: 1px solid rgb(203, 213, 225);
          border-radius: 10px;
          padding: 7mm 8mm 6mm;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
          color: rgb(15, 23, 42);
        }
        #passage-study-note-print-root .study-note-page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          height: 9mm;
          flex: 0 0 auto;
          border-bottom: 1px solid rgb(226, 232, 240);
        }
        #passage-study-note-print-root .study-note-page-header p {
          margin: 0;
          font-size: 8px;
          font-weight: 800;
          color: rgb(148, 163, 184);
          letter-spacing: 0.16em;
        }
        #passage-study-note-print-root .study-note-page-header h2 {
          margin: 1px 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 900;
        }
        #passage-study-note-print-root .study-note-page-header > b {
          border-radius: 999px;
          background: rgb(15, 23, 42);
          color: white;
          padding: 2px 8px;
          font-size: 10px;
          line-height: 1.3;
        }
        #passage-study-note-print-root .study-note-page-points {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 3px;
          min-height: 6mm;
          padding: 3px 0;
          border-bottom: 1px solid rgb(241, 245, 249);
          flex: 0 0 auto;
        }
        #passage-study-note-print-root .page-point-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-width: 1px;
          border-style: solid;
          border-radius: 999px;
          padding: 1px 6px;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.35;
        }
        #passage-study-note-print-root .page-point-chip i {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          display: inline-block;
        }
        #passage-study-note-print-root .study-note-page-content {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          padding: 4px 0 3px;
        }
        #passage-study-note-print-root .study-note-block {
          margin-bottom: 4px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        #passage-study-note-print-root .study-note-page footer {
          height: 5mm;
          flex: 0 0 auto;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          border-top: 1px solid rgb(241, 245, 249);
          color: rgb(148, 163, 184);
          font-size: 8px;
          font-weight: 800;
        }
        #passage-study-note-print-root .eyebrow {
          margin: 0 0 2px;
          color: rgb(100, 116, 139);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.16em;
        }
        #passage-study-note-print-root .compact-title-row {
          display: grid;
          grid-template-columns: 1fr 120px;
          gap: 8px;
          align-items: start;
          border-bottom: 2px solid rgb(15, 23, 42);
          padding-bottom: 4px;
        }
        #passage-study-note-print-root .compact-title-row h1 {
          margin: 0;
          font-size: 19px;
          line-height: 1.05;
          font-weight: 950;
        }
        #passage-study-note-print-root .meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          margin-top: 4px;
        }
        #passage-study-note-print-root .tiny-meta {
          border: 1px solid rgb(226, 232, 240);
          border-radius: 4px;
          padding: 1px 4px;
          color: rgb(71, 85, 105);
          font-size: 9px;
          font-weight: 700;
          line-height: 1.3;
        }
        #passage-study-note-print-root .count-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3px;
        }
        #passage-study-note-print-root .count-grid span {
          display: flex;
          justify-content: space-between;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 5px;
          padding: 2px 4px;
          font-size: 9px;
          font-weight: 800;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .count-grid b { color: rgb(15, 23, 42); }
        #passage-study-note-print-root .summary-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 4px;
          margin-top: 5px;
        }
        #passage-study-note-print-root .summary-cell {
          border: 1px solid rgb(226, 232, 240);
          background: rgb(248, 250, 252);
          border-radius: 6px;
          padding: 4px 6px;
        }
        #passage-study-note-print-root .summary-cell.wide { grid-column: 1 / -1; }
        #passage-study-note-print-root .summary-cell p {
          margin: 0 0 2px;
          color: rgb(100, 116, 139);
          font-size: 8px;
          font-weight: 900;
        }
        #passage-study-note-print-root .summary-cell b,
        #passage-study-note-print-root .summary-cell span {
          display: block;
          font-size: 10px;
          line-height: 1.35;
        }
        #passage-study-note-print-root .flow-line {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          align-items: center;
          margin-top: 4px;
          font-size: 8.5px;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .flow-line span {
          border-radius: 4px;
          background: rgb(241, 245, 249);
          padding: 1px 4px;
        }
        #passage-study-note-print-root .flow-line b { color: rgb(37, 99, 235); margin-right: 3px; }
        #passage-study-note-print-root .dense-section-title {
          display: flex;
          align-items: center;
          gap: 5px;
          border-width: 1px;
          border-style: solid;
          border-radius: 6px;
          padding: 3px 6px;
          background: rgb(248, 250, 252);
          font-size: 11px;
          font-weight: 950;
        }
        #passage-study-note-print-root .dense-section-title b {
          margin-left: auto;
          font-size: 9px;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .translation-table,
        #passage-study-note-print-root .dense-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-top: 3px;
        }
        #passage-study-note-print-root .translation-table td {
          border-bottom: 1px solid rgb(226, 232, 240);
          vertical-align: top;
          padding: 2px 3px;
        }
        #passage-study-note-print-root .sentence-no {
          width: 18px;
          color: rgb(148, 163, 184);
          font-size: 8px;
          font-weight: 900;
          text-align: right;
        }
        #passage-study-note-print-root .english-line {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 9.2px;
          line-height: 1.35;
          font-weight: 650;
        }
        #passage-study-note-print-root .korean-line {
          margin: 1px 0 0;
          color: rgb(100, 116, 139);
          font-size: 8.6px;
          line-height: 1.35;
        }
        #passage-study-note-print-root .overview-mark-vocab { background: linear-gradient(to top, #dbeafe 45%, transparent 45%); border-bottom: 1px solid #3b82f6; }
        #passage-study-note-print-root .overview-mark-grammar { text-decoration: underline wavy #8b5cf6; text-underline-offset: 2px; }
        #passage-study-note-print-root .overview-mark-exam { background: linear-gradient(to top, #fef08a 48%, transparent 48%); }
        #passage-study-note-print-root .dense-table tr { break-inside: avoid; page-break-inside: avoid; }
        #passage-study-note-print-root .dense-table td {
          border: 1px solid rgb(226, 232, 240);
          vertical-align: top;
          padding: 3px 4px;
          font-size: 8.8px;
          line-height: 1.3;
        }
        #passage-study-note-print-root .dense-table .term-cell { width: 86px; background: rgb(248, 250, 252); }
        #passage-study-note-print-root .dense-table .tag-cell { width: 132px; }
        #passage-study-note-print-root .dense-table b,
        #passage-study-note-print-root .dense-table strong {
          display: block;
          font-size: 10px;
          color: rgb(15, 23, 42);
          line-height: 1.25;
        }
        #passage-study-note-print-root .dense-table small,
        #passage-study-note-print-root .dense-table em,
        #passage-study-note-print-root .dense-table i,
        #passage-study-note-print-root .dense-table span {
          display: block;
          margin-top: 1px;
          color: rgb(71, 85, 105);
          font-style: normal;
        }
        #passage-study-note-print-root .dense-table code {
          display: block;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 4px;
          background: white;
          padding: 2px 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          color: rgb(15, 23, 42);
          font-size: 8.8px;
          white-space: normal;
        }
        #passage-study-note-print-root .dense-table mark {
          display: inline-block;
          margin: 2px 2px 0 0;
          border-radius: 3px;
          background: rgb(239, 246, 255);
          color: rgb(37, 99, 235);
          padding: 1px 3px;
          font-size: 7.8px;
          font-weight: 800;
        }
        #passage-study-note-print-root .grammar-table .term-cell { width: 132px; }
        #passage-study-note-print-root .syntax-table .term-cell,
        #passage-study-note-print-root .exam-table .term-cell { width: 95px; }
        #passage-study-note-print-root .exam-summary-dense {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
        }
        #passage-study-note-print-root .exam-summary-dense p {
          margin: 0;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 5px;
          padding: 4px 5px;
          background: rgb(254, 252, 232);
          font-size: 9px;
          line-height: 1.35;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .exam-summary-dense b {
          display: block;
          margin-bottom: 2px;
          color: rgb(161, 98, 7);
        }
        .study-note-measure-layer {
          position: fixed;
          left: -10000px;
          top: 0;
          width: 210mm;
          height: 297mm;
          visibility: hidden;
          pointer-events: none;
          z-index: -1;
        }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          #passage-study-note-print-root,
          #passage-study-note-print-root * { visibility: visible !important; }
          #passage-study-note-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
          #passage-study-note-print-root .print-scroll {
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            background: white !important;
          }
          #passage-study-note-print-root .study-note-paper-stack {
            display: block !important;
            min-width: 0 !important;
          }
          #passage-study-note-print-root .study-note-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            border-radius: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }
          #passage-study-note-print-root .study-note-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .study-note-no-print,
          .study-note-measure-layer { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="study-note-no-print absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />

      <div
        id="passage-study-note-print-root"
        className="relative z-10 my-4 flex w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F3F5F8] shadow-2xl"
      >
        <div className="study-note-no-print flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <BookMarked className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold text-slate-900">지문 학습 자료 만들기</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  분석 완료 {analyzedPassages.length}개
                </span>
                {analyzedPassages.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <BookMarked className="h-3.5 w-3.5" />
                    {paginationReady ? `${pages.length}쪽 구성` : "페이지 계산 중"}
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    분석 없는 지문 {skippedCount}개 제외
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12px] font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => window.print()}
              disabled={!paginationReady || pages.length === 0}
            >
              <Printer className="h-3.5 w-3.5" />
              바로 출력
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="print-scroll flex-1 bg-[#E8ECF2] px-6 py-5">
          <StudyNoteMeasurementLayer blocks={blocks} contentRef={measureContentRef} />
          {analyzedPassages.length === 0 ? (
            <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
              <BookMarked className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-[14px] font-semibold text-slate-700">출력할 분석 자료가 없습니다.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                AI 분석이 완료된 지문을 선택하면 필기노트를 만들 수 있습니다.
              </p>
            </div>
          ) : !paginationReady ? (
            <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
              <BookMarked className="mx-auto mb-3 h-10 w-10 text-blue-400" />
              <p className="text-[14px] font-semibold text-slate-700">A4 페이지를 계산하고 있습니다.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                요약/본문/어휘/어법/구문/출제 포인트를 실제 A4 높이에 맞춰 재배치합니다.
              </p>
            </div>
          ) : (
            <div className="study-note-paper-stack">
              {pages.map((page, index) => (
                <StudyNotePageFrame key={page.id} page={page} pageIndex={index} totalPages={pages.length} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
