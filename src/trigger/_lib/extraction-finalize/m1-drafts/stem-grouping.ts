import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import type { M1PassageChunk } from "../types";
import { readM1PassageGroupChunk } from "./readers";

/**
 * STEM-led grouping (new in 20260512.3).
 *
 * The previous PASSAGE-led approach (using `assignGroupIds`'s `groupId`)
 * had an off-by-one problem on independent sequential problems: a new
 * PASSAGE_BODY opened a new group, but the QUESTION_STEM that owned that
 * passage was still in the PREVIOUS group, leaving passage and stem
 * mismatched in every other draft.
 *
 * The new approach walks blocks in reading order (by `order`) and:
 *   - Skips EXAM_META / HEADER / FOOTER / NOISE (page chrome).
 *   - Starts a NEW bucket on every QUESTION_STEM that carries a real
 *     `questionNumber`.
 *   - Buffers QUESTION_STEMs without a number (shared instructions like
 *     "[31~34] 다음 빈칸에 들어갈 말로...") and attaches them to the next
 *     real stem.
 *   - Merges consecutive stems that share the same `sharedPassageRange`
 *     (case A: "[2~4] 다음 글을 읽고..." — one passage, multiple questions).
 *   - PASSAGE_BODY / CHOICE / EXPLANATION / DIAGRAM blocks join the current
 *     bucket (or open a new bucket if no stem has been seen yet — covers
 *     case A where the passage precedes its stems).
 *
 * Returns the bucket-derived chunks. EMPTY input or all-excluded yields [].
 */
const EXCLUDED_BLOCK_TYPES = new Set([
  "EXAM_META",
  "HEADER",
  "FOOTER",
  "NOISE",
]);

function readSharedRange(item: ExtractionItemSnapshot): string | null {
  if (item.blockType === "QUESTION_STEM") {
    const meta = item.questionMeta as Record<string, unknown> | null;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const range = meta.sharedPassageRange;
      if (typeof range === "string" && range.trim().length > 0) {
        return range.trim();
      }
    }
  } else if (item.blockType === "PASSAGE_BODY") {
    const pmeta = item.passageMeta as Record<string, unknown> | null;
    if (pmeta && typeof pmeta === "object" && !Array.isArray(pmeta)) {
      const range = pmeta.questionRange;
      if (typeof range === "string" && range.trim().length > 0) {
        return range.trim();
      }
    }
  }
  return null;
}

function readQuestionNumber(item: ExtractionItemSnapshot): number | null {
  if (item.blockType !== "QUESTION_STEM") return null;
  const meta = item.questionMeta as Record<string, unknown> | null;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const num = meta.number;
    if (typeof num === "number" && Number.isFinite(num)) return num;
  }
  // Fallback: parse "[서답형N]" out of the stem content. OCR
  // occasionally drops the questionNumber for free-response (서답형)
  // stems even though the bracket-label is right there. Without a
  // number these stems get treated as shared-instruction anchors by
  // the STEM-led grouping and silently merge into the previous
  // bucket, dragging their bodies into the next numbered stem's
  // bucket as orphans. Offset by 1000 so the namespace doesn't
  // collide with regular question numbers — sortCluster's
  // pageNumberPartial path already handles fractional/odd numbers
  // by anchoring to known pageNumbers when available.
  const seodapMatch = item.content.match(/\[서답형\s*(\d+)\]/);
  if (seodapMatch) {
    const n = Number.parseInt(seodapMatch[1], 10);
    if (Number.isFinite(n) && n >= 1) return 1000 + n;
  }
  return null;
}

