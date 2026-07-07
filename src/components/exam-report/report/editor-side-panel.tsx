"use client";

// ============================================================================
// 학생 시험 리포트 — 리포트 에디터 우측 컨텍스트 패널
//
// 테마 6종 / 타이포그래피(제목·본문 폰트 오버라이드) / 표지 템플릿 3종 /
// 섹션 목록(숨김 토글·스크롤) / 공유 / 재생성.
// 모든 문서 변경은 onDocChange 로 상위(report-editor)의 디바운스 저장에 위임.
// 표지 미니 프리뷰는 현재 테마의 실제 primary 색에서 파생 — 패널에서도
// "테마 = 인격" 정합을 유지한다(고정 파란색 근사 폐기).
// ============================================================================

import { useCallback } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";
import {
  REPORT_COVER_TEMPLATE_IDS,
  type ReportCoverTemplateId,
  type ReportThemeId,
} from "@/lib/exam-report/report-schema";
import type { ExamStudentDetail } from "../ui-contracts";
import { resolveReportTheme } from "./report-themes";
import { ThemePicker } from "./theme-picker";
import { ReportFontPicker } from "./report-font-picker";
import { SharePanel } from "./share-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface EditorSidePanelProps {
  doc: StudentReportDoc;
  onDocChange: (next: StudentReportDoc) => void;
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

// photo-frame id 는 저장 하위호환으로 유지하되 렌더 컨셉은 "잉크 에디토리얼".
const COVER_META: Record<ReportCoverTemplateId, string> = {
  "gradient-band": "그라디언트 밴드",
  "minimal-line": "미니멀 라인",
  "photo-frame": "잉크 에디토리얼",
};

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </h3>
  );
}

