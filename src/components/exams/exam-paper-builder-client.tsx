"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDownToLine,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Columns2,
  CornerDownRight,
  Download,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Group,
  GripVertical,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Minus,
  MoveDown,
  MoveUp,
  Plus,
  Printer,
  Save,
  Search,
  Settings2,
  Star,
  Trash2,
  Ungroup,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { saveExamPaperDraft } from "@/actions/exam-paper-builder";

type OptionItem = { label: string; text: string };

type BuilderQuestion = {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date | string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    publisher: string | null;
    school: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  collectionItems: { collectionId: string }[];
  _count: { examLinks: number };
};

type QuestionCollection = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  _count: { items: number; children: number };
};

type ClassOption = { id: string; name: string };
type SchoolOption = { id: string; name: string };

type PaperTemplate = "clean" | "mock" | "worksheet" | "minimal" | "academy" | "modern" | "classic" | "colorband";
type Density = "comfortable" | "compact";
type PassageStyle = "boxed" | "plain" | "underlined";

type BreakBefore = "auto" | "column" | "page";

type PaperItem = {
  localId: string;
  questionId: string;
  sourceQuestion: BuilderQuestion;
  orderNum: number;
  points: number;
  groupId: string | null;
  includePassage: boolean;
  passageTitle: string;
  passageContent: string;
  questionText: string;
  options: OptionItem[];
  correctAnswer: string;
  answerSpaceLines: number;
  sectionTitle: string;
  teacherNote: string;
  breakBefore: BreakBefore;
  keepWithPrev: boolean;
};

type PaperGroup = {
  id: string;
  items: PaperItem[];
  passageTitle: string;
  passageContent: string;
  includePassage: boolean;
};

type RenderOption = { option: OptionItem; originalIndex: number };

type RenderItemPart = {
  source: PaperItem;
  partKey: string;
  showHeader: boolean;
  showAnswer: boolean;
  options: RenderOption[];
  isStart: boolean;
  isContinuation: boolean;
};

type RenderFragment = {
  id: string;
  passageTitle: string;
  passageContent: string;
  includePassage: boolean;
  passageRenderedLines: string[];
  passageStartLineIndex: number;
  passageTotalLines: number;
  groupSourceId: string;
  parts: RenderItemPart[];
};

type PaperPage = RenderFragment[][];

type PaginationSettings = {
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  template: PaperTemplate;
};

type HeaderPatch = Partial<{
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
}>;

type DropPlacement = "before" | "after";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface ExamPaperBuilderClientProps {
  academyId: string;
  questions: BuilderQuestion[];
  collections: QuestionCollection[];
  classes: ClassOption[];
  schools: SchoolOption[];
}

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  ESSAY: "서술형",
  FILL_BLANK: "빈칸",
  ORDERING: "순서",
  VOCAB: "어휘",
};

const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

const DIFFICULTY_META: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const TEMPLATE_META: Record<
  PaperTemplate,
  { label: string; description: string; accent: string; swatch: string }
> = {
  clean: {
    label: "클린 내신형",
    description: "파란 포인트와 넓은 여백의 정돈된 내신 시험지",
    accent: "border-blue-300 bg-blue-50 text-blue-700",
    swatch: "from-blue-500 to-sky-400",
  },
  mock: {
    label: "모의고사형",
    description: "흑백 신문식 헤더와 조밀한 2단 문항 흐름",
    accent: "border-slate-400 bg-slate-100 text-slate-800",
    swatch: "from-slate-900 to-slate-500",
  },
  worksheet: {
    label: "워크시트형",
    description: "초록 포인트, 풀이 공간과 교사용 메모 강조",
    accent: "border-emerald-300 bg-emerald-50 text-emerald-700",
    swatch: "from-emerald-500 to-teal-400",
  },
  minimal: {
    label: "미니멀",
    description: "얇은 선과 낮은 채도로 텍스트 밀도 우선",
    accent: "border-zinc-300 bg-zinc-50 text-zinc-700",
    swatch: "from-zinc-500 to-stone-300",
  },
  academy: {
    label: "학원 브랜드형",
    description: "로고와 남색 헤더가 살아나는 배포용 시험지",
    accent: "border-indigo-300 bg-indigo-50 text-indigo-700",
    swatch: "from-indigo-700 to-cyan-500",
  },
  modern: {
    label: "모던 컬러형",
    description: "보라 포인트와 카드형 지문으로 선명한 디자인",
    accent: "border-violet-300 bg-violet-50 text-violet-700",
    swatch: "from-violet-600 to-fuchsia-400",
  },
  classic: {
    label: "클래식 원고형",
    description: "와인 컬러와 세리프 감성의 차분한 지면",
    accent: "border-rose-300 bg-rose-50 text-rose-800",
    swatch: "from-rose-800 to-amber-500",
  },
  colorband: {
    label: "컬러 밴드형",
    description: "상단 색상 띠와 번호 배지로 빠르게 읽히는 구성",
    accent: "border-cyan-300 bg-cyan-50 text-cyan-800",
    swatch: "from-cyan-500 to-lime-400",
  },
};

const TEMPLATE_VISUALS: Record<
  PaperTemplate,
  {
    pageClass: string;
    innerClass: string;
    headerClass: string;
    headerLineClass: string;
    subtitleClass: string;
    titleClass: string;
    infoClass: string;
    instructionsClass: string;
    continuedHeaderClass: string;
    mainClass: string;
    passageTitleClass: string;
    passageClass: string;
    itemClass: string;
    numberClass: string;
    metaClass: string;
    questionClass: string;
    optionNumberClass: string;
    optionRowClass: string;
    answerLineClass: string;
    teacherNoteClass: string;
    footerClass: string;
    logoFrameClass: string;
  }
> = {
  clean: {
    pageClass: "bg-white text-slate-950 ring-slate-200",
    innerClass: "",
    headerClass: "",
    headerLineClass: "border-slate-900",
    subtitleClass: "text-blue-700",
    titleClass: "text-slate-950",
    infoClass: "text-slate-700 [&>div]:border-slate-300",
    instructionsClass: "text-slate-600",
    continuedHeaderClass: "border-slate-200 text-slate-400",
    mainClass: "",
    passageTitleClass: "text-slate-700",
    passageClass: "border-slate-900/80 bg-white",
    itemClass: "",
    numberClass: "text-slate-950",
    metaClass: "text-slate-500",
    questionClass: "text-slate-950",
    optionNumberClass: "text-slate-800",
    optionRowClass: "",
    answerLineClass: "border-slate-300",
    teacherNoteClass: "bg-amber-50 text-amber-800",
    footerClass: "text-slate-400",
    logoFrameClass: "border-slate-200 bg-white",
  },
  mock: {
    pageClass: "bg-white text-black ring-slate-300",
    innerClass: "",
    headerClass: "",
    headerLineClass: "border-black border-b-2",
    subtitleClass: "text-black",
    titleClass: "font-serif text-black",
    infoClass: "text-black [&>div]:border-black",
    instructionsClass: "text-black",
    continuedHeaderClass: "border-black text-black",
    mainClass: "font-serif",
    passageTitleClass: "text-black",
    passageClass: "border-black bg-white",
    itemClass: "",
    numberClass: "font-serif text-black",
    metaClass: "text-zinc-700",
    questionClass: "font-serif text-black",
    optionNumberClass: "text-black",
    optionRowClass: "",
    answerLineClass: "border-zinc-500",
    teacherNoteClass: "bg-zinc-100 text-zinc-900",
    footerClass: "text-black",
    logoFrameClass: "border-black bg-white",
  },
  worksheet: {
    pageClass: "bg-emerald-50/25 text-emerald-950 ring-emerald-200",
    innerClass: "",
    headerClass: "rounded-xl bg-white/80 px-3 py-3 ring-1 ring-emerald-100",
    headerLineClass: "border-emerald-500",
    subtitleClass: "text-emerald-700",
    titleClass: "text-emerald-950",
    infoClass: "text-emerald-900 [&>div]:border-emerald-200",
    instructionsClass: "text-emerald-800",
    continuedHeaderClass: "border-emerald-200 text-emerald-600",
    mainClass: "",
    passageTitleClass: "text-emerald-800",
    passageClass: "border-emerald-300 bg-white/80",
    itemClass: "",
    numberClass: "text-emerald-700",
    metaClass: "text-emerald-600",
    questionClass: "text-emerald-950",
    optionNumberClass: "text-emerald-700",
    optionRowClass: "",
    answerLineClass: "border-emerald-300",
    teacherNoteClass: "bg-amber-100 text-amber-900",
    footerClass: "text-emerald-500",
    logoFrameClass: "border-emerald-200 bg-white",
  },
  minimal: {
    pageClass: "bg-white text-zinc-950 ring-zinc-200",
    innerClass: "",
    headerClass: "",
    headerLineClass: "border-zinc-300",
    subtitleClass: "text-zinc-500",
    titleClass: "font-semibold text-zinc-950",
    infoClass: "text-zinc-600 [&>div]:border-zinc-200",
    instructionsClass: "text-zinc-500",
    continuedHeaderClass: "border-zinc-200 text-zinc-400",
    mainClass: "",
    passageTitleClass: "text-zinc-500",
    passageClass: "border-zinc-200 bg-white",
    itemClass: "",
    numberClass: "text-zinc-700",
    metaClass: "text-zinc-400",
    questionClass: "text-zinc-950",
    optionNumberClass: "text-zinc-500",
    optionRowClass: "",
    answerLineClass: "border-zinc-200",
    teacherNoteClass: "bg-zinc-100 text-zinc-700",
    footerClass: "text-zinc-300",
    logoFrameClass: "border-zinc-200 bg-white",
  },
  academy: {
    pageClass: "bg-white text-slate-950 ring-indigo-200",
    innerClass: "before:absolute before:inset-x-0 before:top-0 before:h-2 before:bg-indigo-700 before:content-['']",
    headerClass: "rounded-b-xl bg-indigo-50/80 px-3 py-3 ring-1 ring-indigo-100",
    headerLineClass: "border-indigo-500",
    subtitleClass: "text-indigo-700",
    titleClass: "text-indigo-950",
    infoClass: "text-indigo-900 [&>div]:border-indigo-200",
    instructionsClass: "text-indigo-700",
    continuedHeaderClass: "border-indigo-200 text-indigo-600",
    mainClass: "",
    passageTitleClass: "text-indigo-700",
    passageClass: "border-indigo-200 bg-indigo-50/60",
    itemClass: "",
    numberClass: "text-indigo-700",
    metaClass: "text-indigo-500",
    questionClass: "text-slate-950",
    optionNumberClass: "text-indigo-600",
    optionRowClass: "",
    answerLineClass: "border-indigo-200",
    teacherNoteClass: "bg-indigo-50 text-indigo-800",
    footerClass: "text-indigo-400",
    logoFrameClass: "border-indigo-200 bg-white shadow-sm",
  },
  modern: {
    pageClass: "bg-violet-50/25 text-slate-950 ring-violet-200",
    innerClass: "",
    headerClass: "rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-violet-100",
    headerLineClass: "border-violet-300",
    subtitleClass: "text-violet-600",
    titleClass: "text-violet-950",
    infoClass: "text-violet-900 [&>div]:border-violet-200",
    instructionsClass: "text-violet-700",
    continuedHeaderClass: "border-violet-200 text-violet-500",
    mainClass: "",
    passageTitleClass: "text-violet-700",
    passageClass: "border-violet-200 bg-white shadow-[inset_3px_0_0_rgba(124,58,237,0.35)]",
    itemClass: "",
    numberClass: "rounded-full bg-violet-600 px-1.5 py-0.5 text-white",
    metaClass: "text-violet-500",
    questionClass: "text-slate-950",
    optionNumberClass: "text-violet-600",
    optionRowClass: "rounded bg-white/70 px-1 py-0.5",
    answerLineClass: "border-violet-200",
    teacherNoteClass: "bg-violet-50 text-violet-800",
    footerClass: "text-violet-400",
    logoFrameClass: "border-violet-200 bg-white",
  },
  classic: {
    pageClass: "bg-[#fffdf8] text-stone-950 ring-rose-200",
    innerClass: "",
    headerClass: "",
    headerLineClass: "border-rose-900 border-b-2",
    subtitleClass: "text-rose-800",
    titleClass: "font-serif text-rose-950",
    infoClass: "text-stone-800 [&>div]:border-rose-200",
    instructionsClass: "text-stone-600",
    continuedHeaderClass: "border-rose-200 text-rose-700",
    mainClass: "font-serif",
    passageTitleClass: "text-rose-900",
    passageClass: "border-rose-200 bg-white/70",
    itemClass: "",
    numberClass: "font-serif text-rose-900",
    metaClass: "text-stone-500",
    questionClass: "font-serif text-stone-950",
    optionNumberClass: "text-rose-800",
    optionRowClass: "",
    answerLineClass: "border-rose-200",
    teacherNoteClass: "bg-rose-50 text-rose-900",
    footerClass: "text-rose-400",
    logoFrameClass: "border-rose-200 bg-white",
  },
  colorband: {
    pageClass: "bg-white text-slate-950 ring-cyan-200",
    innerClass: "before:absolute before:left-0 before:top-0 before:h-full before:w-3 before:bg-cyan-500 before:content-['']",
    headerClass: "rounded-xl bg-cyan-50 px-4 py-3",
    headerLineClass: "border-cyan-400",
    subtitleClass: "text-cyan-700",
    titleClass: "text-cyan-950",
    infoClass: "text-cyan-900 [&>div]:border-cyan-200",
    instructionsClass: "text-cyan-700",
    continuedHeaderClass: "border-cyan-200 text-cyan-600",
    mainClass: "",
    passageTitleClass: "text-cyan-700",
    passageClass: "border-cyan-200 bg-cyan-50/70",
    itemClass: "",
    numberClass: "rounded bg-cyan-600 px-1.5 py-0.5 text-white",
    metaClass: "text-cyan-600",
    questionClass: "text-slate-950",
    optionNumberClass: "text-cyan-700",
    optionRowClass: "border-l-2 border-cyan-200 pl-1.5",
    answerLineClass: "border-cyan-200",
    teacherNoteClass: "bg-cyan-50 text-cyan-900",
    footerClass: "text-cyan-500",
    logoFrameClass: "border-cyan-200 bg-white",
  },
};

