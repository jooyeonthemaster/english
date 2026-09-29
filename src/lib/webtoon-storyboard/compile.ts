// ============================================================================
// Storyboard → single 9:16 image prompt (deterministic).
// ----------------------------------------------------------------------------
// The image model receives: format + style bible + fixed cast sheet + an
// explicit row-by-row page layout + one directed block per panel (shot, angle,
// composition, acting, setting, light, exact lettering) + lettering rules.
// Same storyboard in → byte-identical prompt out (hashable, testable).
// ============================================================================

import { styleBibleFor } from "./styles";
import { sanitizeVisualText } from "./visual-text";
import { type StoryboardLanguage } from "./rules";
import type {
  BubbleKind,
  CameraAngle,
  ShotType,
  StoryboardPanel,
  WebtoonStoryboard,
} from "./types";

const SHOT_PROMPT: Record<ShotType, string> = {
  extreme_wide: "EXTREME WIDE SHOT (tiny figures in a vast environment)",
  wide: "WIDE SHOT (whole bodies plus surroundings)",
  full: "FULL SHOT (head-to-toe framing)",
  medium: "MEDIUM SHOT (waist up)",
  medium_close_up: "MEDIUM CLOSE-UP (chest up)",
  close_up: "CLOSE-UP (face fills the panel)",
  extreme_close_up: "EXTREME CLOSE-UP (eyes or a small detail fill the panel)",
  insert: "INSERT SHOT (a key object or detail, hands allowed, no full faces)",
};

const ANGLE_PROMPT: Record<CameraAngle, string> = {
  eye_level: "eye-level camera",
  high_angle: "high-angle camera looking down",
  low_angle: "low-angle camera looking up",
  birds_eye: "bird's-eye view from directly above",
  worms_eye: "worm's-eye view from the ground",
  over_the_shoulder: "over-the-shoulder camera",
  dutch_angle: "tilted dutch angle",
  pov: "first-person point of view",
};

const BUBBLE_SHAPE: Record<BubbleKind, string> = {
  speech: "white rounded speech bubble with a tail pointing to",
  thought: "cloud-shaped thought bubble with small circles trailing to",
  shout: "spiky burst bubble with a tail pointing to",
  whisper: "dashed-outline small bubble with a tail pointing to",
};

export interface CompileInput {
  storyboard: WebtoonStoryboard;
  style: string;
  language: StoryboardLanguage;
}

interface LayoutRow {
  panels: number[]; // 0-based panel indexes
  weight: number;
}

/** Group panels into page rows: adjacent `half` pairs share a row. */
export function layoutRows(panels: StoryboardPanel[]): LayoutRow[] {
  const rows: LayoutRow[] = [];
  let i = 0;
  while (i < panels.length) {
    const p = panels[i];
    if (p.size === "half" && panels[i + 1]?.size === "half") {
      rows.push({ panels: [i, i + 1], weight: 1 });
      i += 2;
      continue;
    }
    rows.push({ panels: [i], weight: p.size === "large" ? 1.45 : p.size === "wide" ? 0.8 : 1 });
    i += 1;
  }
  return rows;
}

function quote(text: string): string {
  // Straight double quotes delimit the exact lettering; inner quotes become an
  // opening/closing curly pair (“…”) so the page never prints ”안녕”.
  let open = true;
  const inner = text.replace(/"/g, () => {
    const mark = open ? "“" : "”";
    open = !open;
    return mark;
  });
  return `"${inner}"`;
}

/** Printed width of one character in Hangul-syllable units (Latin/digits ≈ half width). */
function charUnits(ch: string): number {
  if (/\s/.test(ch)) return 0.3;
  if (/[A-Za-z0-9]/.test(ch)) return 0.55;
  if (/[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch)) return 1;
  return 0.45;
}

/** Line caps (Hangul-syllable units). Short lines let the model letter BIG instead of shrinking. */
const LINE_UNITS = { captionFull: 15, captionHalf: 10.5, bubble: 8.5, subtitle: 14 } as const;

/**
 * Greedy word wrap into lines of at most `maxUnits`. 26-09-30 bench: long single-line
 * captions were lettered ~7px tall on a 390px phone (legibility 3/5) — pre-broken short
 * lines are lettered larger, and shorter strings also garble less.
 */
