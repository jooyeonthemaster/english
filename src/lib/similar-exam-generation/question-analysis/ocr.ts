import { runDocumentAiOcr } from "@/trigger/_lib/google-document-ai";

import { DOCAI_HYBRID_OCR_HEADER, DOCAI_OCR_TIMEOUT_MS } from "./constants";
import type { QuestionAnalysisImage } from "./types";

function joinInputBlocks(...blocks: Array<string | undefined>): string | undefined {
  const text = blocks
    .map((block) => block?.trim())
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
  return text || undefined;
}

export function buildDocAiHybridInput(
  inputText: string | undefined,
  ocrText: string,
): string | undefined {
  return joinInputBlocks(inputText, `${DOCAI_HYBRID_OCR_HEADER}\n\n${ocrText}`);
}

export async function extractOcrTextFromImage(
  image: QuestionAnalysisImage,
): Promise<string | undefined> {
  const { text } = await runDocumentAiOcr({
    base64: image.data.toString("base64"),
    mimeType: image.mediaType,
    timeoutInMs: DOCAI_OCR_TIMEOUT_MS,
  });
  return text.trim() || undefined;
}

export async function extractOcrTextFromImages(
  images: QuestionAnalysisImage[],
): Promise<string | undefined> {
  const ocrTexts: string[] = [];
  for (const image of images) {
    const text = await extractOcrTextFromImage(image);
    if (text) ocrTexts.push(text);
  }
  return ocrTexts.join("\n\n").trim() || undefined;
}
