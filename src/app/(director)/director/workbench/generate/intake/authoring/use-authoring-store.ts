"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { buildAuthoringJobTitle } from "@/lib/passage-authoring/schema";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import {
  AUTHORING_DELIVERY_UNKNOWN_MESSAGE,
  createLocalRunId,
  createRequestId,
  fetchAuthoringJobRow,
  fetchRecoverableAuthoringRuns,
  isTerminalRunStatus,
  mapJobStatus,
  normalizeJobRow,
  postAuthoringJob,
  rememberDismissedAuthoringJob,
  streamAuthoringJob,
  type AuthoringPayload,
  type AuthoringPayloadMaterial,
} from "./authoring-store-io";
import type {
  AuthoringRun,
  AuthoringRunStatus,
  StartAuthoringArgs,
} from "./authoring-types";

// ============================================================================
// AI 지문 생성 — 백그라운드 실행 스토어 (모듈 스코프 싱글턴)
//
// 왜 훅 로컬 state 가 아니라 모듈 스코프인가:
//   지문 1편에 30초 안팎, 6편이면 3분 가까이 걸린다. 그동안 선생님이 스튜디오를
//   닫고 문제 생성·지문함으로 옮겨가는 것이 정상 사용 패턴이다("다른 작업을 할
//   수 있게" 가 이 기능의 요구사항이다). 실행 목록과 폴링 타이머가 컴포넌트
//   수명에 묶여 있으면 언마운트 순간 진행 상황이 통째로 사라지고 완료 토스트도
//   뜨지 않는다.
//   → 상태·타이머는 이 모듈에 살고, 컴포넌트는 useSyncExternalStore 로 "구독"만
//     한다. 구독자가 0명이 돼도 폴링은 계속 돌며, 터미널 상태에서 스스로 멈춘다.
//   무상태 fetch·파싱은 authoring-store-io.ts 로 분리했다(이 파일은 상태 전담).
//
// 회귀 방지 계약(깨지면 조용히 망가지는 것들):
//   1) getServerSnapshot 은 반드시 **고정된 빈 배열 상수**를 돌려준다. 매 호출
//      새 배열([])을 만들면 React 가 참조 비교로 "매번 바뀌었다"고 판정해 무한
//      렌더 루프가 난다. getSnapshot 도 같은 이유로 캐시된 배열을 그대로 주고,
//      변경이 있을 때만 새 배열로 교체한다.
//   2) 새로고침해도 진행 중인 생성이 사라지지 않는다 — 첫 마운트 때 딱 한 번
//      ai-jobs 요약을 훑어 최근 24시간 내 진행 중 잡을 run 으로 복원한다.
//      이 복구는 모듈 전역에서 1회만(플래그) 수행한다.
//   3) 완료 알림은 run 당 정확히 1회. 결과를 이미 보고 있어도 중복으로 뜨지
//      않게 localId 집합으로 막는다. **복구로 되살린 완료 run 은 알림을 미리
//      소진 처리**한다 — 아니면 재접속할 때마다 며칠 전 완료 토스트가 다시 뜬다.
//   3-1) **시작 알림도 이 파일이 소유한다**(실행당 1회). 한때 보드가
//      `await startRun(...)` **뒤에서** 시작 토스트를 띄웠는데, 생중계 레인의
//      startRun 은 SSE 가 끝나야 resolve 한다 → 완료 토스트가 먼저 뜨고 그 다음에
//      "만들기 시작했어요"가 떠서 **이미 끝난 작업을 시작했다고 말했다**. 그래서
//      알림 시점을 '서버가 접수했다'가 확정되는 지점(=STARTING → RUNNING 전이)으로
//      옮겼다. 그 지점은 세 곳이다 — 스트림 onAccepted · 스트림 detached · 잡 POST
//      성공. 셋 다 startedRunIds 로 막혀 한 실행에 정확히 1회만 뜬다.
//      ⚠️ 보드(또는 어떤 호출자)에서 시작 토스트를 다시 띄우지 말 것. 그 순간
//      순서 역전과 이중 알림이 함께 되돌아온다.
//   4) 진행 중 run 이 0개면 살아있는 타이머도 0개여야 한다(비용·배터리).
//      터미널 도달·dismiss·목록 이탈 세 경로 모두에서 폴을 확실히 해제한다.
//   5) SSR 안전: 모듈 최상위에서 window/crypto 를 만지지 않는다.
//   6) **실시간 생중계 레인은 지문 1편일 때만 탄다.** SSE 연결 하나가 1편을 끝까지
//      책임지므로, 여러 편(동시성 3 워커·부분 환불·페이지 이미지 조달이 사는 곳)은
//      기존 잡+폴링 경로가 그대로 맡는다. 그리고 **한 실행은 두 경로 중 하나만
//      탄다** — 서버가 프레임을 하나라도 보냈으면(=차감됐으면) 어떤 실패에서도
//      잡 경로로 넘어가지 않고 폴링으로 붙는다(store-io 의 outcome.kind 계약).
//      preview 는 화면 전용 휘발 상태이며 터미널에 닿는 순간 지운다.
// ============================================================================

