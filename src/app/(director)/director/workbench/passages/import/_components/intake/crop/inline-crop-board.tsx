"use client";

// ============================================================================
// InlineCropBoard — 업로드한 N장을 업로드 카드 "안"에서 바로 크롭하고, 그 결과로
// 추출될 "지문"을 실시간 큰 미리보기로 검수한다. 모달 없음.
//
// 좌측: 원본 이미지 작업대. 우상단 줌 컨트롤(축소/확대/맞춤)로 큰 시험지 이미지를
//        편하게 보며 드래그-크롭. 박스 0개 이미지 = 통째로 1지문.
// 우측: "추출될 지문" 검수 패널. 지문(=그룹) 단위 큰 카드로, 실제 잘린 모습 그대로
//        (정확한 비율 CSS 크롭) 큼직하게 보여줘 검수가 된다. 카드 골라 "한 지문으로
//        합치기"(여러 장/조각=한 지문) / "분리". 통째 이미지도 카드로 표시.
//
// 모든 크롭 상태는 이 컴포넌트 안에 둔다(부모 리렌더 격리). 추출 직전 buildPassageSlots()
// ref로 1회 굽는다. 백엔드 계약(1슬롯=1지문) 불변. 좌표는 정규화 0~1이라 줌과 무관.
// ============================================================================

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Crop,
  FileText,
  GripVertical,
  ImagePlus,
  Layers,
  ScanText,
  Scissors,
  Trash2,
  X,
} from "lucide-react";

import {
  PreviewZoomControls,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { ACCEPTED } from "../../bulk-extract-client/constants";
import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";
import { CropCanvas } from "./crop-canvas";
import { cropImageToBlob, stitchSlotsToBlob } from "./crop-utils";

export interface InlineCropBoardHandle {
  /** 현재 박스/그룹을 실제 지문 슬롯으로 굽는다(추출 시작 직전 1회). 빈/초과면 null. */
  buildPassageSlots: () => Promise<ClientPageSlot[] | null>;
}

export interface InlineCropBoardCounts {
  regionCount: number;
  passageCount: number;
  uncroppedCount: number;
  totalPassages: number;
}

/** 그룹 배열을 첫 등장 순서대로 1..K 연속 번호로 정규화. */
function renumber(groups: number[]): number[] {
  const map = new Map<number, number>();
  let next = 1;
  return groups.map((g) => {
    if (!map.has(g)) map.set(g, next++);
    return map.get(g)!;
  });
}

/** 정규화 박스(0~1)를 CSS 배경으로 잘라 보여주는 스타일(굽기 없이, 어느 크기든 정확). */
function cropBgStyle(url: string, box: CropBox): React.CSSProperties {
  const w = Math.min(1, Math.max(0.001, box.w));
  const h = Math.min(1, Math.max(0.001, box.h));
  const posX = w >= 1 ? 0 : (box.x / (1 - w)) * 100;
  const posY = h >= 1 ? 0 : (box.y / (1 - h)) * 100;
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${100 / w}% ${100 / h}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    backgroundRepeat: "no-repeat",
  };
}

/** 크롭 영역의 실제 종횡비(왜곡 없는 미리보기용). 이미지 자연 크기 × 박스 비율. */
function cropAspect(slot: ClientPageSlot, box: CropBox): string {
  const w = Math.max(1, box.w * (slot.width || 1));
  const h = Math.max(1, box.h * (slot.height || 1));
  return `${w} / ${h}`;
}

interface FlatEntry {
  slotId: string;
  imageOrder: number;
  j: number;
  box: CropBox;
  group: number;
}

/** 같은 지문 조각의 읽기 순서: 이미지순 → 칼럼(좌→우) → 위→아래(y) → 좌(x). */
function colOf(b: CropBox): number {
  return b.x + b.w / 2 < 0.5 ? 0 : 1;
}
function readingSort(a: FlatEntry, b: FlatEntry): number {
  return (
    a.imageOrder - b.imageOrder ||
    colOf(a.box) - colOf(b.box) ||
    a.box.y - b.box.y ||
    a.box.x - b.box.x
  );
}

export const InlineCropBoard = forwardRef<
  InlineCropBoardHandle,
  {
    images: ClientPageSlot[];
    disabled?: boolean;
    onAddFiles: (files: FileList | File[]) => void;
    onRemoveImage: (index: number) => void;
    onReorderImages: (fromIndex: number, toIndex: number) => void;
    maxPassages: number;
    onCountChange?: (counts: InlineCropBoardCounts) => void;
    /** 검수 패널 하단에 고정 렌더할 영역(추출 시작 버튼 등). */
    footer?: ReactNode;
    /** P7-D2 출력 방식 — "restored"면 안내문을 "지문+문제+선지 함께 크롭→AI 복원"으로. */
    outputMode?: "verbatim" | "restored";
  }
