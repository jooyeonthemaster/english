"use client";

import type { ElementType, ReactNode } from "react";
import { Dice5, Eye, EyeOff, Minus, Plus, Trash2 } from "lucide-react";

import type {
  ActivityBlock,
  ActivityItem,
  ActivityParams,
} from "@/lib/passage-report/analysis-report/schema";
import {
  activityBlockLabel,
  isClozeActivity,
} from "@/lib/passage-report/analysis-report/study-activities";

/** 블록 위 no-print 컨트롤이 에디터로 보내는 액션. */
export type ActivityAction =
  | { type: "reroll" }
  | { type: "param"; patch: Partial<ActivityParams> }
  | { type: "sentences"; sentenceNos?: number[] }
  | { type: "answers"; hidden: boolean }
  | { type: "answerKeyPage"; on: boolean }
  | { type: "blankItem"; index: number; start: number; end: number } // 선택 구간 → 빈칸
  | { type: "remove" };

/**
 * 빈칸형 활동(드래그→빈칸 가능). 임의 단어를 자유롭게 빈칸으로 만드는 유형만 — 빈칸마다 번호가
 * 1:1 로 유일한 종류. (grammar-cloze·vocab-cloze 는 같은 타깃을 전역 치환해 같은 번호가 반복되므로
 * 단순 재번호와 충돌 → 수동 빈칸에서 제외. 자동 빈칸 번호는 모든 유형에서 정상.)
 */
export const CLOZE_BLANKABLE_KINDS: ReadonlySet<string> = new Set([
  "keyword-cloze",
  "full-cloze",
  "nested-cloze",
  "chunk-gloss-cloze",
]);

/** 학생이 직접 쓰는 빈 작성선 n줄. */
function WriteLines({ n }: { n: number }) {
  return (
    <div style={{ marginTop: "0.35em" }}>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          style={{ borderBottom: "1px solid #cbd5e1", height: "1.55em" }}
          aria-hidden
        />
      ))}
    </div>
  );
}

/**
 * 항목별 정답 문자열 (스크램블=원문, cloze=번호 매긴 제거어).
 * 기본은 블록 전체 연속 번호. resetPerItem=true 면 항목(=회차)마다 (1)부터 다시 — nested-cloze 의
 * 회차별 인라인 번호와 정답 페이지 번호를 일치시킨다.
 */
function buildAnswerStrings(items: ActivityItem[], resetPerItem = false): string[] {
  let blankNo = 0;
  return items.map((it) => {
    if (it.answerKey && it.answerKey.length > 0) {
      if (resetPerItem) blankNo = 0;
      return it.answerKey.map((w) => `(${(blankNo += 1)}) ${w}`).join("   ");
    }
    return it.answer || "—";
  });
}

const CTRL_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  height: 24,
  padding: "0 0.5rem",
  borderRadius: 6,
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

type ActivityPart =
  | { type: "item"; index: number; showHeader?: boolean }
  | { type: "empty"; showHeader?: boolean }
  | { type: "wordBank" };

type ActivityItemPatch = Partial<Pick<ActivityItem, "ko" | "prompt" | "answer">>;

export type ActivityTextRenderer = (props: {
  as?: ElementType;
  className?: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  dataAttrs?: Record<string, string>;
}) => ReactNode;

function ActivityControls({
  block,
  onActivity,
}: {
  block: ActivityBlock;
  onActivity?: (id: string, action: ActivityAction) => void;
}) {
  if (!onActivity) return null;
  const cloze = isClozeActivity(block.activityKind);
  const density = block.params.density ?? 30;

  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: "1px dashed #e2e8f0",
      }}
    >
      <button type="button" style={CTRL_BTN} title="다른 배열·빈칸으로 다시 생성" onClick={() => onActivity(block.id, { type: "reroll" })}>
        <Dice5 className="h-3 w-3" /> {cloze ? "새 빈칸" : "다시 섞기"}
      </button>
      {cloze ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#475569", fontWeight: 600 }}>
          빈칸 밀도
          <button
            type="button"
            style={{ ...CTRL_BTN, padding: 0, width: 24, justifyContent: "center" }}
            disabled={density <= 10}
            onClick={() => onActivity(block.id, { type: "param", patch: { density: Math.max(10, density - 10) } })}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span style={{ width: 34, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{density}%</span>
          <button
            type="button"
            style={{ ...CTRL_BTN, padding: 0, width: 24, justifyContent: "center" }}
            disabled={density >= 90}
            onClick={() => onActivity(block.id, { type: "param", patch: { density: Math.min(90, density + 10) } })}
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      ) : null}
      <button
        type="button"
        style={{ ...CTRL_BTN, borderColor: "#e2e8f0", background: "#f8fafc", color: "#475569" }}
        title="이 활동의 정답 표시 토글"
        onClick={() => onActivity(block.id, { type: "answers", hidden: !block.answersHidden })}
      >
        {block.answersHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {block.answersHidden ? "정답 보기" : "정답 숨김"}
      </button>
      <button
        type="button"
        style={{ ...CTRL_BTN, marginLeft: "auto", borderColor: "#fee2e2", background: "#fef2f2", color: "#dc2626" }}
        title="이 학습 활동 삭제"
        onClick={() => onActivity(block.id, { type: "remove" })}
      >
        <Trash2 className="h-3 w-3" /> 삭제
      </button>
    </div>
  );
}

