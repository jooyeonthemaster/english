// ============================================================================
// Webtoon image model tiers (plans)
// ----------------------------------------------------------------------------
// Single source of truth shared by the API route, the trigger/worker processor,
// and the client modals. Pure constants only (no server-only imports) so it is
// safe to import from client components.
//
// Both tiers are generated through AtlasCloud — only the underlying model and
// the request parameter shape differ:
//   · STANDARD = google/nano-banana-2 (aspect_ratio + resolution + thinking_level)
//   · PREMIUM  = openai/gpt-image-2  (size + quality)
// ============================================================================

import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";

export type WebtoonImagePlanId = "STANDARD" | "PREMIUM";

/** AtlasCloud generation parameters per model family. Plain values (no atlas import). */
export interface WebtoonImagePlanParams {
  /** gpt-image-2 family — explicit pixel size (vertical 9:16). */
  size?: string;
  /** gpt-image-2 family — render quality. */
  quality?: "low" | "medium" | "high";
  /** nano-banana family — aspect ratio (vertical webtoon). */
  aspectRatio?: string;
  /** nano-banana family — output resolution bucket. */
  resolution?: "1k" | "2k" | "4k";
  /** nano-banana family — internal reasoning depth. */
  thinkingLevel?: "default" | "high" | "minimal";
}

export interface WebtoonImagePlanDef {
  id: WebtoonImagePlanId;
  /** Korean label for the tier chip (e.g. "일반" / "프리미엄"). */
  label: string;
  /** Short marketing line shown under the label. */
  blurb: string;
  /** AtlasCloud model id. */
  modelId: string;
  /** Credit operation type used for charge/refund. */
  operationType: OperationType;
  /** Credit cost (derived from CREDIT_COSTS for a single source of truth). */
  credits: number;
  /** AtlasCloud request parameters for this model. */
  params: WebtoonImagePlanParams;
  /** Curated sample webtoon (this tier's output) shown in the "예시 보기" viewer.
   *  Stored at a stable public path so it survives user deletions. */
  exampleUrl: string;
}

/** Public bucket base for curated tier example images (stable, non-user paths). */
const WEBTOON_EXAMPLE_BASE =
  "https://eavjwivvqxnsunbcvkce.supabase.co/storage/v1/object/public/webtoon-images/_examples";

export const WEBTOON_IMAGE_PLANS: Record<WebtoonImagePlanId, WebtoonImagePlanDef> = {
  STANDARD: {
    id: "STANDARD",
    label: "일반",
    blurb: "빠르고 합리적인 품질 · 대부분의 지문에 적합",
    modelId: "google/nano-banana-2/text-to-image-developer",
    operationType: "WEBTOON_IMAGE",
    credits: CREDIT_COSTS.WEBTOON_IMAGE,
    params: { aspectRatio: "9:16", resolution: "2k", thinkingLevel: "high" },
    exampleUrl: `${WEBTOON_EXAMPLE_BASE}/standard.jpg`,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "프리미엄",
    blurb: "가장 정교한 묘사 · 디테일이 중요할 때",
    modelId: "openai/gpt-image-2/text-to-image",
    operationType: "WEBTOON_IMAGE_PREMIUM",
    credits: CREDIT_COSTS.WEBTOON_IMAGE_PREMIUM,
    params: { size: "2160x3840", quality: "high" },
    exampleUrl: `${WEBTOON_EXAMPLE_BASE}/premium.jpg`,
  },
};

export const WEBTOON_IMAGE_PLAN_LIST: WebtoonImagePlanDef[] = [
  WEBTOON_IMAGE_PLANS.STANDARD,
  WEBTOON_IMAGE_PLANS.PREMIUM,
];

export const DEFAULT_WEBTOON_IMAGE_PLAN: WebtoonImagePlanId = "STANDARD";

/** All credit operation types used by webtoon image generation (across tiers).
 *  Use to keep webtoon credits out of generic credit aggregations (they are
 *  tracked separately in the platform-api-costs webtoon ledger). */
export const WEBTOON_IMAGE_OPERATION_TYPES: OperationType[] =
  WEBTOON_IMAGE_PLAN_LIST.map((p) => p.operationType);

export function isWebtoonImageOperationType(op: string | null | undefined): boolean {
  return !!op && WEBTOON_IMAGE_OPERATION_TYPES.includes(op as OperationType);
}

export function isWebtoonImagePlanId(v: unknown): v is WebtoonImagePlanId {
  return v === "STANDARD" || v === "PREMIUM";
}

/** Resolve a (possibly untrusted) plan id to its definition, defaulting to STANDARD. */
export function resolveWebtoonImagePlan(v: unknown): WebtoonImagePlanDef {
  return isWebtoonImagePlanId(v)
    ? WEBTOON_IMAGE_PLANS[v]
    : WEBTOON_IMAGE_PLANS[DEFAULT_WEBTOON_IMAGE_PLAN];
}

/** Reverse lookup: AtlasCloud model id → plan definition (for the worker reading a stored row). */
export function planForModelId(modelId: string | null | undefined): WebtoonImagePlanDef | null {
  if (!modelId) return null;
  return WEBTOON_IMAGE_PLAN_LIST.find((p) => p.modelId === modelId) ?? null;
}
