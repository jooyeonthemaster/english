import * as React from "react";
import type {
  BuilderQuestion,
  InsertablePaperBlockType,
  OptionItem,
  PaperGroup,
  PaperItem,
} from "./types";
import {
  shouldForceSourcePassage,
  shouldIncludeSourcePassageByDefault,
  shouldRenderSourcePassageInsideQuestion,
} from "./passage-policy";
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

function paperBlockDefaults(): Pick<
  PaperItem,
  | "locked"
  | "blockTitle"
  | "blockText"
  | "blockAlign"
  | "blockFontSize"
  | "blockAccentColor"
  | "dividerStyle"
  | "dividerThickness"
  | "spacerHeight"
  | "imageDataUrl"
  | "imageAlt"
  | "imageWidth"
> {
  return {
    locked: false,
    blockTitle: "",
    blockText: "",
    blockAlign: "left",
    blockFontSize: "md",
    blockAccentColor: "#2563EB",
    dividerStyle: "solid",
    dividerThickness: 1,
    spacerHeight: 32,
    imageDataUrl: null,
    imageAlt: "",
    imageWidth: 70,
  };
}

export function makePaperItem(question: BuilderQuestion, orderNum: number, _existingItems: PaperItem[]): PaperItem {
  void _existingItems;
  const options = parseOptions(question.options);
  const localId = makeLocalId(question.id);
  const isSubjective = options.length === 0;
  const normalizedQuestionText = normalizeQuestionText(question.questionText);
  const passageContent = normalizePassageText(question.passage?.content || "");
  const includeSourcePassage = shouldIncludeSourcePassageByDefault(question);
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
    includePassage: includeSourcePassage,
    passageTitle: "",
    passageContent,
    questionText: normalizedQuestionText,
    options,
    correctAnswer: question.correctAnswer || "",
    answerSpaceLines: isSubjective ? 4 : 0,
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: "",
    teacherNote: "",
    breakBefore: "auto",
    // keepWithPrev 는 "앞 문항과 강제로 같은 칸에 붙이기"(사용자 수동 토글) 전용.
    // 출처 지문 포함 여부(includeSourcePassage)와 분리한다 — 기본값을 true 로 두면
    // 페이지네이션이 overflow 를 무시(headerForceStay)해 칸 경계에서 잘렸다.
    // 구조화 유형의 "한 덩어리 유지"는 subtype 기반 원자 배치 로직이 담당한다.
    keepWithPrev: false,
    blockType: "question",
    ...paperBlockDefaults(),
  };
}

function questionWithPaperItemPassage(item: PaperItem): BuilderQuestion {
  const passageContent = normalizePassageText(
    item.passageContent || item.sourceQuestion.passage?.content || "",
  );
  return {
    ...item.sourceQuestion,
    passage: item.sourceQuestion.passage
      ? { ...item.sourceQuestion.passage, content: passageContent }
      : {
          id: `paper:${item.questionId}`,
          title: "",
          content: passageContent,
          grade: null,
          semester: null,
          publisher: null,
          school: null,
        },
  };
}

export function shouldRenderSourcePassageForItem(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  if (shouldRenderSourcePassageInsideQuestion(item.sourceQuestion.subType)) return false;
  const sourceQuestion = questionWithPaperItemPassage(item);
  return (
    Boolean(sourceQuestion.passage?.content?.trim()) &&
    (item.includePassage || shouldForceSourcePassage(sourceQuestion))
  );
}

export function isSourcePassageForcedForItem(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  const sourceQuestion = questionWithPaperItemPassage(item);
  return shouldForceSourcePassage(sourceQuestion);
}

