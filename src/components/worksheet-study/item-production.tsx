"use client";

// ============================================================================
// 학습지 스터디 모드 — 산출 렌더러 (해석 쓰기 자기채점 O/△/X · 백지 영작 타이핑)
//
// 계약: item-shared.tsx 의 ItemRendererProps — judged === null 동안 자체 UI 로
// 상호작용을 받고, 판정 시 onJudge 를 시도당 정확히 1회 호출한다. 셸이 하단
// verdict 배너·다음 버튼을 맡는다. 품질 기준선: item-mc.tsx. 문구는 합니다체.
// 규범: docs/worksheet-study-spec.md §8.3.
// ============================================================================

import { useState, type CSSProperties } from "react";
import { Eye, Lightbulb } from "lucide-react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import { gradeTyped, type WordDiff } from "@/lib/worksheet-study/grade";
import {
  ConfirmButton,
  ExplanationBox,
  ItemInstruction,
  type ItemRendererProps,
} from "./item-shared";

type SelfGradeItem = Extract<StudyItem, { type: "self-grade" }>;
type TypingItem = Extract<StudyItem, { type: "typing" }>;

const TEXTAREA_STYLE: CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--gd-line)",
  borderRadius: "0.75rem",
  background: "var(--gd-card)",
  padding: "0.625rem 0.875rem",
  fontSize: "var(--gd-fs-md)",
  lineHeight: 1.6,
  color: "var(--gd-ink)",
  resize: "none",
};

// ── 해석 쓰기 (자기채점 O/△/X) ──────────────────────────────────────────────

const SELF_GRADES: {
  grade: "O" | "D" | "X";
  symbol: string;
  label: string;
  color: string;
  soft: string;
  border: string;
}[] = [
  { grade: "O", symbol: "O", label: "맞았습니다", color: "var(--gd-good)", soft: "var(--gd-good-soft)", border: "var(--gd-good)" },
  { grade: "D", symbol: "△", label: "애매합니다", color: "var(--gd-ink-2)", soft: "var(--gd-card)", border: "var(--gd-line-strong)" },
  { grade: "X", symbol: "X", label: "틀렸습니다", color: "var(--gd-bad)", soft: "var(--gd-bad-soft)", border: "var(--gd-bad)" },
];

