// ============================================================================
// /t/[token] 응시면 공용 — 저장/제출 fetch 헬퍼 + 판별 유니온 + 디바운스 (V2/V3 공유)
//
// V2(tablet-taking-client)와 V3(omr-entry-client)가 함께 임포트하는 정본 계약.
// 서버 계약(/api/t/[token]/save·submit)의 에러 코드를 판별 유니온으로 승격한다:
//  - save  : ok{version} | LOCKED(409) | DISABLED(403) | NOT_FOUND(404)
//            | NOT_READY(409) | CONFLICT(409) | BAD_REQUEST(400) | OFFLINE | UNKNOWN
//  - submit: ok | INCOMPLETE(400, missing: orderNum[]) | (save 와 동일 코드들)
// 네트워크 실패(오프라인)는 1회 재시도 후 OFFLINE 으로 반환 — 호출측이 재시도
// UI("저장 실패 — 재시도")를 그릴 수 있게 절대 throw 하지 않는다.
//
// 보안 계약(설계문서 §6-1): 서버 응답에는 정오·점수·정답이 없다 — 이 모듈도
// ok/version/missing(orderNum 목록) 외 어떤 필드도 파싱·전파하지 않는다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudentInput } from "@/lib/exam-scoring/types";

// ── 요청/응답 계약 타입 ───────────────────────────────────────────────────────

/** save/submit 바디의 responses — questionId→입력(null = 답 지움) */
export type TakingResponsesMap = Record<string, StudentInput | null>;

/** 실패 코드 공통축 — 서버 code 문자열과 1:1(+클라 전용 OFFLINE/UNKNOWN) */
export type TakingFailCode =
  | "LOCKED" // 409 — 이미 제출/채점 완료
  | "DISABLED" // 403 — 강사가 링크 회수
  | "NOT_FOUND" // 404 — 만료/미존재(토큰 rotate 포함)
  | "NOT_READY" // 409 — 할당 파손(정상 경로에선 불가)
  | "CONFLICT" // 409 — version CAS 소진(잠시 후 재시도)
  | "BAD_REQUEST" // 400 — 형식 오류(정상 UI 에선 불가)
  | "OFFLINE" // fetch 실패(재시도 1회 후) — 네트워크 문제
  | "UNKNOWN"; // 그 외(5xx 등)

export type TakingSaveResult =
  | { ok: true; version: number | null }
  | { ok: false; code: TakingFailCode; message: string };

export type TakingSubmitResult =
  | { ok: true }
  | { ok: false; code: "INCOMPLETE"; missing: number[]; message: string }
  | { ok: false; code: TakingFailCode; message: string };

// ── 내부: 공용 POST(오프라인 1회 재시도) ─────────────────────────────────────

const FAIL_MESSAGES: Record<TakingFailCode, string> = {
  LOCKED: "이미 제출이 완료된 시험입니다.",
  DISABLED: "응시가 중단된 링크입니다. 선생님께 문의해 주세요.",
  NOT_FOUND: "응시 링크가 만료되었거나 존재하지 않습니다.",
  NOT_READY: "시험 문항 정보가 준비되지 않았습니다. 선생님께 문의해 주세요.",
  CONFLICT: "저장이 겹쳤습니다. 잠시 후 다시 시도해 주세요.",
  BAD_REQUEST: "요청 형식이 올바르지 않습니다.",
  OFFLINE: "네트워크에 연결할 수 없습니다. 연결을 확인해 주세요.",
  UNKNOWN: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PostOutcome {
  status: number;
  body: Record<string, unknown> | null;
}

/** fetch 실패(오프라인·중단) 시 600ms 후 1회 재시도 — 그래도 실패면 null */
async function postJson(url: string, payload: unknown): Promise<PostOutcome | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed = (await res.json().catch(() => null)) as unknown;
      const body =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      return { status: res.status, body };
    } catch {
      if (attempt === 0) await sleep(600);
    }
  }
  return null;
}

/** 서버 code 문자열 → 판별 코드(모르는 코드·5xx 는 UNKNOWN) */
function toFailCode(status: number, rawCode: unknown): TakingFailCode {
  const code = typeof rawCode === "string" ? rawCode : "";
  if (code === "LOCKED") return "LOCKED";
  if (code === "DISABLED") return "DISABLED";
  if (code === "NOT_FOUND" || status === 404) return "NOT_FOUND";
  if (code === "NOT_READY") return "NOT_READY";
  if (code === "CONFLICT") return "CONFLICT";
  if (code === "BAD_REQUEST" || status === 400) return "BAD_REQUEST";
  return "UNKNOWN";
}

