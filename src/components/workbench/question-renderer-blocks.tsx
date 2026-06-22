"use client";

// ============================================================================
// 문제 렌더러 — 블럭 선택(클릭 → 수정 대상 첨부) 레이어
// ============================================================================
// AI 문제 수정 모달이 "기존 문제"의 각 블럭(발문·지문·선지·정답·해설 등)을 클릭해
// 수정 대상으로 첨부할 수 있게 하는 얇은 오버레이.
//
// 핵심 무회귀 원칙: BlockSelectionContext 가 제공되지 않은 표면(문제 카드·시험지
// 미리보기 등)에서는 SelectableBlock 이 children 을 **그대로** 통과시킨다(추가 DOM·
// 동작 0). 오직 AiEditView 가 컨텍스트를 제공할 때만 클릭 가능한 래퍼로 동작한다.
// ============================================================================

import React, { createContext, useContext, useId, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, ChevronUp, Minus, Pencil, Plus } from "lucide-react";

import { diffWords, type DiffSeg } from "@/lib/question-ai-edit/word-diff";

/** 클릭으로 첨부된 "수정 대상" 블럭 한 개. */
export interface SelectedBlock {
  /** 한 문제 안에서 안정적인 식별자 (예: "direction", "option:3", "explanation"). */
  id: string;
  /** 사람이 읽는 라벨 (예: "발문", "선지 ③", "해설"). */
  label: string;
  /** 내부 데이터 필드 힌트(선택). 백엔드 targets 로 전달. */
  field?: string;
  /** 현재 값의 짧은 미리보기(선택) — 칩 툴팁·프롬프트 컨텍스트용. */
  excerpt?: string;
}

export interface BlockSelectionApi {
  enabled: boolean;
  /** 현재 첨부된 블럭 id 목록(하이라이트용). */
  selectedIds: string[];
  /** 블럭 토글(첨부/해제). */
  onToggle: (block: SelectedBlock) => void;
}

/** null = 비활성(기본). 컨텍스트가 없으면 SelectableBlock 은 순수 통과. */
export const BlockSelectionContext = createContext<BlockSelectionApi | null>(null);

export function useBlockSelection(): BlockSelectionApi | null {
  return useContext(BlockSelectionContext);
}

