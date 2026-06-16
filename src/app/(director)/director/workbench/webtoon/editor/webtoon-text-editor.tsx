"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Loader2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
  PreviewZoomControls,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import {
  WEBTOON_TEXT_FONT_FAMILY,
  webtoonTextRoleLabel,
  type WebtoonTextAlign,
  type WebtoonTextBox,
  type WebtoonTextDoc,
} from "@/lib/webtoon-text/types";
import {
  ensureWebtoonFont,
  familyFromStack,
  fontFamilyStack,
} from "@/lib/webtoon-text/fonts";
import { WebtoonFontPicker } from "./webtoon-font-picker";
import type { WebtoonTextCanvasHandle } from "./webtoon-text-canvas";

const WebtoonTextCanvas = dynamic(
  () => import("./webtoon-text-canvas").then((m) => m.WebtoonTextCanvas),
  { ssr: false },
);

type Phase = "detecting" | "loading-image" | "ready" | "error";

interface WebtoonTextEditorProps {
  webtoonId: string;
  title?: string;
  onClose: () => void;
  onExported?: (editedImageUrl: string) => void;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function WebtoonTextEditor({
  webtoonId,
  title,
  onClose,
  onExported,
}: WebtoonTextEditorProps) {
  const [phase, setPhase] = useState<Phase>("detecting");
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<WebtoonTextDoc | null>(null);
  const [boxes, setBoxes] = useState<WebtoonTextBox[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(0.25);
  // user zoom multiplier on top of the fit scale (1 = fit). The Konva stage scale is
  // fitScale*zoom, so zooming keeps vector text crisp AND export stays native (pixelRatio
  // = 1/scale cancels it out).
  const [zoom, setZoom] = useState(1);
  const [zoomCtrlPos, setZoomCtrlPos] = useState({ top: 12, right: 12 });
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // bumped whenever a webfont finishes loading → canvas re-fits with real metrics
  const [fontEpoch, setFontEpoch] = useState(0);

  const exportApiRef = useRef<WebtoonTextCanvasHandle | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // ─── undo / redo (coalesced history) ───
  const boxesRef = useRef<WebtoonTextBox[]>(boxes);
  useEffect(() => {
    boxesRef.current = boxes;
  });
  const historyRef = useRef<{ past: WebtoonTextBox[][]; future: WebtoonTextBox[][]; lastAt: number }>(
    { past: [], future: [], lastAt: 0 },
  );
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const clone = (bs: WebtoonTextBox[]) => bs.map((b) => ({ ...b }));
  // snapshot the current state before a mutation; coalesce rapid bursts into one step
  const beginChange = useCallback(() => {
    const h = historyRef.current;
    const now = Date.now();
    if (now - h.lastAt > 500) {
      h.past.push(clone(boxesRef.current));
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      setHist({ u: h.past.length, r: h.future.length });
    }
    h.lastAt = now;
  }, []);

  // 1) detect text regions (idempotent on the server) → boxes
  useEffect(() => {
    let cancelled = false;
    setPhase("detecting");
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/webtoons/${webtoonId}/detect-text`, { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "텍스트 인식 실패");
        if (cancelled) return;
        const td = json.textDoc as WebtoonTextDoc;
        setDoc(td);
        setBoxes(td.boxes.map((b) => ({ ...b })));
        setPhase("loading-image");

        // 2) load the original image as a blob (untainted canvas → exportable)
        const imgRes = await fetch(td.background.originalUrl, { cache: "no-store" });
        if (!imgRes.ok) throw new Error("이미지 로드 실패");
        const blob = await imgRes.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          setImage(img);
          setPhase("ready");
        };
        img.onerror = () => {
          if (!cancelled) {
            setError("이미지를 표시할 수 없습니다");
            setPhase("error");
          }
        };
        img.src = url;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "알 수 없는 오류");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [webtoonId]);

  // cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Auto-fit must measure REAL webfont (Pretendard) metrics, not the fallback. Wait for the
  // font to load, then flip fontsReady so the canvas re-fits with correct metrics.
  useEffect(() => {
    let cancelled = false;
    const ready = async () => {
      try {
        if (document.fonts?.load) {
          await document.fonts.load('16px "Pretendard"');
          await document.fonts.load('700 16px "Pretendard"');
        }
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* ignore — fallback metrics */
      }
      if (!cancelled) setFontEpoch((e) => e + 1);
    };
    ready();
    return () => {
      cancelled = true;
    };
  }, []);

  // fit-to-viewport scale (the "100%" baseline; user zoom multiplies it)
  const recomputeScale = useCallback(() => {
    if (!doc) return;
    const wrap = stageWrapRef.current;
    const availW = (wrap?.clientWidth ?? window.innerWidth * 0.55) - 28;
    const availH = (wrap?.clientHeight ?? window.innerHeight - 140) - 28;
    const s = Math.min(availW / doc.width, availH / doc.height);
    setFitScale(Math.max(0.05, Math.min(s, 1)));
  }, [doc]);

  useEffect(() => {
    recomputeScale();
    window.addEventListener("resize", recomputeScale);
    return () => window.removeEventListener("resize", recomputeScale);
  }, [recomputeScale, phase]);

  // effective Konva stage scale = fit * user-zoom
  const scale = fitScale * zoom;

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(PREVIEW_ZOOM_MAX, Math.round((z + PREVIEW_ZOOM_STEP) * 100) / 100)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(PREVIEW_ZOOM_MIN, Math.round((z - PREVIEW_ZOOM_STEP) * 100) / 100)),
    [],
  );
  const resetZoom = useCallback(() => setZoom(1), []);

  // drag the floating zoom control around (same behaviour as the exam preview control)
  const handleZoomCtrlDragStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startTop = zoomCtrlPos.top;
      const startRight = zoomCtrlPos.right;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      const onMove = (e: MouseEvent) => {
        setZoomCtrlPos({
          top: Math.max(0, startTop + (e.clientY - startY)),
          right: Math.max(0, startRight - (e.clientX - startX)),
        });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [zoomCtrlPos],
  );

  const updateBox = useCallback(
    (id: string, patch: Partial<WebtoonTextBox>, markEdited = true) => {
      beginChange();
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          // An explicit `edited` in the patch wins (used by revert to clear the flag);
          // otherwise any user modification marks the box edited.
          const edited =
            patch.edited !== undefined ? patch.edited : markEdited ? true : b.edited;
          return { ...b, ...patch, edited };
        }),
      );
    },
    [beginChange],
  );

  const handleMoveBox = useCallback(
    (id: string, x: number, y: number) => updateBox(id, { x: Math.round(x), y: Math.round(y) }),
    [updateBox],
  );
  const handleResizeBox = useCallback(
    (id: string, geom: { x: number; y: number; w: number; h: number }) =>
      updateBox(id, geom),
    [updateBox],
  );
  // Canvas-measured natural height for manually-sized boxes. This is a derived layout
  // correction (not a user edit), so it bypasses history and the `edited` flag.
  const handleAutoHeight = useCallback((id: string, h: number) => {
    setBoxes((prev) => prev.map((b) => (b.id === id && b.h !== h ? { ...b, h } : b)));
  }, []);

  // pick a catalog font: load its faces, then apply (and re-fit once loaded)
  const handleFontChange = useCallback(
    (family: string) => {
      if (!selectedId) return;
      updateBox(selectedId, { fontFamily: fontFamilyStack(family) });
      ensureWebtoonFont(family).then(() => setFontEpoch((e) => e + 1));
    },
    [selectedId, updateBox],
  );

  const addTextBox = useCallback(() => {
    if (!doc) return;
    beginChange();
    const w = Math.round(doc.width * 0.4);
    const h = Math.round(doc.height * 0.06);
    const x = Math.round((doc.width - w) / 2);
    const y = Math.round((doc.height - h) / 2);
    const id = `u${Date.now().toString(36)}`;
    const fontSizePx = Math.max(16, Math.round(h * 0.5));
    const newBox: WebtoonTextBox = {
      id,
      role: "other",
      editable: true,
      edited: true,
      added: true,
      x,
      y,
      w,
      h,
      rotation: 0,
      srcX: x,
      srcY: y,
      srcW: w,
      srcH: h,
      sourceText: "",
      text: "새 텍스트",
      lang: "ko",
      fontFamily: WEBTOON_TEXT_FONT_FAMILY,
      fontSizePx,
      autoFit: true,
      color: "#111111",
      align: "center",
      vertical: false,
      lineHeight: 1.3,
      bgColor: "#ffffff",
      bgPadding: Math.max(6, Math.round(h * 0.12)),
      bgRadius: 12,
      confidence: 1,
    };
    setBoxes((prev) => [...prev, newBox]);
    setSelectedId(id);
  }, [doc, beginChange]);

  const removeOrEraseBox = useCallback(
    (box: WebtoonTextBox) => {
      beginChange();
      if (box.added) {
        // user-added box → remove entirely
        setBoxes((prev) => prev.filter((b) => b.id !== box.id));
        setSelectedId(null);
      } else {
        // detected box → "erase": cover the original text with the patch, render nothing
        setBoxes((prev) =>
          prev.map((b) => (b.id === box.id ? { ...b, text: "", edited: true } : b)),
        );
      }
    },
    [beginChange],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(clone(boxesRef.current));
    h.lastAt = 0;
    setBoxes(prev);
    setSelectedId(null);
    setHist({ u: h.past.length, r: h.future.length });
  }, []);
  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(clone(boxesRef.current));
    h.lastAt = 0;
    setBoxes(next);
    setSelectedId(null);
    setHist({ u: h.past.length, r: h.future.length });
  }, []);

  // Esc to close · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, undo, redo]);

  const selected = useMemo(
    () => boxes.find((b) => b.id === selectedId) ?? null,
    [boxes, selectedId],
  );
  const editableBoxes = useMemo(() => boxes.filter((b) => b.editable), [boxes]);
  const editedCount = useMemo(() => boxes.filter((b) => b.edited).length, [boxes]);

  const persistDoc = useCallback(async () => {
    if (!doc) return false;
    const res = await fetch(`/api/webtoons/${webtoonId}/text-doc`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ textDoc: { ...doc, boxes } }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.ok;
  }, [doc, boxes, webtoonId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const ok = await persistDoc();
      setNotice(ok ? "편집 내용을 저장했습니다" : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }, [persistDoc]);

  const handleExport = useCallback(async () => {
    if (!doc) return;
    setExporting(true);
    setNotice(null);
    try {
      // ensure the latest edits + real font metrics are committed to the canvas
      await nextFrame();
      await nextFrame();
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* ignore */
        }
      }
      const dataUrl = exportApiRef.current?.exportDataUrl();
      if (!dataUrl) throw new Error("렌더링에 실패했습니다");
      const blob = await (await fetch(dataUrl)).blob();

      // 1) signed upload target (bytes go straight to Supabase, bypassing the API body cap)
      const tRes = await fetch(`/api/webtoons/${webtoonId}/export-target`, { method: "POST" });
      const tJson = await tRes.json();
      if (!tRes.ok || !tJson.ok) throw new Error(tJson.error || "업로드 준비 실패");

      // 2) PUT the rendered PNG directly to the signed URL
      const upRes = await fetch(tJson.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/png", "x-upsert": "true" },
        body: blob,
      });
      if (!upRes.ok) throw new Error(`이미지 업로드 실패 (${upRes.status})`);

      // 3) finalize — record editedImageUrl + persist the doc
      const fRes = await fetch(`/api/webtoons/${webtoonId}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePath: tJson.storagePath, textDoc: { ...doc, boxes } }),
      });
      const fJson = await fRes.json();
      if (!fRes.ok || !fJson.ok) throw new Error(fJson.error || "내보내기에 실패했습니다");
      setNotice("편집한 웹툰을 저장했습니다");
      onExported?.(fJson.editedImageUrl);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setExporting(false);
    }
  }, [doc, boxes, webtoonId, onExported]);

  const body = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/95 backdrop-blur-sm">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-5 py-3 text-white">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {title ? `웹툰 자막 편집 — ${title}` : "웹툰 자막 편집"}
          </div>
          <div className="text-[11px] text-slate-400">
            {phase === "ready"
              ? `편집 가능한 텍스트 ${editableBoxes.length}개 · 수정됨 ${editedCount}개 — 박스를 눌러 글자를 고치세요`
              : "이미지 속 텍스트를 인식하는 중…"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-1 flex items-center gap-0.5 rounded-lg bg-slate-800 p-0.5">
            <ToolbarIconButton title="실행 취소 (Ctrl+Z)" onClick={undo} disabled={hist.u === 0 || phase !== "ready"}>
              <Undo2 className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton title="다시 실행 (Ctrl+Shift+Z)" onClick={redo} disabled={hist.r === 0 || phase !== "ready"}>
              <Redo2 className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton title="텍스트 박스 추가" onClick={addTextBox} disabled={phase !== "ready"}>
              <Plus className="size-4" />
            </ToolbarIconButton>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            disabled={saving || phase !== "ready"}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            저장
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting || phase !== "ready" || editedCount === 0}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            적용 · 내보내기
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-lg p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* notice toast */}
      {notice ? (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-1.5 text-[12px] text-white shadow-lg">
          {notice}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* canvas area — relative parent so the zoom control stays fixed while the
            scroller pans the (possibly zoomed-in) canvas */}
        <div className="relative min-w-0 flex-1">
          <div ref={stageWrapRef} className="absolute inset-0 flex overflow-auto">
            {phase === "error" ? (
              <div className="m-auto text-center text-slate-300">
                <p className="text-[14px]">{error}</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>
                  닫기
                </Button>
              </div>
            ) : phase !== "ready" || !image || !doc ? (
              <div className="m-auto flex flex-col items-center gap-3 text-slate-300">
                <Loader2 className="size-8 animate-spin" />
                <p className="text-[13px]">
                  {phase === "detecting" ? "텍스트 인식 중… (최초 1회, 약 10초)" : "이미지 불러오는 중…"}
                </p>
              </div>
            ) : (
              <div className="m-auto p-3 shadow-2xl">
                <WebtoonTextCanvas
                  image={image}
                  nativeWidth={doc.width}
                  nativeHeight={doc.height}
                  scale={scale}
                  boxes={boxes}
                  selectedId={selectedId}
                  hoverId={hoverId}
                  fontEpoch={fontEpoch}
                  onSelect={setSelectedId}
                  onHover={setHoverId}
                  onMoveBox={handleMoveBox}
                  onResizeBox={handleResizeBox}
                  onAutoHeight={handleAutoHeight}
                  exportApiRef={exportApiRef}
                />
              </div>
            )}
          </div>
          {phase === "ready" && image && doc ? (
            <PreviewZoomControls
              zoom={zoom}
              position={zoomCtrlPos}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetZoom}
              onFit={resetZoom}
              onDragStart={handleZoomCtrlDragStart}
            />
          ) : null}
        </div>

        {/* side panel */}
        <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-slate-700 bg-white">
          {selected ? (
            <BoxEditor
              box={selected}
              onChange={(patch) => updateBox(selected.id, patch)}
              onFontChange={handleFontChange}
              onDelete={() => removeOrEraseBox(selected)}
              onRevert={() =>
                updateBox(selected.id, {
                  text: selected.sourceText,
                  autoFit: true,
                  edited: false,
                  // return a dragged box to its detected home so nothing is repainted
                  x: selected.srcX,
                  y: selected.srcY,
                  w: selected.srcW,
                  h: selected.srcH,
                })
              }
            />
          ) : (
            <RegionList
              boxes={editableBoxes}
              hoverId={hoverId}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onAddText={addTextBox}
            />
          )}
        </aside>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function ToolbarIconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex size-7 items-center justify-center rounded-md text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function RegionList({
  boxes,
  hoverId,
  onSelect,
  onHover,
  onAddText,
}: {
  boxes: WebtoonTextBox[];
  hoverId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onAddText: () => void;
}) {
  return (
    <div className="p-4">
      <h3 className="text-[13px] font-semibold text-slate-800">인식된 텍스트</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        고치고 싶은 텍스트를 누르면 바로 편집할 수 있어요. 수정한 부분만 새로 그려지고 나머지는
        원본 그대로 유지됩니다.
      </p>
      <button
        type="button"
        onClick={onAddText}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 py-2 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-50"
      >
        <Plus className="size-3.5" /> 새 텍스트 박스 추가
      </button>
      <ul className="mt-3 space-y-1.5">
        {boxes.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onMouseEnter={() => onHover(b.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(b.id)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                hoverId === b.id
                  ? "border-blue-300 bg-blue-50/70"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {webtoonTextRoleLabel(b.role)}
                </span>
                {b.edited ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    수정됨
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] text-slate-700">{b.text}</p>
            </button>
          </li>
        ))}
        {boxes.length === 0 ? (
          <li className="text-[12px] text-slate-400">편집 가능한 텍스트가 없습니다.</li>
        ) : null}
      </ul>
    </div>
  );
}

