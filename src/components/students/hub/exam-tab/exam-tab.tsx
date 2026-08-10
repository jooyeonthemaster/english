"use client";

// ============================================================================
// 학생 상세 허브 — 시험 탭 셸 (v3 대개편 A-1 전면 재작성, v3 design §D1-3 시험 와이어)
//
// 구 student-exam-history-tab.tsx 의 후계. 데이터는 기존 getStudentExamHistory
// 서버 액션 그대로(aggregateStudentExamHistory·summarize 무개조 재사용 — 이
// 파일은 표시층만 소유한다).
//
// 골격(2607 §7.1 재배치 — 응시 기록이 이 탭의 주인공이다):
//  [B] 스코프 칩 — 전체/배포 시험(INTERNAL)/내신 분석(EXTERNAL). 선택 시 카드
//      전부(추이·히트맵·테이블·KPI) 그 모집단으로 재계산. TrendSitting.source
//      필드가 모집단 축(trend.ts 실측 — origin 아님).
//  [C] StatTile 3 — 총 응시·평균 점수율·추세(오름/유지/내림 말 표기, R1 정본).
//  [D] 응시 기록 — **전폭 최상단**. 구 배치는 2열 그리드 2행 좌측이라 표가
//      min-w-[620px] 를 못 채워 「답안 보기」 열이 상시 잘렸다. 전폭으로 올리면
//      잘림이 사라지고, 이 탭에 온 목적(어느 응시를 볼까)이 첫 화면에 온다.
//  [E] 2열 그리드 h-[420px] 페어 — 점수율 추이 | 유형별 정답률 히트맵.
//      점 클릭→행 하이라이트는 셸 리프트(highlightRefId).
//
// AI 추세 분석 카드는 제거했다(2607 §7.1) — 5크레딧 생성물이 응시 기록·추이와
// 같은 화면에서 경쟁하며 지면을 절반 먹었고 갱신 축(수동 생성)도 달랐다.
// API 라우트(/api/students/[id]/exam-trend)·크레딧 상수·prisma 컬럼은 그대로 둔다
// (무회귀 — 데이터와 과금 경로를 건드리지 않고 표시층에서만 내렸다).
//
// 폴링(R6 예외 성문화): usePollingAction 60초 — 시험 집계는 두 테이블
// (ExamSubmission·ExamReportStudent) 풀스캔 병합이고 채점 이벤트가 저빈도라
// 학습지·어법의 15초와 달리 60초 인터벌이 규범이다(v3 design §0.2·R6).
//
// onDeploy(§D2-1): 셸(student-hub-client)의 openDeployComposer 배선 지점 —
// 허브(A-4)가 배선한다. 미전달(교사면 등 비허브 문맥) 시 히트맵 CTA·빈 상태
// CTA 모두 미렌더 — 비허브 페이지는 Tabs 가 ?tab= 쿼리를 소비하지 않아
// ?tab=tasks 링크가 죽은 링크였다(N-19 수리: 폴백 링크 제거).
// ============================================================================

import { useMemo, useState } from "react";
import {
  ClipboardList,
  ListFilter,
  Loader2,
  Minus,
  Send,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getStudentExamHistory } from "@/actions/students/exam-history";
import type { StudentExamHistoryData } from "@/actions/students/exam-history";
import { SubmissionDetailModal } from "@/components/exams/exam-detail-client-parts/deployment-tab-parts/submission-detail-modal";
import { StatStrip, StatTile } from "@/components/layout/page-frame";
import {
  summarize,
  type ExamHistoryTrendDirection,
} from "@/lib/exam-scoring/summarize";
import type { WeakSpot } from "@/lib/student-analytics/types";
import {
  EMPTY_STATES,
  EXAM_SCOPE_LABELS,
  type ExamScopeLabelKey,
} from "@/lib/wording/director-glossary";
import { FilterChip, FilterChipRow, RefreshStrip, TabEmpty } from "../analytics/kit";
import { usePollingAction } from "../analytics/use-polling-action";
import { ScoreTrendCard } from "./score-trend-card";
import { SittingsTableCard } from "./sittings-table-card";
import { TypeHeatmapCard } from "./type-heatmap-card";

/** [B] 스코프 — ALL 은 두 모집단 합산, 나머지는 TrendSitting.source 일치분만 */
type ExamScope = ExamScopeLabelKey;

