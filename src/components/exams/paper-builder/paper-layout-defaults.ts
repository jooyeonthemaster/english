// ============================================================================
// paper-layout-defaults — 저장된 시험지 설정 → 레이아웃·머리글 값(기본값 포함)의 단일 정본
// (26-09-30 CORE-MODEL). 기본값은 웹 상세 미리보기(exam-detail-paper-preview)와 같다:
//   columns 2 · A4 · comfortable · 답란 표시 · 지문 제목 숨김 · 문항 메타([n점·유형]) 숨김 ·
//   쪽당 N문제 끔 · 안내문 DEFAULT_INSTRUCTIONS · 표지 normalizePaperCover.
// HWPX(`showQuestionMeta !== false`)·DOCX(`=== true`)가 제각각이던 기본값을 이것으로 맞춘다(docs/EXAM-PAPER-MODEL.md §8).
// JSX·window 의존 없음 — 서버 라우트에서 그대로 import 한다.
// ============================================================================
import { DEFAULT_INSTRUCTIONS, DEFAULT_SHOW_PASSAGE_TITLE } from "./constants";
import { normalizePaperCover } from "./saved-template-settings";
import type {
  Density,
  PaperCover,
  PaperSize,
  PaperTemplate,
  PassageStyle,
} from "./types";

const PAPER_TEMPLATES: readonly PaperTemplate[] = [
  "clean",
  "mock",
  "worksheet",
  "minimal",
  "academy",
  "modern",
  "classic",
  "colorband",
];

export function asPaperTemplate(value: unknown): PaperTemplate {
  return PAPER_TEMPLATES.includes(value as PaperTemplate) ? (value as PaperTemplate) : "clean";
}

export function asPaperSize(value: unknown): PaperSize {
  return value === "B4" ? "B4" : "A4";
}

export function asDensity(value: unknown): Density {
  return value === "compact" ? "compact" : "comfortable";
}

/** 지문 스타일은 현재 "plain" 하나로 고정돼 있다(저장값 무시 — 웹 현행). */
export function asPassageStyle(value: unknown): PassageStyle {
  void value;
  return "plain";
}

/** resolvePaperLayout 이 읽는 저장 설정의 최소 모양(웹 SavedPaperSettings·서버 BuilderSettings 모두 수용). */
export type PaperLayoutSettingsLike = {
  template?: unknown;
  layout?: {
    columns?: unknown;
    paperSize?: unknown;
    density?: unknown;
    forceTwoPerPage?: unknown;
    showAnswerSpace?: unknown;
    showPassageTitle?: unknown;
    showQuestionMeta?: unknown;
    passageStyle?: unknown;
  } | null;
  header?: {
    subtitle?: unknown;
    studentNameLabel?: unknown;
    instructions?: unknown;
    academyLogoDataUrl?: unknown;
    schoolName?: unknown;
    className?: unknown;
  } | null;
  cover?: unknown;
};

export type ResolvedPaperLayout = {
  template: PaperTemplate;
  paperSize: PaperSize;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  forceTwoPerPage: boolean;
  header: {
    subtitle: string;
    /** 비어 있으면 DEFAULT_INSTRUCTIONS(웹 1쪽 머리 안내문). */
    instructions: string;
    studentNameLabel: string;
    academyLogoDataUrl: string | null;
    schoolName: string;
    className: string;
  };
  /** 웹 표지 모델(enabled 일 때만 표지). HWPX 는 표지를 항상 그린다(E36 사용자 확정 — 별도 모델). */
  cover: PaperCover;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

/**
 * 저장 설정(NULL 포함) → 레이아웃·머리글. 웹 상세의 인라인 판정과 같은 결과를 낸다:
 *   showAnswerSpace `?? true`, showPassageTitle `?? DEFAULT_SHOW_PASSAGE_TITLE`, showQuestionMeta `?? false`,
 *   columns `=== 1 ? 1 : 2`, instructions `|| DEFAULT_INSTRUCTIONS`, studentNameLabel `|| "이름"`.
 * (웹은 `??` 라 저장값이 boolean 이 아닌 truthy 값이면 그대로 썼다 — 여기서는 boolean 만 인정한다.
 *  빌더 저장본은 항상 boolean 이라 운영 데이터에서 차이는 없다.)
 */
export function resolvePaperLayout(settings: PaperLayoutSettingsLike | null | undefined): ResolvedPaperLayout {
  const layout = settings?.layout ?? {};
  const header = settings?.header ?? {};
  return {
    template: asPaperTemplate(settings?.template),
    paperSize: asPaperSize(layout.paperSize),
    columns: layout.columns === 1 ? 1 : 2,
    density: asDensity(layout.density),
    passageStyle: asPassageStyle(layout.passageStyle),
    showAnswerSpace: bool(layout.showAnswerSpace, true),
    showPassageTitle: bool(layout.showPassageTitle, DEFAULT_SHOW_PASSAGE_TITLE),
    showQuestionMeta: bool(layout.showQuestionMeta, false),
    forceTwoPerPage: layout.forceTwoPerPage === true,
    header: {
      subtitle: str(header.subtitle),
      instructions: str(header.instructions) || DEFAULT_INSTRUCTIONS,
      studentNameLabel: str(header.studentNameLabel) || "이름",
      academyLogoDataUrl: str(header.academyLogoDataUrl) || null,
      schoolName: str(header.schoolName),
      className: str(header.className),
    },
    cover: normalizePaperCover(settings?.cover),
  };
}
