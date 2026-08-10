// ============================================================================
// PDF 글자 조각 → 줄 복원 + 지면 형태 판정 (순수 함수, 의존성 0)
//
// pdfjs 의 `textContent.items` 는 문장이 아니라 **글자 조각(span)** 배열이다.
// 그냥 이어붙이면 단어장의 "표제어 — 뜻" 한 줄 구조가 통째로 뭉개져, 프롬프트가
// 표제어를 뽑지 못한다(metrics.extractVocabTerms 는 줄 단위로 판독한다).
// 조각의 좌표(transform)로 줄을 되살리는 게 이 파일의 절반이다.
// (+ 폰트 이름이 주어지면 굵게·이탤릭 구간을 **표시**로 옮긴다 — 판독 프롬프트가
//  OCR 경로에서 하는 것과 같은 표기다. 어법 자료에서 그 표시가 곧 정답 위치다.)
//
// 나머지 절반은 **지면이 표인가**(detectTableLayout)를 좌표만으로 판정하는 일이다.
// 왜 여기 있나: 텍스트 레이어가 살아 있는 PDF 는 판독 라우트를 아예 타지 않아서
// (material-readers.readPdf 의 "네트워크 0회" 조기 반환) 라우트가 붙여 주던
// `[[LAYOUT=…]]` 꼬리줄이 없다. 그 결과 **표가 가득한 디지털 교재 PDF 가 하이브리드
// 기본 OFF** 였다 — 표·밑줄·박스가 텍스트 판독에서 소멸하는, 원본 페이지가 가장
// 필요한 바로 그 자료가. 모델을 부르면 그 경로의 존재 이유(0회)가 사라지므로
// 좌표만으로 결정론적으로 판정한다.
//
// 브라우저 API 를 일절 쓰지 않는다 — pdf-text-layer.ts(브라우저 전용)에서 분리해
// 둔 이유가 이것이다. 실제 교재 PDF 로 Node 에서 그대로 돌려 검증할 수 있어야 한다
// (tests/unit/pdf-line-reconstruct.test.ts, tests/unit/pdf-table-layout.test.ts).
// ============================================================================

/** pdfjs TextItem 중 줄 복원에 필요한 필드만. TextMarkedContent 는 str 이 없다. */
export interface PdfTextSpan {
  str: string;
  /** [a, b, c, d, e, f] — e=x, f=y (PDF 는 좌하단 원점이라 y 가 클수록 위쪽). */
  transform: number[];
  width: number;
  height: number;
  /**
   * 폰트 이름(예: "ABCDEE+Arial-BoldMT"). **선택 필드**다 — 없으면 강조 표시를
   * 아예 하지 않는다(기존 동작 그대로).
   *
   * 왜 되살렸나: 어법 교재에서 굵게·이탤릭은 "정답 위치" 그 자체다. 텍스트 레이어
   * 직독 경로는 그동안 그 정보를 통째로 버렸고, 그래서 같은 자료라도 OCR 경로
   * (판독 프롬프트가 **표시**로 옮겨 준다)보다 정보가 적었다. 폰트 이름으로 굵게를
   * 추정할 수 있는 범위에서 같은 **표시**를 붙여 두 경로의 산출을 맞춘다.
   * ※ pdfjs 의 `TextItem.fontName` 은 "g_d0_f1" 같은 내부 id 라 그대로는 쓸 수 없다.
   *   실제 이름 해석은 브라우저 배관(pdf-text-layer.ts)의 몫이고, 이 순수 모듈은
   *   "이름이 주어졌다면" 판정만 한다.
   */
  fontName?: string;
}

export function isPdfTextSpan(item: unknown): item is PdfTextSpan {
  if (!item || typeof item !== "object") return false;
  const candidate = item as { str?: unknown; transform?: unknown };
  return (
    typeof candidate.str === "string" &&
    Array.isArray(candidate.transform) &&
    candidate.transform.length >= 6
  );
}