/** 텍스트를 짧은 발췌로 — 칩 툴팁·프롬프트 컨텍스트. */
export function blockExcerpt(value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

// ============================================================================
// 변경 마크 — 수정본 미리보기에서 바뀐 블럭을 하이라이트하고 클릭 시 before→after 펼침
// ============================================================================
export type BlockChangeKind = "added" | "removed" | "changed" | "reordered";

export interface BlockChangeEntry {
  kind: BlockChangeKind;
  ref?: string;
  before?: string;
  after?: string;
  note?: string;
}

export interface BlockChange {
  /** 블럭 대표 종류(여러 항목이면 우세 종류). */
  kind: BlockChangeKind;
  label: string;
  entries: BlockChangeEntry[];
}

export interface BlockChangeApi {
  byId: Record<string, BlockChange>;
  /** true 면 모든 변경 블럭의 before→after 를 펼친다(상단 "모두 펼치기"). */
  expandAll?: boolean;
}

/** null = 비활성(기본). 제공되면 SelectableBlock 이 변경 블럭을 마크한다. */
export const BlockChangeContext = createContext<BlockChangeApi | null>(null);

const CHANGE_KIND_STYLE: Record<
  BlockChangeKind,
  { border: string; bg: string; chip: string; Icon: typeof Plus; label: string }
> = {
  changed: { border: "border-blue-400", bg: "bg-blue-50/50", chip: "bg-blue-600", Icon: Pencil, label: "수정됨" },
  added: { border: "border-emerald-400", bg: "bg-emerald-50/50", chip: "bg-emerald-600", Icon: Plus, label: "추가됨" },
  removed: { border: "border-rose-400", bg: "bg-rose-50/50", chip: "bg-rose-600", Icon: Minus, label: "삭제됨" },
  reordered: { border: "border-violet-400", bg: "bg-violet-50/50", chip: "bg-violet-600", Icon: ArrowLeftRight, label: "순서" },
};

interface SelectableBlockProps {
  blockId: string;
  label: string;
  field?: string;
  excerpt?: string;
  /** 래퍼에 추가할 클래스(선택). */
  className?: string;
  children: React.ReactNode;
}

/**
 * 블럭 한 개를 감싸 "클릭으로 수정 대상 지정"을 가능하게 한다.
 * 컨텍스트가 비활성/부재면 children 을 그대로 렌더(무회귀).
 */
export function SelectableBlock({
  blockId,
  label,
  field,
  excerpt,
  className,
  children,
}: SelectableBlockProps) {
  const api = useContext(BlockSelectionContext);
  const changeApi = useContext(BlockChangeContext);

  // 변경 마크 모드(우측 수정본 미리보기) — 선택 모드가 아닐 때만.
  if (!api?.enabled) {
    const change = changeApi?.byId[blockId];
    if (change) {
      return (
        <ChangedBlock change={change} className={className}>
          {children}
        </ChangedBlock>
      );
    }
    return <>{children}</>;
  }

  const selected = api.selectedIds.includes(blockId);
  const toggle = () => api.onToggle({ id: blockId, label, field, excerpt });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      }}
      title={`${label} — 클릭해 수정 대상으로 ${selected ? "해제" : "지정"}`}
      className={`group/sb relative cursor-pointer rounded-lg outline-none transition-all ${
        selected
          ? "bg-blue-50/70 ring-2 ring-blue-500"
          : "ring-1 ring-transparent hover:bg-blue-50/40 hover:ring-blue-300 focus-visible:ring-blue-400"
      } ${className ?? ""}`}
    >
      {/* 표식 — 블럭 내부 우상단(블럭 간 겹침 방지). selected=수정대상 배지(상시),
          hover=라벨 핀. pointer-events-none 으로 클릭은 래퍼가 받는다. */}
      {selected ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          <Check className="h-3 w-3" />
          수정 대상
        </span>
      ) : (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white opacity-0 shadow-sm transition-opacity group-hover/sb:opacity-100">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

// ── 변경된 블럭 래퍼: 색 링 + 배지(클릭 시 before→after 펼침) ─────────────────
function ChangedBlock({
  change,
  className,
  children,
}: {
  change: BlockChange;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(BlockChangeContext);
  const [openLocal, setOpenLocal] = useState(false);
  const open = openLocal || !!ctx?.expandAll;
  const panelId = useId();
  const style = CHANGE_KIND_STYLE[change.kind];
  const Icon = style.Icon;

  return (
    // 좌측 컬러 거터(border-l-4)로 변경 블럭을 한눈에 스캔, 우상단 컴팩트 배지로 펼침.
    <div className={`relative rounded-r-lg border-l-4 ${style.border} ${style.bg} pl-2.5 pr-1.5 ${className ?? ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.stopPropagation();
          setOpenLocal((v) => !v);
        }}
        title={`${change.label} ${style.label} — 클릭해 ${open ? "접기" : "변경 내용 보기"}`}
        className={`absolute right-1 top-1 z-10 inline-flex items-center gap-0.5 rounded-full ${style.chip} px-1.5 py-0.5 text-[9.5px] font-bold text-white shadow-sm transition-transform hover:scale-105`}
      >
        <Icon className="h-2.5 w-2.5" />
        {style.label}
        {open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>

      {children}

      {open && (
        <div id={panelId} className="mb-1.5 mt-1 space-y-2 rounded-lg border border-slate-200 bg-white/95 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {change.label} 변경 내용
          </div>
          {change.entries.map((entry, i) => (
            <BlockDiffReveal key={i} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeSegLine({ segs, tone }: { segs: DiffSeg[]; tone: "before" | "after" }) {
  const base = tone === "before" ? "text-slate-500" : "text-slate-800";
  const mark =
    tone === "before"
      ? "bg-rose-100 text-rose-700 line-through decoration-rose-400/60 rounded-[3px] px-0.5"
      : "bg-emerald-100 text-emerald-800 rounded-[3px] px-0.5";
  return (
    <span className={`whitespace-pre-wrap break-words ${base}`}>
      {segs.map((sg, i) => (
        <span key={i} className={sg.changed ? mark : undefined}>
          {sg.text}
        </span>
      ))}
    </span>
  );
}

function BlockDiffReveal({ entry }: { entry: BlockChangeEntry }) {
  const hasBoth =
    entry.kind === "changed" &&
    typeof entry.before === "string" &&
    typeof entry.after === "string";
  const { b, a } = hasBoth ? diffWords(entry.before!, entry.after!) : { b: [], a: [] };

  return (
    <div className="flex flex-col gap-1 text-[12px] leading-[1.55]">
      {entry.ref && <span className="text-[10.5px] font-bold text-slate-500">{entry.ref}</span>}
      {entry.before !== undefined && entry.kind !== "added" && (
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded bg-rose-100 px-1 text-[9.5px] font-bold text-rose-700">
            전
          </span>
          {hasBoth ? (
            <ChangeSegLine segs={b} tone="before" />
          ) : (
            <span className="whitespace-pre-wrap break-words text-slate-500 line-through decoration-rose-300/60">
              {entry.before}
            </span>
          )}
        </div>
      )}
      {entry.after !== undefined && entry.kind !== "removed" && (
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded bg-emerald-100 px-1 text-[9.5px] font-bold text-emerald-700">
            후
          </span>
          {hasBoth ? (
            <ChangeSegLine segs={a} tone="after" />
          ) : (
            <span className="whitespace-pre-wrap break-words text-slate-800">{entry.after}</span>
          )}
        </div>
      )}
    </div>
  );
}
