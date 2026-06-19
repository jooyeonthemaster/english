"use client";

// 기능별 성공/실패 — AI/잡 기반 기능만. 기능별로 100% 가로 누적 막대
// (성공=emerald / 실패=rose / 기타=slate) + 성공률(기타 제외 분모) + 카운트.
// "어떤 작업이 얼마나 실패하나"를 한눈에. 총 처리량 내림차순 정렬.

import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/utils";
import type { FeatureOutcome } from "@/lib/admin-analytics-types";

const SUCCESS_COLOR = "#10B981"; // emerald-500
const FAILED_COLOR = "#F43F5E"; // rose-500
const PENDING_COLOR = "#CBD5E1"; // slate-300

interface OutcomeRow {
  feature: string;
  label: string;
  success: number;
  failed: number;
  pending: number;
  /** 성공+실패+기타 (막대 폭 분모) */
  total: number;
  /** 성공+실패 (성공률 분모, 기타 제외) */
  resolved: number;
  /** 성공률 0..100 (resolved 0이면 0) */
  successRate: number;
}

export function FeatureOutcomes({ data }: { data: FeatureOutcome[] }) {
  const rows = useMemo<OutcomeRow[]>(() => {
    return data
      .map((d) => {
        const success = Math.max(0, d.success);
        const failed = Math.max(0, d.failed);
        const pending = Math.max(0, d.pending);
        const total = success + failed + pending;
        const resolved = success + failed;
        const successRate = resolved > 0 ? (success / resolved) * 100 : 0;
        return {
          feature: d.feature,
          label: d.label,
          success,
          failed,
          pending,
          total,
          resolved,
          successRate,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [data]);

  if (rows.length === 0) {
    return (
      <div className="flex h-[260px] w-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-300">
          <Inbox className="h-7 w-7" aria-hidden />
          <p className="text-[12px]">선택 기간에 AI 작업 기록이 없습니다</p>
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          AI 작업 성공/실패 (선택 기간)
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[260px] w-full flex-col">
      <ul className="flex-1 space-y-3 overflow-y-auto pr-0.5">
        {rows.map((r) => {
          const successPct = (r.success / r.total) * 100;
          const failedPct = (r.failed / r.total) * 100;
          const pendingPct = (r.pending / r.total) * 100;
          return (
            <li key={r.feature}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] font-medium text-gray-700">
                  {r.label}
                </span>
                <span
                  className="shrink-0 text-[12px] font-semibold tabular-nums"
                  style={{
                    color: r.resolved > 0 ? SUCCESS_COLOR : "#94A3B8",
                  }}
                  title="성공률 (기타 제외)"
                >
                  {r.resolved > 0 ? formatPercent(r.successRate) : "—"}
                </span>
              </div>

              {/* 100% 가로 누적 막대 (성공·실패·기타) */}
              <div
                role="img"
                aria-label={`${r.label}: 성공 ${r.success}건, 실패 ${r.failed}건, 기타 ${r.pending}건`}
                className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
              >
                {r.success > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${successPct}%`,
                      backgroundColor: SUCCESS_COLOR,
                    }}
                    aria-hidden
                  />
                )}
                {r.failed > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${failedPct}%`,
                      backgroundColor: FAILED_COLOR,
                    }}
                    aria-hidden
                  />
                )}
                {r.pending > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${pendingPct}%`,
                      backgroundColor: PENDING_COLOR,
                    }}
                    aria-hidden
                  />
                )}
              </div>

              <div className="mt-1 flex items-center gap-3 text-[11px] tabular-nums text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SUCCESS_COLOR }}
                    aria-hidden
                  />
                  성공 {formatNumber(r.success)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: FAILED_COLOR }}
                    aria-hidden
                  />
                  실패 {formatNumber(r.failed)}
                </span>
                {r.pending > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PENDING_COLOR }}
                      aria-hidden
                    />
                    기타 {formatNumber(r.pending)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* 캡션 — 높이 박스 밖(아래 형제) */}
      <p className="mt-2 shrink-0 text-center text-[11px] text-gray-400">
        AI 작업 성공/실패 (선택 기간)
      </p>
    </div>
  );
}
