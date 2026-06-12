import "server-only";

import { prisma } from "@/lib/prisma";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";

import { generateFromCustomType } from "./generator";
import { bumpCustomTypeCounters, getActiveCustomTypeSpec } from "./persistence";
import { parseCompiledCustomType } from "./types";

/**
 * 커스텀 유형 문제 생성 — 인-프로세스 백그라운드 워커(개발 서버 한정).
 *
 * 동형 문제 워커(question-job-runner)의 검증된 패턴을 참고해 **별도로 새로 작성**한다
 * (동형 코드는 import/수정하지 않음). DB 잡(CustomQuestionGenerationJob)에 상태를 영속하며,
 * 원자 클레임 + claimedJobIds 펜싱 + stale 복구로 다중 폴링/재시작에도 일관성을 유지한다.
 */

const MAX_CONCURRENT_JOBS = 2;
/** 한 잡 내부의 (지문×개수) 쌍 병렬 상한. ② 빌트인 경로는 내부 재시도가 많아 보수적으로. */
const PAIR_CONCURRENCY = 4;
const STALE_PROCESSING_MS = 20 * 60 * 1000;
const RECOVER_THROTTLE_MS = 60 * 1000;

type VisibleLanguage = "ko" | "en";

interface CustomGenerationOverrides {
  optionCount?: number;
  correctAnswerCount?: number;
  stemLanguage?: VisibleLanguage;
  optionLanguage?: VisibleLanguage;
  params?: Record<string, number>;
}

let activeJobs = 0;
let pumping = false;
let lastRecoverAt = 0;
const claimedJobIds = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isVisibleLanguage(value: unknown): value is VisibleLanguage {
  return value === "ko" || value === "en";
}

function mergeOverrideTypeSettings(
  baseSpec: {
    nearestBuiltin: string | null;
    typeSettings: Record<string, unknown> | null;
  },
  ov: CustomGenerationOverrides | null,
): Record<string, unknown> | null {
  if (!ov) return null;

  const typeId = baseSpec.nearestBuiltin?.trim() || "";
  const settingPatch: Record<string, unknown> = {};
  if (typeof ov.optionCount === "number") {
    settingPatch.optionCount = ov.optionCount;
    if (typeId === "GRAMMAR_ERROR") settingPatch.markerCount = ov.optionCount;
    if (typeId === "IRRELEVANT") settingPatch.slotCount = ov.optionCount;
  }
  if (typeof ov.correctAnswerCount === "number") {
    settingPatch.answerCount = ov.correctAnswerCount;
    settingPatch.correctAnswerCount = ov.correctAnswerCount;
    if (typeId === "GRAMMAR_CORRECTION") settingPatch.errorCount = ov.correctAnswerCount;
  }
  if (ov.params && typeof ov.params === "object") {
    Object.assign(settingPatch, ov.params);
  }
  if (isVisibleLanguage(ov.stemLanguage)) {
    settingPatch.stemLanguage = ov.stemLanguage;
  }
  if (isVisibleLanguage(ov.optionLanguage)) {
    settingPatch.optionLanguage = ov.optionLanguage;
  }
  if (Object.keys(settingPatch).length === 0) return null;

  const next = isRecord(baseSpec.typeSettings) ? { ...baseSpec.typeSettings } : {};
  if (typeId) {
    const currentForType = isRecord(next[typeId]) ? next[typeId] : {};
    next[typeId] = { ...currentForType, ...settingPatch };
  } else {
    Object.assign(next, settingPatch);
  }
  return next;
}

function readOverrideParams(
  ov: CustomGenerationOverrides | null,
): Record<string, number> | null {
  return ov?.params && typeof ov.params === "object" ? ov.params : null;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function recoverStalledJobs(): Promise<void> {
  const now = Date.now();
  if (now - lastRecoverAt < RECOVER_THROTTLE_MS) return;
  lastRecoverAt = now;

  const cutoff = new Date(now - STALE_PROCESSING_MS);
  const activeIds = Array.from(claimedJobIds);
  await prisma.customQuestionGenerationJob
    .updateMany({
      where: {
        status: "PROCESSING",
        deletedAt: null,
        updatedAt: { lt: cutoff },
        ...(activeIds.length > 0 ? { id: { notIn: activeIds } } : {}),
      },
      data: { status: "PENDING", startedAt: null },
    })
    .catch(() => undefined);
}

/** PENDING 잡을 동시성 한도 안에서 꺼내 실행. 라우트 enqueue 후 + 잡 종료 후 호출. */
export function kickCustomQuestionGenWorker(): void {
  void pump();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    await recoverStalledJobs();
    while (activeJobs < MAX_CONCURRENT_JOBS) {
      const candidate = await prisma.customQuestionGenerationJob.findFirst({
        where: { status: "PENDING", deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!candidate) break;

      const claim = await prisma.customQuestionGenerationJob.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: { status: "PROCESSING", startedAt: new Date() },
      });
      if (claim.count !== 1) continue;

      activeJobs += 1;
      claimedJobIds.add(candidate.id);
      void runJob(candidate.id).finally(() => {
        activeJobs -= 1;
        claimedJobIds.delete(candidate.id);
        void pump();
      });
    }
  } catch (err) {
    console.error("[custom-question-worker] pump error", err);
  } finally {
    pumping = false;
  }
}

