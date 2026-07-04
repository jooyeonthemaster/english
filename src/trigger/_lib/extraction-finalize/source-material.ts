import { computeContentHash, parseSourceMeta } from "@/lib/extraction/meta-parser";
import { readRequestedSubject } from "@/lib/extraction/requested-subject";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";

export interface EnsureSourceMaterialInput {
  jobId: string;
  academyId: string;
  createdById: string;
  mode: ExtractionMode;
  filename: string | null;
  page1Text: string;
  allTexts: string[];
  examMetaSignals?: Array<{ content: string; meta: unknown }>;
}

// 잡 생성 시 metadata 에 기록된 요청 과목("KOREAN") — 국어 라우트 발 추출 잡은
// OCR/파일명 파서의 과목 추정보다 이 값을 우선한다(국어 자료가 헤더 신호
// 부재로 ENGLISH 기본값에 떨어지는 것을 방지). 판독기는 승급 Passage 전파
// 게이트와 공유하는 @/lib/extraction/requested-subject 단일 소스를 쓴다.
// 여기서 기록되는 SourceMaterial.subject 는 requested ?? parsed(OCR 추정) ??
// "ENGLISH" 로 표시 메타이며, Passage 전파는 잡 명시 subject 만 신뢰한다(ISO-8).

/**
 * Create (or reuse) a SourceMaterial record for this job.
 *
 * Re-runs of finalize are possible (retries, reaper) so we:
 *   1. If job.sourceMaterialId already set → reuse it (no-op).
 *   2. Else compute contentHash and look up any existing SourceMaterial with
 *      the same hash under the same academy. Reuse on match.
 *   3. Else create a new row.
 */
export async function ensureSourceMaterial(
  input: EnsureSourceMaterialInput,
): Promise<string | null> {
  const existing = await prisma.extractionJob.findUnique({
    where: { id: input.jobId },
    select: { sourceMaterialId: true, metadata: true },
  });
  if (existing?.sourceMaterialId) return existing.sourceMaterialId;
  const requestedSubject = readRequestedSubject(existing?.metadata);

  const joinedHeaderText = [
    input.page1Text,
    ...(input.examMetaSignals ?? []).map((s) => s.content),
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = parseSourceMeta({
    filename: input.filename ?? undefined,
    page1Text: joinedHeaderText,
  });

  const contentHash = computeContentHash(input.allTexts);

  // De-dupe by (academyId, contentHash)
  const dup = await prisma.sourceMaterial.findFirst({
    where: { academyId: input.academyId, contentHash },
    select: { id: true },
  });
  if (dup) return dup.id;

  // Pick SourceMaterial.type — prefer parsed.type, else infer from mode.
  const materialType =
    parsed.type ?? (input.mode === "FULL_EXAM" ? "EXAM" : "OTHER");

  const created = await prisma.sourceMaterial.create({
    data: {
      academyId: input.academyId,
      createdById: input.createdById,
      type: materialType,
      title: parsed.title,
      subject: requestedSubject ?? parsed.subject ?? "ENGLISH",
      grade: parsed.grade ?? null,
      semester: parsed.semester ?? null,
      year: parsed.year ?? null,
      round: parsed.round ?? null,
      examType: parsed.examType ?? null,
      publisher: parsed.publisher ?? null,
      contentHash,
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Cluster-scoped SourceMaterial creation. Used when a single job contains
 * multiple test booklets (cluster > 1) — each cluster gets its own fresh
 * SourceMaterial, independent of the job-level `extractionJob.sourceMaterialId`
 * link.
 *
 * Mirrors `ensureSourceMaterial`'s behaviour for cluster 1: each job's
 * cluster gets its own row, with no cross-job dedup. Previously this helper
 * matched existing SourceMaterials by `(academyId, contentHash)` so the same
 * booklet uploaded across multiple jobs would collapse into a single row —
 * but that asymmetry surprised users (cluster 1 = per-job, cluster 2 =
 * shared) and made the "전체 자료" view show one cluster's drafts ballooning
 * to N × per-job-count as more jobs piled up. Dedup removed; data
 * deduplication is a teacher-side concern in the review UI.
 */
export async function ensureClusterSourceMaterial(
  input: EnsureSourceMaterialInput,
): Promise<string | null> {
  const joinedHeaderText = [
    input.page1Text,
    ...(input.examMetaSignals ?? []).map((s) => s.content),
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = parseSourceMeta({
    filename: input.filename ?? undefined,
    page1Text: joinedHeaderText,
  });

  const contentHash = computeContentHash(input.allTexts);

  // The DB enforces a `(academyId, contentHash)` unique key on
  // source_materials. Per-job suffix so this helper doesn't collide with
  // the same booklet uploaded under a different job (= per-job
  // SourceMaterials, no cross-job dedup).
  const perJobContentHash = `${contentHash}:job:${input.jobId}`;

  // Idempotent retry guard: trigger.dev may re-run extractionFinalizeTask
  // (transient errors, leases). On the second run the cluster loop calls
  // this helper again with the SAME perJobContentHash; if the first run
  // already created the row, the INSERT below would throw
  // `Unique constraint failed on (academyId, contentHash)` and the
  // outer catch would mark the job as errored even though the row exists.
  // findFirst → reuse on hit avoids that.
  const existing = await prisma.sourceMaterial.findFirst({
    where: { academyId: input.academyId, contentHash: perJobContentHash },
    select: { id: true },
  });
  if (existing) return existing.id;

  const jobRow = await prisma.extractionJob.findUnique({
    where: { id: input.jobId },
    select: { metadata: true },
  });
  const requestedSubject = readRequestedSubject(jobRow?.metadata);

  const materialType =
    parsed.type ?? (input.mode === "FULL_EXAM" ? "EXAM" : "OTHER");
  const created = await prisma.sourceMaterial.create({
    data: {
      academyId: input.academyId,
      createdById: input.createdById,
      type: materialType,
      title: parsed.title,
      subject: requestedSubject ?? parsed.subject ?? "ENGLISH",
      grade: parsed.grade ?? null,
      semester: parsed.semester ?? null,
      year: parsed.year ?? null,
      round: parsed.round ?? null,
      examType: parsed.examType ?? null,
      publisher: parsed.publisher ?? null,
      contentHash: perJobContentHash,
    },
    select: { id: true },
  });
  return created.id;
}
