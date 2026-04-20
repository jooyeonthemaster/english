// ============================================================================
// Gemini error → retry policy classifier.
// Consumed by the Trigger.dev extraction-page task AND by the UI (to show
// human-readable messages + decide whether a "retry" button is appropriate).
// ============================================================================

import type {
  ExtractionErrorClassification,
  ExtractionErrorCode,
} from "./types";

interface GeminiLikeError {
  status?: number;
  statusCode?: number;
  code?: string | number;
  message?: string;
  response?: {
    status?: number;
    statusText?: string;
  };
}

const USER_MESSAGES: Record<ExtractionErrorCode, string> = {
  GEMINI_AUTH: "AI 서비스 인증 오류가 발생했습니다. 운영팀에 문의해 주세요.",
  GEMINI_RATE_LIMIT: "AI 서버가 바쁩니다. 잠시 후 자동으로 재시도합니다.",
  GEMINI_SERVER: "AI 서비스 일시 장애입니다. 자동 재시도 중입니다.",
  GEMINI_TIMEOUT: "AI 응답이 지연되었습니다. 재시도 중입니다.",
  INVALID_IMAGE: "이미지를 읽을 수 없습니다. 파일을 다시 올려 주세요.",
  SAFETY_BLOCKED:
    "이 이미지는 안전 필터에 의해 처리되지 않았습니다. 다른 페이지를 사용해 주세요.",
  EMPTY_OUTPUT:
    "AI가 글자를 찾지 못했습니다. 이미지 품질을 확인하고 재시도해 주세요.",
  STORAGE_FETCH: "파일을 불러오지 못했습니다. 재업로드가 필요할 수 있습니다.",
  INSUFFICIENT_CREDITS: "크레딧이 부족합니다. 충전 후 재시도해 주세요.",
  NETWORK: "네트워크 오류가 발생했습니다. 자동 재시도 중입니다.",
  PARSE_ERROR:
    "AI 응답을 해석하지 못했습니다. 형식이 어긋나 재시도합니다.",
  UNKNOWN: "알 수 없는 오류가 발생했습니다. 재시도하거나 운영팀에 문의해 주세요.",
};

const RETRYABLE: Record<ExtractionErrorCode, boolean> = {
  GEMINI_AUTH: false,
  GEMINI_RATE_LIMIT: true,
  GEMINI_SERVER: true,
  GEMINI_TIMEOUT: true,
  INVALID_IMAGE: false,
  SAFETY_BLOCKED: false,
  EMPTY_OUTPUT: true,
  STORAGE_FETCH: true,
  INSUFFICIENT_CREDITS: false,
  NETWORK: true,
  PARSE_ERROR: true,
  UNKNOWN: true,
};

export function classifyGeminiError(err: unknown): ExtractionErrorClassification {
  const e = (err ?? {}) as GeminiLikeError;
  const status = e.status ?? e.statusCode ?? e.response?.status;
  const msg = (e.message ?? "").toString();
  const lower = msg.toLowerCase();

  let code: ExtractionErrorCode = "UNKNOWN";

  if (status === 401 || status === 403) code = "GEMINI_AUTH";
  else if (status === 429) code = "GEMINI_RATE_LIMIT";
  else if (typeof status === "number" && status >= 500 && status < 600) code = "GEMINI_SERVER";
  else if (status === 400 && /image|decode|media/i.test(msg)) code = "INVALID_IMAGE";
  else if (/safety|blocked|prohibited|policy/i.test(lower)) code = "SAFETY_BLOCKED";
  else if (/timeout|timed out|etimedout|esockettimedout/i.test(lower)) code = "GEMINI_TIMEOUT";
  else if (/econnreset|fetch failed|enotfound|network|socket/i.test(lower)) code = "NETWORK";
  else if (/empty|no content|no text|empty response/i.test(lower)) code = "EMPTY_OUTPUT";
  else if (/storage|not found|object not found/i.test(lower)) code = "STORAGE_FETCH";
  else if (
    err instanceof SyntaxError ||
    /json|parse error|unexpected token|invalid_structured_response|schema/i.test(lower)
  ) {
    code = "PARSE_ERROR";
  }

  return {
    code,
    retryable: RETRYABLE[code],
    userMessage: USER_MESSAGES[code],
  };
}

/** Short human summary for the error toast on the client. */
export function getErrorUserMessage(code: string | null | undefined): string {
  if (!code) return USER_MESSAGES.UNKNOWN;
  if (code in USER_MESSAGES) return USER_MESSAGES[code as ExtractionErrorCode];
  return USER_MESSAGES.UNKNOWN;
}
