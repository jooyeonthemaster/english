"use server";

// ============================================================================
// 어법 훈련소 — 자동 폴더 귀속 + 생성 잡 폴링 액션 (v3 design §D5-3, 단위 D-2)
//
// 저장처는 Question/QuestionCollection 단일(§D5-3 확정 — 드릴 뱅크 반입은 v4).
// 기존 생성 파이프(saveGeneratedQuestionsForJob)는 폴더 귀속을 지원하지 않음을
// 실측 확인했으므로(question-generation-persistence.ts — collection 무접촉),
// 최소침습 경로 = 잡 완료 후 클라 폴링 시 귀속: 패널이 pollGrammarStudioGeneration
// 을 주기 호출하면, 완료된 훈련소 잡(config.studioMeta)의 result.questionIds 를
// 서버가 직접 읽어 「어법 훈련소」 루트 → 유닛 하위 폴더에 붙인다(폴링 = 귀속,
// skipDuplicates 멱등 — 중간 폴링 유실·재호출 모두 안전).
//
// 클라이언트가 questionIds 를 넘기지 않는다 — 잡 result 가 단일 진실이라 임의
// 문항을 남의 폴더에 붙이는 조작 여지가 없다(academy 스코프 이중 가드).
// ============================================================================

import { revalidatePath } from "next/cache";

import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { UNIT_BY_ID, unitLabel } from "@/lib/grammar-drill/curriculum";
import { prisma } from "@/lib/prisma";
import {
  GRAMMAR_SURFACE_NAMES,
  grammarStudioUnitFolderName,
} from "@/lib/wording/director-glossary";
import { requireAuth } from "./_helpers";

// ── 반환 타입 (interface/type 은 "use server" 에서 허용 — 값 export 금지) ────

export interface GrammarStudioCollectionRef {
  collectionId: string;
  name: string;
}

export interface GrammarStudioJobStatusRow {
  id: string;
  status: string;
  successCount: number;
  failedCount: number;
  errorMessage: string | null;
}

export interface GrammarStudioPollResult {
  success: boolean;
  jobs: GrammarStudioJobStatusRow[];
  /** 이번 호출에서 새로 귀속된 문항 수(멱등 — 기귀속 문항은 0으로 집계) */
  attached: number;
  /** 유닛 하위 폴더(첫 훈련소 잡 기준) — 「문제은행 폴더로 이동」 링크 재료 */
  collection: GrammarStudioCollectionRef | null;
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStudioUnitId(config: unknown): string | null {
  const meta = asRecord(asRecord(config)?.studioMeta);
  return meta && typeof meta.unitId === "string" ? meta.unitId : null;
}

function readResultQuestionIds(result: unknown): string[] {
  const row = asRecord(result);
  if (!row || !Array.isArray(row.questionIds)) return [];
  return row.questionIds.filter((id): id is string => typeof id === "string");
}

/**
 * 「어법 훈련소」 루트 + 유닛 하위 폴더 upsert — collectionId 반환(§D5-3 계약).
 * subject 컬럼은 참조하지 않는다(영어 기본 = 컬럼 미반영 DB 에서도 동작 —
 * collections-question.ts 의 우아한 강등 전례와 같은 보수 판단).
 */
export async function ensureGrammarStudioCollection(
  unitId: string,
): Promise<
  | { success: true; collectionId: string; name: string; rootId: string }
  | { success: false; error: string }
> {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_STUDIO) {
    return { success: false, error: "어법 훈련소가 비활성 상태입니다." };
  }
  const staff = await requireAuth();
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return { success: false, error: `알 수 없는 유닛: ${unitId}` };

