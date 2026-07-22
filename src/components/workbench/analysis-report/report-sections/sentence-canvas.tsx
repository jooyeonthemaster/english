import { type CSSProperties, type ClipboardEvent, type FocusEvent, Fragment, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { normalizeEditableText } from "@/components/exams/paper-builder/components/editable-text";
import { circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import { type CanvasNoteInput, type CanvasNoteKind, type PlacedNote, type SentenceCanvasPlan } from "@/lib/passage-report/analysis-report/passage-canvas-model";
import { type AnalysisSection, type AnnoLayout } from "@/lib/passage-report/analysis-report/schema";
import { cn } from "@/lib/utils";
import type { CanvasNoteRef, ConnectorPath, PassageSection, SectionEdit, VocabularyNoteRef } from "./types";
import { DelBtn, Field, handleEditableKeyDown } from "./editable-field";
import { AnnotatedReadingField, joinReadingSentenceParts, readEditableTextIgnoringAnnotations, renderAnnotatedReadingText } from "./annotated-reading";
import { ReadLogicNote, collectPassageStudyNotes, patchExamNote, patchGrammarNote, patchLogicNote, splitStudyNoteText } from "./study-notes";

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
export function AnnotatedColorLegend() {
  // 구문(parsing)은 필기 캔버스에서 제외했으므로 범례에서도 뺀다.
  const items: [CanvasNoteKind, string][] = [
    ["grammar", "어법 포인트"],
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

function cleanParseLabel(label: string): string {
  return label.replace(/[[\]]/g, "").trim();
}

function noteBodyLines(layoutLines: string[] | undefined, fallback: string): string[] {
  const fromLayout = (layoutLines ?? []).map((l) => l.trim()).filter(Boolean);
  if (fromLayout.length) return fromLayout;
  return splitStudyNoteText(fallback).map((l) => l.trim()).filter(Boolean);
}

/** 한 문장 번호에 걸린 study 노트들을 캔버스 입력 + 편집용 ref 맵으로 변환. */
export function buildCanvasNotesForSentence(
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
      onKeyDown={handleEditableKeyDown}
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
        // 틀린 토큰(exampleWrong)이 있으면 편집 모드에서도 빨강 강조 렌더로 보여준다
        // (Field 편집 모드는 plain text 만 렌더 가능해 인라인 색을 못 입힘). 틀린
        // 토큰이 없는 일반 예문은 인라인 편집을 유지한다.
        canEdit && !note.exampleWrong ? (
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

/** 문장 1개 = 원자 캔버스. */
export function AnnotatedSentenceCanvas({
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

  // 모든 필기를 종류별로 재배치(v3): 어법 → 아래 목록(번호 뱃지) / 출제·논리 → 오른쪽 레일.
  // 구문(parsing) 필기는 필기 캔버스에서 제외 — 끊어읽기(청크 글로스)로 이미 드러나고,
  // 장황한 구문 해설은 별도 '구문 분석' 섹션이 담당하므로 캔버스에서는 삭제한다.
  const allNotes = [...plan.interlineByChunk.flat(), ...plan.railNotes, ...plan.footnoteNotes];
  const listNotes = allNotes.filter((n) => n.kind === "grammar");
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
      // 시각 배율 보정 — 에디터는 .par-sheet 의 CSS zoom, 학습지 미리보기 모달·
      // 페이지 썸네일은 상위 transform: scale 로 축소한다. 둘 다
      // getBoundingClientRect 를 시각 크기로 줄이지만 SVG 오버레이 좌표계는
      // 레이아웃 픽셀이므로 실측 비율(rect폭/offset폭)로 나눠 복원한다.
      // (기존의 computedStyle zoom 파싱은 transform 을 못 봐서 미리보기 모달에서
      // 연결 화살표가 0.78배 지점으로 무너져 그려졌다 — 26-07-22 수정.)
      const zoom = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;
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
      const next: ConnectorPath[] = [];
      // ── (1) 어법 목록(왼쪽 아래) 연결선 ── 위 연결일수록 안쪽(오른쪽) 레인.
      if (raw.length) {
        raw.sort((p, q) => p.by - q.by || p.x1 - q.x1);
        const minBx = Math.min(...raw.map((r) => r.bx));
        const laneRight = Math.max(7, minBx - 5); // 뱃지 바로 왼쪽(가장 안쪽 레인)
        const laneLeft = 3; // 가장 바깥(왼쪽 끝) 레인
        const cnt = raw.length;
        raw.forEach((r, i) => {
          const laneX = cnt > 1 ? laneRight - ((laneRight - laneLeft) * i) / (cnt - 1) : laneRight;
          const shelfY = r.lineBottom + i * 1.4; // 그 줄 아래 빈 띠, 연결마다 살짝 어긋나게
          const endx = Math.max(laneX + 1, r.bx - 1);
          const d = `M ${r.x1.toFixed(1)} ${r.y1.toFixed(1)} L ${r.x1.toFixed(1)} ${shelfY.toFixed(1)} L ${laneX.toFixed(1)} ${shelfY.toFixed(1)} L ${laneX.toFixed(1)} ${r.by.toFixed(1)} L ${endx.toFixed(1)} ${r.by.toFixed(1)}`;
          next.push({ d, color: r.color, hx: endx, hy: r.by });
        });
      }
      // ── (2) 출제·논리 레일(오른쪽) 연결선 ── 근거 청크 → (살짝 내려) staff·레일 사이
      // 여백 레인으로 → 레인 따라 ↕ → 레일 카드로 →. 세로 이동은 항상 여백 레인에서만 일어나
      // 본문을 가리지 않고, 연결마다 다른 레인 x + 다른 진입 높이로 분리해 겹치지 않게 한다.
      const railRaw: { cx: number; y1: number; lineBottom: number; rx: number; ry: number; color: string }[] = [];
      sideNotes.forEach((n) => {
        if (!n.anchorRange) return;
        const railEl = root.querySelector<HTMLElement>(`[data-rail-key="${n.key}"]`);
        const chunkEl = root.querySelector<HTMLElement>(`[data-anchor-id="${canvasId}-c${n.chunkIndex}"]`);
        if (!railEl || !chunkEl) return;
        const enEl = chunkEl.querySelector<HTMLElement>(".par-canvas-en") ?? chunkEl;
        const a = enEl.getBoundingClientRect();
        const c = chunkEl.getBoundingClientRect();
        const rr = railEl.getBoundingClientRect();
        railRaw.push({
          cx: (a.right - rootRect.left) / zoom, // 근거 청크 오른쪽 끝
          y1: (a.bottom - rootRect.top) / zoom + 1,
          lineBottom: (c.bottom - rootRect.top) / zoom + 1.5,
          rx: (rr.left - rootRect.left) / zoom, // 레일 카드 왼쪽
          ry: (rr.top - rootRect.top) / zoom + 7, // 카드 상단(원문 인용 줄)
          color: ANNO_COLOR[n.kind],
        });
      });
      if (railRaw.length) {
        railRaw.sort((p, q) => p.ry - q.ry || p.cx - q.cx);
        railRaw.forEach((r, i) => {
          const laneX = r.rx - 3 - i * 2.2; // 레일 왼쪽 여백 안에서 연결마다 다른 세로 레인
          const shelfY = r.lineBottom + i * 1.4;
          const startX = Math.min(r.cx, laneX - 2); // 항상 오른쪽으로 향하도록 보정
          const endx = r.rx - 1;
          const d = `M ${startX.toFixed(1)} ${r.y1.toFixed(1)} L ${startX.toFixed(1)} ${shelfY.toFixed(1)} L ${laneX.toFixed(1)} ${shelfY.toFixed(1)} L ${laneX.toFixed(1)} ${r.ry.toFixed(1)} L ${endx.toFixed(1)} ${r.ry.toFixed(1)}`;
          next.push({ d, color: r.color, hx: endx, hy: r.ry });
        });
      }
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
export function CleanPassageSentence({
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

export function AnnotatedPassageSentenceBlock({
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

export function AnnotatedPassageSentenceSourceBlock({
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

export function AnnotatedPassageSentenceSideBlock({
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
