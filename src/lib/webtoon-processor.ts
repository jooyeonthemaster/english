import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  type AtlasImageSize,
  type GenerateImageRequest,
  generateImage,
  getAtlasImageModel,
} from "@/lib/atlas";
import { refundCredits } from "@/lib/credits";
import { buildWebtoonImagePrompt } from "@/lib/webtoon-prompts";
import { uploadRemoteImageToWebtoonBucket } from "@/lib/webtoon-storage";
import type { WebtoonStyleId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

const VALID_IMAGE_SIZES: AtlasImageSize[] = [
  "1024x768",
  "768x1024",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "2560x1440",
  "1440x2560",
  "3840x2160",
  "2160x3840",
];

const VALID_QUALITIES: NonNullable<GenerateImageRequest["quality"]>[] = [
  "low",
  "medium",
  "high",
];

export interface WebtoonProcessOptions {
  source?: "trigger" | "local" | "manual";
  staleAfterMs?: number;
}

export type WebtoonProcessResult =
  | { ok: true; webtoonId: string; publicUrl: string; bytes: number }
  | { ok: false; reason: string; status?: string; error?: string };

export async function processWebtoonGeneration(
  webtoonId: string,
  options: WebtoonProcessOptions = {},
): Promise<WebtoonProcessResult> {
  const source = options.source ?? "manual";
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const staleCutoff = new Date(Date.now() - staleAfterMs);
  const now = new Date();

  const claim = await prisma.webtoon.updateMany({
    where: {
      id: webtoonId,
      OR: [
        { status: "PENDING" },
        { status: "GENERATING", startedAt: null },
        {
          status: "GENERATING",
          startedAt: { lt: staleCutoff },
          imageUrl: null,
        },
      ],
    },
    data: {
      status: "GENERATING",
      startedAt: now,
      completedAt: null,
      errorMessage: null,
    },
  });

  if (claim.count === 0) {
    const current = await prisma.webtoon.findUnique({
      where: { id: webtoonId },
      select: { status: true },
    });
    if (!current) {
      console.error("[webtoon-processor] webtoon not found", { webtoonId, source });
      return { ok: false, reason: "WEBTOON_NOT_FOUND" };
    }
    console.log("[webtoon-processor] webtoon was not claimable", {
      webtoonId,
      status: current.status,
      source,
    });
    return { ok: false, reason: "NOT_CLAIMABLE", status: current.status };
  }

  const webtoon = await prisma.webtoon.findUnique({
    where: { id: webtoonId },
    include: {
      passage: { select: { id: true, title: true, content: true } },
    },
  });

  if (!webtoon) {
    console.error("[webtoon-processor] claimed row disappeared", { webtoonId, source });
    return { ok: false, reason: "WEBTOON_NOT_FOUND_AFTER_CLAIM" };
  }

  const prompt = buildWebtoonImagePrompt({
    passageTitle: webtoon.passage.title,
    passageContent: webtoon.passage.content,
    style: webtoon.style as WebtoonStyleId,
    customPrompt: webtoon.customPrompt ?? "",
  });
  const imageOptions = getWebtoonImageOptions();
  const imageOutputFormat = "jpeg";
  const promptHash = createHash("sha256").update(prompt, "utf8").digest("hex");

  try {
    await prisma.webtoon.update({
      where: { id: webtoonId },
      data: {
        promptSnapshot: prompt,
        promptHash,
        imageModel: getAtlasImageModel(),
        imageSize: imageOptions.size,
        imageQuality: imageOptions.quality,
        imageOutputFormat,
      },
    });

    const result = await generateImage({
      prompt,
      size: imageOptions.size,
      quality: imageOptions.quality,
      outputFormat: imageOutputFormat,
      timeoutMs: imageOptions.timeoutMs,
      pollIntervalMs: 2500,
      maxAttempts: imageOptions.maxAttempts,
    });
    const rawUrl = result.outputs?.[0];
    if (!rawUrl) {
      throw new Error("AtlasCloud returned no image output URL");
    }

    const { publicUrl, storagePath, bytes } = await uploadRemoteImageToWebtoonBucket({
      remoteUrl: rawUrl,
      academyId: webtoon.academyId,
      webtoonId: webtoon.id,
    });

    await prisma.webtoon.update({
      where: { id: webtoonId },
      data: {
        status: "COMPLETED",
        imageUrl: publicUrl,
        storagePath,
        rawAtlasUrl: rawUrl,
        atlasPredictionId: result.predictionId,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    console.log("[webtoon-processor] completed", {
      webtoonId,
      source,
      bytes,
      imageOptions,
      promptHash,
      predictionId: result.predictionId,
    });
    return { ok: true, webtoonId, publicUrl, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[webtoon-processor] failed", { webtoonId, source, error: message });

    if (webtoon.creditTransactionId) {
      try {
        await refundCredits(
          webtoon.academyId,
          "WEBTOON_IMAGE",
          webtoon.creditTransactionId,
          `Webtoon generation failed: ${message}`,
        );
      } catch (refundErr) {
        console.warn("[webtoon-processor] refund failed", {
          webtoonId,
          error: refundErr instanceof Error ? refundErr.message : String(refundErr),
        });
      }
    }

    await prisma.webtoon.update({
      where: { id: webtoonId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 1000),
        completedAt: new Date(),
      },
    });

    return { ok: false, reason: "GENERATION_FAILED", error: message };
  }
}

function getWebtoonImageOptions(): {
  size: AtlasImageSize;
  quality: NonNullable<GenerateImageRequest["quality"]>;
  timeoutMs: number;
  maxAttempts: number;
} {
  return {
    size: parseImageSize(process.env.WEBTOON_IMAGE_SIZE) ?? "2160x3840",
    quality: parseQuality(process.env.WEBTOON_IMAGE_QUALITY) ?? "high",
    timeoutMs: parsePositiveInt(process.env.WEBTOON_IMAGE_TIMEOUT_MS) ?? 420_000,
    maxAttempts: parsePositiveInt(process.env.WEBTOON_IMAGE_MAX_ATTEMPTS) ?? 2,
  };
}

function parseImageSize(value: string | undefined): AtlasImageSize | null {
  if (!value) return null;
  return VALID_IMAGE_SIZES.includes(value as AtlasImageSize)
    ? (value as AtlasImageSize)
    : null;
}

function parseQuality(
  value: string | undefined,
): NonNullable<GenerateImageRequest["quality"]> | null {
  if (!value) return null;
  return VALID_QUALITIES.includes(value as NonNullable<GenerateImageRequest["quality"]>)
    ? (value as NonNullable<GenerateImageRequest["quality"]>)
    : null;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
