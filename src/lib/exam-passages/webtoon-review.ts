import "server-only";
import sharp from "sharp";
import type { ExamPassage } from "@/lib/exam-passages/types";
import type { WebtoonLanguageId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";
import {
  ATLAS_WEBTOON_REVIEW_MODEL_ID,
} from "@/lib/atlas-ai";
import { postAtlasChatCompletionAsGeminiLike } from "@/lib/atlas-chat-rest";
import { recordAiCost } from "@/lib/platform-api-costs";
import { detectWebtoonText } from "@/lib/webtoon-text/detect";
import { examPassageCoreEnglishPhrases } from "./webtoon-assets";

const REVIEW_IMAGE_MAX_W = 1536;
const REVIEW_PASS_SCORE = 0.9;

const FORBIDDEN_TEXT = [
  "\uc815\ub2f5",
  "\uc815\ub2f5 \uc0ac\uc778",
  "\uc120\ud0dd\uc9c0",
  "\ubb38\uc81c \uc720\ud615",
  "\uc694\uc9c0 \ubb38\uc81c",
  "\uc8fc\uc81c \ubb38\uc81c",
  "\uc81c\ubaa9 \ubb38\uc81c",
  "\ube48\uce78",
  "\ubc11\uc904 \uc758\ubbf8",
  "\uc0bd\uc785",
  "\uc21c\uc11c",
  "\uc5b4\ubc95",
  "\uc5b4\ud718",
  "\uc77c\uce58\ud558\ub294",
  "\uc77c\uce58\ud558\uc9c0 \uc54a\ub294",
  "\u2460",
  "\u2461",
  "\u2462",
  "\u2463",
  "\u2464",
];

const FORBIDDEN_ENGLISH_PATTERNS = [
  /\banswer\s+choices?\b/i,
  /\bcorrect\s+answer\b/i,
  /\btest[-\s]?taking\b/i,
  /\bquestion\s+type\b/i,
];

const PANEL_NUMBER_RE = /^\s*(?:[1-9]|1[0-2])[\.)]?\s*$/;
const LEADING_PANEL_NUMBER_RE = /^\s*(?:[1-9]|1[0-2])[\.)]\s+\S/;

const UNSUPPORTED_FACT_GUARDS = [
  { source: /\bmuscles?\b/i, terms: ["\uadfc\uc721", "muscle", "muscles"] },
  { source: /\bjoints?\b/i, terms: ["\uad00\uc808", "joint", "joints"] },
  { source: /\bblood\b|\bcirculation\b/i, terms: ["\ud608\uc561", "\uc21c\ud658", "blood", "circulation"] },
  { source: /\bbrains?\b/i, terms: ["\ub1cc", "brain", "brains"] },
  { source: /\bhormones?\b/i, terms: ["\ud638\ub974\ubaac", "hormone", "hormones"] },
  { source: /\binjur(?:y|ies)|\bhurt\b|\bwound/i, terms: ["\ubd80\uc0c1", "injury", "injuries"] },
  { source: /\brisk\b|\bdanger(?:ous(?:ly)?)?\b|\bhazard/i, terms: ["\uc704\ud5d8", "risk", "danger", "hazard"] },
] as const;

export interface ExamPassageWebtoonReviewResult {
  pass: boolean;
  score: number;
  reviewedAt: string;
  model: string;
  reasons: string[];
  correction: string;
  checks: {
    localPass: boolean;
    modelPass: boolean;
    vertical: boolean;
    aspectRatio: number;
    requiredCorePhraseCount: number;
    matchedCorePhraseCount: number;
    missingCorePhrases: string[];
    forbiddenMatches: string[];
    unsupportedFactMatches: string[];
    panelNumberMatches: string[];
    languageMode: {
      pass: boolean;
      koreanCharCount: number;
      latinCharCount: number;
      reasons: string[];
    };
    regionCount: number;
    detectedTextLength: number;
  };
  detected: {
    width: number;
    height: number;
    texts: Array<{
      role: string;
      lang: string;
      text: string;
    }>;
  };
  modelReview: {
    pass: boolean;
    score: number;
    reasons: string[];
    unsupportedFacts: string[];
    brokenText: string[];
    englishPhraseIssues: string[];
    forbiddenText: string[];
    styleIssues: string[];
    panelIssues: string[];
  };
}

interface ReviewInput {
  passage: ExamPassage;
  language: WebtoonLanguageId;
  imageUrl: string;
  imageBuffer?: Buffer;
  assetId?: string;
  academyId?: string | null;
}

