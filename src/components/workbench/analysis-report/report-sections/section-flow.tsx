import type { ReactNode } from "react";
import { circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import { isKoAnalysisSection, type KoAnalysisSection } from "@/lib/passage-report/analysis-report/ko-schema";
import { DelBtn, Field } from "./editable-field";
import { koSectionFlowItems } from "./ko-section-flow";
import { passageSectionFlow } from "./passage-flow";
import type { FlowItem, SectionEdit, SectionFlowCtx, SectionFlowOptions, WrapKind } from "./types";
import { vocabularySectionFlow } from "./vocabulary-flow";
import { worksheetSectionFlow } from "./worksheet-flow";

// ─── 섹션 → flow item[] ───────────────────────────────────────────────────────
export function sectionFlowItems(
  section: AnalysisSection | KoAnalysisSection,
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

  const ctx: SectionFlowCtx = { si, no, editable, commit, push, options, sed };

  // PRIME_KO 게이트 — 국어 섹션은 KO 전용 렌더러로 위임(영어 switch 무접촉).
  if (isKoAnalysisSection(section)) {
    koSectionFlowItems(section, ctx);
    return items;
  }

  switch (section.kind) {
    case "passage":
      passageSectionFlow(section, ctx);
      break;
    case "structure-map":
      structureMapSectionFlow(section, ctx);
      break;
    case "summary":
      summarySectionFlow(section, ctx);
      break;
    case "grammar":
      grammarSectionFlow(section, ctx);
      break;
    case "exam-focus":
      examFocusSectionFlow(section, ctx);
      break;
    case "vocabulary":
      vocabularySectionFlow(section, ctx);
      break;
    case "parsing":
      parsingSectionFlow(section, ctx);
      break;
    case "learning-worksheet":
      worksheetSectionFlow(section, ctx);
      break;
    case "final-onepage":
      // 원페이지 파이널은 assemble.pushFinalOnepage 가 전면 시트로 직접 조립한다
      // (섹션 flow 미경유 — meta·brand 컨텍스트 필요). 여기 도달하면 no-op.
      break;
    case "self-check":
      break;
  }
  return items;
}

function structureMapSectionFlow(section: Extract<AnalysisSection, { kind: "structure-map" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push } = ctx;
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
}

function summarySectionFlow(section: Extract<AnalysisSection, { kind: "summary" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push } = ctx;
const s = section;
      // 한글 요약 문장(s.sentences)은 미표기 — 데이터는 보존, ONE-LINE THESIS만 노출
      push(
        "thesis",
        "thesis",
        <div className="par-thesis">
          <div className="par-thesis-eyebrow">ONE-LINE THESIS · 영문 주제문</div>
          <Field as="div" className="par-thesis-en" editable={editable} value={s.thesisEn} onCommit={(v) => commit({ ...s, thesisEn: v })} />
        </div>,
      );
}

function grammarSectionFlow(section: Extract<AnalysisSection, { kind: "grammar" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push } = ctx;
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
}

function examFocusSectionFlow(section: Extract<AnalysisSection, { kind: "exam-focus" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push } = ctx;
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
}

function parsingSectionFlow(section: Extract<AnalysisSection, { kind: "parsing" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push } = ctx;
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
}
