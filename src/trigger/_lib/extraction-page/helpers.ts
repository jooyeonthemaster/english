import { logger } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";

/**
 * Feature flag — when true, route structured-mode OCR through Document AI for
 * the raw text extraction step, then send the text to Gemini for block
 * classification + question analysis. This bypasses Gemini's RECITATION filter
 * which blocks certain 평가원 PDF pages. Disable by setting env to "false".
 */
export function isDocumentAiOcrEnabled(): boolean {
  const v = process.env.EXTRACTION_USE_DOCUMENT_AI;
  if (v == null) return true;
  return v.toLowerCase() !== "false" && v !== "0";
}

/** Convert 1..5 → ①..⑤. Returns null for out-of-range or null input. */
export function encodeCircled(index: number | null | undefined): string | null {
  if (index == null) return null;
  const map: Record<number, string> = {
    1: "①",
    2: "②",
    3: "③",
    4: "④",
    5: "⑤",
    6: "⑥",
    7: "⑦",
    8: "⑧",
    9: "⑨",
  };
  return map[index] ?? null;
}

export class OperationTimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`${operationName} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

export async function withTimeout<T>(
  operationName: string,
  timeoutMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new OperationTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function markProcessingPhase(
  idempotencyKey: string,
  phase: string,
): Promise<void> {
  try {
    await prisma.extractionPage.update({
      where: { idempotencyKey },
      data: { errorMessage: `[processing] ${phase}` },
    });
  } catch (err) {
    logger.warn("failed to mark extraction phase", {
      idempotencyKey,
      phase,
      err: String(err),
    });
  }
}

export function getErrorDebugMessage(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`.slice(0, 500);
  }
  return String(err).slice(0, 500);
}