const DEFAULT_INSTRUCTIONS =
  "다음 물음에 알맞은 답을 고르거나 조건에 맞게 서술하시오.";

function parseJSON<T>(input: unknown, fallback: T): T {
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

function parseOptions(input: string | null): OptionItem[] {
  const parsed = parseJSON<OptionItem[]>(input, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((option, index) => ({
      label: String(option?.label || index + 1),
      text: String(option?.text || ""),
    }))
    .filter((option) => option.text.trim().length > 0 || option.label.trim().length > 0);
}

function parseTags(input: string | null): string[] {
  const parsed = parseJSON<string[]>(input, []);
  return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function questionPreview(questionText: string): string {
  return questionText.replace(/\s+/g, " ").trim().slice(0, 180);
}

function makeLocalId(questionId: string): string {
  return `${questionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makePaperItem(question: BuilderQuestion, orderNum: number, _existingItems: PaperItem[]): PaperItem {
  const options = parseOptions(question.options);
  const localId = makeLocalId(question.id);
  const isSubjective = options.length === 0;

  return {
    localId,
    questionId: question.id,
    sourceQuestion: question,
    orderNum,
    points: question.points || 1,
    groupId: `single:${localId}`,
    includePassage: Boolean(question.passage),
    passageTitle: question.passage?.title || "",
    passageContent: question.passage?.content || "",
    questionText: question.questionText,
    options,
    correctAnswer: question.correctAnswer || "",
    answerSpaceLines: isSubjective ? 4 : 0,
    sectionTitle: "",
    teacherNote: "",
    breakBefore: "auto",
    keepWithPrev: false,
  };
}

function reindexItems(items: PaperItem[]): PaperItem[] {
  return items.map((item, index) => ({ ...item, orderNum: index + 1 }));
}

function buildGroups(items: PaperItem[]): PaperGroup[] {
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

const PREVIEW_PAGE_WIDTH = 760;
const A4_HEIGHT_RATIO = 297 / 210;
const TWO_COLUMN_GAP = 32;
const GROUP_GAP = 16;
const ITEM_GAP = 12;

function isWideGlyph(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function glyphUnits(char: string): number {
  if (char === " " || char === "\t") return 0.34;
  if (isWideGlyph(char)) return 1;
  if (/[A-Z0-9]/.test(char)) return 0.62;
  if (/[a-z]/.test(char)) return 0.53;
  if (/[,.;:!?'"()[\]{}<>/\\|`~_-]/.test(char)) return 0.34;
  return 0.72;
}

function estimateTextLines(text: string, columnWidth: number, fontSize: number): number {
  const maxUnitsPerLine = Math.max(12, columnWidth / fontSize);
  const lines = text.replace(/\r/g, "").split("\n");

  return lines.reduce((total, line) => {
    if (!line.trim()) return total + 1;
    const units = Array.from(line).reduce((sum, char) => sum + glyphUnits(char), 0);
    return total + Math.max(1, Math.ceil(units / maxUnitsPerLine));
  }, 0);
}

function pageMetrics(settings: PaginationSettings, pageIndex: number) {
  const compact = settings.density === "compact";
  const pageHeight = PREVIEW_PAGE_WIDTH * A4_HEIGHT_RATIO;
  const horizontalPadding = compact ? 68 : 84;
  const verticalPadding = compact ? 60 : 76;
  const firstPageHeader = compact ? 100 : 122;
  const followPageHeader = 28;
  const footer = 26;
  const contentHeight =
    pageHeight -
    verticalPadding -
    (pageIndex === 0 ? firstPageHeader : followPageHeader) -
    footer;
  const contentWidth = PREVIEW_PAGE_WIDTH - horizontalPadding;
  const columnWidth =
    settings.columns === 2 ? (contentWidth - TWO_COLUMN_GAP) / 2 : contentWidth;

  return {
    columnWidth,
    capacity: Math.max(520, contentHeight * 0.9),
  };
}

function estimatePassageHeight(group: PaperGroup, settings: PaginationSettings): number {
  if (!group.includePassage || !group.passageContent) return 0;

  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const lineHeight = fontSize * (compact ? 1.46 : 1.58);
  const lines = estimateTextLines(group.passageContent, columnWidth, fontSize);
  const title = settings.showPassageTitle && group.passageTitle ? 15 : 0;
  const chrome =
    settings.passageStyle === "boxed"
      ? 24
      : settings.passageStyle === "underlined"
        ? 18
        : 8;

  return title + chrome + lines * lineHeight;
}

function passageLineHeight(settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  return fontSize * (compact ? 1.46 : 1.58);
}

function passageChromeHeight(group: PaperGroup, settings: PaginationSettings, includeTitle: boolean): number {
  const titleHeight = includeTitle && settings.showPassageTitle && group.passageTitle ? 15 : 0;
  const boxChrome =
    settings.passageStyle === "boxed" ? 24 : settings.passageStyle === "underlined" ? 18 : 8;
  return titleHeight + boxChrome + 12;
}

function passageToLines(content: string, settings: PaginationSettings): string[] {
  if (!content) return [];
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const maxUnitsPerLine = Math.max(12, columnWidth / fontSize);
  const lines: string[] = [];

  for (const paragraph of content.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    let currentUnits = 0;
    let i = 0;

    while (i < paragraph.length) {
      let nextSpace = paragraph.indexOf(" ", i);
      if (nextSpace === -1) nextSpace = paragraph.length;
      const word = paragraph.slice(i, nextSpace);
      const wordUnits = Array.from(word).reduce((sum, ch) => sum + glyphUnits(ch), 0);
      const spaceFollows = nextSpace < paragraph.length;
      const spaceUnits = spaceFollows ? glyphUnits(" ") : 0;

      if (wordUnits > maxUnitsPerLine && !currentLine) {
        // word longer than a line — break by chars
        let chunk = "";
        let chunkUnits = 0;
        for (const ch of word) {
          const u = glyphUnits(ch);
          if (chunkUnits + u > maxUnitsPerLine && chunk) {
            lines.push(chunk);
            chunk = ch;
            chunkUnits = u;
          } else {
            chunk += ch;
            chunkUnits += u;
          }
        }
        currentLine = chunk;
        currentUnits = chunkUnits;
      } else if (currentUnits + wordUnits > maxUnitsPerLine && currentLine) {
        lines.push(currentLine.trimEnd());
        currentLine = word;
        currentUnits = wordUnits;
      } else {
        currentLine += word;
        currentUnits += wordUnits;
      }

      if (spaceFollows) {
        if (currentUnits + spaceUnits <= maxUnitsPerLine) {
          currentLine += " ";
          currentUnits += spaceUnits;
        }
      }

      i = nextSpace + 1;
    }

    if (currentLine.trim()) lines.push(currentLine.trimEnd());
    else if (currentLine === "") lines.push("");
  }

  return lines;
}

function estimateHeaderBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const lineHeight = fontSize * (compact ? 1.46 : 1.58);
  const questionLines = estimateTextLines(item.questionText, columnWidth, fontSize);
  const metaHeight = settings.showQuestionMeta ? 18 : 16;
  return metaHeight + questionLines * lineHeight + 6;
}

function estimateOptionBlockHeight(option: OptionItem, settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const optionLines = estimateTextLines(option.text, Math.max(80, columnWidth - 22), compact ? 10 : 11);
  return Math.max(16, optionLines * (compact ? 14.5 : 16));
}

function estimateAnswerBlockHeight(item: PaperItem): number {
  return item.answerSpaceLines * 14 + (item.answerSpaceLines > 0 ? 8 : 0);
}

function estimateTeacherNoteHeight(item: PaperItem, settings: PaginationSettings): number {
  return settings.template === "worksheet" && item.teacherNote ? 24 : 0;
}

