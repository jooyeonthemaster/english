"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { paginateGroups } from "../pagination";
import { forcedPerPageEnabled } from "../pagination-keep";
import type { PaginationResult } from "../pagination-types";
import type { PaginationSettings, PaperGroup } from "../types";
import { columnKey, findColumnOverflows } from "../print/column-overflow";
import { examFontsLoading } from "../print/print-readiness";

// 칸 넘침 실측은 print/column-overflow.ts 로 옮겼다(인쇄 잡이 인쇄 직전 같은 판정식으로 남은 넘침을 센다).
export { findColumnOverflows, type ColumnOverflow } from "../print/column-overflow";

// ============================================================================
// 조판 세로 넘침 가드 — 「추정으로 나누고, 실측으로 바로잡는다」.
//
// paginateGroups 는 글자 폭·줄높이 **추정**으로 칸을 채운다. 추정이 실제 렌더보다 작으면
// 칸의 마지막 내용이 페이지 아래(바닥글·다음 장)로 밀려 나간다(26-09-19 사용자 신고 —
// 3빈칸 선지 그리드 170px, 기타 유형 2~48px 넘침이 전수 스윕에서 칸 7% 에 존재).
// 추정을 아무리 다듬어도 「절대」 는 보장 못 하므로, 미리보기에 실제로 그려진 칸을 재서
// 넘친 칸의 추정 용량을 그만큼 줄여 다시 나눈다 — 넘친 내용이 다음 칸/쪽으로 내려간다.
//
// 동작:
//   1) 그려진 페이지(`[data-exam-page-index] .exam-a4-page`)를 앞에서부터 훑어, 칸(main 의 자식)의
//      마지막 조각 아래끝이 main 아래끝을 넘는 **첫 칸**을 찾는다(transform scale 보정).
//   2) 그 칸의 추정 용량을 「추정 사용량 × 가용/실측」 − 여유로 낮춘다(최소 1px 은 반드시 낮춤 →
//      마지막 블록이 반드시 다음 칸으로 간다). 그 칸보다 뒤 칸의 보정은 버린다(앞이 바뀌면 뒤는 무효).
//   3) useLayoutEffect 안에서 setState → 페인트 전에 다시 나눈다(사용자는 넘친 프레임을 보지 않는다).
//      칸 하나씩 앞에서부터 고치므로 결과가 결정론적이다.
// 보정은 입력(그룹·설정)이 바뀌면 통째로 버리고 처음부터 다시 잰다 — 위치 기반 보정이라 입력이
// 바뀌면 의미가 없다. 시험지 글꼴(woff2) 로딩 중에는 재지 않고, 로딩이 끝나면 처음부터 다시 잰다
// (무관한 UI 글꼴의 로딩은 보지 않는다 — PRINT-R1). 블록 1개뿐인 칸(한 칸보다 큰 원자 블록)·시도 한도를
// 넘긴 칸은 고칠 수 없으므로 건너뛴다(stuck). 고칠 것은 없는데 stuck 칸이 여전히 넘치면 결과를
// 'stuck-overflow' 로 남긴다 — 수렴은 맞지만 깨끗하지 않다(PRINT-R3, 인쇄 잡이 guard:'stuck' 으로 보고).
//
// 【수렴 신호 isSettled — 26-09-29】 인쇄 컨트롤러(print/use-exam-print-controller)는 「가드가 다
// 고쳤는가」를 **시간이 아니라 이 판정**으로 본다. 판정은 마지막 측정 기록(결과 종류 · 측정 당시
// paginationResult · 측정 당시 마운트된 쪽 수)과 글꼴 에폭에 묶여 있어, 2쪽만 재고 깨끗하다고
// 오인하거나 대체 글꼴로 잰 값을 믿지 않는다.
//
// 【React 중첩 갱신 한도 방어】 전 쪽을 한 번에 마운트하면 보정이 layout effect → setState 의 **한
// 동기 커밋 체인**으로 이어진다. React 19 는 이 체인이 50 커밋을 넘으면 #185(Maximum update depth)
// 를 던져 미리보기 트리를 통째로 무너뜨린다(MAX_PASSES 는 80). 그래서 호스트 layout effect 가 체인
// 길이를 세고, 20 을 넘으면 다음 보정을 microtask 의 flushSync 로 넘겨 **새 체인**으로 이어 간다.
// ⚠ JS 가 부른 print() 안에서는 microtask 가 인쇄 레이아웃 전에 돌지 않는다 — 그래서 버튼 인쇄는
//   컨트롤러가 print() 전에 전 쪽을 그리고 isSettled 를 기다린다(넘긴 보정까지 끝난 뒤 인쇄).
// ============================================================================

