"use client";

import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";
import { ChevronDown, ShoppingBasket, X } from "lucide-react";
import { type PassageItem } from "./generate-page-types";
import { isOverrideEmpty } from "./workspace/workspace-types";
import { type WorkspaceRowsApi } from "./workspace/use-workspace-rows";

// generate-page-client.tsx 의 모바일 하단 고정 장바구니 2종(스펙 §레인1 U6 carts).
// 코드는 generate-page-client.tsx 에서 바이트 동일 이동(무회귀) — 캡처만 프롭화.

// ── 워크스페이스 하단 고정 '담긴 유형' 장바구니 (모바일) ──
// 지문마다 유형을 담으면(모달 '유형 담기') 여기 모여, 펼치면 목록·빼기.
// 담긴 유형이 곧 일괄 생성 대상 — 바로 아래 '문제 생성' 버튼이 전부 생성한다.
export function WorkspaceCart({
  workspaceCartOpen,
  setWorkspaceCartOpen,
  workspacePending,
  workspaceApi,
  workspaceRowStats,
}: {
  workspaceCartOpen: boolean;
  setWorkspaceCartOpen: Dispatch<SetStateAction<boolean>>;
  workspacePending: { rows: number; questions: number };
  workspaceApi: WorkspaceRowsApi;
  workspaceRowStats: Map<string, { questions: number; creditCost: number }>;
}) {
  const workspaceConfiguredRows = workspaceApi.rows
    .map((row) => {
      const st = workspaceRowStats.get(row.localId);
      return {
        localId: row.localId,
        title: row.title,
        questions: st?.questions ?? 0,
      };
    })
    .filter((r) => r.questions > 0);
  const clearRowTypes = (localId: string) => {
    const row = workspaceApi.rows.find((r) => r.localId === localId);
    if (!row?.override) return;
    const next = { ...row.override, typeCounts: {} };
    workspaceApi.setOverride(localId, isOverrideEmpty(next) ? null : next);
  };
  return (
    <>
      {workspaceCartOpen && workspaceConfiguredRows.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {workspaceConfiguredRows.map((r, i) => (
              <div
                key={r.localId}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
              >
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {r.title?.trim() || "제목 없는 지문"}
                </span>
                <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-600">
                  {r.questions}문제
                </span>
                <button
                  type="button"
                  onClick={() => clearRowTypes(r.localId)}
                  aria-label="담은 유형 빼기"
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setWorkspaceCartOpen((open) => !open)}
        aria-expanded={workspaceCartOpen}
        aria-label={workspaceCartOpen ? "담긴 유형 목록 접기" : "담긴 유형 목록 펼치기"}
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {workspacePending.rows > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {workspacePending.rows}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 유형 {workspacePending.rows}지문
            {workspacePending.questions > 0
              ? ` · ${workspacePending.questions}문제`
              : ""}
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {workspacePending.rows > 0
              ? "탭하여 담긴 지문 유형 보기·빼기"
              : "지문마다 ‘유형 담기’로 담으면 여기 모여요"}
          </span>
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-slate-400 transition-transform" +
            (workspaceCartOpen ? " rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>
    </>
  );
}

// ── 내 지문함(library) 하단 고정 '담긴 지문'(선택한 지문) 장바구니 (모바일) ──
// 내 지문함에서 체크한 지문들이 여기 모여, 펼치면 목록·빼기. 바로 아래 '워크스페이스로'
// 버튼이 담긴 지문을 워크스페이스로 보낸다(워크스페이스 장바구니와 동형).
export function LibraryCart({
  libraryCartOpen,
  setLibraryCartOpen,
  librarySelectedPassages,
  toggleCheckbox,
}: {
  libraryCartOpen: boolean;
  setLibraryCartOpen: Dispatch<SetStateAction<boolean>>;
  librarySelectedPassages: PassageItem[];
  toggleCheckbox: (id: string, e?: ReactMouseEvent) => void;
}) {
  return (
    <>
      {libraryCartOpen && librarySelectedPassages.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {librarySelectedPassages.map((p, i) => (
              <div
                key={p.id}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
              >
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {p.title?.trim() || "제목 없는 지문"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCheckbox(p.id)}
                  aria-label="선택에서 빼기"
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setLibraryCartOpen((open) => !open)}
        aria-expanded={libraryCartOpen}
        aria-label={libraryCartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"}
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {librarySelectedPassages.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {librarySelectedPassages.length}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 지문 {librarySelectedPassages.length}개
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {librarySelectedPassages.length > 0
              ? "탭하여 담긴 지문 보기·빼기"
              : "지문 카드를 선택하면 여기 모여요"}
          </span>
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-slate-400 transition-transform" +
            (libraryCartOpen ? " rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>
    </>
  );
}
