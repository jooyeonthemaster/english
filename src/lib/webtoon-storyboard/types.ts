// ============================================================================
// Webtoon storyboard (콘티) — shared types, enums, Korean labels, JSON schema.
// ----------------------------------------------------------------------------
// v2 pipeline: passage → [Gemini storyboard: per-panel shot/angle/composition/
// dialogue] → [deterministic compiler] → one 9:16 image prompt → GPT Image 2.5.
//
// Pure constants/types only (no server imports) — safe for client components
// (the preview modal renders the storyboard as a "연출 노트" cut list).
// ============================================================================

export const STORYBOARD_VERSION = 1 as const;

/** Shot size (프레이밍 크기). Order = wide → tight. */
export const SHOT_TYPES = [
  "extreme_wide",
  "wide",
  "full",
  "medium",
  "medium_close_up",
  "close_up",
  "extreme_close_up",
  "insert",
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

/** Camera angle (카메라 앵글). */
export const CAMERA_ANGLES = [
  "eye_level",
  "high_angle",
  "low_angle",
  "birds_eye",
  "worms_eye",
  "over_the_shoulder",
  "dutch_angle",
  "pov",
] as const;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];

/**
 * Panel footprint on the 9:16 page.
 *  - wide  : full-width, short band (establishing / transition)
 *  - large : full-width, tall (climax / key insight — at most one or two)
 *  - half  : half-width; must come in adjacent pairs (fast beats, shot–reverse-shot)
 */
export const PANEL_SIZES = ["wide", "large", "half"] as const;
export type PanelSize = (typeof PANEL_SIZES)[number];

/** Story beat of the panel within the one-page arc. */
export const PANEL_BEATS = [
  "hook",
  "setup",
  "development",
  "turn",
  "climax",
  "resolution",
] as const;
export type PanelBeat = (typeof PANEL_BEATS)[number];

export const BUBBLE_KINDS = ["speech", "thought", "shout", "whisper"] as const;
export type BubbleKind = (typeof BUBBLE_KINDS)[number];

export interface StoryboardCastMember {
  /** Display name used in the story (e.g. "민지", "Dr. Kim"). */
  name: string;
  /** Narrative role (Korean, short). e.g. "주인공 · 호기심 많은 고1" */
  role: string;
  /** English visual description, fixed for every panel (age, hair, outfit, colors, accessory). */
  appearance: string;
}

export interface StoryboardBubble {
  /** Cast name, or "narrator"/"crowd"/"phone" etc. */
  speaker: string;
  kind: BubbleKind;
  /** Exact text rendered in the bubble. */
  text: string;
  /** KO_EN mode only: Korean subtitle rendered under the bubble. "" otherwise. */
  translation: string;
}

export interface StoryboardPanel {
  beat: PanelBeat;
  shot: ShotType;
  angle: CameraAngle;
  size: PanelSize;
  /** English — where subjects sit in frame, foreground/background layers, framing lines, depth. */
  composition: string;
  /** English — who does what, pose, facial expression / emotion. */
  action: string;
  /** English — place, props, time of day. */
  setting: string;
  /** English — lighting + color mood for this panel. */
  mood: string;
  /** Exact caption (narration box) text, "" = no caption. */
  caption: string;
  /** 0–2 bubbles. */
  bubbles: StoryboardBubble[];
  /** Short sound effect lettering (e.g. "쾅!"), "" = none. */
  sfx: string;
  /** English key phrase from the passage this panel teaches ("" if none). Teacher notes only. */
  keyPhrase: string;
  /** Short exact quote from the passage this panel adapts (teacher notes / coverage). */
  sourceExcerpt: string;
}

export interface WebtoonStoryboard {
  version: typeof STORYBOARD_VERSION;
  /** Webtoon title in the output language. */
  title: string;
  /** One-sentence Korean summary of the adaptation (for teachers). */
  loglineKo: string;
  /** The passage's main idea in Korean (the lesson the last panel lands on). */
  keyMessageKo: string;
  /** English — world / era / place of the story. */
  world: string;
  /** English — page-wide color script. */
  palette: string;
  /** English — visual requests distilled from the teacher's note ("" if none). */
  artNotes: string;
  cast: StoryboardCastMember[];
  panels: StoryboardPanel[];
}