const MAX_ATTEMPTS_PER_COLUMN = 6;
const MAX_PASSES = 80;
const TARGET_MARGIN_PX = 2;
/** 한 동기 커밋 체인에서 허용하는 호스트 layout effect 횟수(React 한도 50 의 절반 이하). */
const NESTED_CHAIN_LIMIT = 20;

type ColumnKey = string;

/**
 * 마지막 가드 실행의 결과 종류.
 *  - inactive: 가드 비활성(쪽당 N문제 강제 · 개발 스위치) · no-root: 루트 없음
 *  - exhausted: 보정 한도(MAX_PASSES) 소진 · fonts-loading: 글꼴 로딩 중이라 측정 보류
 *  - clean: 넘친 칸 없음 · pending: 보정을 걸었다(다시 나눈 뒤 다시 잰다)
 *  - stuck-overflow: 고칠 수 있는 칸은 없지만 포기한 칸(한 칸보다 긴 원자 블록)이 여전히 넘친다
 *  - deferred: 체인이 길어 다음 보정을 microtask 로 넘겼다
 * 수렴(settled)으로 치는 것은 clean · stuck-overflow · exhausted 다(더 할 수 있는 것이 없다 — inactive 는 판정
 * 자체를 건너뛴다). stuck-overflow · exhausted 의 잘림은 인쇄 잡이 인쇄 직전에 실측해 원격 측정에 싣는다.
 */
export type GuardOutcome =
  | "inactive"
  | "no-root"
  | "exhausted"
  | "fonts-loading"
  | "clean"
  | "stuck-overflow"
  | "pending"
  | "deferred";

type SettleRecord = {
  outcome: GuardOutcome;
  /** 측정 당시의 paginationResult — 지금 것과 다르면 그 뒤에 다시 나눠진 것이다. */
  result: PaginationResult;
  /** 측정 당시 루트에 마운트된 본문 쪽 수 — 지금 것과 다르면 새로 그려진 쪽을 아직 안 쟀다. */
  mounted: number;
};

function countMountedPages(root: ParentNode): number {
  return root.querySelectorAll("[data-exam-page-index] .exam-a4-page").length;
}

type GuardState = {
  groups: PaperGroup[];
  settings: PaginationSettings;
  fontEpoch: number;
  adjust: Record<ColumnKey, number>;
  attempts: Record<ColumnKey, number>;
  stuck: Record<ColumnKey, true>;
  passes: number;
};

function parseKey(key: ColumnKey): [number, number] {
  const [p, c] = key.split(":").map(Number);
  return [p, c];
}

function isBefore(key: ColumnKey, page: number, column: number): boolean {
  const [p, c] = parseKey(key);
  return p < page || (p === page && c < column);
}

function keepBefore<T>(record: Record<ColumnKey, T>, page: number, column: number): Record<ColumnKey, T> {
  const out: Record<ColumnKey, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isBefore(key, page, column)) out[key] = value;
  }
  return out;
}

// 개발 진단 스위치 — localStorage `paperOverflowGuard=off` 이면 가드를 끈다(추정만의 분할과 비교용).
function devGuardDisabled(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("paperOverflowGuard") === "off";
  } catch {
    return false;
  }
}

