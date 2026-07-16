"use client";

// ============================================================================
// 분석 필드 인라인 편집기 — textarea 로 표시하다가 blur 시 값이 바뀌었으면 commit.
// 저장 자체(updateAnalysisEdits version CAS)는 상위(analysis-step)가 담당하고,
// 이 컴포넌트는 로컬 편집 상태 + blur 커밋만 책임진다.
// ============================================================================

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface EditableAnalysisFieldProps {
  label: string;
  value: string;
  /** blur 시 값이 바뀌었을 때만 호출. */
  onCommit: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minRows?: number;
}

export function EditableAnalysisField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  minRows = 2,
}: EditableAnalysisFieldProps) {
  const [draft, setDraft] = useState(value);
  // syncedValue = 마지막으로 확정(외부 반영 또는 커밋)된 기준값. draft 와의 비교로
  // 중복 커밋을 막는다. 외부 value 가 바뀌면 렌더 중 파생 상태를 재동기화한다
  // (effect 없이 — cascading render 회피).
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  const commit = () => {
    const next = draft.trim();
    if (next === syncedValue.trim()) return;
    setSyncedValue(next);
    onCommit(next);
  };

  return (
    <div>
      {/* 섹션 라벨 — 워크벤치 공통 eyebrow(uppercase tracking) 규약 */}
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        disabled={disabled}
        placeholder={placeholder}
        rows={minRows}
        className="min-h-0 resize-y border-slate-200 bg-white text-sm leading-relaxed text-slate-700 focus-visible:ring-blue-500/40"
      />
    </div>
  );
}

interface ReadonlyFieldProps {
  label: string;
  value: string;
}

/** 편집 불가(표시 전용) 필드 — 값이 비면 렌더하지 않는다. */
export function ReadonlyField({ label, value }: ReadonlyFieldProps) {
  if (!value.trim()) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}
