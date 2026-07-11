"use client";

// ============================================================================
// 과제 콘텐츠 실물 미리보기 패널 — "이름만 보고 배포" 금지 계약의 UI 정본
//
// 컴포저(배포 전 확인)·과제 상세 모달(배포 후 확인)이 공유한다.
//  - EXAM/QUESTIONS: 워크벤치 문항 렌더러(StructuredQuestionRenderer) 실물 —
//    강사면이므로 해설은 접힌 토글(as-explanation)로 포함.
//  - WORKSHEET: /g/w 뷰어와 동일한 A4 렌더 코어(PRIME/PAGES)를 읽기 전용
//    fit-width 스케일로 — 지면이 그대로 보인다(리플로우 금지).
// 데이터는 src/actions/study-assignments/preview.ts (디렉터 전용, 정답 포함).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileSearch, Loader2 } from "lucide-react";
import {
  getExamAssignPreview,
  getQuestionsAssignPreview,
  getWorksheetAssignPreview,
  type AssignPreviewQuestion,
  type WorksheetAssignPreview,
} from "@/actions/study-assignments/preview";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import { PageCanvasFrame } from "@/components/workbench/report-workspace/PageCanvas";
import { REPORT_WORKSPACE_STYLES } from "@/components/workbench/report-workspace/styles";
import { cn } from "@/lib/utils";

/** A4 CSS px 폭(210mm @96dpi) — fit-width 배율 계산용(/g/w 와 동일) */
const A4_WIDTH_PX = 210 * (96 / 25.4);

const ACP_DOC_CSS = `
  .acp-doc-prime .par-root { --par-zoom: var(--acp-zoom, 1) !important; }
  .acp-doc-pages { zoom: var(--acp-zoom, 1); }
`;

export type AssignPreviewTarget =
  | { kind: "EXAM"; refId: string }
  | { kind: "WORKSHEET"; refId: string }
  | { kind: "QUESTIONS"; questionIds: string[] };