function hex6(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
        <span className="text-[11px] tabular-nums text-slate-500">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-blue-600 disabled:opacity-40"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500">{label}</label>
      <input
        type="color"
        value={hex6(value, fallback)}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-8 w-full cursor-pointer rounded border border-slate-200"
      />
    </div>
  );
}

function BoxEditor({
  box,
  onChange,
  onFontChange,
  onDelete,
  onRevert,
}: {
  box: WebtoonTextBox;
  onChange: (patch: Partial<WebtoonTextBox>) => void;
  onFontChange: (family: string) => void;
  onDelete: () => void;
  onRevert: () => void;
}) {
  const aligns: { value: WebtoonTextAlign; icon: typeof AlignLeft }[] = [
    { value: "left", icon: AlignLeft },
    { value: "center", icon: AlignCenter },
    { value: "right", icon: AlignRight },
  ];
  const dirty = box.text !== box.sourceText || box.edited;
  const isBold = (box.fontWeight ?? 400) >= 700;
  const strokeW = box.strokeWidth ?? 0;
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-slate-800">
          {box.added ? "텍스트" : webtoonTextRoleLabel(box.role)} 편집
        </h3>
        <div className="flex items-center gap-1">
          {!box.added ? (
            <button
              type="button"
              onClick={onRevert}
              disabled={!dirty}
              title="원본으로 되돌리기"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" /> 원본
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            title={box.added ? "박스 삭제" : "원본 글자 지우기"}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-rose-500 hover:bg-rose-50"
          >
            <Trash2 className="size-3.5" /> {box.added ? "삭제" : "지우기"}
          </button>
        </div>
      </div>

      <label className="mt-3 block text-[11px] font-medium text-slate-500">텍스트</label>
      <textarea
        value={box.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={4}
        className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-[13px] leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
      />

      <label className="mt-3 block text-[11px] font-medium text-slate-500">폰트</label>
      <div className="mt-1">
        <WebtoonFontPicker value={familyFromStack(box.fontFamily)} onChange={onFontChange} />
      </div>

      {/* weight + alignment */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ fontWeight: isBold ? 400 : 700 })}
          title="굵게"
          className={`flex size-9 items-center justify-center rounded-md border ${
            isBold ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Bold className="size-4" />
        </button>
        <div className="flex flex-1 gap-1">
          {aligns.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ align: value })}
              className={`flex-1 rounded-md border py-1.5 ${
                box.align === value
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon className="mx-auto size-4" />
            </button>
          ))}
        </div>
      </div>

      {/* font size with auto-fit */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">글자 크기</span>
          <button
            type="button"
            onClick={() => onChange({ autoFit: !box.autoFit })}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
              box.autoFit ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            자동맞춤 {box.autoFit ? "켜짐" : "꺼짐"}
          </button>
        </div>
        <input
          type="range"
          min={10}
          max={160}
          value={box.fontSizePx}
          onChange={(e) => onChange({ fontSizePx: Number(e.target.value), autoFit: false })}
          className="mt-1 w-full accent-blue-600"
        />
      </div>

      <SliderRow
        label="행간"
        value={Math.round((box.lineHeight ?? 1.3) * 100)}
        min={90}
        max={250}
        step={5}
        display={`${Math.round((box.lineHeight ?? 1.3) * 100)}%`}
        onChange={(v) => onChange({ lineHeight: v / 100 })}
      />
      <SliderRow
        label="자간"
        value={box.letterSpacing ?? 0}
        min={-5}
        max={20}
        display={`${box.letterSpacing ?? 0}px`}
        onChange={(v) => onChange({ letterSpacing: v })}
      />

      {/* colors */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <ColorField label="글자색" value={box.color} fallback="#111111" onChange={(v) => onChange({ color: v })} />
        <ColorField label="배경색" value={box.bgColor} fallback="#ffffff" onChange={(v) => onChange({ bgColor: v })} />
      </div>

      {/* outline (readability over busy art) */}
      <SliderRow
        label="외곽선 두께"
        value={strokeW}
        min={0}
        max={20}
        display={strokeW > 0 ? `${strokeW}px` : "없음"}
        onChange={(v) => onChange({ strokeWidth: v })}
      />
      {strokeW > 0 ? (
        <div className="mt-2">
          <ColorField
            label="외곽선 색"
            value={box.strokeColor ?? "#ffffff"}
            fallback="#ffffff"
            onChange={(v) => onChange({ strokeColor: v })}
          />
        </div>
      ) : null}

      <p className="mt-4 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
        팁: 박스를 드래그해 옮기고, 모서리·테두리 핸들로 크기를 조절하세요. 수정한 박스만 새로
        그려지고, 손대지 않은 부분은 원본 픽셀이 그대로 유지됩니다.
      </p>
    </div>
  );
}
