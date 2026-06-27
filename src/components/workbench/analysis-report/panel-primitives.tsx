import { type ReactNode } from "react";

/** 한 카드 안에서 도구를 묶는 소제목 그룹 (카드 분할 대신 내부 구획). */
export function PanelGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

/** 분할 단추 행 (기존 VocabTestOptions 시각언어 답습 — 파랑 선택). */
export function SegRow({
  options,
  value,
  onChange,
}: {
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-md border text-[11.5px] font-semibold transition-colors ${
            value === o.value
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleRow({
  label,
  on,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-full items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors ${
        on
          ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          on ? "bg-sky-500" : "bg-slate-300"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
