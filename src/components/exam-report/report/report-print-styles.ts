// ============================================================================
// 학생 시험 리포트 — 인쇄 CSS (window.print / PDF 저장)
//
// @page 는 여기서만 선언한다(단일 소스 — 에디터/공개 페이지의 중복 @page 금지).
// 페이지네이션 정책(A4 4~6쪽 목표):
//  - 커버만 강제 개행(.rpt-cover break-after) — 문서의 첫인상은 한 면을 갖는다.
//  - 섹션은 자연 흐름(break-inside: auto) — 섹션당 1쪽씩 밀리는 낭비 박멸.
//  - 대신 원자 단위를 보호한다: 섹션 헤더(.rpt-sec-head)는 본문과 분리 금지,
//    카드(.rpt-card)·KPI(.rpt-kpi)는 중간 절단 금지.
//  - 웹 전용 장식(그림자·모션)은 제거, 배경/차트 색은 exact 로 유지.
// 앱 UI(헤더/사이드바) 숨김은 소비자(에디터/공개 페이지) 몫.
// ============================================================================

import { createElement, type FC } from "react";

export const REPORT_PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #ffffff !important; }
  .rpt-root,
  .rpt-root * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* flex 조각화 회피 — 인쇄는 블록 플로우로 전환하고 리듬은 margin 으로 재현 */
  .rpt-root { display: block !important; box-shadow: none !important; }
  .rpt-body {
    display: block !important;
    max-width: 100% !important;
    padding: 0 !important;
  }
  .rpt-body > * + * { margin-top: 7mm; }

  .rpt-cover { break-after: page; page-break-after: always; }
  .rpt-section { break-inside: auto; page-break-inside: auto; }
  .rpt-sec-head {
    break-inside: avoid; page-break-inside: avoid;
    break-after: avoid; page-break-after: avoid;
  }
  .rpt-card, .rpt-kpi { break-inside: avoid; page-break-inside: avoid; }

  .rpt-no-print { display: none !important; }
  .rpt-root [contenteditable] { outline: none !important; }
}
`;

/** 문서 어디서든 한 번 렌더하면 인쇄 규칙을 주입한다. */
export const ReportPrintStyles: FC = () =>
  createElement("style", {
    dangerouslySetInnerHTML: { __html: REPORT_PRINT_CSS },
  });
