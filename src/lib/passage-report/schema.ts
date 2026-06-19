import { z } from "zod";

/**
 * A4 자유 편집 학습자료 — 데이터 스키마.
 *
 * 핵심 규칙:
 *   - 모든 좌표/크기는 mm 단위 (저장). 렌더 시 units.ts 의 mmToPx 로 변환.
 *   - 색은 #RRGGBB hex 만 허용 (디자인 토큰화).
 *   - Tiptap 본문은 doc 노드의 JSON 그대로. 저장 직전 sanitize 게이트로 화이트리스트 검증 권장.
 *   - 블록은 discriminated union — kind 필드로 분기.
 */

// ───────────────────────────────────────────────────────────────
// 공통 토큰
// ───────────────────────────────────────────────────────────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB hex 색상이어야 합니다");

const tiptapDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const blockKindSchema = z.enum([
  "header",
  "passage-body",
  "vocab-grid",
  "grammar-card",
  "syntax-breakdown",
  "question",
  "summary-callout",
  "analysis-box",
  "glossary-table",
  "divider",
]);
export type BlockKind = z.infer<typeof blockKindSchema>;

export const blockStyleSchema = z.object({
  fontFamily: z.string().max(80).optional(),
  fontSize: z.number().min(6).max(48).optional(), // pt
  fontWeight: z.number().int().min(100).max(900).optional(),
  color: hexColor.optional(),
  backgroundColor: hexColor.optional(),
  borderColor: hexColor.optional(),
  borderWidth: z.number().min(0).max(8).optional(),
  borderRadius: z.number().min(0).max(40).optional(),
  paddingMm: z.number().min(0).max(20).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  shadow: z.enum(["none", "soft", "elevated"]).optional(),
});
export type BlockStyle = z.infer<typeof blockStyleSchema>;

const blockBaseFields = {
  id: z.string().min(1),
  // mm 단위 좌표/크기. 페이지 바깥 약간 허용 (-50 ~ +50mm).
  x: z.number().min(-50).max(260),
  y: z.number().min(-50).max(360),
  w: z.number().min(5).max(220),
  h: z.number().min(3).max(310),
  rotation: z.number().min(-180).max(180),
  zIndex: z.number().int(),
  locked: z.boolean(),
  style: blockStyleSchema.optional(),
};

// ───────────────────────────────────────────────────────────────
// 블록별 data 스키마
// ───────────────────────────────────────────────────────────────

export const headerBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("header"),
  data: z.object({
    title: tiptapDocSchema,
    subtitle: tiptapDocSchema.optional(),
    badge: z.string().max(40).optional(), // "1학기 중간 대비"
    accentColor: hexColor.optional(),
  }),
});

export const passageBodyBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("passage-body"),
  data: z.object({
    sentences: z.array(
      z.object({
        index: z.number().int().min(0),
        english: z.string(),
        korean: z.string().optional(),
        annotations: z
          .array(
            z.object({
              from: z.number().int().min(0),
              to: z.number().int().min(0),
              kind: z.enum(["vocab", "grammar", "syntax", "exam"]),
              memo: z.string().max(280).optional(),
            }),
          )
          .default([]),
      }),
    ),
    showKorean: z.boolean().default(true),
    numbering: z.enum(["none", "decimal", "circled"]).default("decimal"),
    lineSpacing: z.number().min(1).max(2).default(1.5),
  }),
});

export const vocabGridBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("vocab-grid"),
  data: z.object({
    columns: z.number().int().min(1).max(4).default(2),
    items: z
      .array(
        z.object({
          id: z.string(),
          word: z.string(),
          partOfSpeech: z.string().max(30).optional(),
          meaning: z.string(),
          example: z.string().optional(),
          pronunciation: z.string().optional(),
          highlight: z.boolean().default(false),
        }),
      )
      .min(1),
    showExample: z.boolean().default(true),
    showPronunciation: z.boolean().default(false),
  }),
});

export const grammarCardBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("grammar-card"),
  data: z.object({
    pattern: z.string(),
    explanation: tiptapDocSchema,
    examples: z.array(z.string()).max(5).default([]),
    level: z.enum(["basic", "intermediate", "advanced"]).default("intermediate"),
    accentColor: hexColor.optional(),
  }),
});

export const syntaxBreakdownBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("syntax-breakdown"),
  data: z.object({
    sentence: z.string(),
    sentenceIndex: z.number().int().min(0).optional(),
    chunks: z
      .array(
        z.object({
          text: z.string(),
          role: z.string(), // "S" | "V" | "O" | "전치사구" 등
          color: hexColor.optional(),
        }),
      )
      .default([]),
    notes: tiptapDocSchema.optional(),
  }),
});

export const questionBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("question"),
  data: z.object({
    questionType: z.string(), // Question.type 호환
    stem: tiptapDocSchema,
    choices: z
      .array(
        z.object({
          label: z.string(), // "①", "②" 등
          text: z.string(),
        }),
      )
      .optional(),
    showAnswer: z.boolean().default(false),
    answerText: z.string().optional(),
    explanation: tiptapDocSchema.optional(),
  }),
});

export const summaryCalloutBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("summary-callout"),
  data: z.object({
    body: tiptapDocSchema,
    icon: z.enum(["lightbulb", "warning", "check", "star", "none"]).default("none"),
    variant: z.enum(["soft", "outlined", "filled"]).default("soft"),
    title: z.string().max(60).optional(),
  }),
});

