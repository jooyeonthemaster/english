"use client";

// ============================================================================
// 인터랙티브 레슨 — 게임 블록 렌더러 (코어 3종)
// MEMORY_GATE(암기 관문) · SPEED_OX(스피드 판정) · WORD_HUNT(문장 속 사냥)
// 규범: docs/study-os-spec.md §11.2 · 클래스 정본: src/app/g/gd.css "v2" 섹션
//
// 원칙:
//  - 전부 탭 조작(드래그 금지). 학생이 시도하기 전에는 정답을 보여 주지 않는다.
//  - 모든 게임은 해설(why/explain)로 끝난다 — 놀이는 수단, 학습이 목적이다.
//  - 셔플은 block.id 기반 결정론(SSR 하이드레이션 안전, Math.random 금지).
//  - setInterval/setTimeout 은 반드시 cleanup 한다. 렌더 중 Date.now() 금지.
//  - onResult("done"|"perfect"|"fail", { combo? }) — 클리어 시 1회 호출.
//    같은 마운트의 재플레이로 여러 번 호출돼도 된다(플레이어가 최고 결과만 취한다).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Circle, Gamepad2, Play, RotateCcw, X } from "lucide-react";
import { MarkupText } from "@/components/grammar-drill/markup-text";
import { BlockShell } from "./lesson-blocks";
import type { MemoryGateBlock, SpeedOxBlock, WordHuntBlock } from "@/lib/study-os/lesson-types";

// ── 공통 도우미 ─────────────────────────────────────────────────────────────