export function wrapLettering(text: string, maxUnits: number): string[] {
  const width = (t: string) => [...t].reduce((sum, ch) => sum + charUnits(ch), 0);
  // Units = words, except that a run of English words (a KO_KEY key phrase such as
  // "perceptual disposition은") stays on one line whenever it fits.
  const words = text.trim().split(/\s+/).filter(Boolean);
  const units: string[] = [];
  for (const word of words) {
    const prev = units[units.length - 1];
    const latinWord = /^[A-Za-z]/.test(word);
    const prevLatin = prev !== undefined && /[A-Za-z][^\s]*$/.test(prev) && /^[A-Za-z]/.test(prev.split(" ").pop() ?? "");
    if (latinWord && prevLatin && !/[가-힣]$/.test(prev) && width(`${prev} ${word}`) <= maxUnits) {
      units[units.length - 1] = `${prev} ${word}`;
    } else {
      units.push(word);
    }
  }
  const lines: string[] = [];
  let current = "";
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (current && width(candidate) > maxUnits) {
      lines.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  // Pull a stranded short tail ("있다.") back up when the previous line has room to stretch.
  if (lines.length >= 2) {
    const last = lines[lines.length - 1];
    const merged = `${lines[lines.length - 2]} ${last}`;
    if (width(last) <= 3 && width(merged) <= maxUnits * 1.3) {
      lines.splice(lines.length - 2, 2, merged);
    }
  }
  return lines;
}

/** Exact lettering, pre-broken: one quoted string per line, separated by " / ". */
function quoteLines(text: string, maxUnits: number): string {
  const lines = wrapLettering(text, maxUnits);
  if (lines.length <= 1) return quote(text);
  return `${lines.length} lines — ${lines.map(quote).join(" / ")}`;
}

function letteringLines(panel: StoryboardPanel, language: StoryboardLanguage): string[] {
  const lines: string[] = [];
  if (panel.caption) {
    const captionUnits = panel.size === "half" ? LINE_UNITS.captionHalf : LINE_UNITS.captionFull;
    lines.push(
      `Caption box (rectangular, cream background, dark text, tucked into a top corner): ${quoteLines(panel.caption, captionUnits)}`,
    );
  }
  for (const b of panel.bubbles) {
    const target =
      b.speaker && !/^(narrator|narration|내레이션|나레이션|내레이터|나레이터|해설)$/i.test(b.speaker)
        ? b.speaker
        : "the speaker";
    lines.push(`${BUBBLE_SHAPE[b.kind]} ${target}: ${quoteLines(b.text, LINE_UNITS.bubble)}`);
    if (language === "KO_EN" && b.translation) {
      lines.push(
        `Directly under that bubble, a cream subtitle strip with the Korean translation: ${quoteLines(b.translation, LINE_UNITS.subtitle)}`,
      );
    }
  }
  if (panel.sfx) {
    lines.push(`Hand-lettered sound effect integrated into the art: ${quote(panel.sfx)}`);
  }
  if (lines.length === 0) lines.push("No text in this panel.");
  return lines;
}

/**
 * Last line of defense for VISUAL fields (see visual-text.ts): lettering/figures that
 * survived the validator's repair round are neutralized, so the only printed text is
 * the lettering below. Clean descriptions pass through byte-for-byte.
 */
export const sanitizeVisual = sanitizeVisualText;

function panelBlock(
  panel: StoryboardPanel,
  index: number,
  language: StoryboardLanguage,
): string {
  const head = `PANEL ${index + 1} — ${SHOT_PROMPT[panel.shot]}, ${ANGLE_PROMPT[panel.angle]}.`;
  const composition = sanitizeVisual(panel.composition);
  const action = sanitizeVisual(panel.action);
  const setting = sanitizeVisual(panel.setting);
  const mood = sanitizeVisual(panel.mood);
  const body = [
    composition && `Composition: ${composition}`,
    action && `Action & acting: ${action}`,
    setting && `Setting: ${setting}`,
    mood && `Light & color: ${mood}`,
    ...letteringLines(panel, language).map((l) => `Lettering: ${l}`),
  ].filter(Boolean);
  return [head, ...body.map((l) => `  ${l}`)].join("\n");
}

/**
 * Row heights are described RELATIVELY. 26-09-30 bench: all 18 pages ignored "about N% of
 * the page height" and drew near-equal rows, so the climax panel lost its emphasis.
 */
function rowHeightLabel(weight: number, firstTall: boolean): string {
  if (weight >= 1.3) {
    // Only one row can be "the tallest" — a second large panel is just "tall".
    return firstTall
      ? "the TALLEST row on the page — about 1.5× a standard row"
      : "a tall row — clearly taller than a standard row";
  }
  if (weight <= 0.85) return "a short band — clearly shorter than a standard row";
  return "standard height";
}

function layoutBlock(panels: StoryboardPanel[]): string[] {
  const rows = layoutRows(panels);
  const firstTallIndex = rows.findIndex((r) => r.weight >= 1.3);
  return rows.map((row, idx) => {
    const what =
      row.panels.length === 2
        ? `Panel ${row.panels[0] + 1} (left half) | Panel ${row.panels[1] + 1} (right half)`
        : `Panel ${row.panels[0] + 1} (full width)`;
    return `- Row ${idx + 1} (${rowHeightLabel(row.weight, idx === firstTallIndex)}): ${what}`;
  });
}

function textLanguageRule(language: StoryboardLanguage): string {
  switch (language) {
    case "EN":
      return "All lettering is English.";
    case "KO_EN":
      return "Speech bubbles are English with a Korean subtitle strip under each; captions are Korean.";
    case "EN_KO_GLOSS":
      return "Speech bubbles are English; caption boxes are Korean.";
    case "KO_KEY":
      return "Lettering is Korean; some captions contain an English phrase inline — keep it in Latin letters exactly as written.";
    default:
      return "All lettering is Korean (Hangul).";
  }
}

export function compileWebtoonImagePrompt(input: CompileInput): string {
  const { storyboard: sb, language } = input;
  const n = sb.panels.length;

  const castLines = sb.cast.map((c) => `- ${c.name}: ${sanitizeVisual(c.appearance)}`);
  const artNotes = sanitizeVisual(sb.artNotes);
  const palette = sanitizeVisual(sb.palette);
  const world = sanitizeVisual(sb.world);

  const sections = [
    `Create ONE vertical 9:16 full-color Korean webtoon page that tells a complete short story in exactly ${n} panels, read top to bottom (left to right within a row).`,
    "",
    `ART STYLE: ${styleBibleFor(input.style)}`,
    artNotes ? `ART NOTES: ${artNotes}` : null,
    palette ? `COLOR SCRIPT: ${palette}` : null,
    world ? `WORLD: ${world}` : null,
    "",
    "RECURRING CHARACTERS — draw each one identically in every panel (same face, hairstyle, hair color, outfit incl. sleeve length, colors and signature accessory):",
    ...castLines,
    "",
    `PAGE LAYOUT — ${n} panels with thin black borders separated by clean white gutters; no panel numbers:`,
    ...layoutBlock(sb.panels),
    "Row heights must visibly differ as listed: the tallest row is the visual climax and gets the biggest, most dramatic image; short bands are clearly shorter.",
    "",
    "PANELS (follow each shot size, camera angle and composition exactly — the variety of framing is the point):",
    ...sb.panels.map((p, i) => panelBlock(p, i, language)),
    "",
    "LETTERING RULES:",
    `- ${textLanguageRule(language)}`,
    "- Render every quoted string exactly as written — identical spelling, spacing and punctuation. Korean must be clean, correctly formed Hangul; never invent look-alike glyphs.",
    "- Print ONLY the quoted strings. No other words, labels, signs, book titles, logos, watermarks, signatures or panel numbers anywhere.",
    "- Screens, monitors, charts, graphs, documents, folders, stamps, books, posters, signs, labels, packaging and clothing inside the art show only abstract lines, bars, arrows, shapes and icons — never legible words, letters, numbers, percentages or dates (they would invent facts the passage never states).",
    "- Where a string is given as several quoted lines separated by \" / \", letter each quoted part on its own line (never draw the slash) and keep those breaks instead of shrinking the text.",
    "- Use one clear, bold, rounded sans-serif lettering font across the page, lettered BIG — caption and bubble glyphs about 1/28 of the page width tall, so they stay readable when the whole page is shown on a phone.",
    "- Place bubbles and caption boxes in empty areas; never cover faces, hands or the key object of a panel. Each bubble's tail points at its speaker.",
  ];

  return sections.filter((line): line is string => line !== null).join("\n");
}
