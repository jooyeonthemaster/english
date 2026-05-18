export type ClassifiedAnalysisError = {
  status: number;
  code: string;
  message: string;
  log: Record<string, unknown>;
};

export class AnalysisJsonParseError extends Error {
  readonly finishReason?: string;
  readonly rawFinishReason?: string;
  readonly rawLength: number;
  readonly previewStart: string;
  readonly previewEnd: string;

  constructor(
    cause: unknown,
    raw: string,
    meta: { finishReason?: string; rawFinishReason?: string } = {},
  ) {
    super(cause instanceof Error ? cause.message : "AI response JSON parse failed");
    this.name = "AnalysisJsonParseError";
    this.cause = cause;
    this.finishReason = meta.finishReason;
    this.rawFinishReason = meta.rawFinishReason;
    this.rawLength = raw.length;
    this.previewStart = raw.slice(0, 500);
    this.previewEnd = raw.slice(-500);
  }
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as Record<string, unknown>)[field];
}

function extractGoogleReason(responseBody: string): string | null {
  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: {
        status?: string;
        details?: Array<{ reason?: string }>;
      };
    };
    return (
      parsed.error?.details?.find((detail) => detail.reason)?.reason ??
      parsed.error?.status ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Map a thrown error from the analysis pipeline (Google API error, JSON
 * parse failure, etc.) onto a `{ status, code, message, log }` shape the
 * route handlers can surface to the client and write to server logs.
 */
export function classifyAnalysisError(error: unknown): ClassifiedAnalysisError {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = getErrorField(error, "statusCode");
  const responseBody =
    typeof getErrorField(error, "responseBody") === "string"
      ? (getErrorField(error, "responseBody") as string)
      : "";
  const providerReason = extractGoogleReason(responseBody);
  const combined = [message, responseBody, providerReason]
    .filter(Boolean)
    .join("\n");

  const log = {
    name: getErrorField(error, "name"),
    message,
    statusCode,
    providerReason,
  };

  if (
    combined.includes("API_KEY_INVALID") ||
    /API Key not found|valid API key/i.test(combined)
  ) {
    return {
      status: 500,
      code: "GOOGLE_API_KEY_INVALID",
      message:
        "Google Gemini API 키가 유효하지 않습니다. GOOGLE_GENERATIVE_AI_API_KEY를 새 키로 교체한 뒤 서버를 재시작해주세요.",
      log,
    };
  }

  if (/API key is missing|API key.*missing/i.test(combined)) {
    return {
      status: 500,
      code: "GOOGLE_API_KEY_MISSING",
      message:
        "Google Gemini API 키가 설정되어 있지 않습니다. GOOGLE_GENERATIVE_AI_API_KEY 환경변수를 확인해주세요.",
      log,
    };
  }

  if (providerReason === "PERMISSION_DENIED") {
    return {
      status: 502,
      code: "GOOGLE_API_PERMISSION_DENIED",
      message:
        "Google Gemini API 권한이 거부되었습니다. API 사용 설정, 결제, 키 제한 설정을 확인해주세요.",
      log,
    };
  }

  if (statusCode === 429 || providerReason === "RESOURCE_EXHAUSTED") {
    return {
      status: 429,
      code: "GOOGLE_API_RATE_LIMITED",
      message:
        "Google Gemini API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.",
      log,
    };
  }

  if (error instanceof AnalysisJsonParseError) {
    const truncated =
      error.finishReason === "length" ||
      error.rawFinishReason === "MAX_TOKENS" ||
      /Unexpected end of JSON input/i.test(error.message);

    return {
      status: 502,
      code: truncated ? "AI_RESPONSE_TRUNCATED" : "AI_RESPONSE_JSON_PARSE_FAILED",
      message: truncated
        ? "AI 응답이 중간에 끊겨 분석을 저장하지 못했습니다. 출력 길이를 늘려두었으니 다시 시도해주세요."
        : "AI 응답 형식이 일부 깨져 분석을 저장하지 못했습니다. 다시 시도해주세요.",
      log: {
        ...log,
        finishReason: error.finishReason,
        rawFinishReason: error.rawFinishReason,
        rawLength: error.rawLength,
        previewStart: error.previewStart,
        previewEnd: error.previewEnd,
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 502,
      code: "AI_RESPONSE_JSON_PARSE_FAILED",
      message:
        "AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도하거나 프롬프트를 줄여주세요.",
      log,
    };
  }

  return {
    status: 500,
    code: "PASSAGE_ANALYSIS_FAILED",
    message: "지문 분석 중 오류가 발생했습니다.",
    log,
  };
}
