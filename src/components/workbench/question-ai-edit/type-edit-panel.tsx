"use client";

// ============================================================================
// AI 문제 수정 — 유형 맞춤 설정 패널
// ============================================================================
// 유형 전용 구조화 컨트롤(세그먼트/토글) + 빠른 지시 칩. 컨트롤 값은 부모가 관리하고,
// 비기본값으로 바뀌면 부모가 directive 조각을 합성한다(type-edit-config.ts 참고).
// ============================================================================

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal, Zap } from "lucide-react";

import type { EditControl, TypeEditConfig } from "@/lib/question-ai-edit/type-edit-config";

interface Props {
  config: TypeEditConfig;
  controlValues: Record<string, string>;
  onControlChange: (controlId: string, value: string) => void;
  /** 빠른 지시 칩 클릭 — 부모가 지시 칩으로 추가. */
  onQuickAction: (instruction: string, label: string) => void;
  /** 이미 추가된 빠른 지시 라벨(중복 방지·활성 표시용). */
  activeQuickLabels: string[];
  disabled?: boolean;
}

export function TypeEditPanel({
  config,
  controlValues,
  onControlChange,
  onQuickAction,
  activeQuickLabels,
  disabled,
}: Props) {
  const [open, setOpen] = useState(true);
  const hasControls = config.controls.length > 0;
  const hasQuick = config.quickActions.length > 0;
  if (!hasControls && !hasQuick && !config.tagline) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70">
      {/* 헤더 — 토글 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-bold text-slate-700">
          <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
          유형 맞춤 설정
          {config.tagline && (
            <span className="hidden truncate font-medium text-slate-400 sm:inline">
              · {config.tagline}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200/70 px-4 pb-3.5 pt-3">
          {/* 구조화 컨트롤 */}
          {hasControls && (
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {config.controls.map((c) => (
                <ControlField
                  key={c.id}
                  control={c}
                  value={controlValues[c.id] ?? c.defaultValue}
                  onChange={(v) => onControlChange(c.id, v)}
                  disabled={disabled}
                />
              ))}
            </div>
          )}

          {/* 빠른 지시 칩 */}
          {hasQuick && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Zap className="h-3 w-3 text-blue-500" />
                빠른 지시
              </div>
              <div className="flex flex-wrap gap-1.5">
                {config.quickActions.map((p, i) => {
                  const active = activeQuickLabels.includes(p.label);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onQuickAction(p.instruction, p.label)}
                      disabled={disabled || active}
                      title={p.instruction}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed ${
                        active
                          ? "border-blue-300 bg-blue-100 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                      }`}
                    >
                      {active ? "✓ " : "+ "}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ControlField({
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
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
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
      {control.hint && (
        <p className="mb-1.5 max-w-[280px] text-[10px] leading-snug text-slate-400">
          {control.hint}
        </p>
      )}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {control.options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={`rounded-[6px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