/** Storyboard + generation metadata persisted on the Webtoon row (`storyboard` column). */
export interface PersistedWebtoonStoryboard extends WebtoonStoryboard {
  meta: {
    model: string;
    generatedAt: string;
    attempts: number;
    /** Deterministic rule violations that survived the repair round (informational). */
    warnings: string[];
    targetPanels: number;
  };
}

// ── Korean labels (UI "연출 노트") ────────────────────────────────────────────

export const SHOT_LABELS: Record<ShotType, string> = {
  extreme_wide: "익스트림 롱숏",
  wide: "롱숏",
  full: "풀숏",
  medium: "미디엄숏",
  medium_close_up: "미디엄 클로즈업",
  close_up: "클로즈업",
  extreme_close_up: "익스트림 클로즈업",
  insert: "인서트",
};

export const ANGLE_LABELS: Record<CameraAngle, string> = {
  eye_level: "아이 레벨",
  high_angle: "하이 앵글",
  low_angle: "로우 앵글",
  birds_eye: "버즈아이",
  worms_eye: "웜즈아이",
  over_the_shoulder: "어깨 너머",
  dutch_angle: "더치 앵글",
  pov: "1인칭 시점",
};

export const SIZE_LABELS: Record<PanelSize, string> = {
  wide: "가로 띠",
  large: "큰 컷",
  half: "반 컷",
};

export const BEAT_LABELS: Record<PanelBeat, string> = {
  hook: "도입",
  setup: "전개",
  development: "심화",
  turn: "전환",
  climax: "절정",
  resolution: "마무리",
};

// ── Runtime guards ───────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Loose guard for rows read back from the DB (JSON column). */
export function isPersistedStoryboard(v: unknown): v is PersistedWebtoonStoryboard {
  return (
    isRecord(v) &&
    v.version === STORYBOARD_VERSION &&
    Array.isArray(v.panels) &&
    Array.isArray(v.cast) &&
    typeof v.title === "string"
  );
}

// ── JSON schema (OpenRouter response_format: json_schema, strict) ─────────────
// Field names are snake_case on the wire (model-friendly); normalize() maps them.

const str = (description: string) => ({ type: "string", description });

export const STORYBOARD_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "logline_ko",
    "key_message_ko",
    "world",
    "palette",
    "art_notes",
    "cast",
    "panels",
  ],
  properties: {
    title: str("Webtoon title in the output language, short."),
    logline_ko: str("One Korean sentence: what this adaptation shows."),
    key_message_ko: str("The passage's main idea in Korean (≤40 chars)."),
    world: str("English. Setting / era / place of the story."),
    palette: str("English. Page-wide color script."),
    art_notes: str("English. Visual requests from the teacher note, or empty string."),
    cast: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "appearance"],
        properties: {
          name: str("Character display name."),
          role: str("Korean. Narrative role, short."),
          appearance: str(
            "English. Fixed look: age, build, hair, outfit with colors, one signature accessory.",
          ),
        },
      },
    },
    panels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "beat",
          "shot",
          "angle",
          "size",
          "composition",
          "action",
          "setting",
          "mood",
          "caption",
          "bubbles",
          "sfx",
          "key_phrase",
          "source_excerpt",
        ],
        properties: {
          beat: { type: "string", enum: [...PANEL_BEATS] },
          shot: { type: "string", enum: [...SHOT_TYPES] },
          angle: { type: "string", enum: [...CAMERA_ANGLES] },
          size: { type: "string", enum: [...PANEL_SIZES] },
          composition: str("English. Subject placement, foreground/background, framing, depth."),
          action: str("English. Who does what; pose; facial expression."),
          setting: str("English. Place, props, time of day."),
          mood: str("English. Lighting and color mood."),
          caption: str("Exact narration-box text, or empty string."),
          bubbles: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "kind", "text", "translation"],
              properties: {
                speaker: str("Cast name or narrator/crowd."),
                kind: { type: "string", enum: [...BUBBLE_KINDS] },
                text: str("Exact bubble text."),
                translation: str("Korean subtitle (KO_EN mode only) or empty string."),
              },
            },
          },
          sfx: str("Short sound-effect lettering or empty string."),
          key_phrase: str("English key phrase from the passage, or empty string."),
          source_excerpt: str("Short exact quote from the passage this panel adapts."),
        },
      },
    },
  },
};
