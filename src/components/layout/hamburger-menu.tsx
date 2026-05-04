"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Home,
  FileText,
  BookOpen,
  ClipboardCheck,
  User,
  ChevronRight,
  LogOut,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface MenuItem {
  label: string;
  icon: typeof Home;
  path: string;
}

const MENU_SECTIONS: { title?: string; items: MenuItem[] }[] = [
  {
    items: [
      { label: "홈", icon: Home, path: "" },
      { label: "학습", icon: BookOpen, path: "/learn" },
      { label: "시험", icon: ClipboardCheck, path: "/exams" },
      { label: "마이페이지", icon: User, path: "/mypage" },
    ],
  },
];

function extractSchoolSlug(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] ?? "";
}

interface HamburgerMenuProps {
  schoolName?: string;
  studentName?: string;
  isLoggedIn?: boolean;
  onLogout?: () => void;
}

export function HamburgerMenu({
  schoolName,
  studentName,
  isLoggedIn = false,
  onLogout,
}: HamburgerMenuProps) {
  const pathname = usePathname();
  const schoolSlug = extractSchoolSlug(pathname);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full text-[#343B2E] hover:bg-[#F3F4F0] active:scale-95 transition-transform"
          aria-label="메뉴 열기"
        >
          <Menu className="size-[22px]" strokeWidth={2} />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton
        className="w-[300px] border-l-0 bg-white p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-6 pb-4 border-b border-[#F3F4F0]">
          <SheetTitle className="text-left">
            <span className="text-[18px] font-bold tracking-[-0.025em] text-[#1A1F16]">
              {schoolName ?? "영신ai"}
            </span>
          </SheetTitle>
          {isLoggedIn && studentName ? (
            <p className="text-[13px] text-[#6B7265] mt-0.5">
              {studentName}님, 안녕하세요
            </p>
          ) : (
            <p className="text-[13px] text-[#9CA396] mt-0.5">
              영어 학습 플랫폼
            </p>
          )}
        </SheetHeader>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto py-3 px-3" aria-label="메뉴">
          {MENU_SECTIONS.map((section, sIdx) => (
            <div key={sIdx}>
              {section.title && (
                <p className="px-3 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA396]">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const href = `/${schoolSlug}${item.path}`;
                const isActive =
                  item.path === ""
                    ? pathname === `/${schoolSlug}` ||
                      pathname === `/${schoolSlug}/`
                    : pathname.startsWith(href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.path}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition-colors press-scale",
                      isActive
                        ? "bg-[#F1F8E9] text-[#7CB342] font-semibold"
                        : "text-[#343B2E] hover:bg-[#FAFBF8]"
                    )}
                  >
                    <Icon
                      className="size-[20px] shrink-0"
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight
                      className={cn(
                        "size-[16px] shrink-0",
                        isActive ? "text-[#7CB342]/50" : "text-[#C8CCC2]"
                      )}
                      strokeWidth={2}
                    />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto border-t border-[#F3F4F0] px-5 py-4 flex flex-col gap-3">
          {isLoggedIn ? (
            <button
              onClick={() => {
                onLogout?.();
                setOpen(false);
              }}
              className="flex items-center gap-2.5 text-[14px] text-[#6B7265] hover:text-[#EF4444] transition-colors press-scale"
            >
              <LogOut className="size-[18px]" strokeWidth={1.8} />
              <span>로그아웃</span>
            </button>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 text-[14px] text-[#7CB342] font-medium hover:text-[#689F38] transition-colors press-scale"
            >
              <LogIn className="size-[18px]" strokeWidth={1.8} />
              <span>로그인</span>
            </Link>
          )}
          <p className="text-[11px] text-[#C8CCC2]">영신ai v0.1.0</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
