"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, GraduationCap, FileText, User } from "lucide-react";
import { cn } from "@/lib/utils";

const bottomTabs = [
  { label: "홈", icon: Home, href: "/student" },
  { label: "단어", icon: BookOpen, href: "/student/vocab" },
  { label: "시험", icon: GraduationCap, href: "/exams" },
  { label: "과제", icon: FileText, href: "/assignments" },
  { label: "MY", icon: User, href: "/student/mypage" },
];

export default function StudentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Don't show bottom nav on login page or during test-taking
  const isLoginPage = pathname === "/student/login";
  const isTestPage = pathname.includes("/test") && !pathname.endsWith("/test");
  const isExamTaking = pathname.includes("/exams/") && pathname.includes("/take");
  const hideNav = isLoginPage || isTestPage || isExamTaking;

  function isActive(href: string) {
    if (href === "/student") return pathname === "/student";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex justify-center min-h-screen bg-white">
      <div className="w-full bg-white min-h-screen flex flex-col relative">
        {/* Content */}
        <main className={cn("flex-1", !hideNav && "pb-20")}>
          {children}
        </main>

        {/* Bottom Navigation */}
        {!hideNav && (
          <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 shadow-nav safe-bottom z-30">
            <div className="flex items-center justify-around h-16 w-full max-w-2xl mx-auto">
              {bottomTabs.map((tab) => {
                const active = isActive(tab.href);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 w-16 h-full press-scale transition-colors duration-200",
                      active ? "text-blue-500" : "text-gray-400"
                    )}
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