  try {
    const rootName = GRAMMAR_SURFACE_NAMES.STUDIO;
    let root = await prisma.questionCollection.findFirst({
      where: { academyId: staff.academyId, parentId: null, name: rootName },
      select: { id: true },
    });
    if (!root) {
      root = await prisma.questionCollection.create({
        data: { academyId: staff.academyId, name: rootName, parentId: null },
        select: { id: true },
      });
    }

    const folderName = grammarStudioUnitFolderName(unitLabel(unitId), unit.title);
    let folder = await prisma.questionCollection.findFirst({
      where: { academyId: staff.academyId, parentId: root.id, name: folderName },
      select: { id: true },
    });
    if (!folder) {
      folder = await prisma.questionCollection.create({
        data: {
          academyId: staff.academyId,
          parentId: root.id,
          name: folderName,
          description: unit.subtitle,
        },
        select: { id: true },
      });
    }

    return {
      success: true,
      collectionId: folder.id,
      name: folderName,
      rootId: root.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 준비 실패";
    return { success: false, error: message };
  }
}

/** 완료 잡의 문항을 유닛 폴더에 귀속 — addQuestionsToCollection 관용 미러(멱등) */
async function attachQuestionsToCollection(
  academyId: string,
  collectionId: string,
  questionIds: string[],
): Promise<number> {
  if (questionIds.length === 0) return 0;
  // 살아있는(미삭제) 자사 문항만 — result.questionIds 는 하드 삭제로 dangling
  // 이 될 수 있다(ai-jobs route 의 좀비 카드 방지 전례).
  const live = await prisma.question.findMany({
    where: { id: { in: questionIds }, academyId, deletedAt: null },
    select: { id: true },
  });
  const liveIds = live.map((q) => q.id);
  if (liveIds.length === 0) return 0;

  const existing = await prisma.questionCollectionItem.findMany({
    where: { collectionId, questionId: { in: liveIds } },
    select: { questionId: true },
  });
  const existingSet = new Set(existing.map((e) => e.questionId));
  const toAdd = liveIds.filter((id) => !existingSet.has(id));
  if (toAdd.length === 0) return 0;

  const maxItem = await prisma.questionCollectionItem.findFirst({
    where: { collectionId },
    orderBy: { orderNum: "desc" },
    select: { orderNum: true },
  });
  const startOrder = (maxItem?.orderNum ?? -1) + 1;
  await prisma.questionCollectionItem.createMany({
    data: toAdd.map((questionId, idx) => ({
      collectionId,
      questionId,
      orderNum: startOrder + idx,
    })),
    skipDuplicates: true,
  });
  return toAdd.length;
}

/**
 * 생성 배치 폴링 — 잡 상태 반환 + 완료된 훈련소 잡의 문항을 그 자리에서 폴더에
 * 귀속한다(폴링 = 귀속: 패널이 중간에 닫혀도 다음 폴링·재진입 호출이 멱등
 * 재수습). WorkbenchAiJob 상태 폴링 관용(summary 스칼라 투영)을 액션으로 미러
 * — 배치 잡 id 지정 조회라 학원 전체 목록 폴링보다 좁고 싸다.
 */
export async function pollGrammarStudioGeneration(
  jobIds: string[],
): Promise<GrammarStudioPollResult> {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_STUDIO) {
    return {
      success: false,
      jobs: [],
      attached: 0,
      collection: null,
      error: "어법 훈련소가 비활성 상태입니다.",
    };
  }
  const staff = await requireAuth();
  const ids = [...new Set(jobIds.filter((id) => typeof id === "string" && id))].slice(
    0,
    20,
  );
  if (ids.length === 0) {
    return { success: true, jobs: [], attached: 0, collection: null };
  }

  try {
    const jobs = await prisma.workbenchAiJob.findMany({
      where: {
        id: { in: ids },
        academyId: staff.academyId,
        domain: "QUESTION_GENERATION",
      },
      select: {
        id: true,
        status: true,
        successCount: true,
        failedCount: true,
        errorMessage: true,
        config: true,
        result: true,
      },
    });
    const byId = new Map(jobs.map((j) => [j.id, j]));

    // ── 완료 훈련소 잡 → 유닛별 문항 귀속(멱등) ──
    const idsByUnit = new Map<string, string[]>();
    for (const job of jobs) {
      if (job.status !== "COMPLETED" && job.status !== "PARTIAL") continue;
      const unitId = readStudioUnitId(job.config);
      if (!unitId) continue; // 훈련소 잡이 아니면 무접촉
      const questionIds = readResultQuestionIds(job.result);
      if (questionIds.length === 0) continue;
      const bucket = idsByUnit.get(unitId) ?? [];
      bucket.push(...questionIds);
      idsByUnit.set(unitId, bucket);
    }

    let attached = 0;
    let collection: GrammarStudioCollectionRef | null = null;
    for (const [unitId, questionIds] of idsByUnit) {
      const ensured = await ensureGrammarStudioCollection(unitId);
      if (!ensured.success) continue; // 폴더 실패는 상태 폴링을 죽이지 않는다
      if (!collection) {
        collection = { collectionId: ensured.collectionId, name: ensured.name };
      }
      attached += await attachQuestionsToCollection(
        staff.academyId,
        ensured.collectionId,
        questionIds,
      );
    }
    if (attached > 0) revalidatePath("/director/questions");

    return {
      success: true,
      jobs: ids
        .map((id) => byId.get(id))
        .filter((j): j is NonNullable<typeof j> => j != null)
        .map((j) => ({
          id: j.id,
          status: j.status,
          successCount: j.successCount,
          failedCount: j.failedCount,
          errorMessage: j.errorMessage,
        })),
      attached,
      collection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴링 실패";
    return { success: false, jobs: [], attached: 0, collection: null, error: message };
  }
}
