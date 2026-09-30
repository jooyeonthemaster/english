"use client";

// ============================================================================
// 시험지 인쇄 컨트롤러 — 시험지 영역에서 window.print() 를 부르는 **유일한** 파일.
//
// 계약(26-09-29 확정 · docs/EXAM-PRINT-PIPELINE.md):
//  · 인쇄는 「준비 완료 신호」가 모두 참일 때만 부른다(print-readiness.ts). 시간 추측 타이머
//    (setTimeout 50/120/600 뒤 인쇄) 금지 — 진입점은 ctl.print(mode) 만 부른다.
//  · 상태: idle → preparing(⇄ waiting-load) → printing → done | needs-gesture | blocked
//  · waiting-load: 문서 load 전이면 잡이 load 가 끝날 때까지 print() 를 부르지 않는다(exam-print-job 【load 전 인쇄 금지】,
//    26-09-30 XB-1). 준비의 한 단계라 연타 무시 · 취소 · 네이티브 인쇄 넘겨받기(PRINT-R5)가 preparing 과 같다.
//  · 빠른 경로: 글꼴이 이미 준비된 클릭이면 클릭 태스크 안에서 전 쪽을 flushSync 로 그리고 같은
//    태스크에서 인쇄한다(Safari 사용자 활성화 보존). 그 밖에는 준비 경로(exam-print-job.ts).
//  · print() 호출 동안 beforeprint 가 한 번도 안 오면 needs-gesture — 상태 표시줄의 [인쇄](새 제스처,
//    빠른 경로)로 이어 간다. 늦게 온 beforeprint 는 printing 으로 되돌린다.
//  · 준비 중(preparing)에 컨트롤러가 부르지 않은 인쇄(Ctrl+P · 브라우저 메뉴)가 오면 잡을 그 인쇄에 넘긴다 —
//    이 잡은 print() 를 부르지 않고(두 번째 인쇄 창 0) 원격 측정도 보내지 않으며, 그 인쇄의 afterprint 에서
//    outcome 'native' 로 끝난다(26-09-30 PRINT-R5). 잡 리스너는 그래서 잡 시작부터 붙는다.
//  · 정리(해설 모드 해제 · 전 쪽 마운트 해제 · done · onFinished)는 afterprint 에서 **1회만**.
//    비차단 print()(모바일)의 반환 직후에는 정리하지 않는다.
//  · autoStart 는 이펙트가 rAF 를 예약하고 cleanup 에서 취소, 래치는 **실행된 콜백 안에서만** →
//    StrictMode 이중 이펙트에서도 정확히 1회.
//  · 모듈 단위 activeJob 으로 동시에 준비 중인 인쇄는 1건뿐이다.
//  · 원격 측정: 인쇄 호출 직전(또는 차단 시) incrementExamPrintCount(examId, meta) fire-and-forget.
//    examId 가 null(미저장 빌더)이면 보내지 않는다.
//  · 누름 무장(26-09-30 PRINT-RESPONSE · print-arming.ts): 진입점의 pointerdown · keydown(Enter/Space)에서
//    arming.arm(mode, e) — click 전에 「준비 중」을 페인트한다(빠른 경로의 무페인트 동결 대책). 무장은 외부 스토어라
//    호스트를 다시 그리지 않고 busy(=disabled)도 켜지 않는다. 잡 시작이 소비하고, 잡의 다음 상태 커밋이 지운다.
//    autoStart(제스처 없음)는 무장을 한 프레임 페인트한 뒤 다음 프레임에 시작한다.
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { incrementExamPrintCount } from "@/actions/exams";
import type {
  ExamPrintBlockReason,
  ExamPrintEntry,
  ExamPrintEventMeta,
  ExamPrintMode,
  ExamPrintPrior,
} from "@/lib/exams/print-event-meta";
import { runExamPrintJob } from "./exam-print-job";
import { createPrintArmStore, printArmIntent, watchArmedGesture, type ExamPrintArming } from "./print-arming";

export type { ExamPrintEntry, ExamPrintMode } from "@/lib/exams/print-event-meta";
export type { ExamPrintArming } from "./print-arming";

export type ExamPrintPhase =
  | "idle"
  | "preparing"
  | "waiting-load"
  | "printing"
  | "done"
  | "needs-gesture"
  | "blocked";

