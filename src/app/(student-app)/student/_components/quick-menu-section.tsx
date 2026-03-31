"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { QuickMenuItem } from "../_constants/home-constants";

interface QuickMenuSectionProps {
  items: QuickMenuItem[];
}

export default function QuickMenuSection({ items }: QuickMenuSectionProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex flex-col items-center gap-2 py-3 rounded-2xl active:bg-gray-50 transition-colors"
          >
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center",
              item.bg,
            )}>
              <Icon className={cn("w-[var(--icon-md)] h-[var(--icon-md)]", item.color)} />
            </div>
            <span className="text-[var(--fs-xs)] font-semibold text-gray-500">
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
