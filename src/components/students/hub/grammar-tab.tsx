"use client";

// 학생 상세 허브 — 어법 훈련 탭 (구 grammar-lab 상세의 후계).
// 분석(히트맵·활동)/개념 학습/시도 기록/질문 로그 서브뷰 + 취약 개념 과제 CTA.
// 학습 배정 기능은 과제 탭(통합 과제 시스템)으로 이관됐다.
// 분석 서브뷰 본체는 grammar-analysis.tsx (500줄 계약 분리).
//
// v3 대개편 A-2 — 탭 패밀리 견본 (v3 design §D1-3 어법 탭 와이어):
//  - [C] KPI 스트립: page-frame StatTile/StatStrip 정본(규칙 R1 — 로컬 Kpi 금지)
//  - 서브뷰 4세그: kit SegmentPills 단일 정본(규칙 R3 — bordered-tab 폐기)
//  - 취약·미복습 선정: weakness.ts 선정기로 수렴(§D2-4 — 분산 구현 제거)
//  - 빈 상태: TabEmpty + D6-3 사전 문구(규칙 R9 — 배포 CTA 상시)

import { useMemo, useState } from "react";
import { RotateCcw, Send, Target } from "lucide-react";
import {
  getGrammarLabStudentDetail,
  type GrammarLabStudentDetail,
} from "@/actions/grammar-drill-admin";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import { StatStrip, StatTile } from "@/components/layout/page-frame";
import {
  WEAK_SCORE,
  selectStaleConcepts,
  selectWeakConcepts,
} from "@/lib/grammar-drill/weakness";
import type { WeakSpot } from "@/lib/student-analytics/types";
import { CTA_LABELS, EMPTY_STATES, METRIC_LABELS } from "@/lib/wording/director-glossary";
import { RefreshStrip, SegmentPills, TabEmpty } from "./analytics/kit";
import { usePollingAction } from "./analytics/use-polling-action";
import { GrammarAnalysis, type ConceptDrillTarget } from "./grammar-analysis";
import { GrammarAttempts } from "./grammar-attempts";
import { GrammarChatLog } from "./grammar-chat-log";
import { GrammarLessons } from "./grammar-lessons";

type SubView = "analysis" | "lessons" | "attempts" | "chat";

/**
 * 구 시그니처 보존 재수출 — 소비처(student-hub-client 등) 무접촉.
 * v3 수리 M-1 판정 확정: 컷오프 60(WEAK_SCORE) 적용 — METRIC_HELP.WEAK 가
 * "60점 미만"을 약속하므로(R10 정직성) 81점 개념이 「보충이 필요한 개념
 * (자동 추천)」·개요 「보충 필요 개념」 칩에 노출되던 무컷오프 동작을 폐기한다.
 * 소비처(tasks-tab 버튼·컴포저 추천·개요 칩)는 전부 이 함수 경유라 동반 해소,
 * tasks-tab 의 length>0 가드가 0건 시 버튼을 자동 숨긴다.
 */
export function collectWeakConcepts(detail: GrammarLabStudentDetail): WeakConceptPreset[] {
  return selectWeakConcepts(detail.grid, { cutoff: WEAK_SCORE, top: 3 });
}