export interface ExamPrintControllerState {
  phase: ExamPrintPhase;
  /** 진행 중(또는 마지막) 인쇄의 모드 — 상태 표시줄의 [인쇄]·[다시 시도]가 이 모드로 다시 부른다 */
  mode: ExamPrintMode | null;
  /** blocked 사유 */
  reason: ExamPrintBlockReason | null;
  /** blocked(unmounted-pages) 때 그려지지 않은 본문 쪽 인덱스(0부터) */
  missingPages: number[];
}

export type ExamPrintFinishOutcome = "printed" | "native" | "blocked" | "cancelled" | "empty";

export interface ExamPrintFinish {
  /**
   * printed = 컨트롤러가 부른 인쇄의 afterprint 도착(사용자가 인쇄 창에서 취소한 경우도 포함 — 브라우저가 구분해
   * 주지 않는다). native = 준비 중에 사용자가 직접 연 인쇄(Ctrl+P · 브라우저 메뉴)의 afterprint — 컨트롤러는
   * print() 를 부르지 않았고 원격 측정도 없다(meta null).
   */
  outcome: ExamPrintFinishOutcome;
  mode: ExamPrintMode | null;
  meta: ExamPrintEventMeta | null;
}

export interface UseExamPrintControllerOptions {
  /** `#exam-paper-print-root` 요소(미리보기 스크롤러) */
  rootRef: RefObject<HTMLElement | null>;
  /** useOverflowGuardedPagination 의 isSettled */
  isGuardSettled: () => boolean;
  /** useOverflowGuardedPagination 의 requestMeasure — 이미지 decode 뒤 다시 재게 한다(권장) */
  requestMeasure?: () => void;
  hasItems: boolean;
  /** 문항이 없을 때 토스트 문구 */
  emptyMessage?: string;
  /** 원격 측정 · 인쇄 횟수 귀속 대상. null 이면 기록하지 않는다(미저장 빌더) */
  examId: string | null;
  entry: ExamPrintEntry;
  /** 마운트 뒤 자동 인쇄(true = 'plain'). 한 번만 돈다 */
  autoStart?: boolean | ExamPrintMode;
  /** 자동 인쇄 잡의 entry(예: ?print=1 → 'deep-link'). 없으면 entry */
  autoStartEntry?: ExamPrintEntry;
  /** 자동 인쇄가 실제로 시작되는 순간(rAF 콜백 안) — ?print=1 파라미터 제거 등 */
  onAutoStart?: () => void;
  /** 루트가 display:none 인 화면 상태를 **flushSync 로** 벗긴다(빌더 모바일 문항 단계) */
  ensureVisible?: () => void;
  onFinished?: (finish: ExamPrintFinish) => void;
}

export interface ExamPrintController {
  state: ExamPrintControllerState;
  /** preparing · printing — 인쇄 버튼 printBusy 에 넘긴다 */
  busy: boolean;
  /** PreviewPages forceMountAll 에 OR 한다 */
  forceMountAll: boolean;
  /** 해설 포함 인쇄 중 — paginationSettings.includeAnswers 와 정답표 생략에 쓴다 */
  explanation: boolean;
  /** 진입점(툴바 · 메뉴 · 모바일 바 · 상태 표시줄)은 이것만 부른다. 기본 'plain' */
  print: (mode?: ExamPrintMode) => void;
  /** 준비 취소 · 인쇄 대기 해제 · 실패 표시 닫기 */
  cancel: () => void;
  /** 누름 무장 — 진입점의 onPointerDown · onKeyDown 이 arm, 표시줄 · 버튼이 구독(print-arming.ts). 안정 참조 */
  arming: ExamPrintArming;
}

const DEFAULT_EMPTY_MESSAGE = "인쇄할 문제가 없습니다.";
const IDLE: ExamPrintControllerState = { phase: "idle", mode: null, reason: null, missingPages: [] };

/** native = 준비 중에 남이 연 인쇄(Ctrl+P 등)가 진행 중 — 이 잡은 더 준비하지도 인쇄하지도 않고 afterprint 만 기다린다 */
type JobStage = "preparing" | "printing" | "needs-gesture" | "native" | "finished";

