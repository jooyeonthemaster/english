"use client";

// ============================================================================
// 학습지 스터디 모드 — 어순 배열(타일 탭) + 문장 순서 배열(카드 탭) 렌더러
//
// order: 섞인 조각 타일을 순서대로 탭해 문장을 완성한다. 같은 텍스트의 타일이
// 중복될 수 있으므로 상태는 텍스트가 아니라 타일 인덱스로 관리한다.
// sentence-order: 문단 카드(A/B/C)를 글의 흐름 순서로 탭해 시퀀스를 만든다.
// 전부 탭 기반(드래그 금지). 계약: item-shared.tsx 의 ItemRendererProps.
// 문구는 전부 합니다체. 규범: docs/worksheet-study-spec.md §8.3.
// ============================================================================

import { Fragment, useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { gradeOrder } from "@/lib/worksheet-study/grade";
import type { StudyItem } from "@/lib/worksheet-study/types";
import {
  ConfirmButton,
  ExplanationBox,
  ItemInstruction,
  type ItemRendererProps,
} from "./item-shared";

type OrderItem = Extract<StudyItem, { type: "order" }>;
type SentenceOrderItem = Extract<StudyItem, { type: "sentence-order" }>;

/** 답안 영역 공통 스타일 — 점선 보더 빈 트레이 (신규 클래스 금지 → 인라인). */
const trayStyle: CSSProperties = {
  border: "1.5px dashed var(--gd-line-strong)",
  minHeight: "3.5rem",
};

// ── (1) 어순 배열 — 타일 탭 ─────────────────────────────────────────────────

export function ItemOrder({ item, judged, onJudge }: ItemRendererProps<OrderItem>) {
  /** 배치한 타일의 인덱스 나열 — 중복 텍스트 타일 대비, 인덱스로만 관리 */
  const [picked, setPicked] = useState<number[]>([]);

  const used = new Set(picked);
  const allPlaced = picked.length === item.tiles.length;
  const chipState = judged ? (judged.correct ? "correct" : "wrong") : undefined;

  const place = (idx: number) => {
    if (judged || used.has(idx)) return;
    setPicked((prev) => [...prev, idx]);
  };

  const recall = (pos: number) => {
    if (judged) return;
    setPicked((prev) => prev.filter((_, i) => i !== pos));
  };

  const submit = () => {
    if (!allPlaced || judged) return;
    const words = picked.map((i) => item.tiles[i]);
    onJudge({ correct: gradeOrder(words, item.answer), response: words.join(" ") });
  };

  return (
    <div>
      <ItemInstruction>조각을 순서대로 탭해 문장을 완성하세요</ItemInstruction>

      {item.ko ? (
        <div className="gd-block mb-3" data-tone="accent">
          <p className="gd-t-sm font-medium" style={{ color: "var(--gd-ink)" }}>
            우리말: {item.ko}
          </p>
        </div>
      ) : null}

      {/* 답안 영역 — 선택한 타일을 순서대로 칩 나열, 칩 탭 = 회수 */}
      <div
        className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2"
        style={trayStyle}
        role="group"
        aria-label="내 답안"
      >
        {picked.length === 0 ? (
          <p className="gd-t-xs w-full text-center" style={{ color: "var(--gd-ink-3)" }}>
            아래 조각을 순서대로 탭하세요
          </p>
        ) : (
          picked.map((tileIdx, pos) => (
            <button
              key={`${pos}:${tileIdx}`}
              type="button"
              className="gd-btn-chip gd-en"
              data-active={judged ? undefined : "true"}
              data-state={chipState}
              style={{ minHeight: "2.75rem" }}
              disabled={!!judged}
              onClick={() => recall(pos)}
              aria-label={`${item.tiles[tileIdx]} 되돌리기`}
            >
              {item.tiles[tileIdx]}
            </button>
          ))
        )}
      </div>

      {/* 타일 풀 — 사용된 타일은 반투명·비활성 */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="조각 타일">
        {item.tiles.map((tile, idx) => (
          <button
            key={idx}
            type="button"
            className="gd-tile"
            data-used={used.has(idx) ? "true" : undefined}
            disabled={used.has(idx) || !!judged}
            onClick={() => place(idx)}
          >
            {tile}
          </button>
        ))}
      </div>

      {!judged ? <ConfirmButton disabled={!allPlaced} onClick={submit} /> : null}

      {judged ? (
        <ExplanationBox
          tone={judged.correct ? "good" : "bad"}
          title={judged.correct ? "정답입니다!" : "아쉽습니다 — 정답 문장을 확인해 보세요"}
        >
          <p className="gd-en">{item.answer}</p>
        </ExplanationBox>
      ) : null}
    </div>
  );
}

// ── (2) 문장 순서 배열 — 카드 탭 ────────────────────────────────────────────

/** 라벨 시퀀스 비교용 정규화 — 공백 전부 제거 + 대문자화 ("B - A - C" ↔ "B-A-C") */
const normalizeSeq = (s: string): string => s.replace(/\s+/g, "").toUpperCase();

export function ItemSentenceOrder({
  item,
  judged,
  onJudge,
}: ItemRendererProps<SentenceOrderItem>) {
  /** 선택한 카드의 인덱스 시퀀스 */
  const [seq, setSeq] = useState<number[]>([]);

  const chosen = new Set(seq);
  const allChosen = seq.length === item.cards.length;
  const chipState = judged ? (judged.correct ? "correct" : "wrong") : undefined;

  /** 정답 라벨 시퀀스 — "B - A - C" → ["B","A","C"] (해설 렌더용) */
  const answerLabels = item.answer
    .split("-")
    .map((s) => s.trim())
    .filter(Boolean);

  const choose = (idx: number) => {
    if (judged || chosen.has(idx)) return;
    setSeq((prev) => [...prev, idx]);
  };

  const recall = (pos: number) => {
    if (judged) return;
    setSeq((prev) => prev.filter((_, i) => i !== pos));
  };

  const submit = () => {
    if (!allChosen || judged) return;
    const response = seq.map((i) => item.cards[i].label).join(" - ");
    onJudge({ correct: normalizeSeq(response) === normalizeSeq(item.answer), response });
  };

  const cardState = (idx: number): string | undefined => {
    if (judged) return "dim";
    return chosen.has(idx) ? "dim" : undefined;
  };

  return (
    <div>
      <ItemInstruction>글의 흐름에 맞는 순서로 카드를 탭하세요</ItemInstruction>

      {item.given ? (
        <div className="gd-block mb-3">
          <p className="gd-label mb-1.5">주어진 글</p>
          <p className="gd-en gd-t-sm" style={{ color: "var(--gd-ink)" }}>
            {item.given.en}
          </p>
          {item.given.ko ? (
            <p className="gd-t-xs mt-1.5" style={{ color: "var(--gd-ink-2)" }}>
              {item.given.ko}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 시퀀스 칩 행 — 카드 위에 표시, 칩 탭 = 해당 카드 회수 */}
      <div
        className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2"
        style={trayStyle}
        role="group"
        aria-label="내가 고른 순서"
      >
        {seq.length === 0 ? (
          <p className="gd-t-xs w-full text-center" style={{ color: "var(--gd-ink-3)" }}>
            아래 카드를 순서대로 탭하세요
          </p>
        ) : (
          seq.map((cardIdx, pos) => (
            <Fragment key={`${pos}:${cardIdx}`}>
              {pos > 0 ? (
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.75}
                  style={{ color: "var(--gd-ink-3)" }}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                className="gd-btn-chip gd-mono"
                data-active={judged ? undefined : "true"}
                data-state={chipState}
                style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
                disabled={!!judged}
                onClick={() => recall(pos)}
                aria-label={`${item.cards[cardIdx].label} 되돌리기`}
              >
                {item.cards[cardIdx].label}
              </button>
            </Fragment>
          ))
        )}
      </div>

      {/* 카드 리스트 — 선택된 카드는 dim·비활성 */}
      <div className="flex flex-col gap-2" role="group" aria-label="문단 카드">
        {item.cards.map((card, idx) => (
          <button
            key={`${card.label}:${idx}`}
            type="button"
            className="gd-option"
            data-state={cardState(idx)}
            disabled={chosen.has(idx) || !!judged}
            onClick={() => choose(idx)}
          >
            <span className="gd-mono gd-t-xs shrink-0 font-bold" style={{ color: "var(--gd-ink-3)" }}>
              {card.label}
            </span>
            <span className="gd-en gd-t-sm min-w-0 flex-1">{card.en}</span>
          </button>
        ))}
      </div>

      {!judged ? <ConfirmButton disabled={!allChosen} onClick={submit} /> : null}

      {judged ? (
        judged.correct ? (
          <ExplanationBox tone="good" title="정답입니다!">
            <p className="gd-mono font-bold">{answerLabels.join(" → ")}</p>
          </ExplanationBox>
        ) : (
          <ExplanationBox tone="bad" title="아쉽습니다 — 정답 순서를 확인해 보세요">
            <p className="gd-mono font-bold">{answerLabels.join(" → ")}</p>
            <div className="mt-2 flex flex-col gap-2">
              {answerLabels.map((label, i) => {
                const card = item.cards.find(
                  (c) => c.label.toUpperCase() === label.toUpperCase(),
                );
                if (!card) return null;
                return (
                  <div key={`${label}:${i}`} className="flex items-baseline gap-2">
                    <span
                      className="gd-mono gd-t-xs shrink-0 font-bold"
                      style={{ color: "var(--gd-ink-3)" }}
                    >
                      {label}
                    </span>
                    <p className="gd-en gd-t-sm min-w-0 flex-1">{card.en}</p>
                  </div>
                );
              })}
            </div>
          </ExplanationBox>
        )
      ) : null}
    </div>
  );
}
