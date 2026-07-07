import type { PlatformCostProvider, PlatformCostUnitType } from "@/lib/platform-api-costs";

/**
 * 추정 단가(Estimated pricing).
 *
 * DB(ProviderPricing)나 환경변수에 단가가 없을 때, 호출 원가를 "0원 처리"하지
 * 않고 공개 리스트 가격 기반 추정치로 환산하기 위한 폴백 단가표.
 *
 * 우선순위: RECORDED → DB → ENV → **ESTIMATE(여기)** → MISSING(0원)
 *
 * 실제 단가를 어드민 "단가 스냅샷"에서 등록하면 언제든 이 추정치를 덮어쓴다.
 * 값은 각 provider의 공개 리스트 가격(USD) 기준이며, 정확한 청구액은
 * "청구 정산"에서 실제 인보이스로 보정한다.
 */
export interface EstimatedUnitPricing {
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  unitUsd: number | null;
}

// 조사 근거(2026-07 기준 공개 리스트 가격, 코드 내 실측 주석과 교차검증):
// - Anthropic Claude: Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 (per 1M in/out)
// - Google Gemini 3.5 Flash: $1.50/$9.00, 3.1 Flash-Lite: $0.25/$1.50 (per 1M in/out)
//   (model-config.ts 실측: flash 건당 $0.0103, flash-lite $0.0017 ↔ 위 단가와 일치)
// - Google Document AI Enterprise OCR: $1.50 / 1,000 페이지 = $0.0015/page
// - AtlasCloud gpt-image-2(웹툰): $0.008 / 이미지 (20% 할인 적용가; 크기·품질 무관 플랫)
export function resolveEstimatedPricing(
  provider: PlatformCostProvider,
  unitType: PlatformCostUnitType,
  model: string | null | undefined,
): EstimatedUnitPricing | null {
  const lowerModel = (model ?? "").toLowerCase();

  if (unitType === "TOKENS" && provider === "ANTHROPIC") {
    if (lowerModel.includes("opus")) {
      return { inputUsdPer1M: 5, outputUsdPer1M: 25, unitUsd: null };
    }
    if (lowerModel.includes("haiku")) {
      return { inputUsdPer1M: 1, outputUsdPer1M: 5, unitUsd: null };
    }
    // sonnet 및 미상 Claude 모델 → Sonnet 티어로 보수적 추정
    return { inputUsdPer1M: 3, outputUsdPer1M: 15, unitUsd: null };
  }

  if (unitType === "TOKENS" && provider === "GOOGLE_GEMINI") {
    if (lowerModel.includes("flash-lite") || lowerModel.includes("lite")) {
      return { inputUsdPer1M: 0.25, outputUsdPer1M: 1.5, unitUsd: null };
    }
    // flash 및 미상 Gemini 모델 → Flash 표준 티어(3.5 Flash 기준)
    return { inputUsdPer1M: 1.5, outputUsdPer1M: 9, unitUsd: null };
  }

  // 게이트웨이(OpenRouter/AtlasCloud)는 여러 모델(anthropic/*, google/*)을 토큰
  // 단위로 중계 → 모델명으로 원 프로바이더 티어를 추정한다(직접 호출과 동일 단가).
  // 없으면 0원 처리되던 것을 방지. OpenRouter 는 응답에 실측 cost 가 실려
  // RECORDED 로 먼저 잡히므로, 이 추정은 실측 누락 시 폴백으로만 쓰인다.
  if (unitType === "TOKENS" && (provider === "ATLASCLOUD" || provider === "OPENROUTER")) {
    if (lowerModel.includes("opus")) {
      return { inputUsdPer1M: 5, outputUsdPer1M: 25, unitUsd: null };
    }
    if (lowerModel.includes("haiku")) {
      return { inputUsdPer1M: 1, outputUsdPer1M: 5, unitUsd: null };
    }
    if (lowerModel.includes("flash-lite")) {
      return { inputUsdPer1M: 0.25, outputUsdPer1M: 1.5, unitUsd: null };
    }
    if (lowerModel.includes("gemini") || lowerModel.includes("flash")) {
      return { inputUsdPer1M: 1.5, outputUsdPer1M: 9, unitUsd: null };
    }
    // sonnet·claude 및 미상 → Sonnet 티어로 보수적 추정
    return { inputUsdPer1M: 3, outputUsdPer1M: 15, unitUsd: null };
  }

  if (unitType === "PAGE" && provider === "GOOGLE_DOCUMENT_AI") {
    return { inputUsdPer1M: null, outputUsdPer1M: null, unitUsd: 0.0015 };
  }

  if (unitType === "IMAGE" && provider === "ATLASCLOUD") {
    return { inputUsdPer1M: null, outputUsdPer1M: null, unitUsd: 0.008 };
  }

  return null;
}
