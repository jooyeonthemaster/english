"use client";

// ============================================================================
// 인터랙티브 레슨 — 교수 블록 렌더러 (CHECK·RECAP 제외 전 유형)
// 규범: docs/study-os-spec.md §3, §5
//
// 원칙:
//  - 한 번에 하나씩 판단하게 한다(DIAGRAM 레이어·WORKED 스텝은 순차 공개).
//  - 드래그를 유일 입력으로 두지 않는다(모든 조작은 탭).
//  - 학생이 무언가 고르기 전에는 정답을 보여 주지 않는다(사전 인출).
// ============================================================================

import { useState } from "react";
import { Check, ChevronRight, Lightbulb, TriangleAlert, X } from "lucide-react";
import { MarkupText } from "@/components/grammar-drill/markup-text";
import {
  BLOCK_LABEL,
  SYNTAX_ROLE_LABEL,
  type AlgorithmBlock,
  type CompletionBlock,
  type ContrastBlock,
  type DiagramBlock,
  type ExamBlock,
  type HookBlock,
  type LessonBlockType,
  type LessonExample,
  type MisconceptionBlock,
  type RuleBlock,
  type SummaryBlock,
  type TrapBlock,
  type WorkedBlock,
} from "@/lib/study-os/lesson-types";

// ── 공통 셸 ─────────────────────────────────────────────────────────────────

