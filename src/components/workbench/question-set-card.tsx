"use client";

// ============================================================================
// 장문 세트 — set card renderer
// ============================================================================
// Renders the shared displayed base ONCE (with the merged inline marks rebuilt
// from each member's stored anchors), then each member's question beneath it —
// the CSAT 43~45 layout. No member carries a baked passage; the marks are
// reconstructed here from spans against the one shared base.
// ============================================================================

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

import { optionDisplayTextForSubtype } from "@/components/exams/paper-builder/option-display";
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";
import type { Anchor } from "@/lib/question-sets/types";
import type {
  QuestionSetForRender,
  QuestionSetMember,
} from "@/actions/question-sets";

interface OptionLike {
  label?: string;
  text?: string;
}

function readOptions(value: unknown): OptionLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (o): o is OptionLike => !!o && typeof o === "object" && !Array.isArray(o),
  );
}

/** Parse the marked-passage format contracts into styled React nodes. */
function renderMarkedPassage(text: string) {
  const nodes: React.ReactNode[] = [];
  const regex = /(_{3,})|(__[^_]+__)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (/^_{3,}$/.test(token)) {
      nodes.push(
        <span
          key={key++}
          className="mx-0.5 inline-block min-w-[3.5rem] border-b-2 border-slate-400 align-baseline"
        >
          &nbsp;
        </span>,
      );
    } else {
      const inner = token.slice(2, -2);
      const labelled = inner.match(/^\(([A-Ja-j])\)\s*(.+)$/);
      if (labelled) {
        nodes.push(
          <span key={key++} className="whitespace-nowrap">
            <sup className="mr-0.5 font-bold text-slate-500">({labelled[1]})</sup>
            <span className="underline decoration-slate-500 underline-offset-2">
              {labelled[2]}
            </span>
          </span>,
        );
      } else {
        nodes.push(
          <span
            key={key++}
            className="underline decoration-slate-500 underline-offset-2"
          >
            {inner}
          </span>,
        );
      }
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MemberBlock({
  member,
  index,
  showAnswer,
  structuralMode,
}: {
  member: QuestionSetMember;
  index: number;
  showAnswer: boolean;
  structuralMode?: string | null;
}) {
  const options = readOptions(member.options);
  const displayOptions =
    structuralMode === "SENTENCE_INSERT" || member.typeId === "SENTENCE_INSERT"
      ? options.map((option, optionIndex) => ({
          ...option,
          text: optionDisplayTextForSubtype("SENTENCE_INSERT", optionIndex, option.text || ""),
        }))
      : options;
  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-slate-100 px-1 text-[11px] font-bold text-slate-600">
          {index + 1}
        </span>
        <p className="flex-1 whitespace-pre-wrap text-[13.5px] font-semibold leading-relaxed text-slate-800">
          {member.questionText || member.typeId}
        </p>
        <span className="shrink-0 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          {member.difficulty}
        </span>
      </div>
      {displayOptions.length > 0 && (
        <ul className="mt-2.5 space-y-1 pl-7">
          {displayOptions.map((o, i) => {
            const label = o.label ?? String(i + 1);
            const isCorrect =
              showAnswer &&
              member.correctAnswer &&
              member.correctAnswer.trim() === label.trim();
            return (
              <li
                key={i}
                className={`flex gap-1.5 text-[13px] leading-relaxed ${
                  isCorrect
                    ? "font-semibold text-blue-700"
                    : "text-slate-700"
                }`}
              >
                <span className="shrink-0">{label}</span>
                <span>{o.text ?? ""}</span>
                {isCorrect && (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {showAnswer && displayOptions.length === 0 && member.correctAnswer && (
        <p className="mt-2 pl-7 text-[13px] font-semibold text-blue-700">
          정답: {member.correctAnswer}
        </p>
      )}
    </div>
  );
}

export function QuestionSetCard({ set }: { set: QuestionSetForRender }) {
  const [showAnswer, setShowAnswer] = useState(true);

  // Merge every member's inline anchors and rebuild the shared base ONCE.
  const mergedPassage = useMemo(() => {
    const base = set.layout?.fullPassage ?? set.canonicalPassage;
    const anchors: Anchor[] = set.members.flatMap((m) =>
      Array.isArray(m.spans) ? m.spans : [],
    );
    return reconstructPassageView(base, anchors).text;
  }, [set]);

  const givenSentence =
    set.structuralMode === "SENTENCE_INSERT" ? set.layout?.givenSentence : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-800">
            {set.setLabel || "장문 세트"}
          </span>
          <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
            {set.members.length}문항
          </span>
          {set.status === "DEGRADED" && (
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-100">
              <AlertTriangle className="h-3 w-3" />
              검수 필요
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAnswer((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-slate-700"
        >
          {showAnswer ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> 정답 숨기기
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> 정답 보기
            </>
          )}
        </button>
      </div>

      {givenSentence && (
        <div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
          <span className="mr-1.5 font-semibold text-slate-500">주어진 문장</span>
          {givenSentence}
        </div>
      )}

      <div className="px-5 py-4">
        <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/40 px-4 py-3 text-[13.5px] leading-relaxed text-slate-800">
          {renderMarkedPassage(mergedPassage)}
        </div>
      </div>

      {set.members.map((m, i) => (
        <MemberBlock
          key={m.itemId}
          member={m}
          index={i}
          showAnswer={showAnswer}
          structuralMode={set.structuralMode}
        />
      ))}
    </div>
  );
}
