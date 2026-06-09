"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ImageIcon,
  MousePointerClick,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { PassageAnnotationEditor } from "@/components/workbench/editor";
import {
  blockHasContent,
  blockWordCount,
  type PassageBlock,
} from "../block-types";
import {
  attachImage,
  handleDrop as onDropFn,
  handlePaste as onPasteFn,
} from "../image-handlers";

const MARK_HINT_STORAGE_KEY = "smoat:passage-mark-hint-dismissed";

function readMarkHintDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MARK_HINT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

interface MultiPassageEditorProps {
  blocks: PassageBlock[];
  updateBlock: (id: string, patch: Partial<PassageBlock>) => void;
  addEmptyBlock: () => void;
  removeBlock: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;
}

export function MultiPassageEditor({
  blocks,
  updateBlock,
  addEmptyBlock,
  removeBlock,
  toggleCollapse,
  setAllCollapsed,
}: MultiPassageEditorProps) {
  const allCollapsed = blocks.length > 0 && blocks.every((b) => b.collapsed);
  const filledCount = blocks.filter(blockHasContent).length;
  const totalWords = blocks.reduce((sum, b) => sum + blockWordCount(b), 0);

  // ─── "drag to mark" onboarding popover (single, not per-block) ───
  const [hintDismissed, setHintDismissed] = useState(false);
  const [hintClosed, setHintClosed] = useState(false);
  // Read the persisted "never show again" flag after mount to avoid SSR/CSR
  // markup mismatch.
  useEffect(() => {
    if (readMarkHintDismissed()) setHintDismissed(true);
  }, []);
  const anyMarkable = blocks.some(
    (b) => b.content.trim().length > 0 && b.annotations.length === 0,
  );
  const showHint = !hintDismissed && !hintClosed && anyMarkable;
  const dismissHintForever = () => {
    setHintDismissed(true);
    try {
      window.localStorage.setItem(MARK_HINT_STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
  };

  // ─── "방금 추가된 지문" 감지 → 강조 + 부드러운 스크롤 ───
  // 블록 id 집합을 직전 렌더와 비교해 새로 들어온 id 를 찾는다(최초 마운트의
  // 시작 블록은 강조하지 않음). prop drilling 없이 이 컴포넌트 안에서 처리.
  const prevIdsRef = useRef<Set<string>>(new Set(blocks.map((b) => b.id)));
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevIdsRef.current;
    const currentIds = blocks.map((b) => b.id);
    const added = currentIds.filter((id) => !prev.has(id));
    prevIdsRef.current = new Set(currentIds);
    if (added.length === 0) return;
    // 마지막으로 추가된 블록을 강조 대상으로 삼는다.
    const targetId = added[added.length - 1];
    setJustAddedId(targetId);
    // 레이아웃 반영 후 한 프레임 뒤에 부드럽게 스크롤.
    const raf = requestAnimationFrame(() => {
      cardRefs.current
        .get(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setJustAddedId(null), 1800);
    return () => cancelAnimationFrame(raf);
  }, [blocks]);

  useEffect(
    () => () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: count + bulk collapse + add.
          z-40 lifts the whole header subtree above the scrollable block list
          below it, so the onboarding popover isn't painted under the editor's
          floating undo/redo buttons. */}
      <div className="relative z-40 mb-1.5 flex shrink-0 items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          지문 내용 <span className="text-red-500">*</span>
          <span className="ml-2 font-medium text-slate-400">
            {filledCount > 0 ? `${filledCount}개 입력됨 · ` : ""}
            총 {blocks.length}개
            {totalWords > 0 ? ` · ${totalWords} words` : ""}
          </span>
        </span>

        {/* Single "drag to mark" onboarding popover — points at the passage
            text below. Replaces the old per-block banner. */}
        {showHint ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+10px)] z-30 w-[260px] rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left shadow-2xl shadow-blue-950/15 ring-1 ring-blue-100/70"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-blue-200 bg-blue-50"
            />
            <div className="relative flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
              >
                <MousePointerClick className="size-3 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-black text-slate-900">
                  텍스트를 드래그해 마킹하세요
                </p>
                <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500">
                  지문 본문을 드래그(터치 길게 누르기)하면 핵심 어휘·어법·출제
                  포인트를 표시할 수 있어요.
                </p>
              </div>
              <button
                type="button"
                aria-label="마킹 안내 닫기"
                title="안내 닫기"
                onClick={() => setHintClosed(true)}
                className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="relative mt-2 flex justify-end">
              <button
                type="button"
                onClick={dismissHintForever}
                className="rounded-md px-1.5 py-1 text-[10.5px] font-bold text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
              >
                다시는 보지 않기
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {blocks.length > 1 ? (
            <button
              type="button"
              onClick={() => setAllCollapsed(!allCollapsed)}
              className="text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
            >
              {allCollapsed ? "모두 펼치기" : "모두 접기"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={addEmptyBlock}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            <Plus className="size-3" />
            지문 추가
          </button>
        </div>
      </div>

      {/* Scrollable stack of collapsible blocks */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">
        {blocks.map((block, idx) => (
          <BlockCard
            key={block.id}
            block={block}
            index={idx}
            canRemove={blocks.length > 1 || blockHasContent(block)}
            // 지문이 하나뿐이면 사용자가 설정한 지문분석 박스 높이를 꽉 채우도록
            // 카드를 세로로 늘린다(고정 240px 대신).
            fill={blocks.length === 1}
            justAdded={justAddedId === block.id}
            registerRef={(el) => {
              if (el) cardRefs.current.set(block.id, el);
              else cardRefs.current.delete(block.id);
            }}
            updateBlock={updateBlock}
            removeBlock={removeBlock}
            toggleCollapse={toggleCollapse}
          />
        ))}
      </div>
    </div>
  );
}

interface BlockCardProps {
  block: PassageBlock;
  index: number;
  canRemove: boolean;
  /** 단일 지문일 때 카드를 부모(지문분석 박스) 높이에 맞춰 늘릴지 여부. */
  fill: boolean;
  /** 방금 추가된 블록이면 강조 애니메이션을 한 번 재생한다. */
  justAdded: boolean;
  /** 부모가 스크롤 타깃을 잡을 수 있도록 카드 루트 엘리먼트를 등록한다. */
  registerRef: (el: HTMLDivElement | null) => void;
  updateBlock: (id: string, patch: Partial<PassageBlock>) => void;
  removeBlock: (id: string) => void;
  toggleCollapse: (id: string) => void;
}

function BlockCard({
  block,
  index,
  canRemove,
  fill,
  justAdded,
  registerRef,
  updateBlock,
  removeBlock,
  toggleCollapse,
}: BlockCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageSetters = {
    setImageFile: (f: File | null) => updateBlock(block.id, { imageFile: f }),
    setImagePreview: (v: string | null) =>
      updateBlock(block.id, { imagePreview: v }),
  };

  const wordCount = blockWordCount(block);
  const headerLabel =
    block.title.trim() ||
    (block.content.trim().split(/\n/)[0]?.slice(0, 48) ?? "") ||
    "새 지문";

  // 펼쳐진 단일 지문일 때만 부모 높이를 꽉 채운다.
  const grow = fill && !block.collapsed;

  return (
    <div
      ref={registerRef}
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${
        grow ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
      }${
        justAdded
          ? " motion-safe:animate-[passage-block-added-flash_1.8s_ease-out]"
          : ""
      }`}
    >
      {/* Header row — click toggles collapse */}
      <div
        className="flex cursor-pointer items-center gap-2 bg-slate-50/60 px-2.5 py-1.5 hover:bg-slate-100/70"
        onClick={() => toggleCollapse(block.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(block.id);
          }}
          className="shrink-0 text-slate-400 hover:text-slate-600"
          aria-label={block.collapsed ? "펼치기" : "접기"}
        >
          {block.collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700">
          {headerLabel}
        </span>
        {block.imageFile ? (
          <ImageIcon className="size-3.5 shrink-0 text-slate-400" />
        ) : null}
        {wordCount > 0 ? (
          <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
            {wordCount} words
          </span>
        ) : null}
        {block.annotations.length > 0 ? (
          <span className="shrink-0 text-[10.5px] font-medium text-blue-600">
            마킹 {block.annotations.length}
          </span>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeBlock(block.id);
            }}
            className="shrink-0 rounded p-0.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label="지문 삭제"
            title="지문 삭제"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Body */}
      {!block.collapsed ? (
        <div
          className={`flex flex-col gap-2 p-2.5 ${
            grow ? "min-h-0 flex-1" : ""
          }`}
        >
          <div className="flex shrink-0 items-center gap-2">
            <Input
              placeholder="제목 (비워두면 자동 생성)"
              value={block.title}
              onChange={(e) => updateBlock(block.id, { title: e.target.value })}
              className="h-8 flex-1 border-slate-200 text-[12.5px]"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) attachImage({ file, ...imageSetters });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11.5px] font-medium text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50"
              title="이미지로 지문 등록"
            >
              <ImageIcon className="size-3.5" />
              이미지
            </button>
          </div>

          {block.imagePreview ? (
            <div className="flex shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.imagePreview}
                alt="원본"
                className="h-10 rounded object-contain"
              />
              <p className="flex-1 text-[12px] text-slate-500">
                이미지 첨부됨 · 분석 시 AI가 텍스트를 자동 추출합니다
              </p>
              <button
                type="button"
                onClick={() =>
                  updateBlock(block.id, { imageFile: null, imagePreview: null })
                }
                className="rounded p-1 transition-colors hover:bg-slate-200"
              >
                <X className="size-3.5 text-slate-400" />
              </button>
            </div>
          ) : null}

          <div
            className={`overflow-y-auto rounded-lg border border-slate-200 bg-white ${
              grow ? "min-h-0 flex-1" : "h-[240px]"
            }`}
            onPaste={(e) => onPasteFn(e, imageSetters)}
            onDrop={(e) => onDropFn(e, imageSetters)}
            onDragOver={(e) => e.preventDefault()}
          >
            <PassageAnnotationEditor
              content={block.content}
              onContentChange={(text) =>
                updateBlock(block.id, { content: text })
              }
              annotations={block.annotations}
              onAnnotationsChange={(annotations) =>
                updateBlock(block.id, { annotations })
              }
              showAnnotationHint={false}
              placeholder={
                "왼쪽에서 추출 자료를 선택하거나, 영어 지문을 직접 붙여넣으세요...\n\n텍스트를 드래그하여 핵심 단어, 어법 포인트, 중요 문장을 마킹할 수 있습니다."
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
