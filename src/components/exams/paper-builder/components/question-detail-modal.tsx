import { X } from "lucide-react";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import { optionDisplayTextForSubtype } from "../option-display";
import { parseOptions } from "../paper-item-utils";
import type { BuilderQuestion } from "../types";

interface QuestionDetailModalProps {
  question: BuilderQuestion;
  onClose: () => void;
}

export function QuestionDetailModal({ question, onClose }: QuestionDetailModalProps) {
  const options = parseOptions(question.options);
  const displayOptions =
    question.subType === "SENTENCE_INSERT"
      ? options.map((option, index) => ({
          ...option,
          text: optionDisplayTextForSubtype(question.subType, index, option.text),
        }))
      : options;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-3 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-2">
          <div>
            <p className="text-[14px] font-bold text-slate-900">문제 상세</p>
            <p className="text-[11px] text-slate-400">
              {sanitizeAiModelDisclosureText(question.passage?.title) || "독립 문제"}
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {question.passage && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-[12px] font-bold text-slate-700">
                {sanitizeAiModelDisclosureText(question.passage.title)}
              </p>
              <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-600">{question.passage.content}</p>
            </div>
          )}
          <p className="whitespace-pre-line text-[14px] font-semibold leading-relaxed text-slate-800">{question.questionText}</p>
          {displayOptions.length > 0 && (
            <div className="mt-4 space-y-2">
              {displayOptions.map((option) => (
                <div key={option.label} className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                  <span className="font-bold text-slate-400">{option.label}</span>
                  <span>{option.text}</span>
                </div>
              ))}
            </div>
          )}
          {question.explanation && (
            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
              <p className="text-[12px] font-bold text-amber-800">해설</p>
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-amber-900">{question.explanation.content}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
