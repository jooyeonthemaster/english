// ============================================================================
// Passage segmentation — two implementations under one module.
//
// LEGACY (kept for backward-compat with extraction-finalize.ts):
//   - `PageOcrInput`, `segmentPages(pages)` — deterministic regex-driven
//     boundary detection on plain-text OCR output (M1 pipeline).
//
// STRUCTURED (new, Phase B / M2+M4 pipeline):
//   - `flattenStructuredResponses` — convert per-page StructuredOcrResponse
//     objects into ExtractionItem-ready drafts.
//   - `assignGroupIds` — bind CHOICE / EXPLANATION blocks to their nearest
//     ancestor QUESTION_STEM, and attach QUESTION_STEMs to the preceding
//     PASSAGE_BODY group.
//   - `buildEnrichedDrafts` — hydrate ExtractionItemSnapshot[] into the
//     passage-centric EnrichedDraft[] shape the review UI renders.
// ============================================================================

import type { BlockType, ExtractionItemSnapshot, ResultDraft } from "./types";
import type { StructuredOcrResponse } from "./ocr-prompt";
import { MIN_COMMIT_PASSAGE_LENGTH } from "./constants";

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — LEGACY plain-text segmentation (M1 default)
// ────────────────────────────────────────────────────────────────────────────
// The helpers below (`splitLines`, `detectMarker`, `Bucket` handling) are only
// used by `segmentPages`. They stay here so existing callers (extraction-
// finalize.ts → `segmentPages`) keep working while the structured pipeline
// matures.
// ════════════════════════════════════════════════════════════════════════════

/** Range marker: `[1~3]`, `[1 ～ 5]`, `[20-24]`, `[20∼24]` — all tilde variants. */
const RANGE_MARKER = /\[\s*(\d+)\s*[-~～∼]\s*(\d+)\s*\]/;

/**
 * Korean instruction markers — all variants that appear in real Korean exams.
 *
 * Covers:
 * - "다음 글을 읽고 물음에 답하시오" (shared-passage style, 수능/모평)
 * - "다음 글의 주제/제목/요지/목적/어조/분위기로 가장 적절한 것은?"
 * - "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?"
 * - "다음 글의 내용과 일치하는/하지 않는 것은?"
 * - "다음 빈칸에 들어갈 말로 가장 적절한 것은?"
 * - "다음 글의 밑줄 친 부분의 의미로 가장 적절한 것은?"
 * - "위 글의 ..." 변형
 * - "(A), (B), (C)의 ..." 변형
 */
const KR_INSTRUCTION =
  /(?:다음|위)\s*(?:글|문장|문단|지문|대화)(?:을|의|에서|에|과|와)?\s*(?:읽고|주제|제목|요지|목적|어조|분위기|심경|내용|핵심|특징|교훈|요점|이해|필자|빈칸|밑줄|선후|순서|흐름|이어질|이어지는|들어갈|일치|가리키|지칭|해석|적절한|가장)/;

/** English instruction marker — multiple phrasings. */
const EN_INSTRUCTION =
  /(?:Read\s+the\s+(?:following\s+)?(?:passage|text|paragraph|article|dialogue)|(?:Which|What|Where|When|Why|How|Who)\s+(?:of\s+)?the\s+following|Choose\s+the\s+(?:best|most\s+appropriate)|According\s+to\s+(?:the\s+)?(?:passage|text|author)|The\s+(?:passage|author|writer)\s+)/i;

/** Single-item question header: `18.`, `19.`, `1)`, `(1)`. */
const QUESTION_NUMBER_RE = /^\s*\(?(\d{1,3})[).]\s*/;

/** Choice line starts — ①~⑨ glyphs. */
const CHOICE_LINE_RE = /^\s*([①②③④⑤⑥⑦⑧⑨])/;
const CIRCLED_INDEX: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9,
};

/**
 * Exam-paper header patterns — the first few lines of page 1 often carry
 * metadata (교재명, 학교명, 학년, 교시, 과목코드, 시행년도/회차 등). These
 * should be stripped from the "지문 1" bucket so it's not polluted.
 */
