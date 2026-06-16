// Free (OFL / Apache-2.0, commercially usable) Google Fonts catalog for the webtoon text
// editor — Korean + Latin, with a comic/handwriting emphasis suited to speech bubbles.
// Loaded on demand via the Google Fonts CSS2 API; the picker previews each in its own face.

import { WEBTOON_TEXT_FONT_FAMILY } from "./types";

export type WebtoonFontLang = "ko" | "latin";
export type WebtoonFontCategory =
  | "sans"
  | "serif"
  | "handwriting"
  | "display"
  | "comic"
  | "monospace";

export interface WebtoonFont {
  family: string; // exact family name (Google Fonts name, or our chosen name for local faces)
  lang: WebtoonFontLang;
  category: WebtoonFontCategory;
  weights: number[];
  vibe: string;
  /**
   * Self-hosted font: URL under /public to a font file (ttf/otf). When set, the loader
   * injects an @font-face rule pointing here instead of fetching from Google Fonts.
   */
  src?: string;
  /** True for the user's own uploaded fonts — pinned to the very top of the Korean list. */
  local?: boolean;
}

export const WEBTOON_FONTS: WebtoonFont[] = [
  // ─────────── 내 폰트 (self-hosted, pinned first) ───────────
  { family: "그리운 체리 한스푼", lang: "ko", category: "handwriting", weights: [400], vibe: "또박또박 손글씨", src: "/fonts/webtoon/griun-cherry-1-spoon.ttf", local: true },
  { family: "그리운 규원체", lang: "ko", category: "handwriting", weights: [400], vibe: "정갈한 펜 손글씨", src: "/fonts/webtoon/griun-gyuwon.ttf", local: true },
  { family: "Ok단단체", lang: "ko", category: "display", weights: [400, 700], vibe: "단단한 굵은 제목체", src: "/fonts/webtoon/okdandan-bold.ttf", local: true },

  // ─────────── Korean ───────────
  // sans
  { family: "Pretendard", lang: "ko", category: "sans", weights: [400, 700], vibe: "기본 · 깔끔한 고딕" },
  { family: "Noto Sans KR", lang: "ko", category: "sans", weights: [400, 700], vibe: "표준 본문 고딕" },
  { family: "Nanum Gothic", lang: "ko", category: "sans", weights: [400, 700], vibe: "친근한 중립 고딕" },
  { family: "Gothic A1", lang: "ko", category: "sans", weights: [400, 700], vibe: "다재다능 고딕" },
  { family: "IBM Plex Sans KR", lang: "ko", category: "sans", weights: [400, 700], vibe: "테크니컬 고딕" },
  { family: "Sunflower", lang: "ko", category: "sans", weights: [300, 500], vibe: "가볍고 산뜻" },
  { family: "Gowun Dodum", lang: "ko", category: "sans", weights: [400], vibe: "부드러운 휴머니스트" },
  { family: "Stylish", lang: "ko", category: "sans", weights: [400], vibe: "얇고 미니멀" },
  // serif
  { family: "Noto Serif KR", lang: "ko", category: "serif", weights: [400, 700], vibe: "단정한 명조" },
  { family: "Nanum Myeongjo", lang: "ko", category: "serif", weights: [400, 700], vibe: "클래식 명조" },
  { family: "Song Myung", lang: "ko", category: "serif", weights: [400], vibe: "슬림 명조" },
  { family: "Gowun Batang", lang: "ko", category: "serif", weights: [400, 700], vibe: "따뜻한 바탕" },
  { family: "Hahmlet", lang: "ko", category: "serif", weights: [400, 700], vibe: "묵직한 현대 세리프" },
  { family: "Diphylleia", lang: "ko", category: "serif", weights: [400], vibe: "섬세한 붓 세리프" },
  // handwriting
  { family: "Nanum Pen Script", lang: "ko", category: "handwriting", weights: [400], vibe: "볼펜 손글씨" },
  { family: "Nanum Brush Script", lang: "ko", category: "handwriting", weights: [400], vibe: "붓 손글씨" },
  { family: "Gaegu", lang: "ko", category: "handwriting", weights: [400, 700], vibe: "또박또박 연필" },
  { family: "Hi Melody", lang: "ko", category: "handwriting", weights: [400], vibe: "귀여운 마커" },
  { family: "Gamja Flower", lang: "ko", category: "handwriting", weights: [400], vibe: "통통 낙서체" },
  { family: "Single Day", lang: "ko", category: "handwriting", weights: [400], vibe: "다이어리 손글씨" },
  { family: "East Sea Dokdo", lang: "ko", category: "handwriting", weights: [400], vibe: "거친 마커" },
  { family: "Dokdo", lang: "ko", category: "handwriting", weights: [400], vibe: "투박한 손글씨" },
  // display / comic
  { family: "Black Han Sans", lang: "ko", category: "display", weights: [400], vibe: "초굵은 포스터 임팩트" },
  { family: "Jua", lang: "ko", category: "display", weights: [400], vibe: "둥글둥글 말풍선" },
  { family: "Do Hyeon", lang: "ko", category: "display", weights: [400], vibe: "굵은 간판체" },
  { family: "Dongle", lang: "ko", category: "display", weights: [400, 700], vibe: "포근한 버블" },
  { family: "Yeon Sung", lang: "ko", category: "display", weights: [400], vibe: "레트로 마커" },
  { family: "Kirang Haerang", lang: "ko", category: "display", weights: [400], vibe: "옛날 간판 붓" },
  { family: "Gugi", lang: "ko", category: "display", weights: [400], vibe: "굵은 붓 캘리" },
  { family: "Poor Story", lang: "ko", category: "display", weights: [400], vibe: "엉뚱한 동화체" },
  { family: "Cute Font", lang: "ko", category: "display", weights: [400], vibe: "얇고 깜찍" },
  { family: "Gugi", lang: "ko", category: "display", weights: [400], vibe: "붓 캘리그래피" },
  // monospace
  { family: "Nanum Gothic Coding", lang: "ko", category: "monospace", weights: [400, 700], vibe: "고정폭 코딩체" },

  // ─────────── Latin / English ───────────
  // comic / display
  { family: "Bangers", lang: "latin", category: "comic", weights: [400], vibe: "comic-book shout" },
  { family: "Luckiest Guy", lang: "latin", category: "comic", weights: [400], vibe: "chunky cartoon caps" },
  { family: "Comic Neue", lang: "latin", category: "comic", weights: [400, 700], vibe: "tidy comic body" },
  { family: "Bubblegum Sans", lang: "latin", category: "comic", weights: [400], vibe: "bouncy cartoon" },
  { family: "Chewy", lang: "latin", category: "comic", weights: [400], vibe: "soft fat bubbly" },
  { family: "Grandstander", lang: "latin", category: "comic", weights: [400, 700], vibe: "playful bold cartoon" },
  { family: "Boogaloo", lang: "latin", category: "display", weights: [400], vibe: "tall quirky cartoon" },
  { family: "Lilita One", lang: "latin", category: "display", weights: [400], vibe: "bold rounded poster" },
  { family: "Titan One", lang: "latin", category: "display", weights: [400], vibe: "heavy puffy cartoon" },
  { family: "Concert One", lang: "latin", category: "display", weights: [400], vibe: "rounded bold" },
  { family: "Fredoka", lang: "latin", category: "display", weights: [400, 600], vibe: "friendly rounded" },
  { family: "Baloo 2", lang: "latin", category: "display", weights: [400, 700], vibe: "rounded chunky" },
  // handwriting
  { family: "Caveat", lang: "latin", category: "handwriting", weights: [400, 700], vibe: "lively pen" },
  { family: "Patrick Hand", lang: "latin", category: "handwriting", weights: [400], vibe: "neat print" },
  { family: "Gochi Hand", lang: "latin", category: "handwriting", weights: [400], vibe: "casual marker" },
  { family: "Indie Flower", lang: "latin", category: "handwriting", weights: [400], vibe: "bubbly round hand" },
  { family: "Shadows Into Light", lang: "latin", category: "handwriting", weights: [400], vibe: "breezy hand" },
  { family: "Permanent Marker", lang: "latin", category: "handwriting", weights: [400], vibe: "thick sharpie" },
  { family: "Architects Daughter", lang: "latin", category: "handwriting", weights: [400], vibe: "blueprint print" },
  { family: "Coming Soon", lang: "latin", category: "handwriting", weights: [400], vibe: "rounded marker print" },
  { family: "Schoolbell", lang: "latin", category: "handwriting", weights: [400], vibe: "classroom print" },
  { family: "Kalam", lang: "latin", category: "handwriting", weights: [400, 700], vibe: "brush handwriting" },
  { family: "Sriracha", lang: "latin", category: "handwriting", weights: [400], vibe: "brush casual" },
  { family: "Gloria Hallelujah", lang: "latin", category: "handwriting", weights: [400], vibe: "notebook doodle" },
  { family: "Pangolin", lang: "latin", category: "handwriting", weights: [400], vibe: "smooth legible hand" },
  { family: "Rock Salt", lang: "latin", category: "handwriting", weights: [400], vibe: "hand-painted caps" },
  { family: "Reenie Beanie", lang: "latin", category: "handwriting", weights: [400], vibe: "thin ballpoint" },
  { family: "Neucha", lang: "latin", category: "handwriting", weights: [400], vibe: "relaxed pencil" },
  { family: "Delius", lang: "latin", category: "handwriting", weights: [400], vibe: "rounded neat hand" },
  { family: "Just Another Hand", lang: "latin", category: "handwriting", weights: [400], vibe: "tall narrow scrawl" },
  // clean sans
  { family: "Inter", lang: "latin", category: "sans", weights: [400, 700], vibe: "neutral modern" },
  { family: "Roboto", lang: "latin", category: "sans", weights: [400, 700], vibe: "android neutral" },
  { family: "Poppins", lang: "latin", category: "sans", weights: [400, 700], vibe: "geometric rounded" },
  { family: "Montserrat", lang: "latin", category: "sans", weights: [400, 700], vibe: "urban geometric" },
  { family: "Nunito", lang: "latin", category: "sans", weights: [400, 700], vibe: "soft rounded sans" },
  { family: "Work Sans", lang: "latin", category: "sans", weights: [400, 700], vibe: "clean grotesque" },
  { family: "Lato", lang: "latin", category: "sans", weights: [400, 700], vibe: "warm humanist" },
  { family: "Open Sans", lang: "latin", category: "sans", weights: [400, 700], vibe: "legible neutral" },
  { family: "Source Sans 3", lang: "latin", category: "sans", weights: [400, 700], vibe: "adobe humanist" },
];

