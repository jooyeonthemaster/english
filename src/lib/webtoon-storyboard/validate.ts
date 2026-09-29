// ============================================================================
// Storyboard normalization + deterministic validation.
// ----------------------------------------------------------------------------
// normalizeStoryboard(): wire JSON (snake_case, possibly sloppy) → typed storyboard.
//   Coerces unknown enums to safe defaults, trims strings, drops empty bubbles,
//   fixes unpaired `half` panels (→ wide). Never throws on content; returns null
//   only when the structure is unusable (no panels / not an object).
// validateStoryboard(): the rules we *asked* for, checked in code. Returns
//   human-readable violations (Korean) that feed the repair round.
// ============================================================================

import {
  BUBBLE_KINDS,
  CAMERA_ANGLES,
  PANEL_BEATS,
  PANEL_SIZES,
  SHOT_TYPES,
  STORYBOARD_VERSION,
  type BubbleKind,
  type CameraAngle,
  type PanelBeat,
  type PanelSize,
  type ShotType,
  type StoryboardBubble,
  type StoryboardCastMember,
  type StoryboardPanel,
  type WebtoonStoryboard,
} from "./types";
import {
  MAX_PANELS,
  MIN_PANELS,
  TEXT_BUDGETS,
  captionBudget,
  captionLength,
  latinWordCount,
  visibleLength,
  type StoryboardLanguage,
} from "./rules";
import { findVisualText } from "./visual-text";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function s(v: unknown, max = 600): string {
  if (typeof v !== "string") return "";
  // Collapse internal whitespace runs; strip control chars and emoji-range symbols
  // (they are printed into the image and the image model garbles them).
  return v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\p{Extended_Pictographic}\u{200D}\u{FE0E}\u{FE0F}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

export function normalizeStoryboard(raw: unknown): WebtoonStoryboard | null {
  if (!isRecord(raw)) return null;
  const rawPanels = Array.isArray(raw.panels) ? raw.panels.filter(isRecord) : [];
  if (rawPanels.length === 0) return null;

  const cast: StoryboardCastMember[] = (Array.isArray(raw.cast) ? raw.cast : [])
    .filter(isRecord)
    .map((c) => ({
      name: s(c.name, 40),
      role: s(c.role, 80),
      appearance: s(c.appearance, 400),
    }))
    .filter((c) => c.name && c.appearance)
    .slice(0, 3);

  const panels: StoryboardPanel[] = rawPanels.slice(0, MAX_PANELS).map((p) => {
    const bubbles: StoryboardBubble[] = (Array.isArray(p.bubbles) ? p.bubbles : [])
      .filter(isRecord)
      .map((b) => ({
        speaker: s(b.speaker, 40),
        kind: pick<BubbleKind>(b.kind, BUBBLE_KINDS, "speech"),
        text: s(b.text, 160),
        translation: s(b.translation, 80),
      }))
      .filter((b) => b.text.length > 0)
      .slice(0, 2);
    return {
      beat: pick<PanelBeat>(p.beat, PANEL_BEATS, "development"),
      shot: pick<ShotType>(p.shot, SHOT_TYPES, "medium"),
      angle: pick<CameraAngle>(p.angle, CAMERA_ANGLES, "eye_level"),
      size: pick<PanelSize>(p.size, PANEL_SIZES, "wide"),
      composition: s(p.composition),
      action: s(p.action),
      setting: s(p.setting),
      mood: s(p.mood, 300),
      caption: s(p.caption, 200),
      bubbles,
      sfx: s(p.sfx, 12),
      keyPhrase: s(p.key_phrase ?? p.keyPhrase, 160),
      sourceExcerpt: s(p.source_excerpt ?? p.sourceExcerpt, 300),
    };
  });

  fixUnpairedHalves(panels);

  return {
    version: STORYBOARD_VERSION,
    title: s(raw.title, 60),
    loglineKo: s(raw.logline_ko ?? raw.loglineKo, 200),
    keyMessageKo: s(raw.key_message_ko ?? raw.keyMessageKo, 120),
    world: s(raw.world, 400),
    palette: s(raw.palette, 300),
    artNotes: s(raw.art_notes ?? raw.artNotes, 400),
    cast,
    panels,
  };
}

/**
 * `half` panels are laid out two per row. A run of halves with odd length leaves
 * one orphan that would render as a lonely half-width box → promote the last
 * orphan of each odd run to `wide`. Mutates in place.
 */
export function fixUnpairedHalves(panels: StoryboardPanel[]): void {
  let i = 0;
  while (i < panels.length) {
    if (panels[i].size !== "half") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < panels.length && panels[j].size === "half") j += 1;
    const runLength = j - i;
    if (runLength % 2 === 1) panels[j - 1].size = "wide";
    i = j;
  }
}

