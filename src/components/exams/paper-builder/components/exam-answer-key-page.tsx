import { cn } from "@/lib/utils";

import { PAPER_SIZE_SPECS } from "../constants";
import { TEMPLATE_VISUALS } from "../templates";
import type { Density, PaperSize, PaperTemplate } from "../types";
import { ANSWER_KEY_COLS, type AnswerEntry } from "../answer-key-layout";

interface ExamAnswerKeyPageProps {
  paperSize: PaperSize;
  template: PaperTemplate;
  density: Density;
  title: string;
  // 페이지에 담긴 정답 항목(순서대로).
  entries: AnswerEntry[];
  // 5열 그리드 한 열의 행 수(그리드를 열 우선으로 채우기 위해 필요).
  rowsPerPage: number;
  mode: "grid" | "list";
  // 정답표가 여러 페이지면 1/2 식으로 표기.
  pageOrdinal: number;
  pageTotal: number;
}

/**
 * 시험지 맨 뒤에 붙는 "정답표" 페이지. PDF 다운로드(=미리보기 인쇄)에 정답지가
 * 포함되도록, A4PaperPage 와 동일한 .exam-a4-page 박스 구조로 렌더한다(인쇄 CSS 가
 * .exam-a4-page > div 를 물리 용지에 균일 확대하므로 직속 자식 1개 래퍼를 유지한다).
 * DOCX 의 build-answer-key.ts 와 같은 규칙으로 5열 그리드/전체 폭 목록을 그린다.
 */
export function ExamAnswerKeyPage({
  paperSize,
  template,
  density,
  title,
  entries,
  rowsPerPage,
  mode,
  pageOrdinal,
  pageTotal,
}: ExamAnswerKeyPageProps) {
  const visual = TEMPLATE_VISUALS[template];
  const paperSpec = PAPER_SIZE_SPECS[paperSize];
  const compact = density === "compact";

  return (
    <div
      className={cn(
        "exam-a4-page relative w-full overflow-hidden shadow-xl ring-1",
        visual.pageClass,
      )}
      style={{
        aspectRatio: `${paperSpec.widthMm} / ${paperSpec.heightMm}`,
        fontFamily: '"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif',
      }}
      data-paper-size={paperSize}
      data-exam-answer-key="true"
    >
      <div
        className={cn(
          "relative flex h-full flex-col",
          compact ? "px-[28px] py-[24px]" : "px-[34px] py-[28px]",
          visual.innerClass,
        )}
      >
        <header
          className={cn(
            "mb-3 flex shrink-0 items-center justify-between border-b pb-2 text-[10px]",
            visual.continuedHeaderClass,
          )}
        >
          <span>{title}</span>
          <span>정답표{pageTotal > 1 ? ` ${pageOrdinal} / ${pageTotal}` : ""}</span>
        </header>

        <h2
          className={cn(
            "mb-3 shrink-0 text-center font-black tracking-[0.3em]",
            compact ? "text-[16px]" : "text-[18px]",
          )}
        >
          정 답 표
        </h2>

        <main
          className={cn(
            "min-h-0 flex-1",
            compact ? "text-[10.5px] leading-[1.4]" : "text-[11.5px] leading-[1.45]",
          )}
        >
          {mode === "grid" ? (
            <div
              className="grid gap-x-4"
              style={{
                gridAutoFlow: "column",
                gridTemplateColumns: `repeat(${ANSWER_KEY_COLS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rowsPerPage}, minmax(0, auto))`,
              }}
            >
              {entries.map((entry) => (
                <AnswerCell key={entry.orderNum} entry={entry} compact={compact} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <AnswerCell key={entry.orderNum} entry={entry} compact={compact} wide />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function AnswerCell({
  entry,
  compact,
  wide,
}: {
  entry: AnswerEntry;
  compact: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5 border-b border-slate-200",
        compact ? "py-[3px]" : "py-1",
        wide ? "whitespace-pre-wrap" : "min-w-0",
      )}
    >
      <span className="shrink-0 font-black text-slate-950">{entry.orderNum}.</span>
      <span
        className={cn(
          "font-bold text-slate-900",
          wide ? "break-words" : "truncate",
        )}
        title={entry.answer}
      >
        {entry.answer || " "}
      </span>
    </div>
  );
}
