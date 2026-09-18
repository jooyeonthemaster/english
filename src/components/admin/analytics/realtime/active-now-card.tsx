"use client";

// 실시간 — 「지금 접속 중 N명」 큰 숫자 + 채널·기기 분포 미니 막대(클릭 = 필터).

import type { RealtimeReport } from "@/lib/analytics/reports/realtime";
import { CHANNEL_COLORS, channelLabel, deviceLabel, isChannel } from "@/lib/analytics/channels";
import { fmtInt } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { useAnalyticsParams, type FilterKey } from "../shared/use-analytics-params";

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#2563eb",
  tablet: "#60a5fa",
  desktop: "#1e3a8a",
};

interface MiniBarRow {
  key: string;
  label: string;
  count: number;
  color: string;
  filterValue: string;
}

function MiniBars({
  title,
  rows,
  total,
  filterKey,
}: {
  title: string;
  rows: MiniBarRow[];
  total: number;
  filterKey: FilterKey;
}) {
  const { setFilter } = useAnalyticsParams();
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11.5px] font-semibold text-gray-400">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-gray-300">-</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const ratio = total > 0 ? (r.count / total) * 100 : 0;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => setFilter(filterKey, r.filterValue)}
                  className="group block w-full text-left"
                  title="클릭하면 이 값으로 필터"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                      <span className="truncate text-[12.5px] text-gray-700 group-hover:text-blue-700">{r.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-[12.5px] font-semibold text-gray-800">{fmtInt(r.count)}</span>
                      <span className="ml-1 text-[11px] text-gray-400">{Math.round(ratio)}%</span>
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(2, ratio)}%`, background: r.color }}
                      aria-hidden
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ActiveNowCard({ data, className }: { data: RealtimeReport; className?: string }) {
  const live = data.activeNow > 0;
  const channelRows: MiniBarRow[] = data.activeByChannel.map((r) => ({
    key: r.channel,
    label: channelLabel(r.channel),
    count: r.count,
    color: isChannel(r.channel) ? CHANNEL_COLORS[r.channel] : "#94a3b8",
    filterValue: r.channel,
  }));
  const deviceRows: MiniBarRow[] = data.activeByDevice.map((r) => ({
    key: r.deviceType ?? "(none)",
    label: deviceLabel(r.deviceType),
    count: r.count,
    color: (r.deviceType && DEVICE_COLORS[r.deviceType]) || "#94a3b8",
    filterValue: r.deviceType ?? "(none)",
  }));

  return (
    <div className={cn("rounded-xl border bg-white p-5", live ? "border-emerald-100" : "border-gray-100", className)}>
      <div className={cn("flex items-center gap-1.5 text-[12px] font-semibold", live ? "text-emerald-700" : "text-gray-400")}>
        <span className="relative flex size-2">
          {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
          <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-emerald-500" : "bg-gray-300")} />
        </span>
        지금 접속 중
      </div>
      <div className={cn("mt-2 text-[44px] font-bold leading-none tabular-nums", live ? "text-emerald-700" : "text-gray-900")}>
        {fmtInt(data.activeNow)}
        <span className="ml-1 text-[16px] font-semibold">명</span>
      </div>
      <p className="mt-1.5 text-[11.5px] text-gray-400">최근 5분 안에 신호를 보낸 방문(세션) 수</p>

      {live ? (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <MiniBars title="채널" rows={channelRows} total={data.activeNow} filterKey="channel" />
          <MiniBars title="기기" rows={deviceRows} total={data.activeNow} filterKey="device" />
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-[12px] text-gray-400">
          지금 접속 중인 방문자가 없습니다
        </p>
      )}
    </div>
  );
}
