"use client";

import { cn } from "@/lib/utils";
import type { HubFilters, HubStats, UpdateParams } from "./types";
import { UNASSIGNED_CLASS_ID } from "./types";

interface Kpi {
  key: string;
  label: string;
  value: number;
  /** Whether a non-zero value is an "issue" to surface with a red dot. */
  alert?: boolean;
  active: boolean;
  onClick: () => void;
}

/**
 * 운영 이상징후 칩 = 필터. 단일 source 는 URL(클릭 시 searchParam 드릴다운).
 */
export function HubKpiBar({
  stats,
  filters,
  updateParams,
  showBilling,
}: {
  stats: HubStats;
  filters: HubFilters;
  updateParams: UpdateParams;
  showBilling: boolean;
}) {
  const kpis: Kpi[] = [
    {
      key: "active",
      label: "재원",
      value: stats.activeStudents,
      active: filters.status === "ACTIVE" && !filters.classId && !filters.billing,
      onClick: () =>
        updateParams({
          status: filters.status === "ACTIVE" ? undefined : "ACTIVE",
          classId: undefined,
          billing: undefined,
          page: undefined,
        }),
    },
    {
      key: "unassigned",
      label: "미배정",
      value: stats.unassignedCount,
      alert: true,
      active: filters.classId === UNASSIGNED_CLASS_ID,
      onClick: () =>
        updateParams({
          classId:
            filters.classId === UNASSIGNED_CLASS_ID ? undefined : UNASSIGNED_CLASS_ID,
          billing: undefined,
          page: undefined,
        }),
    },
    ...(showBilling
      ? [
          {
            key: "unpaid",
            label: "미납·연체",
            value: stats.unpaidCount,
            alert: true,
            active: filters.billing === "unpaid",
            onClick: () =>
              updateParams({
                billing: filters.billing === "unpaid" ? undefined : "unpaid",
                classId: undefined,
                page: undefined,
              }),
          } satisfies Kpi,
        ]
      : []),
    {
      key: "paused",
      label: "휴원·대기",
      value: stats.pausedWaitingCount,
      active: filters.status === "PAUSED",
      onClick: () =>
        updateParams({
          status: filters.status === "PAUSED" ? undefined : "PAUSED",
          classId: undefined,
          billing: undefined,
          page: undefined,
        }),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {kpis.map((kpi) => {
        const showAlert = !!kpi.alert && kpi.value > 0;
        return (
          <button
            key={kpi.key}
            type="button"
            onClick={kpi.onClick}
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition",
              kpi.active
                ? "border-blue-300 bg-blue-50"
                : "border-[#E5E8EB] bg-white hover:border-[#D1D6DB] hover:bg-[#F7F8FA]",
            )}
          >
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#6B7684]">
                {showAlert && (
                  <span className="size-1.5 rounded-full bg-[#F04452]" aria-hidden />
                )}
                {kpi.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-black tabular-nums",
                  kpi.value === 0
                    ? "text-[#C4CAD0]"
                    : showAlert
                      ? "text-[#191F28]"
                      : "text-[#191F28]",
                )}
              >
                {kpi.value.toLocaleString()}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
