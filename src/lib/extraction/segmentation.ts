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
//
// This file is a thin barrel — the implementation lives in `segmentation/`.
// ============================================================================

export type { PageOcrInput } from "./segmentation/legacy-bucket";
export type { DetectedMarker } from "./segmentation/legacy-detect";
export { segmentPages } from "./segmentation/legacy-segment";

export type { StructuredBlockDraft } from "./segmentation/structured-types";
export { flattenStructuredResponses } from "./segmentation/structured-types";

export type { BlockGrouping } from "./segmentation/structured-groups";
export { assignGroupIds } from "./segmentation/structured-groups";

export type {
  ChoiceLabel,
  ChoiceLabelFallback,
  ChoiceLabelLike,
  EnrichedDraft,
} from "./segmentation/enriched-types";
export {
  buildChoiceLabel,
  normaliseChoiceLabel,
} from "./segmentation/enriched-helpers";
export { buildEnrichedDrafts } from "./segmentation/enriched-drafts";
