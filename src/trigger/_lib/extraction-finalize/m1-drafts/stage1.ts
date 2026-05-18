import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import type { RestorationQuestionInput } from "@/lib/extraction/restoration";
import type { ProblemEvidenceResponse } from "@/lib/extraction/problem-evidence";
import { buildCleanBodyForSkippedGroup, extractPurePassageTitle } from "./clean-body";
import {
  RESTORATION_REQUIRED_TYPES,
  SHORT_CONTENT_THRESHOLD,
  TYPE_FILTERED_RESTORATION_ENABLED,
  normalizeAnalysisQuestionType,
} from "./constants";
import {
  buildProblemEvidenceFromItems,
  buildRestorationQuestions,
} from "./question-builder";
import { uniqueSorted } from "./readers";
import type { M1PassageChunk } from "../types";

/**
 * Per-group prep state shared between Phase A (initial INSERT) and Phase B
 * (grounded restoration UPDATE).
 */
export interface PrepStage1 {
  index: number;
  group: M1PassageChunk[];
  rawText: string;
  sourcePageIndex: number[];
  sourceGroupIds: Set<string>;
  questions: RestorationQuestionInput[];
  problemEvidence: ProblemEvidenceResponse | null;
  shouldRestore: boolean;
  /** When the group was rejected by the type filter, the locally-built
   *  clean body that should replace rawText as the displayed passage.
   *  Empty when not applicable (= shouldRestore=true OR rejected for
   *  other reasons like missing passage / short content). */
  typeSkipBody: string;
  /** Question types observed in the group (UNKNOWN included). Recorded
   *  in metadata so the teacher can see why restoration was skipped. */
  questionTypes: string[];
  /** When the group is a pure passage (no STEM, just reading material),
   *  the OCR-derived passage title from passageMeta.title. Surfaces in
   *  the library view as the draft's title. Null otherwise. */
  purePassageTitle: string | null;
}

/**
 * Build the per-group prep stage. Computes the union of all evidence
 * needed by Phase A (write the initial PENDING / NO_RESTORATION_NEEDED
 * row) and Phase B (call grounded restoration when shouldRestore=true).
 */
export function buildStage1(groups: M1PassageChunk[][]): PrepStage1[] {
  return groups.map((group, index) => {
    const rawText = group.map((chunk) => chunk.rawText).join("\n\n").trim();
    const sourcePageIndex = uniqueSorted(
      group.flatMap((chunk) => chunk.sourcePageIndex),
    );
    // STEM-led bucket items (= every block in this merged group). Sort by
    // global `order` so QUESTION_STEM/CHOICE neighbourship is preserved
    // across chunks that crossed a page boundary.
    const groupItems = group
      .flatMap((chunk) => chunk.items)
      .sort((a, b) => a.order - b.order);
    const sourceGroupIds = new Set(
      group
        .map((chunk) => chunk.groupId)
        .filter((groupId): groupId is string => groupId !== null),
    );
    const questions = buildRestorationQuestions(groupItems);
    const problemEvidence = buildProblemEvidenceFromItems(groupItems);
    const groupHasPassage = group.some((chunk) => chunk.hasPassageBody);
    const baseShouldRestore =
      groupHasPassage || rawText.length >= SHORT_CONTENT_THRESHOLD;

    // Question types observed in this group — used by the type filter.
    const questionTypes = collectQuestionTypes(groupItems);

    // Pure-passage group: PASSAGE_BODY blocks with no STEM at all. Used
    // for textbook-style reading material the teacher uploads as source
    // (no questions to solve). We never call grounded restoration on
    // these — the body is the deliverable — but we still emit a clean
    // body so the draft is displayable.
    const isPurePassage = questionTypes.length === 0 && groupHasPassage;

    // Restoration is required if ANY question in the group is on the
    // whitelist. UNKNOWN is treated as "required" to avoid false
    // negatives when the classifier failed. Empty list (no STEM detected
    // in this group at all):
    //   - with a passage body → pure passage, skip restoration
    //   - without any passage body either → conservative fallback (restore)
    const hasRestorationRequiredType = isPurePassage
      ? false
      : questionTypes.length === 0 ||
        questionTypes.some(
          (t) => RESTORATION_REQUIRED_TYPES.has(t) || t === "UNKNOWN",
        );

    const shouldRestore = TYPE_FILTERED_RESTORATION_ENABLED
      ? baseShouldRestore && hasRestorationRequiredType
      : baseShouldRestore && !isPurePassage;

    // If we're skipping restoration (type filter OR pure-passage), build
    // the clean body locally so the draft is still useful in the UI.
    const skippedByTypeFilter =
      (TYPE_FILTERED_RESTORATION_ENABLED &&
        baseShouldRestore &&
        !hasRestorationRequiredType) ||
      isPurePassage;
    const typeSkipBody = skippedByTypeFilter
      ? buildCleanBodyForSkippedGroup(groupItems, { isPurePassage })
      : "";

    const purePassageTitle = isPurePassage
      ? extractPurePassageTitle(groupItems)
      : null;

    return {
      index,
      group,
      rawText,
      sourcePageIndex,
      sourceGroupIds,
      questions,
      problemEvidence,
      shouldRestore,
      typeSkipBody,
      questionTypes,
      purePassageTitle,
    };
  });
}

function collectQuestionTypes(groupItems: ExtractionItemSnapshot[]): string[] {
  return groupItems
    .filter((item) => item.blockType === "QUESTION_STEM")
    .map((item) => {
      const meta = item.questionMeta as Record<string, unknown> | null;
      const analysis =
        meta?.analysis && typeof meta.analysis === "object"
          ? (meta.analysis as Record<string, unknown>)
          : null;
      return normalizeAnalysisQuestionType(analysis?.questionType);
    });
}
