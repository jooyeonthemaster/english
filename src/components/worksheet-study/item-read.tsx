"use client";

// ============================================================================
// 학습지 스터디 모드 — 지문 통독 카드 렌더러 (무채점)
//
// 문장 1개 = 카드 1장. en(세리프)을 크게 보여주고 "해석 보기"·"직독직해 보기"
// 토글로 ko·청크 리스트를 펼친다. n === 0 은 글의 핵심(ONE-LINE THESIS) 인트로.
// 판정 없음 — onJudge 를 호출하지 않으며 "다음" 버튼은 셸이 제공한다.
// 토글 상태는 아이템별 로컬 state (셸의 key 리마운트로 자동 리셋).
// 계약: item-shared.tsx 의 ItemRendererProps. 규범: docs/worksheet-study-spec.md §8.3.
// ============================================================================

import { useState } from "react";
import { AlignLeft, Languages } from "lucide-react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import { ItemInstruction, type ItemRendererProps } from "./item-shared";

type ReadItem = Extract<StudyItem, { type: "read" }>;

/** 문장 라벨 — ①~⑳ 원문자(U+2460~), 21 이상은 숫자 그대로 */
function sentenceLabel(n: number): string {
  if (n >= 1 && n <= 20) return `문장 ${String.fromCodePoint(0x2460 + n - 1)}`;
  return `문장 ${n}`;
}

export function ItemRead({ item }: ItemRendererProps<ReadItem>) {
  const [showKo, setShowKo] = useState(false);
  const [showChunks, setShowChunks] = useState(false);

  // 인트로 카드(n=0) — 글의 핵심 한 줄 + 요약. 토글 없이 전부 노출한다.
  if (item.n === 0) {
    return (
      <div>
        <ItemInstruction>글의 핵심 한 줄</ItemInstruction>
        <p className="gd-en gd-t-xl font-medium" style={{ color: "var(--gd-ink)" }}>
          {item.en}
        </p>
        <p className="gd-prose-2 mt-3">{item.ko}</p>
      </div>
    );
  }

  const chunks = item.chunks ?? [];
  const hasChunks = chunks.length > 0;

  return (
    <div>
      <ItemInstruction>{sentenceLabel(item.n)}</ItemInstruction>
      <p className="gd-en gd-t-lg font-medium" style={{ color: "var(--gd-ink)" }}>
        {item.en}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="gd-btn-chip"
          style={{ minHeight: "2.75rem" }}
          data-active={showKo || undefined}
          aria-expanded={showKo}
          onClick={() => setShowKo((v) => !v)}
        >
          <Languages className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          {showKo ? "해석 접기" : "해석 보기"}
        </button>
        {hasChunks ? (
          <button
            type="button"
            className="gd-btn-chip"
            style={{ minHeight: "2.75rem" }}
            data-active={showChunks || undefined}
            aria-expanded={showChunks}
            onClick={() => setShowChunks((v) => !v)}
          >
            <AlignLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {showChunks ? "직독직해 접기" : "직독직해 보기"}
          </button>
        ) : null}
      </div>

      {showKo ? <p className="gd-prose-2 mt-3">{item.ko}</p> : null}

      {hasChunks && showChunks ? (
        <ul className="mt-3 flex flex-col gap-2.5" aria-label="직독직해">
          {chunks.map((c, i) => (
            <li
              key={i}
              className="flex flex-col gap-0.5 py-0.5 pl-3"
              style={{ borderLeft: "2px solid var(--gd-line-strong)" }}
            >
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
                  {c.text}
                </span>
                {c.role ? <span className="gd-block-head">{c.role}</span> : null}
              </span>
              {c.gloss ? (
                <span className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
                  {c.gloss}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
