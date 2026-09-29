import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ATLAS_GATEWAY_PROVIDER } from "@/lib/atlas-ai";
import { refundCredits } from "@/lib/credits";
import { isKoreanSubject } from "@/lib/korean/core/passage-meta";
import { generateOpenRouterImage } from "@/lib/openrouter-image";
import { recordPlatformApiUsageCost } from "@/lib/platform-api-costs";
import { buildWebtoonImagePrompt } from "@/lib/webtoon-prompts";
import {
  DEFAULT_WEBTOON_IMAGE_PLAN,
  WEBTOON_IMAGE_PLANS,
  planForModelId,
  type WebtoonImagePlanDef,
} from "@/lib/webtoon-models";
import { uploadImageBufferToWebtoonBucket } from "@/lib/webtoon-storage";
import { compileWebtoonImagePrompt } from "@/lib/webtoon-storyboard/compile";
import {
  generateWebtoonStoryboard,
  type StoryboardCallUsage,
} from "@/lib/webtoon-storyboard/generate";
import {
  normalizeStoryboardLanguage,
  targetPanelCount,
} from "@/lib/webtoon-storyboard/rules";
import type { PersistedWebtoonStoryboard } from "@/lib/webtoon-storyboard/types";
import { friendlyWebtoonError } from "@/lib/webtoon-errors";
import {
  styleLabel,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

/** Output encoding for stored pages — high-quality JPEG keeps 9:16 pages ~1–2MB. */
const OUTPUT_CONTENT_TYPE = "image/jpeg" as const;
const OUTPUT_JPEG_QUALITY = 92;
/**
 * GPT Image 2.5 returns 9:16 at a fixed 864×1536 regardless of quality tier (26-09-30
 * bench: high/xhigh/max all 864 wide). That is ~115 DPI across an A4 print, so pages
 * narrower than this are upscaled 2× (lanczos3 + light sharpen) before storage — smoother
 * lettering and line art in print, and the 자막 편집기 re-letters at twice the pixels.
 */
const UPSCALE_BELOW_WIDTH = 1500;

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
      passage: { select: { id: true, title: true, content: true, subject: true } },
    },
  });

  if (!webtoon) {
    console.error("[webtoon-processor] claimed row disappeared", { webtoonId, source });
    return { ok: false, reason: "WEBTOON_NOT_FOUND_AFTER_CLAIM" };
  }

  // Legacy rows (AtlasCloud era) resolve through legacyModelIds to the same tier;
  // pre-tier rows (imageModel null) fall back to the default plan.
  const plan = planForModelId(webtoon.imageModel) ?? WEBTOON_IMAGE_PLANS[DEFAULT_WEBTOON_IMAGE_PLAN];
  const style = webtoon.style as WebtoonStyleId;
  const isKorean = isKoreanSubject(webtoon.passage.subject);
  const storyboardLanguage = normalizeStoryboardLanguage(webtoon.language, isKorean);
  const customPrompt = webtoon.customPrompt ?? "";

  try {
    // ── Stage 1: storyboard (per-panel directing). Failure → legacy direct prompt. ──
    let storyboard: PersistedWebtoonStoryboard | null = null;
    let storyboardCalls: StoryboardCallUsage[] = [];
    try {
      const result = await generateWebtoonStoryboard({
        passageTitle: webtoon.passage.title,
        passageContent: webtoon.passage.content,
        isKoreanSubject: isKorean,
        language: storyboardLanguage,
        styleLabel: styleLabel(style),
        customPrompt,
        targetPanels: targetPanelCount(webtoon.passage.content, isKorean),
      });
      storyboard = result.storyboard;
      storyboardCalls = result.calls;
    } catch (err) {
      storyboardCalls = (err as { calls?: StoryboardCallUsage[] }).calls ?? [];
      console.warn("[webtoon-processor] storyboard failed; using legacy prompt", {
        webtoonId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await recordStoryboardCosts(webtoon.id, webtoon.academyId, plan, storyboardCalls);

    const prompt = storyboard
      ? compileWebtoonImagePrompt({ storyboard, style, language: storyboardLanguage })
      : buildWebtoonImagePrompt({
          passageTitle: webtoon.passage.title,
          passageContent: webtoon.passage.content,
          style,
          language: (webtoon.language ?? "KO") as WebtoonLanguageId,
          customPrompt,
          subject: webtoon.passage.subject,
        });
    const promptHash = createHash("sha256").update(prompt, "utf8").digest("hex");

    await prisma.webtoon.update({
      where: { id: webtoonId },
      data: {
        promptSnapshot: prompt,
        promptHash,
        imageModel: plan.modelId,
        imageSize: plan.params.aspectRatio,
        imageQuality: plan.params.quality,
        imageOutputFormat: "jpeg",
        storyboard: storyboard
          ? (storyboard as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    // ── Stage 2: one 9:16 page through OpenRouter (GPT Image 2.5). ──
    const imageOptions = getWebtoonImageOptions();
    const image = await generateOpenRouterImage({
      model: plan.modelId,
      prompt,
      aspectRatio: plan.params.aspectRatio,
      quality: plan.params.quality,
      moderation: "low",
      timeoutMs: imageOptions.timeoutMs,
      maxAttempts: imageOptions.maxAttempts,
    });
    // Record the spend before anything else can fail — OpenRouter billed it.
    await recordImageCost(webtoon.id, webtoon.academyId, plan, image);

    const jpeg = await encodeWebtoonPage(image.buffer);

    const { publicUrl, storagePath, bytes } = await uploadImageBufferToWebtoonBucket({
      imageBuffer: jpeg,
      academyId: webtoon.academyId,
      webtoonId: webtoon.id,
      contentType: OUTPUT_CONTENT_TYPE,
    });

    // Conditional finish: only the run that owns this claim may complete the row.
    // If the stale reaper (or a stale reclaim) already took it — FAILED + refunded —
    // a late finisher must not flip it back to COMPLETED (that would be a free image).
    const finished = await prisma.webtoon.updateMany({
      where: { id: webtoonId, status: "GENERATING", startedAt: now },
      data: {
        status: "COMPLETED",
        imageUrl: publicUrl,
        storagePath,
        rawAtlasUrl: null,
        atlasPredictionId: image.generationId,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    if (finished.count === 0) {
      console.warn("[webtoon-processor] claim lost before completion; leaving row as is", {
        webtoonId,
        source,
      });
      return { ok: false, reason: "CLAIM_LOST" };
    }

    console.log("[webtoon-processor] completed", {
      webtoonId,
      source,
      bytes,
      model: plan.modelId,
      quality: plan.params.quality,
      storyboard: storyboard ? `${storyboard.panels.length} panels` : "legacy-fallback",
      imageSeconds: image.seconds,
      imageCostUsd: image.costUsd,
      promptHash,
    });
    return { ok: true, webtoonId, publicUrl, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[webtoon-processor] failed", { webtoonId, source, error: message });

    // Same ownership rule as completion: flip to FAILED only if this run still owns
    // the claim, and refund only after winning that flip (the reaper refunds the rows
    // it reaps itself — refundCredits also caps total refunds at the original charge).
    const failed = await prisma.webtoon.updateMany({
      where: { id: webtoonId, status: "GENERATING", startedAt: now },
      data: {
        status: "FAILED",
        errorMessage: friendlyWebtoonError(message).slice(0, 1000),
        completedAt: new Date(),
      },
    });

    if (failed.count > 0 && webtoon.creditTransactionId) {
      try {
        await refundCredits(
          webtoon.academyId,
          plan.operationType,
          webtoon.creditTransactionId,
          `Webtoon generation failed: ${message}`.slice(0, 500),
        );
      } catch (refundErr) {
        console.warn("[webtoon-processor] refund failed", {
          webtoonId,
          error: refundErr instanceof Error ? refundErr.message : String(refundErr),
        });
      }
    }

    return { ok: false, reason: "GENERATION_FAILED", error: message };
  }
}

async function encodeWebtoonPage(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  let pipeline = sharp(buffer, { failOn: "none" }).flatten({ background: "#ffffff" });
  if (meta.width && meta.width < UPSCALE_BELOW_WIDTH) {
    pipeline = pipeline
      .resize({ width: meta.width * 2, kernel: "lanczos3" })
      .sharpen({ sigma: 0.6 });
  }
  return pipeline.jpeg({ quality: OUTPUT_JPEG_QUALITY, mozjpeg: true }).toBuffer();
}

async function recordStoryboardCosts(
  webtoonId: string,
  academyId: string,
  plan: WebtoonImagePlanDef,
  calls: StoryboardCallUsage[],
): Promise<void> {
  await Promise.all(
    calls.map(async (call, index) => {
      try {
        await recordPlatformApiUsageCost({
          sourceKey: `webtoon:${webtoonId}:storyboard:${index + 1}`,
          sourceType: "WEBTOON",
          sourceId: webtoonId,
          sourceDetail: "STORYBOARD",
          academyId,
          // 콘티 호출은 텍스트 게이트웨이(atlas-chat-rest)를 탄다 — 실제 경유 버킷으로 기록.
          provider: ATLAS_GATEWAY_PROVIDER,
          model: call.model,
          operationType: plan.operationType,
          unitType: "TOKENS",
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          recordedCostUsd: call.costUsd,
          usageAt: new Date(),
          metadata: call.generationId ? { generationId: call.generationId } : undefined,
        });
      } catch (err) {
        console.warn("[webtoon-processor] storyboard cost record failed", {
          webtoonId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

async function recordImageCost(
  webtoonId: string,
  academyId: string,
  plan: WebtoonImagePlanDef,
  image: { costUsd: number | null; generationId: string | null; seconds: number; attempts: number },
): Promise<void> {
  try {
    await recordPlatformApiUsageCost({
      sourceKey: `webtoon:${webtoonId}:image`,
      sourceType: "WEBTOON",
      sourceId: webtoonId,
      sourceDetail: "IMAGE_GENERATION",
      academyId,
      provider: "OPENROUTER",
      model: plan.modelId,
      operationType: plan.operationType,
      unitType: "IMAGE",
      unitCount: 1,
      calls: image.attempts,
      recordedCostUsd: image.costUsd,
      usageAt: new Date(),
      metadata: {
        aspectRatio: plan.params.aspectRatio,
        quality: plan.params.quality,
        seconds: image.seconds,
        ...(image.generationId ? { generationId: image.generationId } : {}),
      },
    });
  } catch (err) {
    console.warn("[webtoon-processor] image cost record failed", {
      webtoonId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getWebtoonImageOptions(): { timeoutMs: number; maxAttempts: number } {
  return {
    // Node's fetch cuts response headers at 300s — stay under it.
    timeoutMs: Math.min(parsePositiveInt(process.env.WEBTOON_IMAGE_TIMEOUT_MS) ?? 280_000, 290_000),
    // 2회 상한: 콘티 최악 240s + 이미지 2×280s 가 Trigger maxDuration(900s) 안에 들어가야 한다.
    // AtlasCloud 시절 env 값(3 등)이 남아 있어도 런이 강제 종료되지 않게 잘라 둔다.
    maxAttempts: Math.min(parsePositiveInt(process.env.WEBTOON_IMAGE_MAX_ATTEMPTS) ?? 2, 2),
  };
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
