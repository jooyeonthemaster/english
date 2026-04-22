// ============================================================================
// STRUCTURED pipeline — groupId assignment (`assignGroupIds`) and related
// helpers. Extracted verbatim from segmentation.ts during mechanical split.
// ============================================================================

import type { StructuredBlockDraft } from "./structured-types";
import { GROUP_RELEVANT } from "./structured-types";

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
