"use client";

import { useCallback, type ReactNode } from "react";
import { getDashboardDetail } from "@/actions/admin/dashboard-detail";
import { cn } from "@/lib/utils";
import type { DashboardDetailKey } from "@/lib/admin-dashboard-detail-types";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";

/**
 * 대시보드 블록 래퍼 — 마우스를 올리면 상세 팝오버, 클릭하면 상세 팝업.
 * 상세는 처음 열릴 때 서버에서 지연 조회한다(관리자 공용 AdminHoverDetail 사용).
 */
export function DashboardDetailBlock({
  detailKey,
  param,
  className,
  children,
  side = "bottom",
  label,
}: {
  detailKey: DashboardDetailKey;
  param?: string;
  className?: string;
  children: ReactNode;
  side?: "top" | "bottom";
  /** 로딩 중 제목·스크린리더용 이름 */
  label: string;
}) {
  const load = useCallback(() => getDashboardDetail(detailKey, param), [detailKey, param]);
  return (
    <AdminHoverDetail
      title={label}
      load={load}
      cacheKey={`dashboard:${detailKey}:${param ?? ""}`}
      side={side}
    >
      <div
        role="button"
        aria-label={`${label} 상세 보기`}
        className={cn(
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
          className,
        )}
      >
        {children}
      </div>
    </AdminHoverDetail>
  );
}
