"use client";

// ============================================================================
// /g 학생 앱 — 기기 로컬 보존 훅 모음 (localStorage 전용, 서버 상태와 무관)
//
// ① useQDraft — /g/q 문제 세트 답안 초안 자동 보존. 새로고침·iOS 백스와이프·
//    탭 퇴출로 미제출 답안이 전량 유실되는 것을 막는다. {v, inputs, currentIdx,
//    flagged, savedAt} 를 300ms 디바운스로 localStorage[`gq:draft:${taskId}`] 에
//    저장하고 마운트 시 복원한다. StudentInput 은 choice/choices/texts
//    화이트리스트 구조(정답성 0)라 직렬화가 안전하다(§6-1). 7일 지난 초안은
//    폐기하며, 삭제 시점은 제출 성공 · 409(이미 제출) · 결과 화면 진입.
// ② useNumericChoiceHotkeys — 물리 키보드 숫자키(1~9) 선지 선택 보조 입력.
// ③ useWorksheetResume — /g/w 학습지 뷰어 이어보기(스크롤·줌 위치, 30일 보관).
//    뷰어와 플레이어가 같은 로컬 보존 계약을 공유하도록 이 모듈에 모아 둔다
//    (/g/x 의 q-result-screen 재사용과 동일한 크로스 라우트 import 관례).
// ============================================================================

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import type { StudentInput } from "@/lib/exam-scoring/types";
import type { QPlayerItem } from "./q-shared";

// ── ① 문제 세트 답안 초안 ────────────────────────────────────────────────────

const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const DRAFT_SAVE_DEBOUNCE_MS = 300;

const draftKey = (taskId: string) => `gq:draft:${taskId}`;

/** 서버 채점기의 미응답 판정과 동일 축(questions-runtime hasInput 미러) */
export function hasInput(input: StudentInput | null | undefined): boolean {
  if (!input) return false;
  if (typeof input.choice === "string") return true;
  if (Array.isArray(input.choices) && input.choices.length > 0) return true;
  if (input.texts && Object.values(input.texts).some((t) => t?.trim())) return true;
  return false;
}

/** localStorage 원본 → StudentInput 화이트리스트 재조립(스프레드 금지 — 미지 필드 차단) */
function sanitizeDraftInput(raw: unknown): StudentInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: StudentInput = {};
  if (typeof r.choice === "string" && r.choice) out.choice = r.choice;
  if (Array.isArray(r.choices)) {
    const choices = r.choices.filter((v): v is string => typeof v === "string" && v.length > 0);
    if (choices.length > 0) out.choices = choices;
  }
  if (r.texts && typeof r.texts === "object" && !Array.isArray(r.texts)) {
    const texts: Record<string, string> = {};
    for (const [key, value] of Object.entries(r.texts as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim().length > 0) texts[key] = value;
    }
    if (Object.keys(texts).length > 0) out.texts = texts;
  }
  return out.choice !== undefined || out.choices !== undefined || out.texts !== undefined
    ? out
    : null;
}

export function clearQDraft(taskId: string): void {
  try {
    window.localStorage.removeItem(draftKey(taskId));
  } catch {
    /* 스토리지 접근 불가 — 무시 */
  }
}

interface QDraftSnapshot {
  inputs: Record<string, StudentInput | null>;
  currentIdx: number;
  flagged: string[];
}

/** 저장 초안 읽기 — 버전·7일 TTL·문항 id 화이트리스트 검증을 통과한 것만 */
function readQDraft(taskId: string, items: QPlayerItem[]): QDraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(draftKey(taskId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.v !== DRAFT_VERSION) return null;
    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_TTL_MS) {
      clearQDraft(taskId);
      return null;
    }
    const known = new Set(items.map((it) => it.question.id));
    const inputs: Record<string, StudentInput | null> = {};
    if (parsed.inputs && typeof parsed.inputs === "object" && !Array.isArray(parsed.inputs)) {
      for (const [qid, value] of Object.entries(parsed.inputs as Record<string, unknown>)) {
        if (!known.has(qid)) continue;
        const input = sanitizeDraftInput(value);
        if (input) inputs[qid] = input;
      }
    }
    const flagged = Array.isArray(parsed.flagged)
      ? (parsed.flagged as unknown[]).filter(
          (id): id is string => typeof id === "string" && known.has(id),
        )
      : [];
    const idx = Number(parsed.currentIdx);
    const currentIdx = Number.isFinite(idx)
      ? Math.min(Math.max(0, Math.trunc(idx)), Math.max(0, items.length - 1))
      : 0;
    return { inputs, currentIdx, flagged };
  } catch {
    return null;
  }
}

