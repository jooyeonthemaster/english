"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Database, FolderOpen, Search, UploadCloud } from "lucide-react";

type Variant = "no-drafts" | "empty-folder" | "no-search-results";

interface EmptyGridStateProps {
  variant: Variant;
  onResetFilters?: () => void;
  /** Only used by the "empty-folder" variant. When provided, the empty area
   *  becomes a drop target so users can drag draft cards from the preview
   *  drawer (or anywhere else) and drop them into the current folder. */
  onDropDrafts?: (itemId: string | string[], copy: boolean) => void;
}

const DRAG_TYPE = "draft" as const;
const BULK_DRAG_TYPE = "draft-bulk" as const;

export function EmptyGridState({
  variant,
  onResetFilters,
  onDropDrafts,
}: EmptyGridStateProps) {
  const router = useRouter();

  if (variant === "no-drafts") {
    return (
      <Shell tone="blue">
        <IconCircle tone="blue">
          <Database className="size-7" aria-hidden="true" />
        </IconCircle>
        <Title>아직 추출된 자료가 없습니다</Title>
        <Sub>자료 추출 페이지에서 PDF/이미지/텍스트로 새 작업을 시작하세요.</Sub>
        <button
          type="button"
          onClick={() => router.push("/director/workbench/passages/import")}
          className="mt-5 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-4 text-xs font-bold text-white shadow-sm motion-safe:transition-colors motion-safe:duration-200 hover:bg-blue-700"
        >
          <UploadCloud className="size-3.5" />
          자료 추출하러 가기
        </button>
      </Shell>
    );
  }

  if (variant === "empty-folder") {
    return (
      <EmptyFolderShell onDropDrafts={onDropDrafts}>
        <IconCircle tone="slate">
          <FolderOpen className="size-7" aria-hidden="true" />
        </IconCircle>
        <Title>이 폴더에 아직 자료가 없습니다</Title>
        <Sub>
          전체 자료에서 카드를 드래그하거나, 다중 선택 후 폴더로 이동할 수
          있습니다.
        </Sub>
      </EmptyFolderShell>
    );
  }

  return (
    <Shell tone="slate">
      <IconCircle tone="slate">
        <Search className="size-7" aria-hidden="true" />
      </IconCircle>
      <Title>검색 결과가 없습니다</Title>
      <Sub>검색어나 필터를 조정해 보세요.</Sub>
      {onResetFilters ? (
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-5 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm motion-safe:transition-colors motion-safe:duration-200 hover:bg-slate-50"
        >
          필터 초기화
        </button>
      ) : null}
    </Shell>
  );
}

function EmptyFolderShell({
  children,
  onDropDrafts,
}: {
  children: ReactNode;
  onDropDrafts?: (itemId: string | string[], copy: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onDropDrafts) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) =>
        source.data.type === DRAG_TYPE || source.data.type === BULK_DRAG_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId =
          source.data.type === BULK_DRAG_TYPE
            ? (source.data.draftIds as string[])
            : (source.data.draftId as string);
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onDropDrafts(itemId, isCopy);
      },
    });
  }, [onDropDrafts]);

  const dropClass = isDragOver
    ? "border-blue-400 bg-blue-50/60 ring-2 ring-blue-200/70"
    : "border-slate-200 bg-white";

  return (
    <div
      ref={ref}
      className={`flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center motion-safe:transition-colors ${dropClass} bg-[radial-gradient(ellipse_at_top,_rgba(100,116,139,0.05)_0%,_transparent_60%)]`}
    >
      {children}
    </div>
  );
}

function Shell({ children, tone }: { children: ReactNode; tone: "blue" | "slate" }) {
  const bg =
    tone === "blue"
      ? "bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.06)_0%,_transparent_60%)]"
      : "bg-[radial-gradient(ellipse_at_top,_rgba(100,116,139,0.05)_0%,_transparent_60%)]";
  return (
    <div
      className={`flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center ${bg}`}
    >
      {children}
    </div>
  );
}

function IconCircle({ children, tone }: { children: ReactNode; tone: "blue" | "slate" }) {
  const cls =
    tone === "blue"
      ? "bg-blue-50 text-blue-500 ring-1 ring-blue-100"
      : "bg-slate-100 text-slate-400 ring-1 ring-slate-200";
  return (
    <div className={`mb-4 flex size-14 items-center justify-center rounded-full ${cls}`}>
      {children}
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <p className="text-base font-bold text-slate-800">{children}</p>;
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 max-w-md text-sm text-slate-500">{children}</p>;
}