export function StudentGrammarTab({
  detail: initialDetail,
  onOpenWeakComposer,
  onDeploy,
}: {
  /** 셸 프리로드 스냅샷 — 폴링 첫 응답 전까지의 초기값(M-5 재조회형 계약) */
  detail: GrammarLabStudentDetail;
  onOpenWeakComposer: (weak: WeakConceptPreset[]) => void;
  /**
   * 취약점 원클릭 배포(§D2-1) — 셸(student-hub-client)의 openDeployComposer
   * 배선 지점. A-4 배선 전 optional — 미배선 시 기존 onOpenWeakComposer 폴백으로
   * 현행 동작을 그대로 보장한다(과도기 계약).
   */
  onDeploy?: (spots: WeakSpot[], source: "grammar") => void;
}) {
  // R6 인터벌 표 — 어법 15초(v3 수리 M-5). 셸 프리로드를 초기값으로 두고
  // 같은 서버 액션을 재조회한다(exam-tab usePollingAction 관용 미러 —
  // stale-on-error: 실패 시 이전 데이터 유지 + RefreshStrip 배지).
  const studentId = initialDetail.student.id;
  const {
    data: polled,
    error: pollError,
    fetchedAt,
    refresh,
  } = usePollingAction<GrammarLabStudentDetail>(
    async () => {
      const res = await getGrammarLabStudentDetail(studentId);
      return res
        ? { ok: true, data: res }
        : { ok: false, error: "어법 훈련 데이터를 불러오지 못했습니다." };
    },
    [studentId],
    { intervalMs: 15_000 },
  );
  const detail = polled ?? initialDetail;

  // 풀이 기록이 없고 개념 학습만 한 학생은 개념 학습 뷰로 연다(분석이 텅 비므로).
  const [view, setView] = useState<SubView>(
    detail.totals.solved === 0 && detail.lessons.length > 0 ? "lessons" : "analysis",
  );
  // 히트 셀 드릴다운 프리셋 — seq 로 같은 개념 재클릭 시에도 리마운트를 보장한다.
  const [conceptPreset, setConceptPreset] = useState<
    (ConceptDrillTarget & { seq: number }) | null
  >(null);
  const weak = useMemo(() => collectWeakConcepts(detail), [detail]);
  const stale = useMemo(() => selectStaleConcepts(detail.grid), [detail]);
  // KPI 「보충 필요 개념 N」 — 신설 판정은 기본 컷오프 60(§D1-3 [C], weakness.ts 정본)
  const weakCount = useMemo(
    () => selectWeakConcepts(detail.grid, { cutoff: WEAK_SCORE }).length,
    [detail],
  );
  const questionCount = detail.chatMessages.filter((m) => m.role === "user").length;
  // "자신 없음(confidence=1)" 개념 수 — 교사가 가장 먼저 봐야 할 신호이므로 세그 배지로 노출
  const unsureCount = detail.lessons.filter((l) => l.confidence === 1).length;
  const t = detail.totals;

  // KPI 추세 델타 — 최근 7일 vs 직전 7일. 표본이 작으면(10문항 미만) 숨긴다.
  const showDelta = t.recent7.solved >= 10 && t.prev7.solved > 0;
  const accuracyDelta = showDelta
    ? Math.round(
        (t.recent7.correct / t.recent7.solved - t.prev7.correct / t.prev7.solved) * 100,
      )
    : null;
  const accuracy = t.solved ? Math.round((t.correct / t.solved) * 100) : 0;

  const openConceptDrill = (target: ConceptDrillTarget) => {
    setConceptPreset((prev) => ({ ...target, seq: (prev?.seq ?? 0) + 1 }));
    setView("attempts");
  };

  // 풀이 기록도 개념 학습 기록도 없을 때만 빈 상태를 보여 준다(R9 — TabEmpty + 배포 CTA).
  // 문구는 D6-3 사전 단일 소스 — 문장 경계에서만 제목/설명으로 나눈다(리터럴 금지).
  if (t.solved === 0 && detail.lessons.length === 0) {
    const [emptyTitle, emptyDescription] = EMPTY_STATES.GRAMMAR_TAB.message.split(". ");
    return (
      <TabEmpty
        icon={Target}
        title={emptyTitle}
        description={emptyDescription}
        cta={
          <button
            type="button"
            onClick={() => onOpenWeakComposer([])}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Send className="size-4" aria-hidden />
            {EMPTY_STATES.GRAMMAR_TAB.ctaLabel}
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* [C] KPI 스트립 — StatTile 4장(§D1-3 와이어: 푼 문항·정답률·보충 필요·최근 7일) */}
      <StatStrip className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <StatTile label="푼 문항" value={`${t.solved}문항`} />
        <StatTile
          label="정답률"
          value={`${accuracy}%`}
          tone={accuracy >= 70 && t.solved > 0 ? "emerald" : accuracy < 50 && t.solved > 0 ? "rose" : "slate"}
          sub={
            accuracyDelta != null && accuracyDelta !== 0
              ? `직전 7일 대비 ${accuracyDelta > 0 ? "+" : ""}${accuracyDelta}%p`
              : undefined
          }
        />
        <StatTile
          label={`${METRIC_LABELS.WEAK} 개념`}
          value={`${weakCount}개`}
          tone={weakCount > 0 ? "rose" : "slate"}
        />
        <StatTile
          label="최근 7일"
          value={`${t.recent7.solved}문항`}
          sub={
            t.recent7.solved > 0
              ? `정답 ${t.recent7.correct}문항`
              : undefined
          }
        />
      </StatStrip>

      {/* 서브뷰 4세그(전부 보존, 기본 분석 — R3 SegmentPills 정본) + 기존 CTA 보존 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <SegmentPills<SubView>
          options={[
            { value: "analysis", label: "분석" },
            {
              value: "lessons",
              label: "개념 학습",
              count: unsureCount > 0 ? unsureCount : null,
            },
            { value: "attempts", label: "시도 기록" },
            {
              value: "chat",
              label: "질문 로그",
              count: questionCount > 0 ? questionCount : null,
            },
          ]}
          value={view}
          onChange={setView}
          ariaLabel="어법 훈련 서브뷰"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {stale.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenWeakComposer(stale)}
              title="숙달 후 3주 이상 손대지 않은 개념으로 복습 과제를 보냅니다"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-[12.5px] font-semibold text-violet-700 transition-colors hover:bg-violet-100"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {CTA_LABELS.SEND_REVIEW_TASK}
              <span className="text-[11px] tabular-nums opacity-70">{stale.length}</span>
            </button>
          ) : null}
          {weak.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenWeakComposer(weak)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            >
              <Target className="size-3.5" aria-hidden />
              {CTA_LABELS.SEND_WEAK_TASK}
            </button>
          ) : null}
          {/* R6 갱신 UI 단일 정본 — 마지막 갱신 시각 + 수동 갱신(M-5) */}
          <RefreshStrip fetchedAt={fetchedAt} error={pollError} onRefresh={refresh} />
        </div>
      </div>

      {view === "analysis" ? (
        <GrammarAnalysis
          detail={detail}
          onConceptDrill={openConceptDrill}
          onDeploy={onDeploy}
          onOpenWeakComposer={onOpenWeakComposer}
        />
      ) : null}
      {view === "lessons" ? (
        <GrammarLessons detail={detail} onOpenWeakComposer={onOpenWeakComposer} />
      ) : null}
      {view === "attempts" ? (
        <GrammarAttempts
          key={conceptPreset ? `${conceptPreset.conceptId}-${conceptPreset.seq}` : "all"}
          attempts={detail.recentAttempts}
          conceptPreset={
            conceptPreset
              ? { conceptId: conceptPreset.conceptId, title: conceptPreset.title }
              : null
          }
        />
      ) : null}
      {view === "chat" ? <GrammarChatLog messages={detail.chatMessages} /> : null}
    </div>
  );
}
