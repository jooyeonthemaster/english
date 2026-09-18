"use client";

// 세션 표 — 행 클릭 = 세션 여정 드로어. 채널 칩 클릭 = 채널 필터.
// 셀 최대폭은 인라인 style — 임의값 max-w-[…] 는 모바일 큰글씨 리맵(globals.css)이 100% 로 덮어쓴다.

import { ArrowRight } from "lucide-react";
import type { SessionListRow } from "@/lib/analytics/reports/sessions";
import { channelLabel, deviceLabel, inAppLabel, sourceLabel } from "@/lib/analytics/channels";
import { fmtDateTime, fmtDuration, fmtInt } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { ScrollableX } from "./scrollable-x";
import { Badge, ChannelDot, ConversionBadge, VisitorBadge, placeText } from "./session-parts";

export function SessionsTable({
  rows,
  selectedId,
  onOpen,
}: {
  rows: SessionListRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const { setFilter } = useAnalyticsParams();

  return (
    <ScrollableX caption="좌우로 밀어 나머지 열 보기(PV·체류·기기·지역·연결 학원)">
      <table className="w-full min-w-[980px] text-left">
        <thead>
          <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400">
            <th className="py-2 pr-2 pl-5 font-semibold whitespace-nowrap">시작 (KST)</th>
            <th className="px-2 py-2 font-semibold">유입</th>
            <th className="px-2 py-2 font-semibold">진입 → 종료</th>
            <th className="px-2 py-2 text-right font-semibold">PV</th>
            <th className="px-2 py-2 text-right font-semibold">체류</th>
            <th className="px-2 py-2 font-semibold">기기</th>
            <th className="px-2 py-2 font-semibold">지역</th>
            <th className="px-2 py-2 font-semibold">구분</th>
            <th className="py-2 pr-5 pl-2 font-semibold">연결 학원</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.id === selectedId;
            return (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(r.id);
                  }
                }}
                className={cn(
                  "cursor-pointer border-b border-gray-50 align-top text-[12.5px] text-gray-700 outline-none last:border-0 hover:bg-blue-50/40 focus-visible:bg-blue-50/60",
                  selected && "bg-blue-50/70 hover:bg-blue-50/70",
                )}
                title="클릭하면 방문 여정 보기"
              >
                <td className="py-2.5 pr-2 pl-5 whitespace-nowrap tabular-nums text-gray-800">{fmtDateTime(r.startedAt)}</td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilter("channel", r.channel);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md font-semibold whitespace-nowrap text-gray-800 hover:text-blue-700"
                    title="이 채널로 필터"
                  >
                    <ChannelDot channel={r.channel} />
                    {channelLabel(r.channel)}
                  </button>
                  <div className="mt-0.5 truncate text-[11.5px] text-gray-400" style={{ maxWidth: 180 }} title={[r.source, r.campaign, r.referrerHost].filter(Boolean).join(" · ")}>
                    {sourceLabel(r.source)}
                    {r.campaign && <span> · {r.campaign}</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1 font-mono text-[12px]" style={{ maxWidth: 280 }}>
                    <span className="truncate text-gray-800" title={r.entryPath}>
                      {r.entryPath}
                    </span>
                    {r.exitPath && r.exitPath !== r.entryPath && (
                      <>
                        <ArrowRight className="size-3 shrink-0 text-gray-300" aria-hidden />
                        <span className="truncate text-gray-500" title={r.exitPath}>
                          {r.exitPath}
                        </span>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {fmtInt(r.pageviews)}
                  {r.eventsCount > 0 && <div className="text-[11px] text-gray-400">이벤트 {fmtInt(r.eventsCount)}</div>}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">{fmtDuration(r.engagedMs)}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <div>
                    {deviceLabel(r.deviceType)}
                    {r.os && <span className="text-gray-400"> · {r.os}</span>}
                  </div>
                  {r.inApp && (
                    <Badge tone="amber" className="mt-0.5" title="인앱 브라우저">
                      {inAppLabel(r.inApp)} 인앱
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">{placeText(r.country, r.region, r.city)}</td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <VisitorBadge isNew={r.isNewVisitor} />
                    {r.hasConversion && <ConversionBadge />}
                  </div>
                </td>
                <td className="py-2.5 pr-5 pl-2">
                  {r.academyId ? (
                    <span className="block truncate font-semibold text-gray-800" style={{ maxWidth: 160 }} title={r.academyName ?? r.academyId}>
                      {r.academyName ?? "(이름 없음)"}
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollableX>
  );
}
