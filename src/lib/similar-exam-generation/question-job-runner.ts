import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";

import { analyzeQuestionItem } from "./question-analysis/analyzer";
import { generateSimilarQuestion } from "./question-analysis/generator";
import { normalizeQuestionAnalysisImage } from "./question-analysis/image-normalization";
import type { QuestionAnalysisStats } from "./question-analysis/types";

/**
 * 동형 문제 생성 — 인-프로세스 백그라운드 워커.
 *
 * 트리거 데브를 경유하지 않고 앱(Node) 프로세스 안에서 처리한다(개발 서버 한정).
 * - 작업 상태는 SimilarQuestionGenerationJob(DB)에 영속 → 재시작/다중 폴링에도 일관.
 * - 동시 실행 잡 수는 MAX_CONCURRENT_JOBS 로 제한, 각 잡 내부 M×N 생성은 PAIR_CONCURRENCY 로 제한.
 * - DB updateMany(status=PENDING) 원자 클레임으로 같은 잡 중복 처리 방지.
 *
 * 주의: 인-프로세스이므로 서버 프로세스가 죽으면 진행 중 잡은 멈춘다. 이미 저장된 문항은
 * 영속되며, 멈춘 PROCESSING 잡은 다음 kick 시 recoverStalledJobs 로 PENDING 복구된다.
 */

const MAX_CONCURRENT_JOBS = 2;
const PAIR_CONCURRENCY = 4;
/** 이 시간 이상 PROCESSING 인 채 갱신 없으면 죽은 것으로 보고 재시도 대상으로. */
const STALE_PROCESSING_MS = 20 * 60 * 1000;
/** stale 복구 스윕 최소 간격 — GET 폴링마다 kick 돼도 과한 DB 쓰기 방지. */
const RECOVER_THROTTLE_MS = 60 * 1000;

let activeJobs = 0;
let pumping = false;
let lastRecoverAt = 0;
/**
 * 이 프로세스가 실제로 들고(실행 중) 있는 jobId. recoverStalledJobs 가 살아있는 잡을
 * stale 로 오인해 재클레임 → 같은 잡 2중 실행하는 것을 막는 펜싱. (단일 프로세스 한정:
 * set 에 있으면 살아있는 것이 확실하므로 시계 기반 cutoff 의 오탐을 무력화한다.)
 */
const claimedJobIds = new Set<string>();

