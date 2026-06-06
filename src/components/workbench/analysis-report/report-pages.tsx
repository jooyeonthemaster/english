"use client";

import {
  type CSSProperties,
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getReportTheme, REPORT_LAYOUT } from "@/lib/passage-report/analysis-report/design-tokens";
import type {
  AnalysisReport,
  AnalysisSection,
  BlockMeta,
  CustomBlock,
} from "@/lib/passage-report/analysis-report/schema";

import { applyBlockOrder } from "./editor-mutations";
import { ANALYSIS_REPORT_CSS } from "./report-styles";
import type { CoverEdit } from "./cover-templates";
import {
  Arrow,
  BOX_LIST_WRAPS,
  TABLE_WRAPS,
  reportFlowItems,
  tableHeadRow,
  type FlowItem,
  type MetaEdit,
  type SectionEdit,
  type WrapKind,
} from "./report-sections";

const PX_PER_MM = 96 / 25.4;
/** A4 한 장의 픽셀 폭(210mm @96dpi) — 썸네일 scale 계산용. */
export const REPORT_A4_WIDTH_PX = Math.round(210 * PX_PER_MM);
// Matches the usable .par-sheet-body height after A4 padding, running header, and footer.
const PAGE_BODY_MM = 250;
const BOX_PAD_MM = 9;
const RUN_GAP_MM = 6;
const LI_GAP_MM = 2.5;
const ARROW_MM = 7;

export type DropPlacement = "before" | "after";

/** 표 열 너비 컨텍스트 — 저장값/드래그 미리보기 + 조절 콜백을 페이지 트리로 내려보낸다. */
type ColCtx = {
  widths?: Record<string, Record<string, number>>;
  onDraft?: (group: string, w: Record<string, number>) => void;
  onCommit?: (group: string, w: Record<string, number>) => void;
};

