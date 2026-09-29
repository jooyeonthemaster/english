"use client";

import { Gem, Zap } from "lucide-react";
import {
  WEBTOON_IMAGE_PLANS,
  type WebtoonImagePlanId,
} from "@/lib/webtoon-models";

// 생성 등급 칩 — 아이콘은 생성 옵션 카드(webtoon-generate-fields)와 같은 짝.
const PLAN_ICON: Record<WebtoonImagePlanId, typeof Gem> = {
  STANDARD: Zap,
  PREMIUM: Gem,
};

const PLAN_TONE: Record<WebtoonImagePlanId, string> = {
  STANDARD: "border-slate-200 bg-slate-50 text-slate-500",
  PREMIUM: "border-amber-200 bg-amber-50 text-amber-700",
};

/**
 * 웹툰 생성 등급(일반/프리미엄) 배지. plan 이 없는 레거시 행은 아무것도 그리지 않는다.
 * 모델명은 노출하지 않는다(스펙 §5) — 등급 라벨만.
 */
export function WebtoonPlanBadge({
  plan,
  className = "",
}: {
  plan: WebtoonImagePlanId | null | undefined;
  className?: string;
}) {
  if (!plan) return null;
  const def = WEBTOON_IMAGE_PLANS[plan];
  if (!def) return null;
  const Icon = PLAN_ICON[plan];
  return (
    <span
      title={`${def.label} 등급으로 생성`}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-px text-[9.5px] font-semibold leading-tight ${PLAN_TONE[plan]} ${className}`}
    >
      <Icon className="size-2.5 shrink-0" aria-hidden="true" />
      {def.label}
    </span>
  );
}
