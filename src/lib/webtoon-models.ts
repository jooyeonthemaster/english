// ============================================================================
// Webtoon image model tiers (plans)
// ----------------------------------------------------------------------------
// Single source of truth shared by the API route, the trigger/worker processor,
// and the client modals. Pure constants only (no server-only imports) so it is
// safe to import from client components.
//
// Both tiers generate ONE 9:16 page through OpenRouter's Images API with the
// GPT Image 2.5 family (26-09-29 migration off AtlasCloud) — the tiers differ
// only in the model variant:
//   · STANDARD = openai/gpt-image-2.5-flare     (speed tier)
//   · PREMIUM  = openai/gpt-image-2.5-sunburst  (precision tier)
// Before the image call, a Gemini storyboard stage directs every panel
// (src/lib/webtoon-storyboard) — identical for both tiers.
// ============================================================================

import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";

export type WebtoonImagePlanId = "STANDARD" | "PREMIUM";

export type WebtoonImageQuality = "low" | "medium" | "high" | "xhigh" | "max";

/** OpenRouter Images API parameters for a plan. Plain values (no server import). */
export interface WebtoonImagePlanParams {
  /** Page aspect ratio — vertical webtoon page. */
  aspectRatio: "9:16";
  /** GPT Image 2.5 render quality. */
  quality: WebtoonImageQuality;
}

export interface WebtoonImagePlanDef {
  id: WebtoonImagePlanId;
  /** Korean label for the tier chip (e.g. "일반" / "프리미엄"). */
  label: string;
  /** Engine name shown under the label. */
  engineLabel: string;
  /** Short marketing line shown under the label. */
  blurb: string;
  /** OpenRouter image model id. */
  modelId: string;
  /**
   * Model ids stored on rows created before the current engine (AtlasCloud era).
   * In-flight / retried legacy rows resolve to the same tier instead of silently
   * falling back to STANDARD.
   */
  legacyModelIds: string[];
  /** Credit operation type used for charge/refund. */
  operationType: OperationType;
  /** Credit cost (derived from CREDIT_COSTS for a single source of truth). */
  credits: number;
  /** OpenRouter request parameters for this model. */
  params: WebtoonImagePlanParams;
  /** Typical wall-clock generation time shown to teachers (storyboard + image). */
  etaLabel: string;
  /** Curated sample webtoon (this tier's output) shown in the "예시 보기" viewer.
   *  Stored at a stable public path so it survives user deletions. */
  exampleUrl: string;
}

/**
 * Curated tier examples — static assets in public/ (26-09-30 v2 bench: the same passage,
 * 수능 모평 장문 "Sally and the violin", drawn by each tier so teachers can compare). The
 * AtlasCloud-era samples in the webtoon-images bucket (_examples/*.jpg) are no longer used.
 */
const WEBTOON_EXAMPLE_BASE = "/webtoon/examples";

export const WEBTOON_IMAGE_PLANS: Record<WebtoonImagePlanId, WebtoonImagePlanDef> = {
  STANDARD: {
    id: "STANDARD",
    label: "일반",
    engineLabel: "GPT Image 2.5 Flare",
    blurb: "빠르고 선명한 컷 연출 · 대부분의 지문에 적합",
    modelId: "openai/gpt-image-2.5-flare",
    legacyModelIds: ["google/nano-banana-2/text-to-image-developer"],
    operationType: "WEBTOON_IMAGE",
    credits: CREDIT_COSTS.WEBTOON_IMAGE,
    params: { aspectRatio: "9:16", quality: "high" },
    etaLabel: "약 1~2분",
    exampleUrl: `${WEBTOON_EXAMPLE_BASE}/standard-v2.jpg`,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "프리미엄",
    engineLabel: "GPT Image 2.5 Sunburst",
    blurb: "가장 정교한 묘사와 글자 · 디테일이 중요할 때",
    modelId: "openai/gpt-image-2.5-sunburst",
    legacyModelIds: ["openai/gpt-image-2/text-to-image"],
    operationType: "WEBTOON_IMAGE_PREMIUM",
    credits: CREDIT_COSTS.WEBTOON_IMAGE_PREMIUM,
    params: { aspectRatio: "9:16", quality: "high" },
    etaLabel: "약 1~2분",
    exampleUrl: `${WEBTOON_EXAMPLE_BASE}/premium-v2.jpg`,
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

/** Reverse lookup: stored model id (current or legacy) → plan definition. */
export function planForModelId(modelId: string | null | undefined): WebtoonImagePlanDef | null {
  if (!modelId) return null;
  return (
    WEBTOON_IMAGE_PLAN_LIST.find(
      (p) => p.modelId === modelId || p.legacyModelIds.includes(modelId),
    ) ?? null
  );
}
