// ============================================================================
// Google Cloud Document AI — service-account-authenticated OCR client.
//
// Why this exists:
//   Gemini vision OCR triggers `finishReason=RECITATION` on certain pages of
//   Korean 평가원 모의고사 PDFs (content-based copyright filter — confirmed
//   to be content-trigger, not prompt-trigger). Document AI is a separate
//   GCP service that does not apply the recitation filter, so we use it as
//   the OCR engine and pass the resulting text to Gemini for downstream
//   classification + question analysis + grounded restoration.
//
// Auth:
//   Service Account JSON key (base64-encoded in env var
//   GOOGLE_DOC_AI_SERVICE_ACCOUNT_B64). We sign a JWT with the SA private
//   key (RS256 via `jose`) and exchange it for a short-lived OAuth2 access
//   token at https://oauth2.googleapis.com/token. Tokens are cached in
//   module scope until 60s before expiry.
//
// API:
//   POST https://us-documentai.googleapis.com/v1/projects/<PROJECT_NUMBER>/locations/us/processors/<PROCESSOR_ID>:process
//   Body: { rawDocument: { content: <base64>, mimeType: "image/jpeg"|"application/pdf" } }
//   Returns: { document: { text, pages: [...] } }
//
// Limits (synchronous endpoint):
//   - PDF: 15 pages / 20 MB per request. Larger PDFs must use batchProcess
//     (async). For now we process one page-image at a time so this limit
//     is not hit; if we ever ship a "raw PDF" mode we will add a batch path.
// ============================================================================

import { retry } from "@trigger.dev/sdk/v3";
import { SignJWT, importPKCS8 } from "jose";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri: string;
}

let cachedKey: ServiceAccountKey | null = null;

function loadServiceAccount(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const b64 = process.env.GOOGLE_DOC_AI_SERVICE_ACCOUNT_B64;
  if (!b64) {
    throw new Error(
      "Missing env var GOOGLE_DOC_AI_SERVICE_ACCOUNT_B64 (base64-encoded service account JSON)",
    );
  }
  const raw = Buffer.from(b64, "base64").toString("utf8");
  const parsed = JSON.parse(raw) as ServiceAccountKey;
  if (!parsed.private_key || !parsed.client_email) {
    throw new Error("Service account JSON missing private_key or client_email");
  }
  cachedKey = parsed;
  return parsed;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // unix ms
}

let cachedToken: CachedToken | null = null;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken.accessToken;
  }

  const sa = loadServiceAccount();
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/cloud-platform",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: sa.private_key_id })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const response = await retry.fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    timeoutInMs: 15_000,
  });
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(
      `Google OAuth2 token exchange failed: ${response.status} ${body.error ?? ""} ${body.error_description ?? ""}`.trim(),
    );
  }
  const expiresInSec = body.expires_in ?? 3600;
  cachedToken = {
    accessToken: body.access_token,
    expiresAt: Date.now() + expiresInSec * 1000,
  };
  return cachedToken.accessToken;
}

export interface DocumentAiPageLayout {
  pageNumber: number;
  paragraphs: string[];
}

export interface DocumentAiResult {
  text: string;
  pages: DocumentAiPageLayout[];
}

interface DocumentAiResponseTextSegment {
  startIndex?: string;
  endIndex?: string;
}

interface DocumentAiResponseVertex {
  x?: number;
  y?: number;
}

interface DocumentAiResponseBoundingPoly {
  vertices?: DocumentAiResponseVertex[];
  normalizedVertices?: DocumentAiResponseVertex[];
}

interface DocumentAiResponseLayout {
  textAnchor?: {
    textSegments?: DocumentAiResponseTextSegment[];
  };
  confidence?: number;
  boundingPoly?: DocumentAiResponseBoundingPoly;
}

interface DocumentAiResponseDimension {
  width?: number;
  height?: number;
  unit?: string;
}

interface DocumentAiResponsePage {
  pageNumber?: number;
  dimension?: DocumentAiResponseDimension;
  paragraphs?: Array<{ layout?: DocumentAiResponseLayout }>;
}