/** 진행 중 2초, 변화 없으면 6초까지 백오프(adaptive-poll 이 탭 비활성 시 정지). */
const POLL_ACTIVE_MS = 2_000;
const POLL_IDLE_MS = 6_000;

// ── 스토어 코어 ─────────────────────────────────────────────────────────────

/** 계약 1) — 서버 스냅샷은 언제나 이 상수 참조를 그대로 돌려준다. */
const EMPTY_RUNS: AuthoringRun[] = [];

let runs: AuthoringRun[] = EMPTY_RUNS;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthoringRun[] {
  return runs;
}

function getServerSnapshot(): AuthoringRun[] {
  return EMPTY_RUNS;
}

function findRun(localId: string): AuthoringRun | undefined {
  return runs.find((run) => run.localId === localId);
}

function patchRun(localId: string, patch: Partial<AuthoringRun>): void {
  let changed = false;
  const next = runs.map((run) => {
    if (run.localId !== localId) return run;
    changed = true;
    return { ...run, ...patch };
  });
  if (!changed) return;
  runs = next;
  emit();
}

// ── 폴링 레지스트리 ─────────────────────────────────────────────────────────
// startAdaptivePoll 은 첫 tick 을 동기적으로 발사한 뒤 stop 함수를 돌려준다.
// 그 첫 tick 안에서 이미 터미널을 만나 stop 을 요청하면 stopper 가 아직 맵에
// 없다 → 그 요청을 pendingStops 에 적어 뒀다가 등록 직후 즉시 해제한다.
// (이 창을 막지 않으면 완료된 run 의 타이머가 영원히 남는다 — 계약 4.)

const pollStoppers = new Map<string, () => void>();
const pendingStops = new Set<string>();

function stopPoll(localId: string): void {
  const stop = pollStoppers.get(localId);
  if (stop) {
    pollStoppers.delete(localId);
    stop();
    return;
  }
  pendingStops.add(localId);
}

function startPoll(localId: string, jobId: string): void {
  if (pollStoppers.has(localId)) return;
  pendingStops.delete(localId);

  const stop = startAdaptivePoll({
    activeMs: POLL_ACTIVE_MS,
    idleMs: POLL_IDLE_MS,
    run: async (signal) => {
      const current = findRun(localId);
      // 목록에서 빠졌거나 이미 끝난 run — 여기서 타이머를 끊는다.
      if (!current || isTerminalRunStatus(current.status)) {
        stopPoll(localId);
        return null;
      }
      try {
        const row = await fetchAuthoringJobRow(jobId, signal);
        if (!row) return null;
        const status = applyJobRow(localId, row);
        if (!status) return null;
        const after = findRun(localId);
        return `${status}:${after?.successCount ?? 0}:${after?.failedCount ?? 0}:${
          after?.items.length ?? 0
        }`;
      } catch {
        // 네트워크 실패는 "이번 폴 실패"로만 취급한다 — run 을 FAILED 로
        // 떨어뜨리면 서버에서는 멀쩡히 만들어지고 있는 지문이 유실돼 보인다.
        return null;
      }
    },
  });

  if (pendingStops.delete(localId)) {
    stop();
    return;
  }
  pollStoppers.set(localId, stop);
}

