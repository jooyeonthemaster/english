"use client";

type LearningMode = "NAESHIN" | "SUNEUNG";

interface ModeSelectorProps {
  mode: LearningMode;
  onChange: (mode: LearningMode) => void;
}

const MODES = [
  {
    value: "NAESHIN" as const,
    label: "내신링고",
    desc: "학원 지문 기반 · 내신 시험 대비",
    color: "blue",
  },
  {
    value: "SUNEUNG" as const,
    label: "수능링고",
    desc: "공용 지문 · 수능/모의고사 대비",
    color: "emerald",
  },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
              active
                ? m.value === "NAESHIN"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="block">{m.label}</span>
            <span className={`block text-[11px] font-normal mt-0.5 ${active ? "opacity-70" : "opacity-50"}`}>
              {m.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