/**
 * 플레이어 답안 상태(입력·현재 문항·다시 보기 플래그)를 소유하고 기기 로컬
 * 초안으로 자동 보존/복원한다. suspended(결과 화면)면 저장을 멈추고, 결과
 * 화면으로 시작한 마운트는 초안 용도 종료로 보고 즉시 삭제한다.
 */
export function useQDraft(taskId: string, items: QPlayerItem[], suspended: boolean) {
  const [inputs, setInputs] = useState<Record<string, StudentInput | null>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(() => new Set());

  // 복원(마운트 1회) — 의미 있는 초안일 때만 상태 주입 + 안내 토스트
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (suspended) {
      clearQDraft(taskId);
      return;
    }
    const draft = readQDraft(taskId, items);
    if (!draft) return;
    const restoredCount = Object.keys(draft.inputs).length;
    if (restoredCount === 0 && draft.flagged.length === 0 && draft.currentIdx === 0) return;
    setInputs(draft.inputs);
    setCurrentIdx(draft.currentIdx);
    setFlagged(new Set(draft.flagged));
    if (restoredCount > 0) toast("작성하던 답안을 이어서 불러왔습니다");
  }, [taskId, items, suspended]);

  // 저장(300ms 디바운스) — 복원 직후의 동일 값 재기록은 무해
  useEffect(() => {
    if (suspended) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey(taskId),
          JSON.stringify({
            v: DRAFT_VERSION,
            inputs,
            currentIdx,
            flagged: Array.from(flagged),
            savedAt: Date.now(),
          }),
        );
      } catch {
        /* 프라이빗 모드 등 저장 불가 — 초안 보존만 포기 */
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [taskId, inputs, currentIdx, flagged, suspended]);

  const toggleFlag = useCallback((questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  const clearDraft = useCallback(() => clearQDraft(taskId), [taskId]);

  return { inputs, setInputs, currentIdx, setCurrentIdx, flagged, toggleFlag, clearDraft };
}

// ── ② 숫자키 선지 입력 ──────────────────────────────────────────────────────

/**
 * SINGLE_CHOICE 문항의 숫자키(1~9) 선택 — 물리 키보드 사용자 보조 입력.
 * textarea/input 포커스 중·시트 열림·제출 중(enabled=false)에는 무시한다.
 */
export function useNumericChoiceHotkeys({
  enabled,
  item,
  onSelectToken,
}: {
  enabled: boolean;
  item: QPlayerItem | null;
  onSelectToken: (questionId: string, token: string) => void;
}): void {
  useEffect(() => {
    if (!enabled || !item || item.answerUi.inputKind !== "SINGLE_CHOICE") return;
    const count =
      item.answerUi.optionLabels?.length ??
      item.answerUi.optionCount ??
      item.question.options?.length ??
      0;
    if (count <= 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!/^[1-9]$/.test(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      const index = Number(event.key) - 1;
      if (index >= count) return;
      onSelectToken(item.question.id, String(index + 1));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, item, onSelectToken]);
}

// ── ③ 학습지 뷰어 이어보기 위치 ─────────────────────────────────────────────

const POS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
const POS_SAVE_DEBOUNCE_MS = 500;

const posKey = (taskId: string) => `gw:pos:${taskId}`;

/** 저장된 이어보기 위치 파스 — 30일 TTL·수치 검증 실패는 조용히 무시 */
function readViewerPos(
  taskId: string,
  clamp: (z: number) => number,
): { scrollRatio: number; scrollLeft: number; userZoom: number } | null {
  try {
    const raw = window.localStorage.getItem(posKey(taskId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = Number(p.savedAt);
    const ratio = Number(p.scrollRatio);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > POS_TTL_MS) return null;
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const left = Number(p.scrollLeft);
    const zoom = Number(p.userZoom);
    return {
      scrollRatio: Math.min(1, ratio),
      scrollLeft: Number.isFinite(left) ? Math.max(0, left) : 0,
      userZoom: Number.isFinite(zoom) ? clamp(zoom) : 1,
    };
  } catch {
    return null;
  }
}

/**
 * 학습지 뷰어 이어보기 — 스크롤·줌 위치를 500ms 디바운스로
 * localStorage[`gw:pos:${taskId}`] 에 {scrollRatio, scrollLeft, userZoom,
 * savedAt} 저장하고, fitScale 확정(ready — 첫 ResizeObserver 틱) 후 1회
 * 복원한다. 줌에 따라 절대 px 가 변하므로 세로는 비율(ratio) 기반이며,
 * 줌 상태 커밋을 rAF 2틱 기다린 뒤 되돌린다. 기기 로컬 표시 장치 전용.
 */
export function useWorksheetResume({
  taskId,
  scrollRef,
  userZoom,
  userZoomRef,
  ready,
  clampZoom,
  setUserZoom,
}: {
  taskId: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  userZoom: number;
  userZoomRef: RefObject<number>;
  ready: boolean;
  clampZoom: (z: number) => number;
  setUserZoom: (z: number) => void;
}): { resumePillVisible: boolean } {
  const posTimerRef = useRef<number | null>(null);
  const schedulePosSave = useCallback(() => {
    if (posTimerRef.current) window.clearTimeout(posTimerRef.current);
    posTimerRef.current = window.setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const maxTop = el.scrollHeight - el.clientHeight;
      try {
        window.localStorage.setItem(
          posKey(taskId),
          JSON.stringify({
            scrollRatio: maxTop > 0 ? el.scrollTop / maxTop : 0,
            scrollLeft: el.scrollLeft,
            userZoom: userZoomRef.current ?? 1,
            savedAt: Date.now(),
          }),
        );
      } catch {
        /* 프라이빗 모드 등 저장 불가 — 이어보기만 포기 */
      }
    }, POS_SAVE_DEBOUNCE_MS);
  }, [taskId, scrollRef, userZoomRef]);

  // 스크롤은 리스너로, 줌 변경은 deps 재실행으로 같은 디바운스 저장을 태운다
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", schedulePosSave, { passive: true });
    schedulePosSave();
    return () => {
      el.removeEventListener("scroll", schedulePosSave);
      if (posTimerRef.current) window.clearTimeout(posTimerRef.current);
    };
  }, [schedulePosSave, userZoom, scrollRef]);

  // ready 후 1회 복원 — 마운트 직후 저장 디바운스(500ms)보다 먼저 실행되므로
  // 저장이 복원을 덮어쓸 일은 없다(복원 뒤 저장은 복원된 위치를 재기록).
  const restoredRef = useRef(false);
  const [resumePillVisible, setResumePillVisible] = useState(false);
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;
    const pos = readViewerPos(taskId, clampZoom);
    if (!pos) return;
    if (pos.userZoom > 1) setUserZoom(pos.userZoom);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const maxTop = el.scrollHeight - el.clientHeight;
        if (maxTop <= 0 || pos.scrollRatio <= 0.01) return;
        el.scrollTop = pos.scrollRatio * maxTop;
        if (pos.scrollLeft > 0) el.scrollLeft = pos.scrollLeft;
        setResumePillVisible(true);
        window.setTimeout(() => setResumePillVisible(false), 1500);
      }),
    );
  }, [ready, taskId, clampZoom, setUserZoom, scrollRef]);

  return { resumePillVisible };
}
