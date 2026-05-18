export {
  OCR_GENERATION_CONFIG,
  STRUCTURED_OCR_GENERATION_CONFIG,
} from "./config";

export { sanitizeOcrOutput, sanitizeStructuredJson } from "./sanitize";

export {
  structuredOcrResponseSchema,
  type StructuredOcrPageProblemEvidence,
  type StructuredOcrQuestionAnalysis,
  type StructuredOcrResponse,
} from "./schemas";

export { OCR_SYSTEM_PROMPT, OCR_USER_PROMPT } from "./prompts/m1";
export {
  STRUCTURED_OCR_SCHEMA_HINT,
  STRUCTURED_OCR_SYSTEM_PROMPT,
} from "./prompts/structured-base";
// PASSAGE_ONLY_STRUCTURED_ADDON and TEXT_INPUT_DISCLAIMER are intentionally
// not re-exported — they were file-local constants in the original
// ocr-prompt.ts and only the prompt builders compose them.

export {
  buildOcrSystemPrompt,
  buildOcrUserPrompt,
  buildStructuredOcrSystemPrompt,
  buildStructuredOcrSystemPromptForText,
  buildStructuredOcrUserPromptForText,
} from "./prompts/builders";
