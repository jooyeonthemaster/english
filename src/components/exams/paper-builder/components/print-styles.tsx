import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH } from "../constants";
import type { PaperSize } from "../types";

export function PrintStyles({ paperSize }: { paperSize: PaperSize }) {
  const paperSpec = PAPER_SIZE_SPECS[paperSize];

  // 미리보기(A4PaperPage)는 "가상 A4" 모델: 페이지 박스 폭 = baseWidth(=760px*widthRatio),
  // 높이 = baseWidth*heightRatio (aspect-ratio). 본문/패딩/글꼴은 모두 px 절대값이다.
  // 반면 window.print 는 .exam-a4-page 를 물리 용지(210mm 등)로 '박스만' 늘려서,
  // px 콘텐츠가 함께 커지지 않아 우/하단에 미리보기보다 큰 여백이 남았다.
  // → HWPX/DOCX 내보내기와 동일하게, 760 모델 박스를 물리 용지에 균일 배율로 확대한다.
  //   (글자도 같은 비율로 커져 용지를 꽉 채우고, 인쇄 결과가 미리보기와 1:1 일치한다.)
  const MM_TO_PX = 96 / 25.4; // CSS 절대단위: 1mm = 96/25.4 px
  const modelWidth = Math.round(PREVIEW_PAGE_WIDTH * paperSpec.widthRatio);
  const modelHeight = modelWidth * paperSpec.heightRatio;
  const printScale = (paperSpec.widthMm * MM_TO_PX) / modelWidth;

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

        /* 화면 전용 분할 안내("이어서"/"다음 칸으로 이어짐"/"지문 계속"/"N번 계속")는
           인쇄에서 글자만 숨기되 차지하던 높이는 그대로 둔다(display:none 아님).
           no-print 로 완전히 제거하면 인쇄 본문이 미리보기보다 (마커 높이만큼) 짧아져
           하단 여백이 더 커진다 → 인쇄=미리보기 높이로 맞춰 동일하게 채운다. */
        .continuation-hint {
          visibility: hidden !important;
        }

        /* 표지(cover)는 편집 모드 그대로 인쇄되므로, 값이 비어 자리표시자(placeholder)만
           남은 편집 필드는 인쇄에서 제거한다(EditableText 가 빈 값일 때 text-slate-300 부여). */
        .exam-cover-page .editable-paper-field.text-slate-300 {
          display: none !important;
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
          /* HWPX 다운로드와 동일 글꼴(맑은 고딕)로 인쇄 */
          font-family:
            "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif !important;
        }

        /* 인쇄 시 내부 콘텐츠를 760 모델 치수로 고정하고 물리 용지에 균일 확대.
           .exam-a4-page 박스는 위에서 210mm×297mm(overflow:hidden, page-break)로
           고정되어 페이지 분할은 그대로 견고하고, 내부 div 만 scale 로 용지를 채운다.
           (scale 후 modelWidth*printScale = 용지 폭, modelHeight*printScale = 용지 높이) */
        .exam-a4-page > div {
          width: ${modelWidth}px !important;
          height: ${modelHeight.toFixed(3)}px !important;
          transform: scale(${printScale.toFixed(5)}) !important;
          transform-origin: top left !important;
        }

        /* Tailwind ring utilities use box-shadow — neutralize */
        .exam-a4-page,
        .exam-a4-page * {
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
          box-shadow: none !important;
        }

        /* 편집 중 선택된 문항 하이라이트(bg-blue-50/80 + ring)는 인쇄에 안 보이게 한다.
           ring 은 위 box-shadow:none 으로 이미 제거되고, 파란 배경만 남으므로 투명 처리.
           문항 래퍼는 선택됐을 때만 배경이 생기므로 다른 의도된 배경엔 영향 없다. */
        .exam-a4-page [data-paper-item-id] {
          background-color: transparent !important;
        }

        /* Drop the forced page break on the LAST page only, otherwise the
           trailing break emits an extra blank sheet. Each .exam-a4-page is the
           only child of its .exam-preview-page-frame, so ".exam-a4-page:last-child"
           matched every page (not just the last) — target the last frame instead. */
        .exam-preview-page-frame:last-child .exam-a4-page {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      }
    `}</style>
  );
}
