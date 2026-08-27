/**
 * 시험지 표지(section0) 렌더러 — E36 SPEC §2.
 *
 * 웹 미리보기(components/exams/paper-builder/components/exam-cover-page.tsx)의
 * classic / band / minimal 표지를, 한컴이 실제로 재현할 수 있는 수단(글자 크기·굵기·
 * 자간·색·음영 표·정렬)으로만 옮긴다. CSS 절대배치·둥근 모서리·반투명·h-px 장식선은
 * HWPX 로 옮길 수 없으므로 타이포그래피와 "네 변 동일 보더 표"로 대체한다.
 *
 * 한컴 제약(SPEC §7) 때문에 반드시 지키는 것:
 *  - 표는 네 변을 모두 같은 보더로 두거나 전부 NONE 으로 둔다. "윗변만/아랫변만" 표는
 *    한컴이 옅은 파란 안내선 박스로 덧그린다(P11). → classic 의 "위아래 가로 규칙선"은
 *    네 변 동일 보더의 얇은 프레임 표 한 개로 대체한다.
 *  - **중첩 표 금지.** 좁은 표를 "보더 없는 바깥 표"로 감싸 가운데 두면, 바깥 셀 폭·높이가
 *    안쪽 표와 같아지는 순간 한컴 편집 화면이 안쪽 표의 **오른쪽 변과 아래 변을 잘라
 *    먹는다**(사용자 신고 → 화면 캡처로 재현. PDF 내보내기는 멀쩡해서 PDF 실측만으로는
 *    안 잡혔다). 가운데 정렬은 표 하나 안에서 좌우 "여백 열"로 낸다.
 *  - 표 안에 표를 넣게 되면 안쪽 폭 = 바깥 셀 폭 − margin.left − margin.right 다(P9).
 *    이 뺄셈을 빼먹어 학생정보 박스가 오른쪽 여백을 2.3pt 넘겨 잘렸던 결함이 있었다.
 *  - TableNode 는 문단 여백을 못 가진다 → 표 앞뒤 간격은 빈 문단(gapPara)으로 만든다.
 *  - 표는 항상 흐름 왼쪽에 붙는다(표를 감싸는 문단이 paraPrIDRef="0" 고정이라 정렬을 못 준다).
 *
 * 표지에는 쪽번호가 없다(꼬리말은 호출자/구역 스펙이 관리한다).
 */

import type {
  BlockNode,
  BorderSpec,
  CellBorders,
  HAlign,
  ParagraphNode,
  TableCellNode,
  TableNode,
  TableRowNode,
  TextRunNode,
  VAlign,
} from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { mm } from "../units";
import { estimateBlocksHeight } from "../section-xml";
import { DEFAULT_IMAGE_ASPECT, imageAspectFromDataUrl } from "@/lib/image-dims";

export interface CoverRenderProps {
  template: "classic" | "band" | "minimal";
  eyebrow: string;
  title: string;
  footnote: string;
  logoDataUrl: string | null; // data:image/(png|jpg|gif|bmp);base64,...
  showInfo: boolean;
  schoolName: string;
  className: string;
  studentNameLabel: string; // 기본 "이름"
  examDateLabel: string; // "2026-08-22" 형태. 빈 문자열이면 빈칸.
  instructions: string;
  compact: boolean;
  contentWidthHpu: number;
  contentHeightHpu: number; // pageHeight - marginTop - marginBottom
}

