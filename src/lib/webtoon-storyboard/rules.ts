// ============================================================================
// Storyboard rules — panel count, per-language text contract, length budgets.
// ----------------------------------------------------------------------------
// Everything here is deterministic and shared by the storyboard prompt (what we
// ask for) and the validator (what we accept). Budgets come from the 26-07-20
// harness lesson: legibility on a phone collapses when a panel carries more than
// ~2 short lines, so every string is capped and counted in *visible* characters.
// ============================================================================

import type { PanelSize } from "./types";

/** Output-language modes (mirrors WebtoonLanguageId; kept as string to stay client-safe). */
export type StoryboardLanguage = "KO" | "KO_KEY" | "KO_EN" | "EN" | "EN_KO_GLOSS";

export function normalizeStoryboardLanguage(
  language: string | null | undefined,
  isKoreanSubject: boolean,
): StoryboardLanguage {
  // Korean passages have no English source text → always Korean lettering.
  if (isKoreanSubject) return "KO";
  switch (language) {
    case "KO_KEY":
    case "KO_EN":
    case "EN":
    case "EN_KO_GLOSS":
      return language;
    default:
      return "KO";
  }
}

/** Word count of an English-ish passage (whitespace tokens). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Target panel count from passage length. One 9:16 page stays legible up to 8
 * panels; short passages get fewer, larger panels.
 */
export function targetPanelCount(passageContent: string, isKoreanSubject: boolean): number {
  const size = isKoreanSubject
    ? // Korean: ~2.2 visible chars per English-word equivalent
      Math.round(passageContent.replace(/\s+/g, "").length / 2.2)
    : countWords(passageContent);
  if (size < 110) return 5;
  if (size < 200) return 6;
  if (size < 300) return 7;
  return 8;
}

export const MIN_PANELS = 4;
export const MAX_PANELS = 8;

/** Visible length: counts every non-whitespace char (Hangul, Latin, digits, punctuation). */
export function visibleLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Caption budget length. KO_KEY captions mix Hangul with inserted English, and a Latin
 * letter prints at roughly half a Hangul syllable's width — counting it as 1 would make
 * a single key phrase ("perceptual disposition", 21 letters) eat most of a half-panel
 * budget. KO_KEY counts Latin letters at 0.55; every other mode uses visibleLength.
 */
export function captionLength(text: string, language: StoryboardLanguage): number {
  if (language !== "KO_KEY") return visibleLength(text);
  const compact = text.replace(/\s+/g, "");
  const latin = (compact.match(/[A-Za-z]/g) ?? []).length;
  return Math.ceil(compact.length - latin + latin * 0.55);
}

/** Latin word count within a string (for English bubbles). */
export function latinWordCount(text: string): number {
  return (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length;
}

export interface TextBudget {
  /** Max visible chars for a caption on a full-width (wide/large) panel. */
  captionFull: number;
  /** Max visible chars for a caption on a half panel. */
  captionHalf: number;
  /** Max visible chars for a bubble text. */
  bubble: number;
  /** Max English words for a bubble (English modes). */
  bubbleWords: number;
  /** Max visible chars for the KO_EN Korean subtitle under a bubble. */
  translation: number;
  /** Max visible chars across the whole page (captions + bubbles + translations). */
  page: number;
}

export const TEXT_BUDGETS: Record<StoryboardLanguage, TextBudget> = {
  KO: { captionFull: 34, captionHalf: 22, bubble: 16, bubbleWords: 0, translation: 0, page: 300 },
  KO_KEY: { captionFull: 40, captionHalf: 26, bubble: 18, bubbleWords: 0, translation: 0, page: 320 },
  KO_EN: { captionFull: 30, captionHalf: 20, bubble: 40, bubbleWords: 8, translation: 16, page: 360 },
  EN: { captionFull: 70, captionHalf: 45, bubble: 44, bubbleWords: 9, translation: 0, page: 520 },
  EN_KO_GLOSS: { captionFull: 32, captionHalf: 20, bubble: 44, bubbleWords: 9, translation: 0, page: 380 },
};

export function captionBudget(language: StoryboardLanguage, size: PanelSize): number {
  const b = TEXT_BUDGETS[language];
  return size === "half" ? b.captionHalf : b.captionFull;
}

/**
 * Per-mode lettering contract, phrased for the storyboard writer (Korean prompt).
 * The validator enforces the numeric parts; the prose parts steer the writer.
 */
export const LANGUAGE_CONTRACT: Record<StoryboardLanguage, string> = {
  KO: [
    "- caption·bubbles.text 는 모두 자연스러운 한국어. 영어 단어는 고유명사가 아니면 쓰지 않는다.",
    "- bubbles.translation 은 항상 빈 문자열.",
  ].join("\n"),
  KO_KEY: [
    "- caption 은 한국어 서술에 지문의 핵심 영어 표현 1개를 그대로 끼워 넣는 코드스위칭 문장이다.",
    "- 끼워 넣는 영어는 지문에 글자 그대로 있는 표현이어야 한다(바꿔 쓰기·새로 만들기 금지).",
    "- 영어는 **명사구**(뒤에 은/는/이/가/을/를/의/에/로 가 붙는 덩어리)나 **전치사구·부사구**(뒤에 로/처럼 이 붙는 덩어리)만 쓴다.",
    "  영어 동사·형용사 뒤에 '-하게/-한다/-하다/-해서/-된다' 를 붙이는 혼종 문장은 금지다.",
    '  좋은 예) "모인 책은 children and teenagers를 위한 reading programs에 쓰인다."',
    '  좋은 예) "겁쟁이의 perceptual disposition은 두려움에 물들어 있다."',
    '  좋은 예) "감정이 커질수록 세상은 in a distorted way로 보인다."',
    '  나쁜 예) "감정은 see the world in a distorted way하게 한다."  (영어 동사구 + 하게)',
    '  나쁜 예) "more biased one\'s perception이 된다."  (문법이 깨진 조각)',
    "- 관계절 조각·주어-동사 토막처럼 문법적으로 온전하지 않은 덩어리는 쓰지 않는다.",
    "- bubbles.text 는 한국어(짧은 영어 감탄·핵심어 1개까지 허용). bubbles.translation 은 빈 문자열.",
  ].join("\n"),
  KO_EN: [
    "- bubbles.text 는 영어 대사(지문 원문에서 가져오거나 지문 어휘로 만든 짧은 문장, 8단어 이하).",
    "- bubbles.translation 은 그 대사의 자연스러운 한국어 번역(16자 이하).",
    "- caption 은 한국어 서술.",
  ].join("\n"),
  EN: [
    "- caption·bubbles.text 모두 영어. 지문의 표현과 어휘를 최대한 살린다. 한국어 금지.",
    "- bubbles.translation 은 항상 빈 문자열.",
  ].join("\n"),
  EN_KO_GLOSS: [
    "- bubbles.text 는 영어 대사(9단어 이하), caption 은 장면을 설명하는 한국어 서술.",
    "- bubbles.translation 은 항상 빈 문자열.",
  ].join("\n"),
};

/** Human description of the output language (Korean), for prompts and logs. */
export const LANGUAGE_NAME: Record<StoryboardLanguage, string> = {
  KO: "한국어 전용",
  KO_KEY: "한국어 + 핵심 영어 표현",
  KO_EN: "영어 대사 + 한국어 번역 병기",
  EN: "영어 전용",
  EN_KO_GLOSS: "대사 영어 + 설명 한국어",
};
