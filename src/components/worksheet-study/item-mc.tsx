"use client";

// ============================================================================
// 학습지 스터디 모드 — 4지선다 공용 렌더러 (어휘 퀴즈·학습 점검·수능추론)
//
// ★ 이 파일이 아이템 렌더러의 품질 기준선(견본)이다. 다른 렌더러는 이 파일의
// 상태 구조(선택 → 확인 → judged 인라인 피드백)·클래스 사용·톤을 따른다.
// 계약: item-shared.tsx 의 ItemRendererProps. 문구는 전부 합니다체.
// ============================================================================

import { useState } from "react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import {
  ConfirmButton,
  ExplanationBox,
  ItemInstruction,
  PassageCollapse,
  type ItemRendererProps,
} from "./item-shared";

type McItem = Extract<StudyItem, { type: "mc" }>;

export function ItemMc({ item, judged, onJudge }: ItemRendererProps<McItem>) {
  const [selected, setSelected] = useState<string | null>(null);

  const optionState = (label: string): string | undefined => {
    if (!judged) return selected === label ? "selected" : undefined;
    if (label === item.answerLabel) return "correct";
    if (label === selected) return "wrong";
    return "dim";
  };

  const submit = () => {
    if (!selected || judged) return;
    onJudge({ correct: selected === item.answerLabel, response: selected });
  };

  return (
    <div>
      <ItemInstruction>알맞은 것을 고르세요</ItemInstruction>
      {item.passage ? <PassageCollapse passage={item.passage} /> : null}

      <p
        className={item.promptEn ? "gd-en gd-t-lg mb-4 font-medium" : "gd-t-md mb-4 font-semibold"}
        style={{ color: "var(--gd-ink)" }}
      >
        {item.prompt}
      </p>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="보기">
        {item.choices.map((c) => (
          <button
            key={c.label}
            type="button"
            role="radio"
            aria-checked={selected === c.label}
            className="gd-option"
            data-state={optionState(c.label)}
            disabled={!!judged}
            onClick={() => setSelected(c.label)}
          >
            <span className="gd-mono gd-t-xs shrink-0 font-bold" style={{ color: "var(--gd-ink-3)" }}>
              {c.label}
            </span>
            <span className="gd-t-sm min-w-0 flex-1">{c.text}</span>
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
            정답 <span className="font-bold">{item.answerLabel}</span>{" "}
            {item.choices.find((c) => c.label === item.answerLabel)?.text}
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
