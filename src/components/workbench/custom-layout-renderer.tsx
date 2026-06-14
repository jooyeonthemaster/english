"use client";

import React from "react";

import { markerLabel } from "@/lib/custom-question-types/format-spec";
import {
  choiceItemDisplayText,
  collectAnswerMarkerTokens,
  normalizeMarkerToken,
  readLayoutDocFromStructuredData,
  type LayoutBlock,
  type LayoutChoices,
} from "@/lib/custom-question-types/layout-doc";
import {
  AnswerLine,
  AnswerRevealSection,
  Direction,
  ExplanationSection,
  GivenSentenceBox,
  ModelAnswer,
  PassageBlock,
  renderPassageFormatted,
} from "./question-renderer-primitives";

// ============================================================================
// CustomLayoutRenderer — 커스텀 유형(v2) LayoutDoc 고충실도 렌더러
// ============================================================================
// structuredData.layout(LayoutDoc) 을 블록 단위로 그린다. questionText(마커 미니 DSL)
// 평탄화 경로(시험지/DOCX/HWPX)와 달리, 웹 카드에서는 박스/표/선지 배치까지 원본
// 형식을 재현하는 것이 목적. layout 이 없으면 null 을 반환해 디스패처가 폴백한다.

// ───────────────────────── 블록 렌더 ─────────────────────────

/** TEXT/BOX 공용 — items 를 라벨 + 본문 줄로 나열(라벨 없으면 ①②③ 폴백). */
function BlockItemLines({ block }: { block: LayoutBlock }) {
  if (block.items.length === 0) return null;
  return (
    <div className={block.text.trim() ? "mt-2 space-y-1" : "space-y-1"}>
      {block.items.map((item, i) => (
        <div key={i}>
          <span className="font-bold text-blue-600 mr-1.5">
            {item.label.trim() || markerLabel("CIRCLED_NUM", i)}
          </span>
          {renderPassageFormatted(item.text)}
        </div>
      ))}
    </div>
  );
}