export function AssignContentPreview({
  target,
  className,
  emptyHint = "왼쪽에서 배포할 콘텐츠를 선택하면 실물이 여기에 표시됩니다.",
}: {
  /** null 이면 빈 상태(선택 대기) */
  target: AssignPreviewTarget | null;
  className?: string;
  emptyHint?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssignPreviewQuestion[] | null>(null);
  const [examMeta, setExamMeta] = useState<{
    title: string;
    questionCount: number;
    totalPoints: number;
    duration: number | null;
    examId: string;
  } | null>(null);
  const [worksheet, setWorksheet] = useState<WorksheetAssignPreview | null>(null);

  const targetKey =
    target === null
      ? "none"
      : target.kind === "QUESTIONS"
        ? `q:${target.questionIds.join(",")}`
        : `${target.kind}:${target.refId}`;

  useEffect(() => {
    if (!target) {
      setQuestions(null);
      setExamMeta(null);
      setWorksheet(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      if (target.kind === "EXAM") {
        const res = await getExamAssignPreview(target.refId);
        if (!alive) return;
        if (res.success && res.data) {
          setExamMeta({
            title: res.data.title,
            questionCount: res.data.questionCount,
            totalPoints: res.data.totalPoints,
            duration: res.data.duration,
            examId: res.data.examId,
          });
          setQuestions(res.data.questions);
          setWorksheet(null);
        } else {
          setError(res.error ?? "미리보기를 불러오지 못했습니다.");
        }
      } else if (target.kind === "QUESTIONS") {
        const res = await getQuestionsAssignPreview(target.questionIds);
        if (!alive) return;
        if (res.success && res.data) {
          setQuestions(res.data);
          setExamMeta(null);
          setWorksheet(null);
        } else {
          setError(res.error ?? "미리보기를 불러오지 못했습니다.");
        }
      } else {
        const res = await getWorksheetAssignPreview(target.refId);
        if (!alive) return;
        if (res.success && res.data) {
          setWorksheet(res.data);
          setQuestions(null);
          setExamMeta(null);
        } else {
          setError(res.error ?? "미리보기를 불러오지 못했습니다.");
        }
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  return (
    <div className={cn("flex min-h-0 flex-col bg-slate-50/80", className)}>
      {/* 헤더 스트립 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
          <FileSearch className="size-3.5" aria-hidden />
          실물 미리보기
          {examMeta ? (
            <span className="font-normal text-slate-400">
              — {examMeta.questionCount}문항 · {examMeta.totalPoints}점 만점
              {examMeta.duration ? ` · ${examMeta.duration}분` : ""}
            </span>
          ) : questions && target?.kind === "QUESTIONS" ? (
            <span className="font-normal text-slate-400">— {questions.length}문항</span>
          ) : worksheet ? (
            <span className="font-normal text-slate-400">— {worksheet.passageTitle}</span>
          ) : null}
        </p>
        {examMeta ? (
          <Link
            href={`/director/exams/${examMeta.examId}`}
            target="_blank"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <ExternalLink className="size-3" aria-hidden />
            전체 화면
          </Link>
        ) : null}
      </div>

      {/* 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!target ? (
          <EmptyState hint={emptyHint} />
        ) : loading ? (
          <div className="flex h-full min-h-[240px] items-center justify-center gap-2 text-[12.5px] text-slate-400">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            실물을 불러오는 중입니다
          </div>
        ) : error ? (
          <p className="p-6 text-center text-[12.5px] text-rose-600">{error}</p>
        ) : questions ? (
          <QuestionsPreviewList questions={questions} />
        ) : worksheet ? (
          <WorksheetDocPreview worksheet={worksheet} />
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ hint }: { hint: string }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 p-6 text-center">
      <FileSearch className="size-8 text-slate-200" aria-hidden />
      <p className="max-w-[260px] text-[12.5px] leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}

// ── 문항 실물 목록 (EXAM/QUESTIONS) ─────────────────────────────────────────

function QuestionsPreviewList({ questions }: { questions: AssignPreviewQuestion[] }) {
  if (questions.length === 0) {
    return <EmptyState hint="표시할 문항이 없습니다. 문항이 삭제됐는지 확인해 주세요." />;
  }
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      {questions.map((q, i) => (
        <div
          key={q.id}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-1.5">
            <span className="flex size-5 items-center justify-center rounded bg-slate-800 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <span className="text-[11px] font-medium text-slate-400">{q.points}점</span>
          </div>
          <div className="p-3.5">
            <StructuredQuestionRenderer
              question={q}
              index={i}
              hideHeader
              showTypeLabel
              answerRevealMode="as-explanation"
              sourcePassageContent={q.passageContent ?? undefined}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 학습지 지면 실물 (WORKSHEET) — /g/w 렌더 코어의 읽기 전용 축소판 ─────────

function WorksheetDocPreview({ worksheet }: { worksheet: WorksheetAssignPreview }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitZoom, setFitZoom] = useState(0.6);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth - 32; // 좌우 패딩
      if (w > 100) setFitZoom(Math.min(1, w / A4_WIDTH_PX));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const style = useMemo(
    () => ({ "--acp-zoom": String(fitZoom) }) as React.CSSProperties,
    [fitZoom],
  );

  return (
    <div ref={containerRef} className="min-h-full p-4" style={style}>
      <style dangerouslySetInnerHTML={{ __html: ACP_DOC_CSS }} />
      {worksheet.doc.type === "PRIME" ? (
        <div className="acp-doc-prime [&_.par-sheet]:mx-auto [&_.par-sheet]:!shadow-[0_1px_8px_rgba(15,23,42,0.12)]">
          <AnalysisReportDocument report={worksheet.doc.report} />
        </div>
      ) : (
        <div className="acp-doc-pages mx-auto" style={{ width: A4_WIDTH_PX }}>
          <style dangerouslySetInnerHTML={{ __html: REPORT_WORKSPACE_STYLES }} />
          <div className="flex flex-col gap-4">
            {worksheet.doc.document.pages.map((page, idx) => (
              <PageCanvasFrame key={page.id ?? idx} page={page} zoom={1} mode="view" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
