"use client";

// ============================================================================
// 단어장 만들기 위저드 — 셸 (모달·스텝 레일·푸터·fetch 오케스트레이션 소유)
//
// 스텝 컴포넌트는 표시+patch 만 한다(wizard-types.ts 계약). 모든 서버 왕복
// (라이브 카운트·플랜·생성)은 여기 한 곳에 산다 — seq 가드·디바운스 포함.
// 확정 스펙: docs/wordbook-wizard-spec.md
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  createWordbookSeriesAction,
  planWordbookAction,
} from "@/actions/vocab-drill-admin/wordbook-wizard";
import { findCurriculum } from "@/lib/vocab-drill/wordbook-curricula";
import {
  PLAN_UNITS_MAX,
  planTotalDays,
  type WordbookPlan,
} from "@/lib/vocab-drill/wordbook-plan-types";
import {
  CURRICULUM_BASKET,
  CURRICULUM_CUSTOM,
  initialWizardState,
  WIZARD_BTN_GHOST,
  WIZARD_BTN_PRIMARY,
  type WizardCreatedResult,
  type WizardState,
  type WizardStep,
} from "./wizard-types";
import { StepCurriculum } from "./step-curriculum";
import { StepScope } from "./step-scope";
import { StepStructure } from "./step-structure";
import { StepSchedule } from "./step-schedule";
import { StepReview } from "./step-review";
import { WizardRail, WIZARD_STEP_META } from "./wizard-rail";
import type { WordbookPresetSeries } from "../wordbook-types";

/** 스텝 제목 정본은 레일이 소유한다(헤더도 같은 배열을 읽어 어긋나지 않게) */
const STEP_META = WIZARD_STEP_META;

export interface WordbookWizardProps {
  open: boolean;
  onClose: () => void;
  /** 담은 단어(senseId) — 있으면 스텝1에 「담은 단어로」 카드가 뜬다 */
  basketSenseIds: string[];
  /** true 로 열면 「담은 단어로」가 미리 선택된 채 시작 */
  startFromBasket?: boolean;
  /** 「학생에게 보내기」 → 우측 슬라이드(교재 모드)로 인계(스펙 §11) */
  onSendSeries: (series: WordbookPresetSeries) => void;
  /** 「나중에 보내기」 → 보낸 단어장 뷰로 전환 */
  onGotoManage: () => void;
  /** 생성 직후(성공 화면 진입 시) — 부모가 덱 목록을 새로고침 */
  onCreated?: () => void;
}