/**
 * 글자 조각들을 줄로 복원한다.
 *
 * 같은 줄이면 y 가 거의 같다는 성질을 쓰되, 허용 오차를 글자 높이에 비례시킨다
 * (제목과 본문이 섞인 교재에서 고정 오차는 줄을 잘못 묶는다).
 * 정렬 후 한 번만 훑어 O(n log n) — 페이지당 조각이 수천 개인 교재에서 O(n²) 로
 * 짜면 그 자리에서 탭이 멎는다.
 */
export function reconstructPdfLines(items: readonly unknown[]): string {
  const spans = items.filter(isPdfTextSpan).filter((span) => span.str.length > 0);
  if (spans.length === 0) return "";

  // 2단 조판 분리 — 한국 영어 교재의 표준 레이아웃이다(왼쪽 영어 본문 / 오른쪽
  // 한글 해설). 두 단은 y 좌표가 같아서 그냥 줄로 묶으면
  // "I (A) [spend / spent] all day looking around in the 어제 나는 버스를 타고…"
  // 처럼 영어와 한글이 한 줄에 뒤엉킨다(실측: 어법 초중고 1000.pdf).
  // 그 상태로 모델에 넣으면 문장 경계가 깨져 어법 포인트도 표제어도 못 뽑는다.
  const gutter = detectColumnGutter(spans);
  if (gutter !== null) {
    const left = spans.filter((s) => centreX(s) < gutter);
    const right = spans.filter((s) => centreX(s) >= gutter);
    // 왼쪽 단을 전부 읽고 나서 오른쪽 단을 읽는다(사람이 읽는 순서).
    return [linesFromSpans(left), linesFromSpans(right)]
      .filter(Boolean)
      .join("\n");
  }
  return linesFromSpans(spans);
}

const centreX = (span: PdfTextSpan) =>
  span.transform[4] + (span.width || 0) / 2;

/**
 * 페이지 가운데를 세로로 가르는 빈 띠(gutter)를 찾는다. 있으면 그 x 좌표를,
 * 없으면 null 을 돌려준다.
 *
 * 글자가 차지한 x 구간을 100칸 히스토그램으로 만들고, **거의 비어 있는 연속 구간**
 * 중 가장 넓은 것이 페이지 가운데(30~70%)에 있으면 단 경계로 본다.
 *
 * "완전히 빈(=0)" 을 요구하면 안 된다 — 실측(어법 초중고 1000.pdf)에서 제목·머리글
 * 처럼 전폭을 가로지르는 줄 두어 개가 가운데 칸을 메워, 명백한 2단 페이지가 1단으로
 * 판정됐다. 그래서 최대 밀도의 8% 이하를 "빈 칸"으로 본다. 본문 단은 수십 줄이
 * 겹쳐 밀도가 높고, 전폭 헤더는 몇 줄뿐이라 이 문턱에서 깨끗하게 갈린다.
 *
 * 표·들여쓰기로 생기는 우연한 빈칸과 구분하려고 최소 폭(5칸=페이지의 5%)을 요구하고,
 * 글자가 적은 페이지(표지·도판)는 오판이 쉬워 아예 보지 않는다.
 */
