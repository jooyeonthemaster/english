"use client";

// ============================================================================
// 인터랙티브 레슨 — 조작 블록 렌더러
// SORT(분류) · GENERATE(어절 타일) · ERROR_HUNT(오류 사냥) ·
// SELF_EXPLAIN(자기설명) · TRANSFER(지문 전이) · NOTE(내 필기)
//
// 드래그를 쓰지 않는다 — 전부 탭이다(모바일 신뢰성, docs/study-os-spec.md §3.2).
// ============================================================================

import { useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { MarkupText, type UnderlineState } from "@/components/grammar-drill/markup-text";
import { BlockShell } from "./lesson-blocks";
import type {
  ErrorHuntBlock,
  GenerateBlock,
  NoteBlock,
  SelfExplainBlock,
  SortBlock,
  TransferBlock,
} from "@/lib/study-os/lesson-types";

// ── SORT — 칩을 바구니로 (탭) ──────────────────────────────────────────────

export function SortView({ block }: { block: SortBlock }) {
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [active, setActive] = useState<number | null>(null);
  const allDone = Object.keys(placed).length === block.chips.length;

  return (
    <BlockShell type="SORT" title={block.title}>
      <p className="gd-prose font-semibold">{block.instruction}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {block.chips.map((chip, i) => {
          const done = placed[i] !== undefined;
          const correct = done && placed[i] === chip.bucketId;
          return (
            <button
              key={i}
              type="button"
              className="gd-tile"
              data-used={done ? "true" : undefined}
              data-state={done ? (correct ? "correct" : "wrong") : undefined}
              style={
                done
                  ? {
                      borderColor: correct ? "var(--gd-good)" : "var(--gd-bad)",
                      background: correct ? "var(--gd-good-soft)" : "var(--gd-bad-soft)",
                      opacity: 1,
                    }
                  : active === i
                    ? { borderColor: "var(--gd-blue)", background: "var(--gd-blue-soft)" }
                    : undefined
              }
              onClick={() => !done && setActive(active === i ? null : i)}
            >
              {chip.text}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {block.buckets.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={active === null}
            className="gd-option flex-col items-start"
            style={{ opacity: active === null ? 0.55 : 1, minHeight: "3.5rem" }}
            onClick={() => {
              if (active === null) return;
              setPlaced((p) => ({ ...p, [active]: b.id }));
              setActive(null);
            }}
          >
            <span className="gd-t-xs font-bold">{b.label}</span>
            <span className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
              {Object.entries(placed).filter(([, v]) => v === b.id).length}개
            </span>
          </button>
        ))}
      </div>
      {active === null && !allDone && (
        <p className="gd-t-xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
          먼저 위에서 표현을 하나 고른 뒤, 아래 바구니를 누르십시오.
        </p>
      )}

      {allDone && (
        <div className="gd-pop mt-3 flex flex-col gap-1.5">
          {block.chips.map((chip, i) => (
            <p key={i} className="gd-t-xs flex gap-1.5 leading-relaxed">
              {placed[i] === chip.bucketId ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-good)" }} strokeWidth={2.5} />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-bad)" }} strokeWidth={2.5} />
              )}
              <span>
                <strong className="gd-en">{chip.text}</strong> — {chip.why}
              </span>
            </p>
          ))}
        </div>
      )}
    </BlockShell>
  );
}

// ── GENERATE — 어절 타일 배열 ──────────────────────────────────────────────

