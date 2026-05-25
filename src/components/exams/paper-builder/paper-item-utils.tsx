import * as React from "react";
import type { BuilderQuestion, OptionItem, PaperGroup, PaperItem } from "./types";
import { shouldIncludeSourcePassageByDefault } from "./passage-policy";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./text-normalization";
import { splitSentenceInsertGivenBlock } from "./option-display";

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function parseJSON<T>(input: unknown, fallback: T): T {
  if (!input) return fallback;
  if (Array.isArray(input)) return input as T;
  if (typeof input === "object") return input as T;
  if (typeof input !== "string") return fallback;
  try {
    const parsed = JSON.parse(input);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function parseOptions(input: string | null): OptionItem[] {
  const parsed = parseJSON<OptionItem[]>(input, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((option, index) => ({
      label: normalizeInlineText(String(option?.label || index + 1)),
      text: normalizeQuestionText(String(option?.text || "")),
    }))
    .filter((option) => option.text.trim().length > 0 || option.label.trim().length > 0);
}

export function parseTags(input: string | null): string[] {
  const parsed = parseJSON<string[]>(input, []);
  return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function questionPreview(questionText: string): string {
  return normalizeQuestionText(questionText).replace(/\s+/g, " ").trim().slice(0, 180);
}

export function makeLocalId(questionId: string): string {
  return `${questionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makePaperItem(question: BuilderQuestion, orderNum: number, _existingItems: PaperItem[]): PaperItem {
  void _existingItems;
  const options = parseOptions(question.options);
  const localId = makeLocalId(question.id);
  const isSubjective = options.length === 0;
  const normalizedQuestionText = normalizeQuestionText(question.questionText);
  const passageContent = normalizePassageText(question.passage?.content || "");
  const normalizedQuestion = {
    ...question,
    questionText: normalizedQuestionText,
    passage: question.passage
      ? { ...question.passage, content: passageContent }
      : question.passage,
  };

  return {
    localId,
    questionId: question.id,
    sourceQuestion: normalizedQuestion,
    orderNum,
    points: question.points || 1,
    groupId: `single:${localId}`,
    includePassage: shouldIncludeSourcePassageByDefault(normalizedQuestion),
    passageTitle: normalizeInlineText(question.passage?.title || ""),
    passageContent,
    questionText: normalizedQuestionText,
    options,
    correctAnswer: question.correctAnswer || "",
    answerSpaceLines: isSubjective ? 4 : 0,
    sectionTitle: "",
    teacherNote: "",
    breakBefore: "auto",
    keepWithPrev: false,
  };
}

export function reindexItems(items: PaperItem[]): PaperItem[] {
  return items.map((item, index) => ({ ...item, orderNum: index + 1 }));
}

export function buildGroups(items: PaperItem[]): PaperGroup[] {
  const groups: PaperGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && item.groupId && last.id === item.groupId) {
      last.items.push(item);
      if (item.includePassage && item.passageContent) {
        last.includePassage = true;
        last.passageTitle = item.passageTitle;
        last.passageContent = item.passageContent;
      }
    } else {
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: item.includePassage,
        passageTitle: item.passageTitle,
        passageContent: item.passageContent,
      });
    }
  }
  return groups;
}

export function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type FormattedInlineOptions = {
  alphabetMarkerClassName?: string;
};

function alphabetMarkerClassNameForSubtype(
  subType: string | null | undefined,
  options?: FormattedInlineOptions,
) {
  if (options?.alphabetMarkerClassName) return options.alphabetMarkerClassName;
  return subType === "SENTENCE_ORDER" ? "font-bold text-black" : "font-bold text-blue-700";
}

export function renderFormattedInline(
  text: string,
  subType?: string | null,
  options?: FormattedInlineOptions,
) {
  const parts: React.ReactNode[] = [];
  const pattern = /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])|\(([a-eA-E])\)/g;
  const alphabetMarkerClassName = alphabetMarkerClassNameForSubtype(subType, options);
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(
        <span key={key++} className="font-semibold underline decoration-blue-500 underline-offset-4">
          {match[1]}
        </span>,
      );
    } else if (match[2]) {
      parts.push(
        <span key={key++} className="mx-0.5 font-bold text-blue-700">
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      parts.push(
        <span key={key++} className={alphabetMarkerClassName}>
          ({match[3]})
        </span>,
      );
    } else {
      parts.push(
        <span key={key++} className="mx-1 inline-block min-w-[56px] border-b border-slate-500 align-baseline">
          &nbsp;
        </span>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : text;
}

export function joinRenderedLinesForDisplay(lines: string[]) {
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(trimmed);
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  return paragraphs.join("\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function renderQuestionTextInline(
  text: string,
  subType: string | null | undefined,
) {
  const { beforeText, givenText } = splitSentenceInsertGivenBlock(text, subType);
  if (!givenText) return renderFormattedInline(text, subType);

  return (
    <>
      {beforeText && (
        <span className="block">{renderFormattedInline(beforeText, subType)}</span>
      )}
      <span className="my-2 block rounded-[4px] border border-slate-400 bg-white/80 px-2.5 py-1.5 leading-[1.55]">
        {renderFormattedInline(givenText, subType)}
      </span>
    </>
  );
}
