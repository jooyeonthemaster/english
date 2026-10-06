"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FORECAST_BLOCK_CSS, FORECAST_PAGED_CSS } from "./paper-css";
import { paginateFit, type ColumnPlan, type MeasuredItem, type PagePlan } from "./paginate";
import { QuestionHead, QuestionTail, hasTail, type PaperHeader, type PaperItem } from "./question-parts";

// 기출 동형 시험지 — 블록 높이를 재서(숨은 측정 단) 단·쪽에 배치한 뒤 A4 쪽으로 그린다.
// 화면 미리보기 = 인쇄 = PDF(같은 DOM). 준비되면 루트에 data-fcp-ready="1" · data-fcp-pages 를 단다.

const PX_PER_MM = 96 / 25.4;

export const DEFAULT_NOTICE: [string, string] = [
  "○ 답안지에 학년, 반, 번호, 과목코드를 정확히 기입하고,",
  "가장 알맞은 답을 컴퓨터용 사인펜으로 ●와 같이 표기하시오.",
];

export interface PagedPaperProps {
  header: PaperHeader | null;
  items: PaperItem[];
  footer: { left: string; right: string };
  /** exam = 논술형은 새 쪽·단마다 하나(기출) / inline = 이어서(문제집·선택 인쇄) */
  essayMode?: "exam" | "inline";
  showCheckBox?: boolean;
  /** 목표 쪽수(실물 시험지 쪽수). 넘치면 압축·쪼개기 조건을 한 단계씩 풀어 다시 배치한다 */
  targetPages?: number;
  onReady?: (pages: number) => void;
}

/** 연속된 같은 groupKey 선택형 문항 → 첫 문항에 「n~m」 범위 */
function groupInfo(items: PaperItem[]) {
  const out = new Map<string, { range: string | null; inGroup: boolean }>();
  let i = 0;
  while (i < items.length) {
    const gk = items[i].body.groupKey;
    if (!gk || items[i].number == null) {
      out.set(items[i].key, { range: null, inGroup: false });
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < items.length && items[j + 1].body.groupKey === gk && items[j + 1].number != null) j += 1;
    if (j === i) out.set(items[i].key, { range: null, inGroup: false });
    else {
      out.set(items[i].key, { range: `${items[i].number}~${items[j].number}`, inGroup: true });
      for (let k = i + 1; k <= j; k += 1) out.set(items[k].key, { range: null, inGroup: true });
    }
    i = j + 1;
  }
  return out;
}

function Lead({ header, pages }: { header: PaperHeader; pages: number | null }) {
  const count = header.countLine
    ? pages
      ? header.countLine.replace("{PAGES}", String(pages))
      : header.countLine.replace("{PAGES}", "10")
    : null;
  return (
    <div style={{ paddingBottom: "5.8mm" }}>
      <div className="fcp-notice">
        <div>{DEFAULT_NOTICE[0]}</div>
        <div className="fcp-notice-2">{DEFAULT_NOTICE[1]}</div>
      </div>
      {count ? <div className="fcp-count">{count}</div> : null}
    </div>
  );
}

function CheckBox() {
  return (
    <div className="fcp-check">
      <div>* 확인 사항</div>
      {/* 「기입(표기)했는지」는 닫는 괄호 뒤가 줄바꿈 자리라 keep-all 로도 어절이 끊긴다 — 어절째 묶는다 */}
      <div style={{ paddingLeft: "2mm", marginTop: "1.2mm" }}>
        ◦ 답안지의 해당란에 필요한 내용을 정확히 <span style={{ whiteSpace: "nowrap" }}>기입(표기)했는지</span> 확인하시오.
      </div>
    </div>
  );
}

interface Layout {
  pages: PagePlan[];
  wraps: Set<string>;
}

