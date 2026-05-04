// ============================================================================
// Block type system — granular classification for every extracted text block.
// Paired with prisma ExtractionItem.blockType column and used by the review UI
// to colour-code, filter, and promote blocks into first-class entities
// (Passage, Question, QuestionExplanation, SourceMaterial).
// ============================================================================

export type BlockType =
  | "PASSAGE_BODY"
  | "QUESTION_STEM"
  | "CHOICE"
  | "EXPLANATION"
  | "EXAM_META"
  | "HEADER"
  | "FOOTER"
  | "DIAGRAM"
  | "NOISE";

export type BlockTypeColor = "sky" | "slate" | "rose" | "emerald" | "gray";
export type BlockBorderStyle = "solid" | "dashed" | "dotted";
export type BlockPromotionTarget =
  | "Passage"
  | "Question"
  | "QuestionExplanation"
  | "SourceMaterial"
  | null;

export interface BlockTypeConfig {
  id: BlockType;
  /** 한국어 정식 명칭 (리뷰 UI 라벨) */
  label: string;
  /** 1~2자 배지 (블록 카드 위 미니 배지) */
  shortLabel: string;
  /** Tailwind 팔레트 — 화이트/스카이블루 테마 준수, 오렌지·앰버·퍼플 금지 */
  color: BlockTypeColor;
  /** 블록 테두리 선 스타일 */
  borderStyle: BlockBorderStyle;
  /** 키보드 단축키 (리뷰 단계에서 빠른 타입 변경용) */
  keyboardShortcut: string;
  /** 강사 1초 이해용 설명 */
  description: string;
  /** 이 블록이 "확정(promote)"되면 어떤 엔티티가 될 수 있는지 */
  promotableTo: BlockPromotionTarget[];
}

export const BLOCK_TYPES: Record<BlockType, BlockTypeConfig> = {
  PASSAGE_BODY: {
    id: "PASSAGE_BODY",
    label: "지문",
    shortLabel: "지문",
    color: "sky",
    borderStyle: "solid",
    keyboardShortcut: "1",
    description: "지문 본문(영문/국문). 문제 번호·선지는 포함하지 않는다.",
    promotableTo: ["Passage"],
  },
  QUESTION_STEM: {
    id: "QUESTION_STEM",
    label: "문제",
    shortLabel: "문제",
    color: "slate",
    borderStyle: "solid",
    keyboardShortcut: "2",
    description: "문제 지시문과 질문 본문. 예: “다음 글의 주제로 가장 적절한 것은?”",
    promotableTo: ["Question"],
  },
  CHOICE: {
    id: "CHOICE",
    label: "선지",
    shortLabel: "선지",
    color: "slate",
    borderStyle: "dotted",
    keyboardShortcut: "3",
    description: "① ~ ⑤ 선택지. 부모 문제(QUESTION_STEM)에 매달린다.",
    promotableTo: ["Question"],
  },
  EXPLANATION: {
    id: "EXPLANATION",
    label: "해설",
    shortLabel: "해설",
    color: "emerald",
    borderStyle: "solid",
    keyboardShortcut: "4",
    description: "문제 풀이 해설 본문. 기존 Question에 붙이거나 새 문제와 함께 저장.",
    promotableTo: ["QuestionExplanation"],
  },
  EXAM_META: {
    id: "EXAM_META",
    label: "메타",
    shortLabel: "메타",
    color: "slate",
    borderStyle: "dashed",
    keyboardShortcut: "5",
    description: "시험지 헤더(과목·학년·회차·시행년도 등). SourceMaterial 필드로 승격.",
    promotableTo: ["SourceMaterial"],
  },
  HEADER: {
    id: "HEADER",
    label: "머리말",
    shortLabel: "머리",
    color: "gray",
    borderStyle: "dashed",
    keyboardShortcut: "6",
    description: "페이지 상단 반복 헤더. 저장 대상 아님.",
    promotableTo: [null],
  },
  FOOTER: {
    id: "FOOTER",
    label: "꼬리말",
    shortLabel: "꼬리",
    color: "gray",
    borderStyle: "dashed",
    keyboardShortcut: "7",
    description: "페이지 하단 반복 푸터(저작권, 쪽수 등). 저장 대상 아님.",
    promotableTo: [null],
  },
  DIAGRAM: {
    id: "DIAGRAM",
    label: "도표",
    shortLabel: "도표",
    color: "sky",
    borderStyle: "dotted",
    keyboardShortcut: "8",
    description: "표·도표·그림 캡션. 현재는 텍스트 블록으로만 보존.",
    promotableTo: [null],
  },
  NOISE: {
    id: "NOISE",
    label: "무시",
    shortLabel: "무시",
    color: "gray",
    borderStyle: "dotted",
    keyboardShortcut: "0",
    description: "낙서·광고·필기·여백 등 저장하지 않을 블록.",
    promotableTo: [null],
  },
};

