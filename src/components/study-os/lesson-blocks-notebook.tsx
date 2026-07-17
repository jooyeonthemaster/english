"use client";

// ============================================================================
// 인터랙티브 레슨 — v2 필기노트 패밀리 렌더러
// CONCEPT_INTRO(용어 첫 대면) · NOTEBOOK(필기노트) · TABLE(정리표) ·
// MNEMONIC(암기 카드)
//
// 규범: docs/study-os-spec.md §11.1 — 벽글 금지의 실행 수단.
// 원칙:
//  - "개념 하나 = 시각 단위 하나"가 즉시 읽히게 한다(노트줄·번호·표 괘선).
//  - 예문·답은 학생이 탭하기 전에는 보여 주지 않는다(접힘 기본).
//  - 드래그 없음 — 전부 탭이다(모바일 신뢰성, §3.2).
// ============================================================================

import { Fragment, useState } from "react";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { BlockShell, Example } from "./lesson-blocks";
import type {
  ConceptIntroBlock,
  MnemonicBlock,
  NotebookBlock,
  TableBlock,
} from "@/lib/study-os/lesson-types";

// ── CONCEPT_INTRO — 용어 첫 대면: "○○가 무엇입니까?"에 답부터 ──────────────

export function ConceptIntroView({ block }: { block: ConceptIntroBlock }) {
  return (
    <BlockShell type="CONCEPT_INTRO" tone="accent" title={block.title}>
      {/* 학생의 속마음 질문 — 인용부터 연다 */}
      <p className="gd-term-q gd-prose-2">“{block.question}”</p>

      {/* 용어 — 이 레슨이 여는 단어 */}
      <p className="gd-term mt-3">{block.term}</p>

      {/* 전제 0 정의 — 이 카드만 읽어도 뜻이 선다 */}
      <div
        className="mt-2 rounded-xl border p-3"
        style={{ borderColor: "var(--gd-blue-line)", background: "var(--gd-card)" }}
      >
        <p className="gd-prose font-semibold">{block.plain}</p>
      </div>

      {/* 비유 — 정의를 몸에 있는 것에 건다 */}
      <div className="gd-hairline-t mt-3 pt-3">
        <p className="gd-label" style={{ color: "var(--gd-blue)" }}>
          비유
        </p>
        <p className="gd-prose-2 mt-1">{block.analogy}</p>
      </div>

      {/* 왜 배우는가 — 이걸 알면 무엇이 되는가 */}
      <div className="mt-2.5 rounded-xl p-3" style={{ background: "var(--gd-blue-soft)" }}>
        <p className="gd-label" style={{ color: "var(--gd-blue)" }}>
          왜 배우는가
        </p>
        <p className="gd-prose-2 mt-1" style={{ color: "var(--gd-ink)" }}>
          {block.whyItMatters}
        </p>
      </div>
    </BlockShell>
  );
}

// ── NOTEBOOK — 필기노트: 좌측 노트줄 + 번호, 항목 하나 = 개념 하나 ──────────

export function NotebookView({ block }: { block: NotebookBlock }) {
  // 펼친 항목 인덱스 집합 — 여러 항목을 동시에 펼쳐 두고 비교할 수 있다.
  const [open, setOpen] = useState<number[]>([]);
  const toggle = (i: number) =>
    setOpen((o) => (o.includes(i) ? o.filter((j) => j !== i) : [...o, i]));
  const hasExamples = block.entries.some((e) => e.example !== undefined);

  return (
    <BlockShell type="NOTEBOOK" title={block.title}>
      {block.intro && <p className="gd-prose-2 mb-2.5">{block.intro}</p>}

      <div className="gd-note">
        {block.entries.map((entry, i) => {
          const expandable = entry.example !== undefined;
          const isOpen = expandable && open.includes(i);
          const inner = (
            <>
              <span className="gd-note-num mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="gd-prose min-w-0 flex-1 font-bold">{entry.head}</p>
                  {entry.pin && (
                    <span className="gd-note-pin shrink-0" data-pin={entry.pin}>
                      {entry.pin}
                    </span>
                  )}
                  {expandable && (
                    <ChevronDown
                      className="gd-chev h-3.5 w-3.5 shrink-0"
                      style={{
                        color: "var(--gd-ink-3)",
                        transform: isOpen ? "rotate(180deg)" : "none",
                      }}
                      strokeWidth={2}
                    />
                  )}
                </div>
                <p className="gd-prose-2 mt-0.5">{entry.body}</p>
                {isOpen && entry.example && (
                  <div className="gd-pop">
                    <Example ex={entry.example} />
                  </div>
                )}
              </div>
            </>
          );

          // 예문이 있는 항목만 탭 가능 — 접힌 상태가 기본이다.
          return expandable ? (
            <button
              key={i}
              type="button"
              className="gd-note-entry flex w-full items-start gap-2.5 text-left"
              aria-expanded={isOpen}
              onClick={() => toggle(i)}
            >
              {inner}
            </button>
          ) : (
            <div key={i} className="gd-note-entry flex items-start gap-2.5">
              {inner}
            </div>
          );
        })}
      </div>

      {hasExamples && (
        <p className="gd-t-xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
          화살표가 붙은 항목을 누르면 예문이 열립니다.
        </p>
      )}
    </BlockShell>
  );
}

// ── TABLE — 정리표: 축이 2개 이상인 목록·비교. 행 탭으로 예문 공개 ──────────