function fail(code: TakingFailCode, serverMessage?: unknown): {
  ok: false;
  code: TakingFailCode;
  message: string;
} {
  const message =
    typeof serverMessage === "string" && serverMessage.trim()
      ? serverMessage
      : FAIL_MESSAGES[code];
  return { ok: false, code, message };
}

// ── 공개 API: 저장 ───────────────────────────────────────────────────────────

/**
 * POST /api/t/[token]/save — 변경 문항만 부분 병합 저장.
 * responses 는 questionId→StudentInput(null = 답 지움). 절대 throw 하지 않는다.
 */
export async function saveResponses(
  token: string,
  responses: TakingResponsesMap,
  clientVersion?: number,
): Promise<TakingSaveResult> {
  if (Object.keys(responses).length === 0) {
    // 보낼 변경이 없으면 네트워크 왕복 자체를 생략(성공 동치).
    return { ok: true, version: clientVersion ?? null };
  }
  const outcome = await postJson(`/api/t/${encodeURIComponent(token)}/save`, {
    responses,
    ...(typeof clientVersion === "number" ? { clientVersion } : {}),
  });
  if (!outcome) return fail("OFFLINE");

  const { status, body } = outcome;
  if (status >= 200 && status < 300 && body?.ok === true) {
    const version = typeof body.version === "number" ? body.version : null;
    return { ok: true, version };
  }
  return fail(toFailCode(status, body?.code), body?.error);
}

// ── 공개 API: 제출 ───────────────────────────────────────────────────────────

/**
 * POST /api/t/[token]/submit — 최종 병합 + 서버 채점 + 상태 확정.
 * 미입력(비 MANUAL_ONLY) 문항이 있으면 INCOMPLETE{missing: orderNum[]} —
 * 호출측이 확인 다이얼로그 후 confirmIncomplete:true 로 재호출한다.
 * 성공 응답은 {ok:true} 뿐 — 정오·점수는 어떤 경로로도 오지 않는다(§6-1).
 */
export async function submitResponses(
  token: string,
  responses: TakingResponsesMap,
  confirmIncomplete?: boolean,
): Promise<TakingSubmitResult> {
  const outcome = await postJson(`/api/t/${encodeURIComponent(token)}/submit`, {
    responses,
    ...(confirmIncomplete ? { confirmIncomplete: true } : {}),
  });
  if (!outcome) return fail("OFFLINE");

  const { status, body } = outcome;
  if (status >= 200 && status < 300 && body?.ok === true) {
    return { ok: true };
  }
  if (status === 400 && body?.code === "INCOMPLETE") {
    const missing = Array.isArray(body.missing)
      ? body.missing.filter((n): n is number => typeof n === "number")
      : [];
    return {
      ok: false,
      code: "INCOMPLETE",
      missing,
      message:
        typeof body.error === "string" && body.error
          ? body.error
          : "답을 입력하지 않은 문항이 있습니다.",
    };
  }
  return fail(toFailCode(status, body?.code), body?.error);
}

// ── 저장 비콘(pagehide 최후 방어) ────────────────────────────────────────────

/**
 * 페이지 소멸(pagehide) 시점의 잔존 미저장분을 navigator.sendBeacon 으로 발사.
 * save 라우트는 표준 JSON 파서 + clientVersion 옵셔널 + 문항 단위 병합이라
 * 서버 무수정으로 수용된다. fetch 와 달리 페이지가 죽어도 브라우저가 전송을
 * 보장한다(응답은 못 받는다 — 성공 여부는 다음 재진입의 savedInputs 로 수렴).
 */
export function saveResponsesBeacon(
  token: string,
  responses: TakingResponsesMap,
): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }
  if (Object.keys(responses).length === 0) return true;
  try {
    const blob = new Blob([JSON.stringify({ responses })], {
      type: "application/json",
    });
    return navigator.sendBeacon(`/api/t/${encodeURIComponent(token)}/save`, blob);
  } catch {
    return false;
  }
}

// ── 입력 판정 헬퍼(응답함/미응답 공용 축 — V2 네비게이터·V3 그리드 공유) ──────

/** 학생 입력이 "응답함"으로 칠 실질 값을 갖는지 — 서버 sanitize 와 동일 기준 */
export function hasStudentInput(input: StudentInput | null | undefined): boolean {
  if (!input) return false;
  if (typeof input.choice === "string" && input.choice.trim()) return true;
  if (Array.isArray(input.choices) && input.choices.some((c) => c.trim())) return true;
  if (input.texts && Object.values(input.texts).some((t) => t.trim())) return true;
  return false;
}

