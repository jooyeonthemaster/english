"use client";

// 학생 상세 허브 — 시험 리포트 탭.
// 이 학생에게 귀속된 내신 시험 분석·상담 리포트(ExamReportStudent) 목록.
// 워크스페이스(채점·리포트 편집)와 공개 리포트(/r) 딥링크가 연계 축이다.
// GENERATED 카드는 "미리보기"로 공유 여부와 무관하게 문서를 그 자리에서 확인한다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, ExternalLink, Eye, FileBarChart, PenLine } from "lucide-react";
import type { StudentExamReportRow } from "@/actions/students/exam-reports";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { formatRelativeTime } from "@/lib/utils";
import { ReportPreviewModal } from "./report-preview-modal";

const REPORT_STATUS: Record<string, { label: string; tone: PillTone; pulse?: boolean }> = {
  NONE: { label: "리포트 없음", tone: "slate" },
  GENERATING: { label: "생성 중", tone: "blue", pulse: true },
  GENERATED: { label: "리포트 완성", tone: "emerald" },
  FAILED: { label: "생성 실패", tone: "rose" },
};

const EXAM_TYPE_LABEL: Record<string, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "기타",
};

// 카드 액션 2단 구조 — 주 액션 1개(전폭 솔리드) + 보조는 테두리 없는 고스트 행.
// Link/button/a 가 섞여도 픽셀 동일(고정 높이·중앙정렬·무테두리).
const ACTION_PRIMARY =
  "flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700";
const ACTION_GHOST =
  "inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700";

/** 채점만 끝난(reportStatus NONE) 카드의 정오 요약 칩 — scoreCounts 없으면 미렌더 */
function VerdictChips({ counts }: { counts: NonNullable<StudentExamReportRow["scoreCounts"]> }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label="정오 요약">
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-emerald-700">
        ○ {counts.correct}
      </span>
      <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-rose-700">
        ✕ {counts.wrong}
      </span>
      {counts.unknown > 0 ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-slate-500">
          미확인 {counts.unknown}
        </span>
      ) : null}
    </span>
  );
}

export function StudentReportsTab({ reports }: { reports: StudentExamReportRow[] }) {
  const [preview, setPreview] = useState<StudentExamReportRow | null>(null);
  const pathname = usePathname();
  // 워크스페이스로 진입 시 뒤로가기가 exam-report 내부(허브/분석 워크스페이스)로
  // 새지 않고 이 학생 상세(시험 리포트 탭)로 되돌아오도록 복귀 URL 을 실어 보낸다.
  const fromParam = pathname
    ? `&from=${encodeURIComponent(`${pathname}?tab=reports`)}`
    : "";

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14">
        <FileBarChart className="size-8 text-slate-300" aria-hidden />
        <p className="text-[13.5px] font-medium text-slate-500">
          이 학생의 시험 리포트가 아직 없습니다.
        </p>
        <p className="max-w-md text-center text-[12px] leading-relaxed text-slate-400">
          내신 시험 분석에서 시험지를 분석하고 이 학생을 등록하면, 채점과 상담 리포트가
          여기에 모입니다. 자체 시험지 응시 결과도 채점이 끝나면 자동으로 연결됩니다.
        </p>
        <Link
          href="/director/workbench/exam-report"
          className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          내신 시험 분석으로 이동
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => {
          const status = REPORT_STATUS[r.reportStatus] ?? REPORT_STATUS.NONE;
          const base = `/director/workbench/exam-report/${r.analysisId}/students/${r.reportStudentId}`;
          const analysisHref = `${base}?step=analysis${fromParam}`;
          const verdictHref = `${base}?step=verdict${fromParam}`;
          return (
            <div
              key={r.reportStudentId}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition duration-200 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 text-sm font-medium text-slate-900">
                  {r.analysisTitle}
                </p>
                <StatusPill tone={status.tone} pulse={status.pulse}>
                  {status.label}
                </StatusPill>
              </div>
              <p className="line-clamp-1 text-xs text-slate-500">
                {[
                  r.schoolName,
                  r.examYear ? `${r.examYear}년` : null,
                  r.semester ? `${r.semester === "FIRST" ? "1" : "2"}학기` : null,
                  EXAM_TYPE_LABEL[r.examType] ?? r.examType,
                ]
                  .filter(Boolean)
                  .join(" · ") || "메타 정보 없음"}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {r.scoreText ? (
                  <span className="font-semibold text-slate-600">{r.scoreText}</span>
                ) : (
                  <span>채점 전</span>
                )}
                {r.reportStatus === "NONE" && r.scoreCounts ? (
                  <VerdictChips counts={r.scoreCounts} />
                ) : null}
                {r.gradingConfirmed ? (
                  <span className="text-emerald-600">채점 확정</span>
                ) : null}
                <span className="ml-auto">{formatRelativeTime(r.updatedAt)}</span>
              </div>
              {/* 액션 — 2단: 주 액션 1개만 전폭 버튼, 나머지는 고스트 링크 행.
                  채점(정오표)과 분석(AI 0콜 리포트)은 별개 도구 — 확정 전엔 채점이,
                  확정 후엔 분석이 주 액션이 되도록 스왑한다. */}
              <div className="mt-1 flex flex-col gap-1.5 border-t border-slate-50 pt-2.5">
                {r.gradingConfirmed ? (
                  <Link href={analysisHref} className={ACTION_PRIMARY}>
                    <BarChart3 className="size-4" aria-hidden />
                    분석 보기
                  </Link>
                ) : (
                  <Link href={verdictHref} className={ACTION_PRIMARY}>
                    <PenLine className="size-4" aria-hidden />
                    채점하기
                  </Link>
                )}
                <div className="flex items-center justify-center gap-1">
                  {r.gradingConfirmed ? (
                    <Link href={verdictHref} className={ACTION_GHOST}>
                      <PenLine className="size-3.5" aria-hidden />
                      채점
                    </Link>
                  ) : (
                    <Link href={analysisHref} className={ACTION_GHOST}>
                      <BarChart3 className="size-3.5" aria-hidden />
                      분석
                    </Link>
                  )}
                  {r.reportStatus === "GENERATED" ? (
                    <button
                      type="button"
                      onClick={() => setPreview(r)}
                      className={ACTION_GHOST}
                    >
                      <Eye className="size-3.5" aria-hidden />
                      미리보기
                    </button>
                  ) : null}
                  {r.sharePath ? (
                    <a
                      href={r.sharePath}
                      target="_blank"
                      rel="noreferrer"
                      className={ACTION_GHOST}
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      공유
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ReportPreviewModal target={preview} onClose={() => setPreview(null)} />
    </>
  );
}
