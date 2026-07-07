"use client";

// ============================================================================
// 학생 시험 리포트 — 에디터 인쇄 포털 (PDF 저장의 단일 경로)
//
// 이전 방식(body visibility 숨김 + :has() 형제 제거 + .er-print-area 절대배치)은
// 확정 결함 3종의 진원지였다:
//  ① 숨김 섹션 혼입 — `.rpt-section.opacity-50` 셀렉터가 실제 DOM(자식 div 에
//     opacity-50)과 미매칭 → "공개 제외" 섹션이 PDF 에 그대로 인쇄.
//  ② 절대배치가 Chromium 의 break-after/break-inside 페이지네이션을 무력화
//     → 섹션 중간 절단.
//  ③ :has() 미지원 엔진에서 앱 크롬(사이드바·헤더)이 빈 잔상으로 인쇄.
// → 전면 폐기. 인쇄 순간에만 document.body 직속 포털에 mode="view" 클린 문서를
// 렌더한다. view 모드라 hidden 섹션은 자연 제외되고, 문서가 정상 블록 플로우로
// 조판되므로 report-print-styles 의 @page/break 규칙이 온전히 동작한다.
// 산출물 = 공개 페이지 인쇄와 동일(같은 ReportDocument mode="view").
//
// 순서: 포털 마운트(+body.er-printing) → 테마/오버라이드 폰트 실로드 →
//       document.fonts.ready → 2×rAF(레이아웃 커밋) → window.print() →
//       afterprint → onDone(부모가 포털 언마운트).
// ============================================================================

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";
import { ReportDocument } from "./report-document";
import { resolveReportTheme } from "./report-themes";
import { ensureReportFonts } from "./report-fonts";

// 에디터가 <style> 로 1회 주입한다. @page 는 여기서 선언하지 않는다 —
// 단일 소스는 report-print-styles.ts(포털 내부 ReportDocument 가 렌더).
export const EDITOR_PRINT_CSS = `
/* 화면에서 포털은 존재하지 않는 것처럼 — 인쇄 미디어에서만 유일한 콘텐츠가 된다. */
.er-print-root { display: none; }
@media print {
  /* 포털이 떠 있는 동안(body.er-printing)만 앱 전체(사이드바·헤더·에디터·토스트·
     Radix/sonner 포털)를 흐름에서 제거한다. 포털 없이 Ctrl+P 하면 이 규칙은
     존재하지 않으므로 화면 그대로 인쇄된다(빈 페이지 사고 방지). */
  body.er-printing > *:not(.er-print-root) { display: none !important; }
  body.er-printing .er-print-root { display: block !important; }
  html, body {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    overflow: visible !important;
  }
}
`;

interface ReportPrintPortalProps {
  doc: StudentReportDoc;
  /** afterprint(또는 방어 타임아웃) 후 호출 — 부모가 포털을 언마운트한다. */
  onDone: () => void;
}

export function ReportPrintPortal({ doc, onDone }: ReportPrintPortalProps) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  // 포털 존재 중에만 body 에 er-printing 을 부여 — 앱 숨김 규칙의 스코프 게이트.
  useEffect(() => {
    document.body.classList.add("er-printing");
    return () => document.body.classList.remove("er-printing");
  }, []);

  useEffect(() => {
    let settled = false;
    let disposed = false;
    let fallbackTimer: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", finish);
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
      if (!disposed) doneRef.current();
    };

    const run = async () => {
      // 인쇄 산출물의 유령 폰트 박멸 — 테마 기본/문서 오버라이드 폰트를 실로드하고
      // 전체 폰트 준비를 기다린 뒤에만 인쇄 다이얼로그를 연다.
      const theme = resolveReportTheme(doc.themeId);
      try {
        await ensureReportFonts([
          doc.typography?.headingFamily ?? theme.headingFamily,
          doc.typography?.bodyFamily ?? theme.bodyFamily,
        ]);
        await document.fonts.ready;
      } catch {
        // 폰트 준비 실패가 인쇄 자체를 막지는 않는다(폴백 폰트로 진행).
      }
      if (settled || disposed) return;
      // 2×rAF — 포털 DOM 의 레이아웃/페인트 커밋 이후에 인쇄한다.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (settled || disposed) return;
      window.addEventListener("afterprint", finish);
      window.print();
      // afterprint 미발화 브라우저(일부 모바일 웹뷰) 방어 — print 반환 후 정리.
      fallbackTimer = window.setTimeout(finish, 1200);
    };
    void run();

    return () => {
      disposed = true;
      settled = true;
      window.removeEventListener("afterprint", finish);
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
    };
  }, [doc]);

  // mode="view" — hidden 섹션 자연 제외, 공개 페이지와 동일한 클린 문서.
  return createPortal(
    <div className="er-print-root">
      <ReportDocument doc={doc} mode="view" />
    </div>,
    document.body,
  );
}
