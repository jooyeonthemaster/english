import { Prisma as PrismaNS } from "@prisma/client";
import type { JobLike, SourceMaterialMeta, TxClient } from "./types";

/**
 * Reuse job.sourceMaterialId when finalize has already created one, otherwise
 * build a fresh SourceMaterial from the payload meta. Deduplicates by
 * (academyId, contentHash) — when a duplicate is detected, the existing row
 * is **reused** (no new row is created) and the caller is informed via the
 * `DUPLICATE_SOURCE_MATERIAL` warning.
 *
 * Everything — the lookup, the row creation, and the ExtractionJob patch —
 * runs inside the caller's transaction so partial failures never orphan a
 * SourceMaterial or leave an ExtractionJob pointing at nothing.
 */
export async function ensureSourceMaterial(
  tx: TxClient,
  args: {
    jobId: string;
    academyId: string;
    createdById: string;
    job: JobLike;
    meta?: SourceMaterialMeta;
  },
): Promise<{
  sourceMaterialId: string;
  /**
   * Resolved School FK for this commit — either the caller-supplied
   * `meta.schoolId` or the result of looking up `meta.schoolName` within the
   * academy. `undefined` when no school was specified OR the name lookup
   * missed (the raw name is still preserved on SourceMaterial.subtitle/
   * sourceRef in that case).
   */
  resolvedSchoolId?: string;
  warning?: "DUPLICATE_SOURCE_MATERIAL";
}> {
  const { jobId, academyId, createdById, job, meta } = args;

  // 0. Need the meta up front so we can resolve the school even when we end
  //    up reusing an existing SourceMaterial (the Passage rows still need a
  //    schoolId to link to). Caller may omit it (legal only for M1 / M2);
  //    synthesize a minimal placeholder in that case.
  const resolvedMeta: SourceMaterialMeta = meta ?? {
    title: job.originalFileName ?? "새 원본 자료",
  };

  // 0-b. Resolve `schoolName` (free-form) → `schoolId` (FK) within this
  //      academy. This prevents silent data loss when the reviewer typed a
  //      school name into the meta form but no SchoolId was known yet.
  //      Resolution order:
  //        (i)   meta.schoolId already present → trust it (authoritative).
  //        (ii)  Look up School by (academyId, name=trimmed schoolName).
  //        (iii) On miss, keep the raw name on `subtitle` / `sourceRef` so
  //              the signal is preserved for later triage.
  let resolvedSchoolId: string | undefined = resolvedMeta.schoolId;
  let unresolvedSchoolName: string | null = null;
  const rawSchoolName = resolvedMeta.schoolName?.trim();
  if (!resolvedSchoolId && rawSchoolName) {
    const school = await tx.school.findFirst({
      where: { academyId, name: rawSchoolName },
      select: { id: true },
    });
    if (school) {
      resolvedSchoolId = school.id;
    } else {
      unresolvedSchoolName = rawSchoolName;
    }
  }

  // Preserve schoolName signal when no FK match was found. We prefer
  // `subtitle` (visible in list views) and fall back to `sourceRef` so the
  // free-form breadcrumb survives across re-commit / export paths.
  const resolvedSubtitle =
    resolvedMeta.subtitle ??
    (unresolvedSchoolName ? `학교: ${unresolvedSchoolName}` : undefined);
  const resolvedSourceRef = unresolvedSchoolName
    ? `school:${unresolvedSchoolName}`
    : undefined;

  // 1. Finalize already linked one — trust it (academy scoped, so enforce).
  //    Read back the persisted schoolId so Passage creation can inherit it.
  if (job.sourceMaterialId) {
    const existing = await tx.sourceMaterial.findFirst({
      where: { id: job.sourceMaterialId, academyId },
      select: { id: true, schoolId: true },
    });
    if (existing) {
      return {
        sourceMaterialId: existing.id,
        resolvedSchoolId: existing.schoolId ?? resolvedSchoolId,
      };
    }
  }

  // 3. Dedup by (academyId, contentHash). Reuse the existing row — never
  //    create a second SourceMaterial for the same content in the same
  //    academy.
  if (resolvedMeta.contentHash) {
    const duplicate = await tx.sourceMaterial.findFirst({
      where: { academyId, contentHash: resolvedMeta.contentHash },
      select: { id: true, schoolId: true },
    });
    if (duplicate) {
      await tx.extractionJob.update({
        where: { id: jobId },
        data: { sourceMaterialId: duplicate.id },
      });
      return {
        sourceMaterialId: duplicate.id,
        resolvedSchoolId: duplicate.schoolId ?? resolvedSchoolId,
        warning: "DUPLICATE_SOURCE_MATERIAL",
      };
    }
  }

  // 4. No duplicate — insert. A concurrent commit may still race us on the
  //    unique (academyId, contentHash) index → catch P2002 and fall back to
  //    the freshly-inserted row.
  try {
    const created = await tx.sourceMaterial.create({
      data: {
        academyId,
        createdById,
        title: resolvedMeta.title,
        subtitle: resolvedSubtitle,
        type: resolvedMeta.type ?? "EXAM",
        subject: resolvedMeta.subject ?? "ENGLISH",
        grade: resolvedMeta.grade,
        semester: resolvedMeta.semester,
        year: resolvedMeta.year,
        round: resolvedMeta.round,
        examType: resolvedMeta.examType,
        publisher: resolvedMeta.publisher,
        schoolId: resolvedSchoolId,
        sourceRef: resolvedSourceRef,
        contentHash: resolvedMeta.contentHash,
        originalFileUrl: job.originalFileUrl,
      },
    });

    await tx.extractionJob.update({
      where: { id: jobId },
      data: { sourceMaterialId: created.id },
    });

    return { sourceMaterialId: created.id, resolvedSchoolId };
  } catch (err) {
    if (
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      resolvedMeta.contentHash
    ) {
      const winner = await tx.sourceMaterial.findFirst({
        where: { academyId, contentHash: resolvedMeta.contentHash },
        select: { id: true, schoolId: true },
      });
      if (winner) {
        await tx.extractionJob.update({
          where: { id: jobId },
          data: { sourceMaterialId: winner.id },
        });
        return {
          sourceMaterialId: winner.id,
          resolvedSchoolId: winner.schoolId ?? resolvedSchoolId,
          warning: "DUPLICATE_SOURCE_MATERIAL",
        };
      }
    }
    throw err;
  }
}