// -----------------------------------------------------------------------------
// 보더/색 — 전부 "네 변 동일" 로만 조합한다 (P11)
// -----------------------------------------------------------------------------

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
/** classic 프레임·정보 박스 선. page-header 의 학생정보 박스와 같은 굵기/색. */
const THIN: BorderSpec = { type: "SOLID", widthMm: 0.15, color: COLORS.slate400 };
/** minimal 전용 더 옅은 선(장식 최소화). */
const HAIR: BorderSpec = { type: "SOLID", widthMm: 0.12, color: COLORS.slate300 };
/** band 밴드색 — 미리보기 bg-slate-900. tokens 에 없는 값이라 이 파일 지역 상수로 둔다. */
const BAND_BG = "#0F172A";
/** 밴드 보더는 배경과 같은 색 — "네 변 동일 보더" 규칙을 지키면서 이음매를 숨긴다. */
const BAND_LINE: BorderSpec = { type: "SOLID", widthMm: 0.15, color: BAND_BG };
const BAND_TEXT = "#FFFFFF";

const NONE_BOX: CellBorders = { left: NO, right: NO, top: NO, bottom: NO };

function evenBox(line: BorderSpec, fillColor?: string): CellBorders {
  return { left: line, right: line, top: line, bottom: line, fillColor };
}

// -----------------------------------------------------------------------------
// 작은 헬퍼
// -----------------------------------------------------------------------------

/**
 * 표 앞뒤 간격용 빈 문단. runs 가 비면 한컴/높이 추정기 모두 기본 10pt 줄높이를 잡아
 * 간격이 의도보다 커지므로, 6pt 빈 런을 넣어 줄높이를 최소화하고 여백으로만 벌린다.
 * (TableNode 는 문단 여백을 못 받으므로 표 앞뒤 간격은 전부 이 문단으로 만든다.)
 */
function gapPara(spaceAfter: number, spaceBefore = 0): ParagraphNode {
  return {
    kind: "p",
    style: {
      spaceBefore: Math.max(0, Math.round(spaceBefore)),
      spaceAfter: Math.max(0, Math.round(spaceAfter)),
      lineSpacingPct: 100,
    },
    runs: [txt("", { size: 6 })],
  };
}

/**
 * data URL(base64) → 버퍼+포맷. builder-blocks.ts 의 private decodeImageDataUrl 과 동일 로직
 * (그 파일을 건드리지 않기 위해 여기 다시 둔다).
 * 거대 base64 를 정규식 (.+)$ 로 캡처하면 정규식 엔진 스택 오버플로가 나므로, 헤더만
 * 정규식으로 보고 본문은 첫 콤마 기준으로 잘라낸다.
 * png/jpg/gif/bmp 만 임베드 가능하다(그 외는 라우트에서 png 로 사전 변환됨).
 */
function decodeImageDataUrl(
  dataUrl: string | null | undefined,
): { buffer: Buffer; mime: "png" | "jpg" | "gif" | "bmp" } | null {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const m = dataUrl.slice(0, comma).match(/^data:image\/(png|jpe?g|gif|bmp);base64$/i);
  if (!m) return null;
  const f = m[1].toLowerCase();
  const mime = f === "png" ? "png" : f === "gif" ? "gif" : f === "bmp" ? "bmp" : "jpg";
  try {
    return { buffer: Buffer.from(dataUrl.slice(comma + 1), "base64"), mime };
  } catch {
    return null;
  }
}

/**
 * 본문 전체폭 1×1 표. classic 프레임 / band 밴드 / 로고 자리가 모두 이 형태다.
 * 셀 안쪽 폭은 반드시 padX 두 번을 뺀 값으로 계산한다(P9) — 이걸 빼먹으면 안쪽 내용이
 * 오른쪽 여백을 넘어 잘린다.
 */
function fullWidthBox(opts: {
  widthHpu: number;
  blocks: BlockNode[];
  borders: CellBorders;
  padX: number;
  padY: number;
  minHeightHpu: number;
  vAlign?: VAlign;
}): TableNode {
  const innerW = Math.max(mm(20), opts.widthHpu - opts.padX * 2);
  const contentH = estimateBlocksHeight(opts.blocks, innerW) + opts.padY * 2;
  const h = Math.max(opts.minHeightHpu, contentH);
  const cell = {
    widthHpu: opts.widthHpu,
    heightHpu: h,
    vAlign: opts.vAlign ?? ("CENTER" as VAlign),
    borders: opts.borders,
    margins: { left: opts.padX, right: opts.padX, top: opts.padY, bottom: opts.padY },
    blocks: opts.blocks,
  };
  return {
    kind: "tbl",
    colWidthsHpu: [opts.widthHpu],
    borders: opts.borders,
    rows: [{ heightHpu: h, cells: [cell] }],
  };
}