export function buildStemLedChunks(
  items: ExtractionItemSnapshot[],
): M1PassageChunk[] {
  // Trust caller's ordering. The cluster-aware caller pre-sorts items by
  // (page-ordering rank, in-page order) so a page-number-driven reshuffle
  // (e.g. cluster's pageIndex 9 has pageNumber=1 and must walk before
  // pageIndex 8 with pageNumber=2) reaches the STEM-led walk intact. Re-
  // sorting by `item.order` here would silently revert that to upload
  // order because item.order encodes the original pageIndex. Filter only.
  const candidates = items.filter(
    (item) => !EXCLUDED_BLOCK_TYPES.has(item.blockType),
  );

  // STEM-led grouping with PASSAGE-before-STEM support.
  //
  // The OCR reading order on Korean exam pages places PASSAGE_BODY blocks
  // BEFORE the numbered QUESTION_STEM in many cases (especially blank
  // inference / 어법 / 어휘 problems where the page has [passage] above
  // [stem with blank or marker]). A naive "STEM starts a new bucket and
  // everything else gets appended" rule mis-attaches each passage to the
  // PREVIOUS question's bucket (after that question's choices have been
  // emitted but before the next stem arrives).
  //
  // To handle PASSAGE-before-STEM correctly we:
  //   - Buffer PASSAGE_BODY / shared-instruction / orphan CHOICE blocks
  //     into `pendingBlocks` until the next numbered STEM arrives.
  //   - On STEM, open a new bucket and prepend the pending blocks.
  //   - Track whether the current bucket has already received a CHOICE
  //     (`currentBucketHasChoice`). Once that flag is on, a NEW PASSAGE_BODY
  //     belongs to the NEXT problem and goes back to `pendingBlocks`
  //     instead of being appended to the current bucket. (A page-boundary
  //     continuation of the SAME passage arrives before any choice, so it
  //     still goes into the current bucket.)
  //   - `currentBucketIsSharedPassage` only flips true when the bucket
  //     opens with a PASSAGE_BODY that carries an explicit
  //     `sharedPassageRange` — that's the case A `[2~4] 다음 글을 읽고…`
  //     marker. Stem-opened buckets do not accept shared-range merging.
  const buckets: ExtractionItemSnapshot[][] = [];
  let pendingBlocks: ExtractionItemSnapshot[] = [];
  let currentBucket: ExtractionItemSnapshot[] | null = null;
  let currentSharedRange: string | null = null;
  let currentBucketIsSharedPassage = false;
  let currentBucketHasChoice = false;

  const openBucketWithStem = (
    stem: ExtractionItemSnapshot,
    stemRange: string | null,
  ): ExtractionItemSnapshot[] => {
    const bucket: ExtractionItemSnapshot[] = [];
    // pending blocks (passage / shared instructions / orphan content) go
    // in FIRST so the bucket reads like [passage, stem, choices].
    let openingPassageRange: string | null = null;
    for (const p of pendingBlocks) {
      bucket.push(p);
      if (
        openingPassageRange === null &&
        p.blockType === "PASSAGE_BODY"
      ) {
        openingPassageRange = readSharedRange(p);
      }
    }
    pendingBlocks = [];
    bucket.push(stem);
    buckets.push(bucket);
    currentSharedRange = openingPassageRange ?? stemRange;
    // Case-A guard: only treat this as a shared-passage bucket if the
    // opening PASSAGE_BODY actually carried a `sharedPassageRange` marker
    // ([2~4] style). Stem-opened buckets (no pending passage) stay
    // independent even if subsequent stems share the same range tag.
    currentBucketIsSharedPassage = openingPassageRange !== null;
    currentBucketHasChoice = false;
    return bucket;
  };

  for (const item of candidates) {
    if (item.blockType === "QUESTION_STEM") {
      const qnum = readQuestionNumber(item);
      const range = readSharedRange(item);
      if (qnum === null) {
        // Shared instruction stem ("[N~M] 다음 글을 읽고..." style, no own
        // questionNumber). Two sub-cases:
        //
        //   (a) Instruction's sharedPassageRange differs from the current
        //       bucket's range — this signals the START of a NEW problem
        //       set (e.g. Q40 finished, "[41~42]" stem arrives → Q41-42
        //       group starts). We CLOSE the current bucket and push the
        //       instruction to pendingBlocks so the next numbered stem
        //       opens a fresh bucket with this instruction prepended.
        //   (b) Instruction's range matches current range (or instruction
        //       has no range, or we're already pre-bucket) — fold into the
        //       current bucket / pending queue as before.
        const instRange = range;
        const isNewSet =
          currentBucket !== null &&
          instRange !== null &&
          instRange !== currentSharedRange;
        if (isNewSet) {
          currentBucket = null;
          currentSharedRange = null;
          currentBucketIsSharedPassage = false;
          currentBucketHasChoice = false;
          pendingBlocks.push(item);
          continue;
        }
        if (currentBucket) currentBucket.push(item);
        else pendingBlocks.push(item);
        continue;
      }
      // Real numbered stem.
      const matchesCurrentShared =
        currentBucket !== null &&
        currentSharedRange !== null &&
        range !== null &&
        range === currentSharedRange &&
        currentBucketIsSharedPassage;
      if (matchesCurrentShared && currentBucket) {
        // Case A continuation — additional stem sharing the same passage.
        currentBucket.push(item);
      } else {
        currentBucket = openBucketWithStem(item, range);
      }
      continue;
    }
    if (item.blockType === "PASSAGE_BODY") {
      // A passage arriving AFTER a choice has already been emitted in the
      // current bucket is the start of the next problem — buffer it.
      // Otherwise (no current bucket OR no choice yet in current bucket)
      // it's either an orphan opening the next bucket OR a continuation
      // of the same problem's passage (page-boundary split).
      //
      // NOTE: an earlier revision also short-circuited on
      // `passageMeta.continuesFromPrevious === false` to force a new bucket
      // even before any choice appeared. That over-fired in practice —
      // OCR was setting `continuesFromPrevious=false` on every paragraph
      // boundary, which shattered single passages into multiple drafts.
      // Reverted to the legacy has-choice-only heuristic until we can
      // restrict the flag's effect to genuine page-boundary first passages.
      if (currentBucket && !currentBucketHasChoice) {
        // Job A 케이스 fix: when the current bucket already holds a
        // PASSAGE_BODY on the SAME source page, a second PASSAGE arriving
        // before any CHOICE is the NEXT problem's body, not a continuation.
        //
        // The legacy "no-choice-yet → continuation" heuristic
        // mis-attributes those bodies to the previous stem's bucket, which
        // then pushes everything downstream by one (Q9 bucket eats Q10's
        // body, Q10 bucket eats Q11's body, etc).
        //
        // Genuine page-boundary continuation (same passage spilling onto
        // the next page) only happens when the new PASSAGE's
        // sourcePageIndex doesn't overlap with the last body's — those we
        // still append (single body split across pages stays whole).
        const existingBodies = currentBucket.filter(
          (b) => b.blockType === "PASSAGE_BODY",
        );
        if (existingBodies.length > 0) {
          const lastBody = existingBodies[existingBodies.length - 1];
          const samePage = lastBody.sourcePageIndex.some((p) =>
            item.sourcePageIndex.includes(p),
          );
          if (samePage) {
            currentBucketIsSharedPassage = false;
            pendingBlocks.push(item);
            continue;
          }
          // Different page → genuine cross-page continuation; fall through
          // to the append branch.
        }
        // Fix 1B: shared-INSTRUCTION cases with no CHOICE blocks between
        // stems (Q[12~13] SENTENCE_INSERT — each stem has its own body,
        // selections are inline ①~⑤ position markers in body, not CHOICE
        // blocks). When a BODY arrives in the current bucket carrying the
        // same shared range as the current bucket AND the bucket is
        // already in shared-passage mode, this BODY is a per-stem body,
        // not a case-A continuation. Disarm the shared flag so the next
        // matching-range stem opens its own bucket instead of being
        // absorbed.
        //
        // Genuine case-A (Q[6~7] / Q[8~9] / Q[18~19] — single shared body
        // for multiple stems) is unaffected: the anchor body is already
        // in pendingBlocks when openBucketWithStem fires and no second
        // PASSAGE_BODY arrives in the bucket between stems (only CHOICEs).
        if (currentBucketIsSharedPassage) {
          const bodyRange = readSharedRange(item);
          if (bodyRange !== null && bodyRange === currentSharedRange) {
            currentBucketIsSharedPassage = false;
          }
        }
        currentBucket.push(item);
      } else {
        // BODY arrived after the current bucket already emitted choices —
        // i.e., the previous problem is fully closed and a NEW passage is
        // starting. Disarm the case-A "shared passage" continuation flag
        // so that a subsequent numbered stem with the same sharedRange
        // opens a fresh bucket instead of being absorbed into the current
        // one. Without this reset, "[9~11] 다음 빈칸에 들어갈 말로…" style
        // shared-INSTRUCTION sets (each numbered stem has its own
        // passage, only the instruction is shared) get mis-merged: Q10
        // and Q11 stems get pushed into Q9's bucket, while their bodies
        // get stuck in pendingBlocks until the next non-matching stem
        // (e.g. Q12) prepends them as orphans.
        currentBucketIsSharedPassage = false;
        pendingBlocks.push(item);
      }
      continue;
    }
    if (item.blockType === "CHOICE") {
      if (currentBucket) {
        currentBucket.push(item);
        currentBucketHasChoice = true;
      } else {
        // Orphan choice with no bucket yet — rare. Buffer so the next stem
        // (if any) absorbs it; otherwise it gets attached to whatever
        // bucket forms next.
        pendingBlocks.push(item);
      }
      continue;
    }
    // EXPLANATION / DIAGRAM
    if (currentBucket) {
      currentBucket.push(item);
    } else {
      pendingBlocks.push(item);
    }
  }
  // Trailing pending blocks (passage / shared instructions / orphan content)
  // with no following stem.
  //
  // PASSAGE_BODY blocks here are "pure passage" — the teacher uploaded a
  // page (or a whole document) with reading passages but no problem stems
  // (e.g. textbook unit text, EBS passage compilation). Each such body
  // must become its own draft so the teacher can still ingest the
  // material; absorbing them into the previous STEM bucket would shove
  // unrelated passages into someone else's question, and dropping them
  // when no bucket exists would silently lose the upload entirely.
  //
  // Non-PASSAGE_BODY trailing items (orphan shared instructions, footer
  // fragments, etc) still ride along on the previous bucket.
  if (pendingBlocks.length > 0) {
    const trailingPassageBodies: ExtractionItemSnapshot[] = [];
    const trailingOther: ExtractionItemSnapshot[] = [];
    for (const block of pendingBlocks) {
      if (block.blockType === "PASSAGE_BODY") {
        trailingPassageBodies.push(block);
      } else {
        trailingOther.push(block);
      }
    }
    if (trailingOther.length > 0 && buckets.length > 0) {
      buckets[buckets.length - 1].push(...trailingOther);
    }
    for (const body of trailingPassageBodies) {
      buckets.push([body]);
    }
    pendingBlocks = [];
  }

  const chunks: M1PassageChunk[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const groupId = `bucket-${i}`;
    const chunk = readM1PassageGroupChunk(groupId, buckets[i]);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}
