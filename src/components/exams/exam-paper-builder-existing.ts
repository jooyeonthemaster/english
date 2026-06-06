"use client";

import {
  makeCustomPaperBlock,
  makePaperItem,
  parseOptions,
  formatDateInput,
} from "./paper-builder/paper-item-utils";
import { shouldIncludeSourcePassageByDefault } from "./paper-builder/passage-policy";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./paper-builder/text-normalization";
import type {
  BuilderQuestion,
  BreakBefore,
  Density,
  InsertablePaperBlockType,
  PaperCover,
  PaperItem,
  PaperSize,
  PaperTemplate,
  PassageStyle,
} from "./paper-builder/types";
import type { ExamDetail, ExamQuestion } from "./exam-detail-client-parts/types";

export type SavedBuilderItem = {
  localId?: string;
  blockType?: "question";
  questionId?: string;
  orderNum?: number;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
  breakBefore?: BreakBefore;
  keepWithPrev?: boolean;
};

export type SavedBuilderBlock = Omit<SavedBuilderItem, "blockType"> & {
  localId?: string;
  blockType?: PaperItem["blockType"];
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: PaperItem["blockAlign"];
  blockFontSize?: PaperItem["blockFontSize"];
  blockAccentColor?: string;
  dividerStyle?: PaperItem["dividerStyle"];
  dividerThickness?: number;
  spacerHeight?: number;
  imageDataUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
};

export type SavedBuilderSettings = {
  source?: string;
  version?: number;
  template?: string;
  scoring?: {
    autoPointTotal?: number | null;
  };
  layout?: {
    columns?: 1 | 2;
    paperSize?: PaperSize;
    density?: Density;
    showAnswerSpace?: boolean;
    showPassageTitle?: boolean;
    showQuestionMeta?: boolean;
    passageStyle?: PassageStyle;
  };
  header?: {
    subtitle?: string;
    studentNameLabel?: string;
    instructions?: string;
    academyLogoDataUrl?: string | null;
  };
  cover?: Partial<PaperCover>;
  items?: SavedBuilderItem[];
  blocks?: SavedBuilderBlock[];
};

export function parseBuilderSettings(raw: string | null): SavedBuilderSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as SavedBuilderSettings)
      : null;
  } catch {
    return null;
  }
}

export function asPaperTemplate(value: unknown): PaperTemplate {
  const templates: PaperTemplate[] = [
    "clean",
    "mock",
    "worksheet",
    "minimal",
    "academy",
    "modern",
    "classic",
    "colorband",
  ];
  return templates.includes(value as PaperTemplate)
    ? (value as PaperTemplate)
    : "clean";
}

export function asPaperSize(value: unknown): PaperSize {
  return value === "B4" ? "B4" : "A4";
}

export function asDensity(value: unknown): Density {
  return value === "compact" ? "compact" : "comfortable";
}

export function asPassageStyle(value: unknown): PassageStyle {
  void value;
  return "plain";
}

function asBreakBefore(value: unknown): BreakBefore {
  return value === "column" || value === "page" ? value : "auto";
}

function asObjectiveAnswerTexts(value: unknown, slots: number): string[] {
  if (!Array.isArray(value) || slots <= 0) return [];
  return value.slice(0, slots).map((text) => String(text ?? ""));
}

function printablePassageTitle(
  savedTitle: string | undefined,
  sourceTitle: string | undefined,
): string {
  const saved = normalizeInlineText(savedTitle || "");
  if (!saved) return "";
  return saved === normalizeInlineText(sourceTitle || "") ? "" : saved;
}

