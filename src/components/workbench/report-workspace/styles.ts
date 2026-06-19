/**
 * 보고서 워크스페이스 + 인쇄용 CSS.
 *
 * 클래스 prefix: report-ws-* (workspace), report-page-* (페이지/블록), report-print-* (인쇄 전용)
 * @media print에서 핸들/사이드바/툴바를 모두 숨기고 transform 강제 해제.
 */

export const REPORT_WORKSPACE_STYLES = `
  /* ─── A4 페이지 ─────────────────────────────────────── */
  .report-page-canvas {
    position: relative;
    box-sizing: border-box;
    width: 210mm;
    height: 297mm;
    background: #FFFFFF;
    border: 1px solid rgb(203, 213, 225);
    border-radius: 6px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.10);
    overflow: hidden;
    flex: 0 0 auto;
    color: rgb(15, 23, 42);
    font-family: "Paperlogy", "Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
  }

  .report-page-canvas.report-page-bg-grid {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 5mm 5mm;
  }

  .report-page-canvas.report-page-bg-dots {
    background-image: radial-gradient(rgba(15, 23, 42, 0.10) 0.5px, transparent 0.5px);
    background-size: 4mm 4mm;
  }

  .report-page-canvas.report-page-bg-lines {
    background-image: linear-gradient(to bottom, transparent calc(8mm - 0.3px), var(--bg-pattern-color, #BFDBFE) calc(8mm - 0.3px), var(--bg-pattern-color, #BFDBFE) calc(8mm + 0.3px), transparent calc(8mm + 0.3px));
    background-size: 100% 8mm;
  }

  /* ─── 블록 wrapper ─────────────────────────────────── */
  .report-block-shell {
    position: absolute;
    box-sizing: border-box;
    transform-origin: 0 0;
  }

  /* ─── 블록 종류별 기본 스타일 ───────────────────── */
  .report-block-header { display: flex; flex-direction: column; justify-content: center; }
  .report-block-header h1 { margin: 0; font-weight: 800; line-height: 1.2; }
  .report-block-header .report-block-header-subtitle {
    margin-top: 1mm; font-size: 9pt; font-weight: 400;
  }
  .report-block-header .report-block-header-badge {
    display: inline-block; margin-top: 1mm; padding: 0.5mm 2mm;
    font-size: 7pt; font-weight: 600; border-radius: 2mm;
    background: rgba(255, 255, 255, 0.25);
  }

  .report-block-passage-body { overflow: hidden; }
  .report-block-passage-body ol {
    list-style: none; margin: 0; padding: 0;
  }
  .report-block-passage-body li {
    display: flex; gap: 2mm; margin-bottom: 1.5mm;
  }
  .report-block-passage-body .report-sentence-num {
    flex: 0 0 auto;
    font-weight: 600; opacity: 0.5; min-width: 5mm;
  }
  .report-block-passage-body .report-sentence-en {
    margin: 0;
  }
  .report-block-passage-body .report-sentence-ko {
    margin: 0.5mm 0 0 0;
    color: rgb(100, 116, 139); font-size: 0.92em;
  }

  .report-block-vocab-grid .report-vocab-list {
    display: grid; gap: 2mm; height: 100%;
    grid-template-columns: repeat(var(--vocab-cols, 2), 1fr);
  }
  .report-block-vocab-grid .report-vocab-item {
    padding: 1.5mm 2mm;
    border-radius: 1.5mm;
    background: rgba(255, 255, 255, 0.6);
  }
  .report-block-vocab-grid .report-vocab-item.highlight {
    background: rgba(191, 219, 254, 0.55);
  }
  .report-block-vocab-grid .report-vocab-word {
    font-weight: 700; font-size: 1em;
  }
  .report-block-vocab-grid .report-vocab-pos {
    font-size: 0.85em; opacity: 0.6; font-style: italic; margin-left: 1mm;
  }
  .report-block-vocab-grid .report-vocab-meaning {
    font-size: 0.92em; margin-top: 0.5mm;
  }
  .report-block-vocab-grid .report-vocab-example {
    font-size: 0.85em; opacity: 0.7; margin-top: 0.5mm; font-style: italic;
  }

  .report-block-grammar-card { display: flex; flex-direction: column; gap: 1.5mm; }
  .report-block-grammar-card .report-grammar-pattern {
    font-weight: 700; padding: 1mm 2mm; border-radius: 1mm;
    background: rgba(37, 99, 235, 0.08); display: inline-block; align-self: flex-start;
  }
  .report-block-grammar-card .report-grammar-explanation { line-height: 1.5; }
  .report-block-grammar-card .report-grammar-examples {
    margin: 0; padding-left: 3mm; font-size: 0.92em; opacity: 0.85;
  }
  .report-block-grammar-card .report-grammar-examples li {
    margin-bottom: 0.5mm;
  }

  .report-block-syntax-breakdown { display: flex; flex-direction: column; gap: 1.5mm; }
  .report-block-syntax-breakdown .report-syntax-sentence {
    font-weight: 600;
  }
  .report-block-syntax-breakdown .report-syntax-chunks {
    display: flex; flex-wrap: wrap; gap: 1.5mm;
  }
  .report-block-syntax-breakdown .report-syntax-chunk {
    padding: 0.5mm 1.5mm;
    border-radius: 1mm;
    background: rgba(8, 145, 178, 0.08);
    font-size: 0.92em;
  }
  .report-block-syntax-breakdown .report-syntax-chunk[data-role="V"] {
    background: rgba(220, 38, 38, 0.10);
    font-weight: 600;
  }

  .report-block-question { display: flex; flex-direction: column; gap: 1.5mm; }
  .report-block-question .report-question-type {
    font-size: 0.8em; opacity: 0.6; text-transform: uppercase;
    letter-spacing: 0.1em; font-weight: 700;
  }
  .report-block-question .report-question-stem { font-weight: 600; line-height: 1.5; }
  .report-block-question .report-question-choices {
    list-style: none; margin: 0; padding: 0;
  }
  .report-block-question .report-question-choices li { margin-bottom: 1mm; }

  .report-block-summary-callout {
    display: flex; flex-direction: column; gap: 1mm;
  }
  .report-block-summary-callout .report-callout-title {
    font-weight: 700; display: flex; align-items: center; gap: 1.5mm;
  }
  .report-block-summary-callout .report-callout-body { line-height: 1.5; }

  .report-block-analysis-box {
    display: flex; flex-direction: column; gap: 1mm;
  }
  .report-block-analysis-box .report-analysis-title {
    font-weight: 700; font-size: 1.05em;
    border-left: 1.2mm solid currentColor; padding-left: 1.5mm;
  }

  .report-block-glossary-table {
    display: flex; flex-direction: column; overflow: hidden;
  }
  .report-block-glossary-table table {
    width: 100%; border-collapse: collapse; font-size: 0.92em;
  }
  .report-block-glossary-table th,
  .report-block-glossary-table td {
    padding: 1mm 1.5mm; border-bottom: 0.3mm solid rgba(15, 23, 42, 0.10);
    text-align: left; vertical-align: top;
  }
  .report-block-glossary-table th {
    font-weight: 700; background: rgba(15, 23, 42, 0.04);
  }
  .report-block-glossary-table.striped tbody tr:nth-child(even) td {
    background: rgba(15, 23, 42, 0.025);
  }

  .report-block-divider {
    display: flex; align-items: center; gap: 2mm;
  }
  .report-block-divider hr {
    flex: 1; border: 0;
    border-top: 0.5mm solid currentColor; margin: 0;
  }
  .report-block-divider[data-variant="dashed"] hr { border-top-style: dashed; }
  .report-block-divider[data-variant="dotted"] hr { border-top-style: dotted; }
  .report-block-divider[data-variant="double"] hr {
    border-top-width: 0; border-top-style: double; border-top-width: 1.2mm;
  }
  .report-block-divider .report-divider-label {
    font-size: 0.85em; font-weight: 700; opacity: 0.8;
  }

  /* ─── Workspace UI ────────────────────────────────── */
  .report-ws-root {
    display: flex; flex-direction: column;
    height: 100vh; height: 100dvh;
    background: rgb(241, 245, 249);
  }
  .report-ws-topbar {
    flex: 0 0 auto;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: white;
    border-bottom: 1px solid rgb(226, 232, 240);
    z-index: 10;
  }
  .report-ws-topbar .report-ws-title {
    font-weight: 700; font-size: 15px;
    color: rgb(15, 23, 42);
  }
  .report-ws-topbar .report-ws-status {
    font-size: 12px; padding: 4px 8px; border-radius: 6px;
    background: rgb(241, 245, 249); color: rgb(100, 116, 139);
  }
  .report-ws-topbar .report-ws-status[data-status="saving"] {
    background: rgb(219, 234, 254); color: rgb(30, 64, 175);
  }
  .report-ws-topbar .report-ws-status[data-status="saved"] {
    background: rgb(220, 252, 231); color: rgb(22, 101, 52);
  }
  .report-ws-topbar .report-ws-spacer { flex: 1; }
  .report-ws-topbar button {
    height: 32px; padding: 0 12px;
    border: 1px solid rgb(226, 232, 240);
    border-radius: 6px;
    background: white;
    font-size: 13px; font-weight: 600;
    color: rgb(15, 23, 42);
    cursor: pointer;
  }
  .report-ws-topbar button:hover { background: rgb(248, 250, 252); }
  .report-ws-topbar button.report-ws-primary {
    background: rgb(37, 99, 235); color: white; border-color: rgb(37, 99, 235);
  }
  .report-ws-topbar button.report-ws-primary:hover { background: rgb(29, 78, 216); }

  .report-ws-body {
    flex: 1; display: flex; min-height: 0;
  }
  .report-ws-leftrail {
    flex: 0 0 160px; overflow-y: auto;
    padding: 12px; background: white;
    border-right: 1px solid rgb(226, 232, 240);
  }
  .report-ws-leftrail .report-ws-thumb {
    margin-bottom: 12px; padding: 8px;
    border-radius: 6px; border: 1px solid rgb(226, 232, 240);
    cursor: pointer;
  }
  .report-ws-leftrail .report-ws-thumb.active {
    border-color: rgb(37, 99, 235);
    background: rgb(239, 246, 255);
  }
  .report-ws-leftrail .report-ws-thumb-label {
    font-size: 11px; color: rgb(100, 116, 139); margin-bottom: 4px;
    text-align: center;
  }
  .report-ws-leftrail .report-ws-thumb-mini {
    width: 100%; aspect-ratio: 210/297;
    background: rgb(248, 250, 252);
    border: 1px solid rgb(226, 232, 240);
    border-radius: 3px;
  }

  .report-ws-viewport {
    flex: 1; overflow: auto;
    padding: 32px;
    display: flex; flex-direction: column;
    align-items: center; gap: 24px;
  }

  /* ─── 인쇄 ──────────────────────────────────────── */
  @media print {
    @page {
      size: A4;
      margin: 0;
    }
    body * { visibility: hidden !important; }
    .report-ws-root,
    .report-ws-root * { visibility: visible !important; }
    .report-ws-topbar,
    .report-ws-leftrail,
    .report-ws-no-print {
      display: none !important;
    }
    .report-ws-root {
      display: block !important;
      height: auto !important;
      background: white !important;
    }
    .report-ws-body { display: block !important; }
    .report-ws-viewport {
      padding: 0 !important;
      gap: 0 !important;
      background: white !important;
      overflow: visible !important;
      display: block !important;
    }
    .report-page-canvas {
      width: 210mm !important;
      height: 297mm !important;
      margin: 0 !important;
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      transform: none !important;
      page-break-after: always;
      page-break-inside: avoid;
    }
    .report-page-canvas:last-child { page-break-after: auto; }
    .report-block-shell { transform: rotate(var(--block-rot, 0deg)) !important; }
  }
`;
