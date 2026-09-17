"use client";

import type { ReactElement } from "react";
import { getCostsBlockDetail } from "@/actions/admin/detail/costs";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import type { AdminDetail } from "@/lib/admin-detail-types";
import type { CostsBlockKey, CostsBlockParams } from "@/lib/admin-block-detail/costs";

/**
 * 원가 분석(서버 컴포넌트) 지표 카드용 래퍼 — 처음 열릴 때 서버에서 구성 내역을 조회한다.
 * summary 는 페이지가 이미 가진 카드 숫자 그대로 앞에 붙여 카드와 어긋나지 않게 한다.
 */
export function CostsLoadDetail({
  blockKey,
  params,
  label,
  summary,
  children,
}: {
  blockKey: CostsBlockKey;
  params: CostsBlockParams;
  label: string;
  summary?: AdminDetail["summary"];
  children: ReactElement;
}) {
  // 캐시 키가 기간·요약값을 담으므로 매 렌더 새 함수여도 중복 조회는 없다.
  const load = async () => {
    const detail = await getCostsBlockDetail(blockKey, params);
    return { ...detail, summary: [...(summary ?? []), ...(detail.summary ?? [])] };
  };

  const { mode, options } = params;
  const cacheKey = [
    "costs",
    blockKey,
    mode,
    options.date,
    options.month,
    options.startDate,
    options.endDate,
    JSON.stringify(summary ?? []),
  ].join(":");

  return (
    <AdminHoverDetail title={label} load={load} cacheKey={cacheKey}>
      {children}
    </AdminHoverDetail>
  );
}
