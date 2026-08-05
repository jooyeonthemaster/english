"use client";

import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import type { BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import { BlockFontProvider, type FlowItem } from "../report-sections";
import { MIN_RESIZE_MM, PAGE_BODY_MM, PX_PER_MM } from "./constants";
import type { ReportEdit } from "./types";
import { blockStyleOf, chromeProps, editIdOf } from "./items";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

// 페이지 좌상단 컨트롤 — 위/아래 이동 + 삭제(캔바식). 자동 페이지네이션 구조라
// '복제'는 깔끔히 매핑되지 않아 제외(이동·삭제만 제공).
export function PageControls({
  ids,
  pageIndex,
  pageCount,
  edit,
}: {
  ids: string[];
  pageIndex: number;
  pageCount: number;
  edit?: ReportEdit;
}) {
  if (!edit?.onDeletePage && !edit?.onMovePage) return null;
  return (
    <div
      className="par-page-controls par-edit-chrome"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {edit?.onMovePage ? (
        <>
          <button
            type="button"
            className="par-page-ctrl"
            title="페이지 위로 이동"
            disabled={pageIndex <= 0}
            onClick={(e) => {
              e.stopPropagation();
              edit.onMovePage?.(ids, -1);
            }}
          >
            <ChevronUp width={14} height={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="par-page-ctrl"
            title="페이지 아래로 이동"
            disabled={pageIndex >= pageCount - 1}
            onClick={(e) => {
              e.stopPropagation();
              edit.onMovePage?.(ids, 1);
            }}
          >
            <ChevronDown width={14} height={14} aria-hidden="true" />
          </button>
        </>
      ) : null}
      {edit?.onDeletePage ? (
        <button
          type="button"
          className="par-page-ctrl par-page-ctrl-del"
          title="이 페이지 삭제"
          onClick={(e) => {
            e.stopPropagation();
            edit.onDeletePage?.(ids);
          }}
        >
          <Trash2 width={13} height={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function Grip({ edit, id }: { edit: ReportEdit; id: string }) {
  return (
    <button type="button" className="par-egrip2 par-edit-chrome" title="드래그로 이동" onPointerDown={(e) => edit.drag.startDrag(e, id)}>
      ⠿
    </button>
  );
}

// 블록 오른쪽 위 삭제 버튼 — hover/선택 시 표시. 클릭으로 이 블록을 삭제한다.
export function BlockDelete({ edit, id }: { edit: ReportEdit; id: string }) {
  if (!edit.onDelete) return null;
  return (
    <button
      type="button"
      className="par-eblock-del par-edit-chrome"
      title="이 블록 삭제"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        edit.onDelete?.(id);
      }}
    >
      <Trash2 width={12} height={12} aria-hidden="true" />
    </button>
  );
}

export function ResizeHandle({ edit, id, el }: { edit: ReportEdit; id: string; el: () => HTMLElement | null }) {
  const start = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const node = el();
    if (!node) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    // 자연 높이(=콘텐츠 최소) 측정: minHeight 잠시 0 → 측정 → 복원
    const prevInline = node.style.minHeight;
    node.style.minHeight = "0px";
    const naturalMm = node.offsetHeight / PX_PER_MM;
    node.style.minHeight = prevInline;
    const startMm = node.offsetHeight / PX_PER_MM;
    const floor = Math.max(MIN_RESIZE_MM, naturalMm);
    const startY = e.clientY;

    // 아래로 드래그할 때 블록 하단이 페이지 하단 여백을 넘지 않도록 상한 측정.
    // 블록이 속한 페이지 본문(.par-sheet-body) 바닥까지 남은 여유(slack)를 더해,
    // 블록이 페이지 중간에서 시작해도 끝이 본문 영역 안에서 멈추게 한다.
    // (드래그 중에는 재페이지네이션이 없으므로 시작 시 한 번만 측정한다.)
    const sheetBody = node.closest(".par-sheet-body");
    const sheet = node.closest(".par-sheet") as HTMLElement | null;
    const zoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) || 1 : 1;
    let maxMm = PAGE_BODY_MM;
    if (sheetBody) {
      const slackMm =
        (sheetBody.getBoundingClientRect().bottom -
          node.getBoundingClientRect().bottom) /
        zoom /
        PX_PER_MM;
      maxMm = Math.min(PAGE_BODY_MM, startMm + Math.max(0, slackMm));
    }

    let raf = 0;
    let lastY = startY;
    let committedMm = startMm;
    document.body.classList.add("par-resizing");
    node.classList.add("is-resizing");

    const apply = () => {
      raf = 0;
      const mm = Math.max(floor, Math.min(maxMm, startMm + (lastY - startY) / PX_PER_MM));
      // 2mm 그리드 자석 스냅 — 단, 콘텐츠 최소 높이(floor)에 가까우면 정확히 floor 로 흡착.
      // 스냅 반올림이 상한(maxMm)을 1mm 넘기지 않도록 마지막에 한 번 더 클램프한다.
      const snapped = Math.abs(mm - floor) < 1.5 ? Math.round(floor * 10) / 10 : Math.round(mm / 2) * 2;
      committedMm = Math.min(maxMm, snapped);
      node.style.minHeight = `${committedMm}mm`;
    };
    const move = (ev: PointerEvent) => {
      lastY = ev.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("par-resizing");
      node.classList.remove("is-resizing");
    };
    const up = () => {
      apply();
      cleanup();
      node.style.minHeight = prevInline; // React 가 다시 소유
      if (Math.abs(committedMm - startMm) >= 0.5) edit.onResize(id, committedMm);
    };
    const cancel = () => {
      cleanup();
      node.style.minHeight = prevInline;
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", cancel, { once: true });
  };
  return <button type="button" className="par-eresize par-edit-chrome" title="아래로 드래그해 높이 조절" onPointerDown={start} />;
}

export function LiShell({ it, edit, meta, listStyle, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; listStyle?: boolean; measure?: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const cp = chromeProps(it, edit, measure);
  const editId = editIdOf(it);
  const resizable = !!edit && !measure && it.resizable !== false;
  return (
    <li ref={ref} data-mid={it.id} style={blockStyleOf(meta)} {...cp} className={`${listStyle ? "" : "par-edit-row"} ${(cp.className as string) ?? ""}`}>
      {edit && !measure && it.showGrip !== false ? <Grip edit={edit} id={editId} /> : null}
      {edit && !measure && it.showGrip !== false ? <BlockDelete edit={edit} id={editId} /> : null}
      <BlockFontProvider
        blockId={editId}
        runs={meta?.fontRuns}
        onBlockMeta={edit && !measure ? edit.onBlockMeta : undefined}
      >
        {it.node}
      </BlockFontProvider>
      {resizable ? <ResizeHandle edit={edit} id={it.id} el={() => ref.current} /> : null}
    </li>
  );
}

/**
 * 표 행. 편집 chrome 중 **핸들 열(.par-edit-hcell)만은 레이아웃 요소**라 measure 클론에도
 * 렌더해야 한다 — 이 6mm 열이 내용 열을 3.45% 좁히는데 클론에만 없으면 클론에서 안 접히던
 * 셀이 실제 페이지에서 2줄이 되어(행당 ~4.76mm) 표가 러닝 푸터를 뚫는다.
 * 반대로 그립(상호작용)은 클론에 절대 넣지 않는다(아이콘 수백 개 = 렌더 비용).
 */
export function RowShell({ it, edit, meta, measure, handleCell }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; measure?: boolean; handleCell?: boolean }) {
  const cp = chromeProps(it, edit, measure);
  const editId = editIdOf(it);
  return (
    <tr data-mid={it.id} style={blockStyleOf(meta)} {...cp} className={(cp.className as string) ?? ""}>
      {handleCell ? (
        <td className="par-edit-hcell">{edit && !measure ? <Grip edit={edit} id={editId} /> : null}</td>
      ) : null}
      <BlockFontProvider
        blockId={editId}
        runs={meta?.fontRuns}
        onBlockMeta={edit && !measure ? edit.onBlockMeta : undefined}
      >
        {it.node}
      </BlockFontProvider>
    </tr>
  );
}

export function BlockShell({ it, edit, meta, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; measure?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cp = chromeProps(it, edit, measure);
  const editId = editIdOf(it);
  const resizable = !!edit && !measure && it.resizable !== false;
  return (
    <div ref={ref} data-mid={it.id} style={blockStyleOf(meta)} {...cp} className={`par-block par-wrap-${it.wrap} ${(cp.className as string) ?? ""}`}>
      {edit && !measure && it.showGrip !== false ? <Grip edit={edit} id={editId} /> : null}
      {edit && !measure && it.showGrip !== false ? <BlockDelete edit={edit} id={editId} /> : null}
      <BlockFontProvider
        blockId={editId}
        runs={meta?.fontRuns}
        onBlockMeta={edit && !measure ? edit.onBlockMeta : undefined}
      >
        {it.node}
      </BlockFontProvider>
      {resizable ? <ResizeHandle edit={edit} id={it.id} el={() => ref.current} /> : null}
    </div>
  );
}

/** 표지 전면 페이지 — 선택만 가능(드래그/리사이즈 없음, 풀블리드). */
export function CoverShell({ it, edit, meta }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta }) {
  if (!edit) return <div className="par-cover-shell" style={blockStyleOf(meta)}>{it.node}</div>;
  const active = edit.activeId === it.id;
  return (
    <div
      className={`par-cover-shell par-eline${active ? " is-active" : ""}`}
      style={blockStyleOf(meta)}
      data-paper-item-id={it.id}
      data-paper-part-key={it.id}
      onMouseDown={() => {
        if (edit.activeId !== it.id) edit.setActiveId(it.id);
      }}
    >
      <BlockFontProvider blockId={it.id} runs={meta?.fontRuns} onBlockMeta={edit.onBlockMeta}>
        {it.node}
      </BlockFontProvider>
    </div>
  );
}

export function MapItemShell({ it, edit, meta, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; measure?: boolean }) {
  const cp = chromeProps(it, edit, measure);
  const editId = editIdOf(it);
  return (
    <div data-mid={it.id} style={blockStyleOf(meta)} {...cp} className={`par-mapitem ${(cp.className as string) ?? ""}`}>
      {edit && !measure && it.showGrip !== false ? <Grip edit={edit} id={editId} /> : null}
      {edit && !measure && it.showGrip !== false ? <BlockDelete edit={edit} id={editId} /> : null}
      <BlockFontProvider
        blockId={editId}
        runs={meta?.fontRuns}
        onBlockMeta={edit && !measure ? edit.onBlockMeta : undefined}
      >
        {it.node}
      </BlockFontProvider>
    </div>
  );
}
