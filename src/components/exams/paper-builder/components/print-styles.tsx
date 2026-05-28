import { PAPER_SIZE_SPECS } from "../constants";
import type { PaperSize } from "../types";

export function PrintStyles({ paperSize }: { paperSize: PaperSize }) {
  const paperSpec = PAPER_SIZE_SPECS[paperSize];

  return (
    <style jsx global>{`
      @page {
        size: ${paperSpec.widthMm}mm ${paperSpec.heightMm}mm;
        margin: 0;
      }

      @media print {
        html,
        body {
          background: white !important;
          margin: 0 !important;
          padding: 0 !important;
          width: ${paperSpec.widthMm}mm !important;
        }

        /* During print, the JS handler moves the print root into #exam-print-host
           and hides everything else by class. */
        body.exam-print-active > *:not(#exam-print-host) {
          display: none !important;
        }

        #exam-print-host {
          position: static !important;
          width: ${paperSpec.widthMm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
        }

        #exam-paper-print-root {
          width: ${paperSpec.widthMm}mm !important;
          max-width: ${paperSpec.widthMm}mm !important;
          height: auto !important;
          overflow: visible !important;
          padding: 0 !important;
          margin: 0 !important;
          background: white !important;
          display: block !important;
        }

        /* Inner pages container — wipe gap, max-width, alignment */
        #exam-paper-print-root > div {
          max-width: none !important;
          width: ${paperSpec.widthMm}mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          gap: 0 !important;
          display: block !important;
        }

        .exam-preview-zoom-spacer,
        .exam-preview-zoom-content {
          max-width: none !important;
          width: ${paperSpec.widthMm}mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          gap: 0 !important;
          display: block !important;
          transform: none !important;
        }

        .no-print,
        .no-print * {
          display: none !important;
          visibility: hidden !important;
        }

        .exam-a4-page {
          width: ${paperSpec.widthMm}mm !important;
          height: ${paperSpec.heightMm}mm !important;
          min-height: ${paperSpec.heightMm}mm !important;
          max-height: ${paperSpec.heightMm}mm !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          outline: none !important;
          overflow: hidden !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          aspect-ratio: auto !important;
          box-sizing: border-box !important;
          border-radius: 0 !important;
          display: block !important;
        }

        /* Tailwind ring utilities use box-shadow — neutralize */
        .exam-a4-page,
        .exam-a4-page * {
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
          box-shadow: none !important;
        }

        .exam-a4-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      }
    `}</style>
  );
}
