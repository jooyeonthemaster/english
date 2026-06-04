"use client";

export function ViewToggleButton({
  active,
  middle,
  disabled = false,
  label,
  title,
  onClick,
  children,
}: {
  active: boolean;
  middle?: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={title}
      className={
        "p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
        (middle ? "border-x border-slate-200 " : "") +
        (disabled
          ? "text-slate-300"
          : active
            ? "cursor-pointer bg-slate-800 text-white"
            : "cursor-pointer text-slate-400 hover:bg-slate-50 hover:text-slate-600")
      }
    >
      {children}
    </button>
  );
}