function detectColumnGutter(spans: PdfTextSpan[]): number | null {
  if (spans.length < 40) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const span of spans) {
    const start = span.transform[4];
    const end = start + (span.width || 0);
    if (start < minX) minX = start;
    if (end > maxX) maxX = end;
  }
  const pageWidth = maxX - minX;
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return null;

  const BINS = 100;
  const occupied = new Array<number>(BINS).fill(0);
  for (const span of spans) {
    const start = span.transform[4];
    const end = start + (span.width || 0);
    const from = Math.max(0, Math.floor(((start - minX) / pageWidth) * BINS));
    const to = Math.min(BINS - 1, Math.ceil(((end - minX) / pageWidth) * BINS));
    for (let bin = from; bin <= to; bin += 1) occupied[bin] += 1;
  }

  const peak = Math.max(...occupied);
  if (peak < 8) return null; // 줄이 몇 개 없는 페이지 — 판정 근거가 부족하다.

  // "빈 띠"가 아니라 **두 봉우리 사이의 골짜기**를 찾는다.
  // 실측(어법 초중고 1000.pdf 1쪽) 히스토그램:
  //   -#######################################-######################----,,,,,,,,,
  //   0                                       40                    62   67
  // 40번 칸이 영어 단과 한글 해설 단의 경계인데 밀도가 21(피크 96의 22%)이다.
  // 두 단이 바짝 붙어 있어 "거의 비었다" 문턱(8%)으로는 절대 안 잡힌다.
  // 반대로 67~99번의 오른쪽 여백은 진짜로 비어 있지만 단 경계가 아니다 —
  // **양옆에 봉우리가 있어야** 단 경계다. 그 두 조건을 그대로 코드로 옮긴다.
  const SIDE = 12; // 좌우로 살펴볼 칸 수(≈페이지의 12%)
  const from = Math.floor(BINS * 0.25);
  const to = Math.ceil(BINS * 0.75);
  let best: { bin: number; depth: number } | null = null;

  for (let bin = from; bin <= to; bin += 1) {
    let leftPeak = 0;
    for (let k = Math.max(0, bin - SIDE); k <= bin - 2; k += 1) {
      if (occupied[k] > leftPeak) leftPeak = occupied[k];
    }
    let rightPeak = 0;
    for (let k = bin + 2; k <= Math.min(BINS - 1, bin + SIDE); k += 1) {
      if (occupied[k] > rightPeak) rightPeak = occupied[k];
    }
    // 양쪽 다 본문이라 할 만큼 두꺼워야 한다(오른쪽 여백·표지 오판 차단).
    if (leftPeak < peak * 0.3 || rightPeak < peak * 0.3) continue;
    const shoulder = Math.min(leftPeak, rightPeak);
    if (occupied[bin] >= shoulder * 0.4) continue;
    // 더 깊은 골짜기를 고른다(어깨 대비 상대 깊이).
    const depth = 1 - occupied[bin] / shoulder;
    if (!best || depth > best.depth) best = { bin, depth };
  }

  return best ? minX + ((best.bin + 0.5) / BINS) * pageWidth : null;
}

/**
 * 조각을 **같은 줄끼리** 묶는다(위→아래, 줄 안은 좌→우 정렬 전 상태).
 *
 * 줄 복원(linesFromSpans)과 표 판정(detectTableLayout)이 **같은 줄 정의**를 써야
 * 한다 — 두 곳이 각자 y 를 묶으면 "행 수"와 "줄 수"가 서로 다른 뜻이 되어, 임계값의
 * 근거가 통째로 흔들린다.
 */