export interface ReportEdit {
  med: MetaEdit;
  sectionEdit: (sectionIndex: number) => SectionEdit;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onReorder: (sourceId: string, targetId: string, placement: DropPlacement) => void;
  onBlockMeta: (id: string, patch: Partial<BlockMeta>) => void;
  /** 커스텀 블록(여백/텍스트) 속성 변경 */
  setCustom: (id: string, patch: Partial<CustomBlock>) => void;
  /** 표지 인라인 편집 */
  ced: CoverEdit;
  /** 블록 세로 리사이즈 종료 — 최종 높이(mm) commit */
  onResize: (id: string, heightMm: number) => void;
  /** 표 열 너비(세로 구분선) 조절 — group(grammar/exam/vocab) → 열키→퍼센트 commit */
  onColWidths: (group: string, widths: Record<string, number>) => void;
  onDeletePage?: (ids: string[]) => void;
  drag: {
    startDrag: (e: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
    draggingId: string | null;
    dragOverId: string | null;
    placement: DropPlacement;
  };
}

// ─── 디스크립터 (편집기 패널용) ───────────────────────────────────────────────
export interface ItemDescriptor {
  id: string;
  sectionIndex: number;
  kind: AnalysisSection["kind"] | "title" | "custom" | "cover";
  wrap: WrapKind;
  no: number;
  isSectionStart: boolean;
}
export function enumerateItems(report: AnalysisReport): ItemDescriptor[] {
  const items = reportFlowItems(report);
  return items.map((it) => ({
    id: it.id,
    sectionIndex: it.sectionIndex,
    kind: it.kind,
    wrap: it.wrap,
    no: it.no,
    isSectionStart: it.wrap === "secheader",
  }));
}

function visibleFlowItems(report: AnalysisReport, natural: FlowItem[]): FlowItem[] {
  const byId = new Map(natural.map((it) => [it.id, it]));
  const orderedIds = applyBlockOrder(natural.map((it) => it.id), report.blockOrder);
  const out: FlowItem[] = [];
  for (const id of orderedIds) {
    const it = byId.get(id);
    if (!it) continue;
    if (report.blockMeta?.[id]?.hidden) continue;
    out.push(it);
  }
  return out;
}

const isStandalone = (w: WrapKind) => !TABLE_WRAPS.has(w) && !BOX_LIST_WRAPS.has(w) && w !== "map" && w !== "vocab-grid" && w !== "reading";

function isAutoFitItem(it: FlowItem): boolean {
  return /^s\d+-annotated-snt\d+/.test(it.id);
}

function blockStyleOf(meta: BlockMeta | undefined, it?: FlowItem): CSSProperties | undefined {
  if (!meta) return undefined;
  const st: Record<string, unknown> = {};
  if (meta.fontScale && meta.fontScale !== 1) st["--par-fs"] = meta.fontScale;
  if (meta.bold) st.fontWeight = 700;
  if (meta.italic) st.fontStyle = "italic";
  if (meta.align) st.textAlign = meta.align;
  if (meta.minHeight && (!it || !isAutoFitItem(it))) st.minHeight = `${meta.minHeight}mm`;
  return Object.keys(st).length ? (st as CSSProperties) : undefined;
}

// ─── 테마 → CSS 변수 (par-root 에 주입) ────────────────────────────────────────
export function buildReportRootStyle(report: AnalysisReport): CSSProperties {
  const theme = getReportTheme(report.themeId);
  return {
    "--ink": theme.ink, "--ink-soft": theme.inkSoft, "--gold": theme.gold, "--gold-soft": theme.goldSoft,
    "--ink-fill": theme.inkFill, "--ink-fill-soft": theme.inkFillSoft,
    "--ink-on-fill": theme.inkOnFill, "--ink-on-fill-muted": theme.inkOnFillMuted,
    "--text": theme.text, "--text-muted": theme.textMuted, "--tint": theme.tint, "--tint-border": theme.tintBorder,
    "--table-head-bg": theme.tableHeadBg, "--table-head-text": theme.tableHeadText,
    "--table-stripe": theme.tableStripe, "--page": theme.page, "--rule": theme.rule, "--font-en": REPORT_LAYOUT.fontEnSerif,
  } as CSSProperties;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export function ReportPages({
  report,
  edit,
  onPagesChange,
}: {
  report: AnalysisReport;
  edit?: ReportEdit;
  onPagesChange?: (pages: string[][]) => void;
}) {
  const rootStyle = buildReportRootStyle(report);
  const logoDataUrl = report.cover?.showLogo === false ? undefined : report.cover?.logoDataUrl;

  const natural = useMemo(
    () => reportFlowItems(report, edit ? { med: edit.med, sectionEdit: edit.sectionEdit, setCustom: edit.setCustom, ced: edit.ced } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, edit?.med, edit?.sectionEdit, edit?.setCustom, edit?.ced],
  );

  const items = useMemo(() => {
    return visibleFlowItems(report, natural);
  }, [natural, report]);

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const measureRef = useRef<HTMLDivElement>(null);
  // 페이지는 "블록 id 배열"로 저장 — 편집/재측정 중에도 화면을 비우지 않아 깜빡임/스크롤 점프 없음
  const [pages, setPages] = useState<string[][] | null>(null);
  // 재페이지네이션 전 스크롤 위치 보존 (높이 축소로 0 으로 튀는 것 방지)
  const scrollSaveRef = useRef<{ el: HTMLElement; top: number } | null>(null);

  // 표 열 너비 — 드래그 중 미리보기(draft)는 commit 전까지 재페이지네이션 없이 라이브 반영.
  const [draftCols, setDraftCols] = useState<Record<string, Record<string, number>> | null>(null);
  const colCtx = useMemo<ColCtx>(() => {
    const widths = draftCols ?? report.tableColWidths;
    if (!edit) return { widths };
    return {
      widths,
      onDraft: (group, w) => setDraftCols((prev) => ({ ...(report.tableColWidths ?? {}), ...(prev ?? {}), [group]: w })),
      onCommit: (group, w) => {
        edit.onColWidths(group, w);
        setDraftCols(null);
      },
    };
  }, [draftCols, report.tableColWidths, edit]);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const scroller = el.closest<HTMLElement>(".par-scroll");
    scrollSaveRef.current = scroller ? { el: scroller, top: scroller.scrollTop } : null;
    const own = items.map((it) => {
      const node = el.querySelector<HTMLElement>(`[data-mid="${cssEsc(it.id)}"]`);
      return node ? node.offsetHeight / PX_PER_MM : 8;
    });
    const theadEl = el.querySelector<HTMLElement>(`[data-cref="thead"] thead`);
    const thead = theadEl ? theadEl.offsetHeight / PX_PER_MM : 7;
    const packed = packFlow(items, own, report.blockMeta, { thead });
    const next = packed.map((p) => p.map((i) => items[i].id));
    setPages((prev) => (samePages(prev, next) ? prev : next));
  }, [items, report.blockMeta, report.tableColWidths]);

