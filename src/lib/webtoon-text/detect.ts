import "server-only";
import sharp from "sharp";
import { ATLAS_WEBTOON_DETECT_MODEL_ID } from "@/lib/atlas-ai";
import { postAtlasChatCompletionAsGeminiLike } from "@/lib/atlas-chat-rest";
import { recordAiCost } from "@/lib/platform-api-costs";
import {
  WEBTOON_TEXT_DOC_VERSION,
  WEBTOON_TEXT_FONT_FAMILY,
  isEditableRole,
  type WebtoonTextAlign,
  type WebtoonTextBox,
  type WebtoonTextDoc,
  type WebtoonTextLang,
  type WebtoonTextRole,
} from "./types";

// One Gemini multimodal call locates every baked-in text region and returns its content,
// role, language, colours and a normalized bounding box. We keep geometry in the image's
// NATIVE pixel space and refine the background colour with a sharp median sample (the model
// is good at layout/text but unreliable at exact colours — universal finding across manga
// tooling). Detection runs on a downscaled copy (coords are normalized, so accuracy holds)
// to keep the call fast/cheap; the box colour sampling uses the full-res buffer.

const DETECT_MAX_W = 1280;

const SYSTEM_PROMPT = `You are a precise vision system that locates EVERY block of rendered text baked into a comic/webtoon image and returns structured JSON. Be exhaustive — never miss a text block. Group a multi-line paragraph that belongs to ONE speech bubble or ONE caption/translation box into a SINGLE region (do not split per line). Tightly bound the text's background container (the whole bubble/box), not just the glyphs.`;

const USER_PROMPT = `Detect every distinct text region in this vertical educational webtoon.
For each region return an object with:
- "box_2d": [ymin, xmin, ymax, xmax] normalized 0-1000 (origin top-left), tight around the text's background container.
- "text": exact text content, preserving line breaks as \\n.
- "role": one of "english_bubble" (English dialogue in a speech bubble), "korean_translation" (Korean translation of a bubble, usually a flat pastel/cream band), "korean_narration" (Korean narration/caption box), "label" (short heading/label over art e.g. 'Egypt'), "decorative" (large stylized number/word baked into the art e.g. '7','13!','死'), "other".
- "lang": "ko" | "en" | "mixed" | "other".
- "bg": dominant background color of the container as #RRGGBB.
- "fg": dominant text color as #RRGGBB.
- "align": "left" | "center" | "right".
- "vertical": true only if glyphs stack top-to-bottom (rare; Korean dialogue is false).
Return ONLY JSON: { "regions": [ ... ] }. No commentary.`;

// Force structurally-valid JSON output. Without this, gemini-3.5-flash sometimes emits
// RAW newlines inside string values (e.g. multi-line bubble text), which is invalid JSON
// and made the whole detection fail to parse. responseSchema guarantees proper escaping.
const REGION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    regions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          box_2d: { type: "ARRAY", items: { type: "NUMBER" } },
          text: { type: "STRING" },
          role: { type: "STRING" },
          lang: { type: "STRING" },
          bg: { type: "STRING" },
          fg: { type: "STRING" },
          align: { type: "STRING" },
          vertical: { type: "BOOLEAN" },
        },
        required: ["box_2d", "text", "role"],
      },
    },
  },
  required: ["regions"],
} as const;

interface RawRegion {
  box_2d?: number[];
  text?: string;
  role?: string;
  lang?: string;
  bg?: string;
  fg?: string;
  align?: string;
  vertical?: boolean;
}

/**
 * Escape raw control chars (newline/tab/CR) that appear INSIDE JSON string values — a
 * belt-and-suspenders repair in case a model still returns unescaped multi-line strings.
 */
function repairJsonControlChars(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of input) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
    } else {
      out += ch;
      if (ch === '"') inString = true;
    }
  }
  return out;
}

function parseJsonLoose(raw: string): { regions?: RawRegion[] } | null {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      try {
        return JSON.parse(repairJsonControlChars(c));
      } catch {
        /* try next candidate */
      }
    }
  }
  return null;
}

function normalizeHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return (
      "#" +
      v
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    ).toLowerCase();
  }
  return fallback;
}

function coerceRole(role: string | undefined): WebtoonTextRole {
  switch ((role ?? "").toLowerCase()) {
    case "english_bubble":
      return "english_bubble";
    case "korean_translation":
    case "korean_caption":
      return "korean_translation";
    case "korean_narration":
      return "korean_narration";
    case "label":
      return "label";
    case "decorative":
    case "decorative_art_text":
      return "decorative";
    default:
      return "other";
  }
}

function coerceLang(lang: string | undefined): WebtoonTextLang {
  switch ((lang ?? "").toLowerCase()) {
    case "ko":
      return "ko";
    case "en":
      return "en";
    case "mixed":
      return "mixed";
    default:
      return "other";
  }
}

function coerceAlign(align: string | undefined): WebtoonTextAlign {
  switch ((align ?? "").toLowerCase()) {
    case "left":
      return "left";
    case "right":
      return "right";
    default:
      return "center";
  }
}

