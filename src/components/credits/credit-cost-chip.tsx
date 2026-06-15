"use client";

import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditCostChipProps {
  /** 소모 예정 크레딧 양 */
  amount: number;
  /** 칩 배경/글자색 등 컨텍스트별 스타일 (배지 컨테이너 클래스) */
  className?: string;
  iconClassName?: string;
  title?: string;
}

/**
 * 크레딧 소모량 표준 표기 칩 — Coins 아이콘 + 소모 예정 크레딧 숫자.
 * 색상/크기는 호출부의 className으로 맞추되, 내용 구성은 항상 동일하게 유지한다.
 */
export function CreditCostChip({
  amount,
  className,
  iconClassName,
  title,
}: CreditCostChipProps) {
  const formatted = amount.toLocaleString("ko-KR");
  return (
    <span
      title={title ?? `이 작업은 크레딧 ${formatted}을 소모합니다`}
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        className,
      )}
    >
      <Coins className={cn("size-3 shrink-0", iconClassName)} strokeWidth={2} />
      {formatted}
    </span>
  );
}
