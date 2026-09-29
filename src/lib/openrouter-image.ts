// ============================================================================
// OpenRouter Images API client — POST /api/v1/images (synchronous, base64 out).
// ----------------------------------------------------------------------------
// Used by webtoon generation (GPT Image 2.5 Flare / Sunburst). Returns decoded
// bytes plus the actual billed cost (usage.cost) for the platform cost ledger.
// Retries only transient failures (network, 408/429/5xx); 4xx such as
// moderation rejections fail fast so the caller can refund.
// ============================================================================

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenRouterImageQuality = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

export interface OpenRouterImageRequest {
  model: string;
  prompt: string;
  aspectRatio?: string;
  quality?: OpenRouterImageQuality;
  /** Reference images (style plates, character sheets) as data URLs or https URLs. */
  inputReferences?: string[];
  /** Provider passthrough (OpenAI gpt-image family): "auto" | "low". */
  moderation?: "auto" | "low";
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface OpenRouterImageResult {
  buffer: Buffer;
  mediaType: string;
  /** Billed USD (OpenRouter usage.cost), null when not reported. */
  costUsd: number | null;
  generationId: string | null;
  usage: Record<string, unknown> | null;
  /** Wall-clock seconds of the successful attempt. */
  seconds: number;
  attempts: number;
}

export class OpenRouterImageError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OpenRouterImageError";
  }
}

function apiKey(): string {
  const key =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.ATLASCLOUD_TEXT_API_KEY?.trim();
  if (!key) throw new OpenRouterImageError("OPENROUTER_API_KEY is not configured", null, false);
  return key;
}

function baseUrl(): string {
  const configured = process.env.OPENROUTER_BASE_URL?.trim();
  return (configured && /openrouter/i.test(configured) ? configured : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer":
      process.env.OPENROUTER_HTTP_REFERER?.trim() ||
      process.env.ATLASCLOUD_HTTP_REFERER?.trim() ||
      "https://smoat.kr",
    "X-Title":
      process.env.OPENROUTER_X_TITLE?.trim() || process.env.ATLASCLOUD_X_TITLE?.trim() || "smoat",
  };
}

interface ImagesResponse {
  id?: string;
  data?: Array<{ b64_json?: string; url?: string; media_type?: string; revised_prompt?: string }>;
  usage?: Record<string, unknown> & { cost?: number; total_cost?: number };
  error?: { message?: string; code?: number | string };
}

function readCost(usage: ImagesResponse["usage"]): number | null {
  if (!usage) return null;
  const c = typeof usage.cost === "number" ? usage.cost : typeof usage.total_cost === "number" ? usage.total_cost : null;
  return c !== null && Number.isFinite(c) && c > 0 ? c : null;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function attemptOnce(req: OpenRouterImageRequest): Promise<Omit<OpenRouterImageResult, "attempts">> {
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    n: 1,
  };
  if (req.aspectRatio) body.aspect_ratio = req.aspectRatio;
  if (req.quality) body.quality = req.quality;
  if (req.moderation) body.moderation = req.moderation;
  if (req.inputReferences?.length) {
    body.input_references = req.inputReferences.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(30_000, req.timeoutMs ?? 280_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${baseUrl()}/images`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    // The body (tens of MB of base64) is read under the same deadline as the headers.
    text = await res.text();
  } catch (err) {
    const aborted = controller.signal.aborted;
    throw new OpenRouterImageError(
      aborted
        ? `OpenRouter image generation timed out after ${Math.round(timeoutMs / 1000)}s`
        : `OpenRouter image request failed: ${err instanceof Error ? err.message : String(err)}`,
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  let json: ImagesResponse | null = null;
  try {
    json = JSON.parse(text) as ImagesResponse;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.error?.message ?? text.slice(0, 500);
    throw new OpenRouterImageError(
      `OpenRouter image generation failed (${res.status}): ${msg}`,
      res.status,
      isRetryableStatus(res.status),
    );
  }

  const item = json?.data?.[0];
  let buffer: Buffer | null = null;
  let mediaType = item?.media_type ?? "image/png";
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, "base64");
  } else if (item?.url) {
    if (item.url.startsWith("data:")) {
      const m = item.url.match(/^data:([^;]+);base64,(.*)$/);
      if (m) {
        mediaType = m[1];
        buffer = Buffer.from(m[2], "base64");
      }
    } else {
      const img = await fetch(item.url, { cache: "no-store" });
      if (img.ok) {
        mediaType = img.headers.get("content-type") ?? mediaType;
        buffer = Buffer.from(await img.arrayBuffer());
      }
    }
  }
  if (!buffer || buffer.length === 0) {
    // A 200 without an image (e.g. provider-side refusal) is not worth retrying.
    throw new OpenRouterImageError(
      `OpenRouter returned no image data: ${text.slice(0, 300)}`,
      res.status,
      false,
    );
  }

  return {
    buffer,
    mediaType,
    costUsd: readCost(json?.usage),
    generationId: json?.id ?? null,
    usage: (json?.usage as Record<string, unknown> | undefined) ?? null,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
}

export async function generateOpenRouterImage(
  req: OpenRouterImageRequest,
): Promise<OpenRouterImageResult> {
  const maxAttempts = Math.max(1, req.maxAttempts ?? 2);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await attemptOnce(req);
      return { ...result, attempts: attempt };
    } catch (err) {
      lastError = err;
      const retryable = err instanceof OpenRouterImageError ? err.retryable : false;
      if (!retryable || attempt >= maxAttempts) break;
      console.warn(`[openrouter-image] attempt ${attempt} failed; retrying`, {
        model: req.model,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenRouter image generation failed");
}
