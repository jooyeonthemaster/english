"use client";

import type {
  MdBlankQuestion,
  MdGrammarQuestion,
  MdQuestion,
} from "@/lib/md-lab/parser";

// 선지·해설·밑줄 단위 편집기 — 파싱된 구조를 직접 수정하면 시험지에 즉시 반영.
export function QuestionEditor({
  question,
  onChange,
}: {
  question: MdQuestion;
  onChange: (next: MdQuestion) => void;
}) {
  return (
    <section className="no-print space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">문항 편집 (선지별)</h2>
      {question.kind === "blank" ? (
        <BlankEditor question={question} onChange={onChange} />
      ) : (
        <GrammarEditor question={question} onChange={onChange} />
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-300 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function BlankEditor({
  question,
  onChange,
}: {
  question: MdBlankQuestion;
  onChange: (next: MdQuestion) => void;
}) {
  const patch = (p: Partial<MdBlankQuestion>) => onChange({ ...question, ...p });
  return (
    <div className="space-y-3">
      <Field label="빈칸 원문 (지문 축자)">
        <input
          className={inputCls}
          value={question.originalExpression}
          onChange={(e) => patch({ originalExpression: e.target.value })}
        />
      </Field>
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-500">
          선지 5개 — 라디오로 정답 지정
        </span>
        {question.options.map((o, i) => (
          <div key={o.label} className="flex items-center gap-2">
            <input
              type="radio"
              name="blank-answer"
              checked={question.answer === o.label}
              onChange={() => patch({ answer: o.label })}
            />
            <span className="w-5 text-sm text-slate-700">{o.label}</span>
            <input
              className={inputCls}
              value={o.text}
              onChange={(e) => {
                const options = question.options.slice();
                options[i] = { ...o, text: e.target.value };
                patch({ options });
              }}
            />
          </div>
        ))}
      </div>
      <Field label="해설 (간단히)">
        <textarea
          className={inputCls}
          rows={2}
          value={question.explanation}
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </Field>
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-500">
          오답 짚어주기 (기제 1문장){question.wrong.length === 0 && " — 정답 해설만 모드"}
        </span>
        {question.wrong.map((w, i) => (
          <div key={w.label} className="flex items-center gap-2">
            <span className="w-5 text-sm text-slate-700">{w.label}</span>
            <input
              className={inputCls}
              value={w.text}
              onChange={(e) => {
                const wrong = question.wrong.slice();
                wrong[i] = { ...w, text: e.target.value };
                patch({ wrong });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const POINT_CODES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "k"] as const;

function GrammarEditor({
  question,
  onChange,
}: {
  question: MdGrammarQuestion;
  onChange: (next: MdQuestion) => void;
}) {
  const patch = (p: Partial<MdGrammarQuestion>) => onChange({ ...question, ...p });
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-500">
          밑줄 5개 — 원문표현(지문 축자) / 표시형(정답만 오형) / 포인트 · 라디오로 정답 지정
        </span>
        {question.marks.map((m, i) => (
          <div key={m.label} className="flex items-center gap-2">
            <input
              type="radio"
              name="grammar-answer"
              checked={question.answer === m.label}
              onChange={() => patch({ answer: m.label })}
            />
            <span className="w-8 text-sm text-slate-700">{m.label}</span>
            <input
              className={inputCls}
              value={m.original}
              placeholder="원문표현"
              onChange={(e) => {
                const marks = question.marks.slice();
                marks[i] = { ...m, original: e.target.value };
                patch({ marks });
              }}
            />
            <input
              className={inputCls}
              value={m.shown}
              placeholder="표시형"
              onChange={(e) => {
                const marks = question.marks.slice();
                marks[i] = { ...m, shown: e.target.value };
                patch({ marks });
              }}
            />
            <input
              className={inputCls}
              value={m.anchor ?? ""}
              placeholder="위치앵커(직전 원문)"
              onChange={(e) => {
                const marks = question.marks.slice();
                marks[i] = { ...m, anchor: e.target.value };
                patch({ marks });
              }}
            />
            <select
              className="rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm text-slate-700"
              value={m.code}
              onChange={(e) => {
                const marks = question.marks.slice();
                marks[i] = { ...m, code: e.target.value };
                patch({ marks });
              }}
            >
              {POINT_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <Field label="고침 (정답 자리의 올바른 형태)">
        <input
          className={inputCls}
          value={question.fix}
          onChange={(e) => patch({ fix: e.target.value })}
        />
      </Field>
      <Field label="해설 (간단히)">
        <textarea
          className={inputCls}
          rows={2}
          value={question.explanation}
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </Field>
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-500">
          오답 짚어주기 (1문장){question.wrong.length === 0 && " — 정답 해설만 모드"}
        </span>
        {question.wrong.map((w, i) => (
          <div key={w.label} className="flex items-center gap-2">
            <span className="w-8 text-sm text-slate-700">{w.label}</span>
            <input
              className={inputCls}
              value={w.text}
              onChange={(e) => {
                const wrong = question.wrong.slice();
                wrong[i] = { ...w, text: e.target.value };
                patch({ wrong });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
