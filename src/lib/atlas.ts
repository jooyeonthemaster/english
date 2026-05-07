const BASE_URL = process.env.ATLASCLOUD_BASE_URL ?? 'https://api.atlascloud.ai/api/v1';
const API_KEY = process.env.ATLASCLOUD_API_KEY;
const MODEL = process.env.ATLASCLOUD_MODEL ?? 'openai/gpt-image-2/text-to-image';
const MAX_GENERATION_ATTEMPTS = 2;

if (!API_KEY) {
  console.warn('[atlas] ATLASCLOUD_API_KEY is not set');
}

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
  size?: AtlasImageSize;
  quality?: 'low' | 'medium' | 'high';
  outputFormat?: 'jpeg' | 'png';
  enableBase64?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
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
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function startGeneration(req: GenerateImageRequest): Promise<{ id: string; pollUrl: string }> {
  const body: Record<string, unknown> = {
    model: MODEL,
    prompt: req.prompt,
    size: req.size ?? '2160x3840',
    quality: req.quality ?? 'high',
    output_format: req.outputFormat ?? 'jpeg',
    enable_sync_mode: false,
    enable_base64_output: req.enableBase64 ?? false
  };

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