export interface StoryboardValidation {
  /** Violations that justify a repair round. */
  violations: string[];
  /** Structural failures — storyboard must not be used (fallback to legacy prompt). */
  fatal: string[];
}

/**
 * Latin runs inside a KO_KEY caption (the inserted English chunks). Surrounding quote
 * marks and hyphens are trimmed — quoting the inserted English ('perceptual disposition')
 * is normal Korean style and must not break the verbatim match.
 */
function latinChunks(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z'’\-]*(?:[ ,]+[A-Za-z][A-Za-z'’\-]*)*/g) ?? [])
    .map((c) => c.trim().replace(/^['‘’"“”\-]+|['‘’"“”\-]+$/g, ""))
    .filter(Boolean);
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

/**
 * English verb/adjective glued to a Korean verb ending ("… way하게 한다", "distorted해진다").
 * A lowercase letter must touch the ending directly — "SNS 하는 시간" (acronym + space) is fine.
 */
const HYBRID_VERB_SUFFIX = /[a-z](하게|하다|한다|했다|하는|해서|해요|해진|해졌|하지|되다|된다|됐다|됨)/;

/** Visual fields checked for smuggled lettering/figures (see visual-text.ts). */
const PANEL_VISUAL_FIELDS = ["composition", "action", "setting", "mood"] as const;

export function validateStoryboard(
  sb: WebtoonStoryboard,
  opts: {
    language: StoryboardLanguage;
    targetPanels: number;
    /** When given (KO_KEY), inserted English chunks must appear verbatim in the passage. */
    passageContent?: string;
  },
): StoryboardValidation {
  const violations: string[] = [];
  const fatal: string[] = [];
  const budget = TEXT_BUDGETS[opts.language];
  const n = sb.panels.length;

  if (n < MIN_PANELS) fatal.push(`컷이 ${n}개뿐이다(최소 ${MIN_PANELS}).`);
  if (sb.cast.length === 0) fatal.push("cast 가 비어 있다.");
  if (n !== opts.targetPanels) {
    violations.push(`컷 수가 ${n}개다. 정확히 ${opts.targetPanels}컷이어야 한다.`);
  }

  // ── Directing grammar ──
  for (let i = 1; i < n; i += 1) {
    if (sb.panels[i].shot === sb.panels[i - 1].shot) {
      violations.push(
        `${i}컷과 ${i + 1}컷의 shot 이 둘 다 ${sb.panels[i].shot} 이다. 연속 컷은 거리를 바꿔야 한다.`,
      );
    }
  }
  const shots = new Set(sb.panels.map((p) => p.shot));
  if (!shots.has("close_up") && !shots.has("extreme_close_up")) {
    violations.push("close_up 또는 extreme_close_up 컷이 없다(감정·깨달음 컷에 최소 1개).");
  }
  if (!shots.has("insert") && n >= 5) {
    violations.push("핵심 개념·사물을 보여 주는 insert 컷이 없다(최소 1개).");
  }
  const largeCount = sb.panels.filter((p) => p.size === "large").length;
  if (largeCount === 0) violations.push('절정·핵심 컷에 size "large" 가 1개 필요하다.');
  if (largeCount > 2) violations.push(`size "large" 가 ${largeCount}개다(최대 2개).`);
  const last = sb.panels[n - 1];
  if (last && last.size === "half") {
    violations.push('마지막 컷은 "wide" 또는 "large" 여야 한다.');
  }

  // ── Text contract ──
  const withBubbles = sb.panels.filter((p) => p.bubbles.length > 0).length;
  if (withBubbles * 2 < n) {
    violations.push(`말풍선 있는 컷이 ${withBubbles}/${n}컷이다. 절반 이상에 말풍선을 넣어라.`);
  }
  let pageTotal = 0;
  sb.panels.forEach((p, idx) => {
    const label = `${idx + 1}컷`;
    const capLen = captionLength(p.caption, opts.language);
    const capMax = captionBudget(opts.language, p.size);
    pageTotal += capLen;
    if (capLen > capMax) {
      violations.push(`${label} 캡션이 ${capLen}자다(상한 ${capMax}자): "${p.caption}"`);
    }
    for (const b of p.bubbles) {
      const len = visibleLength(b.text);
      pageTotal += len + visibleLength(b.translation);
      if (len > budget.bubble) {
        violations.push(`${label} 말풍선이 ${len}자다(상한 ${budget.bubble}자): "${b.text}"`);
      }
      if (budget.bubbleWords > 0 && latinWordCount(b.text) > budget.bubbleWords) {
        violations.push(
          `${label} 영어 말풍선이 ${latinWordCount(b.text)}단어다(상한 ${budget.bubbleWords}단어): "${b.text}"`,
        );
      }
      if (budget.translation > 0) {
        const tLen = visibleLength(b.translation);
        if (tLen === 0) violations.push(`${label} 말풍선 번역(translation)이 비어 있다.`);
        if (tLen > budget.translation) {
          violations.push(
            `${label} 말풍선 번역이 ${tLen}자다(상한 ${budget.translation}자): "${b.translation}"`,
          );
        }
      }
      if (/[가-힣]/.test(b.text) && (opts.language === "EN" || opts.language === "KO_EN" || opts.language === "EN_KO_GLOSS")) {
        violations.push(`${label} 말풍선은 영어여야 하는데 한국어가 섞였다: "${b.text}"`);
      }
    }
    if (opts.language === "EN" && /[가-힣]/.test(p.caption)) {
      violations.push(`${label} 캡션은 영어여야 하는데 한국어가 섞였다: "${p.caption}"`);
    }
    if (opts.language === "KO_KEY" && p.caption) {
      if (HYBRID_VERB_SUFFIX.test(p.caption)) {
        violations.push(
          `${label} 캡션이 영어 동사·형용사에 '-하게/-한다' 를 붙인 혼종이다. 영어는 명사구·부사구로만 쓴다: "${p.caption}"`,
        );
      }
      if (opts.passageContent) {
        const source = normalizeForMatch(opts.passageContent);
        const castNames = new Set(sb.cast.map((c) => normalizeForMatch(c.name)));
        for (const chunk of latinChunks(p.caption)) {
          const norm = normalizeForMatch(chunk);
          if (castNames.has(norm)) continue; // 인물 이름(Jake 등)은 지문 인용이 아니다
          if (chunk.length >= 4 && !source.includes(norm)) {
            violations.push(`${label} 캡션의 영어 "${chunk}" 가 지문에 글자 그대로 없다. 지문 표현을 그대로 쓴다.`);
          }
        }
      }
    }
    if (!p.composition || !p.action) {
      violations.push(`${label} composition/action 이 비어 있다.`);
    }
    for (const field of PANEL_VISUAL_FIELDS) {
      const hits = findVisualText(p[field]);
      if (hits.length > 0) {
        violations.push(
          `${label} ${field} 에 그림에 찍힐 글자·수치(${hits.join(", ")})가 있다. 그림 묘사만 쓰고 화면·문서·간판은 도형·아이콘으로 묘사하라.`,
        );
      }
    }
  });
  // 페이지 공통 묘사 필드(인물 외형·세계·팔레트·그림 노트)도 모든 컷에 반복돼 찍히므로 같이 검사한다.
  const pageFields: Array<[string, string]> = [
    ...sb.cast.map((c): [string, string] => [`cast ${c.name} appearance`, c.appearance]),
    ["world", sb.world],
    ["palette", sb.palette],
    ["art_notes", sb.artNotes],
  ];
  for (const [name, value] of pageFields) {
    const hits = findVisualText(value);
    if (hits.length > 0) {
      violations.push(`${name} 에 그림에 찍힐 글자·수치(${hits.join(", ")})가 있다. 이름표·로고 없이 묘사하라.`);
    }
  }
  if (pageTotal > budget.page) {
    violations.push(`페이지 전체 글자가 ${pageTotal}자다(상한 ${budget.page}자). 전체적으로 줄여라.`);
  }

  return { violations, fatal };
}

/** Severity score for choosing between attempts (lower is better). */
export function violationScore(v: StoryboardValidation): number {
  return v.fatal.length * 100 + v.violations.length;
}
