"use client";

// ============================================================================
// 학습지 스터디 모드 — 어법 렌더러 (OX 판단 · [A/B] 인라인 택일)
//
// 견본 item-mc.tsx 의 상태 구조(선택 → 확인 → judged 인라인 피드백)·클래스
// 사용·톤을 그대로 따른다. 계약: item-shared.tsx 의 ItemRendererProps.
// 문구는 전부 합니다체. 규범: docs/worksheet-study-spec.md §8.3.
// ============================================================================

import { useState } from "react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import {
  ConfirmButton,
  ExplanationBox,
  ItemInstruction,
  type ItemRendererProps,
} from "./item-shared";

type OxItem = Extract<StudyItem, { type: "ox" }>;
type InlineChoiceItem = Extract<StudyItem, { type: "inline-choice" }>;

// ── OX — "이 문장이 어법상 맞는가" 판단 ─────────────────────────────────────

type OxPick = "O" | "X";

/**
 * statement 안에서 시선을 유도할 밑줄 구간.
 * wrong 문장은 fixFrom, 맞는 문장은 fixTo(교정 후 표현이 본문에 있는 경우)를
 * 똑같이 밑줄 처리한다 — 밑줄의 유무·색이 정답을 누설하지 않게 하기 위함.
 * 판정 전에는 기본 잉크색 밑줄만 쓴다(data-state 없음).
 */
function oxFocus(item: OxItem): string | null {
  if (item.wrong && item.fixFrom && item.statement.includes(item.fixFrom)) return item.fixFrom;
  if (!item.wrong && item.fixTo && item.statement.includes(item.fixTo)) return item.fixTo;
  return null;
}

function OxStatement({ item, judged }: { item: OxItem; judged: boolean }) {
  const focus = oxFocus(item);
  const idx = focus ? item.statement.indexOf(focus) : -1;
  if (!focus || idx < 0) {
    return (
      <p className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
        {item.statement}
      </p>
    );
  }
  return (
    <p className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
      {item.statement.slice(0, idx)}
      <span className="gd-u" data-state={judged ? (item.wrong ? "wrong" : "correct") : undefined}>
        {focus}
      </span>
      {item.statement.slice(idx + focus.length)}
    </p>
  );
}

export function ItemOx({ item, judged, onJudge }: ItemRendererProps<OxItem>) {
  const [pick, setPick] = useState<OxPick | null>(null);
  const answer: OxPick = item.wrong ? "X" : "O";

  const optionState = (p: OxPick): string | undefined => {
    if (!judged) return pick === p ? "selected" : undefined;
    if (p === answer) return "correct";
    if (p === pick) return "wrong";
    return "dim";
  };

  const submit = () => {
    if (!pick || judged) return;
    onJudge({ correct: pick === answer, response: pick });
  };

  return (
    <div>
      <ItemInstruction>이 문장이 어법상 맞는지 판단하세요</ItemInstruction>

      <div className="gd-block mb-4">
        <OxStatement item={item} judged={!!judged} />
      </div>

      <div className="flex gap-2" role="radiogroup" aria-label="O X 판단">
        {(["O", "X"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pick === p}
            className="gd-option flex-1 flex-col justify-center"
            style={{ minHeight: "4rem", gap: "0.125rem" }}
            data-state={optionState(p)}
            disabled={!!judged}
            onClick={() => setPick(p)}
          >
            <span className="gd-mono gd-t-xl font-bold">{p}</span>
            <span className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
              {p === "O" ? "맞습니다" : "틀립니다"}
            </span>
          </button>
        ))}
      </div>

      {!judged ? <ConfirmButton disabled={!pick} onClick={submit} /> : null}

      {judged ? (
        <ExplanationBox
          tone={judged.correct ? "good" : "bad"}
          title={judged.correct ? "정답입니다!" : "아쉽습니다 — 정답을 확인해 보세요"}
        >
          <p>
            정답 <span className="font-bold">{answer}</span> —{" "}
            {item.wrong ? "어법상 틀린 문장입니다." : "어법상 맞는 문장입니다."}
          </p>
          {item.wrong && item.fixFrom && item.fixTo ? (
            <p className="mt-1.5">
              <span
                className="gd-en"
                style={{ color: "var(--gd-bad)", textDecorationLine: "line-through" }}
              >
                {item.fixFrom}
              </span>
              <span className="mx-1.5" style={{ color: "var(--gd-ink-3)" }} aria-hidden>
                →
              </span>
              <span className="gd-en font-bold" style={{ color: "var(--gd-good)" }}>
                {item.fixTo}
              </span>
            </p>
          ) : null}
          {item.explanation ? (
            <p className="mt-1" style={{ color: "var(--gd-ink-2)" }}>
              {item.explanation}
            </p>
          ) : null}
        </ExplanationBox>
      ) : null}
    </div>
  );
}

// ── [A/B] 인라인 택일 ───────────────────────────────────────────────────────

export function ItemInlineChoice({
  item,
  judged,
  onJudge,
}: ItemRendererProps<InlineChoiceItem>) {
  const [selected, setSelected] = useState<string | null>(null);
  const hasAfter = item.after.trim().length > 0;

  const optionState = (opt: string): string | undefined => {
    if (!judged) return selected === opt ? "selected" : undefined;
    if (opt === item.answer) return "correct";
    if (opt === selected) return "wrong";
    return "dim";
  };

  const submit = () => {
    if (!selected || judged) return;
    onJudge({ correct: selected === item.answer, response: selected });
  };

  return (
    <div>
      <ItemInstruction>어법상 알맞은 표현을 고르세요</ItemInstruction>

      <div className="gd-block mb-4">
        <p className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
          {item.before}
          {hasAfter ? (
            <>
              {" "}
              <span
                className="gd-blank"
                style={judged ? { color: "var(--gd-good)" } : undefined}
              >
                {judged ? item.answer : "\u00A0"}
              </span>{" "}
              {item.after}
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="보기">
        {item.options.map((opt, i) => (
          <button
            key={`${i}-${opt}`}
            type="button"
            role="radio"
            aria-checked={selected === opt}
            className="gd-option"
            data-state={optionState(opt)}
            disabled={!!judged}
            onClick={() => setSelected(opt)}
          >
            <span className="gd-en gd-t-sm min-w-0 flex-1">{opt}</span>
          </button>
        ))}
      </div>

      {!judged ? <ConfirmButton disabled={!selected} onClick={submit} /> : null}

      {judged ? (
        <ExplanationBox
          tone={judged.correct ? "good" : "bad"}
          title={judged.correct ? "정답입니다!" : "아쉽습니다 — 정답을 확인해 보세요"}
        >
          <p>
            정답 <span className="gd-en font-bold">{item.answer}</span>
          </p>
          {item.explanation ? (
            <p className="mt-1" style={{ color: "var(--gd-ink-2)" }}>
              {item.explanation}
            </p>
          ) : null}
        </ExplanationBox>
      ) : null}
    </div>
  );
}
