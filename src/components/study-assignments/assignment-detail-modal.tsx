"use client";

// ============================================================================
// 과제 상세 모달 — WideModal (좁은 모달 금지 계약)
//
// getStudyAssignmentDetail 로 학생별 태스크(라이브 상태·점수·응시 링크)를
// 로드한다. 시작·마감 편집/종료·재개/삭제 푸터와 복제 재배포·조용한
// 새로고침 클러스터는 ./assignment-detail-footer, 학생 행 드릴다운(EXAM 답안
// 검토 드로어·QUESTIONS 답안 대조·GRAMMAR 훈련 기록·대상 팝오버)은
// ./assignment-detail-parts, 문항 통계 탭은 ./assignment-question-stats 분리.
// 변경 성공 시 onChanged 로 부모 보드가 목록·캘린더를 재조회한다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  FileText,
  ListChecks,
  SpellCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getStudyAssignmentDetail } from "@/actions/study-assignments";
import { StatusPill } from "@/components/layout/page-frame";
import { WideModal } from "@/components/layout/wide-modal";
import { ReviewDrawer } from "@/components/exams/exam-detail-client-parts/deployment-tab-parts/review-drawer";
import {
  AssignContentPreview,
  type AssignPreviewTarget,
} from "./assign-content-preview";
import type { ComposerPreset } from "./assignment-composer";
import {
  AssignmentDetailFooter,
  DetailActionsCluster,
} from "./assignment-detail-footer";
import {
  fmtDateTime,
  GrammarSpecSummary,
  MetaTile,
  TargetPopover,
  TaskTable,
} from "./assignment-detail-parts";
import { AssignmentQuestionStats } from "./assignment-question-stats";
import type {
  StudyAssignmentDetail,
  StudyAssignmentKind,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel, seoulDayDiff } from "@/lib/study-assignments/status";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

type DetailView = "tasks" | "content" | "stats";

