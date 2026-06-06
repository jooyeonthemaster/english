import { prisma } from "@/lib/prisma";
import { normalizeReferenceImageInput } from "@/lib/similar-exam-generation/question-analysis/image-normalization";

import type { QuestionGenerationJobBody } from "./request-schema";

export class InvalidPassageSelectionError extends Error {
  constructor() {
    super("Invalid passage selection");
    this.name = "InvalidPassageSelectionError";
  }
}

interface RegisterQuestionGenerationJobArgs {
  staff: {
    id: string;
    academyId: string;
  };
  body: QuestionGenerationJobBody;
  requestId: string;
}

export async function registerQuestionGenerationJob({
  staff,
  body,
  requestId,
}: RegisterQuestionGenerationJobArgs): Promise<string> {
  const { images, passageIds, gradeInfo } = body;
  const uniquePassageIds = [...new Set(passageIds)];

  // 선택 지문이 이 학원 소유인지 확인.
  const ownedCount = await prisma.passage.count({
    where: { academyId: staff.academyId, id: { in: uniquePassageIds } },
  });
  if (ownedCount !== uniquePassageIds.length) {
    throw new InvalidPassageSelectionError();
  }

  const referenceImage = await normalizeReferenceImageInput(images[0]);

  const job = await prisma.similarQuestionGenerationJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      status: "PENDING",
      referenceImage: referenceImage.data,
      referenceMediaType: referenceImage.mediaType,
      passageIds: uniquePassageIds,
      gradeInfo: gradeInfo ?? null,
      passageCount: uniquePassageIds.length,
    },
    select: { id: true },
  });

  console.info(
    `[similar-question-job-registration] requestId=${requestId} job=${job.id} academy=${staff.academyId} passages=${uniquePassageIds.length}`,
  );

  return job.id;
}
