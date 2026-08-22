"use client";

// ============================================================================
// PDF·이미지 크롭 플레이그라운드 (U1 — .tmp-studio-tour/spec.md §3 demo-crop)
// 투어의 간판 데모 — 좌표를 강박적으로 보여 주는 것이 목적이다. 실 화면 미러:
// Shift 이어붙이기 안내 = inline-crop-board.tsx:1782 title 자구 인용 · 정규화
// 0~1 좌표(소수 4자리) = 실제 크롭 파이프라인의 저장 표기 계약. 순수 목업(서버
// 액션 0 · 스토어 쓰기 0), 드래그 커밋은 rAF 프레임당 1회 + setPointerCapture.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Crosshair, Layers, MousePointerClick } from "lucide-react";
import { DemoBadge, DemoFrame, DemoLines } from "./demo-stage";
import { DEMO_EXAM_ROWS, DEMO_PASSAGE_SENTENCES } from "./demo-data";

/** 크롭 박스 — 좌표는 전부 페이지 기준 0~1 정규화 값으로 보관한다. */
interface CropBox { id: number; x: number; y: number; w: number; h: number }

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type Drag =
  | { mode: "draw"; id: number; ax: number; ay: number; prev: CropBox[] }
  | { mode: "move"; id: number; dx: number; dy: number }
  | { mode: "resize"; id: number; handle: HandleId; start: CropBox };

/** 포인터의 페이지 내 정규화 위치 + 그 시점의 최소 크기(24px 환산). */
interface Point { x: number; y: number; mw: number; mh: number }

/** 박스 최소 변 길이(px) — 실 크롭 보드와 같은 하한. */
const MIN_PX = 24;

/** 초기 프리셋 — 왼쪽 컬럼(18번 문항 자리) 일부를 미리 선택해 둔다. */
const PRESET: CropBox = { id: 1, x: 0.045, y: 0.16, w: 0.42, h: 0.3 };

/** 8개 리사이즈 핸들(모서리 4 + 변 4)의 위치·커서. */
const HANDLES: readonly { id: HandleId; left: number; top: number; cursor: string }[] = [
  { id: "nw", left: 0, top: 0, cursor: "cursor-nwse-resize" },
  { id: "n", left: 50, top: 0, cursor: "cursor-ns-resize" },
  { id: "ne", left: 100, top: 0, cursor: "cursor-nesw-resize" },
  { id: "e", left: 100, top: 50, cursor: "cursor-ew-resize" },
  { id: "se", left: 100, top: 100, cursor: "cursor-nwse-resize" },
  { id: "s", left: 50, top: 100, cursor: "cursor-ns-resize" },
  { id: "sw", left: 0, top: 100, cursor: "cursor-nesw-resize" },
  { id: "w", left: 0, top: 50, cursor: "cursor-ew-resize" },
];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pct = (v: number): string => `${v * 100}%`;

/** 드래그 상태 하나를 박스에 적용한다 — 경계 클램프·최소 크기 포함 순수 함수. */
function applyDrag(b: CropBox, drag: Drag, p: Point): CropBox {
  if (drag.mode === "draw") {
    const x = Math.min(drag.ax, p.x);
    const y = Math.min(drag.ay, p.y);
    return { ...b, x, y, w: Math.abs(p.x - drag.ax), h: Math.abs(p.y - drag.ay) };
  }
  if (drag.mode === "move") {
    return { ...b, x: clamp(p.x - drag.dx, 0, 1 - b.w), y: clamp(p.y - drag.dy, 0, 1 - b.h) };
  }
  const s = drag.start;
  const right = s.x + s.w;
  const bottom = s.y + s.h;
  let { x, y, w, h } = s;
  if (drag.handle.includes("e")) w = clamp(p.x - s.x, p.mw, 1 - s.x);
  if (drag.handle.includes("w")) {
    x = clamp(p.x, 0, right - p.mw);
    w = right - x;
  }
  if (drag.handle.includes("s")) h = clamp(p.y - s.y, p.mh, 1 - s.y);
  if (drag.handle.includes("n")) {
    y = clamp(p.y, 0, bottom - p.mh);
    h = bottom - y;
  }
  return { ...b, x, y, w, h };
}

/** 모의 시험지의 문항 블록 — 번호 라벨 + (선택) 미니 본문 + 글줄 목업. */
function QuestionBlock(props: { no: string; lines: number; seed?: number; text?: string }) {
  return (
    <div>
      <span className="text-[8px] font-bold text-slate-500">{props.no}</span>
      {props.text ? (
        <p className="mt-0.5 text-[6.5px] leading-relaxed text-slate-400">{props.text}</p>
      ) : null}
      <DemoLines count={props.lines} seed={props.seed} className="mt-1" />
    </div>
  );
}

