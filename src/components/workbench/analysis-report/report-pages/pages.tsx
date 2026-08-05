"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { ANALYSIS_REPORT_CSS } from "../report-styles";
import { type FlowItem, reportFlowItems, tableHeadRow } from "../report-sections";
import { PAGE_BODY_MM, PAGE_SAFETY_MM, PX_PER_MM, REPORT_A4_WIDTH_PX } from "./constants";
import type { ColCtx, ReportEdit } from "./types";
import { buildReportRootStyle, packFlow, samePages, visibleFlowItems } from "./items";
import { CoverShell, PageControls } from "./shells";
import { RunningFooter, RunningHeader, RunsView } from "./runs";
// ─── 메인 ─────────────────────────────────────────────────────────────────────
export function ReportPages({
  report,
  edit,
  onPagesChange,
  flowItems,
}: {
  report: AnalysisReport;
  edit?: ReportEdit;
  onPagesChange?: (pages: string[][]) => void;
  /**
   * 상위(편집기)에서 이미 계산한 **자연 순서** FlowItem[]. 주면 그대로 쓰고, 없으면
   * 지금처럼 내부에서 `reportFlowItems` 로 계산한다 — 읽기전용 소비자
   * (AnalysisReportDocument · dev 하네스 · 랜딩 데모 · 미리보기 모달)는 넘기지 않으므로
   * 내부 계산 경로는 반드시 살아 있어야 한다.
   *
   * ⚠️ `visibleFlowItems`(blockOrder 정렬·hidden 제거) **적용 전** 값이어야 한다.
   *    가시성/정렬은 계속 이 컴포넌트가 적용한다.
   */
  flowItems?: FlowItem[];
}) {
  const rootStyle = buildReportRootStyle(report);
  const logoDataUrl = report.cover?.showLogo === false ? undefined : report.cover?.logoDataUrl;
  // 편집 여부는 '측정 클론의 표 기하'(핸들 열 유무)를 바꾸므로 재측정 트리거이기도 하다.
  const editing = !!edit;

  // 훅은 조건부로 호출할 수 없으므로 useMemo 안에서 분기한다(주입 우선, 없으면 자체 계산).
  const natural = useMemo(
    () => flowItems ?? reportFlowItems(report, edit ? { med: edit.med, sectionEdit: edit.sectionEdit, setCustom: edit.setCustom, insertTextAfter: edit.insertTextAfter, ced: edit.ced, onActivity: edit.onActivity, onSectionHeading: edit.onSectionHeading } : undefined),
    // insertTextAfter 는 본문에서 쓰는데 의존성에서 빠져 있었다(현재는 안정 콜백이라 무해했으나 잠재 결함) → 보강.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowItems, report, edit?.med, edit?.sectionEdit, edit?.setCustom, edit?.insertTextAfter, edit?.ced, edit?.onActivity, edit?.onSectionHeading],
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
    // 편집 캔버스(editor-canvas)·썸네일은 transform: scale() 안에 있어 getBoundingClientRect
    // 에 그 배율이 곱해진다. offsetWidth(레이아웃 px, transform 무관)와의 비로 배율을 역산해
    // 나눈다 — 이 보정을 빠뜨리면 모든 높이가 zoom 배만큼 틀어져 페이지 수가 붕괴한다.
    const rectW = el.getBoundingClientRect().width;
    const scale = rectW > 0 && el.offsetWidth > 0 ? rectW / el.offsetWidth : 1;
    // offsetHeight 는 정수 px 반올림이라 같은 구조의 표 행에서 오차가 한 방향으로 누적된다
    // (26행 기준 약 2.4mm 과소) → 소수부를 보존하는 rect 로 잰다.
    const mmOf = (node: HTMLElement) => node.getBoundingClientRect().height / scale / PX_PER_MM;

    // 아이템당 querySelector 1회(문서 150~250회 × 서브트리 전체 스캔) → querySelectorAll 1회 + Map.
    // querySelectorAll 은 문서 순서대로 돌려주므로 '먼저 만난 노드 우선'으로 담으면
    // querySelector(첫 일치) 와 결과가 동일하다. 선택자 문자열을 만들지 않으므로
    // 이스케이프(cssEsc)에 의존하던 특수문자 id 위험도 함께 사라진다.
    const heightById = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-mid]").forEach((node) => {
      const mid = node.dataset.mid;
      if (mid === undefined || heightById.has(mid)) return;
      heightById.set(mid, mmOf(node));
    });
    // 측정 클론에 없는 아이템(있을 수 없지만 방어)은 기존과 동일하게 8mm 폴백.
    const own = items.map((it) => heightById.get(it.id) ?? 8);
    const theadEl = el.querySelector<HTMLElement>(`[data-cref="thead"] thead`);
    const thead = theadEl ? mmOf(theadEl) : 7;
    // 표 종류별 thead 실측 — 열을 숨기거나 좁히면 vocab(5열) thead 만 2줄이 되는 식으로
    // 종류마다 높이가 갈린다. 측정 클론에 실제 표가 이미 있으므로 그것을 그대로 읽는다.
    const theadByGroup: Record<string, number> = {};
    el.querySelectorAll<HTMLTableElement>(`table.par-table[data-table-group]`).forEach((t) => {
      const g = t.getAttribute("data-table-group");
      const th = t.querySelector<HTMLElement>("thead");
      if (!g || !th || g in theadByGroup) return;
      theadByGroup[g] = mmOf(th);
    });
    // 페이지 본문 가용 높이 — 러닝헤더 로고 유무로 4.6mm 가 달라지므로 상수가 아니라
    // 프로브 시트(실제 헤더/푸터를 가진 빈 시트)에서 실측한다.
    const probe = el.querySelector<HTMLElement>(`[data-cref="sheet"] .par-sheet-body`);
    const pageBodyMm = Math.max(50, (probe ? mmOf(probe) : PAGE_BODY_MM) - PAGE_SAFETY_MM);
    const packed = packFlow(items, own, report.blockMeta, { thead, theadByGroup }, pageBodyMm);
    const next = packed.map((p) => p.map((i) => items[i].id));
    setPages((prev) => (samePages(prev, next) ? prev : next));
    // 프로브 시트가 헤더/푸터 콘텐츠(브랜드·제목·docNo·로고)에 따라 높이가 달라지므로
    // 그 값들도 재측정 트리거에 포함한다.
  }, [items, report.blockMeta, report.tableColWidths, report.brand, report.docNo, report.meta.titleKo, logoDataUrl, editing]);

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

      {/* 측정용 숨김 렌더 (페이지 높이 프로브 + 연속 flow + thead 참조) */}
      <div className="par-measure" ref={measureRef} aria-hidden>
        {/* 본문 가용 높이 실측 프로브 — 실제와 동일한 러닝헤더/푸터(로고 포함)를 가진 빈 시트.
            .par-measure(174mm) 폭에 눌리지 않도록 .par-measure-sheet 로 절대배치 210mm + zoom:1. */}
        <section className="par-sheet par-measure-sheet" data-cref="sheet">
          <RunningHeader brand={report.brand} title={report.meta.titleKo} logoDataUrl={logoDataUrl} />
          <div className="par-sheet-body" />
          <RunningFooter brand={report.brand} docNo={report.docNo} page={1} total={1} />
        </section>
        <table className="par-table" data-cref="thead">
          <thead>{tableHeadRow("grammar", editing)}</thead>
          <tbody><tr><td>측정</td><td>측정</td><td>측정</td></tr></tbody>
        </table>
        {/* edit 를 넘겨 실제 페이지와 '표 열 구성'을 일치시킨다(핸들 열 = 레이아웃 요소).
            상호작용 chrome 은 measure 플래그가 계속 차단하므로 클론에 아이콘은 생기지 않는다. */}
        <RunsView items={items} edit={edit} blockMeta={report.blockMeta} cols={{ widths: report.tableColWidths }} measure />
      </div>

      {(() => {
        if (!pages) return null;
        let bodyNo = 0;
        return pages.map((pageIds, pi) => {
          const pageItems = pageIds.map((id) => itemsById.get(id)).filter(Boolean) as FlowItem[];
          if (pageItems.length === 0) return null;
          let sheet: ReactNode;
          if (coverPageFlags[pi]) {
            sheet = (
              <section className="par-sheet par-sheet-cover" data-page-index={pi}>
                <CoverShell it={pageItems[0]} edit={edit} meta={report.blockMeta?.[pageItems[0].id]} />
              </section>
            );
          } else {
            bodyNo += 1;
            sheet = (
              <section className="par-sheet" data-page-index={pi}>
                <RunningHeader brand={report.brand} title={report.meta.titleKo} logoDataUrl={logoDataUrl} />
                <div className="par-sheet-body">
                  <RunsView items={pageItems} edit={edit} blockMeta={report.blockMeta} cols={colCtx} />
                </div>
                <RunningFooter brand={report.brand} docNo={report.docNo} page={bodyNo} total={bodyTotal} />
              </section>
            );
          }
          // 편집 모드에서만 relative 래퍼로 감싸 페이지 컨트롤을 시트 '바깥'(위·오른쪽)에
          // 둔다. 시트는 overflow:hidden 이라 자식으로 두면 바깥으로 못 나가기 때문.
          if (!edit) return <Fragment key={`p-${pi}`}>{sheet}</Fragment>;
          return (
            <div className="par-sheet-wrap" key={`p-${pi}`}>
              <PageControls ids={pageIds} pageIndex={pi} pageCount={pages.length} edit={edit} />
              {sheet}
            </div>
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