const SCOPE_ORDER: readonly ExamScope[] = ["ALL", "INTERNAL", "EXTERNAL"] as const;

// 스코프별 요약 재계산은 lib/exam-scoring/summarize(서버 액션과 공용 정본)를
// 그대로 사용한다 — 구 클라이언트 미러(summarizeScope)는 N-18 수리로 제거.

/** 추세 말 표기(§D1-3 [C]) — UP/FLAT/DOWN 을 「오름/유지/내림」으로 */
const TREND_META: Record<
  ExamHistoryTrendDirection,
  { word: string; Icon: typeof TrendingUp; tone: "emerald" | "slate" | "rose" }
> = {
  UP: { word: "오름", Icon: TrendingUp, tone: "emerald" },
  FLAT: { word: "유지", Icon: Minus, tone: "slate" },
  DOWN: { word: "내림", Icon: TrendingDown, tone: "rose" },
};

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function StudentExamTab({
  studentId,
  onDeploy,
}: {
  studentId: string;
  /** 취약점 원클릭 배포(§D2-1) — 셸 openDeployComposer 배선 지점. A-4 배선 전 optional */
  onDeploy?: (spots: WeakSpot[], source: "exam") => void;
}) {
  const [scope, setScope] = useState<ExamScope>("ALL");
  /** 점수율 추이 점 클릭 → 응시 테이블 행 하이라이트(§D1-3 와이어 — 셸 리프트 상태) */
  const [highlightRefId, setHighlightRefId] = useState<string | null>(null);
  /** INTERNAL 행 드릴다운 — SubmissionDetailModal 대상 ExamSubmission.id (null=닫힘) */
  const [reviewId, setReviewId] = useState<string | null>(null);

  // R6 예외 — 시험 탭만 60초(두 테이블 풀스캔 집계·채점 이벤트 저빈도, 헤더 주석 참조)
  const { data, error, fetchedAt, refresh } = usePollingAction<StudentExamHistoryData>(
    async () => {
      const res = await getStudentExamHistory(studentId);
      return res.success && res.data
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error ?? "응시 기록을 불러오지 못했습니다." };
    },
    [studentId],
    { intervalMs: 60_000 },
  );

  const counts = useMemo(() => {
    const all = data?.sittings ?? [];
    const internal = all.filter((s) => s.source === "INTERNAL").length;
    return { ALL: all.length, INTERNAL: internal, EXTERNAL: all.length - internal };
  }, [data]);

  /** 스코프 모집단 — 카드 전부(추이·히트맵·테이블·KPI)가 이 배열로 재계산 */
  const scoped = useMemo(() => {
    const all = data?.sittings ?? [];
    return scope === "ALL" ? all : all.filter((s) => s.source === scope);
  }, [data, scope]);

  const summary = useMemo(() => summarize(scoped), [scoped]);
  const trendMeta = summary.trend ? TREND_META[summary.trend] : null;

  /** 추세 판정에 실제로 쓰인 창 크기 — summarize.ts:39 `scored.slice(-3)` 미러.
   *  「최근 3회 기준」을 못 박아 두면 확정 응시가 2회뿐일 때 화면에 없는 3번째
   *  응시를 근거로 든 것처럼 읽힌다(검수 [139]). 확정분 개수로 캡을 씌운다. */
  const trendWindowSize = useMemo(
    () => Math.min(scoped.filter((s) => s.scorePct != null).length, 3),
    [scoped],
  );

  const selectScope = (next: ExamScope) => {
    setScope(next);
    setHighlightRefId(null); // 모집단이 바뀌면 회차 축이 달라진다 — 하이라이트 무효화
  };

  // ── 로드 상태(모집단 확보 전) — study-analytics-tab 로드 관용 미러 ─────────
  if (!data && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-16 text-[13px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        응시 기록을 불러오는 중입니다
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-12">
        <p className="text-[13px] text-slate-500">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // ── 빈 상태(R9) — 전체 모집단 0건일 때만. 문구는 D6-3 사전 단일 소스 ────────
  // CTA 는 onDeploy(허브 A-4 배선)가 있을 때만 — 비허브(교사면 등)는 Tabs 가
  // ?tab= 쿼리를 소비하지 않아 링크 폴백이 죽은 링크였다(N-19: 폴백 제거).
  if (data.sittings.length === 0) {
    const [emptyTitle, emptyDescription] = EMPTY_STATES.EXAM_TAB.message.split(". ");
    return (
      <TabEmpty
        icon={ClipboardList}
        title={emptyTitle}
        description={emptyDescription}
        cta={
          onDeploy ? (
            <button
              type="button"
              onClick={() => onDeploy([], "exam")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Send className="size-4" aria-hidden />
              {EMPTY_STATES.EXAM_TAB.ctaLabel}
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* [A]+[B] — 스코프 칩(두 모집단 정직 노출) + 갱신 스트립(R6 단일 UI) */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChipRow
          icon={<ListFilter className="size-3.5 text-slate-400" aria-hidden />}
          label="시험 구분"
          className="min-w-0 flex-1"
        >
          {SCOPE_ORDER.map((key) => (
            <FilterChip
              key={key}
              label={
                key === "ALL"
                  ? EXAM_SCOPE_LABELS.ALL
                  : `${EXAM_SCOPE_LABELS[key]} ${counts[key]}`
              }
              title={
                key === "INTERNAL"
                  ? "우리가 만들어 배포한 시험지 응시"
                  : key === "EXTERNAL"
                    ? "내신 시험 분석(리포트) 채점 결과"
                    : undefined
              }
              count={0}
              active={scope === key}
              onClick={() => selectScope(key)}
            />
          ))}
        </FilterChipRow>
        <RefreshStrip
          fetchedAt={fetchedAt}
          error={error}
          onRefresh={refresh}
          className="ml-auto"
        />
      </div>

      {/* [C] KPI 스트립 — StatTile 3(R1 정본, summarize 계약 미러).
          base 를 1열로 못 박는다: StatStrip 기본이 grid-cols-2 라 좁은 폭에서
          3번째 타일만 아래 줄에 홀로 남아(고아 타일) 스트립이 깨져 보였다. */}
      <StatStrip className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
        <StatTile label="총 응시" value={`${summary.totalSittings}회`} />
        <StatTile
          label="평균 점수율"
          value={summary.avgScorePct == null ? "—" : `${summary.avgScorePct}%`}
          sub={
            summary.avgScorePct == null ? "점수율이 확정된 응시가 없습니다" : undefined
          }
        />
        <StatTile
          label="추세"
          tone={trendMeta?.tone ?? "slate"}
          value={
            trendMeta ? (
              <span className="flex items-center gap-1.5">
                <trendMeta.Icon className="size-5" aria-hidden />
                {trendMeta.word}
              </span>
            ) : (
              "—"
            )
          }
          sub={
            trendMeta
              ? `최근 ${trendWindowSize}회 점수율 기준`
              : "점수 확정 응시가 2회 이상 필요합니다"
          }
        />
      </StatStrip>

      {/* [D] 응시 기록 — 전폭 최상단(§7.1). 높이를 className 으로 고정하지 않는다:
          카드 내부 컨테이너가 max-h-[360px] 로 스크롤하므로 응시가 적으면 카드도
          짧아지고, 아래 2열 그리드가 헛되이 밀려나지 않는다.
          스코프 0건이면 이 카드의 CardEmpty 하나가 크게 보인다(아래 두 카드도
          각자 CardEmpty 를 유지 — 카드별 사유가 서로 다르므로 통합하지 않는다). */}
      <SittingsTableCard
        sittings={scoped}
        highlightRefId={highlightRefId}
        onReview={setReviewId}
      />

      {/* [E] 분석 카드 그리드 — 2열 h-[420px] 페어(R2, A-2 견본 관용구) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreTrendCard
          className="h-[420px]"
          sittings={scoped}
          onSelectSitting={setHighlightRefId}
        />
        <TypeHeatmapCard className="h-[420px]" sittings={scoped} onDeploy={onDeploy} />
      </div>

      {/* INTERNAL 응시 채점 검토 — 640px 우측 드로어(ReviewDrawer)를 폐기하고
          와이드 모달로 교체(2607 §7.3). props 계약은 동일하다.
          모달 안 수동확정/재채점이 점수를 바꿀 수 있으므로 뮤테이션 시 재적재. */}
      <SubmissionDetailModal
        submissionId={reviewId}
        onClose={() => setReviewId(null)}
        onMutated={refresh}
      />
    </div>
  );
}
