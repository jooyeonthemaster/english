"use client";

// ============================================================================
// 인터랙티브 레슨 — 게임 아레나 블록 렌더러
// PAIR_MATCH(짝 맞추기) · ODD_ONE_OUT(이단아 찾기) · BOSS(보스전)
// 규범: docs/study-os-spec.md §11.2 · §11.4
//
// 원칙:
//  - 조작은 전부 탭(드래그 금지). 터치 타깃 44px 이상(.gd-option/.gd-match-card).
//  - 셔플은 block.id 기반 결정론(SSR 하이드레이션 안전 — Math.random 금지).
//  - 학생이 시도하기 전에는 정답을 보여 주지 않는다. 모든 판정은 why 해설로 끝난다.
//  - onResult 는 판이 끝날 때 1회 — 클리어 "done"/"perfect", 보스 패배 "fail".
//    같은 마운트에서 재플레이하면 다시 호출될 수 있다(플레이어가 최고 결과만 취한다).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Gamepad2, Heart, HeartCrack, RotateCcw, Swords, Trophy, Zap } from "lucide-react";
import { MarkupText } from "@/components/grammar-drill/markup-text";
import { BlockShell } from "./lesson-blocks";
import type { BossBlock, OddOneOutBlock, PairMatchBlock } from "@/lib/study-os/lesson-types";

// ── 공통 도구 ───────────────────────────────────────────────────────────────

/** block.id → 결정론 시드. salt 로 같은 블록 안에서 서로 다른 수열을 얻는다. */
function seedOf(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100003;
  return h;
}

