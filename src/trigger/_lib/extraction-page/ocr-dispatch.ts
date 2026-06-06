import {
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  buildOcrSystemPrompt,
  buildOcrUserPrompt,
  buildStructuredOcrSystemPrompt,
  buildStructuredOcrSystemPromptForText,
  buildStructuredOcrUserPromptForText,
  structuredOcrResponseSchema,
  type StructuredOcrResponse,
} from "@/lib/extraction/ocr";
import { usesStructuredExtraction } from "@/lib/extraction/modes";
import type { ExtractionMode } from "@/lib/extraction/types";
import { downloadAsBuffer } from "@/lib/supabase-storage";
import {
  generatePlainOcrWithTriggerFetch,
  generateStructuredOcrWithTriggerFetch,
  generateStructuredTextWithTriggerFetch,
} from "../gemini-ocr";
import { runDocumentAiOcr } from "../google-document-ai";
import {
  mergePageMeta,
  parsePageMetaFromDocumentAiText,
} from "../page-meta-parser";
import {
  isDocumentAiOcrEnabled,
  markProcessingPhase,
  withTimeout,
} from "./helpers";

const GEMINI_CALL_TIMEOUT_MS = 90_000;
const DOCUMENT_AI_CALL_TIMEOUT_MS = 60_000;
const STORAGE_DOWNLOAD_TIMEOUT_MS = 30_000;

export interface OcrDispatchResult {
  extractedText: string;
  structured: StructuredOcrResponse | null;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
}

/**
 * Phase C: Fetch the page image and run OCR.
 *
 * Routes between three call paths based on mode + feature flag:
 *   - Document AI 2-step (structured mode, flag on): Document AI does raw OCR,
 *     Gemini classifies the text into blocks. Bypasses Gemini RECITATION.
 *   - Structured Gemini (structured mode, flag off): Gemini multimodal call
 *     returns blocks directly.
 *   - Plain OCR (M1 / EXPLANATION): Gemini returns plain text only.
 *
 * Mutates DB only for phase markers — actual persistence is the caller's job.
 * Throws on unrecoverable OCR failure (the caller classifies retryable vs
 * terminal).
 */
export async function runOcrForPage(params: {
  idempotencyKey: string;
  imageUrl: string;
  mode: ExtractionMode;
  /** P7-D2: "verbatim"이면 Gemini를 건너뛰고 Document AI 순수 OCR만. */
  outputMode?: string | null;
  pageIndex: number;
  totalPages: number;
}): Promise<OcrDispatchResult> {
  const { idempotencyKey, imageUrl, mode, outputMode, pageIndex, totalPages } =
    params;
  const isStructured = usesStructuredExtraction(mode);
  const verbatim = outputMode === "verbatim";

  await markProcessingPhase(idempotencyKey, "storage_download");
  const bytes = await withTimeout(
    "storage download",
    STORAGE_DOWNLOAD_TIMEOUT_MS,
    () => downloadAsBuffer(imageUrl),
  );
  const base64 = bytes.toString("base64");
  const mimeType = "image/jpeg";

  // ── VERBATIM 고속 경로 ("그대로 추출"): Document AI 순수 OCR, Gemini 0콜 ──
  // "그대로 추출"은 본문을 있는 그대로 뽑는 것이라 블록 분류/복원이 불필요하다.
  // 구조화 Gemini 콜(~11s, 이미지 토큰 ~10k)을 통째로 건너뛰고 Document AI(~3s)
  // 만 호출 → 페이지당 3~4배 빠름. 페이지의 OCR 텍스트 전체를 PASSAGE_BODY 블록
  // 1개로 만들어 finalize 의 STEM-led 그룹핑이 "1 이미지 = 1 지문 = 1 draft"로
  // 묶게 한다(STEM 없으면 각 PASSAGE_BODY가 독립 draft). DocAI 비활성 시엔 아래
  // 기존 경로로 폴백(구조화 Gemini가 verbatim도 처리하되 복원은 finalize에서 스킵).
  if (verbatim && mode === "PASSAGE_ONLY" && isDocumentAiOcrEnabled()) {
    return runDocumentAiVerbatim({ idempotencyKey, base64, mimeType });
  }

  const systemPrompt = isStructured
    ? buildStructuredOcrSystemPrompt(mode)
    : mode === "PASSAGE_ONLY"
      ? OCR_SYSTEM_PROMPT
      : buildOcrSystemPrompt(mode);
  const userPrompt = isStructured
    ? buildOcrUserPrompt(mode, pageIndex, totalPages)
    : mode === "PASSAGE_ONLY"
      ? OCR_USER_PROMPT
      : buildOcrUserPrompt(mode, pageIndex, totalPages);

  if (isStructured && isDocumentAiOcrEnabled()) {
    return runDocumentAiTwoStep({
      idempotencyKey,
      base64,
      mimeType,
      mode,
      pageIndex,
      totalPages,
    });
  }

  if (isStructured) {
    await markProcessingPhase(idempotencyKey, "gemini_call");
    const result = await generateStructuredOcrWithTriggerFetch({
      systemPrompt,
      userPrompt,
      mimeType,
      base64,
      timeoutInMs: GEMINI_CALL_TIMEOUT_MS,
    });
    const structured = result.object;
    const usage = result.usage;
    const extractedText = structured.blocks
      .map((b) => b.content)
      .filter((c) => c && c.length > 0)
      .join("\n\n");
    if (structured.blocks.length === 0) {
      const emptyErr = new Error("Structured OCR returned 0 blocks");
      (emptyErr as Error & { code?: string }).code = "EMPTY_OUTPUT";
      throw emptyErr;
    }
    return {
      structured,
      extractedText,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    };
  }

  await markProcessingPhase(idempotencyKey, "gemini_call");
  const result = await generatePlainOcrWithTriggerFetch({
    systemPrompt,
    userPrompt,
    mimeType,
    base64,
    timeoutInMs: GEMINI_CALL_TIMEOUT_MS,
  });
  return {
    structured: null,
    extractedText: result.text,
    inputTokens: result.usage?.inputTokens,
    outputTokens: result.usage?.outputTokens,
  };
}

