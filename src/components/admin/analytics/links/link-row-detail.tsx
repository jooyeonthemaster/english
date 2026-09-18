"use client";

// 추적 링크 행 펼침 — 기간 클릭 미니 차트 + 도착 URL + 성과 요약 + 「이 링크 유입 방문 보기」.
// 성과 요약(dl)에 기간 클릭·유입 세션·가입·매출을 모두 싣는다 — 표는 960px 고정이라
// 모바일(390px)에서는 이름·목적지 말고는 화면 밖이고, 펼침이 유일하게 보이는 성과 표면이다.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TrackedLinkRow } from "@/lib/analytics/reports/links";
import { fmtBucket, fmtDateTime, fmtInt, fmtKrw } from "@/lib/analytics/format";
import { absoluteSiteUrl, linkRedirectPath } from "@/lib/analytics/tracked-links";
import { UrlLine } from "./link-form-parts";

interface ClickPoint {
  key: string;
  label: string;
  clicks: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ClickTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as ClickPoint | undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">{p.key}</p>
      <p className="mt-0.5 text-[12px] text-gray-500">
        클릭 <span className="font-semibold text-blue-600 tabular-nums">{fmtInt(p.clicks)}</span>
      </p>
    </div>
  );
}

export function LinkRowDetail({
  link,
  shortBase,
  sharedQuery,
  clicksUnfiltered,
}: {
  link: TrackedLinkRow;
  shortBase: string;
  sharedQuery: string;
  /** 상단 공용 필터가 켜져 있어 클릭 값만 필터 밖인 상태 */
  clicksUnfiltered?: boolean;
}) {
  // ResponsiveContainer 대신 직접 폭을 잰다 — recharts 3 의 ResponsiveContainer 는 차트를 폭 0 래퍼에 넣는데,
  // 모바일 전역 CSS(body.smoat-large-ui .recharts-wrapper{max-width:100%!important})가 그 0 을 기준으로 잡아 차트가 사라진다.
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const hasClicks = link.periodClicks > 0;
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => setChartWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasClicks]); // 기간 변경으로 차트 영역이 새로 생기면 다시 잰다

  const data: ClickPoint[] = link.clickSeries.map((p) => ({ ...p, label: fmtBucket(p.key) }));
  const hourly = data.length > 0 && data[0].key.length > 10;
  const interval = Math.max(0, Math.ceil(data.length / 10) - 1);

  const sessionsQuery = new URLSearchParams(sharedQuery);
  sessionsQuery.set("link", link.slug);
  const sessionsHref = `/admin/analytics/sessions?${sessionsQuery.toString()}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <p className="mb-1 text-[12px] font-semibold text-gray-500">
          {hourly ? "시간별" : "일별"} 클릭 <span className="font-normal text-gray-400">· 봇·미리보기 크롤러 제외</span>
        </p>
        {!hasClicks ? (
          <div className="flex h-[132px] items-center justify-center rounded-lg border border-dashed border-gray-200 text-[12.5px] text-gray-400">
            이 기간에 클릭이 없습니다
          </div>
        ) : (
          <div ref={chartRef} className="h-[132px] w-full">
            {chartWidth > 0 && (
              <BarChart width={chartWidth} height={132} data={data} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#9CA3AF" }} interval={interval} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#9CA3AF" }} allowDecimals={false} width={40} />
                <Tooltip content={<ClickTooltip />} cursor={{ fill: "#EFF6FF" }} />
                <Bar dataKey="clicks" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="space-y-1.5 rounded-lg bg-gray-50 p-2.5">
          <UrlLine label="도착 URL" url={absoluteSiteUrl(shortBase, linkRedirectPath(link))} copyMessage="도착 URL을 복사했습니다" muted />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="text-gray-400">기간 클릭{clicksUnfiltered ? " (필터 미적용)" : ""}</dt>
          <dd className="text-right font-semibold text-gray-700 tabular-nums">{fmtInt(link.periodClicks)}</dd>
          <dt className="text-gray-400">누적 클릭</dt>
          <dd className="text-right font-semibold text-gray-700 tabular-nums">{fmtInt(link.totalClicks)}</dd>
          <dt className="text-gray-400">유입 세션</dt>
          <dd className="text-right font-semibold text-gray-700 tabular-nums">{fmtInt(link.sessions)}</dd>
          <dt className="text-gray-400">유입 방문자</dt>
          <dd className="text-right font-semibold text-gray-700 tabular-nums">{fmtInt(link.visitors)}</dd>
          <dt className="text-gray-400">가입</dt>
          <dd className="text-right font-semibold text-gray-700 tabular-nums">{fmtInt(link.signups)}곳</dd>
          <dt className="text-gray-400">매출</dt>
          <dd className="text-right font-semibold text-gray-700 tabular-nums">{link.revenue ? fmtKrw(link.revenue) : "-"}</dd>
          <dt className="text-gray-400">만든 날</dt>
          <dd className="text-right text-gray-600 tabular-nums">{fmtDateTime(link.createdAt)}</dd>
          {link.note && (
            <>
              <dt className="text-gray-400">메모</dt>
              <dd className="text-right text-gray-600 break-words">{link.note}</dd>
            </>
          )}
        </dl>
        <Link
          href={sessionsHref}
          prefetch={false}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-600 hover:underline"
        >
          이 링크 유입 방문 보기 <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
