"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { publishTutorProgramAction } from "@/actions/tutor";
import { datetimeLocalToIso } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TargetOption = {
  id: string;
  label: string;
  count?: number;
  meta?: string | null;
};

type TargetType = "CLASS" | "STUDENT";

const targetLabels: Record<TargetType, string> = {
  CLASS: "클래스",
  STUDENT: "개별 학생",
};

export function TutorPublishForm({
  programId,
  disabled,
  activeStudentCount,
  classes,
  students,
}: {
  programId: string;
  disabled: boolean;
  activeStudentCount: number;
  classes: TargetOption[];
  students: TargetOption[];
}) {
  const router = useRouter();
  const [targetType, setTargetType] = useState<TargetType>("CLASS");
  const [targetId, setTargetId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = useMemo(() => {
    return targetType === "CLASS" ? classes : students;
  }, [classes, students, targetType]);

  const canSubmit =
    !disabled &&
    !isPending &&
    activeStudentCount > 0 &&
    Boolean(targetId);

  function submit() {
    const formData = new FormData();
    formData.set("programId", programId);
    formData.set("targetType", targetType);
    if (targetId) formData.set("targetId", targetId);
    // 벽시계 → 절대시각(UTC ISO). 서버 타임존과 무관하게 마감시각 저장.
    if (dueAt) formData.set("dueAt", datetimeLocalToIso(dueAt) ?? dueAt);

    setMessage(null);
    startTransition(async () => {
      const result = await publishTutorProgramAction(formData);
      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "ok", text: "배포가 완료됐어요." });
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950">학생 앱 배포</p>
          <p className="mt-1 text-xs text-slate-500">클래스 전체 또는 특정 학생 1명에게 바로 열어줄 수 있습니다.</p>
        </div>
        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
          {activeStudentCount}명
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {activeStudentCount === 0 && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm text-slate-700">
            <p className="font-bold text-slate-950">배포할 활성 학생이 아직 없어요.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              학생을 먼저 추가하고 반에 배정하면 이 화면에서 바로 배포할 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-lg border-blue-200 bg-white text-blue-700 hover:bg-blue-50">
                <Link href="/director/students">학생 관리로 이동</Link>
              </Button>
            </div>
          </div>
        )}

        <label className="grid gap-1.5 text-xs font-bold text-slate-600">
          배포 대상
          <select
            data-testid="tutor-publish-target-type"
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as TargetType);
              setTargetId("");
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100"
          >
            {Object.entries(targetLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-bold text-slate-600">
          세부 대상
          <select
            data-testid="tutor-publish-target-id"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{targetType === "CLASS" ? "클래스를 선택하세요" : "학생을 선택하세요"}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {typeof option.count === "number" ? ` · ${option.count}명` : ""}
                {option.meta ? ` · ${option.meta}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-bold text-slate-600">
          마감일
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {message && (
          <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${message.type === "ok" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-600"}`}>
            {message.text}
          </p>
        )}

        <Button
          data-testid="tutor-publish-submit"
          onClick={submit}
          disabled={!canSubmit}
          className="h-11 rounded-xl bg-blue-600 font-bold hover:bg-blue-700"
        >
          {isPending ? "배포 중" : "배포하기"}
        </Button>
      </div>
    </div>
  );
}
