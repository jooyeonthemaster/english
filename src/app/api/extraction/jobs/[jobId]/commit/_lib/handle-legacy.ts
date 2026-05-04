import { NextResponse } from "next/server";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { commitJobRequestSchema } from "@/lib/extraction/zod-schemas";
import type { JobLike } from "./types";
import { TX_OPTIONS } from "./types";

// ============================================================================
// Legacy commit — preserved verbatim from the previous implementation.
// ============================================================================

export async function handleLegacyCommit(args: {
  jobId: string;
  academyId: string;
  job: JobLike;
  payload: z.infer<typeof commitJobRequestSchema>;
}) {
  const { jobId, academyId, job, payload } = args;

  const collectionId = await resolvePassageCollection({
    academyId,
    requestedId: payload.collectionId,
    requestedName: payload.collectionName,
    originalFileName: job.originalFileName,
  });

  const createdIds: string[] = [];

  for (const draft of payload.results) {
    const passage = await prisma.$transaction(async (tx) => {
      const p = await tx.passage.create({
        data: {
          academyId,
          title: draft.title,
          content: draft.content,
          source: job.originalFileName
            ? `bulk-extract:${job.originalFileName}`
            : `bulk-extract:${job.id}`,
          grade: draft.grade,
          semester: draft.semester,
          unit: draft.unit,
          publisher: draft.publisher,
          difficulty: draft.difficulty,
          tags: draft.tags ? JSON.stringify(draft.tags) : null,
        },
      });

      if (collectionId) {
        const maxItem = await tx.passageCollectionItem.findFirst({
          where: { collectionId },
          orderBy: { orderNum: "desc" },
          select: { orderNum: true },
        });
        await tx.passageCollectionItem.create({
          data: {
            collectionId,
            passageId: p.id,
            orderNum: (maxItem?.orderNum ?? -1) + 1,
          },
        });
      }

      await tx.extractionResult.updateMany({
        where: { jobId, passageOrder: draft.passageOrder },
        data: {
          status: "SAVED",
          savedPassageId: p.id,
          title: draft.title,
          content: draft.content,
        },
      });

      return p;
    }, TX_OPTIONS);
    createdIds.push(passage.id);
  }

  return NextResponse.json({
    createdPassageIds: createdIds,
    collectionId,
  });
}

/** Either reuse an existing collection, use the supplied id, or create one.
 *  Used only by the legacy path. */
async function resolvePassageCollection(args: {
  academyId: string;
  requestedId: string | undefined;
  requestedName: string | undefined;
  originalFileName: string | null;
}): Promise<string | null> {
  const { academyId, requestedId, requestedName, originalFileName } = args;

  if (requestedId) {
    const existing = await prisma.passageCollection.findUnique({
      where: { id: requestedId },
      select: { academyId: true },
    });
    if (existing && existing.academyId === academyId) return requestedId;
  }

  const defaultName =
    requestedName ||
    originalFileName ||
    `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`;

  const collection = await prisma.passageCollection.create({
    data: {
      academyId,
      name: defaultName.slice(0, 120),
      description: "시험지 일괄 등록으로 자동 생성된 컬렉션",
    },
  });
  return collection.id;
}