// de-dupe by family (the catalog above has an accidental repeat or two — keep first)
const FONT_BY_FAMILY = new Map<string, WebtoonFont>();
for (const f of WEBTOON_FONTS) if (!FONT_BY_FAMILY.has(f.family)) FONT_BY_FAMILY.set(f.family, f);
export const WEBTOON_FONT_LIST: WebtoonFont[] = Array.from(FONT_BY_FAMILY.values());

export const CATEGORY_LABELS: Record<WebtoonFontCategory, string> = {
  sans: "고딕 / Sans",
  serif: "명조 / Serif",
  handwriting: "손글씨",
  display: "디스플레이",
  comic: "코믹",
  monospace: "고정폭",
};

/** The user's own self-hosted fonts, pinned to the top of the Korean tab. */
export const WEBTOON_LOCAL_FONTS: WebtoonFont[] = WEBTOON_FONT_LIST.filter((f) => f.local);

/** ~8-font shortlist surfaced first in the picker (local fonts lead). */
export const WEBTOON_FONT_RECOMMENDED = [
  ...WEBTOON_LOCAL_FONTS.map((f) => f.family),
  "Pretendard",
  "Nanum Pen Script",
  "Gaegu",
  "Jua",
  "Black Han Sans",
];

const PRETENDARD_STACK = WEBTOON_TEXT_FONT_FAMILY;

