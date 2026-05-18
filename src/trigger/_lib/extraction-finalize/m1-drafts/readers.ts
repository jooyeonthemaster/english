import type {
  ExtractionItemSnapshot,
  M1RestorationStatus,
} from "@/lib/extraction/types";
import type { SourceMatchInput } from "@/lib/extraction/restoration";
import { m1SourceMatchMethod } from "@/lib/extraction/m1-draft-persistence";
import type { M1PassageChunk } from "../types";

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function readM1RestorationStatus(value: unknown): M1RestorationStatus {
  if (
    value === "PENDING" ||
    value === "RESTORED" ||
    value === "NO_RESTORATION_NEEDED" ||
    value === "PARTIAL" ||
    value === "FAILED"
  ) {
    return value;
  }
  // Conservative default: pre-restoration draft rows enter the pipeline as
  // PENDING so the actual restoration result later overwrites this. Never
  // silently claim "RESTORED" — that was the source of the false-positive
  // "복원됨" badges teachers were seeing.
  return "PENDING";
}

export function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function sourceMatchMethod(match: SourceMatchInput, index: number): string {
  return m1SourceMatchMethod(match, index);
}

/**
 * Build a chunk from every block in a single grouping (groupId).
 *
 * `assignGroupIds` already clusters one logical "문제" together — passage body
 * + its question stems + choices + explanation share one groupId. EXAM_META /
 * HEADER / FOOTER / DIAGRAM / NOISE land with `groupId = null` and are
 * filtered out by the caller before reaching here.
 *
 * The draft's `rawText` is the concatenation of every block in the group (in
 * `order` ascending, separated by blank lines) so the review UI shows the
 * problem as a whole — number, instruction, passage, choices — instead of
 * the passage body alone. Boundary metadata (continuesFromPrevious /
 * continuesToNext, restoredText, restorationChanges from the OCR pass) is
 * read from the anchor PASSAGE_BODY in the group, if any.
 */
export function readM1PassageGroupChunk(
  groupId: string,
  groupItems: ExtractionItemSnapshot[],
): M1PassageChunk | null {
  if (groupItems.length === 0) return null;

  // Trust the caller's ordering. The STEM-led grouping walk pushed items
  // into this bucket in the cluster-ordered input sequence — sorting by
  // `item.order` here would silently revert to upload/OCR order, which
  // breaks cross-page chunks where cluster page-ordering put a later-
  // uploaded page first. (E.g. KakaoTalk 1쪽 was uploaded last → cluster
  // sort puts page 9 before page 8, but item.order has page 8 < page 9
  // because OCR numbered items in upload order. Re-sorting by item.order
  // would move that page's CHOICES ahead of the STEM+BODY on the prior
  // page.)
  const ordered = [...groupItems];
  // The user-visible "문제 원문" must reproduce the entire problem the way it
  // appeared on the page. We keep:
  //   - PASSAGE_BODY / QUESTION_STEM / CHOICE / EXPLANATION (always content)
  //   - DIAGRAM — the OCR labels boxed sentences (삽입형 정답 후보 문장 등)
  //               as DIAGRAM, but the content is part of the problem text and
  //               must NOT be hidden from the teacher.
  // EXAM_META / HEADER / FOOTER / NOISE were filtered out by the caller before
  // this point, so anything that survives is fair game.
  const visible = ordered.filter((item) => item.content.trim().length > 0);
  if (visible.length === 0) return null;

  const rawText = visible
    .map((item) => item.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n")
    .trim();
  if (!rawText) return null;

  const anchor =
    ordered.find((item) => item.blockType === "PASSAGE_BODY") ?? null;
  const meta = anchor?.passageMeta ?? null;
  const restoredValue = meta?.restoredText;
  const restoredText =
    typeof restoredValue === "string" && restoredValue.trim().length > 0
      ? restoredValue.trim()
      : rawText;

  const sourcePageIndex = uniqueSorted(
    ordered.flatMap((item) => item.sourcePageIndex),
  );
  const changes = Array.isArray(meta?.restorationChanges)
    ? meta.restorationChanges
        .filter((change): change is Record<string, unknown> => {
          return change !== null && typeof change === "object";
        })
        .map((change) => ({
          sentenceOrder: asNumber(change.sentenceOrder),
          before: typeof change.before === "string" ? change.before : "",
          after: typeof change.after === "string" ? change.after : "",
          changeType:
            typeof change.changeType === "string" ? change.changeType : null,
          reason: typeof change.reason === "string" ? change.reason : null,
          confidence: asNumber(change.confidence),
          sourcePageIndex: anchor?.sourcePageIndex ?? sourcePageIndex,
        }))
    : [];

  const groupConfidences = ordered
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === "number");
  const confidence =
    typeof anchor?.confidence === "number"
      ? anchor.confidence
      : groupConfidences.length > 0
        ? groupConfidences.reduce((sum, value) => sum + value, 0) /
          groupConfidences.length
        : null;

  return {
    groupId,
    sourcePageIndex,
    rawText,
    restoredText,
    restorationStatus: readM1RestorationStatus(meta?.restorationStatus),
    restorationChanges: changes,
    restorationWarnings: asStringArray(meta?.restorationWarnings),
    continuesFromPrevious: meta?.continuesFromPrevious === true,
    continuesToNext: meta?.continuesToNext === true,
    confidence,
    boundaryConfidence: asNumber(meta?.boundaryConfidence),
    hasPassageBody: anchor !== null,
    items: ordered,
  };
}