/** 서울(UTC+9) 현재 시각 "HH:mm" — "N시 갱신" 표시용 */
function nowHm(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function AssignmentDetailModal({
  assignmentId,
  onClose,
  onChanged,
  onDuplicate,
}: {
  /** null 이면 닫힘 — id 세팅 시 상세 로드 후 오픈 */
  assignmentId: string | null;
  onClose: () => void;
  /** 변경(마감·종료/재개·삭제) 성공 시 — 부모 목록 재조회 */
  onChanged: () => void;
  /** 복제 재배포 — 보드(과제 관리)가 배선. 미전달(학생 허브 경유) 시 버튼 미렌더 */
  onDuplicate?: (preset: ComposerPreset, studentIds: string[]) => void;
}) {
  const [detail, setDetail] = useState<StudyAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DetailView>("tasks");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  /** non-silent 로드마다 증가 — 푸터 폼(key)을 리마운트해 프리필 */
  const [prefillTick, setPrefillTick] = useState(0);
  /** EXAM 행 "답안 검토" — 기존 채점 검토 드로어(ReviewDrawer) 재사용 */
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);

  const load = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    const res = await getStudyAssignmentDetail(id);
    if (res.success && res.data) {
      setDetail(res.data);
      setRefreshedAt(nowHm());
      // silent 새로고침은 푸터의 편집 중 폼 값을 덮지 않는다 —
      // prefillTick(리마운트 key)은 non-silent 로드에서만 올린다.
      if (!silent) setPrefillTick((t) => t + 1);
    } else if (silent) {
      toast.error(res.error ?? "새로고침에 실패했습니다.");
    } else {
      setDetail(null);
      setError(res.error ?? "과제 상세를 불러오지 못했습니다.");
    }
    if (silent) setRefreshing(false);
    else setLoading(false);
  }, []);

  useEffect(() => {
    if (assignmentId) {
      setView("tasks");
      setRefreshedAt(null);
      setReviewSubmissionId(null);
      void load(assignmentId);
    } else {
      setDetail(null);
      setError(null);
      setReviewSubmissionId(null);
    }
  }, [assignmentId, load]);

  // 드로어(Sheet, z-50)가 모달(WideModal, z-50) 위에 떠 있는 동안 —
  // WideModal 도 document ESC 를 듣기 때문에 가드하지 않으면 ESC 한 번에
  // 둘 다 닫힌다. 드로어 오버레이가 전면을 덮어 백드롭/X 는 어차피 차단됨.
  const handleModalClose = useCallback(() => {
    if (reviewSubmissionId) return;
    onClose();
  }, [reviewSubmissionId, onClose]);

  // 과제 내용 실물 미리보기 대상 — GRAMMAR 는 스펙 요약으로 별도 렌더
  const previewTarget: AssignPreviewTarget | null = detail
    ? detail.kind === "EXAM" && detail.refId
      ? { kind: "EXAM", refId: detail.refId }
      : detail.kind === "WORKSHEET" && detail.refId
        ? { kind: "WORKSHEET", refId: detail.refId }
        : detail.kind === "QUESTIONS" &&
            Array.isArray((detail.payload as { questionIds?: string[] }).questionIds)
          ? {
              kind: "QUESTIONS",
              questionIds: (detail.payload as { questionIds: string[] }).questionIds,
            }
          : null
    : null;

  // DONE 행 scorePercent 평균(U1 배관) — 채점된 완료가 없으면 null
  const scoreStats = useMemo(() => {
    if (!detail) return null;
    const scores = detail.tasks
      .filter((t) => t.liveStatus === "DONE" && t.scorePercent != null)
      .map((t) => t.scorePercent as number);
    if (scores.length === 0) return null;
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    return { avg, max: Math.max(...scores), min: Math.min(...scores) };
  }, [detail]);

  const kind = detail?.kind ?? "QUESTIONS";
  const dday = detail?.dueAt
    ? dDayLabel(seoulDayDiff(new Date(), new Date(detail.dueAt)))
    : null;
  /** ACTIVE + 시작 전 = 예약(violet) — 학생 앱에는 잠금 노출 */
  const scheduled =
    !!detail &&
    detail.status === "ACTIVE" &&
    new Date(detail.availableFrom).getTime() > Date.now();
  const statsAvailable = detail?.kind === "EXAM" || detail?.kind === "QUESTIONS";
  const waitCount = detail
    ? Math.max(0, detail.taskCount - detail.doneCount - detail.inProgressCount)
    : 0;

  const viewTabs: [DetailView, string][] = detail
    ? [
        ["tasks", "배정 현황"],
        ["content", detail.kind === "GRAMMAR" ? "출제 범위" : "과제 내용"],
        ...(statsAvailable ? ([["stats", "문항 통계"]] as [DetailView, string][]) : []),
      ]
    : [];

  return (
    <>
    <WideModal
      open={!!assignmentId}
      onClose={handleModalClose}
      icon={detail ? KIND_ICON[kind] : ListChecks}
      title={detail?.title ?? "과제 상세"}
      description={
        detail
          ? `${STUDY_KIND_META[kind].label} · ${detail.targetSummary ?? `${detail.taskCount}명`}`
          : undefined
      }
      maxWidthClassName="max-w-[1100px]"
      footer={
        detail ? (
          <AssignmentDetailFooter
            key={`${detail.id}:${prefillTick}`}
            detail={detail}
            onReload={async () => {
              if (assignmentId) await load(assignmentId);
            }}
            onChanged={onChanged}
            onClose={onClose}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-[13px] text-slate-500">{error}</p>
            {assignmentId ? (
              <button
                type="button"
                onClick={() => void load(assignmentId)}
                className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                다시 시도
              </button>
            ) : null}
          </div>
        ) : detail ? (
          <>
            {/* 요약 스트립 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <MetaTile label="종류">
                <StatusPill tone={STUDY_KIND_META[kind].tone}>
                  {STUDY_KIND_META[kind].label}
                </StatusPill>
              </MetaTile>
              <MetaTile label="상태">
                {detail.status !== "ACTIVE" ? (
                  <StatusPill tone="slate">종료</StatusPill>
                ) : scheduled ? (
                  <span className="flex flex-col gap-1">
                    <span>
                      <StatusPill tone="violet">예약</StatusPill>
                    </span>
                    <span className="text-[11px] font-medium tabular-nums text-slate-400">
                      시작 {fmtDateTime(detail.availableFrom)}
                    </span>
                  </span>
                ) : (
                  <StatusPill tone="blue" pulse>
                    진행 중
                  </StatusPill>
                )}
              </MetaTile>
              <MetaTile label="대상">
                <TargetPopover
                  targets={detail.targets}
                  summary={detail.targetSummary ?? `${detail.taskCount}명`}
                />
              </MetaTile>
              <MetaTile label="마감">
                {detail.dueAt ? (
                  <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
                    {fmtDateTime(detail.dueAt)}
                    {dday ? (
                      <span
                        className={cn(
                          "text-[12px] font-bold",
                          detail.overdueCount > 0 ? "text-rose-600" : "text-blue-600",
                        )}
                      >
                        {dday}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-slate-400">마감 없음</span>
                )}
              </MetaTile>
              <MetaTile label="진행">
                {/* 3세그먼트 — emerald 완료 / blue 진행(pulse) / slate-200 잔여 트랙 */}
                <span className="flex flex-col gap-1.5 pt-1">
                  <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    {detail.taskCount > 0 && detail.doneCount > 0 ? (
                      <span
                        className="h-full bg-emerald-500"
                        style={{ width: `${(detail.doneCount / detail.taskCount) * 100}%` }}
                      />
                    ) : null}
                    {detail.taskCount > 0 && detail.inProgressCount > 0 ? (
                      <span
                        className="h-full animate-pulse bg-blue-600"
                        style={{ width: `${(detail.inProgressCount / detail.taskCount) * 100}%` }}
                      />
                    ) : null}
                  </span>
                  <span className="text-[11px] font-medium tabular-nums text-slate-500">
                    완료 {detail.doneCount} · 진행 {detail.inProgressCount} · 대기 {waitCount}
                    {detail.overdueCount > 0 ? (
                      <span className="text-rose-600"> · 기한 지남 {detail.overdueCount}</span>
                    ) : null}
                  </span>
                </span>
              </MetaTile>
              <MetaTile label="평균 점수">
                {scoreStats ? (
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-bold tabular-nums text-slate-900">
                      {scoreStats.avg}%
                    </span>
                    <span className="text-[11px] font-medium tabular-nums text-slate-400">
                      최고 {scoreStats.max} ·{" "}
                      <span className="text-rose-600">최저 {scoreStats.min}</span>
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </MetaTile>
            </div>

            {/* 학생 노출 안내문 */}
            {detail.instructions ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-1 text-[11px] font-semibold text-slate-400">학생 안내문</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                  {detail.instructions}
                </p>
              </div>
            ) : null}

            {/* 뷰 전환(배정 현황·과제 내용·문항 통계) + 복제·새로고침 클러스터 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {viewTabs.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={cn(
                      "h-8 rounded-md border px-3 text-[12.5px] font-semibold transition-colors",
                      view === key
                        ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                        : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <DetailActionsCluster
                detail={detail}
                onDuplicate={onDuplicate}
                refreshing={refreshing}
                refreshedAt={refreshedAt}
                onRefresh={() => {
                  if (assignmentId) void load(assignmentId, { silent: true });
                }}
              />
            </div>

            {view === "content" ? (
              detail.kind === "GRAMMAR" ? (
                <GrammarSpecSummary payload={detail.payload} />
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <AssignContentPreview
                    target={previewTarget}
                    className="h-[min(520px,60dvh)]"
                    emptyHint="이 과제의 콘텐츠를 불러올 수 없습니다. 원본이 삭제됐는지 확인해 주세요."
                  />
                </div>
              )
            ) : null}

            {/* 문항 통계 — EXAM·QUESTIONS 한정, 첫 활성화 시 lazy 로드(캐시 유지 위해 hidden) */}
            {statsAvailable ? (
              <div className={cn(view !== "stats" && "hidden")}>
                <AssignmentQuestionStats assignmentId={detail.id} active={view === "stats"} />
              </div>
            ) : null}

            {/* 학생별 태스크 테이블 — 드릴다운(답안 검토·답안 대조·훈련 기록) 포함 */}
            <div
              className={cn(
                "overflow-hidden rounded-lg border border-slate-200 bg-white",
                view !== "tasks" && "hidden",
              )}
            >
              <TaskTable
                kind={kind}
                title={detail.title}
                dueAt={detail.dueAt}
                examMode={
                  detail.kind === "EXAM"
                    ? ((detail.payload as { mode?: "TABLET" | "OMR" }).mode ?? null)
                    : null
                }
                tasks={detail.tasks}
                questionIds={
                  detail.kind === "QUESTIONS" &&
                  Array.isArray((detail.payload as { questionIds?: string[] }).questionIds)
                    ? (detail.payload as { questionIds: string[] }).questionIds
                    : []
                }
                onOpenReview={setReviewSubmissionId}
              />
            </div>
          </>
        ) : null}
      </div>
    </WideModal>

    {/* EXAM 답안 검토 — 기존 채점 검토 드로어 재사용(Sheet z-50, WideModal 과
        동급이지만 포털이 나중에 붙어 위에 그려진다). 뮤테이션 후 상세 재조회. */}
    <ReviewDrawer
      submissionId={reviewSubmissionId}
      onClose={() => setReviewSubmissionId(null)}
      onMutated={() => {
        if (assignmentId) void load(assignmentId);
        onChanged();
      }}
    />
    </>
  );
}
