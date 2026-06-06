import sharp from "sharp";

import { normalizeQuestionAnalysisImage } from "./image-normalization";

export interface CropSourceImage {
  data: Buffer;
  mediaType: string;
}

export interface NormalizedQuestionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex?: number;
  confidence?: "high" | "medium" | "low";
}

export interface CroppedQuestionImage extends CropSourceImage {
  crop: {
    left: number;
    top: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  };
}

const MIN_NORMALIZED_SIZE = 0.02;
const MIN_PIXEL_SIDE = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isUsableQuestionBoundingBox(
  box: NormalizedQuestionBoundingBox | null | undefined,
): box is NormalizedQuestionBoundingBox {
  if (!box) return false;
  return (
    isFinitePositive(box.width) &&
    isFinitePositive(box.height) &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    box.width >= MIN_NORMALIZED_SIZE &&
    box.height >= MIN_NORMALIZED_SIZE
  );
}

function paddingFor(
  box: NormalizedQuestionBoundingBox,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number } {
  const confidence = box.confidence ?? "medium";
  const baseX = confidence === "low" ? 0.065 : confidence === "medium" ? 0.045 : 0.032;
  const baseY = confidence === "low" ? 0.085 : confidence === "medium" ? 0.06 : 0.045;

  const minX = 36 / sourceWidth;
  const minY = 48 / sourceHeight;
  const shortBoxBoostY = box.height < 0.12 ? 0.02 : 0;
  const narrowBoxBoostX = box.width < 0.28 ? 0.015 : 0;

  return {
    x: Math.max(baseX + narrowBoxBoostX, minX),
    y: Math.max(baseY + shortBoxBoostY, minY),
  };
}

export async function cropQuestionImage(
  images: CropSourceImage[],
  box: NormalizedQuestionBoundingBox | null | undefined,
  options: { padScale?: number } = {},
): Promise<CroppedQuestionImage> {
  if (!isUsableQuestionBoundingBox(box)) {
    throw new Error("No usable question bounding box was produced for crop analysis.");
  }
  if (images.length === 0) {
    throw new Error("No source image is available for crop analysis.");
  }

  const pageIndex = clamp(Math.trunc(box.pageIndex ?? 0), 0, images.length - 1);
  const image = await normalizeQuestionAnalysisImage(images[pageIndex]);
  const source = sharp(image.data, { failOn: "none" });
  const metadata = await source.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Unable to read source image dimensions for crop analysis.");
  }

  const padScale = clamp(options.padScale ?? 1, 1, 3);
  const basePad = paddingFor(box, sourceWidth, sourceHeight);
  const pad = {
    x: basePad.x * padScale,
    y: basePad.y * padScale,
  };
  const leftN = clamp(box.x - pad.x, 0, 1);
  const topN = clamp(box.y - pad.y, 0, 1);
  const rightN = clamp(box.x + box.width + pad.x, 0, 1);
  const bottomN = clamp(box.y + box.height + pad.y, 0, 1);

  const left = clamp(Math.floor(leftN * sourceWidth), 0, sourceWidth - 1);
  const top = clamp(Math.floor(topN * sourceHeight), 0, sourceHeight - 1);
  const right = clamp(Math.ceil(rightN * sourceWidth), left + 1, sourceWidth);
  const bottom = clamp(Math.ceil(bottomN * sourceHeight), top + 1, sourceHeight);
  const width = right - left;
  const height = bottom - top;

  if (width < MIN_PIXEL_SIDE || height < MIN_PIXEL_SIDE) {
    throw new Error(
      `Question crop is too small (${width}x${height}); bounding box is likely invalid.`,
    );
  }

  const data = await sharp(image.data, { failOn: "none" })
    .extract({ left, top, width, height })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    data,
    mediaType: "image/jpeg",
    crop: { left, top, width, height, sourceWidth, sourceHeight },
  };
}