export const analysisBoxBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("analysis-box"),
  data: z.object({
    title: z.string().max(60).optional(),
    body: tiptapDocSchema,
  }),
});

export const glossaryTableBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("glossary-table"),
  data: z.object({
    headers: z.array(z.string()).min(2).max(5),
    rows: z.array(z.array(z.string())).min(1),
    striped: z.boolean().default(true),
  }),
});

export const dividerBlockSchema = z.object({
  ...blockBaseFields,
  kind: z.literal("divider"),
  data: z.object({
    variant: z.enum(["line", "dashed", "dotted", "double"]).default("line"),
    color: hexColor.optional(),
    label: z.string().max(40).optional(),
  }),
});

export const blockSchema = z.discriminatedUnion("kind", [
  headerBlockSchema,
  passageBodyBlockSchema,
  vocabGridBlockSchema,
  grammarCardBlockSchema,
  syntaxBreakdownBlockSchema,
  questionBlockSchema,
  summaryCalloutBlockSchema,
  analysisBoxBlockSchema,
  glossaryTableBlockSchema,
  dividerBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;

// 개별 타입 export — 컴포넌트 props 타입에 유용
export type HeaderBlock = z.infer<typeof headerBlockSchema>;
export type PassageBodyBlock = z.infer<typeof passageBodyBlockSchema>;
export type VocabGridBlock = z.infer<typeof vocabGridBlockSchema>;
export type GrammarCardBlock = z.infer<typeof grammarCardBlockSchema>;
export type SyntaxBreakdownBlock = z.infer<typeof syntaxBreakdownBlockSchema>;
export type QuestionBlock = z.infer<typeof questionBlockSchema>;
export type SummaryCalloutBlock = z.infer<typeof summaryCalloutBlockSchema>;
export type AnalysisBoxBlock = z.infer<typeof analysisBoxBlockSchema>;
export type GlossaryTableBlock = z.infer<typeof glossaryTableBlockSchema>;
export type DividerBlock = z.infer<typeof dividerBlockSchema>;

// ───────────────────────────────────────────────────────────────
// Page / Theme / Document
// ───────────────────────────────────────────────────────────────

export const pageMarginSchema = z.object({
  top: z.number().min(0).max(40),
  right: z.number().min(0).max(40),
  bottom: z.number().min(0).max(40),
  left: z.number().min(0).max(40),
});
export type PageMargin = z.infer<typeof pageMarginSchema>;

export const pageBackgroundSchema = z.object({
  color: hexColor,
  pattern: z.enum(["none", "grid", "dots", "lines"]),
  patternColor: hexColor.optional(),
});
export type PageBackground = z.infer<typeof pageBackgroundSchema>;

export const pageSchema = z.object({
  id: z.string(),
  pageNumber: z.number().int().min(1),
  size: z.enum(["A4"]),
  orientation: z.enum(["portrait", "landscape"]),
  margin: pageMarginSchema,
  background: pageBackgroundSchema,
  showHeader: z.boolean(),
  showFooter: z.boolean(),
  blocks: z.array(blockSchema),
});
export type Page = z.infer<typeof pageSchema>;

export const reportThemeSchema = z.object({
  paletteName: z.string(),
  primary: hexColor,
  accent: hexColor,
  surface: hexColor,
  textOnSurface: hexColor,
  muted: hexColor,
  fontFamily: z.string(),
  fontScale: z.number().min(0.85).max(1.2),
});
export type ReportTheme = z.infer<typeof reportThemeSchema>;

export const reportDocumentSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  theme: reportThemeSchema,
  pages: z.array(pageSchema).min(1).max(20),
});
export type ReportDocument = z.infer<typeof reportDocumentSchema>;

/** 디폴트 페이지 마진 */
export const DEFAULT_PAGE_MARGIN: PageMargin = { top: 10, right: 8, bottom: 8, left: 8 };

/** 디폴트 페이지 배경 */
export const DEFAULT_PAGE_BACKGROUND: PageBackground = { color: "#FFFFFF", pattern: "none" };

/** 디폴트 테마 */
export const DEFAULT_REPORT_THEME: ReportTheme = {
  paletteName: "nara-default",
  primary: "#3B82F6",
  accent: "#10B981",
  surface: "#F8FAFC",
  textOnSurface: "#0F172A",
  muted: "#64748B",
  fontFamily: '"Paperlogy", "Pretendard", sans-serif',
  fontScale: 1,
};

// ───────────────────────────────────────────────────────────────
// 템플릿 메타 — 5종 디자인 스타일
// ───────────────────────────────────────────────────────────────

export const templateIdSchema = z.enum([
  "modern",
  "classic",
  "magazine",
  "notebook",
  "exam-sheet",
]);
export type TemplateId = z.infer<typeof templateIdSchema>;

// ───────────────────────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────────────────────

/** 비어있는 Tiptap 문서 — 새 텍스트 블록 초기값. */
export function emptyTiptapDoc(text = ""): { type: "doc"; content: unknown[] } {
  if (!text) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

/** Tiptap doc 안에서 plain text 만 뽑기 (라인 기준). PDF 출력 fallback 등에 사용. */
export function extractPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const walk = (node: unknown, parts: string[]): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: unknown; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child, parts);
    }
  };
  const parts: string[] = [];
  walk(doc, parts);
  return parts.join(" ");
}