// -----------------------------------------------------------------------------
// 구성 요소
// -----------------------------------------------------------------------------

/**
 * 로고 — data URL 을 hp:pic 인라인 그림으로 임베드한다.
 * 디코드 실패(미지원 포맷·깨진 base64)면 그냥 생략한다. 표지에 "[이미지: …]" 대체 텍스트를
 * 남기면 표지가 지저분해지므로 금지.
 *
 * 그림을 전체폭 표로 감싸는 이유: estimateBlocksHeight 는 이미지 런의 높이를 모른다
 * (paragraphPlainText 가 null → 기본 한 줄로 계산). 행 높이를 그림 높이로 선언해두면
 * 세로 중앙 배치 계산과 한컴 실제 렌더가 같은 높이를 쓴다.
 */
function buildLogoBlock(
  logoDataUrl: string | null,
  contentWidthHpu: number,
  compact: boolean,
  align: HAlign,
): BlockNode | null {
  const decoded = decodeImageDataUrl(logoDataUrl);
  if (!decoded) return null;

  const rawAspect = imageAspectFromDataUrl(logoDataUrl);
  const aspect =
    rawAspect && Number.isFinite(rawAspect) && rawAspect > 0
      ? rawAspect
      : DEFAULT_IMAGE_ASPECT; // 헤더 파싱 실패 시 기존 DOCX 가정과 동일 폴백
  let dispH = compact ? mm(16) : mm(20);
  let dispW = Math.round(dispH / aspect);
  const maxW = Math.round(contentWidthHpu * 0.55); // 가로로 긴 로고가 본문폭을 넘지 않게
  if (dispW > maxW) {
    dispW = maxW;
    dispH = Math.round(dispW * aspect);
  }
  dispW = Math.max(mm(8), dispW);
  dispH = Math.max(mm(6), dispH);

  return fullWidthBox({
    widthHpu: contentWidthHpu,
    borders: NONE_BOX,
    padX: 0,
    padY: 0,
    minHeightHpu: dispH,
    blocks: [
      {
        kind: "p",
        style: { align, spaceAfter: 0, lineSpacingPct: 100 },
        runs: [
          {
            kind: "image",
            data: decoded.buffer,
            mime: decoded.mime,
            widthHpu: dispW,
            heightHpu: dispH,
          },
        ],
      },
    ],
  });
}

/** eyebrow 문단 — 작은 굵은 글씨 + 넓은 자간(미리보기 tracking-[0.32em] 대응). */
function eyebrowPara(
  text: string,
  size: number,
  align: HAlign,
  color: string,
  letterSpacing: number,
  spaceAfter: number,
): ParagraphNode {
  return {
    kind: "p",
    style: { align, spaceAfter, lineSpacingPct: 130 },
    runs: [txt(text, { size, bold: true, color, letterSpacing })],
  };
}

/**
 * 강조 규칙선(accent rule) — 제목 아래 짧고 굵은 가로 막대.
 *
 * "아랫변만 있는 표"로 가로선을 그으면 한컴이 옅은 파란 안내선 박스를 덧그린다(P11).
 * 그래서 선이 아니라 **네 변 보더 색 = 채움 색인 아주 낮은 상자**로 만든다 — 시각적으로는
 * 굵은 가로 막대이고, 부분 보더 규칙을 위반하지 않는다.
 * (전면폭 얇은 프레임 표는 표지에서 "떠도는 빈 띠"처럼 보여 폐기했다.)
 */
