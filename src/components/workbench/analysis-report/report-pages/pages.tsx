"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { ANALYSIS_REPORT_CSS } from "../report-styles";
import { type FlowItem, reportFlowItems, tableHeadRow } from "../report-sections";
import { PX_PER_MM, REPORT_A4_WIDTH_PX } from "./constants";
import type { ColCtx, ReportEdit } from "./types";
import { buildReportRootStyle, cssEsc, packFlow, samePages, visibleFlowItems } from "./items";
import { CoverShell, PageDeleteButton } from "./shells";
import { RunningFooter, RunningHeader, RunsView } from "./runs";
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
    () => reportFlowItems(report, edit ? { med: edit.med, sectionEdit: edit.sectionEdit, setCustom: edit.setCustom, insertTextAfter: edit.insertTextAfter, ced: edit.ced, onActivity: edit.onActivity } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, edit?.med, edit?.sectionEdit, edit?.setCustom, edit?.ced, edit?.onActivity],
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
