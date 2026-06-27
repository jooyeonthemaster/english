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
  currentLineWidthHpu: number;
  // 표 셀 안에서 본문 흐름과 달리, 이 렌더러는 텍스트 문단의 lineseg vertpos 를
  // "셀 상단 기준 절대 좌표"로 해석한다(문단을 자동 누적하지 않음). 그래서 셀 안
  // 텍스트 문단은 앞 문단들의 높이만큼 vertpos 를 직접 누적해 줘야 겹치지 않는다.
  //   null  = 본문 흐름(누적 불필요, 문단마다 vertpos 0 기준)
  //   number= 현재 셀 안에서 다음 텍스트 문단이 시작할 누적 세로 오프셋(HPU)
  // (셀은 텍스트 문단과 표를 섞지 않으므로 표는 별도 보정이 필요 없다.)
  cellTextVertOffset: number | null;
}

// =============================================================================
// 줄바꿈 측정 (미리보기 pagination.ts 와 동일한 글리프 폭 모델)
// =============================================================================
//
// 핵심: 한컴 한글은 파일을 열 때 본문을 다시 흐름(reflow)시키지만, 우리가 쓰는
// HWPX 렌더러(및 일부 뷰어/초기 표시)는 <hp:linesegarray> 레이아웃 캐시를 그대로
// 신뢰한다. 문단마다 lineseg 가 1개뿐이면 긴 영어 지문이 칸 폭을 넘어 한 줄로
// 그려져 미리보기와 "극심하게" 어긋난다.
//   → 문단의 실제 텍스트를 칸 폭 기준으로 줄바꿈해서 줄마다 lineseg 를 emit 한다.
//
// maxUnits = horzsize(HPU) / fontSize(HPU) * FUDGE 는 미리보기의
// columnWidth(px) / fontSize(px) * FUDGE 와 같은 비율(스케일 불변)이므로
// 동일한 glyphUnits 로 래핑하면 미리보기와 줄바꿈이 일치한다.
const LINE_WIDTH_FUDGE = 1.05;

