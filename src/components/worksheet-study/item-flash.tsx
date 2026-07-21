"use client";

// ============================================================================
// 학습지 스터디 모드 — 어휘 플래시카드 렌더러
//
// 계약: item-shared.tsx 의 ItemRendererProps. 무채점(graded=false) 아이템 —
// onJudge 를 호출하지 않으며 "다음"은 셸이 제공한다. 탭하면 3D 플립으로
// 뒷면(뜻·동의어·반의어)을 보여준다. reduced-motion 환경에서는 즉시 전환.
// 스타일: 기존 gd-* 클래스 + 이 컴포넌트 전용 ws-flash-* (인라인 <style>).
// 규범: docs/worksheet-study-spec.md §8.3 · §13.
// ============================================================================

import { useState } from "react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import type { ItemRendererProps } from "./item-shared";

type FlashItem = Extract<StudyItem, { type: "flash" }>;

const FLASH_CSS = `
.ws-flash-scene {
  display: block;
  width: 100%;
  perspective: 62.5rem;
  -webkit-tap-highlight-color: transparent;
}
.ws-flash-scene:focus-visible {
  outline: 2px solid var(--gd-blue);
  outline-offset: 2px;
  border-radius: 1rem;
}
.ws-flash-card {
  display: grid;
  width: 100%;
  transform-style: preserve-3d;
  transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ws-flash-card[data-flipped="true"] { transform: rotateY(180deg); }
.ws-flash-face {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  min-height: 16rem;
  padding: 1.5rem 1.25rem 1.125rem;
  text-align: center;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.ws-flash-face-back { transform: rotateY(180deg); }
@media (min-width: 768px) {
  .ws-flash-scene { max-width: 32rem; margin-left: auto; margin-right: auto; }
  .ws-flash-face { min-height: 18rem; }
}
@media (prefers-reduced-motion: reduce) {
  .ws-flash-card { transition: none; }
}
`;

export function ItemFlash({ item }: ItemRendererProps<FlashItem>) {
  const [flipped, setFlipped] = useState(false);
  const synonyms = item.extra?.synonyms;
  const antonyms = item.extra?.antonyms;

  return (
    <div>
      <style>{FLASH_CSS}</style>

      <button
        type="button"
        className="ws-flash-scene"
        aria-pressed={flipped}
        onClick={() => setFlipped((v) => !v)}
      >
        <span className="ws-flash-card" data-flipped={flipped ? "true" : "false"}>
          {/* 앞면 — 표제어 + 보조 표기(발음·tier) */}
          <span className="ws-flash-face gd-card" aria-hidden={flipped}>
            <span className="flex flex-1 items-center justify-center">
              <span className="gd-en gd-t-2xl font-semibold" style={{ color: "var(--gd-ink)" }}>
                {item.front}
              </span>
            </span>
            {item.sub ? (
              <span className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-3)" }}>
                {item.sub}
              </span>
            ) : null}
          </span>

          {/* 뒷면 — 뜻 + 동의어·반의어 */}
          <span className="ws-flash-face ws-flash-face-back gd-card" aria-hidden={!flipped}>
            <span className="flex flex-1 flex-col items-center justify-center gap-3">
              <span className="gd-t-xl font-semibold" style={{ color: "var(--gd-ink)" }}>
                {item.back}
              </span>
              {synonyms || antonyms ? (
                <span className="flex flex-col gap-1">
                  {synonyms ? (
                    <span className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
                      동의어: {synonyms}
                    </span>
                  ) : null}
                  {antonyms ? (
                    <span className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
                      반의어: {antonyms}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </button>

      <p className="gd-t-2xs mt-2 text-center" style={{ color: "var(--gd-ink-3)" }}>
        카드를 탭하면 뒷면을 볼 수 있습니다
      </p>
    </div>
  );
}
