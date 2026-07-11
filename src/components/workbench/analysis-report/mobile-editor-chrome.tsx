import type * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { NUMBERED_SECTION_LABELS } from "@/lib/passage-report/analysis-report/schema";

import type { ItemDescriptor } from "./report-pages";

/**
 * 학습지(분석리포트) 편집기의 모바일(<lg) 전용 크롬.
 * 데스크톱의 3패널(팔레트·페이지 레일·우측 편집 패널)과 인라인 contentEditable·
 * 호버 정밀 컨트롤은 축소된 A4 위 터치로는 조작 불가능해 모바일에선 전부 숨기고,
 * 대신 시험지 생성와 동일한 문법을 쓴다:
 *  - 블록 탭 → 하단 컨텍스트 바(위로/아래로/상세 편집/삭제)
 *  - '학습지 설정'/'상세 편집' → 우측 패널(PropertiesPanel)을 풀스크린 시트로
 */

/** 컨텍스트 바 헤더에 보여줄 블록 이름. */
export function mobileBlockLabel(item: ItemDescriptor): string {
  if (item.kind === "cover") return "표지";
  if (item.kind === "title") return "문서 제목";
  if (item.kind === "custom") return "추가한 블록";
  const label = (NUMBERED_SECTION_LABELS as Record<string, string>)[item.kind];
  return label ?? "블록";
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 transition-colors disabled:opacity-35",
        danger ? "text-rose-600 active:bg-rose-50" : "text-slate-600 active:bg-slate-100",
      )}
    >
      {icon}
      <span className="whitespace-nowrap text-[10px] font-bold leading-none">{label}</span>
    </button>
  );
}

export function MobileReportActionBar({
  active,
  canMove,
  onMoveUp,
  onMoveDown,
  onOpenDetail,
  onDelete,
  onDeselect,
  onOpenSettings,
}: {
  active: ItemDescriptor | null;
  /** 블록이 정렬 목록에 있어 위/아래 이동이 가능한지 (표지 등은 불가). */
  canMove: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenDetail: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  onOpenSettings: () => void;
}) {
  if (!active) {
    return (
      <div className="no-print shrink-0 border-t border-slate-200 bg-white p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-[13.5px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Settings2 className="size-4 text-slate-500" aria-hidden="true" />
          학습지 설정 (표지·로고·디자인)
        </button>
        <p className="mt-1.5 text-center text-[10.5px] font-semibold text-slate-400">
          블록을 탭하면 이동·수정·삭제 메뉴가 열려요
        </p>
      </div>
    );
  }

  return (
    <div className="no-print shrink-0 border-t border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1">
        <span className="truncate text-[11px] font-bold text-slate-500">
          {mobileBlockLabel(active)} 선택됨
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label="블록 선택 해제"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-stretch gap-0.5 overflow-x-auto px-1.5 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
        <BarButton
          icon={<ArrowUp className="size-[18px]" aria-hidden="true" />}
          label="위로"
          onClick={onMoveUp}
          disabled={!canMove}
        />
        <BarButton
          icon={<ArrowDown className="size-[18px]" aria-hidden="true" />}
          label="아래로"
          onClick={onMoveDown}
          disabled={!canMove}
        />
        <BarButton
          icon={<SlidersHorizontal className="size-[18px]" aria-hidden="true" />}
          label="상세 편집"
          onClick={onOpenDetail}
        />
        <BarButton
          icon={<Trash2 className="size-[18px]" aria-hidden="true" />}
          label="삭제"
          danger
          onClick={onDelete}
          disabled={active.kind === "cover"}
        />
      </div>
    </div>
  );
}

/** 우측 편집 패널(PropertiesPanel)을 모바일에서 담는 풀스크린 시트. */
export function MobilePanelSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className="no-print fixed inset-0 z-[80] flex flex-col bg-slate-50 lg:hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-[15px] font-black text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-blue-600 bg-blue-600 text-[13.5px] font-extrabold text-white transition-colors hover:bg-blue-700"
        >
          완료 (미리보기로)
        </button>
      </footer>
    </div>,
    document.body,
  );
}
