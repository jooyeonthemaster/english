const BASE_URL = process.env.ATLASCLOUD_BASE_URL ?? 'https://api.atlascloud.ai/api/v1';
const MODEL = process.env.ATLASCLOUD_MODEL ?? 'openai/gpt-image-2/text-to-image';
const MAX_GENERATION_ATTEMPTS = 2;

export type AtlasImageSize =
  | '1024x768'
  | '768x1024'
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | '2560x1440'
  | '1440x2560'
  | '3840x2160'
  | '2160x3840';

export interface GenerateImageRequest {
  prompt: string;
  /** AtlasCloud model id. Defaults to env MODEL (gpt-image-2). nano-banana models
   *  switch the request body to aspect_ratio + resolution + thinking_level. */
  model?: string;
  size?: AtlasImageSize;
  quality?: 'low' | 'medium' | 'high';
  outputFormat?: 'jpeg' | 'png';
  /** nano-banana family — aspect ratio (e.g. "9:16"). */
  aspectRatio?: string;
  /** nano-banana family — resolution bucket. */
  resolution?: '1k' | '2k' | '4k';
  /** nano-banana family — internal reasoning depth. */
  thinkingLevel?: 'default' | 'high' | 'minimal';
  enableBase64?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

/** nano-banana models take a different request shape than gpt-image-2. */
function isNanoBananaModel(model: string): boolean {
  return /nano-banana/i.test(model);
}

/** Build the AtlasCloud generateImage body for the chosen model family. */
function buildGenerationBody(req: GenerateImageRequest): Record<string, unknown> {
  const model = req.model ?? MODEL;
  const base: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    enable_sync_mode: false,
    enable_base64_output: req.enableBase64 ?? false,
  };
  if (isNanoBananaModel(model)) {
    return {
      ...base,
      aspect_ratio: req.aspectRatio ?? '9:16',
      resolution: req.resolution ?? '2k',
      thinking_level: req.thinkingLevel ?? 'high',
    };
  }
  // gpt-image-2 (default) family
  return {
    ...base,
    size: req.size ?? '2160x3840',
    quality: req.quality ?? 'high',
    output_format: req.outputFormat ?? 'jpeg',
  };
}

export function getAtlasImageModel(): string {
  return MODEL;
}

interface AtlasCreateResponse {
  code: number;
  data: { id: string; urls?: Record<string, string> };
  message?: string;
}

interface AtlasResultResponse {
  model?: string;
  created_at?: string;
  has_nsfw_contents?: boolean[];
  id?: string;
  outputs?: string[];
  status?: string;
  urls?: Record<string, string>;
}

interface AtlasResultEnvelope {
  code: number;
  data: AtlasResultResponse & { error?: string };
  message?: string;
}

function authHeaders(): HeadersInit {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  if (!apiKey) {
    throw new Error('ATLASCLOUD_API_KEY is required for Atlas image generation.');
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

async function startGeneration(req: GenerateImageRequest): Promise<{ id: string; pollUrl: string }> {
  const body = buildGenerationBody(req);

  const res = await fetch(`${BASE_URL}/model/generateImage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Atlas generateImage failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as AtlasCreateResponse;
  if (!json?.data?.id) {
    throw new Error(`Atlas response missing prediction id: ${JSON.stringify(json)}`);
  }
  return {
    id: json.data.id,
    pollUrl: json.data.urls?.get ?? `${BASE_URL}/model/prediction/${json.data.id}`
  };
}

async function pollResult(pollUrl: string, opts: { timeoutMs: number; intervalMs: number }): Promise<AtlasResultResponse> {
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const res = await fetch(pollUrl, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store'
    });
    const text = await res.text();
    if (!res.ok) {
      const failedEnv = parseAtlasResult(text);
      if (failedEnv && (failedEnv.data?.status ?? '').toLowerCase() === 'failed') {
        const reason = failedEnv.data.error || failedEnv.message || 'unknown reason';
        throw new Error(`Atlas generation failed (code ${failedEnv.code}): ${reason}`);
      }
      if (res.status === 429 || res.status >= 500) {
        console.warn(`[atlas] result poll returned ${res.status}; continuing to poll`);
        await new Promise((r) => setTimeout(r, opts.intervalMs));
        continue;
      }
      throw new Error(`Atlas result poll failed (${res.status}): ${text}`);
    }
    const env = parseAtlasResult(text);
    if (!env) {
      throw new Error(`Atlas result poll returned invalid JSON: ${text}`);
    }
    const data = env.data;
    const status = (data?.status ?? '').toLowerCase();

    if (status === 'completed' || status === 'succeeded') {
      return data;
    }
    if (status === 'failed') {
      const reason = data?.error || env.message || 'unknown reason';
      throw new Error(`Atlas generation failed (code ${env.code}): ${reason}`);
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`Atlas generation timed out after ${opts.timeoutMs}ms`);
}

function parseAtlasResult(text: string): AtlasResultEnvelope | null {
  try {
    return JSON.parse(text) as AtlasResultEnvelope;
  } catch {
    return null;
  }
}

export async function generateImage(req: GenerateImageRequest): Promise<{
  outputs: string[];
  predictionId: string;
}> {
  let lastError: unknown;
  const maxAttempts = Math.max(1, req.maxAttempts ?? MAX_GENERATION_ATTEMPTS);
  const timeoutMs = Math.max(30_000, req.timeoutMs ?? 250_000);
  const intervalMs = Math.max(1000, req.pollIntervalMs ?? 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { id, pollUrl } = await startGeneration(req);
      const result = await pollResult(pollUrl, { timeoutMs, intervalMs });
      return { outputs: result.outputs ?? [], predictionId: id };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableAtlasError(error)) {
        throw error;
      }
      console.warn(`[atlas] generation attempt ${attempt} failed; retrying once`, error);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Atlas generation failed');
}

function isRetryableAtlasError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\b(429|500|502|503|504)\b/.test(message) ||
    /server had an error|gateway time-out|temporarily/i.test(message)
  );
}
