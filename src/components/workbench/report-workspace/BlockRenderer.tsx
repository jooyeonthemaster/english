"use client";

import { Check, Lightbulb, Star, TriangleAlert } from "lucide-react";
import { type CSSProperties } from "react";

import { extractPlainText, type Block, type BlockStyle } from "@/lib/passage-report/schema";
import { mmToPx } from "@/lib/passage-report/units";

interface BlockRendererProps {
  block: Block;
  mode?: "view" | "edit" | "print";
}

/**
 * 블록 1개를 렌더링. view 모드는 정적 HTML, edit 모드는 Phase 3 에서 Tiptap 활성.
 *
 * 절대좌표 컨테이너 (.report-block-shell) 가 mm → px 변환된 box-sizing 을 잡고,
 * 안쪽 kind별 컴포넌트가 콘텐츠를 그림.
 */
export function BlockRenderer({ block, mode = "view" }: BlockRendererProps) {
  const shellStyle = blockShellStyle(block);

  const inner = (() => {
    switch (block.kind) {
      case "header":
        return <HeaderBlockView block={block} />;
      case "passage-body":
        return <PassageBodyBlockView block={block} />;
      case "vocab-grid":
        return <VocabGridBlockView block={block} />;
      case "grammar-card":
        return <GrammarCardBlockView block={block} />;
      case "syntax-breakdown":
        return <SyntaxBreakdownBlockView block={block} />;
      case "question":
        return <QuestionBlockView block={block} />;
      case "summary-callout":
        return <SummaryCalloutBlockView block={block} />;
      case "analysis-box":
        return <AnalysisBoxBlockView block={block} />;
      case "glossary-table":
        return <GlossaryTableBlockView block={block} />;
      case "divider":
        return <DividerBlockView block={block} />;
    }
  })();

  return (
    <div
      className={`report-block-shell report-block-${block.kind}`}
      data-block-id={block.id}
      data-block-kind={block.kind}
      data-block-mode={mode}
      style={shellStyle}
    >
      {inner}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shell style 계산
// ─────────────────────────────────────────────────────────────

function blockShellStyle(block: Block): CSSProperties {
  const style: CSSProperties = {
    left: `${block.x}mm`,
    top: `${block.y}mm`,
    width: `${block.w}mm`,
    height: `${block.h}mm`,
    zIndex: block.zIndex,
  };
  if (block.rotation) {
    style.transform = `rotate(${block.rotation}deg)`;
    (style as Record<string, string>)["--block-rot"] = `${block.rotation}deg`;
  }
  const s = block.style ?? {};
  if (s.backgroundColor) style.background = s.backgroundColor;
  if (s.color) style.color = s.color;
  if (s.borderColor && (s.borderWidth ?? 0) > 0) {
    style.border = `${s.borderWidth ?? 1}px solid ${s.borderColor}`;
  }
  if (s.borderRadius) style.borderRadius = `${s.borderRadius}px`;
  if (s.paddingMm !== undefined) style.padding = `${s.paddingMm}mm`;
  if (s.fontFamily) style.fontFamily = s.fontFamily;
  if (s.fontSize) style.fontSize = `${s.fontSize}pt`;
  if (s.fontWeight) style.fontWeight = s.fontWeight;
  if (s.textAlign) style.textAlign = s.textAlign;
  if (s.opacity !== undefined) style.opacity = s.opacity;
  if (s.shadow === "soft") style.boxShadow = "0 2px 8px rgba(15,23,42,0.10)";
  if (s.shadow === "elevated") style.boxShadow = "0 6px 18px rgba(15,23,42,0.18)";
  return style;
}

// 다음 줄이 모자라서 import 위치 보정용 helper export (compatibility)
export function blockShellStyleHelper(block: Block): CSSProperties {
  return blockShellStyle(block);
}

// ─────────────────────────────────────────────────────────────
// 개별 블록 view 컴포넌트 (10종)
// 모두 정적 HTML — Tiptap 인스턴스 없음 (Phase 3에서 edit 모드로 mount)
// ─────────────────────────────────────────────────────────────

function HeaderBlockView({ block }: { block: Extract<Block, { kind: "header" }> }) {
  const title = extractPlainText(block.data.title);
  const subtitle = block.data.subtitle ? extractPlainText(block.data.subtitle) : "";
  return (
    <>
      <h1>{title || "제목 없음"}</h1>
      {subtitle ? <div className="report-block-header-subtitle">{subtitle}</div> : null}
      {block.data.badge ? <span className="report-block-header-badge">{block.data.badge}</span> : null}
    </>
  );
}

function PassageBodyBlockView({ block }: { block: Extract<Block, { kind: "passage-body" }> }) {
  const { sentences, showKorean, numbering, lineSpacing } = block.data;
  return (
    <ol style={{ lineHeight: lineSpacing }}>
      {sentences.map((s) => (
        <li key={s.index}>
          {numbering !== "none" ? (
            <span className="report-sentence-num">
              {numbering === "circled" ? circledNumber(s.index + 1) : `${s.index + 1}.`}
            </span>
          ) : null}
          <div style={{ flex: 1 }}>
            <p className="report-sentence-en">{s.english}</p>
            {showKorean && s.korean ? <p className="report-sentence-ko">{s.korean}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function VocabGridBlockView({ block }: { block: Extract<Block, { kind: "vocab-grid" }> }) {
  const { columns, items, showExample, showPronunciation } = block.data;
  return (
    <div
      className="report-vocab-list"
      style={{ ["--vocab-cols" as string]: String(columns) } as CSSProperties}
    >
      {items.map((v) => (
        <div key={v.id} className={`report-vocab-item${v.highlight ? " highlight" : ""}`}>
          <span className="report-vocab-word">{v.word}</span>
          {v.partOfSpeech ? <span className="report-vocab-pos">{v.partOfSpeech}</span> : null}
          {showPronunciation && v.pronunciation ? (
            <span className="report-vocab-pos">{v.pronunciation}</span>
          ) : null}
          <div className="report-vocab-meaning">{v.meaning}</div>
          {showExample && v.example ? <div className="report-vocab-example">{v.example}</div> : null}
        </div>
      ))}
    </div>
  );
}

function GrammarCardBlockView({ block }: { block: Extract<Block, { kind: "grammar-card" }> }) {
  const { pattern, explanation, examples, accentColor } = block.data;
  return (
    <>
      <div
        className="report-grammar-pattern"
        style={accentColor ? { background: `${accentColor}1a`, color: accentColor } : undefined}
      >
        {pattern}
      </div>
      <div className="report-grammar-explanation">{extractPlainText(explanation)}</div>
      {examples.length > 0 ? (
        <ul className="report-grammar-examples">
          {examples.map((ex, idx) => (
            <li key={idx}>{ex}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function SyntaxBreakdownBlockView({ block }: { block: Extract<Block, { kind: "syntax-breakdown" }> }) {
  const { sentence, chunks, notes } = block.data;
  return (
    <>
      <div className="report-syntax-sentence">{sentence}</div>
      {chunks.length > 0 ? (
        <div className="report-syntax-chunks">
          {chunks.map((c, idx) => (
            <span
              key={idx}
              className="report-syntax-chunk"
              data-role={c.role}
              style={c.color ? { background: `${c.color}1a`, color: c.color } : undefined}
            >
              {c.text}
            </span>
          ))}
        </div>
      ) : null}
      {notes ? <div style={{ opacity: 0.85 }}>{extractPlainText(notes)}</div> : null}
    </>
  );
}

function QuestionBlockView({ block }: { block: Extract<Block, { kind: "question" }> }) {
  const { questionType, stem, choices, showAnswer, answerText, explanation } = block.data;
  return (
    <>
      <span className="report-question-type">{questionType}</span>
      <div className="report-question-stem">{extractPlainText(stem)}</div>
      {choices && choices.length > 0 ? (
        <ol className="report-question-choices">
          {choices.map((c, idx) => (
            <li key={idx}>
              <strong>{c.label}</strong> {c.text}
            </li>
          ))}
        </ol>
      ) : null}
      {showAnswer && answerText ? <div>정답: {answerText}</div> : null}
      {explanation ? <div style={{ opacity: 0.8 }}>{extractPlainText(explanation)}</div> : null}
    </>
  );
}

function SummaryCalloutBlockView({ block }: { block: Extract<Block, { kind: "summary-callout" }> }) {
  const { body, icon, title } = block.data;
  return (
    <>
      {title ? (
        <div className="report-callout-title">
          <CalloutIcon icon={icon} />
          {title}
        </div>
      ) : null}
      <div className="report-callout-body">{extractPlainText(body)}</div>
    </>
  );
}

function CalloutIcon({ icon }: { icon: "lightbulb" | "warning" | "check" | "star" | "none" }) {
  // 전문 툴 아이콘(lucide)만 사용 — 이모지 금지. 색은 currentColor 상속.
  const size = 14;
  switch (icon) {
    case "lightbulb":
      return <Lightbulb size={size} aria-hidden />;
    case "warning":
      return <TriangleAlert size={size} aria-hidden />;
    case "check":
      return <Check size={size} aria-hidden />;
    case "star":
      return <Star size={size} aria-hidden />;
    default:
      return null;
  }
}

function AnalysisBoxBlockView({ block }: { block: Extract<Block, { kind: "analysis-box" }> }) {
  const { title, body } = block.data;
  return (
    <>
      {title ? <div className="report-analysis-title">{title}</div> : null}
      <div>{extractPlainText(body)}</div>
    </>
  );
}

function GlossaryTableBlockView({ block }: { block: Extract<Block, { kind: "glossary-table" }> }) {
  const { headers, rows, striped } = block.data;
  return (
    <table className={striped ? "striped" : undefined}>
      <thead>
        <tr>
          {headers.map((h, idx) => (
            <th key={idx}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rIdx) => (
          <tr key={rIdx}>
            {row.map((cell, cIdx) => (
              <td key={cIdx}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DividerBlockView({ block }: { block: Extract<Block, { kind: "divider" }> }) {
  const { variant, color, label } = block.data;
  return (
    <div
      data-variant={variant}
      style={color ? { color } : undefined}
      className="report-block-divider"
    >
      <hr />
      {label ? <span className="report-divider-label">{label}</span> : null}
      <hr />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) {
    return String.fromCodePoint(0x2460 + n - 1); // ① ~ ⑳
  }
  return `(${n})`;
}

// Style 헬퍼는 useShell 같은 외부 컴포넌트가 import 할 수 있게 export
export { mmToPx };
export type { BlockStyle };