/** CONDITIONS — 기존 ConditionsBox(amber) 대신 slate/blue 톤 자체 구현. */
function ConditionsBlock({ block }: { block: LayoutBlock }) {
  const items = block.items.length
    ? block.items
    : block.text
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ label: "", text }));
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 p-3 space-y-1.5">
      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
        {block.label.trim() || "조건"}
      </span>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="text-[12px] text-slate-700 leading-relaxed flex items-start gap-1.5">
            <span className="shrink-0 font-semibold text-slate-500">
              {item.label.trim() || `${i + 1}.`}
            </span>
            <span>{renderPassageFormatted(item.text)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** EXAMPLE/WORD_BANK — 〈보기〉/〈어휘〉 라벨 박스. 항목 라벨 있으면 줄바꿈, 없으면 " / " 한 줄. */
function ExampleBlock({ block }: { block: LayoutBlock }) {
  const label = block.label.trim() || (block.kind === "EXAMPLE" ? "보기" : "어휘");
  const hasItemLabels = block.items.some((item) => item.label.trim());
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-1.5">
      <span className="block text-center text-[11px] font-bold text-slate-500 tracking-wider">
        〈{label}〉
      </span>
      {block.text.trim() && (
        <div className="text-[12.5px] leading-[1.9] text-slate-700 whitespace-pre-wrap">
          {renderPassageFormatted(block.text)}
        </div>
      )}
      {block.items.length > 0 &&
        (hasItemLabels ? (
          <div className="space-y-1">
            {block.items.map((item, i) => (
              <div key={i} className="text-[12.5px] text-slate-700 leading-relaxed">
                <span className="font-bold text-blue-600 mr-1.5">
                  {item.label.trim() || `${i + 1}.`}
                </span>
                {renderPassageFormatted(item.text)}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12.5px] text-slate-700 leading-relaxed">
            {block.items.map((item) => item.text.trim()).filter(Boolean).join(" / ")}
          </div>
        ))}
    </div>
  );
}

/** LABELED_PARAS — SentenceOrderRenderer 의 단락 카드 톤. */
function LabeledParasBlock({ block }: { block: LayoutBlock }) {
  if (block.items.length === 0) return null;
  return (
    <div className="space-y-2">
      {block.items.map((item, i) => (
        <div key={i} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <span className="text-[11px] font-bold text-blue-600 mr-2">
            {item.label.trim() || markerLabel("PAREN_ALPHA_UPPER", i)}
          </span>
          <span className="text-[12.5px] text-slate-700 leading-relaxed">
            {renderPassageFormatted(item.text)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** TABLE — 실제 <table>. 헤더 행 굵게 + slate-100 bg, 셀은 인라인 DSL 변환. */
function TableBlock({ block }: { block: LayoutBlock }) {
  const headers = block.tableHeaders.map((h) => h.trim()).filter(Boolean);
  return (
    <div className="space-y-1.5">
      {block.label.trim() && (
        <span className="block text-center text-[11px] font-bold text-slate-500 tracking-wider">
          〈{block.label.trim()}〉
        </span>
      )}
      <table className="w-full border-collapse">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-left text-[12px] font-bold text-slate-700"
                >
                  {renderPassageFormatted(header)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {block.tableRows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border border-slate-300 px-2 py-1.5 align-top text-[12px] text-slate-700 leading-relaxed"
                >
                  {renderPassageFormatted(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ANSWER_FORM — 항목별 라벨 + 밑줄 답란 행. */
function AnswerFormBlock({ block }: { block: LayoutBlock }) {
  const items = block.items.length ? block.items : [{ label: "", text: "" }];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
      {block.label.trim() && (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          {block.label.trim()}
        </span>
      )}
      {items.map((item, i) => {
        const label =
          item.label.trim() || (items.length > 1 ? markerLabel("PAREN_ALPHA_UPPER", i) : "답:");
        return (
          <div key={i} className="flex items-end gap-2 text-[12.5px] text-slate-700">
            <span className="shrink-0 font-bold text-blue-600">{label}</span>
            {item.text.trim() && (
              <span className="shrink-0 text-slate-500">{renderPassageFormatted(item.text)}</span>
            )}
            <span className="h-6 flex-1 border-b-2 border-slate-300" />
          </div>
        );
      })}
    </div>
  );
}

function LayoutBlockView({ block }: { block: LayoutBlock }) {
  switch (block.kind) {
    case "GIVEN": {
      const body =
        block.text.trim() ||
        block.items.map((item) => item.text.trim()).filter(Boolean).join(" ");
      if (!body) return null;
      return <GivenSentenceBox sentence={body} label={block.label.trim() || undefined} />;
    }
    case "CONDITIONS":
      return <ConditionsBlock block={block} />;
    case "EXAMPLE":
    case "WORD_BANK":
      return <ExampleBlock block={block} />;
    case "SUMMARY":
      return (
        <div className="space-y-1">
          <div className="text-center text-[15px] font-bold leading-none text-slate-400">↓</div>
          <PassageBlock label={block.label.trim() || "요약문"}>
            {renderPassageFormatted(block.text)}
          </PassageBlock>
        </div>
      );
    case "LABELED_PARAS":
      return <LabeledParasBlock block={block} />;
    case "TABLE":
      return <TableBlock block={block} />;
    case "ANSWER_FORM":
      return <AnswerFormBlock block={block} />;
    case "NOTE":
      return (
        <div className="text-[11.5px] text-slate-500 leading-relaxed whitespace-pre-wrap">
          {block.label.trim() && (
            <span className="font-semibold text-slate-600 mr-1.5">{block.label.trim()}</span>
          )}
          {renderPassageFormatted(block.text)}
        </div>
      );
    case "BOX":
      return (
        <div className="rounded-lg border border-slate-300 bg-white p-4">
          {block.label.trim() && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              {block.label.trim()}
            </span>
          )}
          <div className="text-[12.5px] leading-[1.9] text-slate-700 whitespace-pre-wrap">
            {renderPassageFormatted(block.text)}
            <BlockItemLines block={block} />
          </div>
        </div>
      );
    case "TEXT":
    default:
      return (
        <PassageBlock label={block.label.trim() || undefined}>
          {renderPassageFormatted(block.text)}
          <BlockItemLines block={block} />
        </PassageBlock>
      );
  }
}

// ───────────────────────── 선지 렌더 ─────────────────────────

/** 저장된 마커 라벨 그대로 칩으로 표시(원형 강제 변환 금지 — "(a)"/"㉠" 등 유지). */
function ChoiceMarkerChip({ label, isCorrect }: { label: string; isCorrect: boolean }) {
  return (
    <span
      className={`shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
        isCorrect ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </span>
  );
}

function ChoicesSection({
  choices,
  answerTokens,
}: {
  choices: LayoutChoices;
  answerTokens: Set<string>;
}) {
  if (choices.items.length === 0) return null;
  const rows = choices.items.map((item, i) => {
    const label = item.label.trim() || markerLabel(choices.markerStyle, i);
    return { item, label, isCorrect: answerTokens.has(normalizeMarkerToken(label)) };
  });
  const separator = choices.pairSeparator.trim() ? ` ${choices.pairSeparator.trim()} ` : " — ";
  const columnHeaders = choices.columnHeaders.map((h) => h.trim()).filter(Boolean);

  if (choices.layout === "TABLE") {
    return (
      <table className="w-full border-collapse">
        {columnHeaders.length > 0 && (
          <thead>
            <tr>
              <th className="w-10 border border-slate-300 bg-slate-100 px-2 py-1.5" />
              {columnHeaders.map((header, i) => (
                <th
                  key={i}
                  className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-left text-[12px] font-bold text-slate-700"
                >
                  {renderPassageFormatted(header)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(({ item, label, isCorrect }, i) => (
            <tr key={i}>
              <td className="border border-slate-300 px-2 py-1.5 text-center align-top">
                <ChoiceMarkerChip label={label} isCorrect={isCorrect} />
              </td>
              {(item.cells.length > 0 ? item.cells : [item.text]).map((cell, ci) => (
                <td
                  key={ci}
                  className={`border border-slate-300 px-2 py-1.5 align-top text-[12px] leading-relaxed ${
                    isCorrect ? "text-blue-700 font-semibold" : "text-slate-600"
                  }`}
                >
                  {renderPassageFormatted(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const wrapClass =
    choices.layout === "TWO_COLUMN"
      ? "grid grid-cols-2 gap-x-4 gap-y-1.5 pl-1"
      : choices.layout === "THREE_COLUMN"
        ? "grid grid-cols-3 gap-x-3 gap-y-1.5 pl-1"
        : choices.layout === "INLINE"
          ? "flex flex-wrap gap-x-5 gap-y-1.5 pl-1"
          : "space-y-1.5 pl-1";

  return (
    <div className="space-y-1.5">
      {/* PAIR/TRIPLE 열 헤더(예: (A) — (B))는 선지 목록 위 한 줄로 표시 */}
      {columnHeaders.length > 0 && (
        <div className="flex items-start gap-2 pl-1 text-[12px] font-semibold text-slate-500">
          <span className="h-5 min-w-5 shrink-0 px-1" />
          <span>{columnHeaders.join(separator)}</span>
        </div>
      )}
      <div className={wrapClass}>
        {rows.map(({ item, label, isCorrect }, i) => (
          <div
            key={i}
            className={`text-[13px] flex items-start gap-2 ${
              isCorrect ? "text-blue-700 font-semibold" : "text-slate-600"
            }`}
          >
            <ChoiceMarkerChip label={label} isCorrect={isCorrect} />
            <span>
              {renderPassageFormatted(
                choiceItemDisplayText(item, choices.itemPattern, choices.pairSeparator),
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── 본체 ─────────────────────────

export function CustomLayoutRenderer({ q }: { q: any }) {
  const layout = readLayoutDocFromStructuredData(q);
  if (!layout) return null;

  const correctAnswers: Array<string | null | undefined> = [
    typeof q.correctAnswer === "string" ? q.correctAnswer : null,
    ...(Array.isArray(q.correctAnswers)
      ? q.correctAnswers.filter((v: unknown): v is string => typeof v === "string")
      : []),
  ];
  const answerTokens = collectAnswerMarkerTokens(correctAnswers);
  const isMultipleChoice = !!layout.choices && layout.choices.items.length > 0;
  const explanation = typeof q.explanation === "string" ? q.explanation : "";
  const keyPoints = Array.isArray(q.keyPoints)
    ? q.keyPoints.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const wrongOptionExplanations =
    q.wrongOptionExplanations &&
    typeof q.wrongOptionExplanations === "object" &&
    !Array.isArray(q.wrongOptionExplanations)
      ? (q.wrongOptionExplanations as Record<string, string>)
      : undefined;
  const modelAnswer = String(q.modelAnswer || q.correctAnswer || "");

  return (
    <>
      {layout.direction.trim() && <Direction text={layout.direction} />}
      {layout.blocks.map((block, i) => (
        <LayoutBlockView key={i} block={block} />
      ))}
      {layout.choices && (
        <ChoicesSection choices={layout.choices} answerTokens={answerTokens} />
      )}
      {layout.answerLineCount > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 pb-3 pt-1">
          {Array.from({ length: layout.answerLineCount }).map((_, i) => (
            <div key={i} className="h-8 border-b border-slate-300" />
          ))}
        </div>
      )}
      {isMultipleChoice ? (
        <>
          <AnswerLine answer={typeof q.correctAnswer === "string" ? q.correctAnswer : ""} />
          <ExplanationSection
            explanation={explanation}
            keyPoints={keyPoints}
            wrongOptionExplanations={wrongOptionExplanations}
          />
        </>
      ) : (
        <AnswerRevealSection>
          {modelAnswer && <ModelAnswer answer={modelAnswer} />}
          <ExplanationSection
            explanation={explanation}
            keyPoints={keyPoints}
            wrongOptionExplanations={wrongOptionExplanations}
          />
        </AnswerRevealSection>
      )}
    </>
  );
}
