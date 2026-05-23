/**
 * Contents/section0.xml 빌더.
 * 한컴 호환 검증된 blank.hwpx 구조를 그대로 따른다.
 *
 * 핵심:
 *  - 첫 paragraph 의 첫 run 안에 <hp:secPr> + <hp:ctrl><hp:colPr/></hp:ctrl> + <hp:t/>
 *  - <hp:grid> 에 wonggojiFormat="0" 속성
 *  - <hp:lineNumberShape restartType="0"> (정수)
 *  - <hp:autoNumFormat .../> 에 supscript="0" 추가
 *  - <hp:noteLine width> 도 "0.12 mm" 형태 (공백)
 *  - <hp:pageBorderFill> 에 <hp:offset/> child 추가
 *  - paragraph id 는 unsigned 32bit (0 도 허용)
 */

import { ShapeRegistry } from "./shapes";
import { xmlText } from "./escape";
import { HWPX_NS } from "./static-files";
import type {
  BlockNode,
  ParagraphNode,
  RunNode,
  RunStyle,
  SectionSpec,
  TableNode,
} from "./types";

interface EmitState {
  nextParaId: number;
  nextCtrlId: number;
}

// =============================================================================
// secPr (페이지/단/머리꼬리)
// =============================================================================

function secPrXml(sec: SectionSpec): string {
  const {
    pageWidthHpu,
    pageHeightHpu,
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    marginHeader,
    marginFooter,
  } = sec;
  return [
    `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">`,
    `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>`,
    `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>`,
    `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>`,
    `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>`,
    `<hp:pagePr landscape="WIDELY" width="${pageWidthHpu}" height="${pageHeightHpu}" gutterType="LEFT_ONLY">`,
    `<hp:margin header="${marginHeader}" footer="${marginFooter}" gutter="0" left="${marginLeft}" right="${marginRight}" top="${marginTop}" bottom="${marginBottom}"/>`,
    `</hp:pagePr>`,
    `<hp:footNotePr>`,
    `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>`,
    `<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>`,
    `<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>`,
    `<hp:numbering type="CONTINUOUS" newNum="1"/>`,
    `<hp:placement place="EACH_COLUMN" beneathText="0"/>`,
    `</hp:footNotePr>`,
    `<hp:endNotePr>`,
    `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>`,
    `<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>`,
    `<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>`,
    `<hp:numbering type="CONTINUOUS" newNum="1"/>`,
    `<hp:placement place="END_OF_DOCUMENT" beneathText="0"/>`,
    `</hp:endNotePr>`,
    `<hp:pageBorderFill type="BOTH" borderFillIDRef="0" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`,
    `<hp:pageBorderFill type="EVEN" borderFillIDRef="0" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`,
    `<hp:pageBorderFill type="ODD" borderFillIDRef="0" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`,
    `</hp:secPr>`,
  ].join("");
}

// =============================================================================
// colPr 컨트롤 (다단)
// =============================================================================