const HEADER_PATTERNS: RegExp[] = [
  /(?:리딩파워|리딩튜터|리딩릴레이|해커스|빠바|천일문|그래머존|워드마스터|수능특강|수능완성|EBS)/, // 교재명
  /(?:Ch(?:apter)?\.?\s*\d|Unit\s*\d|제?\s*\d+\s*(?:강|과|단원|회))/, // 단원
  /\d{4}\s*학년도/, // 시행년도
  /(?:2학기|1학기)/, // 학기
  /(?:중학교|고등학교|초등학교)/, // 학교명
  /제?\s*\d+\s*교시/, // 교시
  /과목\s*코드/, // 과목코드
  /(?:공통\s*과정|인문[·\s]*사회|자연[·\s]*이공)/, // 문과/이과
  /(?:영\s*어|국\s*어|수\s*학|사\s*회|과\s*학)\s*(?:I{1,3}|1|2|II|III)?$/, // 과목명만
  /^\s*(?:답안지에|문항에\s*따라|선택형|서술형|문제지면)/, // 답안 유의사항
  /(?:외부지문|유형완성|유형독해|기출문제|교과서|모의고사)\s*[:：]/, // 유형 분류
  /^\s*[\d가-힣]{1,10}(?:월|일)\s*\d+일?\s*\(/, // 날짜 표기 "12월 19일(월)"
  /^\s*[-–—]\s*\d+\s*[-–—]\s*$/, // 쪽번호 "- 1 -"
  /^\s*\d+\s*$/, // 단독 숫자 (쪽번호)
];

/** Terminal punctuation test — does this end-of-line close a thought? */
const END_SENTENCE_RE = /[.!?"'"'」』\])}]\s*$/;

export interface PageOcrInput {
  pageIndex: number;
  text: string; // may be empty when page failed
  confidence?: number | null;
}

interface Bucket {
  sourcePageIndex: number[];
  lines: string[];
  questionRange: string | null; // e.g. "20~24"
  markerDetected: boolean;
  confidenceSum: number;
  confidenceCount: number;
}

function emptyBucket(): Bucket {
  return {
    sourcePageIndex: [],
    lines: [],
    questionRange: null,
    markerDetected: false,
    confidenceSum: 0,
    confidenceCount: 0,
  };
}

interface BucketExtra {
  /** True when this bucket was opened by a RANGE_MARKER whose trailing text
   *  is a SHARED-PASSAGE instruction ("다음 글을 읽고..."). When true, a single
   *  passage is shared across multiple question numbers. */
  sharedPassage: boolean;
  /** Last QUESTION_NUMBER observed while filling this bucket. Used to detect
   *  transitions (1. → 2.) that should flush the bucket when no RANGE_MARKER
   *  is present. */
  lastQuestionNumber: number | null;
  /** Last CHOICE index observed (1~9). Used with lastQuestionNumber to detect
   *  "⑤ ends → new question" transitions cleanly. */
  lastChoiceIndex: number | null;
}

function emptyExtra(): BucketExtra {
  return {
    sharedPassage: false,
    lastQuestionNumber: null,
    lastChoiceIndex: null,
  };
}

function bucketToDraft(
  bucket: Bucket,
  order: number,
  extra: BucketExtra,
): ResultDraft {
  const content = bucket.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const title = bucket.questionRange
    ? extra.sharedPassage
      ? `[${bucket.questionRange}]번 공유 지문`
      : `${bucket.questionRange.split("~")[0]}번 지문`
    : extra.lastQuestionNumber !== null
      ? `${extra.lastQuestionNumber}번 지문`
      : `지문 ${order + 1}`;
  const confidence = bucket.confidenceCount
    ? bucket.confidenceSum / bucket.confidenceCount
    : null;

  return {
    id: `draft_${order}_${bucket.sourcePageIndex.join("_") || "empty"}`,
    passageOrder: order,
    sourcePageIndex: [...bucket.sourcePageIndex].sort((a, b) => a - b),
    title,
    content,
    confidence,
    status: "DRAFT",
    meta: {
      markerDetected: bucket.markerDetected,
      mergedFromPages:
        bucket.sourcePageIndex.length > 1
          ? [...bucket.sourcePageIndex].sort((a, b) => a - b)
          : undefined,
      confidenceNote: bucket.markerDetected
        ? extra.sharedPassage
          ? "공유 지문 마커가 탐지되어 자동 분할되었습니다."
          : "경계 마커가 탐지되어 자동 분할되었습니다."
        : extra.lastQuestionNumber !== null
          ? "문제 번호 변경으로 자동 분할되었습니다."
          : "마커가 없어 페이지 단위로 묶었습니다. 병합·분할이 필요한지 확인하세요.",
    },
  };
}

/** Split a page's OCR into logical lines, stripping obvious noise. */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, ""))
    .filter((l) => l.length > 0);
}

export interface DetectedMarker {
  /** "2~4" when a [N~M] bracket is present, else null. */
  range: string | null;
  /** When a range marker exists: true if its trailing text is an explicit
   *  "read the passage" instruction (shared-passage style). */
  sharedPassage: boolean;
  /** True when the line is a recognised Korean/English instruction (with or
   *  without a range marker). Triggers a bucket flush. */
  isInstruction: boolean;
  /** Whether to keep this line as part of the new bucket. Always true when
   *  it carries instruction text; false when it's only a range label that
   *  should be absorbed into the title. */
  keepLine: boolean;
}

/** Detect marker on a line. */
function detectMarker(line: string): DetectedMarker {
  const rm = line.match(RANGE_MARKER);
  if (rm) {
    const range = `${rm[1]}~${rm[2]}`;
    const afterMarker = line.slice((rm.index ?? 0) + rm[0].length).trim();
    const sharedPassage =
      /다음\s*(?:글|문장|문단|지문|대화)(?:을|의)?\s*읽고/.test(afterMarker) ||
      /Read\s+the\s+(?:following\s+)?(?:passage|text|paragraph|article|dialogue)/i.test(
        afterMarker,
      );
    const instructionRight =
      sharedPassage ||
      KR_INSTRUCTION.test(afterMarker) ||
      EN_INSTRUCTION.test(afterMarker);
    return {
      range,
      sharedPassage,
      isInstruction: true,
      keepLine: instructionRight,
    };
  }
  if (KR_INSTRUCTION.test(line) || EN_INSTRUCTION.test(line)) {
    return {
      range: null,
      sharedPassage: false,
      isInstruction: true,
      keepLine: true,
    };
  }
  return {
    range: null,
    sharedPassage: false,
    isInstruction: false,
    keepLine: true,
  };
}

/**
 * Strip leading exam-paper header lines (교재명, 학교명, 학년, 교시, 과목코드, ...).
 *
 * Looks at up to the first 25 lines of the first page and returns a split
 * between `header` (stripped) and `body` (fed into segmentation). Stops as
 * soon as a real content signal appears (instruction, question number,
 * choice glyph, or a long prose line).
 */
function extractHeader(lines: string[]): {
  header: string[];
  body: string[];
} {
  const header: string[] = [];
  const maxScan = Math.min(lines.length, 25);
  let splitAt = 0;

  for (let i = 0; i < maxScan; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      // Keep blank lines attached to whichever side we're currently on.
      if (header.length > 0) {
        header.push(line);
      }
      continue;
    }

    // Hard stop: first real content line.
    if (
      detectMarker(line).isInstruction ||
      QUESTION_NUMBER_RE.test(line) ||
      CHOICE_LINE_RE.test(line)
    ) {
      splitAt = i;
      break;
    }

    // Header signal match → absorb.
    if (HEADER_PATTERNS.some((p) => p.test(line))) {
      header.push(line);
      splitAt = i + 1;
      continue;
    }

    // Long prose line (probably passage body) → stop.
    if (trimmed.length > 40) {
      splitAt = i;
      break;
    }

    // Short neutral line near the top: treat as header if we're already
    // accumulating header content, else start the body here.
    if (header.length > 0) {
      header.push(line);
      splitAt = i + 1;
      continue;
    }

    // Ambiguous — start body here.
    splitAt = i;
    break;
  }

  // If we never found a clear stop, scan continues from where we left off.
  if (splitAt === 0 && header.length > 0) {
    splitAt = header.length;
  }

  return {
    header,
    body: lines.slice(splitAt),
  };
}