/** Median per-channel colour of a box region (text is a minority → median ≈ background). */
async function sampleMedianBg(
  rawRgb: { data: Buffer; width: number; height: number; channels: number },
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<string> {
  const { data, width, height, channels } = rawRgb;
  const x0 = Math.max(0, Math.min(width - 1, x));
  const y0 = Math.max(0, Math.min(height - 1, y));
  const x1 = Math.max(x0 + 1, Math.min(width, x + w));
  const y1 = Math.max(y0 + 1, Math.min(height, y + h));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 80));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 80));
  for (let py = y0; py < y1; py += stepY) {
    for (let px = x0; px < x1; px += stepX) {
      const idx = (py * width + px) * channels;
      rs.push(data[idx]);
      gs.push(data[idx + 1]);
      bs.push(data[idx + 2]);
    }
  }
  if (rs.length === 0) return "#ffffff";
  const med = (arr: number[]) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(med(rs))}${toHex(med(gs))}${toHex(med(bs))}`;
}

function estimateFontPx(text: string, w: number, h: number, lang: WebtoonTextLang): number {
  const charW = lang === "en" ? 0.52 : 0.95;
  const lines = text.split("\n");
  // estimate wrapped line count at a trial size, iterate down once
  let fs = Math.min(96, Math.max(10, Math.floor(h * 0.6)));
  for (let i = 0; i < 8 && fs > 10; i++) {
    const cpl = Math.max(1, Math.floor((w * 0.9) / (fs * charW)));
    let wrapped = 0;
    for (const ln of lines) {
      const len = Math.max(1, Array.from(ln).length);
      wrapped += Math.max(1, Math.ceil(len / cpl));
    }
    if (wrapped * fs * 1.32 <= h * 0.92) break;
    fs -= Math.max(2, Math.round(fs * 0.12));
  }
  return Math.max(10, fs);
}

export interface DetectWebtoonTextInput {
  imageBuffer: Buffer;
  originalUrl: string;
  /** 원가 기록 귀속용 학원 ID(웹툰/라우트에서 전달). */
  academyId?: string | null;
}

export async function detectWebtoonText(
  input: DetectWebtoonTextInput,
): Promise<WebtoonTextDoc> {
  const base = sharp(input.imageBuffer, { failOn: "none" });
  const meta = await base.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error("Could not read webtoon image dimensions");

  // Downscaled JPEG for the detection call (normalized coords → resolution-independent).
  const downscaleW = Math.min(DETECT_MAX_W, W);
  const detectBuf = await sharp(input.imageBuffer, { failOn: "none" })
    .resize({ width: downscaleW })
    .jpeg({ quality: 90 })
    .toBuffer();

  const model = ATLAS_WEBTOON_DETECT_MODEL_ID;
  let body: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: unknown;
    error?: { message?: string };
  };
  body = await postAtlasChatCompletionAsGeminiLike({
    model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    image: { mimeType: "image/jpeg", base64: detectBuf.toString("base64") },
    temperature: 0,
    responseMimeType: "application/json",
    maxOutputTokens: 16384,
    timeoutInMs: 90_000,
  });
  // Gemini-like usage lives in usageMetadata (promptTokenCount/candidatesTokenCount).
  await recordAiCost({
    sourceType: "WEBTOON_TEXT",
    sourceDetail: "detect",
    academyId: input.academyId,
    model,
    operationType: "WEBTOON_TEXT_DETECT",
    usage: body,
  });

  const finishReason = body.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    // MAX_TOKENS / SAFETY → the JSON is truncated; do NOT persist a silently-empty doc.
    throw new Error(`Gemini detection stopped early (finishReason=${finishReason})`);
  }
  const text =
    body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  const parsed = parseJsonLoose(text);
  if (!parsed || !Array.isArray(parsed.regions)) {
    throw new Error("Gemini detection returned unparseable JSON");
  }
  const rawRegions = parsed.regions;

  // Full-res raw pixels once, for background colour sampling. Force 3-channel sRGB so
  // grayscale/CMYK sources still yield valid R/G/B medians.
  const rawRgb = await sharp(input.imageBuffer, { failOn: "none" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgbInfo = {
    data: rawRgb.data,
    width: rawRgb.info.width,
    height: rawRgb.info.height,
    channels: rawRgb.info.channels,
  };

  const boxes: WebtoonTextBox[] = [];
  let i = 0;
  for (const r of rawRegions) {
    const b = Array.isArray(r.box_2d) ? r.box_2d : [];
    if (b.length < 4) continue;
    const [ymin, xmin, ymax, xmax] = b;
    if (![ymin, xmin, ymax, xmax].every((n) => typeof n === "number" && Number.isFinite(n))) {
      continue;
    }
    const x = Math.round((Math.min(xmin, xmax) / 1000) * W);
    const y = Math.round((Math.min(ymin, ymax) / 1000) * H);
    const w = Math.round((Math.abs(xmax - xmin) / 1000) * W);
    const h = Math.round((Math.abs(ymax - ymin) / 1000) * H);
    if (w < 6 || h < 6) continue;
    const role = coerceRole(r.role);
    const lang = coerceLang(r.lang);
    const sourceText = typeof r.text === "string" ? r.text : "";
    const bgColor = await sampleMedianBg(rgbInfo, x, y, w, h);
    const fg = normalizeHex(r.fg, "#1a1a1a");
    const fontSizePx = estimateFontPx(sourceText, w, h, lang);
    boxes.push({
      id: `b${i++}`,
      role,
      editable: isEditableRole(role),
      edited: false,
      x,
      y,
      w,
      h,
      rotation: 0,
      srcX: x,
      srcY: y,
      srcW: w,
      srcH: h,
      sourceText,
      text: sourceText,
      lang,
      fontFamily: WEBTOON_TEXT_FONT_FAMILY,
      fontSizePx,
      autoFit: true,
      color: fg,
      align: coerceAlign(r.align),
      vertical: Boolean(r.vertical),
      lineHeight: 1.3,
      bgColor,
      bgPadding: Math.max(2, Math.round(h * 0.06)),
      bgRadius: Math.max(4, Math.round(Math.min(w, h) * 0.12)),
      confidence: 0.9,
    });
  }

  return {
    version: WEBTOON_TEXT_DOC_VERSION,
    width: W,
    height: H,
    background: { originalUrl: input.originalUrl },
    detector: { model, detectedAt: new Date().toISOString(), downscaleW },
    boxes,
  };
}