export function BlockShell({
  type,
  title,
  tone,
  children,
}: {
  type: LessonBlockType;
  title?: string;
  tone?: "accent" | "warn";
  children: React.ReactNode;
}) {
  return (
    <section className="gd-block" data-tone={tone}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="gd-block-head" data-tone={tone}>
          {BLOCK_LABEL[type]}
        </span>
        {title && (
          <p className="gd-t-xs min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            {title}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Example({ ex }: { ex: LessonExample }) {
  return (
    <div className="gd-hairline-t mt-2.5 pt-2.5">
      <p className="gd-en gd-prose" style={ex.wrong ? { color: "var(--gd-bad)" } : undefined}>
        {ex.wrong && <span className="gd-t-xs mr-1 font-bold">✕</span>}
        <MarkupText text={ex.en} />
      </p>
      <p className="gd-prose-2 mt-1">{ex.ko}</p>
      {ex.note && (
        <p className="gd-t-xs mt-1.5 leading-relaxed" style={{ color: "var(--gd-blue)" }}>
          {ex.note}
        </p>
      )}
    </div>
  );
}

// ── HOOK — 설명 전에 먼저 판단 ──────────────────────────────────────────────

export function HookView({ block, onDone }: { block: HookBlock; onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <BlockShell type="HOOK" tone="accent">
      <p className="gd-prose font-semibold">{block.prompt}</p>
      <div className="mt-3 flex flex-col gap-2">
        {block.options.map((opt, i) => {
          const state =
            picked === null
              ? undefined
              : i === block.answer
                ? "correct"
                : i === picked
                  ? "wrong"
                  : "dim";
          return (
            <button
              key={i}
              type="button"
              className="gd-option"
              data-state={state}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                onDone();
              }}
            >
              <span className="gd-en gd-t-base flex-1 text-left leading-relaxed">{opt}</span>
              {picked !== null && i === block.answer && (
                <Check className="h-4 w-4 shrink-0" style={{ color: "var(--gd-good)" }} strokeWidth={2.5} />
              )}
              {picked === i && i !== block.answer && (
                <X className="h-4 w-4 shrink-0" style={{ color: "var(--gd-bad)" }} strokeWidth={2.5} />
              )}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="gd-prose-2 gd-pop mt-3 rounded-xl p-3" style={{ background: "var(--gd-card)" }}>
          {block.afterText}
        </p>
      )}
    </BlockShell>
  );
}

// ── MISCONCEPTION — 오개념 직면 ────────────────────────────────────────────

export function MisconceptionView({ block }: { block: MisconceptionBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <BlockShell type="MISCONCEPTION" tone="warn" title={block.title}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border p-3 text-left"
        style={{ borderColor: "var(--gd-bad-line)", background: "var(--gd-card)" }}
      >
        <p className="gd-prose" style={{ textDecoration: open ? "line-through" : "none", color: "var(--gd-ink-2)" }}>
          “{block.myth}”
        </p>
        {!open && (
          <p className="gd-t-xs mt-1.5 font-semibold" style={{ color: "var(--gd-bad)" }}>
            정말 그렇습니까? 눌러서 확인하십시오.
          </p>
        )}
      </button>
      {open && (
        <div className="gd-pop mt-2.5">
          <p className="gd-prose font-semibold" style={{ color: "var(--gd-bad)" }}>
            아닙니다.
          </p>
          <p className="gd-prose-2 mt-1">{block.truth}</p>
          <Example ex={block.counterExample} />
        </div>
      )}
    </BlockShell>
  );
}

// ── RULE — 요약 + 접힌 상세(2단 공개) ──────────────────────────────────────

export function RuleView({ block }: { block: RuleBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <BlockShell type="RULE" title={block.title}>
      <p className="gd-prose font-semibold">{block.rule}</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="gd-btn-chip mt-2.5"
        >
          예문 {block.examples.length}개 보기
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : (
        <div className="gd-pop">
          {block.examples.map((ex, i) => (
            <Example key={i} ex={ex} />
          ))}
        </div>
      )}
    </BlockShell>
  );
}

// ── DIAGRAM — 문장 해부(레이어 순차 공개) ──────────────────────────────────

export function DiagramView({ block }: { block: DiagramBlock }) {
  const [layer, setLayer] = useState(0);
  const active = block.layers[layer];
  const done = layer >= block.layers.length - 1;

  return (
    <BlockShell type="DIAGRAM" title={block.title}>
      {/* 문장 — 활성 레이어의 역할만 점등(동시 표시 금지) */}
      <p className="gd-en gd-prose leading-loose">
        {block.tokens.map((tok, i) => {
          const on = active.roles.includes(tok.role);
          return (
            <span key={i}>
              <span className="gd-syn" data-role={tok.role} data-on={on ? "true" : "false"}>
                {on && SYNTAX_ROLE_LABEL[tok.role] && (
                  <span className="gd-syn-label">{SYNTAX_ROLE_LABEL[tok.role]}</span>
                )}
                <span>{tok.t}</span>
              </span>{" "}
            </span>
          );
        })}
      </p>
      <p className="gd-prose-2 mt-2">{block.ko}</p>

      <div className="gd-hairline-t mt-3 pt-3">
        <p className="gd-prose font-semibold" style={{ color: "var(--gd-blue)" }}>
          {active.label}
        </p>
        <p className="gd-prose-2 mt-1">{active.note}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="gd-seg flex-1">
          {block.layers.map((_, i) => (
            <i key={i} data-on={i < layer ? "done" : i === layer ? "true" : undefined} />
          ))}
        </div>
        {!done ? (
          <button type="button" className="gd-btn-chip" onClick={() => setLayer((l) => l + 1)}>
            다음 단계
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            className="gd-btn-chip"
            onClick={() => setLayer(0)}
            aria-label="처음부터 다시 보기"
          >
            다시 보기
          </button>
        )}
      </div>

      {done && (
        <p
          className="gd-prose gd-pop mt-3 rounded-xl p-3 font-semibold"
          style={{ background: "var(--gd-good-soft)", color: "var(--gd-good)" }}
        >
          {block.conclusion}
        </p>
      )}
    </BlockShell>
  );
}

// ── ALGORITHM — 판단 절차(단계마다 적용 예 노출) ───────────────────────────

export function AlgorithmView({ block }: { block: AlgorithmBlock }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <BlockShell type="ALGORITHM" tone="accent" title={block.title}>
      <div className="rounded-xl p-3" style={{ background: "var(--gd-card)" }}>
        <p className="gd-en gd-prose">
          <MarkupText text={block.example.en} />
        </p>
        <p className="gd-prose-2 mt-1">{block.example.ko}</p>
      </div>
      <ol className="mt-2">
        {block.steps.map((step, i) => (
          <li key={i}>
            <button
              type="button"
              className="gd-step w-full text-left"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="gd-step-n">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="gd-prose block">{step.text}</span>
                {open === i && (
                  <span
                    className="gd-t-xs gd-pop mt-1.5 block rounded-lg p-2 leading-relaxed"
                    style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
                  >
                    {step.applyNote}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
        각 단계를 눌러 위 문장에 적용되는 모습을 확인하십시오.
      </p>
    </BlockShell>
  );
}

// ── WORKED — 한 스텝씩 드러나는 예제 ───────────────────────────────────────

export function WorkedView({ block }: { block: WorkedBlock }) {
  const [shown, setShown] = useState(0);
  const all = shown >= block.steps.length;
  return (
    <BlockShell type="WORKED" title={block.title}>
      <p className="gd-prose font-semibold">{block.question}</p>
      <p className="gd-en gd-prose mt-2 rounded-xl p-3" style={{ background: "var(--gd-paper)" }}>
        <MarkupText text={block.stem} />
      </p>
      <div className="mt-2">
        {block.steps.map((s, i) => (
          <div key={i} className="gd-step" data-locked={i >= shown ? "true" : undefined}>
            <span className="gd-step-n">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="gd-prose font-semibold">{i < shown ? s.title : "…"}</p>
              {i < shown && <p className="gd-prose-2 mt-0.5">{s.body}</p>}
            </div>
          </div>
        ))}
      </div>
      {!all ? (
        <button
          type="button"
          className="gd-btn gd-btn-primary mt-3 w-full"
          onClick={() => setShown((s) => s + 1)}
        >
          {shown === 0 ? "첫 단계 보기" : "다음 단계"}
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      ) : (
        <p
          className="gd-prose gd-pop mt-3 rounded-xl p-3 font-semibold"
          style={{ background: "var(--gd-good-soft)", color: "var(--gd-good)" }}
        >
          정답 · {block.answer}
          <span className="gd-prose-2 mt-1 block" style={{ color: "var(--gd-ink-2)" }}>
            {block.ko}
          </span>
        </p>
      )}
    </BlockShell>
  );
}
// ── COMPLETION — 마지막 판단만 학생 몫 ─────────────────────────────────────

export function CompletionView({ block }: { block: CompletionBlock }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <BlockShell type="COMPLETION" title={block.title}>
      <p className="gd-en gd-prose rounded-xl p-3" style={{ background: "var(--gd-paper)" }}>
        <MarkupText text={block.stem} />
      </p>
      <div className="mt-2">
        {block.givenSteps.map((s, i) => (
          <div key={i} className="gd-step">
            <span className="gd-step-n">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <p className="gd-prose-2 min-w-0 flex-1">{s}</p>
          </div>
        ))}
      </div>
      <p className="gd-prose mt-2 font-semibold">{block.prompt}</p>
      <div className="mt-2 flex flex-col gap-2">
        {block.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="gd-option"
            data-state={
              picked === null
                ? undefined
                : i === block.answer
                  ? "correct"
                  : i === picked
                    ? "wrong"
                    : "dim"
            }
            disabled={picked !== null}
            onClick={() => setPicked(i)}
          >
            <span className="gd-t-base flex-1 text-left leading-relaxed">{opt}</span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <p className="gd-prose-2 gd-pop mt-2.5 rounded-xl p-3" style={{ background: "var(--gd-blue-soft)" }}>
          {block.explain}
        </p>
      )}
    </BlockShell>
  );
}

// ── CONTRAST · TRAP · EXAM · SUMMARY ───────────────────────────────────────

export function ContrastView({ block }: { block: ContrastBlock }) {
  return (
    <BlockShell type="CONTRAST" title={block.title}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="gd-t-2xs w-20 pb-2 text-left font-semibold" style={{ color: "var(--gd-ink-3)" }} />
              {block.columns.map((c) => (
                <th key={c} className="gd-t-xs pb-2 text-left font-bold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                <td className="gd-t-2xs gd-hairline-t py-2 pr-2 align-top" style={{ color: "var(--gd-ink-3)" }}>
                  {r.criterion}
                </td>
                <td className="gd-t-xs gd-hairline-t py-2 pr-2 align-top leading-relaxed">{r.a}</td>
                <td className="gd-t-xs gd-hairline-t py-2 align-top leading-relaxed">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.examples.map((ex, i) => (
        <Example key={i} ex={ex} />
      ))}
    </BlockShell>
  );
}

export function TrapView({ block }: { block: TrapBlock }) {
  return (
    <BlockShell type="TRAP" tone="warn" title={block.title}>
      <p className="gd-prose flex items-start gap-2 font-bold" style={{ color: "var(--gd-bad)" }}>
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
        {block.trapTitle}
      </p>
      <p className="gd-prose-2 mt-1.5">{block.body}</p>
      <Example ex={block.example} />
    </BlockShell>
  );
}

export function ExamView({ block }: { block: ExamBlock }) {
  return (
    <BlockShell type="EXAM" title={block.title}>
      <div className="flex flex-col gap-3">
        {block.scenes.map((s, i) => (
          <div key={i} className="rounded-xl border p-3" style={{ borderColor: "var(--gd-line)" }}>
            <span className="gd-block-head" data-tone="accent">
              {s.scope === "SCHOOL" ? "내신" : "수능"}
            </span>
            <p className="gd-prose-2 mt-2">{s.how}</p>
            <p className="gd-en gd-prose mt-2">
              <MarkupText text={s.sample.en} />
            </p>
            <p className="gd-t-xs mt-1.5 font-semibold">{s.sample.ask}</p>
            <p className="gd-t-xs mt-1" style={{ color: "var(--gd-good)" }}>
              → {s.sample.answer}
            </p>
          </div>
        ))}
      </div>
    </BlockShell>
  );
}

export function SummaryView({ block }: { block: SummaryBlock }) {
  return (
    <BlockShell type="SUMMARY" tone="accent" title={block.title}>
      <ul className="flex flex-col gap-2">
        {block.bullets.map((b, i) => (
          <li key={i} className="gd-prose flex gap-2">
            <Lightbulb className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: "var(--gd-blue)" }} strokeWidth={2} />
            <span className="min-w-0 flex-1">{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-xl p-3" style={{ background: "var(--gd-card)" }}>
        <Example ex={block.keySentence} />
      </div>
    </BlockShell>
  );
}