/** 잡 행을 run 에 반영하고, 터미널이면 폴 정지 + 알림 1회. */
function applyJobRow(
  localId: string,
  row: Record<string, unknown>,
): AuthoringRunStatus | null {
  const run = findRun(localId);
  if (!run) return null;

  const { status, patch } = normalizeJobRow(row, {
    items: run.items,
    successCount: run.successCount,
    failedCount: run.failedCount,
    requestedCount: run.requestedCount,
    title: run.title,
  });
  // 터미널이면 미리보기를 같은 패치에서 지운다(계약 6). 두 번 나눠 쓰면 완료된
  // 밴드가 한 프레임 동안 마지막 사고 조각을 붙든 채로 그려진다.
  patchRun(
    localId,
    isTerminalRunStatus(status) ? { ...patch, preview: undefined } : patch,
  );

  if (isTerminalRunStatus(status)) {
    stopPoll(localId);
    announceOnce(localId, status);
  }
  return status;
}

// ── 알림(run 당 1회) ────────────────────────────────────────────────────────
//
// 문구는 **전량 AUTHORING_COPY 경유**다. 이 파일이 .ts 라 게이트 ⑤(tsx JSX 한글
// 리터럴)에 걸리지 않을 뿐, "화면에 뜨는 한국어는 사전이 유일한 소유자"라는 계약은
// 파일 확장자가 아니라 **화면에 뜨는가**로 판정한다. 여기서 손코딩하던 동안 사전의
// TOAST.completed/completedPartial/failed 는 사용처 0건 사문이 됐고, 실제 문구는
// 사전과 갈라져 있었다("만들지 못했어요"↔"실패했어요", "다시 시도해 주세요"↔
// "다시 시도해주세요"). 이 리포가 반복 사고로 기록한 '문구 두 벌 표류' 그 패턴이다.
//
// failRun 의 message 는 예외가 **아니다**. 그 값은 서버가 준 사유일 때도 있지만
// (postAuthoringJob 이 응답의 error 필드를 우선한다) 서버가 아무 말도 안 하면
// authoring-store-io 가 고른 **클라이언트 문구**로 떨어지고, 그 폴백이 손코딩돼
// 있던 동안 실제로 "다시 시도해주세요"(공백 없음) 사본이 살아 있었다. 그래서
// 폴백은 전부 사전(TOAST.startFailed/jobRegisterFailed/failed/insufficientCredits/
// deliveryUnknown)으로 옮겼다 — 이 파일이 그리는 유일한 비-사전 문자열은 그렇게
// 사전을 거쳐 온 message 를 **그대로 전달**하는 것뿐이다.
// (사전 키가 다시 사문이 되는 것은 tests/unit/passage-authoring-copy-ownership.test.mjs 가 막는다.)

const toastedRunIds = new Set<string>();
/** 시작 알림을 이미 소진한 실행(계약 3-1). 완료 알림과 집합을 나눠 쓴다. */
const startedRunIds = new Set<string>();

/**
 * 시작 알림 — **'서버가 접수했다'가 확정된 지점에서만** 부른다(계약 3-1).
 * 낙관적 run 이 목록에 붙는 시점이 아니다: 접수 전에 알리면 402·400 으로 튕긴
 * 요청까지 "만들기 시작했어요"라고 광고하게 된다.
 */
function announceStartedOnce(localId: string): void {
  if (startedRunIds.has(localId)) return;
  startedRunIds.add(localId);
  const run = findRun(localId);
  if (!run) return;
  toast.success(AUTHORING_COPY.TOAST.started(run.requestedCount));
}

function announceOnce(localId: string, status: AuthoringRunStatus): void {
  if (toastedRunIds.has(localId)) return;
  toastedRunIds.add(localId);
  const run = findRun(localId);
  if (!run) return;

  if (status === "COMPLETED") {
    toast.success(AUTHORING_COPY.TOAST.completed(run.successCount));
    return;
  }
  if (status === "PARTIAL") {
    toast.warning(
      AUTHORING_COPY.TOAST.completedPartial(run.successCount, run.failedCount),
    );
    return;
  }
  toast.error(run.error || AUTHORING_COPY.TOAST.failed);
}