type FlowBlock =
  | { kind: "passage-atom"; group: PaperGroup; allLines: string[]; height: number }
  | { kind: "passage-line"; group: PaperGroup; line: string; lineIndex: number; totalLines: number; height: number }
  | { kind: "header"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "option"; group: PaperGroup; item: PaperItem; option: OptionItem; index: number; height: number }
  | { kind: "answer"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "note"; group: PaperGroup; item: PaperItem; height: number };

type PaginationResult = {
  pages: PaperPage[];
  overflowItems: Set<string>;
};

function paginateGroups(groups: PaperGroup[], settings: PaginationSettings): PaginationResult {
  const pages: PaperPage[] = [];
  let pageIndex = 0;
  let columnIndex = 0;
  let currentPage: PaperPage = Array.from({ length: settings.columns }, () => []);
  let columnHeights = Array.from({ length: settings.columns }, () => 0);

  const passageTitleShownFor = new Set<string>();
  const headerRenderedFor = new Set<string>();
  const overflowItems = new Set<string>();

  function pushCurrentPage() {
    if (currentPage.some((column) => column.length > 0)) pages.push(currentPage);
    pageIndex += 1;
    columnIndex = 0;
    currentPage = Array.from({ length: settings.columns }, () => []);
    columnHeights = Array.from({ length: settings.columns }, () => 0);
  }

  function advanceColumn() {
    if (columnIndex < settings.columns - 1) {
      columnIndex += 1;
    } else {
      pushCurrentPage();
    }
  }

  function currentCapacity() {
    return pageMetrics(settings, pageIndex).capacity;
  }

  function ensureFragment(group: PaperGroup): RenderFragment {
    const col = currentPage[columnIndex];
    const last = col[col.length - 1];
    if (last && last.groupSourceId === group.id) return last;

    const gap = col.length > 0 ? GROUP_GAP : 0;
    const fragment: RenderFragment = {
      id: `${group.id}@p${pageIndex}c${columnIndex}n${col.length}`,
      passageTitle: group.passageTitle,
      passageContent: group.passageContent,
      includePassage: false,
      passageRenderedLines: [],
      passageStartLineIndex: 0,
      passageTotalLines: 0,
      groupSourceId: group.id,
      parts: [],
    };
    col.push(fragment);
    columnHeights[columnIndex] += gap;
    return fragment;
  }

  function ensurePart(fragment: RenderFragment, item: PaperItem): RenderItemPart {
    const last = fragment.parts[fragment.parts.length - 1];
    if (last && last.source.localId === item.localId) return last;

    const hasPassageOrParts = fragment.parts.length > 0 || fragment.passageRenderedLines.length > 0;
    const partGap = hasPassageOrParts ? ITEM_GAP : 0;
    const isFreshStart = !headerRenderedFor.has(item.localId);
    const part: RenderItemPart = {
      source: item,
      partKey: `${item.localId}@p${pageIndex}c${columnIndex}f${fragment.id}n${fragment.parts.length}`,
      showHeader: isFreshStart,
      showAnswer: false,
      options: [],
      isStart: isFreshStart,
      isContinuation: !isFreshStart,
    };
    fragment.parts.push(part);
    columnHeights[columnIndex] += partGap;
    return part;
  }

  function marginalCostForBlock(block: FlowBlock): number {
    const col = currentPage[columnIndex];
    const lastFrag = col[col.length - 1];
    const sameFragment = !!lastFrag && lastFrag.groupSourceId === block.group.id;

    let cost = block.height;

    if (!sameFragment) {
      cost += col.length > 0 ? GROUP_GAP : 0;
    }

    if (block.kind === "passage-line") {
      const isFirstLineOfFragment = !sameFragment || lastFrag!.passageRenderedLines.length === 0;
      if (isFirstLineOfFragment) {
        const includeTitle = !passageTitleShownFor.has(block.group.id);
        cost += passageChromeHeight(block.group, settings, includeTitle);
      }
    } else if (block.kind === "passage-atom") {
      // height already includes chrome
    } else {
      const item = block.item;
      const lastPart = sameFragment ? lastFrag!.parts[lastFrag!.parts.length - 1] : undefined;
      const samePart = !!lastPart && lastPart.source.localId === item.localId;
      if (!samePart) {
        const hasPassageOrParts =
          sameFragment &&
          (lastFrag!.parts.length > 0 || lastFrag!.passageRenderedLines.length > 0);
        if (hasPassageOrParts) cost += ITEM_GAP;
      }
    }

    return cost;
  }

  // Build flow blocks
  const blocks: FlowBlock[] = [];
  for (const group of groups) {
    if (group.includePassage && group.passageContent) {
      const lines = passageToLines(group.passageContent, settings);
      // Default: passage flows naturally line-by-line so it fills empty column space.
      // When keepTogether is true (currently keepWithPrev=true), treat passage as atomic
      // so the whole question moves cleanly to the next column / page.
      const keepTogether = Boolean(group.items[0]?.keepWithPrev);
      if (keepTogether) {
        const lineH = passageLineHeight(settings);
        const includeTitle = settings.showPassageTitle && Boolean(group.passageTitle);
        const chrome = passageChromeHeight(group, settings, includeTitle);
        const atomHeight = chrome + lines.length * lineH;
        blocks.push({
          kind: "passage-atom",
          group,
          allLines: lines,
          height: atomHeight,
        });
      } else {
        const lineH = passageLineHeight(settings);
        lines.forEach((line, idx) => {
          blocks.push({
            kind: "passage-line",
            group,
            line,
            lineIndex: idx,
            totalLines: lines.length,
            height: lineH,
          });
        });
      }
    }
    for (const item of group.items) {
      blocks.push({ kind: "header", group, item, height: estimateHeaderBlockHeight(item, settings) });
      item.options.forEach((option, index) => {
        blocks.push({ kind: "option", group, item, option, index, height: estimateOptionBlockHeight(option, settings) });
      });
      if (settings.showAnswerSpace && item.answerSpaceLines > 0) {
        blocks.push({ kind: "answer", group, item, height: estimateAnswerBlockHeight(item) });
      }
      if (settings.template === "worksheet" && item.teacherNote) {
        blocks.push({ kind: "note", group, item, height: estimateTeacherNoteHeight(item, settings) });
      }
    }
  }

  let isFirstBlockOverall = true;

  for (const block of blocks) {
    const group = block.group;
    const item = block.kind === "passage-line" || block.kind === "passage-atom" ? undefined : block.item;
    const isHeaderBlock = block.kind === "header";

    const itemRequestsKeepStay = !!item && !isFirstBlockOverall && Boolean(item.keepWithPrev);
    const headerForceStay = isHeaderBlock && itemRequestsKeepStay;

    // breakBefore on header block
    if (isHeaderBlock && item && !isFirstBlockOverall && !itemRequestsKeepStay) {
      if (item.breakBefore === "page") {
        if (currentPage.some((c) => c.length > 0)) pushCurrentPage();
      } else if (item.breakBefore === "column") {
        if (columnHeights[columnIndex] > 0) advanceColumn();
      }
    }

    const cost = marginalCostForBlock(block);
    const colHasContent = columnHeights[columnIndex] > 0;
    const wouldOverflow = colHasContent && columnHeights[columnIndex] + cost > currentCapacity();

    if (wouldOverflow && !headerForceStay) {
      advanceColumn();
    }

    const fragment = ensureFragment(group);

    if (block.kind === "passage-atom") {
      fragment.includePassage = true;
      fragment.passageRenderedLines = block.allLines;
      fragment.passageStartLineIndex = 0;
      fragment.passageTotalLines = block.allLines.length;
      passageTitleShownFor.add(group.id);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "passage-line") {
      const isFirstLineOfFragment = fragment.passageRenderedLines.length === 0;
      if (isFirstLineOfFragment) {
        const includeTitle = !passageTitleShownFor.has(group.id);
        const chrome = passageChromeHeight(group, settings, includeTitle);
        columnHeights[columnIndex] += chrome;
        fragment.includePassage = true;
        fragment.passageStartLineIndex = block.lineIndex;
        fragment.passageTotalLines = block.totalLines;
        if (includeTitle) passageTitleShownFor.add(group.id);
      }
      fragment.passageRenderedLines.push(block.line);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "header") {
      const part = ensurePart(fragment, item!);
      if (!headerRenderedFor.has(item!.localId)) {
        headerRenderedFor.add(item!.localId);
        columnHeights[columnIndex] += block.height;
        if (headerForceStay && columnHeights[columnIndex] > currentCapacity()) {
          overflowItems.add(item!.localId);
        }
      }
      void part;
    } else if (block.kind === "option") {
      const part = ensurePart(fragment, item!);
      part.options.push({ option: block.option, originalIndex: block.index });
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "answer") {
      const part = ensurePart(fragment, item!);
      part.showAnswer = true;
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "note") {
      ensurePart(fragment, item!);
      columnHeights[columnIndex] += block.height;
    }

    isFirstBlockOverall = false;
  }

  if (currentPage.some((column) => column.length > 0)) pages.push(currentPage);
  return {
    pages: pages.length > 0 ? pages : [Array.from({ length: settings.columns }, () => [])],
    overflowItems,
  };
}

