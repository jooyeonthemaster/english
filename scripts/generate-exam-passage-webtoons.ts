import sharp from "sharp";
import passagesJson from "../src/data/exam-passages/passages.json";
import type { ExamPassage } from "../src/lib/exam-passages/types";
import {
  buildExamPassageWebtoonPrompt,
  examPassageContentHash,
  EXAM_PASSAGE_WEBTOON_LANGUAGES,
  EXAM_PASSAGE_WEBTOON_STYLE,
} from "../src/lib/exam-passages/webtoon-assets";
import { reviewExamPassageWebtoonImage } from "../src/lib/exam-passages/webtoon-review";
import { WEBTOON_IMAGE_PLANS } from "../src/lib/webtoon-models";
import {
  generateOpenRouterImage,
  type OpenRouterImageResult,
} from "../src/lib/openrouter-image";
import { recordPlatformApiUsageCost } from "../src/lib/platform-api-costs";
import {
  deleteWebtoonImage,
  uploadImageBufferToExamPassageWebtoonBucket,
} from "../src/lib/webtoon-storage";
import { prisma } from "../src/lib/prisma";
import type { WebtoonLanguageId } from "../src/app/(director)/director/workbench/webtoon/webtoon-page-types";
import {
  compareLatestFirst,
  errorMessage,
  hashPrompt,
  parseArgs,
  sourceMeta,
} from "./generate-exam-passage-webtoons-utils";

/** 저장 인코딩 — 사용자 웹툰 프로세서와 같은 JPEG q92 (DB imageOutputFormat "jpeg" 과 일치). */
const OUTPUT_JPEG_QUALITY = 92;
/** OpenRouter 는 동기 POST 다. Node fetch 가 응답 헤더를 300초에 끊으므로 그 아래로 묶는다. */
const OPENROUTER_MAX_TIMEOUT_MS = 290_000;

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
      // 9:16 한 장을 OpenRouter 로 동기 생성 — 결과는 URL 이 아니라 바이트(b64)로 온다.
      const image = await generateOpenRouterImage({
        model: plan.modelId,
        prompt,
        aspectRatio: plan.params.aspectRatio,
        quality: plan.params.quality,
        moderation: "low",
        timeoutMs: Math.min(args.imageTimeoutMs, OPENROUTER_MAX_TIMEOUT_MS),
        maxAttempts: 2,
      });
      const version = `${Date.now()}-${attempt}`;
      // 청구는 이미 끝났다 — 인코딩·업로드가 실패해도 원가는 먼저 남긴다.
      await recordImageGenerationCost({ assetId: asset.id, version, image });

      const jpeg = await sharp(image.buffer, { failOn: "none" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: OUTPUT_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      const uploaded = await uploadImageBufferToExamPassageWebtoonBucket({
        imageBuffer: jpeg,
        assetId: asset.id,
        contentType: "image/jpeg",
        version,
      });
      generatedAttempts += 1;

      await prisma.examPassageWebtoonAsset.update({
        where: { id: asset.id },
        data: {
          status: "REVIEW_REQUIRED",
          imageUrl: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          rawAtlasUrl: null,
          atlasPredictionId: image.generationId,
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
      imageSize: plan.params.aspectRatio,
      imageQuality: plan.params.quality,
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
      imageSize: plan.params.aspectRatio,
      imageQuality: plan.params.quality,
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

/**
 * \uc6d0\uac00 \uc6d0\uc7a5 \u2014 \uc2e4\uce21 \uccad\uad6c\uc561(usage.cost)\uc744 \uadf8\ub300\ub85c \ub0a8\uae34\ub2e4. \uc6d0\uc7a5 \uae30\ub85d \uc2e4\ud328\uac00 \uc774\ubbf8 \uccad\uad6c\ub41c
 * \uc774\ubbf8\uc9c0\ub97c \ubc84\ub9ac\uac8c \ud558\uc9c0 \uc54a\ub3c4\ub85d \uacbd\uace0\ub9cc \ub0a8\uae34\ub2e4(\uc0ac\uc6a9\uc790 \uc6f9\ud230 \ud504\ub85c\uc138\uc11c\uc640 \uac19\uc740 \uc815\ucc45).
 */
async function recordImageGenerationCost(input: {
  assetId: string;
  version: string;
  image: OpenRouterImageResult;
}) {
  const { image } = input;
  try {
    await recordPlatformApiUsageCost({
      // generationId \uac00 \ube44\uba74 \uc5c5\ub85c\ub4dc \ubc84\uc804(\uc2dc\uac01+\uc2dc\ub3c4)\uc73c\ub85c \uc2dc\ub3c4\ubcc4 \uc720\uc77c\uc131\uc744 \uc9c0\ud0a8\ub2e4.
      sourceKey: `exam_passage_webtoon_asset:${input.assetId}:image:${image.generationId ?? input.version}`,
      sourceType: "EXAM_PASSAGE_WEBTOON_ASSET",
      sourceId: input.assetId,
      sourceDetail: "IMAGE_GENERATION",
      provider: "OPENROUTER",
      model: plan.modelId,
      operationType: "WEBTOON_EXAM_IMAGE",
      unitType: "IMAGE",
      unitCount: 1,
      calls: image.attempts,
      recordedCostUsd: image.costUsd,
      usageAt: new Date(),
      metadata: {
        plan: plan.id,
        aspectRatio: plan.params.aspectRatio,
        imageQuality: plan.params.quality,
        seconds: image.seconds,
        generationId: image.generationId,
      },
    });
  } catch (error) {
    console.warn(`[cost-record-failed] asset=${input.assetId}: ${errorMessage(error)}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