function failRun(localId: string, message: string): void {
  patchRun(localId, { status: "FAILED", error: message, preview: undefined });
  stopPoll(localId);
  if (toastedRunIds.has(localId)) return;
  toastedRunIds.add(localId);
  toast.error(message);
}

// ── 실행 시작 ───────────────────────────────────────────────────────────────

async function startRun(args: StartAuthoringArgs): Promise<string | null> {
  const localId = createLocalRunId();
  // 멱등키는 실행 1건당 하나. 응답을 못 받아 사용자가 다시 눌러도 같은 키가 아니면
  // 새 실행이지만, 같은 요청의 재전송(브라우저 재시도·프록시)은 서버가 이 키로
  // 합쳐 2N 크레딧이 두 번 나가지 않는다.
  const requestId = createRequestId();

  // 서버 계약은 READY 자료만 받는다 — 판독 중/실패 자료를 보내면 zod 가 튕긴다.
  const materials: AuthoringPayloadMaterial[] = args.materials
    .filter((m) => m.status === "READY" && m.content.trim().length > 0)
    .map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      sourceKind: m.sourceKind,
      content: m.content,
      note: m.note,
      // 하이브리드 첨부 — 사용자가 켠 자료만, 그리고 **실제로 올라간 경로가 있을
      // 때만** 켠 것으로 보낸다. storagePath 없이 sendPages:true 만 가면 서버가
      // 조달할 대상이 없어 "원본도 보냄"이라고 적힌 스냅샷과 실제가 어긋난다.
      // (이 세 줄이 빠져 있던 동안 원본 페이지는 한 장도 실리지 않았다.)
      sendPages: Boolean(m.sendPages && m.storagePath),
      ...(m.pageCount !== undefined ? { pageCount: m.pageCount } : {}),
      ...(m.storagePath ? { storagePath: m.storagePath } : {}),
    }));

  const optimistic: AuthoringRun = {
    jobId: null,
    localId,
    status: "STARTING",
    requestedCount: args.count,
    successCount: 0,
    failedCount: 0,
    startedAt: Date.now(),
    title: buildAuthoringJobTitle({
      instruction: args.instruction,
      materials: materials.map((m) => ({ name: m.name, role: m.role })),
      count: args.count,
    }),
    items: [],
    spec: args.spec,
    instruction: args.instruction,
    // 재생성이 "그때 그 자료"로 돌게 남긴다(보드가 자료를 빼도 이 실행은 불변).
    // 같은 객체 참조를 담을 뿐이라 본문이 복제되지는 않는다.
    materials: args.materials,
  };
  // 최신순 — 카드는 언제나 맨 앞에서 자라난다.
  runs = [optimistic, ...runs];
  emit();

  const payload: AuthoringPayload = {
    materials,
    instruction: args.instruction,
    spec: args.spec,
    count: args.count,
    diversify: args.diversify,
    avoidTexts: (args.avoidTexts ?? []).slice(-6),
  };

  // ── 생중계 레인 적격성(계약 6) ────────────────────────────────────────────
  // 여기 검사는 **빠른 우회용 최소 집합**이고 최종 권위는 서버다(부적격이면 400 을
  // 돌려주고 아래 잡 경로로 떨어진다). 원본 페이지를 함께 보내는 자료가 하나라도
  // 있으면 조달이 사는 잡 경로로 보낸다 — 텍스트만 실어 조용히 다르게 만드는 것이
  // 사용자가 켠 스위치를 배신하는 일이기 때문이다.
  const streamEligible =
    args.count === 1 && !materials.some((material) => material.sendPages);

  try {
    if (streamEligible) {
      const streamed = await streamAuthoringJob(payload, requestId, {
        // 첫 프레임(meta) = 차감 확정 = 접수 확정. 여기서 STARTING 이 풀리고
        // 시작 알림이 나간다 — 이 한 지점이 CTA 해제와 알림의 **공통 기준점**이다.
        onAccepted: (jobId) => {
          patchRun(localId, { jobId, status: "RUNNING" });
          announceStartedOnce(localId);
        },
        onPreview: (preview) => patchRun(localId, { preview }),
      });
      if (streamed.kind === "done") {
        applyJobRow(localId, streamed.row);
        return streamed.jobId;
      }
      if (streamed.kind === "detached") {
        // 접수는 됐는데 연결이 끊겼다(또는 멱등 중복) — 잡 row 가 정본이므로
        // 여기서부터는 기존 폴링이 그대로 이어받는다. 재요청은 절대 하지 않는다.
        patchRun(localId, {
          jobId: streamed.jobId,
          status: "RUNNING",
          preview: undefined,
        });
        // 멱등 중복(JSON 응답)으로 곧장 이리 떨어지면 onAccepted 가 한 번도 불리지
        // 않았다 — 그래도 서버는 접수한 상태이므로 알림은 여기서 소진한다.
        announceStartedOnce(localId);
        startPoll(localId, streamed.jobId);
        return streamed.jobId;
      }
      if (streamed.kind === "failed") {
        if (streamed.jobId) patchRun(localId, { jobId: streamed.jobId });
        failRun(localId, streamed.message);
        return null;
      }
      // kind:"ineligible" 만 아래로 떨어진다 — 서버가 접수하지 않았음이 보장된
      // 갈래라 잡 경로로 다시 보내도 이중 과금이 없다(같은 멱등키가 한 겹 더 막는다).
    }

    const outcome = await postAuthoringJob(payload, requestId);
    if (!outcome.ok) {
      failRun(localId, outcome.message);
      return null;
    }

    patchRun(localId, { jobId: outcome.jobId, status: "RUNNING" });
    announceStartedOnce(localId);

    // 라우트가 인라인으로 끝까지 만들어 결과까지 돌려준 경우엔 폴링 없이 즉시
    // 확정한다(왕복 1회로 끝나 origin transfer 가 절약된다). 아직 도는 중이면 폴로.
    const row = outcome.row;
    if (
      row &&
      isTerminalRunStatus(mapJobStatus(typeof row.status === "string" ? row.status : ""))
    ) {
      applyJobRow(localId, row);
      return outcome.jobId;
    }
    startPoll(localId, outcome.jobId);
    return outcome.jobId;
  } catch {
    // ⚠️ fetch 가 reject 했다는 것은 "응답을 못 받았다"는 뜻일 뿐, 서버가 잡을
    // 만들지 않았다는 뜻이 아니다. 라우트는 잡 생성 → 2N 선차감 → after() 순서라
    // 실제로는 정상 과금·정상 생성 중일 수 있다. 여기서 "실패했으니 다시 하세요"
    // 라고 말하면 그 재시도가 그대로 이중 과금이 된다.
    // → 판정을 보류하는 문구로 알리고, 고아 잡을 즉시 화면에 올리도록 복구를
    //   강제 재실행한다(잡이 실제로 있으면 진행 카드로 되살아난다).
    failRun(localId, AUTHORING_DELIVERY_UNKNOWN_MESSAGE);
    refreshRecoverableRuns();
    return null;
  }
}

