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
  ArrowLeft,
  Bold,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { useUnsavedCloseGuard } from "@/components/shared/use-unsaved-close-guard";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  /** 이 웹툰이 생성된 지문의 원문. 제공되면 헤더 제목을 눌러 팝오버로 볼 수 있다. */
  passageContent?: string;
  onClose: () => void;
  onExported?: (editedImageUrl: string) => void;
  /** 상세보기에서 진입한 경우, 편집창을 닫고 상세보기로 되돌아간다. */
  onBack?: () => void;
  /** 이 웹툰 자체를 삭제한다(되돌릴 수 없음). 제공되면 헤더에 삭제 버튼이 노출된다. */
  onDelete?: () => void;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function WebtoonTextEditor({
  webtoonId,
  title,
  passageContent,
  onClose,
  onExported,
  onBack,
  onDelete,
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
  // 미저장 변경 추적 — 최초 로드/저장 시점의 boxes 스냅샷과 현재를 비교.
  const savedBoxesSnapshotRef = useRef<string | null>(null);
  const dirty = useMemo(
    () =>
      savedBoxesSnapshotRef.current != null &&
      JSON.stringify(boxes) !== savedBoxesSnapshotRef.current,
    [boxes],
  );
  // 닫기 가드 — 표준 경고 다이얼로그(다른 편집 화면과 동일 디자인).
  const closeGuard = useUnsavedCloseGuard({ isDirty: dirty, onClose });
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
        const loadedBoxes = td.boxes.map((b) => ({ ...b }));
        setBoxes(loadedBoxes);
        savedBoxesSnapshotRef.current = JSON.stringify(loadedBoxes);
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
      // 드래그 고속 경로 앵커 — 그립(span)의 부모가 PreviewZoomControls 루트
      // (style top/right 를 그리는 요소)다. 이동 중에는 여기에 rAF 코얼레싱으로
      // 직접 쓰고, 놓을 때 한 번만 setState 로 커밋한다(매 mousemove setState 는
      // Konva 스테이지 포함 에디터 전체를 프레임마다 리렌더). 앵커가 없으면
      // 종전 setState 경로 폴백(무회귀).
      const ctrlEl = event.currentTarget.parentElement as HTMLElement | null;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단 — document 리스너라 move 수신은 유지.
      document.body.style.pointerEvents = "none";
      let latest = { top: startTop, right: startRight };
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (ctrlEl) {
          ctrlEl.style.top = `${latest.top}px`;
          ctrlEl.style.right = `${latest.right}px`;
        }
      };
      const onMove = (e: MouseEvent) => {
        latest = {
          top: Math.max(0, startTop + (e.clientY - startY)),
          right: Math.max(0, startRight - (e.clientX - startX)),
        };
        if (ctrlEl) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          setZoomCtrlPos(latest);
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        // 커밋 1회 — 드래그 내내 리렌더 0회.
        setZoomCtrlPos(latest);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
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
        closeGuard.requestClose();
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
  }, [closeGuard.requestClose, undo, redo]);

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
      if (ok) savedBoxesSnapshotRef.current = JSON.stringify(boxesRef.current);
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

  const handlePrint = useCallback(async () => {
    if (!doc) return;
    // commit latest edits + real font metrics to the canvas before snapshotting
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
    if (!dataUrl) {
      setNotice("인쇄할 이미지를 준비하지 못했습니다");
      return;
    }
    // 새 창(window.open) 대신 화면 밖 숨김 iframe으로 인쇄한다 — 팝업이 뜨지 않고
    // 현재 탭에서 바로 인쇄 대화상자가 열린다. 인쇄가 끝나면 iframe을 제거한다.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      // 인쇄 대화상자가 닫힌 뒤 정리(여러 번 호출돼도 안전).
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const idoc = iframe.contentWindow?.document;
    if (!idoc) {
      cleanup();
      setNotice("인쇄를 준비하지 못했습니다");
      return;
    }
    idoc.open();
    idoc.write(
      `<!doctype html><html><head><title>${title ? `${title} — 웹툰` : "웹툰"}</title>` +
        // A4 세로(portrait)를 기본 용지로 지정하고, 이미지를 인쇄 가능 영역
        // (A4 210×297mm − 10mm 여백 = 190×277mm)에 맞춰 축소해 한 페이지에 담는다.
        `<style>` +
        `@page{size:A4 portrait;margin:10mm}` +
        `html,body{margin:0;padding:0}` +
        `img{display:block;margin:0 auto;width:auto;height:auto;max-width:190mm;max-height:277mm}` +
        `</style>` +
        `</head><body><img src="${dataUrl}" /></body></html>`,
    );
    idoc.close();

    const win = iframe.contentWindow;
    const img = idoc.images[0];
    const triggerPrint = () => {
      try {
        win?.focus();
        win?.print();
      } finally {
        // 인쇄 대화상자를 닫은 뒤 정리. afterprint가 안 와도 대비해 타임아웃도 둔다.
        win?.addEventListener("afterprint", cleanup);
        window.setTimeout(cleanup, 60_000);
      }
    };
    if (img && !img.complete) {
      img.addEventListener("load", triggerPrint);
      img.addEventListener("error", cleanup);
    } else {
      triggerPrint();
    }
  }, [doc, title]);

  const body = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeGuard.requestClose();
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#F4F6F9] shadow-2xl">
      {/* header row 1 — title bar (학습지 편집창과 동일 디자인 언어) */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        {passageContent ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="지문 원문 보기"
                className="flex min-w-0 items-center gap-2 rounded-md py-1 pl-1 pr-2 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ImageIcon className="size-4" />
                </span>
                <span className="shrink-0 text-[15px] font-bold text-slate-800">웹툰 편집</span>
                {title ? (
                  <span className="truncate text-[12px] text-slate-400">— {title}</span>
                ) : null}
                <ChevronDown className="size-4 shrink-0 text-slate-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[70] w-[440px] max-w-[90vw] p-0">
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2">
                <BookOpen className="size-3.5 shrink-0 text-slate-400" />
                <span className="truncate text-[12px] font-bold text-slate-700">
                  {title ? `${title} — 지문 원문` : "지문 원문"}
                </span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                  <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-slate-700">
                    {passageContent}
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ImageIcon className="size-4" />
            </span>
            <span className="truncate text-[15px] font-bold text-slate-800">웹툰 편집</span>
            {title ? (
              <span className="truncate text-[12px] text-slate-400">— {title}</span>
            ) : null}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              title="돌아가기"
              aria-label="돌아가기"
              className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="size-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title="삭제"
              aria-label="삭제"
              onClick={() => {
                if (window.confirm("이 웹툰을 삭제할까요? 되돌릴 수 없습니다.")) onDelete();
              }}
              className="text-red-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => closeGuard.requestClose()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* header row 2 — toolbar (학습지 편집창 상단 바와 동일) */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-bold text-slate-600">웹툰 편집</span>
          {phase === "ready" ? (
            <>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                편집 가능 {editableBoxes.length}개
              </span>
              {editedCount > 0 ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  수정됨 {editedCount}개
                </span>
              ) : null}
            </>
          ) : (
            <span className="truncate text-[11px] text-slate-400">이미지 속 텍스트를 인식하는 중…</span>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          {/* undo / redo */}
          <button
            type="button"
            onClick={undo}
            disabled={hist.u === 0 || phase !== "ready"}
            title="실행 취소 (Ctrl+Z)"
            aria-label="실행 취소"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={hist.r === 0 || phase !== "ready"}
            title="다시 실행 (Ctrl+Shift+Z)"
            aria-label="다시 실행"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Redo2 className="size-3.5" />
          </button>

          <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />

          {/* 저장 */}
          <SaveButton
            onClick={handleSave}
            saving={saving}
            disabled={saving || phase !== "ready"}
            iconOnly
          />
          {/* 인쇄 */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={phase !== "ready"}
            title="인쇄"
            aria-label="인쇄"
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="size-3.5" />
          </button>
          {/* 배포하기 (primary) */}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || phase !== "ready" || editedCount === 0}
            className="flex h-8 min-w-[80px] items-center justify-center gap-1 rounded-md bg-slate-900 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            배포하기
          </button>
        </div>
      </div>

      {/* notice toast */}
      {notice ? (
        <div className="absolute left-1/2 top-28 z-10 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-1.5 text-[12px] text-white shadow-lg">
          {notice}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* left panel — recognized text list (학습지 편집창 좌측 패널 UI) */}
        <aside className="flex max-h-[40vh] min-h-0 shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-white lg:h-full lg:max-h-none lg:w-[260px] xl:w-[300px] lg:border-b-0 lg:border-r">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-slate-800">인식된 텍스트</p>
              <p className="truncate text-[10.5px] font-semibold text-slate-400">
                {phase === "ready"
                  ? `편집 가능 ${editableBoxes.length}개 · 수정됨 ${editedCount}개`
                  : "텍스트 인식 중…"}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            <RegionList
              boxes={editableBoxes}
              hoverId={hoverId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onAddText={addTextBox}
            />
          </div>
        </aside>

        {/* canvas area — relative parent so the zoom control stays fixed while the
            scroller pans the (possibly zoomed-in) canvas */}
        <div className="relative min-h-[50vh] min-w-0 shrink-0 lg:min-h-0 lg:shrink lg:flex-1">
          <div ref={stageWrapRef} className="absolute inset-0 flex overflow-auto">
            {phase === "error" ? (
              <div className="m-auto text-center text-slate-500">
                <p className="text-[14px]">{error}</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>
                  닫기
                </Button>
              </div>
            ) : phase !== "ready" || !image || !doc ? (
              <div className="m-auto flex flex-col items-center gap-3 text-slate-500">
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

        {/* right panel — speech-bubble editor (학습지 편집창 우측 패널 UI) */}
        <aside className="flex min-h-0 shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-slate-50/80 lg:h-full lg:w-[280px] xl:w-[320px] lg:border-t-0 lg:border-l">
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-slate-800">말풍선 편집</p>
              <p className="truncate text-[10.5px] font-semibold text-slate-400">
                {selected
                  ? `${selected.added ? "텍스트" : webtoonTextRoleLabel(selected.role)} 조정`
                  : "박스를 선택하세요"}
              </p>
            </div>
            {selected ? (
              <div className="flex shrink-0 items-center gap-1">
                {!selected.added ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateBox(selected.id, {
                        text: selected.sourceText,
                        autoFit: true,
                        edited: false,
                        x: selected.srcX,
                        y: selected.srcY,
                        w: selected.srcW,
                        h: selected.srcH,
                      })
                    }
                    disabled={!(selected.text !== selected.sourceText || selected.edited)}
                    title="원본으로 되돌리기"
                    aria-label="원본으로 되돌리기"
                    className="flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeOrEraseBox(selected)}
                  title={selected.added ? "박스 삭제" : "원본 글자 지우기"}
                  aria-label={selected.added ? "박스 삭제" : "원본 글자 지우기"}
                  className="flex size-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {selected ? (
              <HandleBlock
                title={`${selected.added ? "텍스트" : webtoonTextRoleLabel(selected.role)} 편집`}
                summary={selected.edited ? "수정됨" : undefined}
              >
                <BoxEditor
                  box={selected}
                  onChange={(patch) => updateBox(selected.id, patch)}
                  onFontChange={handleFontChange}
                />
              </HandleBlock>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-[12px] leading-relaxed text-slate-400">
                  왼쪽 목록이나 이미지에서 텍스트 박스를 선택하면
                  <br />
                  여기서 글자·크기·색 등을 편집할 수 있어요.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
      </div>
      {closeGuard.dialog}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function RegionList({
  boxes,
  hoverId,
  selectedId,
  onSelect,
  onHover,
  onAddText,
}: {
  boxes: WebtoonTextBox[];
  hoverId: string | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onAddText: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] leading-relaxed text-slate-500">
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
                selectedId === b.id
                  ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
                  : hoverId === b.id
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

/** 손잡이 달린 블록 카드 — 학습지 편집창 PanelSection(블록 편집 카드)과 동일 디자인. */
function HandleBlock({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="mb-2.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all last:mb-0">
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
        <span
          className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 active:cursor-grabbing"
          aria-hidden="true"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white"
          title={`${title} ${collapsed ? "펼치기" : "접기"}`}
        >
          <h4 className="w-full truncate text-[10.5px] font-black uppercase tracking-wide text-slate-500">{title}</h4>
          {summary ? (
            <span className="w-full truncate text-[10px] font-medium text-slate-400">{summary}</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
          title={collapsed ? "펼치기" : "접기"}
          aria-label={collapsed ? "펼치기" : "접기"}
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed ? <div className="px-3 py-3">{children}</div> : null}
    </section>
  );
}

/** 섹션 헤더 — 학습지 편집창 PanelGroup 과 동일 패턴 (UI 통일감). */
function PanelGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

/** 숫자 값 스테퍼 — 학습지 편집창의 [− 값 +] 컨트롤과 동일 (슬라이더 대신). */
function StepperRow({
  label,
  display,
  headerRight,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
}: {
  label: string;
  display: string;
  headerRight?: React.ReactNode;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
}) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] text-slate-600">{label}</span>
        {headerRight ?? (
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">{display}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDec}
          disabled={decDisabled}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="inline-flex h-8 min-w-[64px] items-center justify-center rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold tabular-nums text-slate-600">
          {display}
        </span>
        <button
          type="button"
          onClick={onInc}
          disabled={incDisabled}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** on/off 토글 행 — 학습지 편집창 ToggleRow 와 동일. */
function ToggleRow({
  label,
  on,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-full items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors ${
        on
          ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          on ? "bg-sky-500" : "bg-slate-300"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
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
      <label className="block text-[12px] text-slate-600">{label}</label>
      <input
        type="color"
        value={hex6(value, fallback)}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-8 w-full cursor-pointer rounded-md border border-slate-200"
      />
    </div>
  );
}

function BoxEditor({
  box,
  onChange,
  onFontChange,
}: {
  box: WebtoonTextBox;
  onChange: (patch: Partial<WebtoonTextBox>) => void;
  onFontChange: (family: string) => void;
}) {
  const aligns: { value: WebtoonTextAlign; icon: typeof AlignLeft }[] = [
    { value: "left", icon: AlignLeft },
    { value: "center", icon: AlignCenter },
    { value: "right", icon: AlignRight },
  ];
  const isBold = (box.fontWeight ?? 400) >= 700;
  const strokeW = box.strokeWidth ?? 0;
  // 글자 크기는 포인트(pt)로 표기·조절한다. 저장은 px(캔버스 단위) 그대로 유지.
  // 1pt = 1/72in, 1px = 1/96in → pt = px × 72/96(=0.75), px = pt × 96/72.
  const sizePt = Math.round(box.fontSizePx * (72 / 96));
  const ptToPx = (pt: number) => Math.round(pt * (96 / 72));
  const lhPct = Math.round((box.lineHeight ?? 1.3) * 100);
  const ls = box.letterSpacing ?? 0;
  return (
    <div>
      <PanelGroup label="텍스트">
        <textarea
          value={box.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={4}
          className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-[13px] leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </PanelGroup>

      <PanelGroup label="서식">
        <div className="mb-2.5">
          <span className="mb-1 block text-[12px] text-slate-600">폰트</span>
          <WebtoonFontPicker value={familyFromStack(box.fontFamily)} onChange={onFontChange} />
        </div>

        {/* 굵게 — 학습지 ToggleRow */}
        <div className="mb-2.5">
          <ToggleRow
            label="굵게"
            on={isBold}
            onClick={() => onChange({ fontWeight: isBold ? 400 : 700 })}
            icon={<Bold className="size-3.5" />}
          />
        </div>

        {/* 정렬 — 학습지 3분할 버튼 */}
        <div className="mb-2.5 flex items-center gap-1.5">
          {aligns.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ align: value })}
              className={`inline-flex h-8 flex-1 items-center justify-center rounded-md border ${
                box.align === value
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>

        {/* 글자 크기 — 학습지 [− 값 +] 스테퍼 (자동맞춤 토글 칩 포함) */}
        <StepperRow
          label="글자 크기"
          display={`${sizePt}pt`}
          headerRight={
            <button
              type="button"
              onClick={() => onChange({ autoFit: !box.autoFit })}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                box.autoFit ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              자동맞춤 {box.autoFit ? "켜짐" : "꺼짐"}
            </button>
          }
          decDisabled={sizePt <= 8}
          incDisabled={sizePt >= 120}
          onDec={() => onChange({ fontSizePx: ptToPx(Math.max(8, sizePt - 1)), autoFit: false })}
          onInc={() => onChange({ fontSizePx: ptToPx(Math.min(120, sizePt + 1)), autoFit: false })}
        />
      </PanelGroup>

      <PanelGroup label="간격">
        <StepperRow
          label="행간"
          display={`${lhPct}%`}
          decDisabled={lhPct <= 90}
          incDisabled={lhPct >= 250}
          onDec={() => onChange({ lineHeight: Math.max(90, lhPct - 5) / 100 })}
          onInc={() => onChange({ lineHeight: Math.min(250, lhPct + 5) / 100 })}
        />
        <StepperRow
          label="자간"
          display={`${ls}px`}
          decDisabled={ls <= -5}
          incDisabled={ls >= 20}
          onDec={() => onChange({ letterSpacing: Math.max(-5, ls - 1) })}
          onInc={() => onChange({ letterSpacing: Math.min(20, ls + 1) })}
        />
      </PanelGroup>

      <PanelGroup label="색상">
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="글자색" value={box.color} fallback="#111111" onChange={(v) => onChange({ color: v })} />
          <ColorField label="배경색" value={box.bgColor} fallback="#ffffff" onChange={(v) => onChange({ bgColor: v })} />
        </div>
      </PanelGroup>

      <PanelGroup label="외곽선">
        <StepperRow
          label="외곽선 두께"
          display={strokeW > 0 ? `${strokeW}px` : "없음"}
          decDisabled={strokeW <= 0}
          incDisabled={strokeW >= 20}
          onDec={() => onChange({ strokeWidth: Math.max(0, strokeW - 1) })}
          onInc={() => onChange({ strokeWidth: Math.min(20, strokeW + 1) })}
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
      </PanelGroup>

      <p className="mt-4 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
        팁: 박스를 드래그해 옮기고, 모서리·테두리 핸들로 크기를 조절하세요. 수정한 박스만 새로
        그려지고, 손대지 않은 부분은 원본 픽셀이 그대로 유지됩니다.
      </p>
    </div>
  );
}
