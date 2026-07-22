"use client";

import { Fragment, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import { Arrow, BOX_LIST_WRAPS, type FlowItem, TABLE_WRAPS, tableHeadRow, type WrapKind } from "../report-sections";
import type { ColCtx, ReportEdit } from "./types";
import { editIdOf, orderIdOf } from "./items";
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
    const merge = TABLE_WRAPS.has(it.wrap) || BOX_LIST_WRAPS.has(it.wrap) || it.wrap === "map" || it.wrap === "vocab-grid" || it.wrap === "reading" || it.wrap === "activity" || it.wrap === "ws-list";
    const run: FlowItem[] = [it];
    if (merge) {
      let j = i + 1;
      while (
        j < items.length &&
        items[j].wrap === it.wrap &&
        items[j].sectionIndex === it.sectionIndex &&
        // ws-list 는 그룹(orderId=옛 통짜 블록 id) 단위로만 한 박스로 병합 —
        // 연속한 다른 소단원(빈칸→연습 등)이 한 박스로 붙는 것을 막는다.
        (it.wrap !== "ws-list" || orderIdOf(items[j]) === orderIdOf(it))
      ) {
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
  // 표 머리글·카드 사이 여백 등 '빈 영역' 클릭도 이 묶음의 첫 블록 선택으로 이어지게 —
  // 단어장 아무 곳을 눌러도 우측 패널에 열 표시·레이아웃 토글이 뜬다.
  // (행/카드(data-mid) 위 클릭은 각자 자기 블록을 선택하므로 건드리지 않는다.)
  const selectRunArea = editable
    ? (e: ReactMouseEvent<HTMLElement>) => {
        if ((e.target as Element).closest("[data-mid]")) return;
        const first = run[0];
        if (!first) return;
        const id = editIdOf(first);
        if (edit!.activeId !== id) edit!.setActiveId(id);
      }
    : undefined;

  if (wrap === "vocab-grid") {
    return (
      <div className="par-runblock par-vocab-grid-run" onMouseDown={selectRunArea}>
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

  if (wrap === "ws-list") {
    // 실전 학습지 소단원 조각 병합 — 페이지 경계에서 조각 단위로 나뉘고, 각 페이지가
    // 자기 몫의 par-ws-block 박스를 새로 연다(activity-run 과 동일 의미론).
    // 옛 통짜 블록 id 에 저장된 minHeight 는 조각마다 반복 적용되면 시각이 깨지므로
    // 제거하고 나머지 메타(fontScale·정렬 등)만 승계한다.
    return (
      <div className="par-runblock par-ws-block par-ws-run" onMouseDown={selectRunArea}>
        {run.map((it) => {
          const meta = blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id];
          return (
            <BlockShell
              key={it.id}
              it={it}
              edit={edit}
              meta={meta ? { ...meta, minHeight: undefined } : undefined}
              measure={measure}
            />
          );
        })}
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
      <div className="par-runblock" onMouseDown={selectRunArea}>
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
