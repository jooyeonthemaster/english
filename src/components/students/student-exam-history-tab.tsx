"use client";

// 학생 상세 "응시 이력" 탭 (유닛 V5, 설계문서 §5-V5)
//
// 자급자족 로드: getStudentExamHistory 서버 액션(INTERNAL+EXTERNAL 통합 시계열)
// → 요약 스탯 3카드 + 점수율 추이 차트 + 유형×시험 정오율 히트맵 + 응시 테이블
// + AI 추세변화 분석 섹션(exam-history-parts/trend-report-section, 5cr).
// 이력 0건은 빈 상태(오류 아님). 정오 요약의 "미확인"은 채점 미확정 문항이며
// 정답으로도 오답으로도 세지 않는다(UNKNOWN 불변식).
//
// 행 드릴다운(U4): INTERNAL 행 "답안 보기" → 기존 ReviewDrawer(채점 검토)를 탭
// 안에서 그대로 오픈(refId=ExamSubmission.id). EXTERNAL 행 "리포트 열기" →
// /director/workbench/exam-report/{analysisId}/students/{refId} 새 탭.
// 미확인>0 행은 rose 강조 + "확정 필요" 라벨로 채점 미확정을 드러낸다.

import { useEffect, useState } from "react";
import {
  ClipboardList,
  ExternalLink,
  Minus,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getStudentExamHistory,
  type ExamHistorySummary,
  type StudentExamHistoryData,
} from "@/actions/students/exam-history";
import type { TrendSitting } from "@/lib/exam-scoring/trend";
import { ReviewDrawer } from "@/components/exams/exam-detail-client-parts/deployment-tab-parts/review-drawer";
import { ScoreTrendChart } from "./exam-history-parts/score-trend-chart";
import { TypeHeatmap } from "./exam-history-parts/type-heatmap";
import { TrendReportSection } from "./exam-history-parts/trend-report-section";

// ── 요약 스탯 카드 ───────────────────────────────────────────────────────────

const TREND_META = {
  UP: { label: "상승세", Icon: TrendingUp, className: "text-[#3182F6]" },
  FLAT: { label: "유지", Icon: Minus, className: "text-[#8B95A1]" },
  DOWN: { label: "하락세", Icon: TrendingDown, className: "text-slate-500" },
} as const;

function StatCard({ label, children, caption }: {
  label: string;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
      <p className="mb-1 text-xs text-[#8B95A1]">{label}</p>
      <div className="text-2xl font-bold text-[#191F28]">{children}</div>
      {caption && <p className="mt-1 text-[11px] text-[#8B95A1]">{caption}</p>}
    </div>
  );
}

function SummaryCards({ summary }: { summary: ExamHistorySummary }) {
  const trend = summary.trend ? TREND_META[summary.trend] : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard label="총 응시">{summary.totalSittings}회</StatCard>
      <StatCard
        label="평균 점수율"
        caption={summary.avgScorePct == null ? "점수율이 확정된 응시가 없습니다." : undefined}
      >
        {summary.avgScorePct == null ? "-" : `${summary.avgScorePct}%`}
      </StatCard>
      <StatCard
        label="최근 추세"
        caption={
          trend ? "최근 3회 점수율 기준입니다." : "점수 확정 응시가 2회 이상 필요합니다."
        }
      >
        {trend ? (
          <span className={`flex items-center gap-1.5 ${trend.className}`}>
            <trend.Icon className="size-6" />
            {trend.label}
          </span>
        ) : (
          "-"
        )}
      </StatCard>
    </div>
  );
}

// ── 응시 테이블(최신 회차 먼저) ──────────────────────────────────────────────

/** EXTERNAL 행의 리포트 워크스페이스 딥링크 — analysisId 미동봉(구 스냅샷)이면 null.
 *  분석 탭(?step=analysis)에 곧장 착지 — 채점 도구가 아니라 결과를 보러 가는 맥락. */
function externalReportHref(sitting: TrendSitting): string | null {
  if (sitting.source !== "EXTERNAL" || !sitting.examAnalysisId) return null;
  return `/director/workbench/exam-report/${sitting.examAnalysisId}/students/${sitting.refId}?step=analysis`;
}

/** 정오 요약 — 미확인>0 이면 rose 강조 + "확정 필요" 마이크로 라벨(UNKNOWN 불변식 표출) */
function VerdictSummaryCell({ sitting }: { sitting: TrendSitting }) {
  const base = [`정답 ${sitting.correct}`, `오답 ${sitting.wrong}`];
  if (sitting.partial > 0) base.push(`부분 ${sitting.partial}`);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>{base.join(" · ")}</span>
      {sitting.unknown > 0 && (
        <>
          <span className="font-semibold text-rose-600">미확인 {sitting.unknown}</span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
            확정 필요
          </span>
        </>
      )}
    </span>
  );
}

const ROW_ACTION_CLASS =
  "inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50";

