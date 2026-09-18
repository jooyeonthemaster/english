"use client";

// 대시보드 「유입 실시간」 미니카드 — GET /api/admin/analytics/overview?range=today.
// 자체 타이머(폴링)를 두지 않고 페이지 자동새로고침(dashboard-auto-refresh, 10분 router.refresh)에
// 편승한다: 서버가 새로 렌더할 때마다 바뀌는 refreshKey(generatedAt)가 달라질 때만 refetch 한다.
// (스펙 §10 「60초 폴링 없이 페이지 자동새로고침에 편승」 — 탭 하나에 1,260 쿼리/시간이 붙던 것을 없앴다)
// 계약: docs/analytics/analytics-spec.md §5(실시간 = 비내부 세션 lastSeenAt 5분), §10
//
// 이전 응답이 남아 있어도 갱신에 실패하면 「HH:MM 기준 · 갱신 실패」를 띄운다
// — 현재형 라벨(「유입 · 오늘」)과 초록 ping 으로 몇 시간 전 숫자를 지금 값처럼 보여주면 안 된다.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Radio } from "lucide-react";
import type { OverviewReport } from "@/lib/analytics/reports/overview";
import { channelLabel } from "@/lib/analytics/channels";
import { fmtInt } from "@/lib/analytics/format";

const OVERVIEW_TODAY_URL = "/api/admin/analytics/overview?range=today";

const KST_HHMM = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function fetchOverviewToday(): Promise<OverviewReport> {
  const res = await fetch(OVERVIEW_TODAY_URL, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`overview ${res.status}`);
  return (await res.json()) as OverviewReport;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] font-medium text-gray-400">{label}</div>
      <div className="mt-1 text-[20px] font-bold leading-none tracking-tight text-gray-900 tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-gray-400">{hint}</div>}
    </div>
  );
}

export function AnalyticsLiveCard({ refreshKey }: { refreshKey: string }) {
  // 키는 고정한다 — 갱신에 실패해도 마지막 성공값을 잃지 않아야 「N시 기준 · 갱신 실패」를 띄울 수 있다.
  const { data, isPending, isError, dataUpdatedAt, refetch } = useQuery<OverviewReport, Error>({
    queryKey: ["admin-dashboard", "analytics-live"],
    queryFn: fetchOverviewToday,
    // 자체 주기는 없다. 다시 부르는 때는 ① 마운트 ② refreshKey 변경(아래 effect) 둘뿐이다.
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });

  // 자체 타이머 없이, 서버 컴포넌트가 다시 렌더될 때(10분 자동 새로고침)만 다시 부른다
  const seenKey = useRef(refreshKey);
  useEffect(() => {
    if (seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    void refetch();
  }, [refreshKey, refetch]);

  const stale = isError && !!data?.current;
  const header = (
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400">
      <Radio className="size-3.5 text-blue-500" strokeWidth={1.9} />
      유입 · 오늘
    </div>
  );
  const openLink = (
    <Link
      href="/admin/analytics"
      className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline"
    >
      유입 분석 열기 <ArrowRight className="size-3" />
    </Link>
  );

  // 오류·테이블 없음·응답 형태 불일치 → 조용한 대체 문구
  if (!isPending && !data?.current) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-100 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {header}
          <span className="text-[12.5px] text-gray-400">유입 분석 준비 중</span>
        </div>
        {openLink}
      </div>
    );
  }

  const topChannels = (data?.topChannels ?? []).slice(0, 3);
  const live = !isPending && !stale && (data?.activeNow ?? 0) > 0;
  const signupsTracked = data?.current.signupsTracked ?? 0;
  const signupsTotal = data?.current.signupsTotal ?? 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {header}
          {stale && (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {dataUpdatedAt ? `${KST_HHMM.format(new Date(dataUpdatedAt))} 기준 · ` : ""}갱신 실패
            </span>
          )}
        </div>
        {openLink}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[auto_auto_auto_auto_1fr] md:items-start md:gap-7">
        {/* 640~767px 구간에서 임의값 grid(grid-cols-[…])가 globals.css 의 큰글씨 모드 규칙에
            1열로 뭉개진다 → 임의값 grid 는 md(768px)부터만 켜고, 그 아래는 평범한 2/4열로 간다 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:contents">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-400">
              <span className="relative flex size-2">
                {live && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${
                    live ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                />
              </span>
              지금 접속
            </div>
            <div className="mt-1 text-[20px] font-bold leading-none tracking-tight text-gray-900 tabular-nums">
              {isPending ? "–" : `${fmtInt(data?.activeNow)}명`}
            </div>
          </div>
          <Metric
            label="오늘 방문자"
            value={isPending ? "–" : fmtInt(data?.current.visitors)}
          />
          <Metric
            label="페이지뷰"
            value={isPending ? "–" : fmtInt(data?.current.pageviews)}
          />
          <Metric
            label="오늘 가입 귀속"
            value={isPending ? "–" : `${fmtInt(signupsTracked)}/${fmtInt(signupsTotal)}곳`}
            hint={isPending ? undefined : "유입 경로를 아는 가입 / 전체 가입"}
          />
        </div>
        <div className="min-w-0">
          <div className="text-[11.5px] font-medium text-gray-400 md:text-right">
            상위 유입 채널 · 방문
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 md:justify-end">
            {isPending ? (
              <span className="text-[12px] text-gray-300">불러오는 중…</span>
            ) : topChannels.length === 0 ? (
              <span className="text-[12px] text-gray-400">오늘 방문 없음</span>
            ) : (
              topChannels.map((c) => (
                <span
                  key={c.channel}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[12px] text-blue-700"
                >
                  {channelLabel(c.channel)}
                  <span className="font-semibold tabular-nums">{fmtInt(c.sessions)}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
