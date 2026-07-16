"use client";

// generation-config-panel.tsx 에서 분리한 설정 입력 렌더 함수 (verbatim, 컴포넌트 상태 무참조).
// 호출부는 `{renderX({...})}` 그대로 — 함수→컴포넌트 변환 아님(React 동작 동일).
// 파라미터 타입은 본문 사용처에서 추론(런타임 erased, 동작 불변) — renderSeg/Toggle 의 인라인 타입 스타일 동형.
import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

export const renderNumberSetting = ({
  title,
  badges,
  description,
  value,
  min,
  max,
  onChange,
  ariaBase,
}: {
  title: ReactNode;
  badges: string[];
  description: ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaBase: string;
}) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-bold text-slate-800">{title}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 max-lg:!mt-0.5">
        {badges.map((badge) => (
          <span
            key={badge}
            className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600"
          >
            {badge}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
        {description}
      </p>
    </div>
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
        aria-label={`${ariaBase} decrease`}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
        aria-label={`${ariaBase} increase`}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  </div>
);

export const renderLanguageSetting = ({
  title,
  value,
  onChange,
  description,
}: {
  title: ReactNode;
  value: string;
  onChange: (next: string) => void;
  description: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <span className="text-[12px] font-bold text-slate-800">{title}</span>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
        {description}
      </p>
    </div>
    <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
      {[
        { value: "ko", label: "한국어" },
        { value: "en", label: "영어" },
      ].map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
            value === item.value
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

// 세그먼트 컨트롤(2~4지선다 옵션) — 언어 토글과 같은 시각 언어. disabled면 회색.
export const renderSegSetting = ({
  title,
  description,
  value,
  options,
  onChange,
  disabled,
  disabledHint,
}: {
  title: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  disabled?: boolean;
  disabledHint?: string;
}) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <span
        className={`text-[12px] font-bold ${disabled ? "text-slate-400" : "text-slate-800"}`}
      >
        {title}
      </span>
      {(disabled && disabledHint ? disabledHint : description) ? (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
          {disabled && disabledHint ? disabledHint : description}
        </p>
      ) : null}
    </div>
    <div
      className={`flex shrink-0 rounded-md border p-0.5 ${
        disabled
          ? "border-slate-100 bg-slate-50/60"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      {options.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(item.value)}
          className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
            disabled
              ? "cursor-not-allowed text-slate-300"
              : value === item.value
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

// 토글 스위치(불리언) — 해석/보기 제공 등. BLANK_INFERENCE 토글 시각 미러.
export const renderToggleSetting = ({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <span
        className={`text-[12px] font-bold ${disabled ? "text-slate-400" : "text-slate-800"}`}
      >
        {title}
      </span>
      {description ? (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500 max-lg:hidden">
          {description}
        </p>
      ) : null}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={!disabled && checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100"
          : checked
            ? "border-blue-300 bg-blue-500"
            : "border-slate-200 bg-slate-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
          !disabled && checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  </div>
);
