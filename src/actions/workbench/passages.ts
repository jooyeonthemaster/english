"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, getAcademyId } from "./_helpers";
import { buildDuplicateIndex } from "@/lib/duplicate-detection";
import { DIRECT_INPUT_PASSAGE_SOURCE } from "@/lib/passage-source";
import type {
  WorkbenchPassageFilters,
  ActionResult,
  CreatePassageData,
} from "./_types";

// ---------------------------------------------------------------------------
// Direct-input ("직접 붙여넣은 지문") material bucket
// ---------------------------------------------------------------------------
// Pasted passages are filed under ONE shared per-academy text material so they
// surface as 추출된 자료 (extracted material) — a text source with no image —
// in 추출된 자료 관리 / 학습지 생성 lists, exactly like OCR-extracted material.

/** Label shown on the shared bucket's material card / source material. */
const DIRECT_INPUT_MATERIAL_LABEL = "직접 붙여넣은 지문";
/** Sentinel `SourceMaterial.contentHash`. The `@@unique([academyId, contentHash])`
 *  index makes find-or-create return the single shared bucket per academy. */
const DIRECT_INPUT_MATERIAL_HASH = "__SMOAT_DIRECT_INPUT_TEXT__";
/** `ExtractionJob.sourceType` marker for the text bucket (vs "PDF" | "IMAGES"). */
const DIRECT_INPUT_SOURCE_TYPE = "TEXT";

// ---------------------------------------------------------------------------
// Passage CRUD (Workbench)
// ---------------------------------------------------------------------------