  // pages 가 새 레이아웃을 반영한 뒤(페인트 직전) 스크롤 복원
  useLayoutEffect(() => {
    const s = scrollSaveRef.current;
    if (s && s.el.scrollTop !== s.top) s.el.scrollTop = s.top;
  }, [pages]);

  // 페이지 구성 변경 시 편집기(인디케이터)로 알림
  useLayoutEffect(() => {
    if (pages) onPagesChange?.(pages);
  }, [pages, onPagesChange]);

  // 표지 페이지는 페이지 번호/푸터에서 제외
  const coverPageFlags = (pages ?? []).map((ids) => ids.length === 1 && itemsById.get(ids[0])?.wrap === "cover");
  const bodyTotal = coverPageFlags.filter((c) => !c).length;

  return (
    <div className={`par-root${edit ? " par-root-edit" : ""}`} style={rootStyle}>
      <style dangerouslySetInnerHTML={{ __html: ANALYSIS_REPORT_CSS }} />

      {/* 측정용 숨김 렌더 (연속 flow + thead 참조) */}
      <div className="par-measure" ref={measureRef} aria-hidden>
        <table className="par-table" data-cref="thead">
          <thead>{tableHeadRow("grammar", false)}</thead>
          <tbody><tr><td>측정</td><td>측정</td><td>측정</td></tr></tbody>
        </table>
        <RunsView items={items} blockMeta={report.blockMeta} cols={{ widths: report.tableColWidths }} measure />
      </div>

      {(() => {
        if (!pages) return null;
        let bodyNo = 0;
        return pages.map((pageIds, pi) => {
          const pageItems = pageIds.map((id) => itemsById.get(id)).filter(Boolean) as FlowItem[];
          if (pageItems.length === 0) return null;
          if (coverPageFlags[pi]) {
            return (
              <section className="par-sheet par-sheet-cover" key={`p-${pi}`} data-page-index={pi}>
                <PageDeleteButton ids={pageIds} edit={edit} />
                <CoverShell it={pageItems[0]} edit={edit} meta={report.blockMeta?.[pageItems[0].id]} />
              </section>
            );
          }
          bodyNo += 1;
          return (
            <section className="par-sheet" key={`p-${pi}`} data-page-index={pi}>
              <PageDeleteButton ids={pageIds} edit={edit} />
              <RunningHeader brand={report.brand} title={report.meta.titleKo} logoDataUrl={logoDataUrl} />
              <div className="par-sheet-body">
                <RunsView items={pageItems} edit={edit} blockMeta={report.blockMeta} cols={colCtx} />
              </div>
              <RunningFooter brand={report.brand} docNo={report.docNo} page={bodyNo} total={bodyTotal} />
            </section>
          );
        });
      })()}
    </div>
  );
}