interface RawModelReview {
  pass?: unknown;
  score?: unknown;
  reasons?: unknown;
  correction?: unknown;
  unsupportedFacts?: unknown;
  brokenText?: unknown;
  englishPhraseIssues?: unknown;
  forbiddenText?: unknown;
  styleIssues?: unknown;
  panelIssues?: unknown;
}

export async function reviewExamPassageWebtoonImage(
  input: ReviewInput,
): Promise<ExamPassageWebtoonReviewResult> {
  const imageBuffer = input.imageBuffer ?? (await fetchImageBuffer(input.imageUrl));
  const corePhrases = examPassageCoreEnglishPhrases(input.passage.text);
  const reviewedAt = new Date().toISOString();

  let doc: Awaited<ReturnType<typeof detectWebtoonText>>;
  try {
    doc = await detectWebtoonText({
      imageBuffer,
      originalUrl: input.imageUrl,
      academyId: input.academyId,
    });
  } catch (error) {
    const reason = `Text detection failed, so the image cannot be approved: ${errorMessage(error)}`;
    return detectionFailure({
      reviewedAt,
      model: ATLAS_WEBTOON_REVIEW_MODEL_ID,
      corePhrases,
      reason,
    });
  }

  const texts = doc.boxes
    .map((box) => ({
      role: box.role,
      lang: box.lang,
      text: normalizeDetectedText(box.text || box.sourceText || ""),
    }))
    .filter((item) => item.text.length > 0);
  const allDetectedText = texts.map((item) => item.text).join("\n");
  const aspectRatio = doc.height / Math.max(1, doc.width);
  const missingCorePhrases = corePhrases.filter(
    (phrase) => !containsExactPhrase(allDetectedText, phrase),
  );
  const requiredCorePhraseCount = corePhrases.length;
  const matchedCorePhraseCount = corePhrases.length - missingCorePhrases.length;
  const forbiddenMatches = findForbiddenMatches(allDetectedText);
  const unsupportedFactMatches = findUnsupportedFactMatches(
    input.passage.text,
    allDetectedText,
  );
  const languageMode = checkLanguageMode(input.language, allDetectedText);
  const panelNumberMatches = texts
    .filter((item) => PANEL_NUMBER_RE.test(item.text) || LEADING_PANEL_NUMBER_RE.test(item.text))
    .map((item) => item.text);

  const localReasons: string[] = [];
  if (aspectRatio < 1.45) {
    localReasons.push(`Image is not clearly vertical 9:16-ish (ratio ${aspectRatio.toFixed(2)}).`);
  }
  if (matchedCorePhraseCount < requiredCorePhraseCount) {
    localReasons.push(
      `Only ${matchedCorePhraseCount}/${requiredCorePhraseCount} required exact English core phrases were detected.`,
    );
  }
  if (forbiddenMatches.length > 0) {
    localReasons.push(`Forbidden problem-solving text was detected: ${summarizeMatches(forbiddenMatches)}.`);
  }
  if (unsupportedFactMatches.length > 0) {
    localReasons.push(
      `Source-unsupported factual terms were detected: ${summarizeMatches(unsupportedFactMatches)}.`,
    );
  }
  if (panelNumberMatches.length > 0) {
    localReasons.push(
      `Standalone panel/option-like number labels were detected (${panelNumberMatches.length} regions): ${summarizeMatches(panelNumberMatches)}.`,
    );
  }
  localReasons.push(...languageMode.reasons);

  const modelReview = await runVisionReview({
    imageBuffer,
    passage: input.passage,
    language: input.language,
    corePhrases,
    detectedTexts: texts,
  });

  const modelPass = modelReview.pass && modelReview.score >= REVIEW_PASS_SCORE;
  const localPass = localReasons.length === 0;
  const pass = localPass && modelPass;
  const reasons = uniqueStrings([
    ...localReasons,
    ...(!modelPass ? modelReview.reasons : []),
  ]);
  const score = pass
    ? Math.min(1, modelReview.score)
    : Math.min(modelReview.score, localPass ? 0.89 : 0.49);
  const correction = buildCorrection({
    localReasons,
    missingCorePhrases,
    forbiddenMatches,
    unsupportedFactMatches,
    panelNumberMatches,
    modelCorrection: modelReview.correction,
    modelReasons: modelReview.reasons,
  });

  return {
    pass,
    score,
    reviewedAt,
    model: ATLAS_WEBTOON_REVIEW_MODEL_ID,
    reasons,
    correction,
    checks: {
      localPass,
      modelPass,
      vertical: aspectRatio >= 1.45,
      aspectRatio: Number(aspectRatio.toFixed(3)),
      requiredCorePhraseCount,
      matchedCorePhraseCount,
      missingCorePhrases,
      forbiddenMatches,
      unsupportedFactMatches,
      panelNumberMatches,
      languageMode,
      regionCount: texts.length,
      detectedTextLength: allDetectedText.length,
    },
    detected: {
      width: doc.width,
      height: doc.height,
      texts: texts.slice(0, 90),
    },
    modelReview: {
      pass: modelReview.pass,
      score: modelReview.score,
      reasons: modelReview.reasons,
      unsupportedFacts: modelReview.unsupportedFacts,
      brokenText: modelReview.brokenText,
      englishPhraseIssues: modelReview.englishPhraseIssues,
      forbiddenText: modelReview.forbiddenText,
      styleIssues: modelReview.styleIssues,
      panelIssues: modelReview.panelIssues,
    },
  };
}

