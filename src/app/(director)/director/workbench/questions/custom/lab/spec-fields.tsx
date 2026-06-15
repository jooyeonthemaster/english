"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Minus, Plus, Trash2, X } from "lucide-react";

import {
  BOX_KINDS,
  BOX_KIND_LABELS,
  type BoxFormat,
  type BoxKind,
} from "@/lib/custom-question-types/format-spec";
import { cn } from "@/lib/utils";

// 스펙 컨트롤 공용 필드 프리미티브 + 박스 배열 에디터 (spec-controls.tsx 에서 분리).

export function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-[12px] font-bold text-slate-800">{title}</span>
        <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="space-y-2.5 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="pt-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{children}</p>;
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11.5px] text-slate-600">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-blue-600"
      />
    </label>
  );
}

export function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
      <span className="shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11.5px]"
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
      <span className="shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-44 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-[11.5px] placeholder:text-slate-300"
      />
    </label>
  );
}

export function StepRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
      {label}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-6 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${label} 줄이기`}
        >
          <Minus className="size-3" />
        </button>
        <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-6 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${label} 늘리기`}
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function ChipsRow({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, t]);
    setDraft("");
  };
  return (
    <div className="space-y-1">
      <p className="text-[10.5px] font-semibold text-slate-500">{label}</p>
      <div className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
          >
            {it}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-slate-600"
              aria-label={`${it} 삭제`}
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder="입력 후 Enter"
          className="w-24 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] placeholder:text-slate-300"
        />
      </div>
    </div>
  );
}

export function LineList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
        >
          <Plus className="size-3" />
          추가
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-300">(없음)</p>
      ) : (
        items.map((it, i) => (
          <div key={i} className="flex items-start gap-1">
            <textarea
              value={it}
              rows={2}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className="min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-2 py-1 text-[11.5px] leading-relaxed"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label="항목 삭제"
            >
              <X className="size-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ─────────────────────────── 박스 배열 에디터 ───────────────────────────

export function BoxesEditor({
  boxes,
  onChange,
}: {
  boxes: BoxFormat[];
  onChange: (next: BoxFormat[]) => void;
}) {
  const [addKind, setAddKind] = useState<BoxKind>("CONDITIONS");
  const patchBox = (i: number, p: Partial<BoxFormat>) =>
    onChange(boxes.map((b, j) => (j === i ? { ...b, ...p } : b)));

  return (
    <div className="space-y-2">
      {boxes.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-3 text-center text-[11px] text-slate-400">
          보조 박스가 없습니다.
        </p>
      ) : (
        boxes.map((box, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
            <div className="flex items-center gap-1.5">
              <select
                value={box.kind}
                onChange={(e) => patchBox(i, { kind: e.target.value as BoxKind })}
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-semibold"
              >
                {BOX_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {BOX_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(boxes.filter((_, j) => j !== i))}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label="박스 삭제"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <TextRow label="라벨" value={box.label} placeholder="예: 조건, <보기>" onChange={(v) => patchBox(i, { label: v })} />
            <StepRow label="항목 수" value={box.itemCount} min={0} max={20} onChange={(v) => patchBox(i, { itemCount: v })} />
            <ToggleRow label="번호 매김" checked={box.ordered} onChange={(v) => patchBox(i, { ordered: v })} />
            <ChipsRow label="열 헤더" items={box.columnHeaders} onChange={(items) => patchBox(i, { columnHeaders: items })} />
          </div>
        ))
      )}
      <div className="flex items-center gap-1.5">
        <select
          value={addKind}
          onChange={(e) => setAddKind(e.target.value as BoxKind)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11.5px]"
        >
          {BOX_KINDS.map((k) => (
            <option key={k} value={k}>
              {BOX_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...boxes,
              { kind: addKind, label: "", ordered: false, itemCount: 0, columnHeaders: [], notes: "" },
            ])
          }
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <Plus className="size-3" />
          추가
        </button>
      </div>
    </div>
  );
}