export function TableView({ block }: { block: TableBlock }) {
  const [open, setOpen] = useState<number[]>([]);
  const toggle = (i: number) =>
    setOpen((o) => (o.includes(i) ? o.filter((j) => j !== i) : [...o, i]));
  const cols = block.columns.length;
  const hasExamples = block.rows.some((r) => r.example !== undefined);

  return (
    <BlockShell type="TABLE" title={block.title}>
      <div className="overflow-x-auto">
        <table className="gd-ctable">
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => {
              const expandable = row.example !== undefined;
              const isOpen = expandable && open.includes(i);
              return (
                <Fragment key={i}>
                  <tr
                    data-open={isOpen ? "true" : undefined}
                    role={expandable ? "button" : undefined}
                    tabIndex={expandable ? 0 : undefined}
                    aria-expanded={expandable ? isOpen : undefined}
                    style={expandable ? { cursor: "pointer", height: "2.75rem" } : undefined}
                    onClick={expandable ? () => toggle(i) : undefined}
                    onKeyDown={
                      expandable
                        ? (ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              toggle(i);
                            }
                          }
                        : undefined
                    }
                  >
                    {row.cells.map((cell, j) => (
                      <td key={j}>
                        {expandable && j === row.cells.length - 1 ? (
                          <span className="flex items-center justify-between gap-1.5">
                            <span className="min-w-0 flex-1">{cell}</span>
                            <ChevronDown
                              className="gd-chev h-3.5 w-3.5 shrink-0"
                              style={{
                                color: "var(--gd-ink-3)",
                                transform: isOpen ? "rotate(180deg)" : "none",
                              }}
                              strokeWidth={2}
                            />
                          </span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* 예문 행 — 열린 행 바로 아래에 삽입한다 */}
                  {isOpen && row.example && (
                    <tr>
                      <td colSpan={cols} style={{ background: "var(--gd-paper)" }}>
                        <div className="gd-pop">
                          <Example ex={row.example} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasExamples && (
        <p className="gd-t-xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
          화살표가 있는 행을 누르면 예문이 열립니다.
        </p>
      )}

      {block.takeaway && (
        <p
          className="gd-prose gd-pop mt-3 rounded-xl p-3 font-semibold"
          style={{ background: "var(--gd-good-soft)", color: "var(--gd-good)" }}
        >
          {block.takeaway}
        </p>
      )}
    </BlockShell>
  );
}

// ── MNEMONIC — 암기 카드: 왜 외우는가 → 암기 장치 → 셀프 리허설 ─────────────

export function MnemonicView({ block }: { block: MnemonicBlock }) {
  // 공개한 카드 인덱스 — 공개는 일방향이다(떠올린 뒤 확인하는 리허설이므로).
  const [revealed, setRevealed] = useState<number[]>([]);
  const total = block.items.length;
  const seen = revealed.length;
  const allSeen = total > 0 && seen === total;
  const reveal = (i: number) => setRevealed((r) => (r.includes(i) ? r : [...r, i]));

  return (
    <BlockShell type="MNEMONIC" tone="accent" title={block.title}>
      {/* 외울 것 */}
      <p className="gd-label">외울 것</p>
      <p className="gd-prose mt-0.5 font-bold">{block.target}</p>

      {/* 왜 외우는가 — 암기의 존재 이유부터 말한다 */}
      <div
        className="mt-2.5 rounded-xl border p-3"
        style={{ borderColor: "var(--gd-line)", background: "var(--gd-card)" }}
      >
        <p className="gd-label">왜 외우는가</p>
        <p className="gd-prose-2 mt-1" style={{ color: "var(--gd-ink)" }}>
          {block.why}
        </p>
      </div>

      {/* 암기 장치 — 이 블록의 주인공 */}
      <p className="gd-label mt-3" style={{ color: "var(--gd-blue)" }}>
        암기 장치
      </p>
      <div className="gd-mnemo-device gd-prose mt-1.5">{block.device}</div>

      {/* 셀프 리허설 — cue 만 보고 답을 떠올린 뒤 카드를 뒤집는다 */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="gd-t-xs font-semibold" style={{ color: "var(--gd-ink-2)" }}>
          답을 먼저 떠올린 뒤 카드를 눌러 확인하십시오.
        </p>
        <span className="gd-mono gd-t-xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
          {seen}/{total}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {block.items.map((item, i) => {
          const isOpen = revealed.includes(i);
          return (
            <button
              key={i}
              type="button"
              className="gd-recall"
              data-open={isOpen ? "true" : undefined}
              aria-expanded={isOpen}
              onClick={() => reveal(i)}
            >
              <span className="gd-t-sm min-w-0 flex-1 font-semibold">{item.cue}</span>
              {isOpen ? (
                <span
                  className="gd-pop gd-t-sm shrink-0 font-bold"
                  style={{ color: "var(--gd-good)" }}
                >
                  {item.answer}
                </span>
              ) : (
                <span className="gd-t-2xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
                  눌러서 확인
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 진행 완료 — 다시 가리고 재리허설할 수 있다 */}
      {allSeen && (
        <div
          className="gd-pop mt-2.5 flex items-center gap-2 rounded-xl p-3"
          style={{ background: "var(--gd-good-soft)" }}
        >
          <Check className="h-4 w-4 shrink-0" style={{ color: "var(--gd-good)" }} strokeWidth={2.5} />
          <p className="gd-t-sm min-w-0 flex-1 font-semibold" style={{ color: "var(--gd-good)" }}>
            모두 확인했습니다. 안 보고 말할 수 있는지 한 번 더 시험해 보십시오.
          </p>
          <button type="button" className="gd-btn-chip shrink-0" onClick={() => setRevealed([])}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            다시 가리기
          </button>
        </div>
      )}
    </BlockShell>
  );
}