function examQuestionToBuilderQuestion(
  eq: ExamQuestion,
  saved?: SavedBuilderItem,
): BuilderQuestion {
  const q = eq.question;
  const passageContent = normalizePassageText(
    saved?.passageContent ?? q.passage?.content ?? "",
  );
  const passageTitle = normalizeInlineText(
    saved?.passageTitle ?? q.passage?.title ?? "",
  );
  const passage =
    q.passage || passageContent
      ? {
          id: q.passage?.id ?? `saved:${q.id}`,
          title: passageTitle,
          content: passageContent,
          grade: q.passage?.grade ?? null,
          semester: q.passage?.semester ?? null,
          publisher: q.passage?.publisher ?? null,
          school: q.passage?.school ?? null,
        }
      : null;

  return {
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText: normalizeQuestionText(saved?.questionText ?? q.questionText),
    structuredData: q.structuredData,
    options: q.options,
    correctAnswer: saved?.correctAnswer ?? q.correctAnswer,
    points: saved?.points ?? eq.points ?? q.points ?? 1,
    difficulty: q.difficulty,
    tags: q.tags,
    aiGenerated: q.aiGenerated,
    approved: q.approved,
    starred: q.starred,
    createdAt: q.createdAt,
    passage,
    explanation: q.explanation
      ? {
          id: q.explanation.id || "",
          content: q.explanation.content,
          keyPoints: q.explanation.keyPoints ?? null,
          wrongOptionExplanations: q.explanation.wrongOptionExplanations ?? null,
        }
      : null,
    collectionItems: q.collectionItems || [],
    examLinks: [],
    _count: q._count || { examLinks: 0 },
  };
}

