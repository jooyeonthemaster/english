"use client";

import { cn } from "@/lib/utils";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

interface AdminLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AdminLayout({ children, className }: AdminLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F8FA]">
      <AdminSidebar />
      <main
        className={cn(
          "flex-1 overflow-auto p-8",
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}
