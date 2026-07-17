export const MODEL_RESPONSE_BODY_MAX_BYTES_V5 = 2 * 1024 * 1024;
export const METADATA_RESPONSE_BODY_MAX_BYTES_V5 = 16 * 1024 * 1024;
export const RESPONSE_BODY_MAX_CHUNKS_V5 = 8_192;

export type BoundedBodyFailureCodeV5 =
  | "INVALID_LIMIT"
  | "INVALID_CONTENT_LENGTH"
  | "DECLARED_LENGTH_EXCEEDED"
  | "STREAM_LENGTH_EXCEEDED"
  | "STREAM_CHUNK_COUNT_EXCEEDED"
  | "CONTENT_LENGTH_MISMATCH"
  | "MISSING_BODY"
  | "INVALID_UTF8";

export class BoundedBodyReadErrorV5 extends Error {
  readonly code: BoundedBodyFailureCodeV5;
  readonly maximumBytes: number;
  readonly observedOrDeclaredBytes: number | null;

  constructor(input: {
    code: BoundedBodyFailureCodeV5;
    label: string;
    maximumBytes: number;
    observedOrDeclaredBytes?: number | null;
  }) {
    super(`${input.label}: ${input.code}`);
    this.name = "BoundedBodyReadErrorV5";
    this.code = input.code;
    this.maximumBytes = input.maximumBytes;
    this.observedOrDeclaredBytes = input.observedOrDeclaredBytes ?? null;
  }
}

function declaredLength(headers: Headers, label: string, maximumBytes: number): number | null {
  const raw = headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_CONTENT_LENGTH",
      label,
      maximumBytes,
    });
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_CONTENT_LENGTH",
      label,
      maximumBytes,
    });
  }
  return value;
}

async function cancelQuietly(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body || body.locked) return;
  try {
    await body.cancel("bounded response body rejected");
  } catch {
    // The terminal disposition must not depend on peer cancellation support.
  }
}

export async function readBoundedUtf8ResponseBodyV5(input: {
  response: Response;
  maximumBytes: number;
  label: string;
}): Promise<{
  text: string;
  utf8Bytes: number;
  declaredContentLength: number | null;
  chunksRead: number;
  contentLengthEqualityChecked: boolean;
}> {
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1) {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_LIMIT",
      label: input.label,
      maximumBytes: input.maximumBytes,
    });
  }
  const declaredContentLength = declaredLength(input.response.headers, input.label, input.maximumBytes);
  if (declaredContentLength !== null && declaredContentLength > input.maximumBytes) {
    await cancelQuietly(input.response.body);
    throw new BoundedBodyReadErrorV5({
      code: "DECLARED_LENGTH_EXCEEDED",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: declaredContentLength,
    });
  }
  const body = input.response.body;
  if (!body) {
    if (declaredContentLength === 0) return {
      text: "",
      utf8Bytes: 0,
      declaredContentLength,
      chunksRead: 0,
      contentLengthEqualityChecked: true,
    };
    throw new BoundedBodyReadErrorV5({
      code: "MISSING_BODY",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: declaredContentLength,
    });
  }
  const reader = body.getReader();
  const storage = new Uint8Array(input.maximumBytes);
  let total = 0;
  let chunksRead = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunksRead += 1;
      if (chunksRead > RESPONSE_BODY_MAX_CHUNKS_V5) {
        try {
          await reader.cancel("bounded response body exceeded maximum chunk count");
        } catch {
          // The deterministic terminal disposition does not depend on cancellation support.
        }
        throw new BoundedBodyReadErrorV5({
          code: "STREAM_CHUNK_COUNT_EXCEEDED",
          label: input.label,
          maximumBytes: input.maximumBytes,
          observedOrDeclaredBytes: total,
        });
      }
      const chunk = next.value;
      if (!(chunk instanceof Uint8Array)) throw new Error(`${input.label}: response stream emitted a non-byte chunk`);
      if (chunk.byteLength > input.maximumBytes - total) {
        try {
          await reader.cancel("bounded response body exceeded maximum bytes");
        } catch {
          // The caller still receives the deterministic terminal overflow disposition.
        }
        throw new BoundedBodyReadErrorV5({
          code: "STREAM_LENGTH_EXCEEDED",
          label: input.label,
          maximumBytes: input.maximumBytes,
          observedOrDeclaredBytes: total + chunk.byteLength,
        });
      }
      if (chunk.byteLength === 0) continue;
      storage.set(chunk, total);
      total += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const contentEncoding = input.response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
  const contentLengthEqualityChecked = declaredContentLength !== null &&
    (contentEncoding === null || contentEncoding === "" || contentEncoding === "identity");
  if (contentLengthEqualityChecked && total !== declaredContentLength) {
    throw new BoundedBodyReadErrorV5({
      code: "CONTENT_LENGTH_MISMATCH",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: total,
    });
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(storage.subarray(0, total)),
      utf8Bytes: total,
      declaredContentLength,
      chunksRead,
      contentLengthEqualityChecked,
    };
  } catch {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_UTF8",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: total,
    });
  }
}
