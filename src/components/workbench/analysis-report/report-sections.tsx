import { type ClipboardEvent, type CSSProperties, type ElementType, type FocusEvent, Fragment, type PointerEvent as ReactPointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import {
  NUMBERED_SECTION_LABELS,
  SECTION_LABELS_EN,
  type AnalysisReport,
  type AnalysisSection,
  type AnnoLayout,
  type CustomBlock,
  type ReportMeta,
  type VocabTestMode,
} from "@/lib/passage-report/analysis-report/schema";
import {
  formatSummaryPairText,
  getConsolidatedWordOrders,
  isSummaryPairWorksheetType,
  normalizeStudentFacingMarkup,
  toStudentVocabularyClozePassage,
  worksheetAnswersAreHidden,
  type WorksheetWordOrder,
} from "@/lib/passage-report/analysis-report/worksheet-surface";
import {
  buildSentenceCanvasPlan,
  planSentenceSplit,
  resolveAnchorRange,
  type CanvasNoteInput,
  type CanvasNoteKind,
  type PlacedNote,
  type SentenceCanvasPlan,
} from "@/lib/passage-report/analysis-report/passage-canvas-model";

import { normalizeEditableText } from "@/components/exams/paper-builder/components/editable-text";
import { CoverSheet, type CoverEdit } from "./cover-templates";

// ─── 편집 컨텍스트 ────────────────────────────────────────────────────────────
export interface SectionEdit {
  commit: (next: AnalysisSection) => void;
}
export interface MetaEdit {
  commit: (next: ReportMeta) => void;
}

/**
 * 줄(문장/표행/도식노드) 단위 flow item.
 * - wrap: 같은 (sectionIndex, wrap) 의 연속 item 은 한 박스/표로 합쳐 렌더.
 * - node: wrap 에 맞는 "내부 콘텐츠" (li 내부 / tr 의 td 들 / 독립 박스 전체).
 */
export type WrapKind =
  | "title"
  | "meta"
  | "note"
  | "passage"
  | "summary"
  | "thesis"
  | "logic"
  | "grammar"
  | "vocab"
  | "vocab-grid"
  | "exam"
  | "reading"
  | "parse"
  | "map"
  | "secheader"
  | "spacer"
  | "custom-text"
  | "cover";

export interface FlowItem {
  id: string;
  sectionIndex: number; // -1 = 타이틀/커스텀/표지
  kind: AnalysisSection["kind"] | "title" | "custom" | "cover";
  no: number;
  wrap: WrapKind;
  node: ReactNode;
  /** 표 행일 때 숨긴 열 키 (thead 와 행이 같은 기준으로 열 생략) */
  hiddenCols?: string[];
  /** 이 블록(보통 섹션 헤더) 앞에서 페이지 강제 분할 — 구조도/필기 섹션을 새 페이지에서 시작 */
  breakBefore?: boolean;
}

/** 표 종류별 열 키(순서) */
export const TABLE_COLUMNS: Record<"grammar" | "exam" | "vocab", { key: string; label: string }[]> = {
  grammar: [
    { key: "sentenceNo", label: "문장" },
    { key: "point", label: "핵심 문법" },
    { key: "explanation", label: "해설 & 출제 포인트" },
  ],
  exam: [
    { key: "type", label: "유형" },
    { key: "asks", label: "무엇을 묻는가" },
    { key: "strategy", label: "대비 전략 & 예시" },
  ],
  vocab: [
    { key: "headword", label: "표제어" },
    { key: "pronunciation", label: "발음" },
    { key: "meaning", label: "뜻 (본문 의미)" },
    { key: "synonyms", label: "동의어" },
    { key: "antonyms", label: "반의어" },
  ],
};

/** table 로 렌더되는 wrap (연속 item → 하나의 표 + thead 반복). */
export const TABLE_WRAPS: ReadonlySet<WrapKind> = new Set<WrapKind>(["grammar", "vocab", "exam"]);
/** par-box + ol 로 렌더되는 wrap. */
export const BOX_LIST_WRAPS: ReadonlySet<WrapKind> = new Set<WrapKind>(["passage", "summary"]);

// ─── 인라인 편집 프리미티브 ──────────────────────────────────────────────────
function Field({
  editable,
  value,
  onCommit,
  as,
  className,
  placeholder = "—",
  render,
}: {
  editable: boolean;
  value: string;
  onCommit: (v: string) => void;
  as?: ElementType;
  className?: string;
  placeholder?: string;
  render?: (v: string) => ReactNode;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = (as ?? "span") as any;
  const ref = useRef<HTMLElement | null>(null);
  const focusedRef = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || focusedRef.current) return;
    if (el.innerText !== value) el.textContent = value;
  }, [value]);

  if (!editable) {
    return <Tag className={className}>{render ? render(value) : value}</Tag>;
  }
  const isEmpty = !value.trim();
  return (
    <Tag
      ref={ref}
      className={cn(className, "par-edit-field", isEmpty && "par-edit-empty")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder}
      dangerouslySetInnerHTML={{ __html: editableTextHtml(value) }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        focusedRef.current = false;
        const next = normalizeEditableText(readEditablePlainText(e.currentTarget));
        if (next !== value) onCommit(next);
      }}
      onPaste={(e: ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}

function editableTextHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function readEditablePlainText(root: HTMLElement): string {
  let out = "";
  const addNewline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      const isBlock = el.tagName === "DIV" || el.tagName === "P" || el.tagName === "LI";
      if (isBlock) addNewline();
      walk(el);
      if (isBlock) addNewline();
    });
  };
  walk(root);
  return out;
}

function DelBtn({ onClick, title = "삭제", className }: { onClick: () => void; title?: string; className?: string }) {
  return (
    <button
      type="button"
      className={cn("par-edit-del par-edit-chrome", className)}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ×
    </button>
  );
}

