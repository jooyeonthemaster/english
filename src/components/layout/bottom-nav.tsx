"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, BookOpen, User } from "lucide-react";
import { useMemo } from "react";

interface NavItem {
  label: string;
  icon: typeof Home;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", icon: Home, path: "" },
  { label: "학습", icon: BookOpen, path: "/learn" },
  { label: "MY", icon: User, path: "/mypage" },
];

function extractSchoolSlug(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] ?? "";
}

export function BottomNav() {
  const pathname = usePathname();
  const schoolSlug = extractSchoolSlug(pathname);

  const activeIndex = useMemo(() => {
    for (let i = NAV_ITEMS.length - 1; i >= 0; i--) {
      const item = NAV_ITEMS[i];
      if (item.path === "") {
        if (
          pathname === `/${schoolSlug}` ||
          pathname === `/${schoolSlug}/`
        ) {
          return i;
        }
      } else {
        const href = `/${schoolSlug}${item.path}`;
        if (pathname.startsWith(href)) return i;
      }
    }
    return 0;
  }, [pathname, schoolSlug]);

  // Calculate indicator position: each tab is 1/3 of the container
  const indicatorStyle = {
    left: `calc(${activeIndex} * (100% / ${NAV_ITEMS.length}) + 6px)`,
    width: `calc(100% / ${NAV_ITEMS.length} - 12px)`,
  };

  return (
    <div
      className="fixed bottom-0 z-50 w-full max-w-[430px] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      style={{ left: "50%", transform: "translateX(-50%)" }}
    >
      {/* Gradient top line */}
      <div
        className="mx-auto mb-0 h-px w-3/4 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(124,179,66,0.12), transparent)",
        }}
      />

      <nav
        className="relative flex h-[64px] items-center rounded-[20px] glass-strong shadow-float"
        aria-label="메인 네비게이션"
      >
        {/* Sliding indicator pill */}
        <div
          className="nav-indicator absolute top-[8px] h-[48px] rounded-[14px] bg-[#F1F8E9]"
          style={indicatorStyle}
          aria-hidden="true"
        />

        {NAV_ITEMS.map((item, idx) => {
          const href = `/${schoolSlug}${item.path}`;
          const isActive = idx === activeIndex;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              href={href}
              className={cn(
                "relative z-10 flex flex-1 flex-col items-center justify-center gap-[3px] py-2 transition-all duration-200 press-scale",
                isActive ? "text-[#7CB342]" : "text-[#9CA396]"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "size-[24px] transition-all duration-300",
                  isActive ? "scale-105" : "scale-100"
                )}
                fill={isActive ? "rgba(124,179,66,0.15)" : "none"}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={cn(
                  "text-[11px] tracking-tight transition-all duration-200",
                  isActive
                    ? "font-bold text-[#7CB342]"
                    : "font-medium text-[#9CA396]"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