function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function renderFormattedInline(text: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /__([^_]+)__|_{3,}|([①②③④⑤])|\(([a-eA-E])\)/g;
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
        <span key={key++} className="font-bold text-blue-700">
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

export function ExamPaperBuilderClient({
  academyId,
  questions,
  collections,
  classes,
  schools,
}: ExamPaperBuilderClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [questionType, setQuestionType] = useState("ALL");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<BuilderQuestion | null>(null);

  const [title, setTitle] = useState(`새 시험지 ${formatDateInput(new Date())}`);
  const [subtitle, setSubtitle] = useState("영어 내신 대비");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [studentNameLabel, setStudentNameLabel] = useState("이름");
  const [academyLogoDataUrl, setAcademyLogoDataUrl] = useState<string | null>(null);
  const [examDate, setExamDate] = useState("");
  const [classId, setClassId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [examType, setExamType] = useState("MIDTERM");

  const [template, setTemplate] = useState<PaperTemplate>("clean");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [density, setDensity] = useState<Density>("comfortable");
  const [passageStyle, setPassageStyle] = useState<PassageStyle>("boxed");
  const showAnswerSpace = true;
  const [showPassageTitle, setShowPassageTitle] = useState(true);
  const [showQuestionMeta, setShowQuestionMeta] = useState(true);
  const [paperItems, setPaperItems] = useState<PaperItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templateFloatingOffset, setTemplateFloatingOffset] = useState({ x: 0, y: 0 });
  const templateFloatingOffsetRef = useRef(templateFloatingOffset);
  const templateFloatingFrameRef = useRef<number | null>(null);
  const templateFloatingMovedRef = useRef(false);
  const templateFloatingHostRef = useRef<HTMLDivElement | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<DropPlacement>("before");
  const showLegacyInspector = false;

  const selectedQuestionIds = useMemo(
    () => new Set(paperItems.map((item) => item.questionId)),
    [paperItems],
  );

  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((question) => {
      if (selectedCollectionId && !question.collectionItems.some((item) => item.collectionId === selectedCollectionId)) {
        return false;
      }
      if (difficulty !== "ALL" && question.difficulty !== difficulty) return false;
      if (questionType !== "ALL" && question.type !== questionType) return false;
      if (approvedOnly && !question.approved) return false;
      if (starredOnly && !question.starred) return false;
      if (query) {
        const tags = parseTags(question.tags).join(" ");
        const haystack = [
          question.questionText,
          question.correctAnswer,
          question.passage?.title || "",
          question.passage?.content || "",
          tags,
          SUBTYPE_LABELS[question.subType || ""] || "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [questions, search, selectedCollectionId, difficulty, questionType, approvedOnly, starredOnly]);

  const paperGroups = useMemo(() => buildGroups(paperItems), [paperItems]);
  const paginationSettings = useMemo<PaginationSettings>(
    () => ({
      columns,
      density,
      passageStyle,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      template,
    }),
    [columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );
  const paperPages = paginationResult.pages;
  const overflowItemIds = paginationResult.overflowItems;
  const activeItem = useMemo(
    () => paperItems.find((item) => item.localId === activeItemId) || paperItems[0] || null,
    [paperItems, activeItemId],
  );
  const totalPoints = useMemo(
    () => paperItems.reduce((sum, item) => sum + item.points, 0),
    [paperItems],
  );

  function markDirty() {
    setDirty(true);
  }

  function toggleQuestion(question: BuilderQuestion) {
    setPaperItems((current) => {
      const exists = current.some((item) => item.questionId === question.id);
      if (exists) {
        const next = reindexItems(current.filter((item) => item.questionId !== question.id));
        if (activeItem?.questionId === question.id) setActiveItemId(next[0]?.localId || null);
        return next;
      }
      const nextItem = makePaperItem(question, current.length + 1, current);
      setActiveItemId(nextItem.localId);
      return [...current, nextItem];
    });
    markDirty();
  }

  function selectAllFiltered() {
    setPaperItems((current) => {
      const existing = new Set(current.map((item) => item.questionId));
      const additions = filteredQuestions
        .filter((question) => !existing.has(question.id))
        .slice(0, 80)
        .reduce<PaperItem[]>((acc, question) => {
          const next = makePaperItem(question, current.length + acc.length + 1, [...current, ...acc]);
          acc.push(next);
          return acc;
        }, []);
      if (additions[0]) setActiveItemId(additions[0].localId);
      return reindexItems([...current, ...additions]);
    });
    markDirty();
  }

  function clearPaper() {
    setPaperItems([]);
    setActiveItemId(null);
    markDirty();
  }

  function updateItem(localId: string, patch: Partial<PaperItem>) {
    setPaperItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
    markDirty();
  }

  function tryToggleKeepWithPrev(localId: string) {
    const current = paperItems.find((item) => item.localId === localId);
    if (!current) return;

    if (current.keepWithPrev) {
      updateItem(localId, { keepWithPrev: false });
      return;
    }

    const itemIndex = paperItems.findIndex((item) => item.localId === localId);
    if (itemIndex <= 0) {
      toast.error("앞 문항이 없어서 강제 배치할 수 없습니다.");
      return;
    }

    updateItem(localId, { keepWithPrev: true });
  }

  function updateGroupPassage(groupId: string | null, patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">) {
    if (!groupId) return;
    setPaperItems((current) =>
      current.map((item) => (item.groupId === groupId ? { ...item, ...patch } : item)),
    );
    markDirty();
  }

  function updateHeader(patch: HeaderPatch) {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.subtitle !== undefined) setSubtitle(patch.subtitle);
    if (patch.instructions !== undefined) setInstructions(patch.instructions);
    if (patch.studentNameLabel !== undefined) setStudentNameLabel(patch.studentNameLabel);
    if (patch.academyLogoDataUrl !== undefined) setAcademyLogoDataUrl(patch.academyLogoDataUrl);
    markDirty();
  }

  function handleLogoUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 로고로 넣을 수 있습니다.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("로고 이미지는 1.5MB 이하로 올려주세요.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        toast.error("로고 이미지를 읽지 못했습니다.");
        return;
      }
      setAcademyLogoDataUrl(result);
      markDirty();
    };
    reader.onerror = () => toast.error("로고 이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  }

  function removeItem(localId: string) {
    setPaperItems((current) => {
      const next = reindexItems(current.filter((item) => item.localId !== localId));
      setActiveItemId(next[0]?.localId || null);
      return next;
    });
    markDirty();
  }

  function moveItem(localId: string, direction: "up" | "down") {
    setPaperItems((current) => {
      const index = current.findIndex((item) => item.localId === localId);
      if (index < 0) return current;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return reindexItems(next);
    });
    markDirty();
  }

  function moveItemToDropTarget(sourceLocalId: string, targetLocalId: string, placement: DropPlacement) {
    if (sourceLocalId === targetLocalId) return;
    setPaperItems((current) => {
      const sourceIndex = current.findIndex((item) => item.localId === sourceLocalId);
      if (sourceIndex < 0) return current;
      const sourceItem = current[sourceIndex];
      const withoutSource = current.filter((item) => item.localId !== sourceLocalId);
      const targetIndex = withoutSource.findIndex((item) => item.localId === targetLocalId);
      if (targetIndex < 0) return current;
      const next = [...withoutSource];
      next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceItem);
      return reindexItems(next);
    });
    setActiveItemId(sourceLocalId);
    markDirty();
  }

  function ungroupItem(localId: string) {
    setPaperItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
            ...item,
            groupId: `single:${item.localId}`,
            includePassage: Boolean(item.passageContent),
          }
          : item,
      ),
    );
    markDirty();
  }

  function regroupByPassage() {
    setPaperItems((current) => {
      if (current.length === 0) return current;

      const groupKey = (item: PaperItem) =>
        item.sourceQuestion.passage
          ? `passage:${item.sourceQuestion.passage.id}`
          : `solo:${item.questionId}`;

      const firstSeen = new Map<string, number>();
      current.forEach((item, index) => {
        const key = groupKey(item);
        if (!firstSeen.has(key)) firstSeen.set(key, index);
      });

      const sorted = [...current]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const keyA = groupKey(a.item);
          const keyB = groupKey(b.item);
          const orderA = firstSeen.get(keyA) ?? 0;
          const orderB = firstSeen.get(keyB) ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return a.index - b.index;
        })
        .map(({ item }) => item);

      const seen = new Set<string>();
      const grouped = sorted.map((item) => {
        const groupId = groupKey(item);
        const includePassage = Boolean(item.sourceQuestion.passage && !seen.has(groupId));
        seen.add(groupId);
        return { ...item, groupId, includePassage };
      });

      return reindexItems(grouped);
    });
    markDirty();
  }

  function ungroupActive() {
    if (!activeItem?.groupId) return;
    const targetGroupId = activeItem.groupId;
    setPaperItems((current) =>
      current.map((item) =>
        item.groupId === targetGroupId
          ? {
            ...item,
            groupId: `single:${item.localId}`,
            includePassage: Boolean(item.passageContent),
          }
          : item,
      ),
    );
    markDirty();
  }

  async function saveDraft(): Promise<string | null> {
    if (paperItems.length === 0) {
      toast.error("시험지에 넣을 문제를 선택해주세요.");
      return null;
    }

    const result = await saveExamPaperDraft(academyId, {
      examId: savedExamId,
      title,
      type: "OFFLINE",
      classId: classId || null,
      schoolId: schoolId || null,
      grade: grade ? Number(grade) : null,
      semester: semester || null,
      examType: examType || null,
      examDate: examDate || null,
      totalPoints: totalPoints || paperItems.length,
      template,
      layout: {
        columns,
        density,
        showAnswerSpace,
        showPassageTitle,
        showQuestionMeta,
        passageStyle,
        pageNumberStyle: "center",
      },
      header: {
        subtitle,
        schoolName: schools.find((school) => school.id === schoolId)?.name,
        className: classes.find((cls) => cls.id === classId)?.name,
        studentNameLabel,
        instructions,
        academyLogoDataUrl,
      },
      items: paperItems.map((item) => ({
        questionId: item.questionId,
        orderNum: item.orderNum,
        points: item.points,
        groupId: item.groupId,
        includePassage: item.includePassage,
        passageTitle: item.passageTitle,
        passageContent: item.passageContent,
        questionText: item.questionText,
        options: item.options,
        correctAnswer: item.correctAnswer,
        answerSpaceLines: item.answerSpaceLines,
        sectionTitle: item.sectionTitle,
        teacherNote: item.teacherNote,
      })),
    });

    if (!result.success) {
      toast.error(result.error || "시험지 저장 실패");
      return null;
    }

    setSavedExamId(result.id || null);
    setDirty(false);
    toast.success("시험지 관리에 초안으로 저장되었습니다.");
    return result.id || null;
  }

  function handleSave() {
    startTransition(async () => {
      await saveDraft();
    });
  }

  function handlePrint() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제를 먼저 선택해주세요.");
      return;
    }
    window.setTimeout(() => window.print(), 50);
  }

  useEffect(() => {
    const PRINT_BODY_CLASS = "exam-print-active";
    let originalParent: HTMLElement | null = null;
    let originalNextSibling: Node | null = null;
    let originalRootInlineStyle = "";
    let printHost: HTMLDivElement | null = null;

    function beforePrint() {
      const root = document.getElementById("exam-paper-print-root");
      if (!root || !root.parentElement) return;

      originalParent = root.parentElement;
      originalNextSibling = root.nextSibling;
      originalRootInlineStyle = root.getAttribute("style") || "";

      printHost = document.createElement("div");
      printHost.id = "exam-print-host";
      printHost.style.cssText =
        "position:fixed;left:0;top:0;width:210mm;height:auto;z-index:2147483647;background:white;margin:0;padding:0;";

      document.body.appendChild(printHost);
      printHost.appendChild(root);

      root.setAttribute(
        "style",
        "width:210mm;max-width:210mm;height:auto;padding:0;margin:0;overflow:visible;background:white;display:block;",
      );

      document.body.classList.add(PRINT_BODY_CLASS);
    }

    function afterPrint() {
      const root = document.getElementById("exam-paper-print-root");
      if (root && originalParent) {
        if (originalRootInlineStyle) root.setAttribute("style", originalRootInlineStyle);
        else root.removeAttribute("style");

        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
          originalParent.insertBefore(root, originalNextSibling);
        } else {
          originalParent.appendChild(root);
        }
      }
      if (printHost && printHost.parentElement) {
        printHost.parentElement.removeChild(printHost);
      }
      document.body.classList.remove(PRINT_BODY_CLASS);
      originalParent = null;
      originalNextSibling = null;
      originalRootInlineStyle = "";
      printHost = null;
    }

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  function handleDownloadDocx() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      const link = document.createElement("a");
      link.href = `/api/exams/${examId}/export-docx`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function handleGoToManage() {
    if (dirty || !savedExamId) {
      startTransition(async () => {
        const examId = await saveDraft();
        if (examId) router.push("/director/workbench/exams");
      });
      return;
    }
    router.push("/director/workbench/exams");
  }

  function startTemplateFloatingDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-template-floating-drag-ignore='true']")) return;

    event.stopPropagation();

    const host = templateFloatingHostRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = templateFloatingOffsetRef.current;
    const margin = 8;
    const minDeltaX = margin - rect.left;
    const maxDeltaX = window.innerWidth - margin - rect.right;
    const minDeltaY = margin - rect.top;
    const maxDeltaY = window.innerHeight - margin - rect.bottom;
    const pointerId = event.pointerId;
    let didMove = false;
    let latestOffset = startOffset;
    const previousBodyCursor = document.body.style.cursor;
    const previousBodyUserSelect = document.body.style.userSelect;

    templateFloatingMovedRef.current = false;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    host.style.transition = "none";
    host.style.willChange = "transform";

    try {
      event.currentTarget.setPointerCapture(pointerId);
    } catch {
      // Some elements may not keep capture after DOM updates; window listeners still finish the drag.
    }

    const applyFloatingTransform = () => {
      templateFloatingFrameRef.current = null;
      host.style.transform = `translate3d(${latestOffset.x}px, ${latestOffset.y}px, 0)`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rawDeltaX = moveEvent.clientX - startX;
      const rawDeltaY = moveEvent.clientY - startY;
      if (!didMove && Math.hypot(rawDeltaX, rawDeltaY) >= 2) {
        didMove = true;
        templateFloatingMovedRef.current = true;
      }
      moveEvent.preventDefault();
      const deltaX = clampNumber(rawDeltaX, minDeltaX, maxDeltaX);
      const deltaY = clampNumber(rawDeltaY, minDeltaY, maxDeltaY);
      latestOffset = {
        x: startOffset.x + deltaX,
        y: startOffset.y + deltaY,
      };
      templateFloatingOffsetRef.current = latestOffset;

      if (templateFloatingFrameRef.current === null) {
        templateFloatingFrameRef.current = window.requestAnimationFrame(applyFloatingTransform);
      }
    };

    const finishDrag = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      if (templateFloatingFrameRef.current !== null) {
        window.cancelAnimationFrame(templateFloatingFrameRef.current);
        templateFloatingFrameRef.current = null;
      }
      applyFloatingTransform();
      setTemplateFloatingOffset(latestOffset);
      document.body.style.cursor = previousBodyCursor;
      document.body.style.userSelect = previousBodyUserSelect;
      host.style.transition = "";
      host.style.willChange = "transform";
      try {
        event.currentTarget.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture is best-effort here.
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { once: true });
    window.addEventListener("pointercancel", finishDrag, { once: true });
  }

  function handleTemplateFloatingButtonClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (templateFloatingMovedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      templateFloatingMovedRef.current = false;
      return;
    }

    setTemplatePanelOpen((open) => !open);
  }

  const templateSettingsPanel = (
    <div className="space-y-4">
      <div
        onPointerDown={startTemplateFloatingDrag}
        className="flex touch-none cursor-grab items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 active:cursor-grabbing"
      >
        <div>
          <p className="text-[13px] font-black text-slate-800">템플릿 설정</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            상단을 잡고 옮기면서 시험지 형식을 조정합니다.
          </p>
        </div>
        <button
          type="button"
          data-template-floating-drag-ignore="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setTemplatePanelOpen(false)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
          title="템플릿 패널 닫기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">디자인 템플릿</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(TEMPLATE_META) as PaperTemplate[]).map((id) => (
            <button
              key={id}
              onClick={() => { setTemplate(id); markDirty(); }}
              className={cn(
                "min-h-[86px] rounded-xl border p-2.5 text-left transition-all",
                template === id ? `${TEMPLATE_META[id].accent} shadow-sm` : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <span className={cn("mb-2 block h-2.5 w-14 rounded-full bg-gradient-to-r", TEMPLATE_META[id].swatch)} />
              <p className="text-[12px] font-bold">{TEMPLATE_META[id].label}</p>
              <p className="mt-1 text-[10px] leading-relaxed opacity-80">{TEMPLATE_META[id].description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">학원 로고</p>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {academyLogoDataUrl ? (
                <NextImage
                  src={academyLogoDataUrl}
                  alt="학원 로고 미리보기"
                  width={56}
                  height={56}
                  unoptimized
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <ImagePlus className="h-5 w-5 text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100">
                <ImagePlus className="h-3.5 w-3.5" />
                로고 넣기
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    handleLogoUpload(event.target.files?.[0] || null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">PNG/JPG 권장, 1.5MB 이하</p>
            </div>
            {academyLogoDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setAcademyLogoDataUrl(null);
                  markDirty();
                }}
                className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">단 구성</p>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                onClick={() => { setColumns(value); markDirty(); }}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold",
                  columns === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
                )}
              >
                <Columns2 className="h-3.5 w-3.5" />
                {value}단
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">밀도</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["comfortable", "표준"],
              ["compact", "압축"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => { setDensity(value); markDirty(); }}
                className={cn(
                  "h-9 rounded-lg border text-[12px] font-bold",
                  density === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">지문 스타일</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["boxed", "박스"],
            ["plain", "본문"],
            ["underlined", "밑줄"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setPassageStyle(value); markDirty(); }}
              className={cn(
                "h-9 rounded-lg border text-[12px] font-bold",
                passageStyle === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">표시 옵션</p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { checked: showPassageTitle, set: setShowPassageTitle, label: "지문 제목" },
            { checked: showQuestionMeta, set: setShowQuestionMeta, label: "문항 메타" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.set(!item.checked); markDirty(); }}
              className={cn(
                "flex h-9 items-center justify-between rounded-lg border px-3 text-[12px] font-bold",
                item.checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
              )}
            >
              {item.label}
              <span className={cn("h-2 w-2 rounded-full", item.checked ? "bg-blue-500" : "bg-slate-300")} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div id="exam-builder-shell" className="flex h-[calc(100dvh-104px)] min-h-0 flex-col overflow-hidden bg-[#F4F6F9]">
      <div className="no-print flex shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white px-8 py-4">
        <Link
          href="/director/workbench"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition-all hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4.5 w-4.5 text-slate-600" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50">
            <ClipboardList className="h-4.5 w-4.5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[18px] font-bold tracking-tight text-slate-900">시험지 생성</h1>
            <p className="text-[12px] text-slate-400">
              문제 은행에서 고르고, A4 미리보기에서 편집한 뒤 바로 저장합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              저장 안 됨
            </span>
          )}
          <button
            onClick={handleGoToManage}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            시험지 관리
          </button>
          <button
            onClick={handlePrint}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
          <button
            onClick={handleDownloadDocx}
            disabled={isPending || paperItems.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            DOCX
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || paperItems.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[minmax(520px,1fr)_minmax(560px,48vw)]">
        <section className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white">
          {paperItems.length > 0 && (
            <div className="flex shrink-0 items-center gap-3 border-b border-blue-200 bg-blue-50 px-5 py-2">
              <span className="text-[12px] font-bold text-blue-700">{paperItems.length}문항 선택</span>
              <span className="h-4 w-px bg-blue-200" />
              <button onClick={selectAllFiltered} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
                현재 목록 추가
              </button>
              <button onClick={regroupByPassage} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800">
                <Group className="h-3 w-3" />
                지문별 자동 그룹화
              </button>
              <div className="flex-1" />
              <button onClick={clearPaper} className="text-[11px] font-semibold text-blue-500 hover:text-blue-800">
                전체 비우기
              </button>
            </div>
          )}

          <div className="shrink-0 border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="문제, 지문, 태그로 검색..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
              <button
                onClick={() => setShowFilters((value) => !value)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-all",
                  showFilters || difficulty !== "ALL" || questionType !== "ALL" || approvedOnly || starredOnly
                    ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                필터
              </button>
              <div className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[12px] font-semibold text-slate-600">{filteredQuestions.length}</span>
                <span className="text-[11px] text-slate-400">개</span>
              </div>
            </div>

            {showFilters && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                <select
                  value={questionType}
                  onChange={(event) => setQuestionType(event.target.value)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600"
                >
                  <option value="ALL">전체 유형</option>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600"
                >
                  <option value="ALL">전체 난이도</option>
                  <option value="BASIC">기본</option>
                  <option value="INTERMEDIATE">중급</option>
                  <option value="KILLER">킬러</option>
                </select>
                <button
                  onClick={() => setApprovedOnly((value) => !value)}
                  className={cn(
                    "h-7 rounded-md border px-2 text-[11px] font-semibold",
                    approvedOnly ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500",
                  )}
                >
                  승인 문제만
                </button>
                <button
                  onClick={() => setStarredOnly((value) => !value)}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold",
                    starredOnly ? "border-yellow-300 bg-yellow-50 text-yellow-700" : "border-slate-200 text-slate-500",
                  )}
                >
                  <Star className={cn("h-3 w-3", starredOnly && "fill-yellow-400")} />
                  중요
                </button>
                <button
                  onClick={() => {
                    setDifficulty("ALL");
                    setQuestionType("ALL");
                    setApprovedOnly(false);
                    setStarredOnly(false);
                  }}
                  className="ml-auto flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                >
                  <X className="h-3 w-3" />
                  초기화
                </button>
              </div>
            )}

            {collections.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5">
                <button
                  onClick={() => setSelectedCollectionId("")}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-all",
                    !selectedCollectionId
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  전체 문제
                </button>
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => setSelectedCollectionId(selectedCollectionId === collection.id ? "" : collection.id)}
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-all",
                      selectedCollectionId === collection.id
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <FolderOpen className="h-3 w-3" />
                    {collection.name}
                    <span className="text-[10px] text-slate-400">{collection._count.items}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div id="exam-question-bank-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {filteredQuestions.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <FileText className="h-9 w-9 text-slate-300" />
                <p className="text-[13px] font-semibold text-slate-500">문제가 없습니다</p>
                <p className="text-[12px] text-slate-400">문제 생성 탭에서 먼저 문제를 만들거나 필터를 조정해주세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
                {filteredQuestions.map((question) => {
                  const selected = selectedQuestionIds.has(question.id);
                  const diff = DIFFICULTY_META[question.difficulty];
                  const tags = parseTags(question.tags);
                  const options = parseOptions(question.options);
                  return (
                    <article
                      key={question.id}
                      className={cn(
                        "group relative flex min-h-[250px] flex-col rounded-xl border bg-white p-4 transition-all duration-200 hover:shadow-md",
                        selected ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-300/30" : "border-slate-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <button
                            onClick={() => toggleQuestion(question)}
                            className={cn(
                              "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded transition-all",
                              selected
                                ? "border border-blue-600 bg-blue-600 text-white"
                                : "border border-slate-300 bg-white text-transparent hover:border-blue-400 hover:text-blue-400",
                            )}
                            aria-label={selected ? "문제 선택 해제" : "문제 선택"}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3 className="truncate text-[13px] font-semibold text-slate-800">
                                {question.passage?.title || SUBTYPE_LABELS[question.subType || ""] || "독립 문제"}
                              </h3>
                              {question.starred && <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-500" />}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {TYPE_LABELS[question.type] || question.type}
                              </span>
                              {question.subType && (
                                <span className="text-[10px] font-medium text-blue-600">
                                  {SUBTYPE_LABELS[question.subType] || question.subType}
                                </span>
                              )}
                              {diff && (
                                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", diff.className)}>
                                  {diff.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setDetailQuestion(question)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 transition-opacity hover:bg-slate-100 group-hover:opacity-100"
                          title="상세 보기"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                        </button>
                      </div>

                      {question.passage && (
                        <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                          {question.passage.content}
                        </p>
                      )}

                      <p className="mt-2.5 line-clamp-4 whitespace-pre-line text-[12px] font-medium leading-relaxed text-slate-700">
                        {questionPreview(question.questionText)}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {question.approved ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            승인
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            <Clock className="h-3 w-3" />
                            검토 전
                          </span>
                        )}
                        {question.passage && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                            <BookOpen className="h-3 w-3" />
                            {countWords(question.passage.content)} words
                          </span>
                        )}
                        {options.length > 0 && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                            선택지 {options.length}
                          </span>
                        )}
                        {question._count.examLinks > 0 && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            사용 {question._count.examLinks}
                          </span>
                        )}
                      </div>

                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span key={tag} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex-1" />
                      <button
                        onClick={() => toggleQuestion(question)}
                        className={cn(
                          "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold transition-colors",
                          selected
                            ? "border-blue-300 bg-blue-600 text-white hover:bg-blue-700"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                        )}
                      >
                        {selected ? "선택됨" : "시험지에 추가"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-col overflow-hidden bg-slate-100/70">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[12px] font-bold text-slate-600">A4 미리보기</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {TEMPLATE_META[template].label}
              </span>
            </div>
          </div>

          {showLegacyInspector && (
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">시험지 제목</span>
                  <input
                    value={title}
                    onChange={(event) => { setTitle(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">부제</span>
                  <input
                    value={subtitle}
                    onChange={(event) => { setSubtitle(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">이름 칸 라벨</span>
                  <input
                    value={studentNameLabel}
                    onChange={(event) => { setStudentNameLabel(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">학교</span>
                  <select
                    value={schoolId}
                    onChange={(event) => { setSchoolId(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  >
                    <option value="">학교 선택 안 함</option>
                    {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">반</span>
                  <select
                    value={classId}
                    onChange={(event) => { setClassId(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  >
                    <option value="">반 선택 안 함</option>
                    {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">학년</span>
                  <select
                    value={grade}
                    onChange={(event) => { setGrade(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  >
                    <option value="">학년 없음</option>
                    <option value="1">1학년</option>
                    <option value="2">2학년</option>
                    <option value="3">3학년</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">시험 종류</span>
                  <select
                    value={examType}
                    onChange={(event) => { setExamType(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  >
                    <option value="MIDTERM">중간고사</option>
                    <option value="FINAL">기말고사</option>
                    <option value="QUIZ">쪽지시험</option>
                    <option value="MOCK">모의고사</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">학기</span>
                  <select
                    value={semester}
                    onChange={(event) => { setSemester(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  >
                    <option value="">학기 없음</option>
                    <option value="FIRST">1학기</option>
                    <option value="SECOND">2학기</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">시행일</span>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(event) => { setExamDate(event.target.value); markDirty(); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">안내 문구</span>
                  <textarea
                    value={instructions}
                    onChange={(event) => { setInstructions(event.target.value); markDirty(); }}
                    className="min-h-[58px] w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden bg-slate-100/70">
            <div className="flex h-full min-h-0">
              <div
                id="exam-paper-print-root"
                onPointerDownCapture={(event) => {
                  const target = event.target as HTMLElement;
                  if (!target.closest("[data-paper-item-id]")) {
                    setActiveItemId(null);
                  }
                }}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"
              >
                {paperItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                      <FileText className="h-7 w-7 text-slate-300" />
                    </div>
                    <p className="mt-4 text-[14px] font-bold text-slate-600">문제를 선택하면 A4 미리보기가 생성됩니다</p>
                    <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-slate-400">
                      같은 지문에서 만든 문제는 기본적으로 하나의 지문 묶음으로 배치됩니다.
                    </p>
                  </div>
                ) : (
                  <div
                    className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-5"
                  >
                    {paperPages.map((pageColumns, pageIndex) => (
                      <A4PaperPage
                        key={pageIndex}
                        pageIndex={pageIndex}
                        pageCount={paperPages.length}
                        title={title}
                        subtitle={subtitle}
                        instructions={instructions}
                        studentNameLabel={studentNameLabel}
                        academyLogoDataUrl={academyLogoDataUrl}
                        template={template}
                        columns={columns}
                        density={density}
                        passageStyle={passageStyle}
                        showAnswerSpace={showAnswerSpace}
                        showPassageTitle={showPassageTitle}
                        showQuestionMeta={showQuestionMeta}
                        pageColumns={pageColumns}
                        activeItemId={activeItemId}
                        setActiveItemId={setActiveItemId}
                        onHeaderChange={updateHeader}
                        onUpdateItem={updateItem}
                        onUpdateGroupPassage={updateGroupPassage}
                        onMoveItemToDropTarget={moveItemToDropTarget}
                        onRemoveItem={removeItem}
                        onUngroupItem={ungroupItem}
                        onRegroupByPassage={regroupByPassage}
                        onToggleKeepWithPrev={tryToggleKeepWithPrev}
                        overflowItemIds={overflowItemIds}
                        draggingItemId={draggingItemId}
                        setDraggingItemId={setDraggingItemId}
                        dragOverItemId={dragOverItemId}
                        setDragOverItemId={setDragOverItemId}
                        dragPlacement={dragPlacement}
                        setDragPlacement={setDragPlacement}
                        schoolName={schools.find((school) => school.id === schoolId)?.name || ""}
                        className={classes.find((cls) => cls.id === classId)?.name || ""}
                        examDate={examDate}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {showLegacyInspector && activeItem && (
            <div className="no-print max-h-[310px] shrink-0 overflow-y-auto border-t border-slate-200 bg-white px-5 py-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                  <Settings2 className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-800">{activeItem.orderNum}번 문항 편집</p>
                  <p className="text-[11px] text-slate-400">미리보기에서 문항을 클릭해 편집 대상을 바꿀 수 있습니다.</p>
                </div>
                <button onClick={() => moveItem(activeItem.localId, "up")} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
                  <MoveUp className="h-3.5 w-3.5 text-slate-500" />
                </button>
                <button onClick={() => moveItem(activeItem.localId, "down")} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
                  <MoveDown className="h-3.5 w-3.5 text-slate-500" />
                </button>
                <button onClick={() => removeItem(activeItem.localId)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">배점</span>
                  <div className="flex h-9 w-fit overflow-hidden rounded-lg border border-slate-200">
                    <button onClick={() => updateItem(activeItem.localId, { points: Math.max(1, activeItem.points - 1) })} className="flex w-8 items-center justify-center text-slate-400 hover:bg-slate-50">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="flex w-10 items-center justify-center border-x border-slate-200 bg-slate-50 text-[13px] font-bold text-slate-700">
                      {activeItem.points}
                    </span>
                    <button onClick={() => updateItem(activeItem.localId, { points: activeItem.points + 1 })} className="flex w-8 items-center justify-center text-slate-400 hover:bg-slate-50">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">풀이 줄 수</span>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={activeItem.answerSpaceLines}
                    onChange={(event) => updateItem(activeItem.localId, { answerSpaceLines: Number(event.target.value) })}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none"
                  />
                </label>
                {activeItem.passageContent && (
                  <>
                    <label className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={activeItem.includePassage}
                        onChange={(event) => updateItem(activeItem.localId, { includePassage: event.target.checked })}
                      />
                      <span className="text-[12px] font-semibold text-slate-600">이 문항 앞에 지문 표시</span>
                    </label>
                    <label className="col-span-2 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">지문 제목</span>
                      <input
                        value={activeItem.passageTitle}
                        onChange={(event) => updateItem(activeItem.localId, { passageTitle: event.target.value })}
                        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-blue-400"
                      />
                    </label>
                    <label className="col-span-2 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">지문 내용</span>
                      <textarea
                        value={activeItem.passageContent}
                        onChange={(event) => updateItem(activeItem.localId, { passageContent: event.target.value })}
                        className="min-h-[88px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-blue-400"
                      />
                    </label>
                  </>
                )}
                <label className="col-span-2 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">문제 문장</span>
                  <textarea
                    value={activeItem.questionText}
                    onChange={(event) => updateItem(activeItem.localId, { questionText: event.target.value })}
                    className="min-h-[76px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-blue-400"
                  />
                </label>
                {activeItem.options.length > 0 && (
                  <div className="col-span-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">선택지</span>
                      <button
                        onClick={() => updateItem(activeItem.localId, { options: [...activeItem.options, { label: String(activeItem.options.length + 1), text: "" }] })}
                        className="text-[11px] font-semibold text-blue-600"
                      >
                        선택지 추가
                      </button>
                    </div>
                    {activeItem.options.map((option, index) => (
                      <div key={`${option.label}-${index}`} className="flex items-center gap-2">
                        <input
                          value={option.label}
                          onChange={(event) => {
                            const next = [...activeItem.options];
                            next[index] = { ...next[index], label: event.target.value };
                            updateItem(activeItem.localId, { options: next });
                          }}
                          className="h-8 w-12 rounded-lg border border-slate-200 px-2 text-[12px] outline-none"
                        />
                        <input
                          value={option.text}
                          onChange={(event) => {
                            const next = [...activeItem.options];
                            next[index] = { ...next[index], text: event.target.value };
                            updateItem(activeItem.localId, { options: next });
                          }}
                          className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-[12px] outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
                <label className="col-span-2 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">정답 메모</span>
                  <input
                    value={activeItem.correctAnswer}
                    onChange={(event) => updateItem(activeItem.localId, { correctAnswer: event.target.value })}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-blue-400"
                  />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">교사용 메모</span>
                  <input
                    value={activeItem.teacherNote}
                    onChange={(event) => updateItem(activeItem.localId, { teacherNote: event.target.value })}
                    placeholder="예: 수업 중 강조한 표현, 오답 포인트"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-blue-400"
                  />
                </label>
                <div className="col-span-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                  <p className="text-[11px] font-bold text-slate-500">레이아웃 흐름</p>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-600">앞에서 줄바꿈</span>
                    <select
                      value={activeItem.breakBefore}
                      onChange={(event) =>
                        updateItem(activeItem.localId, { breakBefore: event.target.value as BreakBefore })
                      }
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] outline-none focus:border-blue-400"
                    >
                      <option value="auto">자동 (빈 공간 채움)</option>
                      <option value="column">다음 칸으로</option>
                      <option value="page">다음 페이지로</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeItem.keepWithPrev}
                      onChange={(event) => updateItem(activeItem.localId, { keepWithPrev: event.target.checked })}
                    />
                    <span className="text-[11px] font-semibold text-slate-600">앞 문항 바로 아래에 강제 배치</span>
                  </label>
                  <p className="text-[10px] leading-relaxed text-slate-400">
                    기본은 빈 공간을 채우면서 자연스럽게 흐릅니다. "다음 칸/페이지로"는 강제 분리, "강제 배치"는 앞 문항 바로 아래에 박아넣습니다 (칸 경계를 넘쳐도 옆 칸으로 안 밀어냄).
                  </p>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <button
                    onClick={ungroupActive}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Ungroup className="h-3.5 w-3.5" />
                    현재 지문 묶음 해제
                  </button>
                  <button
                    onClick={regroupByPassage}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <Group className="h-3.5 w-3.5" />
                    지문별 다시 묶기
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div
        ref={templateFloatingHostRef}
        className="no-print fixed bottom-[152px] right-8 z-50 flex touch-none select-none flex-col-reverse items-end gap-3"
        style={{
          backfaceVisibility: "hidden",
          contain: "layout style",
          transform: `translate3d(${templateFloatingOffset.x}px, ${templateFloatingOffset.y}px, 0)`,
          willChange: "transform",
        }}
      >
        <button
          id="exam-template-floating-button"
          type="button"
          aria-pressed={templatePanelOpen}
          onPointerDown={startTemplateFloatingDrag}
          onClick={handleTemplateFloatingButtonClick}
          className={cn(
            "inline-flex h-11 cursor-grab touch-none select-none items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg transition-colors duration-150 active:cursor-grabbing",
            templatePanelOpen
              ? "border-blue-300 bg-blue-600 text-white shadow-blue-500/20"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
          )}
        >
          <LayoutTemplate className="h-4 w-4" />
          시험지 편집
        </button>

        {templatePanelOpen && (
          <div
            id="exam-template-floating-panel"
            className="w-[340px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/15"
            style={{
              maxHeight: "min(560px, calc(100dvh - 232px))",
            }}
          >
            {templateSettingsPanel}
          </div>
        )}
      </div>

      {detailQuestion && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]" onClick={() => setDetailQuestion(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <p className="text-[14px] font-bold text-slate-900">문제 상세</p>
                <p className="text-[11px] text-slate-400">{detailQuestion.passage?.title || "독립 문제"}</p>
              </div>
              <button onClick={() => setDetailQuestion(null)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
              {detailQuestion.passage && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="mb-2 text-[12px] font-bold text-slate-700">{detailQuestion.passage.title}</p>
                  <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-600">{detailQuestion.passage.content}</p>
                </div>
              )}
              <p className="whitespace-pre-line text-[14px] font-semibold leading-relaxed text-slate-800">{detailQuestion.questionText}</p>
              {parseOptions(detailQuestion.options).length > 0 && (
                <div className="mt-4 space-y-2">
                  {parseOptions(detailQuestion.options).map((option) => (
                    <div key={option.label} className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                      <span className="font-bold text-slate-400">{option.label}</span>
                      <span>{option.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {detailQuestion.explanation && (
                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                  <p className="text-[12px] font-bold text-amber-800">해설</p>
                  <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-amber-900">{detailQuestion.explanation.content}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }

        @media print {
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
          }

          /* During print, the JS handler moves the print root into #exam-print-host
             and hides everything else by class. */
          body.exam-print-active > *:not(#exam-print-host) {
            display: none !important;
          }

          #exam-print-host {
            position: static !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          #exam-paper-print-root {
            width: 210mm !important;
            max-width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            display: block !important;
          }

          /* Inner pages container — wipe gap, max-width, alignment */
          #exam-paper-print-root > div {
            max-width: none !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
            display: block !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          .exam-a4-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            outline: none !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            aspect-ratio: auto !important;
            box-sizing: border-box !important;
            border-radius: 0 !important;
            display: block !important;
          }

          /* Tailwind ring utilities use box-shadow — neutralize */
          .exam-a4-page,
          .exam-a4-page * {
            --tw-ring-shadow: 0 0 #0000 !important;
            --tw-ring-offset-shadow: 0 0 #0000 !important;
            --tw-shadow: 0 0 #0000 !important;
            box-shadow: none !important;
          }

          .exam-a4-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

interface A4PaperPageProps {
  pageIndex: number;
  pageCount: number;
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
  template: PaperTemplate;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  pageColumns: PaperPage;
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
  onHeaderChange: (patch: HeaderPatch) => void;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  onUpdateGroupPassage: (groupId: string | null, patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">) => void;
  onMoveItemToDropTarget: (sourceLocalId: string, targetLocalId: string, placement: DropPlacement) => void;
  onRemoveItem: (localId: string) => void;
  onUngroupItem: (localId: string) => void;
  onRegroupByPassage: () => void;
  onToggleKeepWithPrev: (localId: string) => void;
  overflowItemIds: Set<string>;
  draggingItemId: string | null;
  setDraggingItemId: (id: string | null) => void;
  dragOverItemId: string | null;
  setDragOverItemId: (id: string | null) => void;
  dragPlacement: DropPlacement;
  setDragPlacement: (placement: DropPlacement) => void;
  schoolName: string;
  className: string;
  examDate: string;
}

function normalizeEditableText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function EditableText({
  value,
  onCommit,
  className,
  children,
  placeholder = "",
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  children?: React.ReactNode;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const isEmpty = !value.trim();

  return (
    <span
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => setEditing(true)}
      onBlur={(event) => {
        const next = normalizeEditableText(event.currentTarget.innerText);
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      className={cn(
        "editable-paper-field rounded-[3px] outline-none transition-colors hover:bg-blue-50/70 focus:bg-blue-50 focus:ring-2 focus:ring-blue-300/60",
        isEmpty && "text-slate-300",
        className,
      )}
    >
      {editing ? value : isEmpty ? placeholder : children ?? value}
    </span>
  );
}

function A4PaperPage({
  pageIndex,
  pageCount,
  title,
  subtitle,
  instructions,
  studentNameLabel,
  academyLogoDataUrl,
  template,
  columns,
  density,
  passageStyle,
  showAnswerSpace,
  showPassageTitle,
  showQuestionMeta,
  pageColumns,
  activeItemId,
  setActiveItemId,
  onHeaderChange,
  onUpdateItem,
  onUpdateGroupPassage,
  onMoveItemToDropTarget,
  onRemoveItem,
  onUngroupItem,
  onRegroupByPassage,
  onToggleKeepWithPrev,
  overflowItemIds,
  draggingItemId,
  setDraggingItemId,
  dragOverItemId,
  setDragOverItemId,
  dragPlacement,
  setDragPlacement,
  schoolName,
  className,
  examDate,
}: A4PaperPageProps) {
  const compact = density === "compact";
  const visual = TEMPLATE_VISUALS[template];

  function updateDragTarget(clientX: number, clientY: number, sourceLocalId: string) {
    const targetElement = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-paper-item-id]");
    const targetLocalId = targetElement?.dataset.paperItemId || null;

    if (!targetElement || !targetLocalId || targetLocalId === sourceLocalId) {
      setDragOverItemId(null);
      return null;
    }

    const rect = targetElement.getBoundingClientRect();
    const placement: DropPlacement = clientY > rect.top + rect.height / 2 ? "after" : "before";
    setDragOverItemId(targetLocalId);
    setDragPlacement(placement);
    return { targetLocalId, placement };
  }

  function autoScrollPaperPreview(clientY: number) {
    const scroller = document.getElementById("exam-paper-print-root");
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    const edgeSize = 72;
    const scrollStep = 18;

    if (clientY < rect.top + edgeSize) {
      scroller.scrollTop -= scrollStep;
    } else if (clientY > rect.bottom - edgeSize) {
      scroller.scrollTop += scrollStep;
    }
  }

  function startPaperItemDrag(event: React.PointerEvent<HTMLButtonElement>, sourceLocalId: string) {
    event.preventDefault();
    event.stopPropagation();

    setActiveItemId(sourceLocalId);
    setDraggingItemId(sourceLocalId);
    setDragOverItemId(null);

    let latestDropTarget: { targetLocalId: string; placement: DropPlacement } | null = null;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      autoScrollPaperPreview(moveEvent.clientY);
      latestDropTarget =
        updateDragTarget(moveEvent.clientX, moveEvent.clientY, sourceLocalId) || latestDropTarget;
    };

    const finishDrag = (upEvent?: PointerEvent) => {
      if (upEvent) {
        latestDropTarget =
          updateDragTarget(upEvent.clientX, upEvent.clientY, sourceLocalId) || latestDropTarget;
      }
      if (latestDropTarget) {
        onMoveItemToDropTarget(sourceLocalId, latestDropTarget.targetLocalId, latestDropTarget.placement);
      }

      setDraggingItemId(null);
      setDragOverItemId(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };

    const handlePointerUp = (upEvent: PointerEvent) => finishDrag(upEvent);
    const handlePointerCancel = () => finishDrag();

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerCancel, { once: true });
  }

  return (
    <div
      className={cn(
        "exam-a4-page relative aspect-[210/297] w-full overflow-hidden shadow-xl ring-1",
        visual.pageClass,
      )}
    >
      <div className={cn("relative flex h-full flex-col", compact ? "px-[34px] py-[30px]" : "px-[42px] py-[38px]", visual.innerClass)}>
        {pageIndex === 0 && (
          <header className={cn("shrink-0", compact ? "mb-4" : "mb-5", visual.headerClass)}>
            <div
              className={cn(
                "flex items-start justify-between gap-4 border-b pb-3",
                visual.headerLineClass,
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {academyLogoDataUrl && (
                  <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border", visual.logoFrameClass)}>
                    <NextImage
                      src={academyLogoDataUrl}
                      alt="학원 로고"
                      width={48}
                      height={48}
                      unoptimized
                      className="h-full w-full object-contain p-1"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {subtitle && (
                    <p className={cn("font-bold tracking-[0.18em]", compact ? "text-[8px]" : "text-[9px]", visual.subtitleClass)}>
                      <EditableText value={subtitle} onCommit={(next) => onHeaderChange({ subtitle: next })}>
                        {subtitle}
                      </EditableText>
                    </p>
                  )}
                  <h2 className={cn("mt-1 break-keep font-black tracking-tight", compact ? "text-[22px]" : "text-[28px]", visual.titleClass)}>
                    <EditableText value={title} onCommit={(next) => onHeaderChange({ title: next })} className="block">
                      {title}
                    </EditableText>
                  </h2>
                </div>
              </div>
              <div className={cn("w-[168px] shrink-0 space-y-1 text-[10px]", visual.infoClass)}>
                <div className="flex justify-between border-b pb-1">
                  <span>학교</span>
                  <span className="font-semibold">{schoolName || " "}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>반</span>
                  <span className="font-semibold">{className || " "}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>{studentNameLabel || "이름"}</span>
                  <span className="min-w-[64px]">&nbsp;</span>
                </div>
              </div>
            </div>
            <div className={cn("mt-2 flex items-center justify-between gap-3 text-[10px]", visual.instructionsClass)}>
              <p className="min-w-0 flex-1 truncate">
                <EditableText value={instructions} onCommit={(next) => onHeaderChange({ instructions: next })} className="block truncate">
                  {instructions}
                </EditableText>
              </p>
              <span className="shrink-0">{examDate || ""}</span>
            </div>
          </header>
        )}

        {pageIndex > 0 && (
          <header className={cn("mb-3 flex shrink-0 items-center justify-between border-b pb-2 text-[10px]", visual.continuedHeaderClass)}>
            <EditableText value={title} onCommit={(next) => onHeaderChange({ title: next })}>
              {title}
            </EditableText>
            <span>{pageIndex + 1} / {pageCount}</span>
          </header>
        )}

        <main
          className={cn(
            "grid min-h-0 flex-1",
            columns === 2 ? "grid-cols-2 gap-8" : "grid-cols-1",
            compact ? "text-[10.5px] leading-[1.46]" : "text-[11.5px] leading-[1.58]",
            visual.mainClass,
          )}
        >
          {pageColumns.map((columnFragments, columnIndex) => (
            <div key={columnIndex} className="min-h-0 space-y-4">
              {columnFragments.map((fragment) => (
                <div key={fragment.id} className="break-inside-avoid">
                  {fragment.includePassage && fragment.passageRenderedLines.length > 0 && (() => {
                    const isPassageStart = fragment.passageStartLineIndex === 0;
                    const endLineIndex = fragment.passageStartLineIndex + fragment.passageRenderedLines.length;
                    const isPassageEnd = endLineIndex >= fragment.passageTotalLines;
                    const renderedText = fragment.passageRenderedLines.join("\n");
                    const isSplit = !(isPassageStart && isPassageEnd);
                    return (
                      <div
                        className={cn(
                          "mb-3 break-inside-avoid",
                          passageStyle === "boxed" && "rounded border px-3 py-2",
                          passageStyle === "underlined" && "border-b border-t py-2",
                          passageStyle === "plain" && "py-1",
                          visual.passageClass,
                        )}
                      >
                        {showPassageTitle && fragment.passageTitle && isPassageStart && (
                          <p className={cn("mb-1 text-[10px] font-black uppercase tracking-wide", visual.passageTitleClass)}>
                            <EditableText
                              value={fragment.passageTitle}
                              onCommit={(next) => onUpdateGroupPassage(fragment.groupSourceId, { passageTitle: next })}
                            >
                              {fragment.passageTitle}
                            </EditableText>
                          </p>
                        )}
                        {!isPassageStart && (
                          <p className={cn("no-print mb-1 text-[9px] italic", visual.passageTitleClass)}>
                            (지문 계속)
                          </p>
                        )}
                        <p className={cn("whitespace-pre-line text-justify", visual.questionClass)}>
                          {isSplit ? (
                            <span className="block">{renderFormattedInline(renderedText)}</span>
                          ) : (
                            <EditableText
                              value={fragment.passageContent}
                              onCommit={(next) => onUpdateGroupPassage(fragment.groupSourceId, { passageContent: next })}
                              className="block"
                            >
                              {renderFormattedInline(renderedText)}
                            </EditableText>
                          )}
                        </p>
                        {isSplit && !isPassageEnd && (
                          <p className={cn("no-print mt-1 text-[9px] italic text-slate-400", visual.passageTitleClass)}>
                            (다음 칸으로 이어짐 →)
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="space-y-3">
                    {fragment.parts.map((part) => {
                      const item = part.source;
                      return (
                        <div
                          key={part.partKey}
                          data-paper-item-id={item.localId}
                          onClick={() => setActiveItemId(item.localId)}
                          onMouseDownCapture={() => setActiveItemId(item.localId)}
                          onFocusCapture={() => setActiveItemId(item.localId)}
                          style={{
                            breakBefore: part.isStart && item.breakBefore === "page" ? "page" : part.isStart && item.breakBefore === "column" ? "column" : undefined,
                            breakInside: item.keepWithPrev ? "avoid" : undefined,
                          }}
                          className={cn(
                            "group/paper-item relative break-inside-avoid rounded-md transition-colors",
                            visual.itemClass,
                            activeItemId === item.localId && "bg-blue-50/80 ring-2 ring-blue-300",
                            draggingItemId && draggingItemId !== item.localId && "hover:ring-2 hover:ring-blue-300 hover:ring-offset-2",
                            dragOverItemId === item.localId && "ring-2 ring-blue-300 ring-offset-2",
                            draggingItemId === item.localId && "opacity-55",
                            activeItemId === item.localId ? "px-2 py-1.5" : "py-0.5",
                          )}
                        >
                          {part.isStart && dragOverItemId === item.localId && (
                            <div
                              className={cn(
                                "no-print pointer-events-none absolute left-0 right-0 z-30 h-1 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.16)]",
                                dragPlacement === "before" ? "-top-2" : "-bottom-2",
                              )}
                            />
                          )}
                          {part.isStart && (
                            <div
                              className={cn(
                                "no-print pointer-events-none absolute -right-2 -top-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/paper-item:pointer-events-auto group-hover/paper-item:opacity-100 group-focus-within/paper-item:pointer-events-auto group-focus-within/paper-item:opacity-100",
                                activeItemId === item.localId && "pointer-events-auto opacity-100",
                              )}
                            >
                              <button
                                type="button"
                                onPointerDown={(event) => startPaperItemDrag(event, item.localId)}
                                className="flex h-6 w-6 touch-none cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing"
                                title="문항 드래그"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUpdateItem(item.localId, { points: Math.max(1, item.points - 1) });
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                title="배점 낮추기"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUpdateItem(item.localId, { points: item.points + 1 });
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                title="배점 올리기"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUpdateItem(item.localId, { includePassage: !item.includePassage });
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-50",
                                  item.includePassage ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
                                )}
                                title="지문 표시 전환"
                              >
                                <BookOpen className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggleKeepWithPrev(item.localId);
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-50",
                                  item.keepWithPrev ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
                                )}
                                title={
                                  item.keepWithPrev
                                    ? "한 덩어리로 유지 — 분할 안 함 (켜짐, 클릭 → 자연 흐름)"
                                    : "한 덩어리로 유지 — 다음 칸/페이지로 통째 이동 (클릭 → 켜짐)"
                                }
                              >
                                <ArrowDownToLine className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const next: BreakBefore = item.breakBefore === "column" ? "auto" : "column";
                                  onUpdateItem(item.localId, { breakBefore: next });
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-emerald-50",
                                  item.breakBefore === "column" ? "text-emerald-600" : "text-slate-400 hover:text-slate-700",
                                )}
                                title={
                                  item.breakBefore === "column"
                                    ? "다음 칸으로 강제 줄바꿈 (켜짐)"
                                    : "다음 칸으로 강제 줄바꿈"
                                }
                              >
                                <Columns2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const next: BreakBefore = item.breakBefore === "page" ? "auto" : "page";
                                  onUpdateItem(item.localId, { breakBefore: next });
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-50",
                                  item.breakBefore === "page" ? "text-blue-700" : "text-slate-400 hover:text-slate-700",
                                )}
                                title={
                                  item.breakBefore === "page"
                                    ? "다음 페이지로 강제 줄바꿈 (켜짐)"
                                    : "다음 페이지로 강제 줄바꿈"
                                }
                              >
                                <FileText className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUngroupItem(item.localId);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                title="현재 문항 묶음 해제"
                              >
                                <Ungroup className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRegroupByPassage();
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-blue-500 hover:bg-blue-50"
                                title="지문별 다시 묶기"
                              >
                                <Group className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemoveItem(item.localId);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
                                title="문항 삭제"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {part.showHeader && (
                            <>
                              <div className="mb-1 flex items-baseline gap-1.5">
                                <span className={cn("font-black", compact ? "text-[12px]" : "text-[13px]", visual.numberClass)}>
                                  {item.orderNum}.
                                </span>
                                {showQuestionMeta && (
                                  <span className={cn("text-[9px] font-semibold", visual.metaClass)}>
                                    [{item.points}점{item.sourceQuestion.subType ? ` · ${SUBTYPE_LABELS[item.sourceQuestion.subType] || item.sourceQuestion.subType}` : ""}]
                                  </span>
                                )}
                              </div>
                              <p className={cn("whitespace-pre-line font-semibold", visual.questionClass)}>
                                <EditableText
                                  value={item.questionText}
                                  onCommit={(next) => onUpdateItem(item.localId, { questionText: next })}
                                  className="block"
                                >
                                  {renderFormattedInline(item.questionText)}
                                </EditableText>
                              </p>
                            </>
                          )}
                          {part.isContinuation && part.options.length > 0 && (
                            <p className={cn("no-print mb-1 text-[9px] font-semibold italic", visual.metaClass)}>
                              ({item.orderNum}번 계속)
                            </p>
                          )}
                          {part.options.length > 0 && (
                            <div className={cn("space-y-1", part.showHeader ? "mt-1.5" : "mt-0", compact ? "text-[10px]" : "text-[11px]")}>
                              {part.options.map(({ option, originalIndex }) => (
                                <div key={`${item.localId}-${originalIndex}`} className={cn("flex items-start gap-1.5", visual.optionRowClass)}>
                                  <span className={cn("min-w-[18px] font-bold", visual.optionNumberClass)}>{originalIndex + 1}.</span>
                                  <EditableText
                                    value={option.text}
                                    onCommit={(nextText) => {
                                      const nextOptions = [...item.options];
                                      nextOptions[originalIndex] = { ...nextOptions[originalIndex], text: nextText };
                                      onUpdateItem(item.localId, { options: nextOptions });
                                    }}
                                    className="flex-1"
                                  >
                                    {renderFormattedInline(option.text)}
                                  </EditableText>
                                </div>
                              ))}
                            </div>
                          )}
                          {part.showAnswer && showAnswerSpace && item.answerSpaceLines > 0 && (
                            <div className="mt-2 space-y-2">
                              {Array.from({ length: item.answerSpaceLines }).map((_, index) => (
                                <div key={index} className={cn("h-[12px] border-b", visual.answerLineClass)} />
                              ))}
                            </div>
                          )}
                          {part.showHeader && template === "worksheet" && item.teacherNote && (
                            <p className={cn("mt-2 rounded px-2 py-1 text-[9px] font-semibold", visual.teacherNoteClass)}>
                              교사용 메모: {item.teacherNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </main>

        <footer className={cn("mt-3 shrink-0 text-center text-[10px]", visual.footerClass)}>
          - {pageIndex + 1} / {pageCount} -
        </footer>
      </div>
    </div>
  );
}
