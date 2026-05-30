import { type ElementType, type FocusEvent, Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { difficultyStars, circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import {
  NUMBERED_SECTION_LABELS,
  SECTION_LABELS_EN,
  type AnalysisReport,
  type AnalysisSection,
  type CustomBlock,
  type ReportMeta,
} from "@/lib/passage-report/analysis-report/schema";

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
  | "exam"
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
  if (!editable) {
    return <Tag className={className}>{render ? render(value) : value}</Tag>;
  }
  const isEmpty = !value.trim();
  return (
    <Tag
      className={cn(className, "par-edit-field", isEmpty && "par-edit-empty")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        const next = normalizeEditableText(e.currentTarget.innerText);
        if (next !== value) onCommit(next);
      }}
    >
      {value}
    </Tag>
  );
}

function DelBtn({ onClick, title = "삭제" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      className="par-edit-del par-edit-chrome"
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

export function Arrow() {
  return (
    <div className="par-arrow">
      <div className="par-arrow-line" />
      <div className="par-arrow-head" />
    </div>
  );
}

export function SectionHead({ no, kind }: { no: number; kind: AnalysisSection["kind"] }) {
  return (
    <div className="par-sec-head">
      <span className="par-sec-no">{String(no).padStart(2, "0")}</span>
      <span className="par-sec-ko">{NUMBERED_SECTION_LABELS[kind]}</span>
      <span className="par-sec-en">{SECTION_LABELS_EN[kind]}</span>
    </div>
  );
}

// ─── 표 헤더 (run 렌더러가 사용) ──────────────────────────────────────────────
const COL_WIDTH: Record<string, string | undefined> = {
  sentenceNo: "8%", point: "27%",
  type: "16%", asks: "24%",
  headword: "22%", pronunciation: "16%", meaning: "34%",
};
export function tableHeadRow(wrap: WrapKind, editable: boolean, hiddenCols?: string[]): ReactNode {
  const group = wrap === "grammar" ? "grammar" : wrap === "exam" ? "exam" : "vocab";
  const hidden = new Set(hiddenCols ?? []);
  return (
    <tr>
      {editable ? <th className="par-edit-hcell" /> : null}
      {TABLE_COLUMNS[group]
        .filter((c) => !hidden.has(c.key))
        .map((c) => (
          <th key={c.key} style={COL_WIDTH[c.key] ? { width: COL_WIDTH[c.key] } : undefined}>
            {c.label}
          </th>
        ))}
    </tr>
  );
}

// ─── 타이틀/메타 ──────────────────────────────────────────────────────────────
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
    {
      id: "meta",
      sectionIndex: -1,
      kind: "title",
      no: 0,
      wrap: "meta",
      node: (
        <>
          <table className="par-meta">
            <thead>
              <tr><th>분 류</th><th>소재 (Theme)</th><th>난이도</th><th>권장 풀이시간</th><th>핵심 출제유형</th></tr>
            </thead>
            <tbody>
              <tr>
                <Field as="td" editable={editable} value={m.category} onCommit={(v) => patch({ category: v })} />
                <Field as="td" editable={editable} value={m.theme} onCommit={(v) => patch({ theme: v })} />
                <td className="par-meta-diff">{difficultyStars(m.difficulty)}{m.difficultyNote ? ` ${m.difficultyNote}` : ""}</td>
                <Field as="td" editable={editable} value={m.solveTime} onCommit={(v) => patch({ solveTime: v })} />
                <Field as="td" editable={editable} value={m.examTypes} onCommit={(v) => patch({ examTypes: v })} />
              </tr>
            </tbody>
          </table>
          <div className="par-docnote">
            {report.docNo ? <span>DOC. {report.docNo}</span> : null}
            <span>{report.brand}</span>
            <span>본 자료의 무단 복제 · 배포를 금합니다.</span>
          </div>
        </>
      ),
    },
  ];
}

