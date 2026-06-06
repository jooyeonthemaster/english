import sharp from "sharp";

import type { QuestionAnalysisImage } from "./types";

export const NORMALIZED_ANALYSIS_IMAGE_MEDIA_TYPE = "image/jpeg";

export interface NormalizedQuestionAnalysisImage extends QuestionAnalysisImage {
  mediaType: typeof NORMALIZED_ANALYSIS_IMAGE_MEDIA_TYPE;
}

function base64Payload(value: string): string {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

export async function normalizeQuestionAnalysisImage(
  image: QuestionAnalysisImage,
): Promise<NormalizedQuestionAnalysisImage> {
  const data = await sharp(image.data, { failOn: "none" })
    .rotate()
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    data,
    mediaType: NORMALIZED_ANALYSIS_IMAGE_MEDIA_TYPE,
  };
}

export async function normalizeQuestionAnalysisImages(
  images: QuestionAnalysisImage[],
): Promise<NormalizedQuestionAnalysisImage[]> {
  const normalized: NormalizedQuestionAnalysisImage[] = [];
  for (const image of images) {
    normalized.push(await normalizeQuestionAnalysisImage(image));
  }
  return normalized;
}

export async function normalizeReferenceImageInput(image: {
  data: string;
  mediaType: string;
}): Promise<{ data: string; mediaType: typeof NORMALIZED_ANALYSIS_IMAGE_MEDIA_TYPE }> {
  const normalized = await normalizeQuestionAnalysisImage({
    data: Buffer.from(base64Payload(image.data), "base64"),
    mediaType: image.mediaType,
  });

  return {
    data: normalized.data.toString("base64"),
    mediaType: normalized.mediaType,
  };
}
