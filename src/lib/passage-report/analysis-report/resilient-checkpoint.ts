import type { PrismaClient } from "@prisma/client";
import type { ResilientCheckpoint } from "./resilient-generate";

/**
 * 회복형 생성 체크포인트의 영속/복원 헬퍼.
 *
 * 잡(workbench_ai_jobs)의 result JSON 안에 { checkpoint, partial } 로 부분 결과를 남긴다.
 * 다음 생성 요청(=새 잡)이 같은 지문(contentHash 일치)의 직전 잡 체크포인트를 찾아 이어받는다.
 * 전부 best-effort — 깨지거나 없으면 조용히 무시하고 처음부터(여전히 회복형) 생성한다.
 */

/** result JSON 에서 contentHash 가 일치하는 체크포인트만 안전하게 꺼낸다. */
export function extractCheckpoint(
  resultJson: unknown,
  contentHash: string,
): ResilientCheckpoint | null {
  if (!resultJson || typeof resultJson !== "object") return null;
  const cp = (resultJson as Record<string, unknown>).checkpoint;
  if (!cp || typeof cp !== "object") return null;
  const c = cp as Partial<ResilientCheckpoint>;
  if (c.contentHash !== contentHash) return null;
  if (!c.sections || typeof c.sections !== "object") return null;
  return {
    contentHash,
    meta: (c.meta as ResilientCheckpoint["meta"]) ?? null,
    sections: c.sections as ResilientCheckpoint["sections"],
    errors: (c.errors as ResilientCheckpoint["errors"]) ?? {},
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : 0,
  };
}

/**
 * 같은 학원·지문의 가장 최근 잡(현재 잡 제외)에서 이어받을 체크포인트를 찾는다.
 * contentHash 가 현재 본문과 다르면(지문이 바뀜) 무시한다.
 */
export async function loadPriorCheckpoint(
  prisma: PrismaClient,
  params: { academyId: string; passageId: string; contentHash: string; excludeJobId: string },
): Promise<ResilientCheckpoint | null> {
  try {
    const prior = await prisma.workbenchAiJob.findFirst({
      where: {
        academyId: params.academyId,
        domain: "PASSAGE_ANALYSIS",
        passageId: params.passageId,
        deletedAt: null,
        NOT: { id: params.excludeJobId },
      },
      orderBy: { createdAt: "desc" },
      select: { result: true },
    });
    return extractCheckpoint(prior?.result, params.contentHash);
  } catch {
    return null;
  }
}

/** 진행 중 부분 결과를 현재 잡 result 에 best-effort 로 영속(중도 종료 대비 이어받기용). */
export async function persistCheckpoint(
  prisma: PrismaClient,
  jobId: string,
  checkpoint: ResilientCheckpoint,
): Promise<void> {
  try {
    await prisma.workbenchAiJob.update({
      where: { id: jobId },
      data: { result: JSON.parse(JSON.stringify({ checkpoint, partial: true })) },
    });
  } catch {
    /* best-effort */
  }
}
