"use client";

// ============================================================================
// 학생 시험 리포트 — 문서 렌더 루트 (공개 뷰어 /r 과 에디터 공용)
//
// 커버 → 섹션 순차 렌더. view 모드는 hidden 섹션 스킵, edit 모드는 전부 렌더.
// 루트가 하는 일: ① 테마+typography CSS 변수 주입(--rpt-*) ② 테마/오버라이드
// 폰트 실로드(ensureReportFonts — 유령 폰트 박멸) ③ 베이스/모션/인쇄 CSS 주입
// ④ ReportMotionRoot 로 스크롤 리빌 스코프 구성.
// 본문 폭 880px 단일 컬럼 — 섹션 번호 카운터(01…)는 CSS counter 로 DOM 순서 = 번호.
// props 계약 불변: { doc, mode, onDocChange?, className? }
// .rpt-section DOM 순서 계약(목차 인덱스 스크롤)도 불변 — 래퍼만 추가됨.
// ============================================================================

import { useEffect } from "react";
import type { ReportCover, ReportSection, StudentReportDoc } from "@/lib/exam-report/report-schema";
import { reportThemeStyle, resolveReportTheme } from "./report-themes";
import { ensureReportFonts } from "./report-fonts";
import { ReportPrintStyles } from "./report-print-styles";
import { ReportMotionRoot, REPORT_MOTION_CSS } from "./report-motion";
import { ReportCoverView } from "./report-cover";
import type { ReportRenderMode } from "./sections/section-shell";
import { ScoreOverviewSectionView } from "./sections/score-overview";
import { TypePerformanceSectionView } from "./sections/type-performance";
import { DifficultyMatrixSectionView } from "./sections/difficulty-matrix";
import { TrapAnalysisSectionView } from "./sections/trap-analysis";
import { WrongDeepDiveSectionView } from "./sections/wrong-deep-dive";
import { ConceptMapSectionView } from "./sections/concept-map";
import { StrengthWeaknessSectionView } from "./sections/strength-weakness";
import { StudyPlanSectionView } from "./sections/study-plan";
import { TeacherCommentSectionView } from "./sections/teacher-comment";

export interface ReportDocumentProps {
  doc: StudentReportDoc;
  mode: ReportRenderMode;
  onDocChange?: (next: StudentReportDoc) => void;
  className?: string;
}

// 문서 베이스 CSS — 섹션 번호 카운터 + 내러티브 강조(rpt-em) 하이라이트.
// (모션 CSS 와 함께 루트에서 1회 주입 — 섹션/내러티브는 클래스만 쓴다.)
const REPORT_BASE_CSS = `
.rpt-body { counter-reset: rptsec; }
.rpt-body .rpt-section { counter-increment: rptsec; }
.rpt-sec-num::before { content: counter(rptsec, decimal-leading-zero); }
.rpt-em {
  font-weight: 700;
  font-style: normal;
  color: inherit;
  background: linear-gradient(
    transparent 64%,
    color-mix(in srgb, var(--rpt-primary) 16%, transparent) 64%
  );
}
/* 섹션 내부 스크롤 유틸 — 긴 목록의 레이아웃 붕괴 방지.
   반드시 캡/집계 후 보조로만 사용, 인쇄에서는 전량 확장(잘림 금지). */
.rpt-scroll {
  max-height: var(--rpt-scroll-max, 340px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--rpt-line) transparent;
}
@media print {
  .rpt-scroll {
    max-height: none !important;
    overflow: visible !important;
    padding-right: 0 !important;
  }
}
`;

function SectionView({
  section,
  mode,
  onChange,
  academyName,
  dateLabel,
}: {
  section: ReportSection;
  mode: ReportRenderMode;
  onChange?: (next: ReportSection) => void;
  /** 총평 서명행용 — cover 메타를 문서 루트가 내려준다(섹션 data 에 없는 값) */
  academyName?: string;
  dateLabel?: string;
}) {
  switch (section.type) {
    case "scoreOverview":
      return <ScoreOverviewSectionView section={section} mode={mode} onChange={onChange} />;
    case "typePerformance":
      return <TypePerformanceSectionView section={section} mode={mode} onChange={onChange} />;
    case "difficultyMatrix":
      return <DifficultyMatrixSectionView section={section} mode={mode} onChange={onChange} />;
    case "trapAnalysis":
      return <TrapAnalysisSectionView section={section} mode={mode} onChange={onChange} />;
    case "wrongDeepDive":
      return <WrongDeepDiveSectionView section={section} mode={mode} onChange={onChange} />;
    case "conceptMap":
      return <ConceptMapSectionView section={section} mode={mode} onChange={onChange} />;
    case "strengthWeakness":
      return <StrengthWeaknessSectionView section={section} mode={mode} onChange={onChange} />;
    case "studyPlan":
      return <StudyPlanSectionView section={section} mode={mode} onChange={onChange} />;
    case "teacherComment":
      return (
        <TeacherCommentSectionView
          section={section}
          mode={mode}
          onChange={onChange}
          academyName={academyName}
          dateLabel={dateLabel}
        />
      );
    default:
      return null;
  }
}

export function ReportDocument({ doc, mode, onDocChange, className }: ReportDocumentProps) {
  const isEdit = mode === "edit";
  const theme = resolveReportTheme(doc.themeId);
  const headingFamily = doc.typography?.headingFamily ?? theme.headingFamily;
  const bodyFamily = doc.typography?.bodyFamily ?? theme.bodyFamily;

  // 테마 기본/오버라이드 폰트 실로드 — navy-classic 명조가 기기 폴백으로
  // 렌더되던 유령 폰트 결함의 수리 지점.
  useEffect(() => {
    void ensureReportFonts([headingFamily, bodyFamily]);
  }, [headingFamily, bodyFamily]);

  const updateCover = (patch: Partial<ReportCover>) => {
    onDocChange?.({ ...doc, cover: { ...doc.cover, ...patch } });
  };

  const updateSectionAt = (index: number, next: ReportSection) => {
    if (!onDocChange) return;
    const sections = doc.sections.map((s, i) => (i === index ? next : s));
    onDocChange({ ...doc, sections });
  };

  const visibleSections = doc.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => isEdit || !section.hidden);

  return (
    <div
      className={`rpt-root @container bg-white text-slate-800 ${className ?? ""}`}
      style={{
        ...reportThemeStyle(doc.themeId, doc.typography),
        fontFamily: "var(--rpt-body-font)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: REPORT_BASE_CSS + REPORT_MOTION_CSS }} />
      <ReportPrintStyles />
      <ReportMotionRoot>
        <div className="rpt-body mx-auto flex w-full max-w-[880px] flex-col gap-8 px-5 py-8 @min-[640px]:px-8 @min-[640px]:py-10">
          <ReportCoverView
            cover={doc.cover}
            mode={mode}
            onFieldChange={isEdit ? updateCover : undefined}
          />
          {visibleSections.map(({ section, index }) => (
            <SectionView
              key={section.id}
              section={section}
              mode={mode}
              onChange={isEdit ? (next) => updateSectionAt(index, next) : undefined}
              academyName={doc.cover.academyName}
              dateLabel={doc.cover.dateLabel}
            />
          ))}
          {doc.cover.academyName && (
            <footer className="pb-4 pt-2">
              <div className="h-px w-full" style={{ background: "var(--rpt-line)" }} aria-hidden />
              <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                {doc.cover.academyName}
              </p>
            </footer>
          )}
        </div>
      </ReportMotionRoot>
    </div>
  );
}

export default ReportDocument;