/** 결정론 셔플 — GenerateView 관용구의 일반화(SSR 하이드레이션 안전). */
function shuffleIdx(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = (i * 7 + seed) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** 한글 포함 여부 — 영어 텍스트에만 .gd-en(시험지 세리프)을 입힌다. */
const hasHangul = (s: string) => /[가-힣]/.test(s);
const enClass = (s: string) => (hasHangul(s) ? undefined : "gd-en");

/** 택일 공통 상태 — 시도 전에는 무표시, 시도 후 정답/오답/흐림. */
function optionState(picked: number | null, answer: number, i: number) {
  if (picked === null) return undefined;
  return i === answer ? "correct" : i === picked ? "wrong" : "dim";
}

/** 게임 카드 표면 — GAME 배지 + 우측 HUD 슬롯. */
function GameCard({ hud, children }: { hud?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="gd-game">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="gd-game-badge">
          <Gamepad2 className="h-3 w-3" strokeWidth={2.5} />
          GAME
        </span>
        {hud}
      </div>
      {children}
    </div>
  );
}

/** 실수 카운트 HUD — 0회면 표시하지 않는다(불필요한 압박 금지). */
function MistakeHud({ label, mistakes }: { label: string; mistakes: number }) {
  return (
    <span className="gd-hud">
      <span>{label}</span>
      {mistakes > 0 && <span style={{ color: "var(--gd-bad)" }}>실수 {mistakes}</span>}
    </span>
  );
}

// ── PAIR_MATCH — 짝 맞추기 (좌 하나 탭 → 우에서 짝 탭) ──────────────────────

export function PairMatchView({ block, onResult }: {
  block: PairMatchBlock;
  onResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  const [round, setRound] = useState(0); // "다시 섞기" 회차 — 셔플 시드에 섞인다
  const [selected, setSelected] = useState<number | null>(null); // 좌측에서 고른 pair 인덱스
  const [matched, setMatched] = useState<number[]>([]); // 맞춘 pair 인덱스(맞춘 순서)
  const [wrong, setWrong] = useState<{ a: number; b: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);

  const n = block.pairs.length;
  // 좌·우 서로 다른 시드 — 같은 행에 짝이 나란히 서지 않게 한다.
  const leftOrder = useMemo(() => shuffleIdx(n, seedOf(block.id, 3) + round * 47), [n, block.id, round]);
  const rightOrder = useMemo(() => shuffleIdx(n, seedOf(block.id, 11) + round * 47), [n, block.id, round]);
  const cleared = matched.length === n;

  // 오답 흔들림 — 240ms 뒤 자동 해제(타이머 cleanup 필수)
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(null), 240);
    return () => clearTimeout(t);
  }, [wrong]);

  const pickLeft = (p: number) => {
    if (cleared || wrong || matched.includes(p)) return;
    setSelected(selected === p ? null : p);
  };

  const pickRight = (p: number) => {
    if (cleared || wrong || matched.includes(p) || selected === null) return;
    if (p === selected) {
      const next = [...matched, p];
      setMatched(next);
      setSelected(null);
      if (next.length === n) onResult(mistakes === 0 ? "perfect" : "done");
    } else {
      setMistakes((m) => m + 1);
      setWrong({ a: selected, b: p });
      setSelected(null);
    }
  };

  const reshuffle = () => { setRound((r) => r + 1); setSelected(null); setMatched([]); setWrong(null); setMistakes(0); };

  const stateOfLeft = (p: number) =>
    matched.includes(p) ? "matched" : wrong?.a === p ? "wrong" : selected === p ? "selected" : undefined;
  const stateOfRight = (p: number) => (matched.includes(p) ? "matched" : wrong?.b === p ? "wrong" : undefined);

  return (
    <BlockShell type="PAIR_MATCH" title={block.title}>
      <GameCard hud={<MistakeHud label={`짝 ${matched.length}/${n}`} mistakes={mistakes} />}>
        <p className="gd-prose font-semibold">{block.instruction}</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            {leftOrder.map((p) => (
              <button key={p} type="button" className="gd-match-card" data-state={stateOfLeft(p)}
                aria-pressed={selected === p} disabled={cleared || matched.includes(p)} onClick={() => pickLeft(p)}>
                <span className={enClass(block.pairs[p].a)}>{block.pairs[p].a}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {rightOrder.map((p) => (
              <button key={p} type="button" className="gd-match-card" data-state={stateOfRight(p)}
                disabled={cleared || matched.includes(p)} onClick={() => pickRight(p)}>
                <span className={enClass(block.pairs[p].b)}>{block.pairs[p].b}</span>
              </button>
            ))}
          </div>
        </div>

        {!cleared && (
          <p className="gd-t-xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
            {selected === null
              ? "왼쪽에서 카드를 하나 고른 뒤, 오른쪽에서 짝을 누르십시오."
              : "오른쪽에서 짝을 찾아 누르십시오."}
          </p>
        )}

        {/* 맞춘 짝의 근거 피드 — 맞춘 순서대로 누적 */}
        {matched.some((p) => block.pairs[p].why) && (
          <div className="gd-hairline-t mt-3 flex flex-col gap-1.5 pt-2.5">
            {matched.map((p) =>
              block.pairs[p].why ? (
                <p key={p} className="gd-t-xs gd-pop flex gap-1.5 leading-relaxed">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-good)" }} strokeWidth={2.5} />
                  <span>
                    <strong className={enClass(block.pairs[p].a)}>{block.pairs[p].a}</strong> — {block.pairs[p].b} ·{" "}
                    {block.pairs[p].why}
                  </span>
                </p>
              ) : null,
            )}
          </div>
        )}

        {cleared && (
          <div className="gd-verdict mt-3 p-3" data-tone="good" role="status">
            <p className="gd-prose font-bold" style={{ color: "var(--gd-good)" }}>
              {mistakes === 0
                ? "짝을 전부 맞췄습니다 — 실수 없이 완벽합니다."
                : `짝을 전부 맞췄습니다. 실수 ${mistakes}회였습니다.`}
            </p>
            <button type="button" className="gd-btn-chip mt-2.5" onClick={reshuffle}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> 다시 섞기
            </button>
          </div>
        )}
      </GameCard>
    </BlockShell>
  );
}

// ── ODD_ONE_OUT — 이단아 찾기 (라운드 순차 진행) ────────────────────────────

export function OddOneOutView({ block, onResult }: {
  block: OddOneOutBlock;
  onResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  const [round, setRound] = useState(0);
  const [solved, setSolved] = useState(false);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [finished, setFinished] = useState(false);

  const total = block.rounds.length;
  const cur = block.rounds[Math.min(round, total - 1)];

  // 오답 카드 흔들림 — 240ms 뒤 해제하고 재시도(정답을 찾을 때까지, 학습 우선)
  useEffect(() => {
    if (wrongIdx === null) return;
    const t = setTimeout(() => setWrongIdx(null), 240);
    return () => clearTimeout(t);
  }, [wrongIdx]);

  const pick = (i: number) => {
    if (solved || finished || wrongIdx !== null) return;
    if (i === cur.odd) setSolved(true);
    else { setMistakes((m) => m + 1); setWrongIdx(i); }
  };

  const advance = () => {
    if (round + 1 < total) { setRound(round + 1); setSolved(false); return; }
    setFinished(true);
    onResult(mistakes === 0 ? "perfect" : "done");
  };

  const restart = () => { setRound(0); setSolved(false); setWrongIdx(null); setMistakes(0); setFinished(false); };

  return (
    <BlockShell type="ODD_ONE_OUT" title={block.title}>
      <GameCard hud={<MistakeHud label={`라운드 ${Math.min(round + 1, total)}/${total}`} mistakes={mistakes} />}>
        <p className="gd-prose font-semibold">{block.instruction}</p>

        <div className="gd-seg mt-2.5">
          {block.rounds.map((_, i) => (
            <i key={i} data-on={i < round || finished ? "done" : i === round ? "true" : undefined} />
          ))}
        </div>

        {!finished ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {cur.words.map((w, i) => (
                <button key={`${round}-${i}`} type="button" disabled={solved} onClick={() => pick(i)}
                  className={`gd-option justify-center${wrongIdx === i ? " gd-shake" : ""}`}
                  data-state={solved ? (i === cur.odd ? "correct" : "dim") : wrongIdx === i ? "wrong" : undefined}>
                  <span className={`gd-t-base leading-relaxed${hasHangul(w) ? "" : " gd-en"}`}>{w}</span>
                </button>
              ))}
            </div>

            {solved && (
              <div className="gd-pop mt-3">
                <p className="gd-prose flex items-center gap-1.5 font-bold" style={{ color: "var(--gd-good)" }}>
                  <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} /> 정확합니다.
                </p>
                <p className="gd-prose-2 mt-1">{cur.why}</p>
                <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" onClick={advance}>
                  {round + 1 < total ? "다음 라운드" : "결과 보기"}
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="gd-verdict mt-3 p-3" data-tone="good" role="status">
            <p className="gd-prose font-bold" style={{ color: "var(--gd-good)" }}>
              {mistakes === 0
                ? "모든 라운드를 실수 없이 통과했습니다."
                : `모든 라운드를 마쳤습니다. 실수 ${mistakes}회였습니다.`}
            </p>
            <button type="button" className="gd-btn-chip mt-2.5" onClick={restart}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> 처음부터
            </button>
          </div>
        )}
      </GameCard>
    </BlockShell>
  );
}

// ── BOSS — 보스전 (하트 3개 · 문항 수 = 보스 HP · 오답 문항은 큐 뒤로) ──────

export function BossView({ block, onResult }: {
  block: BossBlock;
  onResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  const total = block.questions.length;
  const [phase, setPhase] = useState<"intro" | "battle" | "win" | "lose">("intro");
  const [queue, setQueue] = useState<number[]>(() => block.questions.map((_, i) => i));
  const [hearts, setHearts] = useState(3);
  const [picked, setPicked] = useState<number | null>(null);

  const qIdx = queue.length > 0 ? queue[0] : null;
  const q = qIdx === null ? null : block.questions[qIdx];
  const correct = picked !== null && q !== null && picked === q.answer;
  // 정답 판정 즉시 HP 바가 줄어들게 표시 HP 를 한 발 앞서 계산한다(width 전이).
  const displayHp = phase === "win" ? 0 : correct ? queue.length - 1 : queue.length;

  const pick = (i: number) => {
    if (phase !== "battle" || picked !== null || !q) return;
    setPicked(i);
    if (i !== q.answer) setHearts((h) => h - 1);
  };

  const advance = () => {
    if (picked === null || !q || qIdx === null) return;
    setPicked(null);
    if (picked === q.answer) {
      const rest = queue.slice(1);
      setQueue(rest);
      if (rest.length === 0) { setPhase("win"); onResult(hearts === 3 ? "perfect" : "done"); }
    } else if (hearts <= 0) {
      setPhase("lose");
      onResult("fail");
    } else {
      setQueue([...queue.slice(1), qIdx]); // 틀린 문항은 큐 맨 뒤로 — 다시 만나면 맞혀야 HP 가 준다
    }
  };

  const retry = () => { setQueue(block.questions.map((_, i) => i)); setHearts(3); setPicked(null); setPhase("battle"); };

  const heartsRow = (
    <span className="gd-hearts" aria-label={`남은 하트 ${hearts}개`}>
      {[0, 1, 2].map((i) => (
        <Heart key={i} className="gd-heart h-4 w-4" data-lost={i >= hearts ? "true" : undefined}
          style={{ color: "var(--gd-bad)", fill: i < hearts ? "var(--gd-bad)" : "none" }} strokeWidth={2} />
      ))}
    </span>
  );

  return (
    <BlockShell type="BOSS" title={block.title}>
      <GameCard>
        {/* ① 등장 — 다크 패널 + 도발 대사 */}
        {phase === "intro" && (
          <>
            <div className="gd-boss-head">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Swords className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="gd-t-md font-bold">{block.bossName}</p>
                <p className="gd-t-xs mt-0.5 leading-relaxed" style={{ color: "#aebacc" }}>“{block.intro}”</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="gd-hp flex-1"><span style={{ width: "100%" }} /></div>
              <span className="gd-mono gd-t-2xs font-bold" style={{ color: "var(--gd-ink-2)" }}>
                HP {total}/{total}
              </span>
              {heartsRow}
            </div>
            <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" onClick={() => setPhase("battle")}>
              <Swords className="h-4 w-4" strokeWidth={2} /> 도전
            </button>
          </>
        )}

        {/* HP·하트 HUD — 전투 이후 항상 상단 고정 */}
        {phase !== "intro" && (
          <div className="sticky top-2 z-10">
            <div className="rounded-xl border p-2.5" style={{
              background: "var(--gd-card)", borderColor: "var(--gd-line)",
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
            }}>
              <div className="flex items-center gap-2">
                <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-ink-2)" }} strokeWidth={2} />
                <p className="gd-t-xs min-w-0 flex-1 truncate font-bold">{block.bossName}</p>
                {heartsRow}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="gd-hp flex-1"><span style={{ width: `${(displayHp / total) * 100}%` }} /></div>
                <span className="gd-mono gd-t-2xs font-bold" style={{ color: "var(--gd-ink-2)" }}>
                  HP {displayHp}/{total}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ② 전투 — 문항 1개씩, 정답=일격 / 오답=하트 소실+큐 뒤로 */}
        {phase === "battle" && q && (
          <>
            <p className={`${hasHangul(q.prompt) ? "" : "gd-en "}gd-prose mt-3 rounded-xl p-3`}
              style={{ background: "var(--gd-paper)" }}>
              <MarkupText text={q.prompt} />
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {q.options.map((opt, i) => (
                <button key={i} type="button" className="gd-option" data-state={optionState(picked, q.answer, i)}
                  disabled={picked !== null} onClick={() => pick(i)}>
                  <span className={`gd-t-base flex-1 text-left leading-relaxed${hasHangul(opt) ? "" : " gd-en"}`}>
                    {opt}
                  </span>
                </button>
              ))}
            </div>

            {picked !== null && (
              <div className="gd-pop mt-3">
                {correct ? (
                  <p className="gd-prose flex items-center gap-1.5 font-bold" style={{ color: "var(--gd-good)" }}>
                    <Zap className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                    일격이 들어갔습니다 — 보스 HP가 줄었습니다.
                  </p>
                ) : (
                  <p className="gd-prose flex items-center gap-1.5 font-bold" style={{ color: "var(--gd-bad)" }}>
                    <HeartCrack className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                    {hearts > 0
                      ? "빗나갔습니다 — 하트 하나를 잃었습니다. 이 문항은 뒤에서 다시 나옵니다."
                      : "빗나갔습니다 — 마지막 하트를 잃었습니다."}
                  </p>
                )}
                <p className="gd-prose-2 mt-1">{q.why}</p>
                <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" onClick={advance}>
                  {correct ? (queue.length === 1 ? "전투 종료" : "다음 문항") : hearts <= 0 ? "결과 확인" : "계속"}
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </>
        )}

        {/* ③ 승리 */}
        {phase === "win" && (
          <div className="gd-verdict mt-3 p-3.5" data-tone="good" role="status">
            <p className="gd-prose flex items-center gap-2 font-bold" style={{ color: "var(--gd-good)" }}>
              <Trophy className="h-4 w-4 shrink-0" strokeWidth={2} />
              {block.bossName} 격파에 성공했습니다.
            </p>
            <p className="gd-prose-2 mt-1.5">{block.winText}</p>
            <p className="gd-t-xs mt-2 font-semibold" style={{ color: "var(--gd-ink-2)" }}>
              전적 · 하트 {hearts}/3{hearts === 3 ? " — 무결점 승리입니다." : ""}
            </p>
            <button type="button" className="gd-btn-chip mt-2.5" onClick={retry}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> 다시 도전
            </button>
          </div>
        )}

        {/* ④ 패배 — 재도전 무한, 원망 금지 */}
        {phase === "lose" && (
          <div className="gd-verdict mt-3 p-3.5" data-tone="bad" role="status">
            <p className="gd-prose flex items-center gap-2 font-bold" style={{ color: "var(--gd-bad)" }}>
              <HeartCrack className="h-4 w-4 shrink-0" strokeWidth={2} />
              하트를 모두 잃었습니다.
            </p>
            <p className="gd-prose-2 mt-1.5">{block.loseText}</p>
            <button type="button" className="gd-btn gd-btn-primary mt-3 w-full" onClick={retry}>
              <RotateCcw className="h-4 w-4" strokeWidth={2} /> 다시 도전
            </button>
          </div>
        )}
      </GameCard>
    </BlockShell>
  );
}