// ─── 섹션 → flow item[] ───────────────────────────────────────────────────────
export function sectionFlowItems(section: AnalysisSection, si: number, no: number, sed?: SectionEdit): FlowItem[] {
  const editable = !!sed;
  const commit = (next: AnalysisSection) => sed?.commit(next);
  const items: FlowItem[] = [];
  const push = (wrap: WrapKind, key: string, node: ReactNode, extra?: Partial<FlowItem>) =>
    items.push({ id: `s${si}-${key}`, sectionIndex: si, kind: section.kind, no, wrap, node, ...extra });

  switch (section.kind) {
    case "passage": {
      const s = section;
      if (s.note) push("note", "note", <p className="par-note">{s.note}</p>);
      s.sentences.forEach((sen, i) => {
        push(
          "passage",
          `snt${i}`,
          <>
            <span className="par-sno">{circledNo(sen.n)}</span>
            <div className="par-edit-grow">
              <Field
                as="p" className="par-sen-en" editable={editable} value={sen.en}
                onCommit={(v) => commit({ ...s, sentences: s.sentences.map((x, j) => (j === i ? { ...x, en: v } : x)) })}
                render={(v) => highlightKeywords(v, s.keywords)}
              />
              {sen.ko || editable ? (
                <Field
                  as="p" className="par-sen-ko" editable={editable} value={sen.ko} placeholder="(해석)"
                  onCommit={(v) => commit({ ...s, sentences: s.sentences.map((x, j) => (j === i ? { ...x, ko: v } : x)) })}
                />
              ) : null}
            </div>
            {editable ? <DelBtn title="문장 삭제" onClick={() => commit({ ...s, sentences: s.sentences.filter((_, j) => j !== i) })} /> : null}
          </>,
        );
      });
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
      const h = new Set(s.hiddenCols ?? []);
      const upd = (i: number, p: Partial<(typeof s.rows)[number]>) => commit({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
      const delRow = (i: number) => commit({ ...s, rows: s.rows.filter((_, j) => j !== i) });
      s.rows.forEach((r, i) => {
        push(
          "vocab",
          `row${i}`,
          <>
            {!h.has("headword") ? <Field as="td" className="par-cell-head" editable={editable} value={r.headword} onCommit={(v) => upd(i, { headword: v })} /> : null}
            {!h.has("pronunciation") ? <Field as="td" className="par-cell-pron" editable={editable} value={r.pronunciation ?? ""} onCommit={(v) => upd(i, { pronunciation: v })} /> : null}
            {!h.has("meaning") ? <Field as="td" editable={editable} value={r.meaning} onCommit={(v) => upd(i, { meaning: v })} /> : null}
            {!h.has("synonyms") ? (
              <td className="par-cell-syn">
                <Field as="span" editable={editable} value={r.synonyms ?? ""} onCommit={(v) => upd(i, { synonyms: v })} />
                {editable ? <DelBtn title="단어 삭제" onClick={() => delRow(i)} /> : null}
              </td>
            ) : null}
          </>,
          { hiddenCols: s.hiddenCols },
        );
      });
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
  const items: FlowItem[] = [...coverItems(report, edit?.ced), ...titleItems(report, edit?.med)];
  let no = 0;
  report.sections.forEach((section, si) => {
    if (section.kind === "self-check") return;
    no += 1;
    // 섹션 헤더도 독립 블록(드래그/이동 가능)
    items.push({
      id: `s${si}-head`,
      sectionIndex: si,
      kind: section.kind,
      no,
      wrap: "secheader",
      node: <SectionHead no={no} kind={section.kind} />,
    });
    const sed = edit?.sectionEdit ? edit.sectionEdit(si) : undefined;
    items.push(...sectionFlowItems(section, si, no, sed));
  });
  for (const cb of report.customBlocks ?? []) {
    items.push(customBlockFlowItem(cb, edit?.setCustom));
  }
  return items;
}