interface PrintJob {
  owner: symbol;
  mode: ExamPrintMode;
  stage: JobStage;
  sawBeforePrint: boolean;
  meta: ExamPrintEventMeta | null;
  /** 창 리스너 해제 */
  detach: () => void;
  /** 다른 인쇄 요청이 이 잡을 대체한다 */
  supersede: (byOwner: symbol) => void;
}

// 모듈 단위 단일 비행 — 준비 중인 인쇄는 문서 전체에서 1건.
let activeJob: PrintJob | null = null;

function phaseState(phase: ExamPrintPhase, mode: ExamPrintMode | null): ExamPrintControllerState {
  return { phase, mode, reason: null, missingPages: [] };
}

// print() 안에서 리스너가 stage 를 바꾼다 — 호출부의 타입 좁히기를 끊으려고 함수로 읽는다.
function isFinished(job: PrintJob): boolean {
  return job.stage === "finished";
}

export function useExamPrintController(options: UseExamPrintControllerOptions): ExamPrintController {
  const optsRef = useRef(options);
  useLayoutEffect(() => {
    optsRef.current = options;
  });
  const [owner] = useState(() => Symbol("exam-print-controller"));
  const [state, setState] = useState<ExamPrintControllerState>(IDLE);
  const [forceMountAll, setForceMountAll] = useState(false);
  const [explanation, setExplanation] = useState(false);
  const jobRef = useRef<PrintJob | null>(null);
  // 커밋~패시브 이펙트 사이의 클릭도 받도록 true 로 시작한다(StrictMode 가짜 언마운트는 아래 이펙트가 되돌린다).
  const aliveRef = useRef(true);
  const priorRef = useRef<ExamPrintPrior | null>(null);
  const autoLatchRef = useRef(false);
  const autoFrameRef = useRef(0);
  // 누름 무장 — 스토어(표시)와 해제 감시(리스너)는 따로 푼다: 잡 시작은 감시만 떼고 표시는 잡의 다음 상태가 이어받는다.
  const [armStore] = useState(createPrintArmStore);
  const armWatchRef = useRef<(() => void) | null>(null);
  const releaseArmWatch = useCallback(() => {
    armWatchRef.current?.();
    armWatchRef.current = null;
  }, []);
  const disarm = useCallback(() => {
    releaseArmWatch();
    armStore.set(null);
  }, [armStore, releaseArmWatch]);

  // 잡 종료 — 한 번만. next 가 null 이면 화면 상태는 건드리지 않는다(같은 컨트롤러의 새 잡이 이어받음).
  const endJob = useCallback(
    (job: PrintJob, outcome: ExamPrintFinishOutcome | null, next: ExamPrintControllerState | null) => {
      if (job.stage === "finished") return;
      job.stage = "finished";
      job.detach();
      if (activeJob === job) activeJob = null;
      if (jobRef.current === job) jobRef.current = null;
      if (!aliveRef.current || !next) return;
      setExplanation(false);
      setForceMountAll(false); // 이미 그린 쪽은 LazyPaperPage 래치로 유지된다
      setState(next);
      if (outcome) optsRef.current.onFinished?.({ outcome, mode: job.mode, meta: job.meta });
    },
    [],
  );

  // 잡의 인쇄 사건 리스너 — 잡 시작부터 afterprint(또는 종료)까지 붙어 있다.
  const watchPrintEvents = useCallback(
    (job: PrintJob) => {
      const onBeforePrint = () => {
        job.sawBeforePrint = true;
        if (job.stage === "preparing") {
          // 【PRINT-R5】 컨트롤러가 print() 를 부르기 전에 인쇄가 시작됐다 = 사용자가 준비 중에 Ctrl+P · 브라우저
          // 메뉴로 직접 인쇄했다(포털이 동기 안전망으로 받는다). 여기서 잡을 넘기지 않으면 준비가 끝난 뒤
          // print() 를 한 번 더 불러 두 번째 인쇄 창과 두 번째 기록이 생긴다(26-09-30 리뷰 실측). 준비는 isDead 로
          // 멈추고, 원격 측정은 보내지 않는다(네이티브 인쇄는 기록하지 않는다), 끝은 이 인쇄의 afterprint.
          job.stage = "native";
          if (aliveRef.current) setState(phaseState("printing", job.mode));
          return;
        }
        if (job.stage === "needs-gesture") {
          // 인쇄 창이 늦게라도 떴다 — 재시도 사유(prior)가 아니다. 남겨 두면 다음 잡 원격 측정에
          // prior:'needs-gesture' 가 붙어 재시도 분포가 부풀려진다(26-09-30 실측).
          if (priorRef.current === "needs-gesture") priorRef.current = null;
          job.stage = "printing";
          if (aliveRef.current) setState(phaseState("printing", job.mode));
        }
      };
      const onAfterPrint = () => {
        // beforeprint 없이 온 afterprint(리스너를 단 순간 이미 진행 중이던 남의 인쇄) — 이 잡의 인쇄가 아니다.
        if (job.stage === "preparing") return;
        endJob(job, job.stage === "native" ? "native" : "printed", phaseState("done", job.mode));
      };
      window.addEventListener("beforeprint", onBeforePrint);
      window.addEventListener("afterprint", onAfterPrint);
      job.detach = () => {
        window.removeEventListener("beforeprint", onBeforePrint);
        window.removeEventListener("afterprint", onAfterPrint);
      };
    },
    [endJob],
  );

  // window.print() 호출 — 시험지 영역의 유일한 호출 지점.
  const invokePrint = useCallback(
    (job: PrintJob) => {
      job.stage = "printing";
      window.print();
      if (isFinished(job)) return; // afterprint 가 print() 안에서 이미 왔다(데스크톱) — 정리 끝
      if (!aliveRef.current) return;
      if (job.sawBeforePrint) {
        setState(phaseState("printing", job.mode)); // 비차단 print() — afterprint 를 기다린다
        return;
      }
      job.stage = "needs-gesture";
      priorRef.current = "needs-gesture";
      setState(phaseState("needs-gesture", job.mode));
    },
    [],
  );

  const start = useCallback(
    (mode: ExamPrintMode, entryOverride?: ExamPrintEntry) => {
      // 누름 무장 소비 — 해제 감시만 뗀다. 「준비 중」 표시는 잡의 다음 상태 커밋이 지운다(빠른 경로 동결 동안 보인다).
      releaseArmWatch();
      const opts = optsRef.current;
      if (!opts.hasItems) {
        armStore.set(null);
        toast.error(opts.emptyMessage ?? DEFAULT_EMPTY_MESSAGE);
        opts.onFinished?.({ outcome: "empty", mode, meta: null });
        return;
      }
      const running = activeJob;
      if (running?.stage === "preparing") {
        armStore.set(null);
        // 준비 중 연타는 무시 — 다른 시험지가 준비 중이면 알린다.
        if (running.owner !== owner) toast.info("다른 시험지의 인쇄를 준비하고 있습니다. 끝난 뒤 다시 눌러 주세요.");
        return;
      }
      running?.supersede(owner); // 인쇄 창 대기 · 제스처 대기 중인 잡은 새 요청이 대체한다

      const prior = priorRef.current;
      priorRef.current = null;
      const job: PrintJob = {
        owner,
        mode,
        stage: "preparing",
        sawBeforePrint: false,
        meta: null,
        detach: () => undefined,
        supersede: (byOwner) =>
          byOwner === owner ? endJob(job, null, null) : endJob(job, "cancelled", IDLE),
      };
      activeJob = job;
      jobRef.current = job;
      watchPrintEvents(job);
      // 준비를 멈출 때: 종료 · 언마운트 · 대체, 그리고 준비 중 남이 연 인쇄(native — PRINT-R5)
      const isDead = () => job.stage === "finished" || job.stage === "native" || !aliveRef.current;

      void runExamPrintJob({
        mode,
        entry: entryOverride ?? opts.entry,
        prior,
        getRoot: () => optsRef.current.rootRef.current,
        isGuardSettled: () => optsRef.current.isGuardSettled(),
        remeasure: () => {
          const measure = optsRef.current.requestMeasure;
          if (measure) flushSync(measure);
        },
        ensureVisible: () => optsRef.current.ensureVisible?.(),
        mountAll: () =>
          flushSync(() => {
            setExplanation(mode === "explanation");
            setForceMountAll(true);
          }),
        onPreparing: () => {
          if (aliveRef.current) setState(phaseState("preparing", mode));
        },
        onWaitingLoad: (waiting) => {
          if (aliveRef.current) setState(phaseState(waiting ? "waiting-load" : "preparing", mode));
        },
        isDead,
        report: (meta) => {
          job.meta = meta;
          const examId = optsRef.current.examId;
          if (examId) void incrementExamPrintCount(examId, meta).catch(() => undefined);
        },
        invokePrint: () => invokePrint(job),
      }).then(
        (result) => {
          if (result.kind !== "blocked" || isDead()) return;
          priorRef.current = "blocked";
          endJob(job, "blocked", {
            phase: "blocked",
            mode,
            reason: result.reason,
            missingPages: result.missing,
          });
        },
        (error: unknown) => {
          console.error("[exam-print] 인쇄 준비 중 오류", error);
          if (job.stage === "native") return; // 사용자가 연 인쇄가 진행 중 — 그 afterprint 가 끝낸다
          endJob(job, "blocked", { phase: "blocked", mode, reason: null, missingPages: [] });
        },
      );
    },
    [owner, endJob, invokePrint, watchPrintEvents, releaseArmWatch, armStore],
  );

  const print = useCallback((mode: ExamPrintMode = "plain") => start(mode), [start]);

  const cancel = useCallback(() => {
    priorRef.current = null;
    disarm();
    const job = jobRef.current;
    if (job) endJob(job, "cancelled", IDLE);
    else setState(IDLE);
  }, [endJob, disarm]);

  // 누름 무장 — 버튼을 막지 않는다(busy 무관). 준비 중(연타는 start 가 무시)이면 무장하지 않는다.
  const arm = useCallback<ExamPrintArming["arm"]>(
    (mode, event) => {
      const intent = printArmIntent(event);
      if (!intent || activeJob?.stage === "preparing") return false;
      releaseArmWatch();
      armWatchRef.current = watchArmedGesture({
        win: window,
        doc: document,
        intent,
        trigger: event.currentTarget,
        source: event.nativeEvent ?? event,
        onEnd: () => {
          armWatchRef.current = null;
          armStore.set(null);
        },
      });
      armStore.set(mode);
      return true;
    },
    [armStore, releaseArmWatch],
  );
  // 안정 참조(arm · 스토어 모두 안정) — 진입점 props 가 렌더마다 바뀌지 않는다.
  const arming = useMemo<ExamPrintArming>(
    () => ({ arm, get: armStore.get, subscribe: armStore.subscribe }),
    [arm, armStore],
  );

  // 잡의 상태가 바뀐 커밋에서 무장 표시를 지운다 — 같은 페인트에 새 상태가 그려져 「준비 중」이 깜박이지 않는다.
  useLayoutEffect(() => {
    armStore.set(null);
  }, [state, armStore]);

  // 언마운트(대화상자 닫기 · Esc 포함) = 잡 폐기. 화면 상태는 건드리지 않는다.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      window.cancelAnimationFrame(autoFrameRef.current);
      disarm();
      const job = jobRef.current;
      if (job) endJob(job, null, null);
    };
  }, [endJob, disarm]);

  // 자동 인쇄(?print=1 · 카드 인쇄 대화상자) — StrictMode 안전 래치. 제스처가 없는 인쇄라 한 프레임 미뤄도 잃을 것이
  // 없다: 래치 프레임에 「준비 중」을 무장해 페인트하고, 다음 프레임에 시작한다(빠른 경로 동결 동안 표시가 보인다).
  // 두 번째 프레임은 이펙트 cleanup 이 아니라 언마운트만 취소한다 — onAutoStart(?print=1 제거)로 autoStart 가 꺼져도 인쇄한다.
  const autoStart = options.autoStart;
  useEffect(() => {
    if (!autoStart || autoLatchRef.current) return;
    const raf = window.requestAnimationFrame(() => {
      if (autoLatchRef.current) return;
      autoLatchRef.current = true;
      optsRef.current.onAutoStart?.();
      const mode: ExamPrintMode = autoStart === "explanation" ? "explanation" : "plain";
      const entry = optsRef.current.autoStartEntry;
      armStore.set(mode);
      autoFrameRef.current = window.requestAnimationFrame(() => {
        autoFrameRef.current = 0;
        if (aliveRef.current) start(mode, entry);
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [autoStart, start, armStore]);

  return {
    state,
    busy: state.phase === "preparing" || state.phase === "waiting-load" || state.phase === "printing",
    forceMountAll,
    explanation,
    print,
    cancel,
    arming,
  };
}