function ActivityHeader({ block }: { block: ActivityBlock }) {
  const head = block.title.trim() || activityBlockLabel(block);
  return (
    <div className="par-ws-minihead">
      <span className="par-ws-minihead-k">{head}</span>
      {block.payload.instructions ? <span className="par-ws-minihead-e">{block.payload.instructions}</span> : null}
    </div>
  );
}

function ActivityItemRow({
  block,
  item,
  index,
  answer,
  renderText,
  onItemPatch,
}: {
  block: ActivityBlock;
  item: ActivityItem;
  index: number;
  answer?: string;
  renderText?: ActivityTextRenderer;
  onItemPatch?: (index: number, patch: ActivityItemPatch) => void;
}) {
  const koPos = block.params.koPosition ?? "none";
  const chipMode = block.params.separator === "chip";
  const koField =
    renderText && (item.ko || onItemPatch)
      ? renderText({
          as: "div",
          className: "par-activity-ko",
          value: item.ko ?? "",
          placeholder: "한글 해석",
          onCommit: (ko) => onItemPatch?.(index, { ko }),
        })
      : item.ko
        ? <div className="par-activity-ko">{item.ko}</div>
        : null;
  const blankable = !!onItemPatch && CLOZE_BLANKABLE_KINDS.has(block.activityKind);
  const promptField = renderText
    ? renderText({
        as: "div",
        className: "par-activity-prompt",
        value: item.prompt,
        placeholder: "문항 내용",
        onCommit: (prompt) => onItemPatch?.(index, { prompt }),
        dataAttrs: blankable ? { "data-activity-blankable": "1", "data-activity-item": String(index) } : undefined,
      })
    : <div className="par-activity-prompt">{item.prompt}</div>;

  return (
    <li className="par-activity-item-row">
      <span className="par-activity-no">{item.no}.</span>
      <div className="par-activity-body">
        {koPos === "above" ? koField : null}
        {chipMode && item.chips && item.chips.length > 0 ? (
          <div className="par-activity-chipline">
            {item.chips.map((c, ci) => (
              <span key={ci} className="par-activity-chip">
                {c}
              </span>
            ))}
          </div>
        ) : (
          promptField
        )}
        {item.writeLines ? <WriteLines n={item.writeLines} /> : null}
        {koPos === "below" ? koField : null}
        {answer ? (
          <div className="par-activity-answer">
            ▸ {answer}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ActivityWordBank({ block }: { block: ActivityBlock }) {
  const words = block.payload.wordBank ?? [];
  if (words.length === 0) return null;
  return (
    <div className="par-activity-wordbank">
      <b style={{ color: "#334155" }}>단어 은행</b>　{words.join("　·　")}
    </div>
  );
}

const MATCH_CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
const MATCH_LETTER = "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷";

/** 매칭 그리드 — 좌측(번호+빈칸) ↔ 우측(기호). 동의어·반의어 매칭 등. */
function ActivityMatchGrid({ match, showAnswer }: { match: NonNullable<ActivityBlock["payload"]["match"]>; showAnswer: boolean }) {
  const circled = (i: number) => MATCH_CIRCLED[i] ?? `(${i + 1})`;
  const lettered = (i: number) => MATCH_LETTER[i] ?? `(${i + 1})`;
  return (
    <div className="par-activity-match">
      <div className="par-activity-match-col">
        {match.leftHead ? <div className="par-activity-match-head">{match.leftHead}</div> : null}
        {match.left.map((l, i) => (
          <div key={i} className="par-activity-match-row">
            <span className="par-activity-match-mk">{circled(i)}</span>
            <span className="par-activity-match-txt">{l}</span>
            <span className="par-activity-match-pick">{showAnswer ? lettered(match.answer[i] ?? 0) : "(　　)"}</span>
          </div>
        ))}
      </div>
      <div className="par-activity-match-col">
        {match.rightHead ? <div className="par-activity-match-head">{match.rightHead}</div> : null}
        {match.right.map((r, i) => (
          <div key={i} className="par-activity-match-row">
            <span className="par-activity-match-mk">{lettered(i)}</span>
            <span className="par-activity-match-txt">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 문장 순서 배열 — [주어진 글] 앵커 박스 + 라벨 카드 + 정답 슬롯. */
function ActivityOrderGrid({ order, showAnswer }: { order: NonNullable<ActivityBlock["payload"]["order"]>; showAnswer: boolean }) {
  return (
    <div className="par-activity-order">
      {order.given ? (
        <div className="par-activity-order-given">
          <span className="par-activity-order-givenlabel">주어진 글</span>
          <div className="par-activity-order-en">{order.given.en}</div>
          {order.given.ko ? <div className="par-activity-order-ko">{order.given.ko}</div> : null}
        </div>
      ) : null}
      <ol className="par-activity-order-cards">
        {order.cards.map((c) => (
          <li key={c.label} className="par-activity-order-card">
            <span className="par-activity-order-badge">{c.label}</span>
            <div className="par-activity-order-body">
              <div className="par-activity-order-en">{c.en}</div>
              {c.ko ? <div className="par-activity-order-ko">{c.ko}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="par-activity-order-answerline">
        <span>→ 정답 순서:</span>
        <span className="par-activity-order-slot">{showAnswer ? order.answer : " "}</span>
      </div>
    </div>
  );
}

function ActivityContent({
  block,
  onActivity,
  items,
  startIndex = 0,
  showHeader = true,
  showWordBank = true,
  renderText,
  onItemPatch,
}: {
  block: ActivityBlock;
  onActivity?: (id: string, action: ActivityAction) => void;
  items: ActivityItem[];
  startIndex?: number;
  showHeader?: boolean;
  showWordBank?: boolean;
  renderText?: ActivityTextRenderer;
  onItemPatch?: (index: number, patch: ActivityItemPatch) => void;
}) {
  const answerStrings = block.answersHidden ? null : buildAnswerStrings(block.payload.items, block.activityKind === "nested-cloze");

  return (
    <>
      {showHeader ? (
        <>
          <ActivityControls block={block} onActivity={onActivity} />
          <ActivityHeader block={block} />
        </>
      ) : null}

      {block.payload.order ? (
        <ActivityOrderGrid order={block.payload.order} showAnswer={!block.answersHidden} />
      ) : block.payload.match ? (
        <ActivityMatchGrid match={block.payload.match} showAnswer={!block.answersHidden} />
      ) : items.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: "0.9em", padding: "0.4em 0" }}>
          이 지문/선택 문장에서 만들 수 있는 항목이 없습니다.
        </div>
      ) : (
        <ol className="par-activity-list">
          {items.map((item, idx) => (
            <ActivityItemRow
              key={item.no}
              block={block}
              item={item}
              index={startIndex + idx}
              answer={answerStrings?.[startIndex + idx]}
              renderText={renderText}
              onItemPatch={onItemPatch}
            />
          ))}
        </ol>
      )}

      {showWordBank ? <ActivityWordBank block={block} /> : null}
    </>
  );
}

export function ActivityNode({
  block,
  onActivity,
}: {
  block: ActivityBlock;
  onActivity?: (id: string, action: ActivityAction) => void;
}) {
  return (
    <div className="par-ws-block par-activity" style={{ breakInside: "avoid" }}>
      <ActivityContent
        block={block}
        onActivity={onActivity}
        items={block.payload.items}
      />
    </div>
  );
}

export function ActivityPagePartNode({
  block,
  onActivity,
  part,
  renderText,
  onItemPatch,
}: {
  block: ActivityBlock;
  onActivity?: (id: string, action: ActivityAction) => void;
  part: ActivityPart;
  renderText?: ActivityTextRenderer;
  onItemPatch?: (index: number, patch: ActivityItemPatch) => void;
}) {
  if (part.type === "wordBank") return <ActivityWordBank block={block} />;
  if (part.type === "empty") {
    return (
      <ActivityContent
        block={block}
        onActivity={onActivity}
        items={[]}
        showHeader={part.showHeader ?? true}
        showWordBank={false}
        renderText={renderText}
        onItemPatch={onItemPatch}
      />
    );
  }

  const item = block.payload.items[part.index];
  if (!item) return null;
  return (
    <ActivityContent
      block={block}
      onActivity={onActivity}
      items={[item]}
      startIndex={part.index}
      showHeader={part.showHeader ?? false}
      showWordBank={false}
      renderText={renderText}
      onItemPatch={onItemPatch}
    />
  );
}

export function ActivityAnswerNode({ block, index }: { block: ActivityBlock; index: number }) {
  const head = block.title.trim() || activityBlockLabel(block);
  const answers = buildAnswerStrings(block.payload.items, block.activityKind === "nested-cloze");
  return (
    <div style={{ breakInside: "avoid", marginBottom: "0.8em" }}>
      <div style={{ fontWeight: 700, fontSize: "0.95em", marginBottom: "0.3em", color: "#334155" }}>
        {index}. {head}
      </div>
      <ol style={{ margin: 0, paddingLeft: "1.4em", fontSize: "0.88em", lineHeight: 1.65, color: "#1e293b" }}>
        {answers.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ol>
    </div>
  );
}
