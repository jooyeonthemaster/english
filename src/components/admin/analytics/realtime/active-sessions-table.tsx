"use client";

// 실시간 — 활성 세션 표(최근 5분, 최대 50, 마지막 활동 최신순).
// 현재 페이지(+ 방문 여정 링크) · 유입 · 기기 · 지역 · 체류 · 마지막 활동 · 연결 학원(학원 상세 링크).

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RealtimeActiveSession } from "@/lib/analytics/reports/realtime";
import {
  CHANNEL_COLORS,
  channelLabel,
  deviceLabel,
  inAppLabel,
  isChannel,
  regionLabel,
  sourceLabel,
} from "@/lib/analytics/channels";
import { fmtAgo, fmtDuration, fmtInt } from "@/lib/analytics/format";
import { ReportEmpty } from "../shared/report-states";
import { useAnalyticsParams, withSharedQuery } from "../shared/use-analytics-params";

const HEAD = "px-2 py-2 text-[11px] font-semibold text-gray-400 whitespace-nowrap";
const CELL = "px-2 py-2.5 align-top text-[12.5px] text-gray-600";

function placeLabel(s: RealtimeActiveSession): string {
  const region = regionLabel(s.country, s.region);
  if (region === "미상") return s.city ?? (s.country ?? "미상");
  return s.city ? `${region} · ${s.city}` : region;
}

export function ActiveSessionsTable({ rows, nowMs }: { rows: RealtimeActiveSession[]; nowMs: number }) {
  const { sharedQuery } = useAnalyticsParams();
  // 세션 탐색기의 여정 드로어 URL 계약: /admin/analytics/sessions?session=<id> (sessions-view.tsx)
  const journeyHref = (id: string) => {
    const base = withSharedQuery("/admin/analytics/sessions", sharedQuery);
    return `${base}${base.includes("?") ? "&" : "?"}session=${encodeURIComponent(id)}`;
  };

  if (rows.length === 0) return <ReportEmpty message="최근 5분 안에 활동한 세션이 없습니다" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <thead>
          <tr className="border-b border-gray-50">
            <th className={`${HEAD} pl-0`}>현재 페이지</th>
            <th className={HEAD}>유입</th>
            <th className={HEAD}>기기</th>
            <th className={HEAD}>지역</th>
            <th className={`${HEAD} text-right`}>체류</th>
            <th className={`${HEAD} text-right`}>마지막 활동</th>
            <th className={HEAD}>학원</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const current = s.currentPath ?? s.entryPath;
            return (
              <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className={`${CELL} max-w-[280px] pl-0`}>
                  <div className="truncate font-mono text-[12px] text-gray-800" title={current}>
                    {current}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span
                      className={
                        s.isNewVisitor
                          ? "rounded bg-emerald-50 px-1 font-semibold text-emerald-700"
                          : "rounded bg-gray-100 px-1 font-semibold text-gray-500"
                      }
                    >
                      {s.isNewVisitor ? "신규" : "재방문"}
                    </span>
                    {current !== s.entryPath && (
                      <span className="truncate" title={s.entryPath}>
                        진입 <span className="font-mono">{s.entryPath}</span>
                      </span>
                    )}
                    <Link
                      href={journeyHref(s.id)}
                      prefetch={false}
                      className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-blue-600 hover:underline"
                      title="이 방문의 여정(이벤트 타임라인)을 세션 탐색기에서 봅니다"
                    >
                      여정
                      <ArrowUpRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                </td>
                <td className={CELL}>
                  <div className="flex items-center gap-1.5 whitespace-nowrap text-gray-800">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: isChannel(s.channel) ? CHANNEL_COLORS[s.channel] : "#94a3b8" }}
                      aria-hidden
                    />
                    {channelLabel(s.channel)}
                  </div>
                  <div className="mt-0.5 max-w-[160px] truncate text-[11px] text-gray-400" title={s.source ?? undefined}>
                    {sourceLabel(s.source)}
                  </div>
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <div className="text-gray-800">{deviceLabel(s.deviceType)}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {[s.os, s.inApp ? inAppLabel(s.inApp) : null].filter(Boolean).join(" · ") || "-"}
                  </div>
                </td>
                <td className={`${CELL} whitespace-nowrap`}>{placeLabel(s)}</td>
                <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>
                  <div className="text-gray-800">{fmtDuration(s.engagedMs)}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{fmtInt(s.pageviews)}페이지</div>
                </td>
                <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{fmtAgo(s.lastSeenAt, nowMs)}</td>
                <td className={`${CELL} max-w-[180px]`}>
                  {s.academyId ? (
                    <Link
                      href={`/admin/academies/${s.academyId}`}
                      prefetch={false}
                      className="block truncate font-semibold text-blue-600 hover:underline"
                      title={s.academyName ?? s.academyId}
                    >
                      {s.academyName ?? "학원 보기"}
                    </Link>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