async function runVisionReview(opts: {
  imageBuffer: Buffer;
  passage: ExamPassage;
  language: WebtoonLanguageId;
  corePhrases: string[];
  detectedTexts: Array<{ role: string; lang: string; text: string }>;
}) {
  const reviewBuffer = await sharp(opts.imageBuffer, { failOn: "none" })
    .resize({ width: REVIEW_IMAGE_MAX_W, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const model = ATLAS_WEBTOON_REVIEW_MODEL_ID;
  const body = await postAtlasChatCompletionAsGeminiLike({
    model,
    systemPrompt:
      "You are an uncompromising Korean educational webtoon QA reviewer. Inspect the image directly and compare it to the source passage. Fail whenever uncertain.",
    userPrompt: buildReviewPrompt(opts),
    image: { mimeType: "image/jpeg", base64: reviewBuffer.toString("base64") },
    temperature: 0,
    responseMimeType: "application/json",
    maxOutputTokens: 8192,
    timeoutInMs: 120_000,
    reasoning: { enabled: false, effort: "none", exclude: true },
  });

  await recordAiCost({
    sourceType: "WEBTOON_TEXT",
    sourceDetail: "review",
    model,
    operationType: "WEBTOON_TEXT_REVIEW",
    usage: body,
  });

  const finishReason = body.candidates?.[0]?.finishReason;
  const rawText =
    body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ??
    "";
  const parsed = parseJsonLoose(rawText);
  if (!parsed) {
    return coerceModelReview({
      pass: false,
      score: 0,
      reasons: ["Review model returned unparseable JSON."],
      correction: "Regenerate with simpler, larger, clearly readable baked-in text and no invented details.",
    });
  }
  const review = coerceModelReview(parsed);
  if (finishReason && finishReason !== "STOP") {
    review.pass = false;
    review.score = Math.min(review.score, 0.5);
    review.reasons = uniqueStrings([
      ...review.reasons,
      `Review model stopped early (finishReason=${finishReason}).`,
    ]);
  }
  return review;
}

function buildReviewPrompt(opts: {
  passage: ExamPassage;
  language: WebtoonLanguageId;
  corePhrases: string[];
  detectedTexts: Array<{ role: string; lang: string; text: string }>;
}) {
  const detected = opts.detectedTexts
    .slice(0, 90)
    .map((item, index) => `${index + 1}. [${item.role}/${item.lang}] ${item.text}`)
    .join("\n")
    .slice(0, 7000);

  return `Review this generated educational webtoon for an English exam passage.

Pass only if every requirement is satisfied:
- Text is baked into the generated image itself, not post-added.
- Korean text is natural, readable, not broken, not cropped, and not tiny.
- English text is exactly spelled and readable.
- Every exact core English phrase below is visible and readable.
- Language mode is strict: KO uses Korean narration plus exact English quote boxes; KO_EN contains both English and Korean; EN contains English only with no Korean text; EN_KO_GLOSS uses English dialogue/quotes plus Korean narration or explanations.
- The image explains only the source passage content. Reject invented facts, extra mechanisms, dates, locations, brands, or claims.
- Reject unsupported biological/scientific mechanisms such as muscles, joints, blood circulation, brain science, hormones, etc. unless the passage explicitly says them.
- Reject answer choices, option numbers, question type labels, test-taking advice, answer hints, or standalone large panel numbers.
- Reject if the style is not a clean original Korean school-life educational webtoon with mostly black-and-white thin line art.
- Reject if any panel is incoherent, cropped, unreadable, or contains filler/gibberish text.

Language mode: ${opts.language}

Core English phrases that should appear exactly:
${opts.corePhrases.map((phrase, index) => `${index + 1}. "${phrase}"`).join("\n")}

Source passage:
"""${opts.passage.text.trim()}"""

OCR/detected text aid, for cross-checking only. You must still inspect the image directly:
${detected || "(none)"}

Return ONLY JSON with this exact shape:
{
  "pass": boolean,
  "score": number,
  "reasons": string[],
  "correction": string,
  "unsupportedFacts": string[],
  "brokenText": string[],
  "englishPhraseIssues": string[],
  "forbiddenText": string[],
  "styleIssues": string[],
  "panelIssues": string[]
}`;
}

function coerceModelReview(value: RawModelReview) {
  const score = clampNumber(
    typeof value.score === "number" ? value.score : Number(value.score),
    0,
    1,
  );
  const reasons = coerceStringArray(value.reasons);
  return {
    pass: value.pass === true,
    score,
    reasons,
    correction:
      typeof value.correction === "string" && value.correction.trim()
        ? value.correction.trim()
        : reasons.join(" ").slice(0, 900),
    unsupportedFacts: coerceStringArray(value.unsupportedFacts),
    brokenText: coerceStringArray(value.brokenText),
    englishPhraseIssues: coerceStringArray(value.englishPhraseIssues),
    forbiddenText: coerceStringArray(value.forbiddenText),
    styleIssues: coerceStringArray(value.styleIssues),
    panelIssues: coerceStringArray(value.panelIssues),
  };
}

function detectionFailure(opts: {
  reviewedAt: string;
  model: string;
  corePhrases: string[];
  reason: string;
}): ExamPassageWebtoonReviewResult {
  return {
    pass: false,
    score: 0,
    reviewedAt: opts.reviewedAt,
    model: opts.model,
    reasons: [opts.reason],
    correction:
      "Regenerate with larger, simpler, clearly readable baked-in text boxes. Include at least five exact source English phrases and no invented facts.",
    checks: {
      localPass: false,
      modelPass: false,
      vertical: false,
      aspectRatio: 0,
      requiredCorePhraseCount: opts.corePhrases.length,
      matchedCorePhraseCount: 0,
      missingCorePhrases: opts.corePhrases,
      forbiddenMatches: [],
      unsupportedFactMatches: [],
      panelNumberMatches: [],
      languageMode: {
        pass: false,
        koreanCharCount: 0,
        latinCharCount: 0,
        reasons: ["Text detection did not complete, so language mode could not be verified."],
      },
      regionCount: 0,
      detectedTextLength: 0,
    },
    detected: { width: 0, height: 0, texts: [] },
    modelReview: {
      pass: false,
      score: 0,
      reasons: [opts.reason],
      unsupportedFacts: [],
      brokenText: [],
      englishPhraseIssues: [],
      forbiddenText: [],
      styleIssues: [],
      panelIssues: [],
    },
  };
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch image for review (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function normalizeDetectedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForPhraseMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u02da\u00ba]/g, "\u00b0")
    .replace(/\s+/g, " ")
    .trim();
}

function containsExactPhrase(haystack: string, phrase: string): boolean {
  const normalizedHaystack = normalizeForPhraseMatch(haystack);
  const normalizedPhrase = normalizeForPhraseMatch(phrase);
  if (normalizedPhrase.length === 0) return false;
  if (normalizedHaystack.includes(normalizedPhrase)) return true;
  const looseHaystack = normalizeForLoosePhraseMatch(normalizedHaystack);
  const loosePhrase = normalizeForLoosePhraseMatch(normalizedPhrase);
  return loosePhrase.length > 0 && looseHaystack.includes(loosePhrase);
}

function normalizeForLoosePhraseMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\uac00-\ud7a3]+/g, "");
}

