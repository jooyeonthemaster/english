"use client";

// ============================================================================
// ExamPrintView — 어드민 안의 가벼운 "시험지 보기·인쇄".
// 선택한 문제(또는 기존 시험지)를 깔끔한 A4 시험지 레이아웃으로 보여주고,
// 브라우저 인쇄(또는 PDF 저장)로 바로 뽑는다. 풀 빌더의 블록편집·셔플 등
// 짜잘한 기능은 빼고 "직관적으로 보고 프린트" 에 집중.
//
// 무엇을 찍을지(지문 박스·문항 안 지문·번호·발문·선지·정답)는 서버가 공용 정본으로 만든 groups
// (exam-print-model.buildAdminPrintModel — 학원 화면·HWPX·DOCX 와 같은 규칙)를 그대로 그린다(26-09-30 COH-2 b).
// 인쇄는 window.print() 를 직접 부른다: 이 화면은 지연 마운트 쪽·조판 넘침 가드·시험지 전용 글꼴이 없는 단순
// 흐름 문서라, 시험지 영역의 인쇄 컨트롤러(paper-builder/print — 준비 완료 신호)가 기다릴 신호가 없다.
// ============================================================================

import { useState } from "react";
import { Printer, FileText, ArrowLeft } from "lucide-react";
import type { PrintGroup } from "./exam-print-model";

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
  groups,
  questionCount,
  docxUrl,
}: {
  title: string;
  initialAnswers: boolean;
  /** 공용 정본으로 만든 인쇄 모델(그룹 지문 1회 · 문항 안 지문 · 커스텀 글 블록). */
  groups: PrintGroup[];
  questionCount: number;
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

  const questions = groups.flatMap((g) => (g.kind === "questions" ? g.questions : []));

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
          시험지 미리보기 · {questionCount}문항
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

          {questionCount === 0 ? (
            <p className="py-10 text-center text-[13px] text-gray-400">
              표시할 문항이 없습니다.
            </p>
          ) : (
            <div className="space-y-5">
              {groups.map((group) =>
                group.kind === "text" ? (
                  <p key={group.key} className="whitespace-pre-wrap text-[13px] font-semibold">
                    {group.text}
                  </p>
                ) : (
                  <section key={group.key} className="space-y-4">
                    {group.passage && (
                      <div className="break-inside-avoid rounded border border-gray-300 bg-gray-50/60 px-3 py-2 text-[12.5px] leading-relaxed">
                        {group.passage.setPrompt && (
                          <p className="mb-1 font-bold">{group.passage.setPrompt}</p>
                        )}
                        {group.passage.title && (
                          <p className="mb-1 text-[11.5px] font-bold text-gray-600">{group.passage.title}</p>
                        )}
                        <p className="whitespace-pre-wrap">{group.passage.content}</p>
                      </div>
                    )}
                    <ol className="space-y-5">
                      {group.questions.map((q) => (
                        <li key={q.id} className="break-inside-avoid">
                          <div className="flex gap-1.5">
                            <span className="font-bold">{q.number}.</span>
                            <div className="min-w-0 flex-1">
                              <p className="whitespace-pre-wrap font-medium">{q.questionText}</p>
                              {q.inlinePassage && (
                                <div className="mt-1.5 rounded border border-gray-300 bg-gray-50/60 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                                  {q.inlinePassage}
                                </div>
                              )}
                              {q.options.length > 0 && (
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
                                  정답: {q.answer}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                ),
              )}
            </div>
          )}

          {/* 정답표 */}
          {showAnswers && questionCount > 0 && (
            <div className="mt-8 border-t-2 border-gray-900 pt-3">
              <h2 className="mb-2 text-[14px] font-bold">정답</h2>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                {questions.map((q) => (
                  <span key={q.id}>
                    <span className="font-semibold">{q.number}.</span>{" "}
                    {q.answer}
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