// 개발 진단 스위치 — localStorage `paperOverflowGuardUnderestimate=<px>` 이면 **가드가 아직 고치지
// 않은 칸**의 추정 용량을 그만큼 부풀린다(= 추정이 실제보다 작은 상황 재현). 채워진 칸마다 보정이
// 1회 이상 돌아, 전 쪽 동시 마운트에서 보정 수십 회짜리 체인을 강제한다(중첩 갱신 한도 방어 검증용).
// 운영 빌드에서는 항상 0 이다. SSR 스냅숏은 0 이라 하이드레이션이 어긋나지 않는다.
function devUnderestimatePx(): number {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return 0;
  try {
    const px = Number(window.localStorage.getItem("paperOverflowGuardUnderestimate"));
    return Number.isFinite(px) && px > 0 ? Math.min(px, 2000) : 0;
  } catch {
    return 0;
  }
}
const noopSubscribe = () => () => undefined;
const serverZero = () => 0;

/** 보정이 없는 칸은 -bias(용량 증가), 가드가 보정한 칸은 그 보정값을 그대로 쓴다. */
function withDevUnderestimate(
  adjust: Record<ColumnKey, number> | undefined,
  bias: number,
): Readonly<Record<string, number>> {
  const base = adjust ?? {};
  return new Proxy(base, {
    get: (target, key) =>
      typeof key === "string"
        ? Object.prototype.hasOwnProperty.call(target, key)
          ? target[key]
          : -bias
        : undefined,
  });
}

/** 시험지 글꼴 면이 내려받는 중인가 — 전역 fonts.status 가 아니다(PRINT-R1) */
function fontsLoading(): boolean {
  return typeof document !== "undefined" && examFontsLoading(document);
}

/**
 * paginateGroups + 실측 넘침 보정. rootRef 는 미리보기 페이지 프레임들을 품은 요소(썸네일 제외).
 * 반환한 requestMeasure 는 지연 마운트된 페이지가 새로 그려졌을 때 호출한다.
 * 반환한 isSettled 는 「지금 그려진 전 쪽을 현재 조판·현재 글꼴로 재서 더 고칠 것이 없다」일 때만
 * 참이다(가드 비활성이면 항상 참). 안정 콜백이라 인쇄 컨트롤러에 그대로 넘긴다.
 */