function findForbiddenMatches(text: string): string[] {
  const rawMatches = FORBIDDEN_TEXT.filter((item) => text.includes(item));
  const normalized = normalizeForPhraseMatch(text);
  const patternMatches = FORBIDDEN_ENGLISH_PATTERNS
    .filter((pattern) => pattern.test(normalized))
    .map((pattern) => pattern.source);
  return uniqueStrings([...rawMatches, ...patternMatches]);
}

function findUnsupportedFactMatches(sourceText: string, detectedText: string): string[] {
  const normalizedSource = normalizeForPhraseMatch(sourceText);
  const normalizedDetected = normalizeForPhraseMatch(detectedText).toLowerCase();
  const matches: string[] = [];
  for (const guard of UNSUPPORTED_FACT_GUARDS) {
    if (guard.source.test(normalizedSource)) continue;
    for (const term of guard.terms) {
      const normalizedTerm = normalizeForPhraseMatch(term).toLowerCase();
      if (normalizedTerm && detectedContainsTerm(normalizedDetected, normalizedTerm)) {
        matches.push(term);
      }
    }
  }
  return uniqueStrings(matches);
}

function detectedContainsTerm(normalizedDetected: string, normalizedTerm: string): boolean {
  if (/^[a-z0-9-]+$/i.test(normalizedTerm)) {
    return new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "i").test(normalizedDetected);
  }
  return normalizedDetected.includes(normalizedTerm);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkLanguageMode(language: WebtoonLanguageId, text: string) {
  const koreanCharCount = countMatches(text, /[\uac00-\ud7a3]/g);
  const latinCharCount = countMatches(text, /[A-Za-z]/g);
  const reasons: string[] = [];

  if (language === "EN") {
    if (koreanCharCount > 0) {
      reasons.push(
        `Language mode EN requires English-only visible text, but ${koreanCharCount} Korean characters were detected.`,
      );
    }
    if (latinCharCount < 80) {
      reasons.push("Language mode EN requires substantial readable English text.");
    }
  } else if (language === "KO") {
    if (koreanCharCount < 40) {
      reasons.push("Language mode KO requires substantial Korean narration or dialogue.");
    }
    if (latinCharCount < 80) {
      reasons.push("Language mode KO still requires exact source English quote boxes.");
    }
  } else if (language === "KO_EN" || language === "EN_KO_GLOSS") {
    if (koreanCharCount < 40) {
      reasons.push(`Language mode ${language} requires readable Korean text.`);
    }
    if (latinCharCount < 80) {
      reasons.push(`Language mode ${language} requires readable English text.`);
    }
  }

  return {
    pass: reasons.length === 0,
    koreanCharCount,
    latinCharCount,
    reasons,
  };
}

