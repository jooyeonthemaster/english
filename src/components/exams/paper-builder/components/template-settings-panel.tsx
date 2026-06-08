import * as React from "react";
import NextImage from "next/image";
import {
  BookImage,
  ChevronDown,
  ChevronUp,
  Columns2,
  FileText,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PAPER_SIZE_SPECS } from "../constants";
import {
  clearSavedTemplateSettings,
  DEFAULT_TEMPLATE_SETTINGS,
  readSavedTemplateSettings,
  type SavedTemplateSettings,
  writeSavedTemplateSettings,
} from "../saved-template-settings";
import { TEMPLATE_META } from "../templates";
import {
  PAPER_COVER_TEMPLATE_LABELS,
  type Density,
  type PaperCover,
  type PaperCoverTemplate,
  type PaperSize,
  type PaperTemplate,
  type PassageStyle,
} from "../types";

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
  cover: PaperCover;
  setCover: (patch: Partial<PaperCover>) => void;
  totalPoints: number;
  questionItemsCount: number;
  autoPointTotal: number | null;
  onChangeAutoPointTotal: (totalPoints: number | null) => boolean;
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
  cover,
  setCover,
  totalPoints,
  questionItemsCount,
  autoPointTotal,
  onChangeAutoPointTotal,
  markDirty,
  onClosePanel,
  onPointerDownHeader,
  variant = "floating",
}: TemplateSettingsPanelProps) {
  const floating = variant === "floating";
  const sidebar = variant === "sidebar";
  const [designTemplatesCollapsed, setDesignTemplatesCollapsed] = React.useState(
    readStoredDesignTemplateCollapsed,
  );
  const [coverCollapsed, setCoverCollapsed] = React.useState(false);
  const [logoDropActive, setLogoDropActive] = React.useState(false);
  const [savedSettingsAvailable, setSavedSettingsAvailable] = React.useState(
    () => Boolean(readSavedTemplateSettings()),
  );
  const [settingsNotice, setSettingsNotice] = React.useState("");
  const [targetTotalPoints, setTargetTotalPoints] = React.useState(
    () => String(autoPointTotal ?? (totalPoints || 100)),
  );
  const logoDragDepthRef = React.useRef(0);

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

  React.useEffect(() => {
    if (!settingsNotice) return;
    const timer = window.setTimeout(() => setSettingsNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [settingsNotice]);

  React.useEffect(() => {
    setTargetTotalPoints(String(autoPointTotal ?? (totalPoints || 100)));
  }, [autoPointTotal, totalPoints]);

  function getCurrentTemplateSettings(): SavedTemplateSettings {
    return {
      template,
      academyLogoDataUrl,
      paperSize,
      columns,
      density,
      passageStyle,
      showPassageTitle,
      showQuestionMeta,
      autoPointTotal,
      cover,
      savedAt: "",
    };
  }

  function applyTemplateSettings(settings: SavedTemplateSettings) {
    setTemplate(settings.template);
    setAcademyLogoDataUrl(settings.academyLogoDataUrl);
    setPaperSize(settings.paperSize);
    setColumns(settings.columns);
    setDensity(settings.density);
    setPassageStyle(settings.passageStyle);
    setShowPassageTitle(settings.showPassageTitle);
    setShowQuestionMeta(settings.showQuestionMeta);
    onChangeAutoPointTotal(settings.autoPointTotal);
    setCover(settings.cover);
  }

  function handleSaveTemplateSettings() {
    const saved = writeSavedTemplateSettings(getCurrentTemplateSettings());
    setSavedSettingsAvailable(saved);
    setSettingsNotice(saved ? "현재 설정을 저장했어요." : "저장하지 못했어요.");
  }

  function handleApplyTemplateSettings() {
    const savedSettings = readSavedTemplateSettings();
    if (!savedSettings) {
      setSavedSettingsAvailable(false);
      setSettingsNotice("저장된 설정이 없어요.");
      return;
    }

    applyTemplateSettings(savedSettings);
    setSavedSettingsAvailable(true);
    setSettingsNotice("저장된 설정을 적용했어요.");
    markDirty();
  }

  function handleResetTemplateSettings() {
    clearSavedTemplateSettings();
    applyTemplateSettings(DEFAULT_TEMPLATE_SETTINGS);
    setSavedSettingsAvailable(false);
    setSettingsNotice("기본값으로 되돌렸어요.");
    markDirty();
  }

  function handleApplyAutoPointTotal() {
    const nextTotal = Number(targetTotalPoints);
    if (!Number.isFinite(nextTotal) || nextTotal < 1) {
      setSettingsNotice("총점은 1점 이상이어야 해요.");
      return;
    }

    const normalizedTotal = Math.min(999, Math.max(1, Math.round(nextTotal)));
    setTargetTotalPoints(String(normalizedTotal));
    if (onChangeAutoPointTotal(normalizedTotal)) {
      setSettingsNotice("자동 배점을 적용했어요.");
    }
  }

  function handleDisableAutoPointTotal() {
    if (onChangeAutoPointTotal(null)) {
      setSettingsNotice("수동 배점으로 전환했어요.");
    }
  }

  function handleLogoDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current += 1;
    event.dataTransfer.dropEffect = "copy";
    setLogoDropActive(true);
  }

  function handleLogoDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleLogoDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current = Math.max(0, logoDragDepthRef.current - 1);
    if (logoDragDepthRef.current === 0) setLogoDropActive(false);
  }

  function handleLogoDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current = 0;
    setLogoDropActive(false);
    onLogoUpload(event.dataTransfer.files?.[0] || null);
  }

  return (
    <div className={cn(sidebar ? "space-y-3" : "space-y-4")}>
      {floating && (
        <div
          onPointerDown={onPointerDownHeader}
          className="flex touch-none cursor-grab items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 active:cursor-grabbing"
        >
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg text-left">
            <span className="min-w-0">
              <span className="block text-[13px] font-black text-slate-800">템플릿 설정</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">
                상단을 잡고 옮기면서 시험지 형식을 조정합니다.
              </span>
            </span>
          </div>
          {onClosePanel && (
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
      )}

      <div className={cn("grid grid-cols-3", sidebar ? "gap-2" : "gap-3")}>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">용지 크기</p>
          <div className={cn("grid grid-cols-2", sidebar ? "gap-1" : "gap-1.5")}>
            {(["A4", "B4"] as const).map((value) => (
              <button
                key={value}
                onClick={() => {
                  setPaperSize(value);
                  markDirty();
                }}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md border text-[12px] font-bold",
                  sidebar ? "h-8" : "h-9",
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
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">단 구성</p>
          <div className={cn("grid grid-cols-2", sidebar ? "gap-1" : "gap-1.5")}>
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                onClick={() => { setColumns(value); markDirty(); }}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md border text-[12px] font-bold",
                  sidebar ? "h-8" : "h-9",
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
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">밀도</p>
          <div className={cn("grid grid-cols-2", sidebar ? "gap-1" : "gap-1.5")}>
            {([
              ["comfortable", "표준"],
              ["compact", "압축"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => { setDensity(value); markDirty(); }}
                className={cn(
                  "rounded-md border text-[12px] font-bold",
                  sidebar ? "h-8" : "h-9",
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
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">배점 설정</p>
        <div className={cn("rounded-lg border border-slate-200 bg-slate-50/60", sidebar ? "p-2" : "p-3")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500">현재 총점</span>
            <span className="text-[11px] font-black text-slate-800">
              {totalPoints}점 · {questionItemsCount}문항
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={999}
              value={targetTotalPoints}
              onChange={(event) => setTargetTotalPoints(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleApplyAutoPointTotal();
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-black text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              aria-label="자동 배점 총점"
            />
            <button
              type="button"
              onClick={handleApplyAutoPointTotal}
              className="flex h-8 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              자동
            </button>
            <button
              type="button"
              disabled={autoPointTotal === null}
              onClick={handleDisableAutoPointTotal}
              className="flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              수동
            </button>
          </div>
          <p className="mt-1.5 text-[10px] font-semibold leading-snug text-slate-400">
            {autoPointTotal === null
              ? "총점을 입력하면 문항 수가 바뀔 때마다 배점을 다시 나눕니다."
              : `자동 배점 사용 중 · 목표 총점 ${autoPointTotal}점`}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">지문 스타일</p>
        <div className={cn("grid grid-cols-1", sidebar ? "gap-1.5" : "gap-2")}>
          {([
            ["plain", "본문"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setPassageStyle(value); markDirty(); }}
              className={cn(
                "rounded-md border text-[12px] font-bold",
                sidebar ? "h-8" : "h-9",
                passageStyle === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDesignTemplatesCollapsed((current) => !current)}
          aria-expanded={!designTemplatesCollapsed}
          className={cn(
            "flex w-full items-center justify-between rounded-lg text-left transition-colors hover:bg-slate-50",
            sidebar ? "mb-1.5 h-7" : "mb-2 h-8",
          )}
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
          <div className={cn("grid grid-cols-2", sidebar ? "gap-1.5" : "gap-2")}>
            {(Object.keys(TEMPLATE_META) as PaperTemplate[]).map((id) => (
              <button
                key={id}
                onClick={() => { setTemplate(id); markDirty(); }}
                className={cn(
                  "flex items-center rounded-lg border text-left transition-all",
                  sidebar ? "min-h-9 px-2.5 py-1.5" : "min-h-11 px-3 py-2",
                  template === id ? `${TEMPLATE_META[id].accent} shadow-sm` : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <p className={cn("text-[12px] font-black", TEMPLATE_META[id].titleClass)}>
                  {TEMPLATE_META[id].label}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">학원 로고</p>
        <div
          onDragEnter={handleLogoDragEnter}
          onDragOver={handleLogoDragOver}
          onDragLeave={handleLogoDragLeave}
          onDrop={handleLogoDrop}
          title="이미지 파일을 드래그해서 놓기"
          className={cn(
            "relative rounded-lg border bg-white transition-colors",
            sidebar ? "p-2" : "p-3",
            logoDropActive
              ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100"
              : "border-slate-200",
          )}
        >
          <div className={cn("flex items-center", sidebar ? "gap-2" : "gap-3")}>
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50 transition-colors",
                sidebar ? "h-12 w-12" : "h-14 w-14",
                logoDropActive ? "border-blue-300 bg-white" : "border-slate-200",
              )}
            >
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
              <label className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 text-[12px] font-bold text-blue-700 hover:bg-blue-100",
                sidebar ? "h-7 px-2.5" : "h-8 px-3",
              )}>
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
              <p className="mt-1 text-[10px] leading-snug text-slate-400">PNG/JPG 권장, 1.5MB 이하</p>
            </div>
            {academyLogoDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setAcademyLogoDataUrl(null);
                  markDirty();
                }}
                className={cn("rounded-md border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50", sidebar ? "h-7 px-2" : "h-8 px-2.5")}
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">표시 옵션</p>
        <div className={cn("grid grid-cols-1", sidebar ? "gap-1.5" : "gap-2")}>
          {[
            { checked: showPassageTitle, set: setShowPassageTitle, label: "지문 제목" },
            { checked: showQuestionMeta, set: setShowQuestionMeta, label: "문항 메타" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.set(!item.checked); markDirty(); }}
              className={cn(
                "flex items-center justify-between rounded-md border px-2.5 text-[12px] font-bold",
                sidebar ? "h-8" : "h-9 px-3",
                item.checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500",
              )}
            >
              {item.label}
              <span className={cn("h-2 w-2 rounded-full", item.checked ? "bg-blue-500" : "bg-slate-300")} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setCoverCollapsed((current) => !current)}
          aria-expanded={!coverCollapsed}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-t-xl px-3 transition-colors hover:bg-slate-50",
            sidebar ? "h-9" : "h-10",
            coverCollapsed && "rounded-b-xl",
          )}
          title={`표지 ${coverCollapsed ? "펼치기" : "접기"}`}
        >
          <span className="flex items-center gap-1.5">
            <BookImage className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              표지 (COVER)
            </span>
          </span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400">
            {coverCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
        {!coverCollapsed && (
          <div className="space-y-3 px-3 pb-3">
            <button
              type="button"
              onClick={() => {
                setCover({ enabled: !cover.enabled });
                markDirty();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2.5 text-[12px] font-bold transition-colors",
                sidebar ? "h-9" : "h-10",
                cover.enabled
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              <BookImage className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">표지 페이지 사용</span>
              <span className={cn("text-[10px]", cover.enabled ? "text-blue-600" : "text-slate-300")}>
                {cover.enabled ? "ON" : "OFF"}
              </span>
            </button>

            {!cover.enabled ? (
              <p className="text-[10.5px] leading-relaxed text-slate-400">
                켜면 첫 페이지에 표지가 생깁니다.{" "}
                <b className="text-slate-500">끄면 설정은 보존</b>돼요(페이지 번호에는
                미포함).
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    표지 디자인
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(PAPER_COVER_TEMPLATE_LABELS) as PaperCoverTemplate[]).map(
                      (id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setCover({ template: id });
                            markDirty();
                          }}
                          className={cn(
                            "rounded-md border text-[12px] font-bold",
                            sidebar ? "h-8" : "h-9",
                            cover.template === id
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50",
                          )}
                        >
                          {PAPER_COVER_TEMPLATE_LABELS[id]}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    {
                      id: "showLogo",
                      checked: cover.showLogo,
                      toggle: () => setCover({ showLogo: !cover.showLogo }),
                      label: "학원 로고 표시",
                    },
                    {
                      id: "showInfo",
                      checked: cover.showInfo,
                      toggle: () => setCover({ showInfo: !cover.showInfo }),
                      label: "학교·반·시험일 표시",
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        item.toggle();
                        markDirty();
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-2.5 text-[12px] font-bold",
                        sidebar ? "h-8" : "h-9 px-3",
                        item.checked
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-500",
                      )}
                    >
                      {item.label}
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          item.checked ? "bg-blue-500" : "bg-slate-300",
                        )}
                      />
                    </button>
                  ))}
                </div>

                <p className="text-[10.5px] leading-relaxed text-slate-400">
                  제목·부제·라벨은 미리보기의 표지에서 직접 클릭해 수정해요.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">저장된 설정</p>
          {settingsNotice && (
            <span className="truncate text-[10px] font-bold text-blue-600">
              {settingsNotice}
            </span>
          )}
        </div>
        <div className={cn("grid grid-cols-3", sidebar ? "gap-1" : "gap-1.5")}>
          <button
            type="button"
            onClick={handleSaveTemplateSettings}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 rounded-md border border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100",
              sidebar ? "h-8" : "h-9",
            )}
            title="현재 시험지 설정을 다음 생성 기본값으로 저장"
          >
            <Save className="h-3.5 w-3.5 shrink-0" />
            저장
          </button>
          <button
            type="button"
            onClick={handleApplyTemplateSettings}
            disabled={!savedSettingsAvailable}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 rounded-md border text-[11px] font-bold transition-colors",
              sidebar ? "h-8" : "h-9",
              savedSettingsAvailable
                ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300",
            )}
            title="저장된 시험지 설정 적용"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            적용
          </button>
          <button
            type="button"
            onClick={handleResetTemplateSettings}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700",
              sidebar ? "h-8" : "h-9",
            )}
            title="저장 설정을 지우고 기본값으로 전환"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            초기화
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
          저장하면 새 시험지 생성 시 이 설정으로 시작합니다.
        </p>
      </div>
    </div>
  );
}
