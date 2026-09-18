"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { StatCard } from "@/components/admin/kit";
import type { AdminDetail } from "@/lib/admin-detail-types";
import type { Tone } from "@/lib/admin-labels/tone";

/**
 * 호버 상세가 붙는 통계 카드. AdminHoverDetail 은 자식 엘리먼트에 이벤트를 합치는데
 * StatCard 는 나머지 props 를 루트에 넘기지 않으므로 div 로 한 번 감싼다.
 * 서버 조회형 상세(CostsLoadDetail)는 load 로 래퍼를 넘긴다.
 */
export function HoverStatCard({
  label,
  value,
  sub,
  icon,
  tone,
  valueTone,
  size = "md",
  alert,
  detail,
  load,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  valueTone?: Tone;
  size?: "md" | "sm";
  alert?: boolean;
  detail?: AdminDetail;
  load?: (card: ReactElement) => ReactElement;
}) {
  const card = (
    <div className="h-full cursor-pointer rounded-xl transition-shadow hover:shadow-md">
      <StatCard
        label={label}
        value={value}
        sub={sub}
        icon={icon}
        tone={tone}
        valueTone={valueTone}
        size={size}
        alert={alert}
        className="h-full"
      />
    </div>
  );
  if (load) return load(card);
  return (
    <AdminHoverDetail title={label} detail={detail}>
      {card}
    </AdminHoverDetail>
  );
}
