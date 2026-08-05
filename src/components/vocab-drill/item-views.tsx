"use client";

// ============================================================================
// 단어 훈련 — 문항 유형별 뷰 7종 (어법 item-views.tsx 의 단어판).
// 모든 뷰는 (item, draft, setDraft, verdict) 계약으로 통일한다.
// verdict 가 있으면 잠금 상태(제출 후) — 정답·상태 색을 표시한다.
// FLASH 만 예외적으로 onFlashAnswer 콜백을 받는다(자기평가 즉시 제출 신호).
// ============================================================================

import { useState } from "react";
import type {
  VocabClientItem,
  VocabSubmitVerdict,
} from "@/lib/vocab-drill/payload";
import { VOCAB_POS_LABELS } from "@/lib/vocab-drill/display";

export interface VocabItemViewProps {
  item: VocabClientItem;
  draft: string | null;
  setDraft: (v: string) => void;
  verdict: VocabSubmitVerdict | null;
  /**
   * FLASH 전용 — O/X 버튼이 draft 설정 직후 호출한다.
   * 부모(플레이어)는 이 신호로 즉시 제출한다(draft 상태 반영을 기다리지 않도록
   * 답을 인자로 넘긴다).
   */
  onFlashAnswer?: (answer: "O" | "X") => void;
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export function VocabItemView(props: VocabItemViewProps) {
  switch (props.item.type) {
    case "MEANING_CHOICE":
      return <MeaningChoiceView {...props} />;
    case "WORD_CHOICE":
      return <WordChoiceView {...props} />;
    case "CONTEXT_FILL":
      return <ContextFillView {...props} />;
    case "SPELL":
      return <SpellView {...props} />;
    case "EXAMPLE_MATCH":
      return <ExampleMatchView {...props} />;
    case "TRAP_JUDGE":
      return <TrapJudgeView {...props} />;
    case "FLASH":
      return <FlashView {...props} />;
  }
}

// ── 공용 조각 ────────────────────────────────────────────────────────────────

function PosPill({ pos }: { pos: string }) {
  return (
    <span
      className="gd-t-3xs shrink-0 rounded-md px-1.5 py-0.5 font-bold tracking-wide"
      style={{
        background: "var(--gd-paper)",
        color: "var(--gd-ink-2)",
        border: "1px solid var(--gd-line)",
      }}
    >
      {VOCAB_POS_LABELS[pos] ?? pos}
    </span>
  );
}

/** 4지선다 공용 — 값 문자열 대조로 상태 결정(정답 텍스트는 verdict 에서 온다). */
function OptionList({
  options,
  chosen,
  correctValue,
  locked,
  onPick,
  en,
}: {
  options: string[];
  chosen: string | null;
  /** 제출 후 정답 텍스트(MEANING_CHOICE=senseKo, WORD_CHOICE·CONTEXT_FILL=lemma) */
  correctValue: string | null;
  locked: boolean;
  onPick: (v: string) => void;
  /** 선지가 영어 표제어면 세리프(gd-en) */
  en?: boolean;
}) {
  const norm = (s: string) => s.trim();
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {options.map((opt, i) => {
        let state: string | undefined;
        if (locked && correctValue !== null) {
          if (norm(opt) === norm(correctValue)) state = "correct";
          else if (chosen !== null && norm(opt) === norm(chosen)) state = "wrong";
          else state = "dim";
        } else if (chosen !== null && norm(opt) === norm(chosen)) {
          state = "selected";
        }
        return (
          <button
            key={`${i}-${opt}`}
            type="button"
            className="gd-option"
            data-state={state}
            disabled={locked}
            onClick={() => onPick(opt)}
          >
            <span
              className="gd-t-2xs flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-semibold"
              style={{ borderColor: "var(--gd-line-strong)", color: "var(--gd-ink-2)" }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className={en ? "gd-en gd-t-md" : "gd-t-sm"}>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── MEANING_CHOICE — 표제어 → 뜻 고르기 ──────────────────────────────────────

function MeaningChoiceView({ item, draft, setDraft, verdict }: VocabItemViewProps) {
  if (item.type !== "MEANING_CHOICE") return null;
  // 팩 조립 문항은 문맥 문장이 함께 온다(단어는 원문 굴절형으로 복원돼 있다) —
  // 같은 단어의 다른 뜻이 선지에 섞이는 의도적 함정(사람 vs 인칭)은 이 문맥이
  // 있어야 단일 정답이 된다(서빙 계약 불변식).
  const sentence = item.sentence ?? null;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="gd-en gd-t-2xl font-bold">{item.lemma}</p>
        <PosPill pos={item.pos} />
      </div>
      {sentence && (
        <>
          {item.sourceLabel && <p className="gd-label mt-3 mb-2">{item.sourceLabel}</p>}
          <div className={`gd-card px-4 py-4 ${item.sourceLabel ? "" : "mt-3"}`}>
            <p className="gd-en gd-t-md">{sentence}</p>
          </div>
        </>
      )}
      <p className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-2)" }}>
        {sentence
          ? "이 문장에서 이 단어의 뜻으로 알맞은 것을 고르십시오."
          : "이 단어의 뜻으로 알맞은 것을 고르십시오."}
      </p>
      <OptionList
        options={item.options}
        chosen={draft}
        correctValue={verdict ? verdict.senseKo : null}
        locked={Boolean(verdict)}
        onPick={setDraft}
      />
    </div>
  );
}

// ── WORD_CHOICE — 뜻 → 표제어 고르기 ─────────────────────────────────────────

function WordChoiceView({ item, draft, setDraft, verdict }: VocabItemViewProps) {
  if (item.type !== "WORD_CHOICE") return null;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="gd-t-xl font-bold">{item.senseKo}</p>
        <PosPill pos={item.pos} />
      </div>
      <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
        {item.senseEn}
      </p>
      <p className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-2)" }}>
        이 뜻에 해당하는 단어를 고르십시오.
      </p>
      <OptionList
        options={item.options}
        chosen={draft}
        correctValue={verdict ? verdict.lemma : null}
        locked={Boolean(verdict)}
        onPick={setDraft}
        en
      />
    </div>
  );
}

// ── CONTEXT_FILL — 기출 예문 빈칸 채우기 ─────────────────────────────────────

function ContextFillView({ item, draft, setDraft, verdict }: VocabItemViewProps) {
  if (item.type !== "CONTEXT_FILL") return null;
  // 제출 전: 고른 단어를 파란색으로 실시간 삽입 / 제출 후: 정답 단어를 초록색으로.
  const fill = verdict ? verdict.lemma : draft;
  const fillColor = verdict ? "var(--gd-good)" : "var(--gd-blue)";
  const parts = item.sentence.split(/_{2,}/);
  return (
    <div>
      {item.sourceLabel && <p className="gd-label mb-2">{item.sourceLabel}</p>}
      <div className="gd-card px-4 py-4">
        <p className="gd-en gd-t-md">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <span className="gd-blank" style={{ color: fillColor }}>
                  {fill && fill.trim() !== "" ? fill : " "}
                </span>
              )}
            </span>
          ))}
        </p>
      </div>
      <p className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-2)" }}>
        빈칸에 들어갈 단어를 고르십시오.
      </p>
      <OptionList
        options={item.options}
        chosen={draft}
        correctValue={verdict ? verdict.lemma : null}
        locked={Boolean(verdict)}
        onPick={setDraft}
        en
      />
    </div>
  );
}