>(function InlineCropBoard(
  {
    images,
    disabled = false,
    onAddFiles,
    onRemoveImage,
    onReorderImages,
    maxPassages,
    onCountChange,
    footer,
    outputMode,
  },
  ref,
) {
  const isRestored = outputMode === "restored";
  const [boxesBySlot, setBoxesBySlot] = useState<Record<string, CropBox[]>>({});
  const [groupsBySlot, setGroupsBySlot] = useState<Record<string, number[]>>(
    {},
  );
  const [active, setActive] = useState<{ slotId: string; j: number } | null>(
    null,
  );
  // 검수 패널에서 "한 지문으로 합치기" 대상으로 고른 지문(=내부 그룹 번호)들.
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dragOrder, setDragOrder] = useState<number | null>(null);
  const [dropOrder, setDropOrder] = useState<number | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);

  // ── 줌 (좌측 원본 캔버스) ──────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [baseWidth, setBaseWidth] = useState(420);
  const [availWidth, setAvailWidth] = useState(900);
  const [ctrlPos, setCtrlPos] = useState({ top: 12, right: 12 });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.max(1, el.clientWidth - 28); // 좌우 패딩 보정
      setAvailWidth(w);
      // 100%(=baseWidth) 상한을 적당히 낮게 둬서, 폭이 넓으면 기본으로 2열↑이
      // 자연스럽게 잡히게 한다(과대 방지 + "자리 많으면 다열" 요구 반영).
      setBaseWidth(Math.max(240, Math.min(420, w)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const contentWidth = Math.round(baseWidth * zoom);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const zoomIn = () =>
    setZoom((z) => Math.min(PREVIEW_ZOOM_MAX, round2(z + PREVIEW_ZOOM_STEP)));
  const zoomOut = () =>
    setZoom((z) => Math.max(PREVIEW_ZOOM_MIN, round2(z - PREVIEW_ZOOM_STEP)));
  const zoomReset = () => setZoom(1);
  const zoomFit = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const avail = Math.max(1, el.clientWidth - 28);
    setZoom(
      Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, round2(avail / baseWidth))),
    );
  };
  const onCtrlDrag = useCallback((event: ReactMouseEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const sx = event.clientX;
    const sy = event.clientY;
    const startTop = ctrlPos.top;
    const startRight = ctrlPos.right;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const move = (e: MouseEvent) =>
      setCtrlPos({
        top: Math.max(0, startTop + (e.clientY - sy)),
        right: Math.max(0, startRight - (e.clientX - sx)),
      });
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, [ctrlPos]);

  // ── 검수 패널 좌우 폭 조절 + 페이지 썸네일 레일 ────────────────────────
  const REVIEW_W_KEY = "smoat:extraction:review-width";
  const THUMBS_KEY = "smoat:extraction:thumbs-open";
  const clampReviewW = (w: number) => Math.min(760, Math.max(300, Math.round(w)));
  const [reviewWidth, setReviewWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const raw = window.localStorage.getItem(REVIEW_W_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? 420 : clampReviewW(n);
  });
  const [thumbsOpen, setThumbsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(THUMBS_KEY) !== "0";
  });
  const toggleThumbs = useCallback(() => {
    setThumbsOpen((p) => {
      const next = !p;
      try {
        window.localStorage.setItem(THUMBS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // 캔버스 상단 작업 힌트 — 한 번 닫으면 기억(검수 패널 카드에 같은 안내가 남음).
  const HINT_KEY = "smoat:extraction:crop-hint-open";
  const [hintOpen, setHintOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(HINT_KEY) !== "0";
  });
  const dismissHint = useCallback(() => {
    setHintOpen(false);
    try {
      window.localStorage.setItem(HINT_KEY, "0");
    } catch {
      /* ignore */
    }
  }, []);
  const beginReviewResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = reviewWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      let latest = startW;
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌면 검수 패널이 넓어진다(오른쪽 고정 패널).
        latest = clampReviewW(startW - (e.clientX - startX));
        setReviewWidth(latest);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(REVIEW_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [reviewWidth],
  );

  // 현재 보고 있는 페이지 — "뷰포트에서 가장 많이 보이는 카드"로 결정한다.
  // (IntersectionObserver의 '진입 시에만 갱신' 방식은 이미지 비동기 로드로 인한
  //  레이아웃 리플로우 때 엉뚱한 페이지에 박제되는 버그가 있어 폐기.)
  const [currentPage, setCurrentPage] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageRafRef = useRef(0);
  const recomputeCurrentPage = useCallback(() => {
    if (pageRafRef.current) return;
    pageRafRef.current = requestAnimationFrame(() => {
      pageRafRef.current = 0;
      const root = scrollerRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      let best = 0;
      let bestOverlap = -1;
      root.querySelectorAll<HTMLElement>("[data-page-index]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const overlap =
          Math.min(r.bottom, rootRect.bottom) - Math.max(r.top, rootRect.top);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = Number(el.dataset.pageIndex) || 0;
        }
      });
      setCurrentPage((p) => (p === best ? p : best));
    });
  }, []);
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    recomputeCurrentPage();
    root.addEventListener("scroll", recomputeCurrentPage, { passive: true });
    let ro: ResizeObserver | undefined;
    const content = contentRef.current;
    if (content && typeof ResizeObserver !== "undefined") {
      // 이미지 비동기 로드/줌 변경으로 내용 높이가 바뀌면 다시 계산.
      ro = new ResizeObserver(() => recomputeCurrentPage());
      ro.observe(content);
    }
    return () => {
      root.removeEventListener("scroll", recomputeCurrentPage);
      ro?.disconnect();
      if (pageRafRef.current) cancelAnimationFrame(pageRafRef.current);
    };
  }, [recomputeCurrentPage, images.length, contentWidth]);
  const scrollToPage = useCallback((i: number) => {
    scrollerRef.current
      ?.querySelector<HTMLElement>(`[data-page-index="${i}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  const showThumbs = images.length >= 2;

  // 제거된 이미지의 잔여 상태 정리(위생). flat은 현재 images만 읽어 카운트는 무관.
  useEffect(() => {
    const ids = new Set(images.map((i) => i.slotId).filter(Boolean));
    setBoxesBySlot((prev) => {
      const keys = Object.keys(prev);
      if (keys.every((k) => ids.has(k))) return prev;
      const next: Record<string, CropBox[]> = {};
      for (const k of keys) if (ids.has(k)) next[k] = prev[k];
      return next;
    });
    setGroupsBySlot((prev) => {
      const keys = Object.keys(prev);
      if (keys.every((k) => ids.has(k))) return prev;
      const next: Record<string, number[]> = {};
      for (const k of keys) if (ids.has(k)) next[k] = prev[k];
      return next;
    });
  }, [images]);

  // 모든 박스를 (이미지순, 박스순) 평탄화.
  const flat = useMemo<FlatEntry[]>(() => {
    const out: FlatEntry[] = [];
    images.forEach((img, imageOrder) => {
      const sid = img.slotId;
      if (!sid) return;
      const bs = boxesBySlot[sid] ?? [];
      const gs = groupsBySlot[sid] ?? [];
      bs.forEach((box, j) => {
        out.push({ slotId: sid, imageOrder, j, box, group: gs[j] ?? 0 });
      });
    });
    return out;
  }, [images, boxesBySlot, groupsBySlot]);

  const maxGroup = useMemo(
    () => flat.reduce((m, e) => Math.max(m, e.group), 0),
    [flat],
  );
  // 표시 번호 = 등장 그룹 정렬 1..K (삭제로 생긴 빈 번호 메움). 캔버스·검수·베이크 동일.
  const groupRank = useMemo(() => {
    const ids = Array.from(new Set(flat.map((e) => e.group))).sort(
      (a, b) => a - b,
    );
    const m = new Map<number, number>();
    ids.forEach((g, i) => m.set(g, i + 1));
    return m;
  }, [flat]);
  const passageCount = groupRank.size;
  const uncroppedIdx = useMemo(() => {
    const out: number[] = [];
    images.forEach((img, i) => {
      const bs = img.slotId ? boxesBySlot[img.slotId] : undefined;
      if (!bs || bs.length === 0) out.push(i);
    });
    return out;
  }, [images, boxesBySlot]);
  // 영역으로 그린 지문만 추출. 영역이 없는 페이지는 추출하지 않는다(통째 자동포함 제거).
  const totalPassages = passageCount;

  // 검수 패널 데이터: 지문(그룹) 단위 + 조각(읽기순). 통째 이미지는 별도.
  const passages = useMemo(() => {
    const byGroup = new Map<number, FlatEntry[]>();
    for (const e of flat) {
      const arr = byGroup.get(e.group);
      if (arr) arr.push(e);
      else byGroup.set(e.group, [e]);
    }
    return Array.from(byGroup.keys())
      .sort((a, b) => a - b)
      .map((g) => ({
        group: g,
        rank: groupRank.get(g) ?? g,
        pieces: byGroup.get(g)!.slice().sort(readingSort),
      }));
  }, [flat, groupRank]);

  // 카운트 통지 — 숫자 변화 시에만.
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const counts = useMemo<InlineCropBoardCounts>(
    () => ({
      regionCount: flat.length,
      passageCount,
      uncroppedCount: uncroppedIdx.length,
      totalPassages,
    }),
    [flat.length, passageCount, uncroppedIdx.length, totalPassages],
  );
  useEffect(() => {
    onCountChangeRef.current?.(counts);
  }, [counts]);

  // 전역 그룹 재정규화: entries 순서대로 1..K. slotId별 구조로 되돌려 set.
  const applyRenumber = useCallback((entries: FlatEntry[]) => {
    const renumbered = renumber(entries.map((e) => e.group));
    setGroupsBySlot((prev) => {
      const next: Record<string, number[]> = {};
      for (const sid of Object.keys(prev)) next[sid] = [...prev[sid]];
      entries.forEach((e, idx) => {
        if (!next[e.slotId]) next[e.slotId] = [];
        next[e.slotId][e.j] = renumbered[idx];
      });
      return next;
    });
  }, []);

  // CropCanvas 박스 변경 동기화 — 추가=새 지문, 삭제=그룹 제거, 이동/리사이즈=불변.
  const handleBoxesChange = useCallback(
    (sid: string, nextBoxes: CropBox[]) => {
      const prev = boxesBySlot[sid] ?? [];
      const prevGroups = groupsBySlot[sid] ?? [];
      let nextGroups: number[];
      if (nextBoxes.length > prev.length) {
        nextGroups = [...prevGroups, maxGroup + 1];
      } else if (nextBoxes.length < prev.length) {
        const removedIdx = prev.findIndex((b) => !nextBoxes.includes(b));
        nextGroups =
          removedIdx >= 0
            ? prevGroups.filter((_, k) => k !== removedIdx)
            : prevGroups.slice(0, nextBoxes.length);
      } else {
        nextGroups = prevGroups;
      }
      setBoxesBySlot((cur) => ({ ...cur, [sid]: nextBoxes }));
      setGroupsBySlot((cur) => ({ ...cur, [sid]: nextGroups }));
    },
    [boxesBySlot, groupsBySlot, maxGroup],
  );

  // 지문(그룹) 통째 삭제 — 그 그룹의 모든 조각 제거.
  const deleteGroup = useCallback(
    (group: number) => {
      setSelectedGroups((p) => p.filter((g) => g !== group));
      setActive(null);
      setBoxesBySlot((cur) => {
        const next: Record<string, CropBox[]> = {};
        for (const sid of Object.keys(cur)) {
          const gs = groupsBySlot[sid] ?? [];
          next[sid] = cur[sid].filter((_, j) => gs[j] !== group);
        }
        return next;
      });
      setGroupsBySlot((cur) => {
        const next: Record<string, number[]> = {};
        for (const sid of Object.keys(cur)) {
          next[sid] = cur[sid].filter((g) => g !== group);
        }
        return next;
      });
    },
    [groupsBySlot],
  );

  // 선택한 지문들을 한 지문으로 합치기(이미지·조각 경계 무관).
  const mergeSelected = useCallback(() => {
    if (selectedGroups.length < 2) return;
    const sel = new Set(selectedGroups);
    const target = Math.min(...selectedGroups);
    applyRenumber(
      flat.map((e) => (sel.has(e.group) ? { ...e, group: target } : e)),
    );
    setSelectedGroups([]);
  }, [selectedGroups, flat, applyRenumber]);

  // 한 지문(여러 조각)을 조각마다 별개 지문으로 분리.
  const splitGroup = useCallback(
    (group: number) => {
      let nextId = maxGroup;
      applyRenumber(
        flat.map((e) => (e.group === group ? { ...e, group: ++nextId } : e)),
      );
      setSelectedGroups([]);
    },
    [flat, maxGroup, applyRenumber],
  );

  const toggleGroupSel = useCallback((group: number) => {
    setSelectedGroups((p) =>
      p.includes(group) ? p.filter((g) => g !== group) : [...p, group],
    );
  }, []);

  const buildPassageSlots = useCallback(async (): Promise<
    ClientPageSlot[] | null
  > => {
    if (totalPassages === 0) {
      setError("추출할 지문이 없습니다. 이미지를 추가하거나 영역을 그려 주세요.");
      return null;
    }
    if (totalPassages > maxPassages) {
      setError(
        `지문이 너무 많습니다 (${totalPassages}개). 한 작업에는 최대 ${maxPassages}개까지 넣을 수 있습니다.`,
      );
      return null;
    }
    setBusy(true);
    setError(null);
    // 베이크 previewUrl은 어디에도 렌더되지 않으므로(검수는 원본 CSS 크롭) 끝나면 정리.
    const createdUrls: string[] = [];
    try {
      const slots: ClientPageSlot[] = [];
      const groupIds = Array.from(new Set(flat.map((e) => e.group))).sort(
        (a, b) => a - b,
      );
      const rankOf = new Map(groupIds.map((g, i) => [g, i + 1]));
      for (const g of groupIds) {
        const rank = rankOf.get(g) ?? g;
        const items = flat.filter((e) => e.group === g).sort(readingSort);
        if (items.length === 0) continue;
        const crops = await Promise.all(
          items.map((it) => cropImageToBlob(images[it.imageOrder].blob, it.box)),
        );
        crops.forEach((c) => createdUrls.push(c.previewUrl));
        if (crops.length === 1) {
          const c = crops[0];
          slots.push({
            pageIndex: 0,
            blob: c.blob,
            previewUrl: "",
            bytes: c.blob.size,
            width: c.width,
            height: c.height,
            sourceFileName: `지문 ${rank}`,
            kind: "crop",
            regionIndex: rank,
          });
        } else {
          const stitched = await stitchSlotsToBlob(
            crops.map((c) => c.blob),
            { maxWidth: 2480 },
          );
          createdUrls.push(stitched.previewUrl);
          slots.push({
            pageIndex: 0,
            blob: stitched.blob,
            previewUrl: "",
            bytes: stitched.blob.size,
            width: stitched.width,
            height: stitched.height,
            sourceFileName: `지문 ${rank} (${crops.length}조각 이어붙임)`,
            kind: "merged",
            regionCount: crops.length,
          });
        }
      }
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
      setBusy(false);
      return slots;
    } catch (err) {
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
      setError(
        err instanceof Error ? err.message : "영역을 잘라내지 못했습니다.",
      );
      setBusy(false);
      return null;
    }
  }, [totalPassages, maxPassages, flat, images]);

  useImperativeHandle(ref, () => ({ buildPassageSlots }), [buildPassageSlots]);

  const locked = disabled || busy;
  // 캔버스: 가용 폭에 맞춰 이미지 카드를 자동 다열로(자리 넓으면 2열↑). 줌인해서
  // 카드가 컨테이너보다 커지면 1열 + 가로 스크롤(중앙 정렬은 좌측 잘림이라 해제).
  const CANVAS_GAP = 12;
  const canvasCols = Math.max(
    1,
    Math.floor((availWidth + CANVAS_GAP) / (contentWidth + CANVAS_GAP)),
  );
  const canvasOverflow = contentWidth > availWidth;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {/* ── 페이지 썸네일 레일 (lg+) — 현재 페이지 하이라이트 + 클릭 점프 ── */}
      {showThumbs && thumbsOpen ? (
        <div
          className="hidden shrink-0 flex-col border-r border-slate-100 bg-slate-50 lg:flex"
          style={{ width: 96 }}
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-100 px-2">
            <span className="text-[10.5px] font-bold text-slate-500">페이지</span>
            <button
              type="button"
              onClick={toggleThumbs}
              title="페이지 목록 닫기"
              aria-label="페이지 목록 닫기"
              className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
            {images.map((img, i) => {
              const isCur = i === currentPage;
              return (
                <button
                  key={img.slotId ?? i}
                  type="button"
                  onClick={() => scrollToPage(i)}
                  title={`${i + 1}페이지로 이동`}
                  className={
                    "relative block w-full cursor-pointer overflow-hidden rounded-md border bg-white transition-colors " +
                    (isCur
                      ? "border-blue-500 ring-2 ring-blue-300"
                      : "border-slate-200 hover:border-blue-300")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl}
                    alt={`${i + 1}페이지`}
                    className="block max-h-28 w-full bg-white object-contain"
                    draggable={false}
                  />
                  <span
                    className={
                      "absolute left-1 top-1 inline-flex size-4 items-center justify-center rounded text-[9px] font-bold " +
                      (isCur ? "bg-blue-600 text-white" : "bg-slate-900/70 text-white")
                    }
                  >
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : showThumbs ? (
        <button
          type="button"
          onClick={toggleThumbs}
          title="페이지 목록 열기"
          aria-label="페이지 목록 열기"
          className="hidden shrink-0 cursor-pointer flex-col items-center gap-1 border-r border-slate-100 bg-slate-50 px-1 py-2 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 lg:flex"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span style={{ writingMode: "vertical-rl" }}>페이지</span>
        </button>
      ) : null}

      {/* ── 가운데: 원본 캔버스(줌) ─────────────────────────────────── */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 lg:border-b-0">
        <PreviewZoomControls
          zoom={zoom}
          position={ctrlPos}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={zoomReset}
          onFit={zoomFit}
          onDragStart={onCtrlDrag}
        />
        <div
          ref={scrollerRef}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            if (!locked) setDropActive(true);
          }}
          onDragLeave={(event) => {
            const next = event.relatedTarget as Node | null;
            if (!next || !event.currentTarget.contains(next)) setDropActive(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDropActive(false);
            if (!locked && event.dataTransfer.files.length > 0)
              onAddFiles(event.dataTransfer.files);
          }}
          className={
            "min-h-0 flex-1 overflow-auto bg-slate-100/70 px-3.5 py-3 " +
            (dropActive ? "ring-2 ring-inset ring-sky-400" : "")
          }
        >
          {flat.length === 0 && hintOpen ? (
            <div
              className={
                "mx-auto mb-3 flex max-w-md items-start gap-2 rounded-md border px-3 py-2 text-[11.5px] leading-relaxed " +
                (isRestored
                  ? "border-blue-200 bg-blue-50 text-slate-700"
                  : "border-blue-100 bg-blue-50/90 text-slate-600")
              }
            >
              {isRestored ? (
                <Bot className="mt-0.5 size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
              ) : (
                <Crop className="mt-0.5 size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
              )}
              {isRestored ? (
                <span className="min-w-0 flex-1">
                  지문만 드래그하지 말고{" "}
                  <b className="font-bold text-blue-700">지문 + 문제 + 선지</b>를
                  함께 <b className="font-bold text-blue-700">드래그</b>해 한 영역으로
                  잡으세요.
                  <br />
                  그래야 AI가 문제를 풀어 빈칸·순서를{" "}
                  <b className="font-bold text-blue-700">원래 지문으로 복원</b>합니다.
                  <br />
                  <span className="text-slate-400">(지문만 잘라내면 복원되지 않아요)</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1">
                  지문 부분을 <b className="font-bold text-blue-700">드래그</b>해
                  영역으로 잡으면, 그 부분만 글자를 읽어 지문 1개로 정리됩니다.
                  <br />
                  이미지가 크면 우측 위{" "}
                  <b className="font-bold text-blue-700">크기 조절</b>로 줄여서 보세요.
                </span>
              )}
              <button
                type="button"
                onClick={dismissHint}
                aria-label="안내 닫기"
                title="이 안내 닫기"
                className="-mr-1 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-blue-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <div
            ref={contentRef}
            className={
              "grid gap-3 " +
              (canvasOverflow ? "justify-start" : "justify-center")
            }
            style={{
              gridTemplateColumns: `repeat(${canvasCols}, ${contentWidth}px)`,
            }}
          >
            {images.map((img, i) => {
              const sid = img.slotId ?? String(i);
              const boxes = boxesBySlot[sid] ?? [];
              const groups = groupsBySlot[sid] ?? [];
              const isUncropped = boxes.length === 0;
              const isDragging = dragOrder === i;
              const isDropTarget = dropOrder === i && dragOrder !== i;
              return (
                <div
                  key={sid}
                  data-page-index={i}
                  onDragOver={(event) => {
                    if (dragOrder === null) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    if (dropOrder !== i) setDropOrder(i);
                  }}
                  onDrop={(event) => {
                    if (dragOrder === null) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (dragOrder !== i) onReorderImages(dragOrder, i);
                    setDragOrder(null);
                    setDropOrder(null);
                  }}
                  className={
                    "overflow-hidden rounded-lg border bg-white shadow-sm transition-all " +
                    (isDragging
                      ? "border-blue-300 opacity-40 "
                      : isDropTarget
                        ? "border-blue-500 ring-2 ring-blue-200 "
                        : "border-slate-200 ")
                  }
                >
                  <div className="flex h-8 items-center gap-1.5 border-b border-slate-100 bg-white px-2">
                    <span
                      draggable={!locked}
                      onDragStart={(event) => {
                        if (locked) return;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(i));
                        setDragOrder(i);
                      }}
                      onDragEnd={() => {
                        setDragOrder(null);
                        setDropOrder(null);
                      }}
                      title="드래그해 순서 변경"
                      aria-label="순서 변경 핸들"
                      className={
                        "inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 " +
                        (locked
                          ? "cursor-not-allowed"
                          : "cursor-grab active:cursor-grabbing")
                      }
                    >
                      <GripVertical className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {i + 1}장
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700">
                      {img.sourceFileName ?? `${i + 1}페이지`}
                    </span>
                    {isUncropped ? (
                      <span className="inline-flex shrink-0 items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200">
                        영역 없음
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                        영역 {boxes.length}개
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveImage(i)}
                      disabled={locked}
                      aria-label={`${i + 1}장 삭제`}
                      title="이 이미지 삭제"
                      className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <CropCanvas
                    fit="width"
                    imageUrl={img.previewUrl}
                    boxes={boxes}
                    onChange={(next) => handleBoxesChange(sid, next)}
                    activeIndex={active?.slotId === sid ? active.j : null}
                    onActiveIndexChange={(j) =>
                      setActive(j === null ? null : { slotId: sid, j })
                    }
                    disabled={locked}
                    regionLabels={groups.map((g) => String(groupRank.get(g) ?? g))}
                  />
                </div>
              );
            })}

          </div>
        </div>

        {/* 좌측 하단 고정: 이미지·PDF 더 추가 (우측 추출 시작 버튼과 높이 정렬) */}
        <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
          <label
            className={
              "flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 text-[14px] font-extrabold transition-colors " +
              (locked
                ? "cursor-not-allowed border-slate-200 text-slate-300"
                : "cursor-pointer border-blue-500 bg-white text-blue-700 hover:bg-blue-50")
            }
          >
            <input
              ref={addInputRef}
              type="file"
              className="sr-only"
              accept={ACCEPTED.join(",")}
              multiple
              disabled={locked}
              onChange={(event) => {
                if (event.target.files) onAddFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <ImagePlus className="size-5" aria-hidden="true" />
            이미지·PDF 더 추가
          </label>
        </div>
      </div>

      {/* ── 좌우 폭 조절 핸들 (lg+) — 검수 패널을 좌우로 끌어 폭 조절 ── */}
      <button
        type="button"
        onPointerDown={beginReviewResize}
        title="드래그하여 검수 패널 폭 조절"
        aria-label="검수 패널 폭 조절"
        className="group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
      >
        <GripVertical
          className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
          aria-hidden="true"
        />
        <span style={{ writingMode: "vertical-rl" }}>추출 지문</span>
      </button>

      {/* ── 우: 추출될 지문 검수 ────────────────────────────────────── */}
      <aside
        style={{ width: reviewWidth }}
        className="flex min-h-0 flex-col border-t border-slate-100 bg-white max-lg:!w-full lg:shrink-0 lg:border-t-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
            <Layers className="size-4 text-blue-600" aria-hidden="true" />
            추출될 지문 {totalPassages}개
          </span>
          <span className="text-[10.5px] text-slate-400">
            영역 {flat.length}개
          </span>
        </div>

        {/* 합치기 동선 — 버튼을 항상 노출하고 단계별로 안내(선택 0/1/2+개). */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3.5 py-2">
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] leading-snug text-slate-500">
            <Layers
              className="size-3.5 shrink-0 text-blue-600"
              aria-hidden="true"
            />
            <span className="min-w-0">
              {selectedGroups.length >= 2 ? (
                <b className="font-bold text-blue-700">
                  선택한 {selectedGroups.length}개를 이어붙여 한 지문으로
                </b>
              ) : selectedGroups.length === 1 ? (
                <>
                  1개 선택됨 ·{" "}
                  <b className="font-bold text-slate-700">하나 더 고르면</b> 합칠
                  수 있어요
                </>
              ) : (
                <>
                  한 지문이{" "}
                  <b className="font-bold text-slate-700">여러 장·조각에 걸치면</b>
                  , 아래 지문 카드 왼쪽 <b className="font-bold text-slate-700">☑</b>를
                  2개 이상 고르세요
                </>
              )}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {selectedGroups.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedGroups([])}
                disabled={locked}
                className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                해제
              </button>
            ) : null}
            <button
              type="button"
              onClick={mergeSelected}
              disabled={selectedGroups.length < 2 || locked}
              title={
                selectedGroups.length < 2
                  ? "합칠 지문 카드를 2개 이상 선택하세요"
                  : "선택한 지문을 하나로 이어붙입니다"
              }
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <Layers className="size-3.5" aria-hidden="true" />한 지문으로 합치기
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
          {/* 작동 흐름 안내 — 아직 영역을 안 그렸을 때(통째만 있을 때 포함).
              AI 복원 모드면 "지문만"이 아니라 "지문+문제+선지 함께 크롭→AI 복원"으로 안내. */}
          {flat.length === 0 ? (
            <div
              className={
                "mb-2.5 rounded-lg border bg-white p-3 " +
                (isRestored ? "border-blue-200" : "border-blue-100")
              }
            >
              <div className="mb-2.5 flex items-center justify-center gap-1">
                {(isRestored
                  ? [
                      { icon: Crop, label: "함께 크롭" },
                      { icon: Bot, label: "AI 문제풀이" },
                      { icon: FileText, label: "원문 복원" },
                    ]
                  : [
                      { icon: Crop, label: "영역 드래그" },
                      { icon: ScanText, label: "글자 인식" },
                      { icon: FileText, label: "지문 1개" },
                    ]
                ).map((step, idx) => (
                  <div key={step.label} className="flex items-center gap-1">
                    {idx > 0 ? (
                      <ArrowRight
                        className="size-3.5 shrink-0 text-slate-300"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="flex flex-col items-center gap-1">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                        <step.icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-[10px] font-bold text-slate-600">
                        {step.label}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              {isRestored ? (
                <>
                  <p className="text-center text-[13px] leading-relaxed text-slate-600">
                    왼쪽 이미지에서{" "}
                    <b className="font-bold text-blue-700">
                      지문 + 문제 + 선지를 함께 드래그
                    </b>
                    하세요.
                    <br />
                    AI가 문제를 풀어 빈칸·순서를{" "}
                    <b className="font-bold text-blue-700">원래 글로 복원</b>해 여기에
                    크게 보여줍니다.
                  </p>
                  <p className="mt-1.5 text-center text-[10.5px] text-slate-400">
                    지문만 잘라내면 복원되지 않아요. 영역이 없는 페이지는 추출되지
                    않아요. (지문당 ◈2)
                  </p>
                </>
              ) : (
                <>
                  <p className="text-center text-[11px] leading-relaxed text-slate-600">
                    왼쪽 이미지에서{" "}
                    <b className="font-bold text-blue-700">지문 부분을 드래그</b>하면, 그
                    영역만 글자를 읽어{" "}
                    <b className="font-bold text-blue-700">지문 1개</b>로 정리해 여기에
                    크게 보여줍니다.
                  </p>
                  <p className="mt-1.5 text-center text-[10.5px] text-slate-400">
                    영역을 그린 만큼만 지문으로 추출됩니다. 영역이 없는 페이지는
                    추출되지 않아요.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {/* 크롭으로 정의된 지문들 — 폭이 넓으면 자동 2열↑ (높이 균형 위해 컬럼 흐름) */}
          {passages.length > 0 ? (
            <div className="columns-[260px] gap-2.5">
              {passages.map((p) => {
                const selected = selectedGroups.includes(p.group);
                const multi = p.pieces.length > 1;
                return (
                  <div
                    key={`g-${p.group}`}
                    className={
                      "mb-2.5 break-inside-avoid overflow-hidden rounded-lg border bg-white transition-all " +
                      (selected
                        ? "border-blue-500 ring-2 ring-blue-300"
                        : "border-slate-200 hover:border-slate-300")
                    }
                  >
                <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroupSel(p.group)}
                    disabled={locked}
                    aria-pressed={selected}
                    aria-label={`지문 ${p.rank} 합치기 선택`}
                    className={
                      "inline-flex size-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors " +
                      (selected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-transparent hover:border-blue-400")
                    }
                  >
                    ✓
                  </button>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    지문 {p.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-500">
                    {multi
                      ? `${p.pieces.length}개 영역을 이어붙인 지문`
                      : `${p.pieces[0].imageOrder + 1}장에서 자른 지문`}
                  </span>
                  {multi ? (
                    <button
                      type="button"
                      onClick={() => splitGroup(p.group)}
                      disabled={locked}
                      title="조각마다 별개 지문으로 분리"
                      className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    >
                      <Scissors className="size-3" aria-hidden="true" />
                      분리
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deleteGroup(p.group)}
                    disabled={locked}
                    aria-label={`지문 ${p.rank} 삭제`}
                    title="이 지문 삭제"
                    className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                {/* 실제 잘린 모습 — 큰 미리보기(정확한 비율, 검수용) */}
                <div className="space-y-1.5 bg-slate-100/60 p-2">
                  {p.pieces.map((piece) => {
                    const img = images[piece.imageOrder];
                    if (!img) return null;
                    return (
                      <div
                        key={`${piece.slotId}-${piece.j}`}
                        className="relative w-full overflow-hidden rounded border border-slate-200 bg-white"
                        style={{
                          aspectRatio: cropAspect(img, piece.box),
                          ...cropBgStyle(img.previewUrl, piece.box),
                        }}
                      >
                        {multi ? (
                          <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                            {piece.imageOrder + 1}장
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="flex shrink-0 items-start gap-1.5 border-t border-slate-100 bg-red-50 px-3.5 py-2 text-[10.5px] font-medium leading-relaxed text-red-600">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        {/* 검수 패널 하단 = 추출 시작(부모가 주입). */}
        {footer ? (
          <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
});
