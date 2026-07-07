"use client";

// ============================================================================
// 공개 학생 리포트 — 인터랙티브 본문 (모바일 우선)
//
// sticky 섹션 목차(칩 스크롤러) + report-document(mode "view") + 플로팅 인쇄.
// 목차 스크롤 계약: view 모드 문서는 visible 섹션만 순서대로 .rpt-section 으로
// 렌더한다 → 목차 칩 인덱스 = DOM .rpt-section 인덱스(id 앵커 아님).
// 인쇄: @page/break 규칙의 단일 소스는 report-print-styles.ts(문서가 주입) —
// 여기서는 웹 크롬(목차·버튼·헤더·푸터) 숨김과 배경 정리만 담당한다.
// ============================================================================

import { useCallback } from "react";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";
import { ReportDocument } from "@/components/exam-report/report/report-document";
import { ReportPrintButton } from "./report-print-button";

const PRINT_CSS = `
@media print {
  .er-public-print-hide { display: none !important; }
  html, body { background: #ffffff !important; }
}`;

const SECTION_FALLBACK: Record<string, string> = {
  scoreOverview: "점수 개요",
  typePerformance: "유형별 성취",
  difficultyMatrix: "난이도",
  trapAnalysis: "함정 분석",
  wrongDeepDive: "오답 심층",
  conceptMap: "개념 지도",
  strengthWeakness: "강점·약점",
  studyPlan: "학습 계획",
  teacherComment: "강사 총평",
};

interface ReportPublicContentProps {
  doc: StudentReportDoc;
}

export function ReportPublicContent({ doc }: ReportPublicContentProps) {
  const visibleSections = doc.sections.filter((s) => s.hidden !== true);

  const scrollToIndex = useCallback((index: number) => {
    if (typeof document === "undefined") return;
    const nodes = document.querySelectorAll<HTMLElement>(".rpt-section");
    nodes[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <>
      <style>{PRINT_CSS}</style>

      {visibleSections.length > 1 && (
        <nav
          aria-label="섹션 목차"
          className="er-public-print-hide sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur"
        >
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleSections.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToIndex(i)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
              >
                {s.heading || SECTION_FALLBACK[s.type] || "섹션"}
              </button>
            ))}
          </div>
        </nav>
      )}

      <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-8">
        <ReportDocument doc={doc} mode="view" />
      </div>

      <ReportPrintButton />
    </>
  );
}
