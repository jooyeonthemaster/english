"use client";

// ============================================================================
// C1 보조 — 배포 다이얼로그 「배포할 클래스 선택」 단계 (스펙 §3.7.3)
//
// deploy-dialog.tsx 전용 분할 파일. classId=null 로 열린 경우(워크벤치 도크 —
// 전체 자료에서 발사한 항목)에만 다이얼로그 서두에 렌더된다. 클래스 1개 선택
// → 기존 플로우 진입. 선택 후에는 요약 행 + 「변경」으로 접힌다.
// ============================================================================

import { Folder } from "lucide-react";

/**
 * 선택 단계에 표시할 클래스 옵션 — `StudioClassRow`(actions/studio/classes) 가
 * 구조적으로 그대로 대입 가능하다(id·name·studentCount 포함).
 */
export interface StudioDeployClassOption {
  id: string;
  name: string;
  /** 있으면 행 우측에 "학생 N명" 보조 표기 */
  studentCount?: number;
}

export function DeployClassStep({
  classes,
  pickedClassId,
  onPick,
  onReset,
}: {
  classes: StudioDeployClassOption[];
  pickedClassId: string | null;
  onPick: (id: string) => void;
  onReset: () => void;
}) {
  const picked =
    pickedClassId !== null
      ? (classes.find((c) => c.id === pickedClassId) ?? null)
      : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 fill-blue-100 text-blue-400" />
          <span className="text-[13px] font-bold text-slate-900">
            배포할 클래스 선택
          </span>
        </div>
        {picked && (
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
          >
            변경
          </button>
        )}
      </div>
      {picked ? (
        <p className="mt-3 flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
          <span className="truncate text-[13px] font-semibold text-slate-800">
            {picked.name}
          </span>
          {typeof picked.studentCount === "number" && (
            <span className="ml-auto shrink-0 text-[11px] text-slate-400">
              학생 {picked.studentCount}명
            </span>
          )}
        </p>
      ) : classes.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-500 break-keep">
          배포할 클래스가 없습니다 — 먼저 클래스를 만들어 주세요
        </p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {classes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id)}
                className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <Folder className="h-4 w-4 shrink-0 fill-blue-100 text-blue-400" />
                <span className="truncate text-[13px] text-slate-800">
                  {c.name}
                </span>
                {typeof c.studentCount === "number" && (
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                    학생 {c.studentCount}명
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
