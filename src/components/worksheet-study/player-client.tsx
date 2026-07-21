"use client";

// ============================================================================
// 학습지 스터디 모드 — 스테이지 플레이어 셸 (몰입 풀스크린)
//
// 상태머신: play(1차) → retry(오답 재도전 1회) → summary. 판정·피드백 프로토콜은
// item-shared.tsx 계약. 이벤트 플러시는 v2 무손실 계약(spec §8.3): 채점 판정은
// 문항마다 즉시, 무채점 전진은 디바운스, stageDone 은 성공 응답까지 재시도,
// 실패는 백오프 재시도, 언마운트 keepalive + pagehide sendBeacon, localStorage
// 미러로 탭 크래시 복원. 규범: docs/worksheet-study-spec.md §8.3. 전부 합니다체.
// ============================================================================

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, X } from "lucide-react";
import type {
  StudyItemEvent,
  StudyEventsRequest,
  StudyStage,
} from "@/lib/worksheet-study/types";
import { eventScore } from "@/lib/worksheet-study/grade";
import { rendererFor } from "./item-registry";
import type { ItemJudgement } from "./item-shared";

/** 무채점 전진(통독·카드) 연타 배칭 디바운스 */
const UNGRADED_FLUSH_DEBOUNCE_MS = 1200;
/** 플러시 실패 백오프 — 성공할 때까지 반복 */
const RETRY_BACKOFF_MS = 4000;

export interface PlayerProps {
  taskId: string;
  stage: StudyStage;
  planHash: string;
  /** 허브 경로 — 닫기·요약의 복귀처 */
  backHref: string;
  /** 요약 "다음 단계" — 남은 스테이지가 없으면 null */
  nextStageHref: string | null;
  /** 이미 완료한 스테이지 재학습(복습) 여부 — 라벨 전용 */
  reviewMode?: boolean;
  /** dev 하네스 — 네트워크 플러시 생략 */
  harness?: boolean;
}

type Phase = "play" | "retry" | "summary";