function ruleBar(opts: {
  widthHpu: number;
  thicknessHpu: number;
  color: string;
  contentWidthHpu: number;
  align: HAlign;
}): BlockNode {
  const line: BorderSpec = { type: "SOLID", widthMm: 0.12, color: opts.color };
  const box = evenBox(line, opts.color);
  const barW = Math.max(mm(5), Math.min(opts.widthHpu, opts.contentWidthHpu));
  // 가운데 정렬은 좌우 여백 열로 낸다(중첩 표 금지 — buildInfoTable 주석 참고).
  const padL =
    opts.align === "CENTER" ? Math.floor((opts.contentWidthHpu - barW) / 2) : 0;
  const padR = opts.contentWidthHpu - barW - padL;

  const pad = (w: number): TableCellNode => ({
    widthHpu: w,
    heightHpu: opts.thicknessHpu,
    vAlign: "CENTER",
    borders: NONE_BOX,
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
    blocks: [{ kind: "p", style: { spaceAfter: 0, lineSpacingPct: 100 }, runs: [] }],
  });

  const colWidths: number[] = [];
  const cells: TableCellNode[] = [];
  if (padL > 0) {
    colWidths.push(padL);
    cells.push(pad(padL));
  }
  colWidths.push(barW);
  cells.push({
    widthHpu: barW,
    heightHpu: opts.thicknessHpu,
    vAlign: "CENTER",
    borders: box,
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
    // 셀 높이는 max(선언 높이, 내용 높이) 다. runs 가 비면 기본 10pt 줄높이가 잡혀
    // 막대가 10pt 두께로 부풀었다(실측). 1pt 런으로 내용 높이를 최소화하고, 두께는
    // 선언 높이(thicknessHpu)가 결정하게 한다.
    blocks: [
      { kind: "p", style: { spaceAfter: 0, lineSpacingPct: 100 }, runs: [txt("", { size: 1 })] },
    ],
  });
  if (padR > 0) {
    colWidths.push(padR);
    cells.push(pad(padR));
  }

  return {
    kind: "tbl",
    colWidthsHpu: colWidths,
    borders: NONE_BOX,
    rows: [{ heightHpu: opts.thicknessHpu, cells }],
  };
}

/** 제목 문단. 빈 제목이면 공백 1칸을 넣어 줄(과 밴드 높이)이 무너지지 않게 한다. */
function titlePara(
  text: string,
  size: number,
  align: HAlign,
  color: string,
): ParagraphNode {
  return {
    kind: "p",
    style: { align, spaceAfter: 0, lineSpacingPct: 118 },
    runs: [txt(text || " ", { size, bold: true, color })],
  };
}

/** 정보 박스의 셀 하나(한 줄짜리 텍스트 + 세로 가운데). */
function infoCell(
  widthHpu: number,
  heightHpu: number,
  borders: CellBorders,
  margins: { left: number; right: number; top: number; bottom: number },
  align: HAlign,
  run: TextRunNode,
): TableCellNode {
  return {
    widthHpu,
    heightHpu,
    vAlign: "CENTER",
    borders,
    margins,
    blocks: [
      { kind: "p", style: { align, lineSpacingPct: 120, spaceAfter: 0 }, runs: [run] },
    ],
  };
}

/**
 * 정보 박스 — 학교 / 반 / 이름 / 시험일 4행 × 2열 단일 표(중첩 표 금지).
 * 네 변 전부 동일한 얇은 보더(P11), 라벨 셀만 옅은 음영. 값이 비면 공백 1칸을 넣어
 * 셀 높이를 유지한다(빈 문자열이면 줄이 접혀 행 높이가 들쭉날쭉해진다).
 */
