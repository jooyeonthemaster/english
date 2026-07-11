import { Book } from "lucide-react";

interface ManualQuestionBookIconProps {
  className?: string;
}

export function ManualQuestionBookIcon({ className = "size-5" }: ManualQuestionBookIconProps) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <Book className="size-full" strokeWidth={2} />
      <span className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <span className="text-[0.62em] font-black leading-none text-current">?</span>
      </span>
    </span>
  );
}
