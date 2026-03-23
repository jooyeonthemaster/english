"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, TrendingUp, CreditCard, MessageSquare, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const bottomTabs = [
  { label: "홈", icon: Home, href: "/parent" },
  { label: "성적", icon: TrendingUp, href: "/parent/grades" },
  { label: "수납", icon: CreditCard, href: "/parent/billing" },
  { label: "소통", icon: MessageSquare, href: "/parent/messages" },
  { label: "리포트", icon: FileText, href: "/parent/reports" },
];

export default function ParentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isLoginPage = pathname === "/parent/login";

  function isActive(href: string) {
    if (href === "/parent") return pathname === "/parent";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex justify-center min-h-screen bg-white">
      <div className="w-full bg-white min-h-screen flex flex-col relative">
        {/* Content */}
        <main className={cn("flex-1", !isLoginPage && "pb-20")}>
          {children}
        </main>

        {/* Bottom Navigation */}
        {!isLoginPage && (
          <nav
            className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 shadow-nav safe-bottom z-30"
            role="navigation"
            aria-label="하단 메뉴"
          >
            <div className="flex items-center justify-around h-16 w-full max-w-2xl mx-auto">
              {bottomTabs.map((tab) => {
                const active = isActive(tab.href);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 w-14 h-full press-scale transition-colors duration-200",
                      active ? "text-blue-500" : "text-gray-400"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "size-5 transition-all duration-200",
                        active && "scale-110"
                      )}
                      strokeWidth={active ? 2.2 : 1.8}
                    />
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        active && "font-semibold"
                      )}
                    >
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