export function segmentPages(pages: PageOcrInput[]): ResultDraft[] {
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const drafts: ResultDraft[] = [];
  let current = emptyBucket();
  let extra = emptyExtra();
  const strippedHeaders: string[] = [];

  const flush = () => {
    const content = current.lines.join("\n").trim();
    if (content.length >= MIN_COMMIT_PASSAGE_LENGTH) {
      drafts.push(bucketToDraft(current, drafts.length, extra));
    }
    current = emptyBucket();
    extra = emptyExtra();
  };

  const touchPage = (pageIndex: number) => {
    if (!current.sourcePageIndex.includes(pageIndex)) {
      current.sourcePageIndex.push(pageIndex);
    }
  };

  sorted.forEach((page, pageOrdinal) => {
    if (!page.text || page.text.trim().length === 0) return;

    let lines = splitLines(page.text);

    // Strip exam-paper header from page 1 only. Subsequent pages are body.
    if (pageOrdinal === 0) {
      const split = extractHeader(lines);
      if (split.header.length > 0) {
        strippedHeaders.push(...split.header);
      }
      lines = split.body;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1) RANGE_MARKER or KR/EN instruction → strong boundary
      const marker = detectMarker(line);
      if (marker.isInstruction) {
        if (current.lines.length > 0) flush();
        current.markerDetected = true;
        current.questionRange = marker.range ?? current.questionRange;
        extra.sharedPassage = marker.sharedPassage;
        if (marker.keepLine) current.lines.push(line);
        touchPage(page.pageIndex);
        continue;
      }

      // 2) QUESTION_NUMBER — stronger than before. Flush when:
      //    (a) a different question number appears, OR
      //    (b) previous line was CHOICE ⑤ and this is a new numbered item
      const qnumMatch = line.match(QUESTION_NUMBER_RE);
      if (qnumMatch) {
        const n = Number(qnumMatch[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 200) {
          // Shared-passage range ([2~4]) keeps items in ONE bucket — don't flush.
          const insideSharedRange = extra.sharedPassage;
          const prevQNum = extra.lastQuestionNumber;
          const prevChoiceComplete = extra.lastChoiceIndex !== null && extra.lastChoiceIndex >= 5;

          const shouldFlush =
            !insideSharedRange &&
            current.lines.length > 0 &&
            (prevQNum !== null
              ? prevQNum !== n
              : prevChoiceComplete);

          if (shouldFlush) {
            flush();
            extra.lastQuestionNumber = n;
          } else {
            extra.lastQuestionNumber = n;
          }
          extra.lastChoiceIndex = null;
          current.lines.push(line);
          touchPage(page.pageIndex);
          continue;
        }
      }

      // 3) CHOICE line — track index for boundary detection
      const choiceMatch = line.match(CHOICE_LINE_RE);
      if (choiceMatch) {
        const idx = CIRCLED_INDEX[choiceMatch[1]] ?? null;
        extra.lastChoiceIndex = idx;
        current.lines.push(line);
        touchPage(page.pageIndex);
        continue;
      }

      // 4) Ordinary line → append
      current.lines.push(line);
      touchPage(page.pageIndex);
    }

    if (page.confidence != null) {
      current.confidenceSum += page.confidence;
      current.confidenceCount += 1;
    }

    // Between pages: if the previous line did NOT close with terminal
    // punctuation, treat the next page as a continuation. Otherwise leave
    // the loop state untouched — a marker / question number on the next
    // page will decide the boundary.
    const lastLine = current.lines[current.lines.length - 1]?.trim() ?? "";
    if (lastLine && !END_SENTENCE_RE.test(lastLine)) {
      // continuation, no flush
    }
  });

  flush();

  // Zero-draft fallback — show reviewer the raw content instead of a blank.
  if (drafts.length === 0 && sorted.some((p) => p.text.trim().length > 0)) {
    const merged = sorted
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0)
      .join("\n\n");
    drafts.push({
      id: "draft_fallback",
      passageOrder: 0,
      sourcePageIndex: sorted.filter((p) => p.text.trim()).map((p) => p.pageIndex),
      title: "지문 1",
      content: merged,
      confidence: null,
      status: "DRAFT",
      meta: {
        markerDetected: false,
        confidenceNote:
          "경계 마커를 찾지 못해 전체 페이지를 하나의 지문으로 묶었습니다. 필요한 경우 직접 분할하세요.",
      },
    });
  }

  return drafts;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — STRUCTURED per-block pipeline (M2 / M4 and beyond)
// ════════════════════════════════════════════════════════════════════════════

/** Block types that are allowed to own a groupId (anchor or child). */
const GROUP_RELEVANT: ReadonlySet<BlockType> = new Set<BlockType>([
  "PASSAGE_BODY",
  "QUESTION_STEM",
  "CHOICE",
  "EXPLANATION",
]);

/**
 * Page-level structured OCR response → ExtractionItem-ready draft rows.
 * `jobId` and per-item `id` are NOT set here — the caller (server worker) is
 * responsible for those. `order` is monotonic within a page (0-based).
 */
export interface StructuredBlockDraft {
  pageIndex: number;
  blockType: BlockType;
  content: string;
  rawText: string;
  confidence: number | null;
  questionNumber: number | null;
  choiceIndex: number | null;
  isAnswer: boolean | null;
  examMeta: Record<string, unknown> | null;
  order: number; // within page
}

/**
 * Flatten an ordered list of `{ pageIndex, response }` tuples into a single
 * StructuredBlockDraft[]. Ordering is preserved:
 *   - outer sort by pageIndex ascending
 *   - inner order by the blocks[] array index as returned by the model
 */
export function flattenStructuredResponses(
  responses: Array<{ pageIndex: number; response: StructuredOcrResponse }>,
): StructuredBlockDraft[] {
  const sorted = [...responses].sort((a, b) => a.pageIndex - b.pageIndex);
  const out: StructuredBlockDraft[] = [];

  for (const { pageIndex, response } of sorted) {
    const blocks = response?.blocks ?? [];
    const pageMeta = response?.pageMeta ?? null;

    blocks.forEach((block, index) => {
      const examMeta: Record<string, unknown> | null =
        block.blockType === "EXAM_META"
          ? {
              ...(pageMeta ? { pageMeta } : {}),
              rawContent: block.content,
            }
          : null;

      out.push({
        pageIndex,
        blockType: block.blockType,
        content: block.content ?? "",
        rawText: block.content ?? "",
        confidence: block.confidence ?? null,
        questionNumber: block.questionNumber ?? null,
        choiceIndex: block.choiceIndex ?? null,
        isAnswer: block.isAnswer ?? null,
        examMeta,
        order: index,
      });
    });
  }

  return out;
}