export function useOverflowGuardedPagination(
  groups: PaperGroup[],
  settings: PaginationSettings,
  rootRef: RefObject<HTMLElement | null>,
  options: { enabled?: boolean } = {},
): { paginationResult: PaginationResult; requestMeasure: () => void; isSettled: () => boolean } {
  // 강제 쪽당 N문제 모드는 칸 용량을 쓰지 않는다(그룹 경계로만 넘김) — 보정 대상이 아니다.
  // 해설 포함 모드는 강제 배치를 쓰지 않으므로 가드가 켜진다(조판기와 같은 판정 — forcedPerPageEnabled · E1).
  const active =
    (options.enabled ?? true) && !forcedPerPageEnabled(settings) && !devGuardDisabled();
  const [fontEpoch, setFontEpoch] = useState(0);
  const [guard, setGuard] = useState<GuardState | null>(null);
  const devBias = useSyncExternalStore(noopSubscribe, devUnderestimatePx, serverZero);
  // 마지막 측정 기록(isSettled 의 재료) · 체인 길이 · microtask 로 넘긴 보정 대기 · 글꼴 이벤트 순번.
  const settleRef = useRef<SettleRecord | null>(null);
  const chainRef = useRef(0);
  const maxChainRef = useRef(0);
  const deferredRef = useRef(false);
  // microtask 로 넘긴 보정이 부를 runGuard(아래 호스트 layout effect 가 채운다 — 넘김은 그 뒤에만 생긴다).
  const runGuardRef = useRef<() => void>(() => undefined);
  // loadingdone(맑은 고딕) 때 **동기로** 올린다 — setFontEpoch 가 커밋되기 전까지 isSettled 가 거짓이
  // 되어, 대체 글꼴로 잰 「깨끗함」을 믿지 않는다.
  const fontSeqRef = useRef(0);

  const current =
    active &&
    guard &&
    guard.groups === groups &&
    guard.settings === settings &&
    guard.fontEpoch === fontEpoch
      ? guard
      : null;
  const adjust = current?.adjust;

  const paginationResult = useMemo(
    () =>
      paginateGroups(
        groups,
        active && devBias > 0
          ? { ...settings, columnCapacityAdjust: withDevUnderestimate(adjust, devBias) }
          : adjust && Object.keys(adjust).length > 0
            ? { ...settings, columnCapacityAdjust: adjust }
            : settings,
      ),
    [groups, settings, adjust, active, devBias],
  );

  // 측정·보정 한 번. 레이아웃 이펙트(재분할 직후)와 지연 마운트된 페이지의 마운트 알림 양쪽에서
  // 부른다 — 후자는 보정이 필요할 때만 setState 하므로 스크롤 중 빌더 전체를 다시 그리지 않는다.
  const latest = useRef({ active, current, paginationResult, groups, settings, fontEpoch });
  const runGuard = useCallback(() => {
    const { active: on, current: cur, paginationResult: result, groups: g, settings: s, fontEpoch: epoch } =
      latest.current;
    const root = rootRef.current;
    // 이번 실행의 결론을 「측정 당시 조판 · 마운트 수」와 함께 남긴다(isSettled 의 재료).
    const record = (outcome: GuardOutcome) => {
      settleRef.current = { outcome, result, mounted: root ? countMountedPages(root) : 0 };
    };
    if (!on) {
      // 비활성이면 isSettled 가 기록을 보지 않는다 — 쪽 수를 세지 않는다(스크롤 중 비용 0).
      settleRef.current = { outcome: "inactive", result, mounted: 0 };
      return;
    }
    if (!root) {
      record("no-root");
      return;
    }
    const base: GuardState = cur ?? {
      groups: g,
      settings: s,
      fontEpoch: epoch,
      adjust: {},
      attempts: {},
      stuck: {},
      passes: 0,
    };
    if (base.passes >= MAX_PASSES) {
      record("exhausted");
      return;
    }
    const [overflow] = findColumnOverflows(root, base.stuck);
    // 글꼴이 아직 오는 중이면 대체 글꼴로 잰 값이라 믿을 수 없다 — loadingdone 에서 다시 잰다.
    if (fontsLoading()) {
      record("fonts-loading");
      return;
    }
    if (!overflow) {
      // 포기한 칸이 있으면 그 칸이 아직 넘치는지 본다(skip 없이 첫 넘침 1개) — 잘린 채 인쇄될 칸이다.
      const stuckOverflow =
        Object.keys(base.stuck).length > 0 && findColumnOverflows(root, {}, true).length > 0;
      record(stuckOverflow ? "stuck-overflow" : "clean");
      return;
    }

    const { page, column, used, available } = overflow;
    const key = columnKey(page, column);
    const info = result.columns?.[page];
    const estimated = info?.used[column];
    const capacity = info?.capacity[column];
    const blocks = info?.blocks[column] ?? 0;
    const attempts = base.attempts[key] ?? 0;
    let next: GuardState;
    if (
      estimated === undefined ||
      capacity === undefined ||
      blocks <= 1 ||
      attempts >= MAX_ATTEMPTS_PER_COLUMN
    ) {
      next = { ...base, stuck: { ...base.stuck, [key]: true } };
    } else {
      const target = Math.min(
        estimated - 1,
        (estimated * available) / Math.max(used, 1) - TARGET_MARGIN_PX,
      );
      const nextAdjust = keepBefore(base.adjust, page, column);
      nextAdjust[key] = Math.max(base.adjust[key] ?? 0, capacity - Math.max(0, target));
      next = {
        ...base,
        adjust: nextAdjust,
        attempts: { ...keepBefore(base.attempts, page, column), [key]: attempts + 1 },
        stuck: keepBefore(base.stuck, page, column),
        passes: base.passes + 1,
      };
    }
    // 【중첩 갱신 한도 방어】 이 동기 체인이 이미 길면 setState 를 여기서 하지 않고 microtask 의
    // flushSync 로 넘긴다 — 그때 다시 재서(runGuard) 같은 보정을 새 체인에서 건다.
    if (chainRef.current > NESTED_CHAIN_LIMIT) {
      record("deferred");
      if (!deferredRef.current) {
        deferredRef.current = true;
        queueMicrotask(() => {
          deferredRef.current = false;
          flushSync(() => runGuardRef.current());
        });
      }
      return;
    }
    record("pending");
    setGuard(next);
  }, [rootRef]);

  useLayoutEffect(() => {
    latest.current = { active, current, paginationResult, groups, settings, fontEpoch };
    runGuardRef.current = runGuard;
    // 커밋 단위 체인 카운터 — 이 layout effect 가 한 동기 체인 안에서 몇 번 돌았나.
    // 체인이 끝나면(microtask 체크포인트) 0 으로 되돌린다.
    if (chainRef.current === 0) {
      queueMicrotask(() => {
        chainRef.current = 0;
      });
    }
    chainRef.current += 1;
    if (chainRef.current > maxChainRef.current) maxChainRef.current = chainRef.current;
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      // 개발 진단용(넘침 스윕 하네스가 읽는다) — 보정 횟수·칸별 보정량·추정치.
      // (+ maxChain: 이 탭에서 관측한 최장 동기 체인 · devUnderestimatePx: 과소추정 스위치 값)
      (window as unknown as { __paperOverflowGuard?: unknown }).__paperOverflowGuard = {
        passes: current?.passes ?? 0,
        adjust: current?.adjust ?? {},
        stuck: current?.stuck ?? {},
        columns: paginationResult.columns,
        maxChain: maxChainRef.current,
        devUnderestimatePx: devBias,
      };
    }
    runGuardRef.current(); // = runGuard (위에서 채움) — 재분할 직후 페인트 전에 재고 바로잡는다
  }, [active, current, paginationResult, groups, settings, fontEpoch, runGuard, devBias]);

  // 글꼴 로딩이 끝나면: 시험지 글꼴(맑은 고딕)이 새로 들어왔으면 줄바꿈이 바뀌므로 보정을 버리고
  // 처음부터 다시 재고(fontEpoch), 다른 글꼴이면 로딩 중이라 미뤘던 측정만 다시 한다.
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const onLoadingDone = (event: Event) => {
      const faces = (event as FontFaceSetLoadEvent).fontfaces ?? [];
      if (faces.some((face) => /malgun|맑은/i.test(face.family))) {
        fontSeqRef.current += 1;
        setFontEpoch((epoch) => epoch + 1);
      } else {
        runGuard();
      }
    };
    fonts.addEventListener("loadingdone", onLoadingDone);
    return () => fonts.removeEventListener("loadingdone", onLoadingDone);
  }, [runGuard]);

  // 수렴 판정 — 시간이 아니라 상태로 본다. 모두 참이어야 참:
  //  마지막 측정이 clean/stuck-overflow/exhausted · 그 측정의 조판이 지금 조판 · 그때 마운트 수가 지금 마운트 수 ·
  //  글꼴 이벤트 순번이 렌더된 에폭과 같음 · 글꼴 로딩 중 아님.
  const isSettled = useCallback((): boolean => {
    const { active: on, paginationResult: result, fontEpoch: epoch } = latest.current;
    if (!on) return true;
    const rec = settleRef.current;
    if (!rec || (rec.outcome !== "clean" && rec.outcome !== "stuck-overflow" && rec.outcome !== "exhausted")) {
      return false;
    }
    if (fontSeqRef.current !== epoch || fontsLoading()) return false;
    if (rec.result !== result) return false;
    const root = rootRef.current;
    return !!root && rec.mounted === countMountedPages(root);
  }, [rootRef]);

  return { paginationResult, requestMeasure: runGuard, isSettled };
}