function buildCorrection(input: {
  localReasons: string[];
  missingCorePhrases: string[];
  forbiddenMatches: string[];
  unsupportedFactMatches: string[];
  panelNumberMatches: string[];
  modelCorrection: string;
  modelReasons: string[];
}): string {
  const parts: string[] = [];
  if (input.modelCorrection) parts.push(input.modelCorrection);
  if (input.localReasons.length > 0) {
    parts.push("Fix every local QA failure before approval: exact source English, source-supported facts only, no forbidden text, and no panel/option numbering.");
  }
  if (input.missingCorePhrases.length > 0) {
    parts.push(
      `Render these exact English phrases clearly in separate quote/caption boxes: ${input.missingCorePhrases
        .slice(0, 5)
        .map((phrase) => `"${phrase}"`)
        .join("; ")}.`,
    );
  }
  if (input.forbiddenMatches.length > 0) {
    parts.push(`Remove forbidden problem-solving text: ${summarizeMatches(input.forbiddenMatches)}.`);
  }
  if (input.unsupportedFactMatches.length > 0) {
    parts.push(`Remove source-unsupported factual terms/details: ${summarizeMatches(input.unsupportedFactMatches)}.`);
  }
  if (input.panelNumberMatches.length > 0) {
    parts.push("Remove standalone panel numbers or option-like number labels.");
  }
  if (parts.length === 0 && input.modelReasons.length > 0) {
    parts.push(input.modelReasons.join(" "));
  }
  return (
    parts.join(" ").slice(0, 1400) ||
    "Regenerate with exact readable baked-in text, no invented details, and a consistent Korean school-life webtoon style."
  );
}

function parseJsonLoose(raw: string): RawModelReview | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as RawModelReview;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      try {
        const parsed = JSON.parse(repairJsonControlChars(candidate)) as RawModelReview;
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

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

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function summarizeMatches(values: string[], limit = 4, maxLength = 90): string {
  const trimmed = values
    .slice(0, limit)
    .map((value) => {
      const compact = value.replace(/\s+/g, " ").trim();
      return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
    });
  const suffix = values.length > limit ? `, +${values.length - limit} more` : "";
  return `${trimmed.join(", ")}${suffix}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