function PageDeleteButton({ ids, edit }: { ids: string[]; edit?: ReportEdit }) {
  if (!edit?.onDeletePage) return null;
  return (
    <button
      type="button"
      className="par-page-delete par-edit-chrome"
      title="이 페이지 삭제"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        edit.onDeletePage?.(ids);
      }}
    >
      ×
    </button>
  );
}

// ─── 썸네일(페이지 인디케이터) — 실제 페이지를 그대로 축소 렌더 ─────────────────
/**
 * 좌측 페이지 목록에 쓰는 단일 페이지 미니 미리보기. 중앙 캔버스와 동일한
 * 실제 블록 노드(`reportFlowItems` 결과)를 읽기전용으로 A4 시트에 담아
 * `transform: scale()` 로 축소한다 — 스켈레톤이 아니라 진짜 페이지 축소본.
 *
 * 페이지 분할은 중앙 `ReportPages` 가 계산해 `onPagesChange` 로 넘긴 `ids`
 * 를 그대로 받아 재측정 없이 렌더하므로 가볍다. CSS(.par-sheet 등)는 중앙
 * `ReportPages` 가 전역 주입하므로 여기서는 클래스만 사용한다.
 */
export function ReportThumbnailSheet({
  report,
  ids,
  itemsById,
  bodyNumber,
  bodyTotal,
  width = 80,
}: {
  report: AnalysisReport;
  ids: string[];
  /** id → FlowItem (편집기에서 한 번만 계산해 공유). */
  itemsById: Map<string, FlowItem>;
  bodyNumber: number;
  bodyTotal: number;
  width?: number;
}) {
  const items = ids.map((id) => itemsById.get(id)).filter(Boolean) as FlowItem[];
  const isCover = items.length === 1 && items[0]?.wrap === "cover";
  const scale = width / REPORT_A4_WIDTH_PX;
  const height = width * (297 / 210);
  const logoDataUrl = report.cover?.showLogo === false ? undefined : report.cover?.logoDataUrl;

  return (
    <div style={{ width, height, overflow: "hidden", position: "relative" }} aria-hidden>
      <div
        style={{
          width: REPORT_A4_WIDTH_PX,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        <div className="par-root" style={buildReportRootStyle(report)}>
          {isCover ? (
            <section className="par-sheet par-sheet-cover">
              <div className="par-cover-shell">{items[0]?.node}</div>
            </section>
          ) : (
            <section className="par-sheet">
              <RunningHeader brand={report.brand} title={report.meta.titleKo} logoDataUrl={logoDataUrl} />
              <div className="par-sheet-body">
                <RunsView items={items} blockMeta={report.blockMeta} cols={{ widths: report.tableColWidths }} />
              </div>
              <RunningFooter
                brand={report.brand}
                docNo={report.docNo}
                page={bodyNumber}
                total={bodyTotal}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function cssEsc(s: string): string {
  return s.replace(/"/g, '\\"');
}

/** 동일한 페이지 분할이면 새 배열을 만들지 않아 불필요한 재렌더/깜빡임 방지. */
function samePages(a: string[][] | null, b: string[][]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false;
  }
  return true;
}

// ─── runs 렌더 (연속 같은 그룹 → 박스/표/도식 병합) ───────────────────────────
function RunsView({
  items,
  edit,
  blockMeta,
  cols,
  measure,
}: {
  items: FlowItem[];
  edit?: ReportEdit;
  blockMeta?: Record<string, BlockMeta>;
  cols?: ColCtx;
  measure?: boolean;
}) {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const merge = TABLE_WRAPS.has(it.wrap) || BOX_LIST_WRAPS.has(it.wrap) || it.wrap === "map" || it.wrap === "vocab-grid" || it.wrap === "reading";
    const run: FlowItem[] = [it];
    if (merge) {
      let j = i + 1;
      while (j < items.length && items[j].wrap === it.wrap && items[j].sectionIndex === it.sectionIndex) {
        run.push(items[j]);
        j++;
      }
      i = j;
    } else {
      i++;
    }
    out.push(<RunBlock key={`run-${it.id}`} run={run} wrap={it.wrap} edit={edit} blockMeta={blockMeta} cols={cols} measure={measure} />);
  }
  return <>{out}</>;
}

function RunBlock({
  run,
  wrap,
  edit,
  blockMeta,
  cols,
  measure,
}: {
  run: FlowItem[];
  wrap: WrapKind;
  edit?: ReportEdit;
  blockMeta?: Record<string, BlockMeta>;
  cols?: ColCtx;
  measure?: boolean;
}) {
  const editable = !!edit && !measure;

  if (wrap === "vocab-grid") {
    return (
      <div className="par-runblock par-vocab-grid-run">
        {run.map((it) => (
          <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[it.id]} measure={measure} />
        ))}
      </div>
    );
  }

  if (wrap === "reading") {
    return (
      <div className="par-runblock par-reading-flow-run">
        {run.map((it) => (
          <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[it.id]} measure={measure} />
        ))}
      </div>
    );
  }

  if (TABLE_WRAPS.has(wrap)) {
    const isVocabTestRun = wrap === "vocab" && run.every((it) => it.id.includes("-vtest-row"));
    const group = wrap === "grammar" ? "grammar" : wrap === "exam" ? "exam" : "vocab";
    // 단어시험표(par-vocab-test-table)는 열 구성이 달라 폭 조절 대상에서 제외.
    const overrides = isVocabTestRun ? undefined : cols?.widths?.[group];
    const resize = isVocabTestRun
      ? undefined
      : {
          overrides,
          onDraft: editable && cols?.onDraft ? (w: Record<string, number>) => cols.onDraft!(group, w) : undefined,
          onCommit: editable && cols?.onCommit ? (w: Record<string, number>) => cols.onCommit!(group, w) : undefined,
        };
    return (
      <div className="par-runblock">
        <table
          className={`par-table${isVocabTestRun ? " par-vocab-test-table" : ""}`}
          data-table-group={group}
          style={overrides ? { tableLayout: "fixed" } : undefined}
        >
          <thead>{tableHeadRow(wrap, editable, run[0]?.hiddenCols, resize)}</thead>
          <tbody>
            {run.map((it) => (
              <RowShell key={it.id} it={it} edit={edit} meta={blockMeta?.[it.id]} measure={measure} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (BOX_LIST_WRAPS.has(wrap)) {
    return (
      <div className={`par-runblock par-box${wrap === "summary" ? " par-summary" : ""}`}>
        <ol className={wrap === "summary" ? undefined : "par-sentences"}>
          {run.map((it) => (
            <LiShell key={it.id} it={it} edit={edit} meta={blockMeta?.[it.id]} listStyle={wrap === "summary"} measure={measure} />
          ))}
        </ol>
      </div>
    );
  }

  if (wrap === "map") {
    return (
      <div className="par-runblock par-map">
        {run.map((it, idx) => (
          <Fragment key={it.id}>
            {idx > 0 ? <Arrow /> : null}
            <MapItemShell it={it} edit={edit} meta={blockMeta?.[it.id]} measure={measure} />
          </Fragment>
        ))}
      </div>
    );
  }

  // standalone — secheader / note / thesis / logic / parse / title / meta
  return (
    <>
      {run.map((it) => (
        <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[it.id]} measure={measure} />
      ))}
    </>
  );
}

// ─── 줄/블록 chrome ──────────────────────────────────────────────────────────
function chromeProps(it: FlowItem, edit?: ReportEdit, measure?: boolean) {
  if (!edit || measure) return {} as Record<string, unknown>;
  const active = edit.activeId === it.id;
  const over = edit.drag.dragOverId === it.id && edit.drag.draggingId !== it.id;
  return {
    "data-paper-item-id": it.id,
    "data-paper-part-key": it.id,
    className: `par-eline${active ? " is-active" : ""}${edit.drag.draggingId === it.id ? " is-dragging" : ""}${
      over ? (edit.drag.placement === "after" ? " par-dragover-after" : " par-dragover-before") : ""
    }`,
    onMouseDown: () => {
      if (edit.activeId !== it.id) edit.setActiveId(it.id);
    },
  } as Record<string, unknown>;
}

function Grip({ edit, id }: { edit: ReportEdit; id: string }) {
  return (
    <button type="button" className="par-egrip2 par-edit-chrome" title="드래그로 이동" onPointerDown={(e) => edit.drag.startDrag(e, id)}>
      ⠿
    </button>
  );
}

/**
 * 블록 하단 세로 리사이즈 핸들. 드래그 중에는 DOM 에 직접 minHeight(px)만 입혀
 * 즉각 반응(재페이지네이션 없음) + pointer capture 로 작은 핸들에서도 안 놓침.
 * 콘텐츠 자연 높이 아래로는 못 줄임(텍스트 잘림 방지). pointer-up 에서만 state commit(mm).
 */
const MIN_RESIZE_MM = 6;
function ResizeHandle({ edit, id, el }: { edit: ReportEdit; id: string; el: () => HTMLElement | null }) {
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

    let raf = 0;
    let lastY = startY;
    let committedMm = startMm;
    document.body.classList.add("par-resizing");
    node.classList.add("is-resizing");

    const apply = () => {
      raf = 0;
      const mm = Math.max(floor, Math.min(PAGE_BODY_MM, startMm + (lastY - startY) / PX_PER_MM));
      // 2mm 그리드 자석 스냅 — 단, 콘텐츠 최소 높이(floor)에 가까우면 정확히 floor 로 흡착
      committedMm = Math.abs(mm - floor) < 1.5 ? Math.round(floor * 10) / 10 : Math.round(mm / 2) * 2;
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

function LiShell({ it, edit, meta, listStyle, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; listStyle?: boolean; measure?: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const cp = chromeProps(it, edit, measure);
  const resizable = !!edit && !measure && !isAutoFitItem(it);
  return (
    <li ref={ref} data-mid={it.id} style={blockStyleOf(meta, it)} {...cp} className={`${listStyle ? "" : "par-edit-row"} ${(cp.className as string) ?? ""}`}>
      {edit && !measure ? <Grip edit={edit} id={it.id} /> : null}
      {it.node}
      {resizable ? <ResizeHandle edit={edit} id={it.id} el={() => ref.current} /> : null}
    </li>
  );
}

function RowShell({ it, edit, meta, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; measure?: boolean }) {
  const cp = chromeProps(it, edit, measure);
  return (
    <tr data-mid={it.id} style={blockStyleOf(meta, it)} {...cp} className={(cp.className as string) ?? ""}>
      {edit && !measure ? (
        <td className="par-edit-hcell"><Grip edit={edit} id={it.id} /></td>
      ) : null}
      {it.node}
    </tr>
  );
}

function BlockShell({ it, edit, meta, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; measure?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cp = chromeProps(it, edit, measure);
  const resizable = !!edit && !measure && !isAutoFitItem(it);
  return (
    <div ref={ref} data-mid={it.id} style={blockStyleOf(meta, it)} {...cp} className={`par-block par-wrap-${it.wrap} ${(cp.className as string) ?? ""}`}>
      {edit && !measure ? <Grip edit={edit} id={it.id} /> : null}
      {it.node}
      {resizable ? <ResizeHandle edit={edit} id={it.id} el={() => ref.current} /> : null}
    </div>
  );
}

/** 표지 전면 페이지 — 선택만 가능(드래그/리사이즈 없음, 풀블리드). */
function CoverShell({ it, edit, meta }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta }) {
  if (!edit) return <div className="par-cover-shell" style={blockStyleOf(meta, it)}>{it.node}</div>;
  const active = edit.activeId === it.id;
  return (
    <div
      className={`par-cover-shell par-eline${active ? " is-active" : ""}`}
      style={blockStyleOf(meta, it)}
      data-paper-item-id={it.id}
      data-paper-part-key={it.id}
      onMouseDown={() => {
        if (edit.activeId !== it.id) edit.setActiveId(it.id);
      }}
    >
      {it.node}
    </div>
  );
}

function MapItemShell({ it, edit, meta, measure }: { it: FlowItem; edit?: ReportEdit; meta?: BlockMeta; measure?: boolean }) {
  const cp = chromeProps(it, edit, measure);
  return (
    <div data-mid={it.id} style={blockStyleOf(meta, it)} {...cp} className={`par-mapitem ${(cp.className as string) ?? ""}`}>
      {edit && !measure ? <Grip edit={edit} id={it.id} /> : null}
      {it.node}
    </div>
  );
}

// ─── flow 패킹 ────────────────────────────────────────────────────────────────
function packFlow(
  items: FlowItem[],
  own: number[],
  blockMeta: Record<string, BlockMeta> | undefined,
  chrome: { thead: number },
): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let h = 0;
  let prevSection = -99;
  let prevWrap: WrapKind | null = null;

  items.forEach((it, k) => {
    const meta = blockMeta?.[it.id];
    const tbl = TABLE_WRAPS.has(it.wrap);
    const box = BOX_LIST_WRAPS.has(it.wrap);
    const mp = it.wrap === "map";
    const isCover = it.wrap === "cover";
    const standalone = isStandalone(it.wrap);
    const autoFit = isAutoFitItem(it);
    // 표지는 자기 페이지 독점: 표지 앞/뒤 모두 페이지 분할
    // 자동 독해 조각은 저장된 breakBefore/minHeight 때문에 다음 장으로 밀리지 않게 한다.
    const forceBreak = ((!!meta?.breakBefore && !autoFit) || !!it.breakBefore || isCover || prevWrap === "cover") && page.length > 0;
    const metaMinHeight = autoFit ? 0 : meta?.minHeight ?? 0;
    const hh = isCover ? PAGE_BODY_MM : Math.max(own[k], metaMinHeight);

    const atTopInc = () => (tbl ? chrome.thead : 0) + (box ? BOX_PAD_MM : 0) + hh;

    let inc: number;
    if (page.length === 0) {
      inc = atTopInc();
    } else {
      const newSection = it.sectionIndex !== prevSection;
      const newRun = standalone || newSection || it.wrap !== prevWrap;
      if (newRun) {
        inc = RUN_GAP_MM + (tbl ? chrome.thead : 0) + (box ? BOX_PAD_MM : 0) + hh;
      } else {
        inc = (box ? LI_GAP_MM : mp ? ARROW_MM : 0) + hh;
      }
    }

    if (forceBreak || (page.length > 0 && h + inc > PAGE_BODY_MM)) {
      pages.push(page);
      page = [];
      h = 0;
      prevWrap = null;
      prevSection = -99;
      inc = atTopInc();
    }

    page.push(k);
    h += inc;
    prevSection = it.sectionIndex;
    prevWrap = it.wrap;
  });
  if (page.length) pages.push(page);
  return pages;
}

// ─── 헤더/푸터 ────────────────────────────────────────────────────────────────
function RunningHeader({ brand, title, logoDataUrl }: { brand: string; title: string; logoDataUrl?: string }) {
  return (
    <div className="par-runhead">
      <span className="par-runhead-brand">
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="par-runhead-logo" src={logoDataUrl} alt="" />
        ) : null}
        <span>{brand}</span>
      </span>
      <span className="par-runhead-r">{title}</span>
    </div>
  );
}
function RunningFooter({ brand, docNo, page, total }: { brand: string; docNo?: string; page: number; total: number }) {
  return (
    <div className="par-runfoot">
      <span>{brand}{docNo ? ` · PRIME ANALYSIS ${docNo}` : ""}</span>
      <span className="par-page">— {page} / {total} —</span>
      <span>ⓒ 2026 · 무단복제 금지</span>
    </div>
  );
}
