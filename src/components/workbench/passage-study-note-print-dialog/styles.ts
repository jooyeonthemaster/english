export const STUDY_NOTE_PRINT_STYLES = `
        #passage-study-note-print-root .print-scroll { overflow: auto; }
        #passage-study-note-print-root .study-note-paper-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          min-width: min-content;
        }
        #passage-study-note-print-root .study-note-page {
          position: relative;
          box-sizing: border-box;
          width: 210mm;
          height: 297mm;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: white;
          border: 1px solid rgb(203, 213, 225);
          border-radius: 10px;
          padding: 7mm 8mm 6mm;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
          color: rgb(15, 23, 42);
        }
        #passage-study-note-print-root .study-note-page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          height: 9mm;
          flex: 0 0 auto;
          border-bottom: 1px solid rgb(226, 232, 240);
        }
        #passage-study-note-print-root .study-note-page-header p {
          margin: 0;
          font-size: 8px;
          font-weight: 800;
          color: rgb(148, 163, 184);
          letter-spacing: 0.16em;
        }
        #passage-study-note-print-root .study-note-page-header h2 {
          margin: 1px 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 900;
        }
        #passage-study-note-print-root .study-note-page-header > b {
          border-radius: 999px;
          background: rgb(15, 23, 42);
          color: white;
          padding: 2px 8px;
          font-size: 10px;
          line-height: 1.3;
        }
        #passage-study-note-print-root .study-note-page-points {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 3px;
          min-height: 6mm;
          padding: 3px 0;
          border-bottom: 1px solid rgb(241, 245, 249);
          flex: 0 0 auto;
        }
        #passage-study-note-print-root .page-point-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-width: 1px;
          border-style: solid;
          border-radius: 999px;
          padding: 1px 6px;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.35;
        }
        #passage-study-note-print-root .page-point-chip i {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          display: inline-block;
        }
        #passage-study-note-print-root .study-note-page-content {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          padding: 4px 0 3px;
        }
        #passage-study-note-print-root .study-note-block {
          margin-bottom: 4px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        #passage-study-note-print-root .study-note-page footer {
          height: 5mm;
          flex: 0 0 auto;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          border-top: 1px solid rgb(241, 245, 249);
          color: rgb(148, 163, 184);
          font-size: 8px;
          font-weight: 800;
        }
        #passage-study-note-print-root .eyebrow {
          margin: 0 0 2px;
          color: rgb(100, 116, 139);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.16em;
        }
        #passage-study-note-print-root .compact-title-row {
          display: grid;
          grid-template-columns: 1fr 120px;
          gap: 8px;
          align-items: start;
          border-bottom: 2px solid rgb(15, 23, 42);
          padding-bottom: 4px;
        }
        #passage-study-note-print-root .compact-title-row h1 {
          margin: 0;
          font-size: 19px;
          line-height: 1.05;
          font-weight: 950;
        }
        #passage-study-note-print-root .meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          margin-top: 4px;
        }
        #passage-study-note-print-root .tiny-meta {
          border: 1px solid rgb(226, 232, 240);
          border-radius: 4px;
          padding: 1px 4px;
          color: rgb(71, 85, 105);
          font-size: 9px;
          font-weight: 700;
          line-height: 1.3;
        }
        #passage-study-note-print-root .count-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3px;
        }
        #passage-study-note-print-root .count-grid span {
          display: flex;
          justify-content: space-between;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 5px;
          padding: 2px 4px;
          font-size: 9px;
          font-weight: 800;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .count-grid b { color: rgb(15, 23, 42); }
        #passage-study-note-print-root .summary-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 4px;
          margin-top: 5px;
        }
        #passage-study-note-print-root .summary-cell {
          border: 1px solid rgb(226, 232, 240);
          background: rgb(248, 250, 252);
          border-radius: 6px;
          padding: 4px 6px;
        }
        #passage-study-note-print-root .summary-cell.wide { grid-column: 1 / -1; }
        #passage-study-note-print-root .summary-cell p {
          margin: 0 0 2px;
          color: rgb(100, 116, 139);
          font-size: 8px;
          font-weight: 900;
        }
        #passage-study-note-print-root .summary-cell b,
        #passage-study-note-print-root .summary-cell span {
          display: block;
          font-size: 10px;
          line-height: 1.35;
        }
        #passage-study-note-print-root .flow-line {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          align-items: center;
          margin-top: 4px;
          font-size: 8.5px;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .flow-line span {
          border-radius: 4px;
          background: rgb(241, 245, 249);
          padding: 1px 4px;
        }
        #passage-study-note-print-root .flow-line b { color: rgb(37, 99, 235); margin-right: 3px; }
        #passage-study-note-print-root .dense-section-title {
          display: flex;
          align-items: center;
          gap: 5px;
          border-width: 1px;
          border-style: solid;
          border-radius: 6px;
          padding: 3px 6px;
          background: rgb(248, 250, 252);
          font-size: 11px;
          font-weight: 950;
        }
        #passage-study-note-print-root .dense-section-title b {
          margin-left: auto;
          font-size: 9px;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .translation-table,
        #passage-study-note-print-root .dense-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-top: 3px;
        }
        #passage-study-note-print-root .translation-table td {
          border-bottom: 1px solid rgb(226, 232, 240);
          vertical-align: top;
          padding: 2px 3px;
        }
        #passage-study-note-print-root .sentence-no {
          width: 18px;
          color: rgb(148, 163, 184);
          font-size: 8px;
          font-weight: 900;
          text-align: right;
        }
        #passage-study-note-print-root .english-line {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 9.2px;
          line-height: 1.35;
          font-weight: 650;
        }
        #passage-study-note-print-root .korean-line {
          margin: 1px 0 0;
          color: rgb(100, 116, 139);
          font-size: 8.6px;
          line-height: 1.35;
        }
        #passage-study-note-print-root .overview-mark-vocab { background: linear-gradient(to top, #dbeafe 45%, transparent 45%); border-bottom: 1px solid #3b82f6; }
        #passage-study-note-print-root .overview-mark-grammar { text-decoration: underline wavy #8b5cf6; text-underline-offset: 2px; }
        #passage-study-note-print-root .overview-mark-exam { background: linear-gradient(to top, #fef08a 48%, transparent 48%); }
        #passage-study-note-print-root .dense-table tr { break-inside: avoid; page-break-inside: avoid; }
        #passage-study-note-print-root .dense-table td {
          border: 1px solid rgb(226, 232, 240);
          vertical-align: top;
          padding: 3px 4px;
          font-size: 8.8px;
          line-height: 1.3;
        }
        #passage-study-note-print-root .dense-table .term-cell { width: 86px; background: rgb(248, 250, 252); }
        #passage-study-note-print-root .dense-table .tag-cell { width: 132px; }
        #passage-study-note-print-root .dense-table b,
        #passage-study-note-print-root .dense-table strong {
          display: block;
          font-size: 10px;
          color: rgb(15, 23, 42);
          line-height: 1.25;
        }
        #passage-study-note-print-root .dense-table small,
        #passage-study-note-print-root .dense-table em,
        #passage-study-note-print-root .dense-table i,
        #passage-study-note-print-root .dense-table span {
          display: block;
          margin-top: 1px;
          color: rgb(71, 85, 105);
          font-style: normal;
        }
        #passage-study-note-print-root .dense-table code {
          display: block;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 4px;
          background: white;
          padding: 2px 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          color: rgb(15, 23, 42);
          font-size: 8.8px;
          white-space: normal;
        }
        #passage-study-note-print-root .dense-table mark {
          display: inline-block;
          margin: 2px 2px 0 0;
          border-radius: 3px;
          background: rgb(239, 246, 255);
          color: rgb(37, 99, 235);
          padding: 1px 3px;
          font-size: 7.8px;
          font-weight: 800;
        }
        #passage-study-note-print-root .grammar-table .term-cell { width: 132px; }
        #passage-study-note-print-root .syntax-table .term-cell,
        #passage-study-note-print-root .exam-table .term-cell { width: 95px; }
        #passage-study-note-print-root .exam-summary-dense {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
        }
        #passage-study-note-print-root .exam-summary-dense p {
          margin: 0;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 5px;
          padding: 4px 5px;
          background: rgb(254, 252, 232);
          font-size: 9px;
          line-height: 1.35;
          color: rgb(71, 85, 105);
        }
        #passage-study-note-print-root .exam-summary-dense b {
          display: block;
          margin-bottom: 2px;
          color: rgb(161, 98, 7);
        }
        .study-note-measure-layer {
          position: fixed;
          left: -10000px;
          top: 0;
          width: 210mm;
          height: 297mm;
          visibility: hidden;
          pointer-events: none;
          z-index: -1;
        }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          #passage-study-note-print-root,
          #passage-study-note-print-root * { visibility: visible !important; }
          #passage-study-note-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
          #passage-study-note-print-root .print-scroll {
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            background: white !important;
          }
          #passage-study-note-print-root .study-note-paper-stack {
            display: block !important;
            min-width: 0 !important;
          }
          #passage-study-note-print-root .study-note-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            border-radius: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }
          #passage-study-note-print-root .study-note-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .study-note-no-print,
          .study-note-measure-layer { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `;