interface DocumentAiResponse {
  document?: {
    text?: string;
    pages?: DocumentAiResponsePage[];
  };
  error?: { code?: number; message?: string; status?: string };
}

function extractSegmentText(
  fullText: string,
  layout: DocumentAiResponseLayout | undefined,
): string {
  const segments = layout?.textAnchor?.textSegments;
  if (!segments || segments.length === 0) return "";
  let out = "";
  for (const seg of segments) {
    const start = seg.startIndex ? Number(seg.startIndex) : 0;
    const end = seg.endIndex ? Number(seg.endIndex) : 0;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      out += fullText.slice(start, end);
    }
  }
  return out;
}

// ─── Column-aware reading order ───────────────────────────────────────────
//
// Document AI's default reading order is unreliable on Korean exam papers
// with 2-column layouts — it often jumps between columns row-by-row instead
// of reading column-major (entire left column, then entire right column).
//
// We fix this by:
//   1. Extracting normalised bounding boxes (0..1) for every paragraph.
//   2. Classifying each paragraph:
//      - "full" if its width spans > 60% of the page (headers, instruction
//        boxes that cross the column gutter — these are band separators)
//      - "left" if its horizontal centre is in the left half
//      - "right" otherwise
//   3. Using full-width paragraphs as band boundaries (a band is a vertical
//      strip of the page between two full-width separators).
//   4. Within each band, emitting: full-width separator (if any), then all
//      left-column paragraphs sorted top→bottom, then all right-column
//      paragraphs sorted top→bottom.
//   5. Concatenating bands top→bottom.
//
// Tunables — adjust if accuracy regresses on real pages:
const FULL_WIDTH_THRESHOLD = 0.6; // paragraph is "full-width" if w > 0.6 page
const COLUMN_MIDLINE = 0.5;       // anything with centre.x < this is left col

interface ParagraphLayout {
  text: string;
  /** Normalised bbox: 0..1 fractions of page width/height. */
  minX: number;
  maxX: number;
  centerX: number;
  centerY: number;
  width: number;
  kind: "full" | "left" | "right";
}

function bboxOf(
  layout: DocumentAiResponseLayout | undefined,
  pageWidth: number,
  pageHeight: number,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const poly = layout?.boundingPoly;
  if (!poly) return null;
  // Prefer normalisedVertices (already 0..1). Fall back to absolute vertices
  // divided by page dimension.
  const norm = poly.normalizedVertices;
  if (norm && norm.length > 0) {
    const xs = norm.map((v) => v.x ?? 0);
    const ys = norm.map((v) => v.y ?? 0);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }
  const abs = poly.vertices;
  if (abs && abs.length > 0 && pageWidth > 0 && pageHeight > 0) {
    const xs = abs.map((v) => (v.x ?? 0) / pageWidth);
    const ys = abs.map((v) => (v.y ?? 0) / pageHeight);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }
  return null;
}

function reorderParagraphs(paras: ParagraphLayout[]): string[] {
  if (paras.length === 0) return [];

  // 1) Split into full-width (separators) and column paragraphs.
  const full = paras.filter((p) => p.kind === "full");
  const cols = paras.filter((p) => p.kind !== "full");

  // 2) Sort separators by y to define band boundaries.
  const sortedFull = full.slice().sort((a, b) => a.centerY - b.centerY);

  // 3) Build band boundaries: [-inf, full_1_y, full_2_y, ..., +inf].
  const boundaries = [-Infinity, ...sortedFull.map((p) => p.centerY), Infinity];

  // 4) Walk bands. For each band:
  //    - Emit the full-width paragraph at its upper boundary (if any).
  //    - Emit left-column paragraphs in band, sorted by y.
  //    - Emit right-column paragraphs in band, sorted by y.
  const out: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const yLow = boundaries[i];
    const yHigh = boundaries[i + 1];

    // Separator that opens this band (skip for the very first band — nothing
    // above the topmost separator).
    if (i > 0 && i - 1 < sortedFull.length) {
      out.push(sortedFull[i - 1].text);
    }

    const inBand = cols.filter(
      (p) => p.centerY > yLow && p.centerY <= yHigh,
    );
    const leftInBand = inBand
      .filter((p) => p.kind === "left")
      .sort((a, b) => a.centerY - b.centerY);
    const rightInBand = inBand
      .filter((p) => p.kind === "right")
      .sort((a, b) => a.centerY - b.centerY);

    for (const p of leftInBand) out.push(p.text);
    for (const p of rightInBand) out.push(p.text);
  }
  return out;
}