/** 터미널 상태의 run 만 목록에서 제거한다(진행 중 요청은 무시). */
function dismissRun(localId: string): void {
  const run = findRun(localId);
  if (!run || !isTerminalRunStatus(run.status)) return;
  // 닫았다는 사실을 남긴다 — 안 남기면 24시간 복구 창이 새로고침마다 같은 카드를
  // 되살려, 사용자의 명시적인 '닫기'가 무시된 것처럼 보인다.
  if (run.jobId) rememberDismissedAuthoringJob(run.jobId);
  runs = runs.filter((item) => item.localId !== localId);
  toastedRunIds.delete(localId);
  startedRunIds.delete(localId);
  stopPoll(localId); // 방어적 — 터미널이면 이미 멈춰 있다.
  pendingStops.delete(localId);
  emit();
}

// ── 페이지 재진입 복구(계약 2) ──────────────────────────────────────────────

let recoveryStarted = false;
let recoveryInFlight = false;

/**
 * 최근 24시간 잡을 훑어 run 으로 되살린다.
 *
 * 진행 중(active) 잡은 폴을 걸어 실시간으로 이어 받고, 이미 끝난(COMPLETED/
 * PARTIAL) 잡은 **결과 회수 경로**로만 되살린다 — 후자를 빼면 새로고침 한 번에
 * 2N 크레딧으로 만든 지문이 영구 소실된다. 되살린 완료 run 은
 *   · toastedRunIds 에 선등록해 완료 토스트가 다시 뜨지 않게 하고,
 *   · items 는 비운 채 두어(요약 응답에 본문이 없다) 사용자가 결과를 열 때
 *     loadRunItems 가 상세 1회 조회로 채운다.
 */