function highlightKeywords(text: string, keywords?: string[]): ReactNode {
  const kws = (keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 1);
  if (kws.length === 0) return text;
  const set = new Set(kws.map((k) => k.toLowerCase()));
  const escaped = kws
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return text.split(re).map((p, i) =>
    set.has(p.toLowerCase()) ? (
      <mark key={i} className="par-kw">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function renderStudentFacingText(value: string): ReactNode {
  const normalized = normalizeStudentFacingMarkup(value);
  const out: ReactNode[] = [];
  const re = /__(.+?)__/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    if (match.index > cursor) out.push(normalized.slice(cursor, match.index));
    out.push(
      <span key={`u-${match.index}`} className="par-inline-underline">
        {match[1]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < normalized.length) out.push(normalized.slice(cursor));
  return out.length ? out : normalized;
}

export function Arrow() {
  return (
    <div className="par-arrow">
      <div className="par-arrow-line" />
      <div className="par-arrow-head" />
    </div>
  );
}

export function SectionHead({ no, kind, labelKo, labelEn }: { no: number; kind: AnalysisSection["kind"]; labelKo?: string; labelEn?: string }) {
  return (
    <div className="par-sec-head">
      <span className="par-sec-no">{String(no).padStart(2, "0")}</span>
      <span className="par-sec-ko">{labelKo ?? NUMBERED_SECTION_LABELS[kind]}</span>
      <span className="par-sec-en">{labelEn ?? SECTION_LABELS_EN[kind]}</span>
    </div>
  );
}

// ─── 표 헤더 (run 렌더러가 사용) ──────────────────────────────────────────────
// 표 종류별 '기본' 열 비율(보이는 열 합 ~100). 사용자가 세로 구분선을 드래그하면
// report.tableColWidths[group] 에 열키→퍼센트로 저장되어 이 기본값을 대체한다.
const DEFAULT_TABLE_COL_PCT: Record<string, Record<string, number>> = {
  grammar: { sentenceNo: 8, point: 27, explanation: 65 },
  exam: { type: 16, asks: 24, strategy: 60 },
  vocab: { headword: 22, pronunciation: 16, meaning: 34, synonyms: 14, antonyms: 14 },
};
const EDIT_HANDLE_COLUMN_WIDTH = "6mm";
const EDIT_HANDLE_COLUMN_PERCENT = 3.448276;

/** 보이는 열들의 너비(%)를 해석 — override(저장값) 우선, 없으면 기본 비율. 편집 모드는 핸들열 폭만큼 축소. */
function resolveColumnWidths(
  group: string,
  visibleKeys: string[],
  editable: boolean,
  overrides?: Record<string, number>,
): Record<string, string> {
  const base = DEFAULT_TABLE_COL_PCT[group] ?? {};
  const vals = visibleKeys.map((k) => overrides?.[k] ?? base[k] ?? 0);
  const total = vals.reduce((sum, v) => sum + v, 0) || 1;
  const available = editable ? 100 - EDIT_HANDLE_COLUMN_PERCENT : 100;
  const out: Record<string, string> = {};
  visibleKeys.forEach((k, i) => {
    out[k] = `${(vals[i] / total) * available}%`;
  });
  return out;
}

export type TableColResize = {
  overrides?: Record<string, number>;
  onDraft?: (widths: Record<string, number>) => void;
  onCommit?: (widths: Record<string, number>) => void;
};

export function tableHeadRow(
  wrap: WrapKind,
  editable: boolean,
  hiddenCols?: string[],
  resize?: TableColResize,
): ReactNode {
  const group = wrap === "grammar" ? "grammar" : wrap === "exam" ? "exam" : "vocab";
  const hidden = new Set(hiddenCols ?? []);
  const visibleCols = TABLE_COLUMNS[group].filter((c) => !hidden.has(c.key));
  const visibleKeys = visibleCols.map((c) => c.key);
  const widths = resolveColumnWidths(group, visibleKeys, editable, resize?.overrides);
  const canResize = editable && !!resize?.onDraft && !!resize?.onCommit;
  return (
    <tr>
      {editable ? <th className="par-edit-hcell" style={{ width: EDIT_HANDLE_COLUMN_WIDTH }} /> : null}
      {visibleCols.map((c, i) => (
        <th
          key={c.key}
          data-col-key={c.key}
          style={{ width: widths[c.key], position: canResize ? "relative" : undefined }}
        >
          {c.label}
          {canResize && i < visibleCols.length - 1 ? (
            <ColResizeHandle
              leftKey={c.key}
              rightKey={visibleCols[i + 1].key}
              onDraft={resize!.onDraft!}
              onCommit={resize!.onCommit!}
            />
          ) : null}
        </th>
      ))}
    </tr>
  );
}

/**
 * 표 열 사이의 세로 구분선 드래그 핸들. thead th 들의 현재 실제 너비(px)를 읽어
 * 퍼센트로 환산한 뒤, 인접한 두 열만 합을 유지하며 조절한다(나머지 열은 그대로).
 * 드래그 중엔 onDraft 로 미리보기, 놓을 때 onCommit 으로 저장.
 */
function ColResizeHandle({
  leftKey,
  rightKey,
  onDraft,
  onCommit,
}: {
  leftKey: string;
  rightKey: string;
  onDraft: (widths: Record<string, number>) => void;
  onCommit: (widths: Record<string, number>) => void;
}) {
  const dragRef = useRef<{ startX: number; contentPx: number; startPct: Record<string, number>; next: Record<string, number> } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const table = e.currentTarget.closest("table");
    if (!table) return;
    const ths = Array.from(table.querySelectorAll<HTMLElement>("thead th[data-col-key]"));
    const startPct: Record<string, number> = {};
    let contentPx = 0;
    const px: Record<string, number> = {};
    for (const th of ths) {
      const key = th.getAttribute("data-col-key");
      if (!key) continue;
      const w = th.getBoundingClientRect().width;
      px[key] = w;
      contentPx += w;
    }
    if (contentPx <= 0) return;
    for (const k of Object.keys(px)) startPct[k] = (px[k] / contentPx) * 100;
    dragRef.current = { startX: e.clientX, contentPx, startPct, next: startPct };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const s = dragRef.current;
    if (!s) return;
    const MIN = 6;
    let d = ((e.clientX - s.startX) / s.contentPx) * 100;
    d = Math.max(-(s.startPct[leftKey] - MIN), Math.min(s.startPct[rightKey] - MIN, d));
    const next: Record<string, number> = { ...s.startPct };
    next[leftKey] = Math.round((s.startPct[leftKey] + d) * 10) / 10;
    next[rightKey] = Math.round((s.startPct[rightKey] - d) * 10) / 10;
    s.next = next;
    onDraft(next);
  };

  const end = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const s = dragRef.current;
    if (!s) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onCommit(s.next);
  };

  return (
    <span
      className="par-col-resize par-edit-chrome"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onMouseDown={(e) => e.stopPropagation()}
      title="드래그해서 열 너비 조절"
      aria-hidden
    />
  );
}

function vocabTestHiddenCols(hiddenCols: string[] | undefined, mode: VocabTestMode): string[] {
  const hidden = new Set(hiddenCols ?? []);
  hidden.add("synonyms");
  hidden.add("antonyms");
  if (mode === "hide-meaning") {
    hidden.delete("headword");
    hidden.delete("meaning");
  }
  if (mode === "hide-headword") {
    hidden.delete("headword");
    hidden.delete("meaning");
    hidden.add("pronunciation");
  }
  return [...hidden];
}

function VocabBlankCell({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <td className={cn("par-vocab-answer-cell", className)}>
      <span className="par-vocab-answer-box" aria-hidden>
        <span className="par-vocab-answer-line" />
      </span>
      {children}
    </td>
  );
}

type VocabularyRow = Extract<AnalysisSection, { kind: "vocabulary" }>["rows"][number];
type PassageSection = Extract<AnalysisSection, { kind: "passage" }>;
type GrammarSection = Extract<AnalysisSection, { kind: "grammar" }>;
type ExamFocusSection = Extract<AnalysisSection, { kind: "exam-focus" }>;
type VocabularySection = Extract<AnalysisSection, { kind: "vocabulary" }>;
type ParsingSection = Extract<AnalysisSection, { kind: "parsing" }>;
type LearningWorksheetSection = Extract<AnalysisSection, { kind: "learning-worksheet" }>;
type WorksheetQuestion = LearningWorksheetSection["questions"][number];
type WorksheetInferenceQuestion = NonNullable<LearningWorksheetSection["inferenceSet"]>["questions"][number];
type WorksheetQuestionView = WorksheetQuestion | WorksheetInferenceQuestion;
type WorksheetQuestionPatch = Partial<WorksheetQuestion> & Partial<Pick<WorksheetInferenceQuestion, "typeLabel">>;
type SectionFlowOptions = {
  vocabTestOnly?: boolean;
  allSections?: AnalysisSection[];
  sectionEdit?: (i: number) => SectionEdit;
  skipWorksheetLogic?: boolean;
  /** 01 원문 렌더 모드. "legacy" 면 구 스택 카드, 그 외(기본)면 신규 필기 캔버스. */
  passageLayout?: "hlc" | "legacy";
  /** passage 섹션 렌더 뷰. "clean"=원문+해석만, "annotated"=필기 캔버스(기본). */
  passageRenderMode?: "clean" | "annotated";
};

function vocabTestRowKey(row: VocabularyRow): string {
  return [row.headword, row.pronunciation ?? "", row.meaning, row.synonyms ?? ""]
    .map((value) => value.trim())
    .join("\u001f");
}

function VocabTestGridCard({
  row,
  hidden,
  mode,
  editable,
  onExclude,
}: {
  row: VocabularyRow;
  hidden: Set<string>;
  mode: VocabTestMode;
  editable: boolean;
  onExclude: () => void;
}) {
  const showHead = !hidden.has("headword");
  const showPron = !hidden.has("pronunciation");
  const showMeaning = !hidden.has("meaning");
  return (
    <div className="par-vocab-test-card">
      {editable ? <DelBtn className="par-vocab-test-card-exclude" title="이 단어를 시험지에서 제외" onClick={onExclude} /> : null}
      {(showHead || showPron) ? (
        <div className="par-vocab-test-card-head">
          {showHead ? (
            mode === "hide-headword" ? (
              <span className="par-vocab-test-card-blank" />
            ) : (
              <span className="par-vocab-test-card-word">{row.headword}</span>
            )
          ) : null}
          {showPron ? (
            <span className="par-vocab-test-card-pron">{row.pronunciation ?? ""}</span>
          ) : null}
        </div>
      ) : null}
      {showMeaning ? (
        <div className="par-vocab-test-card-line">
          <span className="par-vocab-test-card-label">뜻</span>
          {mode === "hide-meaning" ? <span className="par-vocab-test-card-blank" /> : <span>{row.meaning}</span>}
        </div>
      ) : null}
    </div>
  );
}

function WorksheetMiniTitle({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div className="par-ws-minihead">
      <span className="par-ws-minihead-k">{title}</span>
      {kicker ? <span className="par-ws-minihead-e">{kicker}</span> : null}
    </div>
  );
}

function WordBank({ words }: { words?: string[] }) {
  if (!words || words.length === 0) return null;
  return (
    <div className="par-ws-wordbank">
      <span className="par-ws-wordbank-k">단어 목록</span>
      <span className="par-ws-wordbank-list">{words.join(" · ")}</span>
    </div>
  );
}

function WorksheetQuestionCard({
  q,
  editable,
  hiddenAnswers,
  onPatch,
}: {
  q: WorksheetQuestionView;
  editable: boolean;
  hiddenAnswers?: boolean;
  onPatch: (patch: WorksheetQuestionPatch) => void;
}) {
  const displayType = "typeLabel" in q && q.typeLabel ? q.typeLabel : q.type;
  const isSummaryPair = isSummaryPairWorksheetType(q.type, "typeLabel" in q ? q.typeLabel : undefined);
  const choiceText = (text: string) =>
    normalizeStudentFacingMarkup(isSummaryPair ? formatSummaryPairText(text) : text);
  const promptValue = normalizeStudentFacingMarkup(q.prompt);
  const passageValue = q.passage ? normalizeStudentFacingMarkup(q.passage) : "";
  return (
    <div className="par-ws-question">
      <div className="par-ws-qtop">
        <span className="par-ws-qno">Q{q.no}</span>
        <Field
          as="span"
          className="par-ws-qtype"
          editable={editable}
          value={displayType}
          onCommit={(v) => onPatch("typeLabel" in q ? { typeLabel: v } : { type: v })}
        />
      </div>
      <Field
        as="div"
        className="par-ws-qprompt"
        editable={editable}
        value={promptValue}
        onCommit={(v) => onPatch({ prompt: normalizeStudentFacingMarkup(v) })}
        render={renderStudentFacingText}
      />
      {q.passage ? (
        <Field
          as="div"
          className="par-ws-qpassage"
          editable={editable}
          value={passageValue}
          onCommit={(v) => onPatch({ passage: normalizeStudentFacingMarkup(v) })}
          render={renderStudentFacingText}
        />
      ) : null}
      <ol className="par-ws-choices">
        {q.choices.map((choice, i) => (
          <li key={`${choice.label}-${i}`}>
            <span className="par-ws-choice-label">{choice.label}</span>
            <Field
              as="span"
              editable={editable}
              value={choiceText(choice.text)}
              render={renderStudentFacingText}
              onCommit={(v) =>
                onPatch({
                  choices: q.choices.map((item, j) => (i === j ? { ...item, text: normalizeStudentFacingMarkup(v) } : item)),
                })
              }
            />
          </li>
        ))}
      </ol>
      {!hiddenAnswers ? (
        <div className="par-ws-answer">
          <div className="par-ws-answer-main">
            <span className="par-ws-answer-label">정답</span>
            <Field as="span" editable={editable} value={q.answerLabel} onCommit={(v) => onPatch({ answerLabel: v })} />
            {q.answerText ? (
              <Field as="span" className="par-ws-answer-text" editable={editable} value={isSummaryPair ? formatSummaryPairText(q.answerText) : q.answerText} onCommit={(v) => onPatch({ answerText: v })} />
            ) : null}
          </div>
          <Field as="div" className="par-ws-expl" editable={editable} value={q.explanation} onCommit={(v) => onPatch({ explanation: v })} />
          {q.distractors?.length ? (
            <table className="par-ws-distractors">
              <tbody>
                {q.distractors.map((d, i) => (
                  <tr key={`${d.label}-${i}`}>
                    <td>{d.label}</td>
                    <td>{d.type}</td>
                    <td>
                      <Field
                        as="span"
                        editable={editable}
                        value={d.reason}
                        onCommit={(v) =>
                          onPatch({
                            distractors: q.distractors?.map((item, j) => (i === j ? { ...item, reason: v } : item)),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── 타이틀/메타 ──────────────────────────────────────────────────────────────
function AnswerText({ children }: { children: ReactNode }) {
  return <span className="par-ws-answer-text">{children}</span>;
}

function WorksheetQuestionAnswer({ q }: { q: WorksheetQuestionView }) {
  return (
    <div className="par-ws-answer">
      <div className="par-ws-answer-main">
        <span className="par-ws-answer-label">Q{q.no}</span>
        <b>{q.answerLabel}</b>
        {q.answerText ? (
          <AnswerText>
            {isSummaryPairWorksheetType(q.type, "typeLabel" in q ? q.typeLabel : undefined)
              ? formatSummaryPairText(q.answerText)
              : q.answerText}
          </AnswerText>
        ) : null}
      </div>
      <div className="par-ws-expl">{q.explanation}</div>
      {q.distractors?.length ? (
        <table className="par-ws-distractors">
          <tbody>
            {q.distractors.map((d, i) => (
              <tr key={`${d.label}-${i}`}>
                <td>{d.label}</td>
                <td>{d.type}</td>
                <td>{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * 정답·해설을 "서브섹션별 독립 블록"으로 빌드한다.
 * 과거엔 전체 정답키를 하나의 .par-ws-block(break-inside:avoid)으로 push 했는데,
 * 정답키가 한 페이지(250mm)를 넘기면 .par-sheet{overflow:hidden} 에 의해 잘려 보이던 문제.
 * 각 표/문항을 별도 블록으로 내보내면 페이지네이터가 자연스럽게 여러 장에 흘려 담는다.
 */
function worksheetAnswerKeySubsections(
  section: LearningWorksheetSection,
  wordOrders: WorksheetWordOrder[],
): { key: string; node: ReactNode }[] {
  const workbook = section.workbookSet;
  const clozeItems = section.cloze?.items ?? [];
  const practiceItems = section.practice?.items ?? [];
  const drillGrammarChoices = section.drills?.grammarChoices ?? [];
  const inferenceQuestions = section.inferenceSet?.questions ?? [];
  const extraQuestions = section.questions ?? [];

  const subs: { key: string; node: ReactNode }[] = [];
  // "정답 및 해설" 헤더는 첫 번째 블록에만 붙여 고아 헤더(페이지 하단에 제목만 남는 것)를 막는다.
  const wrap = (key: string, inner: ReactNode) => {
    const withTitle = subs.length === 0;
    subs.push({
      key,
      node: (
        <div className="par-ws-block par-ws-answer-key">
          {withTitle ? <WorksheetMiniTitle title="정답 및 해설" kicker="Answer Key" /> : null}
          {inner}
        </div>
      ),
    });
  };

  if (clozeItems.length) {
    wrap(
      "cloze",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{section.cloze?.title ?? "Key Phrase Cloze"}</div>
        <table className="par-ws-key-table">
          <tbody>
            {clozeItems.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answers.join(", ")}</td>
                <td>{item.translation ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (practiceItems.length) {
    wrap(
      "practice",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{section.practice?.title ?? "Practice"}</div>
        <table className="par-ws-key-table">
          <tbody>
            {practiceItems.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answers.join(", ")}</td>
                <td>{item.sentenceNo ? `S${item.sentenceNo}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (drillGrammarChoices.length) {
    wrap(
      "drill-grammar",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">어법 선택</div>
        <table className="par-ws-key-table">
          <tbody>
            {drillGrammarChoices.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answer}</td>
                <td>{item.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (workbook) {
    wrap(
      "workbook-grammar",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{workbook.grammarSelection.title}</div>
        <table className="par-ws-key-table">
          <tbody>
            {workbook.grammarSelection.choices.map((choice) => (
              <tr key={choice.no}>
                <td>{choice.no}</td>
                <td>{choice.answer}</td>
                <td>{choice.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    wrap(
      "workbook-vocab",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{workbook.vocabularyCloze.title}</div>
        <table className="par-ws-key-table">
          <tbody>
            {workbook.vocabularyCloze.blanks.map((blank) => (
              <tr key={blank.no}>
                <td>{blank.no}</td>
                <td>{blank.answer}</td>
                <td>{[blank.meaning, blank.clue].filter(Boolean).join(" / ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (wordOrders.length) {
    wrap(
      "word-order",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">주요문장 단어배열 영작</div>
        <table className="par-ws-key-table">
          <tbody>
            {wordOrders.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answer}</td>
                <td>{item.korean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  // 문항별 정답·해설은 '각각' 독립 블록으로 내보낸다. 예전엔 전 문항(추론 Q1~Q5 +
  // 추가 문항)을 하나의 break-inside:avoid 블록으로 묶어, 5문항+오답표가 한 페이지(250mm)를
  // 넘기면 마지막 장이 .par-sheet{overflow:hidden} 에 잘려 보이던 문제. 문항 단위로 쪼개면
  // 페이지네이터가 여러 장에 자연스럽게 흘려 담아 잘림이 사라진다.
  inferenceQuestions.forEach((q) =>
    wrap(`q-inf-${q.no}`, <div className="par-ws-answer-subsection"><WorksheetQuestionAnswer q={q} /></div>),
  );
  extraQuestions.forEach((q) =>
    wrap(`q-extra-${q.no}`, <div className="par-ws-answer-subsection"><WorksheetQuestionAnswer q={q} /></div>),
  );

  return subs;
}

type GrammarNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: GrammarSection;
  row: GrammarSection["rows"][number];
};

type LogicNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: LearningWorksheetSection;
  row: LearningWorksheetSection["logicRows"][number];
};

type ExamNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: ExamFocusSection;
  row: ExamFocusSection["rows"][number];
};
type VocabularyNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: VocabularySection;
  row: VocabularyRow;
};

type ParsingNoteRef = {
  sectionIndex: number;
  itemIndex: number;
  section: ParsingSection;
  item: ParsingSection["items"][number];
};

function pushGrouped<T>(map: Map<number, T[]>, key: number | undefined, value: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

const CIRCLED_SENTENCE_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function validSentenceNos(values: number[], sentences: PassageSection["sentences"]): number[] {
  const available = new Set(sentences.map((sentence) => sentence.n));
  const seen = new Set<number>();
  return values.filter((value) => {
    if (!Number.isInteger(value) || !available.has(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeExamLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z0-9가-힣]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExplicitSentenceNos(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const index = CIRCLED_SENTENCE_NUMBERS.indexOf(char);
    if (index >= 0) out.push(index + 1);
  }

  const patterns = [
    /\bS\s*(\d{1,2})\b/gi,
    /\bsentence\s*(\d{1,2})\b/gi,
    /문장\s*(\d{1,2})/g,
    /(\d{1,2})\s*(?:번|번째)\s*문장/g,
    /(\d{1,2})\s*번(?:의|에|에서)?/g,
  ];
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) out.push(Number(match[1]));
  });
  return out;
}

function extractQuotedExamPhrases(text: string): string[] {
  const phrases: string[] = [];
  const patterns = [/"([^"]{4,})"/g, /'([^']{4,})'/g, /“([^”]{4,})”/g, /‘([^’]{4,})’/g];
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const normalized = normalizeExamLookupText(match[1] ?? "");
      if (normalized.length >= 4) phrases.push(normalized);
    }
  });
  return [...new Set(phrases)];
}

const EXAM_PLACEMENT_STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "from", "into", "what", "when", "where", "which", "because", "rather",
  "문장", "지문", "글", "핵심", "정답", "오답", "선지", "유형", "출제", "대비", "전략", "예시", "문맥", "주변",
  "주제", "제목", "요지", "빈칸", "추론", "어휘", "해요", "돼요", "있어요", "고르면", "묻는가", "무엇",
]);

function examPlacementTokens(text: string): string[] {
  return normalizeExamLookupText(text)
    .split(" ")
    .filter((token) => {
      if (EXAM_PLACEMENT_STOPWORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return false;
      return /[a-z]/.test(token) ? token.length >= 4 : token.length >= 2;
    });
}

function scoreExamSentence(rowText: string, phrases: string[], sentence: PassageSection["sentences"][number]): number {
  const sentenceLookup = normalizeExamLookupText(`${sentence.en} ${sentence.ko}`);
  const sentenceTokens = new Set(sentenceLookup.split(" "));
  let score = 0;

  phrases.forEach((phrase) => {
    if (sentenceLookup.includes(phrase)) score += 20 + Math.min(8, phrase.length / 8);
  });

  for (const token of new Set(examPlacementTokens(rowText))) {
    if (/[a-z]/.test(token)) {
      if (sentenceTokens.has(token)) score += Math.min(4, token.length / 3);
    } else if (sentenceLookup.includes(token)) {
      score += Math.min(4, token.length / 2);
    }
  }

  return score;
}

function inferExamSentenceNos(row: ExamFocusSection["rows"][number], sentences: PassageSection["sentences"]): number[] {
  if (!sentences.length) return [];
  const haystack = `${row.type} ${row.asks ?? ""} ${row.strategy ?? ""}`;
  const direct = validSentenceNos([row.sentenceNo ?? 0, ...extractExplicitSentenceNos(haystack)], sentences);
  if (direct.length) return [direct[0]];

  const phrases = extractQuotedExamPhrases(haystack);
  const scored = sentences
    .map((sentence) => ({
      sentence,
      score: scoreExamSentence(haystack, phrases, sentence),
    }))
    .sort((a, b) => b.score - a.score || b.sentence.n - a.sentence.n);

  if ((scored[0]?.score ?? 0) > 0) return [scored[0].sentence.n];
  return [sentences[sentences.length - 1].n];
}

function normalizeVocabularyLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleWordForms(word: string): string[] {
  const forms = new Set<string>([word]);
  if (word.length < 3) return [...forms];

  forms.add(`${word}s`);
  forms.add(`${word}es`);

  if (word.endsWith("e")) {
    forms.add(`${word}d`);
    forms.add(`${word.slice(0, -1)}ing`);
  } else {
    forms.add(`${word}ed`);
    forms.add(`${word}ing`);
  }

  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }

  return [...forms];
}

function vocabularyLookupForms(headword: string): string[] {
  const normalized = normalizeVocabularyLookupText(headword);
  if (!normalized) return [];
  const words = normalized.split(" ");
  if (words.length === 1) {
    return simpleWordForms(words[0]).filter((form) => form.length > 2);
  }

  const prefix = words.slice(0, -1).join(" ");
  const last = words[words.length - 1];
  return simpleWordForms(last)
    .map((form) => `${prefix} ${form}`)
    .filter((form) => form.replace(/\s+/g, "").length > 2);
}

function sentenceIncludesVocabulary(sentenceEn: string, row: VocabularyRow): boolean {
  const lookupSentence = ` ${normalizeVocabularyLookupText(sentenceEn)} `;
  return vocabularyLookupForms(row.headword).some((form) => lookupSentence.includes(` ${form} `));
}

function normalizedTextWithOffsets(value: string): { text: string; chars: { char: string; start: number; end: number }[] } {
  const chars: { char: string; start: number; end: number }[] = [];
  let lastWasSpace = true;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (/[a-z0-9]/i.test(char)) {
      chars.push({ char: char.toLowerCase(), start: i, end: i + 1 });
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      chars.push({ char: " ", start: i, end: i + 1 });
      lastWasSpace = true;
    }
  }

  while (chars.at(-1)?.char === " ") chars.pop();
  return { text: chars.map((item) => item.char).join(""), chars };
}

function findVocabularyInlineMatches(text: string, notes: VocabularyNoteRef[]) {
  const normalized = normalizedTextWithOffsets(text);
  const candidates: { start: number; end: number; note: VocabularyNoteRef }[] = [];

  notes.forEach((note) => {
    vocabularyLookupForms(note.row.headword).forEach((form) => {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^| )(${escaped})(?= |$)`, "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(normalized.text)) !== null) {
        const normalizedStart = match.index + match[1].length;
        const normalizedEnd = normalizedStart + match[2].length;
        const first = normalized.chars[normalizedStart];
        const last = normalized.chars[normalizedEnd - 1];
        if (first && last) candidates.push({ start: first.start, end: last.end, note });
      }
    });
  });

  return candidates
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.note.rowIndex - b.note.rowIndex)
    .reduce<typeof candidates>((selected, candidate) => {
      const overlaps = selected.some((item) => candidate.start < item.end && item.start < candidate.end);
      if (!overlaps) selected.push(candidate);
      return selected;
    }, []);
}

function vocabularyGlossLabel(note: VocabularyNoteRef): string {
  return [note.row.headword, note.row.pronunciation].filter((value) => value?.trim()).join(" ");
}

function renderAnnotatedReadingText(text: string, highlights: string[], vocabNotes: VocabularyNoteRef[]): ReactNode {
  const matches = findVocabularyInlineMatches(text, vocabNotes);
  if (!matches.length) return highlightKeywords(text, highlights);

  const nodes: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      nodes.push(<Fragment key={`t-${cursor}`}>{highlightKeywords(text.slice(cursor, match.start), highlights)}</Fragment>);
    }
    const surface = text.slice(match.start, match.end);
    nodes.push(
      <span key={`v-${match.note.sectionIndex}-${match.note.rowIndex}-${index}`} className="par-read-word-note">
        <span className="par-read-word-surface">{surface}</span>
        <span className="par-read-word-gloss" contentEditable={false} data-par-ignore="true">
          <span className="par-read-word-gloss-head">{vocabularyGlossLabel(match.note)}</span>
          <span className="par-read-word-gloss-meaning">{match.note.row.meaning}</span>
        </span>
      </span>,
    );
    cursor = match.end;
  });

  if (cursor < text.length) nodes.push(<Fragment key={`t-${cursor}`}>{highlightKeywords(text.slice(cursor), highlights)}</Fragment>);
  return nodes;
}

function readEditableTextIgnoringAnnotations(root: HTMLElement): string {
  let out = "";
  const addNewline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.dataset.parIgnore === "true") return;
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      const isBlock = el.tagName === "DIV" || el.tagName === "P" || el.tagName === "LI";
      if (isBlock) addNewline();
      walk(el);
      if (isBlock) addNewline();
    });
  };
  walk(root);
  return out;
}

function AnnotatedReadingField({
  editable,
  value,
  onCommit,
  highlights,
  vocabNotes,
}: {
  editable: boolean;
  value: string;
  onCommit: (v: string) => void;
  highlights: string[];
  vocabNotes: VocabularyNoteRef[];
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const isEmpty = !value.trim();
  if (!editable) {
    return <p className="par-read-en par-read-en-annotated">{renderAnnotatedReadingText(value, highlights, vocabNotes)}</p>;
  }

  return (
    <p
      ref={ref}
      className={cn("par-read-en par-read-en-annotated par-edit-field", isEmpty && "par-edit-empty")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph="—"
      onBlur={(e: FocusEvent<HTMLElement>) => {
        const next = normalizeEditableText(readEditableTextIgnoringAnnotations(e.currentTarget));
        if (next !== value) onCommit(next);
      }}
      onPaste={(e: ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, pasted);
      }}
    >
      {renderAnnotatedReadingText(value, highlights, vocabNotes)}
    </p>
  );
}

function collectPassageStudyNotes(sections: AnalysisSection[], sentences: PassageSection["sentences"]) {
  const grammarBySentence = new Map<number, GrammarNoteRef[]>();
  const logicBySentence = new Map<number, LogicNoteRef[]>();
  const examBySentence = new Map<number, ExamNoteRef[]>();
  const vocabBySentence = new Map<number, VocabularyNoteRef[]>();
  const parsingBySentence = new Map<number, ParsingNoteRef[]>();
  const globalExam: ExamNoteRef[] = [];

  sections.forEach((section, sectionIndex) => {
    if (section.kind === "grammar") {
      section.rows.forEach((row, rowIndex) => pushGrouped(grammarBySentence, row.sentenceNo, { sectionIndex, rowIndex, section, row }));
    }
    if (section.kind === "learning-worksheet") {
      section.logicRows.forEach((row, rowIndex) => pushGrouped(logicBySentence, row.sentenceNo, { sectionIndex, rowIndex, section, row }));
    }
    if (section.kind === "exam-focus") {
      section.rows.forEach((row, rowIndex) => {
        const ref = { sectionIndex, rowIndex, section, row };
        const sentenceNos = inferExamSentenceNos(row, sentences);
        if (sentenceNos.length) sentenceNos.forEach((sentenceNo) => pushGrouped(examBySentence, sentenceNo, ref));
        else globalExam.push(ref);
      });
    }
    if (section.kind === "vocabulary") {
      section.rows.forEach((row, rowIndex) => {
        const ref = { sectionIndex, rowIndex, section, row };
        sentences.forEach((sentence) => {
          if (sentenceIncludesVocabulary(sentence.en, row)) pushGrouped(vocabBySentence, sentence.n, ref);
        });
      });
    }
    if (section.kind === "parsing") {
      section.items.forEach((item, itemIndex) => pushGrouped(parsingBySentence, item.sentenceNo, { sectionIndex, itemIndex, section, item }));
    }
  });

  return { grammarBySentence, logicBySentence, examBySentence, vocabBySentence, parsingBySentence, globalExam };
}

function patchGrammarNote(note: GrammarNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<GrammarNoteRef["row"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    rows: note.section.rows.map((row, index) => (index === note.rowIndex ? { ...row, ...patch } : row)),
  });
}

function patchLogicNote(note: LogicNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<LogicNoteRef["row"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    logicRows: note.section.logicRows.map((row, index) => (index === note.rowIndex ? { ...row, ...patch } : row)),
  });
}

function patchExamNote(note: ExamNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<ExamNoteRef["row"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    rows: note.section.rows.map((row, index) => (index === note.rowIndex ? { ...row, ...patch } : row)),
  });
}

function patchParsingNote(note: ParsingNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<ParsingNoteRef["item"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    items: note.section.items.map((item, index) => (index === note.itemIndex ? { ...item, ...patch } : item)),
  });
}

function ReadLogicNote({ note, editable, sectionEdit }: { note: LogicNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div className="par-read-note par-read-note-logic">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={note.row.functionLabel}
        onCommit={(v) => patchLogicNote(note, sectionEdit, { functionLabel: v })}
      />
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={note.row.keyPoint}
        onCommit={(v) => patchLogicNote(note, sectionEdit, { keyPoint: v })}
      />
    </div>
  );
}

export function ReadGrammarNote({ note, editable, sectionEdit }: { note: GrammarNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div className="par-read-note par-read-note-grammar">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={note.row.point}
        onCommit={(v) => patchGrammarNote(note, sectionEdit, { point: v })}
      />
      {note.row.excerpt || editable ? (
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.excerpt ?? ""}
          placeholder="(원문 구절)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { excerpt: v })}
        />
      ) : null}
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={note.row.explanation}
        onCommit={(v) => patchGrammarNote(note, sectionEdit, { explanation: v })}
      />
      {note.row.trap || editable ? (
        <Field
          as="span"
          className="par-read-note-trap"
          editable={editable}
          value={note.row.trap ?? ""}
          placeholder="(함정 포인트)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { trap: v })}
        />
      ) : null}
    </div>
  );
}

function ReadExamNote({ note, editable, sectionEdit }: { note: ExamNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div className="par-read-note par-read-note-exam">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={note.row.type}
        onCommit={(v) => patchExamNote(note, sectionEdit, { type: v })}
      />
      {note.row.asks || editable ? (
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.asks ?? ""}
          placeholder="(묻는 것)"
          onCommit={(v) => patchExamNote(note, sectionEdit, { asks: v })}
        />
      ) : null}
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={note.row.strategy ?? ""}
        onCommit={(v) => patchExamNote(note, sectionEdit, { strategy: v })}
      />
    </div>
  );
}

type GrammarNotePart =
  | { kind: "label" }
  | { kind: "target" }
  | { kind: "body"; index: number; parts: string[] }
  | { kind: "trap" };

type ExamNotePart =
  | { kind: "label" }
  | { kind: "target" }
  | { kind: "body"; index: number; parts: string[] };

type ParsingNotePart =
  | { kind: "part"; index: number }
  | { kind: "translation" };

const STUDY_NOTE_SPLIT_AT = 115;
const STUDY_NOTE_TARGET_CHARS = 82;

function splitStudyNoteText(text: string): string[] {
  const normalized = text.trim();
  if (normalized.length <= STUDY_NOTE_SPLIT_AT) return [text];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  tokens.forEach((token) => {
    const next = current ? `${current} ${token}` : token;
    if (current && next.length > STUDY_NOTE_TARGET_CHARS) {
      parts.push(current);
      current = token;
    } else {
      current = next;
    }
  });
  if (current) parts.push(current);
  return parts.length ? parts : [text];
}

function joinStudyNoteParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1");
}

function grammarNoteParts(note: GrammarNoteRef, editable: boolean): GrammarNotePart[] {
  const bodyParts = splitStudyNoteText(note.row.explanation);
  return [
    { kind: "label" },
    ...(note.row.excerpt || editable ? ([{ kind: "target" }] as GrammarNotePart[]) : []),
    ...bodyParts.map((_, index) => ({ kind: "body" as const, index, parts: bodyParts })),
    ...(note.row.trap || editable ? ([{ kind: "trap" }] as GrammarNotePart[]) : []),
  ];
}

function examNoteParts(note: ExamNoteRef, editable: boolean): ExamNotePart[] {
  const bodyParts = splitStudyNoteText(note.row.strategy ?? "");
  return [
    { kind: "label" },
    ...(note.row.asks || editable ? ([{ kind: "target" }] as ExamNotePart[]) : []),
    ...bodyParts.map((_, index) => ({ kind: "body" as const, index, parts: bodyParts })),
  ];
}

function parsingNoteParts(note: ParsingNoteRef): ParsingNotePart[] {
  return [
    ...note.item.parts.map((_, index) => ({ kind: "part" as const, index })),
    ...(note.item.translation ? ([{ kind: "translation" }] as ParsingNotePart[]) : []),
  ];
}

function grammarPartKey(part: GrammarNotePart): string {
  return part.kind === "body" ? `body-${part.index}` : part.kind;
}

function examPartKey(part: ExamNotePart): string {
  return part.kind === "body" ? `body-${part.index}` : part.kind;
}

function parsingPartKey(part: ParsingNotePart): string {
  return part.kind === "part" ? `part-${part.index}` : part.kind;
}

function ReadGrammarNotePart({
  note,
  part,
  editable,
  sectionEdit,
}: {
  note: GrammarNoteRef;
  part: GrammarNotePart;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (part.kind === "label") {
    return (
      <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-head">
        <Field
          as="span"
          className="par-read-note-label"
          editable={editable}
          value={note.row.point}
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { point: v })}
        />
      </div>
    );
  }
  if (part.kind === "target") {
    return (
      <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-target">
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.excerpt ?? ""}
          placeholder="(원문 구절)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { excerpt: v })}
        />
      </div>
    );
  }
  if (part.kind === "trap") {
    return (
      <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-trap">
        <Field
          as="span"
          className="par-read-note-trap"
          editable={editable}
          value={note.row.trap ?? ""}
          placeholder="(함정 포인트)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { trap: v })}
        />
      </div>
    );
  }
  return (
    <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-body">
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={part.parts[part.index] ?? ""}
        onCommit={(v) => {
          const nextParts = part.parts.map((item, index) => (index === part.index ? v : item));
          patchGrammarNote(note, sectionEdit, { explanation: joinStudyNoteParts(nextParts) });
        }}
      />
    </div>
  );
}

function ReadExamNotePart({
  note,
  part,
  editable,
  sectionEdit,
}: {
  note: ExamNoteRef;
  part: ExamNotePart;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (part.kind === "label") {
    return (
      <div className="par-read-note par-read-note-exam par-read-note-split par-read-note-split-head">
        <Field
          as="span"
          className="par-read-note-label"
          editable={editable}
          value={note.row.type}
          onCommit={(v) => patchExamNote(note, sectionEdit, { type: v })}
        />
      </div>
    );
  }
  if (part.kind === "target") {
    return (
      <div className="par-read-note par-read-note-exam par-read-note-split par-read-note-split-target">
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.asks ?? ""}
          placeholder="(묻는 것)"
          onCommit={(v) => patchExamNote(note, sectionEdit, { asks: v })}
        />
      </div>
    );
  }
  return (
    <div className="par-read-note par-read-note-exam par-read-note-split par-read-note-split-body">
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={part.parts[part.index] ?? ""}
        onCommit={(v) => {
          const nextParts = part.parts.map((item, index) => (index === part.index ? v : item));
          patchExamNote(note, sectionEdit, { strategy: joinStudyNoteParts(nextParts) });
        }}
      />
    </div>
  );
}

function ReadParsingNotePart({
  note,
  part,
  editable,
  sectionEdit,
}: {
  note: ParsingNoteRef;
  part: ParsingNotePart;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (part.kind === "translation") {
    return (
      <div className="par-read-note par-read-note-parse par-read-note-split par-read-note-split-parse-trans">
        <span className="par-read-note-label">→ 해석</span>
        <Field
          as="span"
          className="par-read-note-body"
          editable={editable}
          value={note.item.translation}
          onCommit={(v) => patchParsingNote(note, sectionEdit, { translation: v })}
        />
      </div>
    );
  }

  const parsePart = note.item.parts[part.index];
  if (!parsePart) return null;
  return (
    <div className="par-read-note par-read-note-parse par-read-note-split par-read-note-split-parse-part">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={parsePart.label}
        onCommit={(v) => {
          patchParsingNote(note, sectionEdit, {
            parts: note.item.parts.map((item, index) => (index === part.index ? { ...item, label: v } : item)),
          });
        }}
      />
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={parsePart.text}
        onCommit={(v) => {
          patchParsingNote(note, sectionEdit, {
            parts: note.item.parts.map((item, index) => (index === part.index ? { ...item, text: v } : item)),
          });
        }}
      />
    </div>
  );
}

const READING_SENTENCE_SPLIT_AT = 10_000;
const READING_SENTENCE_TARGET_CHARS = 88;

function splitReadingSentenceText(text: string): string[] {
  const normalized = text.trim();
  if (normalized.length <= READING_SENTENCE_SPLIT_AT) return [text];
  const words = normalized.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > READING_SENTENCE_TARGET_CHARS) {
      parts.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) parts.push(current);
  return parts.length > 1 ? parts : [text];
}

function joinReadingSentenceParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

// ══════════════════════════════════════════════════════════════════════════════
// 01 원문 — 필기 캔버스 (HLC). 문장 1개 = 원자 블록. 직독직해 청크 + 줄사이 필기 + 여백 레일.
// 겹침 없음은 브라우저 flow 가 구조적으로 보장 (JS 추정/측정 레이스 없음).
// ══════════════════════════════════════════════════════════════════════════════

const ANNO_COLOR: Record<CanvasNoteKind, string> = {
  grammar: "#2563a8",
  parsing: "#047857",
  exam: "#9f1239",
  logic: "#9a6b00",
};

/** 필기 분석(05) 색상 범례 — 어법/구문/출제/논리 색이 무엇을 뜻하는지 안내. */
function AnnotatedColorLegend() {
  const items: [CanvasNoteKind, string][] = [
    ["grammar", "어법 포인트"],
    ["parsing", "구문 · 끊어읽기"],
    ["exam", "출제 포인트"],
    ["logic", "논리 흐름"],
  ];
  return (
    <div className="par-anno-legend">
      <span className="par-anno-legend-label">색상 안내</span>
      {items.map(([kind, label]) => (
        <span key={kind} className="par-anno-legend-item" style={{ "--anno-c": ANNO_COLOR[kind] } as CSSProperties}>
          {label}
        </span>
      ))}
    </div>
  );
}

type CanvasNoteRef =
  | { kind: "grammar"; ref: GrammarNoteRef }
  | { kind: "exam"; ref: ExamNoteRef }
  | { kind: "logic"; ref: LogicNoteRef }
  | { kind: "parsing"; ref: ParsingNoteRef };

function cleanParseLabel(label: string): string {
  return label.replace(/[[\]]/g, "").trim();
}

function noteBodyLines(layoutLines: string[] | undefined, fallback: string): string[] {
  const fromLayout = (layoutLines ?? []).map((l) => l.trim()).filter(Boolean);
  if (fromLayout.length) return fromLayout;
  return splitStudyNoteText(fallback).map((l) => l.trim()).filter(Boolean);
}

/** 한 문장 번호에 걸린 study 노트들을 캔버스 입력 + 편집용 ref 맵으로 변환. */
function buildCanvasNotesForSentence(
  study: ReturnType<typeof collectPassageStudyNotes>,
  sentenceNo: number,
): { notes: CanvasNoteInput[]; refs: Map<string, CanvasNoteRef> } {
  const notes: CanvasNoteInput[] = [];
  const refs = new Map<string, CanvasNoteRef>();

  (study.grammarBySentence.get(sentenceNo) ?? []).forEach((n) => {
    const key = `g-${n.sectionIndex}-${n.rowIndex}`;
    const layout = n.row.layout ?? undefined;
    notes.push({
      key,
      kind: "grammar",
      anchorText: layout?.anchorText ?? n.row.excerpt,
      band: layout?.band,
      priority: layout?.priority,
      role: n.row.point,
      lines: noteBodyLines(layout?.lines, n.row.explanation),
      trap: n.row.trap?.trim() || undefined,
      example: n.row.example?.trim() || undefined,
      exampleWrong: n.row.exampleWrong?.trim() || undefined,
      exampleCorrect: n.row.exampleCorrect?.trim() || undefined,
    });
    refs.set(key, { kind: "grammar", ref: n });
  });

  (study.parsingBySentence.get(sentenceNo) ?? []).forEach((n) => {
    const key = `p-${n.sectionIndex}-${n.itemIndex}`;
    const layout = n.item.layout ?? undefined;
    const partLines = n.item.parts.map((p) => `${cleanParseLabel(p.label)} ${p.text}`.trim()).filter(Boolean);
    const lines = (layout?.lines ?? []).map((l) => l.trim()).filter(Boolean);
    const finalLines = lines.length ? lines : [...partLines, n.item.translation ? `→ ${n.item.translation}` : ""].filter(Boolean);
    notes.push({
      key,
      kind: "parsing",
      anchorText: layout?.anchorText ?? n.item.parts[0]?.text,
      band: layout?.band,
      priority: layout?.priority,
      role: "구문",
      lines: finalLines,
    });
    refs.set(key, { kind: "parsing", ref: n });
  });

  (study.examBySentence.get(sentenceNo) ?? []).forEach((n) => {
    const key = `e-${n.sectionIndex}-${n.rowIndex}`;
    const layout = n.row.layout ?? undefined;
    notes.push({
      key,
      kind: "exam",
      anchorText: layout?.anchorText ?? (n.row.asks?.trim() || undefined),
      band: layout?.band,
      priority: layout?.priority,
      role: n.row.type,
      lines: noteBodyLines(layout?.lines, n.row.strategy ?? ""),
    });
    refs.set(key, { kind: "exam", ref: n });
  });

  // 논리(logic) 필기는 '04 지문 논리 구조 분석' 섹션(Logic Map)에서 별도로 보여주므로
  // 필기 캔버스에는 중복 표시하지 않는다. (어법·구문·출제만 인라인)

  return { notes, refs };
}

function dropLayoutLines(layout: AnnoLayout): AnnoLayout {
  if (!layout) return layout;
  const next = { ...layout };
  delete (next as { lines?: string[] }).lines;
  return next;
}

function commitNoteBody(entry: CanvasNoteRef | undefined, sectionEdit: ((i: number) => SectionEdit) | undefined, value: string) {
  if (!entry) return;
  if (entry.kind === "grammar") patchGrammarNote(entry.ref, sectionEdit, { explanation: value, layout: dropLayoutLines(entry.ref.row.layout) });
  else if (entry.kind === "exam") patchExamNote(entry.ref, sectionEdit, { strategy: value, layout: dropLayoutLines(entry.ref.row.layout) });
  else if (entry.kind === "logic") patchLogicNote(entry.ref, sectionEdit, { keyPoint: value, layout: dropLayoutLines(entry.ref.row.layout) });
}

function commitNoteRole(entry: CanvasNoteRef | undefined, sectionEdit: ((i: number) => SectionEdit) | undefined, value: string) {
  if (!entry) return;
  if (entry.kind === "grammar") patchGrammarNote(entry.ref, sectionEdit, { point: value });
  else if (entry.kind === "exam") patchExamNote(entry.ref, sectionEdit, { type: value });
  else if (entry.kind === "logic") patchLogicNote(entry.ref, sectionEdit, { functionLabel: value });
}

function commitNoteTrap(entry: CanvasNoteRef | undefined, sectionEdit: ((i: number) => SectionEdit) | undefined, value: string) {
  if (entry?.kind === "grammar") patchGrammarNote(entry.ref, sectionEdit, { trap: value });
}

function commitNoteExample(entry: CanvasNoteRef | undefined, sectionEdit: ((i: number) => SectionEdit) | undefined, value: string) {
  if (entry?.kind === "grammar") patchGrammarNote(entry.ref, sectionEdit, { example: value });
}

function joinNoteLines(lines: string[], index: number, value: string): string {
  return lines
    .map((l, i) => (i === index ? value : l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 청크 영문 슬라이스 (어휘 글로스 인라인). 편집 가능 시 contentEditable. */
function CanvasChunkEnglish({
  editable,
  value,
  onCommit,
  highlights,
  vocabNotes,
}: {
  editable: boolean;
  value: string;
  onCommit: (v: string) => void;
  highlights: string[];
  vocabNotes: VocabularyNoteRef[];
}) {
  if (!editable) return <span className="par-canvas-en">{renderAnnotatedReadingText(value, highlights, vocabNotes)}</span>;
  return (
    <span
      className="par-canvas-en par-edit-field"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph="—"
      onBlur={(e: FocusEvent<HTMLElement>) => {
        const next = normalizeEditableText(readEditableTextIgnoringAnnotations(e.currentTarget));
        if (next !== value) onCommit(next);
      }}
      onPaste={(e: ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
    >
      {renderAnnotatedReadingText(value, highlights, vocabNotes)}
    </span>
  );
}

function CanvasNoteText({
  note,
  entry,
  editable,
  sectionEdit,
  lineClass,
  roleClass,
  trapClass,
}: {
  note: PlacedNote;
  entry: CanvasNoteRef | undefined;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
  lineClass: string;
  roleClass: string;
  trapClass: string;
}) {
  const canEdit = editable && !!entry && note.kind !== "parsing";
  return (
    <>
      {note.role ? (
        canEdit ? (
          <Field as="span" className={roleClass} editable value={note.role} onCommit={(v) => commitNoteRole(entry, sectionEdit, v)} />
        ) : (
          <span className={roleClass}>{note.role}</span>
        )
      ) : null}
      {note.lines.map((line, i) =>
        canEdit ? (
          <Field
            key={i}
            as="span"
            className={lineClass}
            editable
            value={line}
            onCommit={(v) => commitNoteBody(entry, sectionEdit, joinNoteLines(note.lines, i, v))}
          />
        ) : (
          <span key={i} className={lineClass}>
            {line}
          </span>
        ),
      )}
      {note.trap ? (
        canEdit ? (
          <Field as="span" className={trapClass} editable value={note.trap} onCommit={(v) => commitNoteTrap(entry, sectionEdit, v)} />
        ) : (
          <span className={trapClass}>{note.trap}</span>
        )
      ) : null}
      {note.example ? (
        canEdit ? (
          <Field as="span" className="par-anno-example" editable value={note.example} onCommit={(v) => commitNoteExample(entry, sectionEdit, v)} />
        ) : (
          <span className="par-anno-example">{renderTrapExample(note)}</span>
        )
      ) : null}
    </>
  );
}

const KIND_LABEL: Record<CanvasNoteKind, string> = { grammar: "어법", parsing: "구문", exam: "출제", logic: "논리" };

/** 함정 예문 — 시험이 파는 '틀린 형태'를 빨강 취소선, 정답을 초록으로(있으면). */
function renderTrapExample(note: PlacedNote): ReactNode {
  const ex = note.example ?? "";
  const wrong = note.exampleWrong?.trim();
  const correct = note.exampleCorrect?.trim();
  const good = correct ? <span className="par-ex-good"> (→ {correct})</span> : null;
  if (!wrong) return <>{ex}{good}</>;
  const idx = ex.indexOf(wrong);
  if (idx < 0) return <>{ex}{good}</>;
  return (
    <>
      {ex.slice(0, idx)}
      <span className="par-ex-bad">{wrong}</span>
      {good}
      {ex.slice(idx + wrong.length)}
    </>
  );
}

/** 필기 분석(05) 목록 항목 — 번호 뱃지 + 종류 + 본문 출처 + 해설/함정/예문. */
function CanvasListNote({
  note,
  num,
  entry,
  editable,
  sectionEdit,
}: {
  note: PlacedNote;
  num: number;
  entry?: CanvasNoteRef;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  const color = ANNO_COLOR[note.kind];
  return (
    <div className="par-list-note" data-list-key={note.key} style={{ "--anno-c": color } as CSSProperties}>
      <span className="par-list-badge">{num}</span>
      <div className="par-list-body">
        <span className="par-list-kind">{KIND_LABEL[note.kind]}</span>
        {note.anchorRange && note.anchorText?.trim() ? (
          <>
            {" · "}
            <span className="par-list-src">{note.anchorText.trim()}</span>
          </>
        ) : null}
        {" — "}
        <CanvasNoteText note={note} entry={entry} editable={editable} sectionEdit={sectionEdit} lineClass="par-list-line" roleClass="par-list-role" trapClass="par-list-trap" />
      </div>
    </div>
  );
}

function CanvasRailCard({ note, entry, editable, sectionEdit }: { note: PlacedNote; entry?: CanvasNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div
      className={cn("par-rail-card", note.kind === "exam" && "is-exam", note.kind === "logic" && "is-logic", note.kind === "parsing" && "is-parsing")}
      data-rail-key={note.key}
      style={{ "--anno-c": ANNO_COLOR[note.kind] } as CSSProperties}
    >
      {note.anchorRange && note.anchorText?.trim() ? <span className="par-rail-card-src">{note.anchorText.trim()}</span> : null}
      <CanvasNoteText note={note} entry={entry} editable={editable} sectionEdit={sectionEdit} lineClass="par-rail-card-line" roleClass="par-rail-card-role" trapClass="par-rail-card-trap" />
    </div>
  );
}

interface ConnectorPath {
  d: string;
  color: string;
  hx: number;
  hy: number;
}

/** 문장 1개 = 원자 캔버스. */
function AnnotatedSentenceCanvas({
  canvasId,
  no,
  isCont,
  plan,
  en,
  ko,
  vocabNotes,
  keywords,
  refs,
  editable,
  sectionEdit,
  onCommitEn,
  onCommitKo,
  showTrans,
}: {
  canvasId: string;
  no: number;
  isCont: boolean;
  plan: SentenceCanvasPlan;
  en: string;
  ko: string;
  vocabNotes: VocabularyNoteRef[];
  keywords: string[];
  refs: Map<string, CanvasNoteRef>;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
  onCommitEn?: (newEn: string) => void;
  onCommitKo?: (newKo: string) => void;
  showTrans: boolean;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [connectors, setConnectors] = useState<ConnectorPath[]>([]);

  // 모든 필기를 종류별로 재배치(v3): 어법·구문 → 아래 목록(번호 뱃지) / 출제·논리 → 오른쪽 레일
  const allNotes = [...plan.interlineByChunk.flat(), ...plan.railNotes, ...plan.footnoteNotes];
  const listNotes = allNotes.filter((n) => n.kind === "grammar" || n.kind === "parsing");
  const sideNotes = allNotes.filter((n) => n.kind === "exam" || n.kind === "logic");
  const numByKey = new Map<string, number>();
  listNotes.forEach((n, i) => numByKey.set(n.key, i + 1));
  const chunkBadges = new Map<number, { num: number; color: string }[]>();
  listNotes.forEach((n) => {
    if (!n.anchorRange) return;
    const arr = chunkBadges.get(n.chunkIndex) ?? [];
    arr.push({ num: numByKey.get(n.key) ?? 0, color: ANNO_COLOR[n.kind] });
    chunkBadges.set(n.chunkIndex, arr);
  });

  // 연결선: 밑줄 왼쪽 → (살짝 내려) 왼쪽 여백 레인으로 ← → 레인 따라 ↓ → 설명 뱃지로 →.
  // 세로 하강은 항상 '왼쪽 여백(레인)'에서 일어나 본문 위를 지나지 않는다. 연결마다
  // 다른 레인 x + 다른 진입 높이로 분리해 서로 겹치지 않게 한다.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const compute = () => {
      const rootRect = root.getBoundingClientRect();
      if (!rootRect.width) return;
      const sheet = root.closest<HTMLElement>(".par-sheet");
      const zoom = sheet ? parseFloat(getComputedStyle(sheet).zoom || "1") || 1 : 1;
      const raw: { x1: number; y1: number; lineBottom: number; bx: number; by: number; color: string }[] = [];
      listNotes.forEach((n) => {
        if (!n.anchorRange) return;
        const listEl = root.querySelector<HTMLElement>(`[data-list-key="${n.key}"]`);
        const chunkEl = root.querySelector<HTMLElement>(`[data-anchor-id="${canvasId}-c${n.chunkIndex}"]`);
        if (!listEl || !chunkEl) return;
        const badgeEl = listEl.querySelector<HTMLElement>(".par-list-badge") ?? listEl;
        const enEl = chunkEl.querySelector<HTMLElement>(".par-canvas-en") ?? chunkEl;
        const a = enEl.getBoundingClientRect();
        const c = chunkEl.getBoundingClientRect();
        const b = badgeEl.getBoundingClientRect();
        raw.push({
          x1: (a.left - rootRect.left) / zoom, // 밑줄(영어 청크) 왼쪽
          y1: (a.bottom - rootRect.top) / zoom + 1, // 밑줄 바로 아래
          lineBottom: (c.bottom - rootRect.top) / zoom + 1.5, // 그 줄(역할 라벨 포함) 아래 빈 띠
          bx: (b.left - rootRect.left) / zoom,
          by: (b.top + b.height / 2 - rootRect.top) / zoom,
          color: ANNO_COLOR[n.kind],
        });
      });
      if (!raw.length) {
        setConnectors((prev) => (prev.length ? [] : prev));
        return;
      }
      // 설명(목표) 순서로 정렬 → 위 연결일수록 안쪽(오른쪽) 레인, 아래로 갈수록 바깥(왼쪽) 레인.
      // 이렇게 하면 세로 하강선들이 서로 교차하지 않고 나란히 내려간다.
      raw.sort((p, q) => p.by - q.by || p.x1 - q.x1);
      const minBx = Math.min(...raw.map((r) => r.bx));
      const laneRight = Math.max(7, minBx - 5); // 뱃지 바로 왼쪽(가장 안쪽 레인)
      const laneLeft = 3; // 가장 바깥(왼쪽 끝) 레인
      const cnt = raw.length;
      const next: ConnectorPath[] = raw.map((r, i) => {
        const laneX = cnt > 1 ? laneRight - ((laneRight - laneLeft) * i) / (cnt - 1) : laneRight;
        // 진입 가로선은 그 줄 아래 빈 띠에서, 연결마다 살짝 어긋나게(겹침 방지).
        const shelfY = r.lineBottom + i * 1.4;
        const endx = Math.max(laneX + 1, r.bx - 1);
        const d = `M ${r.x1.toFixed(1)} ${r.y1.toFixed(1)} L ${r.x1.toFixed(1)} ${shelfY.toFixed(1)} L ${laneX.toFixed(1)} ${shelfY.toFixed(1)} L ${laneX.toFixed(1)} ${r.by.toFixed(1)} L ${endx.toFixed(1)} ${r.by.toFixed(1)}`;
        return { d, color: r.color, hx: endx, hy: r.by };
      });
      setConnectors((prev) => (sameConnectors(prev, next) ? prev : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, canvasId, en, editable]);

  const enEditable = editable && !!onCommitEn;
  const koEditable = editable && !!onCommitKo;
  const hasRail = sideNotes.length > 0;

  return (
    <article ref={rootRef} className="par-canvas par-canvas-v3" data-canvas data-canvas-id={canvasId}>
      <div className={cn("par-canvas-grid", hasRail && "has-rail")}>
        <div className="par-canvas-staff">
          <span className={cn("par-canvas-no", isCont && "is-cont")}>{isCont ? "+" : circledNo(no)}</span>
          {plan.chunks.map((chunk, i) => {
            const badges = chunkBadges.get(i);
            const isAnchored = !!badges?.length;
            const cellColor = badges?.[0]?.color;
            const newEnFor = (v: string) => plan.chunks.map((c, j) => (j === i ? v : c.text)).join("");
            return (
              <Fragment key={i}>
                {/* 끊어읽기 구분선 — 청크(직독직해 단위) 사이를 '/'로 */}
                {i > 0 ? <span className="par-canvas-sep" aria-hidden>/</span> : null}
                <span
                  className={cn("par-canvas-chunk", chunk.emphasis === "core" && "is-core", isAnchored && "is-anchored")}
                  data-anchor-id={`${canvasId}-c${i}`}
                  style={cellColor ? ({ "--anno-c": cellColor } as CSSProperties) : undefined}
                >
                  {chunk.gloss || badges ? (
                    <span className="par-canvas-gloss">
                      {chunk.gloss ?? ""}
                      {badges?.map((bd) => (
                        <span key={bd.num} className="par-canvas-lk" style={{ "--anno-c": bd.color } as CSSProperties}>
                          {bd.num}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <CanvasChunkEnglish editable={enEditable} value={chunk.text} onCommit={(v) => onCommitEn?.(newEnFor(v))} highlights={keywords} vocabNotes={vocabNotes} />
                  {chunk.role ? <span className="par-canvas-role">{chunk.role}</span> : null}
                </span>
              </Fragment>
            );
          })}
        </div>
        {hasRail ? (
          <div className="par-canvas-rail">
            {sideNotes.map((n) => (
              <CanvasRailCard key={n.key} note={n} entry={refs.get(n.key)} editable={editable} sectionEdit={sectionEdit} />
            ))}
          </div>
        ) : null}
      </div>
      {listNotes.length ? (
        <div className="par-canvas-list">
          {listNotes.map((n) => (
            <CanvasListNote key={n.key} note={n} num={numByKey.get(n.key) ?? 0} entry={refs.get(n.key)} editable={editable} sectionEdit={sectionEdit} />
          ))}
        </div>
      ) : null}
      {showTrans && (ko || koEditable) ? (
        <div className="par-canvas-trans">
          <span className="par-canvas-trans-no">{circledNo(no)}</span>
          <Field as="p" className="par-canvas-trans-ko" editable={koEditable} value={ko} placeholder="(해석)" onCommit={(v) => onCommitKo?.(v)} />
        </div>
      ) : null}
      {connectors.length ? (
        <svg className="par-canvas-connectors" aria-hidden>
          {connectors.map((p, i) => (
            <g key={i}>
              <path d={p.d} className="par-conn-line" style={{ stroke: p.color }} />
              <path
                d={`M ${p.hx.toFixed(1)} ${p.hy.toFixed(1)} L ${(p.hx - 4.4).toFixed(1)} ${(p.hy - 2.4).toFixed(1)} L ${(p.hx - 4.4).toFixed(1)} ${(p.hy + 2.4).toFixed(1)} Z`}
                style={{ fill: p.color }}
              />
            </g>
          ))}
        </svg>
      ) : null}
    </article>
  );
}

function sameConnectors(a: ConnectorPath[], b: ConnectorPath[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].d !== b[i].d || a[i].color !== b[i].color) return false;
  return true;
}

/** 깔끔한 원문+해석 (필기 없음) — 영어 문장 바로 아래 한국어 해석. */
function CleanPassageSentence({
  no,
  en,
  ko,
  keywords,
  editable,
  onCommitEn,
  onCommitKo,
}: {
  no: number;
  en: string;
  ko: string;
  keywords: string[];
  editable: boolean;
  onCommitEn: (v: string) => void;
  onCommitKo: (v: string) => void;
}) {
  return (
    <article className="par-clean-snt">
      <div className="par-clean-line">
        <span className="par-clean-no">{circledNo(no)}</span>
        <AnnotatedReadingField editable={editable} value={en} onCommit={onCommitEn} highlights={keywords} vocabNotes={[]} />
      </div>
      <div className="par-clean-ko-row">
        <span className="par-clean-ko-mark" aria-hidden>↳</span>
        <Field as="p" className="par-clean-ko" editable={editable} value={ko} placeholder="(해석)" onCommit={onCommitKo} />
      </div>
    </article>
  );
}

function AnnotatedPassageSentenceBlock({
  section,
  sentenceIndex,
  study,
  editable,
  onCommit,
  sectionEdit,
}: {
  section: PassageSection;
  sentenceIndex: number;
  study: ReturnType<typeof collectPassageStudyNotes>;
  editable: boolean;
  onCommit: (next: AnalysisSection) => void;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  const sentence = section.sentences[sentenceIndex];
  if (!sentence) return null;

  const grammarNotes = study.grammarBySentence.get(sentence.n) ?? [];
  const logicNotes = study.logicBySentence.get(sentence.n) ?? [];
  const examNotes = study.examBySentence.get(sentence.n) ?? [];
  const vocabNotes = study.vocabBySentence.get(sentence.n) ?? [];
  const parsingNotes = study.parsingBySentence.get(sentence.n) ?? [];
  const hasSideNotes = logicNotes.length > 0;
  const hasStudyNotes = grammarNotes.length > 0 || parsingNotes.length > 0 || examNotes.length > 0;
  const targetHighlights = [
    ...(section.keywords ?? []),
    ...grammarNotes.map((note) => note.row.excerpt ?? ""),
  ].filter((value) => value.trim().length > 1);
  const canEditLinked = !!sectionEdit;
  const patchSentence = (patch: Partial<PassageSection["sentences"][number]>) => {
    onCommit({
      ...section,
      sentences: section.sentences.map((item, index) => (index === sentenceIndex ? { ...item, ...patch } : item)),
    });
  };

  return (
    <article className="par-reading-card par-reading-flow-item">
      <div className={cn("par-reading-row-grid", hasSideNotes && "has-side-notes", hasStudyNotes && "has-study-notes")}>
        <div className="par-reading-main">
          <div className="par-read-sentence">
            <div className="par-read-line">
              <span className="par-read-no">{circledNo(sentence.n)}</span>
              <AnnotatedReadingField
                editable={editable}
                value={sentence.en}
                onCommit={(v) => patchSentence({ en: v })}
                highlights={targetHighlights}
                vocabNotes={vocabNotes}
              />
            </div>
          </div>
        </div>
        <aside className="par-reading-trans par-reading-trans-card">
          <div className="par-trans-row">
            <span className="par-trans-no">{circledNo(sentence.n)}</span>
            <Field
              as="p"
              className="par-trans-ko"
              editable={editable}
              value={sentence.ko}
              placeholder="(해석)"
              onCommit={(v) => patchSentence({ ko: v })}
            />
          </div>
          {logicNotes.length ? (
            <div className="par-trans-study">
              {logicNotes.map((note) => (
                <ReadLogicNote key={`l-${note.sectionIndex}-${note.rowIndex}`} note={note} editable={canEditLinked} sectionEdit={sectionEdit} />
              ))}
            </div>
          ) : null}
        </aside>
      </div>
      {editable ? <DelBtn title="문장 삭제" onClick={() => onCommit({ ...section, sentences: section.sentences.filter((_, index) => index !== sentenceIndex) })} /> : null}
    </article>
  );
}

function AnnotatedPassageSentenceSourceBlock({
  section,
  sentenceIndex,
  partIndex,
  parts,
  study,
  editable,
  onCommit,
}: {
  section: PassageSection;
  sentenceIndex: number;
  partIndex: number;
  parts: string[];
  study: ReturnType<typeof collectPassageStudyNotes>;
  editable: boolean;
  onCommit: (next: AnalysisSection) => void;
}) {
  const sentence = section.sentences[sentenceIndex];
  if (!sentence) return null;

  const grammarNotes = study.grammarBySentence.get(sentence.n) ?? [];
  const vocabNotes = study.vocabBySentence.get(sentence.n) ?? [];
  const targetHighlights = [
    ...(section.keywords ?? []),
    ...grammarNotes.map((note) => note.row.excerpt ?? ""),
  ].filter((value) => value.trim().length > 1);
  const patchPart = (value: string) => {
    const nextParts = parts.map((part, index) => (index === partIndex ? value : part));
    onCommit({
      ...section,
      sentences: section.sentences.map((item, index) => (index === sentenceIndex ? { ...item, en: joinReadingSentenceParts(nextParts) } : item)),
    });
  };
  const isFirst = partIndex === 0;

  return (
    <article className={cn("par-reading-card par-reading-flow-item par-reading-source-item", !isFirst && "is-continuation")}>
      <div className="par-reading-main">
        <div className="par-read-sentence">
          <div className="par-read-line">
            <span className={cn("par-read-no", !isFirst && "par-read-no-cont")}>{isFirst ? circledNo(sentence.n) : "+"}</span>
            <AnnotatedReadingField
              editable={editable}
              value={parts[partIndex] ?? ""}
              onCommit={patchPart}
              highlights={targetHighlights}
              vocabNotes={vocabNotes}
            />
          </div>
        </div>
      </div>
      {editable && isFirst ? (
        <DelBtn title="문장 삭제" onClick={() => onCommit({ ...section, sentences: section.sentences.filter((_, index) => index !== sentenceIndex) })} />
      ) : null}
    </article>
  );
}

function AnnotatedPassageSentenceSideBlock({
  section,
  sentenceIndex,
  study,
  editable,
  onCommit,
  sectionEdit,
}: {
  section: PassageSection;
  sentenceIndex: number;
  study: ReturnType<typeof collectPassageStudyNotes>;
  editable: boolean;
  onCommit: (next: AnalysisSection) => void;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  const sentence = section.sentences[sentenceIndex];
  if (!sentence) return null;

  const logicNotes = study.logicBySentence.get(sentence.n) ?? [];
  const canEditLinked = !!sectionEdit;
  const patchSentence = (patch: Partial<PassageSection["sentences"][number]>) => {
    onCommit({
      ...section,
      sentences: section.sentences.map((item, index) => (index === sentenceIndex ? { ...item, ...patch } : item)),
    });
  };

  return (
    <article className="par-reading-flow-note par-reading-trans-flow">
      <div className="par-reading-row-grid par-reading-side-grid">
        <div className="par-reading-side-main">
          <span className="par-reading-side-label">{circledNo(sentence.n)} 해석 · 논리</span>
        </div>
        <aside className="par-reading-trans par-reading-trans-card">
          <div className="par-trans-row">
            <span className="par-trans-no">{circledNo(sentence.n)}</span>
            <Field
              as="p"
              className="par-trans-ko"
              editable={editable}
              value={sentence.ko}
              placeholder="(해석)"
              onCommit={(v) => patchSentence({ ko: v })}
            />
          </div>
          {logicNotes.length ? (
            <div className="par-trans-study">
              {logicNotes.map((note) => (
                <ReadLogicNote key={`l-${note.sectionIndex}-${note.rowIndex}`} note={note} editable={canEditLinked} sectionEdit={sectionEdit} />
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function ReadingStudyNoteBlock({ children }: { children: ReactNode }) {
  return (
    <article className="par-reading-flow-note">
      <div className="par-reading-row-grid par-reading-note-grid">
        <div className="par-reading-note-main">{children}</div>
        <div className="par-reading-note-side" aria-hidden />
      </div>
    </article>
  );
}

function ReadingExamBank({
  notes,
  editable,
  sectionEdit,
}: {
  notes: ExamNoteRef[];
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (!notes.length) return null;
  return (
    <div className="par-reading-lab par-read-exam-bank-block">
      <div className="par-read-bank-title">유형별 출제 포인트</div>
      <div className="par-read-bank-grid">
        {notes.map((note) => (
          <ReadExamNote key={`eg-${note.sectionIndex}-${note.rowIndex}`} note={note} editable={editable} sectionEdit={sectionEdit} />
        ))}
      </div>
    </div>
  );
}

function WorksheetLogicMapBlock({
  section,
  editable,
  onPatch,
}: {
  section: LearningWorksheetSection;
  editable: boolean;
  onPatch: (patch: Partial<LearningWorksheetSection>) => void;
}) {
  if (!section.logicRows.length) return null;
  return (
    <div className="par-ws-block par-ws-logic-promoted">
      <WorksheetMiniTitle title="지문 논리 구조 분석" kicker="Logic Map" />
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th>문장</th>
            <th>기능</th>
            <th>핵심 내용</th>
          </tr>
        </thead>
        <tbody>
          {section.logicRows.map((row, i) => (
            <tr key={i}>
              <td>{row.sentenceNo ? `S${row.sentenceNo}` : "-"}</td>
              <td>
                <Field
                  as="span"
                  editable={editable}
                  value={row.functionLabel}
                  onCommit={(v) => onPatch({ logicRows: section.logicRows.map((item, j) => (i === j ? { ...item, functionLabel: v } : item)) })}
                />
              </td>
              <td>
                <Field
                  as="span"
                  editable={editable}
                  value={row.keyPoint}
                  onCommit={(v) => onPatch({ logicRows: section.logicRows.map((item, j) => (i === j ? { ...item, keyPoint: v } : item)) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function titleItems(report: AnalysisReport, med?: MetaEdit): FlowItem[] {
  const m = report.meta;
  const editable = !!med;
  const patch = (p: Partial<ReportMeta>) => med?.commit({ ...m, ...p });
  return [
    {
      id: "title",
      sectionIndex: -1,
      kind: "title",
      no: 0,
      wrap: "title",
      node: (
        <header className="par-title">
          <Field as="div" className="par-eyebrow" editable={editable} value={m.eyebrow ?? ""} onCommit={(v) => patch({ eyebrow: v })} />
          <Field as="h1" className="par-title-ko" editable={editable} value={m.titleKo} onCommit={(v) => patch({ titleKo: v })} />
          <Field as="div" className="par-title-en" editable={editable} value={m.titleEn} onCommit={(v) => patch({ titleEn: v })} />
        </header>
      ),
    },
  ];
}

/** 어법 선택 본문의 "[a / b]" 선택 괄호를 밑줄로 강조해 렌더(비편집 보기/인쇄용). */
function renderGrammarChoiceText(text: string): ReactNode {
  const re = /\[[^\][]*\]/g;
  const out: ReactNode[] = [];
  let cursor = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    out.push(
      <u key={k++} className="par-ws-choice-mark">
        {m[0]}
      </u>,
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out.length ? out : text;
}

/** 표지 다음 '영어 원문만' 단독 페이지 — 번호매긴 영어 문장만(해석·필기 없음). report.englishOnlyPage 가 켜졌을 때. */
function englishOnlyPageItems(report: AnalysisReport): FlowItem[] {
  if (!report.englishOnlyPage) return [];
  const passage = report.sections.find((s) => s.kind === "passage");
  if (!passage || passage.kind !== "passage" || !passage.sentences.length) return [];
  return passage.sentences.map((snt, i) => ({
    id: `english-only-${i}`,
    sectionIndex: -1,
    kind: "passage" as const,
    no: 0,
    wrap: "reading" as WrapKind,
    node: (
      <p className="par-eng-only">
        <span className="par-eng-only-no">{circledNo(snt.n)}</span>
        <span className="par-eng-only-en">{snt.en}</span>
      </p>
    ),
  }));
}

// ─── 섹션 → flow item[] ───────────────────────────────────────────────────────
export function sectionFlowItems(
  section: AnalysisSection,
  si: number,
  no: number,
  sed?: SectionEdit,
  options?: SectionFlowOptions,
): FlowItem[] {
  const editable = !!sed;
  const commit = (next: AnalysisSection) => sed?.commit(next);
  const items: FlowItem[] = [];
  const push = (wrap: WrapKind, key: string, node: ReactNode, extra?: Partial<FlowItem>) =>
    items.push({ id: `s${si}-${key}`, sectionIndex: si, kind: section.kind, no, wrap, node, ...extra });

  switch (section.kind) {
    case "passage": {
      const s = section;
      const study = collectPassageStudyNotes(options?.allSections ?? [s], s.sentences);
      const keywords = (s.keywords ?? []).filter((k) => k.trim().length > 1);

      // ── 깔끔한 원문 + 해석 (필기 없음) ──
      if (options?.passageRenderMode === "clean") {
        // 핵심 어휘 밑줄 범례 — 굵은 밑줄이 핵심 어휘임을 명시
        if (keywords.length) {
          push(
            "note",
            "kw-legend",
            <p className="par-note par-kw-legend">
              <mark className="par-kw">굵은 밑줄</mark> 표시는 본문의 핵심 어휘예요.
            </p>,
          );
        }
        s.sentences.forEach((sentence, sentenceIndex) => {
          const patchClean = (patch: Partial<PassageSection["sentences"][number]>) =>
            commit({ ...s, sentences: s.sentences.map((it, idx) => (idx === sentenceIndex ? { ...it, ...patch } : it)) });
          push(
            "reading",
            `clean-snt${sentenceIndex}`,
            <CleanPassageSentence
              no={sentence.n}
              en={sentence.en}
              ko={sentence.ko}
              keywords={keywords}
              editable={editable}
              onCommitEn={(v) => patchClean({ en: v })}
              onCommitKo={(v) => patchClean({ ko: v })}
            />,
          );
        });
        break;
      }

      // ── 신규 필기 캔버스 (HLC) ──
      if ((options?.passageLayout ?? "hlc") !== "legacy") {
        // 색상 범례 — 어법/구문/출제/논리 색이 무엇을 뜻하는지 표시
        push("note", "anno-legend", <AnnotatedColorLegend />);
        s.sentences.forEach((_sentence, sentenceIndex) => {
          const sentence = s.sentences[sentenceIndex];
          const vocabNotes = study.vocabBySentence.get(sentence.n) ?? [];
          const vocabRanges = findVocabularyInlineMatches(sentence.en, vocabNotes).map((m) => ({ start: m.start, end: m.end }));
          const { notes, refs } = buildCanvasNotesForSentence(study, sentence.n);
          const seed = sentence.chunks?.length ? sentence.chunks : undefined;
          const plan = buildSentenceCanvasPlan(sentence.en, sentence.ko, seed, notes, vocabRanges);
          const patchSentence = (patch: Partial<PassageSection["sentences"][number]>) =>
            commit({ ...s, sentences: s.sentences.map((it, idx) => (idx === sentenceIndex ? { ...it, ...patch } : it)) });
          const groups = planSentenceSplit(plan);
          if (!groups.length) {
            push(
              "reading",
              `annotated-snt${sentenceIndex}`,
              <AnnotatedSentenceCanvas
                canvasId={`s${si}-annotated-snt${sentenceIndex}`}
                no={sentence.n}
                isCont={false}
                plan={plan}
                en={sentence.en}
                ko={sentence.ko}
                vocabNotes={[]}
                keywords={keywords}
                refs={refs}
                editable={editable}
                sectionEdit={options?.sectionEdit}
                onCommitEn={(newEn) => patchSentence({ en: newEn })}
                onCommitKo={(newKo) => patchSentence({ ko: newKo })}
                showTrans
              />,
            );
          } else {
            groups.forEach((group, partIndex) => {
              const subChunks = group.map((ci) => plan.chunks[ci]);
              const subEn = subChunks.map((c) => c.text).join("");
              const start = subChunks[0].start;
              const end = subChunks[subChunks.length - 1].end;
              const subNotes = notes.filter((nt) => {
                const r = resolveAnchorRange(sentence.en, nt.anchorText);
                return r ? r.start >= start && r.start < end : partIndex === 0;
              });
              const subVocab = vocabRanges
                .filter((r) => r.start >= start && r.start < end)
                .map((r) => ({ start: r.start - start, end: r.end - start }));
              const subPlan = buildSentenceCanvasPlan(subEn, partIndex === 0 ? sentence.ko : "", undefined, subNotes, subVocab);
              push(
                "reading",
                `annotated-snt${sentenceIndex}-source-${partIndex}`,
                <AnnotatedSentenceCanvas
                  canvasId={`s${si}-annotated-snt${sentenceIndex}-source-${partIndex}`}
                  no={sentence.n}
                  isCont={partIndex > 0}
                  plan={subPlan}
                  en={subEn}
                  ko={partIndex === 0 ? sentence.ko : ""}
                  vocabNotes={[]}
                  keywords={keywords}
                  refs={refs}
                  editable={editable}
                  sectionEdit={options?.sectionEdit}
                  onCommitKo={partIndex === 0 ? (newKo) => patchSentence({ ko: newKo }) : undefined}
                  showTrans={partIndex === 0}
                />,
              );
            });
          }
        });
        if (study.globalExam.length) {
          push("note", "annotated-exam-bank", <ReadingExamBank notes={study.globalExam} editable={!!options?.sectionEdit} sectionEdit={options?.sectionEdit} />);
        }
        break;
      }

      // ── legacy 스택 카드 경로 (passageLayout === "legacy") ──
      s.sentences.forEach((_sentence, sentenceIndex) => {
        const sentence = s.sentences[sentenceIndex];
        const sourceParts = splitReadingSentenceText(sentence.en);
        if (sourceParts.length > 1) {
          sourceParts.forEach((_part, partIndex) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-source-${partIndex}`,
              <AnnotatedPassageSentenceSourceBlock
                section={s}
                sentenceIndex={sentenceIndex}
                partIndex={partIndex}
                parts={sourceParts}
                study={study}
                editable={editable}
                onCommit={commit}
              />,
            );
          });
          push(
            "reading",
            `annotated-snt${sentenceIndex}-trans`,
            <AnnotatedPassageSentenceSideBlock
              section={s}
              sentenceIndex={sentenceIndex}
              study={study}
              editable={editable}
              onCommit={commit}
              sectionEdit={options?.sectionEdit}
            />,
          );
        } else {
          push(
            "reading",
            `annotated-snt${sentenceIndex}`,
            <AnnotatedPassageSentenceBlock
              section={s}
              sentenceIndex={sentenceIndex}
              study={study}
              editable={editable}
              onCommit={commit}
              sectionEdit={options?.sectionEdit}
            />,
          );
        }
        const canEditLinked = !!options?.sectionEdit;
        const grammarNotes = study.grammarBySentence.get(sentence.n) ?? [];
        const parsingNotes = study.parsingBySentence.get(sentence.n) ?? [];
        const examNotes = study.examBySentence.get(sentence.n) ?? [];
        grammarNotes.forEach((note) => {
          grammarNoteParts(note, canEditLinked).forEach((part) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-grammar-${note.sectionIndex}-${note.rowIndex}-${grammarPartKey(part)}`,
              <ReadingStudyNoteBlock>
                <ReadGrammarNotePart note={note} part={part} editable={canEditLinked} sectionEdit={options?.sectionEdit} />
              </ReadingStudyNoteBlock>,
            );
          });
        });
        parsingNotes.forEach((note) => {
          parsingNoteParts(note).forEach((part) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-parse-${note.sectionIndex}-${note.itemIndex}-${parsingPartKey(part)}`,
              <ReadingStudyNoteBlock>
                <ReadParsingNotePart note={note} part={part} editable={canEditLinked} sectionEdit={options?.sectionEdit} />
              </ReadingStudyNoteBlock>,
            );
          });
        });
        examNotes.forEach((note) => {
          examNoteParts(note, canEditLinked).forEach((part) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-exam-${note.sectionIndex}-${note.rowIndex}-${examPartKey(part)}`,
              <ReadingStudyNoteBlock>
                <ReadExamNotePart note={note} part={part} editable={canEditLinked} sectionEdit={options?.sectionEdit} />
              </ReadingStudyNoteBlock>,
            );
          });
        });
      });
      if (study.globalExam.length) {
        push(
          "note",
          "annotated-exam-bank",
          <ReadingExamBank notes={study.globalExam} editable={!!options?.sectionEdit} sectionEdit={options?.sectionEdit} />,
        );
      }
      break;
    }
    case "structure-map": {
      const s = section;
      const patch = (p: Partial<typeof s>) => commit({ ...s, ...p } as AnalysisSection);
      if (s.note) push("note", "note", <p className="par-note">{s.note}</p>);
      push(
        "map",
        "intro",
        <div className="par-node">
          {s.intro.eyebrow ? <div className="par-node-eyebrow">{s.intro.eyebrow}</div> : null}
          <Field as="div" className="par-node-label" editable={editable} value={s.intro.label} onCommit={(v) => patch({ intro: { ...s.intro, label: v } })} />
        </div>,
      );
      if (s.variant === "sequence" && s.steps && s.steps.length > 0) {
        s.steps.forEach((st, i) => {
          push(
            "map",
            `step${i}`,
            <div className="par-step">
              <span className="par-step-no">{i + 1}</span>
              <div className="par-step-body par-edit-grow">
                <div className="par-step-title">
                  <Field editable={editable} value={st.titleKo} onCommit={(v) => patch({ steps: s.steps!.map((x, j) => (j === i ? { ...x, titleKo: v } : x)) })} />
                  {st.titleEn ? <span className="par-step-en"> ({st.titleEn})</span> : null}
                </div>
                {st.detail || editable ? (
                  <Field as="div" className="par-step-detail" editable={editable} value={st.detail ?? ""} placeholder="(단계 설명)" onCommit={(v) => patch({ steps: s.steps!.map((x, j) => (j === i ? { ...x, detail: v } : x)) })} />
                ) : null}
              </div>
            </div>,
          );
        });
      } else {
        if (s.branchLabel) {
          push("map", "branch", (
            <div className="par-node par-node-soft">
              <Field as="div" className="par-node-label" editable={editable} value={s.branchLabel} onCommit={(v) => patch({ branchLabel: v })} />
            </div>
          ));
        }
        if (s.columns && s.columns.length > 0) {
          push("map", "cols", (
            <div className="par-cols">
              {s.columns.map((col, i) => (
                <div className="par-col" key={i}>
                  <div className="par-col-head">
                    <Field as="span" className="par-col-en" editable={editable} value={col.titleEn} onCommit={(v) => patch({ columns: s.columns!.map((c, j) => (j === i ? { ...c, titleEn: v } : c)) as typeof s.columns })} />
                    <Field as="span" className="par-col-ko" editable={editable} value={col.titleKo} onCommit={(v) => patch({ columns: s.columns!.map((c, j) => (j === i ? { ...c, titleKo: v } : c)) as typeof s.columns })} />
                  </div>
                  <ul>
                    {col.bullets.map((b, j) => (
                      <li key={j}>
                        <Field as="span" editable={editable} value={b} onCommit={(v) => patch({ columns: s.columns!.map((c, ci) => (ci === i ? { ...c, bullets: c.bullets.map((bb, bj) => (bj === j ? v : bb)) } : c)) as typeof s.columns })} />
                        {editable ? <DelBtn onClick={() => patch({ columns: s.columns!.map((c, ci) => (ci === i ? { ...c, bullets: c.bullets.filter((_, bj) => bj !== j) } : c)) as typeof s.columns })} /> : null}
                      </li>
                    ))}
                  </ul>
                  {col.footer ? <div className="par-col-foot">{col.footer}</div> : null}
                </div>
              ))}
            </div>
          ));
        }
      }
      push(
        "map",
        "core",
        <div className="par-core">
          {s.coreDistinction.eyebrow ? <div className="par-core-eyebrow">{s.coreDistinction.eyebrow}</div> : null}
          <Field as="div" className="par-core-label" editable={editable} value={s.coreDistinction.label ?? ""} onCommit={(v) => patch({ coreDistinction: { ...s.coreDistinction, label: v } })} />
          {s.coreDistinction.detail ? <Field as="div" className="par-core-detail" editable={editable} value={s.coreDistinction.detail} onCommit={(v) => patch({ coreDistinction: { ...s.coreDistinction, detail: v } })} /> : null}
        </div>,
      );
      push(
        "map",
        "concl",
        <div className="par-concl">
          {s.conclusion.eyebrow ? <div className="par-concl-eyebrow">{s.conclusion.eyebrow}</div> : null}
          <Field as="div" className="par-concl-text" editable={editable} value={s.conclusion.text ?? ""} onCommit={(v) => patch({ conclusion: { ...s.conclusion, text: v } })} />
        </div>,
      );
      push(
        "logic",
        "logic",
        <div className="par-box par-accent par-logic">
          <span className="par-logic-k">논리 흐름 한 줄</span>
          <Field editable={editable} value={s.logicFlow} onCommit={(v) => patch({ logicFlow: v })} />
        </div>,
      );
      break;
    }
    case "summary": {
      const s = section;
      s.sentences.forEach((t, i) => {
        push(
          "summary",
          `sum${i}`,
          <>
            <Field as="span" className="par-edit-grow" editable={editable} value={t} onCommit={(v) => commit({ ...s, sentences: s.sentences.map((x, j) => (j === i ? v : x)) })} />
            {editable ? <DelBtn onClick={() => commit({ ...s, sentences: s.sentences.filter((_, j) => j !== i) })} /> : null}
          </>,
        );
      });
      push(
        "thesis",
        "thesis",
        <div className="par-thesis">
          <div className="par-thesis-eyebrow">ONE-LINE THESIS · 영문 주제문</div>
          <Field as="div" className="par-thesis-en" editable={editable} value={s.thesisEn} onCommit={(v) => commit({ ...s, thesisEn: v })} />
        </div>,
      );
      break;
    }
    case "grammar": {
      const s = section;
      if (s.note) push("note", "note", <p className="par-note">{s.note}</p>);
      const h = new Set(s.hiddenCols ?? []);
      const upd = (i: number, p: Partial<(typeof s.rows)[number]>) => commit({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
      const delRow = (i: number) => commit({ ...s, rows: s.rows.filter((_, j) => j !== i) });
      s.rows.forEach((r, i) => {
        push(
          "grammar",
          `row${i}`,
          <>
            {!h.has("sentenceNo") ? <td className="par-cell-no">{circledNo(r.sentenceNo)}</td> : null}
            {!h.has("point") ? <Field as="td" className="par-cell-head" editable={editable} value={r.point} onCommit={(v) => upd(i, { point: v })} /> : null}
            {!h.has("explanation") ? (
              <td>
                {r.excerpt || editable ? (
                  <Field as="span" className="par-gr-excerpt" editable={editable} value={r.excerpt ?? ""} placeholder="(원문 구절)" render={(v) => `“${v}”`} onCommit={(v) => upd(i, { excerpt: v })} />
                ) : null}
                <Field as="span" editable={editable} value={r.explanation} onCommit={(v) => upd(i, { explanation: v })} />
                {r.trap || editable ? (
                  <span className="par-trap"><b>⚠ 함정</b>{" "}<Field as="span" editable={editable} value={r.trap ?? ""} placeholder="(함정/오답)" onCommit={(v) => upd(i, { trap: v })} /></span>
                ) : null}
                {editable ? <DelBtn title="행 삭제" onClick={() => delRow(i)} /> : null}
              </td>
            ) : null}
          </>,
          { hiddenCols: s.hiddenCols },
        );
      });
      break;
    }
    case "exam-focus": {
      const s = section;
      const h = new Set(s.hiddenCols ?? []);
      const upd = (i: number, p: Partial<(typeof s.rows)[number]>) => commit({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
      const delRow = (i: number) => commit({ ...s, rows: s.rows.filter((_, j) => j !== i) });
      s.rows.forEach((r, i) => {
        push(
          "exam",
          `row${i}`,
          <>
            {!h.has("type") ? <Field as="td" className="par-cell-head" editable={editable} value={r.type} onCommit={(v) => upd(i, { type: v })} /> : null}
            {!h.has("asks") ? <Field as="td" editable={editable} value={r.asks ?? ""} onCommit={(v) => upd(i, { asks: v })} /> : null}
            {!h.has("strategy") ? (
              <td>
                <Field as="span" editable={editable} value={r.strategy ?? ""} onCommit={(v) => upd(i, { strategy: v })} />
                {editable ? <DelBtn title="행 삭제" onClick={() => delRow(i)} /> : null}
              </td>
            ) : null}
          </>,
          { hiddenCols: s.hiddenCols },
        );
      });
      break;
    }
    case "vocabulary": {
      const s = section;
      const mode = options?.vocabTestOnly && (s.vocabTestMode ?? "study") === "study" ? "hide-meaning" : s.vocabTestMode ?? "study";
      const h = new Set(s.hiddenCols ?? []);
      const upd = (i: number, p: Partial<(typeof s.rows)[number]>) => commit({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
      const delRow = (i: number) => commit({ ...s, rows: s.rows.filter((_, j) => j !== i) });
      if (!options?.vocabTestOnly) {
        s.rows.forEach((r, i) => {
          const visibleCols = (["headword", "pronunciation", "meaning", "synonyms", "antonyms"] as const).filter((key) => !h.has(key));
          const deleteAnchor = visibleCols[visibleCols.length - 1];
          const rowDelete = editable ? <DelBtn className="par-table-row-delete" title="단어 행 삭제" onClick={() => delRow(i)} /> : null;
          push(
            "vocab",
            `row${i}`,
            <>
              {!h.has("headword") ? (
                <td className={cn("par-cell-head", deleteAnchor === "headword" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.headword} onCommit={(v) => upd(i, { headword: v })} />
                  {deleteAnchor === "headword" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("pronunciation") ? (
                <td className={cn("par-cell-pron", deleteAnchor === "pronunciation" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.pronunciation ?? ""} onCommit={(v) => upd(i, { pronunciation: v })} />
                  {deleteAnchor === "pronunciation" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("meaning") ? (
                <td className={cn(deleteAnchor === "meaning" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.meaning} onCommit={(v) => upd(i, { meaning: v })} />
                  {deleteAnchor === "meaning" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("synonyms") ? (
                <td className={cn("par-cell-syn", deleteAnchor === "synonyms" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.synonyms ?? ""} onCommit={(v) => upd(i, { synonyms: v })} />
                  {deleteAnchor === "synonyms" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("antonyms") ? (
                <td className={cn("par-cell-ant", deleteAnchor === "antonyms" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.antonyms ?? ""} onCommit={(v) => upd(i, { antonyms: v })} />
                  {deleteAnchor === "antonyms" ? rowDelete : null}
                </td>
              ) : null}
            </>,
            { hiddenCols: s.hiddenCols },
          );
        });
      }
      if (mode !== "study" && s.rows.length > 0) {
        const testHiddenCols = vocabTestHiddenCols(s.hiddenCols, mode);
        const th = new Set(testHiddenCols);
        const excluded = new Set(s.vocabTestExcludedKeys ?? []);
        const testRows = s.rows
          .map((row, index) => ({ row, index, key: vocabTestRowKey(row) }))
          .filter(({ key }) => !excluded.has(key));
        const visibleTestCols = (["headword", "pronunciation", "meaning", "synonyms"] as const).filter((key) => !th.has(key));
        const deleteAnchor = visibleTestCols[visibleTestCols.length - 1];
        const excludeFromTest = (row: VocabularyRow) => {
          const key = vocabTestRowKey(row);
          commit({ ...s, vocabTestExcludedKeys: [...new Set([...(s.vocabTestExcludedKeys ?? []), key])] });
        };
        const modeLabel = mode === "hide-meaning" ? "뜻 쓰기" : "단어 쓰기";
        push(
          "note",
          "vocab-test-head",
          <div className="par-vocab-test-head">
            <span className="par-vocab-test-k">단어 시험지</span>
            <span className="par-vocab-test-mode">{modeLabel}</span>
          </div>,
        );
        if (testRows.length === 0) {
          push(
            "note",
            "vocab-test-empty",
            <div className="par-vocab-test-empty">시험지에 표시할 단어가 없습니다.</div>,
          );
        }
        if (s.vocabTestLayout === "two-column" && testRows.length > 0) {
          for (let j = 0; j < testRows.length; j += 2) {
            const left = testRows[j];
            const right = testRows[j + 1];
            push(
              "vocab-grid",
              `vtest-grid${left.index}`,
              <div className="par-vocab-test-grid-row">
                <VocabTestGridCard
                  row={left.row}
                  hidden={th}
                  mode={mode}
                  editable={editable}
                  onExclude={() => excludeFromTest(left.row)}
                />
                {right ? (
                  <VocabTestGridCard
                    row={right.row}
                    hidden={th}
                    mode={mode}
                    editable={editable}
                    onExclude={() => excludeFromTest(right.row)}
                  />
                ) : (
                  <div className="par-vocab-test-card par-vocab-test-card-empty" aria-hidden />
                )}
              </div>,
            );
          }
        } else {
          testRows.forEach(({ row: r, index: i }) => {
          const testExclude = editable ? (
            <DelBtn
              className="par-table-row-delete par-vocab-test-exclude"
              title="이 단어를 시험지에서 제외"
              onClick={() => excludeFromTest(r)}
            />
          ) : null;
          push(
            "vocab",
            `vtest-row${i}`,
            <>
              {!th.has("headword") ? (
                mode === "hide-headword" ? (
                  <VocabBlankCell className={cn("par-cell-head", deleteAnchor === "headword" && "par-table-row-delete-cell")}>
                    {deleteAnchor === "headword" ? testExclude : null}
                  </VocabBlankCell>
                ) : (
                  <td className={cn("par-cell-head", deleteAnchor === "headword" && "par-table-row-delete-cell")}>
                    {r.headword}
                    {deleteAnchor === "headword" ? testExclude : null}
                  </td>
                )
              ) : null}
              {!th.has("pronunciation") ? (
                <td className={cn("par-cell-pron", deleteAnchor === "pronunciation" && "par-table-row-delete-cell")}>
                  {r.pronunciation ?? ""}
                  {deleteAnchor === "pronunciation" ? testExclude : null}
                </td>
              ) : null}
              {!th.has("meaning") ? (
                mode === "hide-meaning" ? (
                  <VocabBlankCell className={cn(deleteAnchor === "meaning" && "par-table-row-delete-cell")}>
                    {deleteAnchor === "meaning" ? testExclude : null}
                  </VocabBlankCell>
                ) : (
                  <td className={cn(deleteAnchor === "meaning" && "par-table-row-delete-cell")}>
                    {r.meaning}
                    {deleteAnchor === "meaning" ? testExclude : null}
                  </td>
                )
              ) : null}
              {!th.has("synonyms") ? (
                <td className={cn("par-cell-syn", deleteAnchor === "synonyms" && "par-table-row-delete-cell")}>
                  {r.synonyms ?? ""}
                  {deleteAnchor === "synonyms" ? testExclude : null}
                </td>
              ) : null}
            </>,
            { hiddenCols: testHiddenCols },
          );
          });
        }
      }
      break;
    }
    case "parsing": {
      const s = section;
      const upd = (i: number, p: Partial<(typeof s.items)[number]>) => commit({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
      s.items.forEach((item, ii) => {
        push(
          "parse",
          `it${ii}`,
          <div className="par-box">
            <div className="par-parse">
              <div className="par-parse-en par-edit-row">
                <span className="par-edit-grow"><span className="par-sno">{circledNo(item.sentenceNo)}</span>{" "}<Field as="span" editable={editable} value={item.en} onCommit={(v) => upd(ii, { en: v })} /></span>
                {editable ? <DelBtn title="문장 삭제" onClick={() => commit({ ...s, items: s.items.filter((_, j) => j !== ii) })} /> : null}
              </div>
              <ul className="par-parse-parts">
                {item.parts.map((p, j) => (
                  <li key={j}>
                    <Field as="span" className="par-plabel" editable={editable} value={p.label} onCommit={(v) => upd(ii, { parts: item.parts.map((x, k) => (k === j ? { ...x, label: v } : x)) })} />
                    <Field as="span" editable={editable} value={p.text} onCommit={(v) => upd(ii, { parts: item.parts.map((x, k) => (k === j ? { ...x, text: v } : x)) })} />
                  </li>
                ))}
              </ul>
              <div className="par-parse-trans"><span className="par-tk">→ 해석</span><Field as="span" editable={editable} value={item.translation} onCommit={(v) => upd(ii, { translation: v })} /></div>
            </div>
          </div>,
        );
      });
      break;
    }
    case "learning-worksheet": {
      const s = section;
      const patch = (p: Partial<LearningWorksheetSection>) => commit({ ...s, ...p });
      const workbookSet = s.workbookSet;
      const consolidatedWordOrders = getConsolidatedWordOrders(s);
      const showDrillWordOrders = !workbookSet && !!s.drills?.wordOrders?.length;
      const showAnswerKey = !worksheetAnswersAreHidden(s);
      push(
        "note",
        "ws-title",
        <div className="par-ws-title">
          <Field as="div" className="par-ws-title-k" editable={editable} value={s.title} onCommit={(v) => patch({ title: v })} />
          {s.note ? <Field as="div" className="par-ws-note" editable={editable} value={s.note} onCommit={(v) => patch({ note: v })} /> : null}
        </div>,
      );
      if (!options?.skipWorksheetLogic) {
        push(
          "note",
          "ws-logic",
          <WorksheetLogicMapBlock section={s} editable={editable} onPatch={patch} />,
        );
      }
      if (s.cloze) {
        push(
          "note",
          "ws-cloze",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={s.cloze.title} kicker="Key Phrase Cloze" />
            <div className="par-ws-cloze-list">
              {s.cloze.items.map((item, i) => (
                <div className="par-ws-cloze" key={item.no}>
                  <div className="par-ws-cloze-en">
                    <span className="par-ws-cloze-no">({item.no})</span>
                    <Field
                      as="span"
                      editable={editable}
                      value={item.text}
                      onCommit={(v) =>
                        s.cloze &&
                        patch({
                          cloze: { ...s.cloze, items: s.cloze.items.map((entry, j) => (i === j ? { ...entry, text: v } : entry)) },
                        })
                      }
                    />
                  </div>
                  {item.translation ? (
                    <Field
                      as="div"
                      className="par-ws-cloze-ko"
                      editable={editable}
                      value={item.translation}
                      onCommit={(v) =>
                        s.cloze &&
                        patch({
                          cloze: { ...s.cloze, items: s.cloze.items.map((entry, j) => (i === j ? { ...entry, translation: v } : entry)) },
                        })
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <WordBank words={s.cloze.wordBank} />
          </div>,
        );
      }
      if (s.practice) {
        push(
          "note",
          "ws-practice",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={s.practice.title} kicker="No Translation" />
            <div className="par-ws-practice-list">
              {s.practice.items.map((item, i) => (
                <div className="par-ws-practice" key={item.no}>
                  <span className="par-ws-cloze-no">({item.no})</span>
                  <Field
                    as="span"
                    editable={editable}
                    value={item.text}
                    onCommit={(v) =>
                      s.practice &&
                      patch({
                        practice: { ...s.practice, items: s.practice.items.map((entry, j) => (i === j ? { ...entry, text: v } : entry)) },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <WordBank words={s.practice.wordBank} />
          </div>,
        );
      }
      if (s.drills?.grammarChoices?.length || showDrillWordOrders) {
        push(
          "note",
          "ws-drills",
          <div className="par-ws-block">
            <WorksheetMiniTitle title="어법 선택 · 단어배열 영작" kicker="Workbook Drills" />
            {s.drills?.grammarChoices?.length ? (
              <div className="par-ws-drill-set">
                <div className="par-ws-drill-label">어법 선택</div>
                {s.drills.grammarChoices.map((item, i) => (
                  <div className="par-ws-grammar-choice" key={item.no}>
                    <div className="par-ws-drill-line">
                      <span className="par-ws-cloze-no">{item.no}.</span>
                      {editable ? (
                        <Field
                          as="span"
                          editable
                          value={item.text}
                          onCommit={(v) =>
                            patch({
                              drills: {
                                ...s.drills,
                                grammarChoices: s.drills?.grammarChoices?.map((entry, j) => (i === j ? { ...entry, text: v } : entry)),
                              },
                            })
                          }
                        />
                      ) : (
                        <span>{renderGrammarChoiceText(item.text)}</span>
                      )}
                    </div>
                    <div className="par-ws-drill-options">[{item.choices.join(" / ")}]</div>
                  </div>
                ))}
              </div>
            ) : null}
            {showDrillWordOrders ? (
              <div className="par-ws-drill-set">
                <div className="par-ws-drill-label">주요문장 단어배열 영작</div>
                {(s.drills?.wordOrders ?? []).map((item, i) => (
                  <div className="par-ws-wordorder" key={item.no}>
                    <div className="par-ws-wordorder-ko">
                      <span className="par-ws-cloze-no">{item.no}.</span>
                      <Field
                        as="span"
                        editable={editable}
                        value={item.korean}
                        onCommit={(v) =>
                          patch({
                            drills: {
                              ...s.drills,
                              wordOrders: s.drills?.wordOrders?.map((entry, j) => (i === j ? { ...entry, korean: v } : entry)),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="par-ws-wordorder-chunks">[{item.chunks.join(" / ")}]</div>
                    <div className="par-ws-write-space" aria-hidden>
                      <span className="par-ws-write-line" />
                      <span className="par-ws-write-line" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>,
        );
      }
      if (workbookSet) {
        push(
          "note",
          "ws-workbook-topic",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={workbookSet.title} kicker="EBS Workbook" />
            <div className="par-ws-topic-card">
              <span className="par-ws-topic-label">{workbookSet.topicGist.title}</span>
              <Field
                as="div"
                className="par-ws-topic-title"
                editable={editable}
                value={workbookSet.topicGist.topicTitle}
                onCommit={(v) =>
                  patch({
                    workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, topicTitle: v } },
                  })
                }
              />
              <Field
                as="div"
                className="par-ws-topic-gist"
                editable={editable}
                value={workbookSet.topicGist.gist}
                onCommit={(v) =>
                  patch({
                    workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, gist: v } },
                  })
                }
              />
            </div>
          </div>,
        );
        push(
          "note",
          "ws-workbook-grammar",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={workbookSet.grammarSelection.title} kicker="Grammar Choice" />
            {editable ? (
              <Field
                as="div"
                className="par-ws-workbook-passage"
                editable
                value={workbookSet.grammarSelection.passage}
                onCommit={(v) =>
                  patch({
                    workbookSet: {
                      ...workbookSet,
                      grammarSelection: { ...workbookSet.grammarSelection, passage: v },
                    },
                  })
                }
              />
            ) : (
              <div className="par-ws-workbook-passage">{renderGrammarChoiceText(workbookSet.grammarSelection.passage)}</div>
            )}
            <div className="par-ws-choice-answer-list">
              {workbookSet.grammarSelection.choices.map((choice) => (
                <div className="par-ws-choice-answer" key={choice.no}>
                  <span className="par-ws-choice-no">{choice.no}</span>
                  <span className="par-ws-choice-options">[{choice.options.join(" / ")}]</span>
                </div>
              ))}
            </div>
          </div>,
        );
        push(
          "note",
          "ws-workbook-vocab",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={workbookSet.vocabularyCloze.title} kicker="Vocabulary Cloze" />
            <Field
              as="div"
              className="par-ws-workbook-passage"
              editable={editable}
              value={toStudentVocabularyClozePassage(workbookSet.vocabularyCloze.passage, workbookSet.vocabularyCloze.blanks)}
              onCommit={(v) =>
                patch({
                  workbookSet: {
                    ...workbookSet,
                    vocabularyCloze: { ...workbookSet.vocabularyCloze, passage: v },
                  },
                })
              }
            />
          </div>,
        );
        push(
          "note",
          "ws-workbook-order",
          <div className="par-ws-block">
            <WorksheetMiniTitle title="주요문장 단어배열 영작" kicker="Word Order" />
            <div className="par-ws-drill-set">
              {consolidatedWordOrders.map((item, i) => (
                <div className="par-ws-wordorder" key={item.no}>
                  <div className="par-ws-wordorder-ko">
                    <span className="par-ws-cloze-no">{item.no}.</span>
                    <Field
                      as="span"
                      editable={editable}
                      value={item.korean}
                      onCommit={(v) =>
                        patch({
                          workbookSet: {
                            ...workbookSet,
                            wordOrders: workbookSet.wordOrders.map((entry, j) => (i === j ? { ...entry, korean: v } : entry)),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="par-ws-wordorder-chunks">[{item.chunks.join(" / ")}]</div>
                  <div className="par-ws-write-space" aria-hidden>
                    <span className="par-ws-write-line" />
                    <span className="par-ws-write-line" />
                  </div>
                </div>
              ))}
            </div>
          </div>,
        );
      }
      const inferenceSet = s.inferenceSet;
      if (inferenceSet?.questions.length) {
        push(
          "note",
          "ws-inference-title",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={inferenceSet.title} kicker="Suneung Inference" />
          </div>,
        );
        inferenceSet.questions.forEach((q, qi) => {
          push(
            "note",
            `ws-iq${qi}`,
            <WorksheetQuestionCard
              q={q}
              editable={editable}
              hiddenAnswers
              onPatch={(questionPatch) => {
                const safePatch = { ...questionPatch };
                delete safePatch.type;
                patch({
                  inferenceSet: {
                    ...inferenceSet,
                    questions: inferenceSet.questions.map((item, j) => (qi === j ? { ...item, ...safePatch } : item)),
                  },
                });
              }}
            />,
          );
        });
      }
      (s.questions ?? []).forEach((q, qi) => {
        push(
          "note",
          `ws-q${qi}`,
          <WorksheetQuestionCard
            q={q}
            editable={editable}
            hiddenAnswers
            onPatch={(questionPatch) =>
              patch({
                questions: (s.questions ?? []).map((item, j) => (qi === j ? { ...item, ...questionPatch } : item)),
              })
            }
          />,
        );
      });
      if (showAnswerKey) {
        let firstAnswer = true;
        for (const sub of worksheetAnswerKeySubsections(s, consolidatedWordOrders)) {
          // 정답·해설은 맨 뒤 '별도 페이지'에서 시작 (학생 시험지와 분리)
          push("note", `ws-answer-${sub.key}`, sub.node, firstAnswer ? { breakBefore: true } : undefined);
          firstAnswer = false;
        }
      }
      break;
    }
    case "self-check":
      break; // 제외
  }
  return items;
}

// ─── 커스텀 블록 (여백 / 자유 텍스트) ────────────────────────────────────────
function CustomTextNode({
  cb,
  editable,
  onText,
  onHeading,
}: {
  cb: Extract<CustomBlock, { kind: "text" }>;
  editable: boolean;
  onText: (v: string) => void;
  onHeading: (v: string) => void;
}) {
  return (
    <div className="par-customtext">
      {cb.heading || editable ? (
        <Field as="div" className="par-customtext-h" editable={editable} value={cb.heading ?? ""} placeholder="(소제목)" onCommit={onHeading} />
      ) : null}
      <Field as="div" className="par-customtext-b" editable={editable} value={cb.text} placeholder="자유 텍스트를 입력하세요" onCommit={onText} />
    </div>
  );
}

export type CustomEdit = (id: string, patch: Partial<CustomBlock>) => void;

export function customBlockFlowItem(cb: CustomBlock, setCustom?: CustomEdit): FlowItem {
  if (cb.kind === "spacer") {
    return {
      id: cb.id,
      sectionIndex: -1,
      kind: "custom",
      no: 0,
      wrap: "spacer",
      node: <div className="par-spacer-fill" style={{ height: `${cb.heightMm}mm` }} aria-hidden />,
    };
  }
  return {
    id: cb.id,
    sectionIndex: -1,
    kind: "custom",
    no: 0,
    wrap: "custom-text",
    node: (
      <CustomTextNode
        cb={cb}
        editable={!!setCustom}
        onText={(v) => setCustom?.(cb.id, { text: v })}
        onHeading={(v) => setCustom?.(cb.id, { heading: v })}
      />
    ),
  };
}

/** 표지(활성화 시) — 강제 전면 페이지 flow item. */
function coverItems(report: AnalysisReport, ced?: CoverEdit): FlowItem[] {
  if (!report.cover?.enabled) return [];
  return [
    {
      id: "cover",
      sectionIndex: -1,
      kind: "cover",
      no: 0,
      wrap: "cover",
      node: <CoverSheet report={report} ced={ced} />,
    },
  ];
}

/** 보고서 → 전체 flow item[] (자연 순서). self-check 제외. 커스텀 블록은 뒤에 붙고 blockOrder 로 배치. */
export function reportFlowItems(
  report: AnalysisReport,
  edit?: { med?: MetaEdit; sectionEdit?: (i: number) => SectionEdit; setCustom?: CustomEdit; ced?: CoverEdit },
): FlowItem[] {
  const vocabTestOnly = !!report.vocabTestOnly;
  const items: FlowItem[] = vocabTestOnly
    ? []
    : [...coverItems(report, edit?.ced), ...titleItems(report, edit?.med), ...englishOnlyPageItems(report)];

  const findIdx = (k: AnalysisSection["kind"]) => report.sections.findIndex((s) => s.kind === k);
  const passageIdx = findIdx("passage");

  // ── 새 보고서 구성 (passage 존재 시): 원문+해석 → 도식 → 요약 → 논리 → 필기 캔버스 → 어휘 → 학습지 ──
  if (!vocabTestOnly && passageIdx >= 0) {
    const summaryIdx = findIdx("summary");
    const vocabIdx = findIdx("vocabulary");
    const lwIdx = report.sections.findIndex((s) => s.kind === "learning-worksheet");
    const lwSection = lwIdx >= 0 && report.sections[lwIdx].kind === "learning-worksheet" ? report.sections[lwIdx] : undefined;
    const lwHasLogic = !!lwSection && lwSection.logicRows.length > 0;

    let no = 0;
    const head = (
      si: number,
      kind: AnalysisSection["kind"],
      idSuffix: string,
      labelKo: string | undefined,
      labelEn: string | undefined,
      breakBefore: boolean,
    ) => {
      items.push({
        id: `s${si}-head${idSuffix}`,
        sectionIndex: si,
        kind,
        no,
        wrap: "secheader",
        node: <SectionHead no={no} kind={kind} labelKo={labelKo} labelEn={labelEn} />,
        breakBefore,
      });
    };
    const emit = (si: number, opts: Partial<SectionFlowOptions>) => {
      const sed = edit?.sectionEdit ? edit.sectionEdit(si) : undefined;
      items.push(
        ...sectionFlowItems(report.sections[si], si, no, sed, {
          allSections: report.sections,
          sectionEdit: edit?.sectionEdit,
          passageLayout: report.passageLayout,
          ...opts,
        }),
      );
    };

    // 1) 원문 + 문장별 해석 (필기 없음) — 영어 원문 페이지가 켜졌으면 새 페이지에서 시작
    no += 1;
    head(passageIdx, "passage", "", "원문 · 문장별 해석", "Original Passage & Translation", !!report.englishOnlyPage);
    emit(passageIdx, { passageRenderMode: "clean" });

    // 2) 한눈에 보는 지문 구조 (도식) — 섹션 삭제됨(사용자 요청): 렌더링하지 않음

    // 3) 핵심 요약
    if (summaryIdx >= 0) {
      no += 1;
      head(summaryIdx, "summary", "", undefined, undefined, false);
      emit(summaryIdx, {});
    }

    // 4) 지문 논리 구조 분석 (Logic Map)
    if (lwHasLogic && lwSection) {
      no += 1;
      head(lwIdx, "learning-worksheet", "-logic", "지문 논리 구조 분석", "Logic Map", false);
      const lwEdit = edit?.sectionEdit?.(lwIdx);
      items.push({
        id: `s${lwIdx}-logic-promoted`,
        sectionIndex: lwIdx,
        kind: "learning-worksheet",
        no,
        wrap: "note",
        node: <WorksheetLogicMapBlock section={lwSection} editable={!!lwEdit} onPatch={(patch) => lwEdit?.commit({ ...lwSection, ...patch })} />,
      });
    }

    // 5) 필기 분석 캔버스 (어법·구문·출제 인라인) — 새 페이지에서 시작
    no += 1;
    head(passageIdx, "passage", "-anno", "필기 분석 · 어법과 구문", "Annotated Reading", true);
    emit(passageIdx, { passageRenderMode: "annotated" });

    // 6) 핵심 어휘 (단어 시험 원천)
    if (vocabIdx >= 0) {
      no += 1;
      head(vocabIdx, "vocabulary", "", undefined, undefined, false);
      emit(vocabIdx, {});
    }

    // 7) 실전 학습지 (논리표는 4번에서 별도 표시 → 여기선 제외)
    if (lwIdx >= 0) {
      no += 1;
      head(lwIdx, "learning-worksheet", "", undefined, undefined, false);
      emit(lwIdx, { skipWorksheetLogic: true });
    }

    for (const cb of report.customBlocks ?? []) items.push(customBlockFlowItem(cb, edit?.setCustom));
    return items;
  }

  // ── 폴백: passage 없음 또는 vocabTestOnly — 기존 자연 순서 ──
  const inlineStudyNotes = !vocabTestOnly && report.sections.some((section) => section.kind === "passage");
  const summaryIndex = report.sections.findIndex((section) => section.kind === "summary");
  const promotedLogicIndex = summaryIndex >= 0
    ? report.sections.findIndex((section) => section.kind === "learning-worksheet" && section.logicRows.length > 0)
    : -1;
  let no = 0;
  report.sections.forEach((section, si) => {
    if (section.kind === "self-check") return;
    // 한눈에 보는 지문 구조(도식) 섹션 삭제됨(사용자 요청) — 폴백 경로에서도 제외
    if (section.kind === "structure-map") return;
    if (vocabTestOnly && section.kind !== "vocabulary") return;
    if (inlineStudyNotes && (section.kind === "grammar" || section.kind === "exam-focus" || section.kind === "parsing")) return;
    no += 1;
    // 섹션 헤더도 독립 블록(드래그/이동 가능)
    if (!vocabTestOnly) {
      items.push({
        id: `s${si}-head`,
        sectionIndex: si,
        kind: section.kind,
        no,
        wrap: "secheader",
        node: <SectionHead no={no} kind={section.kind} />,
      });
    }
    const sed = edit?.sectionEdit ? edit.sectionEdit(si) : undefined;
    items.push(...sectionFlowItems(section, si, no, sed, {
      vocabTestOnly,
      allSections: report.sections,
      sectionEdit: edit?.sectionEdit,
      skipWorksheetLogic: si === promotedLogicIndex,
      passageLayout: report.passageLayout,
    }));
    if (!vocabTestOnly && si === summaryIndex && promotedLogicIndex >= 0) {
      const worksheet = report.sections[promotedLogicIndex];
      if (worksheet?.kind === "learning-worksheet") {
        const worksheetEdit = edit?.sectionEdit?.(promotedLogicIndex);
        items.push({
          id: `s${promotedLogicIndex}-logic-promoted`,
          sectionIndex: promotedLogicIndex,
          kind: "learning-worksheet",
          no,
          wrap: "note",
          node: (
            <WorksheetLogicMapBlock
              section={worksheet}
              editable={!!worksheetEdit}
              onPatch={(patch) => worksheetEdit?.commit({ ...worksheet, ...patch })}
            />
          ),
        });
      }
    }
  });
  if (!vocabTestOnly) {
    for (const cb of report.customBlocks ?? []) {
      items.push(customBlockFlowItem(cb, edit?.setCustom));
    }
  }
  return items;
}