export function StudyPlayerClient({
  taskId,
  stage,
  planHash,
  backHref,
  nextStageHref,
  reviewMode,
  harness,
}: PlayerProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("play");
  const [idx, setIdx] = useState(0);
  const [judged, setJudged] = useState<ItemJudgement | null>(null);
  const [retryList, setRetryList] = useState<number[]>([]);
  const [exitOpen, setExitOpen] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  /** 학습지가 수정돼 이 화면의 문제 구성이 낡음 — 새로 시작 안내 */
  const [staleNotice, setStaleNotice] = useState(false);

  // 첫 시도 결과 (점수 정본) — itemKey → judgement
  const firstResults = useRef<Map<string, ItemJudgement>>(new Map());
  const buffer = useRef<StudyItemEvent[]>([]);
  // stageDone 은 성공 응답이 올 때까지 여기 보관 — 매 플러시에 동봉·재시도
  const pendingStageDoneRef = useRef<StudyEventsRequest["stageDone"]>(undefined);
  // 첫 시도를 마친 아이템 키 — progress.answered(부분 진행) 계산용
  const answeredKeysRef = useRef<Set<string>>(new Set());
  // 타이머 — 렌더 순수성(react-hooks/purity)을 위해 마운트 이펙트에서 시작한다
  const itemStartRef = useRef<number>(0);
  const stageStartRef = useRef<number>(0);
  const flushingRef = useRef(false);
  const queuedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (stageStartRef.current === 0) stageStartRef.current = now;
    if (itemStartRef.current === 0) itemStartRef.current = now;
  }, []);

  const items = stage.items;
  const queue = phase === "retry" ? retryList : items.map((_, i) => i);
  const currentItem = phase === "summary" ? null : items[queue[idx]];

  // ── 플러시 (v2 무손실 계약 — spec §8.3) ──────────────────────────────────
  // localStorage 미러 — 탭 크래시·beacon 미확인 대비. 성공 확인 시에만 비운다.
  const mirrorKey = `ws-study-buf:${taskId}:${stage.id}`;
  const writeMirror = useCallback(() => {
    if (harness || typeof window === "undefined") return;
    try {
      if (buffer.current.length === 0 && !pendingStageDoneRef.current) {
        window.localStorage.removeItem(mirrorKey);
      } else {
        window.localStorage.setItem(
          mirrorKey,
          JSON.stringify({ e: buffer.current, d: pendingStageDoneRef.current ?? null }),
        );
      }
    } catch {
      // 저장소 불가(사파리 프라이빗 등) — 미러 없이 진행
    }
  }, [harness, mirrorKey]);

  const buildProgress = useCallback((): StudyEventsRequest["progress"] => {
    let firstCorrect = 0;
    let firstTotal = 0;
    for (const item of items) {
      const j = firstResults.current.get(item.key);
      const s = j ? eventScore(j) : null;
      if (s === null) continue;
      firstCorrect += s;
      firstTotal += 1;
    }
    return {
      answered: Math.min(answeredKeysRef.current.size, items.length),
      total: items.length,
      firstCorrect: Math.round(firstCorrect * 10) / 10,
      firstTotal,
    };
  }, [items]);

  const postEvents = useCallback(
    async (
      body: StudyEventsRequest,
      useBeacon: boolean,
    ): Promise<{ taskDone: boolean; planStale: boolean } | null> => {
      if (harness) return { taskDone: false, planStale: false };
      const url = `/api/g/study/${taskId}/events`;
      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
        return null;
      }
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        });
        const json = (await res.json().catch(() => null)) as
          | { taskDone?: boolean; planStale?: boolean }
          | null;
        return res.ok && json
          ? { taskDone: json.taskDone === true, planStale: json.planStale === true }
          : null;
      } catch {
        return null;
      }
    },
    [harness, taskId],
  );

  const flush = useCallback(
    async (useBeacon = false): Promise<void> => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (flushingRef.current && !useBeacon) {
        // 동시 플러시는 드롭이 아니라 큐잉 — in-flight 종료 후 잔여를 재플러시
        queuedRef.current = true;
        return;
      }
      const stageDone = pendingStageDoneRef.current;
      if (buffer.current.length === 0 && !stageDone) return;
      // 전송 전 미러 기록 — beacon·크래시 어느 쪽이든 복원 가능(서버 멱등)
      writeMirror();
      const events = buffer.current.splice(0, buffer.current.length);
      const body: StudyEventsRequest = {
        stageId: stage.id,
        planHash,
        events,
        stageDone,
        progress: buildProgress(),
      };
      if (useBeacon) {
        // beacon 은 성공 확인 불가 — 미러를 남겨 재입장 시 복원(중복 전송은 서버 멱등)
        void postEvents(body, true);
        return;
      }
      flushingRef.current = true;
      const res = await postEvents(body, false);
      flushingRef.current = false;
      if (res === null) {
        // 실패 — 버퍼·stageDone 을 보존하고 백오프 재시도 (유실 금지)
        buffer.current.unshift(...events);
        writeMirror();
        retryTimerRef.current = setTimeout(() => void flush(), RETRY_BACKOFF_MS);
        return;
      }
      if (pendingStageDoneRef.current === stageDone) pendingStageDoneRef.current = undefined;
      writeMirror();
      if (res.taskDone) setTaskDone(true);
      if (res.planStale) setStaleNotice(true);
      if (queuedRef.current || buffer.current.length > 0 || pendingStageDoneRef.current) {
        queuedRef.current = false;
        void flush();
      }
    },
    [postEvents, planHash, stage.id, buildProgress, writeMirror],
  );

  /** 무채점 전진 배칭 — 디바운스 후 플러시 */
  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void flush();
    }, UNGRADED_FLUSH_DEBOUNCE_MS);
  }, [flush]);

  // 마운트 — 이전 세션(크래시·beacon 미확인)의 미러 복원 후 즉시 플러시
  useEffect(() => {
    if (harness || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(mirrorKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        e?: StudyItemEvent[];
        d?: StudyEventsRequest["stageDone"] | null;
      };
      if (Array.isArray(parsed.e) && parsed.e.length > 0) buffer.current.push(...parsed.e);
      if (parsed.d && typeof parsed.d === "object") pendingStageDoneRef.current = parsed.d;
      if (buffer.current.length > 0 || pendingStageDoneRef.current) void flush();
    } catch {
      // 손상 미러 — 무시하고 새로 시작
    }
    // 마운트 1회 복원 전용 — flush 참조는 안정적이며 재구독이 무의미하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pagehide — 남은 버퍼·stageDone 을 beacon 으로 / 언마운트(SPA 내비) — keepalive 플러시
  useEffect(() => {
    const onHide = () => {
      if (buffer.current.length > 0 || pendingStageDoneRef.current) void flush(true);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      // SPA 라우트 이탈은 pagehide 가 뜨지 않는다 — keepalive fetch 로 마지막 플러시.
      // 클린업 시점의 "최신" 버퍼를 읽는 것이 의도다(DOM ref 아님)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (buffer.current.length > 0 || pendingStageDoneRef.current) void flush();
    };
  }, [flush]);

  // ── 판정 수신 ─────────────────────────────────────────────────────────────
  const handleJudge = useCallback(
    (j: ItemJudgement) => {
      if (!currentItem || judged) return;
      const timeMs = Date.now() - itemStartRef.current;
      const attempt = phase === "retry" ? 2 : 1;
      buffer.current.push({
        itemKey: currentItem.key,
        skill: currentItem.skill,
        sentenceNo: currentItem.sentenceNo,
        wordKey: currentItem.wordKey,
        grammarCode: currentItem.grammarCode,
        attempt,
        correct: j.correct,
        selfGrade: j.selfGrade,
        response: j.response?.slice(0, 500),
        timeMs,
        hintUsed: j.hintUsed === true,
      });
      if (phase === "play") {
        firstResults.current.set(currentItem.key, j);
        answeredKeysRef.current.add(currentItem.key);
        if (j.correct === false) setRetryList((prev) => [...prev, queue[idx]]);
      }
      setJudged(j);
      writeMirror();
      // 채점 판정은 문항마다 즉시 플러시 — 교사면 실시간 관제(spec §7.1)
      void flush();
    },
    [currentItem, judged, phase, queue, idx, flush, writeMirror],
  );

  // ── 요약 수치 — finishStage(이벤트 핸들러)에서 계산해 상태로 저장 ─────────
  const [summaryStats, setSummaryStats] = useState<{
    score: number;
    firstCorrect: number;
    firstTotal: number;
    wrongKeys: string[];
    spentMin: number;
  } | null>(null);

  // ── 진행 ──────────────────────────────────────────────────────────────────
  const finishStage = useCallback(() => {
    let firstCorrect = 0;
    let firstTotal = 0;
    const wrongKeys: string[] = [];
    for (const item of items) {
      const j = firstResults.current.get(item.key);
      const s = j ? eventScore(j) : null;
      if (s === null) continue;
      firstCorrect += s;
      firstTotal += 1;
      if (s < 1) wrongKeys.push(item.key);
    }
    const score = firstTotal === 0 ? 100 : Math.round((firstCorrect / firstTotal) * 100);
    const spentMs = Date.now() - stageStartRef.current;
    setSummaryStats({
      score,
      firstCorrect: Math.round(firstCorrect * 10) / 10,
      firstTotal,
      wrongKeys,
      spentMin: Math.max(1, Math.round(spentMs / 60000)),
    });
    setPhase("summary");
    // stageDone 은 성공 응답까지 ref 보관 — 실패해도 백오프·재입장 미러로 반드시 도달
    pendingStageDoneRef.current = { score, timeMs: spentMs, firstCorrect, firstTotal };
    writeMirror();
    void flush();
  }, [items, flush, writeMirror]);

  const advance = useCallback(() => {
    // 미판정 통과(읽기·카드 유형) 도 시간 로그를 남긴다
    if (!judged && currentItem && !stage.graded) {
      buffer.current.push({
        itemKey: currentItem.key,
        skill: currentItem.skill,
        sentenceNo: currentItem.sentenceNo,
        wordKey: currentItem.wordKey,
        grammarCode: currentItem.grammarCode,
        attempt: phase === "retry" ? 2 : 1,
        timeMs: Date.now() - itemStartRef.current,
        hintUsed: false,
      });
      if (phase === "play") answeredKeysRef.current.add(currentItem.key);
      writeMirror();
      scheduleFlush();
    }
    setJudged(null);
    itemStartRef.current = Date.now();
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      return;
    }
    if (phase === "play" && stage.graded && retryList.length > 0) {
      setPhase("retry");
      setIdx(0);
      return;
    }
    finishStage();
  }, [judged, currentItem, stage.graded, phase, idx, queue.length, retryList.length, finishStage, scheduleFlush, writeMirror]);

  const exit = useCallback(() => {
    if (phase === "summary" || (buffer.current.length === 0 && firstResults.current.size === 0)) {
      router.push(backHref);
      return;
    }
    setExitOpen(true);
  }, [phase, router, backHref]);

  // 이전 문장/카드 — 무채점 스테이지(통독·어휘 카드) 전용. 채점 스테이지는
  // 판정 되돌리기가 점수 정직성을 깨므로 전진 전용을 유지한다(시험 응시 원칙).
  // 첫 카드에서는 학습 홈으로 나간다(상단 X 와 동일 동선 — 하단에서도 복귀 가능).
  const goBack = useCallback(() => {
    if (stage.graded) return;
    if (idx === 0) {
      exit();
      return;
    }
    setJudged(null);
    itemStartRef.current = Date.now();
    setIdx(idx - 1);
  }, [stage.graded, idx, exit]);

  const saveAndExit = useCallback(async () => {
    await flush();
    router.push(backHref);
  }, [flush, router, backHref]);


  // ── 렌더 ──────────────────────────────────────────────────────────────────
  if (phase === "summary" && summaryStats) {
    return (
      <div className="gd-app flex h-dvh flex-col">
        <div className="gd-page flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <CheckCircle2 className="h-12 w-12" strokeWidth={1.5} style={{ color: "var(--gd-good)" }} aria-hidden />
          <p className="gd-label">{stage.title} 완료</p>
          {stage.graded && summaryStats.firstTotal > 0 ? (
            <>
              <p className="gd-mono text-5xl font-bold tracking-tight">{summaryStats.score}점</p>
              <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
                첫 시도 {summaryStats.firstCorrect} / {summaryStats.firstTotal} · 약 {summaryStats.spentMin}분
              </p>
              {summaryStats.wrongKeys.length > 0 ? (
                <p className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
                  틀린 {summaryStats.wrongKeys.length}문항은 다시 풀어 보았습니다. 결과 리포트에서 취약점을 확인해 보세요.
                </p>
              ) : (
                <p className="gd-t-xs" style={{ color: "var(--gd-good)" }}>
                  전부 맞혔습니다. 훌륭합니다!
                </p>
              )}
            </>
          ) : (
            <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
              수고했습니다. 다음 단계로 이어가 보세요.
            </p>
          )}
          {taskDone ? (
            <p
              className="gd-t-xs mt-1 rounded-full px-3 py-1.5 font-semibold"
              style={{ background: "var(--gd-good-soft)", color: "var(--gd-good)" }}
              role="status"
            >
              모든 필수 단계를 마쳐 과제가 완료 처리되었습니다
            </p>
          ) : null}
        </div>
        <footer className="gd-safe-b shrink-0 px-4 pt-3" style={{ background: "var(--gd-card)", borderTop: "1px solid var(--gd-line)" }}>
          <div className="gd-page flex flex-col gap-2">
            {nextStageHref ? (
              <button type="button" className="gd-btn gd-btn-primary w-full" onClick={() => router.push(nextStageHref)}>
                다음 단계로
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            <button type="button" className="gd-btn gd-btn-ghost w-full" onClick={() => router.push(backHref)}>
              학습 홈으로
            </button>
          </div>
        </footer>
      </div>
    );
  }

  if (!currentItem) return null;
  // 레지스트리의 안정 참조 컴포넌트 — createElement 로 렌더 (모듈 상수 레지스트리 조회)
  const rendererNode = createElement(rendererFor(currentItem), {
    key: `${currentItem.key}:${phase}`,
    item: currentItem as never,
    attempt: phase === "retry" ? 2 : 1,
    judged,
    onJudge: handleJudge,
  });
  const verdictTone = judged?.correct === true ? "good" : judged?.correct === false ? "bad" : null;

  return (
    <div className="gd-app flex h-dvh flex-col">
      {/* ── 상단 크롬 ── */}
      <header
        className="flex shrink-0 items-center gap-2 px-2.5 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
        style={{ background: "var(--gd-card)", borderBottom: "1px solid var(--gd-line)" }}
      >
        <button type="button" onClick={exit} aria-label="학습 홈으로 나가기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ color: "var(--gd-ink-2)" }}>
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="gd-t-sm truncate font-bold tracking-tight">
            {stage.title}
            {reviewMode ? (
              <span className="gd-t-2xs ml-1.5 font-semibold" style={{ color: "var(--gd-blue)" }}>
                복습
              </span>
            ) : null}
            {phase === "retry" ? (
              <span className="gd-t-2xs ml-1.5 font-semibold" style={{ color: "var(--gd-bad)" }}>
                다시 풀기
              </span>
            ) : null}
          </p>
          <div className="gd-seg mt-1.5" aria-label={`진행 ${idx + 1} / ${queue.length}`}>
            {queue.map((_, i) => (
              <i key={i} data-on={i < idx ? "done" : i === idx ? "true" : undefined} />
            ))}
          </div>
        </div>
        <span className="gd-mono gd-t-xs shrink-0 pr-1.5 font-semibold" style={{ color: "var(--gd-ink-3)" }}>
          {idx + 1}/{queue.length}
        </span>
      </header>

      {/* ── 본문 (아이템 렌더러) ── */}
      <div className="gd-scroll min-h-0 flex-1">
        <div className="gd-page px-4 py-5">
          {staleNotice ? (
            <div className="gd-block mb-4" role="status">
              <p className="gd-t-sm font-bold">학습지가 새 구성으로 갱신되었습니다</p>
              <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
                지금까지 푼 기록은 모두 저장되었습니다. 계속 풀어도 되고, 다음에 입장하면 새
                구성으로 학습합니다.
              </p>
            </div>
          ) : null}
          {rendererNode}
        </div>
      </div>

      {/* ── 하단 바 ── */}
      <footer className="gd-safe-b shrink-0 px-4 pt-3" style={{ background: "var(--gd-card)", borderTop: "1px solid var(--gd-line)" }}>
        <div className="gd-page">
          {judged && verdictTone ? (
            <div className="gd-verdict mb-2 flex items-center gap-2 px-3.5 py-2.5" data-tone={verdictTone} role="status">
              {verdictTone === "good" ? (
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2} style={{ color: "var(--gd-good)" }} aria-hidden />
              ) : (
                <RotateCcw className="h-4.5 w-4.5 shrink-0" strokeWidth={2} style={{ color: "var(--gd-bad)" }} aria-hidden />
              )}
              <p className="gd-t-sm font-bold" style={{ color: verdictTone === "good" ? "var(--gd-good)" : "var(--gd-bad)" }}>
                {verdictTone === "good" ? "정답입니다!" : phase === "play" ? "이 문항은 마지막에 다시 나옵니다" : "정답을 확인해 두세요"}
              </p>
            </div>
          ) : null}
          {judged || !stage.graded ? (
            <div className="flex gap-2">
              {!stage.graded ? (
                <button
                  type="button"
                  className="gd-btn gd-btn-ghost shrink-0 px-4"
                  onClick={goBack}
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                  이전
                </button>
              ) : null}
              <button type="button" className="gd-btn gd-btn-primary min-w-0 flex-1" onClick={advance}>
                {idx + 1 < queue.length ? "다음" : phase === "play" && stage.graded && retryList.length > 0 ? "틀린 문항 다시 풀기" : "마치기"}
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            <p className="gd-t-2xs py-2 text-center" style={{ color: "var(--gd-ink-3)" }}>
              문제를 풀면 바로 채점됩니다
            </p>
          )}
        </div>
      </footer>

      {/* ── 나가기 확인 시트 ── */}
      {exitOpen ? (
        <>
          <button type="button" aria-label="닫기" className="gd-sheet-backdrop" onClick={() => setExitOpen(false)} />
          <div className="gd-sheet" role="dialog" aria-modal="true" aria-label="학습 중단 확인">
            <div className="gd-sheet-grip" />
            <div className="px-5 py-4">
              <p className="gd-t-md font-bold">학습을 잠시 멈출까요?</p>
              <p className="gd-t-sm mt-1" style={{ color: "var(--gd-ink-2)" }}>
                지금까지 푼 내용은 저장됩니다. 언제든 이어서 할 수 있습니다.
              </p>
              <div className="mt-4 flex flex-col gap-2 pb-2">
                <button type="button" className="gd-btn gd-btn-primary w-full" onClick={() => void saveAndExit()}>
                  저장하고 나가기
                </button>
                <button type="button" className="gd-btn gd-btn-ghost w-full" onClick={() => setExitOpen(false)}>
                  계속하기
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
