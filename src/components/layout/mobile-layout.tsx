import { cn } from "@/lib/utils";

interface MobileLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileLayout({ children, className }: MobileLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-[#F3F4F0] gradient-mesh noise-overlay">
      <div
        className={cn(
          "relative mx-auto min-h-[100dvh] w-full max-w-[430px] bg-white",
          "shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_2px_8px_rgba(0,0,0,0.03),0_8px_32px_rgba(0,0,0,0.04)]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
