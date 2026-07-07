"use client";

// ============================================================================
// 학생 시험 리포트 — 테마 피커 v2 (6테마 = 6컨셉)
//
// 스와치·폰트 페어링 라벨·미니 프리뷰 전부 REPORT_THEME_META / REPORT_THEMES
// (실렌더 값)에서 파생한다 — 구 버전의 "근사 팔레트" 드리프트를 구조적으로 박멸.
// 미니 프리뷰는 리포트 한 장의 축소판: 지면(surface) 위에 제목 활자(가Aa) +
// KPI 숫자(12.3) + 진행 바 — 테마의 인격(팔레트+서체 페어링)이 한눈에 보인다.
// 실제 문서 적용은 report-document 가 doc.themeId 로 처리한다.
// ============================================================================

import { useEffect } from "react";
import { Check } from "lucide-react";
import type { ReportThemeId } from "@/lib/exam-report/report-schema";
import {
  REPORT_THEMES,
  REPORT_THEME_META,
  type ReportThemeMeta,
} from "./report-themes";
import { ensureReportFonts } from "./report-fonts";
import { cn } from "@/lib/utils";

interface ThemePickerProps {
  value: ReportThemeId;
  onChange: (themeId: ReportThemeId) => void;
  disabled?: boolean;
}

export function ThemePicker({ value, onChange, disabled }: ThemePickerProps) {
  // 미니 프리뷰 "가Aa 12.3" 이 실제 페어링 서체로 렌더되도록 테마 폰트 실로드.
  // (6테마 유니크 패밀리 수 종 — 프리뷰 글리프만 서브셋 다운로드되므로 가볍다.)
  useEffect(() => {
    void ensureReportFonts(
      REPORT_THEME_META.flatMap((m) => [m.headingFamily, m.bodyFamily]),
    );
  }, []);

  return (
    <div className="grid grid-cols-2 gap-2">
      {REPORT_THEME_META.map((meta) => (
        <ThemeCard
          key={meta.id}
          meta={meta}
          active={value === meta.id}
          disabled={disabled}
          onSelect={() => onChange(meta.id)}
        />
      ))}
    </div>
  );
}

function ThemeCard({
  meta,
  active,
  disabled,
  onSelect,
}: {
  meta: ReportThemeMeta;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const t = REPORT_THEMES[meta.id];
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      title={meta.description}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-transparent"
          : "border-slate-200 hover:border-slate-300",
      )}
      // 활성 링은 회색 계열 고정색이 아니라 그 테마의 primary — 선택 = 컨셉 채택.
      style={active ? { boxShadow: `0 0 0 2px ${t.primary}` } : undefined}
    >
      {/* 미니 프리뷰 — 테마의 지면·헤어라인·활자·액센트를 그대로 축소한 리포트 조각 */}
      <div
        aria-hidden
        className="w-full rounded-md border px-2.5 pb-2 pt-1.5"
        style={{ background: t.surface, borderColor: t.line }}
      >
        <div className="flex items-baseline justify-between gap-1">
          <span
            className="text-[15px] font-bold leading-tight"
            style={{ fontFamily: t.headingFont, color: t.primary }}
          >
            가Aa
          </span>
          <span
            className="text-[11px] font-semibold tabular-nums leading-tight"
            style={{ fontFamily: t.bodyFont, color: t.neutral }}
          >
            12.3
          </span>
        </div>
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
          style={{ background: t.tint }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "62%", background: t.primary }}
          />
        </div>
      </div>

      {/* 라벨 + 실팔레트 3스와치(primary / accentSoft / tint) */}
      <div className="flex items-center justify-between gap-1.5 px-0.5">
        <span className="truncate text-xs font-semibold text-slate-700">
          {meta.label}
        </span>
        <span className="flex shrink-0 items-center gap-1" aria-hidden>
          {meta.swatches.map((color, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
      </div>

      {/* 폰트 페어링 라벨 — 테마 인격의 절반은 서체다 */}
      <span className="truncate px-0.5 text-[10px] leading-tight text-slate-400">
        {meta.fontLabel}
      </span>

      {active && (
        <span
          className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
          style={{ background: t.primary }}
        >
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
