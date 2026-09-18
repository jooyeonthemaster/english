"use client";

// 기기·OS·브라우저·인앱·화면·언어 분해. 행 클릭 = 필터(device, os, browser, inApp).
// 화면·언어는 공용 필터 키가 없어 표시만 한다.
// 인앱 표는 inApp=NULL(일반 브라우저) 행을 제외하고, 카드 설명에 분모(전체 방문)를 명시한다.

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { deviceLabel, inAppLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { BreakdownTable } from "../shared/breakdown-table";
import { ReportEmpty } from "../shared/report-states";
import { Section } from "../shared/section";
import { pctOf } from "./audience-utils";

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#2563eb",
  desktop: "#0f766e",
  tablet: "#7c3aed",
};
const UNKNOWN_COLOR = "#cbd5e1";

/** NULL 값 → 필터값 "(none)" */
const orNone = (v: string | null) => v ?? "(none)";

function share(n: number, total: number) {
  return <span className="text-gray-400">{fmtPct(pctOf(n, total))}</span>;
}

type DeviceRow = AudienceReport["devices"][number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeviceTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as DeviceRow | undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">{deviceLabel(row.deviceType)}</p>
      <p className="mt-0.5 text-[12px] tabular-nums text-gray-500">
        {fmtInt(row.sessions)}방문 · {fmtPct(pctOf(row.sessions, total))}
      </p>
    </div>
  );
}

function DeviceSection({ devices }: { devices: AudienceReport["devices"] }) {
  const total = devices.reduce((s, r) => s + r.sessions, 0);
  const colorOf = (r: DeviceRow) => (r.deviceType ? (DEVICE_COLORS[r.deviceType] ?? UNKNOWN_COLOR) : UNKNOWN_COLOR);
  return (
    <Section title="기기" description="방문 기준 · 행 클릭 = 필터">
      {total === 0 ? (
        <ReportEmpty />
      ) : (
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start xl:flex-col xl:items-center 2xl:flex-row 2xl:items-start">
          {/* 고정 크기 도넛 — ResponsiveContainer 는 모바일 전역 CSS(.recharts-wrapper max-width:100%)에서 0 폭으로 접힌다 */}
          <div className="relative size-[140px] shrink-0">
            <PieChart width={140} height={140}>
              <Pie
                data={devices}
                dataKey="sessions"
                nameKey="deviceType"
                innerRadius={44}
                outerRadius={66}
                paddingAngle={2}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {devices.map((r) => (
                  <Cell key={orNone(r.deviceType)} fill={colorOf(r)} />
                ))}
              </Pie>
              <Tooltip content={<DeviceTooltip total={total} />} />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[18px] font-bold leading-none text-gray-800 tabular-nums">{fmtInt(total)}</span>
              <span className="mt-1 text-[11px] text-gray-400">방문</span>
            </div>
          </div>
          <div className="w-full min-w-0 flex-1">
            <BreakdownTable
              rows={devices}
              rowKey={(r) => orNone(r.deviceType)}
              labelHeader="기기"
              label={(r) => (
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: colorOf(r) }} aria-hidden />
                  {deviceLabel(r.deviceType)}
                </span>
              )}
              barValue={(r) => r.sessions}
              columns={[
                { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors) },
                { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
                { key: "p", label: "비중", render: (r) => share(r.sessions, total) },
              ]}
              filterKey="device"
              filterValue={(r) => orNone(r.deviceType)}
            />
          </div>
        </div>
      )}
    </Section>
  );
}

/** 방문 수만 있는 단일 차원 표 */
function SimpleTable<Row extends { sessions: number }>({
  rows,
  labelHeader,
  valueOf,
  labelOf,
  filterKey,
  emptyMessage,
}: {
  rows: Row[];
  labelHeader: string;
  valueOf: (r: Row) => string | null;
  labelOf: (v: string | null) => string;
  filterKey?: "os" | "browser" | "inApp";
  emptyMessage?: string;
}) {
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  return (
    <BreakdownTable
      rows={rows}
      rowKey={(r) => orNone(valueOf(r))}
      labelHeader={labelHeader}
      label={(r) => labelOf(valueOf(r))}
      barValue={(r) => r.sessions}
      columns={[
        { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
        { key: "p", label: "비중", render: (r) => share(r.sessions, total) },
      ]}
      filterKey={filterKey}
      filterValue={filterKey ? (r) => orNone(valueOf(r)) : undefined}
      emptyMessage={emptyMessage}
    />
  );
}

const plain = (v: string | null) => v ?? "미상";

/** 수집기는 인앱 브라우저를 "인앱:<앱>" 으로 저장한다 → "인앱 · 카카오톡" */
function browserLabel(v: string | null): string {
  if (!v) return "미상";
  return v.startsWith("인앱:") ? `인앱 · ${inAppLabel(v.slice(3))}` : v;
}

export function TechSections({ data }: { data: AudienceReport }) {
  // 인앱 표에서 inApp=NULL(= 일반 브라우저) 행을 뺀다 — 넣으면 「인앱 브라우저」 섹션의 1위가
  // 인앱이 아닌 일반 브라우저가 되어 막대·비중이 전부 그쪽으로 쏠린다. 비중 분모도 인앱 합계로.
  const inAppRows = data.inApps.filter((r) => r.inApp !== null);
  const inAppSessions = inAppRows.reduce((s, r) => s + r.sessions, 0);
  const allSessions = data.inApps.reduce((s, r) => s + r.sessions, 0);
  const inAppDesc =
    inAppSessions > 0
      ? `카카오톡·인스타그램 등 앱 안에서 연 방문 ${fmtInt(inAppSessions)} · 전체 방문의 ${fmtPct(
          pctOf(inAppSessions, allSessions),
        )} (비중은 인앱 방문 기준)`
      : "카카오톡·인스타그램 등 앱 안에서 연 방문 — 이 조건에서는 0";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DeviceSection devices={data.devices} />
        <Section title="인앱 브라우저" description={inAppDesc}>
          <SimpleTable
            rows={inAppRows}
            labelHeader="앱"
            valueOf={(r) => r.inApp}
            labelOf={inAppLabel}
            filterKey="inApp"
            emptyMessage="앱 안에서 연 방문이 없습니다."
          />
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="운영체제">
          <SimpleTable rows={data.os} labelHeader="OS" valueOf={(r) => r.os} labelOf={plain} filterKey="os" />
        </Section>
        <Section title="브라우저">
          <SimpleTable rows={data.browsers} labelHeader="브라우저" valueOf={(r) => r.browser} labelOf={browserLabel} filterKey="browser" />
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="화면 크기" description="CSS 픽셀 가로×세로">
          <SimpleTable rows={data.screens} labelHeader="화면" valueOf={(r) => r.screen} labelOf={(v) => (v ? v.replace("x", "×") : "미상")} />
        </Section>
        <Section title="언어" description="브라우저 언어 설정">
          <SimpleTable rows={data.languages} labelHeader="언어" valueOf={(r) => r.language} labelOf={plain} />
        </Section>
      </div>
    </div>
  );
}
