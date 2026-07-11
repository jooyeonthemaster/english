"use client";

// 과제 컴포저 — 콘텐츠 피커(시험지/학습지 목록에서 선택).
// preset 없이 열렸을 때 kind 에 맞는 목록을 지연 로드한다.
// 폴더 브라우저 내장: 루트("전체")→폴더 행 진입→브레드크럼 복귀.
// 검색 중에는 폴더를 무시하고 전체에서 찾는다(폴더는 탐색 축, 검색은 지름길).

import { useEffect, useMemo, useState } from "react";
import { Check, Info, Search } from "lucide-react";
import {
  listAssignableExams,
  listAssignableWorksheets,
  type AssignableExamPickerData,
  type AssignableWorksheetPickerData,
} from "@/actions/study-assignments";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  PickerBreadcrumb,
  PickerFolderRows,
  folderChildren,
  folderDirectCounts,
} from "./composer-picker-folders";

export interface PickedContent {
  refId: string;
  title: string;
  meta: string;
  /// 원본 상태(Exam.status / PassageReport.status). preset 경유 시 없을 수 있어 optional.
  status?: string;
  /// ISO 문자열. preset 경유 시 없을 수 있어 optional.
  updatedAt?: string;
}

// 상태 필 — DRAFT/PUBLISHED 만 정의(그 외 상태는 필 미표시).
const STATUS_PILL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "초안", className: "border-slate-200 bg-slate-50 text-slate-500" },
  PUBLISHED: { label: "게시", className: "border-blue-200 bg-blue-50 text-blue-700" },
};

interface PickerRow extends PickedContent {
  folderIds: string[];
}

export function ComposerContentPicker({
  kind,
  picked,
  onPick,
}: {
  kind: "EXAM" | "WORKSHEET";
  picked: PickedContent | null;
  onPick: (content: PickedContent) => void;
}) {
  const [examData, setExamData] = useState<AssignableExamPickerData | null>(null);
  const [worksheetData, setWorksheetData] =
    useState<AssignableWorksheetPickerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      if (kind === "EXAM" && examData === null) {
        const res = await listAssignableExams();
        if (alive) setExamData(res.success ? (res.data ?? null) : { rows: [], folders: [] });
      } else if (kind === "WORKSHEET" && worksheetData === null) {
        const res = await listAssignableWorksheets();
        if (alive)
          setWorksheetData(res.success ? (res.data ?? null) : { rows: [], folders: [] });
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // 종류 전환 시 탐색 상태 초기화 — 시험지 폴더와 학습지 폴더는 서로 다른 트리
  useEffect(() => {
    setFolderId(null);
    setQuery("");
  }, [kind]);

  const folders = useMemo(
    () => (kind === "EXAM" ? (examData?.folders ?? []) : (worksheetData?.folders ?? [])),
    [kind, examData, worksheetData],
  );

  const allRows = useMemo<PickerRow[]>(() => {
    if (kind === "EXAM") {
      return (examData?.rows ?? []).map((e) => ({
        refId: e.id,
        title: e.title,
        meta: `${e.questionCount}문항 · ${e.totalPoints}점 만점`,
        status: e.status,
        updatedAt: e.updatedAt,
        folderIds: e.folderIds,
      }));
    }
    return (worksheetData?.rows ?? []).map((w) => ({
      refId: w.id,
      title: w.title,
      meta: w.passageTitle,
      status: w.status,
      updatedAt: w.updatedAt,
      folderIds: w.folderIds,
    }));
  }, [kind, examData, worksheetData]);

  const searching = query.trim().length > 0;
  const rows = useMemo<PickerRow[]>(() => {
    if (searching) {
      const q = query.trim().toLowerCase();
      return allRows.filter(
        (r) => r.title.toLowerCase().includes(q) || r.meta.toLowerCase().includes(q),
      );
    }
    if (folderId) return allRows.filter((r) => r.folderIds.includes(folderId));
    return allRows;
  }, [allRows, searching, query, folderId]);

  const counts = useMemo(() => folderDirectCounts(allRows), [allRows]);
  const childFolders = useMemo(
    () => (searching ? [] : folderChildren(folders, folderId)),
    [folders, folderId, searching],
  );

  const noun = kind === "EXAM" ? "시험지" : "학습지";

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${noun} 검색 — 폴더 무관 전체에서 찾습니다`}
          className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
        />
      </div>
      <div className="relative">
        <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {loading ? (
            <div className="flex flex-col gap-1.5 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : (
            <>
              {!searching && folderId ? (
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
                unitLabel="개"
              />
              {rows.length === 0 ? (
                <p className="p-5 text-center text-[12.5px] text-slate-400">
                  {searching
                    ? "검색 결과가 없습니다."
                    : folderId
                      ? `이 폴더에 ${noun}가 없습니다.`
                      : kind === "EXAM"
                        ? "배포할 수 있는 시험지가 없습니다. 시험지 생성에서 먼저 만들어 주세요."
                        : "배포할 수 있는 학습지가 없습니다. 학습지 생성에서 먼저 만들어 주세요."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {rows.map((r) => {
                    const active = picked?.refId === r.refId;
                    const pill = r.status ? STATUS_PILL[r.status] : undefined;
                    return (
                      <li key={r.refId}>
                        <button
                          type="button"
                          onClick={() => onPick(r)}
                          className={cn(
                            // 좌측 3px 키라인은 항상 자리 확보(투명) — 선택 시 파랑으로 점등해
                            // hover(bg-slate-50)와 확실히 구분한다.
                            "flex w-full items-center gap-2 border-l-[3px] px-3 py-2 pr-2.5 text-left transition-colors",
                            active
                              ? "border-blue-600 bg-blue-50/60"
                              : "border-transparent hover:bg-slate-50",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span
                              className={cn(
                                "truncate text-[13px]",
                                active
                                  ? "font-semibold text-blue-700"
                                  : "font-medium text-slate-800",
                              )}
                            >
                              {r.title}
                            </span>
                            <span className="truncate text-[11px] text-slate-400">{r.meta}</span>
                          </span>
                          {/* 우측 메타 — 상태 필 + 수정 상대시각 2단 스택(행 2줄 밀도 유지) */}
                          {pill || r.updatedAt ? (
                            <span className="flex shrink-0 flex-col items-end gap-0.5">
                              {pill ? (
                                <span
                                  className={cn(
                                    "rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                    pill.className,
                                  )}
                                >
                                  {pill.label}
                                </span>
                              ) : null}
                              {r.updatedAt ? (
                                <span className="whitespace-nowrap text-[10.5px] text-slate-400">
                                  {formatRelativeTime(r.updatedAt)} 수정
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {active ? (
                            <Check className="size-3.5 shrink-0 text-blue-600" aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
        {/* 하단 절단 행을 페이드로 처리 — 스크롤 가능함을 암시 */}
        {!loading && rows.length + childFolders.length > 6 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-px bottom-px h-6 rounded-b-[7px] bg-gradient-to-t from-white to-transparent"
          />
        ) : null}
      </div>
      {/* DRAFT 선택 경고 — slate 주의 톤(rose 아님). 배포 판단 지점의 확인 유도. */}
      {picked?.status === "DRAFT" ? (
        <p className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-500">
          <Info className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <span>
            초안 상태의 {noun}입니다 — 배포 전 완성 여부를 확인해 주세요.
          </span>
        </p>
      ) : null}
    </div>
  );
}