interface GenerationSkipEntry {
  count: number;
  sample: string;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

function recordGenerationSkip(
  map: Map<string, GenerationSkipEntry>,
  questionLabel: string,
  error: unknown,
): void {
  const sample = compactError(error) || "Unknown generation error";
  const key = sample.slice(0, 120);
  const current = map.get(key);
  map.set(key, {
    count: (current?.count ?? 0) + 1,
    sample: current?.sample ?? `${questionLabel}: ${sample}`,
  });
}

function sourceQuestionLabel(question: { source: { questionNumber?: number | null; direction?: string } }): string {
  if (typeof question.source.questionNumber === "number") return `q${question.source.questionNumber}`;
  const direction = question.source.direction?.replace(/\s+/g, " ").trim();
  return direction ? direction.slice(0, 40) : "unknown";
}

function buildSkipSummary(args: {
  analysisStats: QuestionAnalysisStats;
  generationSkippedCount: number;
  generationSkipReasons: Map<string, GenerationSkipEntry>;
}) {
  return {
    analysis: {
      inventoryCount: args.analysisStats.inventoryCount,
      detailedCountBeforeFilter: args.analysisStats.detailedCountBeforeFilter,
      detailedCountAfterFilter: args.analysisStats.detailedCountAfterFilter,
      incompleteRemovedCount: args.analysisStats.incompleteRemovedCount,
      incompleteRemovedSummaries: args.analysisStats.incompleteRemovedSummaries.slice(0, 20),
      missingInventoryCount: args.analysisStats.missingInventoryCount,
      recoveredMissingCount: args.analysisStats.recoveredMissingCount,
      cropMismatchCount: args.analysisStats.cropMismatchCount,
      followUpFallbackCount: args.analysisStats.followUpFallbackCount,
      warnings: args.analysisStats.warnings.slice(0, 20),
    },
    generation: {
      skippedCount: args.generationSkippedCount,
      skippedByReason: Array.from(args.generationSkipReasons.values()).slice(0, 20),
    },
  };
}

/** 동시성 제한 map — 한 잡 내부 M×N 쌍을 병렬 처리. */
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

/**
 * 죽은 PROCESSING 잡(프로세스 종료 등으로 방치)을 PENDING 으로 되돌려 재시도.
 * - claimedJobIds 에 있는 잡(이 프로세스가 실행 중)은 절대 건드리지 않는다(2중 실행 방지).
 * - 시계 cutoff 는 재시작 후 남은 좀비 식별용 보조 휴리스틱.
 * - 폴링마다 호출되므로 RECOVER_THROTTLE_MS 로 스윕 빈도를 제한한다.
 */
async function recoverStalledJobs(): Promise<void> {
  const now = Date.now();
  if (now - lastRecoverAt < RECOVER_THROTTLE_MS) return;
  lastRecoverAt = now;

  const cutoff = new Date(now - STALE_PROCESSING_MS);
  const activeIds = Array.from(claimedJobIds);
  await prisma.similarQuestionGenerationJob
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
export function kickSimilarQuestionGenWorker(): void {
  void pump();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    await recoverStalledJobs();
    while (activeJobs < MAX_CONCURRENT_JOBS) {
      const candidate = await prisma.similarQuestionGenerationJob.findFirst({
        where: { status: "PENDING", deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!candidate) break;

      // 원자 클레임: status=PENDING 인 동안만 PROCESSING 으로. count!==1 이면 남이 가져간 것.
      const claim = await prisma.similarQuestionGenerationJob.updateMany({
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
    // pump 자체 실패는 다음 kick 에서 재시도되므로 흐름은 막지 않되, 운영 디버깅을 위해 로깅.
    console.error("[similar-question-worker] pump error", err);
  } finally {
    pumping = false;
  }
}

async function runJob(jobId: string): Promise<void> {
  const job = await prisma.similarQuestionGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const referenceImage = await normalizeQuestionAnalysisImage({
      data: Buffer.from(job.referenceImage, "base64"),
      mediaType: job.referenceMediaType,
    });
    const normalizedReferenceImageBase64 = referenceImage.data.toString("base64");
    if (
      normalizedReferenceImageBase64 !== job.referenceImage ||
      referenceImage.mediaType !== job.referenceMediaType
    ) {
      await prisma.similarQuestionGenerationJob.update({
        where: { id: jobId },
        data: {
          referenceImage: normalizedReferenceImageBase64,
          referenceMediaType: referenceImage.mediaType,
        },
      });
    }

    const {
      analysis,
      model: analysisModel,
      referenceText,
      stats: analysisStats,
    } = await analyzeQuestionItem({
      images: [referenceImage],
      gradeInfo: job.gradeInfo ?? undefined,
    });

    const allQuestions = analysis.groups.flatMap((group) => group.questions);
    const requestedPassageIds = Array.isArray(job.passageIds)
      ? [...new Set((job.passageIds as unknown[]).filter((v): v is string => typeof v === "string"))]
      : [];

    const passageRows = await prisma.passage.findMany({
      where: { academyId: job.academyId, id: { in: requestedPassageIds } },
      select: { id: true, content: true },
    });
    const contentById = new Map(passageRows.map((row) => [row.id, row.content ?? ""]));
    const validPassageIds = requestedPassageIds.filter((id) => contentById.get(id)?.trim());

    const pairs: Array<{ question: (typeof allQuestions)[number]; passageId: string }> = [];
    for (const question of allQuestions) {
      for (const passageId of validPassageIds) pairs.push({ question, passageId });
    }

    await prisma.similarQuestionGenerationJob.update({
      where: { id: jobId },
      data: {
        referenceCount: allQuestions.length,
        passageCount: validPassageIds.length,
        totalCount: pairs.length,
        // 검증용: docai 모드에서 분석이 실제로 본 OCR 텍스트를 저장(비-docai 면 null).
        referenceOcrText: referenceText ?? null,
        skipSummary: toPrismaJson(
          buildSkipSummary({
            analysisStats,
            generationSkippedCount: 0,
            generationSkipReasons: new Map(),
          }),
        ),
      },
    });

    if (pairs.length === 0) {
      await prisma.similarQuestionGenerationJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          // referenceImage 는 검증용으로 보존(이전엔 행 비대화 방지로 비웠음).
          errorMessage:
            validPassageIds.length === 0
              ? "선택한 지문의 본문을 찾지 못했습니다."
              : "분석된 문항이 없습니다.",
        },
      });
      return;
    }

    let saved = 0;
    let skipped = 0;
    const generationSkipReasons = new Map<string, GenerationSkipEntry>();

    // ── 동시성 계측(직렬/병렬 확인용) ──
    // inFlight=동시에 생성 중인 쌍 수, peakInFlight=관측된 최대 동시 수.
    // peak 가 PAIR_CONCURRENCY 에 근접하면 병렬 정상, 1 에 머물면 외부 직렬화(예: API 레이트리밋).
    const jobStartedAt = Date.now();
    let inFlight = 0;
    let peakInFlight = 0;

    // 듣기·도표 등 텍스트 생성 불가 유형은 generateSimilarQuestion 이 throw → skip.
    await mapWithConcurrency(pairs, PAIR_CONCURRENCY, async ({ question, passageId }) => {
      inFlight += 1;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      const pairStartedAt = Date.now();
      try {
        const gen = await generateSimilarQuestion({
          analysis: question,
          passage: contentById.get(passageId) ?? "",
          gradeInfo: job.gradeInfo ?? undefined,
        });
        const createdIds = await saveGeneratedQuestionsForJob({
          academyId: job.academyId,
          passageId,
          questions: [
            {
              ...gen.question,
              _similarQuestionGen: true,
              // 결과 귀속: 어느 잡에서 나왔는지 structuredData 에도 박는다(가시성·일관성).
              _similarQuestionGenJobId: jobId,
              // 어떤 모델로 분석했는지 — 모델 비교 테스트 시 구분용.
              _similarAnalysisModel: analysisModel,
              _similarSourceAnalysis: question,
            },
          ],
          generationPlan: "STANDARD",
          // 지문 소유/본문은 위 passageRows 조회(line ~115)에서 이미 검증됨 → 쌍마다 중복 조회 제거.
          skipPassageEligibilityCheck: true,
        });
        // 결과 귀속(핵심): 인덱스된 실제 컬럼에도 jobId 기록 → 동시 실행 잡 결과를 createdAt
        // 범위가 아니라 jobId 로 정확히 묶는다. 공유 persistence 는 수정하지 않고 post-save 로 세팅.
        if (createdIds.length > 0) {
          await prisma.question
            .updateMany({
              where: { id: { in: createdIds } },
              data: { similarQuestionGenJobId: jobId },
            })
            .catch(() => undefined);
        }
        saved += 1;
      } catch (error) {
        recordGenerationSkip(generationSkipReasons, sourceQuestionLabel(question), error);
        skipped += 1;
      } finally {
        const elapsedMs = Date.now() - pairStartedAt;
        inFlight -= 1;
        console.info(
          `[similar-question-worker] job=${jobId} pair done in ${elapsedMs}ms (inFlight=${inFlight}, peak=${peakInFlight}, done=${saved + skipped}/${pairs.length})`,
        );
      }
      // 진행률 갱신(폴링 표시용) — 매 쌍 처리 후 1회.
      // await 로 순서 보장: 모든 진행 갱신이 끝난 뒤에야 아래 최종 update 가 실행되어
      // 늦게 도착한 갱신이 최종 카운트를 덮어쓰지 않는다(LLM 호출 대비 무시할 비용).
      await prisma.similarQuestionGenerationJob
        .update({
          where: { id: jobId },
          data: {
            savedCount: saved,
            skippedCount: skipped,
            skipSummary: toPrismaJson(
              buildSkipSummary({
                analysisStats,
                generationSkippedCount: skipped,
                generationSkipReasons,
              }),
            ),
          },
        })
        .catch(() => undefined);
    });

    console.info(
      `[similar-question-worker] job=${jobId} DONE pairs=${pairs.length} saved=${saved} skipped=${skipped} peakInFlight=${peakInFlight} (limit ${PAIR_CONCURRENCY}) wallMs=${Date.now() - jobStartedAt}`,
    );

    await prisma.similarQuestionGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        savedCount: saved,
        skippedCount: skipped,
        skipSummary: toPrismaJson(
          buildSkipSummary({
            analysisStats,
            generationSkippedCount: skipped,
            generationSkipReasons,
          }),
        ),
        // referenceImage 는 검증용으로 보존(이전엔 행 비대화 방지로 비웠음).
        errorMessage:
          saved === 0
            ? "생성된 문항이 없습니다(듣기·도표 등 텍스트 생성 불가 유형이거나 생성 실패)."
            : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "동형 생성 중 오류가 발생했습니다.";
    await prisma.similarQuestionGenerationJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          // referenceImage 는 검증용으로 보존(실패 잡도 원본 확인 가능).
          errorMessage: message,
        },
      })
      .catch(() => undefined);
  }
}