/** px 좌표 타일 — 정수 px 값을 큰 숫자로 보여 준다. */
function PxCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-1.5 py-1">
      <p className="text-[9px] font-semibold text-slate-400">{label}</p>
      <p className="text-[13px] font-bold tabular-nums text-slate-800">
        {value}
        <span className="ml-0.5 text-[9px] font-semibold text-slate-400">px</span>
      </p>
    </div>
  );
}

/** 정규화 좌표 한 줄 — 소수 4자리 고정 표기. */
function NormRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-blue-700">
        {value.toFixed(4)}
      </span>
    </div>
  );
}

export function DemoCrop() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const rafRef = useRef(0);
  const pointRef = useRef<Point | null>(null);
  const nextIdRef = useRef(2);
  const [boxes, setBoxes] = useState<CropBox[]>([PRESET]);
  const [activeId, setActiveId] = useState(PRESET.id);
  const [page, setPage] = useState({ w: 0, h: 0 });

  // 페이지 실측 — readout 의 px 값과 미리보기 비율이 여기서 나온다.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPage({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      // 드래그 중 예약된 rAF 커밋을 언마운트에서 회수한다(적대검수 nit —
      // 드래그 도중 키보드로 스텝을 넘기면 사후 setState 가 1회 발화했다).
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function readPoint(e: ReactPointerEvent): Point | null {
    const el = pageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp((e.clientY - r.top) / r.height, 0, 1),
      mw: MIN_PX / r.width,
      mh: MIN_PX / r.height,
    };
  }

  /** rAF 프레임당 1회만 상태를 커밋한다. */
  function commitFrame() {
    rafRef.current = 0;
    const drag = dragRef.current;
    const p = pointRef.current;
    if (!drag || !p) return;
    setBoxes((cur) => cur.map((b) => (b.id === drag.id ? applyDrag(b, drag, p) : b)));
  }

  function capture(e: ReactPointerEvent) {
    pageRef.current?.setPointerCapture(e.pointerId);
  }

  /** 빈 영역 드래그 = 새 박스. Shift 면 기존 지문에 조각을 이어붙인다. */
  function onPageDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const p = readPoint(e);
    if (!p) return;
    e.preventDefault();
    capture(e);
    const id = nextIdRef.current++;
    const fresh: CropBox = { id, x: p.x, y: p.y, w: 0, h: 0 };
    dragRef.current = { mode: "draw", id, ax: p.x, ay: p.y, prev: boxes };
    setBoxes((cur) => (e.shiftKey ? [...cur, fresh] : [fresh]));
    setActiveId(id);
  }

  function onBoxDown(e: ReactPointerEvent, box: CropBox) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = readPoint(e);
    if (!p) return;
    capture(e);
    dragRef.current = { mode: "move", id: box.id, dx: p.x - box.x, dy: p.y - box.y };
    setActiveId(box.id);
  }

  function onHandleDown(e: ReactPointerEvent, box: CropBox, handle: HandleId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    dragRef.current = { mode: "resize", id: box.id, handle, start: box };
    setActiveId(box.id);
  }

  function onPageMove(e: ReactPointerEvent) {
    if (!dragRef.current) return;
    const p = readPoint(e);
    if (!p) return;
    pointRef.current = p;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(commitFrame);
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      commitFrame();
    }
    dragRef.current = null;
    pointRef.current = null;
    if (drag.mode !== "draw") return;
    // 그리기 마감: 클릭만 한 경우 원상 복구, 아니면 최소 24px 보장.
    const r = pageRef.current?.getBoundingClientRect();
    const pw = r && r.width > 1 ? r.width : 1;
    const ph = r && r.height > 1 ? r.height : 1;
    setBoxes((cur) => {
      const b = cur.find((v) => v.id === drag.id);
      if (!b) return cur;
      if (b.w * pw < 8 && b.h * ph < 8) return drag.prev;
      const w = Math.max(b.w, MIN_PX / pw);
      const h = Math.max(b.h, MIN_PX / ph);
      return cur.map((v) =>
        v.id === drag.id ? { ...v, x: Math.min(b.x, 1 - w), y: Math.min(b.y, 1 - h), w, h } : v,
      );
    });
  }

  // 클릭 복구 직후 activeId 가 사라진 박스를 가리킬 수 있어 마지막 박스로 강등한다.
  const active = boxes.find((b) => b.id === activeId) ?? boxes[boxes.length - 1];
  const areaPct = boxes.reduce((sum, b) => sum + b.w * b.h, 0) * 100;

  return (
    <DemoFrame caption="예시 화면 — 마우스로 직접 드래그해 보세요">
      <div data-demo-crop className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2.5 md:flex-row">
          {/* 모의 시험지 페이지 — CSS 로만 그린 가로형 작업대 */}
          <div className="min-w-0 flex-1">
            <div
              ref={pageRef}
              className="relative h-[280px] w-full cursor-crosshair touch-none select-none rounded-md border border-slate-300 bg-white shadow-sm"
              onPointerDown={onPageDown}
              onPointerMove={onPageMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="pointer-events-none absolute inset-0">
                <div className="flex h-8 items-center justify-between border-b border-slate-300 px-3">
                  <span className="truncate text-[9px] font-bold tracking-tight text-slate-600">
                    {DEMO_EXAM_ROWS[0].title}
                  </span>
                  <span className="shrink-0 text-[8px] font-semibold text-slate-400">
                    {DEMO_EXAM_ROWS[0].meta}
                  </span>
                </div>
                <div className="grid h-[calc(100%-2rem)] grid-cols-2 divide-x divide-slate-200">
                  <div className="space-y-3 p-3">
                    <QuestionBlock
                      no="18."
                      lines={4}
                      text={`${DEMO_PASSAGE_SENTENCES[0]} ${DEMO_PASSAGE_SENTENCES[1]}`}
                    />
                    <QuestionBlock no="19." lines={6} seed={3} />
                  </div>
                  <div className="space-y-3 p-3">
                    <QuestionBlock no="20." lines={7} seed={5} />
                    <QuestionBlock no="21." lines={5} seed={9} />
                  </div>
                </div>
              </div>

              {/* 크롭 박스 — 같은 그룹(파랑) 색으로 조각이 공존한다 */}
              {boxes.map((b, i) => {
                const isActive = active.id === b.id;
                return (
                  <div
                    key={b.id}
                    data-demo-crop-box={i + 1}
                    className={`absolute cursor-move rounded-[3px] border-2 ${
                      isActive
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-blue-400/70 bg-blue-400/10"
                    }`}
                    style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
                    onPointerDown={(e) => onBoxDown(e, b)}
                  >
                    {boxes.length >= 2 ? (
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-blue-500 px-1 py-px text-[8.5px] font-bold text-white">
                        조각 {i + 1}
                      </span>
                    ) : null}
                    {isActive
                      ? HANDLES.map((hd) => (
                          <span
                            key={hd.id}
                            className={`absolute h-2 w-2 rounded-[2px] border border-blue-500 bg-white ${hd.cursor}`}
                            style={{
                              left: `${hd.left}%`,
                              top: `${hd.top}%`,
                              transform: "translate(-50%, -50%)",
                            }}
                            onPointerDown={(e) => onHandleDown(e, b, hd.id)}
                          />
                        ))
                      : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 좌표 readout — 실시간 갱신 */}
          <div
            data-demo-crop-readout
            className="w-full shrink-0 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 md:w-[212px]"
          >
            <div className="flex items-center gap-1.5">
              <Crosshair className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="text-[11.5px] font-bold text-slate-700">선택 영역 좌표</span>
              <DemoBadge tone="blue">실시간</DemoBadge>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1">
              <PxCell label="X" value={Math.round(active.x * page.w)} />
              <PxCell label="Y" value={Math.round(active.y * page.h)} />
              <PxCell label="폭" value={Math.round(active.w * page.w)} />
              <PxCell label="높이" value={Math.round(active.h * page.h)} />
            </div>

            <div className="mt-2 rounded border border-blue-100 bg-blue-50/60 px-2 py-1.5">
              <p className="text-[10px] font-bold text-blue-700">정규화 좌표 (0~1)</p>
              <div className="mt-1 space-y-0.5">
                <NormRow label="x" value={active.x} />
                <NormRow label="y" value={active.y} />
                <NormRow label="w" value={active.w} />
                <NormRow label="h" value={active.h} />
              </div>
              <p className="mt-1 text-[9.5px] leading-relaxed text-blue-600/80 break-keep">
                줌과 무관하게 저장되는 좌표입니다
              </p>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-slate-500">
              <span className="tabular-nums">선택 넓이 {areaPct.toFixed(1)}%</span>
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3 text-slate-400" />
                조각 {boxes.length}개
              </span>
            </div>

            <div
              className="relative mt-2 w-full overflow-hidden rounded border border-slate-200 bg-white"
              style={{
                aspectRatio: page.w > 0 && page.h > 0 ? `${page.w} / ${page.h}` : "38 / 14",
              }}
            >
              {boxes.map((b) => (
                <div
                  key={b.id}
                  className="absolute rounded-[1px] bg-blue-500/50"
                  style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
                />
              ))}
            </div>
            <p className="mt-1 text-[9.5px] text-slate-400">
              저장될 영역 미리보기 · 작업 면 {page.w} × {page.h}px
            </p>
          </div>
        </div>

        {/* 조작 안내 */}
        <div className="space-y-1">
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 break-keep">
            <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            빈 곳을 드래그하면 새 영역을 그리고, 영역을 끌면 옮기고, 모서리 점을 끌면 크기를
            바꿉니다.
          </p>
          {/* 실 화면 title 자구 미러 — 출처: inline-crop-board.tsx:1782 */}
          <p className="flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed text-blue-600 break-keep">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            Shift를 누른 채 새 영역을 그리면 현재 지문에 이어붙입니다
          </p>
        </div>
      </div>
    </DemoFrame>
  );
}
