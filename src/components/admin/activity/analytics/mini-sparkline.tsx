"use client";

// 미니 스파크라인 — recharts 없이 가벼운 인라인 SVG. 학원별 테이블 행에서
// 최근 N일 활동 추세를 한눈에. 전부 0이면 평평한 베이스라인만.

import { useId } from "react";
import { cn } from "@/lib/utils";

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}

export function MiniSparkline({
  data,
  width = 96,
  height = 24,
  stroke = "#3B82F6",
  className,
}: MiniSparklineProps) {
  // 인스턴스마다 고유 id (행 간 그라디언트 id 충돌로 잘못된 색이 칠해지던 버그 방지).
  // 훅은 조건부 return 전에 호출해야 한다.
  const gradId = `spark${useId().replace(/:/g, "")}`;
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(1, ...data);
  const pad = 1.5;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const x = (i: number) => pad + i * stepX;
  const y = (v: number) => pad + innerH - (v / max) * innerH;

  const linePts = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPts = `${pad},${pad + innerH} ${linePts} ${pad + innerW},${pad + innerH}`;
  const hasAny = data.some((v) => v > 0);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      {hasAny && <polygon points={areaPts} fill={`url(#${gradId})`} />}
      <polyline
        points={linePts}
        fill="none"
        stroke={hasAny ? stroke : "#E5E7EB"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {hasAny && (
        <circle cx={x(n - 1)} cy={y(data[n - 1])} r={2} fill={stroke} />
      )}
    </svg>
  );
}
