"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크 공통 1단계: 시험 메타 폼(컴팩트)
//
// 기본 노출은 시험 제목(필수) + 시험 종류 둘뿐이고, 학교명/학년/연도/학기는
// "상세 정보 (선택)" 접이 아래로 숨긴다(기본 접힘 — 입력 창 과다 지적 반영).
// 값 타입/기본값/CreateExamAnalysisInput 매퍼는 기존 계약 그대로 export 한다.
// ============================================================================

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CreateExamAnalysisInput } from "@/actions/exam-report";
import type { ExamSourceType, ExamType } from "@/lib/exam-report/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ExamMetaValue {
  title: string;
  schoolName: string;
  grade: string;
  examType: ExamType;
  examYear: string;
  semester: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export function defaultExamMeta(): ExamMetaValue {
  return {
    title: "",
    schoolName: "",
    grade: "",
    examType: "MIDTERM",
    examYear: String(CURRENT_YEAR),
    semester: "",
  };
}

/** 폼 값 → createExamAnalysis 입력. 빈 문자열은 undefined 로 정규화. */
export function metaToCreateInput(
  meta: ExamMetaValue,
  sourceType: ExamSourceType,
): CreateExamAnalysisInput {
  const year = meta.examYear.trim() ? Number(meta.examYear.trim()) : undefined;
  return {
    title: meta.title.trim(),
    schoolName: meta.schoolName.trim() || undefined,
    grade: meta.grade.trim() || undefined,
    examType: meta.examType,
    examYear: year != null && Number.isFinite(year) ? year : undefined,
    semester: meta.semester.trim() || undefined,
    sourceType,
  };
}

const NONE = "__none__";
const GRADE_OPTIONS = ["중1", "중2", "중3", "고1", "고2", "고3"];
const SEMESTER_OPTIONS = ["1학기", "2학기"];
const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: "MIDTERM", label: "중간고사" },
  { value: "FINAL", label: "기말고사" },
  { value: "MOCK", label: "모의고사" },
  { value: "OTHER", label: "기타" },
];

interface ExamMetaFormProps {
  value: ExamMetaValue;
  onChange: (next: ExamMetaValue) => void;
  disabled?: boolean;
}

export function ExamMetaForm({ value, onChange, disabled }: ExamMetaFormProps) {
  const set = (patch: Partial<ExamMetaValue>) => onChange({ ...value, ...patch });

  // 상세(선택) 접힘 상태 — 이어서 등록 프리필 등으로 이미 채워진 값이 있으면
  // 처음부터 펼쳐서 보여준다(연도는 항상 기본 채움이라 판정에서 제외).
  const [detailsOpen, setDetailsOpen] = useState<boolean>(() =>
    Boolean(
      value.schoolName.trim() || value.grade.trim() || value.semester.trim(),
    ),
  );
  const filledDetailCount = [value.schoolName, value.grade, value.semester].filter(
    (v) => v.trim().length > 0,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <Field label="시험 제목" required>
        <Input
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="예) 2026-1학기 중간고사 영어"
          disabled={disabled}
        />
      </Field>

      <Field label="시험 종류">
        <Select
          value={value.examType}
          onValueChange={(v) => set({ examType: v as ExamType })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXAM_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* 상세 정보(선택) 접이 토글 — 학교명/학년/연도/학기 */}
      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        aria-expanded={detailsOpen}
        className="inline-flex cursor-pointer items-center gap-1 self-start text-[11.5px] font-medium text-slate-500 transition-colors hover:text-blue-600"
      >
        <ChevronDown
          className={
            "size-3.5 transition-transform " + (detailsOpen ? "rotate-180" : "")
          }
          aria-hidden="true"
        />
        상세 정보 (선택)
        {!detailsOpen && filledDetailCount > 0 ? (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
            {filledDetailCount}
          </span>
        ) : null}
      </button>

      {detailsOpen ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="학교명">
            <Input
              value={value.schoolName}
              onChange={(e) => set({ schoolName: e.target.value })}
              placeholder="예) 한국중학교"
              disabled={disabled}
            />
          </Field>

          <Field label="학년">
            <Select
              value={value.grade || undefined}
              onValueChange={(v) => set({ grade: v === NONE ? "" : v })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="학년 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>선택 안 함</SelectItem>
                {GRADE_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="연도">
            <Input
              type="number"
              inputMode="numeric"
              value={value.examYear}
              onChange={(e) => set({ examYear: e.target.value })}
              placeholder={String(CURRENT_YEAR)}
              disabled={disabled}
            />
          </Field>

          <Field label="학기">
            <Select
              value={value.semester || undefined}
              onValueChange={(v) => set({ semester: v === NONE ? "" : v })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="학기 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>선택 안 함</SelectItem>
                {SEMESTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-slate-500">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
