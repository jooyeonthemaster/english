"use client";

// 기능 채택률 — 기능별 "1회 이상 사용한 학원 수"를 가로 막대 리스트로.
// 막대 길이 = 그 기능 학원 수 / 최다 학원 수. 우측에 학원 수 + 누적 실행 건수(작게).
// 사용 학원 수 내림차순 정렬, 미사용(0곳) 기능은 회색으로 맨 아래.
// "어떤 기능이 가장 많이 채택됐나"에 답한다.

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import {
  FEATURE_COLORS,
  type FeatureAdoption,
} from "@/lib/admin-analytics-types";

export function FeatureAdoptionChart({ data }: { data: FeatureAdoption[] }) {
  // 사용(1곳+) / 미사용(0곳)으로 나눠 각각 학원 수 내림차순 정렬.
  const { used, unused, maxAcademies } = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      if (b.academies !== a.academies) return b.academies - a.academies;
      return b.total - a.total;
    });
    const usedRows = sorted.filter((d) => d.academies > 0);
    const unusedRows = sorted.filter((d) => d.academies === 0);
    const max = usedRows.reduce((m, d) => Math.max(m, d.academies), 0);
    return { used: usedRows, unused: unusedRows, maxAcademies: max };
  }, [data]);

  const hasAny = used.length > 0;

  return (
    <div className="w-full">
      {/* ~260px 영역, 행이 많으면 스크롤 */}
      <div className="max-h-[260px] overflow-y-auto pr-1">
        {!hasAny ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-1.5 text-gray-300">
            <Layers className="size-5" strokeWidth={1.75} aria-hidden />
            <p className="text-[12px]">아직 사용된 기능이 없습니다</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {used.map((d) => {
              const ratio =
                maxAcademies > 0 ? (d.academies / maxAcademies) * 100 : 0;
              const color = FEATURE_COLORS[d.feature];
              return (
                <li
                  key={d.feature}
                  className="flex items-center gap-2.5"
                  title={`${d.label} · 사용 학원 ${formatNumber(
                    d.academies,
                  )}곳 · 누적 ${formatNumber(d.total)}건`}
                >
                  <span className="w-20 shrink-0 truncate text-[12px] text-gray-600">
                    {d.label}
                  </span>
                  {/* 막대 트랙 */}
                  <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-gray-50">
                    <span
                      className="absolute inset-y-0 left-0 rounded-md transition-[width]"
                      style={{
                        width: `${Math.max(ratio, d.academies > 0 ? 6 : 0)}%`,
                        backgroundColor: color,
                      }}
                      aria-hidden
                    />
                  </span>
                  {/* 학원 수 */}
                  <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-gray-800">
                    {formatNumber(d.academies)}
                    <span className="ml-0.5 text-[11px] font-normal text-gray-400">
                      곳
                    </span>
                  </span>
                  {/* 누적 실행 건수 (작게, 회색) */}
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                    {formatNumber(d.total)}건
                  </span>
                </li>
              );
            })}

            {/* 미사용 기능 — 맨 아래 회색 처리 */}
            {unused.map((d) => (
              <li
                key={d.feature}
                className="flex items-center gap-2.5 opacity-60"
                title={`${d.label} · 사용 학원 없음`}
              >
                <span className="w-20 shrink-0 truncate text-[12px] text-gray-400">
                  {d.label}
                </span>
                <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-gray-50" />
                <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-gray-300">
                  0
                  <span className="ml-0.5 text-[11px] font-normal text-gray-300">
                    곳
                  </span>
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-gray-300">
                  {formatNumber(d.total)}건
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 캡션 — 스크롤 박스 밖(아래 형제) */}
      <p
        className={cn(
          "mt-3 text-[11px] text-gray-400",
          !hasAny && "text-gray-300",
        )}
      >
        기능별 사용 학원 수 · 누적 실행
      </p>
    </div>
  );
}
