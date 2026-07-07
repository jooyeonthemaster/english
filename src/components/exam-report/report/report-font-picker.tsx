"use client";

// ============================================================================
// 학생 시험 리포트 — 문서 타이포그래피 피커 (제목/본문 2슬롯)
//
// 웹툰 폰트 피커 패턴 미러(webtoon-font-picker): 트리거 = 현재 폰트 실렌더,
// 드롭다운 = REPORT_FONT_FAMILIES(12종) in-face 미리보기 "시험 분석 리포트 Aa".
// 드롭다운이 열리는 순간에만 injectReportFontPreviewCss 로 서브셋 CSS 주입
// (문서 렌더 경로는 report-document 의 ensureReportFonts 가 담당 — 여기선 금지).
//
// 선택은 doc.typography 오버라이드로 저장(onDocChange → 디바운스 저장).
// 오버라이드가 없으면 테마 기본 페어링을 표시하고 "테마 기본" 칩을 붙인다.
// "테마 기본값" 리셋 = typography 제거(재생성 보존 의미론과 동일하게 문서 단위).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type {
  ReportTypography,
  StudentReportDoc,
} from "@/lib/exam-report/report-schema";
import { resolveReportTheme } from "./report-themes";
import {
  REPORT_FONT_FAMILIES,
  injectReportFontPreviewCss,
  reportFontStack,
  type ReportFontOption,
} from "./report-fonts";
import { cn } from "@/lib/utils";

interface ReportFontPickerProps {
  doc: StudentReportDoc;
  onDocChange: (next: StudentReportDoc) => void;
  disabled?: boolean;
}

/** 리포트 문서의 성격이 그대로 보이는 미리보기 문장 */
const PREVIEW_TEXT = "시험 분석 리포트 Aa";

function optionOf(family: string): ReportFontOption | undefined {
  return REPORT_FONT_FAMILIES.find((f) => f.family === family);
}

/** 카탈로그에 있으면 한글 라벨, 없으면(이론상 테마 기본 한정) family 원문 */
function labelOf(family: string): string {
  return optionOf(family)?.label ?? family;
}

export function ReportFontPicker({ doc, onDocChange, disabled }: ReportFontPickerProps) {
  const theme = resolveReportTheme(doc.themeId);
  const headingOverride = doc.typography?.headingFamily;
  const bodyOverride = doc.typography?.bodyFamily;
  const hasOverride = Boolean(headingOverride || bodyOverride);

  const setSlot = (
    slot: keyof ReportTypography,
    family: string | undefined,
  ) => {
    const next: ReportTypography = { ...doc.typography, [slot]: family };
    // 두 슬롯 모두 비면 typography 자체를 제거 — 테마 기본 페어링으로 복귀.
    const cleaned = next.headingFamily || next.bodyFamily ? next : undefined;
    onDocChange({ ...doc, typography: cleaned });
  };

  return (
    <div className="space-y-2">
      <FontSlot
        slotLabel="제목"
        value={headingOverride ?? theme.headingFamily}
        isThemeDefault={!headingOverride}
        accent={theme.primary}
        disabled={disabled}
        onPick={(family) => setSlot("headingFamily", family)}
      />
      <FontSlot
        slotLabel="본문"
        value={bodyOverride ?? theme.bodyFamily}
        isThemeDefault={!bodyOverride}
        accent={theme.primary}
        disabled={disabled}
        onPick={(family) => setSlot("bodyFamily", family)}
      />
      {hasOverride && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDocChange({ ...doc, typography: undefined })}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className="h-3 w-3" />
          테마 기본값으로 되돌리기
        </button>
      )}
    </div>
  );
}

function FontSlot({
  slotLabel,
  value,
  isThemeDefault,
  accent,
  disabled,
  onPick,
}: {
  slotLabel: string;
  value: string;
  isThemeDefault: boolean;
  /** 선택 상태 액센트 — 현재 테마의 primary(테마 피커와 동일한 선택 언어) */
  accent: string;
  disabled?: boolean;
  onPick: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 열릴 때만 12종 서브셋 CSS 주입 — in-face 미리보기 성립.
  useEffect(() => {
    if (open) injectReportFontPreviewCss();
  }, [open]);

  // 바깥 클릭·Escape 로 닫기(웹툰 피커 패턴 + 키보드 정밀화).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sans = REPORT_FONT_FAMILIES.filter((f) => f.category === "sans");
  const serif = REPORT_FONT_FAMILIES.filter((f) => f.category === "serif");

  const renderItem = (f: ReportFontOption) => {
    const selected = f.family === value;
    return (
      <button
        key={f.family}
        type="button"
        aria-pressed={selected}
        onClick={() => {
          onPick(f.family);
          setOpen(false);
        }}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left transition",
          !selected && "hover:bg-slate-100",
        )}
        // 선택 링 = 현재 테마 primary — "선택 = 컨셉 채택"(테마 카드와 동일 언어).
        style={
          selected
            ? {
                boxShadow: `inset 0 0 0 1px ${accent}`,
                background: `color-mix(in srgb, ${accent} 7%, transparent)`,
              }
            : undefined
        }
      >
        <span
          className="text-[14px] leading-tight text-slate-800"
          style={{ fontFamily: reportFontStack(f.family) }}
        >
          {PREVIEW_TEXT}
        </span>
        <span className="text-[10px] text-slate-400">
          {f.label} · {f.vibe}
        </span>
      </button>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="w-7 shrink-0 text-[11px] font-medium text-slate-400">
          {slotLabel}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[13px] text-slate-800"
          style={{ fontFamily: reportFontStack(value) }}
        >
          {labelOf(value)}
        </span>
        {isThemeDefault && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            테마 기본
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <GroupHeader>고딕</GroupHeader>
          {sans.map(renderItem)}
          <div className="my-1 h-px bg-slate-100" />
          <GroupHeader>명조</GroupHeader>
          {serif.map(renderItem)}
        </div>
      )}
    </div>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </div>
  );
}