function savedItemToPaperItem(
  saved: SavedBuilderItem,
  eq: ExamQuestion,
  index: number,
): PaperItem {
  const sourceQuestion = examQuestionToBuilderQuestion(eq, saved);
  const localId = saved.localId || `${sourceQuestion.id}-saved-${index}`;
  const passageContent = normalizePassageText(
    saved.passageContent ?? sourceQuestion.passage?.content ?? "",
  );
  const defaultIncludePassage = shouldIncludeSourcePassageByDefault({
    ...sourceQuestion,
    passage: sourceQuestion.passage
      ? { ...sourceQuestion.passage, content: passageContent }
      : sourceQuestion.passage,
  });
  const options = Array.isArray(saved.options)
    ? saved.options.map((option, optionIndex) => ({
        label: normalizeInlineText(option.label || String(optionIndex + 1)),
        text: normalizeQuestionText(option.text || ""),
      }))
    : parseOptions(sourceQuestion.options);
  const objectiveAnswerSlots = Math.max(
    0,
    Math.min(10, Number(saved.objectiveAnswerSlots) || 0),
  );

  return {
    localId,
    questionId: sourceQuestion.id,
    sourceQuestion,
    orderNum: saved.orderNum || index + 1,
    points: saved.points || eq.points || sourceQuestion.points || 1,
    groupId: saved.groupId ?? `single:${localId}`,
    includePassage: defaultIncludePassage || saved.includePassage === true,
    passageTitle: printablePassageTitle(
      saved.passageTitle,
      eq.question.passage?.title,
    ),
    passageContent,
    questionText: normalizeQuestionText(saved.questionText ?? sourceQuestion.questionText),
    options,
    correctAnswer: saved.correctAnswer ?? sourceQuestion.correctAnswer ?? "",
    answerSpaceLines: Math.max(
      0,
      Math.min(12, Number(saved.answerSpaceLines) || (options.length === 0 ? 4 : 0)),
    ),
    objectiveAnswerSlots,
    objectiveAnswerTexts: asObjectiveAnswerTexts(
      saved.objectiveAnswerTexts,
      objectiveAnswerSlots,
    ),
    sectionTitle: saved.sectionTitle || "",
    teacherNote: saved.teacherNote || "",
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
    blockType: "question",
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

function savedBlockToPaperItem(saved: SavedBuilderBlock, index: number): PaperItem | null {
  const blockType = saved.blockType;
  if (
    blockType !== "text" &&
    blockType !== "section" &&
    blockType !== "divider" &&
    blockType !== "spacer" &&
    blockType !== "image"
  ) {
    return null;
  }

  const base = makeCustomPaperBlock(blockType as InsertablePaperBlockType, index + 1);
  const localId = saved.localId || base.localId;
  const blockText = saved.blockText ?? saved.questionText ?? base.blockText;
  const blockTitle = saved.blockTitle ?? saved.sectionTitle ?? base.blockTitle;
  const objectiveAnswerSlots = Math.max(
    0,
    Math.min(10, Number(saved.objectiveAnswerSlots) || base.objectiveAnswerSlots),
  );

  return {
    ...base,
    localId,
    questionId: `custom:${localId}`,
    sourceQuestion: {
      ...base.sourceQuestion,
      id: localId,
      questionText: blockText || blockTitle || base.sourceQuestion.questionText,
    },
    groupId: saved.groupId ?? `block:${localId}`,
    questionText: blockText || blockTitle || base.questionText,
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
    locked: Boolean(saved.locked),
    blockTitle,
    blockText,
    blockAlign:
      saved.blockAlign === "center" || saved.blockAlign === "right"
        ? saved.blockAlign
        : "left",
    blockFontSize:
      saved.blockFontSize === "sm" || saved.blockFontSize === "lg"
        ? saved.blockFontSize
        : base.blockFontSize,
    blockAccentColor: saved.blockAccentColor || base.blockAccentColor,
    dividerStyle:
      saved.dividerStyle === "dashed" || saved.dividerStyle === "dotted"
        ? saved.dividerStyle
        : "solid",
    dividerThickness: Math.max(
      1,
      Math.min(8, Number(saved.dividerThickness) || base.dividerThickness),
    ),
    spacerHeight: Math.max(
      8,
      Math.min(160, Number(saved.spacerHeight) || base.spacerHeight),
    ),
    imageDataUrl: saved.imageDataUrl ?? null,
    imageAlt: saved.imageAlt || "",
    imageWidth: Math.max(20, Math.min(100, Number(saved.imageWidth) || base.imageWidth)),
    objectiveAnswerSlots,
    objectiveAnswerTexts: asObjectiveAnswerTexts(
      saved.objectiveAnswerTexts,
      objectiveAnswerSlots,
    ),
  };
}

export function buildPaperItemsFromExam(
  exam: ExamDetail,
  settings: SavedBuilderSettings | null,
): PaperItem[] {
  const byQuestionId = new Map(exam.questions.map((eq) => [eq.question.id, eq]));
  const savedBlocks =
    settings?.source === "exam-paper-builder-v2" && Array.isArray(settings.blocks)
      ? settings.blocks
      : [];
  const savedItems =
    (settings?.source === "exam-paper-builder-v1" ||
      settings?.source === "exam-paper-builder-v2") &&
    Array.isArray(settings.items)
      ? settings.items
      : [];

  if (savedBlocks.length > 0) {
    const blocks = savedBlocks
      .map((saved, index) => {
        if (saved.blockType === "question") {
          if (!saved.questionId) return null;
          const eq = byQuestionId.get(saved.questionId);
          return eq ? savedItemToPaperItem({ ...saved, blockType: "question" }, eq, index) : null;
        }
        return savedBlockToPaperItem(saved, index);
      })
      .filter((item): item is PaperItem => Boolean(item));
    let questionOrder = 0;
    return blocks.map((item) =>
      item.blockType === "question"
        ? { ...item, orderNum: (questionOrder += 1) }
        : { ...item, orderNum: 0 },
    );
  }

  if (savedItems.length > 0) {
    return savedItems
      .map((saved, index) => {
        if (!saved.questionId) return null;
        const eq = byQuestionId.get(saved.questionId);
        return eq ? savedItemToPaperItem(saved, eq, index) : null;
      })
      .filter((item): item is PaperItem => Boolean(item))
      .sort((a, b) => a.orderNum - b.orderNum)
      .map((item, index) => ({ ...item, orderNum: index + 1 }));
  }

  return exam.questions.map((eq, index) => {
    const sourceQuestion = examQuestionToBuilderQuestion(eq);
    return {
      ...makePaperItem(sourceQuestion, index + 1, []),
      points: eq.points || sourceQuestion.points || 1,
    };
  });
}

export function formatExamDate(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDateInput(date);
}
