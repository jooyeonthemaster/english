import { createHash } from "node:crypto";
import passagesJson from "../src/data/exam-passages/passages.json";
import type { ExamPassage } from "../src/lib/exam-passages/types";
import {
  buildExamPassageWebtoonPrompt,
  examPassageContentHash,
  EXAM_PASSAGE_WEBTOON_LANGUAGES,
  EXAM_PASSAGE_WEBTOON_STYLE,
} from "../src/lib/exam-passages/webtoon-assets";
import { reviewExamPassageWebtoonImage } from "../src/lib/exam-passages/webtoon-review";
import {
  WEBTOON_IMAGE_PLANS,
  type WebtoonImagePlanId,
} from "../src/lib/webtoon-models";
import { generateImage, type AtlasImageSize } from "../src/lib/atlas";
import { recordPlatformApiUsageCost } from "../src/lib/platform-api-costs";
import {
  deleteWebtoonImage,
  uploadRemoteImageToExamPassageWebtoonBucket,
} from "../src/lib/webtoon-storage";
import { prisma } from "../src/lib/prisma";
import type { WebtoonLanguageId } from "../src/app/(director)/director/workbench/webtoon/webtoon-page-types";

interface Args {
  execute: boolean;
  force: boolean;
  reviewOnly: boolean;
  noAutoApprove: boolean;
  limit: number | null;
  offset: number;
  yearFrom: number | null;
  passageId: string | null;
  language: WebtoonLanguageId | null;
  plan: WebtoonImagePlanId;
  maxReviewAttempts: number;
  imageTimeoutMs: number;
}

type ExistingAsset = {
  id: string;
  status: string;
  sourceHash: string | null;
  imageUrl: string | null;
  storagePath: string | null;
  attempts: number;
};

type GenerationOutcome = "APPROVED" | "REJECTED" | "FAILED";

const args = parseArgs(process.argv.slice(2));
const allPassages = (passagesJson as ExamPassage[])
  .filter((passage) => passage.text?.trim())
  .filter((passage) => (args.yearFrom ? passage.year >= args.yearFrom : true))
  .filter((passage) => (args.passageId ? passage.id === args.passageId : true))
  .sort(compareLatestFirst);
const selectedPassages = allPassages.slice(
  args.offset,
  args.limit ? args.offset + args.limit : undefined,
);
const languages = args.language ? [args.language] : EXAM_PASSAGE_WEBTOON_LANGUAGES;
const plan = WEBTOON_IMAGE_PLANS[args.plan];

async function main() {
  console.log(
    `[exam-webtoon] totalCandidates=${allPassages.length}, offset=${args.offset}, passages=${selectedPassages.length}, languages=${languages.join(",")}, plan=${plan.id}, execute=${args.execute}, reviewOnly=${args.reviewOnly}, maxReviewAttempts=${args.maxReviewAttempts}, imageTimeoutMs=${args.imageTimeoutMs}`,
  );
  assertNoExternalImageGeneration();

  let queued = 0;
  let skipped = 0;
  let generated = 0;
  let reviewed = 0;
  let approved = 0;
  let rejected = 0;
  let failed = 0;

  for (const passage of selectedPassages) {
    for (const language of languages) {
      const sourceHash = examPassageContentHash(passage);
      const basePrompt = buildExamPassageWebtoonPrompt(passage, language);
      const promptHash = hashPrompt(basePrompt);

      if (!args.execute) {
        queued += 1;
        console.log(`[dry-run] ${passage.id} ${language} promptHash=${promptHash}`);
        continue;
      }

      const existing = await findExistingAsset(passage.id, language);

      if (args.reviewOnly) {
        if (!existing?.imageUrl) {
          skipped += 1;
          console.log(`[review-skip] ${passage.id} ${language}: no imageUrl`);
          continue;
        }
        try {
          const review = await reviewAndPersist(existing.id, existing.imageUrl, passage, language);
          reviewed += 1;
          if (review.pass) approved += 1;
          else rejected += 1;
        } catch (error) {
          failed += 1;
          await markFailed(existing.id, error);
          console.error(`[review-failed] ${passage.id} ${language}: ${errorMessage(error)}`);
        }
        continue;
      }

      if (
        existing &&
        !args.force &&
        existing.sourceHash === sourceHash &&
        existing.status === "APPROVED"
      ) {
        skipped += 1;
        continue;
      }

      if (
        existing &&
        !args.force &&
        existing.sourceHash === sourceHash &&
        existing.status === "GENERATING"
      ) {
        skipped += 1;
        console.log(`[skip] ${passage.id} ${language}: already GENERATING`);
        continue;
      }

      let correction: string | undefined;
      if (
        existing?.imageUrl &&
        !args.force &&
        existing.sourceHash === sourceHash &&
        (existing.status === "REVIEW_REQUIRED" || existing.status === "REJECTED")
      ) {
        try {
          const review = await reviewAndPersist(existing.id, existing.imageUrl, passage, language);
          reviewed += 1;
          if (review.pass) {
            approved += 1;
            continue;
          }
          correction = review.correction;
        } catch (error) {
          failed += 1;
          await markFailed(existing.id, error);
          console.error(`[review-failed] ${passage.id} ${language}: ${errorMessage(error)}`);
          continue;
        }
      }

      try {
        const outcome = await generateWithReviewLoop({
          passage,
          language,
          initialCorrection: correction,
        });
        generated += outcome.generatedAttempts;
        reviewed += outcome.reviewedAttempts;
        if (outcome.status === "APPROVED") approved += 1;
        else if (outcome.status === "REJECTED") rejected += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        console.error(`[failed] ${passage.id} ${language}: ${errorMessage(error)}`);
      }
    }
  }

  console.log(
    `[exam-webtoon] done generated=${generated}, reviewed=${reviewed}, approved=${approved}, rejected=${rejected}, failed=${failed}, skipped=${skipped}, dryRunQueued=${queued}`,
  );
}