function SittingsTable({
  sittings,
  onReview,
}: {
  sittings: TrendSitting[];
  /** INTERNAL 행 드릴다운 — ExamSubmission.id 로 ReviewDrawer 오픈 */
  onReview: (submissionId: string) => void;
}) {
  // 시계열(오름차순)의 인덱스가 회차 번호 — 표는 최신부터 보여준다.
  const rows = sittings.map((sitting, i) => ({ sitting, round: i + 1 })).reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[#E5E8EB]">
            <th className="px-3 py-2 text-left text-xs font-medium text-[#8B95A1]">회차</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[#8B95A1]">시험명</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[#8B95A1]">구분</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[#8B95A1]">일자</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-[#8B95A1]">점수</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[#8B95A1]">정오 요약</th>
            <th className="px-3 py-2" aria-label="상세 열기" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sitting, round }) => {
            const reportHref = externalReportHref(sitting);
            const clickable = sitting.source === "INTERNAL" || reportHref != null;
            const openRow = () => {
              if (sitting.source === "INTERNAL") onReview(sitting.refId);
              else if (reportHref) window.open(reportHref, "_blank", "noopener,noreferrer");
            };
            return (
              <tr
                key={sitting.refId}
                onClick={clickable ? openRow : undefined}
                className={`border-b border-[#F2F4F6] transition-colors ${
                  clickable ? "cursor-pointer hover:bg-blue-50/40" : ""
                }`}
              >
                <td className="px-3 py-2.5 text-xs text-[#8B95A1]">{round}회</td>
                <td className="max-w-[220px] px-3 py-2.5">
                  <span className="block truncate font-medium text-[#191F28]" title={sitting.title}>
                    {sitting.title}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {sitting.source === "INTERNAL" ? (
                    <Badge className="bg-[#E8F3FF] text-[#3182F6]">자체</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge className="bg-[#F2F4F6] text-[#4E5968]">외부</Badge>
                      {sitting.examTypeLabel && (
                        <span className="text-[11px] text-[#8B95A1]">{sitting.examTypeLabel}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-[#4E5968]">
                  {sitting.date.slice(0, 10)}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-[#191F28]">
                  {sitting.scorePct == null ? "-" : `${sitting.scorePct}%`}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-[#4E5968]">
                  <VerdictSummaryCell sitting={sitting} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {sitting.source === "INTERNAL" ? (
                    <button
                      type="button"
                      className={ROW_ACTION_CLASS}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(sitting.refId);
                      }}
                    >
                      답안 보기
                    </button>
                  ) : reportHref ? (
                    <a
                      href={reportHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={ROW_ACTION_CLASS}
                      onClick={(e) => e.stopPropagation()}
                    >
                      리포트 열기
                      <ExternalLink className="size-3.5 text-slate-400" />
                    </a>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 로드 상태 골격 ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

// ── 탭 본체 ──────────────────────────────────────────────────────────────────

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: StudentExamHistoryData };

export function StudentExamHistoryTab({ studentId }: { studentId: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  // INTERNAL 행 드릴다운 — ReviewDrawer 대상 ExamSubmission.id (null=닫힘)
  const [reviewId, setReviewId] = useState<string | null>(null);

  // 초기 상태가 이미 "loading" 이므로 이펙트 본문에서 동기 setState 를 하지 않는다.
  // 재시도 버튼이 loading 전환을 담당한다(student-billing-section 로드 관례 미러).
  async function load() {
    const result = await getStudentExamHistory(studentId);
    if (result.success && result.data) {
      setState({ phase: "ready", data: result.data });
    } else {
      setState({
        phase: "error",
        message: result.error || "응시 이력을 불러오는 중 오류가 발생했습니다.",
      });
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (state.phase === "loading") return <LoadingSkeleton />;

  if (state.phase === "error") {
    return (
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-12 text-center">
        <p className="text-sm text-[#4E5968]">{state.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            setState({ phase: "loading" });
            void load();
          }}
          className="mt-4 h-11 border-[#E5E8EB] px-4 text-[#4E5968] hover:bg-[#F7F8FA]"
        >
          <RotateCcw className="size-4" /> 다시 시도
        </Button>
      </div>
    );
  }

  const { sittings, summary } = state.data;

  if (sittings.length === 0) {
    return (
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-12 text-center">
        <ClipboardList className="mx-auto size-8 text-[#8B95A1]" />
        <p className="mt-3 text-sm text-[#4E5968]">
          아직 응시 이력이 없습니다. 시험지 관리에서 학생을 할당해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryCards summary={summary} />

      <section className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#191F28]">점수율 추이</h3>
        <p className="mt-1 text-xs text-[#8B95A1]">
          회차별 점수율(%) 변화입니다. 점수율 미확정 회차는 점을 표시하지 않습니다.
        </p>
        <div className="mt-4">
          <ScoreTrendChart sittings={sittings} />
        </div>
      </section>

      <section className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#191F28]">유형×시험 정오율</h3>
        <p className="mt-1 text-xs text-[#8B95A1]">
          행은 문항 유형, 열은 회차입니다. 색이 진할수록 정답률이 높습니다.
        </p>
        <div className="mt-4">
          <TypeHeatmap sittings={sittings} />
        </div>
      </section>

      <section className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#191F28]">응시 기록</h3>
        <p className="mt-1 text-xs text-[#8B95A1]">
          채점이 완료된 응시만 표시합니다. 미확인은 채점 미확정 문항 수입니다. 자체
          응시는 답안 보기, 외부 분석은 리포트 열기로 상세를 확인합니다.
        </p>
        <div className="mt-3">
          <SittingsTable sittings={sittings} onReview={setReviewId} />
        </div>
      </section>

      <TrendReportSection studentId={studentId} />

      {/* INTERNAL 응시 채점 검토 — 기존 완성형 드로어 재사용(신규 렌더러 발명 금지).
          드로어 안 수동확정/재채점이 점수를 바꿀 수 있으므로 뮤테이션 시 이력 재적재. */}
      <ReviewDrawer
        submissionId={reviewId}
        onClose={() => setReviewId(null)}
        onMutated={() => void load()}
      />
    </div>
  );
}