function colPrCtrl(sec: SectionSpec): string {
  const colCount = Math.max(1, sec.columns);
  if (colCount === 1) {
    return `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
  }
  // 2단 이상: colSz 자식 노드 필요 (한컴 multi-column 샘플 패턴)
  const contentWidth =
    sec.pageWidthHpu - sec.marginLeft - sec.marginRight;
  const gap = sec.columnGapHpu;
  const eachWidth = Math.floor((contentWidth - gap * (colCount - 1)) / colCount);
  const colSzs: string[] = [];
  for (let i = 0; i < colCount; i++) {
    const isLast = i === colCount - 1;
    colSzs.push(`<hp:colSz width="${eachWidth}" gap="${isLast ? 0 : gap}"/>`);
  }
  return `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="${colCount}" sameSz="1" sameGap="${gap}">${colSzs.join("")}</hp:colPr></hp:ctrl>`;
}

// =============================================================================
// lineseg (레이아웃 캐시)
// =============================================================================

function defaultLineseg(horzsize: number): string {
  return `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="${horzsize}" flags="393216"/></hp:linesegarray>`;
}

// =============================================================================
// Run
// =============================================================================

function runChildXml(
  run: RunNode,
  registry: ShapeRegistry,
  state: EmitState,
): string {
  switch (run.kind) {
    case "text": {
      if (!run.text) return `<hp:t></hp:t>`;
      const parts = run.text.split("\n");
      const inner = parts
        .map((seg, i) =>
          i === 0 ? xmlText(seg) : `<hp:lineBreak/>${xmlText(seg)}`,
        )
        .join("");
      return `<hp:t>${inner}</hp:t>`;
    }
    case "br":
      return `<hp:t><hp:lineBreak/></hp:t>`;
    case "pageNum": {
      const ctrlId = state.nextCtrlId++;
      return `<hp:ctrl><hp:autoNum num="0" id="${ctrlId}" type="PAGE" format="DIGIT"/></hp:ctrl>`;
    }
    case "totalPages": {
      const ctrlId = state.nextCtrlId++;
      return `<hp:ctrl><hp:autoNum num="0" id="${ctrlId}" type="TOTAL_PAGE" format="DIGIT"/></hp:ctrl>`;
    }
    case "image":
      return `<hp:t></hp:t>`;
    default:
      return `<hp:t></hp:t>`;
  }
}

interface RunGroup {
  charShapeId: number;
  children: string[];
}

function emitRuns(
  runs: RunNode[],
  registry: ShapeRegistry,
  state: EmitState,
): string {
  const groups: RunGroup[] = [];
  for (const run of runs) {
    const style: RunStyle | undefined =
      run.kind === "text" ||
      run.kind === "pageNum" ||
      run.kind === "totalPages"
        ? run.style
        : undefined;
    const cid = registry.charShapeFromStyle(style);
    const childXml = runChildXml(run, registry, state);
    const last = groups[groups.length - 1];
    if (last && last.charShapeId === cid) {
      last.children.push(childXml);
    } else {
      groups.push({ charShapeId: cid, children: [childXml] });
    }
  }
  if (groups.length === 0) {
    return `<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>`;
  }
  return groups
    .map(
      (g) =>
        `<hp:run charPrIDRef="${g.charShapeId}">${g.children.join("")}</hp:run>`,
    )
    .join("");
}

// =============================================================================
// Paragraph
// =============================================================================

function emitParagraph(
  para: ParagraphNode,
  registry: ShapeRegistry,
  state: EmitState,
  options: { firstParaPrelude?: string } = {},
): string {
  const pid = state.nextParaId++;
  const paraShapeId = registry.paraShapeFromStyle(para.style);
  const pageBreak = para.pageBreak ? "1" : "0";
  const columnBreak = para.columnBreak ? "1" : "0";

  const runsXml = emitRuns(para.runs, registry, state);

  let body: string;
  if (options.firstParaPrelude) {
    // 첫 paragraph: secPr + colPr + 빈 hp:t 를 첫 run 안에.
    body = `<hp:run charPrIDRef="0">${options.firstParaPrelude}<hp:t></hp:t></hp:run>${runsXml}`;
  } else {
    body = runsXml;
  }

  return [
    `<hp:p id="${pid}" paraPrIDRef="${paraShapeId}" styleIDRef="0" pageBreak="${pageBreak}" columnBreak="${columnBreak}" merged="0">`,
    body,
    defaultLineseg(42520),
    `</hp:p>`,
  ].join("");
}

// =============================================================================
// Table
// =============================================================================

function emitTable(
  tbl: TableNode,
  registry: ShapeRegistry,
  state: EmitState,
): string {
  const rowCnt = tbl.rows.length;
  const colCnt = tbl.colWidthsHpu.length;
  const totalWidth = tbl.colWidthsHpu.reduce((a, b) => a + b, 0);
  const totalHeight = tbl.rows.reduce((a, r) => a + r.heightHpu, 0);
  const m = tbl.cellMargins ?? { left: 141, right: 141, top: 141, bottom: 141 };
  const outerBorderId = registry.borderFillFromCell(tbl.borders);

  const trs = tbl.rows
    .map((row, rIdx) => {
      const tcs = row.cells
        .map((cell, cIdx) => {
          const cellBorderId = registry.borderFillFromCell(cell.borders);
          const cm =
            cell.margins ?? { left: 141, right: 141, top: 141, bottom: 141 };
          const vAlign = cell.vAlign ?? "TOP";
          const subBlocks = cell.blocks
            .map((b) => emitBlock(b, registry, state))
            .join("");
          const cellInner =
            subBlocks ||
            emitParagraph({ kind: "p", runs: [] }, registry, state);
          return [
            `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${cellBorderId}">`,
            `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="Break" vertAlign="${vAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`,
            cellInner,
            `</hp:subList>`,
            `<hp:cellAddr colAddr="${cIdx}" rowAddr="${rIdx}"/>`,
            `<hp:cellSpan colSpan="${cell.colSpan ?? 1}" rowSpan="${cell.rowSpan ?? 1}"/>`,
            `<hp:cellSz width="${cell.widthHpu}" height="${cell.heightHpu}"/>`,
            `<hp:cellMargin left="${cm.left}" right="${cm.right}" top="${cm.top}" bottom="${cm.bottom}"/>`,
            `</hp:tc>`,
          ].join("");
        })
        .join("");
      return `<hp:tr>${tcs}</hp:tr>`;
    })
    .join("");

  return [
    `<hp:tbl id="${state.nextCtrlId++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="Cell" repeatHeader="0" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${outerBorderId}">`,
    `<hp:sz width="${totalWidth}" widthRelTo="Absolute" height="${totalHeight}" heightRelTo="Absolute" protect="0"/>`,
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="Para" horzRelTo="Para" vertAlign="Top" horzAlign="Left" vertOffset="0" horzOffset="0"/>`,
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/>`,
    `<hp:inMargin left="${m.left}" right="${m.right}" top="${m.top}" bottom="${m.bottom}"/>`,
    trs,
    `</hp:tbl>`,
  ].join("");
}

// =============================================================================
// Block dispatcher
// =============================================================================

function emitBlock(
  block: BlockNode,
  registry: ShapeRegistry,
  state: EmitState,
): string {
  if (block.kind === "p") {
    return emitParagraph(block, registry, state);
  } else {
    const tblXml = emitTable(block, registry, state);
    const pid = state.nextParaId++;
    return [
      `<hp:p id="${pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
      `<hp:run charPrIDRef="0">${tblXml}</hp:run>`,
      defaultLineseg(42520),
      `</hp:p>`,
    ].join("");
  }
}

// =============================================================================
// Section root
// =============================================================================

export function buildSectionXml(
  sec: SectionSpec,
  registry: ShapeRegistry,
): string {
  const state: EmitState = { nextParaId: 0, nextCtrlId: 1 };

  const blocks = [...sec.blocks];

  if (blocks.length === 0 || blocks[0].kind !== "p") {
    blocks.unshift({ kind: "p", runs: [] });
  }

  const firstParaPrelude = secPrXml(sec) + colPrCtrl(sec);

  const firstBlock = blocks[0] as ParagraphNode;
  const firstXml = emitParagraph(firstBlock, registry, state, {
    firstParaPrelude,
  });

  const restXml = blocks
    .slice(1)
    .map((b) => emitBlock(b, registry, state))
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<hs:sec ${HWPX_NS}>`,
    firstXml,
    restXml,
    `</hs:sec>`,
  ].join("");
}