function groupIntoLines(spans: PdfTextSpan[]): PdfTextSpan[][] {
  if (spans.length === 0) return [];

  const sorted = [...spans].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 0.5) return dy;
    return a.transform[4] - b.transform[4];
  });

  const lines: PdfTextSpan[][] = [];
  let current: PdfTextSpan[] = [];
  let currentY = sorted[0].transform[5];

  for (const span of sorted) {
    const y = span.transform[5];
    const tolerance = Math.max(2, (span.height || 10) * 0.5);
    if (current.length > 0 && Math.abs(y - currentY) > tolerance) {
      lines.push(current);
      current = [];
      currentY = y;
    }
    if (current.length === 0) currentY = y;
    current.push(span);
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** 한 무리의 조각을 y→x 순으로 줄로 만든다(단 분리 전/후 공용). */
function linesFromSpans(spans: PdfTextSpan[]): string {
  const lines: string[] = [];

  for (const group of groupIntoLines(spans)) {
    const byX = [...group].sort((a, b) => a.transform[4] - b.transform[4]);
    // 줄 전체가 굵으면 그건 강조가 아니라 제목이다. 통째로 **감싸면** 본문에
    // 별표 노이즈만 늘어 정작 문장 속 강조가 묻힌다 — 그 경우엔 표시하지 않는다.
    const emphasised = byX.map(isEmphasisedSpan);
    const markEmphasis =
      emphasised.some(Boolean) && !emphasised.every(Boolean);
    let out = "";
    let prevEnd: number | null = null;
    let open = false;
    byX.forEach((span, index) => {
      // 조각 사이가 벌어져 있으면 공백을 넣는다. 붙어 있으면 그대로 이어야
      // 한 단어가 조각난 경우("hel"+"lo")가 "hel lo" 로 깨지지 않는다.
      const gap = prevEnd !== null && span.transform[4] - prevEnd > 1;
      const on = markEmphasis && emphasised[index] && span.str.trim().length > 0;
      // 강조 구간은 여닫이 사이에 공백만 남지 않게 경계를 공백 **밖**에 둔다.
      if (open && !on) {
        out += "**";
        open = false;
      }
      if (gap) out += " ";
      if (!open && on) {
        out += "**";
        open = true;
      }
      out += span.str;
      prevEnd = span.transform[4] + (span.width || 0);
    });
    if (open) out += "**";
    const line = out.replace(/[ \t]+/g, " ").trim();
    if (line) lines.push(line);
  }

  return lines.join("\n");
}

/**
 * 폰트 이름이 굵게·이탤릭을 가리키는가.
 *
 * 서브셋 폰트는 "ABCDEE+TimesNewRomanPS-BoldItalicMT" 처럼 접두사·접미사가 붙고
 * 제작사마다 표기가 갈린다("Semibold", "Demi", "Black", "Oblique"…). 정규식 하나로
 * 전부 맞힐 수는 없지만, 한국 영어 교재에서 실제로 쓰이는 표기는 아래 목록이
 * 대부분을 덮는다. **틀리면 강조가 하나 빠질 뿐 본문은 그대로**라 안전한 실패다.
 */
function isEmphasisedSpan(span: PdfTextSpan): boolean {
  const name = span.fontName;
  if (!name) return false;
  return /bold|black|heavy|semib|demi|italic|oblique/i.test(name);
}

/** 공백을 뺀 실질 글자 수 — "이 쪽에 글자가 있나" 판정용. */
export function denseLength(text: string): number {
  return text.replace(/\s/g, "").length;
}

// ── 지면 형태 판정: 이 쪽은 표인가 ──────────────────────────────────────────
//
// 왜 좌표로 보나 (다른 후보를 먼저 재 봤다):
//   · 탭·파이프 밀도 → **쓸 수 없다.** PDF 의 텍스트 레이어에는 탭 문자도 표 괘선
//     문자도 없다. 표는 문자가 아니라 **좌표와 선 그리기 명령**으로 조판되고,
//     괘선은 텍스트가 아닌 path 라 getTextContent 에 아예 안 나온다. 마크다운
//     감각으로 `|` 를 세면 어떤 교재에서도 0 이 나온다.
//   · 복원된 줄 텍스트 → **쓸 수 없다.** reconstructPdfLines 는 벌어진 자리를 공백
//     하나로 접기 때문에(단어 조각 보존이 우선이라 그렇게 만들었다) 셀 경계 정보가
//     그 시점에 이미 사라진다.
//   → 남는 건 조각 좌표뿐이고, 실제로 그게 가장 강한 신호다. 표란 결국
//     "짧은 셀이 여러 열에 걸쳐 있고, 그 열의 x 가 행마다 되풀이되는" 지면이다.
//
// 오탐이 왜 비싼가: 켜지는 순간 편당 원본 페이지 이미지가 실린다(배치 6편이면 같은
// 이미지가 6번). 필요 없는 자료에 붙으면 품질은 그대로인데 원가만 오른다. 그래서
// 아래 임계값은 전부 **모호하면 끄는** 쪽으로 잡았다. 반대 방향의 실패(놓침)는
// 사용자가 자료 검토 모달의 스위치로 즉시 되돌릴 수 있다(비대칭 손실).

/** 이 판정을 시도할 최소 조각 수. 표지·도판처럼 글자가 적은 쪽은 근거가 부족하다. */
const TABLE_MIN_SPANS = 40;

/** 최소 줄 수. 줄이 몇 개 없으면 "행이 되풀이된다"는 말 자체가 성립하지 않는다. */
const TABLE_MIN_LINES = 8;

/**
 * 셀 경계로 인정할 가로 간격 — 글자 높이의 1.0배(≈1em).
 * 본문의 낱말 사이는 보통 0.25~0.35em 이고, 양끝맞춤으로 늘어나도 0.5em 근처에서
 * 멈춘다. 1em 은 그 위로 두 배 넘는 여유가 있어 "벌어진 문장"을 표로 오인하지 않는다.
 */
const CELL_GAP_EM = 1.0;

/** 폰트 높이를 못 읽는 PDF 대비 하한(pt). 6pt 미만 간격을 셀 경계로 보지 않는다. */
const MIN_CELL_GAP = 6;

/**
 * 한 행으로 인정할 최소 셀 수 = 3.
 * 2 로 내리면 **2단 조판 교재와 단어장이 통째로 표가 된다** — 왼쪽 영어/오른쪽 한글,
 * 표제어/뜻은 전부 2셀 구조다. 그 자료들은 텍스트만으로 뜻이 통하므로 원본 페이지가
 * 필요 없다. 3열 이상이라야 "표"라고 부를 값어치가 있다.
 */
const MIN_CELLS_PER_ROW = 3;

/** 셀 하나가 이보다 길면 셀이 아니라 문장이다(공백을 뺀 글자 수). */
const MAX_CELL_CHARS = 24;

/** 한 행에 긴 칸이 둘 이상이면 표가 아니라 여백이 벌어진 본문으로 본다. */
const MAX_LONG_CELLS_PER_ROW = 1;

/** 표로 인정할 최소 행 수. 머리행 + 본문 3행이면 사람도 표라고 부른다. */
const MIN_TABLE_ROWS = 4;

/** 표 행이 이 비율 미만이면 "표가 좀 있는 문서"지 표 지면이 아니다. */
const MIN_ROW_RATIO = 0.3;

/** 열 정렬 판정의 x 허용 오차 — 글자 높이의 0.6배(들여쓰기 흔들림은 흡수, 다른 열은 구분). */
const COLUMN_TOLERANCE_EM = 0.6;

/** 한 열로 인정할 최소 지지 행 수. 우연히 두 행이 같은 x 에 오는 일은 흔하다. */
const MIN_ROWS_PER_COLUMN = 3;

/** 정렬된 열이 이만큼 있어야 표다(MIN_CELLS_PER_ROW 와 같은 이유로 3). */
const MIN_ALIGNED_COLUMNS = 3;

/**
 * 이 쪽이 표 지면인가 — 모델 호출 0회, 좌표만 보는 결정론적 판정.
 *
 * 판정 근거 세 가지를 **모두** 만족해야 참이다(하나라도 흔들리면 끈다):
 *   ① 행 구조   — 1em 이상 벌어진 자리로 끊었을 때 3칸 이상이고 칸이 짧은 줄이
 *                 4줄 이상, 그리고 전체 줄의 30% 이상.
 *   ② 열 정렬   — 그 칸들의 시작 x 가 3개 이상의 열로 뭉치고, 각 열을 3행 이상이
 *                 지지한다. 표를 표이게 하는 건 되풀이되는 세로 정렬이다.
 *   ③ 근거 총량 — 조각 40개·줄 8개 이상.
 *
 * 입력은 reconstructPdfLines 와 같은 pdfjs items 배열이다(같은 배열을 그대로 두 번
 * 넘기면 된다 — 이 함수는 입력을 변형하지 않는다).
 */
export function detectTableLayout(items: readonly unknown[]): boolean {
  const spans = items
    .filter(isPdfTextSpan)
    .filter((span) => span.str.trim().length > 0);
  if (spans.length < TABLE_MIN_SPANS) return false;

  const lines = groupIntoLines(spans);
  if (lines.length < TABLE_MIN_LINES) return false;

  const em = medianHeight(spans);
  const gapThreshold = Math.max(MIN_CELL_GAP, em * CELL_GAP_EM);

  /** 표 행으로 인정된 줄들의 "셀 시작 x" 목록. */
  const rows: number[][] = [];
  for (const line of lines) {
    const cells = splitIntoCells(line, gapThreshold);
    if (cells.length < MIN_CELLS_PER_ROW) continue;
    const longCells = cells.filter((cell) => cell.chars > MAX_CELL_CHARS).length;
    if (longCells > MAX_LONG_CELLS_PER_ROW) continue;
    rows.push(cells.map((cell) => cell.x));
  }

  if (rows.length < MIN_TABLE_ROWS) return false;
  if (rows.length / lines.length < MIN_ROW_RATIO) return false;

  return countAlignedColumns(rows, em * COLUMN_TOLERANCE_EM) >= MIN_ALIGNED_COLUMNS;
}

/**
 * 실제로 함께 보낼 앞쪽들이 표 지면인가 — 하이브리드 기본값의 최종 판단.
 *
 * 왜 "앞쪽"만 보나: 원본 페이지 업로드(uploadMaterialPageImages)는 언제나 **앞에서부터
 * MAX_SEND_PAGES 쪽**을 굽는다. 12쪽에 있는 표를 근거로 켜 봐야 실제로 실리는 건
 * 1~4쪽이라 모델은 그 표를 영영 못 본다 — 원가만 늘고 효과는 0 이다. 그래서 호출부는
 * **보낼 쪽의 플래그만** 순서대로 넘긴다.
 *
 * 과반을 요구하는 이유: 앞쪽 한 장이 표지라서 우연히 표처럼 잡히는 일은 있어도,
 * 절반 이상이 표로 잡히는 평문 교재는 없다. 1쪽짜리 자료는 그 한 장이 곧 과반이다.
 */
export function isTableHeavyFront(flags: readonly boolean[]): boolean {
  if (flags.length === 0) return false;
  const hits = flags.filter(Boolean).length;
  return hits > 0 && hits >= Math.ceil(flags.length / 2);
}

/** 조각 높이의 중앙값(=대략 1em). 평균은 제목 한 줄에 끌려간다. */
function medianHeight(spans: PdfTextSpan[]): number {
  const heights = spans
    .map((span) => span.height || 0)
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  if (heights.length === 0) return 10;
  return heights[Math.floor(heights.length / 2)];
}

/** 한 줄을 셀로 끊는다 — 각 셀의 시작 x 와 공백 뺀 글자 수. */
function splitIntoCells(
  line: PdfTextSpan[],
  gapThreshold: number,
): Array<{ x: number; chars: number }> {
  const byX = [...line].sort((a, b) => a.transform[4] - b.transform[4]);
  const cells: Array<{ x: number; chars: number }> = [];
  let prevEnd: number | null = null;
  for (const span of byX) {
    const x = span.transform[4];
    if (prevEnd === null || x - prevEnd > gapThreshold) {
      cells.push({ x, chars: 0 });
    }
    cells[cells.length - 1].chars += span.str.replace(/\s/g, "").length;
    // 겹쳐 놓인 조각(강조 겹쳐찍기)이 뒤 칸을 삼키지 않게 끝은 뒤로만 민다.
    const end = x + (span.width || 0);
    prevEnd = prevEnd === null ? end : Math.max(prevEnd, end);
  }
  return cells;
}

/**
 * 셀 시작 x 들을 열로 뭉쳐, **서로 다른 행 MIN_ROWS_PER_COLUMN 개 이상**이 지지하는
 * 열의 수를 센다. 같은 행이 한 열을 여러 번 지지하는 것은 세지 않는다(한 행 안에서
 * 우연히 가까운 두 칸이 한 열처럼 보이는 경우를 막는다).
 */
function countAlignedColumns(rows: number[][], tolerance: number): number {
  const points = rows
    .flatMap((row, index) => row.map((x) => ({ x, row: index })))
    .sort((a, b) => a.x - b.x);
  if (points.length === 0) return 0;

  let aligned = 0;
  let anchor = points[0].x;
  let members = new Set<number>();
  for (const point of points) {
    if (point.x - anchor > tolerance) {
      if (members.size >= MIN_ROWS_PER_COLUMN) aligned += 1;
      anchor = point.x;
      members = new Set<number>();
    }
    members.add(point.row);
  }
  if (members.size >= MIN_ROWS_PER_COLUMN) aligned += 1;
  return aligned;
}
