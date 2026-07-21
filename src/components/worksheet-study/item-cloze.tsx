"use client";

// ============================================================================
// 학습지 스터디 모드 — 빈칸 복원 렌더러 (단어은행 칩 탭 채움)
//
// segments 를 인라인 플로우로 렌더하고, 하단 단어은행 칩을 탭해 활성 빈칸을
// 채운다. 같은 단어가 은행에 중복될 수 있어 칩은 인덱스로 상태를 관리한다.
// 계약: item-shared.tsx 의 ItemRendererProps. 규범: docs/worksheet-study-spec.md §8.3.
// ============================================================================

import { useState, type CSSProperties } from "react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import { gradeCloze } from "@/lib/worksheet-study/grade";
import {
  ConfirmButton,
  ExplanationBox,
  ItemInstruction,
  type ItemRendererProps,
} from "./item-shared";

type ClozeItem = Extract<StudyItem, { type: "cloze" }>;

/** 인라인 빈칸 버튼 공통 스타일 — .gd-blank 를 버튼화한 변형(스펙상 인라인 허용). */
const blankBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  verticalAlign: "middle",
  minWidth: "3.25rem",
  // 44px 터치 타깃 — 본문 줄간격(2.15)이 흡수하므로 문장 흐름은 유지된다
  minHeight: "2.75rem",
  margin: "0.125rem 0.1875rem",
  padding: "0 0.4375rem",
  borderRadius: "0.5rem",
  // border 축약형과 상태별 borderColor 를 섞으면 React 가 리렌더마다 스타일
  // 충돌 오류를 낸다 — 처음부터 분리 속성만 쓴다.
  borderWidth: "2px",
  borderStyle: "solid",
  borderColor: "transparent",
  fontFamily: "inherit",
  fontSize: "inherit",
  fontWeight: 700,
  lineHeight: 1.3,
};

export function ItemCloze({ item, judged, onJudge }: ItemRendererProps<ClozeItem>) {
  const slotCount = item.answerKey.length;
  /** 슬롯(answerKey 인덱스)별로 채워 넣은 은행 칩 인덱스 — null = 빈칸. */
  const [fills, setFills] = useState<(number | null)[]>(() =>
    new Array<number | null>(slotCount).fill(null),
  );
  /** 다음 칩이 들어갈 활성 슬롯 — 항상 빈 슬롯 또는 null(전부 채움). */
  const [active, setActive] = useState<number | null>(slotCount > 0 ? 0 : null);

  const filledWords = fills.map((ci) => (ci === null ? "" : item.bank[ci]));
  const allFilled = fills.every((ci) => ci !== null);
  const results = judged ? gradeCloze(filledWords, item.answerKey) : null;
  const correctCount = results ? results.filter(Boolean).length : 0;

  const nextEmpty = (arr: (number | null)[], from: number): number | null => {
    for (let step = 1; step <= arr.length; step++) {
      const idx = (from + step) % arr.length;
      if (arr[idx] === null) return idx;
    }
    return null;
  };

  const fillChip = (chipIdx: number) => {
    if (judged || active === null || fills.includes(chipIdx)) return;
    const next = fills.slice();
    next[active] = chipIdx;
    setFills(next);
    setActive(nextEmpty(next, active));
  };

  const tapBlank = (slot: number) => {
    if (judged) return;
    if (fills[slot] !== null) {
      const next = fills.slice();
      next[slot] = null;
      setFills(next);
    }
    setActive(slot);
  };

  const submit = () => {
    if (judged || !allFilled) return;
    const graded = gradeCloze(filledWords, item.answerKey);
    onJudge({ correct: graded.every(Boolean), response: filledWords.join(" / ") });
  };

  const cueText = item.cue
    ? item.cue.startsWith("단서:")
      ? item.cue
      : `우리말: ${item.cue}`
    : null;

  const renderBlank = (slot: number, key: number) => {
    const chipIdx = fills[slot];
    const word = chipIdx === null ? null : item.bank[chipIdx];
    const isActive = !judged && active === slot;

    const style: CSSProperties = { ...blankBase };
    if (results) {
      if (results[slot]) {
        style.borderColor = "var(--gd-good)";
        style.background = "var(--gd-good-soft)";
        style.color = "var(--gd-good)";
      } else {
        style.borderColor = "var(--gd-bad)";
        style.background = "var(--gd-bad-soft)";
      }
    } else if (isActive) {
      style.borderColor = "var(--gd-blue)";
      style.background = "var(--gd-blue-soft)";
      style.color = "var(--gd-blue)";
    } else if (word) {
      style.background = "var(--gd-blue-soft)";
      style.color = "var(--gd-blue)";
    } else {
      style.borderColor = "var(--gd-line-strong)";
      style.color = "var(--gd-ink-3)";
    }

    return (
      <button
        key={key}
        type="button"
        disabled={!!judged}
        onClick={() => tapBlank(slot)}
        aria-label={word ? `빈칸 ${slot + 1}: ${word}` : `빈칸 ${slot + 1}`}
        style={style}
      >
        {results ? (
          results[slot] ? (
            word
          ) : (
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.3125rem" }}>
              <s style={{ color: "var(--gd-bad)" }}>{word ?? "—"}</s>
              <span style={{ color: "var(--gd-good)", fontWeight: 700 }}>
                {item.answerKey[slot]}
              </span>
            </span>
          )
        ) : (
          (word ?? "____")
        )}
      </button>
    );
  };

  return (
    <div>
      <ItemInstruction>빈칸에 알맞은 단어를 채우세요</ItemInstruction>

      {cueText ? (
        <div className="gd-block mb-3" data-tone="accent" style={{ padding: "0.625rem 0.875rem" }}>
          <p className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
            {cueText}
          </p>
        </div>
      ) : null}

      <p className="gd-en gd-t-lg mb-4" style={{ color: "var(--gd-ink)", lineHeight: 2.15 }}>
        {item.segments.map((seg, si) =>
          "t" in seg ? <span key={si}>{seg.t}</span> : renderBlank(seg.blank, si),
        )}
      </p>

      <p className="gd-label mb-2">단어은행</p>
      <div className="flex flex-wrap gap-2">
        {item.bank.map((word, i) => {
          const used = fills.includes(i);
          return (
            <button
              key={i}
              type="button"
              className="gd-btn-chip gd-en"
              disabled={used || !!judged}
              onClick={() => fillChip(i)}
              style={{
                minHeight: "2.75rem",
                fontSize: "var(--gd-fs-base)",
                color: "var(--gd-ink)",
                opacity: used ? 0.35 : judged ? 0.55 : undefined,
              }}
            >
              {word}
            </button>
          );
        })}
      </div>

      {!judged ? <ConfirmButton disabled={!allFilled} onClick={submit} /> : null}

      {judged ? (
        <ExplanationBox
          tone={judged.correct ? "good" : "bad"}
          title={judged.correct ? "정답입니다!" : "아쉽습니다 — 정답을 확인해 보세요"}
        >
          <p>
            빈칸 {slotCount}개 중 <span className="font-bold">{correctCount}개</span>를 맞혔습니다.
          </p>
          {!judged.correct ? (
            <p className="mt-1" style={{ color: "var(--gd-ink-2)" }}>
              빨간 빈칸의 바른 답을 확인해 보세요.
            </p>
          ) : null}
        </ExplanationBox>
      ) : null}
    </div>
  );
}
