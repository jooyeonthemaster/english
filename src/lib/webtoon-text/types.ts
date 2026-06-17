// Shared types for the webtoon "자막 편집" (editable baked-in text) feature.
//
// A webtoon image is generated with text BAKED INTO the pixels (English speech bubbles +
// Korean translation/narration boxes + decorative art text). To make that text editable
// in-browser without re-generating the image, we detect each text region once (geometry +
// content + style) and store it as a `WebtoonTextDoc` on the Webtoon row. The editor then
// renders editable overlays at those positions; on export it repaints ONLY the boxes the
// user actually changed (minimal-diff: untouched boxes keep their original pixels), so a
// one-word typo fix leaves everything else pixel-identical.
//
// All geometry is in NATIVE image pixels (the 2160x3840 space), so the editor scales by a
// single factor and the exporter uses pixelRatio = nativeWidth / displayWidth.

export type WebtoonTextRole =
  | "english_bubble" // English dialogue inside a speech bubble (flat white bg)
  | "korean_translation" // Korean translation of a bubble (flat pastel/cream band)
  | "korean_narration" // Korean narration/caption box
  | "label" // short heading/label over art, e.g. "Egypt"
  | "decorative" // large stylized art text baked into the scene, e.g. "7", "13!", "死"
  | "other";

export type WebtoonTextLang = "ko" | "en" | "mixed" | "other";
export type WebtoonTextAlign = "left" | "center" | "right";

export interface WebtoonTextBox {
  id: string;
  role: WebtoonTextRole;
  /** Whether the editor lets the user edit this region (decorative art text is false). */
  editable: boolean;
  /**
   * True once the user has modified this box (text/geometry/style). The exporter repaints
   * ONLY boxes where this is true; everything else keeps the original baked pixels.
   */
  edited: boolean;

  // Geometry — native image pixels.
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees, default 0

  // Immutable detected geometry. If the user drags a box, the ORIGINAL location must still
  // be erased (covered) so the baked-in text doesn't show through at the old spot.
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;

  /** Immutable OCR original (audit + "revert"). Never mutated after detection. */
  sourceText: string;
  /** Current text shown/exported. Initialised to sourceText. */
  text: string;
  lang: WebtoonTextLang;

  // Style.
  fontFamily: string;
  fontSizePx: number; // initial estimate; editor auto-fit refines when autoFit=true
  autoFit: boolean;
  color: string; // foreground (glyph) color, hex
  align: WebtoonTextAlign;
  vertical: boolean;
  lineHeight: number;

  // Optional style extras (added 26-06-15). Optional → older stored docs stay valid;
  // the renderer defaults them.
  fontWeight?: number; // 400 | 700
  letterSpacing?: number; // px
  strokeColor?: string; // text outline colour (hex)
  strokeWidth?: number; // text outline width px (0 = none) — readability over busy art
  /** True for boxes the user added manually (vs detected). Deletable; no original to keep. */
  added?: boolean;

  // Background patch that erases the original text under the new text.
  bgColor: string; // hex — sampled median background of the region
  bgPadding: number; // px the patch extends beyond the text box (guarantees coverage)
  bgRadius: number; // patch corner radius px

  confidence: number; // detector confidence 0..1
}

export interface WebtoonTextDoc {
  version: 1;
  /** Native image dimensions (geometry space). */
  width: number;
  height: number;
  background: {
    /** The base image rendered under the overlays (the original baked webtoon). */
    originalUrl: string;
  };
  detector: {
    model: string;
    detectedAt: string; // ISO
    /** Width the image was downscaled to for the detection call (debug). */
    downscaleW: number;
  };
  boxes: WebtoonTextBox[];
}

export const WEBTOON_TEXT_DOC_VERSION = 1 as const;

/** Max boxes we persist (guards both write paths against unbounded/garbage docs). */
export const WEBTOON_TEXT_MAX_BOXES = 400;

/** Shared validation for both text-doc PUT and export finalize routes. */
export function isPlausibleWebtoonTextDoc(value: unknown): value is WebtoonTextDoc {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.width === "number" &&
    typeof v.height === "number" &&
    typeof v.background === "object" &&
    v.background !== null &&
    Array.isArray(v.boxes) &&
    v.boxes.length <= WEBTOON_TEXT_MAX_BOXES
  );
}

/** Roles whose text users typically want to fix (typos / mistranslations). */
export function isEditableRole(role: WebtoonTextRole): boolean {
  return (
    role === "english_bubble" ||
    role === "korean_translation" ||
    role === "korean_narration" ||
    role === "label"
  );
}

const ROLE_LABELS: Record<WebtoonTextRole, string> = {
  english_bubble: "영어 말풍선",
  korean_translation: "한글 번역",
  korean_narration: "한글 나레이션",
  label: "라벨",
  decorative: "장식 텍스트",
  other: "기타",
};

export function webtoonTextRoleLabel(role: WebtoonTextRole): string {
  return ROLE_LABELS[role] ?? "텍스트";
}

/** Default editor font stack — Pretendard is loaded app-wide (layout.tsx CDN). */
export const WEBTOON_TEXT_FONT_FAMILY =
  '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