function assertNoExternalImageGeneration() {
  if (!args.execute || args.reviewOnly) return;
  throw new Error(
    "External image-generation API execution is forbidden by AGENTS.md. Generate exam webtoon images directly with Codex native image generation, then import/review them; do not call AtlasCloud/OpenRouter/Higgsfield/Gemini image APIs from this script.",
  );
}

async function generateWithReviewLoop(input: {
  passage: ExamPassage;
  language: WebtoonLanguageId;
  initialCorrection?: string;
}): Promise<{
  status: GenerationOutcome;
  generatedAttempts: number;
  reviewedAttempts: number;
}> {
  let correction = input.initialCorrection;
  let generatedAttempts = 0;
  let reviewedAttempts = 0;
  let latestAssetId: string | null = null;
  let latestError: unknown = null;

  for (let attempt = 1; attempt <= args.maxReviewAttempts; attempt += 1) {
    const prompt = buildExamPassageWebtoonPrompt(input.passage, input.language, correction);
    const promptHash = hashPrompt(prompt);
    const sourceHash = examPassageContentHash(input.passage);
    const asset = await upsertGeneratingAsset({
      passage: input.passage,
      language: input.language,
      prompt,
      promptHash,
      sourceHash,
    });
    latestAssetId = asset.id;

    try {
      console.log(
        `[generate] ${input.passage.id} ${input.language} asset=${asset.id} attempt=${attempt}/${args.maxReviewAttempts}`,
      );
      const result = await generateImage({
        prompt,
        model: plan.modelId,
        size: plan.params.size as AtlasImageSize | undefined,
        quality: plan.params.quality,
        outputFormat: "jpeg",
        aspectRatio: plan.params.aspectRatio,
        resolution: plan.params.resolution,
        thinkingLevel: plan.params.thinkingLevel,
        timeoutMs: args.imageTimeoutMs,
        pollIntervalMs: 2500,
        maxAttempts: 2,
      });
      const rawUrl = result.outputs?.[0];
      if (!rawUrl) throw new Error("AtlasCloud returned no image output URL");

      const uploaded = await uploadRemoteImageToExamPassageWebtoonBucket({
        remoteUrl: rawUrl,
        assetId: asset.id,
        version: `${Date.now()}-${attempt}`,
      });
      generatedAttempts += 1;

      await recordImageGenerationCost({
        assetId: asset.id,
        predictionId: result.predictionId,
      });

      await prisma.examPassageWebtoonAsset.update({
        where: { id: asset.id },
        data: {
          status: "REVIEW_REQUIRED",
          imageUrl: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          rawAtlasUrl: rawUrl,
          atlasPredictionId: result.predictionId,
          generatedAt: new Date(),
          reviewedAt: null,
          errorMessage: null,
          qaReport: {
            status: "REVIEW_REQUIRED",
            rule: "Generated image must pass automated strict text/content/style QA before approval.",
            attempt,
            maxReviewAttempts: args.maxReviewAttempts,
          },
        },
      });

      if (asset.storagePath && asset.storagePath !== uploaded.storagePath) {
        await deleteWebtoonImage(asset.storagePath);
      }

      const review = await reviewAndPersist(asset.id, uploaded.publicUrl, input.passage, input.language);
      reviewedAttempts += 1;
      if (review.pass) {
        console.log(`[approved] ${input.passage.id} ${input.language} asset=${asset.id}`);
        return { status: "APPROVED", generatedAttempts, reviewedAttempts };
      }

      correction = review.correction;
      console.log(
        `[rejected] ${input.passage.id} ${input.language} asset=${asset.id}: ${review.reasons.join(" | ")}`,
      );
    } catch (error) {
      latestError = error;
      await markFailed(asset.id, error);
      console.error(
        `[attempt-failed] ${input.passage.id} ${input.language} attempt=${attempt}: ${errorMessage(error)}`,
      );
      break;
    }
  }

  if (latestAssetId && latestError) {
    return { status: "FAILED", generatedAttempts, reviewedAttempts };
  }
  return { status: "REJECTED", generatedAttempts, reviewedAttempts };
}