// ── 디바운스 유틸(자동저장 공용) ─────────────────────────────────────────────

export interface Debouncer {
  /** 마지막 호출 기준 delay 후 fn 실행(이전 예약은 대체) */
  schedule: (fn: () => void) => void;
  /** 예약이 있으면 즉시 실행(수동 재시도·제출 직전 플러시용) */
  flush: () => void;
  /** 예약 취소(제출 확정 후 잔여 자동저장 차단) */
  cancel: () => void;
  /** 실행 대기 중인 예약 존재 여부(beforeunload 가드용) */
  pending: () => boolean;
}

export function createDebouncer(delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: (() => void) | null = null;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    queued = null;
  };

  return {
    schedule(fn) {
      if (timer) clearTimeout(timer);
      queued = fn;
      timer = setTimeout(() => {
        const run = queued;
        clear();
        run?.();
      }, delayMs);
    },
    flush() {
      const run = queued;
      clear();
      run?.();
    },
    cancel: clear,
    pending: () => queued !== null,
  };
}

// ── 자동저장 훅(V2 전용) — 큐·플러시·내구성 이벤트를 한곳에 ──────────────────
//
// tablet-taking-client 의 500줄 계약 회복을 위해 자동저장 기계 전체를 이관했다.
// 동작은 이관 전과 동일: 변경분 큐잉 → 1.2s 디바운스 플러시 → 실패 시 스냅샷
// 복원. 여기에 내구성 3종(hidden 즉시 플러시 / pagehide sendBeacon / online
// 복귀 자동 재시도)과 오프라인 표시 상태를 더한다. 자동 폴링은 없다.

export type AutosaveState = "idle" | "saving" | "saved" | "error";
export type AutosaveFatalCode = "LOCKED" | "DISABLED" | "NOT_FOUND";

