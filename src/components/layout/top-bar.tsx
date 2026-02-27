"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { HamburgerMenu } from "@/components/layout/hamburger-menu";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  showMenu?: boolean;
  rightAction?: React.ReactNode;
  className?: string;
  /** Pass school/student info to the hamburger menu */
  schoolName?: string;
  studentName?: string;
  isLoggedIn?: boolean;
  onLogout?: () => void;
}

export function TopBar({
  title,
  showBack = false,
  onBack,
  showMenu = true,
  rightAction,
  className,
  schoolName,
  studentName,
  isLoggedIn,
  onLogout,
}: TopBarProps) {
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setScrolled(!entry.isIntersecting);
      },
      { threshold: 1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Invisible sentinel element to detect scroll */}
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden="true" />

      <header
        className={cn(
          "sticky top-0 z-50 flex h-16 w-full max-w-[480px] mx-auto items-center justify-between px-5 bg-[#FAFBF8]/90 backdrop-blur-xl border-b border-transparent transition-all sm:border-[#E5E7E0]/40 supports-[backdrop-filter]:bg-[#FAFBF8]/70",
          scrolled && "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border-b-[#E5E7E0]/50",
          className
        )}
      >


        {/* Left area / Back Button */}
        <div className="flex shrink-0 items-center">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="size-[42px] shrink-0 rounded-[14px] text-[#1C1C1E] hover:bg-[#F3F4F0] active:scale-95 transition-transform"
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="size-[24px]" strokeWidth={2.4} />
            </Button>
          )}
          {!showBack && <div className="size-[42px]" />}
        </div>

        {/* Center logo - always visible */}
        <span className="absolute left-1/2 -translate-x-1/2 text-[14px] font-extrabold tracking-[0.12em] text-[#9CA396] select-none">
          다른 영어학원
        </span>

        {/* Right area / Menu */}
        <div className="flex shrink-0 items-center justify-end -mr-2">
          {rightAction}
          {showMenu && !showBack && (
            <HamburgerMenu
              schoolName={schoolName}
              studentName={studentName}
              isLoggedIn={isLoggedIn}
              onLogout={onLogout}
            />
          )}
        </div>
      </header>
    </>
  );
}
