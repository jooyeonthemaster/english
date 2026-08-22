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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Hand,
  Layers,
  MousePointer2,
  Plus,
  Scissors,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react";

import {
  PreviewZoomControls,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import { ACCEPTED } from "../../bulk-extract-client/constants";
import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";
import { CropCanvas, type CropCanvasChangeMeta } from "./crop-canvas";
import { cropImageToBlob, stitchSlotsToBlob } from "./crop-utils";
import { triggerHintGlowWithin } from "@/lib/hint-glow";

export interface InlineCropBoardHandle {
  /** 현재 박스/그룹을 실제 지문 슬롯으로 굽는다(추출 시작 직전 1회). 빈/초과면 null. */
  buildPassageSlots: () => Promise<ClientPageSlot[] | null>;
  /** '추출 시작'이 비활(지문 0개/초과)일 때 호출 — 좌측 원본 페이지 카드를 글로우해
   *  "여기서 지문 영역을 드래그하세요"를 유도한다. */
  hintDragArea: () => void;
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

interface PassageSelectDragState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface PassageSelectDragSession extends PassageSelectDragState {
  baseSelected: number[];
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

function CropHintMiniDemo({ restored }: { restored: boolean }) {
  return (
    <div
      className="smoat-crop-hint-demo relative h-[80px] w-[124px] shrink-0 overflow-hidden rounded-md border border-blue-100 bg-white/75 shadow-sm backdrop-blur-[1px]"
      aria-hidden="true"
    >
      <div className="absolute left-0 top-0 h-[92px] w-[142px] origin-top-left scale-[0.873]">
        <div className="absolute inset-x-2 top-2 h-2 rounded bg-slate-200" />
        <div className="absolute left-3 top-[22px] h-[32px] w-[70px] rounded border border-blue-200 bg-blue-50/85 p-1.5">
          <span className="mb-1 inline-flex h-2 items-center rounded bg-blue-600 px-1 text-[6px] font-black leading-none text-white">
            지문
          </span>
          {[0.92, 0.78, 0.86].map((w, i) => (
            <span
              key={i}
              className="mb-1 block h-1 rounded-full bg-blue-200"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>
        <div className="absolute right-3 top-[22px] h-[22px] w-[38px] rounded border border-slate-200 bg-slate-50 p-1">
          {[0.82, 0.62].map((w, i) => (
            <span
              key={i}
              className="mb-1 block h-1 rounded-full bg-slate-200"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>
        <div className="absolute left-3 top-[61px] h-[18px] w-[70px] rounded border border-emerald-200 bg-emerald-50/90 px-1 py-0.5">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="inline-flex h-2 items-center rounded bg-emerald-600 px-1 text-[6px] font-black leading-none text-white">
              문제
            </span>
            <span className="h-1 w-7 rounded-full bg-emerald-200" />
          </div>
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex items-center gap-0.5">
                <span className="size-1.5 rounded-full border border-emerald-300 bg-white" />
                <span className="h-1 w-2.5 rounded-full bg-emerald-200" />
              </span>
            ))}
          </div>
        </div>
        <div className="absolute right-3 top-[51px] grid w-[38px] gap-1">
          {[0.95, 0.72, 0.86].map((w, i) => (
            <span
              key={i}
              className="block h-1 rounded-full bg-slate-200"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>

        <div
          className={
            "smoat-crop-hint-demo__selection " +
            (restored
              ? "smoat-crop-hint-demo__selection--restored"
              : "smoat-crop-hint-demo__selection--plain")
          }
        />
        <MousePointer2
          className={
            "smoat-crop-hint-demo__cursor size-4 text-slate-900 " +
            (restored
              ? "smoat-crop-hint-demo__cursor--restored"
              : "smoat-crop-hint-demo__cursor--plain")
          }
        />
        <span
          className={
            "smoat-crop-hint-demo__pulse " +
            (restored
              ? "smoat-crop-hint-demo__pulse--restored"
              : "smoat-crop-hint-demo__pulse--plain")
          }
        />
      </div>

      <style>{`
        .smoat-crop-hint-demo__selection {
          position: absolute;
          left: 12px;
          top: 22px;
          width: 0;
          height: 0;
          border: 2px solid #2563eb;
          border-radius: 5px;
          background: rgba(37, 99, 235, 0.1);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
          opacity: 0;
          pointer-events: none;
        }
        .smoat-crop-hint-demo__cursor {
          position: absolute;
          left: 0;
          top: 0;
          filter: drop-shadow(0 2px 3px rgba(15, 23, 42, 0.28));
          pointer-events: none;
        }
        .smoat-crop-hint-demo__pulse {
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          border: 2px solid rgba(37, 99, 235, 0.35);
          opacity: 0;
          pointer-events: none;
        }
        .smoat-crop-hint-demo__selection--plain {
          animation: crop-hint-select-plain 3.2s ease-in-out infinite;
        }
        .smoat-crop-hint-demo__selection--restored {
          animation: crop-hint-select-restored 3.2s ease-in-out infinite;
        }
        .smoat-crop-hint-demo__cursor--plain {
          animation: crop-hint-cursor-plain 3.2s ease-in-out infinite;
        }
        .smoat-crop-hint-demo__cursor--restored {
          animation: crop-hint-cursor-restored 3.2s ease-in-out infinite;
        }
        .smoat-crop-hint-demo__pulse--plain {
          animation: crop-hint-pulse-plain 3.2s ease-in-out infinite;
        }
        .smoat-crop-hint-demo__pulse--restored {
          animation: crop-hint-pulse-restored 3.2s ease-in-out infinite;
        }
        @keyframes crop-hint-select-plain {
          0%, 12% { width: 0; height: 0; opacity: 0; }
          18% { opacity: 1; }
          56%, 82% { width: 72px; height: 34px; opacity: 1; }
          100% { width: 72px; height: 34px; opacity: 0; }
        }
        @keyframes crop-hint-select-restored {
          0%, 12% { width: 0; height: 0; opacity: 0; }
          18% { opacity: 1; }
          56%, 82% { width: 72px; height: 58px; opacity: 1; }
          100% { width: 72px; height: 58px; opacity: 0; }
        }
        @keyframes crop-hint-cursor-plain {
          0%, 10% { opacity: 0; transform: translate(7px, 15px); }
          16% { opacity: 1; transform: translate(12px, 22px) scale(0.94); }
          56%, 82% { opacity: 1; transform: translate(84px, 56px) scale(1); }
          100% { opacity: 0; transform: translate(84px, 56px); }
        }
        @keyframes crop-hint-cursor-restored {
          0%, 10% { opacity: 0; transform: translate(7px, 15px); }
          16% { opacity: 1; transform: translate(12px, 22px) scale(0.94); }
          56%, 82% { opacity: 1; transform: translate(84px, 80px) scale(1); }
          100% { opacity: 0; transform: translate(84px, 80px); }
        }
        @keyframes crop-hint-pulse-plain {
          0%, 54%, 100% { opacity: 0; transform: translate(75px, 47px) scale(0.5); }
          62% { opacity: 1; transform: translate(75px, 47px) scale(1); }
          78% { opacity: 0; transform: translate(75px, 47px) scale(1.65); }
        }
        @keyframes crop-hint-pulse-restored {
          0%, 54%, 100% { opacity: 0; transform: translate(75px, 71px) scale(0.5); }
          62% { opacity: 1; transform: translate(75px, 71px) scale(1); }
          78% { opacity: 0; transform: translate(75px, 71px) scale(1.65); }
        }
        @keyframes cart-pop {
          0% { transform: scale(1); }
          35% { transform: scale(1.4); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .smoat-crop-hint-demo__selection,
          .smoat-crop-hint-demo__cursor,
          .smoat-crop-hint-demo__pulse {
            animation: none;
          }
          .smoat-crop-hint-demo__selection--plain {
            width: 72px;
            height: 34px;
            opacity: 1;
          }
          .smoat-crop-hint-demo__selection--restored {
            width: 72px;
            height: 58px;
            opacity: 1;
          }
          .smoat-crop-hint-demo__cursor--plain {
            opacity: 1;
            transform: translate(84px, 56px);
          }
          .smoat-crop-hint-demo__cursor--restored {
            opacity: 1;
            transform: translate(84px, 80px);
          }
        }
      `}</style>
    </div>
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
    /** 좌측 작업대 상단 "비우기" — 업로드한 원본 파일 전체 제거. 없으면 버튼 숨김. */
    onClear?: () => void;
    /** P7-D2 출력 방식 — "restored"면 안내문을 "지문+문제+선지 함께 크롭→AI 복원"으로. */
    outputMode?: "verbatim" | "restored";
    /**
     * 모바일(<lg)에서 '담긴 지문' 장바구니 바 + 추출 버튼을 화면 하단에 고정한다.
     * 생성 페이지 스텝 플로우에서만 켜고(그 페이지는 하단 스텝 네비를 숨김), 자료추출·
     * 커스텀·동형 등 다른 호스트는 자체 하단 UI가 있어 기본 false(흐름 내 렌더).
     */
    mobileFixedFooter?: boolean;
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
    onClear,
    outputMode,
    mobileFixedFooter = false,
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
  // 검수 카드 접힘 상태(그룹 번호 기준). 비어 있음=펼침. 재번호 시 reorderPassage가 같이 옮긴다.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(
    () => new Set(),
  );
  // 방금 만들거나 수정한 지문(그룹) — 펼친 뒤 화면에 스크롤해 보여줄 대상. 1회성.
  const [pendingScrollGroup, setPendingScrollGroup] = useState<number | null>(
    null,
  );
  // 막 새로 추가된 지문(그룹) — 우측 카드에 1회성 파란 글로우를 입힌다.
  const [justAddedGroup, setJustAddedGroup] = useState<number | null>(null);
  // 검수(추출될 지문) 패널 스크롤 컨테이너 — 방금 만진 지문을 보이게 스크롤.
  const reviewScrollRef = useRef<HTMLDivElement>(null);
  // 검수 지문 카드 드래그 재정렬(좌측 이미지 카드와 동일한 네이티브 드래그 패턴).
  const [passDragIdx, setPassDragIdx] = useState<number | null>(null);
  const [passDropIdx, setPassDropIdx] = useState<number | null>(null);
  // 검수 지문 카드를 쓸어 선택하는 드래그 셀렉션.
  const [passageSelectDrag, setPassageSelectDrag] =
    useState<PassageSelectDragState | null>(null);
  const passageSelectDragRef = useRef<PassageSelectDragSession | null>(null);
  const bodyUserSelectBeforePassageDrag = useRef("");
  const suppressNextPassageClickRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const locked = disabled || busy;
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dragOrder, setDragOrder] = useState<number | null>(null);
  const [dropOrder, setDropOrder] = useState<number | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);

  // ── 모바일 터치 크롭 모드 ──────────────────────────────────────────────
  // 터치 기기(coarse pointer)에선 손가락 드래그가 기본적으로 페이지 스크롤로
  // 동작한다. 크롭 표면에 touch-action:none 을 걸어야 드래그로 영역을 그린다.
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  // 그리드(coarse+lg, 예: iPad 가로) 세로 스택에서만 쓰는 스크롤↔그리기 토글.
  // 세로 스크롤이 필요한 그리드에선 항상 그리기면 스크롤이 막히므로 남겨둔다.
  const [touchDrawMode, setTouchDrawMode] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // 모바일(<lg): 세로 스택 대신 페이지를 좌우로 넘기는 가로 페이저로 보여준다.
  // 뷰포트 기준(coarse pointer 와 별개 — 좁은 데스크톱 창도 페이저).
  const [isBelowLg, setIsBelowLg] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setIsBelowLg(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  // 모바일 페이저는 세로 스크롤 대신 페이지 스와이프라, 스크롤 모드가 필요 없다.
  // → 페이저(<lg)에선 토글 없이 '항상 영역 그리기'. 그리드에선 토글 값을 따른다.
  const touchDrawActive = isCoarsePointer && (isBelowLg || touchDrawMode);
  // 하단 고정 액션 바 활성(모바일 + 호스트가 요청한 경우만).
  const fixedFooter = mobileFixedFooter && isBelowLg;
  // 모바일 '담긴 지문' 장바구니 시트 펼침 여부.
  const [cartOpen, setCartOpen] = useState(false);

  // ── 줌 (좌측 원본 캔버스) ──────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [baseWidth, setBaseWidth] = useState(420);
  const [availWidth, setAvailWidth] = useState(900);
  const [ctrlPos, setCtrlPos] = useState({ top: 12, right: 12 });
  const primaryImageWidth = images[0]?.width ?? 0;
  const primaryImageHeight = images[0]?.height ?? 0;
  const primaryImageKey =
    images[0]?.slotId ?? images[0]?.previewUrl ?? String(images.length);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.max(1, el.clientWidth - 28); // 좌우 패딩 보정
      setAvailWidth(w);
      const ratio =
        primaryImageWidth > 0 && primaryImageHeight > 0
          ? primaryImageHeight / primaryImageWidth
          : 0;
      if (images.length === 1 && ratio > 0) {
        const CARD_CHROME = 34; // 헤더(32) + 테두리(2)
        const PAD_Y = 24; // 스크롤러 py-3 (위·아래 12)
        const h = Math.max(1, el.clientHeight - PAD_Y - CARD_CHROME);
        setBaseWidth(Math.max(240, Math.min(w, Math.round(h / ratio))));
        return;
      }
      // 다중 페이지는 기존처럼 폭이 넓으면 2열↑이 자연스럽게 잡히도록 둔다.
      setBaseWidth(Math.max(240, Math.min(420, w)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [images.length, primaryImageHeight, primaryImageWidth]);

  useEffect(() => {
    setZoom(1);
  }, [primaryImageKey]);

  const contentWidth = Math.round(baseWidth * zoom);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const zoomIn = () =>
    setZoom((z) => Math.min(PREVIEW_ZOOM_MAX, round2(z + PREVIEW_ZOOM_STEP)));
  const zoomOut = () =>
    setZoom((z) => Math.max(PREVIEW_ZOOM_MIN, round2(z - PREVIEW_ZOOM_STEP)));
  const zoomReset = () => setZoom(1);
  const onCtrlDrag = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>) => {
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
    },
    [ctrlPos],
  );

  // ── 검수 패널 좌우 폭 조절 + 페이지 썸네일 레일 ────────────────────────
  const REVIEW_W_KEY = "smoat:extraction:review-width";
  const THUMBS_KEY = "smoat:extraction:thumbs-open";
  const clampReviewW = (w: number) =>
    Math.min(760, Math.max(300, Math.round(w)));
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

  // 캔버스 작업 힌트 — 닫기는 현재 화면에서만, "다시는 보지 않기"는 localStorage에 저장.
  const HINT_KEY = "smoat:extraction:crop-hint-open";
  const [hintDismissed, setHintDismissed] = useState(false);
  const [hintPermanentlyHidden, setHintPermanentlyHidden] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      return window.localStorage.getItem(HINT_KEY) === "0";
    },
  );
  const hintOpen = !hintDismissed && !hintPermanentlyHidden;
  const closeHint = useCallback(() => {
    setHintDismissed(true);
  }, []);
  const hideHintPermanently = useCallback(() => {
    setHintPermanentlyHidden(true);
    try {
      window.localStorage.setItem(HINT_KEY, "0");
    } catch {
      /* ignore */
    }
  }, []);
  // 우측 검수 패널(aside) 실체 — 드래그 리사이즈 고속 경로가 style.width 를 직접 쓴다.
  const reviewAsideRef = useRef<HTMLElement>(null);
  // 성능 계약(text-input-board 동형): 드래그 중 setState 금지 — 매 pointermove
  // 의 setReviewWidth 는 이 보드 전체(캔버스 페이지 + 검수 카드 수십 장)를
  // 프레임마다 리렌더시켰다. 이동 중에는 aside 의 style.width 에 rAF
  // 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 setState + 영속. 앵커 미발견 시 폴백.
  const beginReviewResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = reviewWidth;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단(캡처 덕에 move 수신은 유지).
      document.body.style.pointerEvents = "none";
      let latest = startW;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
      const handleEl = event.currentTarget as HTMLElement;
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // rAF 코얼레싱 — 스타일 기록은 프레임당 1회.
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (reviewAsideRef.current) {
          reviewAsideRef.current.style.width = `${latest}px`;
        }
      };
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌면 검수 패널이 넓어진다(오른쪽 고정 패널).
        latest = clampReviewW(startW - (e.clientX - startX));
        if (reviewAsideRef.current) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          // 폴백(레거시) — 앵커를 못 찾으면 종전대로 상태 갱신
          setReviewWidth(latest);
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회.
        setReviewWidth(latest);
        // 저장해 둔 이전 값 복원 — 빈 문자열 대입은 남의 잠금까지 지운다.
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          handleEl.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
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
      // 모바일 페이저는 가로 스크롤이라 X축 겹침으로, PC는 세로라 Y축 겹침으로
      // 현재 페이지를 고른다.
      const horizontal = root.dataset.pagerAxis === "x";
      let best = 0;
      let bestOverlap = -1;
      root.querySelectorAll<HTMLElement>("[data-page-index]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const overlap = horizontal
          ? Math.min(r.right, rootRect.right) - Math.max(r.left, rootRect.left)
          : Math.min(r.bottom, rootRect.bottom) - Math.max(r.top, rootRect.top);
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
      if (pageRafRef.current) {
        cancelAnimationFrame(pageRafRef.current);
        // 취소한 rAF는 콜백이 실행되지 않아 스스로 0으로 못 돌아온다. 여기서
        // 반드시 리셋해야 다음 이펙트 실행 후 recompute가 'if(pageRafRef) return'에
        // 영구히 걸려 페이지 인디케이터가 얼어붙는 것을 막는다.
        pageRafRef.current = 0;
      }
    };
  }, [recomputeCurrentPage, images.length, contentWidth]);
  const scrollToPage = useCallback((i: number) => {
    const root = scrollerRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-page-index="${i}"]`);
    if (!root || !el) return;
    // 버튼 이동은 인디케이터를 즉시 갱신(부드러운 스크롤 이벤트를 기다리지 않음).
    setCurrentPage(i);
    // scrollIntoView는 문서까지 포함한 모든 스크롤 조상을 움직여 페이지 전체가 밀린다.
    // 미리보기 컨테이너 안에서만 스크롤하도록 직접 계산해 옮긴다.
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (root.dataset.pagerAxis === "x") {
      const left = elRect.left - rootRect.left + root.scrollLeft;
      root.scrollTo({ left, behavior: "smooth" });
    } else {
      const top = elRect.top - rootRect.top + root.scrollTop;
      root.scrollTo({ top, behavior: "smooth" });
    }
  }, []);
  const showThumbs = images.length >= 2;

  // 화면에 맞추기 — 가로가 아니라 "한 페이지 전체가 세로로 다 들어오게" 맞춘다.
  // 카드 높이 = 테두리(2) + 헤더(h-8=32) + 이미지높이. 이미지높이 = baseWidth·zoom·(h/w).
  // 보이는 영역 높이(스크롤러 clientHeight − py-3) 안에 한 카드가 통째로 들어올 zoom 계산.
  const zoomFit = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const img = images[currentPage] ?? images[0];
    const ratio = img && img.width && img.height ? img.height / img.width : 0;
    if (ratio <= 0) {
      // 비율 정보가 없으면 기존처럼 가로 기준으로 폴백.
      const avail = Math.max(1, el.clientWidth - 28);
      setZoom(
        Math.min(
          PREVIEW_ZOOM_MAX,
          Math.max(PREVIEW_ZOOM_MIN, round2(avail / baseWidth)),
        ),
      );
      return;
    }
    const CARD_CHROME = 34; // 헤더(32) + 테두리(2)
    const PAD_Y = 24; // 스크롤러 py-3 (위·아래 12)
    const availH = Math.max(1, el.clientHeight - PAD_Y - CARD_CHROME);
    const zoomForH = availH / (baseWidth * ratio);
    setZoom(
      Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, round2(zoomForH))),
    );
  }, [images, currentPage, baseWidth]);

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

  // 모바일 장바구니 '담김' 애니메이션 — 지문 수가 늘 때마다 뱃지를 튀긴다.
  const [cartBump, setCartBump] = useState(0);
  const prevTotalRef = useRef(0);
  useEffect(() => {
    if (totalPassages > prevTotalRef.current) setCartBump((n) => n + 1);
    prevTotalRef.current = totalPassages;
  }, [totalPassages]);
  // 목록이 접혀 있으면(모바일) 카드 onAnimationEnd가 오지 않아 glow가 안 풀린다.
  // 타이머로 정리해 상태가 물리지 않게 한다.
  useEffect(() => {
    if (justAddedGroup === null) return;
    const t = window.setTimeout(() => setJustAddedGroup(null), 900);
    return () => window.clearTimeout(t);
  }, [justAddedGroup]);

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

  // 방금 만지거나 만든 지문 카드를 펼친 뒤 검수 패널에서 자연스럽게 스크롤해 보여준다.
  useEffect(() => {
    if (pendingScrollGroup == null) return;
    const root = reviewScrollRef.current;
    const el = root?.querySelector<HTMLElement>(
      `[data-group="${pendingScrollGroup}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setPendingScrollGroup(null);
    }
  }, [pendingScrollGroup, passages]);

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
    (sid: string, nextBoxes: CropBox[], meta?: CropCanvasChangeMeta) => {
      const prev = boxesBySlot[sid] ?? [];
      const prevGroups = groupsBySlot[sid] ?? [];
      let nextGroups: number[];
      // 방금 만들거나(추가) 수정한(이동/리사이즈) 박스가 속한 지문. 우측에서 펼쳐 보여준다.
      let focusGroup: number | null = null;
      if (nextBoxes.length > prev.length) {
        const activeGroup =
          meta?.action === "create" && meta.joinWithActiveGroup && active
            ? groupsBySlot[active.slotId]?.[active.j]
            : undefined;
        const newGroup = activeGroup ?? maxGroup + 1;
        nextGroups = [...prevGroups, newGroup];
        focusGroup = newGroup;
        // 기존 그룹에 합치는 게 아니라 "새 지문"이 만들어질 때만 글로우.
        if (activeGroup === undefined) setJustAddedGroup(newGroup);
        if (meta?.action === "create") {
          dispatchGenerateTourMilestone(
            meta.joinWithActiveGroup && activeGroup !== undefined
              ? "file-crop-joined"
              : "file-crop-first-created",
          );
        }
      } else if (nextBoxes.length < prev.length) {
        const removedIdx = prev.findIndex((b) => !nextBoxes.includes(b));
        nextGroups =
          removedIdx >= 0
            ? prevGroups.filter((_, k) => k !== removedIdx)
            : prevGroups.slice(0, nextBoxes.length);
      } else {
        nextGroups = prevGroups;
        const changedIdx = nextBoxes.findIndex((b, k) => b !== prev[k]);
        if (changedIdx >= 0) focusGroup = prevGroups[changedIdx] ?? null;
      }
      setBoxesBySlot((cur) => ({ ...cur, [sid]: nextBoxes }));
      setGroupsBySlot((cur) => ({ ...cur, [sid]: nextGroups }));
      if (focusGroup != null) {
        // 그 지문만 펼치고 나머지 기존 지문 토글은 모두 닫는다.
        const others = new Set<number>();
        for (const k of Object.keys(groupsBySlot)) {
          if (k === sid) continue;
          for (const g of groupsBySlot[k]) others.add(g);
        }
        for (const g of nextGroups) others.add(g);
        others.delete(focusGroup);
        setCollapsedGroups(others);
        setPendingScrollGroup(focusGroup);
      }
    },
    [active, boxesBySlot, groupsBySlot, maxGroup],
  );

  // 지문(그룹) 통째 삭제 — 그 그룹의 모든 조각 제거.
  const deleteGroup = useCallback(
    (group: number) => {
      setSelectedGroups((p) => p.filter((g) => g !== group));
      setCollapsedGroups((p) => {
        if (!p.has(group)) return p;
        const next = new Set(p);
        next.delete(group);
        return next;
      });
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

  // 선택된 지문(그룹)들을 한 번에 삭제.
  const deleteSelectedGroups = useCallback(() => {
    if (locked || selectedGroups.length === 0) return;

    const selected = new Set(selectedGroups);
    setSelectedGroups([]);
    setCollapsedGroups((p) => {
      const next = new Set(p);
      selected.forEach((group) => next.delete(group));
      return next.size === p.size ? p : next;
    });
    setActive(null);
    setPendingScrollGroup(null);
    setPassDragIdx(null);
    setPassDropIdx(null);
    setBoxesBySlot((cur) => {
      const next: Record<string, CropBox[]> = {};
      for (const sid of Object.keys(cur)) {
        const gs = groupsBySlot[sid] ?? [];
        next[sid] = cur[sid].filter((_, j) => !selected.has(gs[j]));
      }
      return next;
    });
    setGroupsBySlot((cur) => {
      const next: Record<string, number[]> = {};
      for (const sid of Object.keys(cur)) {
        next[sid] = cur[sid].filter((g) => !selected.has(g));
      }
      return next;
    });
  }, [groupsBySlot, locked, selectedGroups]);

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

  // 검수 카드 접기/펴기 토글(그룹 단위).
  const toggleGroupCollapse = useCallback((group: number) => {
    setCollapsedGroups((p) => {
      const next = new Set(p);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // 검수 지문 카드 순서 변경 — 표시 순서(=그룹 번호 오름차순)를 재배치해 추출 순서까지 반영.
  // 핸들을 위/아래 다른 카드 위로 끌어 놓으면 from→to로 끼워 넣고 1..K로 재번호한다.
  const reorderPassage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const order = passages.map((p) => p.group);
      if (
        fromIndex < 0 ||
        fromIndex >= order.length ||
        toIndex < 0 ||
        toIndex >= order.length
      )
        return;
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      const rankByGroup = new Map(order.map((g, i) => [g, i]));
      // 새 표시 순서대로 정렬(안정 정렬이라 그룹 내부 순서는 보존). applyRenumber가
      // 첫 등장 순서대로 1..K를 매기므로 이 정렬이 곧 새 지문 번호가 된다.
      const reordered = flat
        .slice()
        .sort(
          (a, b) =>
            (rankByGroup.get(a.group) ?? 0) - (rankByGroup.get(b.group) ?? 0),
        );
      // 접힘 상태도 같은 매핑(옛 그룹→새 번호)으로 옮겨 카드와 어긋나지 않게 한다.
      const remap = new Map<number, number>();
      let n = 1;
      for (const e of reordered)
        if (!remap.has(e.group)) remap.set(e.group, n++);
      setCollapsedGroups((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set<number>();
        prev.forEach((g) => {
          const m = remap.get(g);
          if (m) next.add(m);
        });
        return next;
      });
      setSelectedGroups([]);
      applyRenumber(reordered);
    },
    [passages, flat, applyRenumber],
  );

  // 전체 선택 — 모든 지문이 이미 선택돼 있으면 해제, 아니면 전부 선택.
  const allGroups = useMemo(() => passages.map((p) => p.group), [passages]);
  const allSelected =
    allGroups.length > 0 && allGroups.every((g) => selectedGroups.includes(g));
  const someSelected = selectedGroups.length > 0;
  const toggleSelectAllGroups = useCallback(() => {
    setSelectedGroups(allSelected ? [] : [...allGroups]);
  }, [allSelected, allGroups]);

  const publishPassageSelectDrag = useCallback(
    (session: PassageSelectDragSession | null) => {
      passageSelectDragRef.current = session;
      setPassageSelectDrag(
        session
          ? {
              active: session.active,
              startX: session.startX,
              startY: session.startY,
              currentX: session.currentX,
              currentY: session.currentY,
            }
          : null,
      );
    },
    [],
  );

  const groupsInPassageSelectRect = useCallback(
    (drag: PassageSelectDragState) => {
      const root = reviewScrollRef.current;
      if (!root) return [];

      const pad = 5;
      const left = Math.min(drag.startX, drag.currentX) - pad;
      const right = Math.max(drag.startX, drag.currentX) + pad;
      const top = Math.min(drag.startY, drag.currentY) - pad;
      const bottom = Math.max(drag.startY, drag.currentY) + pad;
      const hits: number[] = [];

      root
        .querySelectorAll<HTMLElement>("[data-review-passage-group]")
        .forEach((el) => {
          const rect = el.getBoundingClientRect();
          const overlaps =
            rect.right >= left &&
            rect.left <= right &&
            rect.bottom >= top &&
            rect.top <= bottom;
          if (!overlaps) return;

          const group = Number(el.getAttribute("data-review-passage-group"));
          if (Number.isFinite(group)) hits.push(group);
        });

      return hits;
    },
    [],
  );

  const beginPassageSelectDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (locked || passages.length === 0) return;
      if (event.pointerType !== "mouse" || event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (
        !target ||
        target.closest(
          "button,input,textarea,select,label,a,[data-passage-drag-handle]",
        )
      )
        return;

      const root = reviewScrollRef.current;
      if (!root || !root.contains(target)) return;

      bodyUserSelectBeforePassageDrag.current = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const start: PassageSelectDragSession = {
        active: false,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        baseSelected: selectedGroups,
      };
      publishPassageSelectDrag(start);

      const move = (moveEvent: PointerEvent) => {
        const current = passageSelectDragRef.current;
        if (!current) return;

        const dx = moveEvent.clientX - current.startX;
        const dy = moveEvent.clientY - current.startY;
        const active = current.active || Math.hypot(dx, dy) > 5;
        if (!active) return;

        moveEvent.preventDefault();

        const rootRect = root.getBoundingClientRect();
        const edge = 34;
        if (moveEvent.clientY < rootRect.top + edge) {
          root.scrollTop -= 12;
        } else if (moveEvent.clientY > rootRect.bottom - edge) {
          root.scrollTop += 12;
        }

        const next: PassageSelectDragSession = {
          ...current,
          active,
          currentX: moveEvent.clientX,
          currentY: moveEvent.clientY,
        };
        publishPassageSelectDrag(next);

        const hits = groupsInPassageSelectRect(next);
        const merged = new Set([...next.baseSelected, ...hits]);
        setSelectedGroups(allGroups.filter((group) => merged.has(group)));
      };

      const finish = () => {
        const current = passageSelectDragRef.current;
        if (current?.active) {
          suppressNextPassageClickRef.current = true;
          window.setTimeout(() => {
            suppressNextPassageClickRef.current = false;
          }, 200);
        }
        publishPassageSelectDrag(null);
        document.body.style.userSelect =
          bodyUserSelectBeforePassageDrag.current;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [
      allGroups,
      groupsInPassageSelectRect,
      locked,
      passages.length,
      publishPassageSelectDrag,
      selectedGroups,
    ],
  );

  const passageSelectMarqueeStyle = useMemo<React.CSSProperties | null>(() => {
    if (!passageSelectDrag?.active) return null;
    const root = reviewScrollRef.current;
    if (!root) return null;

    const rootRect = root.getBoundingClientRect();
    const left =
      Math.min(passageSelectDrag.startX, passageSelectDrag.currentX) -
      rootRect.left +
      root.scrollLeft;
    const top =
      Math.min(passageSelectDrag.startY, passageSelectDrag.currentY) -
      rootRect.top +
      root.scrollTop;

    return {
      left,
      top,
      width: Math.max(
        2,
        Math.abs(passageSelectDrag.currentX - passageSelectDrag.startX),
      ),
      height: Math.max(
        2,
        Math.abs(passageSelectDrag.currentY - passageSelectDrag.startY),
      ),
    };
  }, [passageSelectDrag]);

  const buildPassageSlots = useCallback(async (): Promise<
    ClientPageSlot[] | null
  > => {
    if (totalPassages === 0) {
      setError(
        "추출할 지문이 없습니다. 이미지를 추가하거나 영역을 그려 주세요.",
      );
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
          items.map((it) =>
            cropImageToBlob(images[it.imageOrder].blob, it.box),
          ),
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

  // 좌측 원본 캔버스의 페이지 카드들을 글로우 — "여기서 지문을 드래그하세요" 유도.
  const hintDragArea = useCallback(() => {
    triggerHintGlowWithin(scrollerRef.current, "[data-page-index]");
  }, []);

  useImperativeHandle(ref, () => ({ buildPassageSlots, hintDragArea }), [
    buildPassageSlots,
    hintDragArea,
  ]);

  // 캔버스: 가용 폭에 맞춰 이미지 카드를 자동 다열로(자리 넓으면 2열↑). 줌인해서
  // 카드가 컨테이너보다 커지면 1열 + 가로 스크롤(중앙 정렬은 좌측 잘림이라 해제).
  const CANVAS_GAP = 12;
  const canvasCols = Math.max(
    1,
    images.length === 1
      ? 1
      : Math.floor((availWidth + CANVAS_GAP) / (contentWidth + CANVAS_GAP)),
  );
  const canvasOverflow = contentWidth > availWidth;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      {/* ── 페이지 썸네일 레일 (lg+) — 현재 페이지 하이라이트 + 클릭 점프 ── */}
      {showThumbs && thumbsOpen ? (
        <div
          className="hidden shrink-0 flex-col border-r border-slate-100 bg-slate-50 lg:flex"
          style={{ width: 96 }}
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-100 px-2">
            <span className="text-[10.5px] font-bold text-slate-500">
              페이지
            </span>
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
                      (isCur
                        ? "bg-blue-600 text-white"
                        : "bg-slate-900/70 text-white")
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
        {/* 줌 컨트롤은 PC 전용 — 모바일 페이저는 페이지를 화면에 자동으로 꽉 맞추므로
            줌이 필요 없다(비우기는 아래 모바일 상단 바로 옮긴다). */}
        {!isBelowLg ? (
          <PreviewZoomControls
            zoom={zoom}
            position={ctrlPos}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={zoomReset}
            onFit={zoomFit}
            onDragStart={onCtrlDrag}
            orientation="vertical"
            extra={
              onClear ? (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={locked}
                  title="업로드한 파일을 모두 비웁니다"
                  aria-label="비우기"
                  className="inline-flex h-5 cursor-pointer items-center justify-center gap-1 rounded px-1 text-[8.5px] font-bold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  비우기
                </button>
              ) : null
            }
          />
        ) : null}
        {flat.length === 0 && hintOpen ? (
          <div className="pointer-events-none absolute left-0 right-0 top-3 z-30 flex justify-center px-4">
            <div
              role="status"
              aria-live="polite"
              className={
                "pointer-events-auto relative flex w-full max-w-[560px] flex-col gap-1.5 rounded-lg border px-2.5 pb-5 pt-1.5 text-left text-[12px] leading-snug shadow-2xl shadow-blue-950/15 ring-1 ring-blue-100/70 backdrop-blur-[2px] sm:flex-row sm:items-start " +
                (isRestored
                  ? "border-blue-200 bg-blue-50/70 text-slate-700"
                  : "border-blue-200 bg-blue-50/65 text-slate-600")
              }
            >
              <span
                aria-hidden="true"
                className={
                  "absolute -bottom-1.5 left-10 h-3 w-3 rotate-45 border-b border-r border-blue-200 backdrop-blur-[2px] " +
                  (isRestored ? "bg-blue-50/70" : "bg-blue-50/65")
                }
              />
              <CropHintMiniDemo restored={isRestored} />
              <div className="min-w-0 flex-1">
                <div className="relative flex items-start gap-2 pr-6">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
                  />
                  <div className="min-w-0 flex-1">
                    {isRestored ? (
                      <>
                        <p className="text-[13px] font-black text-slate-900">
                          문제·선지까지 함께 드래그하세요
                        </p>
                        <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-slate-500">
                          파란 박스처럼{" "}
                          <b className="font-bold text-blue-700">
                            지문 + 문제 + 선지
                          </b>
                          를 잡으면 AI가 원래 지문으로 복원해요.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[13px] font-black text-slate-900">
                          지문 부분을 드래그하세요
                        </p>
                        <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-slate-500">
                          파란 박스처럼 영역을 잡으면 그 부분만 읽어{" "}
                          <b className="font-bold text-blue-700">지문 1개</b>로
                          정리됩니다.
                        </p>
                      </>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-bold leading-snug text-blue-600">
                      <kbd className="rounded border border-blue-200 bg-white/80 px-1 py-0.5 text-[10px] font-black leading-none text-blue-700 shadow-sm">
                        Shift
                      </kbd>
                      <span>
                        누른 채 다음 영역을 그리면 같은 지문에 이어붙어요.
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeHint}
                    className="absolute -right-1 -top-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-100/80 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-label="드래그 안내 닫기"
                    title="안내 닫기"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={hideHintPermanently}
                className="absolute bottom-1 right-2 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold text-blue-600 transition-colors hover:bg-blue-100/80 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                다시는 보지 않기
              </button>
            </div>
          </div>
        ) : null}
        {/* 모바일 전용 상단 바: 안내 + 페이지 인디케이터(가로 페이저).
            스크롤/그리기 토글은 폐지 — 페이저는 항상 '영역 그리기'라 손가락
            드래그로 바로 지문 영역을 잡는다. PC(lg+)는 숨김. */}
        {isBelowLg && images.length > 0 ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-2.5 py-1.5 lg:hidden">
            {isCoarsePointer && !locked ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11.5px] font-bold text-blue-700">
                <Scissors className="size-3.5" aria-hidden="true" />
                드래그해 지문 영역 선택
              </span>
            ) : (
              <span />
            )}
            <div className="inline-flex items-center gap-1.5">
              {images.length >= 2 ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => scrollToPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage <= 0}
                    aria-label="이전 페이지"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-[48px] text-center text-[12px] font-bold tabular-nums text-slate-700">
                    {currentPage + 1} / {images.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      scrollToPage(Math.min(images.length - 1, currentPage + 1))
                    }
                    disabled={currentPage >= images.length - 1}
                    aria-label="다음 페이지"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              {onClear ? (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={locked}
                  title="업로드한 파일을 모두 비웁니다"
                  aria-label="비우기"
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div
          ref={scrollerRef}
          data-pager-axis={isBelowLg ? "x" : "y"}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            if (!locked) setDropActive(true);
          }}
          onDragLeave={(event) => {
            const next = event.relatedTarget as Node | null;
            if (!next || !event.currentTarget.contains(next))
              setDropActive(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDropActive(false);
            if (!locked && event.dataTransfer.files.length > 0)
              onAddFiles(event.dataTransfer.files);
          }}
          className={
            "min-h-0 flex-1 bg-slate-100/70 " +
            (isBelowLg
              ? "snap-x snap-mandatory overflow-x-auto overflow-y-hidden "
              : "overflow-auto px-3.5 py-3 ") +
            (dropActive ? "ring-2 ring-inset ring-sky-400" : "")
          }
        >
          {/* 터치 랩톱(coarse+lg 그리드): 페이저가 아닌 세로 그리드라 토글을
              스크롤러 안에 sticky로 유지한다. 모바일 페이저는 위 상단 바가 담당. */}
          {isCoarsePointer && !isBelowLg && images.length > 0 && !locked ? (
            <div className="sticky top-0 z-30 mb-2 flex justify-center">
              <div
                role="group"
                aria-label="터치 조작 모드"
                className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/95 p-0.5 shadow-md backdrop-blur"
              >
                <button
                  type="button"
                  onClick={() => setTouchDrawMode(false)}
                  aria-pressed={!touchDrawMode}
                  className={
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition-colors " +
                    (!touchDrawMode
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100")
                  }
                >
                  <Hand className="size-3.5" aria-hidden="true" />
                  스크롤
                </button>
                <button
                  type="button"
                  onClick={() => setTouchDrawMode(true)}
                  aria-pressed={touchDrawMode}
                  className={
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition-colors " +
                    (touchDrawMode
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-blue-600 hover:bg-blue-50")
                  }
                >
                  <Scissors className="size-3.5" aria-hidden="true" />
                  영역 그리기
                </button>
              </div>
            </div>
          ) : null}
          <div
            ref={contentRef}
            className={
              isBelowLg
                ? "flex h-full"
                : "grid gap-3 " +
                  (canvasOverflow ? "justify-start" : "justify-center")
            }
            style={
              isBelowLg
                ? undefined
                : {
                    gridTemplateColumns: `repeat(${canvasCols}, ${contentWidth}px)`,
                  }
            }
          >
            {images.map((img, i) => {
              const sid = img.slotId ?? String(i);
              const boxes = boxesBySlot[sid] ?? [];
              const groups = groupsBySlot[sid] ?? [];
              const isUncropped = boxes.length === 0;
              const isDragging = dragOrder === i;
              const isDropTarget = dropOrder === i && dragOrder !== i;
              const canvas = (
                <CropCanvas
                  fit="width"
                  imageUrl={img.previewUrl}
                  boxes={boxes}
                  onChange={(next, meta) => handleBoxesChange(sid, next, meta)}
                  activeIndex={active?.slotId === sid ? active.j : null}
                  onActiveIndexChange={(j) =>
                    setActive(j === null ? null : { slotId: sid, j })
                  }
                  disabled={locked}
                  regionLabels={groups.map((g) =>
                    String(groupRank.get(g) ?? g),
                  )}
                  touchDraw={touchDrawActive}
                  // 키보드가 없는 모바일/터치에선 활성 영역에 삭제 버튼을 노출.
                  showDeleteButton={isBelowLg || touchDrawActive}
                />
              );
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
                    (isBelowLg
                      ? "flex h-full w-full shrink-0 snap-center flex-col "
                      : "") +
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
                    <span
                      className="hidden shrink-0 items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100 lg:inline-flex"
                      title="Shift를 누른 채 새 영역을 그리면 현재 지문에 이어붙입니다"
                    >
                      <kbd className="rounded border border-blue-200 bg-white px-1 text-[9px] font-black leading-none">
                        Shift
                      </kbd>
                      + 드래그
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

                  {isBelowLg ? (
                    // 좌우를 화면 폭에 꽉 채워 최대한 크게 본다. 세로로 길면 이
                    // 영역만 스크롤(페이지 간 이동은 바깥 가로 스냅이 담당).
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100/50">
                      {canvas}
                    </div>
                  ) : (
                    canvas
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 좌측 하단 고정: 이미지·PDF 더 추가 (우측 추출 시작 버튼과 높이 정렬) */}
        <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
          <label
            className={
              "flex h-12 w-full items-center justify-center gap-2 rounded-lg border text-[14px] font-extrabold transition-colors " +
              (locked
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                : "cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100")
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
            <Plus className="size-5" aria-hidden="true" />
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
        ref={reviewAsideRef}
        style={{ width: reviewWidth }}
        className="flex min-h-0 flex-col border-t border-slate-100 bg-white max-lg:!w-full lg:shrink-0 lg:border-t-0"
      >
        {/* 모바일: 장바구니 바 + 추출 버튼을 화면 하단에 고정('내 지문함으로'가
            있던 자리). 목록(cartOpen)은 그 위로 펼쳐진다. PC(lg)는 contents로
            투명 처리해 기존 우측 패널 레이아웃을 그대로 유지. */}
        <div
          className={
            fixedFooter
              ? "fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-10px_rgba(15,23,42,0.28)]"
              : "contents"
          }
        >
        {/* 목록(추출될 지문) — PC는 항상 열림. 모바일은 아래 '담긴 지문' 장바구니
            바를 탭해 cartOpen일 때만 시트로 펼친다. */}
        <div
          className={
            isBelowLg
              ? cartOpen
                ? "flex max-h-[52vh] min-h-0 flex-col border-b border-slate-100"
                : "hidden"
              : "flex min-h-0 flex-1 flex-col"
          }
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={toggleSelectAllGroups}
              disabled={locked || passages.length === 0}
              aria-pressed={allSelected}
              aria-label="지문 전체 선택"
              title={allSelected ? "전체 선택 해제" : "지문 전체 선택"}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={
                  "inline-flex size-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors " +
                  (allSelected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : someSelected
                      ? "border-blue-500 bg-blue-50 text-blue-600"
                      : "border-slate-300 bg-white text-transparent hover:border-blue-400")
                }
              >
                {allSelected ? "✓" : someSelected ? "–" : "✓"}
              </span>
            </button>
            <button
              type="button"
              onClick={deleteSelectedGroups}
              disabled={locked || selectedGroups.length === 0}
              aria-label="선택한 지문 삭제"
              title={
                selectedGroups.length === 0
                  ? "삭제할 지문을 선택하세요"
                  : `선택한 지문 ${selectedGroups.length}개 삭제`
              }
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] leading-snug text-slate-500">
            <span className="min-w-0">
              {selectedGroups.length >= 2 ? (
                <b className="font-bold text-blue-700">
                  선택한 {selectedGroups.length}개를 이어붙여 한 지문으로
                </b>
              ) : selectedGroups.length === 1 ? (
                <>
                  1개 선택됨 ·{" "}
                  <b className="font-bold text-slate-700">하나 더 고르면</b>{" "}
                  합칠 수 있어요
                </>
              ) : (
                <>
                  <b className="font-bold text-slate-700">2개 이상의 지문</b>을
                  선택하여 합치기
                </>
              )}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              // aria-disabled — 비활처럼 보이되 클릭은 살려, 2개 미만일 때 누르면
              // 지문 카드들을 글로우해 "2개 이상 고르세요"를 유도한다.
              aria-disabled={selectedGroups.length < 2 || locked}
              onClick={() => {
                if (locked) return;
                if (selectedGroups.length < 2) {
                  triggerHintGlowWithin(
                    reviewScrollRef.current,
                    "[data-review-passage-group]",
                  );
                  return;
                }
                mergeSelected();
              }}
              title={
                selectedGroups.length < 2
                  ? "합칠 지문 카드를 2개 이상 선택하세요"
                  : "선택한 지문을 하나로 이어붙입니다"
              }
              className={
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[11.5px] font-bold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (selectedGroups.length < 2 || locked
                  ? "cursor-not-allowed bg-blue-300"
                  : "cursor-pointer bg-blue-600 hover:bg-blue-700")
              }
            >
              <Layers className="size-3.5" aria-hidden="true" />한 지문으로
              합치기
            </button>
          </div>
        </div>

        <div
          ref={reviewScrollRef}
          onPointerDown={beginPassageSelectDrag}
          className={
            "relative min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5 " +
            (passageSelectDrag?.active ? "cursor-crosshair select-none" : "")
          }
        >
          {passageSelectMarqueeStyle ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute z-20 rounded-md border border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(37,99,235,0.12)]"
              style={passageSelectMarqueeStyle}
            />
          ) : null}

          {/* 크롭으로 정의된 지문들 — 폭이 넓으면 자동 2열↑ (높이 균형 위해 컬럼 흐름) */}
          {passages.length > 0 ? (
            <div className="columns-[260px] gap-1.5">
              {passages.map((p, idx) => {
                const selected = selectedGroups.includes(p.group);
                const multi = p.pieces.length > 1;
                const collapsed = collapsedGroups.has(p.group);
                const isDragging = passDragIdx === idx;
                const isDropTarget = passDropIdx === idx && passDragIdx !== idx;
                const isJustAdded = p.group === justAddedGroup;
                return (
                  <div
                    key={`g-${p.group}`}
                    data-group={p.group}
                    data-review-passage-group={p.group}
                    onAnimationEnd={(event) => {
                      if (
                        isJustAdded &&
                        event.animationName === "passage-added-glow"
                      ) {
                        setJustAddedGroup(null);
                      }
                    }}
                    onClickCapture={(event) => {
                      if (!suppressNextPassageClickRef.current) return;
                      event.preventDefault();
                      event.stopPropagation();
                      suppressNextPassageClickRef.current = false;
                    }}
                    onDragOver={(event) => {
                      if (passDragIdx === null) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      if (passDropIdx !== idx) setPassDropIdx(idx);
                    }}
                    onDrop={(event) => {
                      if (passDragIdx === null) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (passDragIdx !== idx) reorderPassage(passDragIdx, idx);
                      setPassDragIdx(null);
                      setPassDropIdx(null);
                    }}
                    className={
                      "mb-1.5 break-inside-avoid overflow-hidden rounded-lg border bg-white transition-all " +
                      (isDragging
                        ? "border-blue-300 opacity-40 "
                        : isDropTarget
                          ? "border-blue-500 ring-2 ring-blue-200 "
                          : selected
                            ? "border-blue-500 ring-2 ring-blue-300 "
                            : "border-slate-200 hover:border-slate-300 ") +
                      (passageSelectDrag?.active ? "select-none " : "") +
                      (isJustAdded ? "passage-added-glow " : "")
                    }
                  >
                    <div
                      onClick={() => toggleGroupCollapse(p.group)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={!collapsed}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleGroupCollapse(p.group);
                        }
                      }}
                      title={collapsed ? "지문 펼치기" : "지문 접기"}
                      className="flex cursor-pointer items-center gap-1.5 border-b border-slate-100 px-2 py-1.5 transition-colors hover:bg-slate-50"
                    >
                      <span
                        data-passage-drag-handle="true"
                        draggable={!locked}
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => {
                          if (locked) return;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", String(idx));
                          setPassDragIdx(idx);
                        }}
                        onDragEnd={() => {
                          setPassDragIdx(null);
                          setPassDropIdx(null);
                        }}
                        title="드래그해 지문 순서 변경"
                        aria-label={`지문 ${p.rank} 순서 변경 핸들`}
                        className={
                          "inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 " +
                          (locked
                            ? "cursor-not-allowed"
                            : "cursor-grab active:cursor-grabbing")
                        }
                      >
                        <GripVertical className="size-3.5" aria-hidden="true" />
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleGroupSel(p.group);
                        }}
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
                      <span className="min-w-0 flex-1 truncate px-1 py-0.5 text-left text-[10.5px] text-slate-500">
                        {multi
                          ? `${p.pieces.length}개 영역을 이어붙인 지문`
                          : `${p.pieces[0].imageOrder + 1}장에서 자른 지문`}
                      </span>
                      {multi ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            splitGroup(p.group);
                          }}
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
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteGroup(p.group);
                        }}
                        disabled={locked}
                        aria-label={`지문 ${p.rank} 삭제`}
                        title="이 지문 삭제"
                        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                      {/* 토글 — 항상 섹션 오른쪽 끝에 정렬(접기/펴기). 헤더 전체도 토글되므로 버블 차단. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleGroupCollapse(p.group);
                        }}
                        aria-expanded={!collapsed}
                        aria-label={
                          collapsed
                            ? `지문 ${p.rank} 펼치기`
                            : `지문 ${p.rank} 접기`
                        }
                        title={collapsed ? "지문 펼치기" : "지문 접기"}
                        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                      >
                        <ChevronRight
                          className={
                            "size-3.5 motion-safe:transition-transform motion-safe:duration-150 " +
                            (collapsed ? "" : "rotate-90")
                          }
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    {/* 실제 잘린 모습 — 큰 미리보기(정확한 비율, 검수용). 접으면 헤더만
                        남는다. grid-rows 0fr↔1fr 트릭으로 펼침/접힘을 부드럽게
                        애니메이션한다(새 지문이 들어오며 이전 카드가 닫힐 때 + 토글 시
                        모두 동일). 본문은 항상 DOM 에 두어 닫힐 때도 높이가 줄어든다. */}
                    <div
                      className={
                        "grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-out " +
                        (collapsed
                          ? "grid-rows-[0fr] opacity-0"
                          : "grid-rows-[1fr] opacity-100")
                      }
                    >
                      <div className="min-h-0 overflow-hidden">
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
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        </div>

        {/* ── 모바일 장바구니 바 — '내 지문함' 버튼 바로 위. 담긴 지문 미리보기 +
            개수 뱃지(담길 때 팝). 탭하면 위 목록/합치기 시트를 펼친다. ── */}
        {isBelowLg ? (
          <button
            type="button"
            onClick={() => setCartOpen((o) => !o)}
            aria-expanded={cartOpen}
            aria-label={cartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"}
            className="flex w-full shrink-0 items-center gap-2.5 border-t border-slate-200 bg-white px-3 py-2 text-left lg:hidden"
          >
            <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShoppingBasket className="size-5" aria-hidden="true" />
              {totalPassages > 0 ? (
                <span
                  key={cartBump}
                  className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white [animation:cart-pop_.45s_ease-out]"
                >
                  {totalPassages}
                </span>
              ) : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12.5px] font-bold text-slate-900">
                담긴 지문 {totalPassages}개
              </span>
              <span className="truncate text-[10.5px] text-slate-400">
                {totalPassages > 0
                  ? "탭하여 목록 보기·합치기"
                  : "지문 영역을 드래그해 담아보세요"}
              </span>
            </span>
            <span className="flex shrink-0 -space-x-2">
              {passages.slice(0, 4).map((p) => {
                const piece = p.pieces[0];
                const img = piece ? images[piece.imageOrder] : null;
                if (!img) return null;
                return (
                  <span
                    key={`cart-${p.group}`}
                    className="size-8 overflow-hidden rounded-md border-2 border-white bg-white shadow-sm"
                    style={cropBgStyle(img.previewUrl, piece.box)}
                    aria-hidden="true"
                  />
                );
              })}
              {passages.length > 4 ? (
                <span className="inline-flex size-8 items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-500 shadow-sm">
                  +{passages.length - 4}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={
                "size-4 shrink-0 text-slate-400 transition-transform " +
                (cartOpen ? "rotate-180" : "")
              }
              aria-hidden="true"
            />
          </button>
        ) : null}

        {error ? (
          <div className="flex shrink-0 items-start gap-1.5 border-t border-slate-100 bg-red-50 px-3.5 py-2 text-[10.5px] font-medium leading-relaxed text-red-600">
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}
        {/* 검수 패널 하단 = 추출 시작(부모가 주입). */}
        {footer ? (
          <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
            {footer}
          </div>
        ) : null}
        </div>
      </aside>
    </div>
  );
});