export const BLOCK_TYPE_LIST: BlockTypeConfig[] = [
  BLOCK_TYPES.PASSAGE_BODY,
  BLOCK_TYPES.QUESTION_STEM,
  BLOCK_TYPES.CHOICE,
  BLOCK_TYPES.EXPLANATION,
  BLOCK_TYPES.EXAM_META,
  BLOCK_TYPES.HEADER,
  BLOCK_TYPES.FOOTER,
  BLOCK_TYPES.DIAGRAM,
  BLOCK_TYPES.NOISE,
];

export function getBlockTypeConfig(type: BlockType): BlockTypeConfig {
  return BLOCK_TYPES[type];
}

export function getBlockTypeByShortcut(key: string): BlockType | null {
  const normalised = key.trim();
  const match = BLOCK_TYPE_LIST.find((cfg) => cfg.keyboardShortcut === normalised);
  return match ? match.id : null;
}

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && value in BLOCK_TYPES;
}

// ────────────────────────────────────────────────────────────────────────────
// Tailwind class helpers — one place to change the colour system.
// We intentionally return *full literal* class strings (not template concat)
// because Tailwind JIT scans source for literals at build time.
// ────────────────────────────────────────────────────────────────────────────

export interface BlockTypeClasses {
  /** 블록 테두리 고리 class (outline or ring) */
  ring: string;
  /** 블록 배경 class */
  bg: string;
  /** 라벨 텍스트 class */
  text: string;
  /** Badge 조합 class (배경 + 텍스트 + 테두리 포함) */
  badge: string;
}

const CLASS_MAP: Record<BlockType, BlockTypeClasses> = {
  PASSAGE_BODY: {
    ring: "ring-2 ring-sky-400 ring-offset-1 ring-offset-white",
    bg: "bg-sky-50/70",
    text: "text-sky-900",
    badge: "bg-sky-100 text-sky-800 border border-sky-200",
  },
  QUESTION_STEM: {
    ring: "ring-2 ring-slate-600 ring-offset-1 ring-offset-white",
    bg: "bg-slate-50",
    text: "text-slate-900",
    badge: "bg-slate-100 text-slate-800 border border-slate-300",
  },
  CHOICE: {
    ring: "ring-1 ring-slate-400 ring-offset-1 ring-offset-white border border-dotted border-slate-400",
    bg: "bg-white",
    text: "text-slate-700",
    badge: "bg-slate-50 text-slate-600 border border-dotted border-slate-400",
  },
  EXPLANATION: {
    ring: "ring-2 ring-emerald-500 ring-offset-1 ring-offset-white",
    bg: "bg-emerald-50/70",
    text: "text-emerald-900",
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  },
  EXAM_META: {
    ring: "ring-1 ring-slate-500 ring-offset-1 ring-offset-white border border-dashed border-slate-500",
    bg: "bg-slate-50/50",
    text: "text-slate-700",
    badge: "bg-slate-100 text-slate-700 border border-dashed border-slate-500",
  },
  HEADER: {
    ring: "ring-1 ring-gray-300 ring-offset-1 ring-offset-white border border-dashed border-gray-300",
    bg: "bg-gray-50",
    text: "text-gray-500",
    badge: "bg-gray-100 text-gray-600 border border-dashed border-gray-300",
  },
  FOOTER: {
    ring: "ring-1 ring-gray-300 ring-offset-1 ring-offset-white border border-dashed border-gray-300",
    bg: "bg-gray-50",
    text: "text-gray-500",
    badge: "bg-gray-100 text-gray-600 border border-dashed border-gray-300",
  },
  DIAGRAM: {
    ring: "ring-1 ring-sky-300 ring-offset-1 ring-offset-white border border-dotted border-sky-300",
    bg: "bg-sky-50/40",
    text: "text-sky-800",
    badge: "bg-sky-50 text-sky-700 border border-dotted border-sky-300",
  },
  NOISE: {
    ring: "ring-1 ring-gray-200 ring-offset-1 ring-offset-white border border-dotted border-gray-300",
    bg: "bg-gray-50/60",
    text: "text-gray-400",
    badge: "bg-gray-50 text-gray-500 border border-dotted border-gray-300",
  },
};

export function blockTypeClasses(type: BlockType): BlockTypeClasses {
  return CLASS_MAP[type];
}
