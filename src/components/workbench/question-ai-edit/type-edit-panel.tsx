"use client";

// ============================================================================
// AI 문제 수정 — 유형 맞춤 설정 패널 (우측 컬럼)
// ============================================================================
// 유형 전용 구조화 컨트롤을 "블럭 카드 + 토글" 형태로 세로 스택 렌더한다. 컨트롤 값은
// 부모가 관리하고, 비기본값으로 바뀌면 부모가 directive 조각을 합성한다(type-edit-config.ts).
// (빠른 지시 칩은 입력창 아래쪽으로 분리됨 — ai-edit-view.tsx)
// ============================================================================

import { useRef, useState } from "react";
import { HelpCircle, SlidersHorizontal } from "lucide-react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { EditControl, TypeEditConfig } from "@/lib/question-ai-edit/type-edit-config";

interface Props {
  config: TypeEditConfig;
  controlValues: Record<string, string>;
  onControlChange: (controlId: string, value: string) => void;
  disabled?: boolean;
}

export function TypeEditPanel({
  config,
  controlValues,
  onControlChange,
  disabled,
}: Props) {
  const hasControls = config.controls.length > 0;
  if (!hasControls && !config.tagline) return null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200/70 px-3 py-2 text-[12.5px] font-bold text-slate-700">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        유형 맞춤 설정
        {config.tagline && (
          <span className="hidden truncate font-medium text-slate-400 xl:inline">
            · {config.tagline}
          </span>
        )}
      </div>

      {/* 본문 — 블럭 카드 스택 (넘치면 스크롤) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {config.controls.map((c) => (
          <ControlCard
            key={c.id}
            control={c}
            value={controlValues[c.id] ?? c.defaultValue}
            onChange={(v) => onControlChange(c.id, v)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

// ── 컨트롤 1개 = 블럭 카드(라벨·뱃지·힌트 + 토글 옵션) ──
function ControlCard({
  control,
  value,
  onChange,
  disabled,
}: {
  control: EditControl;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-bold text-slate-700">{control.label}</span>
          {control.badges?.map((b, i) => (
            <span
              key={i}
              className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600"
            >
              {b}
            </span>
          ))}
        </div>
        {control.hint && <HintHelp text={control.hint} />}
      </div>
      <div className="flex flex-wrap gap-1">
        {control.options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 부차 설명 도움말 — 오른쪽 끝 물음표 버튼. 호버 시 팝오버 표시, 클릭 시 고정/닫기. ──
function HintHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  // 클릭으로 "고정"되면 마우스가 벗어나도 닫지 않는다.
  const pinnedRef = useRef(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // 바깥 클릭·Esc 등으로 닫히면 고정도 해제.
        if (!o) pinnedRef.current = false;
        setOpen(o);
      }}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label="설명 보기"
          aria-expanded={open}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => {
            if (!pinnedRef.current) setOpen(false);
          }}
          onClick={(e) => {
            e.preventDefault();
            const nextPinned = !pinnedRef.current;
            pinnedRef.current = nextPinned;
            setOpen(nextPinned);
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-blue-500"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-60 rounded-lg p-2.5 text-[11px] leading-snug text-slate-600 shadow-lg"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
