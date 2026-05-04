"use client";

// ============================================================================
// BlockTreeNode / PageTreeGroup — tree item rendering. Extracted from
// review-step.tsx during mechanical split.
// ============================================================================

import { memo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  BLOCK_TYPES,
  blockTypeClasses,
} from "@/lib/extraction/block-types";
import { CONFIDENCE_YELLOW } from "@/lib/extraction/constants";
import { MAX_TREE_DEPTH } from "../confidence";
import { firstPageOf } from "../source-draft";
import type { PageGroup, TreeNode } from "../types";

export function PageTreeGroup({
  pageGroup,
  selectedId,
  onSelect,
  onHoverPage,
}: {
  pageGroup: PageGroup;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverPage: (page: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3" strokeWidth={1.8} />
        ) : (
          <ChevronRight className="size-3" strokeWidth={1.8} />
        )}
        페이지 {pageGroup.pageIndex + 1}
        <span className="ml-auto text-[10px] font-medium text-slate-400">
          {pageGroup.blocks.length}개
        </span>
      </button>
      {open ? (
        <ul role="tree" aria-label={`페이지 ${pageGroup.pageIndex + 1} 블록`}>
          {pageGroup.blocks.map((node) => (
            <BlockTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onHoverPage={onHoverPage}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BlockTreeNodeImpl({
  node,
  depth,
  selectedId,
  onSelect,
  onHoverPage,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverPage: (page: number) => void;
}) {
  const cfg = BLOCK_TYPES[node.item.blockType];
  const classes = blockTypeClasses(node.item.blockType);
  const isSelected = selectedId === node.id;
  const isSuspect =
    node.item.needsReview ||
    (node.item.confidence != null &&
      node.item.confidence < CONFIDENCE_YELLOW);
  const preview = (node.item.content ?? "")
    .slice(0, 60)
    .replace(/\s+/g, " ")
    .trim();

  const overDepthLimit = depth >= MAX_TREE_DEPTH;

  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      aria-level={depth + 1}
    >
      <button
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => onHoverPage(firstPageOf(node.item))}
        data-item-id={node.id}
        tabIndex={isSelected ? 0 : -1}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={
          "group relative flex w-full items-start gap-2 rounded-md py-1.5 pr-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
          (isSelected
            ? "bg-sky-50"
            : isSuspect
              ? "bg-rose-50/40 hover:bg-rose-50/80"
              : "hover:bg-slate-50")
        }
      >
        {isSelected ? (
          <span className="absolute inset-y-1 left-0 w-[2px] rounded-sm bg-sky-500" />
        ) : null}
        <span
          className={
            "mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold leading-none " +
            classes.badge
          }
          title={cfg.description}
        >
          {cfg.shortLabel}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-slate-800">
            {node.item.title ?? (preview || cfg.label)}
          </span>
          {preview ? (
            <span className="block truncate text-[10px] text-slate-500">
              {preview}
            </span>
          ) : null}
        </span>
      </button>
      {node.children.length > 0 ? (
        overDepthLimit ? (
          <div
            role="note"
            className="ml-8 rounded border border-dashed border-rose-200 bg-rose-50/40 px-2 py-1 text-[10px] text-rose-600"
          >
            깊이 제한 초과 — 자식 블록 {node.children.length}개가 생략되었습니다.
            (블록 타입을 재검토해 주세요)
          </div>
        ) : (
          <ul role="group">
            {node.children.map((c) => (
              <BlockTreeNode
                key={c.id}
                node={c}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onHoverPage={onHoverPage}
              />
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

/** React.memo — selectedId나 node가 바뀌지 않는 한 리렌더를 피함 (P2-1). */
export const BlockTreeNode = memo(BlockTreeNodeImpl);
