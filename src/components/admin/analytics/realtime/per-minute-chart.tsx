"use client";

// 실시간 — 최근 30분 분당 페이지뷰 막대(KST). 툴팁에 그 분에 이벤트 행을 남긴 세션 수
// (하트비트는 이벤트 행을 만들지 않아 「지금 접속 중」 수와 일치하지 않는다).
// ResponsiveContainer 대신 차트 자체 responsive 를 쓴다 — 모바일(≤767px) 전역 CSS
// `body.smoat-large-ui .recharts-wrapper{max-width:100%}` 가 ResponsiveContainer 의 폭 0 내부 래퍼에 걸려
// 차트가 폭 0 으로 접히기 때문(globals.css Mobile Responsiveness Safety Layer).

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { RealtimeReport } from "@/lib/analytics/reports/realtime";
import { fmtInt } from "@/lib/analytics/format";

type MinutePoint = RealtimeReport["perMinute"][number];

export function PerMinuteChart({ data, height = 240 }: { data: MinutePoint[]; height?: number }) {
  const lastKey = data[data.length - 1]?.key;
  return (
    <div className="w-full">
      <BarChart responsive data={data} style={{ width: "100%", height }} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
        <XAxis
          dataKey="key"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          // 최신 분(맨 오른쪽)에 반드시 라벨이 붙도록 — 고정 interval 은 끝 몇 분을 라벨 없이 남긴다
          interval="preserveEnd"
          minTickGap={24}
          dy={8}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} width={48} />
        <Tooltip
          cursor={{ fill: "rgba(37,99,235,0.06)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]?.payload as MinutePoint | undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                <p className="text-[12px] font-semibold text-gray-700">
                  {p.key}
                  {p.key === lastKey && <span className="ml-1 font-normal text-gray-400">(진행 중)</span>}
                </p>
                <p className="mt-1 text-[12px] text-gray-500">
                  페이지뷰 <span className="font-semibold text-blue-600">{fmtInt(p.pageviews)}</span>
                </p>
                {/* 하트비트는 이벤트 행을 만들지 않으므로 접속자 수와 다르다 — 이름으로 그 차이를 드러낸다 */}
                <p className="text-[12px] text-gray-400">
                  이벤트를 보낸 세션 <span className="font-semibold text-gray-600">{fmtInt(p.sessions)}</span>
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="pageviews" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </div>
  );
}
