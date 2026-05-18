"use client";

import { cn } from "@/lib/utils";
import { DISTRICT_CAPACITY, SEOUL_DISTRICTS, getDistrict, CAMPAIGN_PLAN } from "./constants";
import type { Registration } from "./types";

interface DistrictGridProps {
  registrations: Registration[];
  districtFilter: string | null;
  onDistrictFilterChange: (d: string | null) => void;
}

export function DistrictGrid({
  registrations,
  districtFilter,
  onDistrictFilterChange,
}: DistrictGridProps) {
  // 구별 counts — only for campaign registrations
  const districtCounts = SEOUL_DISTRICTS.map((d) => {
    const count = registrations.filter(
      (r) => r.desiredPlan === CAMPAIGN_PLAN && getDistrict(r) === d,
    ).length;
    return { district: d, count };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-gray-900">서울 25개 구 분포</h3>
          <p className="text-[11.5px] text-gray-400 mt-0.5">
            각 구별 정원 {DISTRICT_CAPACITY}명 · 클릭하면 해당 구만 필터링됩니다.
          </p>
        </div>
        {districtFilter && (
          <button
            onClick={() => onDistrictFilterChange(null)}
            className="text-[11.5px] text-gray-500 hover:text-gray-900 px-2.5 py-1 rounded-md border border-gray-200"
          >
            필터 해제 · {districtFilter}
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {districtCounts.map((d) => {
          const pct = Math.min(100, Math.round((d.count / DISTRICT_CAPACITY) * 100));
          const active = districtFilter === d.district;
          return (
            <button
              key={d.district}
              onClick={() =>
                onDistrictFilterChange(active ? null : d.district)
              }
              className={cn(
                "text-left rounded-lg border p-2.5 transition-colors",
                active
                  ? "bg-[#EFF6FF] border-[#3B82F6]"
                  : "bg-white border-gray-100 hover:border-gray-300",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-bold text-gray-900">{d.district}</span>
                <span className="text-[10.5px] text-gray-400 font-mono">
                  {d.count}/{DISTRICT_CAPACITY}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct >= 100 ? "#0f172a" : "#3B82F6",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