interface DocumentAiOcrParams {
  base64: string;
  mimeType: string;
  timeoutInMs: number;
}

export class DocumentAiHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DocumentAiHttpError";
  }
}

function getProcessorEndpoint(): string {
  const projectNumber = process.env.GOOGLE_DOC_AI_PROJECT_NUMBER;
  const location = process.env.GOOGLE_DOC_AI_LOCATION ?? "us";
  const processorId = process.env.GOOGLE_DOC_AI_PROCESSOR_ID;
  if (!projectNumber || !processorId) {
    throw new Error(
      "Missing env vars: GOOGLE_DOC_AI_PROJECT_NUMBER and/or GOOGLE_DOC_AI_PROCESSOR_ID",
    );
  }
  return `https://${location}-documentai.googleapis.com/v1/projects/${projectNumber}/locations/${location}/processors/${processorId}:process`;
}

export async function runDocumentAiOcr(
  params: DocumentAiOcrParams,
): Promise<DocumentAiResult> {
  const token = await getAccessToken();
  const endpoint = getProcessorEndpoint();

  const response = await retry.fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    timeoutInMs: params.timeoutInMs,
    body: JSON.stringify({
      rawDocument: {
        content: params.base64,
        mimeType: params.mimeType,
      },
    }),
  });

  const body = (await response.json()) as DocumentAiResponse;
  if (!response.ok) {
    throw new DocumentAiHttpError(
      body.error?.message ?? `Document AI HTTP ${response.status}`,
      response.status,
      body.error?.status,
    );
  }

  const fullText = body.document?.text ?? "";

  // Build per-page ordered paragraphs using column-aware reordering. We do
  // NOT trust `body.document.text` directly because Document AI's reading
  // order is unreliable on 2-column Korean exam papers.
  const pages: DocumentAiPageLayout[] = (body.document?.pages ?? []).map(
    (page) => {
      const pageW = page.dimension?.width ?? 0;
      const pageH = page.dimension?.height ?? 0;
      const paras: ParagraphLayout[] = [];
      for (const p of page.paragraphs ?? []) {
        const text = extractSegmentText(fullText, p.layout).trim();
        if (!text) continue;
        const bbox = bboxOf(p.layout, pageW, pageH);
        if (!bbox) {
          // No layout info → fall back to "left column at y=0" so we don't
          // drop the text entirely. (Should be rare on Document OCR output.)
          paras.push({
            text,
            minX: 0,
            maxX: 0,
            centerX: 0,
            centerY: 0,
            width: 0,
            kind: "left",
          });
          continue;
        }
        const width = bbox.maxX - bbox.minX;
        const centerX = (bbox.minX + bbox.maxX) / 2;
        const centerY = (bbox.minY + bbox.maxY) / 2;
        let kind: ParagraphLayout["kind"];
        if (width > FULL_WIDTH_THRESHOLD) kind = "full";
        else if (centerX < COLUMN_MIDLINE) kind = "left";
        else kind = "right";
        paras.push({
          text,
          minX: bbox.minX,
          maxX: bbox.maxX,
          centerX,
          centerY,
          width,
          kind,
        });
      }
      return {
        pageNumber: page.pageNumber ?? 1,
        paragraphs: reorderParagraphs(paras),
      };
    },
  );

  // Rebuild the flat text from the reordered per-page paragraphs so callers
  // (Gemini classification) see correct reading order.
  const orderedText = pages
    .map((p) => p.paragraphs.join("\n"))
    .join("\n\n")
    .trim();

  return { text: orderedText, pages };
}
