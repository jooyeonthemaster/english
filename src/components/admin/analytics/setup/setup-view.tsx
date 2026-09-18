"use client";

// 유입 분석 — 픽셀·검색엔진(설정). 기간·필터와 무관한 점검 화면이라 기간 선택 툴바는 두지 않는다.
// 다만 다른 탭에서 건 필터는 URL 에 그대로 남아 있으므로, 여기서도 칩으로 보여주고
// 「이 화면에는 적용되지 않습니다」를 명시한다(칩이 사라지면 필터가 풀린 줄 안다).
// 섹션 순서: ① 수집기 상태 ② 픽셀·태그 ③ 검색엔진·사이트맵 ④ 개인정보 고지 체크.

import { X } from "lucide-react";
import { PixelSettingsPanel } from "@/components/admin/analytics/setup/pixel-settings-panel";
import { FILTER_KEY_LABELS, filterValueLabel } from "../shared/filter-labels";
import { FILTER_KEYS, useAnalyticsParams } from "../shared/use-analytics-params";
import { CollectorHealthPanel } from "./collector-health-panel";
import { PrivacyNoticePanel } from "./privacy-notice-panel";
import { SearchEnginePanel } from "./search-engine-panel";

const SECTIONS = [
  { id: "setup-collector", label: "수집기 상태" },
  { id: "setup-pixels", label: "픽셀·태그" },
  { id: "setup-search", label: "검색엔진·사이트맵" },
  { id: "setup-privacy", label: "개인정보 고지" },
] as const;

export function SetupView() {
  return (
    <div className="space-y-5">
      <nav aria-label="설정 섹션" className="flex flex-wrap items-center gap-1.5">
        {SECTIONS.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-100 bg-white px-2.5 text-[12px] font-semibold text-gray-500 hover:border-blue-200 hover:text-blue-700"
          >
            <span className="tabular-nums text-gray-300">{i + 1}</span>
            {s.label}
          </a>
        ))}
        <span className="ml-auto text-[11.5px] text-gray-400">기간·필터와 무관한 점검 화면</span>
      </nav>

      <InactiveFilterChips />

      <div id="setup-collector" className="scroll-mt-20">
        <CollectorHealthPanel />
      </div>
      <div id="setup-pixels" className="scroll-mt-20">
        <PixelSettingsPanel />
      </div>
      <div id="setup-search" className="scroll-mt-20">
        <SearchEnginePanel />
      </div>
      <div id="setup-privacy" className="scroll-mt-20">
        <PrivacyNoticePanel />
      </div>
    </div>
  );
}

/** 다른 탭에서 건 필터를 여기서도 보여준다 — 값은 그대로 유지되지만 이 화면 수치에는 쓰이지 않는다. */
function InactiveFilterChips() {
  const { filters, update } = useAnalyticsParams();
  const active = FILTER_KEYS.filter((k) => !!filters[k]);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
      <span className="text-[11px] font-semibold text-gray-400">필터</span>
      {active.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => update({ [k]: null })}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-[12px] font-semibold text-gray-500 hover:border-blue-200 hover:text-blue-700"
          title="필터 해제"
        >
          <span className="text-gray-400">{FILTER_KEY_LABELS[k]}</span>
          {filterValueLabel(k, filters[k]!, filters)}
          <X className="size-3" aria-hidden />
        </button>
      ))}
      <span className="text-[11.5px] text-gray-400">이 화면에는 적용되지 않습니다 · 다른 탭에서는 계속 걸려 있습니다</span>
      <button
        type="button"
        onClick={() => update(Object.fromEntries(active.map((k) => [k, null])))}
        className="h-7 rounded-full px-2 text-[12px] text-gray-400 hover:text-gray-700"
      >
        전체 해제
      </button>
    </div>
  );
}
