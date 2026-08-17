"use client";

export function ViewToggleButton({
  active,
  middle,
  label,
  onClick,
  children,
}: {
  active: boolean;
  middle?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        "p-2 cursor-pointer transition-colors " +
        (middle ? "border-x border-slate-200 " : "") +
        (active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")
      }
    >
      {children}
    </button>
  );
}