/** Terminal punctuation: end-of-sentence markers that imply a PASSAGE_BODY
 *  block is "closed". When the previous passage body does NOT end with one
 *  of these, a following PASSAGE_BODY is treated as a continuation of the
 *  same passage (page-boundary merging). */
const TERMINAL_PUNCT_RE = /[.!?"'\u201D\u2019\uFF02\uFF07\u300D\u300F\uFF3D\u3011\u300B\u3009]\s*$/;

/** Strip whitespace and count visible content. */
function hasTerminalPunctuation(content: string): boolean {
  const trimmed = content.replace(/\s+$/u, "");
  if (trimmed.length === 0) return true; // empty → treat as closed, don't merge
  return TERMINAL_PUNCT_RE.test(trimmed);
}

/** Returned per-block grouping after `assignGroupIds`. The `groupId` is the
 *  PASSAGE-level group (shared across passage body + all questions + choices
 *  + explanations in the set) so `buildEnrichedDrafts` can bucket everything
 *  belonging to the same passage into a single EnrichedDraft.
 *
 *  `questionGroupId` is a finer-grained id (`q-<num>`) used by
 *  `buildEnrichedDrafts` to sub-bucket choices/explanations per question —
 *  it is NOT persisted to ExtractionItem.groupId. */
export interface BlockGrouping {
  groupId: string | null;
  parentLocalId: string | null;
  questionGroupId: string | null;
}

/**
 * Assign groupId / parentLocalId deterministically.
 *
 * Rules (redesigned — P0-1 fix, extended with Scenario-C synthetic grouping):
 *   1. PASSAGE_BODY opens a passage group `p-<n>` and owns `groupId = p-<n>`.
 *   2. Consecutive PASSAGE_BODY blocks merge into the SAME passage group when
 *      the previous block's content does not end in terminal punctuation
 *      (covers page-boundary splits — P0-2 fix). Explicit EXAM_META / HEADER /
 *      FOOTER / DIAGRAM / NOISE between two PASSAGE_BODY blocks does NOT break
 *      the merge as long as no QUESTION_STEM / CHOICE / EXPLANATION appeared
 *      in between.
 *   3. QUESTION_STEM inherits the ENCLOSING passage `groupId` so that shared
 *      passages (`[2~4]`) keep all their stems under one draft. A separate
 *      `questionGroupId` = `q-<num>` (or derived ordinal) is also attached so
 *      `buildEnrichedDrafts` can still distinguish individual questions.
 *      `parentLocalId` points at the current PASSAGE_BODY (for DB parent
 *      linking).
 *   4. CHOICE / EXPLANATION inherit the passage `groupId` AND the current
 *      `questionGroupId`. `parentLocalId` points at the nearest preceding
 *      QUESTION_STEM.
 *   5. EXAM_META / HEADER / FOOTER / DIAGRAM / NOISE → `groupId = null`.
 *   6. Scenario C (P0 fix): consecutive CHOICE blocks with NO passage group
 *      open AND NO question group open (e.g. the model emits 5 orphan
 *      choices without a stem) share a SYNTHETIC group
 *      `synthetic-choice-group-<n>`. `buildEnrichedDrafts` detects the
 *      orphan-choice-only bucket and emits ONE placeholder draft with a
 *      synthetic stem carrying all 5 choices — instead of 5 separate
 *      `__solo__:<id>` buckets. The synthetic run resets on any non-CHOICE
 *      block (PASSAGE_BODY / QUESTION_STEM / EXPLANATION / EXAM_META /
 *      HEADER / FOOTER / DIAGRAM / NOISE).
 *
 * `parentLocalId` is a stable, per-call string id of the form
 * `${pageIndex}:${order}` pointing to the parent block — the worker layer
 * resolves these to real DB IDs after insert.
 *
 * Backward compatibility: the return type retains `groupId` + `parentLocalId`
 * on every row (ExtractionItem.groupId persists the passage group).
 * `questionGroupId` is a NEW per-row field carried through to
 * `ExtractionItemSnapshot.questionMeta?.questionGroupId` if the worker wants
 * to propagate it, but `buildEnrichedDrafts` also falls back to `parentItemId`
 * for sub-bucketing so the field is optional.
 *
 * Scenario-C expected behaviour (test-case documentation):
 *   Input blocks (all orphan — no PASSAGE_BODY, no QUESTION_STEM):
 *     [CHOICE#1, CHOICE#2, CHOICE#3, CHOICE#4, CHOICE#5]
 *   Expected output groupIds:
 *     ["synthetic-choice-group-1"] × 5   (all share the same id)
 *   Expected in buildEnrichedDrafts:
 *     1 bucket → 1 synthetic placeholder stem → 5 choices attached to it
 *     Title: "지문 1", confidenceNote references "문항 본문이 감지되지 않아…"
 *
 *   Mixed case: [CHOICE, CHOICE, PASSAGE_BODY, CHOICE, CHOICE]
 *     → first two share "synthetic-choice-group-1"
 *     → PASSAGE_BODY opens "p-1", resets the orphan run
 *     → latter two are regular CHOICEs bound to "p-1" (no current question
 *       → they become orphan choices inside the passage bucket, attached to
 *       first real stem when one appears, or a synthetic stem in the passage
 *       bucket if not).
 */
export function assignGroupIds(
  blocks: StructuredBlockDraft[],
): Array<StructuredBlockDraft & BlockGrouping> {
  const out: Array<StructuredBlockDraft & BlockGrouping> = [];

  let passageCounter = 0;
  let currentPassageGroupId: string | null = null;
  /**
   * Anchor PASSAGE_BODY localId — points at the FIRST body in a merged run.
   * Used as the `parentLocalId` target for stems so they attach to the
   * earliest body. Preserved across merges.
   */
  let currentPassageLocalId: string | null = null;
  /**
   * P1 FIX: anchor block (first in a merged passage run) — used only for
   * `parentLocalId` resolution. Stays stable across page-boundary merges.
   */
  let lastPassageAnchorBlock: StructuredBlockDraft | null = null;
  /**
   * P1 FIX: last content block — the MOST RECENT PASSAGE_BODY regardless of
   * merging. Used exclusively for `hasTerminalPunctuation` check so the next
   * body's merge decision considers the latest text, not the anchor.
   */
  let lastPassageContentBlock: StructuredBlockDraft | null = null;
  /** Set to true when a QUESTION_STEM/CHOICE/EXPLANATION appears, preventing
   *  further page-boundary passage merging. */
  let questionFlowOpened = false;

  let questionCounter = 0;
  let currentQuestionGroupId: string | null = null;
  let currentQuestionLocalId: string | null = null;

  /**
   * P0 FIX (Scenario C): orphan CHOICE run tracking.
   * When CHOICE blocks appear with no preceding QUESTION_STEM (and no
   * passage group open either, OR after stems have been flushed), we bind
   * consecutive orphans to a single synthetic group so `buildEnrichedDrafts`
   * can emit ONE placeholder draft carrying all 5 choices instead of 5
   * separate `__solo__:<id>` buckets.
   *
   * Expected behaviour for 5 consecutive orphan CHOICE blocks:
   *   [CHOICE, CHOICE, CHOICE, CHOICE, CHOICE]  // no passage, no stem
   *   → all 5 share groupId = "synthetic-choice-<n>"
   *   → buildEnrichedDrafts creates 1 bucket w/ synthetic placeholder stem
   *   → UI renders a single "(문항 본문이 감지되지 않았습니다)" card w/ 5 choices
   *
   * The run resets on ANY non-CHOICE block (PASSAGE_BODY/QUESTION_STEM/
   * EXPLANATION/EXAM_META/HEADER/FOOTER/DIAGRAM/NOISE) so a later true stem
   * still anchors its own question correctly.
   */
  let syntheticChoiceGroupCounter = 0;
  let currentSyntheticChoiceGroupId: string | null = null;
  let lastBlockWasOrphanChoice = false;

  const localIdFor = (b: StructuredBlockDraft) => `${b.pageIndex}:${b.order}`;

  for (const block of blocks) {
    const localId = localIdFor(block);
    let groupId: string | null = null;
    let parentLocalId: string | null = null;
    let questionGroupId: string | null = null;

    switch (block.blockType) {
      case "PASSAGE_BODY": {
        const shouldMerge =
          lastPassageContentBlock !== null &&
          currentPassageGroupId !== null &&
          !questionFlowOpened &&
          !hasTerminalPunctuation(lastPassageContentBlock.content);

        if (!shouldMerge) {
          passageCounter += 1;
          currentPassageGroupId = `p-${passageCounter}`;
          currentPassageLocalId = localId;
          lastPassageAnchorBlock = block;
          // Reset the "current question" — a CHOICE that appears before the
          // next QUESTION_STEM is orphaned.
          currentQuestionGroupId = null;
          currentQuestionLocalId = null;
          questionCounter = 0;
          // P1 FIX: only reset the "question-flow" flag on a NEW passage.
          // During a merge we leave it alone (was already false, else we
          // wouldn't be merging) so users don't trigger state flips.
          questionFlowOpened = false;
        }
        // Regardless of merge, the current block belongs to the passage
        // group. When merging, we keep the anchor PASSAGE_BODY (the first
        // one) as `currentPassageLocalId` so stems attach to the first body.
        groupId = currentPassageGroupId;
        // P1 FIX: always update the "last content" pointer so the NEXT
        // PASSAGE_BODY's merge decision inspects the most recent text, not
        // the anchor from 3 pages ago. Anchor (lastPassageAnchorBlock)
        // stays fixed across the merged run.
        lastPassageContentBlock = block;
        // A real passage block breaks any orphan-choice run.
        currentSyntheticChoiceGroupId = null;
        lastBlockWasOrphanChoice = false;
        break;
      }
      case "QUESTION_STEM": {
        questionCounter += 1;
        questionGroupId =
          block.questionNumber != null
            ? `q-${block.questionNumber}`
            : currentPassageGroupId
              ? `${currentPassageGroupId}-q${questionCounter}`
              : `q-solo-${questionCounter}`;
        currentQuestionGroupId = questionGroupId;
        currentQuestionLocalId = localId;
        // P0-1 FIX: stems share the PASSAGE group so shared-passage items
        // ([2~4]) bucket into a single EnrichedDraft.
        groupId = currentPassageGroupId ?? questionGroupId;
        parentLocalId = currentPassageLocalId;
        questionFlowOpened = true;
        // A real stem breaks any prior orphan-choice run.
        currentSyntheticChoiceGroupId = null;
        lastBlockWasOrphanChoice = false;
        break;
      }
      case "CHOICE": {
        const hasRealContext =
          currentPassageGroupId !== null || currentQuestionGroupId !== null;
        if (hasRealContext) {
          // Normal path: choice belongs to the current passage/question.
          groupId = currentPassageGroupId ?? currentQuestionGroupId;
          questionGroupId = currentQuestionGroupId;
          parentLocalId = currentQuestionLocalId;
          questionFlowOpened = true;
          // Reset orphan tracking (we're in a real flow now).
          currentSyntheticChoiceGroupId = null;
          lastBlockWasOrphanChoice = false;
        } else {
          // P0 FIX (Scenario C): orphan CHOICE — bind to the current
          // synthetic run if one is open, else start a new one.
          if (!lastBlockWasOrphanChoice || currentSyntheticChoiceGroupId === null) {
            syntheticChoiceGroupCounter += 1;
            currentSyntheticChoiceGroupId = `synthetic-choice-group-${syntheticChoiceGroupCounter}`;
          }
          groupId = currentSyntheticChoiceGroupId;
          questionGroupId = null;
          parentLocalId = null;
          questionFlowOpened = true;
          lastBlockWasOrphanChoice = true;
        }
        break;
      }
      case "EXPLANATION": {
        groupId = currentPassageGroupId ?? currentQuestionGroupId;
        questionGroupId = currentQuestionGroupId;
        parentLocalId = currentQuestionLocalId;
        questionFlowOpened = true;
        // An explanation breaks any orphan-choice run (different content).
        currentSyntheticChoiceGroupId = null;
        lastBlockWasOrphanChoice = false;
        break;
      }
      case "EXAM_META":
      case "HEADER":
      case "FOOTER":
      case "DIAGRAM":
      case "NOISE":
      default: {
        groupId = null;
        parentLocalId = null;
        questionGroupId = null;
        // These blocks do NOT reset passage merging — a HEADER / FOOTER /
        // page-number between two PASSAGE_BODY pieces must not prevent a
        // page-boundary merge.
        // They DO, however, break an orphan-choice run: a page-number
        // between two orphan CHOICEs is unusual enough that we play safe
        // and start a new synthetic group.
        currentSyntheticChoiceGroupId = null;
        lastBlockWasOrphanChoice = false;
        break;
      }
    }

    // Safety net — never leak a groupId onto a non-relevant block type.
    if (!GROUP_RELEVANT.has(block.blockType)) {
      groupId = null;
      parentLocalId = null;
      questionGroupId = null;
    }

    out.push({ ...block, groupId, parentLocalId, questionGroupId });
  }

  // Reference the anchor variable so TSC recognises it's read for debug
  // purposes (parentLocalId derives from `currentPassageLocalId`, and the
  // anchor block reference is maintained for future consumers who need the
  // full block, not just its id).
  void lastPassageAnchorBlock;

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Enriched-draft hydration — ExtractionItemSnapshot[] → UI model
// ────────────────────────────────────────────────────────────────────────────

const CHOICE_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"] as const;
/** Literal union of the nine recognised choice glyphs — ①..⑨. */
export type ChoiceLabel = (typeof CHOICE_LABELS)[number];
/** Fallback format for out-of-range choice indices: "(10)", "(11)" … */
export type ChoiceLabelFallback = `(${number})`;
/** Union used wherever a choice label is surfaced — guarantees no plain
 *  `string` widening at module boundaries. */
export type ChoiceLabelLike = ChoiceLabel | ChoiceLabelFallback;

/** Passage-centric view built from ExtractionItemSnapshot[] for the review UI. */
export interface EnrichedDraft {
  /** ExtractionItem.id of the anchor PASSAGE_BODY block, or null when a
   *  group has questions but no explicit passage block (M2 fallback). */
  passageItemId: string | null;
  passageOrder: number;
  sourcePageIndex: number[];
  title: string;
  content: string;
  confidence: number | null;
  status: "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";
  questions: Array<{
    questionItemId: string;
    questionNumber: number | null;
    stem: string;
    choices: Array<{
      itemId: string;
      /** Display glyph — narrowed to the `ChoiceLabel | ChoiceLabelFallback`
       *  union so consumers cannot accidentally receive widened `string`
       *  values from `buildChoiceLabel`. */
      label: ChoiceLabelLike;
      content: string;
      isAnswer: boolean;
    }>;
    explanation: string | null;
  }>;
  examMeta: Record<string, unknown> | null;
  meta: {
    markerDetected?: boolean;
    mergedFromPages?: number[];
    confidenceNote?: string;
  } | null;
}

type PassageDraftStatus = EnrichedDraft["status"];

function mapItemStatusToDraftStatus(
  status: ExtractionItemSnapshot["status"],
): PassageDraftStatus {
  switch (status) {
    case "REVIEWED":
      return "REVIEWED";
    case "PROMOTED":
      return "SAVED";
    case "SKIPPED":
      return "SKIPPED";
    case "MERGED":
    case "DRAFT":
    default:
      return "DRAFT";
  }
}

function coerceQuestionNumber(item: ExtractionItemSnapshot): number | null {
  const meta = item.questionMeta;
  if (meta && typeof meta === "object") {
    const raw = (meta as Record<string, unknown>).questionNumber;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function coerceChoiceIndex(item: ExtractionItemSnapshot): number | null {
  const meta = item.choiceMeta;
  if (meta && typeof meta === "object") {
    const raw = (meta as Record<string, unknown>).choiceIndex;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Robust truthy coercion for the `choiceMeta.isAnswer` flag.
 *
 * Upstream OCR / LLM pipelines have been observed to emit every variant of
 * "yes" — booleans, numbers, and stringified versions of both — so we accept
 * a wider surface than strict `=== true`. Only values that *unambiguously*
 * mean "this is the correct choice" are accepted; everything else (including
 * undefined / null / empty string / 0 / "false") returns `false`.
 *
 * Accepted truthy variants:
 *   - boolean `true`, number `1`
 *   - English strings: "true" / "1" / "yes" / "y" / "o" (case-insensitive)
 *   - Korean strings: "예" / "정답" / "참"
 *   - Glyph/mark variants: "✓" / "✔" / "○" / "◯"
 * Everything else — including "false" / "no" / "x" / "오답" / "아니오" — is
 * rejected.
 */
const TRUTHY_IS_ANSWER_TOKENS: ReadonlySet<string> = new Set<string>([
  "true",
  "1",
  "yes",
  "y",
  "o",
  "예",
  "정답",
  "참",
  "\u2713", // ✓
  "\u2714", // ✔
  "\u25CB", // ○
  "\u25EF", // ◯
]);

function coerceIsAnswer(item: ExtractionItemSnapshot): boolean {
  const meta = item.choiceMeta;
  if (!meta || typeof meta !== "object") return false;
  const raw = (meta as Record<string, unknown>).isAnswer;
  if (raw === true) return true;
  if (raw === 1) return true;
  if (typeof raw === "string") {
    const normalised = raw.trim().toLowerCase();
    if (normalised.length === 0) return false;
    if (TRUTHY_IS_ANSWER_TOKENS.has(normalised)) return true;
  }
  return false;
}

/**
 * Map a 1-based choice index (or null) to its display glyph.
 * Return type is the `ChoiceLabel` union for in-range indices and a
 * `(n)` fallback for out-of-range — callers get stronger typing than the
 * previous `string` return without any runtime behaviour change.
 */
export function buildChoiceLabel(
  index: number | null,
  fallbackOrder: number,
): ChoiceLabelLike {
  const idx = index ?? fallbackOrder + 1;
  if (idx >= 1 && idx <= CHOICE_LABELS.length) {
    return CHOICE_LABELS[idx - 1];
  }
  return `(${idx})` as ChoiceLabelFallback;
}

/**
 * Coerce an arbitrary string label (e.g. one pulled from persisted
 * `choiceMeta.label`) back into the narrow `ChoiceLabelLike` union.
 *
 * Strategy:
 *   - If the value is already one of the canonical glyphs ①..⑨, return it.
 *   - Otherwise try to parse an integer out of it (handles "1", "(3)" …)
 *     and delegate to `buildChoiceLabel` with the supplied fallback order.
 *   - When nothing parses, fall back to the ordinal glyph at `fallbackOrder`.
 *
 * This keeps the `EnrichedDraft.questions[].choices[].label` type tight
 * without forcing every consumer to hand-roll a widening guard.
 */
export function normaliseChoiceLabel(
  raw: string | null | undefined,
  fallbackOrder: number,
): ChoiceLabelLike {
  if (typeof raw === "string" && raw.length > 0) {
    const glyphHit = (CHOICE_LABELS as readonly string[]).indexOf(raw.trim());
    if (glyphHit >= 0) return CHOICE_LABELS[glyphHit];
    const parsed = Number(raw.replace(/[^0-9]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return buildChoiceLabel(parsed, fallbackOrder);
    }
  }
  return buildChoiceLabel(null, fallbackOrder);
}

function uniqueSortedPages(pages: number[]): number[] {
  return Array.from(new Set(pages)).sort((a, b) => a - b);
}

function averageConfidence(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

interface GroupBucket {
  groupId: string;
  passage: ExtractionItemSnapshot | null;
  stems: ExtractionItemSnapshot[];
  choicesByStemId: Map<string, ExtractionItemSnapshot[]>;
  explanationByStemId: Map<string, ExtractionItemSnapshot>;
  orphanChoices: ExtractionItemSnapshot[];
  orphanExplanation: ExtractionItemSnapshot | null;
  firstOrder: number;
}

function newBucket(groupId: string, firstOrder: number): GroupBucket {
  return {
    groupId,
    passage: null,
    stems: [],
    choicesByStemId: new Map(),
    explanationByStemId: new Map(),
    orphanChoices: [],
    orphanExplanation: null,
    firstOrder,
  };
}

/**
 * Build passage-centric EnrichedDraft[] from ExtractionItemSnapshot[].
 *
 * Grouping:
 *   - PASSAGE_BODY acts as group anchor; each groupId maps to one draft.
 *   - QUESTION_STEM rows with the same groupId become `draft.questions[]`.
 *   - CHOICE rows bind to their QUESTION_STEM via `parentItemId`; if missing,
 *     they fall back to the first stem in the group.
 *   - EXPLANATION binds the same way.
 *   - EXAM_META items are aggregated into the first draft's `examMeta`.
 *   - Group-less items (HEADER/FOOTER/DIAGRAM/NOISE) are ignored.
 *   - Questions without a PASSAGE_BODY in the same group still produce a
 *     draft (passageItemId = null) — rare M2 edge case.
 */
export function buildEnrichedDrafts(
  items: ExtractionItemSnapshot[],
): EnrichedDraft[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const buckets = new Map<string, GroupBucket>();
  const orphanExamMeta: ExtractionItemSnapshot[] = [];

  // First pass: place each item into a bucket by groupId (or exam-meta sink).
  for (const item of sorted) {
    if (item.blockType === "EXAM_META") {
      orphanExamMeta.push(item);
      continue;
    }
    if (!GROUP_RELEVANT.has(item.blockType)) continue;
    const key = item.groupId ?? `__solo__:${item.id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = newBucket(key, item.order);
      buckets.set(key, bucket);
    }

    switch (item.blockType) {
      case "PASSAGE_BODY":
        if (!bucket.passage) bucket.passage = item;
        break;
      case "QUESTION_STEM":
        bucket.stems.push(item);
        break;
      case "CHOICE":
        if (item.parentItemId) {
          const list = bucket.choicesByStemId.get(item.parentItemId) ?? [];
          list.push(item);
          bucket.choicesByStemId.set(item.parentItemId, list);
        } else {
          bucket.orphanChoices.push(item);
        }
        break;
      case "EXPLANATION":
        if (item.parentItemId) {
          bucket.explanationByStemId.set(item.parentItemId, item);
        } else if (!bucket.orphanExplanation) {
          bucket.orphanExplanation = item;
        }
        break;
      default:
        break;
    }
  }

  // Second pass: materialize drafts, sorted by firstOrder ascending.
  const ordered = [...buckets.values()].sort(
    (a, b) => a.firstOrder - b.firstOrder,
  );

  const drafts: EnrichedDraft[] = [];
  ordered.forEach((bucket, index) => {
    // Need at least a passage OR at least one question OR an orphan choice
    // (fallback placeholder) to emit a draft.
    const hasOrphanChoices = bucket.orphanChoices.length > 0;
    if (
      !bucket.passage &&
      bucket.stems.length === 0 &&
      !hasOrphanChoices
    ) {
      return;
    }

    const passage = bucket.passage;
    const stemsSorted = [...bucket.stems].sort((a, b) => a.order - b.order);

    // P0-3 FIX: orphan choices with NO stem in the group → create a synthetic
    // placeholder question so the choices are not dropped. We emit a virtual
    // `questionItemId = "orphan:<bucketGroupId>"` which the UI can treat as a
    // "choices without stem" card (review step will show an explicit note).
    let syntheticPlaceholder:
      | { id: string; content: string; order: number; status: ExtractionItemSnapshot["status"] }
      | null = null;
    if (stemsSorted.length === 0 && hasOrphanChoices) {
      syntheticPlaceholder = {
        id: `orphan-stem:${bucket.groupId}`,
        content: "(문항 본문이 감지되지 않았습니다. 선택지만 추출되었습니다.)",
        order: bucket.orphanChoices[0].order,
        status: "DRAFT",
      };
    }

    // Resolve orphan choices → attach to the first stem if any, else to the
    // synthetic placeholder.
    const anchorStemId =
      stemsSorted.length > 0
        ? stemsSorted[0].id
        : syntheticPlaceholder
          ? syntheticPlaceholder.id
          : null;
    if (bucket.orphanChoices.length > 0 && anchorStemId) {
      const existing = bucket.choicesByStemId.get(anchorStemId) ?? [];
      bucket.choicesByStemId.set(anchorStemId, [
        ...existing,
        ...bucket.orphanChoices,
      ]);
      bucket.orphanChoices = [];
    }
    if (bucket.orphanExplanation && anchorStemId) {
      if (!bucket.explanationByStemId.has(anchorStemId)) {
        bucket.explanationByStemId.set(anchorStemId, bucket.orphanExplanation);
      }
      bucket.orphanExplanation = null;
    }

    // Build the iteration list — real stems plus the synthetic placeholder
    // (if present). Placeholders are type-narrowed in the map below.
    type StemLike =
      | { real: true; item: ExtractionItemSnapshot }
      | {
          real: false;
          id: string;
          content: string;
          order: number;
          status: ExtractionItemSnapshot["status"];
        };
    const stemLikes: StemLike[] =
      stemsSorted.length > 0
        ? stemsSorted.map((s) => ({ real: true as const, item: s }))
        : syntheticPlaceholder
          ? [
              {
                real: false as const,
                id: syntheticPlaceholder.id,
                content: syntheticPlaceholder.content,
                order: syntheticPlaceholder.order,
                status: syntheticPlaceholder.status,
              },
            ]
          : [];

    const questions: EnrichedDraft["questions"] = stemLikes.map((s) => {
      const stemId = s.real ? s.item.id : s.id;
      const stemContent = s.real ? s.item.content : s.content;
      const questionNumber = s.real ? coerceQuestionNumber(s.item) : null;
      const stemChoices = [
        ...(bucket.choicesByStemId.get(stemId) ?? []),
      ].sort((a, b) => {
        const ai = coerceChoiceIndex(a) ?? a.order;
        const bi = coerceChoiceIndex(b) ?? b.order;
        return ai - bi;
      });
      const explanation = bucket.explanationByStemId.get(stemId);
      return {
        questionItemId: stemId,
        questionNumber,
        stem: stemContent,
        choices: stemChoices.map((choice, i) => ({
          itemId: choice.id,
          label: buildChoiceLabel(coerceChoiceIndex(choice), i),
          content: choice.content,
          isAnswer: coerceIsAnswer(choice),
        })),
        explanation: explanation ? explanation.content : null,
      };
    });

    // Anchor item — used for status mapping. Prefer passage, then first real
    // stem. When neither exists (orphan-choice-only bucket), fall back to
    // DRAFT status.
    const anchorStatus: ExtractionItemSnapshot["status"] = passage
      ? passage.status
      : stemsSorted.length > 0
        ? stemsSorted[0].status
        : "DRAFT";

    // Gather every real item in the bucket (for page / confidence aggregation).
    // Synthetic placeholder rows are excluded (they have no pages or
    // confidence); their attached orphan choices are added separately.
    const allItems: ExtractionItemSnapshot[] = [
      ...(passage ? [passage] : []),
      ...stemsSorted,
      ...stemsSorted.flatMap((s) => bucket.choicesByStemId.get(s.id) ?? []),
      ...stemsSorted
        .map((s) => bucket.explanationByStemId.get(s.id))
        .filter((v): v is ExtractionItemSnapshot => Boolean(v)),
      ...(syntheticPlaceholder
        ? bucket.choicesByStemId.get(syntheticPlaceholder.id) ?? []
        : []),
    ];

    const pages = uniqueSortedPages(
      allItems.flatMap((i) => i.sourcePageIndex ?? []),
    );

    const confidence = averageConfidence(allItems.map((i) => i.confidence));

    const title =
      passage?.title ??
      (questions[0]?.questionNumber != null
        ? `[${questions[0].questionNumber}]번 문제 세트`
        : `지문 ${index + 1}`);

    const draft: EnrichedDraft = {
      passageItemId: passage ? passage.id : null,
      passageOrder: index,
      sourcePageIndex: pages,
      title,
      content: passage ? passage.content : "",
      confidence,
      status: mapItemStatusToDraftStatus(anchorStatus),
      questions,
      examMeta: null,
      meta: {
        markerDetected: passage
          ? Boolean(
              (passage.passageMeta as Record<string, unknown> | null)
                ?.markerDetected,
            )
          : false,
        mergedFromPages: pages.length > 1 ? pages : undefined,
        confidenceNote: passage
          ? undefined
          : syntheticPlaceholder
            ? "문항 본문이 감지되지 않아 선택지만 묶었습니다. 문항을 추가하거나 병합하세요."
            : "지문 블록이 감지되지 않아 문제만 묶였습니다. 지문을 추가하거나 병합하세요.",
      },
    };

    drafts.push(draft);
  });

  // EXAM_META → absorb into the first draft's examMeta field. P0-4 FIX:
  // when no drafts exist but EXAM_META was detected, emit a placeholder
  // draft so the metadata is not silently dropped.
  if (orphanExamMeta.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const metaItem of orphanExamMeta) {
      if (metaItem.examMeta && typeof metaItem.examMeta === "object") {
        Object.assign(merged, metaItem.examMeta as Record<string, unknown>);
      }
      if (metaItem.content) {
        const prev = merged.rawContents;
        const existingRaw = Array.isArray(prev) ? prev : [];
        merged.rawContents = [...existingRaw, metaItem.content];
      }
    }

    if (drafts.length > 0) {
      drafts[0] = { ...drafts[0], examMeta: merged };
    } else {
      const metaPages = uniqueSortedPages(
        orphanExamMeta.flatMap((m) => m.sourcePageIndex ?? []),
      );
      drafts.push({
        passageItemId: null,
        passageOrder: 0,
        sourcePageIndex: metaPages,
        title: "(메타데이터만 추출됨)",
        content: "",
        confidence: averageConfidence(orphanExamMeta.map((m) => m.confidence)),
        status: "DRAFT",
        questions: [],
        examMeta: merged,
        meta: {
          markerDetected: false,
          mergedFromPages: metaPages.length > 1 ? metaPages : undefined,
          confidenceNote:
            "시험 메타데이터만 감지되었습니다. 지문·문항을 추가로 업로드하거나 수동 입력하세요.",
        },
      });
    }
  }

  return drafts;
}
