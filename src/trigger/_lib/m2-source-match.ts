import { prisma } from "@/lib/prisma";
import type { SourceMatchInput } from "@/lib/extraction/m2-restoration";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function exactContainmentScore(candidate: string, target: string): number {
  const c = normalizeText(candidate);
  const t = normalizeText(target);
  if (!c || !t) return 0;
  if (c === t) return 1;
  if (c.includes(t) || t.includes(c)) return 0.92;
  return 0;
}

function scoreCandidate(candidate: string, target: string): number {
  return Math.max(
    exactContainmentScore(candidate, target),
    jaccard(tokensOf(candidate), tokensOf(target)),
  );
}

export async function findM2SourceMatches(input: {
  academyId: string;
  problemText: string;
  limit?: number;
}): Promise<SourceMatchInput[]> {
  const limit = input.limit ?? 5;
  const probe = normalizeText(input.problemText).slice(0, 400);
  const keywords = probe
    .split(" ")
    .filter((token) => token.length > 5)
    .slice(0, 8);

  const passages = await prisma.passage.findMany({
    where: {
      academyId: input.academyId,
      OR:
        keywords.length > 0
          ? keywords.map((keyword) => ({
              content: { contains: keyword, mode: "insensitive" as const },
            }))
          : undefined,
    },
    take: 40,
    select: {
      id: true,
      title: true,
      content: true,
      source: true,
      publisher: true,
      unit: true,
      grade: true,
      sourceMaterialId: true,
      semester: true,
      school: { select: { name: true } },
      sourceMaterial: {
        select: {
          type: true,
          title: true,
          subject: true,
          grade: true,
          semester: true,
          year: true,
          round: true,
          examType: true,
          publisher: true,
          school: { select: { name: true } },
        },
      },
    },
  });

  return passages
    .map((passage) => {
      const confidence = scoreCandidate(passage.content, input.problemText);
      return {
        title: passage.sourceMaterial?.title ?? passage.title,
        sourceType: "PASSAGE",
        confidence,
        reason:
          confidence >= 0.9
            ? "Same-academy passage text is a near exact match."
            : "Same-academy passage shares meaningful text with the extracted passage.",
        content: passage.content,
        sourceId: passage.id,
        sourceRef: passage.source ?? passage.sourceMaterialId ?? undefined,
        publisher:
          passage.publisher ?? passage.sourceMaterial?.publisher ?? undefined,
        unit: passage.unit ?? undefined,
        year: passage.sourceMaterial?.year ?? undefined,
        metadata: {
          grade: passage.grade ?? passage.sourceMaterial?.grade,
          semester: passage.semester ?? passage.sourceMaterial?.semester,
          type: passage.sourceMaterial?.type,
          subject: passage.sourceMaterial?.subject,
          round: passage.sourceMaterial?.round,
          examType: passage.sourceMaterial?.examType,
          schoolName:
            passage.school?.name ?? passage.sourceMaterial?.school?.name,
        },
      };
    })
    .filter((match) => match.confidence >= 0.2)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
    .map((match) => ({
      title: match.title,
      sourceType: match.sourceType,
      confidence: Number(match.confidence.toFixed(3)),
      reason: match.reason,
      content: match.content,
      sourceId: match.sourceId,
      sourceRef: match.sourceRef,
      publisher: match.publisher,
      unit: match.unit,
      metadata: match.metadata,
    }));
}
