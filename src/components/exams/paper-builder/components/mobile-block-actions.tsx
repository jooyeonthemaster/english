import type * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Group,
  Lock,
  Pencil,
  Trash2,
  Ungroup,
  X,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { normalizeEditableText } from "./editable-text";
import type { PaperItem } from "../types";
import {
  isSourcePassageForcedForItem,
  shouldRenderSourcePassageForItem,
} from "../paper-item-utils";

/**
 * 모바일(<lg) 시험지 미리보기의 블록 편집 UI.
 * 데스크톱의 블록 좌측 액션 레일·캐럿 추종 서식 툴바는 50% 축소 화면에서 터치로 조작이
 * 불가능해 모바일에선 숨기고, 대신 블록을 탭하면 하단 셸 푸터 자리에 이 컨텍스트 바가
 * 나타난다(한 화면 한 기능). 인쇄 레이아웃 미세조정(서식·강제 줄바꿈·한 덩어리 유지)은
 * PC 전용으로 남기고, 이동 중 검토에 필요한 액션(이동·지문·묶기·수정·삭제)만 담는다.
 */

/** 모바일 시트에서 통째로 고쳐 쓸 수 있는 단일 텍스트 필드. 문항 발문은 구조화 본문과
 *  재결합이 필요해(recombineQuestionText) 1차에선 텍스트·섹션 블록만 지원한다. */
export function mobileEditableField(
  item: PaperItem,
): { label: string; value: string; patch: (next: string) => Partial<PaperItem> } | null {
  if (item.blockType === "text") {
    return {
      label: "텍스트 내용",
      value: item.blockText,
      // 인라인 편집(CustomPaperBlock)과 동일한 패치 — questionText 미러 포함.
      patch: (next) => ({ blockText: next, questionText: next }),
    };
  }
  if (item.blockType === "section") {
    return {
      label: "섹션 제목",
      value: item.blockTitle || item.blockText,
      patch: (next) => ({
        blockTitle: next,
        blockText: next,
        questionText: next,
        sectionTitle: next,
      }),
    };
  }
  return null;
}

function blockLabel(item: PaperItem): string {
  switch (item.blockType) {
    case "question":
      return `${item.orderNum}번 문항`;
    case "text":
      return "텍스트 블록";
    case "section":
      return "섹션 제목";
    case "image":
      return "이미지 블록";
    case "divider":
      return "구분선";
    case "spacer":
      return "여백";
    default:
      return "블록";
  }
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 transition-colors disabled:opacity-35",
        danger
          ? "text-rose-600 active:bg-rose-50"
          : active
            ? "text-blue-600 active:bg-blue-50"
            : "text-slate-600 active:bg-slate-100",
      )}
    >
      {icon}
      <span className="whitespace-nowrap text-[10px] font-bold leading-none">
        {label}
      </span>
    </button>
  );
}

export function MobileBlockActionBar({
  item,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onUpdateItem,
  onUngroupItem,
  onRegroupByPassage,
  onRemoveItem,
  onEditContent,
  onClose,
}: {
  item: PaperItem;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  onUngroupItem: (localId: string) => void;
  onRegroupByPassage: () => void;
  onRemoveItem: (localId: string) => void;
  onEditContent: () => void;
  onClose: () => void;
}) {
  const isQuestion = item.blockType === "question";
  const passageForced = isSourcePassageForcedForItem(item);
  const passageActive = passageForced || shouldRenderSourcePassageForItem(item);
  const editable = mobileEditableField(item) !== null;

  return (
    <div className="border-t border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1">
        <span className="truncate text-[11px] font-bold text-slate-500">
          {blockLabel(item)} 선택됨
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="블록 선택 해제"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {item.locked ? (
        <div className="flex items-center gap-2 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[12px] font-semibold text-slate-500">
          <Lock className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          잠긴 블록이에요 — PC 편집 패널에서 잠금 해제 후 수정할 수 있어요.
        </div>
      ) : (
        <div className="flex items-stretch gap-0.5 overflow-x-auto px-1.5 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
          <ActionButton
            icon={<ArrowUp className="size-[18px]" aria-hidden="true" />}
            label="위로"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          />
          <ActionButton
            icon={<ArrowDown className="size-[18px]" aria-hidden="true" />}
            label="아래로"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          />
          {isQuestion && (
            <>
              <ActionButton
                icon={<BookOpen className="size-[18px]" aria-hidden="true" />}
                label="지문 표시"
                active={passageActive}
                disabled={passageForced}
                onClick={() =>
                  onUpdateItem(item.localId, {
                    includePassage: !item.includePassage,
                  })
                }
              />
              <ActionButton
                icon={<Ungroup className="size-[18px]" aria-hidden="true" />}
                label="묶음 해제"
                onClick={() => onUngroupItem(item.localId)}
              />
              <ActionButton
                icon={<Group className="size-[18px]" aria-hidden="true" />}
                label="지문별 묶기"
                onClick={onRegroupByPassage}
              />
            </>
          )}
          {editable && (
            <ActionButton
              icon={<Pencil className="size-[18px]" aria-hidden="true" />}
              label="내용 수정"
              onClick={onEditContent}
            />
          )}
          <ActionButton
            icon={<Trash2 className="size-[18px]" aria-hidden="true" />}
            label="삭제"
            danger
            onClick={() => onRemoveItem(item.localId)}
          />
        </div>
      )}
    </div>
  );
}

/** 텍스트·섹션 블록 내용을 읽기 좋은 크기로 고쳐 쓰는 모바일 풀스크린 시트.
 *  50% 축소 미리보기 위 contentEditable 대신 이 시트가 모바일의 편집 경로다. */
export function MobileBlockEditSheet({
  item,
  onCommit,
  onClose,
}: {
  item: PaperItem;
  onCommit: (patch: Partial<PaperItem>) => void;
  onClose: () => void;
}) {
  const field = mobileEditableField(item);
  const [draft, setDraft] = useState(field?.value ?? "");
  if (!field) return null;

  return createPortal(
    <div className="no-print fixed inset-0 z-[80] flex flex-col bg-white lg:hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-[15px] font-black text-slate-900">
          {field.label} 수정
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <textarea
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={
          item.blockType === "section" ? "새 섹션" : "안내 문구를 입력하세요."
        }
        className="min-h-0 w-full flex-1 resize-none bg-white p-4 text-[15px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-300"
      />
      <footer className="flex shrink-0 gap-2 border-t border-slate-200 p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white text-[13.5px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => {
            onCommit(field.patch(normalizeEditableText(draft)));
            onClose();
          }}
          className="inline-flex h-12 flex-[2] items-center justify-center rounded-lg border border-blue-600 bg-blue-600 text-[14px] font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          저장
        </button>
      </footer>
    </div>,
    document.body,
  );
}
