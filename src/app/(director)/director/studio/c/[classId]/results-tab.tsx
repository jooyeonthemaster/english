"use client";

// ============================================================================
// 클래스 홈 — 결과 탭 (docs/class-studio-spec.md §3.2 결과)
//
// listStudioClassAssignments 셀프 로드: 이 클래스의 스튜디오 배포 과제를
// 최신순으로 보여준다. 행 = 제목 + 모듈 칩 · 완료 n/m · 평균 첫 시도 정답률 ·
// 마감일 · 「자세히」. 자세히는 WideModal 로 기존 학습 현황 컴포넌트
// (WorksheetStudyReportTab — getWorksheetStudyOverview 소비, 학생별 매트릭스 +
// 반 집계)를 그대로 재사용한다(스펙 §12 재사용 원칙).
// ============================================================================

import { useEffect, useState } from "react";
import { BarChart3, ChevronRight, Loader2, Send } from "lucide-react";
import {
  listStudioClassAssignments,
  type StudioClassAssignmentRow,
} from "@/actions/studio/deploy";
import { WideModal } from "@/components/layout/wide-modal";
import { WorksheetStudyReportTab } from "@/components/study-assignments/study-report-tab";
import { STUDIO_MODULE_BY_ID } from "@/lib/studio/modules";
import { cn } from "@/lib/utils";
import { EMPTY_SECONDARY_BTN, EmptyState, SectionHeader } from "./section-header";

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

/** 점수 3단 톤 — 학습 현황 탭과 동일 축(<50 rose / <80 blue / 이상 emerald) */
function scoreText(score: number): string {
  if (score < 50) return "text-rose-600";
  if (score < 80) return "text-blue-600";
  return "text-emerald-600";
}

/** 라벨 위 · 값 아래 — 행 우측 지표 공용 셀 */
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[11px] text-slate-400">{label}</span>
      {children}
    </div>
  );
}

function AssignmentRow({
  row,
  onDetail,
}: {
  row: StudioClassAssignmentRow;
  onDetail: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        {/* 좌측: 제목 + 모듈 칩 + 배포일 */}
        <div className="min-w-0 flex-1 basis-56">
          <h3 className="text-[14px] font-bold text-slate-900 break-keep">{row.title}</h3>
          {row.modules.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {row.modules.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600"
                >
                  {STUDIO_MODULE_BY_ID.get(m)?.label ?? m}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">배포 {fmtDay(row.createdAt)}</p>
        </div>

        {/* 우측: 지표 + 자세히 */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
          <StatCell label="완료">
            <span className="text-[13px] font-semibold tabular-nums text-slate-700">
              {row.doneCount}/{row.taskCount}
            </span>
          </StatCell>
          <StatCell label="평균 첫 시도 정답률">
            {row.avgFirstTryPct != null ? (
              <span
                className={cn(
                  "text-[13px] font-bold tabular-nums",
                  scoreText(row.avgFirstTryPct),
                )}
              >
                {row.avgFirstTryPct}%
              </span>
            ) : (
              <span className="text-[12px] text-slate-400">기록 없음</span>
            )}
          </StatCell>
          <StatCell label="마감">
            <span className="text-[13px] tabular-nums text-slate-600">{fmtDay(row.dueAt)}</span>
          </StatCell>
          <button
            type="button"
            onClick={onDetail}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 lg:min-h-0"
          >
            자세히
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultsTab({
  classId,
  onGoPassages,
}: {
  classId: string;
  /** 빈 상태에서 지문 탭으로 넘기는 수단 — 안내만 하고 길이 없던 문제(감사 L1-10) */
  onGoPassages?: () => void;
}) {
  const [rows, setRows] = useState<StudioClassAssignmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [detail, setDetail] = useState<{ assignmentId: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      const res = await listStudioClassAssignments(classId);
      if (cancelled) return;
      if (res.success && res.data) {
        setRows(res.data);
      } else {
        setError(res.error ?? "배포 목록을 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, reloadTick]);

  // 4탭 공통 섹션 헤더 — 결과 탭에는 이 행이 아예 없어 다른 탭보다 콘텐츠가
  // 53px 위에서 시작했다(감사 L1-02·L4-08). 로딩·실패·빈 상태에서도 항상 렌더한다.
  const header = (
    <SectionHeader
      label={
        rows === null ? "불러오는 중…" : rows.length === 0 ? "결과" : `배포 ${rows.length}건`
      }
    />
  );

  // 최초 로드
  if (!rows && !error) {
    return (
      <div>
        {header}
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-[13px] text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          배포 목록을 불러오는 중입니다
        </div>
      </div>
    );
  }

  // 로드 실패
  if (!rows) {
    return (
      <div>
        {header}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white py-12">
          <p className="text-[13px] text-slate-500 break-keep">{error}</p>
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 lg:min-h-0"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 빈 상태 (스펙 §3.2 문구 + 지문 탭으로 가는 수단 — 감사 L1-10·L4-04)
  if (rows.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Send}
          title="아직 배포한 학습이 없습니다 — 지문 탭에서 시작해 보세요"
          action={
            onGoPassages ? (
              <button type="button" onClick={onGoPassages} className={EMPTY_SECONDARY_BTN}>
                지문 탭으로 이동
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <AssignmentRow
            key={r.assignmentId}
            row={r}
            onDetail={() => setDetail({ assignmentId: r.assignmentId, title: r.title })}
          />
        ))}
      </div>

      {/* 자세히 — 학생별 학습 현황 (기존 컴포넌트 재사용, 가로 스크롤 내장) */}
      {detail && (
        <WideModal
          open
          onClose={() => setDetail(null)}
          icon={BarChart3}
          title={detail.title}
          description="학생별 학습 현황"
          maxWidthClassName="max-w-[1200px]"
        >
          <div className="p-4 md:p-6">
            <WorksheetStudyReportTab assignmentId={detail.assignmentId} />
          </div>
        </WideModal>
      )}
    </div>
  );
}
