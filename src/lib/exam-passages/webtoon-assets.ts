import type { ExamPassage } from "@/lib/exam-passages/types";
import { formatExamTitle, qLabel } from "@/lib/exam-passages/format";
import type { WebtoonLanguageId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

export const EXAM_PASSAGE_WEBTOON_STYLE = "KOREAN_WEBTOON" as const;
export const EXAM_PASSAGE_WEBTOON_STYLES = [
  EXAM_PASSAGE_WEBTOON_STYLE,
  "CUTE_PASTEL",
  "MACHO_BLACK_RED",
] as const;

export type ExamPassageWebtoonStyle =
  (typeof EXAM_PASSAGE_WEBTOON_STYLES)[number];

export const EXAM_PASSAGE_WEBTOON_STYLE_LABELS: Record<
  ExamPassageWebtoonStyle,
  string
> = {
  KOREAN_WEBTOON: "기존 교육 웹툰",
  CUTE_PASTEL: "화이트톤 학습 웹툰",
  MACHO_BLACK_RED: "블랙·레드 액션 웹툰",
};

export const EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS = 3;

export const EXAM_PASSAGE_WEBTOON_LANGUAGES: WebtoonLanguageId[] = [
  "KO",
  "KO_EN",
  "EN",
  "EN_KO_GLOSS",
];

export const EXAM_PASSAGE_WEBTOON_APPROVED_STATUS = "APPROVED";

export type ExamPassageWebtoonStatus =
  | "PENDING"
  | "GENERATING"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "FAILED";

export interface ExamPassageWebtoonAssetSummary {
  id: string;
  examPassageId: string;
  style: ExamPassageWebtoonStyle;
  language: WebtoonLanguageId;
  status: ExamPassageWebtoonStatus;
  imageUrl: string | null;
  previewBlurred: boolean;
  purchased: boolean;
  credits: number;
  reviewedAt: string | null;
}

export interface ExamPassageWebtoonAvailabilityResponse {
  ok: true;
  byPassageId: Record<string, ExamPassageWebtoonAssetSummary[]>;
}

export function isExamPassageWebtoonStyle(
  value: unknown,
): value is ExamPassageWebtoonStyle {
  return (
    typeof value === "string" &&
    EXAM_PASSAGE_WEBTOON_STYLES.some((style) => style === value)
  );
}

const LANGUAGE_PROMPTS: Record<WebtoonLanguageId, string> = {
  KO:
    "한국어 전용. 모든 대사와 내레이션을 자연스럽고 정확한 한국어로 쓴다. 단, 원문 영어 핵심 구절 5-8개는 반드시 별도 인용 박스에 정확히 넣는다. 한국어만 있는 결과는 실패다.",
  KO_EN:
    "한+영 병기. 영어 말풍선/인용 박스에는 원문 영어 구절을 정확히 넣고, 바로 아래 한국어 번역 캡션을 붙인다. 영어와 한국어가 1:1로 대응되게 한다.",
  EN:
    "영어 전용. 지문 원문 영어 표현을 최대한 그대로 사용한다. 한국어 텍스트는 넣지 않는다.",
  EN_KO_GLOSS:
    "대사는 영어, 장면 설명과 내레이션은 한국어. 영어 말풍선은 원문 영어 구절을 정확히 사용하고, 설명 박스는 한국어로 흐름을 풀어준다.",
};

const FORBIDDEN_WEBTOON_TEXT = [
  "정답",
  "정답 포인트",
  "선택지",
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "문제 풀이",
  "요지 문제",
  "주제 문제",
  "제목 문제",
  "빈칸",
  "밑줄 의미",
  "삽입",
  "순서",
  "어법",
  "어휘",
  "일치하는",
  "일치하지 않는",
];

const MAX_CORE_PHRASE_LENGTH = 280;
const MIN_CORE_PHRASE_LENGTH = 90;

export function examPassageContentHash(passage: Pick<ExamPassage, "id" | "text">): string {
  return fnv1a(`${passage.id}\n${passage.text}`);
}

export function buildExamPassageWebtoonPrompt(
  passage: ExamPassage,
  language: WebtoonLanguageId,
  correction?: string,
): string {
  const title = formatExamTitle(passage);
  const corePhrases = examPassageCoreEnglishPhrases(passage.text);
  const forbidden = FORBIDDEN_WEBTOON_TEXT.map((v) => `"${v}"`).join(", ");
  const correctionBlock = correction?.trim()
    ? `IMPORTANT CORRECTION: ${correction.trim()}\n`
    : "";

  return `${correctionBlock}Use case: illustration-story
Asset type: one complete vertical educational Korean webtoon page for high-school English passage comprehension

Primary request: Create ONE complete tall Korean educational webtoon image that helps students understand this exam passage's CONTENT. This is NOT a test-solution image. Generate artwork and all Korean/English text together inside the image itself. No post-added text. No watermark.

Passage ID: ${passage.id}
Passage title: ${title}
Question numbers: ${qLabel(passage.qNumbers)}
Content theme: Turn the passage into a clear story/explanation that preserves its core logic, examples, contrast, cause-effect, and final takeaway.

Visual style: original Korean school-life webtoon, mostly black-and-white, clean thin lines, soft gray shading, quiet school/classroom/life scenes, large readable narration boxes, generous white margins, rectangular panels, sparse pastel accents only for key icons. Do not copy any existing character, logo, franchise, webtoon, or real brand.

Language mode: ${LANGUAGE_PROMPTS[language]}

Format: tall 9:16 vertical page, 10-12 rectangular panels, readable on a phone. Use narration boxes more than crowded speech bubbles. Leave enough white space so no text is tiny, cropped, or touching panel borders.

Forbidden content: Do NOT include answer choices, option numbers, panel numbers such as "1."/"2."/"3.", large black numbered panel labels, ${forbidden}, problem labels, test-taking advice, answer hints, or any question-solving framing. This page is only for understanding the passage content.

STRICT TEXT RULES:
- All visible text must be generated as part of the image pixels during image generation.
- Do not leave blank speech bubbles or filler symbols.
- Korean must be natural and correctly spelled.
- English phrases must be exactly spelled.
- Do not invent English. Use only the provided source passage and the exact core phrases below.
- Every Core English phrase below must appear visibly and readably inside the image, even in Korean-only mode.
- Never crop or cut off an English phrase. If a phrase is long, wrap it across multiple lines inside one large quote/caption box.
- No nonsense words, fake letters, cropped text, tiny filler text, or watermark.

Core English phrases to render clearly:
${corePhrases.map((phrase, index) => `${index + 1}. "${phrase}"`).join("\n")}

Storyboard requirements:
1. Title panel: a concise content title, not a problem type.
2. Introduce the passage's central situation or concept.
3-9. Show the passage logic step by step with concrete visual scenes, examples, contrast, or cause-effect.
10-12. Final memory panel with a short takeaway sentence appropriate for the language mode.

Source passage:
"""${passage.text.trim()}"""

Accuracy constraints: Explain the passage content clearly. Do not make this a question explanation. Do not add facts, dates, numbers, brands, places, events, biological mechanisms, or claims that are not supported by the passage. For example, do not add muscles, joints, blood circulation, brain science, dates, locations, or causal mechanisms unless the source passage explicitly states them. All text must be part of the generated image.`;
}

export function examPassageCoreEnglishPhrases(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24);
  const source = sentences.length > 0 ? sentences : [cleaned];
  const picked: string[] = [];
  const target = Math.min(8, Math.max(5, source.length));
  const step = source.length <= target ? 1 : (source.length - 1) / (target - 1);
  for (let i = 0; i < target; i += 1) {
    const s = source[Math.round(i * step)] ?? source[source.length - 1];
    const phrase = clipPhrase(s);
    if (phrase && !picked.includes(phrase)) picked.push(phrase);
  }
  return picked.slice(0, 8);
}

function clipPhrase(sentence: string): string {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_CORE_PHRASE_LENGTH) return balanceDoubleQuotes(normalized);
  const clipped = normalized.slice(0, MAX_CORE_PHRASE_LENGTH);
  const boundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf(": "),
    clipped.lastIndexOf(", "),
  );
  if (boundary >= MIN_CORE_PHRASE_LENGTH) {
    return balanceDoubleQuotes(cleanPhraseEnd(clipped.slice(0, boundary)));
  }
  const lastSpace = clipped.lastIndexOf(" ");
  return balanceDoubleQuotes(
    cleanPhraseEnd(lastSpace > MIN_CORE_PHRASE_LENGTH ? clipped.slice(0, lastSpace) : clipped),
  );
}

function cleanPhraseEnd(value: string): string {
  return value.replace(/[,:;—\-?!]\s*$/, "").trim();
}

function balanceDoubleQuotes(value: string): string {
  const phrase = value.trim();
  const quoteCount = (phrase.match(/"/g) ?? []).length;
  if (quoteCount % 2 === 0) return phrase;
  if (phrase.startsWith('"') && quoteCount === 1) return phrase.slice(1).trim();
  if (phrase.endsWith('"')) return phrase.slice(0, -1).trim();
  return phrase;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