/**
 * VERBATIM 고속 경로 — Document AI 순수 OCR만 수행하고 Gemini는 호출하지 않는다.
 * 페이지 OCR 텍스트 전체를 단일 PASSAGE_BODY 블록으로 반환한다(분류·복원 없음).
 * pageMeta 는 DocAI 텍스트에서 결정론적으로 파싱해 다중 시험지 클러스터링/페이지
 * 재정렬 단서를 보존한다(단일 지문 잡에서는 보통 비어 있음).
 */
async function runDocumentAiVerbatim(params: {
  idempotencyKey: string;
  base64: string;
  mimeType: string;
}): Promise<OcrDispatchResult> {
  const { idempotencyKey, base64, mimeType } = params;
  await markProcessingPhase(idempotencyKey, "document_ai_ocr");
  const docAi = await withTimeout(
    "document ai ocr (verbatim)",
    DOCUMENT_AI_CALL_TIMEOUT_MS,
    () => runDocumentAiOcr({ base64, mimeType, timeoutInMs: DOCUMENT_AI_CALL_TIMEOUT_MS }),
  );
  const text = docAi.text.trim();
  if (!text) {
    const emptyErr = new Error("Document AI returned empty text (verbatim)");
    (emptyErr as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw emptyErr;
  }
  const parsedMeta = parsePageMetaFromDocumentAiText(text);
  const structured: StructuredOcrResponse = {
    blocks: [{ blockType: "PASSAGE_BODY", content: text, confidence: 0.9 }],
    pageMeta: parsedMeta as StructuredOcrResponse["pageMeta"],
  };
  return {
    structured,
    extractedText: text,
    inputTokens: undefined,
    outputTokens: undefined,
  };
}

async function runDocumentAiTwoStep(params: {
  idempotencyKey: string;
  base64: string;
  mimeType: string;
  mode: ExtractionMode;
  pageIndex: number;
  totalPages: number;
}): Promise<OcrDispatchResult> {
  const { idempotencyKey, base64, mimeType, mode, pageIndex, totalPages } = params;

  // Step 1: Document AI raw OCR (no RECITATION filter).
  await markProcessingPhase(idempotencyKey, "document_ai_ocr");
  const docAi = await runDocumentAiOcr({
    base64,
    mimeType,
    timeoutInMs: DOCUMENT_AI_CALL_TIMEOUT_MS,
  });
  const ocrText = docAi.text.trim();
  if (!ocrText) {
    const emptyErr = new Error("Document AI returned empty text");
    (emptyErr as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw emptyErr;
  }

  // Step 2: Gemini classification + question analysis on the text.
  await markProcessingPhase(idempotencyKey, "gemini_classify");
  const textSystemPrompt = buildStructuredOcrSystemPromptForText(mode);
  const textUserPrompt = buildStructuredOcrUserPromptForText(
    mode,
    pageIndex,
    totalPages,
    ocrText,
  );
  const classified = await generateStructuredTextWithTriggerFetch({
    stage: "ocr",
    systemPrompt: textSystemPrompt,
    userPrompt: textUserPrompt,
    schema: structuredOcrResponseSchema,
    timeoutInMs: GEMINI_CALL_TIMEOUT_MS,
    image: { mimeType, base64 },
  });
  let structured: StructuredOcrResponse = classified.object;
  const inputTokens = classified.usage?.inputTokens;
  const outputTokens = classified.usage?.outputTokens;

  // pageMeta is needed by finalize for cluster fingerprinting and page
  // reordering. Gemini sometimes drops these fields in multimodal mode —
  // override with deterministic regex parsing of the Document AI raw text,
  // which always has the markup intact.
  const parsedMeta = parsePageMetaFromDocumentAiText(ocrText);
  structured = {
    ...structured,
    pageMeta: mergePageMeta(
      structured.pageMeta,
      parsedMeta,
    ) as typeof structured.pageMeta,
  };

  let extractedText = structured.blocks
    .map((b) => b.content)
    .filter((c) => c && c.length > 0)
    .join("\n\n");
  if (structured.blocks.length === 0) {
    // Gemini classification returned no blocks but Document AI did get text.
    // Synthesize a single PASSAGE_BODY block so finalize can still produce a
    // draft from this page instead of losing it entirely.
    structured = {
      ...structured,
      blocks: [
        {
          blockType: "PASSAGE_BODY",
          content: ocrText,
          confidence: 0.5,
        },
      ],
    };
    extractedText = ocrText;
  }

  return { extractedText, structured, inputTokens, outputTokens };
}
