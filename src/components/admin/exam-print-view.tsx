"use client";

// ============================================================================
// ExamPrintView — 어드민 안의 가벼운 "시험지 보기·인쇄".
// 선택한 문제(또는 기존 시험지)를 깔끔한 A4 시험지 레이아웃으로 보여주고,
// 브라우저 인쇄(또는 PDF 저장)로 바로 뽑는다. 풀 빌더의 블록편집·셔플 등
// 짜잘한 기능은 빼고 "직관적으로 보고 프린트" 에 집중.
// ============================================================================

import { useState } from "react";
import { Printer, FileText, ArrowLeft } from "lucide-react";

export interface PrintQuestion {
  id: string;
  number: number | null;
  questionText: string;
  options: Array<{ label: string; text: string }> | null;
  correctAnswer: string;
  passage: { title: string; content: string } | null;
}

// 단독(사이드바 없는) 페이지라 화면 요소는 툴바뿐 — 인쇄 시 그것만 숨기고
// 본문은 정상 흐름으로 두어 여러 페이지로 자연스럽게 나뉜다.
const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  html, body { background: #ffffff !important; }
  @page { margin: 16mm 14mm; }
}
`;

export function ExamPrintView({
  title,
  initialAnswers,
  questions,
  docxUrl,
}: {
  title: string;
  initialAnswers: boolean;
  questions: PrintQuestion[];
  /** DOCX 다운로드(어드민 라우트) POST 페이로드용 */
  docxUrl: { examId?: string; questionIds?: string[] };
}) {
  const [showAnswers, setShowAnswers] = useState(initialAnswers);

  async function downloadDocx() {
    try {
      const res = await fetch("/api/admin/exam-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...docxUrl,
          title,
          includeAnswers: showAnswers,
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}${showAnswers ? "_정답포함" : ""}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("DOCX 다운로드에 실패했습니다");
    }
  }

  // 같은 지문이 연속될 때 한 번만 출력하기 위한 추적
  let lastPassageKey: string | null = null;

  return (
    <div className="min-h-screen bg-gray-100">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* 상단 툴바 (인쇄 시 숨김) */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-5 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => window.close()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
          닫기
        </button>
        <span className="text-[13px] font-medium text-gray-700">
          시험지 미리보기 · {questions.length}문항
        </span>
        <label className="ml-3 inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-gray-600">
          <input
            type="checkbox"
            checked={showAnswers}
            onChange={(e) => setShowAnswers(e.target.checked)}
            className="size-4 accent-blue-600"
          />
          정답 표시
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={downloadDocx}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileText className="size-4" strokeWidth={2} aria-hidden />
            DOCX
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            <Printer className="size-4" strokeWidth={2} aria-hidden />
            인쇄 / PDF
          </button>
        </div>
      </div>

      {/* A4 시험지 */}
      <div className="mx-auto my-6 w-full max-w-[210mm] bg-white px-[16mm] py-[14mm] shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <div id="exam-print" className="text-[13.5px] leading-relaxed text-gray-900">
          {/* 헤더 */}
          <div className="mb-5 flex items-end justify-between border-b-2 border-gray-900 pb-3">
            <div>
              <div className="text-[11px] text-gray-500">영어 시험지</div>
              <h1 className="text-[20px] font-bold">{title}</h1>
            </div>
            <table className="text-[11px] text-gray-600">
              <tbody>
                <tr>
                  <td className="pr-2">학교</td>
                  <td className="w-[120px] border-b border-gray-400">&nbsp;</td>
                </tr>
                <tr>
                  <td className="pr-2 pt-1">반</td>
                  <td className="border-b border-gray-400 pt-1">&nbsp;</td>
                </tr>
                <tr>
                  <td className="pr-2 pt-1">이름</td>
                  <td className="border-b border-gray-400 pt-1">&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </div>

          {questions.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-gray-400">
              표시할 문항이 없습니다.
            </p>
          ) : (
            <ol className="space-y-5">
              {questions.map((q, i) => {
                const passageKey = q.passage
                  ? `${q.passage.title}::${q.passage.content.slice(0, 40)}`
                  : null;
                const showPassage = passageKey !== null && passageKey !== lastPassageKey;
                lastPassageKey = passageKey;
                return (
                  <li key={q.id} className="break-inside-avoid">
                    {showPassage && q.passage && (
                      <div className="mb-2 rounded border border-gray-300 bg-gray-50/60 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                        {q.passage.content}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <span className="font-bold">{q.number ?? i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap font-medium">
                          {q.questionText}
                        </p>
                        {q.options && q.options.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {q.options.map((o, oi) => (
                              <li key={oi} className="flex gap-1.5">
                                <span>{o.label}</span>
                                <span className="whitespace-pre-wrap">{o.text}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {showAnswers && (
                          <p className="mt-1 text-[12px] font-semibold text-blue-700">
                            정답: {q.correctAnswer}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* 정답표 */}
          {showAnswers && questions.length > 0 && (
            <div className="mt-8 border-t-2 border-gray-900 pt-3">
              <h2 className="mb-2 text-[14px] font-bold">정답</h2>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                {questions.map((q, i) => (
                  <span key={q.id}>
                    <span className="font-semibold">{q.number ?? i + 1}.</span>{" "}
                    {q.correctAnswer}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
