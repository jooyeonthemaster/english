"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import { DIRECT_INPUT_PASSAGE_SOURCE } from "@/lib/passage-source";
import { getKoPassagesByIds } from "@/lib/korean-exam-passages/corpus";
import { KO_MAX_IDS } from "@/lib/korean-exam-passages/types";

// ---------------------------------------------------------------------------
// 국어 기출 지문 → "내 지문함"(subject=KOREAN) 일괄 등록
// ---------------------------------------------------------------------------
// 영어 importExamPassages 의 국어 대칭. 크롤 국어 코퍼스(src/data/exam-passages-korean)
// 에서 id 목록을 받아 본문은 서버가 해석하고, 직접-입력과 동일한 SourceMaterial/
// ExtractionJob 계보로 Passage(subject=KOREAN) + M1 draft 를 만든다.
// 멱등: tags 의 kice_ko:<id> 마커로 이미 등록된 지문은 건너뛴다.

const KO_MATERIAL_LABEL = "직접 붙여넣은 지문 (국어)";
const KO_MATERIAL_HASH = "__SMOAT_DIRECT_INPUT_TEXT_KO__";
const KO_TAG_PREFIX = "kice_ko:";

async function runWithUniqueRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if ((e as { code?: string })?.code !== "P2002") throw e;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
  throw lastErr;
}

export interface ImportKoreanExamPassagesResult {
  success: boolean;
  error?: string;
  createdIds: string[];
  skippedExamIds: string[];
}

export async function importKoreanExamPassages(
  examPassageIds: string[],
): Promise<ImportKoreanExamPassagesResult> {
  try {
    const staff = await requireAuth();
    const academyId = staff.academyId;
    const createdById = staff.id;

    const ids = Array.from(
      new Set((examPassageIds ?? []).map((s) => s.trim()).filter(Boolean)),
    ).slice(0, KO_MAX_IDS);
    if (ids.length === 0) {
      return {
        success: false,
        error: "불러올 기출 지문을 선택해주세요.",
        createdIds: [],
        skippedExamIds: [],
      };
    }

    const records = getKoPassagesByIds(ids);
    if (records.length === 0) {
      return {
        success: false,
        error: "선택한 기출 지문을 찾을 수 없습니다.",
        createdIds: [],
        skippedExamIds: [],
      };
    }

    // 멱등 — 이미 등록된 국어 기출(tags 의 kice_ko:<id>) 제외.
    const existing = await prisma.passage.findMany({
      where: { academyId, tags: { contains: KO_TAG_PREFIX } },
      select: { tags: true },
    });
    const alreadyImported = new Set<string>();
    for (const row of existing) {
      if (!row.tags) continue;
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            if (typeof t === "string" && t.startsWith(KO_TAG_PREFIX)) {
              alreadyImported.add(t.slice(KO_TAG_PREFIX.length));
            }
          }
        }
      } catch {
        /* 비정상 tags 무시 */
      }
    }

    const toCreate = records.filter(
      (r) =>
        !alreadyImported.has(r.id) &&
        typeof r.passageText === "string" &&
        r.passageText.trim().length > 0,
    );
    const skippedExamIds = records
      .filter((r) => alreadyImported.has(r.id))
      .map((r) => r.id);

    if (toCreate.length === 0) {
      return { success: true, createdIds: [], skippedExamIds };
    }

    const createdIds = await runWithUniqueRetry(() =>
      prisma.$transaction(
        async (tx) => {
          // 공유 국어 직접입력 SourceMaterial(학원당 1개, subject=KOREAN).
          let material = await tx.sourceMaterial.findFirst({
            where: { academyId, contentHash: KO_MATERIAL_HASH },
            select: { id: true },
          });
          if (!material) {
            material = await tx.sourceMaterial.create({
              data: {
                academyId,
                type: "HANDOUT",
                title: KO_MATERIAL_LABEL,
                customLabel: KO_MATERIAL_LABEL,
                subject: "KOREAN",
                contentHash: KO_MATERIAL_HASH,
                createdById,
              },
              select: { id: true },
            });
          }

          let job = await tx.extractionJob.findFirst({
            where: {
              academyId,
              sourceMaterialId: material.id,
              sourceType: "TEXT",
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!job) {
            job = await tx.extractionJob.create({
              data: {
                academyId,
                createdById,
                sourceType: "TEXT",
                mode: "PASSAGE_ONLY",
                displayName: KO_MATERIAL_LABEL,
                originalFileName: KO_MATERIAL_LABEL,
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

          const last = await tx.extractionM1PassageDraft.findFirst({
            where: { jobId: job.id },
            orderBy: { passageOrder: "desc" },
            select: { passageOrder: true },
          });
          let nextOrder = (last?.passageOrder ?? -1) + 1;

          const made: string[] = [];
          for (const r of toCreate) {
            const title = r.title;
            const content = r.passageText.trim();
            const tags = JSON.stringify([
              "국어기출",
              String(r.year),
              r.siheng,
              r.galae,
              `KO_KIND:${r.galae}`,
              `${KO_TAG_PREFIX}${r.id}`,
            ]);

            const passage = await tx.passage.create({
              data: {
                academyId,
                title,
                content,
                source: DIRECT_INPUT_PASSAGE_SOURCE,
                sourceMaterialId: material.id,
                extractionOutput: "verbatim",
                subject: "KOREAN",
                tags,
              },
              select: { id: true },
            });

            await tx.extractionM1PassageDraft.create({
              data: {
                jobId: job.id,
                sourceMaterialId: material.id,
                passageOrder: nextOrder,
                sourcePageIndex: [],
                title,
                rawText: content,
                restoredText: content,
                teacherText: content,
                restorationStatus: "RESTORED",
                reviewStatus: "COMMITTED",
                savedPassageId: passage.id,
                confirmedAt: new Date(),
                metadata: {
                  directInput: true,
                  source: "KOREAN_EXAM_PASSAGE",
                  subject: "KOREAN",
                  examPassageId: r.id,
                  examId: r.examId,
                  year: r.year,
                  galae: r.galae,
                },
              },
            });

            made.push(passage.id);
            nextOrder += 1;
          }
          return made;
        },
        { timeout: 30_000 },
      ),
    );

    revalidatePath("/director/korean/passages/create");
    revalidatePath("/director/korean/generate");

    return { success: true, createdIds, skippedExamIds };
  } catch (err) {
    console.error("[importKoreanExamPassages] failed", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "국어 기출 지문 등록 중 오류가 발생했습니다.",
      createdIds: [],
      skippedExamIds: [],
    };
  }
}