/** Build the Konva/CSS font-family stack for a chosen family (Korean fallback preserved). */
export function fontFamilyStack(family: string): string {
  if (!family || family === "Pretendard") return PRETENDARD_STACK;
  return `"${family}", ${PRETENDARD_STACK}`;
}

/** Extract the chosen catalog family from a stored stack string. */
export function familyFromStack(stack: string): string {
  const m = stack.match(/^"?([^",]+)"?/);
  const first = (m?.[1] ?? "").trim();
  return FONT_BY_FAMILY.has(first) ? first : "Pretendard";
}

function gfHref(f: WebtoonFont): string {
  const fam = f.family.replace(/ /g, "+");
  const w = f.weights.length ? `:wght@${[...f.weights].sort((a, b) => a - b).join(";")}` : "";
  return `https://fonts.googleapis.com/css2?family=${fam}${w}&display=swap`;
}

const injected = new Set<string>();

function fmtOf(src: string): string {
  if (/\.otf($|\?)/i.test(src)) return "opentype";
  if (/\.woff2($|\?)/i.test(src)) return "woff2";
  if (/\.woff($|\?)/i.test(src)) return "woff";
  return "truetype";
}

/** Inject an @font-face rule for a self-hosted font (idempotent). */
function injectLocalFontFace(f: WebtoonFont): void {
  if (typeof document === "undefined" || !f.src) return;
  if (document.querySelector(`style[data-webtoon-font="${f.family}"]`)) return;
  const style = document.createElement("style");
  style.setAttribute("data-webtoon-font", f.family);
  const weight = f.weights.length > 1 ? "400 700" : "normal";
  style.textContent = `@font-face{font-family:"${f.family}";src:url("${f.src}") format("${fmtOf(
    f.src,
  )}");font-weight:${weight};font-style:normal;font-display:swap;}`;
  document.head.appendChild(style);
}

