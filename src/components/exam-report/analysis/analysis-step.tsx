"use client";

// ============================================================================
// 문항 분석 탭 (v4) — AnalysisStepProps 계약 준수.
//
//  DRAFT/미분석      : "시험 분석 시작" CTA.
//  ANALYZING         : 진행 스트립(실제 %·ETA·문항 칩) + 지도/카드 점진 노출.
//                      재개는 서버 자가연쇄(after self-POST, W1)가 잇는다 —
//                      클라이언트는 시작 1회 + 폴링 감시견(정체 시 1회 재점화)만.
//  DRAFT/FAILED 부분 : "이어서 분석" 배너(추가 과금 없음) — 중단 건 막다른 화면 제거.
//  ANALYZED          : 채점 지도(내부 스크롤) + 문항 분석 카드(유형 필터)
//                      + 우측 시험지 종합 패널 + 하단 "학생 관리로 이동".
//
// 저장 파이프라인(version CAS + 낙관갱신 + 충돌 재페치)은 use-analysis-persistence
// 훅으로 로직 불변 분리. 배너/필터/칩 스트립은 analysis-banners /
// analysis-progress-strip 프레젠테이션 모듈로 분리.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CheckCheck, Play } from "lucide-react";
import type { AnalysisStepProps, ExamAnalysisDetail } from "../ui-contracts";
import { EXAM_ANALYSIS_MIN_CREDITS } from "@/lib/exam-report/types";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { Button } from "@/components/ui/button";
import { QuestionAnalysisCard } from "./question-analysis-card";
import { ExamSynthesisPanel } from "./exam-synthesis-panel";
import { AnalysisProgress } from "./analysis-progress";
import { ExamMapTable } from "./exam-map-table";
import {
  AnalysisProgressStrip,
  type QuestionChipInfo,
} from "./analysis-progress-strip";
import {
  AnalysisFailedBanner,
  AnalysisTypeFilter,
  PendingCard,
  ResumeAnalysisBanner,
  type AnalysisTypeOption,
} from "./analysis-banners";
import {
  useAnalysisPersistence,
  type WorkingState,
} from "./use-analysis-persistence";

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

// 감시견 정체 판정 임계 — 배치 커밋(progress.updatedAt)이 임계 이상 멈추면 서버
// 자가연쇄 단선으로 보고 1회 재점화한다.
// (결함수리) 한 라운드는 최대 270s(자가연쇄 self-POST 주기)까지 커밋 없이 정상
// 진행될 수 있다 — 이전 150s/240s 임계는 살아있는 런을 죽었다고 오판해 재점화
// POST 가 신선 잡 펜스를 탈취하고, 진행 중이던 배치와 원가를 이중 지출할 수
// 있었다. 라운드 최대치(270s)를 확실히 넘긴 값으로만 "죽었다"고 단정한다.
const WATCHDOG_PROGRESS_STALL_MS = 300_000;
// 첫 체크포인트 전(progress 부재)에는 E1a(문항 인식)까지 겹쳐 더 오래 걸릴 수
// 있어 runStartedAt 기준은 추가로 완화한다(360s > 라운드 270s).
const WATCHDOG_RUN_START_STALL_MS = 360_000;