export function GenerateView({ block }: { block: GenerateBlock }) {
  const [order, setOrder] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  // 셔플은 렌더 시 1회 — 재렌더로 순서가 흔들리면 학생이 혼란스럽다.
  const shuffled = useMemo(() => {
    const idx = block.tiles.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = (i * 7 + block.id.length * 3) % (i + 1); // 결정론 셔플(SSR 하이드레이션 안전)
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [block.tiles, block.id]);

  const built = order.map((i) => block.tiles[i]);
  const correct = checked && built.join(" ") === block.answer.join(" ");

  return (
    <BlockShell type="GENERATE" title={block.title}>
      <p className="gd-prose font-semibold">{block.instruction}</p>
      <p className="gd-prose-2 mt-1">{block.ko}</p>

      <div
        className="mt-3 flex min-h-[3.25rem] flex-wrap items-center gap-1.5 rounded-xl p-2"
        style={{
          background: "var(--gd-paper)",
          border: `1.5px ${built.length ? "solid" : "dashed"} ${
            checked ? (correct ? "var(--gd-good)" : "var(--gd-bad)") : "var(--gd-line-strong)"
          }`,
        }}
      >
        {built.length === 0 && (
          <span className="gd-t-xs px-1" style={{ color: "var(--gd-ink-3)" }}>
            아래 타일을 순서대로 누르십시오.
          </span>
        )}
        {built.map((t, i) => (
          <button
            key={i}
            type="button"
            className="gd-en gd-t-base rounded-lg px-2 py-1 font-medium"
            style={{ background: "var(--gd-card)", border: "1px solid var(--gd-line)" }}
            disabled={checked}
            onClick={() => setOrder((o) => o.filter((_, j) => j !== i))}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {shuffled.map((i) => (
          <button
            key={i}
            type="button"
            className="gd-tile"
            data-used={order.includes(i) ? "true" : undefined}
            disabled={order.includes(i) || checked}
            onClick={() => setOrder((o) => [...o, i])}
          >
            {block.tiles[i]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="gd-btn-chip"
          onClick={() => {
            setOrder([]);
            setChecked(false);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          다시
        </button>
        <button
          type="button"
          className="gd-btn gd-btn-primary flex-1"
          disabled={order.length === 0 || checked}
          onClick={() => setChecked(true)}
        >
          확인
        </button>
      </div>

      {checked && (
        <div className="gd-pop mt-2.5">
          <p
            className="gd-prose font-semibold"
            style={{ color: correct ? "var(--gd-good)" : "var(--gd-bad)" }}
          >
            {correct ? "정확합니다." : "다시 보십시오."}
          </p>
          {!correct && (
            <p className="gd-en gd-prose mt-1">정답 · {block.answer.join(" ")}</p>
          )}
          <p className="gd-prose-2 mt-1">{block.explanation}</p>
        </div>
      )}
    </BlockShell>
  );
}

// ── ERROR_HUNT — 오류 사냥 ─────────────────────────────────────────────────

export function ErrorHuntView({ block }: { block: ErrorHuntBlock }) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  const correct = picked === block.answer;

  const stateFor = (n: number | null): UnderlineState => {
    if (!done || n === null) return "idle";
    if (n === block.answer) return "correct";
    if (n === picked) return "wrong";
    return "idle";
  };

  return (
    <BlockShell type="ERROR_HUNT" tone={done ? undefined : "warn"} title={block.title}>
      <p className="gd-prose font-semibold">{block.instruction}</p>
      <p className="gd-en gd-prose mt-2.5 leading-loose">
        <MarkupText
          text={block.text}
          underlineStateFor={stateFor}
          onUnderlinePress={(n) => !done && setPicked(n)}
        />
      </p>
      <p className="gd-prose-2 mt-2">{block.ko}</p>

      {done && (
        <div className="gd-pop mt-3">
          <p
            className="gd-prose font-bold"
            style={{ color: correct ? "var(--gd-good)" : "var(--gd-bad)" }}
          >
            {correct
              ? `정확합니다 — ${block.answer}번이 틀렸습니다.`
              : `아닙니다 — 틀린 곳은 ${block.answer}번입니다.`}
          </p>
          <p className="gd-en gd-prose mt-1">바른 형태 · {block.correction}</p>
          <div className="gd-hairline-t mt-2.5 flex flex-col gap-1.5 pt-2.5">
            {block.rationales.map((r, i) => (
              <p key={i} className="gd-t-xs leading-relaxed">
                <strong
                  className="gd-mono mr-1"
                  style={{ color: i + 1 === block.answer ? "var(--gd-bad)" : "var(--gd-ink-3)" }}
                >
                  {["①", "②", "③", "④", "⑤"][i]}
                </strong>
                {r}
              </p>
            ))}
          </div>
        </div>
      )}
    </BlockShell>
  );
}

// ── SELF_EXPLAIN — 이유 말하기 ─────────────────────────────────────────────

export function SelfExplainView({ block }: { block: SelfExplainBlock }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <BlockShell type="SELF_EXPLAIN" title={block.title}>
      <p className="gd-prose font-semibold">{block.question}</p>
      <div className="mt-2.5 flex flex-col gap-2">
        {block.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className="gd-option"
            data-state={
              picked === null
                ? undefined
                : o.correct
                  ? "correct"
                  : i === picked
                    ? "wrong"
                    : "dim"
            }
            disabled={picked !== null}
            onClick={() => setPicked(i)}
          >
            <span className="gd-t-base flex-1 text-left leading-relaxed">{o.text}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <p className="gd-prose-2 gd-pop mt-2.5 rounded-xl p-3" style={{ background: "var(--gd-blue-soft)" }}>
          {block.options[picked].feedback}
        </p>
      )}
    </BlockShell>
  );
}

// ── TRANSFER — 지문 속에서 찾기 ────────────────────────────────────────────

export function TransferView({ block }: { block: TransferBlock }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <BlockShell type="TRANSFER" title={block.title}>
      <p className="gd-prose font-semibold">{block.instruction}</p>
      <div className="mt-2.5 rounded-xl p-3" style={{ background: "var(--gd-paper)" }}>
        <p className="gd-en gd-prose leading-loose">
          <MarkupText
            text={block.passage}
            underlineStateFor={() => (revealed ? "correct" : "idle")}
            numbered={false}
          />
        </p>
      </div>
      {!revealed ? (
        <button
          type="button"
          className="gd-btn gd-btn-ghost mt-3 w-full"
          onClick={() => setRevealed(true)}
        >
          내 판단과 맞춰 보기
        </button>
      ) : (
        <div className="gd-pop mt-3">
          <p className="gd-prose-2">{block.found}</p>
          <p className="gd-t-xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
            지문 요지 · {block.gist}
          </p>
        </div>
      )}
    </BlockShell>
  );
}

// ── NOTE — 내 필기(교사가 본다) ────────────────────────────────────────────

export function NoteView({
  block,
  value,
  onChange,
}: {
  block: NoteBlock;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <BlockShell type="NOTE" title={block.title}>
      <p className="gd-prose font-semibold">{block.prompt}</p>
      {block.scaffold && (
        <p className="gd-t-xs mt-1.5 rounded-lg p-2" style={{ background: "var(--gd-paper)", color: "var(--gd-ink-2)" }}>
          {block.scaffold}
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        rows={4}
        placeholder="내 말로 적어 봅니다"
        className="gd-prose mt-2.5 w-full rounded-xl border p-3 outline-none"
        style={{
          borderColor: "var(--gd-line-strong)",
          background: "var(--gd-card)",
          color: "var(--gd-ink)",
        }}
      />
      <p className="gd-t-2xs mt-1 text-right" style={{ color: "var(--gd-ink-3)" }}>
        {value.length}/500 · 저장되며 선생님이 확인합니다
      </p>
    </BlockShell>
  );
}
