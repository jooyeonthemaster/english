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
  // 한 행의 실측 높이(글자+상하 패딩+테두리): comfortable ≈ 25.7px, compact ≈ 21.7px.
  // 인쇄 시 .exam-a4-page 가 overflow:hidden 이라, 마지막 행이 잘리지 않게 넉넉히 잡는다.
  const rowPx = compact ? 22 : 26;
  const rowsPerPage = Math.max(1, Math.floor(usable / rowPx));

  const perPage = mode === "grid" ? rowsPerPage * ANSWER_KEY_COLS : rowsPerPage;
  return { mode, rowsPerPage, pages: chunk(entries, perPage) };
}
