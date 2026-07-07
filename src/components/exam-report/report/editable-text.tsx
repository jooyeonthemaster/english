"use client";

// ============================================================================
// 학생 시험 리포트 — 인라인 편집 텍스트 (edit 모드 전용)
//
// 비제어 contentEditable: 타이핑 중에는 부모가 리렌더하지 않으므로 캐럿이 튀지 않고,
// blur 시점에만 innerText 를 커밋한다(문단 편집·제목 편집 공용). view 모드에서는
// 이 컴포넌트를 쓰지 않고 각 섹션이 평문으로 렌더한다(SSR·공개 페이지 대응).
// ============================================================================

import type { CSSProperties } from "react";

interface EditableTextProps {
  value: string;
  onCommit: (next: string) => void;
  as?: "div" | "span" | "p" | "h3";
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

const NBSP = / /g;

export function EditableText({
  value,
  onCommit,
  as = "div",
  className,
  style,
  ariaLabel,
}: EditableTextProps) {
  const Tag = as;
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      spellCheck={false}
      className={`rpt-editable rounded outline-none focus:ring-2 focus:ring-[var(--rpt-primary)]/40 ${className ?? ""}`}
      style={style}
      onBlur={(e) => {
        const next = e.currentTarget.innerText.replace(NBSP, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
        if (next !== value) onCommit(next);
      }}
    >
      {value}
    </Tag>
  );
}
