import { createPortal } from "react-dom";
import NextImage from "next/image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BookImage,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  RotateCcw,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  COVER_TEMPLATE_LABELS,
  coverTemplateIdSchema,
  type AnalysisReport,
  type CoverTemplateId,
  type ReportCover,
} from "@/lib/passage-report/analysis-report/schema";

import { CoverPreview } from "./cover-templates";
import {
  readSavedReportSettingsList,
  toggleDefaultReportSettings,
  writeSavedReportSettingsList,
  type SavedReportSettings,
} from "./editor-storage";
import { ToggleRow } from "./panel-primitives";

/**
 * 설정 템플릿 팝오버 — 학습자료 설정 헤더(닫기 X 버튼 왼쪽)의 저장 아이콘 버튼.
 * 클릭하면 현재 설정 저장 / 저장된 템플릿 골라 적용·삭제 / 현재 설정 초기화 기능이
 * 작은 팝오버로 펼쳐진다.
 */
export function SettingsTemplatePopover({
  onSave,
  onApply,
  onDelete,
  onReset,
}: {
  onSave: (name: string) => SavedReportSettings[];
  onApply: (entry: SavedReportSettings) => SavedReportSettings[];
  onDelete: (id: string) => SavedReportSettings[];
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedReportSettings[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  // 팝오버는 패널의 overflow-hidden 에 잘리지 않도록 body 로 포털 + fixed 배치한다.
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 버튼 위치 기준으로 팝오버 좌표(우측 정렬) 계산
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // 팝오버를 열 때마다 최신 목록을 다시 읽는다(다른 보고서에서 저장한 것 반영).
  useEffect(() => {
    if (open) setSavedTemplates(readSavedReportSettingsList());
  }, [open]);

  // 바깥 클릭 / ESC 로 닫기 (트리거 버튼·포털된 팝오버 둘 다 '안쪽'으로 친다)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleSave = () => {
    const next = onSave(templateName);
    setSavedTemplates(next);
    setTemplateName("");
    setNotice("현재 설정을 템플릿으로 저장했어요.");
  };

  // 손잡이 드래그로 템플릿 순서 변경 — 새 순서를 그대로 저장한다.
  const handleReorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setSavedTemplates((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      writeSavedReportSettingsList(next);
      return next;
    });
  };

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="설정 템플릿"
        aria-label="설정 템플릿"
        aria-expanded={open}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
          open
            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
        )}
      >
        <Save className="h-4 w-4" />
      </button>

      {open && coords
        ? createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: coords.top, right: coords.right }}
          className="z-[60] w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-[12px] font-black text-slate-800">설정 템플릿</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            지금의 <b className="text-slate-600">표지·로고·학원명·영어 원문·디자인</b> 설정을 이름을 붙여 저장해 두고, 나중에 골라서 적용할 수 있어요. <Star className="inline h-3 w-3 -mt-0.5 fill-amber-400 text-amber-500" /> 별표로 지정한 <b className="text-slate-600">기본 템플릿</b>은 새 보고서를 열 때 자동 적용돼요.
          </p>

          {/* 새 템플릿 저장 — 이름 입력 + 저장 */}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                handleSave();
              }}
              placeholder="템플릿 이름 (예: 기본형, A반용)"
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-700 placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 px-2.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Save className="h-3.5 w-3.5" /> 저장
            </button>
          </div>

          {/* 저장된 템플릿 목록 — 이름을 클릭하면 바로 적용 / 손잡이로 순서 변경 / 삭제 */}
          {savedTemplates.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-slate-200 px-2 py-2.5 text-center text-[10.5px] text-slate-400">
              저장된 템플릿이 아직 없어요.
            </p>
          ) : (
            <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {savedTemplates.map((tpl, index) => (
                <li
                  key={tpl.id}
                  onDragOver={(e) => {
                    if (dragIndexRef.current === null) return;
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndexRef.current !== null) handleReorder(dragIndexRef.current, index);
                    dragIndexRef.current = null;
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-1.5 py-1.5 transition-colors",
                    dragOverIndex === index ? "border-blue-300 bg-blue-50/60" : "border-slate-200",
                  )}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragIndexRef.current = index;
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null;
                      setDragOverIndex(null);
                    }}
                    title="드래그해서 순서 변경"
                    aria-label="순서 변경 손잡이"
                    className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = onApply(tpl);
                      setSavedTemplates(next);
                      setNotice(`'${tpl.name}' 템플릿을 적용하고 저장했어요.`);
                    }}
                    title={`'${tpl.name}' 적용`}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700"
                  >
                    <span className="min-w-0 truncate">{tpl.name}</span>
                    {tpl.isDefault ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-600">기본</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = toggleDefaultReportSettings(tpl.id);
                      setSavedTemplates(next);
                      const nowDefault = next.find((s) => s.id === tpl.id)?.isDefault;
                      setNotice(
                        nowDefault
                          ? `'${tpl.name}'을(를) 기본으로 지정했어요. 새 보고서에 자동 적용돼요.`
                          : "기본 템플릿 지정을 해제했어요.",
                      );
                    }}
                    title={tpl.isDefault ? "기본 지정 해제" : "기본 템플릿으로 지정 (새 보고서에 자동 적용)"}
                    aria-label={tpl.isDefault ? "기본 지정 해제" : "기본 템플릿으로 지정"}
                    aria-pressed={!!tpl.isDefault}
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                      tpl.isDefault
                        ? "border-amber-300 bg-amber-50 text-amber-500 hover:bg-amber-100"
                        : "border-slate-200 text-slate-300 hover:bg-slate-50 hover:text-amber-400",
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", tpl.isDefault && "fill-amber-400")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = onDelete(tpl.id);
                      setSavedTemplates(next);
                      setNotice(`'${tpl.name}' 템플릿을 삭제했어요.`);
                    }}
                    title="템플릿 삭제"
                    aria-label={`'${tpl.name}' 템플릿 삭제`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 현재 보고서 설정만 기본값으로 되돌림(저장된 템플릿은 유지) */}
          <button
            type="button"
            onClick={() => {
              onReset();
              setNotice("현재 설정을 기본값으로 되돌렸어요.");
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 현재 설정 초기화
          </button>

          {notice ? <p className="mt-1.5 text-[10.5px] font-semibold text-blue-500">{notice}</p> : null}
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function LogoPanel({
  cover,
  coverEnabled,
  error,
  onPatch,
  onLogoFile,
  brand,
  onBrand,
}: {
  cover: ReportCover | undefined;
  coverEnabled: boolean;
  error: string | null;
  onPatch: (patch: Partial<ReportCover>) => void;
  onLogoFile: (file?: File | null) => void;
  brand: string;
  onBrand: (value: string) => void;
}) {
  const logoAlign = cover?.logoAlign ?? "center";
  const [brandDraft, setBrandDraft] = useState(brand);
  useEffect(() => setBrandDraft(brand), [brand]);
  const [logoDropActive, setLogoDropActive] = useState(false);
  const logoDragDepthRef = useRef(0);

  const handleLogoDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current += 1;
    event.dataTransfer.dropEffect = "copy";
    setLogoDropActive(true);
  }, []);

  const handleLogoDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleLogoDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current = Math.max(0, logoDragDepthRef.current - 1);
    if (logoDragDepthRef.current === 0) setLogoDropActive(false);
  }, []);

  const handleLogoDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      logoDragDepthRef.current = 0;
      setLogoDropActive(false);
      onLogoFile(event.dataTransfer.files?.[0] || null);
    },
    [onLogoFile],
  );

  return (
    <div>
      <div className="mb-2.5">
        <label className="mb-1 block text-[11px] font-bold text-slate-500">학원명 (머리말·꼬리말)</label>
        <input
          type="text"
          value={brandDraft}
          onChange={(e) => setBrandDraft(e.target.value)}
          onBlur={() => {
            const v = brandDraft.trim();
            if (v && v !== brand) onBrand(v);
            else if (!v) setBrandDraft(brand);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="예: ENGLISH READING LAB"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <p className="mt-1 text-[10px] leading-snug text-slate-400">모든 페이지 머리말·꼬리말의 학원명이 한 번에 바뀌어요.</p>
      </div>
      <div
        onDragEnter={handleLogoDragEnter}
        onDragOver={handleLogoDragOver}
        onDragLeave={handleLogoDragLeave}
        onDrop={handleLogoDrop}
        title="이미지 파일을 드래그해서 놓기"
        className={cn(
          "relative rounded-lg border bg-white p-2 transition-colors",
          logoDropActive ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100" : "border-slate-200",
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50 transition-colors",
              logoDropActive ? "border-blue-300 bg-white" : "border-slate-200",
            )}
          >
            {cover?.logoDataUrl ? (
              <NextImage
                src={cover.logoDataUrl}
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
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100">
              <ImagePlus className="h-3.5 w-3.5" />
              로고 넣기
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  onLogoFile(event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">PNG/JPG 권장, 1.5MB 이하</p>
          </div>
          {cover?.logoDataUrl ? (
            <button
              type="button"
              onClick={() => onPatch({ logoDataUrl: undefined, logoX: undefined, logoY: undefined })}
              className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
            >
              삭제
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-1 text-[11px] text-red-500">{error}</p> : null}

      {cover?.logoDataUrl ? (
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="보고서에 로고 표시"
            on={cover.showLogo !== false}
            onClick={() => onPatch({ showLogo: cover.showLogo === false })}
            icon={cover.showLogo === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          />
          <div className="flex items-center gap-1.5">
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => onPatch({ logoAlign: a })}
                  title={`표지 로고 ${a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"} 정렬`}
                  className={`inline-flex h-7 flex-1 items-center justify-center rounded-md border ${
                    logoAlign === a ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">크기</span>
            <input
              type="range"
              min={6}
              max={60}
              value={cover.logoHeightMm ?? 14}
              onChange={(e) => onPatch({ logoHeightMm: Number(e.target.value) })}
              className="flex-1 accent-blue-600"
            />
            <span className="w-10 text-right text-[11px]">{Math.round(cover.logoHeightMm ?? 14)}mm</span>
          </div>
          {coverEnabled ? (
            <>
              <p className="text-[10.5px] text-slate-400">표지 위 로고를 <b className="text-slate-500">드래그</b>해 현재 보고서에서만 위치를 조정할 수 있어요.</p>
              {typeof cover.logoX === "number" ? (
                <button
                  type="button"
                  onClick={() => onPatch({ logoX: undefined, logoY: undefined })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50"
                >
                  로고 위치 초기화 (정렬로)
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CoverPanel({
  report,
  cover,
  onPatch,
}: {
  report: AnalysisReport;
  cover: ReportCover | undefined;
  onPatch: (patch: Partial<ReportCover>) => void;
}) {
  const enabled = !!cover?.enabled;
  const tpl = (cover?.templateId ?? "classic-center") as CoverTemplateId;

  return (
    <>
      <ToggleRow label="표지 페이지 사용" on={enabled} onClick={() => onPatch({ enabled: !enabled })} icon={<BookImage className="w-3.5 h-3.5" />} />
      {!enabled ? (
        <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
          켜면 첫 페이지에 표지가 생깁니다. <b className="text-slate-500">끄면 설정은 보존</b>돼요(페이지 번호에는 미포함).
        </p>
      ) : (
        <div className="mt-3 space-y-3.5">
          {/* 템플릿 갤러리 (실제 축소 렌더) */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">템플릿</div>
            <div className="grid grid-cols-3 gap-1.5">
              {coverTemplateIdSchema.options.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPatch({ templateId: t })}
                  title={COVER_TEMPLATE_LABELS[t]}
                  className={`rounded-md p-0.5 border ${tpl === t ? "border-blue-500 ring-1 ring-blue-300" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <CoverPreview report={report} templateId={t} widthPx={62} />
                  <div className="text-[8.5px] text-slate-500 truncate mt-0.5 text-center">{COVER_TEMPLATE_LABELS[t]}</div>
                </button>
              ))}
            </div>
          </div>

          <ToggleRow label="메타 정보(분류·난이도) 표시" on={!!cover?.showMeta} onClick={() => onPatch({ showMeta: !cover?.showMeta })} />

          <p className="text-[10.5px] text-slate-400 leading-relaxed">표지 텍스트는 보고서에서 직접 클릭해 수정해요.</p>
        </div>
      )}
    </>
  );
}

export { CoverPanel, LogoPanel };