export function EditorSidePanel({
  doc,
  onDocChange,
  student,
  onStudentChange,
  onRegenerate,
  regenerating,
}: EditorSidePanelProps) {
  const theme = resolveReportTheme(doc.themeId);

  const setTheme = useCallback(
    (themeId: ReportThemeId) => onDocChange({ ...doc, themeId }),
    [doc, onDocChange],
  );

  const setCoverTemplate = useCallback(
    (templateId: ReportCoverTemplateId) =>
      onDocChange({ ...doc, cover: { ...doc.cover, templateId } }),
    [doc, onDocChange],
  );

  const toggleHidden = useCallback(
    (id: string) =>
      onDocChange({
        ...doc,
        sections: doc.sections.map((s) =>
          s.id === id ? { ...s, hidden: !s.hidden } : s,
        ),
      }),
    [doc, onDocChange],
  );

  // report-document 는 각 섹션을 순서대로 .rpt-section 으로 렌더한다(edit 모드는
  // 숨김 포함 전부 렌더 → doc.sections 인덱스 = DOM 상 .rpt-section 인덱스). id 앵커에
  // 의존하지 않고 인덱스로 스크롤해 문서 렌더 변경 없이 동작하게 한다.
  const scrollToSectionAt = useCallback((index: number) => {
    if (typeof document === "undefined") return;
    const nodes = document.querySelectorAll<HTMLElement>(".rpt-section");
    nodes[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const visibleCount = doc.sections.filter((s) => s.hidden !== true).length;

  return (
    <div className="space-y-6">
      {/* 테마 */}
      <section>
        <PanelHeading>테마</PanelHeading>
        <ThemePicker
          value={doc.themeId}
          onChange={setTheme}
          disabled={regenerating}
        />
      </section>

      {/* 타이포그래피 — 테마 기본 페어링 위에 문서 단위 오버라이드 */}
      <section>
        <PanelHeading>타이포그래피</PanelHeading>
        <ReportFontPicker
          doc={doc}
          onDocChange={onDocChange}
          disabled={regenerating}
        />
      </section>

      {/* 표지 템플릿 */}
      <section>
        <PanelHeading>표지 템플릿</PanelHeading>
        <div className="grid grid-cols-3 gap-2">
          {REPORT_COVER_TEMPLATE_IDS.map((id) => {
            const active = doc.cover.templateId === id;
            return (
              <button
                key={id}
                type="button"
                disabled={regenerating}
                aria-pressed={active}
                onClick={() => setCoverTemplate(id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-1.5 transition-all disabled:cursor-not-allowed disabled:opacity-60",
                  active
                    ? "border-transparent"
                    : "border-slate-200 hover:border-slate-300",
                )}
                style={active ? { boxShadow: `0 0 0 2px ${theme.primary}` } : undefined}
              >
                <CoverMiniPreview templateId={id} primary={theme.primary} />
                <span className="text-[10px] font-medium text-slate-600">
                  {COVER_META[id]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 섹션 목록 */}
      <section>
        <PanelHeading>
          섹션 · 공개 {visibleCount}/{doc.sections.length}
        </PanelHeading>
        <ul className="space-y-0.5">
          {doc.sections.map((s, index) => {
            const hidden = s.hidden === true;
            return (
              <li
                key={s.id}
                className="flex items-center gap-1.5 rounded-md pl-1 pr-0.5 transition-colors hover:bg-slate-50"
              >
                {/* 문서의 CSS counter(01…)와 같은 자리수 — 목차 정합 */}
                <span
                  className={cn(
                    "w-5 shrink-0 text-right text-[10px] font-semibold tabular-nums",
                    hidden ? "text-slate-300" : "text-slate-400",
                  )}
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => scrollToSectionAt(index)}
                  className={cn(
                    "min-w-0 flex-1 truncate py-1.5 text-left text-xs transition-colors",
                    hidden
                      ? "text-slate-300 line-through"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {s.heading || sectionFallbackLabel(s.type)}
                </button>
                <button
                  type="button"
                  onClick={() => toggleHidden(s.id)}
                  aria-label={hidden ? "섹션 표시" : "섹션 숨김"}
                  aria-pressed={hidden}
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                    hidden
                      ? "text-slate-300 hover:text-slate-500"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                  )}
                >
                  {hidden ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 공유 */}
      <SharePanel student={student} onStudentChange={onStudentChange} />

      {/* 재생성 */}
      <section className="border-t border-slate-200 pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={regenerating}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                className={cn("h-4 w-4", regenerating && "animate-spin")}
              />
              {regenerating ? "재생성 중…" : "리포트 재생성"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>리포트를 다시 생성할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                강사가 수정한 총평·테마·숨김 설정은 유지되고 나머지 본문이 새로
                생성됩니다 · 5크레딧
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={onRegenerate}>
                재생성
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}

function CoverMiniPreview({
  templateId,
  primary,
}: {
  templateId: ReportCoverTemplateId;
  primary: string;
}) {
  // 표지 스타일을 아주 작게 근사한 프리뷰 — 색은 현재 테마의 실제 primary 파생.
  if (templateId === "gradient-band") {
    return (
      <div className="h-10 w-full overflow-hidden rounded bg-slate-100" aria-hidden>
        <div
          className="h-4 w-full"
          style={{
            background: `linear-gradient(135deg, ${primary}, color-mix(in srgb, ${primary} 55%, #0f172a))`,
          }}
        />
        <div className="space-y-1 p-1">
          <div className="h-1 w-3/4 rounded bg-slate-300" />
          <div className="h-1 w-1/2 rounded bg-slate-200" />
        </div>
      </div>
    );
  }
  if (templateId === "minimal-line") {
    return (
      <div
        className="flex h-10 w-full flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white p-1.5"
        aria-hidden
      >
        <div className="h-px w-1/3" style={{ background: primary }} />
        <div className="h-1 w-2/3 rounded bg-slate-400" />
        <div className="h-px w-1/3" style={{ background: primary }} />
      </div>
    );
  }
  // photo-frame(잉크 에디토리얼) — 큰 타이포 좌하단 정렬 + 페이지 번호 감각
  return (
    <div
      className="relative flex h-10 w-full flex-col justify-end gap-0.5 rounded border border-slate-200 bg-white p-1.5"
      aria-hidden
    >
      <span
        className="absolute right-1.5 top-1 text-[7px] font-semibold tabular-nums text-slate-300"
      >
        01
      </span>
      <div className="h-1.5 w-3/4 rounded-sm" style={{ background: primary }} />
      <div className="h-1 w-1/2 rounded-sm bg-slate-300" />
    </div>
  );
}

function sectionFallbackLabel(type: string): string {
  const map: Record<string, string> = {
    scoreOverview: "점수 개요",
    typePerformance: "유형별 성취",
    difficultyMatrix: "난이도 매트릭스",
    trapAnalysis: "함정 분석",
    wrongDeepDive: "오답 심층",
    conceptMap: "개념 지도",
    strengthWeakness: "강점·약점",
    studyPlan: "학습 계획",
    teacherComment: "강사 총평",
  };
  return map[type] ?? "섹션";
}