export function ItemSelfGrade({ item, judged, onJudge }: ItemRendererProps<SelfGradeItem>) {
  const [draft, setDraft] = useState<string>(() => judged?.response ?? "");
  const [revealed, setRevealed] = useState(false);
  const shown = revealed || !!judged;
  const picked = judged?.selfGrade ? SELF_GRADES.find((g) => g.grade === judged.selfGrade) : undefined;

  const submit = (grade: "O" | "D" | "X") => {
    if (judged) return;
    onJudge({ selfGrade: grade, response: draft.trim() || undefined });
  };

  return (
    <div>
      <ItemInstruction>우리말로 해석해 보세요</ItemInstruction>

      <p className="gd-en gd-t-lg mb-3 font-medium" style={{ color: "var(--gd-ink)" }}>
        {item.en}
      </p>

      <textarea
        rows={3}
        autoCorrect="off"
        aria-label="내 해석"
        placeholder="해석을 직접 적어 보면 더 오래 남습니다 (선택)"
        style={TEXTAREA_STYLE}
        value={draft}
        disabled={!!judged}
        onChange={(e) => setDraft(e.target.value)}
      />

      {!shown ? (
        <button type="button" className="gd-btn gd-btn-ghost mt-3 w-full" onClick={() => setRevealed(true)}>
          <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          모범 해석 보기
        </button>
      ) : null}

      {shown ? (
        <div className="gd-card gd-pop mt-3 px-3.5 py-3">
          <p className="gd-label mb-1">모범 해석</p>
          <p className="gd-prose">{item.modelKo}</p>
        </div>
      ) : null}

      {shown && !judged ? (
        <>
          <div className="mt-3 flex gap-2" role="group" aria-label="자기 평가">
            {SELF_GRADES.map((g) => (
              <button
                key={g.grade}
                type="button"
                className="gd-btn flex-1 flex-col"
                style={{
                  minHeight: "3.5rem",
                  gap: "0.1875rem",
                  border: `1.5px solid ${g.border}`,
                  background: g.soft,
                  color: g.color,
                }}
                onClick={() => submit(g.grade)}
              >
                <span className="gd-t-lg font-bold leading-none">{g.symbol}</span>
                <span className="gd-t-2xs font-semibold">{g.label}</span>
              </button>
            ))}
          </div>
          <p className="gd-t-2xs mt-2 text-center" style={{ color: "var(--gd-ink-3)" }}>
            스스로 정직하게 평가할수록 취약점 분석이 정확해집니다
          </p>
        </>
      ) : null}

      {picked ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="gd-label">자기 평가</span>
          <span
            className="gd-t-xs inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold"
            style={{ background: picked.soft, color: picked.color, border: `1px solid ${picked.border}` }}
          >
            {picked.symbol} {picked.label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── 백지 영작 (타이핑 + 워드디프) ───────────────────────────────────────────

/** 워드디프 칩 플로우 — same=잉크, typo=밑줄 파랑, missing=초록 굵게+빠짐, extra=빨강 취소선. */
function DiffFlow({ diff }: { diff: WordDiff[] }) {
  return (
    <p className="gd-en gd-t-md" style={{ lineHeight: 1.9 }}>
      {diff.map((d, i) => (
        <span key={`${i}-${d.word}`}>
          {i > 0 ? " " : null}
          {d.state === "same" ? (
            <span style={{ color: "var(--gd-ink)" }}>{d.word}</span>
          ) : d.state === "typo" ? (
            <span
              style={{
                color: "var(--gd-blue)",
                textDecorationLine: "underline",
                textDecorationThickness: "1.5px",
                textUnderlineOffset: "3px",
              }}
            >
              {d.word}
            </span>
          ) : d.state === "missing" ? (
            <span style={{ color: "var(--gd-good)", fontWeight: 700 }}>
              {d.word}
              <span className="gd-t-3xs" style={{ verticalAlign: "super", marginLeft: "0.1875rem" }}>
                빠짐
              </span>
            </span>
          ) : (
            <span style={{ color: "var(--gd-bad)", textDecorationLine: "line-through" }}>{d.word}</span>
          )}
        </span>
      ))}
    </p>
  );
}

export function ItemTyping({ item, judged, onJudge }: ItemRendererProps<TypingItem>) {
  const [input, setInput] = useState<string>(() => judged?.response ?? "");
  const [hintOpen, setHintOpen] = useState(false);
  const hasHint = item.scaffold !== "none" && !!item.hint;

  const submit = () => {
    if (judged || !input.trim()) return;
    const { correct } = gradeTyped(input, item.answer);
    onJudge({ correct, response: input.trim(), hintUsed: hintOpen });
  };

  // 판정 후 피드백은 순수함수 재계산 — judged.response 가 진실의 원천.
  const graded = judged ? gradeTyped(judged.response ?? input, item.answer) : null;

  return (
    <div>
      <ItemInstruction>우리말을 보고 영어 문장을 완성하세요</ItemInstruction>

      <div className="gd-block" data-tone="accent">
        <p className="gd-prose font-medium">{item.promptKo}</p>
      </div>

      {hasHint && hintOpen ? (
        <div className="gd-card gd-pop mt-3 px-3.5 py-2.5">
          <p className="gd-label mb-1">힌트</p>
          <p
            className="gd-mono gd-t-sm"
            style={{ letterSpacing: "0.12em", color: "var(--gd-ink-2)", overflowWrap: "break-word" }}
          >
            {item.hint}
          </p>
        </div>
      ) : null}
      {hasHint && !hintOpen && !judged ? (
        <button type="button" className="gd-btn gd-btn-ghost mt-3 w-full" onClick={() => setHintOpen(true)}>
          <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          힌트 보기
        </button>
      ) : null}

      <textarea
        rows={3}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="영어 문장 입력"
        placeholder="영어 문장을 입력하세요"
        className="mt-3"
        style={{ ...TEXTAREA_STYLE, fontFamily: "var(--gd-serif)" }}
        value={input}
        disabled={!!judged}
        onChange={(e) => setInput(e.target.value)}
      />

      {!judged ? <ConfirmButton disabled={!input.trim()} onClick={submit} /> : null}

      {judged && graded ? (
        judged.correct ? (
          <ExplanationBox tone="good" title="정답입니다!">
            <p className="gd-en gd-t-md">{item.answer}</p>
          </ExplanationBox>
        ) : graded.nearMiss ? (
          <div className="gd-block gd-pop mt-3" data-tone="accent">
            <p className="gd-t-xs mb-1.5 font-bold" style={{ color: "var(--gd-blue)" }}>
              거의 맞았습니다 — 밑줄 친 부분을 확인하세요
            </p>
            <DiffFlow diff={graded.diff} />
            <p className="gd-label mt-3 mb-1">정답 문장</p>
            <p className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
              {item.answer}
            </p>
          </div>
        ) : (
          <ExplanationBox tone="bad" title="아쉽습니다 — 정답을 확인해 보세요">
            <DiffFlow diff={graded.diff} />
            <p className="gd-label mt-3 mb-1">정답 문장</p>
            <p className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
              {item.answer}
            </p>
          </ExplanationBox>
        )
      ) : null}
    </div>
  );
}
