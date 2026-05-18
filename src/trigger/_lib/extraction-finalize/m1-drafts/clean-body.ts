import type { ExtractionItemSnapshot } from "@/lib/extraction/types";

/**
 * For groups whose question types don't need AI restoration (지칭/일치/
 * 주제/제목/목적 etc.), build the clean body locally: concat the
 * PASSAGE_BODY block contents, then strip problem-sheet markers that the
 * teacher will not want in the saved passage. Returns empty string when
 * no PASSAGE_BODY block was classified — caller falls back to rawText.
 *
 * `isPurePassage`: when the source page has no question stems at all
 * (teacher uploaded a reading-passage anthology), additionally scrub
 * navigation labels like "PASSAGE 03" that the OCR keeps in the body.
 * Exam-sheet bodies (where this is false) never carry such labels, so
 * the extra strip is gated to avoid touching them.
 */
export function buildCleanBodyForSkippedGroup(
  groupItems: ExtractionItemSnapshot[],
  options: { isPurePassage?: boolean } = {},
): string {
  const bodies = groupItems
    .filter((item) => item.blockType === "PASSAGE_BODY")
    .sort((a, b) => a.order - b.order)
    .map((item) => item.content.trim())
    .filter((content) => content.length > 0);
  if (bodies.length === 0) return "";

  let cleaned = bodies.join("\n\n");
  // ①②③④⑤ inline markers that classify attached for marker-position
  // recovery — useful as raw evidence, but the clean passage shouldn't
  // carry them.
  cleaned = cleaned.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "");
  // (A)~(D) chunk labels at line starts (ordering questions).
  cleaned = cleaned.replace(/(^|\n)[ \t]*\(([A-D])\)[ \t]*/g, "$1");
  // (a)~(e) inline referent markers placed in front of words.
  cleaned = cleaned.replace(/\(([a-e])\)(?=\s|[,.!?:;])/g, "");

  // Pure-passage anthologies only: scrub passage-index navigation
  // labels that appear as their own line (PASSAGE 03, Passage 1,
  // Passage One). Exam sheets never look like this, so we keep this
  // gated to avoid eating a legitimate exam-body fragment.
  if (options.isPurePassage) {
    cleaned = cleaned.replace(
      /(^|\n)\s*PASSAGE\s+(?:\d+|[A-Z][a-z]+)\s*(?=\n|$)/gi,
      "$1",
    );
  }

  // Score tags `[3점]` / `[1.5점]` that the OCR sometimes folds into the
  // body next to a question stem.
  cleaned = cleaned.replace(/\[[0-9.]+점\]/g, "");

  // Safety net: PASSAGE_BODY classified by OCR may absorb question stems,
  // multiple-choice options, and Korean meta instructions. Walk line by
  // line and drop anything that looks problem-sheet not body. Word-gloss
  // footnotes (`*word 한글뜻`) ARE legitimate body content — preserve them.
  //
  // `inSkipRegion` is a one-way latch — once a `<보기>` / `<조건>` block
  // marker appears, every subsequent line is teacher-annotation metadata
  // (numbered English-option grid, Korean scoring rules, etc) and is
  // dropped. This catches the case where the OCR lumps the `<보기>` lookup
  // grid into the PASSAGE_BODY block and the numbered options have 0%
  // Korean so the ratio fallback can't filter them out (issue 3 / #27).
  const lines = cleaned.split(/\n/);
  const kept: string[] = [];
  let inSkipRegion = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inSkipRegion) continue;
    if (trimmed.length === 0) {
      kept.push(line);
      continue;
    }
    // Word-gloss footnote: `*scapegoat 희생양`, `*resilience 회복력` etc.
    // Lines starting with `*` followed by a word are teacher glossary
    // entries — keep them even though they contain Korean.
    if (/^\*\s*[A-Za-z]/.test(trimmed)) {
      kept.push(line);
      continue;
    }
    // `<보기>` / `<조건>` block markers — open a skip region for the
    // remainder of the body. Anything after is the option grid /
    // condition list, never body prose.
    if (
      /^[<＜][\s]*(보기|조건)[\s]*[>＞]/.test(trimmed) ||
      /^(<\s*보기\s*>|＜\s*보기\s*＞)/.test(trimmed)
    ) {
      inSkipRegion = true;
      continue;
    }
    // Multiple-choice option line: `① happiness`, `①happiness` etc.
    // Body inferences sometimes embed circled numbers inline but never
    // lead a line with one — leading position = option list.
    if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(trimmed)) continue;
    // Korean instruction stem (e.g. "다음 글의 빈칸에 …", "윗글의 …").
    // These can have <30% Korean by char ratio when laced with English
    // markers, so match the leading head explicitly.
    if (/^(다음|윗글|위 글|이 글|아래|보기|<보기>|＜보기＞)/.test(trimmed))
      continue;
    // Korean meta annotation line — `※`, `*`, `‣` etc. teacher footers
    // that the OCR sometimes folds into the body.
    if (/^[※‣▶▷]/.test(trimmed)) continue;
    // Fall back to the original ratio check for any other Korean-heavy
    // line that slipped past the explicit patterns.
    const koreanChars = (line.match(/[가-힣]/g) ?? []).length;
    const totalChars = line.replace(/\s/g, "").length;
    if (totalChars === 0) {
      kept.push(line);
      continue;
    }
    if (koreanChars / totalChars >= 0.3) continue;
    kept.push(line);
  }
  cleaned = kept.join("\n");
  // Collapse the gaps introduced by the strips above.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/ +(?=\n)/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/**
 * Pure-passage drafts (no question stems, just reading material) need a
 * title in the library view. Read it from the first PASSAGE_BODY's
 * `passageMeta.title` if the OCR prompt produced one. Returns null when
 * no usable title is present — the caller leaves `title` as null.
 */
export function extractPurePassageTitle(
  groupItems: ExtractionItemSnapshot[],
): string | null {
  const anchor = groupItems
    .filter((item) => item.blockType === "PASSAGE_BODY")
    .sort((a, b) => a.order - b.order)[0];
  if (!anchor) return null;
  const meta = anchor.passageMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const title = (meta as Record<string, unknown>).title;
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}
