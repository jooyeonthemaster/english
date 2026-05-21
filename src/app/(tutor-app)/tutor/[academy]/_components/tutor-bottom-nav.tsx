"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, MessageCircleQuestion, User } from "lucide-react";
import { tutorPath } from "@/lib/tutor/routes";
import { cn } from "@/lib/utils";
import { useTutorModalOpen } from "./tutor-modal-context";

const items = [
  { key: "study", icon: Home, label: "홈" },
  { key: "review", icon: BookOpen, label: "복습" },
  { key: "question-history", icon: MessageCircleQuestion, label: "질문" },
  { key: "report", icon: User, label: "MY" },
] as const;

export function TutorBottomNav({ academy }: { academy: string }) {
  const pathname = usePathname();
  const decodedPathname = safeDecode(pathname);
  const isLogin = decodedPathname === `/tutor/${academy}`;
  const isModalOpen = useTutorModalOpen();
  if (isLogin) return null;
  if (isModalOpen) return null;

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 grid h-[78px] w-full max-w-[1040px] -translate-x-1/2 grid-cols-4 border-t border-slate-200 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_45px_rgba(15,23,42,0.08)] backdrop-blur md:px-8"
      aria-label="튜터 하단 메뉴"
    >
      {items.map((item) => {
        const href = tutorPath(academy, `/${item.key}`);
        const decodedHref = safeDecode(href);
        const active = decodedPathname === decodedHref || decodedPathname.startsWith(`${decodedHref}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 border-t-2 text-[11px] font-black transition",
              active
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2.8 : 2.2} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