export function PagedPaper({ header, items, footer, essayMode = "exam", showCheckBox = true, targetPages, onReady }: PagedPaperProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const groups = useMemo(() => groupInfo(items), [items]);
  const byKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await Promise.all([
          document.fonts.load('10pt "Nanum Myeongjo"', "가A"),
          document.fonts.load('800 10pt "Nanum Myeongjo"', "①"),
          document.fonts.load('700 10pt "Nanum Myeongjo"', "가"),
          document.fonts.load('10pt "Nanum Gothic"', "가"),
          document.fonts.load('700 10pt "Nanum Gothic"', "가"),
        ]);
        await document.fonts.ready;
      } catch {
        /* 서체 실패 — 대체 서체로 측정 */
      }
      if (alive) setFontsReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!fontsReady || !root) return;
    // 1) 배점 줄넘김: 발문 끝 줄에 못 들어가면 오른쪽 정렬 한 줄로(기출 3·5·21·27번)
    const wraps = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-mkey]").forEach((el) => {
      const box = el.querySelector<HTMLElement>(".fcp-stem-box");
      const pts = box?.querySelector<HTMLElement>(".fcp-pts");
      const text = box?.querySelector<HTMLElement>(".fcp-stem-t");
      if (!box || !pts || !text) return;
      pts.classList.remove("fcp-pts-wrap");
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEndBefore(pts);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      if (rects.length === 0) return;
      const lastTop = Math.max(...rects.map((r) => r.top));
      if (pts.getBoundingClientRect().top > lastTop + 2) {
        pts.classList.add("fcp-pts-wrap");
        wraps.add(el.dataset.mkey ?? "");
      }
    });
    // 2) 높이
    const h = (el: Element | null) => (el ? el.getBoundingClientRect().height / PX_PER_MM : 0);
    const measured: MeasuredItem[] = items.map((it) => {
      const el = root.querySelector(`[data-mkey="${CSS.escape(it.key)}"]`);
      return { key: it.key, head: h(el?.querySelector('[data-part="head"]') ?? null), tail: h(el?.querySelector('[data-part="tail"]') ?? null), essay: it.essayNo != null };
    });
    const pages = paginateFit(
      measured,
      {
        leadHeight: header ? h(root.querySelector('[data-part="lead"]')) : null,
        essayMode,
        checkHeight: showCheckBox ? h(root.querySelector('[data-part="check"]')) : 0,
      },
      targetPages,
    );
    setLayout({ pages, wraps });
  }, [fontsReady, items, header, essayMode, showCheckBox, targetPages]);

  // 배치 뒤 실측 보정: 압축한 단이 상자·여백(줄 간격과 무관한 mm) 때문에 아직 넘치면 줄 간격을 더 줄인다(하한 86%).
  const pagesRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!layout || !pagesRef.current) return;
    pagesRef.current.querySelectorAll<HTMLElement>(".fcp-col").forEach((col) => {
      let lh = parseFloat(col.style.getPropertyValue("--fcp-lh")) || 5.07;
      while (col.scrollHeight > col.clientHeight + 1 && lh > 4.37) {
        lh = Math.round((lh - 0.05) * 1000) / 1000;
        col.style.setProperty("--fcp-lh", `${lh}mm`);
      }
    });
  }, [layout]);

  useEffect(() => {
    if (layout) onReady?.(layout.pages.length);
  }, [layout, onReady]);

  const total = layout?.pages.length ?? null;

  const renderBlock = (col: ColumnPlan, b: ColumnPlan["blocks"][number], idx: number) => {
    const lead = col.lead && idx === 0 && header ? <Lead header={header} pages={total} /> : null;
    if (b.part === "check") return <div key="check" className="fcp-blk"><CheckBox /></div>;
    const it = byKey.get(b.key);
    if (!it) return null;
    const g = groups.get(it.key);
    const wrap = layout?.wraps.has(it.key);
    return (
      <div key={`${b.key}-${b.part}`} className="fcp-blk">
        {lead}
        {b.part !== "tail" ? <QuestionHead item={it} groupRange={g?.range} inGroup={g?.inGroup} wrapPoints={wrap} /> : null}
        {b.part !== "head" ? <QuestionTail item={it} atTop={b.part === "tail"} /> : null}
      </div>
    );
  };

  const renderCol = (side: "L" | "R", col: ColumnPlan) => (
    <div
      className={`fcp-col fcp-col-${side} ${col.justify === "between" ? "fcp-between" : "fcp-start"}`}
      style={{
        top: `${col.top}mm`,
        height: `${col.height}mm`,
        justifyContent: col.justify === "end" ? "flex-end" : undefined,
        ...(col.scale < 1 ? ({ "--fcp-lh": `${(5.07 * col.scale).toFixed(3)}mm` } as Record<string, string>) : {}),
      }}
    >
      {col.blocks.length === 0 && col.lead && header ? <Lead header={header} pages={total} /> : null}
      {col.blocks.map((b, i) => renderBlock(col, b, i))}
    </div>
  );

  return (
    <div className="fcp-root fcp-paged" data-fcp-ready={layout ? "1" : "0"} data-fcp-pages={total ?? 0}>
      <style dangerouslySetInnerHTML={{ __html: FORECAST_BLOCK_CSS + FORECAST_PAGED_CSS }} />
      <div className="fcp-measure" ref={measureRef} aria-hidden>
        {header ? (
          <div data-part="lead">
            <Lead header={header} pages={null} />
          </div>
        ) : null}
        <div data-part="check">
          <CheckBox />
        </div>
        {items.map((it) => {
          const g = groups.get(it.key);
          return (
            <div key={it.key} data-mkey={it.key}>
              <div data-part="head">
                <QuestionHead item={it} groupRange={g?.range} inGroup={g?.inGroup} />
              </div>
              {hasTail(it) ? (
                <div data-part="tail">
                  <QuestionTail item={it} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="fcp-pages" ref={pagesRef}>
        {(layout?.pages ?? []).map((page) => (
          <section key={page.no} className={`fcp-page fcp-page-${page.no}`}>
            <div className="fcp-frame" />
            <div className="fcp-rule" />
            {page.no === 1 && header ? (
              <div className="fcp-head">
                <div className="fcp-head-grade">{header.gradeLabel}</div>
                <div className="fcp-head-line fcp-head-school">{header.schoolLine}</div>
                <div className="fcp-head-line fcp-head-subject">{header.subjectLine}</div>
                <div className="fcp-head-line fcp-head-date">{header.dateLine}</div>
                <div className="fcp-head-rule" />
              </div>
            ) : null}
            {renderCol("L", page.left)}
            {renderCol("R", page.right)}
            <div className="fcp-footer">
              <span className="fcp-ft-subject">{footer.left}</span>
              <span className="fcp-ft-page">
                {page.no} / {total}
              </span>
              <span>{footer.right}</span>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
