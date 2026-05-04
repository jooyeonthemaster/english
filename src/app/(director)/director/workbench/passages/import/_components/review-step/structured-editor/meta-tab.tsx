"use client";

// ============================================================================
// MetaTab — SourceMaterial metadata editor.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import type { SourceMaterialDraft } from "../types";

export function MetaTab({
  draft,
  setDraft,
}: {
  draft: SourceMaterialDraft;
  setDraft: (d: SourceMaterialDraft) => void;
}) {
  const update = <K extends keyof SourceMaterialDraft>(
    key: K,
    value: SourceMaterialDraft[K],
  ) => setDraft({ ...draft, [key]: value });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          시험지 메타데이터
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          EXAM_META 블록에서 자동 채워진 값입니다. 필요하면 직접 수정하세요.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <Field label="제목" full>
          <input
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
            className="input-meta"
            placeholder="예: 2024학년도 9월 모의평가"
          />
        </Field>
        <Field label="부제목" full>
          <input
            value={draft.subtitle}
            onChange={(e) => update("subtitle", e.target.value)}
            className="input-meta"
          />
        </Field>
        <Field label="과목">
          <select
            value={draft.subject}
            onChange={(e) =>
              update(
                "subject",
                e.target.value as SourceMaterialDraft["subject"],
              )
            }
            className="input-meta"
          >
            <option value="">—</option>
            <option value="ENGLISH">영어</option>
            <option value="KOREAN">국어</option>
            <option value="MATH">수학</option>
            <option value="OTHER">기타</option>
          </select>
        </Field>
        <Field label="학년">
          <select
            value={draft.grade}
            onChange={(e) => update("grade", e.target.value)}
            className="input-meta"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </select>
        </Field>
        <Field label="학기">
          <select
            value={draft.semester}
            onChange={(e) =>
              update(
                "semester",
                e.target.value as SourceMaterialDraft["semester"],
              )
            }
            className="input-meta"
          >
            <option value="">—</option>
            <option value="FIRST">1학기</option>
            <option value="SECOND">2학기</option>
          </select>
        </Field>
        <Field label="시행년도">
          <input
            value={draft.year}
            onChange={(e) =>
              update("year", e.target.value.replace(/[^0-9]/g, ""))
            }
            className="input-meta"
            placeholder="2024"
          />
        </Field>
        <Field label="회차">
          <input
            value={draft.round}
            onChange={(e) => update("round", e.target.value)}
            className="input-meta"
            placeholder="9월 / 1회"
          />
        </Field>
        <Field label="시험 종류">
          <select
            value={draft.examType}
            onChange={(e) =>
              update(
                "examType",
                e.target.value as SourceMaterialDraft["examType"],
              )
            }
            className="input-meta"
          >
            <option value="">—</option>
            <option value="MIDTERM">중간고사</option>
            <option value="FINAL">기말고사</option>
            <option value="MOCK">모의고사</option>
            <option value="SUNEUNG">수능</option>
            <option value="DIAGNOSTIC">진단</option>
            <option value="EBS">EBS</option>
            <option value="PRIVATE">학원</option>
          </select>
        </Field>
        <Field label="출제 기관 / 출판사" full>
          <input
            value={draft.publisher}
            onChange={(e) => update("publisher", e.target.value)}
            className="input-meta"
            placeholder="평가원 / 교육청 / 출판사"
          />
        </Field>
        <Field label="학교명" full>
          <input
            value={draft.school}
            onChange={(e) => update("school", e.target.value)}
            className="input-meta"
          />
        </Field>
      </div>

      <style jsx>{`
        :global(.input-meta) {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 6px 10px;
          font-size: 12px;
          color: rgb(30 41 59);
          outline: none;
        }
        :global(.input-meta:focus) {
          border-color: rgb(56 189 248);
          box-shadow: 0 0 0 2px rgb(186 230 253);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={"block " + (full ? "col-span-2" : "")}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