async function reviewAndPersist(
  assetId: string,
  imageUrl: string,
  passage: ExamPassage,
  language: WebtoonLanguageId,
) {
  console.log(`[review] ${passage.id} ${language} asset=${assetId}`);
  const review = await reviewExamPassageWebtoonImage({
    passage,
    language,
    imageUrl,
    assetId,
  });
  const status = review.pass
    ? args.noAutoApprove
      ? "REVIEW_REQUIRED"
      : "APPROVED"
    : "REJECTED";
  await prisma.examPassageWebtoonAsset.update({
    where: { id: assetId },
    data: {
      status,
      reviewedAt: new Date(review.reviewedAt),
      errorMessage: review.pass ? null : review.reasons.join(" | ").slice(0, 1000),
      qaReport: {
        ...review,
        approvalPolicy: args.noAutoApprove
          ? "NO_AUTO_APPROVE flag was set; passing images are still held back."
          : "Auto-approved only when strict local OCR checks and vision QA both pass.",
      },
    },
  });
  return review;
}

async function findExistingAsset(
  examPassageId: string,
  language: WebtoonLanguageId,
): Promise<ExistingAsset | null> {
  return prisma.examPassageWebtoonAsset.findUnique({
    where: {
      examPassageId_language_style: {
        examPassageId,
        language,
        style: EXAM_PASSAGE_WEBTOON_STYLE,
      },
    },
    select: {
      id: true,
      status: true,
      sourceHash: true,
      imageUrl: true,
      storagePath: true,
      attempts: true,
    },
  });
}

async function upsertGeneratingAsset(input: {
  passage: ExamPassage;
  language: WebtoonLanguageId;
  prompt: string;
  promptHash: string;
  sourceHash: string;
}) {
  return prisma.examPassageWebtoonAsset.upsert({
    where: {
      examPassageId_language_style: {
        examPassageId: input.passage.id,
        language: input.language,
        style: EXAM_PASSAGE_WEBTOON_STYLE,
      },
    },
    create: {
      examPassageId: input.passage.id,
      language: input.language,
      style: EXAM_PASSAGE_WEBTOON_STYLE,
      status: "GENERATING",
      promptSnapshot: input.prompt,
      promptHash: input.promptHash,
      sourceHash: input.sourceHash,
      sourceMeta: sourceMeta(input.passage),
      imageModel: plan.modelId,
      imageSize: plan.params.size ?? plan.params.resolution ?? null,
      imageQuality: plan.params.quality ?? null,
      imageOutputFormat: "jpeg",
      attempts: 1,
    },
    update: {
      status: "GENERATING",
      promptSnapshot: input.prompt,
      promptHash: input.promptHash,
      sourceHash: input.sourceHash,
      sourceMeta: sourceMeta(input.passage),
      imageModel: plan.modelId,
      imageSize: plan.params.size ?? plan.params.resolution ?? null,
      imageQuality: plan.params.quality ?? null,
      imageOutputFormat: "jpeg",
      errorMessage: null,
      attempts: { increment: 1 },
    },
    select: { id: true, storagePath: true },
  });
}

