"use client";

// ============================================================================
// 학습지 스터디 모드 — 매칭 그리드 렌더러 (동의어·반의어, 청크↔뜻)
//
// 2열 그리드(.gd-match-card) — 한쪽 카드 탭 → 반대쪽 카드 탭 → 즉시 판정.
// 맞으면 matched 고정, 틀리면 두 카드 wrong(gd-shake) 240ms 후 해제 + 실수 1.
// 전 쌍 매칭 완료 시 자동으로 onJudge 1회(실수 0 = 정답) — 확인 버튼 없음.
// 계약: item-shared.tsx ItemRendererProps · docs/worksheet-study-spec.md §8.3.
// ============================================================================

import { useEffect, useState } from "react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import { ExplanationBox, ItemInstruction, type ItemRendererProps } from "./item-shared";

type MatchItem = Extract<StudyItem, { type: "match" }>;

/** 한글 포함 여부 — 영어 텍스트에만 .gd-en(세리프)을 입힌다. */
const hasHangul = (s: string) => /[가-힣]/.test(s);
const enClass = (s: string) => (hasHangul(s) ? undefined : "gd-en");

export function ItemMatch({ item, judged, onJudge }: ItemRendererProps<MatchItem>) {
  const [selLeft, setSelLeft] = useState<number | null>(null);
  const [selRight, setSelRight] = useState<number | null>(null);
  const [matchedLeft, setMatchedLeft] = useState<number[]>([]);
  const [wrong, setWrong] = useState<{ l: number; r: number } | null>(null);
  const [miss, setMiss] = useState(0);

  const total = item.left.length;
  const matchedRight = matchedLeft.map((i) => item.answer[i]);

  // 오답 흔들림 — 240ms 뒤 자동 해제(타이머 cleanup 필수)
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(null), 240);
    return () => clearTimeout(t);
  }, [wrong]);

  /** 좌 l ↔ 우 r 쌍 판정 — 순서 무관 공통 경로. */
  const resolve = (l: number, r: number) => {
    setSelLeft(null);
    setSelRight(null);
    if (item.answer[l] === r) {
      const next = [...matchedLeft, l];
      setMatchedLeft(next);
      if (next.length === total) {
        onJudge({ correct: miss === 0, response: `miss:${miss}` });
      }
    } else {
      setMiss((m) => m + 1);
      setWrong({ l, r });
    }
  };

  const tapLeft = (i: number) => {
    if (judged || wrong || matchedLeft.includes(i)) return;
    if (selRight !== null) resolve(i, selRight);
    else setSelLeft(selLeft === i ? null : i);
  };

  const tapRight = (r: number) => {
    if (judged || wrong || matchedRight.includes(r)) return;
    if (selLeft !== null) resolve(selLeft, r);
    else setSelRight(selRight === r ? null : r);
  };

  const leftState = (i: number): string | undefined => {
    if (judged) return "matched";
    if (matchedLeft.includes(i)) return "matched";
    if (wrong?.l === i) return "wrong";
    return selLeft === i ? "selected" : undefined;
  };

  const rightState = (r: number): string | undefined => {
    if (judged) return "matched";
    if (matchedRight.includes(r)) return "matched";
    if (wrong?.r === r) return "wrong";
    return selRight === r ? "selected" : undefined;
  };

  // 리마운트 대비 — 판정 확정 후에는 response("miss:N")를 정본으로 삼는다.
  const parsedMiss = judged?.response?.match(/^miss:(\d+)$/);
  const missShown = parsedMiss ? Number(parsedMiss[1]) : miss;

  return (
    <div>
      <ItemInstruction>짝이 되는 것끼리 연결하세요</ItemInstruction>

      <div className="grid grid-cols-2 gap-2">
        <p className="gd-label text-center">{item.leftHead}</p>
        <p className="gd-label text-center">{item.rightHead}</p>

        <div className="flex min-w-0 flex-col gap-2">
          {item.left.map((text, i) => (
            <button
              key={i}
              type="button"
              className="gd-match-card"
              data-state={leftState(i)}
              aria-pressed={selLeft === i}
              disabled={!!judged || matchedLeft.includes(i)}
              onClick={() => tapLeft(i)}
            >
              <span className={enClass(text)}>{text}</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {item.right.map((text, r) => (
            <button
              key={r}
              type="button"
              className="gd-match-card"
              data-state={rightState(r)}
              aria-pressed={selRight === r}
              disabled={!!judged || matchedRight.includes(r)}
              onClick={() => tapRight(r)}
            >
              <span className={enClass(text)}>{text}</span>
            </button>
          ))}
        </div>
      </div>

      {!judged ? (
        <p className="gd-mono gd-t-xs mt-2 text-right" style={{ color: "var(--gd-ink-3)" }}>
          짝 {matchedLeft.length}/{total}
          {miss > 0 ? <span style={{ color: "var(--gd-bad)" }}> · 실수 {miss}</span> : null}
        </p>
      ) : null}

      {judged ? (
        judged.correct ? (
          <ExplanationBox tone="good" title="정답입니다!">
            <p>한 번에 전부 연결했습니다!</p>
          </ExplanationBox>
        ) : (
          <ExplanationBox tone="bad" title={`아쉽습니다 — 실수 ${missShown}번이 있었습니다`}>
            <p>정답 짝을 다시 확인해 보세요.</p>
            <div className="mt-1.5 flex flex-col gap-1">
              {item.left.map((l, i) => (
                <p key={i} style={{ color: "var(--gd-ink-2)" }}>
                  <span className={enClass(l) ? "gd-en font-semibold" : "font-semibold"} style={{ color: "var(--gd-ink)" }}>
                    {l}
                  </span>
                  {" — "}
                  <span className={enClass(item.right[item.answer[i]])}>{item.right[item.answer[i]]}</span>
                </p>
              ))}
            </div>
          </ExplanationBox>
        )
      ) : null}
    </div>
  );
}
