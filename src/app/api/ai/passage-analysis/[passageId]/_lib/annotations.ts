import type {
  PassageAnnotationInput,
  PassageAnnotationType,
} from "@/actions/workbench";
import { prisma } from "@/lib/prisma";

/**
 * Load the persisted teacher annotations for a passage. Returned in
 * caller-facing `PassageAnnotationInput[]` shape so the analysis prompt
 * builder can fold them in without an extra projection step.
 */
export async function loadPersistedAnnotations(
  passageId: string,
): Promise<PassageAnnotationInput[]> {
  const rows = await prisma.passageNote.findMany({
    where: { passageId },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    id: r.annotationId ?? r.id,
    type: (r.noteType ?? "vocab") as PassageAnnotationType,
    text: r.content,
    memo: r.memo ?? "",
    from: r.highlightStart ?? 0,
    to: r.highlightEnd ?? 0,
  }));
}
