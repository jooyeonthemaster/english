"use client";

// ============================================================================
// 공개 학생 리포트 — 우하단 플로팅 인쇄/PDF 저장 버튼
//
// window.print() 전에 document.fonts.ready + 2×rAF 를 기다린다 —
// 테마 폰트(명조 등)가 로드 중일 때 폴백 폰트로 인쇄되는 사고 방지.
// 인쇄 시 자신은 print CSS(.er-public-print-hide)로 숨겨진다.
// ============================================================================

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";

export function ReportPrintButton() {
  const [preparing, setPreparing] = useState(false);

  const handlePrint = async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      await document.fonts.ready;
    } catch {
      // 폰트 준비 실패가 인쇄 자체를 막지는 않는다.
    }
    // 레이아웃/페인트 커밋 이후 인쇄 다이얼로그를 연다.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    setPreparing(false);
    window.print();
  };

  return (
    <button
      type="button"
      onClick={() => void handlePrint()}
      disabled={preparing}
      className="er-public-print-hide fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-transform hover:scale-[1.03] hover:bg-blue-700 active:scale-95 disabled:scale-100 disabled:opacity-80"
      aria-label="리포트 인쇄 또는 PDF 저장"
    >
      {preparing ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Printer className="h-5 w-5" />
      )}
      {preparing ? "준비 중…" : "인쇄 · PDF 저장"}
    </button>
  );
}