function buildInfoTable(
  rows: Array<{ label: string; value: string }>,
  boxWidthHpu: number,
  contentWidthHpu: number,
  align: HAlign,
  line: BorderSpec,
  compact: boolean,
): TableNode {
  // ── 중첩 표 금지 (한컴 실측 확정 — 재발 금지) ──────────────────────────────
  // 예전엔 좁은 정보 박스를 "보더 없는 3칸 바깥 표"(centerTable)로 감싸 가운데 뒀다.
  // 그랬더니 **한컴 편집 화면에서 박스의 오른쪽 변과 아래 변이 아예 안 그려졌다**
  // (사용자 신고 → 화면 캡처로 재현). 바깥 셀의 폭·높이가 안쪽 표와 정확히 같아서
  // 마지막 변(x = 셀 폭, y = 셀 높이)이 셀 경계에 걸려 잘려 나간 것이다.
  // PDF 내보내기는 클리핑이 달라 살아남았기 때문에 PDF 실측만으로는 안 잡혔다.
  //   → 감싸지 않고 **표 하나**로 만든다. 가운데 정렬은 좌우에 보더 없는 여백 열을
  //     붙여서 낸다(page-header.ts 가 이미 "중첩 표 금지"라고 경고하던 그 함정이다).
  const boxW = Math.max(mm(30), Math.min(boxWidthHpu, contentWidthHpu));
  const labelW = Math.min(
    Math.max(mm(16), Math.floor(boxW * 0.3)),
    Math.floor(boxW / 2),
  );
  const valueW = boxW - labelW;
  // 좌우 여백 열. 열 폭 합은 반드시 contentWidthHpu 와 정확히 같아야 한다 — 어긋나면
  // 한컴이 열 폭을 제멋대로 재분배한다.
  const padL = align === "CENTER" ? Math.floor((contentWidthHpu - boxW) / 2) : 0;
  const padR = contentWidthHpu - boxW - padL;

  // 학생이 손으로 적는 칸이므로 행을 넉넉히(약 7mm).
  const rowH = compact ? mm(6) : mm(7.2);
  const valueBox = evenBox(line);
  const labelBox = evenBox(line, COLORS.slate50);
  const labelStyle = { size: SIZE.info, bold: true, color: COLORS.darkGray, letterSpacing: 10 };

  const padCell = (w: number): TableCellNode => ({
    widthHpu: w,
    heightHpu: rowH,
    vAlign: "CENTER",
    borders: NONE_BOX,
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
    blocks: [{ kind: "p", style: { spaceAfter: 0, lineSpacingPct: 100 }, runs: [] }],
  });

  const colWidths: number[] = [];
  if (padL > 0) colWidths.push(padL);
  colWidths.push(labelW, valueW);
  if (padR > 0) colWidths.push(padR);

  const trs: TableRowNode[] = rows.map(({ label, value }) => {
    const cells: TableCellNode[] = [];
    if (padL > 0) cells.push(padCell(padL));
    cells.push(
      infoCell(labelW, rowH, labelBox, { left: 100, right: 60, top: 10, bottom: 10 }, "LEFT",
        txt(label || " ", labelStyle)),
      infoCell(valueW, rowH, valueBox, { left: 60, right: 100, top: 10, bottom: 10 }, "RIGHT",
        txt(value || " ", { size: SIZE.info, bold: !!value, color: COLORS.black })),
    );
    if (padR > 0) cells.push(padCell(padR));
    return { heightHpu: rowH, cells };
  });

  // 표 외곽은 보더 없음 — 실제 박스 테두리는 라벨/값 셀이 각자 네 변으로 그린다.
  // (여백 열까지 외곽선이 그어지면 박스가 본문 전체폭으로 번진다.)
  return { kind: "tbl", colWidthsHpu: colWidths, borders: NONE_BOX, rows: trs };
}

/** 안내문 — 여러 줄이면 줄마다 한 문단(한 문단 안 개행은 한컴 흐름에서 못 쓴다). */
function buildInstructionBlocks(
  instructions: string,
  align: HAlign,
): ParagraphNode[] {
  const lines = String(instructions || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line, i) => ({
    kind: "p" as const,
    style: {
      align,
      spaceBefore: i === 0 ? mm(6) : 0,
      spaceAfter: 60,
      lineSpacingPct: 150,
    },
    runs: [txt(line, { size: SIZE.instructions, color: COLORS.gray })],
  }));
}