// ── SPELL — 뜻 → 철자 입력 ───────────────────────────────────────────────────

function SpellView({ item, draft, setDraft, verdict }: VocabItemViewProps) {
  if (item.type !== "SPELL") return null;
  const value = draft ?? "";
  const chars = [...value];
  const locked = Boolean(verdict);
  const boxBorder = (filled: boolean): string => {
    if (verdict) return verdict.correct ? "var(--gd-good)" : "var(--gd-bad)";
    return filled ? "var(--gd-blue)" : "var(--gd-line-strong)";
  };
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="gd-t-xl font-bold">{item.senseKo}</p>
        <PosPill pos={item.pos} />
      </div>
      <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
        {item.senseEn}
      </p>
      <p className="gd-t-xs mt-4" style={{ color: "var(--gd-ink-2)" }}>
        이 뜻에 해당하는 단어의 철자를 입력하십시오.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: Math.max(1, item.length) }, (_, i) => (
          <span
            key={i}
            className="gd-en gd-t-lg flex h-11 w-9 items-center justify-center rounded-lg border font-semibold"
            style={{ borderColor: boxBorder(Boolean(chars[i])), background: "var(--gd-card)" }}
          >
            {chars[i] ?? ""}
          </span>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => setDraft(e.target.value.toLowerCase())}
        disabled={locked}
        placeholder="철자 입력"
        maxLength={item.length}
        autoFocus
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        className="gd-en gd-t-lg mt-3 h-12 w-full rounded-xl border bg-white px-4 lowercase outline-none focus:border-[var(--gd-blue)]"
        style={{ borderColor: "var(--gd-line-strong)" }}
      />
      {verdict && !verdict.correct && (
        // 한 글자 차이(near-miss)를 눈으로 잡게 — 입력과 정답을 나란히 두고
        // 어긋난 자리만 강조한다. verdict 에는 nearMiss 가 없으므로(서버 내부값)
        // 표기는 전적으로 이 대조가 담당한다.
        <div className="mt-2.5 flex flex-col gap-1">
          <p className="gd-t-sm">
            <span style={{ color: "var(--gd-ink-2)" }}>입력 </span>
            <SpellDiff text={value} against={verdict.lemma} tone="var(--gd-bad)" />
          </p>
          <p className="gd-t-sm">
            <span style={{ color: "var(--gd-ink-2)" }}>정답 </span>
            <SpellDiff text={verdict.lemma} against={value} tone="var(--gd-good)" />
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 철자 대조 — 같은 자리의 글자가 다르면 강조한다.
 * 자리 대조(치환)만 정확히 짚는다. 글자가 빠지거나 남으면 그 뒤가 통째로
 * 강조되는데, 그래도 "여기서부터 어긋났다"는 신호로 읽힌다.
 */
function SpellDiff({
  text,
  against,
  tone,
}: {
  text: string;
  against: string;
  tone: string;
}) {
  const chars = [...text];
  const other = [...against];
  return (
    <strong className="gd-en" style={{ color: tone }}>
      {chars.map((ch, i) => {
        const same = other[i] !== undefined && other[i].toLowerCase() === ch.toLowerCase();
        return (
          <span
            key={i}
            style={
              same
                ? { opacity: 0.55 }
                : { textDecoration: "underline", textUnderlineOffset: "0.2em" }
            }
          >
            {ch}
          </span>
        );
      })}
    </strong>
  );
}

// ── EXAMPLE_MATCH — 예문 ↔ 뜻 짝짓기 (다의어) ────────────────────────────────

/**
 * senses[].key·examples[].exampleId 는 **큐 한정 불투명 라벨**이다(전역 senseId·
 * exampleId 가 아니다). 여기서는 문자열 열쇠로만 다루고, 실키 대응은 서버가
 * probe 안에서만 푼다. 직렬화 규약은 "예문라벨:뜻라벨,…" (grade.parseMatchAnswer).
 */
function parsePairs(draft: string | null): Map<string, string> {
  const pairs = new Map<string, string>();
  if (!draft) return pairs;
  for (const part of draft.split(",")) {
    if (!part) continue;
    // 서버 파서와 같게 첫 ":" 기준으로 자른다.
    const at = part.indexOf(":");
    if (at <= 0) continue;
    const exampleLabel = part.slice(0, at);
    const senseLabel = part.slice(at + 1);
    if (exampleLabel && senseLabel) pairs.set(exampleLabel, senseLabel);
  }
  return pairs;
}

function serializePairs(pairs: Map<string, string>): string {
  return [...pairs.entries()].map(([e, s]) => `${e}:${s}`).join(",");
}

function ExampleMatchView({ item, draft, setDraft, verdict }: VocabItemViewProps) {
  // 탭 순서 대기 상태(예문 먼저든 뜻 먼저든 짝이 되면 확정).
  const [pendingExample, setPendingExample] = useState<string | null>(null);
  const [pendingSense, setPendingSense] = useState<string | null>(null);
  if (item.type !== "EXAMPLE_MATCH") return null;

  const locked = Boolean(verdict);
  const pairs = parsePairs(draft);
  const resultByExample = new Map(
    (verdict?.pairResults ?? []).map((r) => [r.exampleId, r.correct]),
  );
  const exampleOfSense = (senseKey: string): string | undefined =>
    [...pairs.entries()].find(([, s]) => s === senseKey)?.[0];

  const commit = (exampleId: string, senseKey: string) => {
    const next = new Map(pairs);
    // 이 뜻이 이미 다른 예문에 붙어 있으면 그 연결부터 해제한다.
    for (const [e, s] of next) {
      if (s === senseKey) next.delete(e);
    }
    next.set(exampleId, senseKey);
    setDraft(serializePairs(next));
    setPendingExample(null);
    setPendingSense(null);
  };

  const unpair = (exampleId: string) => {
    const next = new Map(pairs);
    next.delete(exampleId);
    setDraft(serializePairs(next));
    setPendingExample(null);
    setPendingSense(null);
  };

  const tapExample = (exampleId: string) => {
    if (locked) return;
    if (pairs.has(exampleId)) {
      unpair(exampleId);
      return;
    }
    if (pendingSense) {
      commit(exampleId, pendingSense);
      return;
    }
    setPendingExample(pendingExample === exampleId ? null : exampleId);
  };

  const tapSense = (senseKey: string) => {
    if (locked) return;
    const paired = exampleOfSense(senseKey);
    if (paired) {
      unpair(paired);
      return;
    }
    if (pendingExample) {
      commit(pendingExample, senseKey);
      return;
    }
    setPendingSense(pendingSense === senseKey ? null : senseKey);
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="gd-en gd-t-2xl font-bold">{item.lemma}</p>
        <PosPill pos={item.pos} />
      </div>
      <p className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-2)" }}>
        예문과 뜻을 하나씩 탭해 짝을 지으십시오. 지은 짝을 다시 탭하면 해제됩니다.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {/* 좌: 예문 ①②③ */}
        <div className="flex flex-col gap-2">
          {item.examples.map((ex, i) => {
            let state: string | undefined;
            if (locked) {
              const r = resultByExample.get(ex.exampleId);
              state = r === true ? "correct" : r === false ? "wrong" : "dim";
            } else if (pairs.has(ex.exampleId) || pendingExample === ex.exampleId) {
              state = "selected";
            }
            return (
              <button
                key={ex.exampleId}
                type="button"
                className="gd-option"
                style={{ alignItems: "flex-start" }}
                data-state={state}
                disabled={locked}
                onClick={() => tapExample(ex.exampleId)}
              >
                <span
                  className="gd-t-sm shrink-0 font-semibold"
                  style={{ color: "var(--gd-ink-2)" }}
                >
                  {CIRCLED[i]}
                </span>
                <span className="gd-en gd-t-xs leading-relaxed">{ex.sentence}</span>
              </button>
            );
          })}
        </div>
        {/* 우: 뜻 — 연결되면 예문 번호 배지 표시 */}
        <div className="flex flex-col gap-2">
          {item.senses.map((s) => {
            const pairedExample = exampleOfSense(s.key);
            const pairedIdx = pairedExample
              ? item.examples.findIndex((e) => e.exampleId === pairedExample)
              : -1;
            let state: string | undefined;
            if (locked) {
              if (pairedExample) {
                state = resultByExample.get(pairedExample) ? "correct" : "wrong";
              } else {
                state = "dim";
              }
            } else if (pairedExample || pendingSense === s.key) {
              state = "selected";
            }
            return (
              <button
                key={s.key}
                type="button"
                className="gd-option"
                style={{ alignItems: "flex-start" }}
                data-state={state}
                disabled={locked}
                onClick={() => tapSense(s.key)}
              >
                {pairedIdx >= 0 && (
                  <span
                    className="gd-t-sm shrink-0 font-bold"
                    style={{ color: "var(--gd-blue)" }}
                  >
                    {CIRCLED[pairedIdx]}
                  </span>
                )}
                <span className="gd-t-xs leading-relaxed">{s.senseKo}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!locked && (
        <p className="gd-t-2xs mt-2.5 text-center" style={{ color: "var(--gd-ink-3)" }}>
          <span className="gd-mono">
            {pairs.size}/{item.examples.length}
          </span>{" "}
          짝 완성
          {pairs.size < item.examples.length
            ? ` · ${item.examples.length}짝을 모두 지어야 제출할 수 있습니다`
            : ""}
        </p>
      )}
    </div>
  );
}

// ── TRAP_JUDGE — 예문 속 뜻 주장 O/X ─────────────────────────────────────────

function TrapJudgeView({ item, draft, setDraft, verdict }: VocabItemViewProps) {
  if (item.type !== "TRAP_JUDGE") return null;
  // 정답 방향은 서버가 알려주지 않는다 — 학생 답의 정오로 역산한다.
  const rightAnswer =
    verdict && draft ? (verdict.correct ? draft : draft === "O" ? "X" : "O") : null;
  const stateOf = (v: "O" | "X"): string | undefined => {
    if (verdict && rightAnswer) {
      if (v === rightAnswer) return "correct";
      if (v === draft) return "wrong";
      return "dim";
    }
    return draft === v ? "selected" : undefined;
  };
  return (
    <div>
      {item.sourceLabel && <p className="gd-label mb-2">{item.sourceLabel}</p>}
      <div className="gd-card px-4 py-4">
        <p className="gd-en gd-t-md">{item.sentence}</p>
      </div>
      <div
        className="mt-3 rounded-xl border px-3.5 py-3"
        style={{ borderColor: "var(--gd-blue-line)", background: "var(--gd-blue-soft)" }}
      >
        <p className="gd-t-sm leading-relaxed">
          이 문장에서 <strong className="gd-en">{item.lemma}</strong> 은(는){" "}
          <strong>“{item.claimKo}”</strong> 라는 뜻입니다.
        </p>
      </div>
      <p className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-2)" }}>
        주장이 옳으면 O, 다른 뜻으로 쓰였으면 X를 고르십시오.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {(["O", "X"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className="gd-option justify-center"
            data-state={stateOf(v)}
            disabled={Boolean(verdict)}
            onClick={() => setDraft(v)}
          >
            <span className="gd-t-xl font-bold">{v}</span>
            <span className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
              {v === "O" ? "옳다" : "다른 뜻이다"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── FLASH — 학습 카드 (탭 뒤집기 + 자기평가) ─────────────────────────────────

function FlashView({ item, draft, setDraft, verdict, onFlashAnswer }: VocabItemViewProps) {
  const [flipped, setFlipped] = useState(false);
  if (item.type !== "FLASH") return null;
  const locked = Boolean(verdict);

  const answer = (v: "O" | "X") => {
    if (locked) return;
    setDraft(v);
    onFlashAnswer?.(v);
  };

  return (
    <div>
      {!flipped ? (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="gd-card flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 p-6"
        >
          <PosPill pos={item.pos} />
          <p className="gd-en gd-t-2xl font-bold">{item.lemma}</p>
          <p className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
            카드를 탭하면 뜻이 나타납니다
          </p>
        </button>
      ) : (
        <div className="gd-card gd-pop flex min-h-[16rem] w-full flex-col p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="gd-en gd-t-lg font-bold">{item.lemma}</p>
            <PosPill pos={item.pos} />
          </div>
          <p className="gd-t-lg mt-2 font-bold">{item.senseKo}</p>
          <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
            {item.senseEn}
          </p>
          {item.example && (
            <div className="gd-hairline-t mt-3 pt-3">
              <p className="gd-en gd-t-sm leading-relaxed">{item.example.en}</p>
              <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
                {item.example.ko}
              </p>
            </div>
          )}
          {item.collocations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.collocations.map((c) => (
                <span
                  key={c}
                  className="gd-en gd-t-2xs rounded-md border px-1.5 py-0.5"
                  style={{ borderColor: "var(--gd-line)", color: "var(--gd-ink-2)" }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {flipped && !locked && (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="gd-option justify-center"
            data-state={draft === "O" ? "selected" : undefined}
            onClick={() => answer("O")}
          >
            <span className="gd-t-md font-bold">알고 있었습니다</span>
          </button>
          <button
            type="button"
            className="gd-option justify-center"
            data-state={draft === "X" ? "selected" : undefined}
            onClick={() => answer("X")}
          >
            <span className="gd-t-md font-bold">몰랐습니다</span>
          </button>
        </div>
      )}
    </div>
  );
}