function makeSyntheticQuestion(localId: string, label: string): BuilderQuestion {
  return {
    id: localId,
    type: "CUSTOM_BLOCK",
    subType: null,
    questionText: label,
    structuredData: null,
    options: null,
    correctAnswer: "",
    points: 0,
    difficulty: "CUSTOM",
    tags: null,
    aiGenerated: false,
    approved: true,
    starred: false,
    createdAt: new Date().toISOString(),
    passage: null,
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

export function makeCustomPaperBlock(
  blockType: InsertablePaperBlockType,
  orderNum: number,
): PaperItem {
  const localId = makeLocalId(`block-${blockType}`);
  const labelByType: Record<InsertablePaperBlockType, string> = {
    text: "텍스트 블록",
    section: "새 섹션",
    divider: "구분선",
    spacer: "여백",
    image: "이미지",
  };
  const defaultTextByType: Record<InsertablePaperBlockType, string> = {
    text: "",
    section: "새 섹션",
    divider: "",
    spacer: "",
    image: "",
  };
  const sourceQuestion = makeSyntheticQuestion(localId, labelByType[blockType]);
  const defaults = paperBlockDefaults();

  return {
    localId,
    questionId: `custom:${localId}`,
    sourceQuestion,
    orderNum,
    points: 0,
    groupId: `block:${localId}`,
    includePassage: false,
    passageTitle: "",
    passageContent: "",
    questionText: defaultTextByType[blockType],
    options: [],
    correctAnswer: "",
    answerSpaceLines: 0,
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: blockType === "section" ? "새 섹션" : "",
    teacherNote: "",
    breakBefore: "auto",
    keepWithPrev: false,
    blockType,
    ...defaults,
    blockTitle: blockType === "section" ? "새 섹션" : "",
    blockText: defaultTextByType[blockType],
    blockFontSize: blockType === "section" ? "lg" : "md",
    spacerHeight: blockType === "spacer" ? 40 : defaults.spacerHeight,
    imageWidth: blockType === "image" ? 78 : defaults.imageWidth,
  };
}

export function clonePaperItem(item: PaperItem, orderNum: number): PaperItem {
  const localId = makeLocalId(item.blockType === "question" ? item.questionId : `block-${item.blockType}`);
  return {
    ...item,
    localId,
    orderNum,
    locked: false,
    groupId:
      item.blockType === "question" && item.groupId && item.groupId.startsWith("passage:")
        ? item.groupId
        : `${item.blockType === "question" ? "single" : "block"}:${localId}`,
  };
}

export function reindexItems(items: PaperItem[]): PaperItem[] {
  let questionOrder = 0;
  return items.map((item) => ({
    ...item,
    orderNum: item.blockType === "question" ? (questionOrder += 1) : 0,
  }));
}

export function buildGroups(items: PaperItem[]): PaperGroup[] {
  const groups: PaperGroup[] = [];
  for (const item of items) {
    if (item.blockType !== "question") {
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: false,
        passageTitle: "",
        passageContent: "",
      });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last && item.groupId && last.id === item.groupId) {
      last.items.push(item);
      const passageContent = normalizePassageText(
        item.passageContent || item.sourceQuestion.passage?.content || "",
      );
      if (shouldRenderSourcePassageForItem(item) && passageContent) {
        last.includePassage = true;
        last.passageTitle = item.passageTitle;
        last.passageContent = passageContent;
      }
    } else {
      const passageContent = normalizePassageText(
        item.passageContent || item.sourceQuestion.passage?.content || "",
      );
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: shouldRenderSourcePassageForItem(item) && Boolean(passageContent),
        passageTitle: item.passageTitle,
        passageContent,
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
  const pattern = /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])|\(([a-eA-E])\)/g;
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
        <span key={key++} data-mark="u" className="font-semibold underline decoration-blue-500 underline-offset-4">
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
        <span
          key={key++}
          data-mark="blank"
          data-raw={match[0]}
          contentEditable={false}
          className="mx-1 inline-block min-w-[56px] border-b border-slate-500 align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : text;
}

function normalizeSummaryCompletionQuestionText(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "SUMMARY_COMPLETE_MC") return text;

  return text
    .replace(/\n{0,2}\[(?:\uBE48\uCE78\s*\uC815\uB2F5|blank answers)\][\s\S]*$/i, "")
    .replace(/^\[(?:\uC694\uC57D\uBB38|summary)\]\s*/gim, "\u2193\n");
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
  const normalizedText = normalizeSummaryCompletionQuestionText(text, subType);
  const { beforeText, givenText } = splitSentenceInsertGivenBlock(normalizedText, subType);
  if (!givenText) return renderFormattedInline(normalizedText, subType);

  // 실제 수능 포맷: '주어진 문장' 박스를 지문 '위'에 둔다(라벨은 한글).
  return (
    <>
      <span data-block="1" className="mb-1.5 block rounded-[4px] border border-slate-400 bg-white/80 px-2.5 py-1.5 leading-[1.55]">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
          주어진 문장
        </span>
        {renderFormattedInline(givenText, subType)}
      </span>
      {beforeText && (
        <span data-block="1" className="block">{renderFormattedInline(beforeText, subType)}</span>
      )}
    </>
  );
}