// -----------------------------------------------------------------------------
// 공개 API
// -----------------------------------------------------------------------------

export function renderCoverPage(props: CoverRenderProps): BlockNode[] {
  const { eyebrow, title, footnote, logoDataUrl, showInfo, compact } = props;
  const { schoolName, className, studentNameLabel, examDateLabel, instructions } = props;
  // 설정값이 DB 를 거쳐 오므로 알 수 없는 문자열이면 classic 으로 떨어뜨린다.
  const template =
    props.template === "band" || props.template === "minimal"
      ? props.template
      : "classic";

  // 폭/높이는 호출자가 계산해 넘기지만 0·NaN 이 들어와도 표 폭이 NaN 이 되지 않게 방어한다
  // (NaN 은 falsy 라 `Math.round(NaN) || fallback` 이 fallback 으로 떨어진다).
  const width = Math.max(mm(60), Math.round(props.contentWidthHpu) || mm(180));
  const height = Math.max(mm(80), Math.round(props.contentHeightHpu) || mm(250));

  // minimal 만 좌측 정렬(미리보기와 동일). classic/band 는 가운데.
  const mainAlign: HAlign = template === "minimal" ? "LEFT" : "CENTER";

  // 본체(로고 + eyebrow/제목 + 정보 박스) — 세로 중앙 배치 계산의 기준이 되는 묶음.
  const head: BlockNode[] = [];

  const logo = buildLogoBlock(logoDataUrl, width, compact, mainAlign);
  if (logo) {
    head.push(logo);
    head.push(gapPara(template === "minimal" ? mm(8) : mm(6)));
  }

  if (template === "band") {
    // band: eyebrow 는 밴드 위(흰 바탕)에, 제목은 진한 밴드 안에 흰 글씨로.
    if (eyebrow) {
      head.push(eyebrowPara(eyebrow, compact ? 8 : 9, "CENTER", COLORS.gray, 30, mm(3)));
    }
    head.push(
      fullWidthBox({
        widthHpu: width,
        borders: evenBox(BAND_LINE, BAND_BG),
        padX: mm(9),
        padY: mm(8),
        minHeightHpu: compact ? mm(22) : mm(28),
        blocks: [titlePara(title, compact ? 20 : 24, "CENTER", BAND_TEXT)],
      }),
    );
  } else if (template === "minimal") {
    // minimal: 장식 없음. 작은 eyebrow + 제목, 좌측 정렬, 여백 위주.
    if (eyebrow) {
      head.push(eyebrowPara(eyebrow, compact ? 7 : 8, "LEFT", COLORS.lightGray, 40, mm(9)));
    }
    head.push(titlePara(title, compact ? 19 : 22, "LEFT", COLORS.black));
  } else {
    // classic: 장식 상자 없이 eyebrow + 큰 제목 + 제목 아래 짧고 굵은 강조 막대.
    //   (전면폭 얇은 프레임 표를 썼더니 표지에 "빈 띠"가 떠 있는 것처럼 보여 폐기했다.
    //    가로선은 부분 보더 대신 ruleBar — 채움색 = 보더색인 낮은 상자 — 로 긋는다(P11).)
    if (eyebrow) {
      head.push(eyebrowPara(eyebrow, compact ? 8 : 9, "CENTER", COLORS.lightGray, 30, mm(4)));
    }
    head.push(titlePara(title, compact ? 21 : 26, "CENTER", COLORS.black));
    head.push(gapPara(mm(5)));
    head.push(
      ruleBar({
        widthHpu: Math.min(width, mm(34)),
        thicknessHpu: mm(1.1),
        color: COLORS.black,
        contentWidthHpu: width,
        align: "CENTER",
      }),
    );
  }

  if (showInfo) {
    // 정보 박스 폭 = 본문폭의 약 46%(최소 70mm). 본문폭보다 넓어지지 않게 상한을 건다
    // (좁은 용지에서 max() 만 쓰면 폭이 본문을 넘어 여백 열이 음수가 된다).
    const boxW = Math.min(width, Math.max(mm(84), Math.round(width * 0.56)));
    head.push(gapPara(template === "minimal" ? mm(14) : mm(11)));
    // 정보 박스 정렬은 제목과 맞춘다(minimal 은 좌측, classic/band 는 가운데).
    // 가운데 정렬은 표를 감싸지 않고 좌우 여백 열로 낸다 — buildInfoTable 주석 참고.
    head.push(
      buildInfoTable(
        [
          { label: "학교", value: schoolName || "" },
          { label: "반", value: className || "" },
          { label: studentNameLabel || "이름", value: "" },
          { label: "시험일", value: examDateLabel || "" },
        ],
        boxW,
        width,
        mainAlign,
        template === "minimal" ? HAIR : THIN,
        compact,
      ),
    );
  }

  // 안내문은 정보 박스 바로 아래에 둔다(본체의 일부).
  //   예전엔 tail 로 빼서 남은 공간의 70% 만큼 아래로 밀었더니, 표지 맨 밑바닥에
  //   홀로 떨어져 footnote 와 구분이 안 됐다. 시험 안내는 학생이 이름 쓰는 칸
  //   바로 아래에서 읽는 게 자연스럽다.
  const instructionBlocks = buildInstructionBlocks(instructions, mainAlign);
  if (instructionBlocks.length > 0) {
    head.push(gapPara(mm(7)));
    head.push(...instructionBlocks);
  }

  // 꼬리 요소(footnote)만 세로 중앙 계산에서 빼고 표지 아래쪽에 둔다.
  const tail: BlockNode[] = [];
  if (footnote) {
    tail.push({
      kind: "p",
      // footnote 정렬은 미리보기와 동일: classic 가운데, band/minimal 오른쪽 아래.
      style: {
        align: template === "classic" ? "CENTER" : "RIGHT",
        spaceAfter: 0,
        lineSpacingPct: 130,
      },
      runs: [
        txt(footnote, {
          size: compact ? 7 : 8,
          bold: true,
          color: COLORS.lightGray,
          letterSpacing: 10,
        }),
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // 세로 배치 (SPEC §2) — 표지는 1단 in-flow 문단이라 위쪽 spaceBefore 로만 밀어 내린다.
  // ---------------------------------------------------------------------------
  const headH = estimateBlocksHeight(head, width);
  const tailH = estimateBlocksHeight(tail, width);
  let gap = Math.round((height - headH) * 0.34);
  gap = Math.max(0, Math.min(gap, Math.round(height * 0.45)));
  // 안내문·footnote 까지 합쳐 한 쪽을 넘기면 표지가 2쪽이 된다 → 남는 만큼만 민다.
  gap = Math.min(gap, Math.max(0, height - headH - tailH));

  const out: BlockNode[] = [];
  // 첫 블록이 표일 수 있는데 TableNode 는 spaceBefore 를 못 받는다 → 앞에 6pt 빈 문단을
  // 두고 그 문단에 여백을 싣는다(구역 첫 문단은 secPr 를 품은 빈 문단이라 별도 문단이 온다).
  if (gap > 0) out.push(gapPara(0, gap));
  out.push(...head);

  if (tail.length > 0) {
    // 남은 공간의 70% 만 써서 아래로 민다(높이 추정 오차로 2쪽으로 넘어가는 것보다
    // 조금 덜 내려가는 편이 안전하다).
    const rest = Math.max(0, height - gap - headH - tailH);
    out.push(gapPara(Math.max(mm(8), Math.round(rest * 0.7))));
    out.push(...tail);
  }

  return out;
}
