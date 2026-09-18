"use client";

// 두 갈래 비율 바 — 신규 vs 재방문, 로그인 vs 비로그인.
// 로그인 쪽은 세그먼트·범례 클릭 = loggedIn 필터(yes|no).

import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty } from "../shared/report-states";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { pctOf } from "./audience-utils";

interface Part {
  key: string;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}

function SplitBar({ title, hint, parts }: { title: string; hint: string; parts: [Part, Part] }) {
  const total = parts[0].value + parts[1].value;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-[13px] font-semibold text-gray-700">{title}</p>
        <p className="text-[11.5px] text-gray-400">{hint}</p>
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg bg-gray-100">
        {parts.map((p) => {
          const share = pctOf(p.value, total);
          if (p.value <= 0) return null;
          const segClass = cn(
            "flex h-full min-w-[2px] items-center justify-center text-[11.5px] font-semibold text-white tabular-nums",
            p.onClick && "cursor-pointer hover:brightness-110",
            p.active && "ring-2 ring-inset ring-gray-900/40",
          );
          const segTitle = `${p.label} ${fmtInt(p.value)}방문 · ${fmtPct(share)}${p.onClick ? " — 클릭하면 필터" : ""}`;
          const segLabel = share >= 12 ? fmtPct(share, 0) : "";
          return p.onClick ? (
            <button
              key={p.key}
              type="button"
              onClick={p.onClick}
              title={segTitle}
              className={segClass}
              style={{ width: `${share}%`, background: p.color }}
            >
              {segLabel}
            </button>
          ) : (
            <div key={p.key} title={segTitle} className={segClass} style={{ width: `${share}%`, background: p.color }}>
              {segLabel}
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => {
          const body = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
              <span className="text-gray-600">{p.label}</span>
              <span className="font-semibold text-gray-800 tabular-nums">{fmtInt(p.value)}</span>
              <span className="text-gray-400 tabular-nums">{fmtPct(pctOf(p.value, total))}</span>
            </>
          );
          return (
            <li key={p.key} className="text-[12px]">
              {p.onClick ? (
                <button type="button" onClick={p.onClick} className="inline-flex items-center gap-1.5 hover:underline">
                  {body}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function VisitSplits({
  newVsReturning,
  loggedIn,
}: {
  newVsReturning: AudienceReport["newVsReturning"];
  loggedIn: AudienceReport["loggedIn"];
}) {
  const { filters, setFilter } = useAnalyticsParams();
  const total = newVsReturning.newSessions + newVsReturning.returningSessions;
  if (total === 0) return <ReportEmpty message="이 기간에 방문이 없습니다" />;

  return (
    <div className="space-y-6">
      <SplitBar
        title="신규 vs 재방문"
        hint="처음 온 브라우저의 방문 = 신규"
        parts={[
          { key: "new", label: "신규 방문", value: newVsReturning.newSessions, color: "#2563eb" },
          { key: "returning", label: "재방문", value: newVsReturning.returningSessions, color: "#0f766e" },
        ]}
      />
      <SplitBar
        title="로그인 vs 비로그인"
        hint="학원 계정에 연결된 방문 = 로그인"
        parts={[
          {
            key: "yes",
            label: "로그인",
            value: loggedIn.loggedInSessions,
            color: "#7c3aed",
            onClick: () => setFilter("loggedIn", "yes"),
            active: filters.loggedIn === "yes",
          },
          {
            key: "no",
            label: "비로그인",
            value: loggedIn.anonymousSessions,
            color: "#94a3b8",
            onClick: () => setFilter("loggedIn", "no"),
            active: filters.loggedIn === "no",
          },
        ]}
      />
    </div>
  );
}