export async function getWorkbenchPassages(
  academyId: string,
  filters?: WorkbenchPassageFilters
) {
  await requireAuth();

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { academyId };

  if (filters?.schoolId) where.schoolId = filters.schoolId;
  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.publisher) where.publisher = filters.publisher;
  if (filters?.sourceMaterialId) where.sourceMaterialId = filters.sourceMaterialId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { content: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters?.analyzedOnly) {
    if (filters?.includeDirectInput) {
      // Analysis-complete passages OR direct-paste passages (which have no
      // analysis yet). Pushed onto `where.AND` so it composes correctly with
      // the `where.OR` search predicate above instead of overwriting it.
      const analyzedOrDirectInput = {
        OR: [
          { analysis: { isNot: null } },
          { source: DIRECT_INPUT_PASSAGE_SOURCE },
        ],
      };
      where.AND = Array.isArray(where.AND)
        ? [...where.AND, analyzedOrDirectInput]
        : [analyzedOrDirectInput];
    } else {
      where.analysis = { isNot: null };
    }
  }

  const [passages, total] = await Promise.all([
    prisma.passage.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, type: true } },
        analysis: { select: { id: true, updatedAt: true, analysisData: true } },
        _count: { select: { questions: true, notes: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.passage.count({ where }),
  ]);

  return { passages, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Scan the entire academy's passages and group exact-text duplicates.
 *
 * Used by `/director/workbench/passages` to provide a "중복 그룹 보기"
 * dedicated view. Unlike the paginated list, this returns *all* passages
 * that participate in a duplicate group (size ≥ 2) so the user can see every
 * cluster in one screen.
 *
 * The normalization is intentionally the same as the client-side helper
 * (`buildDuplicateIndex` from `@/lib/duplicate-detection`) — punctuation/case
 * insensitive, robust to OCR/whitespace noise.
 *
 * Heavy queries are mitigated by only selecting the minimal fields needed
 * for rendering the cluster cards. We do NOT return analysisData here; the
 * detail modal still fetches it separately on demand.
 */
export async function findWorkbenchPassageDuplicates(
  academyId: string,
  filters?: { analyzedOnly?: boolean },
) {
  await requireAuth();

  const where: Record<string, unknown> = { academyId };
  if (filters?.analyzedOnly) where.analysis = { isNot: null };

  // Pull the minimum fields needed for grouping + cluster card render.
  // `content` is required for normalization; everything else is presentational.
  const passages = await prisma.passage.findMany({
    where,
    select: {
      id: true,
      title: true,
      content: true,
      grade: true,
      semester: true,
      unit: true,
      publisher: true,
      difficulty: true,
      tags: true,
      createdAt: true,
      school: { select: { id: true, name: true, type: true } },
      analysis: { select: { id: true, updatedAt: true } },
      _count: { select: { questions: true, notes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const index = buildDuplicateIndex(
    passages,
    (p) => p.content,
    (p) => p.id,
  );

  // Drop `content` from groups before returning (network-friendly): the
  // cluster view doesn't need full content text, only the preview that the
  // card derives. Keep a short preview slice so the client can show context
  // without re-fetching.
  const groups = index.groups.map((g) => ({
    key: g.key,
    items: g.items.map((p) => ({
      id: p.id,
      title: p.title,
      contentPreview: p.content.length > 240 ? p.content.slice(0, 240) + "…" : p.content,
      wordCount: p.content.trim().split(/\s+/).filter(Boolean).length,
      grade: p.grade,
      semester: p.semester,
      unit: p.unit,
      publisher: p.publisher,
      difficulty: p.difficulty,
      tags: p.tags,
      createdAt: p.createdAt,
      school: p.school,
      analysis: p.analysis,
      _count: p._count,
    })),
  }));

  return {
    groups,
    groupCount: index.groupCount,
    totalDuplicateCount: index.totalDuplicateCount,
    totalScanned: passages.length,
  };
}

export async function getWorkbenchPassage(passageId: string) {
  await requireAuth();

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    include: {
      school: { select: { id: true, name: true, type: true } },
      notes: { orderBy: { order: "asc" } },
      analysis: true,
      questions: {
        include: { explanation: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return passage;
}

export async function createWorkbenchPassage(
  data: CreatePassageData
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);
    const schoolId = data.schoolId && data.schoolId !== "NONE" ? data.schoolId : null;

    if (schoolId) {
      const school = await prisma.school.findFirst({
        where: { id: schoolId, academyId },
        select: { id: true },
      });

      if (!school) {
        return {
          success: false,
          error: "선택한 학교를 찾을 수 없습니다. 학교 선택을 다시 확인해주세요.",
        };
      }
    }

    const annotationRows = (data.annotations ?? []).map((a, index) => ({
      annotationId: a.id,
      noteType: a.type,
      content: a.text,
      memo: a.memo ?? "",
      highlightStart: a.from,
      highlightEnd: a.to,
      order: index,
    }));

    const passage = await prisma.$transaction(async (tx) => {
      // ── Idempotent reuse for direct-input (pasted) passages ──
      // A pasted passage already exists as a real Passage AND carries an M1
      // draft (savedPassageId). Re-saving / analyzing that draft from 추출된
      // 자료 관리 must update the SAME passage, never spawn a duplicate. This is
      // gated on `source === 직접 입력`, so every existing extraction flow keeps
      // its exact create-new behavior untouched.
      if (data.sourceDraftId) {
        const linkedDraft = await tx.extractionM1PassageDraft.findFirst({
          where: {
            id: data.sourceDraftId,
            deletedAt: null,
            job: { academyId, deletedAt: null },
          },
          select: { id: true, savedPassageId: true },
        });
        if (linkedDraft?.savedPassageId) {
          const existing = await tx.passage.findFirst({
            where: {
              id: linkedDraft.savedPassageId,
              academyId,
              source: DIRECT_INPUT_PASSAGE_SOURCE,
            },
            select: { id: true },
          });
          if (existing) {
            await tx.passage.update({
              where: { id: existing.id },
              data: {
                title: data.title,
                content: data.content,
                // Preserve the 직접 입력 source marker — never overwrite it with
                // the analyze form's `source` (job name) or it stops being a
                // direct-input material. Only fill provided meta fields.
                ...(schoolId ? { schoolId } : {}),
                ...(data.grade !== undefined ? { grade: data.grade || null } : {}),
                ...(data.semester !== undefined
                  ? { semester: data.semester || null }
                  : {}),
                ...(data.unit !== undefined ? { unit: data.unit || null } : {}),
                ...(data.publisher !== undefined
                  ? { publisher: data.publisher || null }
                  : {}),
                ...(data.difficulty !== undefined
                  ? { difficulty: data.difficulty || null }
                  : {}),
                ...(data.tags ? { tags: JSON.stringify(data.tags) } : {}),
              },
            });
            await tx.extractionM1PassageDraft.update({
              where: { id: linkedDraft.id },
              data: { reviewStatus: "COMMITTED", confirmedAt: new Date() },
            });
            return existing;
          }
        }
      }

      const created = await tx.passage.create({
        data: {
          academyId,
          schoolId,
          title: data.title,
          content: data.content,
          source: data.source || null,
          grade: data.grade || null,
          semester: data.semester || null,
          unit: data.unit || null,
          publisher: data.publisher || null,
          difficulty: data.difficulty || null,
          tags: data.tags ? JSON.stringify(data.tags) : null,
          ...(annotationRows.length > 0
            ? { notes: { create: annotationRows } }
            : {}),
        },
      });

      if (data.sourceDraftId) {
        const sourceDraft = await tx.extractionM1PassageDraft.findFirst({
          where: {
            id: data.sourceDraftId,
            deletedAt: null,
            job: { academyId, deletedAt: null },
          },
          select: { id: true },
        });

        if (sourceDraft) {
          await tx.extractionM1PassageDraft.update({
            where: { id: sourceDraft.id },
            data: {
              savedPassageId: created.id,
              reviewStatus: "COMMITTED",
              confirmedAt: new Date(),
            },
          });
        }
      }

      return created;
    });

    revalidatePath("/director/workbench/passages");
    return { success: true, id: passage.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/**
 * Create a directly-pasted passage AND register it as 추출된 자료 (extracted
 * material) so it appears in 추출된 자료 관리 / 학습지 생성 lists like OCR material —
 * just a TEXT source with no image assigned.
 *
 * Everything is filed under ONE shared per-academy bucket:
 *   • SourceMaterial  — "직접 붙여넣은 지문" (type TEXT-ish handout, no originalFileUrl)
 *   • ExtractionJob   — PASSAGE_ONLY, sourceType "TEXT", no pages/image
 *   • ExtractionM1PassageDraft — one per pasted passage, COMMITTED + savedPassageId,
 *     restorationStatus "RESTORED" so it's always visible (`isM1DraftVisible`).
 *
 * The Passage keeps `source = 직접 입력` (so the existing includeDirectInput /
 * direct-input UI paths still work) and gains `sourceMaterialId` lineage.
 */
export async function createDirectInputPassageMaterial(data: {
  title: string;
  content: string;
  /**
   * 변형본 저장용 — 원본 Passage id. 지정하면 학교/학년/학기/단원/출판사/난이도
   * 메타를 원본에서 승계한다 (analysis 는 본문이 달라 stale 이므로 승계하지 않음).
   */
  sourcePassageId?: string;
}): Promise<ActionResult> {
  try {
    const staff = await requireAuth();
    const academyId = staff.academyId;
    const createdById = staff.id;
    const title = data.title.trim();
    const content = data.content.trim();

    if (content.length < 20) {
      return {
        success: false,
        error: "지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.",
      };
    }

    // 변형본이면 원본 메타를 academy 스코프로 조회해 승계한다.
    const sourcePassage = data.sourcePassageId
      ? await prisma.passage.findFirst({
          where: { id: data.sourcePassageId, academyId },
          select: {
            schoolId: true,
            grade: true,
            semester: true,
            unit: true,
            publisher: true,
            difficulty: true,
          },
        })
      : null;

    const passageId = await prisma.$transaction(
      async (tx) => {
        // 1) Shared "직접 붙여넣은 지문" SourceMaterial — one per academy.
        //    The sentinel contentHash + unique index makes this find-or-create.
        let material = await tx.sourceMaterial.findFirst({
          where: { academyId, contentHash: DIRECT_INPUT_MATERIAL_HASH },
          select: { id: true },
        });
        if (!material) {
          material = await tx.sourceMaterial.create({
            data: {
              academyId,
              type: "HANDOUT",
              title: DIRECT_INPUT_MATERIAL_LABEL,
              customLabel: DIRECT_INPUT_MATERIAL_LABEL,
              subject: "ENGLISH",
              contentHash: DIRECT_INPUT_MATERIAL_HASH,
              createdById,
            },
            select: { id: true },
          });
        }

        // 2) Shared text-source ExtractionJob (no file/image) — one per academy.
        let job = await tx.extractionJob.findFirst({
          where: {
            academyId,
            sourceMaterialId: material.id,
            sourceType: DIRECT_INPUT_SOURCE_TYPE,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!job) {
          job = await tx.extractionJob.create({
            data: {
              academyId,
              createdById,
              sourceType: DIRECT_INPUT_SOURCE_TYPE,
              mode: "PASSAGE_ONLY",
              displayName: DIRECT_INPUT_MATERIAL_LABEL,
              originalFileName: DIRECT_INPUT_MATERIAL_LABEL,
              sourceMaterialId: material.id,
              status: "COMPLETED",
              totalPages: 0,
              pendingPages: 0,
              successPages: 0,
              completedAt: new Date(),
            },
            select: { id: true },
          });
        }

        // 3) The Passage — direct-input + linked to the material for lineage.
        //    변형본이면 원본의 정적 메타(학교/학년/학기/단원/출판사/난이도)를
        //    승계해 생성 프롬프트 캘리브레이션·라이브러리 필터가 유지되게 한다.
        const passage = await tx.passage.create({
          data: {
            academyId,
            title,
            content,
            source: DIRECT_INPUT_PASSAGE_SOURCE,
            sourceMaterialId: material.id,
            ...(sourcePassage
              ? {
                  schoolId: sourcePassage.schoolId,
                  grade: sourcePassage.grade,
                  semester: sourcePassage.semester,
                  unit: sourcePassage.unit,
                  publisher: sourcePassage.publisher,
                  difficulty: sourcePassage.difficulty,
                }
              : {}),
          },
          select: { id: true },
        });

        // 4) Next passageOrder for the shared job (unique [jobId, passageOrder]).
        const last = await tx.extractionM1PassageDraft.findFirst({
          where: { jobId: job.id },
          orderBy: { passageOrder: "desc" },
          select: { passageOrder: true },
        });
        const nextOrder = (last?.passageOrder ?? -1) + 1;

        // 5) The M1 draft — mirrors a saved/committed extraction draft so the
        //    text passage shows in 추출된 자료 관리 (no restoration, no image).
        await tx.extractionM1PassageDraft.create({
          data: {
            jobId: job.id,
            sourceMaterialId: material.id,
            passageOrder: nextOrder,
            sourcePageIndex: [],
            title: title || null,
            rawText: content,
            restoredText: content,
            teacherText: content,
            // != "NO_RESTORATION_NEEDED" → always visible via isM1DraftVisible,
            // regardless of length. No real restoration happened.
            restorationStatus: "RESTORED",
            reviewStatus: "COMMITTED",
            savedPassageId: passage.id,
            confirmedAt: new Date(),
            metadata: data.sourcePassageId
              ? {
                  directInput: true,
                  source: "PASTE",
                  variantOf: data.sourcePassageId,
                }
              : { directInput: true, source: "PASTE" },
          },
        });

        return passage.id;
      },
      { timeout: 15_000 },
    );

    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/passages/create");
    revalidatePath("/director/workbench/passages/import/jobs");
    revalidatePath("/director/workbench/extraction/jobs");
    return { success: true, id: passageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateWorkbenchPassage(
  passageId: string,
  data: Partial<CreatePassageData>
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);
    const schoolId = data.schoolId && data.schoolId !== "NONE" ? data.schoolId : null;

    if (schoolId) {
      const school = await prisma.school.findFirst({
        where: { id: schoolId, academyId },
        select: { id: true },
      });

      if (!school) {
        return {
          success: false,
          error: "선택한 학교를 찾을 수 없습니다. 학교 선택을 다시 확인해주세요.",
        };
      }
    }

    await prisma.passage.update({
      where: { id: passageId },
      data: {
        title: data.title,
        content: data.content,
        schoolId,
        source: data.source,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit,
        publisher: data.publisher,
        difficulty: data.difficulty,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
      },
    });

    revalidatePath("/director/workbench/passages");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteWorkbenchPassage(
  passageId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passage.delete({ where: { id: passageId } });

    revalidatePath("/director/workbench/passages");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// Bulk delete: scoped to caller's academy so cross-tenant ids silently no-op
// instead of erroring out the whole batch.
export async function bulkDeleteWorkbenchPassages(
  passageIds: string[],
): Promise<{
  success: boolean;
  requested: number;
  deleted: number;
  error?: string;
}> {
  try {
    const staff = await requireAuth();
    if (passageIds.length === 0) {
      return { success: true, requested: 0, deleted: 0 };
    }
    const result = await prisma.passage.deleteMany({
      where: { id: { in: passageIds }, academyId: staff.academyId },
    });
    revalidatePath("/director/workbench/passages");
    return {
      success: true,
      requested: passageIds.length,
      deleted: result.count,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 삭제 중 오류가 발생했습니다.";
    return {
      success: false,
      requested: passageIds.length,
      deleted: 0,
      error: message,
    };
  }
}

export async function bulkUpdatePassageTags(
  passageIds: string[],
  tags: string[]
) {
  await requireAuth();
  try {
    const tagsJson = JSON.stringify(tags);
    await prisma.passage.updateMany({
      where: { id: { in: passageIds } },
      data: { tags: tagsJson },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "태그 업데이트 실패";
    return { success: false as const, error: message };
  }
}
