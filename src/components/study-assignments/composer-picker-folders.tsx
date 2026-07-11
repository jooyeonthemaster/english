"use client";

// ============================================================================
// 컴포저 피커 공용 — 폴더 브라우저 조각
//
// 시험지/학습지/문제 피커가 같은 폴더 탐색 문법을 쓴다: 루트("전체")에서
// 시작해 폴더 행을 눌러 한 단계씩 들어가고, 브레드크럼으로 되돌아온다.
// 데이터는 AssignableFolder(플랫 parentId 트리) + 행별 folderIds 직접
// 멤버십 — 계산(경로·자식·카운트)은 전부 여기 헬퍼로 모은다.
// ============================================================================

import { ChevronRight, CornerLeftUp, Folder } from "lucide-react";
import type { AssignableFolder } from "@/actions/study-assignments";
import { cn } from "@/lib/utils";

/** 루트→현재 폴더 경로(현재 포함). id=null 이면 빈 배열(루트). */
export function folderPath(
  folders: AssignableFolder[],
  id: string | null,
): AssignableFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: AssignableFolder[] = [];
  let cur = id ? byId.get(id) : undefined;
  let guard = 0;
  while (cur && guard++ < 20) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** 현재 폴더의 직속 하위 폴더 목록 */
export function folderChildren(
  folders: AssignableFolder[],
  id: string | null,
): AssignableFolder[] {
  return folders.filter((f) => f.parentId === (id ?? null));
}

/** 폴더별 직접 소속 개수 — 행 folderIds 기반(피커에 실린 것만 셈) */
export function folderDirectCounts(rows: { folderIds: string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const fid of row.folderIds) {
      counts.set(fid, (counts.get(fid) ?? 0) + 1);
    }
  }
  return counts;
}

/** 브레드크럼 바 — 폴더 안에 있을 때만 렌더(루트에선 null 반환 권장) */
export function PickerBreadcrumb({
  folders,
  currentId,
  onNavigate,
  rootLabel = "전체",
}: {
  folders: AssignableFolder[];
  currentId: string;
  onNavigate: (id: string | null) => void;
  rootLabel?: string;
}) {
  const path = folderPath(folders, currentId);
  const parentId = path.length > 1 ? path[path.length - 2].id : null;
  return (
    <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => onNavigate(parentId)}
        title="상위 폴더로"
        className="flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-600"
      >
        <CornerLeftUp className="size-3.5" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[11.5px]">
        <button
          type="button"
          onClick={() => onNavigate(null)}
          className="shrink-0 rounded px-1 py-0.5 font-medium text-slate-400 transition-colors hover:bg-white hover:text-blue-600"
        >
          {rootLabel}
        </button>
        {path.map((f, i) => (
          <span key={f.id} className="flex shrink-0 items-center gap-0.5">
            <ChevronRight className="size-3 text-slate-300" aria-hidden />
            <button
              type="button"
              onClick={() => onNavigate(f.id)}
              className={cn(
                "rounded px-1 py-0.5 transition-colors",
                i === path.length - 1
                  ? "font-semibold text-slate-700"
                  : "font-medium text-slate-400 hover:bg-white hover:text-blue-600",
              )}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 폴더 행 목록 — 아이템 행과 같은 스크롤 컨테이너 상단에 얹는다 */
export function PickerFolderRows({
  folders,
  currentId,
  counts,
  allFolders,
  onEnter,
  unitLabel,
}: {
  /** 현재 폴더의 직속 하위 폴더(folderChildren 결과) */
  folders: AssignableFolder[];
  currentId: string | null;
  counts: Map<string, number>;
  /** 전체 폴더(하위 폴더 수 계산용) */
  allFolders: AssignableFolder[];
  onEnter: (id: string) => void;
  /** 개수 단위 라벨 — "개"/"문항" 등 */
  unitLabel: string;
}) {
  if (folders.length === 0) return null;
  return (
    <ul className={cn("divide-y divide-slate-50", currentId && "border-b border-slate-100")}>
      {folders.map((f) => {
        const direct = counts.get(f.id) ?? 0;
        const childCount = allFolders.filter((c) => c.parentId === f.id).length;
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onEnter(f.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50/40"
            >
              <Folder className="size-4 shrink-0 fill-blue-100 text-blue-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">
                {f.name}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                {direct > 0 ? `${direct}${unitLabel}` : childCount > 0 ? `폴더 ${childCount}` : ""}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