export function useTakingAutosave({
  token,
  initialVersion,
  onFatal,
}: {
  token: string;
  initialVersion: number;
  /** 저장 불가 확정 코드(제출됨/회수/만료) — 호출측이 phase 를 전환한다 */
  onFatal: (code: AutosaveFatalCode) => void;
}) {
  const [saveState, setSaveState] = useState<AutosaveState>("idle");
  /** OFFLINE 실패 코드 또는 브라우저 offline 이벤트 — 배너 표시용 */
  const [offline, setOffline] = useState(false);

  const pendingRef = useRef(new Map<string, StudentInput | null>());
  const inFlightRef = useRef(false);
  const versionRef = useRef(initialVersion);
  const debouncerRef = useRef(createDebouncer(1200));
  // 디바운스 콜백에서 최신 flushSave 를 부르기 위한 간접 참조(선언 전 자기참조 회피)
  const flushSaveRef = useRef<() => void>(() => {});
  const onFatalRef = useRef(onFatal);
  useEffect(() => {
    onFatalRef.current = onFatal;
  }, [onFatal]);

  const flushSave = useCallback(async () => {
    if (inFlightRef.current) {
      // 진행 중 요청과 겹치면 뒤로 미룬다(문항 단위 병합이라 순서만 지키면 안전).
      debouncerRef.current.schedule(() => flushSaveRef.current());
      return;
    }
    if (pendingRef.current.size === 0) return;
    const snapshot = new Map(pendingRef.current);
    pendingRef.current.clear();
    inFlightRef.current = true;
    setSaveState("saving");

    const result = await saveResponses(
      token,
      Object.fromEntries(snapshot),
      versionRef.current,
    );
    inFlightRef.current = false;

    if (result.ok) {
      setOffline(false);
      if (typeof result.version === "number") versionRef.current = result.version;
      if (pendingRef.current.size > 0) {
        debouncerRef.current.schedule(() => flushSaveRef.current());
      } else {
        setSaveState("saved");
      }
      return;
    }

    // 실패 — 재시도용으로 스냅샷 복원(그 사이 재수정된 문항은 최신 입력 우선).
    for (const [questionId, input] of snapshot) {
      if (!pendingRef.current.has(questionId)) pendingRef.current.set(questionId, input);
    }
    if (
      result.code === "LOCKED" ||
      result.code === "DISABLED" ||
      result.code === "NOT_FOUND"
    ) {
      onFatalRef.current(result.code);
      return;
    }
    if (result.code === "OFFLINE") setOffline(true);
    setSaveState("error");
  }, [token]);

  useEffect(() => {
    flushSaveRef.current = () => void flushSave();
  }, [flushSave]);

  /** 입력 변경 큐잉 — 로컬 상태 반영은 호출측, 저장 스케줄은 여기서 */
  const queueInput = useCallback(
    (questionId: string, input: StudentInput | null) => {
      pendingRef.current.set(questionId, input);
      setSaveState("saving");
      debouncerRef.current.schedule(() => void flushSave());
    },
    [flushSave],
  );

  const retrySave = useCallback(() => {
    setSaveState("saving");
    void flushSave();
  }, [flushSave]);

  /** 제출 직전 잔여 자동저장 차단 — 제출 바디가 전 입력을 싣는다(CAS 경합 방지) */
  const cancelPending = useCallback(() => {
    debouncerRef.current.cancel();
    pendingRef.current.clear();
  }, []);

  /**
   * 저장 후 나가기 전 큐 소진 — 진행 중 요청 완료를 대기한 뒤 잔여분을 즉시
   * 플러시(상한 4회). true = 전량 저장 확정, false = 실패 잔존(호출측 잔류+토스트).
   */
  const drainPendingSaves = useCallback(async (): Promise<boolean> => {
    debouncerRef.current.cancel();
    for (let attempt = 0; attempt < 4; attempt++) {
      let guard = 0;
      while (inFlightRef.current && guard < 50) {
        await sleep(120);
        guard += 1;
      }
      if (!inFlightRef.current && pendingRef.current.size === 0) return true;
      if (pendingRef.current.size > 0) await flushSave();
    }
    return !inFlightRef.current && pendingRef.current.size === 0;
  }, [flushSave]);

  // 이탈 가드 + 내구성: hidden 전환 시 디바운스를 기다리지 않고 즉시 플러시,
  // pagehide 잔존분은 sendBeacon 으로 최후 발사, online 복귀 시 자동 재시도.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        pendingRef.current.size > 0 ||
        inFlightRef.current ||
        debouncerRef.current.pending()
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") debouncerRef.current.flush();
    };
    const onPageHide = () => {
      if (pendingRef.current.size === 0) return;
      debouncerRef.current.cancel();
      saveResponsesBeacon(token, Object.fromEntries(pendingRef.current));
    };
    const onOnline = () => {
      setOffline(false);
      if (pendingRef.current.size > 0) {
        setSaveState("saving");
        void flushSave();
      }
    };
    const onOffline = () => setOffline(true);

    // 이미 오프라인으로 진입한 경우 — 전환 이벤트가 없으니 초기 1회 판정.
    if (typeof navigator !== "undefined" && !navigator.onLine) setOffline(true);

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [token, flushSave]);

  return { saveState, offline, queueInput, retrySave, cancelPending, drainPendingSaves };
}

// ── 응시면 로컬 표시 상태(viewMode/currentIdx/flagged) — 기기 로컬, 정답성 0 ──
//
// 서버 미전송 표시 장치. 제출 확정·LOCKED 시 반드시 clearTakingPrefs 로 제거해
// 공용 태블릿에 다른 학생의 흔적이 남지 않게 한다.

export interface TakingLocalPrefs {
  viewMode?: "paper" | "single";
  currentIdx?: number;
  flagged?: string[];
}

function takingPrefsKey(token: string): string {
  return `smoat.taking.${token}`;
}

export function readTakingPrefs(token: string): TakingLocalPrefs | null {
  try {
    const raw = window.localStorage.getItem(takingPrefsKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      viewMode:
        record.viewMode === "single" || record.viewMode === "paper"
          ? record.viewMode
          : undefined,
      currentIdx:
        typeof record.currentIdx === "number" && Number.isFinite(record.currentIdx)
          ? record.currentIdx
          : undefined,
      flagged: Array.isArray(record.flagged)
        ? record.flagged.filter((v): v is string => typeof v === "string")
        : undefined,
    };
  } catch {
    return null;
  }
}

export function writeTakingPrefs(token: string, prefs: TakingLocalPrefs): void {
  try {
    window.localStorage.setItem(takingPrefsKey(token), JSON.stringify(prefs));
  } catch {
    // 저장 실패(용량·프라이빗 모드)는 무해 — 표시 상태일 뿐이다.
  }
}

/** 제출 확정·LOCKED 시 제거 — 공용 태블릿 잔존 차단 */
export function clearTakingPrefs(token: string): void {
  try {
    window.localStorage.removeItem(takingPrefsKey(token));
  } catch {
    // 무시
  }
}
