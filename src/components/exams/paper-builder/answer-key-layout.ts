import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH } from "./constants";
import type { Density, PaperItem, PaperSize } from "./types";

// ---------------------------------------------------------------------------
// 정답표(정답지) 페이지 레이아웃.
// PDF 다운로드는 미리보기 DOM 을 그대로 인쇄하므로(DOCX/HWPX 처럼 서버에서 붙이지
// 않는다), 정답표를 미리보기 마지막 페이지로 직접 렌더해야 한다. DOCX 의
// build-answer-key.ts 와 동일한 규칙: 긴 정답이 섞이면 전체 폭 목록, 아니면 5열 그리드.
// 문항이 많으면(예: 445문항) 한 페이지에 다 못 들어가므로 페이지 단위로 쪼갠다.
// ---------------------------------------------------------------------------

export type AnswerEntry = { orderNum: number; answer: string };

export type AnswerKeyLayout = {
  // 5열 그리드(grid) vs 전체 폭 번호 목록(list).
  mode: "grid" | "list";
  // 한 페이지에 들어가는 행 수(grid 는 한 열의 행 수).
  rowsPerPage: number;
  // 페이지별 정답 항목(순서대로). 비어 있으면 정답표 페이지를 그리지 않는다.
  pages: AnswerEntry[][];
};

export const ANSWER_KEY_COLS = 5;

// 정답표가 필요 없는 경우(카드 썸네일, 해설 포함 PDF 등)에 넘기는 빈 레이아웃.
export const EMPTY_ANSWER_KEY_LAYOUT: AnswerKeyLayout = {
  mode: "grid",
  rowsPerPage: 1,
  pages: [],
};

// DOCX 빌더와 동일: 가장 긴 정답이 이 길이를 넘으면 5열 그리드가 세로로 터지므로
// 전체 폭 목록으로 전환한다.
const LONG_ANSWER_THRESHOLD = 20;

function answerEntries(paperItems: PaperItem[]): AnswerEntry[] {
  const entries: AnswerEntry[] = [];
  for (const item of paperItems) {
    if (item.blockType !== "question") continue;
    const source = item.sourceQuestion;
    // 빌더에서 편집한 정답(item.correctAnswer)을 우선, 없으면 원본 문항 값으로 폴백
    // (export-docx route 와 동일한 우선순위).
    const answer = formatStoredQuestionCorrectAnswer({
      subType: source.subType,
      typeId: source.type,
      correctAnswer: item.correctAnswer || source.correctAnswer,
      structuredData: source.structuredData,
    });
    entries.push({ orderNum: item.orderNum, answer });
  }
  return entries;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length > 0 ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// 누적 높이가 usable 을 넘기 직전까지 항목을 담아 페이지를 나눈다(그리디).
// 균등 chunk 와 달리 항목별 실제 높이(줄바꿈 반영)를 합산하므로, 긴 정답이
// 여러 줄로 접혀도 .exam-a4-page overflow:hidden 으로 잘려 사라지지 않는다.
// 페이지당 최소 1개는 보장한다(거대한 단일 정답으로 무한루프 방지).
function packByHeight(
  entries: AnswerEntry[],
  usable: number,
  gap: number,
  heightOf: (entry: AnswerEntry) => number,
): AnswerEntry[][] {
  const pages: AnswerEntry[][] = [];
  let current: AnswerEntry[] = [];
  let used = 0;
  for (const entry of entries) {
    const h = heightOf(entry);
    const add = current.length === 0 ? h : gap + h;
    if (current.length > 0 && used + add > usable) {
      pages.push(current);
      current = [entry];
      used = h;
    } else {
      current.push(entry);
      used += add;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

export function buildAnswerKeyLayout(
  paperItems: PaperItem[],
  opts: { paperSize: PaperSize; density: Density },
): AnswerKeyLayout {
  const entries = answerEntries(paperItems);
  if (entries.length === 0) {
    return { mode: "grid", rowsPerPage: 1, pages: [] };
  }

  const longest = entries.reduce((max, e) => Math.max(max, e.answer.length), 0);
  const mode: "grid" | "list" = longest > LONG_ANSWER_THRESHOLD ? "list" : "grid";

  // 미리보기 모델 px 기준 페이지 가용 높이에서 한 페이지당 행 수를 도출한다.
  // (페이지 전체가 zoom/print scale 로 같은 비율 확대되므로 모델 px 는 고정이다.)
  const spec = PAPER_SIZE_SPECS[opts.paperSize];
  const pageWidth = Math.round(PREVIEW_PAGE_WIDTH * spec.widthRatio);
  const pageHeight = pageWidth * spec.heightRatio;
  const compact = opts.density === "compact";
  const padY = compact ? 24 : 28;
  const headerHeight = 28; // 상단 슬림 헤더(제목/정답 라벨)
  const headingHeight = 48; // "정 답 표" 제목 + 구분선 + 여백
  const usable = pageHeight - padY * 2 - headerHeight - headingHeight;
  // 한 행(1줄)의 실측 높이: comfortable ≈ 25.7px, compact ≈ 21.7px. 경계 클립 방지를
  // 위해 측정값보다 살짝 넉넉히 잡는다(과대추정=페이지 증가, 데이터 소실은 없음).
  const rowPx = compact ? 23 : 27;
  const rowsPerPage = Math.max(1, Math.floor(usable / rowPx));

  if (mode === "grid") {
    // grid 는 5열을 열 우선으로 채우므로 행 수(rowsPerPage)로 분할한다.
    const perPage = rowsPerPage * ANSWER_KEY_COLS;
    return { mode, rowsPerPage, pages: chunk(entries, perPage) };
  }

  // list(긴 정답): 항목이 wide 셀에서 여러 줄로 접힌다. 고정 행수 분할은 추정 높이를
  // 초과하는 분량을 overflow:hidden 으로 잘라 "중간 문항 정답이 통째로 사라지는" 버그를
  // 낸다(예: 30~36 소실). 항목별 추정 줄 수로 실제 높이를 합산해 그리디로 분할한다.
  const padX = compact ? 28 : 34;
  const fontPx = compact ? 10.5 : 11.5;
  const lineHeight = compact ? 1.4 : 1.45;
  const lineHeightPx = fontPx * lineHeight;
  const rowPadY = compact ? 6 : 8; // py-[3px] / py-1 (상+하)
  const borderPx = 1; // border-b
  const gap = 4; // space-y-1
  // wide 셀 가용 폭: 페이지 폭 - 좌우 패딩 - 번호("53.") - 간격. 글자폭은 보수적으로(과대추정).
  const numberColPx = 26;
  const availWidth = Math.max(120, pageWidth - padX * 2 - numberColPx);
  const charWidthPx = fontPx * 0.58; // 영문 비례폭 보수 추정(줄 수 과대평가 → 안전)
  const charsPerLine = Math.max(20, Math.floor(availWidth / charWidthPx));
  const heightOf = (entry: AnswerEntry): number => {
    const len = Math.max(1, (entry.answer || "").length);
    const lines = Math.max(1, Math.ceil(len / charsPerLine));
    return lines * lineHeightPx + rowPadY + borderPx;
  };

  return { mode, rowsPerPage, pages: packByHeight(entries, usable, gap, heightOf) };
}
