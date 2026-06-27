import type { DragEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronUp, GripVertical, Minus, Plus } from "lucide-react";
import type { PaperBlockAlign } from "../../types";
import type { PanelSectionId } from "./panel-storage";

export function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function TextButton({
  title,
  children,
  onClick,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
    >
      {children}
    </button>
  );
}

export function IconToggleButton({
  active,
  title,
  disabled,
  className,
  children,
  onClick,
}: {
  active?: boolean;
  title: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PanelSection({
  id,
  title,
  badge,
  icon,
  collapsed,
  dragging,
  dragOver,
  children,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  id: PanelSectionId;
  title: string;
  badge?: ReactNode;
  icon?: ReactNode;
  collapsed: boolean;
  dragging: boolean;
  dragOver: boolean;
  children: ReactNode;
  onToggle: (id: PanelSectionId) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: PanelSectionId) => void;
  onDragOver: (event: DragEvent<HTMLElement>, id: PanelSectionId) => void;
  onDrop: (event: DragEvent<HTMLElement>, id: PanelSectionId) => void;
  onDragEnd: () => void;
}) {
  return (
    <section
      data-panel-section-id={id}
      onDragOver={(event) => onDragOver(event, id)}
      onDrop={(event) => onDrop(event, id)}
      className={cn(
        "w-full overflow-hidden rounded-lg border bg-white transition-all",
        dragOver
          ? "border-blue-300 shadow-[0_0_0_2px_rgba(59,130,246,0.12)]"
          : "border-slate-200 shadow-sm",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
        <button
          type="button"
          draggable
          onDragStart={(event) => onDragStart(event, id)}
          onDragEnd={onDragEnd}
          className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 active:cursor-grabbing"
          title={`${title} 섹션 드래그`}
          aria-label={`${title} 섹션 드래그`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white"
          title={`${title} ${collapsed ? "펼치기" : "접기"}`}
        >
          {icon}
          <span className="truncate text-[11px] font-black uppercase text-slate-600">
            {title}
          </span>
          {badge}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onToggle(id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
            title={`${title} ${collapsed ? "펼치기" : "접기"}`}
            aria-label={`${title} ${collapsed ? "펼치기" : "접기"}`}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {!collapsed && <div className="px-2.5 py-2">{children}</div>}
    </section>
  );
}

export function NumberStepper({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold text-slate-500">{label}</p>
      <div className="flex h-8 items-center rounded-md border border-slate-200 bg-white">
        <button
          type="button"
          title={`${label} 낮추기`}
          disabled={disabled}
          onClick={() => onChange(clampInt(value - 1, min, max))}
          className="flex h-full w-7 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(clampInt(Number(event.target.value) || min, min, max))}
          className="min-w-0 flex-1 border-0 bg-transparent text-center text-[12px] font-black text-slate-700 outline-none disabled:text-slate-400"
        />
        <button
          type="button"
          title={`${label} 올리기`}
          disabled={disabled}
          onClick={() => onChange(clampInt(value + 1, min, max))}
          className="flex h-full w-7 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function AlignmentControls({
  value,
  disabled,
  onChange,
}: {
  value: PaperBlockAlign;
  disabled?: boolean;
  onChange: (value: PaperBlockAlign) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {[
        { value: "left" as const, icon: AlignLeft, label: "왼쪽 정렬" },
        { value: "center" as const, icon: AlignCenter, label: "가운데 정렬" },
        { value: "right" as const, icon: AlignRight, label: "오른쪽 정렬" },
      ].map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 items-center justify-center rounded-md text-slate-500 transition-colors disabled:opacity-40",
              value === option.value ? "bg-white text-blue-700 shadow-sm" : "hover:bg-white",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function PrecisionPresetButtons({
  values,
  suffix,
  activeValue,
  disabled,
  onChange,
}: {
  values: number[];
  suffix: string;
  activeValue: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value)}
          className={cn(
            "h-7 rounded-md border text-[10px] font-black transition-colors disabled:opacity-40",
            activeValue === value
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
          )}
        >
          {value}
          {suffix}
        </button>
      ))}
    </div>
  );
}
