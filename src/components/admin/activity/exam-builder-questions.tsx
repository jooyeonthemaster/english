"use client";

// ============================================================================
// ExamBuilderQuestions — 생성된 문제를 자료 뷰어에서 바로 보고, 원하는 문항을
// 골라 "시험지 만들기 → DOCX" 로 즉석 출력한다. (학원 콘텐츠로 안 들어가도 됨)
// 실제 시험지 생성(buildExamDocument)를 그대로 쓰는 /api/admin/exam-export 호출.
// ============================================================================

import { useState } from "react";
import { Printer, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { QuestionBrief } from "@/actions/admin-activity";
import { multiBlankOptionMatrix } from "@/components/exams/paper-builder/option-display";
import { MultiBlankOptionGrid } from "@/components/exams/multi-blank-option-grid";

export function ExamBuilderQuestions({
  questions,
  defaultTitle,
}: {
  questions: QuestionBrief[];
  defaultTitle: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(questions.map((q) => q.id)),
  );
  const [title, setTitle] = useState(defaultTitle || "시험지");
  const [includeAnswers, setIncludeAnswers] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-6 text-center text-[12px] text-gray-400">
        이 지문에 등록된 문제가 아직 없습니다.
      </div>
    );
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === questions.length
        ? new Set()
        : new Set(questions.map((q) => q.id)),
    );
  }

  function openPrintView() {
    const ids = questions.filter((q) => selected.has(q.id)).map((q) => q.id);
    if (ids.length === 0) {
      toast.error("문항을 1개 이상 선택하세요");
      return;
    }
    const params = new URLSearchParams();
    params.set("ids", ids.join(","));
    if (title.trim()) params.set("title", title.trim());
    if (includeAnswers) params.set("answers", "1");
    window.open(`/admin/exam-print?${params.toString()}`, "_blank");
  }

  const allSelected = selected.size === questions.length;

  return (
    <div className="space-y-3">
      {/* 시험지 만들기 바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5">
        <FileText className="size-4 text-blue-600 shrink-0" strokeWidth={2} aria-hidden />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 w-[200px] text-[12px] bg-white"
          placeholder="시험지 제목"
          maxLength={120}
        />
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeAnswers}
            onChange={(e) => setIncludeAnswers(e.target.checked)}
            className="size-3.5 accent-blue-600"
          />
          정답·해설 포함
        </label>
        <Button
          size="sm"
          className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700 ml-auto"
          onClick={openPrintView}
          disabled={selected.size === 0}
        >
          <Printer className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
          시험지 보기·인쇄 ({selected.size})
        </Button>
      </div>

      {/* 문항 목록 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[12px] text-gray-500">
          문제 {questions.length}개
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[11px] text-blue-600 hover:underline"
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      <ol className="space-y-2">
        {questions.map((q, i) => (
          <QuestionItem
            key={q.id}
            q={q}
            index={i}
            checked={selected.has(q.id)}
            onToggle={() => toggle(q.id)}
          />
        ))}
      </ol>
    </div>
  );
}

function QuestionItem({
  q,
  index,
  checked,
  onToggle,
}: {
  q: QuestionBrief;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2.5 transition-colors",
        checked ? "border-blue-200 bg-blue-50/30" : "border-gray-100 bg-white",
      )}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 size-4 accent-blue-600 shrink-0"
          aria-label={`${index + 1}번 문항 선택`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[12px] font-semibold text-gray-700">
              {q.number != null ? `${q.number}번` : `${index + 1}`}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] border-0 px-1.5 bg-gray-100 text-gray-500"
            >
              {q.type}
            </Badge>
          </div>
          <p className="text-[12.5px] text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
            {q.questionText}
          </p>
          {q.options &&
            q.options.length > 0 &&
            (() => {
              // 다중 빈칸(BLANK_INFERENCE) 조합 선지 — (A)/(B) 컬럼 헤더 그리드
              const multiBlank =
                q.subType === "BLANK_INFERENCE"
                  ? multiBlankOptionMatrix(q.options)
                  : null;
              if (multiBlank) {
                return (
                  <div className="mt-1.5">
                    <MultiBlankOptionGrid
                      blankCount={multiBlank.blankCount}
                      className="text-[12px] text-gray-600"
                      headerCellClassName="text-gray-400"
                      numberCellClassName="text-gray-400"
                      rows={multiBlank.rows.map(({ option, values }, oi) => ({
                        key: oi,
                        numberCell: option.label,
                        cells: values,
                      }))}
                    />
                  </div>
                );
              }
              return (
                <ul className="mt-1.5 space-y-0.5">
                  {q.options.map((o, oi) => (
                    <li key={oi} className="text-[12px] text-gray-600">
                      <span className="text-gray-400">{o.label}</span> {o.text}
                    </li>
                  ))}
                </ul>
              );
            })()}
          <div className="mt-1.5 flex items-center gap-3">
            <span className="text-[11px] text-emerald-700">
              정답: <span className="font-medium">{q.correctAnswer}</span>
            </span>
            {q.explanation && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600"
              >
                {open ? (
                  <ChevronDown className="size-3" strokeWidth={2} aria-hidden />
                ) : (
                  <ChevronRight className="size-3" strokeWidth={2} aria-hidden />
                )}
                해설
              </button>
            )}
          </div>
          {open && q.explanation && (
            <div
              className="mt-1.5 rounded-md bg-gray-50 border border-gray-100 px-2.5 py-2 text-[11.5px] text-gray-600 leading-relaxed [&_*]:!text-[11.5px]"
              dangerouslySetInnerHTML={{ __html: q.explanation }}
            />
          )}
        </div>
      </div>
    </li>
  );
}
