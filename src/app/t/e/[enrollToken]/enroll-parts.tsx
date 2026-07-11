// ============================================================================
// 공유 QR 자기등록 — 로스터 파싱 헬퍼 + 프레젠테이션 소형 컴포넌트 (E2 부속)
//
// enroll-client.tsx 가 임포트하는 순수 유틸/뷰. 정답·점수 축은 여기에 없다.
// ============================================================================

import { ArrowRight, Check, UserRound } from "lucide-react";

export interface RosterStudent {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

/** 문자열/숫자 값을 표시용 문자열로 정규화(빈 값·기타 타입은 null) */
function toDisplayText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** roster 응답을 관대하게 파싱 — 배열 직접 또는 {students|roster|results} 래핑 */
export function parseRoster(data: unknown): RosterStudent[] {
  let arr: unknown[] = [];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidate = obj.students ?? obj.roster ?? obj.results;
    if (Array.isArray(candidate)) arr = candidate;
  }

  const out: RosterStudent[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const name = toDisplayText(row.name);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      grade: toDisplayText(row.grade),
      school: toDisplayText(row.school ?? row.schoolName),
    });
  }
  return out;
}

// ── 프레젠테이션 소형 컴포넌트 ───────────────────────────────────────────────

export function StepHeading({
  id,
  index,
  label,
}: {
  id: string;
  index: number;
  label: string;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white tabular-nums">
        {index}
      </span>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
    </h2>
  );
}

export function SubMeta({
  grade,
  school,
}: {
  grade: string | null;
  school: string | null;
}) {
  const parts = [grade, school].filter((v): v is string => Boolean(v));
  if (parts.length === 0) return null;
  return (
    <span className="mt-0.5 block truncate text-xs text-slate-400">
      {parts.join(" · ")}
    </span>
  );
}

export function RosterRow({
  student,
  onSelect,
}: {
  student: RosterStudent;
  onSelect: (student: RosterStudent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(student)}
      className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-blue-50/60 active:bg-blue-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <UserRound className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">
          {student.name}
        </span>
        <SubMeta grade={student.grade} school={student.school} />
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
    </button>
  );
}

export function SelectedChip({
  student,
  onChange,
}: {
  student: RosterStudent;
  onChange: () => void;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <Check className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">
          {student.name} 학생
        </span>
        <SubMeta grade={student.grade} school={student.school} />
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
      >
        변경
      </button>
    </div>
  );
}
