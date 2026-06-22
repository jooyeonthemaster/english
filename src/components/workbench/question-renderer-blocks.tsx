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

import React, { createContext, useContext } from "react";
import { Check } from "lucide-react";

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
  if (!api?.enabled) return <>{children}</>;

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
