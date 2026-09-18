"use client";

// 어법 드릴 — 문항 유형별 뷰 6종.
// 모든 뷰는 (item, draft, setDraft, verdict) 계약으로 통일한다.
// verdict 가 있으면 잠금 상태(제출 후) — 정답·상태 색을 표시한다.

import type { ClientItem, SubmitVerdict } from "@/lib/grammar-drill/payload";
import { MarkupText, type UnderlineState } from "./markup-text";

export interface ItemViewProps {
  item: ClientItem;
  draft: string | null;
  setDraft: (v: string) => void;
  verdict: SubmitVerdict | null;
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export function ItemView(props: ItemViewProps) {
  switch (props.item.type) {
    case "CHOICE":
      return <ChoiceView {...props} />;
    case "OX":
      return <OxView {...props} />;
    case "MULTI_UNDERLINE":
    case "PASSAGE":
      return <UnderlinePickView {...props} />;
    case "WRITE_FORM":
      return <WriteFormView {...props} />;
    case "WRITE_CORRECT":
      return <WriteCorrectView {...props} />;
  }
}

// ── CHOICE — 괄호 택일 ───────────────────────────────────────────────────────

function ChoiceView({ item, draft, setDraft, verdict }: ItemViewProps) {
  if (item.type !== "CHOICE") return null;
  const chosen = draft === null ? null : Number(draft);
  const answer = verdict?.correctAnswer.index;

  const blank =
    verdict != null && answer !== undefined
      ? item.options[answer]
      : chosen !== null
        ? item.options[chosen]
        : undefined;

  return (
    <div>
      <p className="gd-en gd-t-md-lg">
        <MarkupText text={item.stem} blankContent={blank} />
      </p>
      <div className="mt-5 flex flex-col gap-2.5">
        {item.options.map((opt, i) => {
          let state: string | undefined;
          if (verdict) {
            if (i === answer) state = "correct";
            else if (i === chosen) state = "wrong";
            else state = "dim";
          } else if (i === chosen) {
            state = "selected";
          }
          return (
            <button
              key={i}
              type="button"
              className="gd-option"
              data-state={state}
              disabled={Boolean(verdict)}
              onClick={() => setDraft(String(i))}
            >
              <span
                className="gd-t-2xs flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-semibold"
                style={{ borderColor: "var(--gd-line-strong)", color: "var(--gd-ink-2)" }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="gd-en gd-t-md">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── OX — 밑줄 정오 판단 ──────────────────────────────────────────────────────

function OxView({ item, draft, setDraft, verdict }: ItemViewProps) {
  if (item.type !== "OX") return null;
  // 제출 후 밑줄 색은 학생 정오가 아니라 "밑줄 자체가 옳은 형태였는가"를 표시한다.
  const underlineState: UnderlineState = verdict
    ? verdict.correctAnswer.isCorrect
      ? "correct"
      : "wrong"
    : "idle";

  const pick = (v: "O" | "X") => setDraft(v);
  const stateOf = (v: "O" | "X"): string | undefined => {
    if (verdict) {
      const right = verdict.correctAnswer.isCorrect ? "O" : "X";
      if (v === right) return "correct";
      if (v === draft) return "wrong";
      return "dim";
    }
    return draft === v ? "selected" : undefined;
  };

  return (
    <div>
      <p className="gd-en gd-t-md-lg">
        <MarkupText
          text={item.sentence}
          underlineStateFor={() => underlineState}
        />
      </p>
      <p className="gd-t-xs mt-4" style={{ color: "var(--gd-ink-2)" }}>
        밑줄 친 부분이 어법상 옳으면 O, 틀리면 X를 고르십시오.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {(["O", "X"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className="gd-option justify-center"
            data-state={stateOf(v)}
            disabled={Boolean(verdict)}
            onClick={() => pick(v)}
          >
            <span className="gd-t-xl font-bold">{v}</span>
            <span className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
              {v === "O" ? "옳다" : "틀리다"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── MULTI_UNDERLINE / PASSAGE — 밑줄 택1 ─────────────────────────────────────

function UnderlinePickView({ item, draft, setDraft, verdict }: ItemViewProps) {
  if (item.type !== "MULTI_UNDERLINE" && item.type !== "PASSAGE") return null;
  const chosen = draft === null ? null : Number(draft);
  const answer = verdict?.correctAnswer.number ?? null;
  const count = item.type === "MULTI_UNDERLINE" ? item.underlineCount : 5;

  const stateFor = (n: number | null): UnderlineState => {
    if (n === null) return "idle";
    if (verdict) {
      if (n === answer) return "correct";
      if (n === chosen) return "wrong";
      return "idle";
    }
    return n === chosen ? "selected" : "idle";
  };

  return (
    <div>
      <p className="gd-t-xs font-medium" style={{ color: "var(--gd-ink-2)" }}>
        {item.type === "PASSAGE"
          ? item.directive
          : "밑줄 친 부분 중, 어법상 틀린 것을 고르십시오."}
      </p>
      <div
        className="gd-card mt-3 px-4 py-4 md:px-5"
        style={{ borderColor: "var(--gd-line)" }}
      >
        <p className="gd-en gd-t-md-lg">
          <MarkupText
            text={item.text}
            underlineStateFor={stateFor}
            onUnderlinePress={verdict ? undefined : (n) => setDraft(String(n))}
          />
        </p>
      </div>
      <div className="mt-3.5 flex justify-center gap-2">
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
          let state: string | undefined;
          if (verdict) {
            if (n === answer) state = "correct";
            else if (n === chosen) state = "wrong";
            else state = "dim";
          } else if (n === chosen) {
            state = "selected";
          }
          return (
            <button
              key={n}
              type="button"
              className="gd-option gd-option-square"
              data-state={state}
              disabled={Boolean(verdict)}
              onClick={() => setDraft(String(n))}
            >
              <span className="gd-t-md font-semibold">{CIRCLED[n - 1]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── WRITE_FORM — 어형 변형 서술 ──────────────────────────────────────────────

function WriteFormView({ item, draft, setDraft, verdict }: ItemViewProps) {
  if (item.type !== "WRITE_FORM") return null;
  return (
    <div>
      <p className="gd-en gd-t-md-lg">
        <MarkupText
          text={item.stem}
          blankContent={
            verdict ? (
              <span style={{ color: verdict.correct ? "var(--gd-good)" : "var(--gd-bad)" }}>
                {draft || "···"}
              </span>
            ) : draft ? (
              draft
            ) : undefined
          }
        />
      </p>
      <p className="gd-t-xs mt-4" style={{ color: "var(--gd-ink-2)" }}>
        괄호 안의 <strong className="gd-en">{item.given}</strong> 을(를) 어법에 맞게
        고쳐 빈칸에 쓰십시오.
      </p>
      <WrittenInput
        value={draft ?? ""}
        onChange={setDraft}
        locked={Boolean(verdict)}
        placeholder={`${item.given} → ?`}
      />
      {verdict && !verdict.correct && verdict.correctAnswer.accepted && (
        <p className="gd-t-sm mt-2.5">
          <span style={{ color: "var(--gd-ink-2)" }}>정답: </span>
          <strong className="gd-en" style={{ color: "var(--gd-good)" }}>
            {verdict.correctAnswer.accepted[0]}
          </strong>
        </p>
      )}
    </div>
  );
}

// ── WRITE_CORRECT — 오류 수정 서술 ───────────────────────────────────────────

function WriteCorrectView({ item, draft, setDraft, verdict }: ItemViewProps) {
  if (item.type !== "WRITE_CORRECT") return null;
  return (
    <div>
      <p className="gd-en gd-t-md-lg">
        <MarkupText
          text={item.sentence}
          underlineStateFor={() => (verdict ? "wrong" : "idle")}
        />
      </p>
      <p className="gd-t-xs mt-4" style={{ color: "var(--gd-ink-2)" }}>
        밑줄 친 부분은 어법상 틀렸습니다. 바르게 고쳐 쓰십시오.
      </p>
      <WrittenInput
        value={draft ?? ""}
        onChange={setDraft}
        locked={Boolean(verdict)}
        placeholder="바른 형태 입력"
      />
      {verdict && !verdict.correct && verdict.correctAnswer.accepted && (
        <p className="gd-t-sm mt-2.5">
          <span style={{ color: "var(--gd-ink-2)" }}>정답: </span>
          <strong className="gd-en" style={{ color: "var(--gd-good)" }}>
            {verdict.correctAnswer.accepted[0]}
          </strong>
        </p>
      )}
    </div>
  );
}

function WrittenInput({
  value,
  onChange,
  locked,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={locked}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      className="gd-en gd-t-lg mt-3 h-12 w-full rounded-xl border px-4 outline-none focus:border-[var(--gd-blue)]"
      style={{ background: "var(--gd-card)", borderColor: "var(--gd-line-strong)" }}
    />
  );
}