/** Inject the @font-face CSS for a family (idempotent). Pretendard is already global. */
export function injectFontCss(family: string): void {
  if (typeof document === "undefined") return;
  if (family === "Pretendard" || injected.has(family)) return;
  const f = FONT_BY_FAMILY.get(family);
  if (!f) return;
  injected.add(family);
  if (f.src) {
    injectLocalFontFace(f);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = gfHref(f);
  link.setAttribute("data-webtoon-font", family);
  document.head.appendChild(link);
}

let allInjected = false;
/** Inject CSS for every catalog font in ONE combined request (files load only when shown). */
export function injectAllFontCss(): void {
  if (typeof document === "undefined" || allInjected) return;
  allInjected = true;
  // self-hosted faces: one @font-face each
  for (const f of WEBTOON_FONT_LIST) {
    if (f.src) injectLocalFontFace(f);
  }
  // Google fonts: one combined CSS2 request
  const families = WEBTOON_FONT_LIST.filter((f) => f.family !== "Pretendard" && !f.src).map((f) => {
    const fam = f.family.replace(/ /g, "+");
    const w = f.weights.length ? `:wght@${[...f.weights].sort((a, b) => a - b).join(";")}` : "";
    return `family=${fam}${w}`;
  });
  for (const f of WEBTOON_FONT_LIST) injected.add(f.family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
  link.setAttribute("data-webtoon-font", "__all__");
  document.head.appendChild(link);
}

/** Ensure a family's faces are actually loaded so Konva can render it crisply. */
export async function ensureWebtoonFont(family: string): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  if (family === "Pretendard") {
    await document.fonts.load('400 24px "Pretendard"').catch(() => {});
    return;
  }
  injectFontCss(family);
  const f = FONT_BY_FAMILY.get(family);
  const weights = f?.weights.length ? f.weights : [400];
  await Promise.all(
    weights.map((w) => document.fonts.load(`${w} 24px "${family}"`).catch(() => {})),
  );
}
