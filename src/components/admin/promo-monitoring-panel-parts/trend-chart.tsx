"use client";

// 추이 막대 차트 — 버킷별 방문(파랑)/혜택받기(초록) 스택 막대.

import type { PromoMonitoringPayload } from "@/actions/admin/credit-promotion-monitoring";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function TrendChart({
  series,
}: {
  series: PromoMonitoringPayload["series"];
}) {
  const max = Math.max(1, ...series.map((s) => s.views + s.claims));
  // 라벨 과밀 방지: 버킷이 많으면 일부만 표기.
  const labelEvery = series.length > 16 ? Math.ceil(series.length / 8) : 1;

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-blue-500" />
          방문
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-emerald-500" />
          혜택받기
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-full items-end gap-1" style={{ height: 140 }}>
          {series.map((s, i) => {
            const total = s.views + s.claims;
            const totalH = (total / max) * 120;
            const viewH = total > 0 ? (s.views / total) * totalH : 0;
            const claimH = totalH - viewH;
            return (
              <div
                key={s.key}
                className="flex min-w-[10px] flex-1 flex-col items-center gap-1"
                title={`${s.label} · 방문 ${fmt(s.views)} · 혜택받기 ${fmt(s.claims)}`}
              >
                <div
                  className="flex w-full max-w-[26px] flex-col-reverse overflow-hidden rounded-t"
                  style={{ height: Math.max(2, totalH) }}
                >
                  <div className="w-full bg-blue-500" style={{ height: viewH }} />
                  <div className="w-full bg-emerald-500" style={{ height: claimH }} />
                </div>
                <span className="h-3 text-[11px] tabular-nums text-gray-400">
                  {i % labelEvery === 0 ? s.label : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
