"use client";

import React from "react";
import type {
  GrammarPoint,
  PassageAnalysisData,
  SentenceAnalysis,
  SyntaxItem,
  VocabItem,
} from "@/types/passage-analysis";
import { findTextRange, getCounts, getSemesterLabel, countWords } from "./helpers";
import { CATEGORY_META, type ExamEntry, type PageCategory, type StudyNotePassage } from "./types";

export function TinyMeta({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <span className="tiny-meta">{children}</span>;
}

export function DenseSectionTitle({ category, title, count }: { category: PageCategory; title: string; count?: number }) {
  const meta = CATEGORY_META[category];
  return (
    <div className={`dense-section-title ${meta.border}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      <span className={meta.fg}>{title}</span>
      {typeof count === "number" && <b>{count}</b>}
    </div>
  );
}

export function FirstPageSummaryBlock({ passage, data }: { passage: StudyNotePassage; data: PassageAnalysisData }) {
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

export function TranslationOverviewBlock({ data }: { data: PassageAnalysisData }) {
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

export function VocabularyDenseBlock({ items }: { items: VocabItem[] }) {
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

export function GrammarDenseBlock({ items }: { items: GrammarPoint[] }) {
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

export function SyntaxDenseBlock({ items }: { items: SyntaxItem[] }) {
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

export function ExamDenseBlock({ items }: { items: ExamEntry[] }) {
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

export function ExamSummaryDenseBlock({ data }: { data: PassageAnalysisData }) {
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
