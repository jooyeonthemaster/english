"use client";

import { Fragment, type ReactNode } from "react";
import type { BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import { Arrow, BOX_LIST_WRAPS, type FlowItem, TABLE_WRAPS, tableHeadRow, type WrapKind } from "../report-sections";
import type { ColCtx, ReportEdit } from "./types";
import { editIdOf } from "./items";
import { BlockShell, LiShell, MapItemShell, RowShell } from "./shells";
// ─── runs 렌더 (연속 같은 그룹 → 박스/표/도식 병합) ───────────────────────────
export function RunsView({
  items,
  edit,
  blockMeta,
  cols,
  measure,
}: {
  items: FlowItem[];
  edit?: ReportEdit;
  blockMeta?: Record<string, BlockMeta>;
  cols?: ColCtx;
  measure?: boolean;
}) {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const merge = TABLE_WRAPS.has(it.wrap) || BOX_LIST_WRAPS.has(it.wrap) || it.wrap === "map" || it.wrap === "vocab-grid" || it.wrap === "reading" || it.wrap === "activity";
    const run: FlowItem[] = [it];
    if (merge) {
      let j = i + 1;
      while (j < items.length && items[j].wrap === it.wrap && items[j].sectionIndex === it.sectionIndex) {
        run.push(items[j]);
        j++;
      }
      i = j;
    } else {
      i++;
    }
    out.push(<RunBlock key={`run-${it.id}`} run={run} wrap={it.wrap} edit={edit} blockMeta={blockMeta} cols={cols} measure={measure} />);
  }
  return <>{out}</>;
}

export function RunBlock({
  run,
  wrap,
  edit,
  blockMeta,
  cols,
  measure,
}: {
  run: FlowItem[];
  wrap: WrapKind;
  edit?: ReportEdit;
  blockMeta?: Record<string, BlockMeta>;
  cols?: ColCtx;
  measure?: boolean;
}) {
  const editable = !!edit && !measure;

  if (wrap === "vocab-grid") {
    return (
      <div className="par-runblock par-vocab-grid-run">
        {run.map((it) => (
          <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} measure={measure} />
        ))}
      </div>
    );
  }

  if (wrap === "reading") {
    return (
      <div className="par-runblock par-reading-flow-run">
        {run.map((it) => (
          <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} measure={measure} />
        ))}
      </div>
    );
  }

  if (wrap === "activity") {
    return (
      <div className="par-runblock par-ws-block par-activity par-activity-run">
        {run.map((it) => (
          <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} measure={measure} />
        ))}
      </div>
    );
  }

  if (TABLE_WRAPS.has(wrap)) {
    const isVocabTestRun = wrap === "vocab" && run.every((it) => it.id.includes("-vtest-row"));
    const group = wrap === "grammar" ? "grammar" : wrap === "exam" ? "exam" : "vocab";
    // 단어시험표(par-vocab-test-table)는 열 구성이 달라 폭 조절 대상에서 제외.
    const overrides = isVocabTestRun ? undefined : cols?.widths?.[group];
    const resize = isVocabTestRun
      ? undefined
      : {
          overrides,
          onDraft: editable && cols?.onDraft ? (w: Record<string, number>) => cols.onDraft!(group, w) : undefined,
          onCommit: editable && cols?.onCommit ? (w: Record<string, number>) => cols.onCommit!(group, w) : undefined,
        };
    return (
      <div className="par-runblock">
        <table
          className={`par-table${isVocabTestRun ? " par-vocab-test-table" : ""}`}
          data-table-group={group}
          style={overrides ? { tableLayout: "fixed" } : undefined}
        >
          <thead>{tableHeadRow(wrap, editable, run[0]?.hiddenCols, resize)}</thead>
          <tbody>
            {run.map((it) => (
              <RowShell key={it.id} it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} measure={measure} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (BOX_LIST_WRAPS.has(wrap)) {
    return (
      <div className={`par-runblock par-box${wrap === "summary" ? " par-summary" : ""}`}>
        <ol className={wrap === "summary" ? undefined : "par-sentences"}>
          {run.map((it) => (
            <LiShell key={it.id} it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} listStyle={wrap === "summary"} measure={measure} />
          ))}
        </ol>
      </div>
    );
  }

  if (wrap === "map") {
    return (
      <div className="par-runblock par-map">
        {run.map((it, idx) => (
          <Fragment key={it.id}>
            {idx > 0 ? <Arrow /> : null}
            <MapItemShell it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} measure={measure} />
          </Fragment>
        ))}
      </div>
    );
  }

  // standalone — secheader / note / thesis / logic / parse / title / meta
  return (
    <>
      {run.map((it) => (
        <BlockShell key={it.id} it={it} edit={edit} meta={blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]} measure={measure} />
      ))}
    </>
  );
}

// ─── 헤더/푸터 ────────────────────────────────────────────────────────────────
export function RunningHeader({ brand, title, logoDataUrl }: { brand: string; title: string; logoDataUrl?: string }) {
  return (
    <div className="par-runhead">
      <span className="par-runhead-brand">
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="par-runhead-logo" src={logoDataUrl} alt="" />
        ) : null}
        <span>{brand}</span>
      </span>
      <span className="par-runhead-r">{title}</span>
    </div>
  );
}

export function RunningFooter({ brand, docNo, page, total }: { brand: string; docNo?: string; page: number; total: number }) {
  return (
    <div className="par-runfoot">
      <span>{brand}{docNo ? ` · PRIME ANALYSIS ${docNo}` : ""}</span>
      <span className="par-page">— {page} / {total} —</span>
      <span>ⓒ 2026 · 무단복제 금지</span>
    </div>
  );
}