export function AnalysisStep({ detail, onDetailChange, onAdvance }: AnalysisStepProps) {
  const pathname = usePathname();
  const creditsHref = pathname?.startsWith("/teacher")
    ? "/teacher/credits"
    : "/director/credits";

  const [reanalyzing, setReanalyzing] = useState<Set<string>>(new Set());
  // D4: 전체 분석 드라이버가 도는 동안(서버가 아직 ANALYZING 으로 넘어가기 전 포함)
  // 진행뷰를 붙잡는 로컬 플래그. 시작 직후 폴링이 아직 DRAFT 인 상세를 되받아
  // 진행뷰를 idle 로 되돌리는 회귀를 막는다. finally 의 재페치 후 해제한다.
  const [driving, setDriving] = useState(false);
  // 카드 리스트 유형 필터(null=전체) — 문항 수가 많을 때 세로 나열 완화.
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // ── 최신 상태 참조(비동기 핸들러 stale 방지) ──────────────────────────────
  const detailRef = useRef<ExamAnalysisDetail>(detail);
  detailRef.current = detail;
  const onChangeRef = useRef(onDetailChange);
  onChangeRef.current = onDetailChange;
  const busyRef = useRef(false); // 분석 드라이버 in-flight
  const workingRef = useRef<WorkingState>({
    analysis: detail.analysis,
    reviewState: detail.reviewState,
    examMap: detail.examMap,
    version: detail.version,
  });
  useEffect(() => {
    workingRef.current = {
      analysis: detail.analysis,
      reviewState: detail.reviewState,
      examMap: detail.examMap,
      version: detail.version,
    };
  }, [detail.analysis, detail.reviewState, detail.examMap, detail.version]);

  const id = detail.id;

  const refreshDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam-report/analyses/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { analysis: ExamAnalysisDetail };
      onChangeRef.current(data.analysis);
    } catch {
      /* 폴링/감시견이 이어서 반영 */
    }
  }, [id]);

  // ── 저장 파이프라인(로직 불변 — use-analysis-persistence) ─────────────────
  const {
    saving,
    handleEditMapEntry,
    handleConfirmMap,
    handleEditField,
    handleToggleConfirm,
    handleConfirmAll,
  } = useAnalysisPersistence({ id, detailRef, onChangeRef, workingRef, refreshDetail });

  // ── 분석 드라이버(시작/재점화 1회 POST) ───────────────────────────────────
  // {resume:true} 를 받아도 재 POST 하지 않는다 — 다음 라운드는 서버 자가연쇄가
  // 잇고, 클라는 폴링 감시견으로 정체만 감시한다(계약 §2). 202/409/에러 분기 유지.
  const runAnalyze = useCallback(
    async (numbers?: string[]) => {
      if (busyRef.current) return;
      busyRef.current = true;
      // 전체 재실행(단일 문항 재분석 아님)일 때만 진행뷰를 붙잡는다.
      const fullRun = !numbers || numbers.length === 0;
      if (fullRun) setDriving(true);
      if (numbers && numbers.length > 0) {
        setReanalyzing(new Set(numbers));
      }
      // 낙관적 진입 표시(이미 ANALYZING 이면 무영향).
      if (detailRef.current.status !== "ANALYZING") {
        onChangeRef.current({ ...detailRef.current, status: "ANALYZING" });
      }
      try {
        let res: Response;
        try {
          res = await fetch(`/api/exam-report/analyses/${id}/analyze`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(numbers ? { numbers } : {}),
          });
        } catch {
          return; // 네트워크 오류 — 폴링/감시견/리컨실이 이어서 처리
        }
        if (res.status === 402) {
          toast.error("크레딧이 부족합니다", {
            description: "충전 후 다시 시도해 주세요.",
            action: {
              label: "크레딧 관리",
              onClick: () => {
                window.location.href = creditsHref;
              },
            },
          });
          return;
        }
        if (res.status === 409) return; // 다른 곳에서 진행 중 / 상태 변경
        // 202 {inProgress:true}: 이미 신선한 잡이 진행 중 — 폴링만 유지.
        if (res.status === 202) return;
        if (!res.ok) {
          toast.error("문항 분석 중 오류가 발생했습니다.");
          return;
        }
        // 200: 종결({status:...}) 또는 미종결({resume:true}) — 어느 쪽이든 여기서
        // 끝. 미종결이면 서버가 after() 로 자기 자신을 재개 POST 한다(W1).
      } finally {
        busyRef.current = false;
        setReanalyzing(new Set());
        // 응답 종료 후 상세를 재페치해 서버 status(ANALYZING/ANALYZED/FAILED)로
        // 수렴시킨 뒤 진행뷰 붙잡기를 해제한다(D4).
        await refreshDetail();
        if (fullRun) setDriving(false);
      }
    },
    [id, creditsHref, refreshDetail],
  );

  // 허브에서 업로드 직후 ?start=1 로 진입 → DRAFT+sourceFiles 면 E1 분석 1회 자동 시작.
  // 클라 전용(window.location)으로 읽어 useSearchParams Suspense 경계 요구를 피한다.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") !== "1") return;
    // 쿼리 제거 — 새로고침/뒤로가기 시 재시작 방지.
    window.history.replaceState(null, "", window.location.pathname);
    const d = detailRef.current;
    if (d.status === "DRAFT" && (d.sourceFiles?.length ?? 0) > 0) {
      void runAnalyze(undefined);
    }
  }, [runAnalyze]);

  // ── 감시견: 서버 자가연쇄 단선 감지 → 1회 재점화 ──────────────────────────
  // 폴 tick 마다 최신 상세로 정체를 판정한다. 진행(updatedAt)이 다시 관측되면
  // 재점화 1회권을 복원해 "정체 에피소드당 1회"로 제한한다(재점화 폭주 방지).
  const watchdogFiredRef = useRef(false);
  const lastProgressAtRef = useRef<number | null>(null);
  const watchdogTick = useCallback(
    (next: ExamAnalysisDetail) => {
      if (next.status !== "ANALYZING" || busyRef.current) return;
      const progressAt = next.aiMeta.progress?.updatedAt ?? null;
      if (progressAt != null && progressAt !== lastProgressAtRef.current) {
        lastProgressAtRef.current = progressAt;
        watchdogFiredRef.current = false;
      }
      if (watchdogFiredRef.current) return;
      const now = Date.now();
      const stalled =
        progressAt != null
          ? now - progressAt > WATCHDOG_PROGRESS_STALL_MS
          : next.aiMeta.runStartedAt != null
            ? now - next.aiMeta.runStartedAt > WATCHDOG_RUN_START_STALL_MS
            : false;
      if (!stalled) return;
      watchdogFiredRef.current = true;
      // 202(이미 진행 중)/409 는 무해 — 서버 펜스가 이중 실행을 차단한다.
      void runAnalyze(undefined);
    },
    [runAnalyze],
  );

  // ANALYZING 동안(또는 드라이버가 도는 동안) 5초 폴링으로 체크포인트(진행분) 반영
  // + 감시견 판정. driving 도 조건에 포함해, 시작 직후 서버가 아직 DRAFT 라 status 가
  // 순간 뒤로 밀려도 폴링이 끊기지 않고 이어져 ANALYZING 으로 수렴한다(D4).
  useEffect(() => {
    if (detail.status !== "ANALYZING" && !driving) return;
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 5_000,
      run: async (signal) => {
        try {
          const res = await fetch(`/api/exam-report/analyses/${id}`, {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { analysis: ExamAnalysisDetail };
          if (signal.aborted) return null;
          onChangeRef.current(data.analysis);
          watchdogTick(data.analysis);
          const n = data.analysis.analysis?.perQuestion.length ?? 0;
          return `${data.analysis.status}:${n}:t${Date.now()}`;
        } catch {
          return null;
        }
      },
    });
  }, [detail.status, driving, id, watchdogTick]);

  // ── 파생 값 ────────────────────────────────────────────────────────────────
  const examMap = detail.examMap;
  const questions = examMap?.questions ?? [];
  const perQuestion = detail.analysis?.perQuestion ?? [];
  const analysisByNumber = new Map(perQuestion.map((a) => [numberKey(a.number), a]));
  const questionByNumber = new Map(questions.map((q) => [numberKey(q.number), q]));
  // 검수 확정 집합은 numberKey(공백정규화) 기준 비교 — 저장값은 원문 유지.
  const confirmedSet = new Set(
    (detail.reviewState.confirmedNumbers ?? []).map(numberKey),
  );
  const okList = perQuestion.filter((a) => a.analysisStatus === "OK");
  const confirmedCount = okList.filter((a) => confirmedSet.has(numberKey(a.number))).length;
  const completed = questions.filter((q) => analysisByNumber.has(numberKey(q.number))).length;
  const unjudgedCount = questions.length - completed;

  const hasMap = questions.length > 0;
  const hasProgress = perQuestion.length > 0;
  // 서버 status 가 ANALYZING 이거나, 전체 드라이버가 도는 중이면 언제나 진행뷰가
  // 이긴다(D4: 시작 직후 폴링이 되받은 DRAFT 상세가 idle 로 되돌리는 것 차단).
  const analyzing = detail.status === "ANALYZING" || driving;
  const locked = analyzing || saving;

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  // 문항 칩 스트립 소스 — OK/FAILED/미판정 상태와 카드 스크롤 타깃.
  const chips: QuestionChipInfo[] = sortedQuestions.map((q) => {
    const key = numberKey(q.number);
    const a = analysisByNumber.get(key);
    return {
      number: q.number,
      state: !a ? "PENDING" : a.analysisStatus === "FAILED" ? "FAILED" : "OK",
      targetId: `exam-qa-${key}`,
    };
  });
  const scrollToCard = useCallback((targetId: string) => {
    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // 유형 필터 옵션(등장 순서 유지) + 필터 적용 목록.
  const typeCountMap = new Map<string, number>();
  for (const q of sortedQuestions) {
    const label = q.typeLabel || "유형 미상";
    typeCountMap.set(label, (typeCountMap.get(label) ?? 0) + 1);
  }
  const typeOptions: AnalysisTypeOption[] = [...typeCountMap.entries()].map(
    ([label, count]) => ({ label, count }),
  );
  const visibleQuestions = typeFilter
    ? sortedQuestions.filter((q) => (q.typeLabel || "유형 미상") === typeFilter)
    : sortedQuestions;

  // 중단된 부분 분석 재개 CTA — reconcile 이 DRAFT 로 강등한 건/부분 FAILED 건도
  // 막다른 화면 없이 이어서 분석 가능(RCA #3 수리).
  const canResume =
    (detail.status === "DRAFT" || detail.status === "FAILED") &&
    !analyzing &&
    hasMap &&
    unjudgedCount > 0;

  // ── DRAFT / 미분석: 분석 시작 CTA ──────────────────────────────────────────
  if (!hasMap && !analyzing) {
    return (
      <div className="flex flex-col gap-4">
        {detail.status === "FAILED" && (
          <AnalysisFailedBanner
            onRetry={() => void runAnalyze(undefined)}
            busy={driving}
            refundedCredits={detail.aiMeta.refundedCredits}
          />
        )}
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-slate-500">
              업로드한 시험지를 AI 가 직접 분석합니다. 정답·배점·문항 해설을 한 번에
              생성해요.
            </p>
            <Button
              type="button"
              onClick={() => void runAnalyze(undefined)}
              disabled={!detail.sourceFiles || detail.sourceFiles.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-4 w-4" />
              시험 분석 시작
            </Button>
            {/* 과금 안내 — CreditCostChip 표준 표기(◈·"N 크레딧" 텍스트 금지). */}
            <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
              분석 비용: 문항당
              <CreditCostChip
                amount={CREDIT_COSTS.EXAM_ANALYSIS}
                className="text-slate-500"
              />
              · 최소
              <CreditCostChip
                amount={EXAM_ANALYSIS_MIN_CREDITS}
                className="text-slate-500"
              />
            </p>
          </div>
        </section>
      </div>
    );
  }

  // ── ANALYZING 이고 지도/진행분이 아직 없으면 전체 진행 화면(문항 인식 중) ──
  if (analyzing && !hasMap && !hasProgress) {
    return <AnalysisProgress completed={0} total={0} />;
  }

  // ── 분석 결과 뷰(진행 스트립 + 지도 + 카드 + 종합) ────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {analyzing && (
        <AnalysisProgressStrip
          progress={detail.aiMeta.progress ?? null}
          fallbackCompleted={completed}
          fallbackTotal={questions.length}
          chips={chips}
          onChipClick={scrollToCard}
        />
      )}
      {canResume && (
        <ResumeAnalysisBanner
          remaining={unjudgedCount}
          busy={driving}
          onResume={() => void runAnalyze(undefined)}
        />
      )}
      {detail.status === "FAILED" && !canResume && (
        <AnalysisFailedBanner
          onRetry={() => void runAnalyze(undefined)}
          busy={driving}
          refundedCredits={detail.aiMeta.refundedCredits}
        />
      )}

      {/* 채점 지도 테이블 — 정답/배점/유형 인라인 수정 */}
      {hasMap && examMap && (
        <ExamMapTable
          entries={examMap.questions}
          mapConfirmed={detail.reviewState.mapConfirmed ?? false}
          disabled={locked}
          analyzing={analyzing}
          analysisId={detail.id}
          sourceFiles={detail.sourceFiles ?? []}
          onEdit={handleEditMapEntry}
          onConfirmAll={() => void handleConfirmMap()}
        />
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* 좌: 문항 분석 카드 리스트 */}
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            {/* 섹션 헤더 — 워크벤치 표준(볼드 타이틀 + slate-400 보조) 톤 */}
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-slate-900">문항 분석 검수</h3>
              <span className="text-xs text-slate-400">
                <span className="font-semibold tabular-nums text-slate-600">
                  {confirmedCount}/{okList.length}
                </span>
              </span>
              {detail.aiMeta.failedNumbers && detail.aiMeta.failedNumbers.length > 0 && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-700">
                  실패 {detail.aiMeta.failedNumbers.length}
                </span>
              )}
            </div>
            {/* 검수 버튼 = 초록(워크벤치 버튼 색 규칙) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleConfirmAll}
              disabled={locked || okList.length === 0}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              전체 검수 완료
            </Button>
          </div>

          <AnalysisTypeFilter
            options={typeOptions}
            active={typeFilter}
            onSelect={setTypeFilter}
          />

          <div className="p-4">
            <div className="space-y-3">
              {visibleQuestions.length === 0 && typeFilter && (
                <p className="py-6 text-center text-xs text-slate-400">
                  선택한 유형의 문항이 없습니다.
                </p>
              )}
              {visibleQuestions.map((q) => {
                const key = numberKey(q.number);
                const analysis = analysisByNumber.get(key);
                return (
                  // 칩 스트립 클릭 스크롤 타깃 — scroll-mt 로 상단 스트립에 가리지 않게.
                  <div key={q.number} id={`exam-qa-${key}`} className="scroll-mt-24">
                    {!analysis ? (
                      <PendingCard number={q.number} />
                    ) : (
                      <QuestionAnalysisCard
                        question={questionByNumber.get(key)}
                        analysis={analysis}
                        isConfirmed={confirmedSet.has(key)}
                        busy={reanalyzing.has(q.number)}
                        saving={locked}
                        onToggleConfirm={() => handleToggleConfirm(q.number)}
                        onReanalyze={() => void runAnalyze([q.number])}
                        onEditField={(patch) => handleEditField(q.number, patch)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {detail.status === "ANALYZED" && (
              <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                <Button
                  type="button"
                  onClick={onAdvance}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  학생 관리로 이동
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* 우: 시험지 종합 (xl+ 사이드, 미만 접이식) — 스크롤 추적 sticky */}
        <aside className="hidden xl:sticky xl:top-4 xl:block xl:w-[380px] xl:shrink-0 xl:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <ExamSynthesisPanel examLevel={detail.analysis?.examLevel ?? null} />
          </div>
        </aside>
        <details className="rounded-lg border border-slate-200 bg-white shadow-sm xl:hidden">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700">
            시험지 종합 보기
          </summary>
          <div className="border-t border-slate-100 p-5">
            <ExamSynthesisPanel examLevel={detail.analysis?.examLevel ?? null} />
          </div>
        </details>
      </div>
    </div>
  );
}