function isWideGlyph(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function glyphUnits(char: string): number {
  if (char === " " || char === "\t") return 0.34;
  if (isWideGlyph(char)) return 1;
  if (/[A-Z0-9]/.test(char)) return 0.62;
  if (/[a-z]/.test(char)) return 0.53;
  if (/[,.;:!?'"()[\]{}<>/\\|`~_-]/.test(char)) return 0.34;
  return 0.72;
}

// 텍스트를 칸 폭(maxUnits)에 맞춰 줄바꿈하고, 각 줄의 시작 문자 오프셋(원본 문자열
// 기준)을 반환한다. textpos 로 그대로 사용한다. pagination.ts 의 wrapParagraph 와
// 같은 결정을 내리되 트림 대신 절대 오프셋을 추적한다.
function wrapLineStartOffsets(text: string, maxUnits: number): number[] {
  const starts: number[] = [];
  let lineOpen = false;
  let currentUnits = 0;
  let i = 0;
  const n = text.length;

  const openLine = (idx: number) => {
    starts.push(idx);
    lineOpen = true;
    currentUnits = 0;
  };
  const closeLine = () => {
    lineOpen = false;
    currentUnits = 0;
  };

  while (i < n) {
    let nextSpace = text.indexOf(" ", i);
    if (nextSpace === -1) nextSpace = n;
    const wordStart = i;
    const word = text.slice(i, nextSpace);
    let wordUnits = 0;
    for (const ch of word) wordUnits += glyphUnits(ch);
    const spaceFollows = nextSpace < n;
    const spaceUnits = spaceFollows ? glyphUnits(" ") : 0;

    if (wordUnits > maxUnits && !lineOpen) {
      // 한 칸보다 긴 단어: 글자 단위로 끊는다.
      let pos = wordStart;
      for (const ch of word) {
        const u = glyphUnits(ch);
        if (!lineOpen) openLine(pos);
        else if (currentUnits + u > maxUnits) {
          closeLine();
          openLine(pos);
        }
        currentUnits += u;
        pos += ch.length;
      }
    } else if (lineOpen && currentUnits + wordUnits > maxUnits) {
      closeLine();
      openLine(wordStart);
      currentUnits += wordUnits;
    } else {
      if (!lineOpen) openLine(wordStart);
      currentUnits += wordUnits;
    }

    if (spaceFollows && lineOpen && currentUnits + spaceUnits <= maxUnits) {
      currentUnits += spaceUnits;
    }
    i = nextSpace + 1;
  }

  if (starts.length === 0) starts.push(0);
  return starts;
}

// 문단의 텍스트 런을 이어붙여 줄바꿈 측정용 평문을 만든다. 강제 줄바꿈/이미지/
// 페이지번호 등 복합 런이 있으면 null 을 반환해 단일 lineseg 로 폴백한다.
function paragraphPlainText(runs: RunNode[]): string | null {
  let out = "";
  for (const run of runs) {
    if (run.kind === "text") {
      if (run.text.includes("\n")) return null;
      out += run.text;
    } else {
      return null;
    }
  }
  return out;
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
    // landscape 는 용지 방향 enum. OWPML/hwpxlib 공식 정의:
    //   WIDELY = 세로(portrait), NARROWLY = 가로(landscape).
    // 시험지는 A4/B4 "세로"이므로 WIDELY 가 맞다. 실제 한컴이 만든 portrait HWPX
    // (졸업/사업계획서/이전 시험지 export 등)도 전부 WIDELY 다.
    //   ※ 직전 패스가 enum 의미를 거꾸로 이해해 NARROWLY(가로)로 잘못 바꿨고,
    //     그 결과 한컴이 "가로 용지"로 오인해 상하좌우 여백을 강제로 재해석하면서
    //     미리보기와 여백이 극심하게 어긋났다(사용자 보고). → WIDELY 로 복구.
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
  return colPrCtrlFor({
    columns: sec.columns,
    columnGapHpu: sec.columnGapHpu,
    contentWidthHpu: sec.pageWidthHpu - sec.marginLeft - sec.marginRight,
  });
}

function colPrCtrlFor(opts: {
  columns: 1 | 2;
  columnGapHpu: number;
  contentWidthHpu: number;
}): string {
  const colCount = Math.max(1, opts.columns);
  if (colCount === 1) {
    return `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
  }
  const gap = opts.columnGapHpu;
  const eachWidth = Math.floor(
    (opts.contentWidthHpu - gap * (colCount - 1)) / colCount,
  );
  // 마지막 칸이 폭 나머지를 흡수해 (열폭 합 + 간격 합) === contentWidth 가 정확히
  // 맞도록 한다. 합이 어긋나면 한컴이 폭을 재분배해 단 경계가 미리보기와 틀어진다.
  const lastWidth =
    opts.contentWidthHpu - eachWidth * (colCount - 1) - gap * (colCount - 1);
  const colSzs: string[] = [];
  for (let i = 0; i < colCount; i++) {
    const isLast = i === colCount - 1;
    const w = isLast ? lastWidth : eachWidth;
    colSzs.push(`<hp:colSz width="${w}" gap="${isLast ? 0 : gap}"/>`);
  }
  return `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="${colCount}" sameSz="1" sameGap="${gap}">${colSzs.join("")}</hp:colPr></hp:ctrl>`;
}

// =============================================================================
// lineseg (레이아웃 캐시)
// =============================================================================

interface LinesegResult {
  xml: string;
  lineCount: number;
  lineHeight: number;
  // 문단 본문이 차지하는 세로 높이(줄 높이 합). 표 셀 높이 계산에 쓴다.
  contentHeightHpu: number;
}

function paragraphLineseg(
  horzsize: number,
  registry: ShapeRegistry,
  paraShapeId: number,
  charShapeIds: number[],
  text = "",
  vertOffset = 0,
): LinesegResult {
  const paraShape = registry.paraShapes[paraShapeId] ?? registry.paraShapes[0];
  const textHeight = Math.max(
    100,
    ...charShapeIds.map(
      (id) => registry.charShapes[id]?.heightHpu100 ?? 1000,
    ),
  );
  const lineHeight = Math.max(
    textHeight,
    Math.round((textHeight * paraShape.lineSpacingPct) / 100),
  );
  const spacing = Math.max(0, lineHeight - textHeight);
  const baseline = Math.round(textHeight * 0.85);

  // 텍스트를 칸 폭 기준으로 줄바꿈해 줄마다 lineseg 를 emit 한다(한컴은 PDF 저장 시
  // reflow 하지 않고 linesegarray 를 그대로 사용하므로 줄 정보가 정확해야 한다).
  // vertpos 는 "문단 상단 기준 상대 좌표"(0, lineHeight, 2*lineHeight, ...)다 — 정상
  // HWPX 와 동일. 한컴이 문단들을 알아서 위→아래로 쌓으므로 셀 안에서도 누적 보정이
  // 필요 없다. (이전엔 셀 절대좌표로 오해해 누적했다가 표+문단 혼합 셀에서 줄이 사라졌다.)
  void vertOffset;
  const maxUnits = Math.max(8, (horzsize / textHeight) * LINE_WIDTH_FUDGE);
  const offsets =
    text && horzsize > 0 ? wrapLineStartOffsets(text, maxUnits) : [0];

  const segs = offsets
    .map((off, idx) => {
      const vertpos = idx * lineHeight;
      // flags 는 모든 줄에 393216 (한컴 정상 출력과 동일). 연속줄을 0 으로 두면 한컴이
      // 그 줄을 무효 처리해 표 셀 안에서 첫 줄만 그리고 나머지를 비워버린다(긴 지문 1줄).
      return `<hp:lineseg textpos="${off}" vertpos="${vertpos}" vertsize="${textHeight}" textheight="${textHeight}" baseline="${baseline}" spacing="${spacing}" horzpos="0" horzsize="${horzsize}" flags="393216"/>`;
    })
    .join("");

  return {
    xml: `<hp:linesegarray>${segs}</hp:linesegarray>`,
    lineCount: offsets.length,
    lineHeight,
    contentHeightHpu: offsets.length * lineHeight,
  };
}

function footerCtrl(
  sec: SectionSpec,
  registry: ShapeRegistry,
  state: EmitState,
): string {
  const contentWidth = sec.pageWidthHpu - sec.marginLeft - sec.marginRight;
  // 미리보기 푸터 "- N / M -" 는 text-[10px]. DOCX 골드와 동일하게 8pt(16 half-pt).
  const charShapeId = registry.charShapeFromStyle({
    size: 8.0,
    color: "#94A3B8", // 미리보기 footer text-slate-400
  });
  const paraShapeId = registry.paraShapeFromStyle({
    align: "CENTER",
    lineSpacingPct: 130,
    spaceBefore: 0,
    spaceAfter: 0,
  });
  const lineSeg = paragraphLineseg(contentWidth, registry, paraShapeId, [
    charShapeId,
  ]);
  return [
    `<hp:ctrl><hp:footer id="${state.nextCtrlId++}" applyPageType="BOTH">`,
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="${contentWidth}" textHeight="${sec.marginFooter}" hasTextRef="0" hasNumRef="0">`,
    `<hp:p id="0" paraPrIDRef="${paraShapeId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
    `<hp:run charPrIDRef="${charShapeId}"><hp:t>- </hp:t><hp:autoNum numType="PAGE" format="DIGIT"/><hp:t> / </hp:t><hp:autoNum numType="TOTAL_PAGE" format="DIGIT"/><hp:t> -</hp:t></hp:run>`,
    lineSeg.xml,
    `</hp:p>`,
    `</hp:subList>`,
    `</hp:footer></hp:ctrl>`,
  ].join("");
}

// 머리말(header) — 전체폭 헤더 밴드. 한컴 실제 시험지가 쓰는 방식: 본문 칸 위
// 전체폭 머리말에 제목/학생정보를 표·문단으로 넣고, 본문은 2단으로 흘린다.
// applyPageType: "FIRST" = 1쪽만, "BOTH" = 모든 쪽.
function headerCtrl(
  sec: SectionSpec,
  registry: ShapeRegistry,
  state: EmitState,
  contentWidthHpu: number,
  applyPageType: "BOTH" | "FIRST" | "EVEN" | "ODD" = "BOTH",
): string {
  if (!sec.header || sec.header.length === 0) return "";
  const prevWidth = state.currentLineWidthHpu;
  const prevCellOffset = state.cellTextVertOffset;
  state.currentLineWidthHpu = contentWidthHpu;
  state.cellTextVertOffset = null; // 머리말 블록은 본문 흐름처럼 누적 없이.
  const inner = sec.header
    .map((b) => emitBlock(b, registry, state, sec))
    .join("");
  state.currentLineWidthHpu = prevWidth;
  state.cellTextVertOffset = prevCellOffset;
  return [
    `<hp:ctrl><hp:header id="${state.nextCtrlId++}" applyPageType="${applyPageType}">`,
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="${contentWidthHpu}" textHeight="${sec.marginHeader}" hasTextRef="0" hasNumRef="0">`,
    inner,
    `</hp:subList>`,
    `</hp:header></hp:ctrl>`,
  ].join("");
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
    case "image": {
      const ext =
        run.mime === "png"
          ? "png"
          : run.mime === "gif"
            ? "gif"
            : run.mime === "bmp"
              ? "bmp"
              : "jpg";
      const binId = registry.registerImage(run.data, ext);
      const w = Math.max(1, Math.round(run.widthHpu));
      const h = Math.max(1, Math.round(run.heightHpu));
      const instId = state.nextCtrlId++;
      const cx = Math.round(w / 2);
      const cy = Math.round(h / 2);
      // 인라인 그림(treatAsChar=1) — 본문/단 흐름에 글자처럼 끼어 흐른다.
      // ShapeComponent(orgSz/curSz/renderingInfo) 를 갖춰야 렌더러가 표시 크기를 잡는다.
      return [
        `<hp:pic reverse="0" isClipped="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}" id="${instId}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0">`,
        `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>`,
        `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/>`,
        `<hp:outMargin left="0" right="0" top="0" bottom="0"/>`,
        `<hp:offset x="0" y="0"/>`,
        `<hp:orgSz width="${w}" height="${h}"/>`,
        `<hp:curSz width="${w}" height="${h}"/>`,
        `<hp:flip horizontal="0" vertical="0"/>`,
        `<hp:rotationInfo angle="0" centerX="${cx}" centerY="${cy}" rotateimage="1"/>`,
        `<hp:renderingInfo>`,
        `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`,
        `<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`,
        `<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`,
        `</hp:renderingInfo>`,
        `<hc:img binaryItemIDRef="${binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>`,
        `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>`,
        `<hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/>`,
        `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`,
        `<hp:imgDim dimwidth="${w}" dimheight="${h}"/>`,
        `</hp:pic>`,
      ].join("");
    }
    default:
      return `<hp:t></hp:t>`;
  }
}

interface RunGroup {
  charShapeId: number;
  children: string[];
}

function buildRunGroups(
  runs: RunNode[],
  registry: ShapeRegistry,
  state: EmitState,
): RunGroup[] {
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
    return [{ charShapeId: 0, children: ["<hp:t></hp:t>"] }];
  }
  return groups;
}

function runGroupsXml(groups: RunGroup[]): string {
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
  options: {
    firstParaPrelude?: string;
    firstParaHeader?: string;
    firstParaFooter?: string;
    lineWidthHpu?: number;
  } = {},
): string {
  const pid = state.nextParaId++;
  const paraShapeId = registry.paraShapeFromStyle(para.style);
  const pageBreak = para.pageBreak ? "1" : "0";
  const columnBreak = para.columnBreak ? "1" : "0";

  const runGroups = buildRunGroups(para.runs, registry, state);
  const runsXml = runGroupsXml(runGroups);
  const lineWidth = options.lineWidthHpu ?? state.currentLineWidthHpu;

  let body: string;
  if (options.firstParaPrelude) {
    // 첫 paragraph: secPr + colPr 는 첫 run 에 두고(쪽 설정), 꼬리말(footer)은
    // 반드시 "별도 run"으로 분리한다.
    //   ※ 꼬리말 컨트롤은 내부에 중첩 문단(subList>p)을 갖는데, 이걸 secPr 와 같은
    //     run(특히 secPr 와 colPr 사이)에 끼워넣으면 한컴 한글이 쪽 설정 파싱을
    //     중단하고 여백을 "기본값(좌우 30mm 등)"으로 리셋해 버린다(미리보기와
    //     여백이 극심히 어긋난 근본 원인). secPr+colPr 를 먼저 깨끗이 닫은 뒤
    //     꼬리말을 별도 run 으로 두면 여백이 정상 적용된다.
    const headerRun = options.firstParaHeader
      ? `<hp:run charPrIDRef="0">${options.firstParaHeader}</hp:run>`
      : "";
    const footerRun = options.firstParaFooter
      ? `<hp:run charPrIDRef="0">${options.firstParaFooter}</hp:run>`
      : "";
    body = `<hp:run charPrIDRef="0">${options.firstParaPrelude}<hp:t></hp:t></hp:run>${headerRun}${footerRun}${runsXml}`;
  } else {
    body = runsXml;
  }

  const charShapeIds = runGroups.map((group) => group.charShapeId);
  const plainText = options.firstParaPrelude
    ? "" // 첫 문단(secPr 보유)은 보통 빈 문단이라 단일 lineseg.
    : (paragraphPlainText(para.runs) ?? "");

  // 표 셀 안 텍스트 문단은 앞 문단 높이만큼 vertpos 를 누적해야 겹치지 않는다.
  const inCell = state.cellTextVertOffset !== null && !options.firstParaPrelude;
  const spaceBefore = inCell ? (para.style?.spaceBefore ?? 0) : 0;
  const baseOffset = inCell ? state.cellTextVertOffset! + spaceBefore : 0;

  const lineseg = paragraphLineseg(
    lineWidth,
    registry,
    paraShapeId,
    charShapeIds,
    plainText,
    baseOffset,
  );

  if (inCell) {
    const spaceAfter = para.style?.spaceAfter ?? 0;
    state.cellTextVertOffset =
      baseOffset + lineseg.contentHeightHpu + spaceAfter;
  }

  return [
    `<hp:p id="${pid}" paraPrIDRef="${paraShapeId}" styleIDRef="0" pageBreak="${pageBreak}" columnBreak="${columnBreak}" merged="0">`,
    body,
    lineseg.xml,
    `</hp:p>`,
  ].join("");
}

// 빌더의 그리디 단 패킹용: BlockNode[] 의 세로 높이(HPU)를 추정한다.
// (section-xml 의 lineseg/줄바꿈 모델과 동일하게 측정하므로 실제 렌더와 일치한다.)
export function estimateBlocksHeight(
  blocks: BlockNode[],
  widthHpu: number,
): number {
  const reg = new ShapeRegistry();
  return blocks.reduce((s, b) => s + measureBlockHeight(b, reg, widthHpu), 0);
}

// 표 셀 안 블록들의 세로 높이를 추정한다(줄바꿈 후 줄 높이 + 문단 간격 합).
// 셀/행 높이를 내용에 맞게 키워 boxed 지문 등이 잘리지 않도록 한다.
function measureBlockHeight(
  block: BlockNode,
  registry: ShapeRegistry,
  innerWidthHpu: number,
): number {
  if (block.kind === "p") {
    const style = block.style ?? {};
    const charShapeIds = block.runs
      .filter((r): r is Extract<RunNode, { kind: "text" }> => r.kind === "text")
      .map((r) => registry.charShapeFromStyle(r.style));
    const ids = charShapeIds.length > 0 ? charShapeIds : [0];
    const paraShapeId = registry.paraShapeFromStyle(style);
    const plain = paragraphPlainText(block.runs) ?? "";
    const seg = paragraphLineseg(
      innerWidthHpu,
      registry,
      paraShapeId,
      ids,
      plain,
    );
    return (
      (style.spaceBefore ?? 0) +
      seg.contentHeightHpu +
      (style.spaceAfter ?? 0)
    );
  }
  if (block.kind === "tbl") {
    // 표 높이 = 각 행의 max(선언 높이, 셀 내용 높이)의 합. 셀 내용은 재귀 측정한다.
    // (행 heightHpu 만 더하면 content-driven(heightHpu=1) 중첩 표가 1로 오측정되어
    //  바깥 셀이 내용을 클리핑한다 — 긴 지문 1줄 잘림 버그의 원인이었다.)
    return block.rows.reduce((sum, row) => {
      let maxCell = row.heightHpu;
      for (const cell of row.cells) {
        if ((cell.rowSpan ?? 1) > 1) continue;
        const cm =
          cell.margins ?? { left: 141, right: 141, top: 141, bottom: 141 };
        const innerWidth = Math.max(100, cell.widthHpu - cm.left - cm.right);
        const contentH = cell.blocks.reduce(
          (s, b) => s + measureBlockHeight(b, registry, innerWidth),
          0,
        );
        maxCell = Math.max(maxCell, contentH + cm.top + cm.bottom);
      }
      return sum + maxCell;
    }, 0);
  }
  return 0;
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
  const m = tbl.cellMargins ?? { left: 141, right: 141, top: 141, bottom: 141 };
  const outerBorderId = registry.borderFillFromCell(tbl.borders);

  // 셀 내용 높이를 측정해 행 높이를 키운다(줄바꿈된 지문이 잘리지 않도록).
  // 행 높이 = max(선언 높이, 그 행의 가장 높은 셀 내용 높이). rowSpan 셀은 단순화를
  // 위해 측정 대상에서 제외한다(대부분 1행 레이아웃 표라 영향 없음).
  const rowHeights = tbl.rows.map((row) => {
    let maxCell = row.heightHpu;
    for (const cell of row.cells) {
      if ((cell.rowSpan ?? 1) > 1) continue;
      const cm =
        cell.margins ?? { left: 141, right: 141, top: 141, bottom: 141 };
      const innerWidth = Math.max(100, cell.widthHpu - cm.left - cm.right);
      const contentH = cell.blocks.reduce(
        (sum, b) => sum + measureBlockHeight(b, registry, innerWidth),
        0,
      );
      maxCell = Math.max(maxCell, contentH + cm.top + cm.bottom);
    }
    return maxCell;
  });
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);

  // 떠 있는 표(전체폭 머리말): 본문 흐름에서 빠져 secPr 오염 없이 지정 좌표에 둔다.
  const fl = tbl.float;
  const u32 = (n: number) => (n < 0 ? n + 4294967296 : n);
  const tblWidth = fl ? fl.widthHpu : totalWidth;
  const textWrap = fl ? (fl.wrap ?? "IN_FRONT_OF_TEXT") : "TOP_AND_BOTTOM";
  const lock = fl ? "1" : "0";
  const noAdjustAttr = fl ? ` noAdjust="1"` : "";
  const zOrder = fl?.zOrder ?? 0;
  const posXml = fl
    ? `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="${fl.vertRelTo ?? "PARA"}" horzRelTo="${fl.horzRelTo ?? "COLUMN"}" vertAlign="TOP" horzAlign="LEFT" vertOffset="${u32(fl.vertOffsetHpu)}" horzOffset="${u32(fl.horzOffsetHpu)}"/>`
    : `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="Para" horzRelTo="Para" vertAlign="Top" horzAlign="Left" vertOffset="0" horzOffset="0"/>`;

  const trs = tbl.rows
    .map((row, rIdx) => {
      const rowHeight = rowHeights[rIdx];
      const tcs = row.cells
        .map((cell, cIdx) => {
          const cellBorderId = registry.borderFillFromCell(cell.borders);
          const cm =
            cell.margins ?? { left: 141, right: 141, top: 141, bottom: 141 };
          const vAlign = cell.vAlign ?? "TOP";
          const cellHeight =
            (cell.rowSpan ?? 1) > 1 ? cell.heightHpu : rowHeight;
          const prevLineWidth = state.currentLineWidthHpu;
          const prevCellOffset = state.cellTextVertOffset;
          state.currentLineWidthHpu = Math.max(
            100,
            cell.widthHpu - cm.left - cm.right,
          );
          // 이 셀 안 텍스트 문단의 누적 vertpos 를 0 부터 시작한다.
          state.cellTextVertOffset = 0;
          const subBlocks = cell.blocks
            .map((b) => emitBlock(b, registry, state))
            .join("");
          const cellInner =
            subBlocks ||
            emitParagraph({ kind: "p", runs: [] }, registry, state);
          state.currentLineWidthHpu = prevLineWidth;
          state.cellTextVertOffset = prevCellOffset;
          return [
            `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${cellBorderId}">`,
            `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="Break" vertAlign="${vAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`,
            cellInner,
            `</hp:subList>`,
            `<hp:cellAddr colAddr="${cIdx}" rowAddr="${rIdx}"/>`,
            `<hp:cellSpan colSpan="${cell.colSpan ?? 1}" rowSpan="${cell.rowSpan ?? 1}"/>`,
            `<hp:cellSz width="${cell.widthHpu}" height="${cellHeight}"/>`,
            `<hp:cellMargin left="${cm.left}" right="${cm.right}" top="${cm.top}" bottom="${cm.bottom}"/>`,
            `</hp:tc>`,
          ].join("");
        })
        .join("");
      return `<hp:tr>${tcs}</hp:tr>`;
    })
    .join("");

  return [
    `<hp:tbl id="${state.nextCtrlId++}" zOrder="${zOrder}" numberingType="TABLE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="${lock}" dropcapstyle="None" pageBreak="Cell" repeatHeader="0" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${outerBorderId}"${noAdjustAttr}>`,
    `<hp:sz width="${tblWidth}" widthRelTo="ABSOLUTE" height="${totalHeight}" heightRelTo="ABSOLUTE" protect="0"/>`,
    posXml,
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
  sec?: SectionSpec,
): string {
  if (block.kind === "p") {
    return emitParagraph(block, registry, state);
  }

  if (block.kind === "columnPr") {
    const pid = state.nextParaId++;
    const contentWidth =
      sec?.pageWidthHpu &&
      sec?.marginLeft !== undefined &&
      sec?.marginRight !== undefined
        ? sec.pageWidthHpu - sec.marginLeft - sec.marginRight
        : 42520;
    const ctrl = colPrCtrlFor({
      columns: block.columns,
      columnGapHpu: block.columnGapHpu,
      contentWidthHpu: contentWidth,
    });
    const lineWidth =
      block.columns === 1
        ? contentWidth
        : Math.floor(
            (contentWidth - block.columnGapHpu * (block.columns - 1)) /
              block.columns,
          );
    const xml = [
      `<hp:p id="${pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
      `<hp:run charPrIDRef="0">${ctrl}<hp:t></hp:t></hp:run>`,
      paragraphLineseg(contentWidth, registry, 0, [0]).xml,
      `</hp:p>`,
    ].join("");
    state.currentLineWidthHpu = lineWidth;
    return xml;
  }

  {
    const tblXml = emitTable(block, registry, state);
    const pid = state.nextParaId++;
    // 표를 감싸는 문단도 강제 단/페이지 나눔을 따른다 (지문 boxed 등이 단/페이지를 시작할 때).
    const pageBreak = block.pageBreak ? "1" : "0";
    const columnBreak = block.columnBreak ? "1" : "0";
    return [
      `<hp:p id="${pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="${pageBreak}" columnBreak="${columnBreak}" merged="0">`,
      `<hp:run charPrIDRef="0">${tblXml}</hp:run>`,
      paragraphLineseg(state.currentLineWidthHpu, registry, 0, [0]).xml,
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
  const contentWidth = sec.pageWidthHpu - sec.marginLeft - sec.marginRight;
  const state: EmitState = {
    nextParaId: 0,
    nextCtrlId: 1,
    currentLineWidthHpu: contentWidth,
    cellTextVertOffset: null,
  };

  const blocks = [...sec.blocks];

  if (blocks.length === 0 || blocks[0].kind !== "p") {
    blocks.unshift({ kind: "p", runs: [] });
  }

  // secPr 와 colPr 는 첫 run 에(쪽 설정). 머리말·꼬리말은 별도 run 으로 분리한다.
  // (이들을 secPr~colPr 사이에 끼우면 한컴이 여백을 기본값으로 리셋함 — emitParagraph 주석 참고)
  const firstParaPrelude = secPrXml(sec) + colPrCtrl(sec);
  // 머리말(전체폭 헤더 밴드). sec.headerApplyFirstOnly 면 1쪽만, 아니면 모든 쪽.
  const firstParaHeader = headerCtrl(
    sec,
    registry,
    state,
    contentWidth,
    sec.headerApplyFirstOnly ? "FIRST" : "BOTH",
  );
  const firstParaFooter = footerCtrl(sec, registry, state);

  const firstBlock = blocks[0] as ParagraphNode;
  const firstXml = emitParagraph(firstBlock, registry, state, {
    firstParaPrelude,
    firstParaHeader,
    firstParaFooter,
    lineWidthHpu: contentWidth,
  });

  const restXml = blocks
    .slice(1)
    .map((b) => emitBlock(b, registry, state, sec))
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<hs:sec ${HWPX_NS}>`,
    firstXml,
    restXml,
    `</hs:sec>`,
  ].join("");
}