export function WordbookWizard({
  open,
  onClose,
  basketSenseIds,
  startFromBasket,
  onSendSeries,
  onGotoManage,
  onCreated,
}: WordbookWizardProps) {
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [liveTotalLoading, setLiveTotalLoading] = useState(false);
  const [plan, setPlan] = useState<WordbookPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<WizardCreatedResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const basketMode = state.sourceSenseIds !== null;
  const countSeq = useRef(0);
  const planSeq = useRef(0);
  /** 현재 plan 이 어느 입력(planKey)의 산출인가 — 짝이 어긋나면 스테일이다 */
  const [planFor, setPlanFor] = useState<string | null>(null);
  /** requestPlan 이 실제로 재fetch 를 발화시키는 손잡이 — planKey 에 섞인다.
   *  (없으면 실패 상태에서 재시도를 눌러도 deps 가 안 변해 no-op — 검수 적발) */
  const [planNonce, setPlanNonce] = useState(0);

  // 열릴 때마다 백지에서 시작 — 이전 작성분이 새 교재에 섞이면 안 된다.
  useEffect(() => {
    if (!open) return;
    const init = initialWizardState();
    if (startFromBasket && basketSenseIds.length) {
      init.curriculum = CURRICULUM_BASKET;
      init.sourceSenseIds = [...basketSenseIds];
      init.size = basketSenseIds.length;
    }
    setState(init);
    setLiveTotal(null);
    setPlan(null);
    setCreated(null);
    setCreateError(null);
    setPlanFor(null);
    // 직전 세션의 in-flight 응답이 새 세션 상태에 착륙하지 않게 무효화한다.
    planSeq.current += 1;
    countSeq.current += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open 전이 시에만 초기화
  }, [open]);

  const patch = useCallback((p: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  // ── 라이브 카운트 (스텝2 전용, 300ms 디바운스 + seq 가드) ─────────────────
  // 조건(base)만이 카운트를 바꾼다 — size 는 "몇 개를 담을까"라 카운트와 무관하고,
  // 스텝3 이후에는 조건을 못 바꾸므로 재발화할 이유가 없다(적대검수: 관통 1회에
  // countOnly 가 4번 나갔다). 값은 state 로 남아 뒤 스텝의 폴백 공식에 계속 쓰인다.
  const baseKey = JSON.stringify(state.base);
  useEffect(() => {
    if (!open || state.step !== 2) return;
    if (basketMode) {
      setLiveTotal(state.sourceSenseIds?.length ?? 0);
      setLiveTotalLoading(false);
      return;
    }
    const seq = ++countSeq.current;
    setLiveTotalLoading(true);
    const t = setTimeout(async () => {
      const res = await planWordbookAction({
        base: state.base,
        size: state.size,
        wordsPerDay: state.wordsPerDay,
        studyDays: state.studyDays,
        order: state.order,
        countOnly: true,
      });
      if (seq !== countSeq.current) return;
      setLiveTotalLoading(false);
      setLiveTotal(
        res.success && res.data && "totalMatched" in res.data
          ? res.data.totalMatched
          : null,
      );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseKey 가 base 전체를 대변
  }, [open, state.step, basketMode, baseKey]);

  // ── 플랜 (스텝3 이상에서 구성 입력이 바뀔 때마다, 400ms 디바운스) ─────────
  // studyDays 는 풀 해석과 무관(달력 표시만)하므로 키에서 뺀다 — 요일
  // 토글마다 DB 를 다시 푸는 낭비를 막는다. 표시용 스케줄은 순수 산식으로 재계산.
  const planKey = JSON.stringify({
    b: basketMode ? state.sourceSenseIds : state.base,
    s: state.size,
    o: state.order,
    w: state.wordsPerDay,
    n: planNonce,
  });
  useEffect(() => {
    if (!open || state.step < 3 || created) return;
    // ★ seq 는 **조기 반환보다 먼저** 올린다. 예전엔 되돌아온 키에서 그냥 return 해
    //   진행 중이던 옛 요청이 살아남았고, 그 응답이 화면 상태와 다른 구성으로
    //   착륙했다(스텝5가 고르지 않은 구성으로 덱을 만들던 critical — 2026-08-10).
    const seq = ++planSeq.current;
    if (planFor === planKey && plan) {
      // 되돌아온 경우 — 스피너를 반드시 걷는다(예전엔 planLoading 이 영원히 true
      // 로 굳어 「단어장 만들기」가 영구 비활성이 됐다).
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    const t = setTimeout(async () => {
      const res = await planWordbookAction({
        base: state.base,
        sourceSenseIds: state.sourceSenseIds ?? undefined,
        size: state.size,
        wordsPerDay: state.wordsPerDay,
        studyDays: state.studyDays,
        order: state.order,
      });
      if (seq !== planSeq.current) return;
      setPlanLoading(false);
      if (res.success && res.data && "units" in res.data) {
        setPlan(res.data);
        setPlanFor(planKey);
      } else {
        setPlan(null);
        setPlanFor(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planKey 가 입력 전체를 대변
  }, [open, state.step, planKey, created, planFor, plan]);

  const requestPlan = useCallback(() => {
    setPlan(null);
    setPlanFor(null);
    setPlanNonce((n) => n + 1);
  }, []);

  /** 지금 화면의 입력과 짝이 맞는 플랜인가 — 어긋나면 "계산 중"으로 취급한다 */
  const planFresh = planFor === planKey && !!plan;
  const freshPlan = planFresh ? plan : null;
  const stepPlanLoading = planLoading || (!planFresh && state.step >= 3);

  // ── 생성 ───────────────────────────────────────────────────────────────────
  const bookTitle = state.title.trim();
  const canCreate =
    !!bookTitle &&
    !!freshPlan &&
    freshPlan.units.length > 0 &&
    // 서버가 어차피 거부하는 구성으로 보내지 않는다(스텝4 게이트의 최종 방어선).
    freshPlan.units.length <= PLAN_UNITS_MAX &&
    !planLoading &&
    !creating;

  const handleCreate = useCallback(async () => {
    // freshPlan 만 쓴다 — 화면과 짝이 맞지 않는 플랜으로 덱을 만들지 않는다.
    if (!canCreate || !freshPlan) return;
    const plan = freshPlan;
    setCreating(true);
    setCreateError(null);
    const res = await createWordbookSeriesAction({
      title: bookTitle,
      subtitle: state.subtitle.trim() || undefined,
      curriculum:
        state.curriculum &&
        state.curriculum !== CURRICULUM_CUSTOM &&
        state.curriculum !== CURRICULUM_BASKET
          ? state.curriculum
          : undefined,
      units: plan.units.map((u) => ({ title: u.title, senseIds: u.senseIds })),
      schedule: {
        wordsPerDay: state.wordsPerDay,
        studyDays: state.studyDays,
        totalDays: plan.units.length,
      },
    });
    setCreating(false);
    if (res.success && res.data && "seriesKey" in res.data) {
      setCreated({
        seriesKey: res.data.seriesKey,
        deckIds: res.data.deckIds,
        totalWords: res.data.totalWords,
        firstDeck: {
          id: res.data.deckIds[0],
          title: `${bookTitle} · 1단계`,
          senseCount: plan.units[0]?.count ?? 0,
        },
      });
      onCreated?.();
    } else {
      setCreateError(res.error ?? "단어장을 만들지 못했습니다.");
    }
  }, [canCreate, freshPlan, bookTitle, state, onCreated]);

  // ── 이동·닫기 ──────────────────────────────────────────────────────────────
  const canNext = useMemo(() => {
    switch (state.step) {
      case 1:
        return state.curriculum !== null;
      case 2:
        // 재계산 중에는 옛 카운트를 믿지 않는다 — 0매치 조건으로 바꾼 직후에도
        // 「다음」이 눌리던 구멍(검수 적발).
        return basketMode ? true : !liveTotalLoading && (liveTotal ?? 0) > 0;
      case 3:
        return true;
      case 4: {
        if (state.wordsPerDay < 5) return false;
        // 60단계 초과는 서버가 어차피 거부한다 — 여기서 선제 차단.
        // 스테일 plan 을 근거로 삼지 않는다(freshPlan 이 없으면 보수적 추정).
        const totalPlanned =
          freshPlan?.totalPlanned ?? Math.min(state.size, liveTotal ?? state.size);
        return planTotalDays(totalPlanned, state.wordsPerDay) <= PLAN_UNITS_MAX;
      }
      default:
        return false;
    }
  }, [
    state.step,
    state.curriculum,
    state.wordsPerDay,
    state.size,
    basketMode,
    liveTotal,
    liveTotalLoading,
    freshPlan,
  ]);

  const goNext = useCallback(() => {
    setState((s) => {
      if (s.step >= 5) return s;
      const next = (s.step + 1) as WizardStep;
      // 스텝5 진입 시 이름 기본값 — 프리셋 제목을 제안(수정 가능).
      if (next === 5 && !s.title.trim()) {
        const preset = findCurriculum(s.curriculum);
        return { ...s, step: next, title: preset ? preset.title : "" };
      }
      return { ...s, step: next };
    });
  }, []);
  const goPrev = useCallback(() => {
    setState((s) =>
      s.step <= 1 ? s : { ...s, step: (s.step - 1) as WizardStep },
    );
  }, []);
  const gotoStep = useCallback(
    (n: WizardStep) => {
      if (created) return;
      setState((s) => (n < s.step ? { ...s, step: n } : s));
    },
    [created],
  );

  const attemptClose = useCallback(() => {
    if (creating) return;
    if (!created && state.step > 1) {
      if (!window.confirm("만들던 단어장이 사라집니다. 닫을까요?")) return;
    }
    onClose();
  }, [creating, created, state.step, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, attemptClose]);

  if (!open) return null;

  // 스텝에는 **짝이 맞는 플랜만** 넘긴다 — 스테일이면 plan=null·loading=true 로
  // 보여 "옛 구성이 확정처럼 보이는" 상태를 만들지 않는다.
  const stepProps = {
    state,
    patch,
    plan: freshPlan,
    planLoading: stepPlanLoading,
    liveTotal,
    liveTotalLoading,
    requestPlan,
  };

  /** 「단어장 만들기」가 비활성인 이유 — 침묵하지 않는다(검수 적발) */
  const createBlockedReason = !bookTitle
    ? "단어장 이름을 입력해 주세요."
    : stepPlanLoading || !freshPlan
      ? "구성을 계산하는 중이에요."
      : freshPlan.units.length > PLAN_UNITS_MAX
        ? `단계가 ${PLAN_UNITS_MAX}개를 넘어요 — 하루 양을 늘려 주세요.`
        : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="단어장 만들기"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={attemptClose}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />
      <div className="relative flex h-[min(800px,94dvh)] w-full max-w-[1120px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        <WizardRail step={state.step} done={!!created} onGoto={gotoStep} />

        {/* ── 우: 콘텐츠 ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" size={16} />
              <h2 className="text-[15px] font-semibold text-slate-800">
                {created ? "단어장 완성!" : STEP_META[state.step - 1].title}
              </h2>
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-500 sm:hidden">
                {state.step}/5
              </span>
            </div>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={17} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {state.step === 1 && (
              <StepCurriculum {...stepProps} basketCount={basketSenseIds.length} basketSenseIds={basketSenseIds} />
            )}
            {state.step === 2 && <StepScope {...stepProps} />}
            {state.step === 3 && <StepStructure {...stepProps} />}
            {state.step === 4 && <StepSchedule {...stepProps} />}
            {state.step === 5 && (
              <StepReview
                {...stepProps}
                creating={creating}
                created={created}
                createError={createError}
                basketMode={basketMode}
                onSendToStudents={() => {
                  if (!created) return;
                  onSendSeries({
                    seriesKey: created.seriesKey,
                    title: bookTitle,
                    unitCount: created.deckIds.length,
                    totalWords: created.totalWords,
                    wordsPerDay: state.wordsPerDay,
                    studyDays: state.studyDays,
                    startDate: state.startDate,
                  });
                  onClose();
                }}
                onGotoManage={() => {
                  onGotoManage();
                  onClose();
                }}
              />
            )}
          </div>

          {/* ── 푸터 ── */}
          <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-100 px-6">
            <div>
              {state.step > 1 && !created && (
                <button type="button" onClick={goPrev} className={WIZARD_BTN_GHOST}>
                  이전
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {state.step === 5 && !created && createBlockedReason && !creating && (
                <span className="hidden text-[11.5px] text-slate-400 break-keep sm:inline">
                  {createBlockedReason}
                </span>
              )}
              {state.step < 5 && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canNext}
                  className={WIZARD_BTN_PRIMARY}
                >
                  다음
                </button>
              )}
              {state.step === 5 && !created && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className={WIZARD_BTN_PRIMARY}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" size={16} />
                      만드는 중…
                    </>
                  ) : (
                    "단어장 만들기"
                  )}
                </button>
              )}
              {state.step === 5 && created && (
                <button type="button" onClick={onClose} className={WIZARD_BTN_GHOST}>
                  닫기
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