/** block.id 시드 결정론 셔플 — 매 렌더 동일 순서(SSR 하이드레이션 안전) */
function seededOrder(length: number, seed: string): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  let s = 7;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) % 2147483647;
  for (let i = length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483647;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** 한글이 없으면 영어로 보고 시험지 세리프(.gd-en)를 쓴다 */
function isEnglish(text: string): boolean {
  return !/[가-힣]/.test(text);
}

/** 게임 카드 표면 — GAME 배지 + 우측 HUD (BlockShell 내부에 얹는다) */
function GameSurface({ hud, children }: { hud?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="gd-game">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="gd-game-badge"><Gamepad2 className="h-3.5 w-3.5" strokeWidth={2} />GAME</span>
        {hud}
      </div>
      {children}
    </div>
  );
}

// ── MEMORY_GATE — 암기 관문 ─────────────────────────────────────────────────
// SET: 전부 고른 뒤 "관문 열기"로 대조 / ORDER: 순서대로 탭, 정답 즉시 잠금.
// 실수 0 통과 = perfect. 재도전 무한(통과 뒤에도 재플레이 가능).

export function MemoryGateView({ block, onResult }: {
  block: MemoryGateBlock;
  onResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  // 풀 표시 순서 — 저작 순서(=정답 순서)가 새지 않도록 결정론 셔플
  const order = useMemo(() => seededOrder(block.pool.length, block.id), [block.pool.length, block.id]);
  const answerSet = useMemo(() => new Set(block.answers), [block.answers]);

  const [selected, setSelected] = useState<number[]>([]); // SET — 선택된 pool 인덱스
  const [checked, setChecked] = useState(false); // SET — "관문 열기" 이후인가
  const [lockedAt, setLockedAt] = useState<Record<number, number>>({}); // ORDER — pool 인덱스 → 순번
  const [step, setStep] = useState(0); // ORDER — 잠근 개수
  const [shake, setShake] = useState<{ i: number; k: number } | null>(null); // ORDER 오답 흔들림
  const [mistakes, setMistakes] = useState(0);
  const [passed, setPassed] = useState(false);

  // 오답 흔들림 원상복구(240ms) — 언마운트 시 반드시 해제
  useEffect(() => {
    if (shake === null) return;
    const t = setTimeout(() => setShake(null), 240);
    return () => clearTimeout(t);
  }, [shake]);

  const isSet = block.mode === "SET";
  const total = block.answers.length;
  const progress = isSet ? selected.length : step;

  /** SET — 선택 집합을 정답 집합과 대조한다 */
  const openGate = () => {
    const wrong = selected.filter((i) => !answerSet.has(block.pool[i])).length;
    const missed = total - (selected.length - wrong);
    setChecked(true);
    if (wrong === 0 && missed === 0) {
      setPassed(true);
      onResult(mistakes === 0 ? "perfect" : "done");
    } else {
      setMistakes((m) => m + wrong + missed);
    }
  };

  /** ORDER — 다음 정답이면 잠그고, 아니면 흔든다 */
  const tapOrder = (i: number) => {
    if (passed || lockedAt[i] !== undefined) return;
    if (block.pool[i] === block.answers[step]) {
      const next = step + 1;
      setLockedAt((m) => ({ ...m, [i]: next }));
      setStep(next);
      if (next === total) {
        setPassed(true);
        onResult(mistakes === 0 ? "perfect" : "done");
      }
    } else {
      setShake((s) => ({ i, k: (s?.k ?? 0) + 1 }));
      setMistakes((m) => m + 1);
    }
  };

  const retrySet = () => { setSelected([]); setChecked(false); };
  const resetAll = () => {
    setSelected([]); setChecked(false); setLockedAt({}); setStep(0);
    setShake(null); setMistakes(0); setPassed(false);
  };

  // 칩 판정색 — 맞은 칩 초록·틀린 칩 빨강. 못 고른 정답은 공개하지 않는다.
  const setChipStyle = (i: number, on: boolean): React.CSSProperties | undefined => {
    if (checked && on) {
      return answerSet.has(block.pool[i])
        ? { borderColor: "var(--gd-good)", background: "var(--gd-good-soft)", color: "var(--gd-good)" }
        : { borderColor: "var(--gd-bad)", background: "var(--gd-bad-soft)", color: "var(--gd-bad)" };
    }
    return on ? { borderColor: "var(--gd-blue)", background: "var(--gd-blue-soft)" } : undefined;
  };

  return (
    <BlockShell type="MEMORY_GATE" title={block.title}>
      <GameSurface
        hud={
          <span className="gd-hud">
            <span className="gd-mono">{progress}/{total}</span>
            {mistakes > 0 && <span style={{ color: "var(--gd-bad)" }}>실수 {mistakes}</span>}
          </span>
        }
      >
        <p className="gd-prose font-semibold">{block.mission}</p>
        <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          {isSet
            ? "해당하는 것을 전부 고른 뒤 관문을 여십시오. 다시 누르면 선택이 풀립니다."
            : "올바른 순서대로 하나씩 누르십시오."}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {order.map((i) => {
            if (isSet) {
              const on = selected.includes(i);
              return (
                <button key={i} type="button" className="gd-tile" aria-pressed={on} disabled={checked}
                  style={setChipStyle(i, on)}
                  onClick={() => setSelected((s) => (on ? s.filter((x) => x !== i) : [...s, i]))}>
                  {block.pool[i]}
                </button>
              );
            }
            const num = lockedAt[i];
            const locked = num !== undefined;
            return (
              <button key={i} type="button" className={shake?.i === i ? "gd-tile gd-shake" : "gd-tile"}
                disabled={locked || passed} onClick={() => tapOrder(i)}
                style={locked ? { borderColor: "var(--gd-good)", background: "var(--gd-good-soft)", color: "var(--gd-good)", opacity: 1 } : undefined}>
                {locked && <span className="gd-mono gd-t-2xs mr-1 font-bold">{num}</span>}
                {block.pool[i]}
              </button>
            );
          })}
        </div>

        {isSet && !checked && (
          <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" disabled={selected.length === 0} onClick={openGate}>
            관문 열기
          </button>
        )}
        {isSet && checked && !passed && (
          <div className="gd-pop mt-3">
            <p className="gd-prose-2 rounded-xl p-3" style={{ background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }}>
              {block.retryText}
            </p>
            <button type="button" className="gd-btn gd-btn-ghost mt-2 w-full" onClick={retrySet}>
              <RotateCcw className="h-4 w-4" strokeWidth={2} />다시 도전
            </button>
          </div>
        )}
        {passed && (
          <div className="gd-pop mt-3">
            <p className="gd-prose rounded-xl p-3 font-semibold" style={{ background: "var(--gd-good-soft)", color: "var(--gd-good)" }}>
              {block.passText}
            </p>
            <button type="button" className="gd-btn-chip mt-2" onClick={resetAll}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />다시 도전
            </button>
          </div>
        )}
      </GameSurface>
    </BlockShell>
  );
}

// ── SPEED_OX — 스피드 판정 ──────────────────────────────────────────────────
// 라운드당 제한시간 내 ○/× 연타. 정답은 콤보·600ms 자동 진행, 오답·시간초과는
// 해설을 읽고 "다음"을 눌러야 진행(학습 우선). 일시정지 없음.

type OxPhase = "idle" | "play" | "correct" | "review" | "end";

export function SpeedOxView({ block, onResult }: {
  block: SpeedOxBlock;
  onResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  const totalMs = block.timeLimitSec * 1000;
  const [phase, setPhase] = useState<OxPhase>("idle");
  const [round, setRound] = useState(0);
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [results, setResults] = useState<{ correct: boolean; timedOut: boolean }[]>([]);

  // 100ms 틱 — 라운드 전환(round)마다 재시작, 정지 시 반드시 해제
  useEffect(() => {
    if (phase !== "play") return;
    const t = setInterval(() => setRemainingMs((ms) => Math.max(0, ms - 100)), 100);
    return () => clearInterval(t);
  }, [phase, round]);

  // 시간 초과 — 콤보 리셋 후 해설 대기로 전환
  useEffect(() => {
    if (phase !== "play" || remainingMs > 0) return;
    setResults((r) => [...r, { correct: false, timedOut: true }]);
    setCombo(0);
    setPhase("review");
  }, [phase, remainingMs]);

  const start = () => {
    setResults([]); setRound(0); setCombo(0); setBestCombo(0);
    setRemainingMs(totalMs); setPhase("play");
  };

  const judge = (ans: boolean) => {
    if (phase !== "play") return;
    if (ans === block.rounds[round].isTrue) {
      const c = combo + 1;
      setResults((r) => [...r, { correct: true, timedOut: false }]);
      setCombo(c);
      setBestCombo((b) => Math.max(b, c));
      setPhase("correct");
    } else {
      setResults((r) => [...r, { correct: false, timedOut: false }]);
      setCombo(0);
      setPhase("review");
    }
  };

  /** 다음 라운드 또는 종료 — 종료 시점에 결과를 1회 보고한다 */
  const advance = () => {
    const next = round + 1;
    if (next >= block.rounds.length) {
      const perfect = results.length === block.rounds.length && results.every((x) => x.correct);
      onResult(perfect ? "perfect" : "done", { combo: bestCombo });
      setPhase("end");
    } else {
      setRound(next);
      setRemainingMs(totalMs);
      setPhase("play");
    }
  };

  // 정답 후 600ms 자동 진행 — 언마운트·전환 시 반드시 해제
  useEffect(() => {
    if (phase !== "correct") return;
    const t = setTimeout(advance, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- "correct" 구간에는 의존 상태 변화 없음
  }, [phase]);

  const cur = block.rounds[round];
  const frac = remainingMs / totalMs;
  const inRound = phase === "play" || phase === "correct" || phase === "review";
  const correctCount = results.filter((r) => r.correct).length;

  return (
    <BlockShell type="SPEED_OX" title={block.title}>
      <GameSurface
        hud={
          inRound ? (
            <span className="gd-hud">
              <span className="gd-mono">{round + 1}/{block.rounds.length}</span>
              {combo > 0 && <span key={combo} className="gd-combo">COMBO {combo}</span>}
            </span>
          ) : undefined
        }
      >
        {phase === "idle" && (
          <>
            <p className="gd-prose font-semibold">{block.instruction}</p>
            <p className="gd-prose-2 mt-1.5">
              총 {block.rounds.length}라운드입니다. 라운드마다 {block.timeLimitSec}초 안에 ○ 또는 ×를 누르십시오.
            </p>
            <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" onClick={start}>
              <Play className="h-4 w-4" strokeWidth={2} />시작
            </button>
          </>
        )}

        {inRound && (
          <>
            {phase !== "review" && (
              <div className="gd-timer" data-urgent={frac <= 0.3 ? "true" : undefined}>
                <span style={{ width: `${Math.max(0, frac * 100)}%` }} />
              </div>
            )}
            <p
              className={isEnglish(cur.statement) ? "gd-en gd-prose mt-3 rounded-xl p-3" : "gd-prose mt-3 rounded-xl p-3"}
              style={{ background: "var(--gd-paper)" }}
            >
              <MarkupText text={cur.statement} />
            </p>

            {/* ○/× 대형 판정 버튼 — 44px 를 훌쩍 넘는 터치 타깃 */}
            {phase !== "review" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([true, false] as const).map((ans) => (
                  <button
                    key={String(ans)}
                    type="button"
                    className="gd-option justify-center"
                    style={{ minHeight: "4.25rem" }}
                    disabled={phase !== "play"}
                    aria-label={ans ? "참으로 판정" : "거짓으로 판정"}
                    onClick={() => judge(ans)}
                  >
                    {ans ? (
                      <Circle className="h-8 w-8" style={{ color: "var(--gd-good)" }} strokeWidth={2.5} />
                    ) : (
                      <X className="h-8 w-8" style={{ color: "var(--gd-bad)" }} strokeWidth={2.5} />
                    )}
                  </button>
                ))}
              </div>
            )}

            {phase === "correct" && (
              <p className="gd-t-xs gd-pop mt-2 flex items-center gap-1 font-bold" style={{ color: "var(--gd-good)" }}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />정답입니다.
              </p>
            )}
            {phase === "review" && (
              <>
                <div className="gd-pop mt-3 rounded-xl p-3" style={{ background: "var(--gd-bad-soft)" }}>
                  <p className="gd-t-xs font-bold" style={{ color: "var(--gd-bad)" }}>
                    {results[results.length - 1]?.timedOut ? "시간 초과입니다." : "오답입니다."} 정답은 {cur.isTrue ? "○" : "×"}입니다.
                  </p>
                  <p className="gd-prose-2 mt-1">{cur.why}</p>
                </div>
                <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" onClick={advance}>
                  다음<ChevronRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </>
            )}
          </>
        )}

        {phase === "end" && (
          <>
            <div className="rounded-xl p-3" style={{ background: "var(--gd-paper)", textAlign: "center" }}>
              <p className="gd-label">결과</p>
              <p className="gd-t-xl gd-mono mt-1 font-bold">{correctCount}/{block.rounds.length}</p>
              <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>최고 콤보 {bestCombo}</p>
            </div>
            <div className="mt-2 flex flex-col">
              {block.rounds.map((r, i) => (
                <div key={i} className="gd-hairline-t flex gap-2 py-2">
                  {results[i]?.correct ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-good)" }} strokeWidth={2.5} />
                  ) : (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-bad)" }} strokeWidth={2.5} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={isEnglish(r.statement) ? "gd-en gd-t-xs leading-relaxed" : "gd-t-xs leading-relaxed"}>
                      <MarkupText text={r.statement} />
                    </p>
                    <p className="gd-t-xs mt-0.5 leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>{r.why}</p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="gd-btn gd-btn-ghost mt-3 w-full" onClick={start}>
              <RotateCcw className="h-4 w-4" strokeWidth={2} />다시 도전
            </button>
          </>
        )}
      </GameSurface>
    </BlockShell>
  );
}

// ── WORD_HUNT — 문장 속 사냥 ────────────────────────────────────────────────
// 문장 토큰을 탭해 사냥 대상을 전부 찾는다. 비대상 탭은 240ms 흔들림 + 실수.
// 실수 3회부터 "정답 마저 보기" 제공(자율성 보존 — 강제 잠금 금지).

export function WordHuntView({ block, onResult }: {
  block: WordHuntBlock;
  onResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  const [found, setFound] = useState<number[]>([]);
  const [miss, setMiss] = useState<{ i: number; k: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // 비대상 탭 흔들림 원상복구(240ms) — 언마운트 시 반드시 해제
  useEffect(() => {
    if (miss === null) return;
    const t = setTimeout(() => setMiss(null), 240);
    return () => clearTimeout(t);
  }, [miss]);

  const hitTotal = useMemo(() => block.tokens.filter((t) => t.hit).length, [block.tokens]);
  const cleared = revealed || found.length === hitTotal;
  const en = isEnglish(block.tokens.map((t) => t.t).join(" "));

  const tap = (i: number) => {
    if (cleared || found.includes(i)) return;
    if (block.tokens[i].hit) {
      const next = [...found, i];
      setFound(next);
      if (next.length === hitTotal) onResult(mistakes === 0 ? "perfect" : "done");
    } else {
      setMiss((m) => ({ i, k: (m?.k ?? 0) + 1 }));
      setMistakes((n) => n + 1);
    }
  };

  const reveal = () => { setRevealed(true); onResult("done"); };
  const reset = () => { setFound([]); setMiss(null); setMistakes(0); setRevealed(false); };

  return (
    <BlockShell type="WORD_HUNT" title={block.title}>
      <GameSurface
        hud={
          <span className="gd-hud">
            <span>
              {block.hitLabel} <span className="gd-mono">{found.length}/{hitTotal}</span>
            </span>
            {mistakes > 0 && <span style={{ color: "var(--gd-bad)" }}>실수 {mistakes}</span>}
          </span>
        }
      >
        <p className="gd-prose font-semibold">{block.instruction}</p>

        <p
          className={en ? "gd-en gd-prose mt-3 rounded-xl p-3 leading-loose" : "gd-prose mt-3 rounded-xl p-3 leading-loose"}
          style={{ background: "var(--gd-paper)" }}
        >
          {block.tokens.map((tok, i) => {
            const state = found.includes(i) ? "hit" : miss?.i === i ? "miss" : revealed && tok.hit ? "reveal" : undefined;
            return (
              <span key={i}>
                <button type="button" className="gd-hunt-token" data-state={state} disabled={cleared} onClick={() => tap(i)}>
                  {tok.t}
                </button>{" "}
              </span>
            );
          })}
        </p>

        {!cleared && mistakes >= 3 && (
          <button type="button" className="gd-btn-chip mt-2.5" onClick={reveal}>
            정답 마저 보기
          </button>
        )}

        {cleared && (
          <div className="gd-pop mt-3">
            <p className="gd-prose font-semibold" style={{ color: revealed ? "var(--gd-ink-2)" : "var(--gd-good)" }}>
              {revealed ? "남은 정답을 표시했습니다." : "전부 찾았습니다."}
            </p>
            <p className="gd-prose-2 mt-1.5">{block.ko}</p>
            <p className="gd-prose-2 mt-2 rounded-xl p-3" style={{ background: "var(--gd-blue-soft)" }}>
              {block.explain}
            </p>
            <button type="button" className="gd-btn-chip mt-2.5" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />다시
            </button>
          </div>
        )}
      </GameSurface>
    </BlockShell>
  );
}
