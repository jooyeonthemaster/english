"use client";

// ============================================================================
// 과제 컴포저 — 인-컴포저 문제 피커 ("문제도 폴더로" — 유저 확정)
//
// preset 없이 QUESTIONS 종류를 고르면 이 피커로 문제 뱅크를 폴더 단위로
// 탐색해 문항을 다중 선택한다(문제 뱅크 경유 preset 은 기존처럼 고정 잠금).
// 데이터는 listAssignableQuestions 1회 스냅샷(최신 400) — 폴더/검색/선택만
// 보기는 전부 클라이언트 필터. 상한 50문항은 서버 계약과 동일(이중 방어).
// 폴더 탐색 문법(브레드크럼·폴더 행)은 콘텐츠 피커와 동일 조각을 재사용한다.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  listAssignableQuestions,
  type AssignableQuestionPickerData,
  type AssignableQuestionRow,
} from "@/actions/study-assignments";
import {
  SUBTYPE_LABELS,
  TYPE_LABELS,
} from "@/components/workbench/question-card-constants";
import { cn } from "@/lib/utils";
import {
  PickerBreadcrumb,
  PickerFolderRows,
  folderChildren,
  folderDirectCounts,
} from "./composer-picker-folders";

/** 서버 계약(createStudyAssignment)과 동일한 문제 세트 배포 상한 */
const MAX_QUESTION_SELECT = 50;

/** 난이도 표기 — 텍스트 메타 전용(색 배지 아님, 주황/앰버 금지 계약) */
const DIFF_LABEL: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

function rowTypeLabel(row: AssignableQuestionRow): string {
  return (
    (row.subType ? SUBTYPE_LABELS[row.subType] : undefined) ??
    TYPE_LABELS[row.type] ??
    row.type
  );
}

export function ComposerQuestionPicker({
  selectedIds,
  onChange,
}: {
  /** 선택 순서 유지 배열 — payload.questionIds 스냅샷이 이 순서로 저장된다 */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [data, setData] = useState<AssignableQuestionPickerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedOnly, setSelectedOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listAssignableQuestions()
      .then((res) => {
        if (alive) setData(res.success ? (res.data ?? null) : { rows: [], folders: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const folders = data?.folders ?? [];
  const allRows = useMemo(() => data?.rows ?? [], [data]);

  const searching = query.trim().length > 0;
  // 선택만 보기 = 폴더 무시하고 "내가 고른 것들" 전체(검색은 그 안에서 동작)
  const rows = useMemo(() => {
    let base = selectedOnly
      ? allRows.filter((r) => selectedSet.has(r.id))
      : searching || !folderId
        ? allRows
        : allRows.filter((r) => r.folderIds.includes(folderId));
    if (searching) {
      const q = query.trim().toLowerCase();
      base = base.filter(
        (r) =>
          r.snippet.toLowerCase().includes(q) ||
          (r.passageTitle ?? "").toLowerCase().includes(q) ||
          rowTypeLabel(r).toLowerCase().includes(q),
      );
    }
    return base;
  }, [allRows, selectedOnly, selectedSet, searching, query, folderId]);

  const counts = useMemo(() => folderDirectCounts(allRows), [allRows]);
  const childFolders = useMemo(
    () => (searching || selectedOnly ? [] : folderChildren(folders, folderId)),
    [folders, folderId, searching, selectedOnly],
  );

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((v) => v !== id));
      return;
    }
    if (selectedIds.length >= MAX_QUESTION_SELECT) {
      toast.error(`과제 배포는 한 번에 최대 ${MAX_QUESTION_SELECT}문항까지 선택할 수 있습니다.`);
      return;
    }
    onChange([...selectedIds, id]);
  };

  // 현재 목록 전체 선택/해제 — 검색·폴더·선택만 보기가 적용된 화면 목록 기준
  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedSet.has(r.id));
  const toggleAllVisible = () => {
    if (rows.length === 0) return;
    if (allVisibleSelected) {
      const visible = new Set(rows.map((r) => r.id));
      onChange(selectedIds.filter((id) => !visible.has(id)));
      return;
    }
    const additions = rows.filter((r) => !selectedSet.has(r.id)).map((r) => r.id);
    const room = MAX_QUESTION_SELECT - selectedIds.length;
    if (additions.length > room) {
      toast.error(
        `최대 ${MAX_QUESTION_SELECT}문항까지 선택할 수 있어 ${Math.max(room, 0)}문항만 추가했습니다.`,
      );
    }
    if (room <= 0) return;
    onChange([...selectedIds, ...additions.slice(0, room)]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-slate-500">
          선택{" "}
          <span className="font-bold text-blue-600 tabular-nums">{selectedIds.length}</span>
          문항
          <span className="font-normal text-slate-400"> / 최대 {MAX_QUESTION_SELECT}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={selectedOnly}
            onClick={() => setSelectedOnly((v) => !v)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
              selectedOnly
                ? "border-blue-600 bg-blue-50/40 text-blue-700"
                : "border-slate-200 bg-white text-slate-400 hover:text-slate-600",
            )}
          >
            선택만 보기
          </button>
          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={rows.length === 0}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-40"
          >
            {allVisibleSelected ? "전체 해제" : "전체 선택"}
          </button>
        </div>
      </div>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="문제 검색 — 폴더 무관 전체에서 찾습니다"
          className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
        />
      </div>
      <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="flex flex-col gap-1.5 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : (
          <>
            {!searching && !selectedOnly && folderId ? (
              <PickerBreadcrumb
                folders={folders}
                currentId={folderId}
                onNavigate={setFolderId}
              />
            ) : null}
            <PickerFolderRows
              folders={childFolders}
              currentId={folderId}
              counts={counts}
              allFolders={folders}
              onEnter={setFolderId}
              unitLabel="문항"
            />
            {rows.length === 0 ? (
              <p className="p-5 text-center text-[12.5px] text-slate-400">
                {selectedOnly
                  ? "선택한 문항이 없습니다."
                  : searching
                    ? "검색 결과가 없습니다."
                    : folderId
                      ? "이 폴더에 문제가 없습니다."
                      : "배포할 수 있는 문제가 없습니다. 문제 뱅크에서 먼저 만들어 주세요."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {rows.map((r) => {
                  const checked = selectedSet.has(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle(r.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300",
                          checked ? "bg-blue-50/50" : "hover:bg-slate-50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            checked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white",
                          )}
                          aria-hidden
                        >
                          {checked ? (
                            <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-white stroke-[1.8]">
                              <path d="M1.5 5.2 4 7.5 8.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-[12.5px] font-medium text-slate-800">
                            {r.snippet || "(문두 없음)"}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {rowTypeLabel(r)}
                            {DIFF_LABEL[r.difficulty] ? ` · ${DIFF_LABEL[r.difficulty]}` : ""}
                            {r.passageTitle ? ` · ${r.passageTitle}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