async function runJob(jobId: string): Promise<void> {
  const job = await prisma.customQuestionGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const active = await getActiveCustomTypeSpec(job.academyId, job.customTypeId);
    if (!active) {
      await prisma.customQuestionGenerationJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          errorMessage: "커스텀 유형 정의를 찾지 못했습니다(삭제됐거나 활성 버전 없음).",
        },
      });
      return;
    }
    // 생성 시 유형 정의 임시 override(이 배치만) — 난이도 + 선지/정답 수·답형·복수정답·지문기반.
    const baseSpec = active.spec;
    const ov = (job.overrides ?? null) as CustomGenerationOverrides | null;
    const patch: Record<string, unknown> = {};
    if (job.difficulty && job.difficulty !== baseSpec.difficulty) patch.difficulty = job.difficulty;
    if (ov) {
      if (typeof ov.optionCount === "number") patch.optionCount = ov.optionCount;
      if (typeof ov.correctAnswerCount === "number") patch.correctAnswerCount = ov.correctAnswerCount;
      const typeSettings = mergeOverrideTypeSettings(baseSpec, ov);
      if (typeSettings) patch.typeSettings = typeSettings;
      // 유형 고유 수치 파라미터 override(key→value) — 정의의 tunableParams value 를 교체(min/max 클램프).
      const ovParams = readOverrideParams(ov);
      if (ovParams && baseSpec.tunableParams.length > 0) {
        patch.tunableParams = baseSpec.tunableParams.map((p) => {
          const v = ovParams[p.key];
          return typeof v === "number"
            ? { ...p, value: Math.min(p.max, Math.max(p.min, Math.round(v))) }
            : p;
        });
      }
    }
    let spec =
      Object.keys(patch).length > 0
        ? parseCompiledCustomType({ ...baseSpec, ...patch })
        : baseSpec;
    // MC 정답 수는 보기 수를 넘을 수 없게 클램프(생성기 게이트와 일관, 과잉 skip 방지).
    if (spec.answerShape === "MULTIPLE_CHOICE" && spec.optionCount > 0) {
      const clamped = Math.min(Math.max(spec.correctAnswerCount, 1), spec.optionCount);
      if (clamped !== spec.correctAnswerCount) spec = { ...spec, correctAnswerCount: clamped };
    }

    const requestedPassageIds = Array.isArray(job.passageIds)
      ? [...new Set((job.passageIds as unknown[]).filter((v): v is string => typeof v === "string"))]
      : [];
    const passageRows = await prisma.passage.findMany({
      where: { academyId: job.academyId, id: { in: requestedPassageIds } },
      select: { id: true, content: true },
    });
    const contentById = new Map(passageRows.map((row) => [row.id, row.content ?? ""]));
    const validPassageIds = requestedPassageIds.filter((id) => contentById.get(id)?.trim());

    const countPerPassage = Math.max(1, job.countPerPassage);
    const pairs: Array<{ passageId: string }> = [];
    for (const passageId of validPassageIds) {
      for (let i = 0; i < countPerPassage; i += 1) pairs.push({ passageId });
    }

    await prisma.customQuestionGenerationJob.update({
      where: { id: jobId },
      data: { passageCount: validPassageIds.length, totalCount: pairs.length },
    });

    if (pairs.length === 0) {
      await prisma.customQuestionGenerationJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          errorMessage: "선택한 지문의 본문을 찾지 못했습니다.",
        },
      });
      return;
    }

    let saved = 0;
    let skipped = 0;

    await mapWithConcurrency(pairs, PAIR_CONCURRENCY, async ({ passageId }) => {
      try {
        const gen = await generateFromCustomType({
          spec,
          passage: contentById.get(passageId) ?? "",
          gradeInfo: job.gradeInfo ?? undefined,
        });
        const createdIds = await saveGeneratedQuestionsForJob({
          academyId: job.academyId,
          passageId,
          questions: [
            {
              ...gen.question,
              _customQuestionGen: true,
              _customTypeId: job.customTypeId,
              _customTypeTier: gen.tier,
            },
          ],
          generationPlan: "STANDARD",
          // 지문 소유/본문은 위 조회에서 검증됨 → 쌍마다 중복 조회 제거.
          skipPassageEligibilityCheck: true,
        });
        // 결과 귀속: 인덱스된 실제 컬럼에 customTypeId 기록(공유 persistence 무수정, post-save).
        if (createdIds.length > 0) {
          await prisma.question
            .updateMany({
              where: { id: { in: createdIds } },
              data: { customTypeId: job.customTypeId },
            })
            .catch(() => undefined);
        }
        saved += 1;
      } catch {
        // 듣기·도표 등 생성 불가 유형이거나 생성 실패 → skip.
        skipped += 1;
      }
      await prisma.customQuestionGenerationJob
        .update({
          where: { id: jobId },
          data: { savedCount: saved, skippedCount: skipped },
        })
        .catch(() => undefined);
    });

    await prisma.customQuestionGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        savedCount: saved,
        skippedCount: skipped,
        errorMessage:
          saved === 0
            ? "생성된 문항이 없습니다(듣기·도표 등 생성 불가 유형이거나 생성 실패)."
            : null,
      },
    });

    await bumpCustomTypeCounters(job.customTypeId, { usage: 1, generated: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "커스텀 유형 생성 중 오류가 발생했습니다.";
    await prisma.customQuestionGenerationJob
      .update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorMessage: message },
      })
      .catch(() => undefined);
  }
}
