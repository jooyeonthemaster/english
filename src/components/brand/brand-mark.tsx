import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  title?: string;
};

export function BrandMark({ className, title = "SMOAT" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
      fill="currentColor"
    >
      <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" fill="none">
        <line x1="50" y1="3" x2="50" y2="11" />
        <line x1="55.5" y1="4.5" x2="51.5" y2="11.5" />
        <line x1="44.5" y1="4.5" x2="48.5" y2="11.5" />
        <line x1="59.5" y1="8.5" x2="52.5" y2="12.5" />
        <line x1="40.5" y1="8.5" x2="47.5" y2="12.5" />
      </g>
      <path d="M50 21L53.5 30L63.3 30.7L55.7 36.9L58.2 46.3L50 41L41.8 46.3L44.3 36.9L36.7 30.7L46.5 30Z" />
      <path d="M50 58C40 53 25 49 12 50L12 88C25 87 40 89 50 94C60 89 75 87 88 88L88 50C75 49 60 53 50 58Z" />
    </svg>
  );
}

type BrandIconProps = Props & {
  markClassName?: string;
};

export function BrandIcon({
  className,
  markClassName,
  title = "SMOAT",
}: BrandIconProps) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_32px_-22px_rgba(15,23,42,0.8)] transition",
        className,
      )}
    >
      <BrandMark className={cn("size-[22px]", markClassName)} title={title} />
    </span>
  );
}
