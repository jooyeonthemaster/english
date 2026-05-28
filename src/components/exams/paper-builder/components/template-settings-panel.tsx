import * as React from "react";
import NextImage from "next/image";
import { ChevronDown, ChevronUp, Columns2, FileText, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAPER_SIZE_SPECS } from "../constants";
import { TEMPLATE_META } from "../templates";
import type { Density, PaperSize, PaperTemplate, PassageStyle } from "../types";

interface TemplateSettingsPanelProps {
  template: PaperTemplate;
  setTemplate: (template: PaperTemplate) => void;
  academyLogoDataUrl: string | null;
  setAcademyLogoDataUrl: (url: string | null) => void;
  onLogoUpload: (file: File | null) => void;
  paperSize: PaperSize;
  setPaperSize: (size: PaperSize) => void;
  columns: 1 | 2;
  setColumns: (columns: 1 | 2) => void;
  density: Density;
  setDensity: (density: Density) => void;
  passageStyle: PassageStyle;
  setPassageStyle: (style: PassageStyle) => void;
  showPassageTitle: boolean;
  setShowPassageTitle: (value: boolean) => void;
  showQuestionMeta: boolean;
  setShowQuestionMeta: (value: boolean) => void;
  markDirty: () => void;
  onClosePanel?: () => void;
  onPointerDownHeader?: (event: React.PointerEvent<HTMLElement>) => void;
  variant?: "floating" | "sidebar";
}

const DESIGN_TEMPLATE_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.designTemplateCollapsed.v1";

function readStoredDesignTemplateCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DESIGN_TEMPLATE_COLLAPSED_STORAGE_KEY) === "true";
}

export function TemplateSettingsPanel({
  template,
  setTemplate,
  academyLogoDataUrl,
  setAcademyLogoDataUrl,
  onLogoUpload,
  paperSize,
  setPaperSize,
  columns,
  setColumns,
  density,
  setDensity,
  passageStyle,
  setPassageStyle,
  showPassageTitle,
  setShowPassageTitle,
  showQuestionMeta,
  setShowQuestionMeta,
  markDirty,
  onClosePanel,
  onPointerDownHeader,
  variant = "floating",
}: TemplateSettingsPanelProps) {
  const floating = variant === "floating";
  const [designTemplatesCollapsed, setDesignTemplatesCollapsed] = React.useState(
    readStoredDesignTemplateCollapsed,
  );

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        DESIGN_TEMPLATE_COLLAPSED_STORAGE_KEY,
        String(designTemplatesCollapsed),
      );
    } catch {
      // Collapsed state is only a convenience preference.
    }
  }, [designTemplatesCollapsed]);

  return (
    <div className="space-y-4">
      <div
        onPointerDown={floating ? onPointerDownHeader : undefined}
        className={cn(
          "flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2",
          floating && "touch-none cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg text-left">
          <span className="min-w-0">
            <span className="block text-[13px] font-black text-slate-800">템플릿 설정</span>
            {floating && (
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">
                상단을 잡고 옮기면서 시험지 형식을 조정합니다.
              </span>
            )}
          </span>
        </div>
        {floating && onClosePanel && (
          <button
            type="button"
            data-template-floating-drag-ignore="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClosePanel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            title="템플릿 패널 닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDesignTemplatesCollapsed((current) => !current)}
          aria-expanded={!designTemplatesCollapsed}
          className="mb-2 flex h-8 w-full items-center justify-between rounded-lg text-left transition-colors hover:bg-slate-50"
          title={`디자인 템플릿 ${designTemplatesCollapsed ? "펼치기" : "접기"}`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            디자인 템플릿
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
            {designTemplatesCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
        {!designTemplatesCollapsed && (
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TEMPLATE_META) as PaperTemplate[]).map((id) => (
              <button
                key={id}
                onClick={() => { setTemplate(id); markDirty(); }}
                className={cn(
                  "min-h-[86px] rounded-xl border p-2.5 text-left transition-all",
                  template === id ? `${TEMPLATE_META[id].accent} shadow-sm` : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <span className={cn("mb-2 block h-2.5 w-14 rounded-full bg-gradient-to-r", TEMPLATE_META[id].swatch)} />
                <p className="text-[12px] font-bold">{TEMPLATE_META[id].label}</p>
                <p className="mt-1 text-[10px] leading-relaxed opacity-80">{TEMPLATE_META[id].description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">학원 로고</p>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {academyLogoDataUrl ? (
                <NextImage
                  src={academyLogoDataUrl}
                  alt="학원 로고 미리보기"
                  width={56}
                  height={56}
                  unoptimized
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <ImagePlus className="h-5 w-5 text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100">
                <ImagePlus className="h-3.5 w-3.5" />
                로고 넣기
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    onLogoUpload(event.target.files?.[0] || null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">PNG/JPG 권장, 1.5MB 이하</p>
            </div>
            {academyLogoDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setAcademyLogoDataUrl(null);
                  markDirty();
                }}
                className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">용지 크기</p>
          <div className="grid grid-cols-2 gap-2">
            {(["A4", "B4"] as const).map((value) => (
              <button
                key={value}
                onClick={() => {
                  setPaperSize(value);
                  markDirty();
                }}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold",
                  paperSize === value
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500",
                )}
                title={`${PAPER_SIZE_SPECS[value].widthMm} x ${PAPER_SIZE_SPECS[value].heightMm}mm`}
              >
                <FileText className="h-3.5 w-3.5" />
                {PAPER_SIZE_SPECS[value].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">단 구성</p>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                onClick={() => { setColumns(value); markDirty(); }}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold",
                  columns === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
                )}
              >
                <Columns2 className="h-3.5 w-3.5" />
                {value}단
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">밀도</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["comfortable", "표준"],
              ["compact", "압축"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => { setDensity(value); markDirty(); }}
                className={cn(
                  "h-9 rounded-lg border text-[12px] font-bold",
                  density === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">지문 스타일</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["boxed", "박스"],
            ["plain", "본문"],
            ["underlined", "밑줄"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setPassageStyle(value); markDirty(); }}
              className={cn(
                "h-9 rounded-lg border text-[12px] font-bold",
                passageStyle === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">표시 옵션</p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { checked: showPassageTitle, set: setShowPassageTitle, label: "지문 제목" },
            { checked: showQuestionMeta, set: setShowQuestionMeta, label: "문항 메타" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.set(!item.checked); markDirty(); }}
              className={cn(
                "flex h-9 items-center justify-between rounded-lg border px-3 text-[12px] font-bold",
                item.checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
              )}
            >
              {item.label}
              <span className={cn("h-2 w-2 rounded-full", item.checked ? "bg-blue-500" : "bg-slate-300")} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