async function markFailed(assetId: string, error: unknown) {
  await prisma.examPassageWebtoonAsset.update({
    where: { id: assetId },
    data: {
      status: "FAILED",
      errorMessage: errorMessage(error).slice(0, 1000),
      qaReport: {
        status: "FAILED",
        error: errorMessage(error),
      },
    },
  });
}

async function recordImageGenerationCost(input: {
  assetId: string;
  predictionId: string;
}) {
  await recordPlatformApiUsageCost({
    sourceKey: `exam_passage_webtoon_asset:${input.assetId}:image:${input.predictionId}`,
    sourceType: "EXAM_PASSAGE_WEBTOON_ASSET",
    sourceId: input.assetId,
    sourceDetail: "IMAGE_GENERATION",
    provider: "ATLASCLOUD",
    model: plan.modelId,
    operationType: "WEBTOON_EXAM_IMAGE",
    unitType: "IMAGE",
    unitCount: 1,
    calls: 1,
    usageAt: new Date(),
    metadata: {
      plan: plan.id,
      imageSize: plan.params.size ?? null,
      imageQuality: plan.params.quality ?? null,
      resolution: plan.params.resolution ?? null,
      predictionId: input.predictionId,
    },
  });
}

function sourceMeta(passage: ExamPassage) {
  return {
    year: passage.year,
    exam: passage.exam,
    grade: passage.grade ?? "\uace0",
    qNumbers: passage.qNumbers,
    type: passage.type,
    typeGroup: passage.typeGroup,
    reconstructionKind: passage.reconstructionKind,
    confidence: passage.confidence,
    wordCount: passage.wordCount,
  };
}

function compareLatestFirst(a: ExamPassage, b: ExamPassage): number {
  if (b.year !== a.year) return b.year - a.year;
  const examOrder = examRank(b.exam) - examRank(a.exam);
  if (examOrder !== 0) return examOrder;
  const aQuestion = a.qNumbers?.[0] ?? 0;
  const bQuestion = b.qNumbers?.[0] ?? 0;
  if (aQuestion !== bQuestion) return aQuestion - bQuestion;
  return a.id.localeCompare(b.id);
}

function examRank(value: string): number {
  if (/11|nov|11\uc6d4/i.test(value)) return 5;
  if (/9|sep|9\uc6d4/i.test(value)) return 4;
  if (/6|jun|6\uc6d4/i.test(value)) return 3;
  if (/\uc218\ub2a5|csat/i.test(value)) return 2;
  return 1;
}

function hashPrompt(prompt: string) {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

function parseArgs(argv: string[]): Args {
  const valueOf = (name: string) => {
    const found = argv.find((arg) => arg.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1) : null;
  };
  const language = valueOf("--language");
  const planArg = valueOf("--plan");
  const limit = parsePositiveInt(valueOf("--limit"));
  const offset = parseNonNegativeInt(valueOf("--offset")) ?? 0;
  const yearFrom = parsePositiveInt(valueOf("--year-from"));
  const passageId = valueOf("--passage-id")?.trim() || null;
  const maxReviewAttempts = parsePositiveInt(valueOf("--max-review-attempts")) ?? 3;
  const imageTimeoutMs = parsePositiveInt(valueOf("--image-timeout-ms")) ?? 900_000;
  return {
    execute: argv.includes("--execute"),
    force: argv.includes("--force"),
    reviewOnly: argv.includes("--review-only"),
    noAutoApprove: argv.includes("--no-auto-approve"),
    limit,
    offset,
    yearFrom,
    passageId,
    language: isLanguage(language) ? language : null,
    plan: planArg === "STANDARD" || planArg === "PREMIUM" ? planArg : "PREMIUM",
    maxReviewAttempts: Math.max(1, Math.min(8, maxReviewAttempts)),
    imageTimeoutMs: Math.max(60_000, Math.min(1_800_000, imageTimeoutMs)),
  };
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isLanguage(value: string | null): value is WebtoonLanguageId {
  return (
    value === "KO" ||
    value === "KO_EN" ||
    value === "EN" ||
    value === "EN_KO_GLOSS"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
