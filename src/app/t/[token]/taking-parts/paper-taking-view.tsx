"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 시험지 보기(mode A, 설계 §결정2)
//
// 웹 빌더 A4 렌더의 "진짜 시험지" 룩을 학생 안전 페이로드로 재현하되, 선지 선택·
// 서답형 입력이 인터랙티브하다. 한 시트에 여러 문항(2단)·문항별 번호·발문/지문/
// 보기 + 응답 위젯. 문항 본문은 TabletQuestionView(모드B와 동일 — renderExamInline
// 으로 마커 ①② 정규화)로 그려 모드A/모드B 본문 픽셀 일치를 보장한다.
//
// 상태(inputs/autosave/제출/타이머)는 TabletTakingClient 소유 — 이 뷰는 표시·입력만.
// 정답성 데이터는 props 에 구조적으로 없다(§6-1). A4PaperPage(빌더 컴포넌트)는
// answer-bearing 이라 재사용하지 않는다(누출·회귀 차단, 프레젠테이션 헬퍼만 공유).
//
// 페이지 분리(측정 packer)는 팬아웃 U1 — 현재는 단일 연속 시트(2단)로 룩·인터랙션 확정.
// ============================================================================

import { memo } from "react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TakingQuestion } from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { AnswerLayer } from "./answer-layer";
import { TabletQuestionView } from "./question-view";
import { EXAM_FONT } from "./exam-markup";

interface PaperTakingViewProps {
  examTitle: string;
  studentName: string;
  instructions?: string;
  questions: TakingQuestion[];
  inputs: Record<string, StudentInput | null>;
  flagged: Set<string>;
  disabled: boolean;
  /** 네비게이터/미응답 칩 점프 직후 일시 하이라이트할 문항 번호 */
  highlightOrderNum?: number | null;
  /** 글자 크기 배율(CSS zoom) — 클래스 픽셀 크기 불변, 시트 전체 배율만 */
  fontScale?: number;
  onChange: (questionId: string, input: StudentInput | null) => void;
  onToggleFlag: (questionId: string) => void;
}

export const PaperTakingView = memo(function PaperTakingView({
  examTitle,
  studentName,
  instructions,
  questions,
  inputs,
  flagged,
  disabled,
  highlightOrderNum,
  fontScale,
  onChange,
  onToggleFlag,
}: PaperTakingViewProps) {
  return (
    // pb-14 = 하단 고정 바 여유 공간(기존 클라이언트 측 스페이서 흡수)
    <div className="mx-auto w-full max-w-[900px] px-3 pb-14 pt-4">
      {/* A4 시트 */}
      <div
        className="rounded-sm border border-[#E5E8EB] bg-white px-4 py-5 shadow-sm sm:px-7 sm:py-6"
        style={{ fontFamily: EXAM_FONT, zoom: fontScale ?? 1 }}
      >
        {/* 시험지 헤더 — 빌더 PageHeader 룩 미러(제목 중앙·굵은 하단선·응시자 우측) */}
        <header className="mb-3 border-b-2 border-[#191F28] pb-2">
          <h1 className="text-center text-base font-bold tracking-tight text-[#191F28] sm:text-lg">
            {examTitle}
          </h1>
          {instructions && (
            <p className="mt-1 text-[10px] leading-relaxed text-[#4E5968]">
              {instructions}
            </p>
          )}
          <p className="mt-1 text-right text-[10px] text-[#4E5968]">
            응시자 <span className="font-semibold text-[#191F28]">{studentName}</span>
          </p>
        </header>

        {/* 2단 문항 그리드 — 각 문항은 칸 경계에서 쪼개지지 않게 유지 */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {questions.map((question) => {
            const isFlagged = flagged.has(question.questionId);
            return (
              <section
                key={question.questionId}
                id={`taking-q-${question.orderNum}`}
                className={cn(
                  "scroll-mt-2 break-inside-avoid border-b border-dashed border-[#E5E8EB] pb-3.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0",
                  // 점프 직후 일시 링(클라이언트가 1.8초 뒤 해제)
                  highlightOrderNum === question.orderNum &&
                    "rounded-sm ring-2 ring-blue-400",
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#191F28] tabular-nums">
                    {question.orderNum}.
                  </span>
                  <span className="text-[9px] text-[#8B95A1] tabular-nums">
                    [{question.points}점]
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleFlag(question.questionId)}
                    aria-pressed={isFlagged}
                    aria-label={`${question.orderNum}번 문항 표시`}
                    className={cn(
                      "ml-auto flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-medium transition-colors",
                      isFlagged
                        ? "bg-blue-50 text-[#3182F6]"
                        : "bg-[#F7F8FA] text-[#8B95A1] hover:bg-blue-50 hover:text-[#3182F6]",
                    )}
                  >
                    <Flag
                      className="h-2.5 w-2.5"
                      fill={isFlagged ? "currentColor" : "none"}
                    />
                    {isFlagged ? "표시됨" : "표시"}
                  </button>
                </div>

                <TabletQuestionView safe={question.safe} variant="paper" />

                <div className="mt-2">
                  <AnswerLayer
                    questionOrderNum={question.orderNum}
                    subType={question.safe.subType}
                    variant="paper"
                    answerUi={question.answerUi}
                    options={question.safe.options}
                    blanks={question.safe.safeData?.blanks}
                    input={inputs[question.questionId] ?? null}
                    disabled={disabled}
                    onChange={(input) => onChange(question.questionId, input)}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
});