function runRecovery(): void {
  if (typeof window === "undefined") return;
  if (recoveryInFlight) return;
  recoveryInFlight = true;

  void (async () => {
    try {
      const restored = await fetchRecoverableAuthoringRuns();
      // 복구 요청이 도는 동안 사용자가 새 실행을 시작했을 수 있다 → jobId 중복 제거.
      const known = new Set(runs.map((run) => run.jobId).filter(Boolean));
      const fresh = restored.filter(
        (item) => item.run.jobId && !known.has(item.run.jobId),
      );
      if (fresh.length === 0) return;

      // 이미 끝난 실행은 알림을 "소진된 것"으로 표시해 재접속마다 토스트가
      // 다시 뜨는 것을 막는다(계약 3).
      for (const item of fresh) {
        if (!item.active) toastedRunIds.add(item.run.localId);
      }

      runs = [...fresh.map((item) => item.run), ...runs];
      emit();
      for (const item of fresh) {
        if (item.active && item.run.jobId) {
          startPoll(item.run.localId, item.run.jobId);
        }
      }
    } catch {
      // 복구 실패는 조용히 넘어간다 — 새 실행을 막을 이유가 없다.
    } finally {
      recoveryInFlight = false;
    }
  })();
}

function recoverActiveRunsOnce(): void {
  if (recoveryStarted) return;
  if (typeof window === "undefined") return;
  recoveryStarted = true;
  runRecovery();
}

/**
 * 복구를 강제로 한 번 더 돌린다. "응답을 못 받은" 시작 요청 뒤에 호출해, 서버에는
 * 살아 있는데 클라이언트에는 id 가 없는 고아 잡을 화면에 올린다.
 */
function refreshRecoverableRuns(): void {
  recoveryStarted = true;
  runRecovery();
}

// ── 결과 지연 로드 ──────────────────────────────────────────────────────────

/**
 * 복구된 run(요약만 있고 본문이 없는 상태)의 결과를 상세 라우트에서 1회 채운다.
 * 이미 items 가 있으면 아무것도 하지 않는다 — 폴링이 채운 결과를 덮지 않게.
 */
async function loadRunItems(localId: string): Promise<boolean> {
  const run = findRun(localId);
  if (!run || !run.jobId || run.items.length > 0) return false;
  const controller = new AbortController();
  try {
    const row = await fetchAuthoringJobRow(run.jobId, controller.signal);
    if (!row) return false;
    return applyJobRow(localId, row) !== null;
  } catch {
    return false;
  }
}

// ── 훅 ──────────────────────────────────────────────────────────────────────

export interface AuthoringStoreApi {
  runs: AuthoringRun[];
  startRun: (args: StartAuthoringArgs) => Promise<string | null>;
  dismissRun: (localId: string) => void;
  /** 복구된 run 의 결과 본문을 필요할 때 한 번만 받아온다. */
  loadRunItems: (localId: string) => Promise<boolean>;
}

/**
 * 실행 목록 구독 + 시작/닫기 액션. 여러 컴포넌트가 동시에 호출해도 같은 싱글턴을
 * 본다(입력 보드·진행 카드·결과 모달이 각각 써도 상태가 갈라지지 않는다).
 */
export function useAuthoringStore(): AuthoringStoreApi {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 마운트 시 1회(모듈 전역 1회) 진행 중 잡 복구. 렌더 중이 아니라 효과에서
  // 호출해야 SSR/스트리밍 렌더에서 fetch 가 새지 않는다.
  useEffect(() => {
    recoverActiveRunsOnce();
  }, []);

  return useMemo(
    () => ({ runs: snapshot, startRun, dismissRun, loadRunItems }),
    [snapshot],
  );
}
